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

    // CONTRACT_SIGNING · client-RLS hardening — set the job's SIGNED state server-side.
    // The client session no longer has UPDATE on jobs (that column-unscoped hole is closed);
    // this fn — already running service-side in the post-sign flow — owns the write. It mirrors
    // the EXACT fields the client modal used to write. status:'in_progress' is kept verbatim for
    // now; Model B Phase 3 owns changing that semantic, not this slice. Isolated: a failure here
    // leaves contract_signed=false (the portal's sign banner persists) but NEVER touches the
    // signature (already saved) — so we log LOUDLY and report it back for the caller to log too.
    let contractMarked = false;
    if (job_id) {
      try {
        const { error: jErr } = await sb.from("jobs")
          .update({ contract_signed: true, contract_signed_at: new Date().toISOString(), status: "in_progress" })
          .eq("id", job_id)
          .eq("tenant_id", tenant_id);
        if (jErr) console.error("record-signature-evidence contract_signed write FAILED:", jErr.message);
        else contractMarked = true;
      } catch (e) {
        console.error("record-signature-evidence contract_signed write threw:", String(e));
      }
    }

    // Model B Phase 2 — contract SIGNED: advance Lead/Proposal/Contract → complete.
    // Routed here (not the client modal) because job_phases RLS forbids the client role
    // from writing; this fn already runs service-side in the post-sign flow. Forward-only
    // (never regress a complete row), idempotent, and NEVER affects the evidence response.
    // Divergence-guard: mirrors markLifecyclePhases('contract_signed') in src/lib/lifecycle.js.
    if (job_id) {
      try {
        const nowIso = new Date().toISOString();
        const { data: phases } = await sb.from("job_phases")
          .select("id, phase_name, status, started_at, completed_at")
          .eq("job_id", job_id).eq("tenant_id", tenant_id)
          .in("phase_name", ["Lead", "Proposal", "Contract"]);
        for (const p of phases || []) {
          if (p.status === "complete") continue; // forward-only no-op
          const patch: Record<string, unknown> = { status: "complete", completed_at: p.completed_at || nowIso };
          if (!p.started_at) patch.started_at = nowIso;
          const { error: pErr } = await sb.from("job_phases")
            .update(patch).eq("id", p.id).eq("tenant_id", tenant_id).neq("status", "complete");
          if (pErr) console.error("record-signature-evidence phase advance:", p.phase_name, pErr.message);
        }
      } catch (e) {
        console.error("record-signature-evidence contract_signed advance failed:", String(e));
      }
    }

    return json({ ok: true, updated: !!row, ip_captured: !!row?.ip_address, ua_captured: !!row?.user_agent, contract_marked: contractMarked });
  } catch (err) {
    console.error("record-signature-evidence error:", err);
    return json({ error: String(err) }, 500);
  }
});
