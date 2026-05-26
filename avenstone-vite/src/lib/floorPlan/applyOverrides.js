/**
 * FLOOR_PLAN_LAYOUT_ARC Phase 5c-2 — Override Applicator
 *
 * Merges floor_plans.layout_overrides into a raw scan before normalization.
 * The override object is keyed by room_id; each value is a partial room patch.
 *
 * This is the single source of truth for override merging. Both the canvas
 * (live preview) and the PDF regeneration path import from here so they
 * can never diverge.
 *
 * Override schema (extends with each 5c-* edit move):
 *   { [room_id]: { name?: string } }
 *
 * Future 5c-* additions:
 *   - sf_visible: boolean (Phase 5c-3+)
 *   - label_x, label_y: number (Phase 5c-4+)
 *   - deleted: boolean (Phase 5c-6)
 */

/**
 * applyOverridesToScan(rawScan, overrides)
 *
 * Deep-clones rawScan, applies room-level overrides, returns derived scan.
 * Safe to call with empty or null overrides — returns rawScan unchanged.
 */
export function applyOverridesToScan(rawScan, overrides) {
  if (!rawScan) return rawScan;
  if (!overrides || Object.keys(overrides).length === 0) return rawScan;

  const cloned = JSON.parse(JSON.stringify(rawScan));
  for (const room of cloned.rooms || []) {
    const ov = overrides[room.id];
    if (!ov) continue;
    if (ov.name !== undefined) room.name = ov.name;
    // 5c-3+ extends here: sf_visible, label_x, label_y, label_text, deleted
  }
  return cloned;
}
