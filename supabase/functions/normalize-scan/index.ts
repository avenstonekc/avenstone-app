import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── normalize.js inlined — deploy workflow only uploads index.ts ─────────────

const NORMALIZE_VERSION = 1;
const MERGE_DISTANCE_FT = 0.5;
const NORMAL_DOT_THRESHOLD = Math.cos(25 * Math.PI / 180);
const EXTERIOR_WALL_THICKNESS_FT = 5.5 / 12;
const INTERIOR_WALL_THICKNESS_FT = 3.5 / 12;

function snapToGrid(coord: [number, number], gridSize = 0.1): [number, number] {
  const [x, z] = coord;
  const inv = 1 / gridSize;
  return [Math.round(x * inv) / inv, Math.round(z * inv) / inv];
}

function polygonCentroid(polygon: [number, number][]): [number, number] {
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
    return [
      polygon.reduce((s, p) => s + p[0], 0) / n,
      polygon.reduce((s, p) => s + p[1], 0) / n,
    ];
  }
  const f = 1 / (6 * area);
  return [cx * f, cz * f];
}

function polygonAreaSqft(polygon: [number, number][], units = 'feet'): number {
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

function dedupeDoors(rawDoors: any[], _walls: any[], options: any = {}): any[] {
  if (!rawDoors || rawDoors.length === 0) return [];
  const mergeDist = options.mergeDistanceFt ?? MERGE_DISTANCE_FT;

  const doors = rawDoors.map((d: any) => ({
    ...d,
    room_ids: Array.from(new Set(d.room_ids || [])),
  }));

  const merged: any[] = [];

  for (const door of doors) {
    const [mx, mz] = door.midpoint;
    const hasNormal = typeof door.nx === 'number' && door.nx !== null;

    const candidate = merged.find((k: any) => {
      const [kx, kz] = k.midpoint;
      if (Math.hypot(mx - kx, mz - kz) > mergeDist) return false;
      const kHasNormal = typeof k.nx === 'number' && k.nx !== null;
      if (hasNormal && kHasNormal) {
        const dot = Math.abs(door.nx * k.nx + door.nz * k.nz);
        if (dot < NORMAL_DOT_THRESHOLD) return false;
      }
      return true;
    });

    if (candidate) {
      for (const rid of door.room_ids) {
        if (!candidate.room_ids.includes(rid)) candidate.room_ids.push(rid);
      }
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

function isPointOnSegment(p: number[], a: number[], b: number[], tolerance: number): boolean {
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

function isWallOnRoomBoundary(wall: any, polygon: number[][], tolerance: number): boolean {
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

function classifyAndStandardizeWalls(walls: any[], rooms: any[], options: any = {}): any[] {
  const exteriorThickness = options.exteriorWallThicknessFt ?? EXTERIOR_WALL_THICKNESS_FT;
  const interiorThickness = options.interiorWallThicknessFt ?? INTERIOR_WALL_THICKNESS_FT;
  const adjacencyTolerance = options.adjacencyToleranceFt ?? 0.05;

  return walls.map((wall: any) => {
    const adjoiningRoomIds = rooms
      .filter((room: any) => isWallOnRoomBoundary(wall, room.polygon, adjacencyTolerance))
      .map((r: any) => r.id);

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

const _RING_SNAP = 0.1;
const _RING_EPS  = 0.05;

function _wallSegsToPolygon(wallSegs: any[]): { polygon: [number, number][]; needs_review: boolean } {
  if (!wallSegs || wallSegs.length === 0) return { polygon: [], needs_review: false };

  const segs = wallSegs.map((s: any) => ({
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

  const findNext = (cx: number, cz: number): { idx: number; flip: boolean } | null => {
    for (let j = 0; j < n; j++) {
      if (used[j]) continue;
      if (Math.hypot(segs[j].x1 - cx, segs[j].z1 - cz) < _RING_EPS) return { idx: j, flip: false };
      if (Math.hypot(segs[j].x2 - cx, segs[j].z2 - cz) < _RING_EPS) return { idx: j, flip: true };
    }
    return null;
  };

  const findNearest = (cx: number, cz: number): { idx: number; flip: boolean } | null => {
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

  used[0] = true;
  const polygon: [number, number][] = [[segs[0].x1, segs[0].z1]];
  let cx = segs[0].x2, cz = segs[0].z2;
  let usedCount = 1;

  while (usedCount < n) {
    if (Math.hypot(cx - polygon[0][0], cz - polygon[0][1]) < _RING_EPS) break;
    let next = findNext(cx, cz);
    if (!next) {
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

function normalizeFloorPlan(rawScan: any, options: any = {}): { ok: boolean; data?: any; error?: string } {
  if (!rawScan) return { ok: false, error: 'rawScan is required' };
  if (!Array.isArray(rawScan.rooms)) return { ok: false, error: 'rawScan.rooms must be an array' };

  try {
    const rooms: any[] = [];
    const walls: any[] = [];
    const allDoors: any[] = [];
    const windows: any[] = [];

    rawScan.rooms.forEach((room: any, roomIdx: number) => {
      const wx = room.worldX || 0;
      const wz = room.worldZ || 0;
      const roomId = room.id || `room_${roomIdx}`;

      const roomWallSegs = (room.wallSegments || []).map((s: any, i: number) => ({
        id: `wall_${roomIdx}_${i}`,
        p1: snapToGrid([wx + s.x1, wz + s.z1]),
        p2: snapToGrid([wx + s.x2, wz + s.z2]),
        room_id: roomId,
        thickness: s.thickness ?? null,
      }));
      walls.push(...roomWallSegs);

      (room.doorSegments || []).forEach((s: any, i: number) => {
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

      (room.windowSegments || []).forEach((s: any, i: number) => {
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

      const wallSegsWorld = (room.wallSegments || []).map((s: any) => ({
        x1: wx + s.x1, z1: wz + s.z1,
        x2: wx + s.x2, z2: wz + s.z2,
      }));
      const { polygon: rawPoly, needs_review: ringNeedsReview } = _wallSegsToPolygon(wallSegsWorld);
      const polygon = rawPoly.map((pt: [number, number]) => snapToGrid(pt));
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
        ...(ringNeedsReview ? { needs_review: true } : {}),
      });
    });

    const dedupedDoors = dedupeDoors(allDoors, walls);
    const classifiedWalls = classifyAndStandardizeWalls(walls, rooms, options);
    const totalArea = rooms.reduce((s: number, r: any) => s + r.area_sqft, 0);

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
  } catch (err: any) {
    return { ok: false, error: err.message || String(err) };
  }
}

// ─── Edge function handler ────────────────────────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { scan_id } = await req.json();
    if (!scan_id) {
      return json({ ok: false, error: 'scan_id is required' }, 400);
    }

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: scan, error: fetchErr } = await sb
      .from('job_lidar_scans')
      .select('id, tenant_id, rooms, scanner_version')
      .eq('id', scan_id)
      .single();

    if (fetchErr || !scan) {
      return json({ ok: false, error: fetchErr?.message ?? 'scan not found' }, 404);
    }

    const rawScan = {
      rooms: scan.rooms ?? [],
      scanner_version: scan.scanner_version ?? null,
    };

    const result = normalizeFloorPlan(rawScan);
    if (!result.ok) {
      return json({ ok: false, error: result.error }, 422);
    }

    const { error: updateErr } = await sb
      .from('job_lidar_scans')
      .update({ normalized_geometry: result.data })
      .eq('id', scan.id)
      .eq('tenant_id', scan.tenant_id);

    if (updateErr) {
      return json({ ok: false, error: updateErr.message }, 500);
    }

    return json({ ok: true, error: null, data: result.data });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
