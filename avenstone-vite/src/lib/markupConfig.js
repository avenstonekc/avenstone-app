/**
 * ESTIMATE_FLOW_ARC Slice 5 — single source of truth for markup bucketing.
 *
 * All three markup sites (sbLoadJobFinancialSummary, sbLoadClientActualSpend,
 * proposal-time display) converge here so adding a new category or changing
 * a rate bucket is one edit in one file.
 *
 * Ledger types (sub_payout, material_purchase, equipment_rental …) and estimate
 * categories (sub, materials, equipment …) both normalize through
 * normalizeCategoryKey before lookup — callers don't need to know the mapping.
 */

// Default config reproduces the trigger (20260527060000_cost_plus_phase_1b_trigger.sql):
//   sub_payout / labor → labor_rate; everything else → material_rate.
export const DEFAULT_CATEGORY_CONFIG = {
  labor:     'labor_rate',
  sub:       'labor_rate',
  materials: 'material_rate',
  equipment: 'material_rate',
  permit:    'material_rate',
  other:     'material_rate',
};

// Ledger type aliases → canonical estimate category key
const LEDGER_ALIASES = {
  sub_payout:         'sub',
  material_purchase:  'materials',
  material:           'materials',
  supply:             'materials',
  equipment_rental:   'equipment',
  fuel:               'equipment',
  change_order:       'other',
};

/**
 * Normalize an estimate category or ledger transaction type to a canonical key.
 * Safe to call with any raw string from the DB — unknown values pass through
 * and will fall through to DEFAULT_CATEGORY_CONFIG['other'] → material_rate.
 */
export function normalizeCategoryKey(raw) {
  if (!raw) return 'other';
  const key = String(raw).toLowerCase().trim();
  return LEDGER_ALIASES[key] ?? key;
}

/**
 * Returns the numeric markup percentage for a given category.
 *
 * @param {string} category - estimate category OR ledger transaction type
 * @param {{ laborPct: number, materialPct: number, categoryConfig?: Record<string,string> }} opts
 *   categoryConfig: row map from markup_category_config (category → markup_mode).
 *   When absent, DEFAULT_CATEGORY_CONFIG is used — callers that haven't loaded
 *   the DB config still get trigger-equivalent behaviour.
 * @returns {number} markup percentage; 0 for flat (pass-through)
 */
export function markupRateForCategory(category, { laborPct, materialPct, categoryConfig }) {
  const key  = normalizeCategoryKey(category);
  const cfg  = categoryConfig ?? DEFAULT_CATEGORY_CONFIG;
  const mode = cfg[key] ?? DEFAULT_CATEGORY_CONFIG[key] ?? 'material_rate';

  if (mode === 'labor_rate')    return Number(laborPct)    || 0;
  if (mode === 'material_rate') return Number(materialPct) || 0;
  return 0; // flat = pass-through (permits, self-performed)
}
