import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { normalizeFloorPlan } from '../../lib/floorPlan/normalize';
import { computeLayoutHints } from '../../lib/floorPlan/layoutCheck';
import { applyOverridesToScan, endpointKey } from '../../lib/floorPlan/applyOverrides';

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
  mode = 'select',
  drawingPolygon = [],
  onDrawingPolygonChange = () => {},
  onPolygonClosed = () => {},
  liveWallEndpointDrag = null,
  onWallEndpointDrag = () => {},
  onWallEndpointMove = () => {},
  mergePreviewPolygon = null,
}) {
  const svgRef = useRef(null);
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const [renderTick, setRenderTick] = useState(0);
  const panningRef = useRef(null);
  const fittedScanRef = useRef(null); // tracks which rawScan we last fit to
  const draggingEndpointRef = useRef(null); // { key, startPos } during wall-move drag

  const forceUpdate = useCallback(() => setRenderTick(t => t + 1), []);

  // Merge layout overrides into scan before normalization
  const effectiveScan = useMemo(
    () => applyOverridesToScan(rawScan, layoutOverrides),
    [rawScan, layoutOverrides],
  );

  // Run Phase 1 + 2 normalization
  const { normalized, hints, error } = useMemo(() => {
    try {
      const normResult = normalizeFloorPlan(effectiveScan);
      if (!normResult.ok) return { error: normResult.error || 'Normalize failed' };
      const layoutResult = computeLayoutHints(normResult.data);
      if (!layoutResult.ok) return { normalized: normResult.data, hints: {}, error: null };
      return { normalized: normResult.data, hints: layoutResult.data.layout_hints, error: null };
    } catch (err) {
      return { error: err?.message || String(err) };
    }
  }, [effectiveScan]);

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

  // Map from endpoint key → { pos, walls[] } for wall-move mode
  const endpointMap = useMemo(() => {
    if (!normalized?.walls) return {};
    const map = {};
    for (const wall of normalized.walls) {
      const k1 = endpointKey(wall.p1);
      const k2 = endpointKey(wall.p2);
      if (!map[k1]) map[k1] = { pos: wall.p1, walls: [] };
      map[k1].walls.push({ wallId: wall.id, which: 'p1' });
      if (!map[k2]) map[k2] = { pos: wall.p2, walls: [] };
      map[k2].walls.push({ wallId: wall.id, which: 'p2' });
    }
    return map;
  }, [normalized]);

  // Fit to content — only when rawScan changes (new plan), not on every override change
  useEffect(() => {
    if (!normalized || fittedScanRef.current === rawScan) return;
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
    fittedScanRef.current = rawScan;
    forceUpdate();
  }, [normalized, bounds, width, height]); // eslint-disable-line react-hooks/exhaustive-deps

  const toScreen = (worldX, worldZ) => ({
    x: worldX * PX_PER_FOOT * zoomRef.current + panRef.current.x,
    y: worldZ * PX_PER_FOOT * zoomRef.current + panRef.current.y,
  });

  const toWorld = (screenX, screenY) => ({
    x: (screenX - panRef.current.x) / (PX_PER_FOOT * zoomRef.current),
    y: (screenY - panRef.current.y) / (PX_PER_FOOT * zoomRef.current),
  });

  const snapToGrid = (x, y, gridFt) => ({
    x: Math.round(x / gridFt) * gridFt,
    y: Math.round(y / gridFt) * gridFt,
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
    if (draggingEndpointRef.current && mode === 'wall-move' && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const world = toWorld(e.clientX - rect.left, e.clientY - rect.top);
      const snapped = snapToGrid(world.x, world.y, 0.5);
      onWallEndpointDrag(draggingEndpointRef.current.key, [snapped.x, snapped.y]);
    }
  };

  const handleMouseUp = (e) => {
    panningRef.current = null;
    if (draggingEndpointRef.current && mode === 'wall-move' && e && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const world = toWorld(e.clientX - rect.left, e.clientY - rect.top);
      const snapped = snapToGrid(world.x, world.y, 0.5);
      onWallEndpointMove(draggingEndpointRef.current.key, [snapped.x, snapped.y]);
      draggingEndpointRef.current = null;
    }
  };

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

  const handleEndpointMouseDown = (e, key, pos) => {
    if (mode !== 'wall-move') return;
    e.stopPropagation();
    e.preventDefault();
    draggingEndpointRef.current = { key, startPos: pos };
    onWallEndpointDrag(key, pos);
  };

  const handleBackgroundClick = (e) => {
    if (mode === 'wall-move') return;
    if (mode === 'add-room') {
      const rect = svgRef.current.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = toWorld(sx, sy);
      const snapped = snapToGrid(world.x, world.y, 0.5);

      // Click near first corner → close polygon
      if (drawingPolygon.length >= 3) {
        const first = drawingPolygon[0];
        const screenFirst = toScreen(first[0], first[1]);
        const distPx = Math.hypot(sx - screenFirst.x, sy - screenFirst.y);
        if (distPx < 14) {
          onPolygonClosed(drawingPolygon);
          return;
        }
      }

      onDrawingPolygonChange([...drawingPolygon, [snapped.x, snapped.y]]);
      return;
    }
    onSelectionChange({ roomIds: [], wallIds: [] });
  };

  const handleRoomClick = (roomId, e) => {
    if (mode === 'add-room') {
      // Forward to background handler so add-room clicks on room fills still place corners
      handleBackgroundClick(e);
      return;
    }
    e.stopPropagation();
    const cur = selection.roomIds || [];
    const next = e.shiftKey
      ? cur.includes(roomId) ? cur.filter(id => id !== roomId) : [...cur, roomId]
      : cur.length === 1 && cur[0] === roomId ? [] : [roomId];
    onSelectionChange({ roomIds: next, wallIds: [] });
  };

  const handleWallClick = (wallId, e) => {
    if (mode === 'add-room') return;
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
        cursor: mode === 'add-room' ? 'crosshair' : mode === 'wall-move' ? 'default' : panningRef.current ? 'grabbing' : 'default',
        userSelect: 'none',
        display: 'block',
        borderRadius: 8,
        border: `1px solid rgba(10,31,68,0.1)`,
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        panningRef.current = null;
        if (draggingEndpointRef.current) {
          onWallEndpointDrag(draggingEndpointRef.current.key, null);
          draggingEndpointRef.current = null;
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
      onClick={handleBackgroundClick}
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

      {/* Merge preview — gold dashed union outline when 2+ rooms are selected */}
      {mergePreviewPolygon && (() => {
        const points = mergePreviewPolygon.map(([x, y]) => {
          const s = toScreen(x, y);
          return `${s.x},${s.y}`;
        }).join(' ');
        return (
          <polygon
            points={points}
            fill="rgba(201,168,76,0.12)"
            stroke={GOLD}
            strokeWidth={2.5}
            strokeDasharray="8 4"
            pointerEvents="none"
          />
        );
      })()}

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

      {/* Add-room mode: in-progress polygon live preview */}
      {mode === 'add-room' && drawingPolygon.length > 0 && (
        <g pointerEvents="none">
          {drawingPolygon.length >= 2 && (
            <polyline
              points={drawingPolygon.map(([x, y]) => {
                const s = toScreen(x, y);
                return `${s.x},${s.y}`;
              }).join(' ')}
              fill="none"
              stroke={GOLD}
              strokeWidth={2}
              strokeDasharray="6 4"
            />
          )}
          {drawingPolygon.length >= 3 && (() => {
            const last = toScreen(
              drawingPolygon[drawingPolygon.length - 1][0],
              drawingPolygon[drawingPolygon.length - 1][1],
            );
            const first = toScreen(drawingPolygon[0][0], drawingPolygon[0][1]);
            return (
              <line
                x1={last.x} y1={last.y}
                x2={first.x} y2={first.y}
                stroke={GOLD}
                strokeWidth={1.5}
                strokeDasharray="3 5"
                opacity={0.5}
              />
            );
          })()}
          {drawingPolygon.map(([x, y], i) => {
            const s = toScreen(x, y);
            return (
              <circle
                key={`corner-${i}`}
                cx={s.x}
                cy={s.y}
                r={i === 0 ? 7 : 4}
                fill={i === 0 ? GOLD : NAVY}
                stroke="#fff"
                strokeWidth={1.5}
              />
            );
          })}
        </g>
      )}

      {/* Ghost walls during endpoint drag (wall-move mode) */}
      {mode === 'wall-move' && liveWallEndpointDrag?.newPos && (() => {
        const { key, newPos } = liveWallEndpointDrag;
        return normalized.walls
          .filter(wall => endpointKey(wall.p1) === key || endpointKey(wall.p2) === key)
          .map(wall => {
            const ep1 = endpointKey(wall.p1) === key ? newPos : wall.p1;
            const ep2 = endpointKey(wall.p2) === key ? newPos : wall.p2;
            const ps1 = toScreen(ep1[0], ep1[1]);
            const ps2 = toScreen(ep2[0], ep2[1]);
            const thicknessPx = (wall.thickness_ft || 0.29) * PX_PER_FOOT * z;
            return (
              <line
                key={`ghost-${wall.id}`}
                x1={ps1.x} y1={ps1.y} x2={ps2.x} y2={ps2.y}
                stroke={GOLD}
                strokeWidth={Math.max(2, thicknessPx)}
                strokeLinecap="butt"
                strokeDasharray="6 4"
                opacity={0.7}
                pointerEvents="none"
              />
            );
          });
      })()}

      {/* Endpoint dots in wall-move mode */}
      {mode === 'wall-move' && Object.entries(endpointMap).map(([key, { pos }]) => {
        const isDragging = liveWallEndpointDrag?.key === key && liveWallEndpointDrag?.newPos;
        const displayPos = isDragging
          ? toScreen(liveWallEndpointDrag.newPos[0], liveWallEndpointDrag.newPos[1])
          : toScreen(pos[0], pos[1]);
        return (
          <circle
            key={`ep-${key}`}
            cx={displayPos.x}
            cy={displayPos.y}
            r={isDragging ? 7 : 5}
            fill={isDragging ? GOLD : 'rgba(10,31,68,0.65)'}
            stroke="#fff"
            strokeWidth={1.5}
            style={{ cursor: 'grab' }}
            onMouseDown={(e) => handleEndpointMouseDown(e, key, pos)}
          />
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
