import { useState, useEffect } from 'react';
import { sbLoadFloorPlan } from '../../lib/supabase';
import FloorPlanCanvas from './FloorPlanCanvas';

const NAVY = '#0A1F44';
const GOLD = '#C9A84C';
const CREAM = '#F7F5F0';
const DESKTOP_MIN_WIDTH = 1024;

export default function FloorPlanEditorScr({ floorPlanId, onBack }) {
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' && window.innerWidth >= DESKTOP_MIN_WIDTH
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [plan, setPlan] = useState(null);
  const [selection, setSelection] = useState({ roomIds: [], wallIds: [] });
  const [canvasSize, setCanvasSize] = useState({ width: 1000, height: 680 });

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
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [floorPlanId]);

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

  return (
    <div style={{
      position: 'fixed', inset: 0, background: CREAM, zIndex: 2100,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '10px 20px',
        background: NAVY, color: CREAM, gap: 16,
        borderBottom: `3px solid ${GOLD}`,
        flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'transparent', border: '1px solid rgba(247,245,240,0.35)',
            color: CREAM, padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
            fontSize: 13, fontFamily: "'DM Sans', sans-serif",
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
        <div style={{ fontSize: 11, opacity: 0.5, textAlign: 'right', lineHeight: 1.5 }}>
          Right-click drag to pan · Scroll to zoom<br />
          Click to select · Shift-click multi-select
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
            layoutOverrides={plan.layout_overrides || {}}
            selection={selection}
            onSelectionChange={setSelection}
            width={canvasSize.width}
            height={canvasSize.height}
          />
        </div>

        {/* Side panel */}
        <div style={{
          width: 280, flexShrink: 0, background: '#fff',
          borderLeft: '1px solid rgba(10,31,68,0.08)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(10,31,68,0.06)' }}>
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
                  return (
                    <div key={id} style={{
                      padding: '8px 12px', background: 'rgba(10,31,68,0.04)',
                      borderRadius: 6, marginBottom: 6, fontSize: 13, color: NAVY,
                      border: '1px solid rgba(10,31,68,0.08)',
                    }}>
                      {room?.name || id}
                      {room?.sqft && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: '#888' }}>
                          {room.sqft} sf
                        </span>
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

            {/* Future edit tools stub */}
            <div style={{
              marginTop: 24, padding: 14,
              background: 'rgba(201,168,76,0.06)',
              border: '1px dashed rgba(201,168,76,0.35)',
              borderRadius: 8,
            }}>
              <div style={{ fontSize: 11, color: '#997', fontStyle: 'italic', lineHeight: 1.5 }}>
                Edit tools coming in next slices:
                <br />Add Room · Move Wall · Merge Rooms · Delete + Undo
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
