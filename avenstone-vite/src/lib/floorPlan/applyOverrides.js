/**
 * FLOOR_PLAN_LAYOUT_ARC Phase 5c-2/3/4/5 — Override Applicator
 *
 * Merges floor_plans.layout_overrides into a raw scan before normalization.
 *
 * Override schema:
 *   {
 *     [room_id]: { name?: string },               // per-room patches (5c-2)
 *     added_rooms?: AddedRoom[],                  // manually drawn rooms (5c-3)
 *     wall_endpoint_overrides?: EndpointMoves,    // moved wall endpoints (5c-4)
 *     merged_rooms?: MergedRoom[],                // polygon-union merged rooms (5c-5)
 *     text_annotations?: TextAnnotation[],        // freestanding text labels (5c-7)
 *   }
 *
 * TextAnnotation shape:
 *   { id: string, text: string, x: number, y: number, font_size_pt?: number, rotation?: 0|90 }
 *
 * AddedRoom shape:
 *   { id: string, name: string, polygon: [number,number][], type: string, source: 'manual' }
 *
 * EndpointMoves shape:
 *   { [endpointKey]: [newX, newY] }
 *   where endpointKey = "${Math.round(x*100)}:${Math.round(y*100)}"
 *
 * MergedRoom shape:
 *   { id: string, name: string, polygon: [number,number][], source_room_ids: string[], type: string }
 */

export function endpointKey([x, y]) {
  return `${Math.round(x * 100)}:${Math.round(y * 100)}`;
}

export function applyOverridesToScan(rawScan, overrides) {
  if (!rawScan) return rawScan;
  if (!overrides || Object.keys(overrides).length === 0) return rawScan;

  const cloned = JSON.parse(JSON.stringify(rawScan));

  // Per-room patches (Phase 5c-2 / 5c-8)
  for (const room of cloned.rooms || []) {
    const ov = overrides[room.id];
    if (!ov) continue;
    if (ov.name !== undefined) room.name = ov.name;
    if (ov.sf_visible !== undefined) room.sf_visible = ov.sf_visible;
  }

  // Wall endpoint overrides (Phase 5c-4)
  const endpointMoves = overrides.wall_endpoint_overrides;
  if (endpointMoves && Object.keys(endpointMoves).length > 0) {
    for (const wall of cloned.walls || []) {
      const k1 = endpointKey(wall.p1);
      const k2 = endpointKey(wall.p2);
      if (endpointMoves[k1]) wall.p1 = [...endpointMoves[k1]];
      if (endpointMoves[k2]) wall.p2 = [...endpointMoves[k2]];
    }
    for (const room of cloned.rooms || []) {
      if (!room.polygon) continue;
      room.polygon = room.polygon.map(([x, y]) => {
        const k = endpointKey([x, y]);
        return endpointMoves[k] ? [...endpointMoves[k]] : [x, y];
      });
    }
  }

  // Merged rooms (Phase 5c-5) — applied after wall moves so merges reference final geometry
  if (Array.isArray(overrides.merged_rooms) && overrides.merged_rooms.length > 0) {
    for (const merged of overrides.merged_rooms) {
      const sourceIds = new Set(merged.source_room_ids || []);

      // Identify interior walls (touching only the merge set) BEFORE removing source rooms
      const wallsToRemove = new Set();
      for (const wall of cloned.walls || []) {
        const touchesMergeSet = (cloned.rooms || []).some(
          r => sourceIds.has(r.id) && isWallOnRoomBoundary(wall, r.polygon, 0.05),
        );
        if (!touchesMergeSet) continue;
        const touchesOutside = (cloned.rooms || []).some(
          r => !sourceIds.has(r.id) && isWallOnRoomBoundary(wall, r.polygon, 0.05),
        );
        if (!touchesOutside) wallsToRemove.add(wall.id);
      }

      // Replace source rooms with the merged room
      cloned.rooms = (cloned.rooms || []).filter(r => !sourceIds.has(r.id));
      cloned.rooms.push({
        id: merged.id,
        name: merged.name,
        type: merged.type || 'unknown',
        polygon: merged.polygon,
        source: 'merged',
        source_room_ids: merged.source_room_ids,
      });

      // Remove interior walls
      cloned.walls = (cloned.walls || []).filter(w => !wallsToRemove.has(w.id));

      // Add merged polygon boundary walls that don't already exist
      const existingWallKeys = new Set();
      for (const w of cloned.walls) {
        existingWallKeys.add(`${endpointKey(w.p1)}-${endpointKey(w.p2)}`);
        existingWallKeys.add(`${endpointKey(w.p2)}-${endpointKey(w.p1)}`);
      }
      for (let i = 0; i < merged.polygon.length; i++) {
        const p1 = merged.polygon[i];
        const p2 = merged.polygon[(i + 1) % merged.polygon.length];
        const k = `${endpointKey(p1)}-${endpointKey(p2)}`;
        if (!existingWallKeys.has(k)) {
          cloned.walls.push({
            id: `${merged.id}-wall-${i}`,
            p1: [...p1],
            p2: [...p2],
            source: 'merged',
          });
        }
      }
    }
  }

  // Text annotations (Phase 5c-7) — standalone labels not bound to any room
  if (Array.isArray(overrides.text_annotations)) {
    cloned.text_annotations = overrides.text_annotations.map(t => ({ ...t }));
  } else {
    cloned.text_annotations = cloned.text_annotations || [];
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

function isWallOnRoomBoundary(wall, polygon, tolerance) {
  if (!polygon) return false;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (isPointOnSegment(wall.p1, a, b, tolerance) &&
        isPointOnSegment(wall.p2, a, b, tolerance)) {
      return true;
    }
  }
  return false;
}

function isPointOnSegment(p, a, b, tolerance) {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return Math.hypot(px - ax, py - ay) <= tolerance;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) <= tolerance;
}
