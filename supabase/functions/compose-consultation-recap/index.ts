// CONSULTATION_MODE Slice 3 — recap composition.
// ONE user-triggered Sonnet call per recap (max_tokens 4096). It does three things in a
// single pass over the session:
//   (1) extracts spoken-inline MEASUREMENTS from the ambient transcript → consultation_
//       measurements (source 'inline', confirmed_by_rep=false — the rep confirms them),
//   (2) composes the SCOPE-ONLY recap (summary, discussed items, scope basis, open items) —
//       ZERO dollars anywhere,
//   (3) captions each photo from the words spoken at shutter time (transcript_context) —
//       speech-derived, no vision call (that's Phase 3).
// Cost: this is the only new call in the whole arc and it's user-triggered. No audio retained.

import { createClient } from "npm:@supabase/supabase-js@2";

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const ERROR_LOGGER_URL = `${SUPABASE_URL}/functions/v1/ai-error-logger`;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

// CONSULTATION_RECAP_QUALITY Item 1 — spoken caption override. After a photo fires, if the next
// utterance begins with "caption" (or "Avenstone, caption"), the words that follow ARE the caption,
// verbatim — overriding the shutter-window AI caption. Deterministic, no model call. The photo's
// transcript_context (words at shutter time) anchors the photo's position in the full transcript;
// the text right after that anchor is the "next utterance".
function spokenCaptionFor(rawTranscript: string, context: string): string | null {
  if (!rawTranscript || !context) return null;
  const fullLower = rawTranscript.toLowerCase();
  const ctxWords = context.toLowerCase().replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!ctxWords.length) return null;
  const anchor = ctxWords.slice(-6).join(" "); // last few words of shutter context = the locator
  const pos = fullLower.lastIndexOf(anchor);
  if (pos === -1) return null;
  const afterOrig = rawTranscript.slice(pos + anchor.length); // original casing for a verbatim caption
  const m = afterOrig.match(/^[\s,.:;-]*(?:avenstone[\s,]+)?caption[\s,:.-]+(.+)$/i);
  if (!m) return null;
  let cap = m[1].trim();
  const stop = cap.toLowerCase().search(/\b(avenstone|caption)\b/); // cut at the next spoken command
  if (stop > 0) cap = cap.slice(0, stop).trim();
  cap = cap.split(/\s+/).slice(0, 30).join(" ").replace(/[\s,.;:-]+$/, "").trim();
  return cap || null;
}

function logAIError(payload: Record<string, unknown>) {
  fetch(ERROR_LOGGER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON_KEY}` },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

const SYSTEM_CLIENT = `You are Avenstone's field recap writer. A sales rep just walked a job with a homeowner. From the session data you write a CLIENT-FACING recap of the SCOPE that was discussed — "here's what my bid will be based on."

HARD RULES:
- SCOPE ONLY. Never mention, imply, or estimate any price, cost, dollar figure, rate, budget number, or total. Zero dollars anywhere.
- Only state what the transcript/data actually supports. Do not invent scope.
- If the transcript contains "[CAPTURE GAP ...]" markers, part of the conversation was NOT recorded there. Never invent what was discussed during a gap; if a gap likely hides scope, add an open_item that part of the visit wasn't captured and should be confirmed.
- Plain, warm, professional homeowner language. No construction jargon dumps.

SCOPE DIRECTION (critical — the homeowner reads this, and getting direction backwards is the worst error you can make):
- Every scope item must state its DIRECTION explicitly and correctly. Lead each discussed_items bullet with the action so direction is unmistakable: REMOVE existing (demo/tear out), INSTALL new, or KEEP existing (staying). E.g. "Remove the existing walk-in tub and tile surround", "Install a new walk-in shower where the tub was", "Keep the existing floor tile".
- Derive direction ONLY from stated evidence: demo / remove / tear out / replace / "new" / keep language in the transcript, the typed scope, and especially the SCAN SCOPE NOTES. Worked example: a scan note "Demo walk in tub. Install new shower where tub is" means the walk-in tub is being REMOVED and a shower INSTALLED in its place — NEVER describe it as installing a walk-in tub.
- NEVER infer a direction that isn't stated, and NEVER invent a rationale, reason, cause, or justification that was not actually said (e.g. do not write "bench not compatible with shower pan" unless someone said it). Every claim must trace to the evidence.
- GROUNDING: if a detail is not grounded in the transcript or the scan/scope notes, it does NOT appear in summary/discussed_items/scope_basis/open_items AT ALL — not even softly framed. Never write "considered but set aside", "may include", "possibly", or a hedge for something that wasn't said. If you think something was considered or is possible but it isn't in the evidence, put it in "needs_confirm" for the rep — never on the recap.
- If the direction OR a material detail of an item is uncertain from the evidence, do NOT state it confidently. Put it in "needs_confirm" — a short line naming the item and what is unclear — so the rep resolves it before sending. An uncertain flag is always better than a confident error on a client document.

You also do three extraction/analysis jobs:
- MEASUREMENTS: pull any measurement the rep spoke aloud (dimensions, square footage, counts, lengths) and group them by trade using the canonical trade names given. Only real numbers stated in the transcript.
- PHOTO CAPTIONS: for each photo you're given its "context" (the words spoken around the moment it was taken). Turn that into a short caption of what the photo shows.
- RISKS ("oh_shit_moments"): 3-5 unexpected conditions likely to surface on THIS job. These become the proposal's "Potential Considerations" (client-facing), so write "how_to_present" in Avenstone's approved house style: a plain-language, reassuring heads-up that names what could come up AND how we'd handle it — never alarm bells, never legal disclaimers. Model the tone on: "Once the existing wall tile comes down, we occasionally find moisture behind it. If we do, repairing it keeps your new tile from failing early." "condition" is a short 3-5 word heading (e.g. "Moisture behind existing tile"). Cost ranges are allowed on these (the client proposal shows them). The dollars-forbidden rule applies ONLY to summary/discussed_items/scope_basis/open_items.

Return ONLY valid JSON, no markdown:
{
  "summary": "2-4 sentence plain-language scope summary, directions correct. No prices.",
  "discussed_items": ["scope bullet led by its direction (Remove/Install/Keep …)", ...],
  "scope_basis": ["what the bid will be based on", ...],
  "open_items": ["still to confirm before finalizing", ...],
  "needs_confirm": ["scope item whose direction or a material detail the evidence does not resolve — name the item and what is unclear", ...],
  "measurements": [ { "trade": "<canonical trade or plain trade name>", "fields": { "key": "value" }, "note": "optional" } ],
  "photo_captions": [ { "index": 0, "caption": "short caption" } ],
  "oh_shit_moments": [ { "condition": "what might be found", "likelihood": "low|medium|high", "estimated_cost_low": 500, "estimated_cost_high": 1500, "how_to_present": "one sentence for the homeowner" } ]
}`;

// WALKTHROUGH_TYPES — sub walk fork. Same single call, same JSON shape, work-order tone.
// The four scope keys carry sub-facing meaning: discussed_items = scope of work, scope_basis =
// site conditions & access, open_items = open questions. Still ZERO dollars (sub prices it).
const SYSTEM_SUB = (trades: string) => `You are Avenstone's field scope writer. A project manager just walked a job site to scope work for a subcontractor. From the session data you write a SUB-FACING work order for the trade(s): ${trades || "the sub's trade"}. It tells the sub exactly what work is in scope so they can put a number on it.

HARD RULES:
- SCOPE ONLY. Never mention, imply, or estimate any price, cost, dollar figure, rate, budget, or total. The sub's pricing comes FROM the sub — zero dollars anywhere in the recap text.
- Only state what the transcript/data actually supports. Do not invent scope.
- If the transcript contains "[CAPTURE GAP ...]" markers, part of the conversation was NOT recorded there. Never invent what was discussed during a gap; if a gap likely hides scope, add an open_item that part of the walk wasn't captured and should be confirmed.
- Plain, direct trade language — a work order, not a sales pitch. Cover the selected trade(s) only; ignore scope that belongs to other trades.

SCOPE DIRECTION (critical — a wrong direction makes the sub bid the wrong work):
- Every scope-of-work item must state its DIRECTION explicitly: REMOVE existing (demo/tear out), INSTALL new, or KEEP existing. Lead each bullet with the action.
- Derive direction ONLY from stated evidence: demo / remove / tear out / replace / "new" / keep language in the transcript, the typed scope, and especially the SCAN SCOPE NOTES. E.g. "Demo walk in tub. Install new shower where tub is" = REMOVE the tub, INSTALL a shower in its place — never the reverse.
- NEVER infer an unstated direction and NEVER invent a rationale or reason that was not said. Every claim traces to the evidence.
- GROUNDING: anything not grounded in the transcript or the scan/scope notes does NOT appear in summary/discussed_items/scope_basis/open_items at all — not even softly framed ("considered but set aside", "may include", hedges). If you think something was considered or possible but it isn't in the evidence, put it in "needs_confirm" — never on the work order.
- If the direction or a material detail is uncertain, put it in "needs_confirm" instead of stating it — the PM resolves it before sending.

Put the content in these keys:
- summary: 2-4 sentences — the work-order overview for this trade.
- discussed_items: the specific scope-of-work items for this trade (what the sub will do).
- scope_basis: site conditions, substrate, existing conditions, and access/staging notes the sub needs to bid accurately.
- open_items: open questions for the sub / things to confirm on their own site visit.

You also do these extraction jobs:
- MEASUREMENTS: pull any measurement spoken aloud (dimensions, square footage, counts, lengths) and group them by trade using the canonical trade names given. Only real numbers stated in the transcript.
- PHOTO CAPTIONS: for each photo you're given its "context" (words spoken when it was taken). Turn that into a short caption of what the photo shows.
- RISKS ("oh_shit_moments"): 3-5 site conditions for THIS trade that could change the work. INTERNAL only (never on the sub recap), so it MAY include a rough cost range. The dollars-forbidden rule applies ONLY to summary/discussed_items/scope_basis/open_items.

Return ONLY valid JSON, no markdown:
{
  "summary": "2-4 sentence work-order overview, directions correct. No prices.",
  "discussed_items": ["scope-of-work item for this trade, led by its direction (Remove/Install/Keep …)", ...],
  "scope_basis": ["site condition / access note", ...],
  "open_items": ["open question for the sub", ...],
  "needs_confirm": ["scope item whose direction or a material detail the evidence does not resolve — name the item and what is unclear", ...],
  "measurements": [ { "trade": "<canonical trade or plain trade name>", "fields": { "key": "value" }, "note": "optional" } ],
  "photo_captions": [ { "index": 0, "caption": "short caption" } ],
  "oh_shit_moments": [ { "condition": "what might be found", "likelihood": "low|medium|high", "estimated_cost_low": 500, "estimated_cost_high": 1500, "how_to_present": "one sentence, internal" } ]
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { session_id, job_id, unresolved_gaps = [] } = await req.json();
    if (!session_id || !job_id) {
      return new Response(JSON.stringify({ error: "Missing session_id or job_id" }), {
        status: 400, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const [sessionRes, extractionRes, measRes, photosRes, jobRes] = await Promise.all([
      sb.from("consultation_sessions").select("id, job_id, tenant_id, raw_transcript, session_type, trade_scope, walk_sub_id").eq("id", session_id).single(),
      sb.from("consultation_extractions").select("*").eq("session_id", session_id).maybeSingle(),
      sb.from("consultation_measurements").select("*").eq("session_id", session_id),
      sb.from("consultation_photos").select("id, sort, captured_at, caption, caption_source, transcript_context").eq("session_id", session_id).order("sort").order("captured_at"),
      sb.from("jobs").select("address, scope, client_name").eq("id", job_id).single(),
    ]);

    const session = sessionRes.data;
    if (!session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }
    const extraction = extractionRes.data as Record<string, unknown> | null;
    const existingMeasurements = (measRes.data || []) as Record<string, unknown>[];
    const photos = (photosRes.data || []) as Record<string, unknown>[];
    const job = jobRes.data as Record<string, unknown> | null;

    // WALKTHROUGH_TYPES — fork tone + recipient by session audience.
    const isSub = session.session_type === "sub_walk";
    const tradeList = Array.isArray(session.trade_scope) ? (session.trade_scope as string[]).filter(Boolean) : [];
    const tradesStr = tradeList.join(", ");
    const SYSTEM = isSub ? SYSTEM_SUB(tradesStr) : SYSTEM_CLIENT;

    // Sub recaps go to the walked sub (not the client). Resolve here so the client always
    // has a recipient even when reopening a past session.
    let recipient: { id: string | null; email: string | null; name: string | null } | null = null;
    if (isSub && session.walk_sub_id) {
      const { data: subProfile } = await sb
        .from("profiles").select("id, email, full_name").eq("id", session.walk_sub_id).maybeSingle();
      if (subProfile) recipient = { id: subProfile.id ?? null, email: subProfile.email ?? null, name: subProfile.full_name ?? null };
    }

    // Canonical trade strings for measurement grouping.
    let canonicalTrades: string[] = [];
    try {
      const { data } = await sb
        .from("trade_taxonomy")
        .select("parent_trade, sub_trade, tenant_trade_visibility!inner(active)")
        .eq("tenant_trade_visibility.tenant_id", session.tenant_id)
        .eq("tenant_trade_visibility.active", true);
      canonicalTrades = (data || []).map((r: Record<string, unknown>) =>
        r.sub_trade ? `${r.parent_trade} - ${r.sub_trade}` : String(r.parent_trade));
    } catch { /* ignore */ }

    // Item 3 — scan scope notes are the rep's per-room intent captured AT the scan; the strongest
    // direction evidence ("Demo walk in tub. Install new shower where tub is" → remove tub, install shower).
    const scanNotes: string[] = [];
    try {
      const { data: scans } = await sb.from("job_lidar_scans")
        .select("rooms").eq("job_id", job_id).order("created_at", { ascending: false }).limit(3);
      const seen = new Set<string>();
      for (const s of (scans || []) as Record<string, unknown>[]) {
        for (const r of ((s.rooms as Record<string, unknown>[]) || [])) {
          const note = String(r.scope_note || "").trim();
          if (note && !seen.has(note.toLowerCase())) {
            seen.add(note.toLowerCase());
            scanNotes.push(`${String(r.name || "Room")}: ${note}`);
          }
        }
      }
    } catch { /* ignore */ }

    const photoBlock = photos.length
      ? photos.map((p, i) => `  [${i}] context: ${p.transcript_context || "(none)"}`).join("\n")
      : "  (none)";

    const userContent = `${isSub ? `SUB WALK — write the work order for these trade(s) ONLY: ${tradesStr || "(unspecified)"}\n` : ""}JOB: ${job?.address || "Unknown"}${job?.client_name ? ` — client ${job.client_name}` : ""}
EXISTING TYPED SCOPE: ${job?.scope || "(none)"}

SCAN SCOPE NOTES (rep's per-room notes at scan time — STRONGEST direction evidence: what is removed vs installed vs kept):
${scanNotes.length ? scanNotes.map((n) => `- ${n}`).join("\n") : "- (none)"}

AMBIENT TRANSCRIPT:
${session.raw_transcript || "(no transcript captured)"}

EXTRACTED SIGNALS:
- scope hints: ${(extraction?.scope_hints as string[] || []).join("; ") || "(none)"}
- client concerns: ${(extraction?.client_concerns as string[] || []).join("; ") || "(none)"}
- risk flags: ${(extraction?.risk_flags as string[] || []).join("; ") || "(none)"}
- timeline: ${extraction?.timeline || "(none)"}

MEASUREMENTS ALREADY CAPTURED (measure mode — do not re-list these, only ADD spoken ones from the transcript):
${existingMeasurements.filter((m) => m.source !== "inline").map((m) => `- ${m.trade}: ${JSON.stringify(m.fields)}`).join("\n") || "  (none)"}

CANONICAL TRADES (use these names when grouping measurements): ${canonicalTrades.join(", ") || "(none)"}

PHOTOS (caption each by index):
${photoBlock}`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: SYSTEM,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    const aiJson = await aiRes.json();
    const rawText = aiJson.content?.[0]?.text || "{}";
    let out: Record<string, unknown>;
    try {
      const cleaned = rawText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
      out = JSON.parse(cleaned);
    } catch {
      logAIError({
        function_name: "compose-consultation-recap",
        error_type: "invalid_json",
        error_message: "Recap composer returned invalid JSON",
        ai_raw_response: rawText,
        session_id,
        job_id,
        tenant_id: session.tenant_id,
      });
      return new Response(JSON.stringify({ error: "Recap composer returned invalid JSON", raw: rawText }), {
        status: 500, headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const arr = (v: unknown) => (Array.isArray(v) ? v : []);

    // (1) Persist spoken-inline measurements — source 'inline', unconfirmed. Merge into the
    // existing inline row per trade; never touch measure-mode rows or flip their confirm flag.
    const inlineOut = arr(out.measurements) as Record<string, unknown>[];
    for (const m of inlineOut) {
      const trade = String(m.trade || "").trim();
      const fields = (m.fields && typeof m.fields === "object") ? m.fields as Record<string, unknown> : {};
      if (!trade || !Object.keys(fields).length) continue;
      const existingInline = existingMeasurements.find((e) => e.trade === trade && e.source === "inline");
      if (existingInline) {
        await sb.from("consultation_measurements")
          .update({ fields: { ...(existingInline.fields as Record<string, unknown> || {}), ...fields }, scope_notes: m.note || existingInline.scope_notes || null })
          .eq("id", existingInline.id);
      } else {
        await sb.from("consultation_measurements").insert({
          session_id, job_id, tenant_id: session.tenant_id,
          trade, fields, source: "inline", confirmed_by_rep: false, scope_notes: m.note || null,
        });
      }
    }

    // (3a) Item 1 — spoken caption override. A verbatim "caption ..." command right after the photo
    // wins over the AI shutter caption (but never over a rep's manual edit).
    const spokenHandled = new Set<number>();
    const rawTx = String(session.raw_transcript || "");
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      if (p.caption && p.caption_source === "manual") continue; // never override a rep edit
      const spoken = spokenCaptionFor(rawTx, String(p.transcript_context || ""));
      if (spoken) {
        await sb.from("consultation_photos").update({ caption: spoken, caption_source: "spoken" }).eq("id", p.id);
        spokenHandled.add(i);
      }
    }

    // (3b) Caption the rest from the shutter-window transcript (AI), skipping spoken + manual.
    const caps = arr(out.photo_captions) as Record<string, unknown>[];
    for (const c of caps) {
      const idx = Number(c.index);
      const caption = String(c.caption || "").trim();
      const photo = photos[idx];
      if (!photo || !caption || spokenHandled.has(idx)) continue;
      if (photo.caption && photo.caption_source === "manual") continue; // never overwrite a rep edit
      await sb.from("consultation_photos").update({ caption, caption_source: "speech" }).eq("id", photo.id);
    }

    // (2) Upsert the scope-only recap draft.
    const recapRow = {
      session_id, job_id, tenant_id: session.tenant_id,
      summary: String(out.summary || ""),
      discussed_items: arr(out.discussed_items),
      scope_basis: arr(out.scope_basis),
      open_items: arr(out.open_items),
      needs_confirm: arr(out.needs_confirm),
      status: "draft",
      updated_at: new Date().toISOString(),
    };
    await sb.from("consultation_recaps").upsert(recapRow, { onConflict: "session_id" });

    // Risk capture (absorbed from the retired generate-estimate-from-session). Fresh oh_shit
    // rows per compose: clear this session's prior rows, then insert the AI risks + any
    // unresolved gaps from the gap analyzer. Internal risk list — never on the client recap.
    const gapSeverityToLikelihood: Record<string, string> = { blocker: "high", strong: "medium", nice_to_have: "low" };
    const ohShit = (arr(out.oh_shit_moments) as Record<string, unknown>[]).map((m) => ({
      condition: m.condition, likelihood: m.likelihood || "medium",
      estimated_cost_low: m.estimated_cost_low ?? null, estimated_cost_high: m.estimated_cost_high ?? null,
      how_to_present: m.how_to_present || "",
    }));
    for (const g of arr(unresolved_gaps) as Record<string, unknown>[]) {
      ohShit.push({
        condition: g.title || g.description || "Unresolved gap",
        likelihood: gapSeverityToLikelihood[g.severity as string] || "medium",
        estimated_cost_low: null, estimated_cost_high: null,
        how_to_present: g.suggested_action || g.description || "",
      });
    }
    await sb.from("oh_shit_moments").delete().eq("session_id", session_id);
    if (ohShit.length) {
      await sb.from("oh_shit_moments").insert(ohShit.map((m) => ({
        session_id, job_id, tenant_id: session.tenant_id,
        condition: m.condition, likelihood: m.likelihood,
        estimated_cost_low: m.estimated_cost_low, estimated_cost_high: m.estimated_cost_high,
        how_to_present: m.how_to_present, included_in_proposal: false,
      })));
    }

    // Return the fresh state for the rep review screen.
    const [{ data: recap }, { data: freshMeas }, { data: freshPhotos }, { data: ohRows }] = await Promise.all([
      sb.from("consultation_recaps").select("*").eq("session_id", session_id).maybeSingle(),
      sb.from("consultation_measurements").select("*").eq("session_id", session_id),
      sb.from("consultation_photos").select("*").eq("session_id", session_id).order("sort").order("captured_at"),
      sb.from("oh_shit_moments").select("*").eq("session_id", session_id),
    ]);

    return new Response(JSON.stringify({
      ok: true, recap, measurements: freshMeas || [], photos: freshPhotos || [], oh_shit_moments: ohRows || [],
      session_type: session.session_type || "client_walk", trade_scope: tradeList, recipient,
    }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e) {
    logAIError({ function_name: "compose-consultation-recap", error_type: "unhandled_exception", error_message: String(e) });
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
