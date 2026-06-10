/**
 * FloorPlanCanvas — proportional SVG floor plan.
 * Wall segments are axis-aligned (longest wall horizontal) before rendering.
 * Rooms are packed left-to-right, wrapping to next row when needed.
 */

const NAVY  = 'var(--navy-900)';
const GOLD  = 'var(--gold-500)';
const CREAM = 'var(--bg)';

const CANVAS_W = 560;
const PAD = 10;

// Rotate wallSegments so the longest wall is horizontal, normalize to (0,0) origin.
// Returns { segs, trueWidth, trueHeight } or null if degenerate.
function processWallSegs(wallSegs) {
  if (!wallSegs || wallSegs.length === 0) return null;
  const withLen = wallSegs.map(s => {
    const dx = s.x2 - s.x1, dz = s.z2 - s.z1;
    return { ...s, len: Math.sqrt(dx * dx + dz * dz) };
  });
  const longest = withLen.reduce((a, b) => b.len > a.len ? b : a);
  // Normalize to [-π/2, π/2] so wall direction doesn't mirror the result
  let angle = Math.atan2(longest.z2 - longest.z1, longest.x2 - longest.x1);
  if (angle > Math.PI / 2) angle -= Math.PI;
  if (angle < -Math.PI / 2) angle += Math.PI;
  const ca = Math.cos(-angle), sa = Math.sin(-angle);
  const rot = (x, z) => [x * ca - z * sa, x * sa + z * ca];
  const rots = withLen.map(s => {
    const [rx1, rz1] = rot(s.x1, s.z1);
    const [rx2, rz2] = rot(s.x2, s.z2);
    return { x1: rx1, z1: rz1, x2: rx2, z2: rz2, len: s.len };
  });
  const allX = rots.flatMap(s => [s.x1, s.x2]);
  const allZ = rots.flatMap(s => [s.z1, s.z2]);
  const minX = Math.min(...allX), minZ = Math.min(...allZ);
  const maxX = Math.max(...allX), maxZ = Math.max(...allZ);
  let segs = rots.map(s => ({
    x1: s.x1 - minX, z1: s.z1 - minZ,
    x2: s.x2 - minX, z2: s.z2 - minZ,
    len: s.len,
  }));
  let tw = maxX - minX, th = maxZ - minZ;
  if (tw < 0.5 || th < 0.5) return null;
  // Portrait → rotate 90° CW to landscape: (x,z) → (z, tw−x)
  if (th > tw) {
    segs = segs.map(s => ({ x1: s.z1, z1: tw - s.x1, x2: s.z2, z2: tw - s.x2, len: s.len }));
    [tw, th] = [th, tw];
  }
  return { segs, trueWidth: tw, trueHeight: th };
}

// World-space layout: rooms have worldX/worldZ offsets (in feet) from the global origin.
// Wall segments are in room-local space; no rotation applied — they're already in world orientation.
function layoutRoomsWorldSpace(rooms) {
  const allX = [], allZ = [];
  rooms.forEach(room => {
    const wx = room.worldX || 0, wz = room.worldZ || 0;
    if (room.wallSegments && room.wallSegments.length > 0) {
      room.wallSegments.forEach(s => { allX.push(wx + s.x1, wx + s.x2); allZ.push(wz + s.z1, wz + s.z2); });
    } else {
      allX.push(wx, wx + (room.length || 10)); allZ.push(wz, wz + (room.width || 10));
    }
  });
  if (!allX.length) return null;

  const minX = Math.min(...allX), maxX = Math.max(...allX);
  const minZ = Math.min(...allZ), maxZ = Math.max(...allZ);
  const trueW = maxX - minX || 1, trueH = maxZ - minZ || 1;
  const scale = Math.min((CANVAS_W - PAD * 2) / trueW, (CANVAS_W - PAD * 2) / trueH, 20);
  const totalH = trueH * scale + PAD * 3 + 20;

  const layout = rooms.map(room => {
    const wx = room.worldX || 0, wz = room.worldZ || 0;
    const ox = PAD + (wx - minX) * scale;
    const oy = PAD + (wz - minZ) * scale;
    let w, h;
    if (room.wallSegments && room.wallSegments.length > 0) {
      const xs = room.wallSegments.flatMap(s => [s.x1, s.x2]);
      const zs = room.wallSegments.flatMap(s => [s.z1, s.z2]);
      w = Math.max((Math.max(...xs) - Math.min(...xs)) * scale, 20);
      h = Math.max((Math.max(...zs) - Math.min(...zs)) * scale, 16);
    } else {
      w = Math.max((room.length || 10) * scale, 20);
      h = Math.max((room.width || 10) * scale, 16);
    }
    return { room, rawSegs: room.wallSegments || null, x: ox, y: oy, w, h };
  });
  return { layout, totalH, scale };
}

function layoutRooms(rooms) {
  const roomData = rooms.map(room => ({ room, proc: processWallSegs(room.wallSegments) }));
  const maxDim = Math.max(
    ...roomData.map(({ room, proc }) =>
      proc ? Math.max(proc.trueWidth, proc.trueHeight) : Math.max(room.length || 1, room.width || 1)
    ), 1
  );
  const scale = Math.min(((CANVAS_W - PAD * 2) * 0.60) / maxDim, 20);

  const layout = [];
  let curX = PAD, curY = PAD, rowH = 0;

  for (const { room, proc } of roomData) {
    const w = Math.max(58, (proc ? proc.trueWidth : (room.length || 10)) * scale);
    const h = Math.max(46, (proc ? proc.trueHeight : (room.width || 10)) * scale);

    if (curX + w > CANVAS_W - PAD && curX > PAD) {
      curY += rowH + PAD;
      curX = PAD;
      rowH = 0;
    }

    layout.push({ room, proc, x: curX, y: curY, w, h });
    curX += w + PAD;
    rowH = Math.max(rowH, h);
  }

  const totalH = curY + rowH + PAD * 3 + 20;
  return { layout, totalH, scale };
}

export default function FloorPlanCanvas({ rooms, highlightLast = false, compact = false }) {
  if (!rooms || rooms.length === 0) return null;

  const worldMode = rooms.some(r => r.worldX !== undefined && r.worldX !== null);
  const layoutResult = worldMode ? layoutRoomsWorldSpace(rooms) : layoutRooms(rooms);
  if (!layoutResult) return null;
  const { layout, totalH, scale } = layoutResult;
  const totalSqft = rooms.reduce((s, r) => s + (r.sqft || 0), 0);
  const lastRoom = highlightLast ? rooms[rooms.length - 1] : null;

  // Scale bar: pick a round number of feet that makes ~40px
  const rawFt = 40 / scale;
  const scaleBarFt = rawFt < 5 ? 5 : rawFt < 10 ? 10 : Math.round(rawFt / 10) * 10;
  const scaleBarPx = scaleBarFt * scale;

  return (
    <div style={{ marginTop: compact ? 6 : 16 }}>
      {!compact && (
        <div style={{
          fontFamily: '"DM Serif Display", serif', fontSize: 15,
          color: NAVY, marginBottom: 8,
        }}>
          Floor Plan
        </div>
      )}
      <svg
        width="100%"
        viewBox={`0 0 ${CANVAS_W} ${totalH}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block', borderRadius: 8, background: CREAM }}
      >
        {layout.map((item, i) => {
          const { room, x, y, w, h } = item;
          const proc = item.proc || null;
          const rawSegs = item.rawSegs || null;
          const isHighlighted = highlightLast && room === lastRoom;
          const fontSize = Math.max(9, Math.min(12, w / 7));
          const stroke = isHighlighted ? GOLD : NAVY;
          const strokeW = isHighlighted ? 2 : 1.5;

          // Centroid of wall endpoints for text placement
          let textCX, textCZ;
          if (worldMode && rawSegs && rawSegs.length > 0) {
            const allPts = rawSegs.flatMap(s => [[s.x1, s.z1], [s.x2, s.z2]]);
            textCX = x + allPts.reduce((a, p) => a + p[0], 0) / allPts.length * scale;
            textCZ = y + allPts.reduce((a, p) => a + p[1], 0) / allPts.length * scale;
          } else if (proc) {
            textCX = x + proc.segs.flatMap(s => [s.x1, s.x2]).reduce((a, v) => a + v, 0) / (proc.segs.length * 2) * scale;
            textCZ = y + proc.segs.flatMap(s => [s.z1, s.z2]).reduce((a, v) => a + v, 0) / (proc.segs.length * 2) * scale;
          } else {
            textCX = x + w / 2;
            textCZ = y + h / 2;
          }

          return (
            <g key={room.name + i}>
              {worldMode && rawSegs && rawSegs.length > 0 ? (
                /* World-space: raw wall segments, no rotation */
                rawSegs.map((seg, si) => (
                  <line
                    key={si}
                    x1={x + seg.x1 * scale} y1={y + seg.z1 * scale}
                    x2={x + seg.x2 * scale} y2={y + seg.z2 * scale}
                    stroke={stroke} strokeWidth={strokeW} strokeLinecap="round"
                  />
                ))
              ) : proc ? (
                /* Single-room mode: rotated wall segments */
                <>
                  {proc.segs.map((seg, si) => (
                    <line
                      key={si}
                      x1={x + seg.x1 * scale} y1={y + seg.z1 * scale}
                      x2={x + seg.x2 * scale} y2={y + seg.z2 * scale}
                      stroke={stroke} strokeWidth={strokeW} strokeLinecap="round"
                    />
                  ))}
                  {proc.segs.filter(seg => seg.len >= 1).map((seg, si) => {
                    const mx = (seg.x1 + seg.x2) / 2 * scale;
                    const mz = (seg.z1 + seg.z2) / 2 * scale;
                    const vx = mx - w / 2, vz = mz - h / 2;
                    const vlen = Math.sqrt(vx * vx + vz * vz) || 1;
                    return (
                      <text key={'d' + si}
                        x={x + mx + (vx / vlen) * 10} y={y + mz + (vz / vlen) * 10}
                        textAnchor="middle" dominantBaseline="middle"
                        fontFamily='"DM Sans", sans-serif' fontSize={8} fill="#555"
                      >
                        {seg.len.toFixed(1)}'
                      </text>
                    );
                  })}
                </>
              ) : (
                /* Fallback: shaded rect for no wall segments */
                <>
                  <rect x={x} y={y} width={w} height={h} rx={4}
                    fill={isHighlighted ? GOLD : NAVY} fillOpacity={isHighlighted ? 0.15 : 0.08} stroke="none" />
                  <rect x={x} y={y} width={w} height={h} rx={4}
                    fill="none" stroke={stroke} strokeWidth={strokeW} />
                </>
              )}
              {/* Room name */}
              <text x={textCX} y={textCZ - (h > 60 ? 8 : 0)}
                textAnchor="middle" dominantBaseline="middle"
                fontFamily='"DM Sans", sans-serif' fontSize={fontSize} fill={NAVY} fontWeight="600"
              >
                {room.name}
              </text>
              {/* sqft — only if room is tall enough */}
              {h > 60 && (
                <text x={textCX} y={textCZ + 10}
                  textAnchor="middle" dominantBaseline="middle"
                  fontFamily='"DM Sans", sans-serif' fontSize={10} fill={GOLD} fontWeight="500"
                >
                  {room.sqft ? `${room.sqft.toLocaleString()} sf`
                    : proc ? `${proc.trueWidth.toFixed(1)}×${proc.trueHeight.toFixed(1)}`
                    : `${(+room.length).toFixed(1)}×${(+room.width).toFixed(1)}`}
                </text>
              )}
            </g>
          );
        })}

        {/* Scale bar */}
        <g transform={`translate(${PAD}, ${totalH - 18})`}>
          <line x1={0} y1={6} x2={scaleBarPx} y2={6} stroke="#bbb" strokeWidth={1.5} />
          <line x1={0} y1={2} x2={0} y2={10} stroke="#bbb" strokeWidth={1.5} />
          <line x1={scaleBarPx} y1={2} x2={scaleBarPx} y2={10} stroke="#bbb" strokeWidth={1.5} />
          <text
            x={scaleBarPx / 2} y={6}
            textAnchor="middle" dy={-7}
            fontFamily='"DM Sans", sans-serif' fontSize={9} fill="#aaa"
          >
            {scaleBarFt} ft
          </text>
        </g>
      </svg>

      {!compact && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
          <div style={{
            background: GOLD, color: '#fff', borderRadius: 20,
            padding: '4px 14px', fontFamily: '"DM Sans", sans-serif',
            fontWeight: 600, fontSize: 13,
          }}>
            {totalSqft.toLocaleString()} sf total
          </div>
          <div style={{ fontSize: 12, color: '#888', fontFamily: '"DM Sans", sans-serif' }}>
            {rooms.length} {rooms.length === 1 ? 'room' : 'rooms'}
          </div>
        </div>
      )}
    </div>
  );
}
