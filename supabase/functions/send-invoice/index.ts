import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@13.11.0?target=deno";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const SB_URL     = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!;
const APP_URL    = "https://avenstone-app.vercel.app";

const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2023-10-16", httpClient: Stripe.createFetchHttpClient() });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const fmtCurrency = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string | null | undefined): string => {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

async function generatePDF(
  invoice: Record<string, unknown>,
  lineItems: Record<string, unknown>[],
  job: Record<string, unknown>,
  businessName: string,
  businessEmail: string,
  businessPhone: string,
  businessAddress: string,
): Promise<Uint8Array> {
  const doc  = await PDFDocument.create();
  const page = doc.addPage([612, 792]);

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold    = await doc.embedFont(StandardFonts.HelveticaBold);
  const oblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  const margin = 50;
  const W      = 612 - margin * 2; // 512
  const gray   = rgb(0.6,  0.6,  0.6);
  const lgray  = rgb(0.88, 0.88, 0.88);
  const dark   = rgb(0.04, 0.12, 0.27);
  const black  = rgb(0,    0,    0);

  // ── Header ───────────────────────────────────────────────────────────────
  const topY = 792 - margin; // 742
  page.drawText(businessName, { x: margin, y: topY - 20, size: 22, font: bold, color: dark });
  let contactY = topY - 36;
  if (businessAddress) {
    page.drawText(businessAddress, { x: margin, y: contactY, size: 9, font: regular, color: gray });
    contactY -= 13;
  }
  if (businessPhone) {
    page.drawText(businessPhone, { x: margin, y: contactY, size: 9, font: regular, color: gray });
    contactY -= 13;
  }
  page.drawText(businessEmail, { x: margin, y: contactY, size: 9, font: regular, color: gray });

  const invLabel     = "INVOICE";
  const invLabelW    = bold.widthOfTextAtSize(invLabel, 26);
  page.drawText(invLabel, { x: margin + W - invLabelW, y: topY - 20, size: 26, font: bold, color: dark });

  const metaLines = [
    `#${invoice.invoice_number}`,
    `Date: ${fmtDate(invoice.invoice_date as string)}`,
    `Due: ${fmtDate(invoice.due_date as string | null)}`,
  ];
  let metaY = topY - 38;
  for (const line of metaLines) {
    const lw = regular.widthOfTextAtSize(line, 10);
    page.drawText(line, { x: margin + W - lw, y: metaY, size: 10, font: regular, color: black });
    metaY -= 14;
  }

  const ruleY = topY - 80;
  page.drawLine({ start: { x: margin, y: ruleY }, end: { x: margin + W, y: ruleY }, thickness: 1, color: lgray });

  // ── Bill-to band ─────────────────────────────────────────────────────────
  const billY = ruleY - 16;
  page.drawText("Bill To:", { x: margin, y: billY, size: 10, font: bold, color: gray });
  page.drawText(String(job.client_name ?? ""), { x: margin, y: billY - 14, size: 11, font: regular, color: black });

  const projLabel = "Project:";
  page.drawText(projLabel, { x: margin + W / 2, y: billY, size: 10, font: bold, color: gray });
  page.drawText(String(job.address ?? ""), { x: margin + W / 2, y: billY - 14, size: 10, font: regular, color: black });

  // ── Line items table ──────────────────────────────────────────────────────
  const tableTop = billY - 50;
  const colX = {
    desc:  margin,
    qty:   margin + W * 0.60,
    unit:  margin + W * 0.68,
    price: margin + W * 0.78,
    total: margin + W * 0.89,
  };

  page.drawText("Description", { x: colX.desc,  y: tableTop, size: 9, font: bold, color: gray });
  page.drawText("Qty",         { x: colX.qty,   y: tableTop, size: 9, font: bold, color: gray });
  page.drawText("Unit",        { x: colX.unit,  y: tableTop, size: 9, font: bold, color: gray });
  page.drawText("Unit Price",  { x: colX.price, y: tableTop, size: 9, font: bold, color: gray });
  page.drawText("Total",       { x: colX.total, y: tableTop, size: 9, font: bold, color: gray });

  const headerRuleY = tableTop - 6;
  page.drawLine({ start: { x: margin, y: headerRuleY }, end: { x: margin + W, y: headerRuleY }, thickness: 0.5, color: lgray });

  let rowY = headerRuleY - 14;
  for (const li of lineItems) {
    if (rowY < margin + 130) break;

    const desc      = String(li.description ?? "");
    const qty       = Number(li.quantity   ?? 1);
    const unit      = String(li.unit       ?? "");
    const unitPrice = Number(li.unit_price ?? 0);
    const lineTotal = Number(li.line_total ?? 0);
    const maxDescW  = W * 0.57;

    let displayDesc = desc;
    while (displayDesc.length > 4 && regular.widthOfTextAtSize(displayDesc, 9.5) > maxDescW) {
      displayDesc = displayDesc.slice(0, -1);
    }
    if (displayDesc !== desc) displayDesc += "…";

    page.drawText(displayDesc, { x: colX.desc, y: rowY, size: 9.5, font: regular, color: black });
    page.drawText(qty % 1 === 0 ? String(qty) : qty.toFixed(2), { x: colX.qty, y: rowY, size: 9.5, font: regular, color: black });
    page.drawText(unit, { x: colX.unit, y: rowY, size: 9.5, font: regular, color: black });

    const upText = fmtCurrency(unitPrice);
    const upW    = regular.widthOfTextAtSize(upText, 9.5);
    page.drawText(upText, { x: colX.price + (W * 0.09 - upW), y: rowY, size: 9.5, font: regular, color: black });

    const ltText = fmtCurrency(lineTotal);
    const ltW    = regular.widthOfTextAtSize(ltText, 9.5);
    page.drawText(ltText, { x: colX.total + (W * 0.11 - ltW), y: rowY, size: 9.5, font: regular, color: black });

    rowY -= 16;
  }

  const totalsRuleY = rowY - 4;
  page.drawLine({ start: { x: margin, y: totalsRuleY }, end: { x: margin + W, y: totalsRuleY }, thickness: 0.5, color: lgray });

  // ── Totals ────────────────────────────────────────────────────────────────
  const subtotal = Number(invoice.subtotal    ?? 0);
  const tax      = Number(invoice.tax_amount  ?? 0);
  const total    = Number(invoice.total_amount ?? 0);
  const totLabelX   = margin + W * 0.72;
  const totRightX   = margin + W;
  let totY          = totalsRuleY - 16;

  const drawTotLine = (label: string, amount: number, sz: number, f: typeof regular) => {
    page.drawText(label, { x: totLabelX, y: totY, size: sz, font: f, color: gray });
    const val  = fmtCurrency(amount);
    const valW = f.widthOfTextAtSize(val, sz);
    page.drawText(val, { x: totRightX - valW, y: totY, size: sz, font: f, color: black });
    totY -= sz + 6;
  };

  drawTotLine("Subtotal:", subtotal, 10, regular);
  if (tax > 0) drawTotLine("Tax:", tax, 10, regular);
  drawTotLine("Total Due:", total, 12, bold);

  // ── Notes ─────────────────────────────────────────────────────────────────
  if (invoice.notes) {
    const notesY = totY - 12;
    page.drawText("Notes:", { x: margin, y: notesY, size: 10, font: bold, color: gray });
    const noteLines = String(invoice.notes).split("\n").slice(0, 6);
    let nlY = notesY - 14;
    for (const nl of noteLines) {
      page.drawText(nl.slice(0, 80), { x: margin, y: nlY, size: 9.5, font: regular, color: black });
      nlY -= 13;
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const footer1  = "Thank you for your business.";
  const footer2  = "Pay online at the link in your email or your client portal.";
  const f1W      = oblique.widthOfTextAtSize(footer1, 9);
  const f2W      = regular.widthOfTextAtSize(footer2, 8);
  const centerX  = margin + W / 2;
  page.drawText(footer1, { x: centerX - f1W / 2, y: margin + 20, size: 9,  font: oblique,  color: gray });
  page.drawText(footer2, { x: centerX - f2W / 2, y: margin +  8, size: 8,  font: regular,  color: gray });

  return doc.save();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // 1. Auth
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return json({ ok: false, error: "Unauthenticated" }, 401);

    const sb = createClient(SB_URL, SB_SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) return json({ ok: false, error: "Unauthenticated" }, 401);
    const callerId = user.id;

    // 2. Parse body
    const { invoice_id } = await req.json();
    if (!invoice_id) return json({ ok: false, error: "invoice_id required" }, 400);

    // 3. Load invoice + line items
    const { data: invoice, error: invErr } = await sb
      .from("invoices")
      .select("*, line_items:invoice_line_items(*)")
      .eq("id", invoice_id)
      .single();
    if (invErr || !invoice) return json({ ok: false, error: "Invoice not found" }, 404);

    // 4. Validate
    if (invoice.status !== "draft") return json({ ok: false, error: `Invoice is ${invoice.status} — only draft invoices can be sent` }, 400);
    if (!invoice.total_amount || Number(invoice.total_amount) <= 0) return json({ ok: false, error: "Invoice total must be greater than 0" }, 400);
    const lineItems = ((invoice.line_items as Record<string, unknown>[]) || [])
      .sort((a, b) => ((a.display_order as number) ?? 0) - ((b.display_order as number) ?? 0));
    if (lineItems.length === 0) return json({ ok: false, error: "Invoice must have at least one line item" }, 400);

    // 5. Load job
    const { data: job, error: jobErr } = await sb
      .from("jobs")
      .select("id, address, client_name, client_email, tenant_id")
      .eq("id", invoice.job_id)
      .single();
    if (jobErr || !job) return json({ ok: false, error: "Job not found" }, 404);
    if (!job.client_email) return json({ ok: false, error: "Job has no client email — cannot send invoice" }, 400);

    // 5b. Load tenant config
    const { data: tenant } = await sb.from("tenants").select("name, business_email, business_phone, business_address").eq("id", invoice.tenant_id as string).single();
    const businessName    = (tenant?.name           as string) || "Avenstone Group";
    const businessEmail   = (tenant?.business_email as string) || "notifications@avenstonekc.com";
    const businessPhone   = (tenant?.business_phone as string) || "";
    const businessAddress = (tenant?.business_address as string) || "Kansas City, MO";
    const FROM = `${businessName} <notifications@avenstonekc.com>`;

    // 6. Generate PDF
    const pdfBytes = await generatePDF(invoice, lineItems, job, businessName, businessEmail, businessPhone, businessAddress);

    // 7. Upload to storage
    const pdfPath = `${invoice.job_id}/invoices/${invoice.invoice_number}.pdf`;
    const { error: uploadErr } = await sb.storage
      .from("job-documents")
      .upload(pdfPath, pdfBytes, { contentType: "application/pdf", upsert: true });
    if (uploadErr) throw new Error(`PDF upload failed: ${uploadErr.message}`);

    // 8. Signed URL (30 days)
    const { data: signedData, error: signedErr } = await sb.storage
      .from("job-documents")
      .createSignedUrl(pdfPath, 60 * 60 * 24 * 30);
    if (signedErr || !signedData?.signedUrl) throw new Error(`Signed URL failed: ${signedErr?.message ?? "no URL"}`);
    const pdfUrl = signedData.signedUrl;

    // 9. Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "us_bank_account"],
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: Math.round(Number(invoice.total_amount) * 100),
          product_data: {
            name: `Invoice ${invoice.invoice_number}`,
            description: (job.address as string) ?? undefined,
          },
        },
        quantity: 1,
      }],
      customer_email: job.client_email as string,
      success_url: `${APP_URL}?payment=success`,
      cancel_url:  `${APP_URL}?payment=cancelled`,
      metadata: {
        invoice_id: invoice.id as string,
        job_id:     invoice.job_id as string,
        tenant_id:  invoice.tenant_id as string,
      },
    });

    const now = new Date().toISOString();

    // 10. Update invoice to sent
    const { error: updateErr } = await sb.from("invoices").update({
      pdf_url:            pdfUrl,
      stripe_session_id:  session.id,
      stripe_checkout_url: session.url,
      status:             "sent",
      sent_at:            now,
      sent_by_id:         callerId,
      updated_at:         now,
    }).eq("id", invoice_id);
    if (updateErr) throw new Error(`Invoice update failed: ${updateErr.message}`);

    // 11. Draw roll-up
    if (invoice.draw_id) {
      const { data: draw } = await sb
        .from("draw_schedules")
        .select("invoiced_amount, status")
        .eq("id", invoice.draw_id as string)
        .single();
      if (draw) {
        const newInvoiced = Number(draw.invoiced_amount ?? 0) + Number(invoice.total_amount);
        const drawPatch: Record<string, unknown> = { invoiced_amount: newInvoiced, updated_at: now };
        if (draw.status === "planned") drawPatch.status = "in_progress";
        await sb.from("draw_schedules").update(drawPatch).eq("id", invoice.draw_id as string);
      }
    }

    // 12. Email (failure does NOT roll back — invoice stays sent)
    let emailWarning: string | undefined;
    const firstName = String(job.client_name ?? "").split(" ")[0] || "";
    const greeting  = firstName ? `Hi ${firstName},` : "Hi,";
    const dueLine   = invoice.due_date ? ` due by ${fmtDate(invoice.due_date as string)}` : "";
    const totalFmt  = "$" + Number(invoice.total_amount).toLocaleString("en-US", { minimumFractionDigits: 2 });
    const subject   = `Invoice ${invoice.invoice_number} from ${businessName} — ${totalFmt}`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:40px 16px;">
<tr><td align="center"><table width="100%" style="max-width:560px;">
<tr><td style="padding-bottom:20px;text-align:center;">
  <div style="font-size:11px;color:#C9A84C;letter-spacing:4px;text-transform:uppercase;margin-bottom:4px;">${businessName}</div>
  <div style="width:32px;height:2px;background:#C9A84C;margin:0 auto;"></div>
</td></tr>
<tr><td style="background:#fff;border-radius:8px;padding:32px;border:1px solid #E8E4DC;">
  <p style="margin:0 0 16px;font-size:13px;color:#9CA3AF;">${greeting}</p>
  <h2 style="margin:0 0 8px;font-size:20px;color:#0A1F44;font-weight:600;">Invoice ${invoice.invoice_number}</h2>
  <p style="margin:0 0 4px;font-size:14px;color:#6B7280;">Project: <strong style="color:#0A1F44;">${job.address ?? ""}</strong></p>
  <p style="margin:0 0 20px;font-size:13px;color:#6B7280;">Please find your invoice${dueLine} attached.</p>
  <div style="background:#F7F5F0;border:1px solid #E8E4DC;padding:16px;border-radius:4px;margin-bottom:20px;text-align:center;">
    <div style="font-size:11px;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Amount Due</div>
    <div style="font-family:Georgia,serif;font-size:32px;color:#0A1F44;font-weight:700;">${totalFmt}</div>
  </div>
  <a href="${pdfUrl}" style="display:block;background:#F7F5F0;color:#0A1F44;padding:12px 32px;border-radius:4px;text-decoration:none;font-size:14px;font-weight:600;text-align:center;border:1px solid #E8E4DC;margin-bottom:10px;">View Invoice PDF →</a>
  <a href="${session.url}" style="display:block;background:#0A1F44;color:#C9A84C;padding:14px 32px;border-radius:4px;text-decoration:none;font-size:15px;font-weight:700;text-align:center;">Pay Now →</a>
  <p style="margin:20px 0 0;font-size:12px;color:#9CA3AF;text-align:center;">Pay securely by card or bank transfer. Questions? Reply to this email.</p>
</td></tr>
<tr><td style="padding-top:20px;text-align:center;font-size:11px;color:#9CA3AF;">${businessName} · ${businessAddress}</td></tr>
</table></td></tr></table>
</body></html>`;

    try {
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, reply_to: businessEmail, to: job.client_email, subject, html }),
      });
      if (!emailRes.ok) {
        const errText = await emailRes.text();
        emailWarning = `Email delivery failed (${emailRes.status}): ${errText}. Invoice is saved as sent — retry from the invoice list.`;
      }
    } catch (emailErr: unknown) {
      emailWarning = `Email threw an error: ${(emailErr as Error).message}. Invoice is saved as sent — retry from the invoice list.`;
    }

    return json({
      ok: true,
      invoice_id: invoice.id,
      pdf_url: pdfUrl,
      checkout_url: session.url,
      ...(emailWarning ? { email_warning: emailWarning } : {}),
    });

  } catch (err: unknown) {
    console.error("send-invoice error:", err);
    return json({ ok: false, error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});
