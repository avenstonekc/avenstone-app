/**
 * Normalize a trade string to canonical form matching tenant_playbook_items.work_type.
 * Rule: hyphens directly preceding an uppercase letter expand to " - ".
 *
 *   "Plumbing-Rough-in"   → "Plumbing - Rough-in"
 *   "HVAC-Install"        → "HVAC - Install"
 *   "Drywall-Hang"        → "Drywall - Hang"
 *   "Paint-Interior"      → "Paint - Interior"
 *   "Tile-Floor"          → "Tile - Floor"
 *   "Plumbing - Rough-in" → "Plumbing - Rough-in"  (already canonical, unchanged)
 *   "Demo"                → "Demo"                  (single word, unchanged)
 *
 * This is the single source of truth for trade-string normalization.
 * Import this helper wherever a trade string is written or matched —
 * never inline the same regex elsewhere.
 */
export function canonicalizeTrade(trade) {
  if (!trade || typeof trade !== 'string') return trade;
  return trade
    .replace(/-([A-Z])/g, ' - $1')   // expand hyphen before capital letter
    .replace(/\s{2,}/g, ' ')          // collapse any double-spaces
    .trim();
}
