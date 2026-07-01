// SCOPE_CAPTURE_ENGINE Phase 1A — session → estimate prefill transform.
//
// Pure, deterministic. Turns a completed consultation session's captured data
// into a DRAFT that prefills the ai-estimator entry (estForm + context). The
// prefill FEEDS the desk interview — it never bypasses it. The rep reviews the
// prefilled scope and runs Generate (Rate Book pricing) over it.
//
// Phase 2: also emits a structured `measuredFields` map + a `sf` pre-fill. The edge
// scope-interview folds any measuredFields key that matches a real checklist field into
// the answered set (source 'measured'), so the interview skips what the site visit
// captured. Free-form keys that don't match a field are ignored server-side.
//
// Inputs (all tolerant of null/empty):
//   extraction  — consultation_extractions row { scope_hints[], client_concerns[],
//                 risk_flags[], budget_signals, timeline }
//   measurements — consultation_measurements rows [{ trade, scope_notes, fields }]
//   roomScopes  — job_room_scopes rows [{ room_label, room_type, scope_tag }]
//   jobScope    — jobs.scope (existing typed scope, if any)
//   sessionId / sessionDate — provenance for the session-sourced marker
//
// Output: { scope, rooms, special, measuredTrades, measuredFields, sf, sessionId, sessionDate, sourced:true }

export function sessionToEstimatePrefill({
  extraction = null,
  measurements = [],
  roomScopes = [],
  jobScope = '',
  sessionId = null,
  sessionDate = null,
} = {}) {
  const arr = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
  const ext = extraction || {};

  // ── scope ──────────────────────────────────────────────────────────────────
  const scopeParts = [];
  if (jobScope && jobScope.trim()) scopeParts.push(jobScope.trim());
  const hints = arr(ext.scope_hints);
  if (hints.length) scopeParts.push(hints.join('. '));
  const measuredTrades = [...new Set(arr(measurements.map((m) => m && m.trade)))];
  if (measuredTrades.length) scopeParts.push(`Trades measured on-site: ${measuredTrades.join(', ')}.`);
  const scope = scopeParts.join('\n').trim();

  // ── rooms (exclude not_in_scope) ─────────────────────────────────────────────
  const rooms = roomScopes
    .filter((r) => r && r.scope_tag !== 'not_in_scope')
    .map((r) => r.room_label || r.room_type)
    .filter(Boolean)
    .join(', ');

  // ── special notes (concerns / risks / budget / timeline) ─────────────────────
  const specialParts = [];
  const concerns = arr(ext.client_concerns);
  const risks = arr(ext.risk_flags);
  if (concerns.length) specialParts.push(`Client concerns: ${concerns.join(', ')}`);
  if (risks.length) specialParts.push(`Risks flagged on-site: ${risks.join(', ')}`);
  if (ext.budget_signals) specialParts.push(`Budget signals: ${ext.budget_signals}`);
  if (ext.timeline) specialParts.push(`Timeline: ${ext.timeline}`);
  const special = specialParts.join('\n');

  // ── measured fields (structured pre-answers) ─────────────────────────────────
  // Flatten every measurement row's `fields` JSONB into one {key: value} map. The
  // edge interview keeps only keys that match a seeded checklist field_key.
  const measuredFields = {};
  for (const m of measurements) {
    const f = m && m.fields;
    if (!f || typeof f !== 'object' || Array.isArray(f)) continue;
    for (const [k, v] of Object.entries(f)) {
      if (v == null || String(v).trim() === '') continue;
      measuredFields[k] = v;
    }
  }

  // ── measured SF (interviewSf pre-fill) ───────────────────────────────────────
  // Prefer an explicit total; else the largest single floor area found. Never sums
  // across rows — several trades measuring the same room would double-count. 0 = no
  // measured SF, so EstimateTab falls back to its scan-derived SF (deriveProjectSf).
  const sfCandidates = [];
  for (const m of measurements) {
    const f = (m && m.fields) || {};
    for (const key of ['total_sf', 'floor_sf', 'sqft', 'sf']) {
      const n = Number(f[key]);
      if (Number.isFinite(n) && n > 0) sfCandidates.push(n);
    }
  }
  const sf = sfCandidates.length ? Math.max(...sfCandidates) : 0;

  return {
    scope,
    rooms,
    special,
    measuredTrades,
    measuredFields,
    sf,
    sessionId,
    sessionDate,
    sourced: true,
  };
}
