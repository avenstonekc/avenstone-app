import { useState, useCallback } from 'react';
import { sbBuildTakeoffDraft } from '../../../lib/supabase';
import { f$ } from '../../../lib/utils';

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
  { id: 'refresh',  lb: 'Full Refresh' },
  { id: 'exterior', lb: 'Exterior' },
];

export default function TakeoffWizard({ job }) {
  const [selectedType, setSelectedType] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [edits, setEdits] = useState({});

  const loadDraft = useCallback(async (roomType) => {
    setSelectedType(roomType);
    setDraft(null);
    setEdits({});
    setError(null);
    setLoading(true);
    try {
      const d = await sbBuildTakeoffDraft({ jobId: job.id, roomType });
      setDraft(d);
    } catch (e) {
      setError(e.message || 'Failed to build takeoff draft');
    }
    setLoading(false);
  }, [job.id]);

  const lineKey = (line) => `${line.roomId}__${line.trade}`;

  const effectiveLine = (line) => {
    const k = lineKey(line);
    const e = edits[k] || {};
    const qty  = e.quantity  !== undefined ? e.quantity  : line.quantity;
    const rate = e.baseRate  !== undefined ? e.baseRate  : line.baseRate;
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

  const effectiveLines = draft ? draft.lines.map(effectiveLine) : [];
  const subtotal = effectiveLines.reduce((s, l) => s + (l.lineCost || 0), 0);
  const pendingRateCount = effectiveLines.filter(l => l.baseRate == null).length;

  const linesByRoom = {};
  for (const line of effectiveLines) {
    if (!linesByRoom[line.roomId]) linesByRoom[line.roomId] = [];
    linesByRoom[line.roomId].push(line);
  }

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
              { label: 'Rooms',    value: draft.summary.totalRooms,              color: '#fff' },
              { label: 'Lines',    value: draft.summary.totalLines,              color: '#fff' },
              pendingRateCount > 0
                ? { label: 'Need Rate', value: pendingRateCount,                 color: WARN_BORDER }
                : null,
              { label: 'Subtotal', value: f$(subtotal),                          color: GOLD },
            ].filter(Boolean).map((item, i, arr) => (
              <div key={item.label} style={{ flex: 1, textAlign: 'center', borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.1)' : 'none', padding: '0 8px' }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{item.label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: item.color }}>{item.value}</div>
              </div>
            ))}
          </div>

          {/* Lines by room */}
          {draft.rooms.map(room => {
            const roomLines = linesByRoom[room.roomId] || [];
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
                {/* Column headers */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 60px 80px 80px 80px', padding: '5px 14px', gap: 8, background: '#F8F7F5', borderBottom: `1px solid ${BORDER}` }}>
                  {['Trade', 'Unit', 'Qty', '$/unit', 'Total'].map(h => (
                    <div key={h} style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</div>
                  ))}
                </div>
                {/* Trade lines */}
                {roomLines.map((line, i) => {
                  const needsRate = line.baseRate == null;
                  const rowBg = needsRate ? WARN_BG : (i % 2 === 0 ? '#fff' : CREAM);
                  return (
                    <div key={line.trade} style={{ display: 'grid', gridTemplateColumns: '2fr 60px 80px 80px 80px', padding: '8px 14px', gap: 8, background: rowBg, borderTop: `1px solid ${BORDER}`, alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 12, color: NAV, fontWeight: 500 }}>{line.trade}</div>
                        {line.optional && <span style={{ fontSize: 10, color: '#9CA3AF', fontStyle: 'italic' }}>optional</span>}
                        {needsRate && <span style={{ fontSize: 10, fontWeight: 700, color: '#D97706', display: 'block', marginTop: 1 }}>REP MUST ENTER RATE</span>}
                      </div>
                      <div style={{ fontSize: 12, color: '#6B7280' }}>{line.unit}</div>
                      {/* Qty */}
                      <input
                        type="number"
                        value={line.quantity ?? ''}
                        onChange={e => setEdit(line, 'quantity', e.target.value)}
                        style={{ fontSize: 12, border: `1px solid ${BORDER}`, borderRadius: 4, padding: '3px 6px', width: '100%', color: NAV, background: line.quantityPreFilled ? '#fff' : '#FFF9EB' }}
                        placeholder="—"
                      />
                      {/* Rate */}
                      <input
                        type="number"
                        value={line.baseRate ?? ''}
                        onChange={e => setEdit(line, 'baseRate', e.target.value)}
                        style={{ fontSize: 12, border: `1.5px solid ${needsRate ? WARN_BORDER : BORDER}`, borderRadius: 4, padding: '3px 6px', width: '100%', color: needsRate ? '#D97706' : NAV, background: needsRate ? WARN_BG : '#fff', fontWeight: needsRate ? 700 : 400 }}
                        placeholder="Enter"
                      />
                      {/* Total */}
                      <div style={{ fontSize: 12, fontWeight: 700, color: line.lineCost != null ? NAV : '#9CA3AF' }}>
                        {line.lineCost != null ? f$(line.lineCost) : '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderTop: `2px solid ${BORDER}`, marginTop: 4 }}>
            <div style={{ fontSize: 13, color: '#6B7280' }}>
              Subtotal: <strong style={{ color: NAV }}>{f$(subtotal)}</strong>
              {pendingRateCount > 0 && (
                <span style={{ color: '#D97706', marginLeft: 8 }}>({pendingRateCount} rate{pendingRateCount !== 1 ? 's' : ''} missing)</span>
              )}
            </div>
            <button className="btn btn-navy" onClick={() => alert('Prompt C coming next — will save to Line Items')}>
              Accept &amp; Save to Line Items
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
