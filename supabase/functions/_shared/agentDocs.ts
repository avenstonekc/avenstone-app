// AGENT_DOCS — the document engine behind the create_document agent verb. Generates a document,
// renders a branded letterhead PDF (docRender), saves it to the job-documents bucket + a job_files row
// (so it shows in the job's Documents/Invoices tab), and returns a signed URL for the chat link.
// v1 doc type: 'invoice' — a receivable that HITS THE BOOKS via the invoices table (never a PDF the
// ledger doesn't know about). Template docs = zero model calls (filled in code). Later slices add
// lien waivers / delivery forms / generic letters as more cases here.
import { loadBranding, renderLetterheadPdf, type DocBlock } from "./docRender.ts";

const fmtMoney = (n: number) => "$" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string | null | undefined) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—";
const todayISO = () => new Date().toISOString().split("T")[0];

export interface CreateDocResult {
  ok: boolean;
  error?: string;
  summary?: string;      // one-line for the success text
  signedUrl?: string;    // chat link (7-day)
  jobFileId?: string;
  invoiceId?: string;
  invoiceNumber?: string;
}

// deno-lint-ignore no-explicit-any
export async function createDocument(sb: any, params: {
  tenantId: string; userId: string; jobId: string; docType: string;
  amount?: number; description?: string; billTo?: string; dueDate?: string;
}): Promise<CreateDocResult> {
  const { tenantId, jobId, docType } = params;
  const { data: job } = await sb.from("jobs").select("id, address, client_name, client_email").eq("id", jobId).maybeSingle();
  if (!job) return { ok: false, error: "Job not found." };
  const branding = await loadBranding(sb, tenantId);

  if (docType === "invoice") return createInvoice(sb, { ...params, job, branding });
  return { ok: false, error: `Document type "${docType}" isn't available yet.` };
}

// deno-lint-ignore no-explicit-any
async function createInvoice(sb: any, p: any): Promise<CreateDocResult> {
  const { tenantId, userId, job, branding } = p;
  const amount = Number(p.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "A positive invoice amount is required." };
  const description = String(p.description || "Services rendered");
  const billTo = String(p.billTo || job.client_name || "");
  const invoiceDate = todayISO();
  const dueDate = p.dueDate ? String(p.dueDate) : null;

  // (1) HIT THE BOOKS — canonical invoice number RPC, then an invoices row (draft) + line item.
  //     Same substrate autoInvoice.ts + sbCreateInvoice use — never a parallel ledger.
  let invoiceNumber: string;
  try {
    const { data: n, error } = await sb.rpc("next_invoice_number", { p_tenant_id: tenantId });
    if (error) throw error;
    invoiceNumber = n;
  } catch (e: any) { return { ok: false, error: `Couldn't generate an invoice number: ${e?.message || e}` }; }

  const { data: invoice, error: invErr } = await sb.from("invoices").insert({
    tenant_id: tenantId, job_id: job.id, invoice_number: invoiceNumber,
    invoice_date: invoiceDate, due_date: dueDate,
    subtotal: amount, total_amount: amount,
    notes: `Created via Aven. ${description}`,
    created_by_id: userId,
  }).select("id").single();
  if (invErr) return { ok: false, error: `Invoice write failed: ${invErr.message}` };

  const { error: liErr } = await sb.from("invoice_line_items").insert({
    tenant_id: tenantId, invoice_id: invoice.id, description,
    quantity: 1, unit_price: amount, line_total: amount, source_type: "manual", display_order: 0,
  });
  if (liErr) console.warn("[agentDocs] line item insert:", liErr.message); // non-fatal — total already on the invoice

  // (2) Render the branded letterhead PDF.
  const blocks: DocBlock[] = [
    { kind: "meta", rows: [`#${invoiceNumber}`, `Date: ${fmtDate(invoiceDate)}`, `Due: ${fmtDate(dueDate)}`] },
    { kind: "twoCol", left: { label: "Bill To:", value: billTo }, right: { label: "Project:", value: String(job.address || "") } },
    { kind: "spacer", height: 10 },
    { kind: "table", columns: ["Description", "Amount"], rows: [[description, fmtMoney(amount)]], rightAlignLastCol: true },
    { kind: "totals", rows: [{ label: "Total Due:", value: fmtMoney(amount), bold: true }] },
  ];
  const pdf = await renderLetterheadPdf({ branding, title: "INVOICE", blocks, footer: ["Thank you for your business."] });

  // (3) Save to job-documents + a job_files row (regenerate dedupe keyed to the invoice), sign a link.
  const path = `${job.id}/documents/invoice_${invoiceNumber}_${Date.now()}.pdf`;
  const { error: upErr } = await sb.storage.from("job-documents").upload(path, pdf, { contentType: "application/pdf", upsert: false });
  if (upErr) return { ok: false, error: `PDF upload failed: ${upErr.message}` };

  await sb.from("job_files").delete()
    .eq("related_entity_type", "document").eq("related_entity_id", invoice.id).eq("category", "Invoices");
  const { data: jf, error: jfErr } = await sb.from("job_files").insert({
    tenant_id: tenantId, job_id: job.id, uploaded_by_id: userId,
    name: `Invoice ${invoiceNumber}`, storage_path: path, storage_bucket: "job-documents",
    mime_type: "application/pdf", category: "Invoices", client_visible: false,
    related_entity_type: "document", related_entity_id: invoice.id, lifecycle_status: "active",
  }).select("id").single();
  if (jfErr) { await sb.storage.from("job-documents").remove([path]).catch(() => {}); return { ok: false, error: `Document row failed: ${jfErr.message}` }; }

  await sb.from("invoices").update({ pdf_url: path }).eq("id", invoice.id); // discoverable from invoice detail

  const { data: signed } = await sb.storage.from("job-documents").createSignedUrl(path, 60 * 60 * 24 * 7);
  return {
    ok: true, invoiceId: invoice.id, invoiceNumber, jobFileId: jf?.id, signedUrl: signed?.signedUrl,
    summary: `Invoice ${invoiceNumber} for ${fmtMoney(amount)} created for ${billTo} — recorded as a receivable and saved to Documents.`,
  };
}
