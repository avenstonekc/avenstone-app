import { useMemo, useState } from 'react';
import { applyEditOverrides } from '../../lib/pdf';

const NAVY   = 'var(--navy-900)';
const GOLD   = 'var(--gold-500)';
const CREAM  = 'var(--bg)';
const BORDER = 'var(--border)';
const FILL = 'rgba(248, 245, 240, 0.7)';

const ROOM_TYPES = [
  'Bedroom', 'Master Bedroom', 'Bathroom', 'Master Bath', 'Half Bath',
  'Kitchen', 'Living Room', 'Dining Room', 'Family Room', 'Hallway',
  'Office', 'Laundry Room', 'Mudroom', 'Pantry', 'Closet',
  'Basement', 'Garage', 'Foyer', 'Sunroom', 'Bonus Room',
];

// Render a scan to SVG-ready polygons. Mirrors what pdf.js does so the
// preview here matches the printed output. We do NOT auto-rotate to longest
// wall — the user is in charge of orientation, that's the whole point.
function renderRooms(scan) {
  const applied = applyEditOverrides(scan);
  const rooms = applied.rooms || [];
  const flat = [];
  rooms.forEach((room, ri) => {
    const wx = room.worldX || 0, wz = room.worldZ || 0;
    (room.wallSegments || []).forEach(s =>
      flat.push({ x1: wx + s.x1, z1: wz + s.z1, x2: wx + s.x2, z2: wz + s.z2, ri, t: 'wall' })
    );
    (room.doorSegments || []).forEach(s =>
      flat.push({ x1: wx + s.x1, z1: wz + s.z1, x2: wx + s.x2, z2: wz + s.z2, ri, t: 'door' })
    );
    (room.windowSegments || []).forEach(s =>
      flat.push({ x1: wx + s.x1, z1: wz + s.z1, x2: wx + s.x2, z2: wz + s.z2, ri, t: 'window' })
    );
    (room.openingSegments || []).forEach(s =>
      flat.push({ x1: wx + s.x1, z1: wz + s.z1, x2: wx + s.x2, z2: wz + s.z2, ri, t: 'opening' })
    );
  });
  if (!flat.length) return { rooms: [], width: 0, height: 0 };

  const xs = flat.flatMap(s => [s.x1, s.x2]);
  const zs = flat.flatMap(s => [s.z1, s.z2]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxZ - minZ, 1);

  // Group walls by room → polygon path. Sort wall endpoints by angle from
  // room centroid so the polygon closes cleanly even with disordered walls.
  const byRoom = rooms.map((room, ri) => {
    const walls = flat.filter(s => s.ri === ri && s.t === 'wall');
    const doors = flat.filter(s => s.ri === ri && s.t === 'door');
    const wins  = flat.filter(s => s.ri === ri && s.t === 'window');
    const opens = flat.filter(s => s.ri === ri && s.t === 'opening');
    const pts = [];
    walls.forEach(w => { pts.push([w.x1, w.z1]); pts.push([w.x2, w.z2]); });
    if (!pts.length) return { name: room.name || `Room ${ri + 1}`, ri, sqft: room.sqft || 0, walls, doors, wins, opens, polyPath: '', cx: 0, cz: 0 };
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const cz = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const sorted = [...new Set(pts.map(p => p.join(',')))]
      .map(s => s.split(',').map(Number))
      .sort((a, b) => Math.atan2(a[1] - cz, a[0] - cx) - Math.atan2(b[1] - cz, b[0] - cx));
    const polyPath = sorted.map(([x, z], i) => `${i === 0 ? 'M' : 'L'} ${x - minX} ${z - minZ}`).join(' ') + ' Z';
    return {
      name: room.name || `Room ${ri + 1}`,
      ri, sqft: room.sqft || 0,
      walls: walls.map(w => ({ x1: w.x1 - minX, z1: w.z1 - minZ, x2: w.x2 - minX, z2: w.z2 - minZ })),
      doors: doors.map(d => ({ x1: d.x1 - minX, z1: d.z1 - minZ, x2: d.x2 - minX, z2: d.z2 - minZ })),
      wins:  wins.map(w => ({ x1: w.x1 - minX, z1: w.z1 - minZ, x2: w.x2 - minX, z2: w.z2 - minZ })),
      opens: opens.map(o => ({ x1: o.x1 - minX, z1: o.z1 - minZ, x2: o.x2 - minX, z2: o.z2 - minZ })),
      polyPath,
      cx: cx - minX, cz: cz - minZ,
    };
  });

  return { rooms: byRoom, width, height };
}

export default function FloorPlanEditor({ rooms: rawRooms, initialOverrides, onSave, onCancel, busy }) {
  const [overrides, setOverrides] = useState(() => initialOverrides || { rotation: 0, mirror: 'none', room_names: {} });
  const [editingIdx, setEditingIdx] = useState(null);
  const [pickerText, setPickerText] = useState('');

  const scanInput = useMemo(() => ({ rooms: rawRooms || [], edit_overrides: overrides }), [rawRooms, overrides]);
  const { rooms: rendered, width, height } = useMemo(() => renderRooms(scanInput), [scanInput]);

  const aspect = width / height || 1;
  // SVG viewport is unit-coords (feet). We render via viewBox so it scales to fit.

  function rotate(delta) {
    setOverrides(o => ({ ...o, rotation: ((o.rotation || 0) + delta + 360) % 360 }));
  }
  function toggleMirror(axis) {
    setOverrides(o => ({ ...o, mirror: o.mirror === axis ? 'none' : axis }));
  }
  function commitName(idx, name) {
    setOverrides(o => ({
      ...o,
      room_names: { ...(o.room_names || {}), [String(idx)]: name },
    }));
    setEditingIdx(null);
    setPickerText('');
  }
  function clearName(idx) {
    setOverrides(o => {
      const next = { ...(o.room_names || {}) };
      delete next[String(idx)];
      return { ...o, room_names: next };
    });
    setEditingIdx(null);
    setPickerText('');
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: CREAM, zIndex: 2100,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        flexShrink: 0, padding: '12px 16px', background: NAVY, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `3px solid ${GOLD}`,
      }}>
        <div>
          <h2 style={{ fontFamily: '"DM Serif Display", serif', fontSize: 18, margin: 0 }}>
            Edit Floor Plan
          </h2>
          <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
            Tap a room to name it · rotate or mirror to set page orientation
          </div>
        </div>
        <button
          onClick={onCancel}
          aria-label="Close"
          style={{
            background: 'transparent', border: '1px solid rgba(255,255,255,0.3)',
            color: '#fff', fontSize: 22, width: 36, height: 36, borderRadius: 8,
            cursor: 'pointer', padding: 0,
          }}
        >×</button>
      </div>

      {/* Toolbar */}
      <div style={{
        flexShrink: 0, padding: '10px 12px', background: '#fff',
        borderBottom: `1px solid ${BORDER}`,
        display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <button onClick={() => rotate(-90)} style={toolBtnStyle}>↺ 90°</button>
        <button onClick={() => rotate(90)}  style={toolBtnStyle}>↻ 90°</button>
        <button onClick={() => toggleMirror('horizontal')} style={{ ...toolBtnStyle, background: overrides.mirror === 'horizontal' ? GOLD : '#fff', color: overrides.mirror === 'horizontal' ? '#fff' : NAVY }}>Flip ⇋</button>
        <button onClick={() => toggleMirror('vertical')}   style={{ ...toolBtnStyle, background: overrides.mirror === 'vertical'   ? GOLD : '#fff', color: overrides.mirror === 'vertical'   ? '#fff' : NAVY }}>Flip ⇅</button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: '#666' }}>Rot: {overrides.rotation || 0}° {overrides.mirror !== 'none' && overrides.mirror ? `· ${overrides.mirror[0].toUpperCase()}-flip` : ''}</span>
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12, background: CREAM, WebkitOverflowScrolling: 'touch' }}>
        {rendered.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#888', padding: 40, fontFamily: '"DM Sans", sans-serif' }}>
            No room geometry to display.
          </div>
        ) : (
          <svg
            viewBox={`-2 -2 ${width + 4} ${height + 4}`}
            preserveAspectRatio="xMidYMid meet"
            style={{
              display: 'block', margin: '0 auto', width: '100%',
              maxHeight: 'calc(100vh - 240px)',
              background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8,
              touchAction: 'manipulation',
            }}
          >
            {rendered.map((r) => {
              const named = !!(overrides.room_names && overrides.room_names[String(r.ri)]);
              return (
                <g key={r.ri}>
                  {r.polyPath && (
                    <path d={r.polyPath} fill={named ? 'rgba(201,168,76,0.15)' : FILL}
                          stroke={named ? GOLD : NAVY} strokeWidth={named ? 0.18 : 0.12} />
                  )}
                  {r.walls.map((w, i) => (
                    <line key={`w${i}`} x1={w.x1} y1={w.z1} x2={w.x2} y2={w.z2}
                          stroke={NAVY} strokeWidth="0.18" strokeLinecap="round" />
                  ))}
                  {r.doors.map((d, i) => (
                    <line key={`d${i}`} x1={d.x1} y1={d.z1} x2={d.x2} y2={d.z2}
                          stroke="#fff" strokeWidth="0.32" strokeLinecap="butt" />
                  ))}
                  {r.wins.map((w, i) => (
                    <line key={`win${i}`} x1={w.x1} y1={w.z1} x2={w.x2} y2={w.z2}
                          stroke="#7AA7C7" strokeWidth="0.20" strokeLinecap="butt" />
                  ))}
                  {/* Tap target — invisible, large, anchored to room polygon */}
                  {r.polyPath && (
                    <path d={r.polyPath} fill="transparent" pointerEvents="all"
                          style={{ cursor: 'pointer' }}
                          onClick={() => { setEditingIdx(r.ri); setPickerText(overrides.room_names?.[String(r.ri)] || r.name || ''); }} />
                  )}
                  {/* Label */}
                  <text x={r.cx} y={r.cz - 0.4} textAnchor="middle"
                        fontFamily='"DM Sans", sans-serif' fontSize="1.6" fontWeight="700"
                        fill={named ? NAVY : '#888'}
                        style={{ pointerEvents: 'none' }}>
                    {r.name}
                  </text>
                  <text x={r.cx} y={r.cz + 1.4} textAnchor="middle"
                        fontFamily='"DM Sans", sans-serif' fontSize="1.1"
                        fill="#999"
                        style={{ pointerEvents: 'none' }}>
                    {r.sqft ? `${r.sqft} sf` : ''}
                  </text>
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* Bottom action */}
      <div style={{
        flexShrink: 0, padding: '12px 16px', background: '#fff',
        borderTop: `1px solid ${BORDER}`,
        display: 'flex', gap: 12,
      }}>
        <button
          onClick={onCancel}
          disabled={busy}
          style={{
            flex: 1, padding: '14px', borderRadius: 10, border: `1.5px solid ${BORDER}`,
            background: '#fff', color: NAVY, fontSize: 15, fontWeight: 600,
            fontFamily: '"DM Sans", sans-serif', cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >Skip — keep raw</button>
        <button
          onClick={() => onSave(overrides)}
          disabled={busy}
          style={{
            flex: 2, padding: '14px', borderRadius: 10, border: 'none',
            background: GOLD, color: '#fff', fontSize: 15, fontWeight: 700,
            fontFamily: '"DM Sans", sans-serif', cursor: busy ? 'not-allowed' : 'pointer',
            boxShadow: '0 2px 8px rgba(201,168,76,0.3)',
          }}
        >{busy ? 'Saving…' : 'Save & Continue'}</button>
      </div>

      {/* Name picker modal */}
      {editingIdx !== null && (
        <div
          onClick={() => { setEditingIdx(null); setPickerText(''); }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(10,31,68,0.5)', zIndex: 2200,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 14, maxWidth: 420, width: '100%',
              padding: '20px 18px', boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
              maxHeight: '85vh', display: 'flex', flexDirection: 'column',
            }}
          >
            <div style={{ fontFamily: '"DM Serif Display", serif', fontSize: 18, color: NAVY, marginBottom: 4 }}>
              Name this room
            </div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>
              Room {editingIdx + 1} · {rendered.find(r => r.ri === editingIdx)?.sqft || 0} sf
            </div>
            <input
              autoFocus
              type="text"
              placeholder="e.g. Master Bath"
              value={pickerText}
              onChange={e => setPickerText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && pickerText.trim()) commitName(editingIdx, pickerText.trim()); }}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '12px 14px', fontSize: 16, borderRadius: 10,
                border: `1.5px solid ${BORDER}`, marginBottom: 14, outline: 'none',
                fontFamily: '"DM Sans", sans-serif',
              }}
            />
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16,
              overflowY: 'auto', flex: 1,
            }}>
              {ROOM_TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => commitName(editingIdx, t)}
                  style={{
                    padding: '8px 12px', borderRadius: 16,
                    border: `1px solid ${BORDER}`, background: CREAM, color: NAVY,
                    fontSize: 13, cursor: 'pointer',
                    fontFamily: '"DM Sans", sans-serif',
                  }}
                >{t}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => clearName(editingIdx)}
                style={{
                  flex: 1, padding: '12px', borderRadius: 10,
                  border: `1.5px solid ${BORDER}`, background: '#fff', color: '#888',
                  fontSize: 14, fontWeight: 500, cursor: 'pointer',
                  fontFamily: '"DM Sans", sans-serif',
                }}
              >Clear</button>
              <button
                onClick={() => pickerText.trim() && commitName(editingIdx, pickerText.trim())}
                disabled={!pickerText.trim()}
                style={{
                  flex: 2, padding: '12px', borderRadius: 10, border: 'none',
                  background: pickerText.trim() ? NAVY : '#ccc',
                  color: '#fff', fontSize: 14, fontWeight: 700,
                  cursor: pickerText.trim() ? 'pointer' : 'not-allowed',
                  fontFamily: '"DM Sans", sans-serif',
                }}
              >Save Name</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const toolBtnStyle = {
  padding: '8px 12px', borderRadius: 8,
  border: `1px solid ${BORDER}`, background: '#fff', color: NAVY,
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
  fontFamily: '"DM Sans", sans-serif',
  minHeight: 36,
};
