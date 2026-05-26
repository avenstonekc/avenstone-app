import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { normalizeFloorPlan } from '../../lib/floorPlan/normalize';
import { computeLayoutHints } from '../../lib/floorPlan/layoutCheck';

const NAVY = '#0A1F44';
const GOLD = '#C9A84C';
const CREAM = '#F7F5F0';

const PX_PER_FOOT = 24;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 5;
const ZOOM_STEP = 1.12;

export default function FloorPlanCanvas({
  rawScan,
  layoutOverrides = {},
  selection = { roomIds: [], wallIds: [] },
  onSelectionChange = () => {},
  width = 800,
  height = 600,
}) {
  const svgRef = useRef(null);
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const [renderTick, setRenderTick] = useState(0);
  const panningRef = useRef(null);

  const forceUpdate = useCallback(() => setRenderTick(t => t + 1), []);

  // Run Phase 1 + 2 normalization
  const { normalized, hints, error } = useMemo(() => {
    try {
      const normResult = normalizeFloorPlan(rawScan);
      if (!normResult.ok) return { error: normResult.error || 'Normalize failed' };
      const layoutResult = computeLayoutHints(normResult.data);
      if (!layoutResult.ok) return { normalized: normResult.data, hints: {}, error: null };
      return { normalized: normResult.data, hints: layoutResult.data.layout_hints, error: null };
    } catch (err) {
      return { error: err?.message || String(err) };
    }
  }, [rawScan]);

  // Compute world-space bounds
  const bounds = useMemo(() => {
    if (!normalized?.rooms?.length) return { minX: 0, minZ: 0, maxX: 20, maxZ: 20 };
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const room of normalized.rooms) {
      for (const [x, z] of (room.polygon || [])) {
        if (x < minX) minX = x;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (z > maxZ) maxZ = z;
      }
    }
    return { minX, minZ, maxX, maxZ };
  }, [normalized]);

  // Fit to content on first load
  useEffect(() => {
    if (!normalized) return;
    const contentW = (bounds.maxX - bounds.minX) * PX_PER_FOOT;
    const contentH = (bounds.maxZ - bounds.minZ) * PX_PER_FOOT;
    if (contentW <= 0 || contentH <= 0) return;
    const fitZoom = Math.min(width / contentW, height / contentH) * 0.85;
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitZoom));
    zoomRef.current = z;
    panRef.current = {
      x: width / 2 - ((bounds.minX + bounds.maxX) / 2) * PX_PER_FOOT * z,
      y: height / 2 - ((bounds.minZ + bounds.maxZ) / 2) * PX_PER_FOOT * z,
    };
    forceUpdate();
  }, [normalized, bounds, width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  const toScreen = (worldX, worldZ) => ({
    x: worldX * PX_PER_FOOT * zoomRef.current + panRef.current.x,
    y: worldZ * PX_PER_FOOT * zoomRef.current + panRef.current.y,
  });

  // Mouse handlers
  const handleMouseDown = (e) => {
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      panningRef.current = { startX: e.clientX, startY: e.clientY, startPan: { ...panRef.current } };
    }
  };

  const handleMouseMove = (e) => {
    if (panningRef.current) {
      panRef.current = {
        x: panningRef.current.startPan.x + (e.clientX - panningRef.current.startX),
        y: panningRef.current.startPan.y + (e.clientY - panningRef.current.startY),
      };
      forceUpdate();
    }
  };

  const handleMouseUp = () => { panningRef.current = null; };

  // Wheel — passive:false required for preventDefault
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const oldZ = zoomRef.current;
      const worldX = (cx - panRef.current.x) / (PX_PER_FOOT * oldZ);
      const worldZ = (cy - panRef.current.y) / (PX_PER_FOOT * oldZ);
      const newZ = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, oldZ * (e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)));
      zoomRef.current = newZ;
      panRef.current = {
        x: cx - worldX * PX_PER_FOOT * newZ,
        y: cy - worldZ * PX_PER_FOOT * newZ,
      };
      forceUpdate();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [forceUpdate]);

  const handleRoomClick = (roomId, e) => {
    e.stopPropagation();
    const cur = selection.roomIds || [];
    const next = e.shiftKey
      ? cur.includes(roomId) ? cur.filter(id => id !== roomId) : [...cur, roomId]
      : cur.length === 1 && cur[0] === roomId ? [] : [roomId];
    onSelectionChange({ roomIds: next, wallIds: [] });
  };

  const handleWallClick = (wallId, e) => {
    e.stopPropagation();
    const cur = selection.wallIds || [];
    const next = e.shiftKey
      ? cur.includes(wallId) ? cur.filter(id => id !== wallId) : [...cur, wallId]
      : cur.length === 1 && cur[0] === wallId ? [] : [wallId];
    onSelectionChange({ roomIds: [], wallIds: next });
  };

  if (error) {
    return (
      <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center', background: CREAM, color: '#c44', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>
        Floor plan error: {error}
      </div>
    );
  }
  if (!normalized) {
    return (
      <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: 'center', background: CREAM, fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>
        Loading…
      </div>
    );
  }

  const z = zoomRef.current;

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      style={{
        background: CREAM,
        cursor: panningRef.current ? 'grabbing' : 'default',
        userSelect: 'none',
        display: 'block',
        borderRadius: 8,
        border: `1px solid rgba(10,31,68,0.1)`,
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => onSelectionChange({ roomIds: [], wallIds: [] })}
    >
      {/* Room fills */}
      {normalized.rooms.map(room => {
        const isSelected = selection.roomIds?.includes(room.id);
        const points = (room.polygon || []).map(([x, z]) => {
          const s = toScreen(x, z);
          return `${s.x},${s.y}`;
        }).join(' ');
        if (!points) return null;
        return (
          <polygon
            key={room.id}
            points={points}
            fill={isSelected ? 'rgba(201,168,76,0.18)' : 'rgba(247,245,240,0.7)'}
            stroke={isSelected ? GOLD : 'transparent'}
            strokeWidth={isSelected ? 1.5 : 0}
            onClick={(e) => handleRoomClick(room.id, e)}
            style={{ cursor: 'pointer' }}
          />
        );
      })}

      {/* Walls — visible lines + transparent hit area */}
      {normalized.walls.map(wall => {
        const isSelected = selection.wallIds?.includes(wall.id);
        const p1 = toScreen(wall.p1[0], wall.p1[1]);
        const p2 = toScreen(wall.p2[0], wall.p2[1]);
        const thicknessPx = (wall.thickness_ft || 0.29) * PX_PER_FOOT * z;
        const strokeColor = isSelected ? GOLD : NAVY;
        return (
          <g key={wall.id}>
            <line
              x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke={strokeColor}
              strokeWidth={Math.max(2, thicknessPx)}
              strokeLinecap="butt"
              pointerEvents="none"
            />
            {/* Transparent wide hit target */}
            <line
              x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
              stroke="transparent"
              strokeWidth={Math.max(10, thicknessPx + 6)}
              strokeLinecap="butt"
              onClick={(e) => handleWallClick(wall.id, e)}
              style={{ cursor: 'pointer' }}
            />
          </g>
        );
      })}

      {/* Doors — dashed gap lines */}
      {(normalized.doors || []).map(door => {
        const p1 = toScreen(door.p1[0], door.p1[1]);
        const p2 = toScreen(door.p2[0], door.p2[1]);
        return (
          <line
            key={door.id}
            x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
            stroke="#fff"
            strokeWidth={Math.max(3, 0.29 * PX_PER_FOOT * z)}
            strokeDasharray="4 2"
            strokeLinecap="butt"
            pointerEvents="none"
            opacity={0.9}
          />
        );
      })}

      {/* Windows — blue tint lines */}
      {(normalized.windows || []).map(win => {
        const p1 = toScreen(win.p1[0], win.p1[1]);
        const p2 = toScreen(win.p2[0], win.p2[1]);
        return (
          <line
            key={win.id}
            x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
            stroke="#7AA7C7"
            strokeWidth={Math.max(2, 0.29 * PX_PER_FOOT * z)}
            strokeLinecap="butt"
            pointerEvents="none"
          />
        );
      })}

      {/* Labels */}
      {normalized.rooms.map(room => {
        const hint = hints?.[room.id];
        if (!hint) return null;
        const lp = toScreen(hint.label_x, hint.label_y);
        const fontSize = Math.max(9, Math.min(18, (hint.label_font_size || 14) * z * 0.55));
        const rotate = hint.label_rotation === 90 ? `rotate(-90 ${lp.x} ${lp.y})` : undefined;
        return (
          <g key={`lbl_${room.id}`} pointerEvents="none">
            <text
              x={lp.x} y={lp.y}
              fill={NAVY}
              fontSize={fontSize}
              fontWeight={600}
              fontFamily="'DM Sans', sans-serif"
              textAnchor="middle"
              dominantBaseline="middle"
              transform={rotate}
            >
              {hint.label_text}
            </text>
            {hint.sf_text && !hint.sf_inline_with_label && (
              <text
                x={toScreen(hint.sf_x, hint.sf_y).x}
                y={toScreen(hint.sf_x, hint.sf_y).y}
                fill={NAVY}
                fontSize={Math.max(8, fontSize * 0.82)}
                fontFamily="'DM Sans', sans-serif"
                textAnchor="middle"
                dominantBaseline="middle"
                opacity={0.65}
                fontStyle="italic"
                transform={rotate}
              >
                {hint.sf_text}
              </text>
            )}
          </g>
        );
      })}

      {/* Zoom badge */}
      <g pointerEvents="none">
        <rect x={width - 72} y={height - 26} width={64} height={18} rx={4} fill="rgba(10,31,68,0.65)" />
        <text x={width - 40} y={height - 13} fill={CREAM} fontSize={10} textAnchor="middle" dominantBaseline="middle" fontFamily="'DM Sans', sans-serif">
          {Math.round(z * 100)}%
        </text>
      </g>
    </svg>
  );
}
