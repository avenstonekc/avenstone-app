/**
 * FLOOR_PLAN_SPLIT — split one room into two along a straight cut line.
 *
 * splitRoomByLine(room, roomPolygon, cutA, cutB, options)
 *   room        — the effective-scan room object (post applyOverridesToScan).
 *                 Used for worldX/worldZ offsets, door/window segments, height,
 *                 floor, type. May be a scanner room, added room, or merged room.
 *   roomPolygon — the room's polygon ring in WORLD-SPACE feet ([[x,z],...]).
 *                 Callers should pass the NORMALIZED polygon (canonical) when
 *                 available; falls back to room.polygon upstream.
 *   cutA, cutB  — two world-space points defining the cut line. The line is
 *                 extended to infinity in both directions, so the user only
 *                 needs two points roughly across the room.
 *   options.openPassage (default true) — when true, the cut edge is OMITTED
 *                 from both halves' wallSegments so no fake wall is drawn at
 *                 the divide (open-plan split, e.g. kitchen/living). The ring
 *                 walker in normalize.js bridges the gap when rebuilding each
 *                 half's polygon, and the Shoelace area stays correct because
 *                 the returned rooms also carry their exact clipped polygon.
 *                 When false, the cut edge becomes a real shared wall segment
 *                 in both halves (classified interior — drawn on the PDF).
 *
 * Returns { ok: true, halves: [roomA, roomB], areas: [sfA, sfB] }
 *      or { ok: false, error }
 *
 * Each half is a scan-shaped room (worldX/worldZ = 0, world-space segments):
 *   { id, name:'', type, source:'split', source_room_id, worldX:0, worldZ:0,
 *     height, floor, polygon, sqft, wallSegments, doorSegments, windowSegments }
 * ready to be appended to layout_overrides.added_rooms (applyOverridesToScan
 * spreads added rooms into the scan verbatim, so the segments flow through
 * normalizeFloorPlan exactly like scanner rooms).
 *
 * Pure module — no supabase import, no React. Mirrors geometryOps.js contract
 * style but operates on the raw-scan/override data model the editor persists.
 */

import polygonClipping from 'polygon-clipping';
import { polygonAreaSqft } from './normalize.js';

const MIN_CUT_LEN_FT = 0.1;   // cut points closer than this are rejected
const MIN_HALF_SQFT = 1;      // a half smaller than this means a bad cut
const CUT_EDGE_TOL_FT = 0.2;  // distance from cut line for "this edge IS the cut"
const COORD_PRECISION = 100;  // round clipped coords to 0.01 ft

function roundCoord(v) {
  return Math.round(v * COORD_PRECISION) / COORD_PRECISION;
}

/** Extend the 2-point cut into a line spanning far beyond the polygon. */
function extendCutLine(cutA, cutB, polygon) {
  const [ax, az] = cutA;
  const [bx, bz] = cutB;
  const len = Math.hypot(bx - ax, bz - az);
  if (len < MIN_CUT_LEN_FT) return null;
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const [x, z] of polygon) {
    if (x < minX) minX = x;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (z > maxZ) maxZ = z;
  }
  const diag = Math.hypot(maxX - minX, maxZ - minZ) || 1;
  const ux = (bx - ax) / len;
  const uz = (bz - az) / len;
  const L = diag * 3;
  return {
    p1: [ax - ux * L, az - uz * L],
    p2: [bx + ux * L, bz + uz * L],
    ux, uz,
  };
}

/** Perpendicular distance from a point to the (infinite) cut line. */
function distToCutLine(px, pz, line) {
  const [ax, az] = line.p1;
  return Math.abs((px - ax) * -line.uz + (pz - az) * line.ux);
}

/** A large rectangle covering one side of the extended cut line. */
function halfPlanePolygon(line, side) {
  const { p1, p2, ux, uz } = line;
  const nx = -uz * side;
  const nz = ux * side;
  const depth = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]); // as deep as the line is long
  return [[
    [p1[0], p1[1]],
    [p2[0], p2[1]],
    [p2[0] + nx * depth, p2[1] + nz * depth],
    [p1[0] + nx * depth, p1[1] + nz * depth],
  ]];
}

/** Extract a single clean open ring from a polygon-clipping result. */
function ringFromClip(result) {
  if (!result || result.length !== 1) return null;
  let ring = result[0][0];
  if (!ring || ring.length < 4) return null;
  ring = ring.slice();
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) ring = ring.slice(0, -1);
  if (ring.length < 3) return null;
  return ring.map(([x, z]) => [roundCoord(x), roundCoord(z)]);
}

/**
 * Signed side of the cut line for a point. Positive = the side halfPlanePolygon
 * covers with side=+1 (half A). Doors/windows sit exactly ON the room boundary,
 * so point-in-polygon is ambiguous for them — side-of-cut-line is not: every
 * wall except the cut itself lies strictly on one side.
 */
function sideOfCutLine(px, pz, line) {
  const [ax, az] = line.p1;
  return (px - ax) * -line.uz + (pz - az) * line.ux;
}

/**
 * Ring edges → wallSegments. Edges lying ON the cut line are always INCLUDED
 * (the ring reconstruction in normalize.js needs a closed segment loop — omitting
 * them collapses the polygon), but when openPassage is on they're flagged
 * `passage: true` so the renderers keep them for geometry and skip drawing them.
 */
function ringToWallSegments(ring, line, openPassage) {
  const segs = [];
  for (let i = 0; i < ring.length; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % ring.length];
    if (Math.hypot(x2 - x1, z2 - z1) < 0.05) continue; // degenerate sliver edge
    const onCut =
      distToCutLine(x1, z1, line) < CUT_EDGE_TOL_FT &&
      distToCutLine(x2, z2, line) < CUT_EDGE_TOL_FT;
    segs.push({ x1, z1, x2, z2, ...(openPassage && onCut ? { passage: true } : {}) });
  }
  return segs;
}

export function splitRoomByLine(room, roomPolygon, cutA, cutB, options = {}) {
  const openPassage = options.openPassage !== false;

  if (!room) return { ok: false, error: 'Room is required' };
  if (!roomPolygon || roomPolygon.length < 3) {
    return { ok: false, error: 'Room has no usable polygon to split' };
  }

  const line = extendCutLine(cutA, cutB, roomPolygon);
  if (!line) return { ok: false, error: 'Cut points are too close together — click two points across the room' };

  let clipA, clipB;
  try {
    clipA = polygonClipping.intersection([roomPolygon], halfPlanePolygon(line, 1));
    clipB = polygonClipping.intersection([roomPolygon], halfPlanePolygon(line, -1));
  } catch (err) {
    return { ok: false, error: `Split failed: ${err?.message || err}` };
  }

  if (!clipA?.length || !clipB?.length) {
    return { ok: false, error: 'The cut line must cross the room' };
  }
  if (clipA.length > 1 || clipB.length > 1) {
    return { ok: false, error: 'That cut would create more than two pieces — draw one straight line across the room' };
  }

  const ringA = ringFromClip(clipA);
  const ringB = ringFromClip(clipB);
  if (!ringA || !ringB) {
    return { ok: false, error: 'The cut produced a degenerate piece — move the cut line' };
  }

  const areaA = polygonAreaSqft(ringA);
  const areaB = polygonAreaSqft(ringB);
  if (areaA < MIN_HALF_SQFT || areaB < MIN_HALF_SQFT) {
    return { ok: false, error: 'One side would be under 1 sqft — move the cut line' };
  }

  // Doors/windows → world-space, assigned by which side of the cut their midpoint
  // falls on (half A = the side clipA covered). A feature sitting exactly ON the
  // cut line lands in half A — harmless either way.
  const wx = room.worldX || 0;
  const wz = room.worldZ || 0;
  const assignSegments = (segs) => {
    const A = [], B = [];
    for (const s of segs || []) {
      const w = { ...s, x1: wx + s.x1, z1: wz + s.z1, x2: wx + s.x2, z2: wz + s.z2 };
      const mx = (w.x1 + w.x2) / 2;
      const mz = (w.z1 + w.z2) / 2;
      (sideOfCutLine(mx, mz, line) >= 0 ? A : B).push(w);
    }
    return [A, B];
  };
  const [doorsA, doorsB] = assignSegments(room.doorSegments);
  const [winsA, winsB] = assignSegments(room.windowSegments);

  const stamp = Date.now();
  const mkHalf = (ring, area, doors, wins, tag) => ({
    id: `split-${tag}-${stamp}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    type: room.type || 'unknown',
    source: 'split',
    source_room_id: room.id ?? null,
    worldX: 0,
    worldZ: 0,
    ...(room.height != null ? { height: room.height } : {}),
    floor: room.floor ?? 0,
    polygon: ring,
    sqft: Math.round(area),
    wallSegments: ringToWallSegments(ring, line, openPassage),
    doorSegments: doors,
    windowSegments: wins,
  });

  return {
    ok: true,
    halves: [
      mkHalf(ringA, areaA, doorsA, winsA, 'a'),
      mkHalf(ringB, areaB, doorsB, winsB, 'b'),
    ],
    areas: [areaA, areaB],
  };
}
