/**
 * FLOOR_PLAN_LAYOUT_ARC Phase 1 — Geometry Normalizer
 *
 * Pure-function module. No React, no DOM, no Supabase, zero dependencies.
 * Input:  raw RoomPlan/ARKit scan JSON (the shape lidar.js + pdf.js consume).
 * Output: normalized {rooms, walls, doors, windows, metadata} in world-space feet.
 *
 * Coordinate system: 2D using x (east) and z (north), units = feet.
 * This matches ARKit convention used throughout lidar.js and pdf.js.
 * The spec uses [x,y] notation — treat y as z throughout this module.
 *
 * Phase 2 will add: polylabel for L-shape label placement, layoutCheck rules engine.
 * Phase 4 will add: pdf.js renderer that consumes this output directly.
 */

const NORMALIZE_VERSION = 1;

/**
 * Maximum distance (in feet) between two door midpoints for them to be
 * treated as the same shared doorway. 0.5 ft ≈ 6 inches — tight enough
 * to avoid merging distinct adjacent doors, generous enough to absorb
 * scanner noise in shared wall measurements.
 * Override via options.mergeDistanceFt.
 */
const MERGE_DISTANCE_FT = 0.5;

/**
 * Two normals are "parallel" (same wall, shared doorway) if their angle
 * difference is within 25°. Using absolute dot product handles the common
 * case where adjacent rooms have opposite-facing normals for the same wall.
 * cos(25°) ≈ 0.906
 */
const NORMAL_DOT_THRESHOLD = Math.cos(25 * Math.PI / 180);

// ─── Public helpers ───────────────────────────────────────────────────────────

/**
 * snapToGrid([x, z], gridSize = 0.1)
 * Rounds coordinates to the nearest gridSize to suppress scanner noise.
 * Returns [x, z].
 */
export function snapToGrid(coord, gridSize = 0.1) {
  const [x, z] = coord;
  const inv = 1 / gridSize;
  return [Math.round(x * inv) / inv, Math.round(z * inv) / inv];
}

/**
 * polygonCentroid(polygon)
 * Geometric centroid of a simple polygon using the signed-area formula.
 * polygon: [[x,z], ...]
 * Returns [x, z]. Falls back to arithmetic mean for degenerate polygons.
 */
export function polygonCentroid(polygon) {
  if (!polygon || polygon.length === 0) return [0, 0];
  if (polygon.length === 1) return [polygon[0][0], polygon[0][1]];
  if (polygon.length === 2) {
    return [(polygon[0][0] + polygon[1][0]) / 2, (polygon[0][1] + polygon[1][1]) / 2];
  }
  const n = polygon.length;
  let area = 0, cx = 0, cz = 0;
  for (let i = 0; i < n; i++) {
    const [x0, z0] = polygon[i];
    const [x1, z1] = polygon[(i + 1) % n];
    const cross = x0 * z1 - x1 * z0;
    area += cross;
    cx += (x0 + x1) * cross;
    cz += (z0 + z1) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-10) {
    // Degenerate — fall back to arithmetic mean
    return [
      polygon.reduce((s, p) => s + p[0], 0) / n,
      polygon.reduce((s, p) => s + p[1], 0) / n,
    ];
  }
  const f = 1 / (6 * area);
  return [cx * f, cz * f];
}

/**
 * polygonAreaSqft(polygon, units = 'feet')
 * Shoelace formula. If units='meters', converts to sqft (1 m² = 10.7639 ft²).
 * polygon: [[x,z], ...]
 * Returns area in square feet.
 */
export function polygonAreaSqft(polygon, units = 'feet') {
  if (!polygon || polygon.length < 3) return 0;
  const n = polygon.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x0, z0] = polygon[i];
    const [x1, z1] = polygon[(i + 1) % n];
    area += x0 * z1 - x1 * z0;
  }
  const sqft = Math.abs(area) / 2;
  return units === 'meters' ? sqft * 10.7639 : sqft;
}

// ─── Door dedupe ──────────────────────────────────────────────────────────────

/**
 * dedupeDoors(rawDoors, walls, options)
 *
 * Two doors are merged into one when BOTH conditions hold:
 *   1. Midpoints are within options.mergeDistanceFt of each other (default 0.5 ft).
 *   2. Normal vectors are parallel within 25° — using absolute dot product so
 *      same-direction AND opposite-direction normals both qualify. Adjacent rooms
 *      report opposite-facing normals for the same shared doorway.
 *      Doors without nx/nz skip the normal check (proximity alone triggers merge).
 *
 * On merge: keep the door with the larger width (most metadata wins).
 *           Union room_ids so both rooms see the single shared door.
 *
 * The `walls` param is accepted for API completeness and future collinearity
 * checks — currently unused since the normal-vector check is sufficient.
 *
 * Returns deduped array.
 */
export function dedupeDoors(rawDoors, _walls, options = {}) {
  if (!rawDoors || rawDoors.length === 0) return [];
  const mergeDist = options.mergeDistanceFt ?? MERGE_DISTANCE_FT;

  // Deep-clone room_ids arrays so we mutate safely
  const doors = rawDoors.map(d => ({
    ...d,
    room_ids: Array.from(new Set(d.room_ids || [])),
  }));

  const merged = [];

  for (const door of doors) {
    const [mx, mz] = door.midpoint;
    const hasNormal = typeof door.nx === 'number' && door.nx !== null;

    const candidate = merged.find(k => {
      const [kx, kz] = k.midpoint;
      if (Math.hypot(mx - kx, mz - kz) > mergeDist) return false;
      // Normal check — only when both doors have normals
      const kHasNormal = typeof k.nx === 'number' && k.nx !== null;
      if (hasNormal && kHasNormal) {
        const dot = Math.abs(door.nx * k.nx + door.nz * k.nz);
        if (dot < NORMAL_DOT_THRESHOLD) return false;
      }
      return true;
    });

    if (candidate) {
      // Union room_ids
      for (const rid of door.room_ids) {
        if (!candidate.room_ids.includes(rid)) candidate.room_ids.push(rid);
      }
      // Keep the door with the larger width
      if ((door.width || 0) > (candidate.width || 0)) {
        candidate.width = door.width;
        if (door.height != null) candidate.height = door.height;
        candidate.p1 = door.p1;
        candidate.p2 = door.p2;
        candidate.midpoint = door.midpoint;
      }
    } else {
      merged.push({ ...door, room_ids: [...door.room_ids] });
    }
  }

  return merged;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Reconstruct a room polygon from wall segments via a greedy chain walk.
 * Matches the same algorithm in pdf.js _segsToPolyPoints.
 * Returns [[x,z], ...].
 */
function _wallSegsToPolygon(wallSegs) {
  if (!wallSegs || wallSegs.length === 0) return [];
  if (wallSegs.length === 1) {
    const s = wallSegs[0];
    return [[s.x1, s.z1], [s.x2, s.z2]];
  }
  const rem = wallSegs.map(s => ({ x1: s.x1, z1: s.z1, x2: s.x2, z2: s.z2 }));
  const poly = [];
  let cur = rem.shift();
  poly.push([cur.x1, cur.z1]);
  let cx = cur.x2, cz = cur.z2;

  while (rem.length) {
    let bestIdx = -1, bestDist = Infinity, bestFlip = false;
    for (let i = 0; i < rem.length; i++) {
      const d1 = Math.hypot(rem[i].x1 - cx, rem[i].z1 - cz);
      const d2 = Math.hypot(rem[i].x2 - cx, rem[i].z2 - cz);
      if (d1 < bestDist) { bestDist = d1; bestIdx = i; bestFlip = false; }
      if (d2 < bestDist) { bestDist = d2; bestIdx = i; bestFlip = true; }
    }
    if (bestIdx === -1) break;
    const n = rem.splice(bestIdx, 1)[0];
    if (bestFlip) {
      poly.push([n.x2, n.z2]);
      cx = n.x1; cz = n.z1;
    } else {
      poly.push([n.x1, n.z1]);
      cx = n.x2; cz = n.z2;
    }
  }
  return poly;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * normalizeFloorPlan(rawScan)
 *
 * Input: raw RoomPlan/ARKit scan object. Expected shape:
 *   {
 *     rooms: [{
 *       id?: string,
 *       name: string,
 *       type?: string,
 *       worldX: number,       // ARKit world origin of this room, in feet
 *       worldZ: number,
 *       height?: number,      // ceiling height in feet
 *       floor?: number,       // 0-indexed floor number
 *       wallSegments:   [{x1,z1,x2,z2}],           // room-local coords
 *       doorSegments:   [{x1,z1,x2,z2,nx,nz,width,id?}],
 *       windowSegments: [{x1,z1,x2,z2,id?}],
 *       openingSegments?: [{x1,z1,x2,z2}],
 *     }],
 *     scanner_version?: string,
 *   }
 *
 * Output: { ok: true, data: { rooms, walls, doors, windows, metadata } }
 *      or { ok: false, error: string }
 *
 * All output coordinates are world-space (feet), snapped to 0.1 ft grid.
 */
export function normalizeFloorPlan(rawScan) {
  if (!rawScan) return { ok: false, error: 'rawScan is required' };
  if (!Array.isArray(rawScan.rooms)) return { ok: false, error: 'rawScan.rooms must be an array' };

  try {
    const rooms = [];
    const walls = [];
    const allDoors = [];
    const windows = [];

    rawScan.rooms.forEach((room, roomIdx) => {
      const wx = room.worldX || 0;
      const wz = room.worldZ || 0;
      const roomId = room.id || `room_${roomIdx}`;

      // Wall segments → world-space
      const roomWallSegs = (room.wallSegments || []).map((s, i) => ({
        id: `wall_${roomIdx}_${i}`,
        p1: snapToGrid([wx + s.x1, wz + s.z1]),
        p2: snapToGrid([wx + s.x2, wz + s.z2]),
        room_id: roomId,
      }));
      walls.push(...roomWallSegs);

      // Door segments → world-space, keep normal + room attribution
      (room.doorSegments || []).forEach((s, i) => {
        const p1 = snapToGrid([wx + s.x1, wz + s.z1]);
        const p2 = snapToGrid([wx + s.x2, wz + s.z2]);
        allDoors.push({
          id: s.id || `door_${roomIdx}_${i}`,
          p1, p2,
          midpoint: [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2],
          width: s.width || Math.hypot(p2[0] - p1[0], p2[1] - p1[1]),
          height: s.height ?? room.height ?? 7,
          nx: typeof s.nx === 'number' ? s.nx : null,
          nz: typeof s.nz === 'number' ? s.nz : null,
          room_ids: [roomId],
        });
      });

      // Window segments → world-space
      (room.windowSegments || []).forEach((s, i) => {
        const p1 = snapToGrid([wx + s.x1, wz + s.z1]);
        const p2 = snapToGrid([wx + s.x2, wz + s.z2]);
        windows.push({
          id: s.id || `window_${roomIdx}_${i}`,
          p1, p2,
          midpoint: [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2],
          width: s.width || Math.hypot(p2[0] - p1[0], p2[1] - p1[1]),
          room_id: roomId,
        });
      });

      // Room polygon from wall segments (world-space)
      const wallSegsWorld = (room.wallSegments || []).map(s => ({
        x1: wx + s.x1, z1: wz + s.z1,
        x2: wx + s.x2, z2: wz + s.z2,
      }));
      const rawPoly = _wallSegsToPolygon(wallSegsWorld);
      const polygon = rawPoly.map(pt => snapToGrid(pt));
      const centroid = polygonCentroid(polygon);
      const areaSqft = polygonAreaSqft(polygon);

      rooms.push({
        id: roomId,
        name: room.name || `Room ${roomIdx + 1}`,
        type: room.type || null,
        polygon,
        centroid,
        area_sqft: Math.round(areaSqft * 10) / 10,
        worldX: wx,
        worldZ: wz,
        height: room.height ?? null,
        floor: room.floor ?? 0,
      });
    });

    const dedupedDoors = dedupeDoors(allDoors, walls);
    const totalArea = rooms.reduce((s, r) => s + r.area_sqft, 0);

    return {
      ok: true,
      data: {
        rooms,
        walls,
        doors: dedupedDoors,
        windows,
        metadata: {
          scanner_version: rawScan.scanner_version || null,
          total_area_sqft: Math.round(totalArea * 10) / 10,
          room_count: rooms.length,
          normalize_version: NORMALIZE_VERSION,
        },
      },
    };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

/*
 * ─── Verification examples (no test runner in project) ───────────────────────
 *
 * Example 1 — 2-room shared doorway (Kitchen + Hallway)
 *
 * Input:
 *   rooms: [
 *     { id:'r1', name:'Kitchen', worldX:0, worldZ:0,
 *       wallSegments: [{x1:0,z1:0,x2:10,z2:0},{x1:10,z1:0,x2:10,z2:10},{x1:10,z1:10,x2:0,z2:10},{x1:0,z1:10,x2:0,z2:0}],
 *       doorSegments: [{x1:10,z1:2,x2:10,z2:5,nx:1,nz:0,width:3}] },
 *     { id:'r2', name:'Hallway', worldX:10, worldZ:0,
 *       wallSegments: [{x1:0,z1:0,x2:5,z2:0},{x1:5,z1:0,x2:5,z2:5},{x1:5,z1:5,x2:0,z2:5},{x1:0,z1:5,x2:0,z2:0}],
 *       doorSegments: [{x1:0,z1:2,x2:0,z2:5,nx:-1,nz:0,width:3}] }
 *   ]
 *
 * Expected output:
 *   rooms: [ {id:'r1', name:'Kitchen', area_sqft:100, ...}, {id:'r2', name:'Hallway', area_sqft:25, ...} ]
 *   doors: [ { id:'door_0_0', midpoint:[10,3.5], width:3, room_ids:['r1','r2'] } ]  ← 1 door, both rooms
 *
 * Example 2 — Exterior door (only one room sees it)
 *
 * Input: same Kitchen but doorSegments point outward to exterior (no second room has a matching door)
 * Expected output: doors[0].room_ids = ['r1']  ← 1 room, not deduped
 *
 * Example 3 — Two far-apart doors on the same wall
 *
 * Two doors on wall x=10, midpoints at z=2 and z=8 (6 ft apart > MERGE_DISTANCE_FT=0.5)
 * Expected output: 2 doors kept, neither merged
 *
 * To run as a quick smoke test:
 *   node --input-type=module avenstone-vite/src/lib/floorPlan/_smoke.mjs
 *   (see README.md for the smoke script content)
 */
