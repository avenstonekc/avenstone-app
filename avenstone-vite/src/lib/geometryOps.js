/**
 * geometryOps.js — pure geometry-operation vocabulary and mutation layer.
 *
 * All operations: (geometry, op) → { ok, error, data }
 * Input geometry is never mutated. Every successful op returns a fresh copy.
 * No network, no DOM, no React. Runs in browser + Deno.
 *
 * @module geometryOps
 */

import {
  snapToGrid,
  polygonCentroid,
  polygonAreaSqft,
  classifyAndStandardizeWalls,
} from './floorPlan/normalize.js';

// ── Op type reference ─────────────────────────────────────────────────────────
/**
 * @typedef {'relabel_room'|'move_corner'|'move_wall'|'add_wall'|'delete_wall'|
 *           'add_opening'|'move_opening'|'delete_opening'|
 *           'split_room'|'merge_rooms'} OpType
 *
 * @typedef {{ op:'relabel_room', room_id:string, name?:string, type?:string }} RelabelRoomOp
 * @typedef {{ op:'move_corner', room_id:string, corner_index:number, to:[number,number] }} MoveCornerOp
 * @typedef {{ op:'move_wall', wall_id:string, delta:[number,number] }} MoveWallOp
 * @typedef {{ op:'add_wall', room_id:string, p1:[number,number], p2:[number,number] }} AddWallOp
 * @typedef {{ op:'delete_wall', wall_id:string }} DeleteWallOp
 * @typedef {{ op:'add_opening', kind:'door'|'window', room_ids:string[], p1:[number,number], p2:[number,number], id?:string, width?:number, height?:number, nx?:number, nz?:number }} AddOpeningOp
 * @typedef {{ op:'move_opening', kind:'door'|'window', opening_id:string, p1:[number,number], p2:[number,number], width?:number }} MoveOpeningOp
 * @typedef {{ op:'delete_opening', kind:'door'|'window', opening_id:string }} DeleteOpeningOp
 * @typedef {{ op:'split_room', room_id:string, cut_p1:[number,number], cut_p2:[number,number], name_a?:string, name_b?:string }} SplitRoomOp
 * @typedef {{ op:'merge_rooms', room_id_a:string, room_id_b:string }} MergeRoomsOp
 * @typedef {RelabelRoomOp|MoveCornerOp|MoveWallOp|AddWallOp|DeleteWallOp|AddOpeningOp|MoveOpeningOp|DeleteOpeningOp|SplitRoomOp|MergeRoomsOp} GeometryOp
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const EPS = 0.05;  // ft — point-coincidence tolerance

// ── Internal helpers ──────────────────────────────────────────────────────────

function clone(g) { return JSON.parse(JSON.stringify(g)); }

function uid(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

function isPolygonValid(polygon) {
  if (!polygon || polygon.length < 3) return false;
  return polygonAreaSqft(polygon) > 0.01;
}

/** Build wall segments from an ordered polygon ring. */
function wallsFromPolygon(polygon, roomId) {
  return polygon.map((p1, i) => ({
    id: `wall_${roomId}_${i}`,
    p1,
    p2: polygon[(i + 1) % polygon.length],
    room_id: roomId,
    thickness: null,
  }));
}

/** Recompute centroid, area_sqft, and wall list for one room. */
function recomputeRoom(g, roomId) {
  const room = g.rooms.find(r => r.id === roomId);
  if (!room) return;
  room.centroid  = polygonCentroid(room.polygon);
  room.area_sqft = Math.round(polygonAreaSqft(room.polygon) * 10) / 10;
  g.walls = [
    ...g.walls.filter(w => w.room_id !== roomId),
    ...wallsFromPolygon(room.polygon, roomId),
  ];
}

/** Re-classify all walls and recompute metadata. */
function recomputeGlobal(g) {
  g.walls = classifyAndStandardizeWalls(g.walls, g.rooms);
  const total = g.rooms.reduce((s, r) => s + r.area_sqft, 0);
  g.metadata.total_area_sqft = Math.round(total * 10) / 10;
  g.metadata.room_count      = g.rooms.length;
}

// ── Line-segment geometry ─────────────────────────────────────────────────────

/**
 * Returns t ∈ [0,1] along segment a→b for its intersection with segment c→d.
 * Returns null if parallel or no intersection within segment bounds.
 */
function segIntersectT(a, b, c, d) {
  const rx = b[0] - a[0], rz = b[1] - a[1];
  const sx = d[0] - c[0], sz = d[1] - c[1];
  const cross = rx * sz - rz * sx;
  if (Math.abs(cross) < 1e-9) return null;
  const t = ((c[0] - a[0]) * sz - (c[1] - a[1]) * sx) / cross;
  const u = ((c[0] - a[0]) * rz - (c[1] - a[1]) * rx) / cross;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return Math.max(0, Math.min(1, t));
}

function lerpPt(a, b, t) {
  return snapToGrid([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
}

/**
 * Find all intersections of cut line (cutP1→cutP2) with polygon edges.
 * Returns [{edgeIndex, tCut, tEdge, pt}] sorted by position along cut.
 */
function polygonCutIntersections(polygon, cutP1, cutP2) {
  const hits = [];
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    const tCut  = segIntersectT(cutP1, cutP2, a, b);
    const tEdge = segIntersectT(a, b, cutP1, cutP2);
    if (tCut === null || tEdge === null) continue;
    hits.push({ edgeIndex: i, tCut, tEdge, pt: lerpPt(a, b, tEdge) });
  }
  hits.sort((a, b) => a.tCut - b.tCut);
  return hits.filter((h, i) => i === 0 || dist(h.pt, hits[i - 1].pt) > EPS);
}

// ── Op handlers ───────────────────────────────────────────────────────────────

function opRelabelRoom(g, op) {
  const room = g.rooms.find(r => r.id === op.room_id);
  if (!room) return { ok: false, error: `room ${op.room_id} not found`, data: null };
  if (op.name !== undefined) room.name = op.name;
  if (op.type !== undefined) room.type = op.type;
  return { ok: true, error: null, data: g };
}

function opMoveCorner(g, op) {
  const room = g.rooms.find(r => r.id === op.room_id);
  if (!room) return { ok: false, error: `room ${op.room_id} not found`, data: null };
  const idx = op.corner_index;
  if (idx < 0 || idx >= room.polygon.length) {
    return { ok: false, error: `corner_index ${idx} out of range (0–${room.polygon.length - 1})`, data: null };
  }
  const oldPt = room.polygon[idx];
  const newPt = snapToGrid(op.to);

  const nextPoly = [...room.polygon];
  nextPoly[idx] = newPt;
  if (!isPolygonValid(nextPoly)) {
    return { ok: false, error: 'move_corner would produce a degenerate polygon', data: null };
  }
  room.polygon = nextPoly;
  recomputeRoom(g, room.id);

  // Propagate to adjacent rooms that share this vertex
  for (const other of g.rooms) {
    if (other.id === room.id) continue;
    if (!other.polygon.some(pt => dist(pt, oldPt) < EPS)) continue;
    const updatedPoly = other.polygon.map(pt => dist(pt, oldPt) < EPS ? newPt : pt);
    if (!isPolygonValid(updatedPoly)) {
      return { ok: false, error: `move_corner would produce a degenerate polygon in adjacent room ${other.id}`, data: null };
    }
    other.polygon = updatedPoly;
    recomputeRoom(g, other.id);
  }

  recomputeGlobal(g);
  return { ok: true, error: null, data: g };
}

function opMoveWall(g, op) {
  const wall = g.walls.find(w => w.id === op.wall_id);
  if (!wall) return { ok: false, error: `wall ${op.wall_id} not found`, data: null };
  const [dx, dz] = op.delta;
  const oldP1 = wall.p1, oldP2 = wall.p2;
  const newP1 = snapToGrid([oldP1[0] + dx, oldP1[1] + dz]);
  const newP2 = snapToGrid([oldP2[0] + dx, oldP2[1] + dz]);

  // Find all rooms whose polygons contain either shifted vertex
  const affected = g.rooms.filter(r =>
    r.polygon.some(pt => dist(pt, oldP1) < EPS || dist(pt, oldP2) < EPS)
  );
  if (affected.length === 0) {
    return { ok: false, error: `wall ${op.wall_id} endpoints not found in any room polygon`, data: null };
  }

  for (const room of affected) {
    const next = room.polygon.map(pt => {
      if (dist(pt, oldP1) < EPS) return newP1;
      if (dist(pt, oldP2) < EPS) return newP2;
      return pt;
    });
    if (!isPolygonValid(next)) {
      return { ok: false, error: `move_wall would produce a degenerate polygon in room ${room.id}`, data: null };
    }
    room.polygon = next;
    recomputeRoom(g, room.id);
  }

  recomputeGlobal(g);
  return { ok: true, error: null, data: g };
}

function opAddWall(g, op) {
  const room = g.rooms.find(r => r.id === op.room_id);
  if (!room) return { ok: false, error: `room ${op.room_id} not found`, data: null };
  const p1 = snapToGrid(op.p1);
  const p2 = snapToGrid(op.p2);
  const idx = room.polygon.findIndex(pt => dist(pt, p1) < EPS);
  if (idx === -1) {
    return { ok: false, error: 'add_wall: p1 must coincide with an existing polygon vertex', data: null };
  }
  const next = [...room.polygon];
  next.splice(idx + 1, 0, p2);
  if (!isPolygonValid(next)) {
    return { ok: false, error: 'add_wall would produce a degenerate polygon', data: null };
  }
  room.polygon = next;
  recomputeRoom(g, room.id);
  recomputeGlobal(g);
  return { ok: true, error: null, data: g };
}

function opDeleteWall(g, op) {
  const wall = g.walls.find(w => w.id === op.wall_id);
  if (!wall) return { ok: false, error: `wall ${op.wall_id} not found`, data: null };
  const room = g.rooms.find(r => r.id === wall.room_id);
  if (!room) return { ok: false, error: `room for wall ${op.wall_id} not found`, data: null };
  const next = room.polygon.filter(pt => dist(pt, wall.p1) >= EPS);
  if (next.length < 3) {
    return { ok: false, error: 'delete_wall would reduce polygon below 3 vertices', data: null };
  }
  if (!isPolygonValid(next)) {
    return { ok: false, error: 'delete_wall would produce a degenerate polygon', data: null };
  }
  room.polygon = next;
  recomputeRoom(g, room.id);
  recomputeGlobal(g);
  return { ok: true, error: null, data: g };
}

function opAddOpening(g, op) {
  const { kind, room_ids } = op;
  const p1  = snapToGrid(op.p1);
  const p2  = snapToGrid(op.p2);
  const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  const w   = op.width ?? dist(p1, p2);

  if (kind === 'door') {
    g.doors.push({
      id: op.id || uid('door'),
      p1, p2, midpoint: mid,
      width: w, height: op.height ?? 7,
      nx: op.nx ?? null, nz: op.nz ?? null,
      room_ids: room_ids || [],
    });
  } else if (kind === 'window') {
    g.windows.push({
      id: op.id || uid('window'),
      p1, p2, midpoint: mid,
      width: w,
      room_id: (room_ids && room_ids[0]) || null,
    });
  } else {
    return { ok: false, error: `add_opening: unknown kind "${kind}"`, data: null };
  }
  return { ok: true, error: null, data: g };
}

function opMoveOpening(g, op) {
  const { kind, opening_id: id } = op;
  const p1  = snapToGrid(op.p1);
  const p2  = snapToGrid(op.p2);
  const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
  const w   = op.width ?? dist(p1, p2);

  if (kind === 'door') {
    const d = g.doors.find(d => d.id === id);
    if (!d) return { ok: false, error: `door ${id} not found`, data: null };
    d.p1 = p1; d.p2 = p2; d.midpoint = mid; d.width = w;
  } else if (kind === 'window') {
    const win = g.windows.find(w => w.id === id);
    if (!win) return { ok: false, error: `window ${id} not found`, data: null };
    win.p1 = p1; win.p2 = p2; win.midpoint = mid; win.width = w;
  } else {
    return { ok: false, error: `move_opening: unknown kind "${kind}"`, data: null };
  }
  return { ok: true, error: null, data: g };
}

function opDeleteOpening(g, op) {
  const { kind, opening_id: id } = op;
  if (kind === 'door') {
    const before = g.doors.length;
    g.doors = g.doors.filter(d => d.id !== id);
    if (g.doors.length === before) return { ok: false, error: `door ${id} not found`, data: null };
  } else if (kind === 'window') {
    const before = g.windows.length;
    g.windows = g.windows.filter(w => w.id !== id);
    if (g.windows.length === before) return { ok: false, error: `window ${id} not found`, data: null };
  } else {
    return { ok: false, error: `delete_opening: unknown kind "${kind}"`, data: null };
  }
  return { ok: true, error: null, data: g };
}

function opSplitRoom(g, op) {
  const room = g.rooms.find(r => r.id === op.room_id);
  if (!room) return { ok: false, error: `room ${op.room_id} not found`, data: null };

  const cutP1 = snapToGrid(op.cut_p1);
  const cutP2 = snapToGrid(op.cut_p2);
  const hits  = polygonCutIntersections(room.polygon, cutP1, cutP2);

  if (hits.length < 2) {
    return { ok: false, error: 'split_room: cut line must intersect the room boundary at exactly 2 points', data: null };
  }
  if (hits.length > 2) {
    return { ok: false, error: 'split_room: cut intersects boundary at more than 2 points — split non-convex room into simpler pieces first', data: null };
  }

  const [hitA, hitB] = hits;
  const poly = room.polygon;
  const n    = poly.length;

  // Sub-polygon A: from hitA.pt, walk forward to hitB.pt, then cut closes it
  const polyA = [hitA.pt];
  let i = (hitA.edgeIndex + 1) % n;
  while (i !== (hitB.edgeIndex + 1) % n) {
    polyA.push(poly[i]);
    i = (i + 1) % n;
  }
  polyA.push(hitB.pt);

  // Sub-polygon B: from hitB.pt, walk forward to hitA.pt, then cut closes it
  const polyB = [hitB.pt];
  let j = (hitB.edgeIndex + 1) % n;
  while (j !== (hitA.edgeIndex + 1) % n) {
    polyB.push(poly[j]);
    j = (j + 1) % n;
  }
  polyB.push(hitA.pt);

  if (!isPolygonValid(polyA) || !isPolygonValid(polyB)) {
    return { ok: false, error: 'split_room: resulting sub-rooms are degenerate', data: null };
  }

  const idA = room.id;
  const idB = uid('room');

  // Update room A in-place
  room.polygon = polyA;
  if (op.name_a) room.name = op.name_a;
  recomputeRoom(g, idA);

  // Create room B
  const roomB = {
    ...JSON.parse(JSON.stringify(room)),
    id:        idB,
    name:      op.name_b || `${room.name} B`,
    polygon:   polyB,
    centroid:  polygonCentroid(polyB),
    area_sqft: Math.round(polygonAreaSqft(polyB) * 10) / 10,
  };
  g.rooms.push(roomB);
  g.walls.push(...wallsFromPolygon(polyB, idB));

  // Reassign openings closer to room B's centroid
  const [bCx, bCz] = roomB.centroid;
  g.doors = g.doors.map(d => {
    if (!d.room_ids.includes(idA)) return d;
    const [mx, mz] = d.midpoint;
    const toA = dist([mx, mz], room.centroid);
    const toB = dist([mx, mz], [bCx, bCz]);
    if (toB < toA) {
      return { ...d, room_ids: [...d.room_ids.filter(id => id !== idA), idB] };
    }
    return d;
  });
  g.windows = g.windows.map(w => {
    if (w.room_id !== idA) return w;
    const toB = dist(w.midpoint, [bCx, bCz]);
    const toA = dist(w.midpoint, room.centroid);
    return toB < toA ? { ...w, room_id: idB } : w;
  });

  recomputeGlobal(g);
  return { ok: true, error: null, data: g };
}

function opMergeRooms(g, op) {
  const roomA = g.rooms.find(r => r.id === op.room_id_a);
  const roomB = g.rooms.find(r => r.id === op.room_id_b);
  if (!roomA) return { ok: false, error: `room ${op.room_id_a} not found`, data: null };
  if (!roomB) return { ok: false, error: `room ${op.room_id_b} not found`, data: null };
  if (roomA.id === roomB.id) return { ok: false, error: 'merge_rooms: room_id_a and room_id_b must differ', data: null };

  const pA = roomA.polygon, pB = roomB.polygon;
  const na = pA.length, nb = pB.length;

  // Map A indices to their matching B index (−1 if unmatched)
  const matchAtoB = pA.map(pa => pB.findIndex(pb => dist(pa, pb) < EPS));
  const sharedCount = matchAtoB.filter(x => x >= 0).length;
  if (sharedCount < 2) {
    return { ok: false, error: 'merge_rooms: rooms share fewer than 2 vertices — not adjacent', data: null };
  }

  // Find start of the shared contiguous segment in A
  let startA = -1;
  for (let k = 0; k < na; k++) {
    if (matchAtoB[k] >= 0 && matchAtoB[(k - 1 + na) % na] < 0) { startA = k; break; }
  }
  if (startA < 0) {
    return { ok: false, error: 'merge_rooms: all vertices shared — degenerate case', data: null };
  }

  // Collect shared indices in A (contiguous run from startA)
  const sharedSeqA = [];
  let cur = startA;
  while (matchAtoB[cur] >= 0) {
    sharedSeqA.push(cur);
    cur = (cur + 1) % na;
    if (cur === startA) break;
  }
  const firstSharedA = sharedSeqA[0];
  const lastSharedA  = sharedSeqA[sharedSeqA.length - 1];
  const firstSharedB = matchAtoB[firstSharedA];
  const lastSharedB  = matchAtoB[lastSharedA];

  // Non-shared A vertices: from (lastSharedA + 1) around to firstSharedA
  const merged = [];
  let ia = (lastSharedA + 1) % na;
  while (ia !== firstSharedA) {
    merged.push(pA[ia]);
    ia = (ia + 1) % na;
  }
  merged.push(pA[firstSharedA]);  // junction: first shared vertex

  // Walk B's non-shared portion from firstSharedB to lastSharedB
  const isSharedInA = (pt) => pA.some(pa => dist(pa, pt) < EPS);
  const walkB = (start, end, forward) => {
    const verts = [];
    let ib = forward ? (start + 1) % nb : (start - 1 + nb) % nb;
    let safety = 0;
    while (ib !== end) {
      verts.push(pB[ib]);
      ib = forward ? (ib + 1) % nb : (ib - 1 + nb) % nb;
      if (++safety > nb + 1) return null;
    }
    return verts;
  };

  const fwd = walkB(firstSharedB, lastSharedB, true);
  const bwd = walkB(firstSharedB, lastSharedB, false);
  const useFwd = fwd && !fwd.some(isSharedInA);
  const bVerts = useFwd ? fwd : (bwd && !bwd.some(isSharedInA)) ? bwd : null;

  if (!bVerts) {
    return { ok: false, error: 'merge_rooms: cannot determine non-shared path through room B', data: null };
  }

  merged.push(...bVerts);
  merged.push(pB[lastSharedB]);  // last shared vertex (= pA[lastSharedA])

  if (!isPolygonValid(merged)) {
    return { ok: false, error: 'merge_rooms: resulting polygon is degenerate', data: null };
  }

  // Update room A
  roomA.polygon = merged;
  recomputeRoom(g, roomA.id);

  // Reassign room B's openings to room A
  g.doors = g.doors.map(d => ({
    ...d,
    room_ids: [...new Set(d.room_ids.map(id => id === roomB.id ? roomA.id : id))],
  }));
  g.windows = g.windows.map(w => w.room_id === roomB.id ? { ...w, room_id: roomA.id } : w);

  // Remove room B and its walls
  g.rooms = g.rooms.filter(r => r.id !== roomB.id);
  g.walls = g.walls.filter(w => w.room_id !== roomB.id);

  recomputeGlobal(g);
  return { ok: true, error: null, data: g };
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

const HANDLERS = {
  relabel_room:   opRelabelRoom,
  move_corner:    opMoveCorner,
  move_wall:      opMoveWall,
  add_wall:       opAddWall,
  delete_wall:    opDeleteWall,
  add_opening:    opAddOpening,
  move_opening:   opMoveOpening,
  delete_opening: opDeleteOpening,
  split_room:     opSplitRoom,
  merge_rooms:    opMergeRooms,
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Apply a single geometry operation.
 * @param {object} geometry  normalized_geometry object (not mutated)
 * @param {GeometryOp} op
 * @returns {{ ok: boolean, error: string|null, data: object|null }}
 */
export function applyOp(geometry, op) {
  if (!geometry || typeof geometry !== 'object') {
    return { ok: false, error: 'geometry is required', data: null };
  }
  if (!op || !op.op) {
    return { ok: false, error: 'op.op is required', data: null };
  }
  const handler = HANDLERS[op.op];
  if (!handler) {
    return { ok: false, error: `unknown op type "${op.op}"`, data: null };
  }
  return handler(clone(geometry), op);
}

/**
 * Apply a sequence of operations atomically.
 * All ops must succeed; on any failure the original geometry is returned unchanged.
 * @param {object} geometry
 * @param {GeometryOp[]} ops
 * @returns {{ ok: boolean, error: string|null, data: object|null }}
 */
export function applyOps(geometry, ops) {
  if (!Array.isArray(ops) || ops.length === 0) {
    return { ok: false, error: 'ops must be a non-empty array', data: null };
  }
  let g = geometry;
  for (let i = 0; i < ops.length; i++) {
    const result = applyOp(g, ops[i]);
    if (!result.ok) {
      return { ok: false, error: `op[${i}] (${ops[i].op}): ${result.error}`, data: null };
    }
    g = result.data;
  }
  return { ok: true, error: null, data: g };
}
