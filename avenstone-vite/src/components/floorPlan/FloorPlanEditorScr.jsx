import { useState, useEffect, useMemo } from 'react';
import polygonClipping from 'polygon-clipping';
import { sbLoadFloorPlan, sbUpdateFloorPlanOverrides, sbRegenerateFloorPlanPdf } from '../../lib/supabase';
import { buildFloorPlanPDF } from '../../lib/pdf';
import { applyOverridesToScan } from '../../lib/floorPlan/applyOverrides';
import FloorPlanCanvas from './FloorPlanCanvas';

const NAVY = '#0A1F44';
const GOLD = '#C9A84C';
const CREAM = '#F7F5F0';
const DESKTOP_MIN_WIDTH = 1024;

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

  // Persistence state
  const [pendingOverrides, setPendingOverrides] = useState({});
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSavedVersion, setLastSavedVersion] = useState(null);

  // Edit mode state
  const [mode, setMode] = useState('select'); // 'select' | 'add-room' | 'wall-move' | 'add-text'
  const [editingAnnotation, setEditingAnnotation] = useState(null); // { id, text } when modal open
  const [drawingPolygon, setDrawingPolygon] = useState([]); // [[worldX, worldY], ...]
  const [pendingNewRoom, setPendingNewRoom] = useState(null); // { polygon, defaultName, name }
  const [dragState, setDragState] = useState(null); // { key, livePos: [x, y] } | null
  const [pendingMerge, setPendingMerge] = useState(null); // { source_room_ids, name, candidate_polygon, source_rooms }

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
      setPendingOverrides(result.data.plan?.layout_overrides || {});
      setIsDirty(false);
      setLastSavedVersion(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [floorPlanId]);

  const updateOverrides = (newOverrides) => {
    setPendingOverrides(newOverrides);
    setIsDirty(true);
    setSaveError(null);
  };

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

  // Keyboard handler for edit modes
  useEffect(() => {
    function onKey(e) {
      if (pendingNewRoom || pendingMerge || editingAnnotation) return; // modal is up, don't intercept
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
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, drawingPolygon, pendingNewRoom, pendingMerge, editingAnnotation]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setIsDirty(false);
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
                  const room = plan.raw_scan?.rooms?.find(r => r.id === id);
                  const overrideName = pendingOverrides[id]?.name;
                  return (
                    <div key={id} style={{
                      padding: '8px 12px', background: 'rgba(10,31,68,0.04)',
                      borderRadius: 6, marginBottom: 6, fontSize: 13, color: NAVY,
                      border: '1px solid rgba(10,31,68,0.08)',
                    }}>
                      {overrideName || room?.name || id}
                      {room?.sqft && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: '#888' }}>{room.sqft} sf</span>
                      )}
                    </div>
                  );
                })}
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
                  Drag endpoint dots to reshape walls. Adjacent walls follow automatically. Press Esc to exit.
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
                <div style={{ fontSize: 11, color: '#666', lineHeight: 1.6, padding: '8px 10px', background: 'rgba(201,168,76,0.08)', borderRadius: 6 }}>
                  Click anywhere on the canvas to place a text label. Type a name then Save. Drag to reposition. Double-click to edit. Esc to cancel.
                </div>
              )}
            </div>

            {/* Versions */}
            {versions.length > 0 && (
              <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(10,31,68,0.08)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 8 }}>
                  Versions ({versions.length})
                </div>
                {versions.slice(0, 5).map(v => (
                  <div key={v.id} style={{
                    padding: '6px 10px', fontSize: 12, borderRadius: 6, marginBottom: 4,
                    background: v.version_number === plan.current_pdf_version
                      ? 'rgba(201,168,76,0.12)' : 'transparent',
                  }}>
                    <a
                      href={v.pdf_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: NAVY, textDecoration: 'none' }}
                    >
                      v{v.version_number} · {new Date(v.created_at).toLocaleDateString()}
                    </a>
                    {v.sent_at && (
                      <div style={{ fontSize: 10, opacity: 0.55, marginTop: 2 }}>
                        Sent {new Date(v.sent_at).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                ))}
                {versions.length > 5 && (
                  <div style={{ fontSize: 10, opacity: 0.45, paddingLeft: 10 }}>
                    + {versions.length - 5} older
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

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
    </div>
  );
}
