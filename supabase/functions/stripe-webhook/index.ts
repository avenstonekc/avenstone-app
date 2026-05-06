import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@13.11.0?target=deno";

const SB_URL         = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_KEY     = Deno.env.get("STRIPE_SECRET_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const RESEND_KEY     = Deno.env.get("RESEND_API_KEY")!;
const FROM           = "Avenstone Group <notifications@avenstonekc.com>";

const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2023-10-16", httpClient: Stripe.createFetchHttpClient() });
const ok = () =>
  new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

async function handleInvoicePayment(
  sb: ReturnType<typeof createClient>,
  session: Stripe.Checkout.Session,
  invoiceId: string,
): Promise<void> {
  const now   = new Date().toISOString();
  const today = now.slice(0, 10);

  // Step 1 — Idempotency: skip if already processed
  const { data: existingTx } = await sb
    .from("job_transactions")
    .select("id")
    .eq("stripe_session_id", session.id)
    .maybeSingle();
  if (existingTx) {
    console.log(`handleInvoicePayment: session ${session.id} already processed — skipping`);
    return;
  }

  // Step 2 — Load invoice
  const { data: invoice } = await sb
    .from("invoices")
    .select("id, tenant_id, job_id, draw_id, invoice_number, total_amount, amount_paid, status")
    .eq("id", invoiceId)
    .single();
  if (!invoice) {
    console.error(`handleInvoicePayment: invoice ${invoiceId} not found`);
    return;
  }
  if (invoice.status === "paid" || invoice.status === "void") {
    console.log(`handleInvoicePayment: invoice ${invoiceId} already ${invoice.status} — skipping`);
    return;
  }

  // Step 3 — Payment amount from Stripe
  const paidAmount = (session.amount_total ?? 0) / 100;

  // Step 4 — Load job
  const { data: job } = await sb
    .from("jobs")
    .select("id, tenant_id, address, client_user_id, client_email, client_name")
    .eq("id", invoice.job_id as string)
    .single();
  if (!job) {
    console.error(`handleInvoicePayment: job ${invoice.job_id} not found`);
    return;
  }

  // Step 5 — Insert job_transactions row
  const { data: txData, error: txErr } = await sb
    .from("job_transactions")
    .insert({
      tenant_id:                invoice.tenant_id,
      job_id:                   invoice.job_id,
      invoice_id:               invoice.id,
      direction:                "in",
      type:                     "client_payment",
      status:                   "paid",
      amount:                   paidAmount,
      description:              `Payment for Invoice ${invoice.invoice_number}`,
      date_incurred:            today,
      date_paid:                today,
      payment_method:           "stripe",
      stripe_session_id:        session.id,
      stripe_payment_intent_id: typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent as Stripe.PaymentIntent)?.id ?? null,
      stripe_checkout_url:      null,
      payer_or_payee_name:      (job.client_name as string) ?? null,
      payer_or_payee_id:        (job.client_user_id as string) ?? null,
      created_by:               null,
    })
    .select("id")
    .single();
  if (txErr) throw new Error(`job_transactions insert failed: ${txErr.message}`);

  // Step 6 — Update invoice amount_paid + status
  const newAmountPaid = Number(invoice.amount_paid) + paidAmount;
  const newStatus     = newAmountPaid >= Number(invoice.total_amount) ? "paid" : "partially_paid";
  const invoicePatch: Record<string, unknown> = {
    amount_paid: newAmountPaid,
    status:      newStatus,
    updated_at:  now,
  };
  if (newStatus === "paid") invoicePatch.paid_at = now;
  await sb.from("invoices").update(invoicePatch).eq("id", invoice.id as string);

  // Step 7 — Roll up draw paid_amount if linked
  if (invoice.draw_id) {
    const { data: draw } = await sb
      .from("draw_schedules")
      .select("target_amount, invoiced_amount, paid_amount, status")
      .eq("id", invoice.draw_id as string)
      .single();
    if (draw) {
      const newDrawPaid = Number(draw.paid_amount) + paidAmount;
      const drawPatch: Record<string, unknown> = { paid_amount: newDrawPaid, updated_at: now };
      if (
        newDrawPaid >= Number(draw.target_amount) &&
        Number(draw.invoiced_amount) >= Number(draw.target_amount)
      ) {
        drawPatch.status = "paid";
      }
      await sb.from("draw_schedules").update(drawPatch).eq("id", invoice.draw_id as string);
    }
  }

  // Step 8 — Notify staff in-app
  const tenantId = invoice.tenant_id as string;
  const jobId    = invoice.job_id as string;
  const amtFmt   = paidAmount.toLocaleString("en-US", { minimumFractionDigits: 2 });
  const { data: staff } = await sb
    .from("profiles")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("role", ["owner", "project_manager", "sales_rep"]);
  if (staff && staff.length > 0) {
    await sb.from("notifications").insert(
      staff.map((u: { id: string }) => ({
        user_id:    u.id,
        tenant_id:  tenantId,
        type:       "payment_received",
        title:      "Payment received",
        body:       `Invoice ${invoice.invoice_number} paid — $${amtFmt}`,
        job_id:     jobId,
        read:       false,
        email_sent: false,
        sms_sent:   false,
      }))
    );
  }

  // Step 9 — Notify client in-app
  if (job.client_user_id) {
    await sb.from("notifications").insert({
      user_id:    job.client_user_id,
      tenant_id:  tenantId,
      type:       "payment_received",
      title:      "Payment received",
      body:       `Thank you — your payment of $${amtFmt} for Invoice ${invoice.invoice_number} has been received.`,
      job_id:     jobId,
      read:       false,
      email_sent: false,
      sms_sent:   false,
    });
  }

  // Step 9b — Notify client via email (non-fatal on failure)
  if (job.client_email) {
    const subject = `Payment received — Invoice ${invoice.invoice_number}`;
    const html    = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:40px 16px;">
<tr><td align="center"><table width="100%" style="max-width:560px;">
<tr><td style="padding-bottom:20px;text-align:center;">
  <div style="font-size:11px;color:#C9A84C;letter-spacing:4px;text-transform:uppercase;margin-bottom:4px;">Avenstone Group</div>
  <div style="width:32px;height:2px;background:#C9A84C;margin:0 auto;"></div>
</td></tr>
<tr><td style="background:#fff;border-radius:8px;padding:32px;border:1px solid #E8E4DC;">
  <h2 style="margin:0 0 16px;font-size:20px;color:#0A1F44;font-weight:600;">Payment Received</h2>
  <p style="margin:0 0 8px;font-size:14px;color:#6B7280;">Invoice: <strong style="color:#0A1F44;">${invoice.invoice_number}</strong></p>
  <p style="margin:0 0 8px;font-size:14px;color:#6B7280;">Project: <strong style="color:#0A1F44;">${job.address ?? ""}</strong></p>
  <div style="background:#D1FAE5;border:1px solid #6EE7B7;padding:16px;border-radius:4px;margin:20px 0;text-align:center;">
    <div style="font-size:11px;color:#065f46;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Amount Paid</div>
    <div style="font-family:Georgia,serif;font-size:32px;color:#065f46;font-weight:700;">$${amtFmt}</div>
  </div>
  <p style="margin:0;font-size:13px;color:#6B7280;text-align:center;">Thank you for your payment. If you have any questions, please reply to this email.</p>
</td></tr>
<tr><td style="padding-top:20px;text-align:center;font-size:11px;color:#9CA3AF;">Avenstone Group · Kansas City, MO</td></tr>
</table></td></tr></table>
</body></html>`;
    try {
      await fetch("https://api.resend.com/emails", {
        method:  "POST",
        headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
        body:    JSON.stringify({ from: FROM, to: job.client_email, subject, html }),
      });
    } catch (emailErr) {
      console.error("handleInvoicePayment: client email failed:", emailErr);
    }
  }
}

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("no signature", { status: 400 });

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = await stripe.webhooks.constructEventAsync(body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error("webhook signature error:", err);
    return new Response(`Webhook Error: ${err}`, { status: 400 });
  }

  const sb = createClient(SB_URL, SB_SERVICE);

  if (event.type === "checkout.session.completed") {
    const session   = event.data.object as Stripe.Checkout.Session;
    const invoiceId = session.metadata?.invoice_id;

    if (invoiceId) {
      // Invoice flow (Phase 4b)
      try {
        await handleInvoicePayment(sb, session, invoiceId);
      } catch (err) {
        console.error("handleInvoicePayment error:", err);
        // Return 200 so Stripe doesn't retry a transient error that may need manual intervention
      }
    } else {
      // Legacy payment-link flow — unchanged
      await sb
        .from("job_transactions")
        .update({
          status:                   "paid",
          date_paid:                new Date().toISOString().slice(0, 10),
          stripe_payment_intent_id: typeof session.payment_intent === "string"
            ? session.payment_intent
            : (session.payment_intent as Stripe.PaymentIntent)?.id || null,
        })
        .eq("stripe_session_id", session.id)
        .eq("direction", "in");

      const jobId    = session.metadata?.job_id;
      const tenantId = session.metadata?.tenant_id || null;
      if (jobId && tenantId) {
        const { data: job }   = await sb.from("jobs").select("address").eq("id", jobId).single();
        const { data: staff } = await sb
          .from("profiles")
          .select("id")
          .eq("tenant_id", tenantId)
          .in("role", ["owner", "project_manager", "sales_rep"]);
        if (staff && staff.length > 0) {
          const amount  = session.amount_total ? (session.amount_total / 100).toFixed(2) : "0.00";
          const address = job?.address || "job";
          await sb.from("notifications").insert(
            staff.map((u: { id: string }) => ({
              user_id:    u.id,
              tenant_id:  tenantId,
              type:       "payment_received",
              title:      `Payment received — ${address}`,
              body:       `$${amount} payment received`,
              job_id:     jobId,
              read:       false,
              email_sent: false,
              sms_sent:   false,
            }))
          );
        }
      }
    }
  }

  if (
    event.type === "checkout.session.expired" ||
    event.type === "payment_intent.payment_failed"
  ) {
    const session   = event.data.object as Stripe.Checkout.Session;
    const invoiceId = session.metadata?.invoice_id;

    if (invoiceId) {
      // Invoice flow: invoice stays in sent status — PM resends manually
      console.log(`Invoice ${invoiceId} payment ${event.type} — invoice remains in sent status`);
    } else {
      // Legacy flow: void the pending job_transactions row
      await sb
        .from("job_transactions")
        .update({ status: "void" })
        .eq("stripe_session_id", session.id)
        .eq("direction", "in");
    }
  }

  return ok();
});
