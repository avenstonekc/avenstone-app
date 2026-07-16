// ai-scope-prefill (SCOPE_PREFILL P2) — Haiku parser that pre-answers STATEMENT-ANSWERABLE
// scope-configurator questions from the job's free-text Scope of Work, so the configurator
// doesn't ask what the owner already wrote down.
//
// Modeled on ai-extract-sub-invoice: same auth (Bearer JWT -> user -> profile.tenant_id),
// same tenant isolation (the job is verified to be in the caller's tenant), same Haiku +
// JSON-only-parse shape. NO DB WRITES — returns validated candidate answers; the caller
// (Phase 3) decides the confidence threshold and persistence.
//
// Input:  { job_id, project_type }
// Output: { ok, answers: [{ field_key, option_key, confidence, evidence_phrase }] }
//
// The option vocabulary is loaded SERVER-SIDE from scope_checklists (+ scope_modules) so the
// model can only pick from the authoritative option keys; anything off-vocab is dropped.

import { createClient } from "npm:@supabase/supabase-js@2";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

// ── STATEMENT-ANSWERABLE classification (Phase 1 audit, 2026-07-16) ───────────────────────
// Only fields a plain scope sentence can legitimately answer. Keyed by project_type so other
// trades can be classified later without touching the engine. Everything NOT listed here is
// dropped server-side even if the model emits it — this is the load-bearing guardrail:
//   • MEASUREMENT fields (floor_sf, *_in dims) are excluded (takeoff-bridge territory).
//   • EXISTING-CONDITION fields that a fixture sentence does NOT literally state are excluded
//     (existing_wall_finish / existing_vanity / existing_countertop): "new vanity" says nothing
//     about what exists today. existing_tub_shower / existing_floor_finish ARE included because
//     a demo/keep sentence literally states them ("demo the walk-in tub", "keeping tile floor").
const STATEMENT_ANSWERABLE: Record<string, Set<string>> = {
  bathroom: new Set([
    "existing_tub_shower",
    "tub_shower_config",
    "layout_change",
    "tile_height",
    "existing_floor_finish",
    "floor_tile",
    "toilet",
    "vanity_config",
    "shower_entry",
    "heated_floor",
    "niche",
  ]),
};

const SYSTEM_PROMPT = `You pre-fill a bathroom-remodel scope questionnaire from a contractor's free-text Scope of Work. Return ONLY valid JSON, no preamble, no markdown fences, no commentary.

Output schema:
{ "answers": [ { "field_key": string, "option_key": string, "confidence": "high"|"med"|"low", "evidence_phrase": string } ] }

HARD RULES (violating any means DROP that answer):
1. Answer ONLY the fields listed in the ALLOWED FIELDS block below. Never invent a field_key.
2. option_key MUST be one of the exact allowed option keys given for that field. Never invent an option.
3. NEVER answer measurements or dimensions (square footage, widths, heights, depths) — those are not in the allowed list and must be omitted entirely.
4. NEVER infer an EXISTING condition that the text does not literally state. "new vanity" tells you a vanity is being installed — it tells you NOTHING about what exists today, so do not answer existing_vanity. Only answer an existing_* field when the text literally describes the current state (e.g. "demo the walk-in tub" -> the space currently has a tub; "keeping tile floor" -> the floor is currently tile).
5. evidence_phrase MUST be an EXACT VERBATIM substring copied from the Scope of Work that justifies the answer. Do not paraphrase. If you cannot quote a justifying substring, omit the answer.
6. confidence: "high" only when the text unambiguously states it; "med" when reasonably implied by literal wording; "low" when a plausible but soft reading. When in doubt, omit rather than guess.

READING GUIDE (bathroom):
- "demo/tear out the [tub|shower]" -> existing_tub_shower = that fixture (a walk-in tub is a tub).
- "add a new walk-in shower" / "shower in that space" -> tub_shower_config = walkin.
- "tile from floor to ceiling" / "tile to the ceiling" -> tile_height = ceiling.
- "keeping/keep the [tile|existing] floor" -> existing_floor_finish = tile (if tile), AND floor_tile = keep_existing (floor not being replaced).
- Layout stays put -> layout_change = keep_layout, HIGH confidence, when the text clearly says fixtures are not moving: "in that space", "in the same space", "same footprint", "same layout", "keep the layout", "not moving anything", "fixtures stay". Treat these as unambiguous layout-stays signals and rate them HIGH, not med.
- "new toilet" -> toilet = standard (a replacement; do not upgrade the grade unless stated).
- "new vanity" (singular) -> vanity_config = single (med confidence; do NOT touch existing_vanity).`;

function norm(s: unknown): string {
  return String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const jsonHeaders = { ...CORS, "Content-Type": "application/json" };

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: jsonHeaders });

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user }, error: authErr } = await sb.auth.getUser(jwt);
    if (authErr || !user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: jsonHeaders });

    const { data: profile } = await sb.from("profiles").select("tenant_id").eq("id", user.id).single();
    const tenantId = profile?.tenant_id as string | null;
    if (!tenantId) return new Response(JSON.stringify({ error: "no tenant" }), { status: 400, headers: jsonHeaders });

    // ── Input ─────────────────────────────────────────────────────────────────
    const body = await req.json();
    const jobId = (body as { job_id?: string }).job_id;
    const projectTypeRaw = (body as { project_type?: string }).project_type;
    const projectType = typeof projectTypeRaw === "string" ? projectTypeRaw.trim().toLowerCase() : "";
    if (!jobId || !projectType) {
      return new Response(JSON.stringify({ error: "job_id and project_type required" }), { status: 400, headers: jsonHeaders });
    }

    // ── Load job + tenant isolation (same pattern as ai-extract-sub-invoice) ────
    const { data: jobRow, error: jobErr } = await sb.from("jobs").select("id, tenant_id, scope").eq("id", jobId).single();
    if (jobErr || !jobRow) return new Response(JSON.stringify({ error: "job not found" }), { status: 404, headers: jsonHeaders });
    if (jobRow.tenant_id !== tenantId) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 403, headers: jsonHeaders });

    const scopeText = String(jobRow.scope ?? "").trim();
    const allowed = STATEMENT_ANSWERABLE[projectType];
    // No scope text, or a project type we haven't classified yet -> nothing to pre-fill.
    if (!scopeText || !allowed || allowed.size === 0) {
      return new Response(JSON.stringify({ ok: true, answers: [] }), { headers: jsonHeaders });
    }

    // ── Load authoritative option vocab (scope_checklists base + scope_modules add-ons) ──
    const [{ data: checkRows }, { data: moduleRows }] = await Promise.all([
      sb.from("scope_checklists")
        .select("field_key, field_type, options, option_labels, active, tenant_id, project_type")
        .eq("project_type", projectType).eq("active", true).or(`tenant_id.is.null,tenant_id.eq.${tenantId}`),
      sb.from("scope_modules").select("adds_fields, active, tenant_id").eq("active", true).or(`tenant_id.is.null,tenant_id.eq.${tenantId}`),
    ]);

    // Build field def map {field_key -> { field_type, options[] }} restricted to the allowed set.
    const defs = new Map<string, { field_type: string; options: string[]; labels: Record<string, string> }>();
    const addDef = (fk: string, ftype: string, options: unknown, labels: unknown) => {
      const key = String(fk).toLowerCase();
      if (!allowed.has(key) || defs.has(key)) return;
      const opts = Array.isArray(options) ? options.map(String)
        : ftype === "bool" ? ["yes", "no"] : [];
      defs.set(key, { field_type: ftype, options: opts, labels: (labels && typeof labels === "object") ? labels as Record<string, string> : {} });
    };
    for (const r of (checkRows ?? [])) addDef(r.field_key as string, r.field_type as string, r.options, r.option_labels);
    for (const m of (moduleRows ?? [])) {
      const fields = Array.isArray(m.adds_fields) ? m.adds_fields : [];
      for (const f of fields) addDef((f as { field_key?: string }).field_key ?? "", (f as { field_type?: string }).field_type ?? "choice", (f as { options?: unknown }).options, (f as { option_labels?: unknown }).option_labels);
    }
    if (defs.size === 0) return new Response(JSON.stringify({ ok: true, answers: [] }), { headers: jsonHeaders });

    // ── Build the ALLOWED FIELDS vocab block for the prompt ─────────────────────
    const vocabLines: string[] = [];
    for (const [fk, d] of defs) {
      const opts = d.options.map((o) => (d.labels[o] ? `${o} (${d.labels[o]})` : o)).join(", ");
      vocabLines.push(`- ${fk} [${d.field_type}]: ${opts}`);
    }
    const userText = `Scope of Work:\n"""\n${scopeText}\n"""\n\nALLOWED FIELDS (field_key [type]: allowed option keys):\n${vocabLines.join("\n")}\n\nReturn the answers JSON now.`;

    // ── Haiku call (temperature 0 for determinism) ─────────────────────────────
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: [{ type: "text", text: userText }] }],
      }),
    });
    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => "");
      console.error("[ai-scope-prefill] Anthropic error:", aiRes.status, errText);
      return new Response(JSON.stringify({ error: "ai_error", detail: errText }), { status: 502, headers: jsonHeaders });
    }

    const aiData = await aiRes.json();
    const rawText: string = aiData?.content?.[0]?.text ?? "{}";
    // deno-lint-ignore no-explicit-any
    let parsed: any = {};
    try { parsed = JSON.parse((rawText.match(/\{[\s\S]*\}/) ?? ["{}"])[0]); }
    catch { console.warn("[ai-scope-prefill] JSON parse failed, raw:", rawText); }

    // ── Validate against the loaded vocab (drop anything off-contract) ──────────
    const scopeNorm = norm(scopeText);
    const CONF = new Set(["high", "med", "low"]);
    const seen = new Set<string>();
    const answers: Array<{ field_key: string; option_key: string; confidence: string; evidence_phrase: string }> = [];
    const raw = Array.isArray(parsed?.answers) ? parsed.answers : [];
    for (const a of raw) {
      const fk = norm((a as { field_key?: unknown }).field_key);
      const ok = String((a as { option_key?: unknown }).option_key ?? "").trim();
      const conf = norm((a as { confidence?: unknown }).confidence);
      const ev = String((a as { evidence_phrase?: unknown }).evidence_phrase ?? "").trim();
      const def = defs.get(fk);
      if (!def) continue;                                   // not allowed / unknown field
      if (seen.has(fk)) continue;                           // one answer per field (first wins)
      if (!def.options.includes(ok)) continue;              // option not in authoritative vocab
      if (!CONF.has(conf)) continue;                        // confidence must be high|med|low
      if (!ev || !scopeNorm.includes(norm(ev))) continue;   // evidence must be a verbatim substring
      seen.add(fk);
      answers.push({ field_key: fk, option_key: ok, confidence: conf, evidence_phrase: ev });
    }

    return new Response(JSON.stringify({ ok: true, answers }), { headers: jsonHeaders });
  } catch (err) {
    console.error("[ai-scope-prefill]", err);
    return new Response(JSON.stringify({ error: "internal_error" }), { status: 500, headers: jsonHeaders });
  }
});
