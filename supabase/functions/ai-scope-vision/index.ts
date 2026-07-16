// ai-scope-vision (SCOPE_VISION P1) — Haiku VISION pass that pre-answers the EXISTING-condition
// scope-configurator fields the AI can SEE in the job's photos (what's there now: tub vs shower,
// wall/floor finish, vanity, glass), so the rep doesn't hand-answer what a photo already shows.
//
// Complements ai-scope-prefill (which reads the TEXT scope for design INTENT). This reads IMAGES for
// existing CONDITIONS. Both never touch measurements (locked "vision = SEE, not MEASURE" rule —
// quantities come from the LiDAR/floor-plan arc). All answers are status='proposed' (interpretive;
// the rep confirms). NO DB writes — the caller persists per policy.
//
// Input:  { job_id, project_type }
// Output: { ok, answers: [{ field_key, option_key, confidence, evidence_phrase }], photo_count }

import { createClient } from "npm:@supabase/supabase-js@2";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

const MAX_PHOTOS = 4;          // cost + vision-context bound
const MAX_BYTES = 5 * 1024 * 1024;

// SEE-able (existing-condition) fields per project type. These are exactly the fields a photo can
// confirm — and the ones ai-scope-prefill deliberately will NOT infer from text. Everything else
// (design intent, measurements) stays out.
const VISION_SEEABLE: Record<string, Set<string>> = {
  bathroom: new Set([
    "existing_tub_shower",
    "existing_wall_finish",
    "existing_floor_finish",
    "existing_vanity",
    "existing_countertop",
    "shower_glass",
    "ventilation",
  ]),
};

const SYSTEM_PROMPT = `You are a remodeling estimator looking at photos of a room to record its EXISTING (current) condition. Return ONLY valid JSON, no preamble, no markdown fences.

Output: { "answers": [ { "field_key": string, "option_key": string, "confidence": "high"|"med"|"low", "evidence_phrase": string } ] }

HARD RULES (violating any -> DROP that answer):
1. Answer ONLY the fields in ALLOWED FIELDS below. Never invent a field_key.
2. option_key MUST be one of the exact allowed option keys for that field.
3. Report only what you can VISUALLY CONFIRM in the photos. If a field's subject isn't clearly visible, omit it.
4. NEVER estimate measurements, dimensions, square footage, or counts of tile — you are describing what EXISTS, not measuring.
5. evidence_phrase = a short description of what you SEE that justifies the answer (e.g. "white subway tile on the shower walls", "single wood vanity with a stone top"). Do not invent details.
6. confidence: "high" when clearly visible; "med" when partially visible / a reasonable read; "low" when a guess. Omit rather than guess wildly.
7. These are EXISTING conditions. A walk-in tub is a "tub". If the space has no tub or shower, existing_tub_shower = none.`;

function abToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  return btoa(bin);
}
function norm(s: unknown): string { return String(s ?? "").toLowerCase().trim(); }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const jsonHeaders = { ...CORS, "Content-Type": "application/json" };
  try {
    const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: jsonHeaders });
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error: authErr } = await sb.auth.getUser(jwt);
    if (authErr || !user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: jsonHeaders });
    const { data: profile } = await sb.from("profiles").select("tenant_id").eq("id", user.id).single();
    const tenantId = profile?.tenant_id as string | null;
    if (!tenantId) return new Response(JSON.stringify({ error: "no tenant" }), { status: 400, headers: jsonHeaders });

    const body = await req.json();
    const jobId = (body as { job_id?: string }).job_id;
    const projectType = norm((body as { project_type?: string }).project_type);
    if (!jobId || !projectType) return new Response(JSON.stringify({ error: "job_id and project_type required" }), { status: 400, headers: jsonHeaders });

    const { data: jobRow, error: jobErr } = await sb.from("jobs").select("id, tenant_id").eq("id", jobId).single();
    if (jobErr || !jobRow) return new Response(JSON.stringify({ error: "job not found" }), { status: 404, headers: jsonHeaders });
    if (jobRow.tenant_id !== tenantId) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 403, headers: jsonHeaders });

    const allowed = VISION_SEEABLE[projectType];
    if (!allowed || allowed.size === 0) return new Response(JSON.stringify({ ok: true, answers: [], photo_count: 0 }), { headers: jsonHeaders });

    // ── Load the job's image files ──────────────────────────────────────────────
    const { data: files } = await sb.from("job_files")
      .select("id, name, mime_type, storage_bucket, storage_path")
      .eq("job_id", jobId).eq("tenant_id", tenantId);
    const imgs = (files ?? []).filter((f) =>
      String(f.mime_type ?? "").startsWith("image/") || /\.(jpe?g|png|gif|webp)$/i.test(String(f.name ?? ""))
    ).slice(0, MAX_PHOTOS);
    if (imgs.length === 0) return new Response(JSON.stringify({ ok: true, answers: [], photo_count: 0 }), { headers: jsonHeaders });

    const imageBlocks: unknown[] = [];
    for (const f of imgs) {
      const { data: blob, error: dlErr } = await sb.storage.from(String(f.storage_bucket)).download(String(f.storage_path));
      if (dlErr || !blob || blob.size > MAX_BYTES) continue;
      const mt = String(f.mime_type ?? "").startsWith("image/") ? String(f.mime_type) : "image/jpeg";
      imageBlocks.push({ type: "image", source: { type: "base64", media_type: mt, data: abToBase64(await blob.arrayBuffer()) } });
    }
    if (imageBlocks.length === 0) return new Response(JSON.stringify({ ok: true, answers: [], photo_count: 0 }), { headers: jsonHeaders });

    // ── Build the ALLOWED FIELDS vocab (SEE-able fields only) ───────────────────
    const { data: checkRows } = await sb.from("scope_checklists")
      .select("field_key, field_type, options, option_labels")
      .eq("project_type", projectType).eq("active", true).or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
    const defs = new Map<string, { options: string[]; labels: Record<string, string> }>();
    for (const r of (checkRows ?? [])) {
      const key = norm(r.field_key);
      if (!allowed.has(key) || defs.has(key)) continue;
      const opts = Array.isArray(r.options) ? r.options.map(String) : (r.field_type === "bool" ? ["yes", "no"] : []);
      defs.set(key, { options: opts, labels: (r.option_labels && typeof r.option_labels === "object") ? r.option_labels as Record<string, string> : {} });
    }
    if (defs.size === 0) return new Response(JSON.stringify({ ok: true, answers: [], photo_count: imageBlocks.length }), { headers: jsonHeaders });
    const vocab = [...defs].map(([fk, d]) => `- ${fk}: ${d.options.map((o) => d.labels[o] ? `${o} (${d.labels[o]})` : o).join(", ")}`).join("\n");

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: [
          ...imageBlocks,
          { type: "text", text: `These are photos of a ${projectType}. Record the EXISTING conditions.\n\nALLOWED FIELDS (field_key: allowed option keys):\n${vocab}\n\nReturn the answers JSON now.` },
        ] }],
      }),
    });
    if (!aiRes.ok) {
      const detail = await aiRes.text().catch(() => "");
      console.error("[ai-scope-vision] Anthropic error", aiRes.status, detail);
      return new Response(JSON.stringify({ error: "ai_error", detail }), { status: 502, headers: jsonHeaders });
    }
    const aiData = await aiRes.json();
    const rawText: string = aiData?.content?.[0]?.text ?? "{}";
    // deno-lint-ignore no-explicit-any
    let parsed: any = {};
    try { parsed = JSON.parse((rawText.match(/\{[\s\S]*\}/) ?? ["{}"])[0]); } catch { console.warn("[ai-scope-vision] parse fail", rawText); }

    const CONF = new Set(["high", "med", "low"]);
    const seen = new Set<string>();
    const answers: Array<{ field_key: string; option_key: string; confidence: string; evidence_phrase: string }> = [];
    for (const a of (Array.isArray(parsed?.answers) ? parsed.answers : [])) {
      const fk = norm((a as { field_key?: unknown }).field_key);
      const ok = String((a as { option_key?: unknown }).option_key ?? "").trim();
      const conf = norm((a as { confidence?: unknown }).confidence);
      const ev = String((a as { evidence_phrase?: unknown }).evidence_phrase ?? "").trim();
      const def = defs.get(fk);
      if (!def || seen.has(fk) || !def.options.includes(ok) || !CONF.has(conf) || !ev) continue;
      seen.add(fk);
      answers.push({ field_key: fk, option_key: ok, confidence: conf, evidence_phrase: ev });
    }
    return new Response(JSON.stringify({ ok: true, answers, photo_count: imageBlocks.length }), { headers: jsonHeaders });
  } catch (err) {
    console.error("[ai-scope-vision]", err);
    return new Response(JSON.stringify({ error: "internal_error" }), { status: 500, headers: jsonHeaders });
  }
});
