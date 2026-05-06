import { createClient } from "npm:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@13.11.0?target=deno";

const SB_URL      = Deno.env.get("SUPABASE_URL")!;
const SB_ANON     = Deno.env.get("SUPABASE_ANON_KEY")!;
const SB_SERVICE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_KEY  = Deno.env.get("STRIPE_SECRET_KEY")!;
const APP_URL     = "https://avenstone-app.vercel.app";

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

const PAYABLE_STATUSES = new Set(["sent", "viewed", "partially_paid", "overdue"]);

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

    // 3. JWT-scoped read — RLS gates access without us re-implementing role checks
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

    // 4-5. Service-role full load
    const { data: invoice, error: invErr } = await admin
      .from("invoices")
      .select("id, tenant_id, job_id, invoice_number, total_amount, status")
      .eq("id", invoice_id)
      .single();
    if (invErr || !invoice) return json({ ok: false, error: "Invoice not found" }, 404);

    // 6. Status gate
    if (!PAYABLE_STATUSES.has(invoice.status as string)) {
      const reason = invoice.status === "draft"
        ? "Draft invoices cannot be paid — send the invoice first."
        : invoice.status === "paid"
          ? "Invoice is already paid."
          : "Void invoices cannot be paid.";
      return json({ ok: false, error: reason }, 400);
    }

    // 7. Load job for Stripe description
    const { data: job } = await admin
      .from("jobs")
      .select("address, client_email")
      .eq("id", invoice.job_id as string)
      .single();

    // 8. Mint fresh Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "us_bank_account"],
      line_items: [{
        price_data: {
          currency:     "usd",
          unit_amount:  Math.round(Number(invoice.total_amount) * 100),
          product_data: {
            name:        `Invoice ${invoice.invoice_number}`,
            description: (job?.address as string) ?? undefined,
          },
        },
        quantity: 1,
      }],
      ...(job?.client_email ? { customer_email: job.client_email as string } : {}),
      success_url: `${APP_URL}?payment=success`,
      cancel_url:  `${APP_URL}?payment=cancelled`,
      metadata: {
        invoice_id: invoice.id as string,
        job_id:     invoice.job_id as string,
        tenant_id:  invoice.tenant_id as string,
      },
    });

    // 9. Update invoice with new session (status untouched)
    const now = new Date().toISOString();
    await admin.from("invoices").update({
      stripe_session_id:   session.id,
      stripe_checkout_url: session.url,
      updated_at:          now,
    }).eq("id", invoice_id);

    // 10. Return fresh URL
    return json({ ok: true, checkout_url: session.url, session_id: session.id });

  } catch (err: unknown) {
    console.error("regenerate-invoice-payment error:", err);
    return json({ ok: false, error: (err as Error).message ?? "Unexpected error" }, 500);
  }
});
