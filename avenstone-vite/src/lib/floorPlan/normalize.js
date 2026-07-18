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

// ─── Wall thickness standards ─────────────────────────────────────────────────
// Construction-standard wall thicknesses, in feet.
// 2x6 exterior = 5.5" actual = 0.458 ft
// 2x4 interior = 3.5" actual = 0.292 ft
const EXTERIOR_WALL_THICKNESS_FT = 5.5 / 12;
const INTERIOR_WALL_THICKNESS_FT = 3.5 / 12;

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

// ─── Wall classification ──────────────────────────────────────────────────────

function isPointOnSegment(p, a, b, tolerance) {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) {
    return Math.hypot(px - ax, py - ay) <= tolerance;
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy) <= tolerance;
}

function isWallOnRoomBoundary(wall, polygon, tolerance) {
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

/**
 * Phase 1 extension: classify walls as exterior or interior based on room adjacency,
 * override thickness to construction standards.
 *
 * A wall is interior if 2+ rooms have it on their polygon boundary.
 * A wall is exterior if only 1 room (or 0) claims it.
 *
 * Returns the walls array with .classification, .adjoining_room_ids,
 * .thickness_ft (standardized), and .thickness_raw_ft (original scanner value).
 *
 * options:
 *   exteriorWallThicknessFt  — default 5.5/12 (2x6)
 *   interiorWallThicknessFt  — default 3.5/12 (2x4)
 *   adjacencyToleranceFt     — default 0.05 ft (~0.6")
 */
export function classifyAndStandardizeWalls(walls, rooms, options = {}) {
  const exteriorThickness = options.exteriorWallThicknessFt ?? EXTERIOR_WALL_THICKNESS_FT;
  const interiorThickness = options.interiorWallThicknessFt ?? INTERIOR_WALL_THICKNESS_FT;
  const adjacencyTolerance = options.adjacencyToleranceFt ?? 0.05;

  return walls.map(wall => {
    const adjoiningRoomIds = rooms
      .filter(room => isWallOnRoomBoundary(wall, room.polygon, adjacencyTolerance))
      .map(r => r.id);

    const classification = adjoiningRoomIds.length >= 2 ? 'interior' : 'exterior';
    const standardThickness = classification === 'interior' ? interiorThickness : exteriorThickness;

    return {
      ...wall,
      classification,
      adjoining_room_ids: adjoiningRoomIds,
      thickness_ft: standardThickness,
      thickness_raw_ft: wall.thickness ?? null,
    };
  });
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

const _RING_SNAP = 0.1;   // matches normalize grid
const _RING_EPS  = 0.05;  // half-cell — after snapping, coincident points are exactly equal

/**
 * Reconstruct a room polygon from wall segments using segment-adjacency boundary
 * tracing. Replaces the old greedy nearest-neighbor chain walk, which produced
 * self-intersecting polygons on concave rooms (L/U-shapes) by bridging chords
 * across the interior when Euclidean distance was ambiguous.
 *
 * Algorithm:
 *  1. Pre-snap all segment endpoints to the 0.1 ft grid (eliminates float noise).
 *  2. Walk by exact connectivity: from the current exit point, find the one unused
 *     segment whose endpoint is within _RING_EPS (= 0.05 ft, half a grid cell).
 *     After snapping, coincident points are exactly equal; distinct ones ≥ 0.1 ft.
 *  3. Genuine-gap fallback: if no exact match exists at a step (real scanner gap),
 *     set needs_review = true and fall back to nearest-neighbor for that step only.
 *     This handles scan defects without blocking normalize (it must never throw).
 *
 * Returns { polygon: [[x,z],...], needs_review: boolean }.
 * Convex rooms: identical output to the old walk (exact matches everywhere).
 * Concave rooms: correct topological ring regardless of shape.
 */
function _wallSegsToPolygon(wallSegs) {
  if (!wallSegs || wallSegs.length === 0) return { polygon: [], needs_review: false };

  // Pre-snap every endpoint to the grid before walking
  const segs = wallSegs.map(s => ({
    x1: Math.round(s.x1 / _RING_SNAP) * _RING_SNAP,
    z1: Math.round(s.z1 / _RING_SNAP) * _RING_SNAP,
    x2: Math.round(s.x2 / _RING_SNAP) * _RING_SNAP,
    z2: Math.round(s.z2 / _RING_SNAP) * _RING_SNAP,
  }));

  if (segs.length === 1) {
    return { polygon: [[segs[0].x1, segs[0].z1], [segs[0].x2, segs[0].z2]], needs_review: false };
  }

  const n = segs.length;
  const used = new Array(n).fill(false);
  let needs_review = false;

  // Exact-match: find unused segment with an endpoint within _RING_EPS of [cx, cz]
  const findNext = (cx, cz) => {
    for (let j = 0; j < n; j++) {
      if (used[j]) continue;
      if (Math.hypot(segs[j].x1 - cx, segs[j].z1 - cz) < _RING_EPS) return { idx: j, flip: false };
      if (Math.hypot(segs[j].x2 - cx, segs[j].z2 - cz) < _RING_EPS) return { idx: j, flip: true };
    }
    return null;
  };

  // Greedy fallback: nearest unused segment (only used on genuine scanner gaps)
  const findNearest = (cx, cz) => {
    let bestIdx = -1, bestDist = Infinity, bestFlip = false;
    for (let j = 0; j < n; j++) {
      if (used[j]) continue;
      const d1 = Math.hypot(segs[j].x1 - cx, segs[j].z1 - cz);
      const d2 = Math.hypot(segs[j].x2 - cx, segs[j].z2 - cz);
      if (d1 < bestDist) { bestDist = d1; bestIdx = j; bestFlip = false; }
      if (d2 < bestDist) { bestDist = d2; bestIdx = j; bestFlip = true; }
    }
    return bestIdx >= 0 ? { idx: bestIdx, flip: bestFlip } : null;
  };

  // Start at segment 0: enter at p1, exit at p2
  used[0] = true;
  const polygon = [[segs[0].x1, segs[0].z1]];
  let cx = segs[0].x2, cz = segs[0].z2;
  let usedCount = 1;

  while (usedCount < n) {
    // Stop if we've closed the ring
    if (Math.hypot(cx - polygon[0][0], cz - polygon[0][1]) < _RING_EPS) break;

    let next = findNext(cx, cz);
    if (!next) {
      // Genuine scanner gap — fall back to nearest for this step only
      needs_review = true;
      next = findNearest(cx, cz);
      if (!next) break;
    }

    used[next.idx] = true;
    usedCount++;
    if (next.flip) {
      polygon.push([segs[next.idx].x2, segs[next.idx].z2]);
      cx = segs[next.idx].x1; cz = segs[next.idx].z1;
    } else {
      polygon.push([segs[next.idx].x1, segs[next.idx].z1]);
      cx = segs[next.idx].x2; cz = segs[next.idx].z2;
    }
  }

  return { polygon, needs_review };
}

// ── Self-intersection detection ───────────────────────────────────────────────

function _sign(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function _properCrossing(a, b, c, d) {
  // Proper crossing: a and b strictly on opposite sides of line cd,
  // AND c and d strictly on opposite sides of line ab.
  const s1 = _sign(c, d, a), s2 = _sign(c, d, b);
  const s3 = _sign(a, b, c), s4 = _sign(a, b, d);
  return ((s1 > 0) !== (s2 > 0)) && ((s3 > 0) !== (s4 > 0));
}

/**
 * Returns true if any pair of non-adjacent edges in the polygon properly cross.
 * Used by the backfill to detect corrupted rings from the old greedy walk.
 * O(n²) — trivial for room-sized polygons (n ≤ ~20).
 * polygon: [[x,z], ...]
 */
export function isPolygonSelfIntersecting(polygon) {
  const n = polygon.length;
  if (n < 4) return false;   // triangles cannot self-intersect
  for (let i = 0; i < n; i++) {
    const a = polygon[i], b = polygon[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;   // adjacent pair sharing vertex 0
      const c = polygon[j], d = polygon[(j + 1) % n];
      if (_properCrossing(a, b, c, d)) return true;
    }
  }
  return false;
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
export function normalizeFloorPlan(rawScan, options = {}) {
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

      // Wall segments → world-space (carry scanner thickness for classification pass)
      const roomWallSegs = (room.wallSegments || []).map((s, i) => ({
        id: `wall_${roomIdx}_${i}`,
        p1: snapToGrid([wx + s.x1, wz + s.z1]),
        p2: snapToGrid([wx + s.x2, wz + s.z2]),
        room_id: roomId,
        thickness: s.thickness ?? null,
        // passage (split-room open-plan divide): kept for ring geometry,
        // skipped by wall STROKE in renderers — no fake wall at the divide
        ...(s.passage ? { passage: true } : {}),
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

      // Fixtures/objects → world-space center, orientation preserved.
      // Coords are room-local feet (same convention as wallSegments); translate by
      // room origin so they share the walls' world frame. rotationY is left as-is —
      // it is a world-XZ heading and rotates with the room during render (pdf.js
      // _processAllRooms transforms it as a direction vector alongside the walls).
      const roomObjects = (room.objects || [])
        .filter(o => o && typeof o.x === 'number' && typeof o.z === 'number')
        .map((o, i) => ({
          id: o.id || `obj_${roomIdx}_${i}`,
          category: o.category || 'unknown',
          center: snapToGrid([wx + o.x, wz + o.z]),
          width: o.width ?? null,
          depth: o.depth ?? null,
          height: o.height ?? null,
          rotationY: typeof o.rotationY === 'number' ? o.rotationY : 0,
          confidence: o.confidence || null,
          room_id: roomId,
        }));

      // Room polygon from wall segments (world-space)
      const wallSegsWorld = (room.wallSegments || []).map(s => ({
        x1: wx + s.x1, z1: wz + s.z1,
        x2: wx + s.x2, z2: wz + s.z2,
      }));
      const { polygon: rawPoly, needs_review: ringNeedsReview } = _wallSegsToPolygon(wallSegsWorld);
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
        ...(roomObjects.length ? { objects: roomObjects } : {}),
        ...(ringNeedsReview ? { needs_review: true } : {}),
      });
    });

    const dedupedDoors = dedupeDoors(allDoors, walls);
    const classifiedWalls = classifyAndStandardizeWalls(walls, rooms, options);
    const totalArea = rooms.reduce((s, r) => s + r.area_sqft, 0);

    return {
      ok: true,
      data: {
        rooms,
        walls: classifiedWalls,
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
