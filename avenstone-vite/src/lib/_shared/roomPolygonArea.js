// DIVERGENCE GUARD — canonical shoelace area computation for LiDAR room wall segments.
// Import from here. Do NOT reimplement inline. pdf.js and scanArtifact.js both delegate here.
// Any future path that needs room area from raw scan data must also go through this module.

/**
 * Compute true polygon area (sq ft) from wall segments via shoelace.
 * Chain-walks {x1,z1,x2,z2} segments to form a closed polygon ring,
 * then applies the shoelace formula. Same algorithm as the original
 * _polyAreaFromSegs in pdf.js — extracted to prevent further divergence.
 *
 * @param {Array<{x1:number,z1:number,x2:number,z2:number}>} segs
 * @returns {{ ok: boolean, error: string|null, data: number|null }}
 */
export function polyAreaSqftFromSegs(segs) {
  if (!segs || segs.length < 3) {
    return { ok: false, error: `insufficient wall segments (${(segs || []).length} < 3)`, data: null };
  }
  const rem = segs.map(s => ({ x1: s.x1, z1: s.z1, x2: s.x2, z2: s.z2 }));
  const poly = [];
  let cur = rem.shift();
  poly.push({ x: cur.x1, z: cur.z1 });
  let cx = cur.x2, cz = cur.z2;
  while (rem.length > 0) {
    let bi = -1, bd = Infinity, flip = false;
    for (let i = 0; i < rem.length; i++) {
      const d1 = Math.hypot(rem[i].x1 - cx, rem[i].z1 - cz);
      const d2 = Math.hypot(rem[i].x2 - cx, rem[i].z2 - cz);
      if (d1 < bd) { bd = d1; bi = i; flip = false; }
      if (d2 < bd) { bd = d2; bi = i; flip = true; }
    }
    if (bi === -1 || bd > 2.0) break;
    const n = rem.splice(bi, 1)[0];
    if (flip) { poly.push({ x: n.x2, z: n.z2 }); cx = n.x1; cz = n.z1; }
    else      { poly.push({ x: n.x1, z: n.z1 }); cx = n.x2; cz = n.z2; }
  }
  if (poly.length < 3) {
    return { ok: false, error: `degenerate polygon after walk (${poly.length} vertices)`, data: null };
  }
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    area += poly[i].x * poly[j].z - poly[j].x * poly[i].z;
  }
  area = Math.abs(area) / 2;
  return { ok: true, error: null, data: area };
}

/**
 * Convenience wrapper — takes a room object with a .wallSegments array.
 *
 * @param {{ wallSegments?: Array }} room
 * @returns {{ ok: boolean, error: string|null, data: number|null }}
 */
export function roomPolygonAreaSqft(room) {
  return polyAreaSqftFromSegs(room?.wallSegments || []);
}
