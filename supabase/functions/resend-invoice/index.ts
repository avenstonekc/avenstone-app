import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@13.11.0?target=deno";

const SB_URL     = Deno.env.get("SUPABASE_URL")!;
const SB_ANON    = Deno.env.get("SUPABASE_ANON_KEY")!;
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

const fmtDate = (d: string | null | undefined): string => {
  if (!d) return "—";
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
};

const RESENDABLE = new Set(["sent", "viewed", "partially_paid", "overdue"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // 1. Parse body
    const { invoice_id } = await req.json();
    if (!invoice_id) return json({ ok: false, error: "invoice_id required" }, 400);

    // 2. Validate caller JWT
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return json({ ok: false, error: "Unauthenticated" }, 401);

    const admin = createClient(SB_URL, SB_SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !user) return json({ ok: false, error: "Unauthenticated" }, 401);

    // 3. JWT-scoped read — RLS gates access
    const callerClient = createClient(SB_URL, SB_ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth:   { autoRefreshToken: false, persistSession: false },
    });
    const { data: aclCheck } = await callerClient
      .from("invoices")
      .select("id")
      .eq("id", invoice_id)
      .maybeSingle();
    if (!aclCheck) return json({ ok: false, error: "Invoice not found or access denied" }, 403);

    // 4. Service-role full invoice load
    const { data: invoice, error: invErr } = await admin
      .from("invoices")
      .select("id, tenant_id, job_id, invoice_number, total_amount, due_date, notes, status")
      .eq("id", invoice_id)
      .single();
    if (invErr || !invoice) return json({ ok: false, error: "Invoice not found" }, 404);

    // 5. Status gate
    if (!RESENDABLE.has(invoice.status as string)) {
      const reason = invoice.status === "draft"
        ? "Draft invoices cannot be resent — send the invoice first."
        : invoice.status === "paid"
          ? "Invoice is already paid."
          : "Void invoices cannot be resent.";
      return json({ ok: false, error: reason }, 400);
    }

    // 6. Load job
    const { data: job, error: jobErr } = await admin
      .from("jobs")
      .select("id, address, client_name, client_email")
      .eq("id", invoice.job_id as string)
      .single();
    if (jobErr || !job) return json({ ok: false, error: "Job not found" }, 404);
    if (!job.client_email) return json({ ok: false, error: "No client email on file for this job — cannot resend" }, 400);

    // 6b. Load tenant config
    const { data: tenant } = await admin.from("tenants").select("name, business_email, business_phone, business_address").eq("id", invoice.tenant_id as string).single();
    const businessName    = (tenant?.name             as string) || "Avenstone Group";
    const businessEmail   = (tenant?.business_email   as string) || "notifications@avenstonekc.com";
    const businessAddress = (tenant?.business_address as string) || "Kansas City, MO";
    const FROM = `${businessName} <notifications@avenstonekc.com>`;

    // 7. Generate fresh PDF signed URL (reuse existing file in storage)
    const pdfPath = `${invoice.job_id}/invoices/${invoice.invoice_number}.pdf`;
    const { data: signed, error: signErr } = await admin.storage
      .from("job-documents")
      .createSignedUrl(pdfPath, 60 * 60 * 24 * 30);
    if (signErr || !signed?.signedUrl) {
      return json({ ok: false, error: "Original PDF no longer in storage. Please void and reissue this invoice." }, 500);
    }
    const pdfUrl = signed.signedUrl;

    // 8. Fresh Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "us_bank_account"],
      line_items: [{
        price_data: {
          currency:     "usd",
          unit_amount:  Math.round(Number(invoice.total_amount) * 100),
          product_data: {
            name:        `Invoice ${invoice.invoice_number}`,
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

    // 9. Update invoice — pdf_url + stripe session only; sent_at and status untouched
    const now = new Date().toISOString();
    const { error: updateErr } = await admin.from("invoices").update({
      pdf_url:             pdfUrl,
      stripe_session_id:   session.id,
      stripe_checkout_url: session.url,
      updated_at:          now,
    }).eq("id", invoice_id);
    if (updateErr) throw new Error(`Invoice update failed: ${updateErr.message}`);

    // 10. Send email — identical template to send-invoice
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

    const emailRes = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body:    JSON.stringify({ from: FROM, reply_to: businessEmail, to: job.client_email, subject, html }),
    });
    if (!emailRes.ok) {
      const errText = await emailRes.text();
      throw new Error(`Email delivery failed (${emailRes.status}): ${errText}`);
    }

    return json({ ok: true, sent_to: job.client_email });

  } catch (err: unknown) {
    console.error("resend-invoice error:", err);
    return json({ ok: false, error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});
