import { useState, useEffect } from 'react';
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
  const [mode, setMode] = useState('select'); // 'select' | 'add-room'
  const [drawingPolygon, setDrawingPolygon] = useState([]); // [[worldX, worldY], ...]
  const [pendingNewRoom, setPendingNewRoom] = useState(null); // { polygon, defaultName, name }

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

  // Keyboard handler for add-room mode
  useEffect(() => {
    function onKey(e) {
      if (pendingNewRoom) return; // modal is up, don't intercept
      if (mode === 'add-room') {
        if (e.key === 'Escape') {
          setMode('select');
          setDrawingPolygon([]);
        } else if (e.key === 'Enter' && drawingPolygon.length >= 3) {
          handlePolygonClosed(drawingPolygon);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, drawingPolygon, pendingNewRoom]); // eslint-disable-line react-hooks/exhaustive-deps

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
            {selRoomCount === 0 && selWallCount === 0 && (
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

            {/* Edit tools */}
            <div style={{ marginTop: selRoomCount === 0 && selWallCount === 0 ? 16 : 8 }}>
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
                    setSelection({ roomIds: [], wallIds: [] });
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
                <div style={{ fontSize: 11, color: '#666', lineHeight: 1.6, padding: '8px 10px', background: 'rgba(201,168,76,0.08)', borderRadius: 6 }}>
                  Click to place corners. Click the first corner (gold dot) or press Enter to close. Press Esc to cancel.
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
    </div>
  );
}
