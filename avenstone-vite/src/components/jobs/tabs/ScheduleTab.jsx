import { useState, useEffect, useRef, useMemo } from 'react';
import { AV_USER_ID, AV_TENANT, sb, sbLoadPhases, sbLoadScheduleItems, sbCreateScheduleItem, sbUpdateScheduleItem, sbDeleteScheduleItem, derivePhaseStatus, sbPhoto, sbCountPhotosForEntity, sbLoadPhotosForEntity, sbCreateChecklistFromTemplate, sbLoadChecklistForScheduleItem, sbCheckResourceConflicts } from '../../../lib/supabase';
import { getTemplateOptions } from '../../../lib/siteVisitTemplates';
import SiteVisitChecklist from '../SiteVisitChecklist';
import { Ic, fD } from '../../../lib/utils';

// Phase display config — title-case keys match job_phases.phase_name in DB
const PHASE_ORDER = ['Demo', 'Framing', 'Rough MEP', 'Insulation', 'Drywall', 'Paint', 'Flooring', 'Trim', 'Fixtures', 'Punch List'];
const PILL_COLOR   = { not_started: '#9CA3AF', pending: '#9CA3AF', in_progress: '#C9A84C', complete: '#22c55e', blocked: '#ef4444' };

// Schedule item config
const TYPE_LABELS = { material_delivery: 'Material Delivery', sub_start: 'Sub Start', site_visit: 'Site Visit', inspection: 'Inspection', milestone: 'Milestone', delay: 'Delay' };
const TYPE_ICON = { material_delivery: 'box', sub_start: 'check', site_visit: 'eye', inspection: 'clip', milestone: 'sched', delay: 'warn' };
const STATUS_STYLE = {
  scheduled:   { bg: '#EFF6FF', color: '#1D4ED8' },
  in_progress: { bg: '#FEF3C7', color: '#92400E' },
  complete:    { bg: '#D1FAE5', color: '#065F46' },
  cancelled:   { bg: '#F3F4F6', color: '#6B7280' },
};

function groupByWeek(items) {
  const today = new Date().toISOString().slice(0, 10);
  const groups = { thisWeek: [], nextWeek: [], later: [], noDate: [], past: [] };
  for (const item of items) {
    if (item.status === 'cancelled') continue;
    if (!item.scheduled_date) { groups.noDate.push(item); continue; }
    if (item.scheduled_date < today) { groups.past.push(item); continue; }
    const diff = Math.floor((new Date(item.scheduled_date + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
    if (diff <= 6)  { groups.thisWeek.push(item); continue; }
    if (diff <= 13) { groups.nextWeek.push(item); continue; }
    groups.later.push(item);
  }
  return groups;
}

export default function ScheduleTab({ job }) {
  const [phases, setPhases]         = useState([]);
  const [items,  setItems]          = useState([]);
  const [loaded, setLoaded]         = useState(false);
  const [err,    setErr]            = useState(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [pastExpanded, setPastExpanded] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(null); // item awaiting confirm
  const [showModal, setShowModal]   = useState(false);
  const [editItem, setEditItem]     = useState(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const [pData, iResult] = await Promise.all([
        sbLoadPhases(job.id),
        sbLoadScheduleItems(job.id),
      ]);
      setPhases(pData || []);
      setItems(iResult.data || []);
    } catch (e) {
      setErr('Failed to load schedule');
    } finally {
      setLoaded(true);
    }
  };

  const refreshPhases = async () => {
    const data = await sbLoadPhases(job.id);
    setPhases(data || []);
  };

  const flash = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 3000);
  };

  // ── Cancel item flow ──────────────────────────────────────────────────────
  const requestCancel = async (item) => {
    if (item.type === 'sub_start' && item.trade) {
      // Check if the mapped phase is already complete (asymmetry warning)
      const { data: mapRow } = await sb
        .from('trade_phase_map')
        .select('phase_name')
        .eq('trade', item.trade)
        .eq('tenant_id', AV_TENANT)
        .maybeSingle();
      if (mapRow?.phase_name) {
        const phase = phases.find(p => p.phase_name === mapRow.phase_name);
        if (phase?.status === 'complete') {
          setCancelConfirm(item);
          return;
        }
      }
    }
    doCancel(item);
  };

  const doCancel = async (item) => {
    setCancelConfirm(null);
    const { ok, error } = await sbDeleteScheduleItem(item.id);
    if (ok) {
      setItems(prev => prev.filter(i => i.id !== item.id));
      await refreshPhases();
      flash('Item cancelled');
    } else {
      setErr(error || 'Failed to cancel item');
    }
  };

  // ── Save handler (called from modal) ─────────────────────────────────────
  const handleSaved = async (savedItem, prevItem, notifyOnSave) => {
    if (!prevItem) {
      setItems(prev => [savedItem, ...prev]);
      if (notifyOnSave !== false) {
        import('../../../lib/supabase').then(({ sbNotifyScheduleItemCreated }) =>
          sbNotifyScheduleItemCreated(savedItem, job).catch(e => console.error('[notify create]', e))
        );
      }
    } else {
      setItems(prev => prev.map(i => i.id === savedItem.id ? savedItem : i));
      if (notifyOnSave) {
        import('../../../lib/supabase').then(({ sbNotifyScheduleItemChanged }) =>
          sbNotifyScheduleItemChanged(savedItem, prevItem, job).catch(e => console.error('[notify change]', e))
        );
      }
    }
    await refreshPhases();
    setShowModal(false);
    setEditItem(null);
    flash(prevItem ? 'Item updated' : 'Item added');
  };

  if (!loaded) return <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF', fontSize: 13 }}>Loading schedule...</div>;

  // ── Phase pill data ───────────────────────────────────────────────────────
  const phaseMap = Object.fromEntries(phases.map(p => [p.phase_name, p]));
  const orderedPhases = PHASE_ORDER.map(name => phaseMap[name]).filter(Boolean);

  // ── Phase item progress (SCHEDULING_ARC slice 3) ─────────────────────────
  // Computed from already-loaded items + phases. No extra query.
  const phaseProgressMap = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const map = {};
    for (const ph of phases) {
      const phItems = items.filter(i => i.phase_id === ph.id && i.status !== 'cancelled');
      const total = phItems.length;
      const completed = phItems.filter(i => !!i.actual_finish_date).length;
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
      const scheduledEnds = phItems.map(i => i.scheduled_end_date || i.scheduled_date).filter(Boolean).sort();
      const latestEnd = scheduledEnds[scheduledEnds.length - 1] || null;
      const isDelayed = ph.end_date && latestEnd && latestEnd > ph.end_date;
      map[ph.id] = { total, completed, pct, isDelayed };
    }
    return map;
  }, [phases, items]);

  // ── Week groups ───────────────────────────────────────────────────────────
  const groups = groupByWeek(items);

  return (
    <div>
      {/* ── Error banner ── */}
      {err && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#DC2626', padding: '10px 14px', fontSize: 13, marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
          {err}
          <button onClick={() => setErr(null)} style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* ── Success pill ── */}
      {successMsg && (
        <div style={{ background: '#D1FAE5', border: '1px solid #A7F3D0', color: '#065F46', padding: '8px 14px', fontSize: 13, marginBottom: 12, borderRadius: 4 }}>{successMsg}</div>
      )}

      {/* ── Phase progress bar (read-only) ── */}
      {orderedPhases.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '14px 16px', marginBottom: 16, borderRadius: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Phase Progress</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {orderedPhases.map(ph => {
              const col = PILL_COLOR[ph.status] || '#9CA3AF';
              const prog = phaseProgressMap[ph.id];
              return (
                <div key={ph.id} style={{ textAlign: 'center', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', minWidth: 72 }}>
                  <div style={{ background: col + '20', border: `1.5px solid ${col}`, borderRadius: 20, padding: '4px 12px', fontSize: 11, fontWeight: 700, color: col, whiteSpace: 'nowrap', lineHeight: 1.4 }}>
                    {ph.phase_name}
                  </div>
                  {prog?.total > 0 && (
                    <div style={{ width: '100%', marginTop: 4 }}>
                      <div style={{ background: '#E8E4DC', height: 4, borderRadius: 2, overflow: 'hidden', width: '100%' }}>
                        <div style={{ background: prog.isDelayed ? '#EF4444' : '#C9A84C', height: 4, borderRadius: 2, width: `${prog.pct}%`, transition: 'width 0.4s' }} />
                      </div>
                      <div style={{ fontSize: 9, color: prog.isDelayed ? '#EF4444' : '#9CA3AF', marginTop: 2, fontWeight: prog.isDelayed ? 700 : 400 }}>
                        {prog.completed}/{prog.total}{prog.isDelayed ? ' · late' : ''}
                      </div>
                    </div>
                  )}
                  {ph.status === 'in_progress' && ph.started_at && (
                    <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>Started {fD(ph.started_at)}</div>
                  )}
                  {ph.status === 'complete' && ph.completed_at && (
                    <div style={{ fontSize: 10, color: '#22c55e', marginTop: 2 }}>Done {fD(ph.completed_at)}</div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 10, fontStyle: 'italic' }}>Phases auto-update from schedule items below.</div>
        </div>
      )}

      {/* ── Schedule items section ── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0A1F44' }}>Schedule Items</div>
          <button
            className="btn btn-gold"
            style={{ fontSize: 12, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => { setEditItem(null); setShowModal(true); }}
          >
            <span style={{ width: 14, height: 14, display: 'flex' }}>{Ic.plus}</span>
            Add schedule item
          </button>
        </div>

        {items.filter(i => i.status !== 'cancelled').length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: '#fff', border: '1px solid #E8E4DC', borderRadius: 4 }}>
            <span style={{ width: 36, height: 36, display: 'block', margin: '0 auto 10px', opacity: 0.3, color: '#374151' }}>{Ic.cal}</span>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 6 }}>No schedule items yet</div>
            <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 16 }}>Add your first delivery, inspection, or sub start.</div>
            <button className="btn btn-gold" style={{ fontSize: 12 }} onClick={() => { setEditItem(null); setShowModal(true); }}>
              + Add schedule item
            </button>
          </div>
        ) : (
          <>
            {[
              { key: 'thisWeek', label: 'This Week' },
              { key: 'nextWeek', label: 'Next Week' },
              { key: 'later',    label: 'Later' },
              { key: 'noDate',   label: 'No Date Set' },
            ].map(({ key, label }) => groups[key].length > 0 && (
              <ItemGroup key={key} label={label} items={groups[key]}
                onEdit={item => { setEditItem(item); setShowModal(true); }}
                onCancel={requestCancel}
              />
            ))}

            {groups.past.length > 0 && (
              <div>
                <button
                  onClick={() => setPastExpanded(v => !v)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0', marginBottom: 4 }}
                >
                  <span style={{ display: 'inline-block', transform: pastExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>›</span>
                  Past ({groups.past.length} item{groups.past.length !== 1 ? 's' : ''})
                </button>
                {pastExpanded && (
                  <ItemGroup label="Past" items={groups.past}
                    onEdit={item => { setEditItem(item); setShowModal(true); }}
                    onCancel={requestCancel}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Create / Edit modal ── */}
      {showModal && (
        <ScheduleItemModal
          item={editItem}
          job={job}
          onClose={() => { setShowModal(false); setEditItem(null); }}
          onSaved={handleSaved}
        />
      )}

      {/* ── Asymmetry confirm dialog ── */}
      {cancelConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 24, maxWidth: 380, margin: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0A1F44', marginBottom: 10 }}>Phase already complete</div>
            <div style={{ fontSize: 13, color: '#374151', marginBottom: 20, lineHeight: 1.5 }}>
              This phase is already marked complete. Cancelling this schedule item won't revert the phase status. Continue?
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setCancelConfirm(null)}>No, keep it</button>
              <button className="btn btn-navy" style={{ flex: 1 }} onClick={() => doCancel(cancelConfirm)}>Yes, cancel item</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Item group ────────────────────────────────────────────────────────────────
function ItemGroup({ label, items, onEdit, onCancel }) {
  if (!items.length) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      {items.map(item => <ItemCard key={item.id} item={item} onEdit={onEdit} onCancel={onCancel} />)}
    </div>
  );
}

// ── Item card ─────────────────────────────────────────────────────────────────
function ItemCard({ item, onEdit, onCancel }) {
  const st   = STATUS_STYLE[item.status] || STATUS_STYLE.scheduled;
  const icon = Ic[TYPE_ICON[item.type]] || Ic.cal;

  return (
    <div style={{ background: '#fff', border: '1px solid #E8E4DC', borderRadius: 4, padding: '12px 14px', marginBottom: 8, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#F7F5F0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
        <span style={{ width: 14, height: 14, display: 'flex', color: '#0A1F44' }}>{icon}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#0A1F44' }}>{item.title}</div>
          <span style={{ background: st.bg, color: st.color, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>
            {item.status?.replace(/_/g, ' ')}
          </span>
        </div>
        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ color: '#6B7280', fontWeight: 500 }}>{TYPE_LABELS[item.type]}</span>
          {item.scheduled_date && <span>{fD(item.scheduled_date)}{item.scheduled_time ? ` ${item.scheduled_time.slice(0, 5)}` : ''}{item.scheduled_end_date ? ` → ${fD(item.scheduled_end_date)}` : ''}</span>}
          {item.trade && <span style={{ background: '#F7F5F0', padding: '1px 6px', borderRadius: 10 }}>{item.trade}</span>}
          {item.assigned_sub?.full_name && <span>→ {item.assigned_sub.full_name}</span>}
        </div>
        {item.notes && (
          <div style={{ fontSize: 12, color: '#6B7280', marginTop: 5, background: '#F7F5F0', padding: '6px 8px', borderRadius: 4, lineHeight: 1.4 }}>
            {item.notes.slice(0, 120)}{item.notes.length > 120 ? '…' : ''}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginTop: 2 }}>
        <button
          className="btn btn-ghost"
          style={{ padding: '6px 12px', fontSize: 12, minHeight: 36 }}
          onClick={() => onEdit(item)}
        >Edit</button>
        <button
          className="btn btn-ghost"
          style={{ padding: '6px 12px', fontSize: 12, minHeight: 36, color: '#6B7280' }}
          onClick={() => onCancel(item)}
        >Cancel</button>
      </div>
    </div>
  );
}

// ── ScheduleItemModal ─────────────────────────────────────────────────────────
const TYPE_OPTIONS = [
  { value: 'material_delivery', label: 'Material Delivery' },
  { value: 'sub_start',         label: 'Sub Start' },
  { value: 'site_visit',        label: 'Site Visit' },
  { value: 'inspection',        label: 'Inspection' },
  { value: 'milestone',         label: 'Milestone' },
  { value: 'delay',             label: 'Delay' },
];
const TYPE_SUGGESTIONS = {
  material_delivery: 'Material delivery',
  sub_start:         'Sub starts',
  site_visit:        'Site visit',
  inspection:        'City inspection',
  milestone:         'Milestone',
  delay:             'Schedule delay',
};
const SHOW_TRADE_FOR = ['material_delivery', 'sub_start', 'delay'];

const PHOTO_GATE_TYPES = ['sub_start', 'site_visit', 'inspection'];
const ITEM_STATUSES = ['scheduled', 'in_progress', 'complete', 'cancelled'];

function ScheduleItemModal({ item, job, onClose, onSaved }) {
  const isNew = !item;
  const [form, setForm] = useState({
    type:               item?.type            || 'material_delivery',
    title:              item?.title           || TYPE_SUGGESTIONS['material_delivery'],
    scheduled_date:     item?.scheduled_date  || '',
    scheduled_time:     item?.scheduled_time  || '',
    scheduled_end_date: item?.scheduled_end_date || '',
    notes:              item?.notes           || '',
    trade:              item?.trade           || '',
    assigned_sub_id:    item?.assigned_sub_id || '',
    notify_client:      item?.notify_client   ?? true,
    notify_sub:         item?.notify_sub      ?? true,
    status:             item?.status          || 'scheduled',
  });
  const [notifyOnSave, setNotifyOnSave] = useState(true);
  const [showEndDate, setShowEndDate]   = useState(!!item?.scheduled_end_date);
  const [saving, setSaving]             = useState(false);
  const [err, setErr]                   = useState(null);
  const [conflictWarning, setConflictWarning] = useState(null); // null | { conflicts }
  const [conflictOverride, setConflictOverride] = useState(false);
  const [trades, setTrades]             = useState([]);
  const [subs, setSubs]                 = useState([]);
  const [entityPhotoCount, setEntityPhotoCount] = useState(0);
  const [entityPhotos, setEntityPhotos] = useState([]);
  const [uploading, setUploading]       = useState(false);
  const photoRef                        = useRef();
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [hasChecklist, setHasChecklist] = useState(false);
  const [addingChecklist, setAddingChecklist] = useState(false);
  const [checklistTemplate, setChecklistTemplate] = useState('');
  const [checklistKey, setChecklistKey] = useState(0); // bump to reload SiteVisitChecklist

  useEffect(() => {
    import('../../../lib/supabase').then(({ sbLoadActiveTradeStrings, sbLoadActiveSubs }) => {
      sbLoadActiveTradeStrings().then(setTrades);
      sbLoadActiveSubs().then(setSubs);
    });
    if (!isNew && PHOTO_GATE_TYPES.includes(item.type)) {
      sbCountPhotosForEntity('schedule_item', item.id).then(setEntityPhotoCount);
      sbLoadPhotosForEntity('schedule_item', item.id).then(setEntityPhotos);
    }
    if (!isNew && item.type === 'site_visit') {
      sbLoadChecklistForScheduleItem(item.id).then(rows => setHasChecklist(rows.length > 0)).catch(() => {});
    }
  }, []);

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleEntityPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !item?.id) return;
    setUploading(true);
    const result = await sbPhoto(job.id, file, 'schedule_item', item.id);
    setUploading(false);
    if (result.ok) {
      setEntityPhotoCount(c => c + 1);
      setEntityPhotos(p => [...p, result.data]);
    }
    e.target.value = '';
  };

  const handleTypeChange = (type) => {
    setField('type', type);
    // Only overwrite title if it still matches the old suggestion
    if (TYPE_SUGGESTIONS[form.type] === form.title) {
      setField('title', TYPE_SUGGESTIONS[type]);
    }
  };

  const handleSubChange = (subId) => {
    setField('assigned_sub_id', subId);
    // Auto-fill trade if blank and sub has a primary trade
    if (subId && !form.trade) {
      const sub = subs.find(s => s.id === subId);
      if (sub?.trade) setField('trade', sub.trade);
    }
  };

  const save = async (override = conflictOverride) => {
    if (!form.title.trim()) { setErr('Title is required'); return; }
    if (!form.scheduled_date && form.type !== 'delay') { setErr('Date is required'); return; }
    setErr(null);

    // Soft conflict check — sub double-booking via assigned_sub_id
    if (!override && form.assigned_sub_id && form.scheduled_date) {
      const { conflicts } = await sbCheckResourceConflicts({
        scheduledDate:    form.scheduled_date,
        scheduledEndDate: form.scheduled_end_date || null,
        assignedSubId:    form.assigned_sub_id,
        excludeItemId:    isNew ? undefined : item.id,
      });
      if (conflicts.length > 0) {
        setConflictWarning({ conflicts });
        return;
      }
    }

    setConflictWarning(null);
    setSaving(true);

    // Coalesce at modal boundary (defense in depth)
    const payload = {
      ...form,
      job_id:             job.id,
      title:              form.title.trim(),
      scheduled_date:     form.scheduled_date     || null,
      scheduled_end_date: form.scheduled_end_date || null,
      assigned_sub_id:    form.assigned_sub_id    || null,
      trade:              form.trade              || null,
      notes:              form.notes.trim()       || null,
    };

    let result;
    if (isNew) {
      result = await sbCreateScheduleItem(payload);
    } else {
      result = await sbUpdateScheduleItem(item.id, payload);
    }

    setSaving(false);
    if (!result.ok) { setErr(result.error || 'Save failed'); return; }
    if (isNew && selectedTemplate && result.data?.id) {
      sbCreateChecklistFromTemplate(result.data.id, selectedTemplate).catch(() => {});
    }
    onSaved(result.data, isNew ? null : item, notifyOnSave);
  };

  const ssty = { appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 32 };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0A1F44' }}>{isNew ? 'Add Schedule Item' : 'Edit Schedule Item'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: '#9CA3AF', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {err && <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#DC2626', padding: '8px 12px', fontSize: 12, marginBottom: 12, borderRadius: 4 }}>{err}</div>}

        {conflictWarning && (
          <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', color: '#92400E', padding: '10px 12px', fontSize: 12, marginBottom: 12, borderRadius: 4 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Sub double-booking detected</div>
            {conflictWarning.conflicts.map((c, i) => (
              <div key={i} style={{ marginBottom: 2 }}>
                <strong>{c.name}</strong> is already scheduled for <em>{c.itemTitle}</em> on {c.conflictDate}.
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => { setConflictOverride(true); save(true); }} className="btn btn-navy" style={{ fontSize: 12, padding: '4px 12px' }}>Save anyway</button>
              <button onClick={() => setConflictWarning(null)} className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 12px' }}>Go back</button>
            </div>
          </div>
        )}

        {/* Type */}
        <div className="fg">
          <label className="flbl">Type *</label>
          <select className="finp" style={ssty} value={form.type} onChange={e => handleTypeChange(e.target.value)}>
            {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Title */}
        <div className="fg">
          <label className="flbl">Title *</label>
          <input className="finp" value={form.title} onChange={e => setField('title', e.target.value)} placeholder={TYPE_SUGGESTIONS[form.type]} />
        </div>

        {/* Date + Time */}
        <div className="fg">
          <label className="flbl">Date{form.type !== 'delay' ? ' *' : ' (optional)'}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="finp" type="date" value={form.scheduled_date} onChange={e => setField('scheduled_date', e.target.value)} style={{ flex: 1 }} />
            <input className="finp" type="time" value={form.scheduled_time} onChange={e => setField('scheduled_time', e.target.value)} style={{ width: 130 }} placeholder="Time (opt.)" />
          </div>
        </div>

        {/* End date toggle */}
        {!showEndDate ? (
          <button
            type="button"
            style={{ background: 'none', border: 'none', color: '#0A1F44', fontSize: 12, cursor: 'pointer', padding: '0 0 12px', textDecoration: 'underline' }}
            onClick={() => setShowEndDate(true)}
          >+ Multi-day (add end date)</button>
        ) : (
          <div className="fg">
            <label className="flbl">End Date</label>
            <input className="finp" type="date" value={form.scheduled_end_date} onChange={e => setField('scheduled_end_date', e.target.value)} />
          </div>
        )}

        {/* Trade */}
        {SHOW_TRADE_FOR.includes(form.type) && (
          <div className="fg">
            <label className="flbl">Trade</label>
            <select className="finp" style={ssty} value={form.trade} onChange={e => setField('trade', e.target.value)}>
              <option value="">— None —</option>
              {trades.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}

        {/* Assigned sub */}
        <div className="fg">
          <label className="flbl">Assign to Sub</label>
          <select className="finp" style={ssty} value={form.assigned_sub_id} onChange={e => handleSubChange(e.target.value)}>
            <option value="">— Unassigned —</option>
            {subs.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </div>

        {/* Notes */}
        <div className="fg">
          <label className="flbl">Notes</label>
          <textarea className="finp" rows={2} value={form.notes} onChange={e => setField('notes', e.target.value)} style={{ resize: 'vertical' }} />
        </div>

        {/* Checklist template picker — new site_visit items */}
        {isNew && form.type === 'site_visit' && (
          <div className="fg">
            <label className="flbl">Checklist Template</label>
            <select className="finp" style={ssty} value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)}>
              <option value="">(none)</option>
              {getTemplateOptions().map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
            </select>
          </div>
        )}

        {/* Checklist section — edit mode site_visit */}
        {!isNew && form.type === 'site_visit' && (
          <div style={{ marginBottom: 14 }}>
            {hasChecklist ? (
              <SiteVisitChecklist key={checklistKey} scheduleItemId={item.id} />
            ) : (
              <div style={{ background: '#F7F5F0', border: '1px solid #E8E4DC', borderRadius: 6, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 8 }}>No checklist attached to this site visit.</div>
                {!addingChecklist ? (
                  <button type="button" onClick={() => setAddingChecklist(true)} style={{ fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 5, border: '1px solid #0A1F44', background: '#0A1F44', color: '#fff', cursor: 'pointer' }}>
                    + Add Checklist
                  </button>
                ) : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select className="finp" style={{ ...ssty, flex: 1, minWidth: 140 }} value={checklistTemplate} onChange={e => setChecklistTemplate(e.target.value)}>
                      <option value="">— Pick template —</option>
                      {getTemplateOptions().map(t => <option key={t.key} value={t.key}>{t.name}</option>)}
                    </select>
                    <button type="button"
                      disabled={!checklistTemplate}
                      onClick={async () => {
                        if (!checklistTemplate) return;
                        try {
                          await sbCreateChecklistFromTemplate(item.id, checklistTemplate);
                          setHasChecklist(true);
                          setAddingChecklist(false);
                          setChecklistKey(k => k + 1);
                        } catch (e) {
                          setErr(e.message);
                        }
                      }}
                      style={{ fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 5, border: `1px solid ${checklistTemplate ? '#0A1F44' : '#D1D5DB'}`, background: checklistTemplate ? '#0A1F44' : '#F9FAFB', color: checklistTemplate ? '#fff' : '#9CA3AF', cursor: checklistTemplate ? 'pointer' : 'not-allowed' }}
                    >
                      Create
                    </button>
                    <button type="button" onClick={() => setAddingChecklist(false)} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 5, border: '1px solid #D1D5DB', background: 'transparent', color: '#6B7280', cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Status (edit only) */}
        {!isNew && (
          <div className="fg">
            <label className="flbl">Status</label>
            <select className="finp" style={ssty} value={form.status} onChange={e => setField('status', e.target.value)}>
              {ITEM_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
            </select>
          </div>
        )}

        {/* Photo gate — required when marking gateable types complete */}
        {!isNew && PHOTO_GATE_TYPES.includes(form.type) && (
          <div style={{ background: form.status === 'complete' && entityPhotoCount === 0 ? '#FEF3C7' : '#F7F5F0', border: `1px solid ${form.status === 'complete' && entityPhotoCount === 0 ? '#FCD34D' : '#E8E4DC'}`, borderRadius: 6, padding: '10px 12px', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 2 }}>
                  {entityPhotoCount > 0 ? `${entityPhotoCount} photo${entityPhotoCount !== 1 ? 's' : ''} attached` : 'No photos attached'}
                </div>
                {form.status === 'complete' && entityPhotoCount === 0 && (
                  <div style={{ fontSize: 11, color: '#92400E' }}>1 photo required to mark complete</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => photoRef.current?.click()}
                disabled={uploading}
                style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 5, border: '1px solid #0A1F44', background: '#0A1F44', color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {uploading ? 'Uploading…' : '📷 Add Photo'}
              </button>
            </div>
            <input ref={photoRef} type="file" accept="image/*" capture="environment" onChange={handleEntityPhoto} style={{ display: 'none' }} />
            {entityPhotos.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {entityPhotos.map(p => (
                  <a key={p.id} href={p.url} target="_blank" rel="noreferrer" style={{ display: 'block', flexShrink: 0 }}>
                    <img src={p.url} alt={p.name || 'photo'} style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 4, border: '1px solid #D1D5DB' }} />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Audience */}
        <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Notify</div>
        <div style={{ display: 'flex', gap: 20, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="notifyClient" checked={form.notify_client} onChange={e => setField('notify_client', e.target.checked)} />
            <label htmlFor="notifyClient" style={{ fontSize: 13, color: '#374151', cursor: 'pointer' }}>Client</label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="notifySub" checked={form.notify_sub} onChange={e => setField('notify_sub', e.target.checked)} />
            <label htmlFor="notifySub" style={{ fontSize: 13, color: '#374151', cursor: 'pointer' }}>Sub</label>
          </div>
        </div>

        {/* Notify on save (edit only) */}
        {!isNew && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <input type="checkbox" id="notifyOnSave" checked={notifyOnSave} onChange={e => setNotifyOnSave(e.target.checked)} />
            <label htmlFor="notifyOnSave" style={{ fontSize: 13, color: '#374151', cursor: 'pointer' }}>Notify on save</label>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
          <button className="btn btn-navy" style={{ flex: 1 }} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : isNew ? 'Add Item' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
