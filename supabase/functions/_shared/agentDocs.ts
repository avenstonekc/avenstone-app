// AGENT_DOCS — the document engine behind the create_document agent verb. Generates a document,
// renders a branded letterhead PDF (docRender), saves it to the job-documents bucket + a job_files row
// (so it shows in the job's Documents/Invoices tab), and returns a signed URL for the chat link.
// Doc types: invoice (HITS THE BOOKS via the invoices table), letter (model-composed body), and the
// template forms delivery_acceptance / damage_waiver / material_receipt (zero model calls — filled in
// code). Lien waivers are added in Slice 2 (statutory templates as data).
import { loadBranding, renderLetterheadPdf, type Branding, type DocBlock } from "./docRender.ts";

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

export interface CreateDocParams {
  tenantId: string; userId: string; jobId: string; docType: string;
  amount?: number; description?: string; billTo?: string; dueDate?: string;
  body?: string; party?: string; recipientName?: string;
  // lien_waiver
  state?: string; conditional?: boolean; final?: boolean; claimant?: string;
  throughDate?: string; exceptions?: string; paymentReceived?: boolean;
  subInvoiceId?: string; transactionId?: string;
}

// deno-lint-ignore no-explicit-any
export async function createDocument(sb: any, params: CreateDocParams): Promise<CreateDocResult> {
  const { tenantId, jobId, docType } = params;
  const { data: job } = await sb.from("jobs").select("id, address, client_name, client_email").eq("id", jobId).maybeSingle();
  if (!job) return { ok: false, error: "Job not found." };
  const branding = await loadBranding(sb, tenantId);
  const ctx = { ...params, job, branding };

  if (docType === "invoice") return createInvoice(sb, ctx);
  if (docType === "letter") return createLetter(sb, ctx);
  if (docType === "lien_waiver") return createWaiver(sb, ctx);
  if (FORM_META[docType]) return createForm(sb, ctx);
  return { ok: false, error: `Document type "${docType}" isn't available yet.` };
}

// ── Shared: render-agnostic save (upload → job_files → signed URL). related_entity_id keys the
//    regenerate dedupe (invoices reuse the invoice id; ad-hoc docs get a fresh id, each distinct). ──
// deno-lint-ignore no-explicit-any
async function saveDocPdf(sb: any, p: {
  tenantId: string; userId: string; jobId: string; pdf: Uint8Array;
  slug: string; name: string; category: string; relatedId: string; dedupe: boolean;
}): Promise<{ ok: boolean; error?: string; jobFileId?: string; signedUrl?: string; path?: string }> {
  const path = `${p.jobId}/documents/${p.slug}_${Date.now()}.pdf`;
  const { error: upErr } = await sb.storage.from("job-documents").upload(path, p.pdf, { contentType: "application/pdf", upsert: false });
  if (upErr) return { ok: false, error: `PDF upload failed: ${upErr.message}` };
  if (p.dedupe) {
    await sb.from("job_files").delete()
      .eq("related_entity_type", "document").eq("related_entity_id", p.relatedId).eq("category", p.category);
  }
  const { data: jf, error: jfErr } = await sb.from("job_files").insert({
    tenant_id: p.tenantId, job_id: p.jobId, uploaded_by_id: p.userId,
    name: p.name, storage_path: path, storage_bucket: "job-documents",
    mime_type: "application/pdf", category: p.category, client_visible: false,
    related_entity_type: "document", related_entity_id: p.relatedId, lifecycle_status: "active",
  }).select("id").single();
  if (jfErr) { await sb.storage.from("job-documents").remove([path]).catch(() => {}); return { ok: false, error: `Document row failed: ${jfErr.message}` }; }
  const { data: signed } = await sb.storage.from("job-documents").createSignedUrl(path, 60 * 60 * 24 * 7);
  return { ok: true, jobFileId: jf?.id, signedUrl: signed?.signedUrl, path };
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
  if (liErr) console.warn("[agentDocs] line item insert:", liErr.message);

  const blocks: DocBlock[] = [
    { kind: "meta", rows: [`#${invoiceNumber}`, `Date: ${fmtDate(invoiceDate)}`, `Due: ${fmtDate(dueDate)}`] },
    { kind: "twoCol", left: { label: "Bill To:", value: billTo }, right: { label: "Project:", value: String(job.address || "") } },
    { kind: "spacer", height: 10 },
    { kind: "table", columns: ["Description", "Amount"], rows: [[description, fmtMoney(amount)]], rightAlignLastCol: true },
    { kind: "totals", rows: [{ label: "Total Due:", value: fmtMoney(amount), bold: true }] },
  ];
  const pdf = await renderLetterheadPdf({ branding, title: "INVOICE", blocks, footer: ["Thank you for your business."] });

  const saved = await saveDocPdf(sb, {
    tenantId, userId, jobId: job.id, pdf,
    slug: `invoice_${invoiceNumber}`, name: `Invoice ${invoiceNumber}`,
    category: "Invoices", relatedId: invoice.id, dedupe: true,
  });
  if (!saved.ok) return { ok: false, error: saved.error };
  if (saved.path) await sb.from("invoices").update({ pdf_url: saved.path }).eq("id", invoice.id);

  return {
    ok: true, invoiceId: invoice.id, invoiceNumber, jobFileId: saved.jobFileId, signedUrl: saved.signedUrl,
    summary: `Invoice ${invoiceNumber} for ${fmtMoney(amount)} created for ${billTo} — recorded as a receivable and saved to Documents.`,
  };
}

// deno-lint-ignore no-explicit-any
async function createLetter(sb: any, p: any): Promise<CreateDocResult> {
  const { tenantId, userId, job, branding } = p;
  const body = String(p.body || "").trim();
  if (!body) return { ok: false, error: "The letter body is empty — nothing to write." };
  const blocks: DocBlock[] = [
    { kind: "meta", rows: [fmtDate(todayISO())] },
  ];
  if (p.recipientName) blocks.push({ kind: "paragraph", text: String(p.recipientName) });
  blocks.push({ kind: "spacer", height: 6 });
  blocks.push({ kind: "paragraph", text: body });
  blocks.push({ kind: "spacer", height: 16 });
  blocks.push({ kind: "signature", lines: [branding.name] });
  const pdf = await renderLetterheadPdf({ branding, blocks });

  const relatedId = crypto.randomUUID();
  const saved = await saveDocPdf(sb, {
    tenantId, userId, jobId: job.id, pdf,
    slug: "letter", name: `Letter — ${fmtDate(todayISO())}`,
    category: "Documents", relatedId, dedupe: false,
  });
  if (!saved.ok) return { ok: false, error: saved.error };
  return { ok: true, jobFileId: saved.jobFileId, signedUrl: saved.signedUrl, summary: `Letter saved to Documents on ${job.address || "the job"}.` };
}

const FORM_META: Record<string, { title: string; intro: string; partyLabel: string; category: string }> = {
  delivery_acceptance: { title: "DELIVERY ACCEPTANCE", intro: "This confirms delivery and acceptance of the materials/goods described below to the project site.", partyLabel: "Received by", category: "Documents" },
  damage_waiver: { title: "DAMAGE WAIVER & RELEASE", intro: "This documents the existing conditions described below and releases the contractor from claims for the pre-existing damage noted.", partyLabel: "Acknowledged by", category: "Documents" },
  material_receipt: { title: "MATERIAL RECEIPT", intro: "Receipt of the materials described below for the project.", partyLabel: "Received by", category: "Documents" },
};

// deno-lint-ignore no-explicit-any
async function createForm(sb: any, p: any): Promise<CreateDocResult> {
  const { tenantId, userId, job, branding, docType } = p;
  const meta = FORM_META[docType];
  const description = String(p.description || "").trim();
  if (!description) return { ok: false, error: `Describe what this ${meta.title.toLowerCase()} covers.` };
  const party = String(p.party || "").trim();
  const amount = p.amount != null ? Number(p.amount) : null;

  const blocks: DocBlock[] = [
    { kind: "meta", rows: [`Date: ${fmtDate(todayISO())}`] },
    { kind: "twoCol", left: { label: "Project:", value: String(job.address || "") }, right: party ? { label: `${meta.partyLabel}:`, value: party } : undefined },
    { kind: "spacer", height: 8 },
    { kind: "paragraph", text: meta.intro },
    { kind: "heading", text: "Details" },
    { kind: "paragraph", text: description },
  ];
  if (amount != null && Number.isFinite(amount) && amount > 0) blocks.push({ kind: "totals", rows: [{ label: "Amount:", value: fmtMoney(amount), bold: true }] });
  blocks.push({ kind: "spacer", height: 20 });
  blocks.push({ kind: "signature", lines: [meta.partyLabel, branding.name] });
  const pdf = await renderLetterheadPdf({ branding, title: meta.title, blocks });

  const relatedId = crypto.randomUUID();
  const saved = await saveDocPdf(sb, {
    tenantId, userId, jobId: job.id, pdf,
    slug: docType, name: `${meta.title.split(" ").map((w) => w[0] + w.slice(1).toLowerCase()).join(" ")} — ${fmtDate(todayISO())}`,
    category: meta.category, relatedId, dedupe: false,
  });
  if (!saved.ok) return { ok: false, error: saved.error };
  return { ok: true, jobFileId: saved.jobFileId, signedUrl: saved.signedUrl, summary: `${meta.title.charAt(0) + meta.title.slice(1).toLowerCase()} saved to Documents on ${job.address || "the job"}.` };
}

// ── Lien waivers (Slice 2). Statutory text lives in waiver_templates (attorney-approved, editable
//    without code). Unconditional variants (requires_payment_gate) release rights even if unpaid, so
//    they are hard-gated: the executor requires paymentReceived=true before this runs. Auto-fills from
//    the linked sub invoice / transaction and links the saved file back to the ledger. Zero model calls. ──
// deno-lint-ignore no-explicit-any
async function createWaiver(sb: any, p: any): Promise<CreateDocResult> {
  const { tenantId, userId, job, branding } = p;
  const state = String(p.state || "").toUpperCase();
  if (state !== "MO" && state !== "KS") return { ok: false, error: "A state (MO or KS) is required for a lien waiver." };
  const conditional = p.conditional !== false; // default conditional (safer) unless explicitly unconditional
  const final = p.final === true;

  const { data: tpl } = await sb.from("waiver_templates")
    .select("title, notice, body_template, requires_payment_gate")
    .eq("tenant_id", tenantId).eq("state", state).eq("conditional", conditional).eq("final", final)
    .maybeSingle();
  if (!tpl) return { ok: false, error: `No ${state} ${conditional ? "conditional" : "unconditional"} ${final ? "final" : "progress"} waiver template is configured.` };

  // Auto-fill amount from a linked sub invoice / transaction when not given.
  let amount = p.amount != null ? Number(p.amount) : NaN;
  let subInvoiceId = p.subInvoiceId ? String(p.subInvoiceId) : null;
  const transactionId = p.transactionId ? String(p.transactionId) : null;
  let claimant = String(p.claimant || "").trim();
  if (subInvoiceId) {
    const { data: si } = await sb.from("sub_invoices").select("amount, sub_contact_id").eq("id", subInvoiceId).maybeSingle();
    if (si) {
      if (!Number.isFinite(amount)) amount = Number(si.amount);
      if (!claimant && si.sub_contact_id) {
        const { data: c } = await sb.from("contacts").select("name").eq("id", si.sub_contact_id).maybeSingle();
        claimant = String(c?.name || "");
      }
    }
  }
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, error: "A positive payment amount is required for the waiver." };
  if (!claimant) return { ok: false, error: "The claimant (the sub or vendor releasing lien rights) is required." };

  // Unconditional forms release rights even if unpaid — must never render without confirmed payment.
  if (tpl.requires_payment_gate && p.paymentReceived !== true) {
    return { ok: false, error: "This is an UNCONDITIONAL waiver — it releases lien rights even if unpaid. Confirm payment has actually been received before generating it." };
  }

  const fill = (s: string) => String(s || "")
    .replaceAll("{{state}}", state)
    .replaceAll("{{claimant}}", claimant)
    .replaceAll("{{customer}}", branding.name)
    .replaceAll("{{owner}}", String(job.client_name || "the owner"))
    .replaceAll("{{job_address}}", String(job.address || ""))
    .replaceAll("{{amount}}", fmtMoney(amount))
    .replaceAll("{{through_date}}", p.throughDate ? fmtDate(String(p.throughDate)) : fmtDate(todayISO()))
    .replaceAll("{{exceptions}}", String(p.exceptions || "none"))
    .replaceAll("{{date}}", fmtDate(todayISO()));

  const blocks: DocBlock[] = [{ kind: "meta", rows: [`Date: ${fmtDate(todayISO())}`, `Amount: ${fmtMoney(amount)}`] }];
  if (tpl.notice) blocks.push({ kind: "paragraph", text: fill(tpl.notice) });
  blocks.push({ kind: "spacer", height: 6 });
  blocks.push({ kind: "paragraph", text: fill(tpl.body_template) });
  blocks.push({ kind: "spacer", height: 24 });
  blocks.push({ kind: "signature", lines: [claimant] });
  const pdf = await renderLetterheadPdf({ branding, title: "LIEN WAIVER", blocks });

  const relatedId = crypto.randomUUID();
  const kind = `${conditional ? "conditional" : "unconditional"} ${final ? "final" : "progress"}`;
  const saved = await saveDocPdf(sb, {
    tenantId, userId, jobId: job.id, pdf,
    slug: `lien_waiver_${state.toLowerCase()}`, name: `Lien Waiver (${state} ${kind}) — ${claimant}`,
    category: "Documents", relatedId, dedupe: false,
  });
  if (!saved.ok) return { ok: false, error: saved.error };

  // Link back to the ledger so the waiver is discoverable from the payment it releases.
  if (subInvoiceId && saved.jobFileId) await sb.from("sub_invoices").update({ lien_waiver_file_id: saved.jobFileId }).eq("id", subInvoiceId);
  if (transactionId && saved.path) await sb.from("job_transactions").update({ lien_waiver_url: saved.path, lien_waiver_signed_date: todayISO() }).eq("id", transactionId);

  return {
    ok: true, jobFileId: saved.jobFileId, signedUrl: saved.signedUrl,
    summary: `${state} ${kind} lien waiver for ${claimant} (${fmtMoney(amount)}) saved to Documents.`,
  };
}
