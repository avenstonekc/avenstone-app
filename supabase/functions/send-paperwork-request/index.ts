// TIME_CLOCK_ARC S2b — email a W-4/W-9 paperwork request to the recipient.
// Owner-triggered (no auto-nag). Contains NO tax data — just a prompt + a link into the app,
// where the recipient fills and e-signs. Resend pattern mirrors send-invoice.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_KEY = Deno.env.get("RESEND_API_KEY")!;
const APP_URL = "https://avenstone-app.vercel.app";
const FROM = "Avenstone Group <notifications@avenstonekc.com>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const { user_id, doc_type } = await req.json();
    if (!user_id || !doc_type) return json({ error: "user_id and doc_type required" }, 400);
    const label = doc_type === "w4" ? "W-4 (Employee's Withholding Certificate)" : "W-9 (Request for Taxpayer Identification Number)";

    const sb = createClient(SB_URL, SB_SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: prof } = await sb.from("profiles").select("email, full_name").eq("id", user_id).single();
    if (!prof?.email) return json({ error: "recipient has no email" }, 400);

    const name = (prof.full_name || "there").split(" ")[0];
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#0A1F44">
        <h2 style="color:#0A1F44">Paperwork to complete</h2>
        <p>Hi ${name},</p>
        <p>Avenstone needs you to complete and sign your <strong>${label}</strong>.</p>
        <p>Open the Avenstone app, sign in, and you'll see a <strong>"Paperwork requested"</strong> card. Fill it out on your phone and sign — it takes a couple of minutes.</p>
        <p style="margin:24px 0"><a href="${APP_URL}" style="background:#0A1F44;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:600">Open Avenstone</a></p>
        <p style="font-size:12px;color:#6B7280">Your information stays private — it's only stored inside your signed form, never as separate data.</p>
      </div>`;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: prof.email, subject: `Action needed: complete your ${doc_type.toUpperCase()}`, html }),
    });
    if (!emailRes.ok) return json({ error: `email send failed: ${await emailRes.text()}` }, 502);
    return json({ ok: true, sent_to: prof.email });
  } catch (err) {
    console.error("send-paperwork-request error:", err);
    return json({ error: String(err) }, 500);
  }
});
