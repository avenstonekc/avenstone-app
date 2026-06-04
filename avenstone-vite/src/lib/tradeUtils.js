/**
 * Normalize a trade string to canonical form matching tenant_playbook_items.work_type
 * and trade_taxonomy full-path strings.
 *
 * Two-pass normalization:
 *   1. Regex pass — expand hyphens directly preceding an uppercase letter.
 *   2. Alias pass — fold known semantic variants (plurals, common misspellings).
 *
 * Examples:
 *   "Plumbing-Rough-in"   → "Plumbing - Rough-in"
 *   "HVAC-Install"        → "HVAC - Install"
 *   "Drywall-Hang"        → "Drywall - Hang"
 *   "Paint-Interior"      → "Paint - Interior"
 *   "Tile-Floor"          → "Tile - Floor"
 *   "Garage doors"        → "Garage door"          (semantic alias)
 *   "Plumbing - Rough-in" → "Plumbing - Rough-in"  (already canonical)
 *   "Demo"                → "Demo"                  (single word)
 *
 * This is the SINGLE SOURCE OF TRUTH for trade-string normalization.
 * Import this helper wherever a trade string is written or matched —
 * never inline the same logic elsewhere (edge fns inline the same logic
 * and must be kept in sync — see NOTE in each fn that references this file).
 *
 * To add a new alias: append to TRADE_ALIASES below and add the equivalent
 * entry to the inline canonicalizeTrade in supabase/functions/ai-master-agent/index.ts.
 */

// Known semantic variants → canonical trade_taxonomy full-path string.
// Key = post-regex-pass form (so 'Garage-Doors' would be handled by the regex first,
// then the alias map would catch 'Garage - Doors' → never a real case).
// Entries are case-sensitive after the regex pass (which preserves casing).
const TRADE_ALIASES = {
  'Garage doors':  'Garage door',   // trade_taxonomy: parent_trade='Garage door'
};

export function canonicalizeTrade(trade) {
  if (!trade || typeof trade !== 'string') return trade;
  const normalized = trade
    .replace(/-([A-Z])/g, ' - $1')  // expand hyphen before capital letter
    .replace(/\s{2,}/g, ' ')         // collapse double-spaces
    .trim();
  return TRADE_ALIASES[normalized] ?? normalized;
}
