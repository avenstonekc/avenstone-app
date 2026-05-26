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
  onTextAnnotationsChange = () => {},
  buildState = null,
  onBuildAnchorPlaced = () => {},
  onLabelMove = () => {},
}) {
  const svgRef = useRef(null);
  const panRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(1);
  const [renderTick, setRenderTick] = useState(0);
  const panningRef = useRef(null);
  const fittedScanRef = useRef(null); // tracks which rawScan we last fit to
  const draggingEndpointRef = useRef(null); // { key, startPos } during wall-move drag
  const [annotationDragState, setAnnotationDragState] = useState(null); // { id, x, y } live position
  const [labelDragState, setLabelDragState] = useState(null); // { roomId, x, y } live position
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [showHint, setShowHint] = useState(false);

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

  // ── Nav helpers ──────────────────────────────────────────────────────────
  function fitToContent() {
    if (!normalized || !bounds) return;
    const contentW = (bounds.maxX - bounds.minX) * PX_PER_FOOT;
    const contentH = (bounds.maxZ - bounds.minZ) * PX_PER_FOOT;
    if (contentW <= 0 || contentH <= 0) return;
    const fitZoom = Math.min(width / contentW, height / contentH) * 0.85;
    const fz = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitZoom));
    zoomRef.current = fz;
    panRef.current = {
      x: width / 2 - ((bounds.minX + bounds.maxX) / 2) * PX_PER_FOOT * fz,
      y: height / 2 - ((bounds.minZ + bounds.maxZ) / 2) * PX_PER_FOOT * fz,
    };
    forceUpdate();
  }

  function zoomBy(factor) {
    const newZ = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current * factor));
    const cx = width / 2;
    const cy = height / 2;
    const worldX = (cx - panRef.current.x) / (PX_PER_FOOT * zoomRef.current);
    const worldZ = (cy - panRef.current.y) / (PX_PER_FOOT * zoomRef.current);
    zoomRef.current = newZ;
    panRef.current = {
      x: cx - worldX * PX_PER_FOOT * newZ,
      y: cy - worldZ * PX_PER_FOOT * newZ,
    };
    forceUpdate();
  }

  // Space-held pan modifier (Figma/Sketch convention)
  useEffect(() => {
    const onDown = (e) => {
      if (e.code !== 'Space') return;
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      e.preventDefault();
      setSpaceHeld(true);
    };
    const onUp = (e) => { if (e.code === 'Space') setSpaceHeld(false); };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, []);

  // Keyboard shortcuts: +/− zoom, F fit, arrow keys pan
  useEffect(() => {
    const PAN_STEP_PX = 50;
    const onKey = (e) => {
      const tag = document.activeElement?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault(); zoomBy(ZOOM_STEP);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault(); zoomBy(1 / ZOOM_STEP);
      } else if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault(); fitToContent();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault(); panRef.current = { ...panRef.current, y: panRef.current.y + PAN_STEP_PX }; forceUpdate();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault(); panRef.current = { ...panRef.current, y: panRef.current.y - PAN_STEP_PX }; forceUpdate();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault(); panRef.current = { ...panRef.current, x: panRef.current.x + PAN_STEP_PX }; forceUpdate();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault(); panRef.current = { ...panRef.current, x: panRef.current.x - PAN_STEP_PX }; forceUpdate();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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

  // Snap helper: nearest wall midpoint within threshold ft (Phase 5c-4 part 2)
  // Skips walls that have the dragged endpoint as one of their endpoints.
  const snapToNearestWallMidpoint = (target, draggedKey, walls, threshold) => {
    let best = null;
    let bestDist = threshold;
    for (const wall of walls) {
      const k1 = endpointKey(wall.p1);
      const k2 = endpointKey(wall.p2);
      if (k1 === draggedKey || k2 === draggedKey) continue;
      const mx = (wall.p1[0] + wall.p2[0]) / 2;
      const my = (wall.p1[1] + wall.p2[1]) / 2;
      const dist = Math.hypot(mx - target.x, my - target.y);
      if (dist < bestDist) {
        best = { x: mx, y: my, wallId: wall.id };
        bestDist = dist;
      }
    }
    return best; // null if no snap, { x, y, wallId } if snapped
  };

  // Snap helper: axis alignment to original endpoint's H/V axis (Phase 5c-4 part 2)
  // Strong horizontal: Y deviation < threshold AND X movement significant → lock Y to original
  // Strong vertical: X deviation < threshold AND Y movement significant → lock X to original
  const snapToAxisAlignment = (target, origPoint, threshold) => {
    const dx = Math.abs(target.x - origPoint[0]);
    const dy = Math.abs(target.y - origPoint[1]);
    if (dy < threshold && dx > threshold * 2) {
      return { x: target.x, y: origPoint[1], snapped: 'horizontal' };
    }
    if (dx < threshold && dy > threshold * 2) {
      return { x: origPoint[0], y: target.y, snapped: 'vertical' };
    }
    return null;
  };

  // Mouse handlers
  const handleMouseDown = (e) => {
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      panningRef.current = { startX: e.clientX, startY: e.clientY, startPan: { ...panRef.current } };
      return;
    }
    if (e.button === 0 && spaceHeld) {
      e.preventDefault();
      panningRef.current = { startX: e.clientX, startY: e.clientY, startPan: { ...panRef.current } };
      return;
    }
  };

  // Shared helper: apply axis constraint + all snaps to a world position during drag
  // (Phase 5c-4 part 2: added altKey perpendicular, midpoint snap, axis-alignment snap)
  const applyDragConstraints = (worldX, worldY, shiftKey, altKey = false) => {
    const drag = draggingEndpointRef.current;

    // Step 1: Apply Shift axis constraint (Shift = parallel, Alt+Shift = perpendicular to wall)
    let constrained = { x: worldX, y: worldY };
    if (shiftKey && drag?.connectedDirs?.length > 0) {
      const dirs = drag.connectedDirs;
      const longest = dirs.reduce((best, d) => {
        const len = Math.hypot(d[0], d[1]);
        return len > best.len ? { d, len } : best;
      }, { d: dirs[0], len: 0 });
      if (longest.len > 0) {
        let dirX = longest.d[0] / longest.len;
        let dirY = longest.d[1] / longest.len;
        if (altKey) {
          // Rotate 90° → perpendicular to wall axis
          const tmp = dirX;
          dirX = -dirY;
          dirY = tmp;
        }
        const cdx = worldX - drag.startPos[0];
        const cdy = worldY - drag.startPos[1];
        const proj = cdx * dirX + cdy * dirY;
        constrained = { x: drag.startPos[0] + proj * dirX, y: drag.startPos[1] + proj * dirY };
      }
    }

    // Step 2: Grid snap
    let snapped = snapToGrid(constrained.x, constrained.y, 0.5);

    // Step 3: Endpoint snap — highest priority (6" radius)
    for (const [k, ep] of Object.entries(endpointMap)) {
      if (drag && k === drag.key) continue;
      if (Math.hypot(ep.pos[0] - snapped.x, ep.pos[1] - snapped.y) < 0.5) {
        return [ep.pos[0], ep.pos[1]];
      }
    }

    // Step 4: Wall midpoint snap — second priority (Phase 5c-4 part 2)
    const midSnap = snapToNearestWallMidpoint(
      { x: snapped.x, y: snapped.y },
      drag?.key || '',
      normalized?.walls || [],
      0.5,
    );
    if (midSnap) return [midSnap.x, midSnap.y];

    // Step 5: Axis alignment snap — only when not shift-constrained (Phase 5c-4 part 2)
    if (!shiftKey && drag?.startPos) {
      const axisSnap = snapToAxisAlignment({ x: snapped.x, y: snapped.y }, drag.startPos, 0.5);
      if (axisSnap) return [axisSnap.x, axisSnap.y];
    }

    return [snapped.x, snapped.y];
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
      const pos = applyDragConstraints(world.x, world.y, e.shiftKey, e.altKey);
      onWallEndpointDrag(draggingEndpointRef.current.key, pos);
    }
  };

  const handleMouseUp = (e) => {
    panningRef.current = null;
    if (draggingEndpointRef.current && mode === 'wall-move' && e && svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const world = toWorld(e.clientX - rect.left, e.clientY - rect.top);
      const pos = applyDragConstraints(world.x, world.y, e.shiftKey, e.altKey);
      onWallEndpointMove(draggingEndpointRef.current.key, pos);
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
    // Collect axis directions of connected walls for shift-constrain
    const connectedDirs = [];
    for (const wall of normalized.walls) {
      const k1 = endpointKey(wall.p1);
      const k2 = endpointKey(wall.p2);
      if (k1 === key) connectedDirs.push([wall.p2[0] - wall.p1[0], wall.p2[1] - wall.p1[1]]);
      else if (k2 === key) connectedDirs.push([wall.p1[0] - wall.p2[0], wall.p1[1] - wall.p2[1]]);
    }
    draggingEndpointRef.current = { key, startPos: pos, connectedDirs };
    onWallEndpointDrag(key, pos);
  };

  const handleAnnotationMouseDown = (e, ann) => {
    if (mode !== 'select') return;
    e.stopPropagation();
    e.preventDefault();
    const rect = svgRef.current.getBoundingClientRect();
    const startScreenX = e.clientX - rect.left;
    const startScreenY = e.clientY - rect.top;
    const startAnnX = ann.x;
    const startAnnY = ann.y;
    onSelectionChange({ roomIds: [], wallIds: [], annotationIds: [ann.id] });
    const onMove = (ev) => {
      const dx = (ev.clientX - rect.left - startScreenX) / (PX_PER_FOOT * zoomRef.current);
      const dy = (ev.clientY - rect.top - startScreenY) / (PX_PER_FOOT * zoomRef.current);
      setAnnotationDragState({ id: ann.id, x: startAnnX + dx, y: startAnnY + dy });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setAnnotationDragState(current => {
        if (current) onTextAnnotationsChange({ kind: 'move', id: current.id, x: current.x, y: current.y });
        return null;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleAnnotationDoubleClick = (e, ann) => {
    e.stopPropagation();
    onTextAnnotationsChange({ kind: 'edit_request', id: ann.id });
  };

  const handleLabelMouseDown = (e, room, effectiveLabelX, effectiveLabelY) => {
    if (mode !== 'select') return;
    e.stopPropagation();
    e.preventDefault();
    const rect = svgRef.current.getBoundingClientRect();
    const startScreenX = e.clientX - rect.left;
    const startScreenY = e.clientY - rect.top;
    let moved = false;
    const onMove = (ev) => {
      const dx = (ev.clientX - rect.left - startScreenX) / (PX_PER_FOOT * zoomRef.current);
      const dy = (ev.clientY - rect.top - startScreenY) / (PX_PER_FOOT * zoomRef.current);
      const snappedX = Math.round((effectiveLabelX + dx) / 0.5) * 0.5;
      const snappedY = Math.round((effectiveLabelY + dy) / 0.5) * 0.5;
      if (!moved && (Math.abs(snappedX - effectiveLabelX) > 0.01 || Math.abs(snappedY - effectiveLabelY) > 0.01)) {
        moved = true;
      }
      if (moved) setLabelDragState({ roomId: room.id, x: snappedX, y: snappedY });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setLabelDragState(current => {
        if (current && moved) onLabelMove({ roomId: current.roomId, x: current.x, y: current.y });
        return null;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleBackgroundClick = (e) => {
    if (mode === 'wall-move') return;
    if (mode === 'build-walls') {
      if (!buildState) {
        // Place the first anchor, snapping to grid + existing endpoints
        const rect = svgRef.current.getBoundingClientRect();
        const world = toWorld(e.clientX - rect.left, e.clientY - rect.top);
        const snapped = snapToGrid(world.x, world.y, 0.5);
        let finalX = snapped.x, finalY = snapped.y;
        for (const [, ep] of Object.entries(endpointMap)) {
          if (Math.hypot(ep.pos[0] - snapped.x, ep.pos[1] - snapped.y) < 0.5) {
            finalX = ep.pos[0]; finalY = ep.pos[1]; break;
          }
        }
        onBuildAnchorPlaced([finalX, finalY]);
      }
      // After anchor is placed, canvas clicks do nothing — user uses the length modal
      return;
    }
    if (mode === 'add-text') {
      const rect = svgRef.current.getBoundingClientRect();
      const world = toWorld(e.clientX - rect.left, e.clientY - rect.top);
      const snapped = snapToGrid(world.x, world.y, 0.5);
      onTextAnnotationsChange({ kind: 'create', x: snapped.x, y: snapped.y });
      return;
    }
    if (mode === 'add-room') {
      const rect = svgRef.current.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = toWorld(sx, sy);
      const snapped = snapToGrid(world.x, world.y, 0.5);

      console.log('[add-room] background click at world:', snapped, 'poly length before:', drawingPolygon.length);

      // Click near first corner → close polygon
      if (drawingPolygon.length >= 3) {
        const first = drawingPolygon[0];
        const screenFirst = toScreen(first[0], first[1]);
        const distPx = Math.hypot(sx - screenFirst.x, sy - screenFirst.y);
        if (distPx < 14) {
          console.log('[add-room] closing polygon at', drawingPolygon.length, 'points');
          onPolygonClosed(drawingPolygon);
          return;
        }
      }

      onDrawingPolygonChange([...drawingPolygon, [snapped.x, snapped.y]]);
      return;
    }
    onSelectionChange({ roomIds: [], wallIds: [], annotationIds: [] });
  };

  const handleRoomClick = (roomId, e) => {
    if (mode === 'add-room' || mode === 'add-text' || mode === 'build-walls') {
      // In drawing/build modes, forward to background so placement works on room fills.
      // stopPropagation prevents double-fire from SVG onClick.
      e.stopPropagation();
      if (mode === 'add-room') console.log('[add-room] room click forwarded to background, mode:', mode);
      handleBackgroundClick(e);
      return;
    }
    e.stopPropagation();
    const cur = selection.roomIds || [];
    const next = e.shiftKey
      ? cur.includes(roomId) ? cur.filter(id => id !== roomId) : [...cur, roomId]
      : cur.length === 1 && cur[0] === roomId ? [] : [roomId];
    onSelectionChange({ roomIds: next, wallIds: [], annotationIds: [] });
  };

  const handleWallClick = (wallId, e) => {
    if (mode === 'add-room' || mode === 'build-walls') return;
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

  const controlButtonStyle = {
    width: 32, height: 32,
    background: 'rgba(10,31,68,0.06)',
    border: 'none', borderRadius: 6,
    fontSize: 16, fontWeight: 700, color: NAVY,
    cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: "'DM Sans', sans-serif",
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block', width, height }}>
    <svg
      ref={svgRef}
      width={width}
      height={height}
      style={{
        background: CREAM,
        cursor: spaceHeld
          ? (panningRef.current ? 'grabbing' : 'grab')
          : mode === 'add-room' || mode === 'add-text' || mode === 'build-walls' ? 'crosshair'
          : mode === 'wall-move' ? 'default'
          : panningRef.current ? 'grabbing' : 'default',
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
        const effectiveRoom = (effectiveScan.rooms || []).find(r => r.id === room.id);
        const sfVisible = effectiveRoom?.sf_visible !== false;
        const hasLabelOverride = effectiveRoom?.label_x_override !== undefined;
        const isDragging = labelDragState?.roomId === room.id;
        const effectiveLabelX = isDragging ? labelDragState.x : (effectiveRoom?.label_x_override ?? hint.label_x);
        const effectiveLabelY = isDragging ? labelDragState.y : (effectiveRoom?.label_y_override ?? hint.label_y);
        const lp = toScreen(effectiveLabelX, effectiveLabelY);
        const fontSize = Math.max(9, Math.min(18, (hint.label_font_size || 14) * z * 0.55));
        const rotate = hint.label_rotation === 90 ? `rotate(-90 ${lp.x} ${lp.y})` : undefined;
        const sfOffsetX = hint.sf_x - hint.label_x;
        const sfOffsetY = hint.sf_y - hint.label_y;
        const effectiveSfPos = toScreen(effectiveLabelX + sfOffsetX, effectiveLabelY + sfOffsetY);
        return (
          <g
            key={`lbl_${room.id}`}
            style={{ cursor: mode === 'select' ? 'move' : 'default' }}
            onContextMenu={hasLabelOverride ? (e) => { e.preventDefault(); onLabelMove({ roomId: room.id, reset: true }); } : undefined}
          >
            <text
              x={lp.x} y={lp.y}
              fill={NAVY}
              fontSize={fontSize}
              fontWeight={600}
              fontFamily="'DM Sans', sans-serif"
              textAnchor="middle"
              dominantBaseline="middle"
              transform={rotate}
              onMouseDown={(e) => handleLabelMouseDown(e, room, effectiveLabelX, effectiveLabelY)}
              style={{ userSelect: 'none' }}
            >
              {hint.label_text}
            </text>
            {sfVisible && hint.sf_text && !hint.sf_inline_with_label && (
              <text
                x={effectiveSfPos.x}
                y={effectiveSfPos.y}
                fill={NAVY}
                fontSize={Math.max(8, fontSize * 0.82)}
                fontFamily="'DM Sans', sans-serif"
                textAnchor="middle"
                dominantBaseline="middle"
                opacity={0.65}
                fontStyle="italic"
                transform={rotate}
                pointerEvents="none"
              >
                {hint.sf_text}
              </text>
            )}
            {hasLabelOverride && (
              <circle cx={lp.x + 36} cy={lp.y - 8} r={3} fill={GOLD} pointerEvents="none" />
            )}
          </g>
        );
      })}

      {/* Text annotations — freestanding labels, drag to reposition, double-click to edit */}
      {(effectiveScan.text_annotations || []).map(ann => {
        if (!ann.text) return null;
        const isSelected = selection.annotationIds?.includes(ann.id);
        const isDragging = annotationDragState?.id === ann.id;
        const renderX = isDragging ? annotationDragState.x : ann.x;
        const renderY = isDragging ? annotationDragState.y : ann.y;
        const rp = toScreen(renderX, renderY);
        const fontSize = Math.max(10, (ann.font_size_pt || 14) * z * 0.6);
        return (
          <g key={ann.id} style={{ cursor: mode === 'select' ? 'move' : 'default' }}>
            {isSelected && (
              <rect
                x={rp.x - 64} y={rp.y - 14}
                width={128} height={28}
                fill="rgba(201,168,76,0.15)"
                stroke={GOLD}
                strokeWidth={1}
                strokeDasharray="4 3"
                rx={4}
                pointerEvents="none"
              />
            )}
            <text
              x={rp.x} y={rp.y}
              fill={NAVY}
              fontSize={fontSize}
              fontWeight={600}
              fontFamily="'DM Sans', sans-serif"
              textAnchor="middle"
              dominantBaseline="middle"
              onMouseDown={(e) => handleAnnotationMouseDown(e, ann)}
              onDoubleClick={(e) => handleAnnotationDoubleClick(e, ann)}
              style={{ userSelect: 'none' }}
              transform={ann.rotation === 90 ? `rotate(-90 ${rp.x} ${rp.y})` : undefined}
            >
              {ann.text}
            </text>
          </g>
        );
      })}

      {/* Build-walls mode: accumulated wall segments + anchor indicators */}
      {mode === 'build-walls' && buildState && (
        <g pointerEvents="none">
          {buildState.accumulated.length >= 2 && (
            <polyline
              points={buildState.accumulated.map(([x, y]) => {
                const s = toScreen(x, y);
                return `${s.x},${s.y}`;
              }).join(' ')}
              fill="none"
              stroke={GOLD}
              strokeWidth={3}
            />
          )}
          {buildState.accumulated.length >= 3 && (() => {
            const last = toScreen(buildState.anchor[0], buildState.anchor[1]);
            const first = toScreen(buildState.firstAnchor[0], buildState.firstAnchor[1]);
            return (
              <line
                x1={last.x} y1={last.y} x2={first.x} y2={first.y}
                stroke={GOLD} strokeWidth={1.5} strokeDasharray="3 5" opacity={0.4}
              />
            );
          })()}
          {buildState.accumulated.map(([x, y], i) => {
            const s = toScreen(x, y);
            return (
              <circle
                key={`build-pt-${i}`}
                cx={s.x} cy={s.y}
                r={i === 0 ? 8 : 5}
                fill={i === 0 ? GOLD : NAVY}
                stroke="#fff" strokeWidth={2}
              />
            );
          })}
          {(() => {
            const s = toScreen(buildState.anchor[0], buildState.anchor[1]);
            return (
              <circle
                cx={s.x} cy={s.y} r={12}
                fill="none" stroke={GOLD} strokeWidth={2} strokeDasharray="3 3"
              />
            );
          })()}
        </g>
      )}

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

      {/* Snap indicators + angle badge during wall-move drag (Phase 5c-4 part 2) */}
      {mode === 'wall-move' && liveWallEndpointDrag?.newPos && (() => {
        const dragPos = liveWallEndpointDrag.newPos;
        const dragKey = liveWallEndpointDrag.key;
        const origPos = draggingEndpointRef.current?.startPos;
        const dragScreen = toScreen(dragPos[0], dragPos[1]);

        // Determine active snap type — check in priority order (endpoint > midpoint > axis)
        let snapType = null;
        let snapScreen = dragScreen;

        for (const [k, ep] of Object.entries(endpointMap)) {
          if (k === dragKey) continue;
          if (Math.hypot(ep.pos[0] - dragPos[0], ep.pos[1] - dragPos[1]) < 0.05) {
            snapType = 'endpoint';
            snapScreen = toScreen(ep.pos[0], ep.pos[1]);
            break;
          }
        }

        if (!snapType) {
          for (const wall of (normalized?.walls || [])) {
            const k1 = endpointKey(wall.p1);
            const k2 = endpointKey(wall.p2);
            if (k1 === dragKey || k2 === dragKey) continue;
            const mx = (wall.p1[0] + wall.p2[0]) / 2;
            const my = (wall.p1[1] + wall.p2[1]) / 2;
            if (Math.hypot(mx - dragPos[0], my - dragPos[1]) < 0.05) {
              snapType = 'midpoint';
              snapScreen = toScreen(mx, my);
              break;
            }
          }
        }

        if (!snapType && origPos) {
          if (Math.abs(dragPos[1] - origPos[1]) < 0.05 && Math.abs(dragPos[0] - origPos[0]) > 0.5) {
            snapType = 'axis-horizontal';
          } else if (Math.abs(dragPos[0] - origPos[0]) < 0.05 && Math.abs(dragPos[1] - origPos[1]) > 0.5) {
            snapType = 'axis-vertical';
          }
        }

        // Angle + length badge: pick longest connected wall, compute live angle + length
        const connectedForBadge = (normalized?.walls || []).filter(w =>
          endpointKey(w.p1) === dragKey || endpointKey(w.p2) === dragKey
        );
        const longestBadge = connectedForBadge.reduce(
          (acc, w) => {
            const other = endpointKey(w.p1) === dragKey ? w.p2 : w.p1;
            const len = Math.hypot(dragPos[0] - other[0], dragPos[1] - other[1]);
            return len > acc.len ? { other, len } : acc;
          },
          { other: null, len: 0 },
        );

        let badgeEl = null;
        if (longestBadge.other) {
          const dx2 = dragPos[0] - longestBadge.other[0];
          const dy2 = dragPos[1] - longestBadge.other[1];
          let angleDeg = Math.atan2(dy2, dx2) * 180 / Math.PI;
          if (angleDeg < 0) angleDeg += 360;
          const offAxis = Math.min(angleDeg % 90, Math.abs((angleDeg % 90) - 90));
          const isClean = offAxis < 0.5;
          const wholeFt = Math.floor(longestBadge.len);
          const inches = Math.round((longestBadge.len - wholeFt) * 12);
          const lenLabel = inches > 0 ? `${wholeFt}'${inches}"` : `${wholeFt}'`;
          badgeEl = (
            <g pointerEvents="none">
              <rect
                x={dragScreen.x + 14} y={dragScreen.y - 30}
                width={84} height={34} rx={4}
                fill={isClean ? 'rgba(46,100,60,0.92)' : 'rgba(10,31,68,0.88)'}
              />
              <text
                x={dragScreen.x + 56} y={dragScreen.y - 16}
                fill="#F7F5F0" fontSize={11} fontWeight={700}
                textAnchor="middle" fontFamily="monospace"
              >{lenLabel}</text>
              <text
                x={dragScreen.x + 56} y={dragScreen.y - 4}
                fill="rgba(247,245,240,0.85)" fontSize={9}
                textAnchor="middle" fontFamily="monospace"
              >{angleDeg.toFixed(1)}°</text>
            </g>
          );
        }

        return (
          <g key="snap-indicators" pointerEvents="none">
            {/* Endpoint snap: green dashed ring */}
            {snapType === 'endpoint' && (
              <circle
                cx={snapScreen.x} cy={snapScreen.y} r={12}
                fill="none" stroke="#3a7" strokeWidth={3} strokeDasharray="3 3"
              />
            )}
            {/* Midpoint snap: green diamond */}
            {snapType === 'midpoint' && (
              <rect
                x={snapScreen.x - 8} y={snapScreen.y - 8}
                width={16} height={16}
                fill="none" stroke="#3a7" strokeWidth={2.5}
                transform={`rotate(45 ${snapScreen.x} ${snapScreen.y})`}
              />
            )}
            {/* Axis-horizontal: gold dashed horizontal guide line */}
            {snapType === 'axis-horizontal' && (
              <line
                x1={0} y1={dragScreen.y} x2={width} y2={dragScreen.y}
                stroke="rgba(201,168,76,0.5)" strokeWidth={1} strokeDasharray="4 6"
              />
            )}
            {/* Axis-vertical: gold dashed vertical guide line */}
            {snapType === 'axis-vertical' && (
              <line
                x1={dragScreen.x} y1={0} x2={dragScreen.x} y2={height}
                stroke="rgba(201,168,76,0.5)" strokeWidth={1} strokeDasharray="4 6"
              />
            )}
            {badgeEl}
          </g>
        );
      })()}

    </svg>

    {/* Keyboard hint card — shown on ? hover */}
    <div style={{
      position: 'absolute', top: 12, right: 56,
      background: 'rgba(10,31,68,0.92)', color: 'rgba(247,245,240,0.92)',
      padding: '8px 12px', borderRadius: 6,
      fontSize: 11, fontFamily: 'monospace', lineHeight: 1.7,
      pointerEvents: 'none',
      opacity: showHint ? 1 : 0, transition: 'opacity 0.15s',
      zIndex: 10, whiteSpace: 'nowrap',
    }}>
      + / − &nbsp; zoom<br/>
      F &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; fit to content<br/>
      ↑↓←→ &nbsp; pan<br/>
      Space+drag &nbsp; pan<br/>
      Right-drag &nbsp; pan<br/>
      Scroll &nbsp;&nbsp;&nbsp;&nbsp; zoom to cursor
    </div>

    {/* Controls overlay — top-right corner */}
    <div style={{
      position: 'absolute', top: 12, right: 12,
      display: 'flex', flexDirection: 'column', gap: 4,
      background: 'rgba(255,255,255,0.95)',
      padding: 6, borderRadius: 8,
      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
      zIndex: 10,
    }}>
      <button onClick={() => zoomBy(ZOOM_STEP)} title="Zoom in (+)" style={controlButtonStyle}>+</button>
      <button onClick={() => zoomBy(1 / ZOOM_STEP)} title="Zoom out (−)" style={controlButtonStyle}>−</button>
      <button onClick={fitToContent} title="Fit to content (F)" style={controlButtonStyle}>⤢</button>
      <div style={{ height: 1, background: 'rgba(10,31,68,0.1)', margin: '2px 0' }} />
      <div style={{ fontSize: 10, color: '#666', textAlign: 'center', padding: '2px 0', fontFamily: 'monospace' }}>
        {Math.round(z * 100)}%
      </div>
      <button
        onMouseEnter={() => setShowHint(true)}
        onMouseLeave={() => setShowHint(false)}
        title="Keyboard shortcuts"
        style={{ ...controlButtonStyle, fontSize: 13, fontWeight: 700, color: '#888' }}
      >?</button>
    </div>
    </div>
  );
}
