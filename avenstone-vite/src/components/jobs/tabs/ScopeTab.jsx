import { useState, useEffect, useCallback } from 'react';
import {
  sbLoadJobRoomScopes, sbSaveJobRoomScope, sbDeleteJobRoomScope,
  sbLoadScopeSubsets, sbLoadActiveTradeStrings, AV_TENANT, AV_USER_ID,
} from '../../../lib/supabase';
import { sbBuildTakeoffDraft } from '../../../lib/supabase';

const NAV    = '#0A1F44';
const GOLD   = '#C9A84C';
const CREAM  = '#F7F5F0';
const BORDER = '#E8E4DC';
const AMBER  = '#f59e0b';

const ROOM_TYPES = [
  { id: 'bathroom', lb: 'Bathroom' },
  { id: 'kitchen',  lb: 'Kitchen'  },
  { id: 'basement', lb: 'Basement' },
  { id: 'refresh',  lb: 'Whole House' },
  { id: 'exterior', lb: 'Exterior' },
];

function roomMatchesType(room, roomType) {
  const label = (room.roomLabel || '').toLowerCase();
  switch (roomType) {
    case 'bathroom': return label.includes('bath');
    case 'kitchen':  return label.includes('kitchen');
    case 'basement': return label.includes('basement') || room.floor === -1;
    case 'exterior': return room.captureMode === 'exterior';
    case 'refresh':  return true;
    default: return false;
  }
}

export default function ScopeTab({ job, setSub }) {
  const [allRooms, setAllRooms]         = useState([]);  // flat annotated rooms from drafts
  const [scopeRows, setScopeRows]       = useState([]);  // saved job_room_scopes
  const [subsets, setSubsets]           = useState({});  // { roomType → subset[] }
  const [tradeStrings, setTradeStrings] = useState([]);  // for 'custom' checklist
  const [localEdits, setLocalEdits]     = useState({});  // { roomId → { scopeTag, customTrades, notes } }
  const [saving, setSaving]             = useState(false);
  const [saveMsg, setSaveMsg]           = useState('');
  const [loading, setLoading]           = useState(true);
  const [collapsed, setCollapsed]       = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch scope rows + trade strings in parallel
      const [saved, trades] = await Promise.all([
        sbLoadJobRoomScopes(job.id),
        sbLoadActiveTradeStrings(),
      ]);
      setScopeRows(saved);
      setTradeStrings(trades);

      // Load subsets for all room types in parallel
      const subsetResults = await Promise.all(
        ROOM_TYPES.map(rt => sbLoadScopeSubsets(rt.id).then(s => [rt.id, s]))
      );
      const subsetMap = {};
      for (const [rt, s] of subsetResults) subsetMap[rt] = s;
      setSubsets(subsetMap);

      // Build flat room list from all 5 drafts (read-only, no writes)
      const draftResults = await Promise.all(
        ROOM_TYPES.map(rt =>
          sbBuildTakeoffDraft({ jobId: job.id, roomType: rt.id })
            .then(d => ({ roomType: rt.id, rooms: d.rooms || [] }))
            .catch(() => ({ roomType: rt.id, rooms: [] }))
        )
      );
      // Deduplicate rooms — a room can match multiple types (e.g. refresh includes all).
      // Use per-type room sets: only include a room in the first type it matches,
      // except 'refresh' which intentionally includes everything.
      const seenIds = new Set();
      const flat = [];
      for (const { roomType, rooms } of draftResults) {
        if (roomType === 'refresh') continue; // add refresh rooms in a second pass
        for (const room of rooms) {
          if (!seenIds.has(room.roomId)) {
            seenIds.add(room.roomId);
            flat.push({ ...room, primaryType: roomType });
          }
        }
      }
      // Add rooms not yet assigned to a specific type under 'refresh'
      const refreshDraft = draftResults.find(d => d.roomType === 'refresh');
      if (refreshDraft) {
        for (const room of refreshDraft.rooms) {
          if (!seenIds.has(room.roomId)) {
            seenIds.add(room.roomId);
            flat.push({ ...room, primaryType: 'refresh' });
          }
        }
      }
      setAllRooms(flat);

      // Init localEdits from saved rows
      const edits = {};
      for (const row of saved) {
        edits[row.room_id] = {
          scopeTag:     row.scope_tag,
          customTrades: row.custom_trades ?? [],
          notes:        row.notes ?? '',
        };
      }
      setLocalEdits(edits);
    } finally {
      setLoading(false);
    }
  }, [job.id]);

  useEffect(() => { load(); }, [load]);

  // ── Orphan detection ────────────────────────────────────────────────────────
  const currentRoomIds = new Set(allRooms.map(r => r.roomId));
  const orphanRows = scopeRows.filter(r => !currentRoomIds.has(r.room_id));

  const clearOrphans = async () => {
    for (const row of orphanRows) {
      await sbDeleteJobRoomScope(row.id);
    }
    setScopeRows(prev => prev.filter(r => currentRoomIds.has(r.room_id)));
  };

  // ── Save all edited scope rows ─────────────────────────────────────────────
  const saveAll = async () => {
    setSaving(true);
    setSaveMsg('');
    let saved = 0;
    let errors = 0;
    for (const [roomId, edit] of Object.entries(localEdits)) {
      const room = allRooms.find(r => r.roomId === roomId);
      if (!room) continue;
      const { error } = await sbSaveJobRoomScope({
        jobId:        job.id,
        roomId,
        roomLabel:    room.roomLabel,
        roomType:     room.primaryType,
        scopeTag:     edit.scopeTag,
        customTrades: edit.scopeTag === 'custom' ? edit.customTrades : null,
        notes:        edit.notes || null,
        tenantId:     AV_TENANT,
        userId:       AV_USER_ID,
      });
      if (error) { errors++; console.error('sbSaveJobRoomScope', error); }
      else saved++;
    }
    if (errors) setSaveMsg(`Saved ${saved}, ${errors} error(s) — check console`);
    else setSaveMsg(`${saved} room${saved !== 1 ? 's' : ''} scoped`);
    await load(); // refresh to sync scope_missing flags
    setSaving(false);
    setTimeout(() => setSaveMsg(''), 3500);
  };

  const setEdit = (roomId, field, value) => {
    setLocalEdits(prev => ({
      ...prev,
      [roomId]: { ...(prev[roomId] || { scopeTag: '', customTrades: [], notes: '' }), [field]: value },
    }));
  };

  const toggleCollapse = roomId => setCollapsed(prev => {
    const next = new Set(prev);
    next.has(roomId) ? next.delete(roomId) : next.add(roomId);
    return next;
  });

  // ── Metrics ────────────────────────────────────────────────────────────────
  const scopedCount = allRooms.filter(r => localEdits[r.roomId]?.scopeTag).length;
  const totalCount  = allRooms.length;

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#888' }}>
        Loading rooms…
      </div>
    );
  }

  if (!allRooms.length) {
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📐</div>
        <div style={{ fontWeight: 600, color: NAV, marginBottom: 4 }}>No scanned rooms yet</div>
        <div style={{ fontSize: 13, color: '#888' }}>
          Scan the property first in the Scanner tab, then return here to tag each room's scope.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '0 0 80px' }}>

      {/* Header summary */}
      <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${BORDER}`, background: CREAM }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: NAV }}>
              {scopedCount} of {totalCount} rooms scoped
            </div>
            <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
              Tag each room with the work scope before running the takeoff wizard.
            </div>
          </div>
          <button
            onClick={saveAll}
            disabled={saving || !Object.keys(localEdits).length}
            className="btn btn-navy"
            style={{ fontSize: 13, padding: '7px 18px' }}
          >
            {saving ? 'Saving…' : 'Save Scope'}
          </button>
        </div>
        {saveMsg && (
          <div style={{ marginTop: 8, fontSize: 13, color: '#22c55e', fontWeight: 600 }}>
            ✓ {saveMsg}
          </div>
        )}
      </div>

      {/* Orphan banner */}
      {orphanRows.length > 0 && (
        <div style={{
          margin: '12px 20px', padding: '10px 14px', background: '#FEF3C7',
          border: `1px solid ${AMBER}`, borderRadius: 8, display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <div style={{ fontSize: 13, color: '#92400e' }}>
            {orphanRows.length} orphaned scope row{orphanRows.length !== 1 ? 's' : ''} — likely
            from deleted or re-scanned rooms.
          </div>
          <button
            onClick={clearOrphans}
            style={{
              fontSize: 12, fontWeight: 600, color: '#92400e', background: 'none',
              border: `1px solid ${AMBER}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
            }}
          >
            Clear orphans
          </button>
        </div>
      )}

      {/* Rooms by type */}
      {ROOM_TYPES.map(rt => {
        const typeRooms = allRooms.filter(r => r.primaryType === rt.id);
        if (!typeRooms.length) return null;
        return (
          <div key={rt.id} style={{ marginTop: 16 }}>
            <div style={{
              padding: '6px 20px', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
              color: '#888', textTransform: 'uppercase',
            }}>
              {rt.lb}
              <span style={{
                marginLeft: 8, background: NAV, color: '#fff',
                borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700,
              }}>
                {typeRooms.length}
              </span>
            </div>

            {typeRooms.map(room => {
              const edit  = localEdits[room.roomId] || { scopeTag: '', customTrades: [], notes: '' };
              const saved = scopeRows.find(r => r.room_id === room.roomId);
              const isSet = !!saved?.scope_tag;
              const isCol = collapsed.has(room.roomId) && isSet;
              const typeSubsets = subsets[rt.id] || [];

              return (
                <div
                  key={room.roomId}
                  style={{
                    margin: '0 20px 10px',
                    background: '#fff',
                    borderRadius: 10,
                    border: `1px solid ${isSet ? BORDER : AMBER}`,
                    overflow: 'hidden',
                  }}
                >
                  {/* Room header */}
                  <div
                    onClick={() => isSet && toggleCollapse(room.roomId)}
                    style={{
                      padding: '12px 14px',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      cursor: isSet ? 'pointer' : 'default',
                      background: isSet ? CREAM : '#FFFBEB',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: NAV }}>
                        {room.roomLabel}
                      </div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                        {room.areaSf > 0 ? `${room.areaSf.toFixed(0)} sf` : 'No area'}
                        {room.floorLabel ? ` · ${room.floorLabel}` : ''}
                        {isSet && edit.scopeTag
                          ? ` · ${typeSubsets.find(s => s.scope_tag === edit.scopeTag)?.label || edit.scopeTag}`
                          : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {!isSet && (
                        <span style={{
                          fontSize: 11, fontWeight: 700, color: AMBER,
                          background: '#FEF3C7', borderRadius: 10, padding: '2px 8px',
                        }}>
                          Not set
                        </span>
                      )}
                      {isSet && (
                        <span style={{ fontSize: 13, color: '#888' }}>{isCol ? '▶' : '▼'}</span>
                      )}
                    </div>
                  </div>

                  {/* Room body */}
                  {!isCol && (
                    <div style={{ padding: '12px 14px', borderTop: `1px solid ${BORDER}` }}>
                      {/* Scope tag dropdown */}
                      <div style={{ marginBottom: 10 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>
                          Scope
                        </label>
                        <select
                          value={edit.scopeTag}
                          onChange={e => setEdit(room.roomId, 'scopeTag', e.target.value)}
                          className="finp"
                          style={{ width: '100%', fontSize: 13 }}
                        >
                          <option value="">— select scope —</option>
                          {typeSubsets.map(s => (
                            <option key={s.scope_tag} value={s.scope_tag}>{s.label}</option>
                          ))}
                        </select>
                      </div>

                      {/* Custom trades checklist */}
                      {edit.scopeTag === 'custom' && (
                        <div style={{ marginBottom: 10 }}>
                          <div style={{
                            fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6,
                            display: 'flex', justifyContent: 'space-between',
                          }}>
                            <span>Custom trades</span>
                            <span style={{ color: GOLD, fontWeight: 700 }}>
                              {(edit.customTrades || []).length} selected
                            </span>
                          </div>
                          <div style={{
                            maxHeight: 200, overflowY: 'auto', border: `1px solid ${BORDER}`,
                            borderRadius: 8, padding: '6px 10px',
                          }}>
                            {tradeStrings.map(trade => {
                              const checked = (edit.customTrades || []).includes(trade);
                              return (
                                <label
                                  key={trade}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '4px 0', fontSize: 13, cursor: 'pointer',
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={e => {
                                      const prev = edit.customTrades || [];
                                      const next = e.target.checked
                                        ? [...prev, trade]
                                        : prev.filter(t => t !== trade);
                                      setEdit(room.roomId, 'customTrades', next);
                                    }}
                                    style={{ width: 15, height: 15, accentColor: NAV }}
                                  />
                                  {trade}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Notes */}
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>
                          Notes (optional)
                        </label>
                        <textarea
                          value={edit.notes}
                          onChange={e => setEdit(room.roomId, 'notes', e.target.value)}
                          placeholder="Any scope notes for this room…"
                          rows={2}
                          className="finp"
                          style={{ width: '100%', fontSize: 13, resize: 'vertical' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Bottom save bar */}
      <div style={{
        position: 'sticky', bottom: 0, background: '#fff',
        borderTop: `1px solid ${BORDER}`, padding: '12px 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: 13, color: '#888' }}>
          {totalCount - scopedCount > 0
            ? `${totalCount - scopedCount} room${totalCount - scopedCount !== 1 ? 's' : ''} not yet scoped`
            : 'All rooms scoped'}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setSub?.('takeoff')}
            className="btn btn-ghost"
            style={{ fontSize: 13 }}
          >
            Takeoff →
          </button>
          <button
            onClick={saveAll}
            disabled={saving}
            className="btn btn-navy"
            style={{ fontSize: 13, padding: '7px 18px' }}
          >
            {saving ? 'Saving…' : 'Save Scope'}
          </button>
        </div>
      </div>
    </div>
  );
}
