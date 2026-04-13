import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@13.11.0?target=deno";

const SB_URL        = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_KEY    = Deno.env.get("STRIPE_SECRET_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const stripe = new Stripe(STRIPE_KEY, { apiVersion: "2023-10-16", httpClient: Stripe.createFetchHttpClient() });

serve(async (req) => {
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

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const sb = createClient(SB_URL, SB_SERVICE);

    await sb.from("payments")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        stripe_payment_intent_id: typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id || null,
      })
      .eq("stripe_session_id", session.id);

    // Notify all tenant staff via in-app notifications
    const jobId = session.metadata?.job_id;
    const tenantId = session.metadata?.tenant_id || null;
    if (jobId && tenantId) {
      const { data: job } = await sb.from("jobs").select("address").eq("id", jobId).single();
      const { data: staff } = await sb.from("profiles")
        .select("id")
        .eq("tenant_id", tenantId)
        .in("role", ["owner", "project_manager", "sales_rep"]);
      if (staff && staff.length > 0) {
        const amount = session.amount_total ? (session.amount_total / 100).toFixed(2) : "0.00";
        const address = job?.address || "job";
        await sb.from("notifications").insert(
          staff.map((u: { id: string }) => ({
            user_id: u.id,
            tenant_id: tenantId,
            type: "payment_received",
            title: `Payment received — ${address}`,
            body: `$${amount} payment received`,
            job_id: jobId,
            read: false,
            email_sent: false,
            sms_sent: false,
          }))
        );
      }
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
