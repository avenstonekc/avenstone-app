/**
 * FloorPlanCanvas — proportional SVG floor plan.
 * Uses actual room dimensions (length × width) for scale-accurate relative sizes.
 * Rooms are packed left-to-right, wrapping to next row when needed.
 */

const NAVY = '#0A1F44';
const GOLD = '#C9A84C';
const CREAM = '#F7F5F0';

const CANVAS_W = 560;
const PAD = 10;

function layoutRooms(rooms) {
  const maxDim = Math.max(...rooms.flatMap(r => [r.length || 1, r.width || 1]), 1);
  // Scale so the largest room fills at most 60% of canvas width, capped at 20px/ft
  const scale = Math.min(((CANVAS_W - PAD * 2) * 0.60) / maxDim, 20);

  const layout = [];
  let curX = PAD;
  let curY = PAD;
  let rowH = 0;

  for (const room of rooms) {
    const w = Math.max(58, (room.length || 10) * scale);
    const h = Math.max(46, (room.width || 10) * scale);

    if (curX + w > CANVAS_W - PAD && curX > PAD) {
      curY += rowH + PAD;
      curX = PAD;
      rowH = 0;
    }

    layout.push({ room, x: curX, y: curY, w, h });
    curX += w + PAD;
    rowH = Math.max(rowH, h);
  }

  const totalH = curY + rowH + PAD * 3 + 20; // extra for scale bar
  return { layout, totalH, scale };
}

export default function FloorPlanCanvas({ rooms, highlightLast = false, compact = false }) {
  if (!rooms || rooms.length === 0) return null;

  const { layout, totalH, scale } = layoutRooms(rooms);
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
        {layout.map(({ room, x, y, w, h }, i) => {
          const isHighlighted = highlightLast && room === lastRoom;
          const fontSize = Math.max(9, Math.min(12, w / 7));
          const stroke = isHighlighted ? GOLD : NAVY;
          const strokeW = isHighlighted ? 2 : 1.5;
          const hasWalls = room.wallSegments && room.wallSegments.length > 0;
          return (
            <g key={room.name + i}>
              {/* Background fill */}
              <rect
                x={x} y={y} width={w} height={h} rx={4}
                fill={isHighlighted ? GOLD : NAVY}
                fillOpacity={isHighlighted ? 0.15 : 0.08}
                stroke="none"
              />
              {hasWalls ? (
                /* Draw each wall segment — shows actual room shape including bump-outs */
                room.wallSegments.map((seg, si) => (
                  <line
                    key={si}
                    x1={x + seg.x1 * scale} y1={y + seg.z1 * scale}
                    x2={x + seg.x2 * scale} y2={y + seg.z2 * scale}
                    stroke={stroke} strokeWidth={strokeW} strokeLinecap="round"
                  />
                ))
              ) : (
                /* Fallback rectangle outline for old scan data */
                <rect
                  x={x} y={y} width={w} height={h} rx={4}
                  fill="none" stroke={stroke} strokeWidth={strokeW}
                />
              )}
              {/* Room name */}
              <text
                x={x + w / 2}
                y={y + (h > 60 ? h / 2 - 8 : h / 2)}
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily='"DM Sans", sans-serif'
                fontSize={fontSize}
                fill={NAVY}
                fontWeight="600"
              >
                {room.name}
              </text>
              {/* sqft — only if room is tall enough */}
              {h > 60 && (
                <text
                  x={x + w / 2}
                  y={y + h / 2 + 10}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily='"DM Sans", sans-serif'
                  fontSize={10}
                  fill={GOLD}
                  fontWeight="500"
                >
                  {room.sqft ? `${room.sqft.toLocaleString()} sf` : `${room.length}×${room.width}`}
                </text>
              )}
              {/* Dimension along bottom edge */}
              {w > 80 && h > 50 && (
                <text
                  x={x + w / 2}
                  y={y + h - 5}
                  textAnchor="middle"
                  fontFamily='"DM Sans", sans-serif'
                  fontSize={9}
                  fill="#999"
                >
                  {(+room.length).toFixed(2)} ft
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
