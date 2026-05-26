import { useState, useEffect, useMemo, useCallback } from 'react';
import polygonClipping from 'polygon-clipping';
import { sbLoadFloorPlan, sbUpdateFloorPlanOverrides, sbRegenerateFloorPlanPdf, sbSendFloorPlanVersion, sb, SUPABASE_URL, ANON_KEY } from '../../lib/supabase';
import { buildFloorPlanPDF } from '../../lib/pdf';
import { applyOverridesToScan } from '../../lib/floorPlan/applyOverrides';
import { parseFootInches } from '../../lib/floorPlan/parseFootInches';
import FloorPlanCanvas from './FloorPlanCanvas';

const NAVY = '#0A1F44';
const GOLD = '#C9A84C';
const CREAM = '#F7F5F0';
const DESKTOP_MIN_WIDTH = 1024;
const SEND_FLOOR_PLAN_EMAIL_URL = `${SUPABASE_URL}/functions/v1/send-floor-plan-email`;

async function buildPdfFromOverrides(rawScan, overrides, plan) {
  const merged = applyOverridesToScan(rawScan, overrides);
  const minimalJob = {
    address: plan.name,
    client_name: '',
    captured_at: rawScan?.created_at || plan.updated_at,
  };
  const doc = await buildFloorPlanPDF(merged, minimalJob);
  return doc.output('blob');
}

export default function FloorPlanEditorScr({ floorPlanId, onBack }) {
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' && window.innerWidth >= DESKTOP_MIN_WIDTH
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [plan, setPlan] = useState(null);
  const [versions, setVersions] = useState([]);
  const [selection, setSelection] = useState({ roomIds: [], wallIds: [] });
  const [canvasSize, setCanvasSize] = useState({ width: 1000, height: 680 });

  // Persistence state — undo/redo history stack (Phase 5c-6)
  const MAX_HISTORY = 50;
  const [history, setHistory] = useState({ past: [], present: {}, future: [] });
  const pendingOverrides = history.present;
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSavedVersion, setLastSavedVersion] = useState(null);

  // Edit mode state
  const [mode, setMode] = useState('select'); // 'select' | 'add-room' | 'wall-move' | 'add-text' | 'build-walls'
  const [editingAnnotation, setEditingAnnotation] = useState(null); // { id, text } when modal open
  const [renameInputValue, setRenameInputValue] = useState(null); // null = show current name, string = editing
  const [buildState, setBuildState] = useState(null); // { anchor, firstAnchor, accumulated } during build-walls session
  const [lengthInput, setLengthInput] = useState(null); // { direction, length, error } when length modal is open
  const [drawingPolygon, setDrawingPolygon] = useState([]); // [[worldX, worldY], ...]
  const [pendingNewRoom, setPendingNewRoom] = useState(null); // { polygon, defaultName, name }
  const [dragState, setDragState] = useState(null); // { key, livePos: [x, y] } | null
  const [pendingMerge, setPendingMerge] = useState(null); // { source_room_ids, name, candidate_polygon, source_rooms }

  // Send floor plan state (Phase 5e)
  const [sendingVersion, setSendingVersion] = useState(null);
  const [sendRecipient, setSendRecipient] = useState({ includeJobClient: false, freeText: '', customMessage: '' });
  const [jobClient, setJobClient] = useState(null);
  const [sendInFlight, setSendInFlight] = useState(false);
  const [sendError, setSendError] = useState(null);

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= DESKTOP_MIN_WIDTH);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const onResize = () => {
      setCanvasSize({
        width: Math.max(600, Math.floor(window.innerWidth * 0.64)),
        height: Math.max(500, Math.floor(window.innerHeight * 0.78)),
      });
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!floorPlanId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const result = await sbLoadFloorPlan(floorPlanId);
      if (cancelled) return;
      if (!result?.ok) {
        setError(result?.error || 'Failed to load floor plan');
        setLoading(false);
        return;
      }
      setPlan(result.data.plan);
      setVersions(result.data.versions || []);
      setHistory({ past: [], present: result.data.plan?.layout_overrides || {}, future: [] });
      setIsDirty(false);
      setLastSavedVersion(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [floorPlanId]);

  // Load job client email when send modal opens (Phase 5e)
  useEffect(() => {
    if (!sendingVersion || !plan?.job_id) return;
    let cancelled = false;
    (async () => {
      const { data } = await sb.from('jobs').select('client_email,client_name').eq('id', plan.job_id).single();
      if (cancelled) return;
      setJobClient(data?.client_email ? { email: data.client_email, name: data.client_name || '' } : null);
    })();
    return () => { cancelled = true; };
  }, [sendingVersion?.id, plan?.job_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset send form on close (Phase 5e)
  useEffect(() => {
    if (!sendingVersion) {
      setSendRecipient({ includeJobClient: false, freeText: '', customMessage: '' });
      setSendError(null);
      setJobClient(null);
    }
  }, [sendingVersion?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateOverrides = useCallback((newOverrides) => {
    setHistory(h => {
      const newPast = [...h.past, h.present].slice(-MAX_HISTORY);
      return { past: newPast, present: newOverrides, future: [] };
    });
    setIsDirty(true);
    setSaveError(null);
  }, []); // setHistory/setIsDirty/setSaveError are stable setter refs

  const undo = useCallback(() => {
    setHistory(h => {
      if (h.past.length === 0) return h;
      const previous = h.past[h.past.length - 1];
      const newPast = h.past.slice(0, -1);
      return {
        past: newPast,
        present: previous,
        future: [h.present, ...h.future].slice(0, MAX_HISTORY),
      };
    });
    setIsDirty(true);
    setSaveError(null);
  }, []);

  const redo = useCallback(() => {
    setHistory(h => {
      if (h.future.length === 0) return h;
      const next = h.future[0];
      const newFuture = h.future.slice(1);
      return {
        past: [...h.past, h.present].slice(-MAX_HISTORY),
        present: next,
        future: newFuture,
      };
    });
    setIsDirty(true);
    setSaveError(null);
  }, []);

  // Add Room helpers
  function guessDefaultName(polygon) {
    let area = 0;
    for (let i = 0; i < polygon.length; i++) {
      const [x1, y1] = polygon[i];
      const [x2, y2] = polygon[(i + 1) % polygon.length];
      area += x1 * y2 - x2 * y1;
    }
    area = Math.abs(area) / 2;
    if (area < 15) return 'Closet';
    if (area < 35) return 'Bathroom';
    return 'Room';
  }

  function handlePolygonClosed(polygon) {
    setPendingNewRoom({ polygon, defaultName: guessDefaultName(polygon), name: '' });
  }

  function confirmAddRoom() {
    if (!pendingNewRoom) return;
    const name = (pendingNewRoom.name || pendingNewRoom.defaultName || 'Room').trim();
    if (!name) return;
    const newRoom = {
      id: `added-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      polygon: pendingNewRoom.polygon,
      type: 'unknown',
      source: 'manual',
    };
    updateOverrides({
      ...pendingOverrides,
      added_rooms: [...(pendingOverrides.added_rooms || []), newRoom],
    });
    setPendingNewRoom(null);
    setDrawingPolygon([]);
    setMode('select');
  }

  function cancelAddRoom() {
    setPendingNewRoom(null);
    setDrawingPolygon([]);
    setMode('add-room');
  }

  // Build-walls (Phase 5c-9) handlers
  const BUILD_DIRS = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

  function handleBuildAnchorPlaced(point) {
    setBuildState({ anchor: point, firstAnchor: point, accumulated: [point] });
    setLengthInput({ direction: 'N', length: '', error: null });
  }

  function confirmLengthInput() {
    if (!lengthInput || !buildState) return;
    const lenFt = parseFootInches(lengthInput.length);
    if (lenFt === null || lenFt <= 0) {
      setLengthInput(prev => ({ ...prev, error: "Invalid length. Try \"10'6\" or \"10.5\" or \"10 6\"" }));
      return;
    }
    if (lenFt > 200) {
      setLengthInput(prev => ({ ...prev, error: 'Length too large (max 200 ft)' }));
      return;
    }
    const [ax, az] = buildState.anchor;
    const [dx, dz] = BUILD_DIRS[lengthInput.direction];
    const rawX = ax + dx * lenFt;
    const rawZ = az + dz * lenFt;
    const snappedX = Math.round(rawX / 0.5) * 0.5;
    const snappedZ = Math.round(rawZ / 0.5) * 0.5;
    const firstDist = Math.hypot(snappedX - buildState.firstAnchor[0], snappedZ - buildState.firstAnchor[1]);
    if (buildState.accumulated.length >= 2 && firstDist < 0.5) {
      commitBuiltPolygon(buildState.accumulated);
      return;
    }
    const newAccumulated = [...buildState.accumulated, [snappedX, snappedZ]];
    setBuildState(prev => ({ ...prev, anchor: [snappedX, snappedZ], accumulated: newAccumulated }));
    setLengthInput({ direction: lengthInput.direction, length: '', error: null });
  }

  function cancelLengthInput() {
    setBuildState(null);
    setLengthInput(null);
    setMode('select');
  }

  function commitBuiltPolygon(polygon) {
    if (polygon.length < 3) {
      setBuildState(null); setLengthInput(null); setMode('select');
      return;
    }
    setPendingNewRoom({ polygon, defaultName: guessDefaultName(polygon), name: '' });
    setBuildState(null);
    setLengthInput(null);
    setMode('select');
  }

  // Wall-move validation helpers
  function polygonArea(polygon) {
    let area = 0;
    const n = polygon.length;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = polygon[i];
      const [x2, y2] = polygon[(i + 1) % n];
      area += x1 * y2 - x2 * y1;
    }
    return Math.abs(area) / 2;
  }

  function ccw(ax, ay, bx, by, cx, cy) {
    return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
  }

  function segmentsIntersect([ax, ay], [bx, by], [cx, cy], [dx, dy]) {
    return (
      ccw(ax, ay, cx, cy, dx, dy) !== ccw(bx, by, cx, cy, dx, dy) &&
      ccw(ax, ay, bx, by, cx, cy) !== ccw(ax, ay, bx, by, dx, dy)
    );
  }

  function polygonSelfIntersects(polygon) {
    const n = polygon.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue; // adjacent edges share endpoint
        if (segmentsIntersect(
          polygon[i], polygon[(i + 1) % n],
          polygon[j], polygon[(j + 1) % n],
        )) return true;
      }
    }
    return false;
  }

  function validateWallMove(key, newPos) {
    const testOverrides = {
      ...pendingOverrides,
      wall_endpoint_overrides: {
        ...(pendingOverrides.wall_endpoint_overrides || {}),
        [key]: newPos,
      },
    };
    const merged = applyOverridesToScan(plan.raw_scan, testOverrides);
    for (const room of merged.rooms || []) {
      if (!room.polygon || room.polygon.length < 3) continue;
      if (polygonArea(room.polygon) < 1) return { ok: false, reason: 'Room would collapse (< 1 sqft)' };
      if (polygonSelfIntersects(room.polygon)) return { ok: false, reason: 'Room would self-intersect' };
    }
    return { ok: true };
  }

  function handleWallEndpointDrag(key, newPos) {
    if (newPos === null) { setDragState(null); return; }
    setDragState({ key, livePos: newPos });
  }

  function handleWallEndpointMove(key, newPos) {
    setDragState(null);
    const validation = validateWallMove(key, newPos);
    if (!validation.ok) return; // silently ignore invalid moves
    updateOverrides({
      ...pendingOverrides,
      wall_endpoint_overrides: {
        ...(pendingOverrides.wall_endpoint_overrides || {}),
        [key]: newPos,
      },
    });
  }

  // Merge rooms helpers
  function runPolygonUnion(sourceRooms) {
    const inputs = sourceRooms.map(r => [r.polygon]);
    const result = polygonClipping.union(...inputs);
    if (!result || result.length === 0) return { ok: false, reason: 'Merge produced no polygon — rooms may not be adjacent.' };
    if (result.length > 1) return { ok: false, reason: 'Selected rooms are not all connected — they would form separate pieces.' };
    let poly = result[0][0];
    if (poly.length > 1 &&
        poly[0][0] === poly[poly.length - 1][0] &&
        poly[0][1] === poly[poly.length - 1][1]) {
      poly = poly.slice(0, -1);
    }
    return { ok: true, polygon: poly };
  }

  function initiateMerge() {
    const sourceIds = selection.roomIds;
    if (sourceIds.length < 2) return;
    const effectiveScan = applyOverridesToScan(plan.raw_scan, pendingOverrides);
    const sourceRooms = sourceIds
      .map(id => effectiveScan.rooms.find(r => r.id === id))
      .filter(Boolean);
    if (sourceRooms.length !== sourceIds.length) {
      setSaveError('Some selected rooms no longer exist in the scan.');
      return;
    }
    let unionResult;
    try {
      unionResult = runPolygonUnion(sourceRooms);
    } catch (err) {
      setSaveError(`Merge failed: ${err?.message || err}`);
      return;
    }
    if (!unionResult.ok) {
      setSaveError(unionResult.reason);
      return;
    }
    setPendingMerge({
      source_room_ids: sourceIds,
      name: sourceRooms[0].name || 'Merged Room',
      candidate_polygon: unionResult.polygon,
      source_rooms: sourceRooms,
    });
  }

  function confirmMerge() {
    if (!pendingMerge) return;
    const name = (pendingMerge.name || 'Merged Room').trim() || 'Merged Room';
    const newRoom = {
      id: `merged-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      polygon: pendingMerge.candidate_polygon,
      source_room_ids: pendingMerge.source_room_ids,
      type: 'unknown',
    };
    updateOverrides({
      ...pendingOverrides,
      merged_rooms: [...(pendingOverrides.merged_rooms || []), newRoom],
    });
    setPendingMerge(null);
    setSelection({ roomIds: [], wallIds: [] });
  }

  function cancelMerge() {
    setPendingMerge(null);
  }

  // Debug: log drawingPolygon changes to confirm add-room state flow
  useEffect(() => {
    if (drawingPolygon.length > 0 || mode === 'add-room') {
      console.log('[add-room] drawingPolygon updated, length:', drawingPolygon.length, 'points:', drawingPolygon);
    }
  }, [drawingPolygon]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset rename input when selection changes
  useEffect(() => {
    setRenameInputValue(null);
  }, [selection.roomIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rename room helpers (Phase 5c-8)
  function commitRename(roomId) {
    if (renameInputValue === null) return;
    const trimmed = renameInputValue.trim();
    if (!trimmed) { setRenameInputValue(null); return; }
    updateOverrides({
      ...pendingOverrides,
      [roomId]: { ...(pendingOverrides[roomId] || {}), name: trimmed },
    });
    setRenameInputValue(null);
  }

  // SF visibility helpers (Phase 5c-8)
  function getSfVisible(roomId) {
    return pendingOverrides[roomId]?.sf_visible !== false;
  }

  function toggleSfVisible(roomId, visible) {
    updateOverrides({
      ...pendingOverrides,
      [roomId]: { ...(pendingOverrides[roomId] || {}), sf_visible: visible },
    });
  }

  // Text annotation handlers (Phase 5c-7)
  function handleTextAnnotationChange(event) {
    if (event.kind === 'create') {
      const newAnn = {
        id: `ann-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: '',
        x: event.x,
        y: event.y,
        font_size_pt: 14,
        rotation: 0,
      };
      updateOverrides({
        ...pendingOverrides,
        text_annotations: [...(pendingOverrides.text_annotations || []), newAnn],
      });
      setEditingAnnotation({ id: newAnn.id, text: '' });
      setMode('select');
    } else if (event.kind === 'move') {
      updateOverrides({
        ...pendingOverrides,
        text_annotations: (pendingOverrides.text_annotations || []).map(t =>
          t.id === event.id ? { ...t, x: event.x, y: event.y } : t
        ),
      });
    } else if (event.kind === 'edit_request') {
      const existing = (pendingOverrides.text_annotations || []).find(t => t.id === event.id);
      if (existing) setEditingAnnotation({ id: event.id, text: existing.text });
    }
  }

  function commitAnnotationText() {
    if (!editingAnnotation) return;
    const text = editingAnnotation.text.trim();
    if (!text) {
      updateOverrides({
        ...pendingOverrides,
        text_annotations: (pendingOverrides.text_annotations || []).filter(t => t.id !== editingAnnotation.id),
      });
    } else {
      updateOverrides({
        ...pendingOverrides,
        text_annotations: (pendingOverrides.text_annotations || []).map(t =>
          t.id === editingAnnotation.id ? { ...t, text } : t
        ),
      });
    }
    setEditingAnnotation(null);
  }

  function cancelAnnotationEdit() {
    if (editingAnnotation) {
      const existing = (pendingOverrides.text_annotations || []).find(t => t.id === editingAnnotation.id);
      if (existing && !existing.text) {
        updateOverrides({
          ...pendingOverrides,
          text_annotations: (pendingOverrides.text_annotations || []).filter(t => t.id !== editingAnnotation.id),
        });
      }
    }
    setEditingAnnotation(null);
  }

  function deleteAnnotation(id) {
    updateOverrides({
      ...pendingOverrides,
      text_annotations: (pendingOverrides.text_annotations || []).filter(t => t.id !== id),
    });
    setEditingAnnotation(null);
  }

  function handleLabelMove({ roomId, x, y, reset }) {
    if (reset) {
      const existing = pendingOverrides[roomId];
      if (!existing) return;
      const { label_x, label_y, ...rest } = existing;
      if (Object.keys(rest).length > 0) {
        updateOverrides({ ...pendingOverrides, [roomId]: rest });
      } else {
        const { [roomId]: _removed, ...remaining } = pendingOverrides;
        updateOverrides(remaining);
      }
    } else {
      updateOverrides({
        ...pendingOverrides,
        [roomId]: { ...(pendingOverrides[roomId] || {}), label_x: x, label_y: y },
      });
    }
  }

  // Delete selected rooms and/or annotations (Phase 5c-6)
  // Cases: added_room → filter from added_rooms, merged_room → filter from merged_rooms,
  // scanner room → push to deleted_room_ids, annotation → filter from text_annotations
  function deleteSelected() {
    const annIds = selection.annotationIds || [];
    const roomIds = selection.roomIds || [];
    if (annIds.length === 0 && roomIds.length === 0) return;

    let next = { ...pendingOverrides };

    if (annIds.length > 0) {
      next.text_annotations = (next.text_annotations || []).filter(a => !annIds.includes(a.id));
    }

    for (const roomId of roomIds) {
      if ((next.added_rooms || []).some(r => r.id === roomId)) {
        next.added_rooms = next.added_rooms.filter(r => r.id !== roomId);
        continue;
      }
      if ((next.merged_rooms || []).some(r => r.id === roomId)) {
        next.merged_rooms = next.merged_rooms.filter(r => r.id !== roomId);
        continue;
      }
      // Scanner-produced room — mark deleted so applyOverrides filters it out
      next.deleted_room_ids = [...(next.deleted_room_ids || []), roomId];
    }

    updateOverrides(next);
    setSelection({ roomIds: [], wallIds: [], annotationIds: [] });
  }

  // Keyboard handler — undo/redo/delete + mode-specific shortcuts (Phase 5c-6 expanded)
  useEffect(() => {
    function onKey(e) {
      // Never intercept while user is typing in an input or textarea
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      // Cmd-Z / Ctrl-Z = undo (Phase 5c-6)
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        if (pendingNewRoom || pendingMerge || editingAnnotation || !!lengthInput) return;
        e.preventDefault();
        undo();
        return;
      }

      // Cmd-Shift-Z / Ctrl-Y = redo (Phase 5c-6)
      if (
        ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) ||
        ((e.metaKey || e.ctrlKey) && (e.key === 'y' || e.key === 'Y'))
      ) {
        if (pendingNewRoom || pendingMerge || editingAnnotation || !!lengthInput) return;
        e.preventDefault();
        redo();
        return;
      }

      // Delete / Backspace = delete selected items (Phase 5c-6)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (pendingNewRoom || pendingMerge || editingAnnotation || !!lengthInput) return;
        const selRooms = selection.roomIds?.length || 0;
        const selAnns = selection.annotationIds?.length || 0;
        if (selRooms > 0 || selAnns > 0) {
          e.preventDefault();
          if (window.confirm(`Delete ${selRooms + selAnns} item(s)?`)) {
            deleteSelected();
          }
          return;
        }
      }

      // Remaining mode-specific handlers — bail out if modal is up
      if (pendingNewRoom || pendingMerge || editingAnnotation || !!lengthInput) return;
      if (mode === 'add-room') {
        if (e.key === 'Escape') {
          setMode('select');
          setDrawingPolygon([]);
        } else if (e.key === 'Enter' && drawingPolygon.length >= 3) {
          handlePolygonClosed(drawingPolygon);
        }
      } else if (mode === 'wall-move') {
        if (e.key === 'Escape') {
          setDragState(null);
          setMode('select');
        }
      } else if (mode === 'add-text') {
        if (e.key === 'Escape') setMode('select');
      } else if (mode === 'build-walls') {
        if (e.key === 'Escape') {
          setMode('select');
          setBuildState(null);
          setLengthInput(null);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, drawingPolygon, pendingNewRoom, pendingMerge, editingAnnotation, lengthInput, selection, pendingOverrides, undo, redo]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveOnly = async () => {
    if (!plan || !isDirty) return;
    setSaving(true);
    setSaveError(null);
    const result = await sbUpdateFloorPlanOverrides(plan.id, pendingOverrides);
    setSaving(false);
    if (!result.ok) {
      setSaveError(result.error || 'Save failed');
      return;
    }
    setPlan(p => ({ ...p, layout_overrides: pendingOverrides }));
    setHistory(h => ({ past: [], present: h.present, future: [] }));
    setIsDirty(false);
  };

  const handleSaveAndRegenerate = async () => {
    if (!plan) return;
    setSaving(true);
    setSaveError(null);

    if (isDirty) {
      const upd = await sbUpdateFloorPlanOverrides(plan.id, pendingOverrides);
      if (!upd.ok) {
        setSaveError(upd.error || 'Save failed');
        setSaving(false);
        return;
      }
    }

    let pdfBlob;
    try {
      pdfBlob = await buildPdfFromOverrides(plan.raw_scan, pendingOverrides, plan);
    } catch (err) {
      setSaveError(`PDF generation failed: ${err?.message || err}`);
      setSaving(false);
      return;
    }

    const regen = await sbRegenerateFloorPlanPdf(plan.id, pdfBlob);
    setSaving(false);
    if (!regen.ok) {
      setSaveError(`Regenerate failed: ${regen.error}`);
      return;
    }

    const reload = await sbLoadFloorPlan(plan.id);
    if (reload.ok) {
      setPlan(reload.data.plan);
      setVersions(reload.data.versions || []);
      setLastSavedVersion(regen.data?.version_number ?? null);
    }
    setHistory(h => ({ past: [], present: h.present, future: [] }));
    setIsDirty(false);
  };

  // Send floor plan helpers (Phase 5e)
  const previouslySentEmails = useMemo(() => {
    const all = new Set();
    for (const v of versions) {
      for (const email of (v.sent_to || [])) all.add(email);
    }
    return Array.from(all);
  }, [versions]);

  function parseEmailList(text) {
    return text.split(/[,\n;]/).map(e => e.trim().toLowerCase()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  }

  const resolvedRecipients = useMemo(() => {
    const emails = [];
    if (sendRecipient.includeJobClient && jobClient?.email) emails.push(jobClient.email.toLowerCase());
    emails.push(...parseEmailList(sendRecipient.freeText));
    return Array.from(new Set(emails));
  }, [sendRecipient, jobClient]); // eslint-disable-line react-hooks/exhaustive-deps

  const executeSend = async () => {
    if (resolvedRecipients.length === 0) { setSendError('Add at least one recipient.'); return; }
    if (!sendingVersion?.pdf_url) { setSendError('No PDF on this version — regenerate first.'); return; }
    setSendInFlight(true);
    setSendError(null);
    try {
      const { data: { session } } = await sb.auth.getSession();
      const token = session?.access_token || ANON_KEY;

      const emailRes = await fetch(SEND_FLOOR_PLAN_EMAIL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          to: resolvedRecipients,
          plan_name: plan.name,
          version_number: sendingVersion.version_number,
          pdf_url: sendingVersion.pdf_url,
          custom_message: sendRecipient.customMessage || undefined,
        }),
      });

      if (!emailRes.ok) {
        const txt = await emailRes.text();
        setSendError(`Email failed: ${txt.slice(0, 200)}`);
        setSendInFlight(false);
        return;
      }

      const recordRes = await sbSendFloorPlanVersion(plan.id, sendingVersion.version_number, resolvedRecipients);
      if (!recordRes.ok) setSendError(`Sent, but record failed: ${recordRes.error}`);

      const reload = await sbLoadFloorPlan(plan.id);
      if (reload?.ok) {
        setPlan(reload.data.plan);
        setVersions(reload.data.versions || []);
      }
      setSendInFlight(false);
      setSendingVersion(null);
    } catch (err) {
      setSendError(`Unexpected error: ${err?.message || err}`);
      setSendInFlight(false);
    }
  };

  // Live merge preview — gold union outline shown while 2+ rooms are selected in select mode
  const mergePreviewPolygon = useMemo(() => {
    if (selection.roomIds.length < 2 || mode !== 'select' || !plan?.raw_scan) return null;
    try {
      const effectiveScan = applyOverridesToScan(plan.raw_scan, pendingOverrides);
      const sourceRooms = selection.roomIds
        .map(id => effectiveScan.rooms.find(r => r.id === id))
        .filter(Boolean);
      if (sourceRooms.length < 2) return null;
      const result = runPolygonUnion(sourceRooms);
      return result.ok ? result.polygon : null;
    } catch {
      return null;
    }
  }, [selection.roomIds, mode, plan?.raw_scan, pendingOverrides]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mobile guard
  if (!isDesktop) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: CREAM, zIndex: 2100,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 40, textAlign: 'center', fontFamily: "'DM Sans', sans-serif",
      }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🖥</div>
        <h2 style={{ fontFamily: "'DM Serif Display', serif", color: NAVY, marginBottom: 12 }}>
          Desktop Required
        </h2>
        <p style={{ maxWidth: 380, color: '#666', lineHeight: 1.6, marginBottom: 28 }}>
          The floor plan editor needs a desktop screen for precision editing. Open this on a computer to edit.
        </p>
        <button onClick={onBack} className="btn btn-ghost">← Back</button>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: CREAM, zIndex: 2100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: '#666',
      }}>
        Loading floor plan…
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: CREAM, zIndex: 2100,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'DM Sans', sans-serif", gap: 16,
      }}>
        <div style={{ color: '#c44', fontSize: 14 }}>Error: {error}</div>
        <button onClick={onBack} className="btn btn-ghost">← Back</button>
      </div>
    );
  }

  if (!plan) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: CREAM, zIndex: 2100,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'DM Sans', sans-serif", gap: 16,
      }}>
        <div style={{ fontSize: 14, color: '#666' }}>Floor plan not found.</div>
        <button onClick={onBack} className="btn btn-ghost">← Back</button>
      </div>
    );
  }

  const selRoomCount = selection.roomIds.length;
  const selWallCount = selection.wallIds.length;
  const selAnnotCount = selection.annotationIds?.length || 0;
  const headerBtnBase = {
    padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
    fontSize: 13, fontFamily: "'DM Sans', sans-serif", border: 'none', fontWeight: 600,
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: CREAM, zIndex: 2100,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '10px 20px',
        background: NAVY, color: CREAM, gap: 12,
        borderBottom: `3px solid ${GOLD}`,
        flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{
            ...headerBtnBase,
            background: 'transparent', border: '1px solid rgba(247,245,240,0.35)',
            color: CREAM,
          }}
        >
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16, fontFamily: "'DM Serif Display', serif" }}>
            {plan.name}
          </div>
          <div style={{ fontSize: 11, opacity: 0.65, marginTop: 1 }}>
            v{plan.current_pdf_version} · {plan.status}
          </div>
        </div>

        {/* Save controls */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Undo / Redo (Phase 5c-6) */}
          <button
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Cmd-Z / Ctrl-Z)"
            style={{
              padding: '6px 10px',
              background: canUndo ? 'rgba(247,245,240,0.15)' : 'rgba(247,245,240,0.05)',
              color: canUndo ? '#F7F5F0' : 'rgba(247,245,240,0.4)',
              border: '1px solid rgba(247,245,240,0.2)',
              borderRadius: 6,
              cursor: canUndo ? 'pointer' : 'not-allowed',
              fontSize: 13,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >↶ Undo</button>
          <button
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Cmd-Shift-Z / Ctrl-Y)"
            style={{
              padding: '6px 10px',
              background: canRedo ? 'rgba(247,245,240,0.15)' : 'rgba(247,245,240,0.05)',
              color: canRedo ? '#F7F5F0' : 'rgba(247,245,240,0.4)',
              border: '1px solid rgba(247,245,240,0.2)',
              borderRadius: 6,
              cursor: canRedo ? 'pointer' : 'not-allowed',
              fontSize: 13,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >↷ Redo</button>
          {history.past.length > 0 && (
            <span style={{ fontSize: 10, opacity: 0.6, fontFamily: 'monospace', color: 'rgba(247,245,240,0.8)' }}>
              {history.past.length} undo{history.past.length === 1 ? '' : 's'}
            </span>
          )}
          {isDirty && (
            <span style={{ fontSize: 11, color: GOLD, fontStyle: 'italic' }}>Unsaved changes</span>
          )}
          {saveError && (
            <span style={{ fontSize: 11, color: '#f87' }}>{saveError}</span>
          )}
          {lastSavedVersion && !isDirty && !saveError && (
            <span style={{ fontSize: 11, color: '#6d6' }}>Saved · v{lastSavedVersion}</span>
          )}
          <button
            onClick={handleSaveOnly}
            disabled={!isDirty || saving}
            style={{
              ...headerBtnBase,
              background: isDirty && !saving ? 'rgba(247,245,240,0.15)' : 'rgba(247,245,240,0.05)',
              color: isDirty && !saving ? CREAM : 'rgba(247,245,240,0.35)',
              border: '1px solid rgba(247,245,240,0.3)',
              cursor: isDirty && !saving ? 'pointer' : 'not-allowed',
            }}
          >
            Save
          </button>
          <button
            onClick={handleSaveAndRegenerate}
            disabled={saving}
            style={{
              ...headerBtnBase,
              background: saving ? 'rgba(201,168,76,0.5)' : GOLD,
              color: '#fff',
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Working…' : 'Save & Regenerate PDF'}
          </button>
        </div>

        <div style={{ fontSize: 10, opacity: 0.4, textAlign: 'right', lineHeight: 1.5, marginLeft: 4 }}>
          {mode === 'add-room'
            ? <>Click to place corners<br />Click first corner or Enter to close · Esc to cancel</>
            : mode === 'wall-move'
            ? <>Drag endpoint dots to reshape walls<br />Adjacent walls follow · Esc to exit</>
            : mode === 'add-text'
            ? <>Click canvas to place a text label<br />Double-click label to edit · Esc to cancel</>
            : mode === 'build-walls'
            ? <>Click to set start point · type a length & direction<br />Walls snap to grid · Esc to cancel</>
            : <>Right-click drag to pan<br />Scroll to zoom · Click to select</>
          }
        </div>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Canvas area */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <FloorPlanCanvas
            rawScan={plan.raw_scan}
            layoutOverrides={pendingOverrides}
            selection={selection}
            onSelectionChange={setSelection}
            width={canvasSize.width}
            height={canvasSize.height}
            mode={mode}
            drawingPolygon={drawingPolygon}
            onDrawingPolygonChange={setDrawingPolygon}
            onPolygonClosed={handlePolygonClosed}
            liveWallEndpointDrag={dragState ? { key: dragState.key, newPos: dragState.livePos } : null}
            onWallEndpointDrag={handleWallEndpointDrag}
            onWallEndpointMove={handleWallEndpointMove}
            mergePreviewPolygon={mergePreviewPolygon}
            onTextAnnotationsChange={handleTextAnnotationChange}
            buildState={buildState}
            onBuildAnchorPlaced={handleBuildAnchorPlaced}
            onLabelMove={handleLabelMove}
          />
        </div>

        {/* Side panel */}
        <div style={{
          width: 280, flexShrink: 0, background: '#fff',
          borderLeft: '1px solid rgba(10,31,68,0.08)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(10,31,68,0.06)' }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: NAVY }}>Selection</div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
            {selRoomCount === 0 && selWallCount === 0 && selAnnotCount === 0 && (
              <div style={{ color: '#aaa', fontSize: 13, lineHeight: 1.5 }}>
                Click a room or wall to inspect it.
              </div>
            )}
            {selRoomCount > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 8 }}>
                  Rooms ({selRoomCount})
                </div>
                {selection.roomIds.map(id => {
                  const effectiveScan = applyOverridesToScan(plan.raw_scan, pendingOverrides);
                  const room = effectiveScan.rooms?.find(r => r.id === id);
                  return (
                    <div key={id} style={{
                      padding: '8px 12px', background: 'rgba(10,31,68,0.04)',
                      borderRadius: 6, marginBottom: 6, fontSize: 13, color: NAVY,
                      border: '1px solid rgba(10,31,68,0.08)',
                    }}>
                      {room?.name || id}
                      {room?.sqft && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: '#888' }}>{room.sqft} sf</span>
                      )}
                    </div>
                  );
                })}
                {/* Single-room tools: rename + SF toggle */}
                {selRoomCount === 1 && (() => {
                  const roomId = selection.roomIds[0];
                  const effectiveScan = applyOverridesToScan(plan.raw_scan, pendingOverrides);
                  const room = effectiveScan.rooms?.find(r => r.id === roomId);
                  if (!room) return null;
                  const currentName = room.name || '';
                  return (
                    <div style={{ marginTop: 12, padding: '12px', background: 'rgba(10,31,68,0.04)', borderRadius: 8 }}>
                      <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#888', marginBottom: 6, fontWeight: 700 }}>
                        Room name
                      </label>
                      <input
                        type="text"
                        value={renameInputValue !== null ? renameInputValue : currentName}
                        onChange={(e) => setRenameInputValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRename(roomId);
                          if (e.key === 'Escape') setRenameInputValue(null);
                        }}
                        onBlur={() => {
                          if (renameInputValue !== null && renameInputValue.trim() !== currentName) {
                            commitRename(roomId);
                          } else {
                            setRenameInputValue(null);
                          }
                        }}
                        placeholder="e.g. Master Suite"
                        style={{
                          width: '100%', padding: '8px 10px', fontSize: 13,
                          border: '1px solid rgba(10,31,68,0.2)', borderRadius: 6,
                          boxSizing: 'border-box', fontFamily: "'DM Sans', sans-serif",
                          outline: 'none',
                        }}
                      />
                      <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>
                        Enter to save · Esc to cancel
                      </div>
                      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: '#fff', borderRadius: 6, border: '1px solid rgba(10,31,68,0.08)' }}>
                        <label style={{ fontSize: 12, color: NAVY, cursor: 'pointer' }}>
                          Show square footage
                        </label>
                        <input
                          type="checkbox"
                          checked={getSfVisible(roomId)}
                          onChange={(e) => toggleSfVisible(roomId, e.target.checked)}
                          style={{ cursor: 'pointer', width: 16, height: 16 }}
                        />
                      </div>
                      {pendingOverrides[roomId]?.label_x !== undefined && (
                        <button
                          onClick={() => handleLabelMove({ roomId, reset: true })}
                          style={{
                            width: '100%', padding: '7px 12px', marginTop: 8,
                            background: '#fff', border: '1px solid rgba(10,31,68,0.2)',
                            borderRadius: 6, fontSize: 12, color: '#666',
                            cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                          }}
                        >
                          Reset label to auto-position
                        </button>
                      )}
                    </div>
                  );
                })()}
                {selRoomCount >= 2 && mode === 'select' && (
                  <button
                    onClick={initiateMerge}
                    style={{
                      width: '100%', padding: '9px 14px', marginTop: 4,
                      background: NAVY, color: CREAM,
                      border: 'none', borderRadius: 8, fontWeight: 700,
                      fontSize: 13, cursor: 'pointer',
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    Merge {selRoomCount} Rooms
                  </button>
                )}
              </div>
            )}
            {selWallCount > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 8 }}>
                  Walls ({selWallCount})
                </div>
                {selection.wallIds.map(id => (
                  <div key={id} style={{
                    padding: '8px 12px', background: 'rgba(10,31,68,0.04)',
                    borderRadius: 6, marginBottom: 6, fontSize: 11, color: '#555',
                    fontFamily: 'monospace', wordBreak: 'break-all',
                    border: '1px solid rgba(10,31,68,0.08)',
                  }}>
                    {id}
                  </div>
                ))}
              </div>
            )}

            {selAnnotCount > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 8 }}>
                  Text Labels ({selAnnotCount})
                </div>
                {(selection.annotationIds || []).map(id => {
                  const ann = (pendingOverrides.text_annotations || []).find(t => t.id === id);
                  return (
                    <div key={id} style={{
                      padding: '8px 12px', background: 'rgba(10,31,68,0.04)',
                      borderRadius: 6, marginBottom: 6, fontSize: 13, color: NAVY,
                      border: '1px solid rgba(10,31,68,0.08)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <span>{ann?.text || '(empty)'}</span>
                      <button
                        onClick={() => {
                          if (ann) setEditingAnnotation({ id: ann.id, text: ann.text });
                        }}
                        style={{
                          padding: '3px 8px', border: '1px solid rgba(10,31,68,0.2)',
                          borderRadius: 4, background: '#fff', color: NAVY,
                          fontSize: 11, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Delete selected (Phase 5c-6) — shown when rooms or annotations are selected */}
            {(selRoomCount > 0 || selAnnotCount > 0) && (
              <button
                onClick={() => {
                  if (window.confirm(`Delete ${selRoomCount + selAnnotCount} item(s)?`)) {
                    deleteSelected();
                  }
                }}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  background: 'rgba(196,68,68,0.1)',
                  color: '#c44',
                  border: '1px solid rgba(196,68,68,0.4)',
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  marginBottom: 8,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                🗑 Delete {selRoomCount + selAnnotCount} item{(selRoomCount + selAnnotCount) === 1 ? '' : 's'}
              </button>
            )}

            {/* Edit tools */}
            <div style={{ marginTop: selRoomCount === 0 && selWallCount === 0 && selAnnotCount === 0 ? 16 : 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 10 }}>
                Edit Tools
              </div>
              <button
                onClick={() => {
                  if (mode === 'add-room') {
                    setMode('select');
                    setDrawingPolygon([]);
                  } else {
                    setMode('add-room');
                    setDrawingPolygon([]);
                    setDragState(null);
                    setSelection({ roomIds: [], wallIds: [], annotationIds: [] });
                  }
                }}
                style={{
                  width: '100%',
                  padding: '9px 14px',
                  background: mode === 'add-room' ? GOLD : NAVY,
                  color: mode === 'add-room' ? NAVY : CREAM,
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  marginBottom: 8,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {mode === 'add-room' ? 'Cancel Add Room' : '+ Add Room'}
              </button>
              {mode === 'add-room' && (
                <div style={{ fontSize: 11, color: '#666', lineHeight: 1.6, padding: '8px 10px', background: 'rgba(201,168,76,0.08)', borderRadius: 6, marginBottom: 8 }}>
                  Click to place corners. Click the first corner (gold dot) or press Enter to close. Press Esc to cancel.
                </div>
              )}
              <button
                onClick={() => {
                  if (mode === 'wall-move') {
                    setMode('select');
                    setDragState(null);
                  } else {
                    setMode('wall-move');
                    setDragState(null);
                    setDrawingPolygon([]);
                    setSelection({ roomIds: [], wallIds: [], annotationIds: [] });
                  }
                }}
                style={{
                  width: '100%',
                  padding: '9px 14px',
                  background: mode === 'wall-move' ? GOLD : NAVY,
                  color: mode === 'wall-move' ? NAVY : CREAM,
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  marginBottom: 8,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {mode === 'wall-move' ? 'Exit Move Walls' : '↔ Move Walls'}
              </button>
              {mode === 'wall-move' && (
                <div style={{ fontSize: 11, color: '#666', lineHeight: 1.6, padding: '8px 10px', background: 'rgba(201,168,76,0.08)', borderRadius: 6, marginBottom: 8 }}>
                  Drag any endpoint dot to reshape rooms. Hold <strong>Shift</strong> to constrain to wall axis. Snaps to other endpoints within 6". Esc to cancel.
                </div>
              )}
              <button
                onClick={() => {
                  if (mode === 'add-text') {
                    setMode('select');
                  } else {
                    setMode('add-text');
                    setDrawingPolygon([]);
                    setDragState(null);
                    setSelection({ roomIds: [], wallIds: [], annotationIds: [] });
                  }
                }}
                style={{
                  width: '100%',
                  padding: '9px 14px',
                  background: mode === 'add-text' ? GOLD : NAVY,
                  color: mode === 'add-text' ? NAVY : CREAM,
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  marginBottom: 8,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {mode === 'add-text' ? 'Cancel Add Text' : 'T  Add Text Label'}
              </button>
              {mode === 'add-text' && (
                <div style={{ fontSize: 11, color: '#666', lineHeight: 1.6, padding: '8px 10px', background: 'rgba(201,168,76,0.08)', borderRadius: 6, marginBottom: 8 }}>
                  Click anywhere on the canvas to place a text label. Type a name then Save. Drag to reposition. Double-click to edit. Esc to cancel.
                </div>
              )}
              <button
                onClick={() => {
                  if (mode === 'build-walls') {
                    setMode('select');
                    setBuildState(null);
                    setLengthInput(null);
                  } else {
                    setMode('build-walls');
                    setBuildState(null);
                    setLengthInput(null);
                    setDrawingPolygon([]);
                    setDragState(null);
                    setSelection({ roomIds: [], wallIds: [], annotationIds: [] });
                  }
                }}
                style={{
                  width: '100%',
                  padding: '9px 14px',
                  background: mode === 'build-walls' ? GOLD : NAVY,
                  color: mode === 'build-walls' ? NAVY : CREAM,
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  marginBottom: 8,
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                {mode === 'build-walls' ? 'Cancel Build Walls' : '📐 Build Walls'}
              </button>
              {mode === 'build-walls' && !buildState && (
                <div style={{ fontSize: 11, color: '#666', lineHeight: 1.6, padding: '8px 10px', background: 'rgba(201,168,76,0.08)', borderRadius: 6 }}>
                  Click on the canvas to set the first corner. Then type each wall length and direction. Close the polygon to finish. Esc to cancel.
                </div>
              )}
              {mode === 'build-walls' && buildState && (
                <div style={{ fontSize: 11, color: '#666', lineHeight: 1.6, padding: '8px 10px', background: 'rgba(201,168,76,0.08)', borderRadius: 6 }}>
                  {buildState.accumulated.length - 1} wall{buildState.accumulated.length !== 2 ? 's' : ''} drawn. Type the next length and direction in the modal. Esc to cancel.
                </div>
              )}
            </div>

            {/* Versions */}
            {versions.length > 0 && (
              <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(10,31,68,0.08)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 8 }}>
                  Versions ({versions.length})
                </div>
                {versions.slice(0, 8).map(v => {
                  const isCurrent = v.version_number === plan.current_pdf_version;
                  return (
                    <div key={v.id} style={{
                      padding: '8px 10px', marginBottom: 6, borderRadius: 6,
                      background: isCurrent ? 'rgba(201,168,76,0.12)' : 'rgba(10,31,68,0.04)',
                      border: isCurrent ? '1px solid rgba(201,168,76,0.3)' : '1px solid transparent',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 12, color: NAVY }}>
                            v{v.version_number}
                            {isCurrent && <span style={{ marginLeft: 6, fontSize: 10, color: GOLD, fontWeight: 700 }}>CURRENT</span>}
                          </div>
                          <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>
                            {new Date(v.created_at).toLocaleString()}
                          </div>
                          {v.sent_at && (
                            <div style={{ fontSize: 10, color: '#22a55e', marginTop: 2 }}>
                              Sent {new Date(v.sent_at).toLocaleDateString()} · {(v.sent_to || []).length} recipient(s)
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                          {v.pdf_url && (
                            <a
                              href={v.pdf_url}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                fontSize: 10, padding: '4px 8px',
                                background: 'rgba(10,31,68,0.08)', color: NAVY,
                                borderRadius: 4, textDecoration: 'none', textAlign: 'center',
                              }}
                            >
                              Open
                            </a>
                          )}
                          <button
                            onClick={() => setSendingVersion(v)}
                            style={{
                              fontSize: 10, padding: '4px 8px',
                              background: NAVY, color: CREAM,
                              border: 'none', borderRadius: 4,
                              cursor: 'pointer', fontWeight: 600,
                            }}
                          >
                            Send
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {versions.length > 8 && (
                  <div style={{ fontSize: 10, opacity: 0.45, paddingLeft: 10 }}>
                    + {versions.length - 8} older
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Length input modal — rendered during build-walls session */}
      {lengthInput && (
        <div style={{
          position: 'fixed', inset: 0, background: 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2300, fontFamily: "'DM Sans', sans-serif",
          pointerEvents: 'none',
        }}>
          <div style={{
            background: '#fff', padding: 24, borderRadius: 12,
            minWidth: 340, maxWidth: '90vw',
            boxShadow: '0 8px 40px rgba(10,31,68,0.35)',
            pointerEvents: 'all',
          }}>
            <h3 style={{ marginTop: 0, marginBottom: 6, color: NAVY, fontFamily: "'DM Serif Display', serif", fontSize: 18 }}>
              Draw Wall
            </h3>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
              {buildState?.accumulated?.length > 1
                ? `${buildState.accumulated.length - 1} wall${buildState.accumulated.length !== 2 ? 's' : ''} placed · click direction then type length`
                : 'Type a length, choose a direction'}
            </div>

            {/* Direction picker — + layout */}
            <div style={{ display: 'grid', gridTemplateColumns: '44px 44px 44px', gridTemplateRows: '44px 44px 44px', gap: 4, justifyContent: 'center', marginBottom: 16 }}>
              {/* Row 1: [empty] [N] [empty] */}
              <div />
              {['N'].map(dir => (
                <button key={dir} onClick={() => setLengthInput(prev => ({ ...prev, direction: dir, error: null }))}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowUp') setLengthInput(p => ({ ...p, direction: 'N', error: null }));
                    if (e.key === 'ArrowDown') setLengthInput(p => ({ ...p, direction: 'S', error: null }));
                    if (e.key === 'ArrowLeft') setLengthInput(p => ({ ...p, direction: 'W', error: null }));
                    if (e.key === 'ArrowRight') setLengthInput(p => ({ ...p, direction: 'E', error: null }));
                  }}
                  style={{
                    width: 44, height: 44, borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14,
                    background: lengthInput.direction === dir ? NAVY : 'rgba(10,31,68,0.08)',
                    color: lengthInput.direction === dir ? CREAM : NAVY,
                  }}>N</button>
              ))}
              <div />
              {/* Row 2: [W] [center dot] [E] */}
              {['W'].map(dir => (
                <button key={dir} onClick={() => setLengthInput(prev => ({ ...prev, direction: dir, error: null }))}
                  style={{
                    width: 44, height: 44, borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14,
                    background: lengthInput.direction === dir ? NAVY : 'rgba(10,31,68,0.08)',
                    color: lengthInput.direction === dir ? CREAM : NAVY,
                  }}>W</button>
              ))}
              <div style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'rgba(10,31,68,0.2)' }} />
              </div>
              {['E'].map(dir => (
                <button key={dir} onClick={() => setLengthInput(prev => ({ ...prev, direction: dir, error: null }))}
                  style={{
                    width: 44, height: 44, borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14,
                    background: lengthInput.direction === dir ? NAVY : 'rgba(10,31,68,0.08)',
                    color: lengthInput.direction === dir ? CREAM : NAVY,
                  }}>E</button>
              ))}
              {/* Row 3: [empty] [S] [empty] */}
              <div />
              {['S'].map(dir => (
                <button key={dir} onClick={() => setLengthInput(prev => ({ ...prev, direction: dir, error: null }))}
                  style={{
                    width: 44, height: 44, borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14,
                    background: lengthInput.direction === dir ? NAVY : 'rgba(10,31,68,0.08)',
                    color: lengthInput.direction === dir ? CREAM : NAVY,
                  }}>S</button>
              ))}
              <div />
            </div>

            <input
              type="text"
              autoFocus
              value={lengthInput.length}
              onChange={(e) => setLengthInput(prev => ({ ...prev, length: e.target.value, error: null }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmLengthInput();
                if (e.key === 'Escape') cancelLengthInput();
                if (e.key === 'ArrowUp') { e.preventDefault(); setLengthInput(p => ({ ...p, direction: 'N', error: null })); }
                if (e.key === 'ArrowDown') { e.preventDefault(); setLengthInput(p => ({ ...p, direction: 'S', error: null })); }
                if (e.key === 'ArrowLeft') { e.preventDefault(); setLengthInput(p => ({ ...p, direction: 'W', error: null })); }
                if (e.key === 'ArrowRight') { e.preventDefault(); setLengthInput(p => ({ ...p, direction: 'E', error: null })); }
              }}
              placeholder="e.g. 10'6  or  10.5  or  10 6"
              style={{
                width: '100%', padding: '10px 12px', fontSize: 15,
                border: `1px solid ${lengthInput.error ? '#e44' : 'rgba(10,31,68,0.2)'}`, borderRadius: 6,
                marginBottom: 6, boxSizing: 'border-box',
                fontFamily: 'monospace', outline: 'none',
              }}
            />
            {lengthInput.error && (
              <div style={{ fontSize: 11, color: '#c44', marginBottom: 10 }}>{lengthInput.error}</div>
            )}
            {!lengthInput.error && (
              <div style={{ fontSize: 10, color: '#aaa', marginBottom: 10 }}>
                Arrow keys change direction · Enter to draw · Esc to cancel
              </div>
            )}

            {/* Close-back hint */}
            {buildState?.accumulated?.length >= 3 && (
              <div style={{ fontSize: 11, color: GOLD, padding: '6px 10px', background: 'rgba(201,168,76,0.08)', borderRadius: 6, marginBottom: 12 }}>
                Polygon has {buildState.accumulated.length - 1} walls. Type a length that reaches back to the start to auto-close.
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={cancelLengthInput}
                style={{
                  padding: '8px 18px', borderRadius: 6, border: '1px solid rgba(10,31,68,0.2)',
                  background: '#fff', color: NAVY, cursor: 'pointer',
                  fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmLengthInput}
                style={{
                  padding: '8px 18px', borderRadius: 6, border: 'none',
                  background: NAVY, color: CREAM, cursor: 'pointer',
                  fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
                }}
              >
                Draw Wall →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Naming modal — rendered when polygon is closed */}
      {pendingNewRoom && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2200, fontFamily: "'DM Sans', sans-serif",
        }}>
          <div style={{
            background: '#fff', padding: 28, borderRadius: 12,
            minWidth: 340, maxWidth: '90vw',
            boxShadow: '0 8px 40px rgba(10,31,68,0.25)',
          }}>
            <h3 style={{ marginTop: 0, marginBottom: 16, color: NAVY, fontFamily: "'DM Serif Display', serif", fontSize: 20 }}>
              Name this room
            </h3>
            <input
              type="text"
              autoFocus
              value={pendingNewRoom.name !== '' ? pendingNewRoom.name : pendingNewRoom.defaultName}
              onChange={(e) => setPendingNewRoom(r => ({ ...r, name: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmAddRoom();
                if (e.key === 'Escape') cancelAddRoom();
              }}
              placeholder={pendingNewRoom.defaultName}
              style={{
                width: '100%', padding: '10px 12px', fontSize: 15,
                border: '1px solid rgba(10,31,68,0.2)', borderRadius: 6,
                marginBottom: 20, boxSizing: 'border-box',
                fontFamily: "'DM Sans', sans-serif",
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={cancelAddRoom}
                style={{
                  padding: '8px 18px', borderRadius: 6, border: '1px solid rgba(10,31,68,0.2)',
                  background: '#fff', color: NAVY, cursor: 'pointer',
                  fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmAddRoom}
                style={{
                  padding: '8px 18px', borderRadius: 6, border: 'none',
                  background: NAVY, color: CREAM, cursor: 'pointer',
                  fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
                }}
              >
                Add Room
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Text annotation edit modal */}
      {editingAnnotation && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2200, fontFamily: "'DM Sans', sans-serif",
        }}>
          <div style={{
            background: '#fff', padding: 28, borderRadius: 12,
            minWidth: 380, maxWidth: '90vw',
            boxShadow: '0 8px 40px rgba(10,31,68,0.25)',
          }}>
            <h3 style={{ marginTop: 0, marginBottom: 16, color: NAVY, fontFamily: "'DM Serif Display', serif", fontSize: 20 }}>
              Text Label
            </h3>
            <input
              type="text"
              autoFocus
              value={editingAnnotation.text}
              onChange={(e) => setEditingAnnotation(a => ({ ...a, text: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitAnnotationText();
                if (e.key === 'Escape') cancelAnnotationEdit();
              }}
              placeholder="e.g. Kitchen, Living Room, Future Pantry"
              style={{
                width: '100%', padding: '10px 12px', fontSize: 15,
                border: '1px solid rgba(10,31,68,0.2)', borderRadius: 6,
                marginBottom: 20, boxSizing: 'border-box',
                fontFamily: "'DM Sans', sans-serif", outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={() => deleteAnnotation(editingAnnotation.id)}
                style={{
                  padding: '8px 16px', borderRadius: 6, border: '1px solid #e44',
                  background: '#fff', color: '#c33', cursor: 'pointer',
                  fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
                }}
              >
                Delete
              </button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={cancelAnnotationEdit}
                  style={{
                    padding: '8px 18px', borderRadius: 6, border: '1px solid rgba(10,31,68,0.2)',
                    background: '#fff', color: NAVY, cursor: 'pointer',
                    fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={commitAnnotationText}
                  style={{
                    padding: '8px 18px', borderRadius: 6, border: 'none',
                    background: NAVY, color: CREAM, cursor: 'pointer',
                    fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Merge confirm modal */}
      {pendingMerge && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2200, fontFamily: "'DM Sans', sans-serif",
        }}>
          <div style={{
            background: '#fff', padding: 28, borderRadius: 12,
            minWidth: 380, maxWidth: '90vw',
            boxShadow: '0 8px 40px rgba(10,31,68,0.25)',
          }}>
            <h3 style={{ marginTop: 0, marginBottom: 16, color: NAVY, fontFamily: "'DM Serif Display', serif", fontSize: 20 }}>
              Merge {pendingMerge.source_rooms.length} Rooms
            </h3>
            <div style={{ marginBottom: 16, fontSize: 13, color: '#666' }}>
              Combining:
              <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                {pendingMerge.source_rooms.map(r => (
                  <li key={r.id} style={{ marginBottom: 3 }}>{r.name || r.id}</li>
                ))}
              </ul>
            </div>
            <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 6 }}>
              Name for merged room
            </label>
            <input
              type="text"
              autoFocus
              value={pendingMerge.name}
              onChange={(e) => setPendingMerge(m => ({ ...m, name: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmMerge();
                if (e.key === 'Escape') cancelMerge();
              }}
              style={{
                width: '100%', padding: '10px 12px', fontSize: 15,
                border: '1px solid rgba(10,31,68,0.2)', borderRadius: 6,
                marginBottom: 14, boxSizing: 'border-box',
                fontFamily: "'DM Sans', sans-serif", outline: 'none',
              }}
            />
            <div style={{ fontSize: 11, color: '#888', marginBottom: 20, padding: '8px 10px', background: 'rgba(10,31,68,0.04)', borderRadius: 6 }}>
              The wall between merged rooms will be removed. Revert by discarding changes before saving.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={cancelMerge}
                style={{
                  padding: '8px 18px', borderRadius: 6, border: '1px solid rgba(10,31,68,0.2)',
                  background: '#fff', color: NAVY, cursor: 'pointer',
                  fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmMerge}
                style={{
                  padding: '8px 18px', borderRadius: 6, border: 'none',
                  background: NAVY, color: CREAM, cursor: 'pointer',
                  fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
                }}
              >
                Merge Rooms
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send floor plan modal (Phase 5e) */}
      {sendingVersion && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2200, fontFamily: "'DM Sans', sans-serif", padding: 20,
        }}>
          <div style={{
            background: '#fff', padding: 28, borderRadius: 12,
            maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto',
            boxShadow: '0 8px 40px rgba(10,31,68,0.3)',
          }}>
            <h3 style={{ marginTop: 0, marginBottom: 6, color: NAVY, fontFamily: "'DM Serif Display', serif", fontSize: 20 }}>
              Send v{sendingVersion.version_number}
            </h3>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 20 }}>
              {plan.name} · {new Date(sendingVersion.created_at).toLocaleDateString()}
            </div>

            {/* Job client quick-pick */}
            {jobClient?.email && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#888', marginBottom: 6 }}>
                  Job client
                </label>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                  border: '1px solid rgba(10,31,68,0.12)', borderRadius: 6, cursor: 'pointer',
                }}>
                  <input
                    type="checkbox"
                    checked={sendRecipient.includeJobClient}
                    onChange={(e) => setSendRecipient(s => ({ ...s, includeJobClient: e.target.checked }))}
                    style={{ width: 16, height: 16, flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{jobClient.name || 'Client'}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>{jobClient.email}</div>
                  </div>
                </label>
              </div>
            )}

            {/* Previously sent — quick-pick pills */}
            {previouslySentEmails.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#888', marginBottom: 6 }}>
                  Previously sent to
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {previouslySentEmails.map(email => {
                    const inText = sendRecipient.freeText.toLowerCase().includes(email);
                    return (
                      <button
                        key={email}
                        onClick={() => setSendRecipient(s => {
                          const list = parseEmailList(s.freeText).filter(e => e !== email);
                          if (inText) return { ...s, freeText: list.join(', ') };
                          return { ...s, freeText: s.freeText ? `${s.freeText.trimEnd()}, ${email}` : email };
                        })}
                        style={{
                          fontSize: 11, padding: '4px 10px',
                          background: inText ? GOLD : 'rgba(10,31,68,0.06)',
                          color: NAVY, border: 'none', borderRadius: 4,
                          cursor: 'pointer', fontWeight: 600,
                        }}
                      >
                        {email}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Free-text email input */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#888', marginBottom: 6 }}>
                Email address(es)
              </label>
              <input
                type="text"
                value={sendRecipient.freeText}
                onChange={(e) => setSendRecipient(s => ({ ...s, freeText: e.target.value }))}
                placeholder="client@example.com, another@example.com"
                style={{
                  width: '100%', padding: '10px 12px', fontSize: 14,
                  border: '1px solid rgba(10,31,68,0.2)', borderRadius: 6,
                  boxSizing: 'border-box', fontFamily: "'DM Sans', sans-serif", outline: 'none',
                }}
              />
            </div>

            {/* Custom message */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#888', marginBottom: 6 }}>
                Message (optional)
              </label>
              <textarea
                value={sendRecipient.customMessage}
                onChange={(e) => setSendRecipient(s => ({ ...s, customMessage: e.target.value }))}
                placeholder="Here's the updated floor plan with the changes we discussed..."
                rows={3}
                style={{
                  width: '100%', padding: '10px 12px', fontSize: 14,
                  border: '1px solid rgba(10,31,68,0.2)', borderRadius: 6,
                  boxSizing: 'border-box', resize: 'vertical',
                  fontFamily: "'DM Sans', sans-serif", outline: 'none',
                }}
              />
            </div>

            {/* Resolved recipients preview */}
            {resolvedRecipients.length > 0 && (
              <div style={{
                padding: '10px 12px', background: 'rgba(201,168,76,0.08)',
                borderRadius: 6, marginBottom: 16, fontSize: 12, color: NAVY,
              }}>
                <strong>Sending to {resolvedRecipients.length}:</strong>{' '}
                {resolvedRecipients.join(', ')}
              </div>
            )}

            {sendError && (
              <div style={{ color: '#c44', fontSize: 12, marginBottom: 16, padding: '8px 12px', background: 'rgba(196,68,68,0.06)', borderRadius: 4 }}>
                {sendError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSendingVersion(null)}
                disabled={sendInFlight}
                style={{
                  padding: '8px 18px', borderRadius: 6, border: '1px solid rgba(10,31,68,0.2)',
                  background: '#fff', color: NAVY, cursor: 'pointer',
                  fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                onClick={executeSend}
                disabled={sendInFlight || resolvedRecipients.length === 0}
                style={{
                  padding: '8px 18px', borderRadius: 6, border: 'none',
                  background: (sendInFlight || resolvedRecipients.length === 0) ? 'rgba(10,31,68,0.3)' : NAVY,
                  color: CREAM,
                  cursor: (sendInFlight || resolvedRecipients.length === 0) ? 'not-allowed' : 'pointer',
                  fontSize: 13, fontFamily: "'DM Sans', sans-serif", fontWeight: 700,
                }}
              >
                {sendInFlight ? 'Sending…' : `Send to ${resolvedRecipients.length || '—'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
