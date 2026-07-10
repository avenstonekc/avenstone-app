// CONTRACT_SIGNING evidence capture — server-side signer IP + user agent.
//
// Called by ClientSignContractModal AFTER sbSaveSignature succeeds, with the freshly
// written signature row id. Stamps ip_address + user_agent onto that row from the
// request itself — a client-reported IP is worthless as evidence, so we read it server
// side. This never inserts a signature (that stays on the client-side RLS path) and is
// pure evidence enrichment: a failure here must never undo or block the signature.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// The originating client IP. Supabase's edge sets the real client chain in
// x-forwarded-for; the LEFTMOST entry is the original caller (proxies append on the
// right). Fall back to x-real-ip. Returns null if nothing usable — column is nullable.
function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for") || "";
  const first = xff.split(",")[0].trim();
  const candidate = first || (req.headers.get("x-real-ip") || "").trim();
  // Guard the inet cast: only pass something IP-shaped, else null (keeps UA capture alive).
  return candidate && /^[0-9a-fA-F:.]+$/.test(candidate) ? candidate : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { signature_id, tenant_id, job_id } = await req.json();
    if (!signature_id || !tenant_id) return json({ error: "signature_id and tenant_id required" }, 400);

    const ip = clientIp(req);
    const ua = req.headers.get("user-agent");

    const sb = createClient(SB_URL, SB_SERVICE, { auth: { autoRefreshToken: false, persistSession: false } });

    // Write-once, tenant-scoped (+ job when provided): only stamp a row not yet stamped.
    // Never overwrite existing evidence. Service role → bypasses RLS (no UPDATE policy needed).
    let upd = sb.from("contract_signatures")
      .update({ ip_address: ip, user_agent: ua })
      .eq("id", signature_id)
      .eq("tenant_id", tenant_id)
      .is("ip_address", null);
    if (job_id) upd = upd.eq("job_id", job_id);

    const { data, error } = await upd.select("id, ip_address, user_agent");
    if (error) return json({ error: error.message }, 500);

    const row = Array.isArray(data) ? data[0] : null;
    return json({ ok: true, updated: !!row, ip_captured: !!row?.ip_address, ua_captured: !!row?.user_agent });
  } catch (err) {
    console.error("record-signature-evidence error:", err);
    return json({ error: String(err) }, 500);
  }
});
