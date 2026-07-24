import { useState, useEffect, useCallback } from 'react';
import {
  sbLoadJobRoomScopes, sbSaveJobRoomScope, sbDeleteJobRoomScope,
  sbLoadScopeSubsets, sbLoadActiveTradeStrings, sbLoadJobScanRooms,
  sbLoadTemplateTradesByRoomType,
  AV_TENANT, AV_USER_ID, sb,
} from '../../../lib/supabase';
import ScopeDetailForm from './ScopeDetailForm';

const NAV    = 'var(--navy-900)';
const GOLD   = 'var(--gold-500)';
const CREAM  = 'var(--bg)';
const BORDER = 'var(--border)';
const AMBER  = 'var(--amber-text)';

const ROOM_TYPES = [
  { id: 'bathroom', lb: 'Bathroom' },
  { id: 'kitchen',  lb: 'Kitchen'  },
  { id: 'basement', lb: 'Basement' },
  { id: 'refresh',  lb: 'Whole House' },
  { id: 'exterior', lb: 'Exterior' },
];

// Tags that have detail forms (bathroom only for now)
const DETAIL_FORM_TAGS = new Set(['full_remodel', 'tile_only', 'vanity_swap', 'paint_and_floor']);

export default function ScopeTab({ job, setSub }) {
  const [allRooms, setAllRooms]         = useState([]);
  const [scopeRows, setScopeRows]       = useState([]);
  const [subsets, setSubsets]           = useState({});
  const [schemas, setSchemas]           = useState({}); // { "roomType::scopeTag" → schema JSONB }
  const [tradeStrings, setTradeStrings] = useState([]);
  const [localEdits, setLocalEdits]     = useState({}); // { roomId → { scopeTag, customTrades, notes, scopeDetails } }
  const [saving, setSaving]             = useState(false);
  const [saveMsg, setSaveMsg]           = useState('');
  const [loading, setLoading]           = useState(true);
  const [collapsed, setCollapsed]       = useState(new Set());
  const [relevantTrades, setRelevantTrades] = useState({});
  const [showAllTrades, setShowAllTrades]   = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [scanRooms, saved, trades, schemaRows, templateTrades, ...subsetResults] = await Promise.all([
        sbLoadJobScanRooms(job.id),
        sbLoadJobRoomScopes(job.id),
        sbLoadActiveTradeStrings(),
        sb.from('scope_detail_schemas').select('room_type, scope_tag, schema, tenant_id').eq('active', true).then(r => r.data || []),
        sbLoadTemplateTradesByRoomType(),
        ...ROOM_TYPES.map(rt => sbLoadScopeSubsets(rt.id).then(s => [rt.id, s])),
      ]);
      setScopeRows(saved);
      setTradeStrings(trades);
      setRelevantTrades(templateTrades);

      // Build schema map — tenant override beats platform default
      const schemaMap = {};
      for (const row of schemaRows) {
        const key  = `${row.room_type}::${row.scope_tag}`;
        const prev = schemaMap[key];
        if (!prev || (row.tenant_id !== null && prev.tenant_id === null)) {
          schemaMap[key] = { schema: row.schema, tenant_id: row.tenant_id };
        }
      }
      setSchemas(schemaMap);

      const subsetMap = {};
      for (const [rt, s] of subsetResults) subsetMap[rt] = s;
      setSubsets(subsetMap);

      const flat = scanRooms.map(r => ({ ...r, primaryType: r.roomType }));
      setAllRooms(flat);

      // Init localEdits from saved rows, including scope_details
      const edits = {};
      for (const row of saved) {
        edits[row.room_id] = {
          scopeTag:     row.scope_tag,
          customTrades: row.custom_trades ?? [],
          notes:        row.notes ?? '',
          scopeDetails: row.scope_details ?? {},
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
        scopeDetails: DETAIL_FORM_TAGS.has(edit.scopeTag) ? (edit.scopeDetails ?? {}) : {},
        tenantId:     AV_TENANT,
        userId:       AV_USER_ID,
      });
      if (error) { errors++; console.error('sbSaveJobRoomScope', error); }
      else saved++;
    }
    if (errors) setSaveMsg(`Saved ${saved}, ${errors} error(s) — check console`);
    else setSaveMsg(`${saved} room${saved !== 1 ? 's' : ''} scoped`);
    await load();
    setSaving(false);
    setTimeout(() => setSaveMsg(''), 3500);
  };

  const setEdit = (roomId, field, value) => {
    setLocalEdits(prev => ({
      ...prev,
      [roomId]: {
        ...(prev[roomId] || { scopeTag: '', customTrades: [], notes: '', scopeDetails: {} }),
        [field]: value,
      },
    }));
  };

  // When scope tag changes, reset scope_details (new tag = fresh defaults)
  const setScopeTag = (roomId, newTag) => {
    setLocalEdits(prev => ({
      ...prev,
      [roomId]: {
        ...(prev[roomId] || { customTrades: [], notes: '' }),
        scopeTag:     newTag,
        scopeDetails: {}, // cleared — ScopeDetailForm will seed from schema defaults
      },
    }));
  };

  const toggleCollapse = roomId => setCollapsed(prev => {
    const next = new Set(prev);
    next.has(roomId) ? next.delete(roomId) : next.add(roomId);
    return next;
  });

  const scopedCount = allRooms.filter(r => localEdits[r.roomId]?.scopeTag).length;
  const totalCount  = allRooms.length;

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center', color: '#888' }}>Loading rooms…</div>;
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

      {/* Header */}
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
          <div style={{ marginTop: 8, fontSize: 13, color: 'var(--green-dot)', fontWeight: 600 }}>
            ✓ {saveMsg}
          </div>
        )}
      </div>

      {/* Orphan banner */}
      {orphanRows.length > 0 && (
        <div style={{
          margin: '12px 20px', padding: '10px 14px', background: 'var(--amber-bg)',
          border: `1px solid ${AMBER}`, borderRadius: 8, display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          <div style={{ fontSize: 13, color: '#92400e' }}>
            {orphanRows.length} orphaned scope row{orphanRows.length !== 1 ? 's' : ''} — from deleted or re-scanned rooms.
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
              const edit       = localEdits[room.roomId] || { scopeTag: '', customTrades: [], notes: '', scopeDetails: {} };
              const savedRow   = scopeRows.find(r => r.room_id === room.roomId);
              const isSet      = !!savedRow?.scope_tag;
              const isCol      = collapsed.has(room.roomId) && isSet;
              const typeSubsets = subsets[rt.id] || [];

              // Detail form: bathroom only, non-custom, non-not_in_scope tags
              const schemaKey   = `${rt.id}::${edit.scopeTag}`;
              const schemaEntry = schemas[schemaKey];
              const showDetail  = rt.id === 'bathroom' && DETAIL_FORM_TAGS.has(edit.scopeTag) && !!schemaEntry;

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
                      background: isSet ? CREAM : 'var(--amber-bg)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: NAV }}>
                        {room.roomLabel}
                      </div>
                      <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                        {room.areaSf > 0 ? `${room.areaSf.toFixed(0)} sf` : 'No area'}
                        {isSet && edit.scopeTag
                          ? ` · ${typeSubsets.find(s => s.scope_tag === edit.scopeTag)?.label || edit.scopeTag}`
                          : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {!isSet && (
                        <span style={{
                          fontSize: 11, fontWeight: 700, color: AMBER,
                          background: 'var(--amber-bg)', borderRadius: 10, padding: '2px 8px',
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
                      <div style={{ marginBottom: showDetail ? 0 : 10 }}>
                        <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>
                          Scope
                        </label>
                        <select
                          value={edit.scopeTag}
                          onChange={e => setScopeTag(room.roomId, e.target.value)}
                          className="finp"
                          style={{ width: '100%', fontSize: 13 }}
                        >
                          <option value="">— select scope —</option>
                          {typeSubsets.map(s => (
                            <option key={s.scope_tag} value={s.scope_tag}>{s.label}</option>
                          ))}
                        </select>
                      </div>

                      {/* Scope detail form (bathroom only, non-custom/not_in_scope) */}
                      {showDetail && (
                        <ScopeDetailForm
                          schema={schemaEntry.schema}
                          values={edit.scopeDetails ?? {}}
                          onChange={newDetails => setEdit(room.roomId, 'scopeDetails', newDetails)}
                          roomDefaults={{ floorSf: room.areaSf }}
                        />
                      )}

                      {/* Custom trades checklist */}
                      {edit.scopeTag === 'custom' && (() => {
                        const roomTypeRelevant = new Set(relevantTrades[rt.id] || []);
                        const relevant = roomTypeRelevant.size > 0
                          ? tradeStrings.filter(t => roomTypeRelevant.has(t))
                          : tradeStrings;
                        const others = roomTypeRelevant.size > 0
                          ? tradeStrings.filter(t => !roomTypeRelevant.has(t))
                          : [];
                        const allExpanded = showAllTrades.has(room.roomId);
                        const checkedTrades = new Set(edit.customTrades || []);

                        const renderCheckbox = trade => (
                          <label
                            key={trade}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              padding: '4px 0', fontSize: 13, cursor: 'pointer',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={checkedTrades.has(trade)}
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

                        return (
                          <div style={{ marginBottom: 10, marginTop: 10 }}>
                            <div style={{
                              fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6,
                              display: 'flex', justifyContent: 'space-between',
                            }}>
                              <span>Custom trades</span>
                              <span style={{ color: GOLD, fontWeight: 700 }}>
                                {checkedTrades.size} selected
                              </span>
                            </div>
                            <div style={{
                              maxHeight: 200, overflowY: 'auto', border: `1px solid ${BORDER}`,
                              borderRadius: 8, padding: '6px 10px',
                            }}>
                              {relevant.map(renderCheckbox)}
                              {others.length > 0 && (
                                <>
                                  {others.filter(t => checkedTrades.has(t)).map(renderCheckbox)}
                                  {!allExpanded && others.filter(t => !checkedTrades.has(t)).length > 0 && (
                                    <button
                                      onClick={() => setShowAllTrades(prev => {
                                        const next = new Set(prev);
                                        next.add(room.roomId);
                                        return next;
                                      })}
                                      style={{
                                        fontSize: 12, color: GOLD, background: 'none',
                                        border: 'none', cursor: 'pointer', padding: '6px 0',
                                        display: 'block',
                                      }}
                                    >
                                      Show all trades ({others.filter(t => !checkedTrades.has(t)).length})
                                    </button>
                                  )}
                                  {allExpanded && others.filter(t => !checkedTrades.has(t)).map(renderCheckbox)}
                                  {allExpanded && (
                                    <button
                                      onClick={() => setShowAllTrades(prev => {
                                        const next = new Set(prev);
                                        next.delete(room.roomId);
                                        return next;
                                      })}
                                      style={{
                                        fontSize: 12, color: GOLD, background: 'none',
                                        border: 'none', cursor: 'pointer', padding: '6px 0',
                                        display: 'block',
                                      }}
                                    >
                                      Show less
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Notes */}
                      <div style={{ marginTop: 10 }}>
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
