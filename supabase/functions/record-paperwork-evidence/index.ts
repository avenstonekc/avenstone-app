// TIME_CLOCK_ARC S2b — complete a paperwork request server-side after the recipient uploads
// their filled+signed PDF. Captures the signer IP/UA from the request (client-reported IP is
// worthless as evidence) and stamps the doc pointer that the recipient can't write themselves
// (employee_details is owner-write-only; profiles.w9_url likewise). Service role → bypasses RLS.
// The TIN is NEVER read here — only the storage path.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for") || "";
  const first = xff.split(",")[0].trim();
  const c = first || (req.headers.get("x-real-ip") || "").trim();
  return c && /^[0-9a-fA-F:.]+$/.test(c) ? c : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const { request_id, storage_path } = await req.json();
    if (!request_id || !storage_path) return json({ error: "request_id and storage_path required" }, 400);

    const sb = createClient(SB_URL, SB_SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: reqRow, error: rErr } = await sb.from("paperwork_requests").select("*").eq("id", request_id).single();
    if (rErr || !reqRow) return json({ error: "request not found" }, 404);
    if (reqRow.status !== "sent") return json({ error: "request is not open" }, 409);
    // The PDF must have been uploaded to the request user's OWN folder (storage RLS also enforces this).
    if (!String(storage_path).startsWith(`${reqRow.user_id}/`)) return json({ error: "path does not match request user" }, 403);

    const now = new Date().toISOString();
    const ip = clientIp(req);
    const ua = req.headers.get("user-agent");

    const { error: cErr } = await sb.from("paperwork_requests")
      .update({ status: "completed", storage_path, completed_at: now, sign_ip: ip, sign_user_agent: ua, updated_at: now })
      .eq("id", request_id).eq("status", "sent");
    if (cErr) return json({ error: cErr.message }, 500);

    // Stamp the doc pointer by the recipient's role.
    const { data: prof } = await sb.from("profiles").select("role").eq("id", reqRow.user_id).single();
    if (reqRow.doc_type === "w9" && prof?.role === "sub") {
      await sb.from("profiles").update({ w9_url: storage_path, w9_submitted_at: now }).eq("id", reqRow.user_id);
    } else {
      const patch = reqRow.doc_type === "w4"
        ? { w4_path: storage_path, w4_submitted_at: now }
        : { w9_path: storage_path, w9_submitted_at: now };
      await sb.from("employee_details").update({ ...patch, updated_at: now }).eq("user_id", reqRow.user_id);
    }

    return json({ ok: true, ip_captured: !!ip });
  } catch (err) {
    console.error("record-paperwork-evidence error:", err);
    return json({ error: String(err) }, 500);
  }
});
