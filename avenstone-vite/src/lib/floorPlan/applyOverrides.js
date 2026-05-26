/**
 * FLOOR_PLAN_LAYOUT_ARC Phase 5c-2/3 — Override Applicator
 *
 * Merges floor_plans.layout_overrides into a raw scan before normalization.
 *
 * Override schema:
 *   {
 *     [room_id]: { name?: string },           // per-room patches (5c-2)
 *     added_rooms?: AddedRoom[],              // manually drawn rooms (5c-3)
 *   }
 *
 * AddedRoom shape:
 *   { id: string, name: string, polygon: [number,number][], type: string, source: 'manual' }
 *
 * Future additions:
 *   - sf_visible: boolean (Phase 5c-4+)
 *   - label_x, label_y: number (Phase 5c-4+)
 *   - deleted: boolean (Phase 5c-6)
 */

export function applyOverridesToScan(rawScan, overrides) {
  if (!rawScan) return rawScan;
  if (!overrides || Object.keys(overrides).length === 0) return rawScan;

  const cloned = JSON.parse(JSON.stringify(rawScan));

  // Per-room patches (Phase 5c-2)
  for (const room of cloned.rooms || []) {
    const ov = overrides[room.id];
    if (!ov) continue;
    if (ov.name !== undefined) room.name = ov.name;
  }

  // Added rooms (Phase 5c-3)
  if (Array.isArray(overrides.added_rooms) && overrides.added_rooms.length > 0) {
    cloned.rooms = [...(cloned.rooms || []), ...overrides.added_rooms];

    // Synthesize wall segments from polygon edges so added rooms render with walls
    // and flow through Phase 1's classifyAndStandardizeWalls.
    cloned.walls = cloned.walls || [];
    for (const addedRoom of overrides.added_rooms) {
      if (!addedRoom.polygon || addedRoom.polygon.length < 3) continue;
      for (let i = 0; i < addedRoom.polygon.length; i++) {
        const p1 = addedRoom.polygon[i];
        const p2 = addedRoom.polygon[(i + 1) % addedRoom.polygon.length];
        cloned.walls.push({
          id: `${addedRoom.id}-wall-${i}`,
          p1,
          p2,
          source: 'manual',
        });
      }
    }
  }

  return cloned;
}
