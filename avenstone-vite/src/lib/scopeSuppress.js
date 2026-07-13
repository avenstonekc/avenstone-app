// CONFIGURATOR_POLISH Phase 3 — pure field-suppression compute (frontend copy).
// DIVERGENCE GUARD: mirrors computeSuppressedSet in
// supabase/functions/ai-estimator/index.ts. Any change to the suppression semantics
// (normalization, gate-match rule) MUST be applied to both. There is no automated sync.
//
// answers: [{ field_key, option_key?, value? }]  (job_scope_answers shape or {field_key,value})
// rows:    [{ gate_field_key, gate_option_key, suppressed_field_key }]  (scope_option_suppressions)
// Returns a Set of suppressed field_keys (lowercased).

const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s_]+/g, '').trim();

export function computeSuppressedFieldKeys(answers, rows) {
  const answered = new Map();
  for (const a of (answers || [])) {
    if (!a || !a.field_key) continue;
    const v = a.option_key != null ? a.option_key : a.value; // gate compares on the option key (number fields: value)
    if (v == null || String(v).trim() === '') continue;
    answered.set(String(a.field_key).toLowerCase(), norm(v));
  }
  const out = new Set();
  for (const r of (rows || [])) {
    const v = answered.get(String(r.gate_field_key).toLowerCase());
    if (v != null && v === norm(r.gate_option_key)) out.add(String(r.suppressed_field_key).toLowerCase());
  }
  return out;
}
