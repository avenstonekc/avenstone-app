import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@13.11.0?target=deno";

const SB_URL     = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!;
const APP_URL    = "https://avenstone-app.vercel.app";
const FROM       = "Avenstone Group <notifications@avenstonekc.com>";

const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2023-10-16", httpClient: Stripe.createFetchHttpClient() });

serve(async (req) => {
  try {
    const { job_id, tenant_id, amount, description, payment_type, client_email, client_name, job_address, created_by } = await req.json();
    if (!job_id || !amount || !client_email) return new Response("missing fields", { status: 400 });

    const sb = createClient(SB_URL, SB_SERVICE);

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "us_bank_account"],
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: Math.round(Number(amount) * 100),
          product_data: {
            name: description,
            description: job_address || undefined,
          },
        },
        quantity: 1,
      }],
      customer_email: client_email,
      success_url: `${APP_URL}?payment=success`,
      cancel_url:  `${APP_URL}?payment=cancelled`,
      metadata: { job_id, tenant_id, payment_type: payment_type || "custom" },
    });

    // Save payment record
    const { data: payment } = await sb.from("payments").insert({
      tenant_id, job_id, amount: Number(amount), description,
      payment_type: payment_type || "custom",
      status: "pending",
      stripe_session_id: session.id,
      stripe_checkout_url: session.url,
      client_email, created_by: created_by || null,
    }).select().single();

    // Email client
    const greeting = client_name ? `Hi ${client_name.split(" ")[0]},` : "Hi,";
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F7F5F0;font-family:sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F5F0;padding:40px 16px;">
<tr><td align="center"><table width="100%" style="max-width:560px;">
<tr><td style="padding-bottom:20px;text-align:center;">
  <div style="font-size:11px;color:#C9A84C;letter-spacing:4px;text-transform:uppercase;margin-bottom:4px;">Avenstone Group</div>
  <div style="width:32px;height:2px;background:#C9A84C;margin:0 auto;"></div>
</td></tr>
<tr><td style="background:#fff;border-radius:8px;padding:32px;border:1px solid #E8E4DC;">
  <p style="margin:0 0 16px;font-size:13px;color:#9CA3AF;">${greeting}</p>
  <h2 style="margin:0 0 8px;font-size:20px;color:#0A1F44;font-weight:600;">Payment Request</h2>
  <p style="margin:0 0 8px;font-size:14px;color:#6B7280;">Project: <strong style="color:#0A1F44;">${job_address || ""}</strong></p>
  <p style="margin:0 0 20px;font-size:14px;color:#6B7280;">${description}</p>
  <div style="background:#F7F5F0;border:1px solid #E8E4DC;padding:16px;border-radius:4px;margin-bottom:24px;text-align:center;">
    <div style="font-size:11px;color:#9CA3AF;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Amount Due</div>
    <div style="font-family:Georgia,serif;font-size:32px;color:#0A1F44;font-weight:700;">$${Number(amount).toLocaleString("en-US",{minimumFractionDigits:2})}</div>
  </div>
  <a href="${session.url}" style="display:block;background:#0A1F44;color:#C9A84C;padding:14px 32px;border-radius:4px;text-decoration:none;font-size:15px;font-weight:700;letter-spacing:0.3px;text-align:center;">Pay Now →</a>
  <p style="margin:20px 0 0;font-size:12px;color:#9CA3AF;text-align:center;">Pay securely by card or bank transfer. This link expires in 24 hours.</p>
</td></tr>
<tr><td style="padding-top:20px;text-align:center;font-size:11px;color:#9CA3AF;">Avenstone Group · Kansas City, MO</td></tr>
</table></td></tr></table>
</body></html>`;

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: client_email, subject: `Payment request — ${description}`, html }),
    });

    return new Response(JSON.stringify({ payment, checkout_url: session.url }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-payment-link error:", err);
    return new Response(String(err), { status: 500 });
  }
});
