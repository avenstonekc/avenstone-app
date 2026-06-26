// SCOPE_CAPTURE_ENGINE P1B â€” deterministic scope-interview engine.
// Pure functions: no Deno APIs, no Supabase, no fetch, no env vars. Rows are passed in.
// Consumer: ai-estimator scope-interview mode. Unit-testable in isolation.
//
// Placement note: this lives in _shared (Deno-importable by the edge fn) rather than
// src/lib/scopeEngine.js. The interview runs SERVER-side in ai-estimator (blueprint
// Decision A) and a Deno edge fn cannot import a browser src/lib module. The Phase-2
// frontend sessionâ†’prefill transform is a separate, later concern.
//
// The deterministic surface (trigger detection + which fields are required/open) is the
// load-bearing contract. The AI's only jobs are NL answer-extraction and question phrasing.

// â”€â”€ Row shapes (as stored in scope_checklists / scope_modules) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface ChecklistRow {
  tenant_id: string | null;
  project_type: string;
  field_key: string;
  question: string;
  field_type: string;        // choice | number | text | bool
  options: unknown;          // JSONB: string[] for choice, else null
  money_risk_rank: number;
  adds_trades: string[] | null;
  active: boolean;
}

export interface ModuleField {
  field_key: string;
  question: string;
  field_type: string;
  options?: unknown;
}

export interface ModuleRow {
  tenant_id: string | null;
  module_key: string;
  label: string;
  trigger_phrases: string[];
  adds_fields: ModuleField[]; // JSONB array of field defs (ModuleField shape)
  adds_trades: string[] | null;
  active: boolean;
}

// A required field surfaced to the interview â€” base checklist or module-added.
export interface ScopeField {
  field_key: string;
  question: string;
  field_type: string;
  options?: unknown;
  money_risk_rank: number;   // base rank; module fields sort just after the base set
  origin: string;            // "base" or the module_key that added it
}

// Answer record â€” Phase 1 only ever produces source:'typed'. The source/confidence
// shape is the load-bearing Phase-3 hook (Decision E): photo/plan answers slot in later.
export interface AnswerRecord {
  field_key: string;
  value: unknown;
  source: "typed" | "measured" | "photo" | "plan" | "assumed";
  confidence: number;        // 0..1
}

function norm(s: unknown): string {
  return (s ?? "").toString().toLowerCase().trim();
}

// Tenant rows (tenant_id non-null) override platform defaults (tenant_id null) with the
// same key. First row wins unless a later tenant row supersedes a platform default.
function mergeByKey<T>(rows: T[], keyOf: (r: T) => string, isTenant: (r: T) => boolean): T[] {
  const byKey = new Map<string, T>();
  for (const r of rows) {
    const k = keyOf(r);
    const existing = byKey.get(k);
    if (!existing) { byKey.set(k, r); continue; }
    if (isTenant(r) && !isTenant(existing)) byKey.set(k, r); // tenant override wins
  }
  return [...byKey.values()];
}

// Base checklist for a project type: active rows, tenant-override merged, rank-ordered.
export function assembleChecklist(projectType: string, checklistRows: ChecklistRow[]): ScopeField[] {
  const pt = norm(projectType);
  const relevant = (checklistRows ?? []).filter((r) => r.active && norm(r.project_type) === pt);
  const merged = mergeByKey(relevant, (r) => norm(r.field_key), (r) => r.tenant_id != null);
  return merged
    .sort((a, b) => (a.money_risk_rank ?? 99) - (b.money_risk_rank ?? 99))
    .map((r) => ({
      field_key: r.field_key,
      question: r.question,
      field_type: r.field_type,
      options: r.options ?? undefined,
      money_risk_rank: r.money_risk_rank ?? 99,
      origin: "base",
    }));
}

// Active modules, tenant-override merged by module_key.
export function mergeModules(moduleRows: ModuleRow[]): ModuleRow[] {
  const active = (moduleRows ?? []).filter((m) => m.active);
  return mergeByKey(active, (m) => norm(m.module_key), (m) => m.tenant_id != null);
}

// Deterministic trigger detection: a module fires when ANY trigger_phrase appears as a
// substring of the combined rep text. The AI does NOT decide which modules fire.
export function detectTriggers(allText: string, moduleRows: ModuleRow[]): ModuleRow[] {
  const hay = norm(allText);
  if (!hay) return [];
  return mergeModules(moduleRows).filter((m) =>
    (m.trigger_phrases ?? []).some((p) => {
      const needle = norm(p);
      return needle.length > 0 && hay.includes(needle);
    })
  );
}

// Full required set = base checklist + fired modules' adds_fields (module + array order).
// Module-added fields rank just after all base fields, preserving discovery order.
export function collectRequiredFields(baseFields: ScopeField[], firedModules: ModuleRow[]): ScopeField[] {
  const out: ScopeField[] = [...baseFields];
  const seen = new Set(baseFields.map((f) => norm(f.field_key)));
  let moduleRank = 100; // after every base rank
  for (const m of firedModules) {
    for (const f of (m.adds_fields ?? [])) {
      const key = norm(f.field_key);
      if (seen.has(key)) continue; // base or an earlier module already owns this field
      seen.add(key);
      out.push({
        field_key: f.field_key,
        question: f.question,
        field_type: f.field_type,
        options: f.options ?? undefined,
        money_risk_rank: moduleRank++,
        origin: m.module_key,
      });
    }
  }
  return out;
}

// The batch to ask: required fields not yet answered, money/risk-ordered.
export function openQuestions(requiredFields: ScopeField[], answeredKeys: Set<string>): ScopeField[] {
  const answered = new Set([...answeredKeys].map(norm));
  return requiredFields
    .filter((f) => !answered.has(norm(f.field_key)))
    .sort((a, b) => a.money_risk_rank - b.money_risk_rank);
}

// Phase-1 answer record. source is always 'typed' now; the shape is the Phase-3 hook.
export function makeAnswerRecord(fieldKey: string, value: unknown, confidence = 1): AnswerRecord {
  return { field_key: fieldKey, value, source: "typed", confidence };
}
