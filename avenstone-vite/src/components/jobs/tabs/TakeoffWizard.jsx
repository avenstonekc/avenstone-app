import { useState, useCallback } from 'react';
import { sbBuildTakeoffDraft, sbLoadCustomTakeoffLines, AV_TENANT, AV_USER_ID } from '../../../lib/supabase';
import { acceptTakeoffDraft } from '../../../lib/takeoff';
import { f$ } from '../../../lib/utils';
import AddCustomLineModal from './takeoff/AddCustomLineModal';

const NAV = '#0A1F44';
const GOLD = '#C9A84C';
const CREAM = '#F7F5F0';
const BORDER = '#E8E4DC';
const WARN_BG = '#FFFBEB';
const WARN_BORDER = '#FCD34D';

const ROOM_TYPES = [
  { id: 'bathroom', lb: 'Bathroom' },
  { id: 'kitchen',  lb: 'Kitchen' },
  { id: 'basement', lb: 'Basement' },
  { id: 'refresh',  lb: 'Whole House' },
  { id: 'exterior', lb: 'Exterior' },
];

export default function TakeoffWizard({ job, setSub, onAccepted }) {
  const [selectedType,       setSelectedType]       = useState(null);
  const [draft,              setDraft]              = useState(null);
  const [loading,            setLoading]            = useState(false);
  const [error,              setError]              = useState(null);
  const [edits,              setEdits]              = useState({});
  const [excluded,           setExcluded]           = useState(() => new Set());
  const [collapsed,          setCollapsed]          = useState(() => new Set());
  const [customLines,        setCustomLines]        = useState([]);
  const [addCustomModalRoom, setAddCustomModalRoom] = useState(null); // roomId | null
  const [saving,             setSaving]             = useState(false);
  const [saveResult,         setSaveResult]         = useState(null);
  const [saveError,          setSaveError]          = useState(null);

  // Custom lines carry their own stable key; formula lines derive it from fields.
  const lineKey = (line) =>
    line.lineKey ?? `${line.roomId}__${line.trade}__${line.materialName || ''}`;

  const toggleExclude = (line) => {
    const k = lineKey(line);
    setExcluded(prev => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  };

  const removeCustomLine = (line) => {
    const k = lineKey(line);
    setCustomLines(prev => prev.filter(l => lineKey(l) !== k));
    setExcluded(prev => { const next = new Set(prev); next.delete(k); return next; });
  };

  const loadDraft = useCallback(async (roomType) => {
    setSelectedType(roomType);
    setDraft(null);
    setEdits({});
    setExcluded(new Set());
    setCollapsed(new Set());
    setCustomLines([]);
    setAddCustomModalRoom(null);
    setError(null);
    setLoading(true);
    try {
      const [d, restored] = await Promise.all([
        sbBuildTakeoffDraft({ jobId: job.id, roomType }),
        sbLoadCustomTakeoffLines(job.id, roomType),
      ]);
      setDraft(d);
      if (restored.length) setCustomLines(restored);
    } catch (e) {
      setError(e.message || 'Failed to build takeoff draft');
    }
    setLoading(false);
  }, [job.id]);

  const effectiveLine = (line) => {
    const k = lineKey(line);
    const e = edits[k] || {};
    const qty  = e.quantity !== undefined ? e.quantity : line.quantity;
    const rate = e.baseRate !== undefined ? e.baseRate : line.baseRate;
    const cost = (rate != null && qty != null)
      ? Math.round(rate * qty * (line.multiplier || 1) * 100) / 100
      : null;
    return { ...line, quantity: qty, baseRate: rate, lineCost: cost };
  };

  const setEdit = (line, field, rawVal) => {
    const k = lineKey(line);
    const val = rawVal === '' ? null : Number(rawVal);
    setEdits(prev => ({ ...prev, [k]: { ...(prev[k] || {}), [field]: val } }));
  };

  // Merge formula lines + custom lines, tag isExcluded
  const formulaLines  = draft ? draft.lines.map(l => ({ ...effectiveLine(l), isExcluded: excluded.has(lineKey(l)) })) : [];
  const customEffective = customLines.map(l => ({ ...effectiveLine(l), isExcluded: excluded.has(lineKey(l)) }));
  const allLines      = [...formulaLines, ...customEffective];

  const laborLines       = allLines.filter(l => l.category !== 'materials');
  const materialLines    = allLines.filter(l => l.category === 'materials');
  const laborSubtotal    = Math.round(laborLines.filter(l => !l.isExcluded).reduce((s, l) => s + (l.lineCost || 0), 0) * 100) / 100;
  const materialSubtotal = Math.round(materialLines.filter(l => !l.isExcluded).reduce((s, l) => s + (l.lineCost || 0), 0) * 100) / 100;
  const subtotal         = Math.round((laborSubtotal + materialSubtotal) * 100) / 100;
  const pendingRateCount = allLines.filter(l => !l.isExcluded && l.baseRate == null).length;

  const laborByRoom = {};
  const materialsByRoom = {};
  for (const line of allLines) {
    if (line.category === 'materials') {
      if (!materialsByRoom[line.roomId]) materialsByRoom[line.roomId] = [];
      materialsByRoom[line.roomId].push(line);
    } else {
      if (!laborByRoom[line.roomId]) laborByRoom[line.roomId] = [];
      laborByRoom[line.roomId].push(line);
    }
  }

  const toggleMats = (roomId) => {
    const k = `${roomId}__materials`;
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  };

  // Trades present in a room (for custom line modal dropdown)
  const tradesForRoom = (roomId) => {
    const trades = new Set();
    for (const l of allLines) {
      if (l.roomId === roomId) trades.add(l.trade);
    }
    return [...trades].sort();
  };

  const CustomBadge = () => (
    <span style={{ fontSize: 9, background: '#FEF3C7', color: '#92400E', borderRadius: 4, padding: '1px 5px', display: 'inline-block', marginTop: 2, fontWeight: 600 }}>
      custom
    </span>
  );

  return (
    <div>
      {/* Room type picker */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {ROOM_TYPES.map(rt => (
          <button
            key={rt.id}
            onClick={() => loadDraft(rt.id)}
            disabled={loading}
            style={{
              padding: '7px 16px', borderRadius: 20, fontSize: 13, fontWeight: 600,
              border: `1.5px solid ${selectedType === rt.id ? NAV : BORDER}`,
              background: selectedType === rt.id ? NAV : '#fff',
              color: selectedType === rt.id ? '#fff' : '#374151',
              cursor: loading ? 'default' : 'pointer', transition: 'all 0.15s',
            }}
          >
            {rt.lb}
          </button>
        ))}
      </div>

      {/* Idle */}
      {!selectedType && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9CA3AF', fontSize: 14 }}>
          Select a room type above to generate a takeoff.
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#9CA3AF', fontSize: 13 }}>
          Building takeoff draft…
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#DC2626', padding: '10px 14px', borderRadius: 4, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* No matching rooms */}
      {!loading && !error && draft && draft.rooms.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#9CA3AF', fontSize: 14 }}>
          No {ROOM_TYPES.find(r => r.id === selectedType)?.lb.toLowerCase()} rooms found in this job's scans.
        </div>
      )}

      {/* Draft view */}
      {!loading && !error && draft && draft.rooms.length > 0 && (
        <div>
          {/* Summary bar */}
          <div style={{ display: 'flex', gap: 0, background: NAV, borderRadius: 8, padding: '12px 0', marginBottom: 16 }}>
            {[
              { label: 'Rooms',     value: draft.summary.totalRooms, color: '#fff' },
              { label: 'Lines',     value: allLines.length,          color: '#fff' },
              pendingRateCount > 0 ? { label: 'Need Rate', value: pendingRateCount, color: WARN_BORDER } : null,
              { label: 'Labor',     value: f$(laborSubtotal),        color: '#fff' },
              { label: 'Materials', value: f$(materialSubtotal),     color: '#fff' },
              { label: 'Total',     value: f$(subtotal),             color: GOLD },
            ].filter(Boolean).map((item, i) => (
              <div key={item.label} style={{ flex: 1, textAlign: 'center', borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.1)' : 'none', padding: '0 8px' }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{item.label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Lines by room */}
          {draft.rooms.map(room => {
            const roomLaborLines = laborByRoom[room.roomId] || [];
            const roomMatLines   = materialsByRoom[room.roomId] || [];
            const matsCollapsed  = collapsed.has(`${room.roomId}__materials`);
            const roomLaborCost  = Math.round(roomLaborLines.filter(l => !l.isExcluded).reduce((s, l) => s + (l.lineCost || 0), 0) * 100) / 100;
            const roomMatCost    = Math.round(roomMatLines.filter(l => !l.isExcluded).reduce((s, l) => s + (l.lineCost || 0), 0) * 100) / 100;
            return (
              <div key={room.roomId} style={{ marginBottom: 16, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
                {/* Room header */}
                <div style={{ background: CREAM, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: NAV }}>{room.roomLabel}</span>
                    <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 10 }}>{room.floorLabel}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#6B7280', display: 'flex', gap: 12 }}>
                    {room.areaSf > 0      && <span>{room.areaSf.toFixed(0)} sf floor</span>}
                    {room.wallAreaSf > 0  && <span>{room.wallAreaSf.toFixed(0)} sf walls</span>}
                    {room.perimeterLf > 0 && <span>{room.perimeterLf.toFixed(0)} lf</span>}
                  </div>
                </div>

                {/* Labor section header */}
                <div style={{ display: 'grid', gridTemplateColumns: '24px 2fr 60px 80px 80px 80px', padding: '5px 14px', gap: 8, background: '#F8F7F5', borderBottom: `1px solid ${BORDER}`, alignItems: 'center' }}>
                  <div />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Labor</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: NAV }}>{f$(roomLaborCost)}</span>
                  </div>
                  {['Unit', 'Qty', '$/unit', 'Total'].map(h => (
                    <div key={h} style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</div>
                  ))}
                </div>

                {/* Labor rows */}
                {roomLaborLines.map((line, i) => {
                  const needsRate = line.baseRate == null;
                  const rowBg = line.isExcluded ? '#F9F9F9' : (needsRate ? WARN_BG : (i % 2 === 0 ? '#fff' : CREAM));
                  return (
                    <div key={lineKey(line)} style={{ display: 'grid', gridTemplateColumns: '24px 2fr 60px 80px 80px 80px', padding: '8px 14px', gap: 8, background: rowBg, borderTop: `1px solid ${BORDER}`, alignItems: 'center', opacity: line.isExcluded ? 0.4 : 1 }}>
                      <input
                        type="checkbox"
                        checked={!line.isExcluded}
                        onChange={() => toggleExclude(line)}
                        title={line.isExcluded ? 'Include line' : 'Exclude line'}
                        style={{ width: 14, height: 14, accentColor: NAV, cursor: 'pointer' }}
                      />
                      <div>
                        <div style={{ fontSize: 12, color: NAV, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {line.materialName ? `${line.trade} — ${line.materialName}` : line.trade}
                          {line.isCustom && <CustomBadge />}
                          {line.isCustom && (
                            <button onClick={() => removeCustomLine(line)} title="Remove line" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 13, lineHeight: 1, padding: '0 2px', marginLeft: 2 }}>×</button>
                          )}
                        </div>
                        {line.optional && <span style={{ fontSize: 10, color: '#9CA3AF', fontStyle: 'italic' }}>optional</span>}
                        {needsRate && !line.isExcluded && <span style={{ fontSize: 10, fontWeight: 700, color: '#D97706', display: 'block', marginTop: 1 }}>REP MUST ENTER RATE</span>}
                      </div>
                      <div style={{ fontSize: 12, color: '#6B7280' }}>{line.unit}</div>
                      <input
                        type="number"
                        value={line.quantity ?? ''}
                        onChange={e => setEdit(line, 'quantity', e.target.value)}
                        disabled={line.isExcluded}
                        style={{ fontSize: 12, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '3px 6px', width: '100%', color: NAV, background: line.quantityPreFilled ? '#fff' : '#FFF9EB' }}
                        placeholder="—"
                      />
                      <input
                        type="number"
                        value={line.baseRate ?? ''}
                        onChange={e => setEdit(line, 'baseRate', e.target.value)}
                        disabled={line.isExcluded}
                        style={{ fontSize: 12, border: `1.5px solid ${needsRate && !line.isExcluded ? WARN_BORDER : BORDER}`, borderRadius: 4, padding: '3px 6px', width: '100%', color: needsRate ? '#D97706' : NAV, background: needsRate && !line.isExcluded ? WARN_BG : '#fff', fontWeight: needsRate ? 700 : 400 }}
                        placeholder="Enter"
                      />
                      <div style={{ fontSize: 12, fontWeight: 700, color: line.lineCost != null ? NAV : '#9CA3AF' }}>
                        {!line.isExcluded && line.lineCost != null ? f$(line.lineCost) : '—'}
                      </div>
                    </div>
                  );
                })}

                {/* Materials section — hidden if no material lines for this room */}
                {roomMatLines.length > 0 && (
                  <>
                    {/* Materials toggle header */}
                    <div
                      onClick={() => toggleMats(room.roomId)}
                      style={{ padding: '7px 14px', background: '#EDE9E2', borderTop: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Materials</span>
                        <span style={{ fontSize: 10, color: '#9CA3AF' }}>({roomMatLines.length} item{roomMatLines.length !== 1 ? 's' : ''})</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: NAV }}>{f$(roomMatCost)}</span>
                        <span style={{ fontSize: 10, color: '#9CA3AF' }}>{matsCollapsed ? '▶' : '▼'}</span>
                      </div>
                    </div>

                    {/* Material rows */}
                    {!matsCollapsed && roomMatLines.map((line, i) => {
                      const needsRate = line.baseRate == null;
                      const rowBg = line.isExcluded ? '#F9F9F9' : (needsRate ? WARN_BG : (i % 2 === 0 ? '#fff' : '#FAF8F5'));
                      return (
                        <div key={lineKey(line)} style={{ display: 'grid', gridTemplateColumns: '24px 2fr 60px 80px 80px 80px', padding: '7px 14px', gap: 8, background: rowBg, borderTop: `1px solid ${BORDER}`, alignItems: 'center', opacity: line.isExcluded ? 0.4 : 1 }}>
                          <input
                            type="checkbox"
                            checked={!line.isExcluded}
                            onChange={() => toggleExclude(line)}
                            title={line.isExcluded ? 'Include line' : 'Exclude line'}
                            style={{ width: 14, height: 14, accentColor: NAV, cursor: 'pointer' }}
                          />
                          <div>
                            <div style={{ fontSize: 12, color: NAV, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              {line.materialName || line.description}
                              {line.isCustom && <CustomBadge />}
                              {line.isCustom && (
                                <button onClick={() => removeCustomLine(line)} title="Remove line" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 13, lineHeight: 1, padding: '0 2px', marginLeft: 2 }}>×</button>
                              )}
                            </div>
                            <div style={{ fontSize: 10, color: '#9CA3AF' }}>{line.trade}</div>
                            {needsRate && !line.isExcluded && <span style={{ fontSize: 10, fontWeight: 700, color: '#D97706', display: 'block', marginTop: 1 }}>REP MUST ENTER RATE</span>}
                            {!line.isCustom && line.wastePct > 0 && (
                              <span style={{ fontSize: 9, background: '#E5E7EB', color: '#6B7280', borderRadius: 4, padding: '1px 5px', display: 'inline-block', marginTop: 2 }}>
                                +{line.wastePct}% waste
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 12, color: '#6B7280' }}>{line.unit}</div>
                          <input
                            type="number"
                            value={line.quantity ?? ''}
                            onChange={e => setEdit(line, 'quantity', e.target.value)}
                            disabled={line.isExcluded}
                            style={{ fontSize: 12, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '3px 6px', width: '100%', color: NAV, background: '#fff' }}
                            placeholder="—"
                          />
                          <input
                            type="number"
                            value={line.baseRate ?? ''}
                            onChange={e => setEdit(line, 'baseRate', e.target.value)}
                            disabled={line.isExcluded}
                            style={{ fontSize: 12, border: `1.5px solid ${needsRate && !line.isExcluded ? WARN_BORDER : BORDER}`, borderRadius: 4, padding: '3px 6px', width: '100%', color: needsRate ? '#D97706' : NAV, background: needsRate && !line.isExcluded ? WARN_BG : '#fff', fontWeight: needsRate ? 700 : 400 }}
                            placeholder="—"
                          />
                          <div style={{ fontSize: 12, fontWeight: 700, color: line.lineCost != null ? NAV : '#9CA3AF' }}>
                            {!line.isExcluded && line.lineCost != null ? f$(line.lineCost) : '—'}
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}

                {/* + Add custom line */}
                <div style={{ padding: '8px 14px', borderTop: `1px solid ${BORDER}`, background: '#FAFAF9' }}>
                  <button
                    onClick={() => setAddCustomModalRoom(room.roomId)}
                    style={{ fontSize: 12, color: GOLD, fontWeight: 600, background: 'none', border: `1px dashed ${GOLD}`, borderRadius: 6, padding: '5px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                  >
                    <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> Add custom line
                  </button>
                </div>
              </div>
            );
          })}

          {/* Save result banner */}
          {saveResult && (
            <div style={{ background: '#D1FAE5', border: '1px solid #6EE7B7', color: '#065F46', padding: '10px 14px', borderRadius: 6, marginBottom: 8, fontSize: 13 }}>
              ✓ Saved {saveResult.lineItemCount} line items
              {saveResult.overrideCount > 0 && ` · ${saveResult.overrideCount} rate${saveResult.overrideCount !== 1 ? 's' : ''} saved as your defaults`}
              {saveResult.errors.length > 0 && (
                <span style={{ color: '#D97706', marginLeft: 8 }}>
                  ({saveResult.errors.length} item{saveResult.errors.length !== 1 ? 's' : ''} had errors — check Line items tab)
                </span>
              )}
            </div>
          )}
          {saveError && (
            <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#DC2626', padding: '10px 14px', borderRadius: 6, marginBottom: 8, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
              <span>Save failed: {saveError}</span>
              <button onClick={() => setSaveError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontWeight: 700 }}>✕</button>
            </div>
          )}

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: `2px solid ${BORDER}`, marginTop: 4 }}>
            <div style={{ fontSize: 13, color: '#6B7280' }}>
              Labor <strong style={{ color: NAV }}>{f$(laborSubtotal)}</strong>
              <span style={{ margin: '0 6px', color: BORDER }}>|</span>
              Materials <strong style={{ color: NAV }}>{f$(materialSubtotal)}</strong>
              <span style={{ margin: '0 6px', color: BORDER }}>|</span>
              Total <strong style={{ color: NAV, fontSize: 14 }}>{f$(subtotal)}</strong>
              {pendingRateCount > 0 && (
                <span style={{ color: '#D97706', marginLeft: 8 }}>({pendingRateCount} rate{pendingRateCount !== 1 ? 's' : ''} missing)</span>
              )}
            </div>
            <button
              className="btn btn-navy"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                setSaveResult(null);
                setSaveError(null);
                try {
                  const result = await acceptTakeoffDraft({
                    draft,
                    edits,
                    excluded,
                    customLines,
                    tenantId: AV_TENANT,
                    userId:   AV_USER_ID,
                  });
                  setSaveResult(result);
                  onAccepted?.();
                  setTimeout(() => setSub?.('items'), 1200);
                } catch (e) {
                  setSaveError(e.message || 'Unknown error');
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? 'Saving…' : 'Accept & Save to Line Items'}
            </button>
          </div>
        </div>
      )}

      {/* Add custom line modal */}
      {addCustomModalRoom && (
        <AddCustomLineModal
          roomId={addCustomModalRoom}
          existingTrades={tradesForRoom(addCustomModalRoom)}
          onAdd={(line) => {
            setCustomLines(prev => [...prev, line]);
            setAddCustomModalRoom(null);
          }}
          onClose={() => setAddCustomModalRoom(null)}
        />
      )}
    </div>
  );
}
