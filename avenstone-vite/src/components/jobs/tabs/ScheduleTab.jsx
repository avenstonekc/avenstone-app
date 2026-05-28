import { useState, useEffect, useRef, useMemo } from 'react';
import { AV_USER_ID, AV_TENANT, sb, sbLoadPhases, sbSeedJobPhases, sbLoadScheduleItems, sbCreateScheduleItem, sbUpdateScheduleItem, sbDeleteScheduleItem, derivePhaseStatus, sbPhoto, sbCountPhotosForEntity, sbLoadPhotosForEntity, sbCreateChecklistFromTemplate, sbLoadChecklistForScheduleItem, sbCheckResourceConflicts } from '../../../lib/supabase';
import { getTemplateOptions } from '../../../lib/siteVisitTemplates';
import SiteVisitChecklist from '../SiteVisitChecklist';
import { Ic, fD } from '../../../lib/utils';

// Phase display config — title-case keys match job_phases.phase_name in DB
const PHASE_ORDER = ['Lead', 'Proposal', 'Contract', 'Demo', 'Rough-ins', 'Inspections', 'Drywall', 'Finishes', 'Final touches', 'Complete'];

// Brand-palette phase pill styles per status
const PILL_STYLE = {
  not_started: { bg: '#EBE6D2', border: '#C4BC9E', color: '#6B5F3F' },
  pending:     { bg: '#EBE6D2', border: '#C4BC9E', color: '#6B5F3F' },
  in_progress: { bg: '#FAEEDA', border: '#C9A84C', color: '#6B4E14' },
  complete:    { bg: '#DCE5D8', border: '#8FAF86', color: '#2E4528' },
  blocked:     { bg: '#FEE2E2', border: '#FCA5A5', color: '#991B1B' },
};

// Schedule item config
const TYPE_LABELS = { material_delivery: 'Material Delivery', sub_start: 'Sub Start', site_visit: 'Site Visit', inspection: 'Inspection', milestone: 'Milestone', delay: 'Delay' };
const TYPE_ICON = { material_delivery: 'box', sub_start: 'check', site_visit: 'eye', inspection: 'clip', milestone: 'sched', delay: 'warn' };

// Brand-palette day chips (WeekStrip)
const TYPE_CHIP_COLORS = {
  sub_start:         { bg: '#0A1F44', color: '#fff',    border: 'none' },
  material_delivery: { bg: '#C9A84C', color: '#0A1F44', border: 'none' },
  inspection:        { bg: '#DCE5D8', color: '#2E4528', border: 'none' },
  milestone:         { bg: 'transparent', color: '#0A1F44', border: '1px solid #0A1F44' },
  site_visit:        { bg: '#EBE6D2', color: '#6B5F3F', border: 'none' },
  delay:             { bg: '#FEE2E2', color: '#991B1B', border: 'none' },
};

// Brand-palette avatar circles (ItemCard)
const TYPE_AVATAR = {
  sub_start:         { bg: '#0A1F44', color: '#fff',    outline: 'none' },
  material_delivery: { bg: '#C9A84C', color: '#0A1F44', outline: 'none' },
  inspection:        { bg: '#DCE5D8', color: '#2E4528', outline: 'none' },
  milestone:         { bg: '#0A1F44', color: '#fff',    outline: '2px solid #C9A84C' },
  site_visit:        { bg: '#EBE6D2', color: '#6B5F3F', outline: 'none' },
  delay:             { bg: '#FEE2E2', color: '#991B1B', outline: 'none' },
};

const STATUS_BADGE = {
  in_progress: { label: 'IN PROGRESS', bg: '#FAEEDA', color: '#6B4E14' },
  complete:    { label: 'COMPLETE',    bg: '#DCE5D8', color: '#2E4528' },
  cancelled:   { label: 'CANCELLED',  bg: '#EBE6D2', color: '#6B5F3F' },
};

// ── Date helpers ───────────────────────────────────────────────────────────────
function startOfWeekMon(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function dateToISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function isSameDayLocal(isoStr, date) { return isoStr === dateToISO(date); }
const WEEKDAY_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTH_ABBR   = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtWeekDay(date) { return WEEKDAY_ABBR[date.getDay()]; }
function fmtMonthDay(date) { return `${MONTH_ABBR[date.getMonth()]} ${date.getDate()}`; }
function truncate(str, len) { return str.length > len ? str.slice(0, len) + '…' : str; }

function groupByWeek(items, today) {
  const weekStart     = dateToISO(startOfWeekMon(today));
  const nextWeekStart = dateToISO(addDays(startOfWeekMon(today), 7));
  const afterNext     = dateToISO(addDays(startOfWeekMon(today), 14));
  const groups = { thisWeek: [], nextWeek: [], later: [], noDate: [], past: [] };
  for (const item of items) {
    if (item.status === 'cancelled') continue;
    if (!item.scheduled_date) { groups.noDate.push(item); continue; }
    const d = item.scheduled_date;
    if (d < weekStart)      { groups.past.push(item); continue; }
    if (d < nextWeekStart)  { groups.thisWeek.push(item); continue; }
    if (d < afterNext)      { groups.nextWeek.push(item); continue; }
    groups.later.push(item);
  }
  return groups;
}

// ── WeekStrip ─────────────────────────────────────────────────────────────────
function WeekStrip({ items, today, weekOffset, onWeekOffsetChange, selectedDate, onSelectDate }) {
  const monday = startOfWeekMon(addDays(today, weekOffset * 7));
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const todayStr = dateToISO(today);
  const selectedStr = selectedDate ? dateToISO(selectedDate) : null;
  const navBtn = { background: '#fff', border: '1px solid #E8E4DC', borderRadius: 4, padding: '3px 10px', fontSize: 13, color: '#0A1F44', cursor: 'pointer', fontFamily: 'inherit' };
  return (
    <div style={{ background: '#fff', border: '1px solid #EBE6D2', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#0A1F44' }}>
          {fmtMonthDay(monday)} – {fmtMonthDay(addDays(monday, 6))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={navBtn} onClick={() => onWeekOffsetChange(weekOffset - 1)}>‹</button>
          <button style={{ ...navBtn, fontSize: 11 }} onClick={() => onWeekOffsetChange(0)}>Today</button>
          <button style={navBtn} onClick={() => onWeekOffsetChange(weekOffset + 1)}>›</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {days.map(day => {
          const dayStr = dateToISO(day);
          const dayItems = items.filter(i => i.scheduled_date === dayStr && i.status !== 'cancelled');
          const isToday = dayStr === todayStr;
          const isSelected = dayStr === selectedStr;
          return (
            <button key={dayStr} onClick={() => onSelectDate(isSelected ? null : day)}
              style={{ background: '#F5F2E8', border: isSelected ? '1.5px solid #C9A84C' : '0.5px solid #EBE6D2',
                borderRadius: 6, padding: '6px 4px', minHeight: 72, cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, fontFamily: 'inherit',
                transition: 'border-color 0.12s' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#0A1F44', letterSpacing: 0.3, opacity: 0.8 }}>
                {fmtWeekDay(day)} {day.getDate()}
              </div>
              {isToday && <div style={{ fontSize: 9, fontWeight: 700, color: '#0A1F44', lineHeight: 1 }}>TODAY</div>}
              {dayItems.slice(0, 3).map(item => {
                const chip = TYPE_CHIP_COLORS[item.type] || { bg: '#EBE6D2', color: '#6B5F3F', border: 'none' };
                return (
                  <div key={item.id} style={{ background: chip.bg, color: chip.color, fontSize: 9,
                    border: chip.border || 'none',
                    borderRadius: 3, padding: '1px 4px', overflow: 'hidden', whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis', maxWidth: '100%', width: '100%', textAlign: 'left' }}>
                    {truncate(item.title, 10)}
                  </div>
                );
              })}
              {dayItems.length > 3 && <div style={{ fontSize: 9, color: '#9CA3AF' }}>+{dayItems.length - 3}</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ScheduleTab({ job }) {
  const [phases, setPhases]         = useState([]);
  const [items,  setItems]          = useState([]);
  const [loaded, setLoaded]         = useState(false);
  const [err,    setErr]            = useState(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [pastExpanded, setPastExpanded] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(null);
  const [showModal, setShowModal]   = useState(false);
  const [editItem, setEditItem]     = useState(null);
  const [phaseFilter,  setPhaseFilter]  = useState(null);
  const [weekOffset,   setWeekOffset]   = useState(0);
  const [selectedDate, setSelectedDate] = useState(null);

  // Must be above early return — hook ordering rule
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  useEffect(() => { load(); }, []);

  const load = async () => {
    try {
      const [pData, iResult] = await Promise.all([
        sbLoadPhases(job.id),
        sbLoadScheduleItems(job.id),
      ]);
      let phases = pData || [];
      if (phases.length === 0) {
        await sbSeedJobPhases(job.id, AV_TENANT);
        const seeded = await sbLoadPhases(job.id);
        phases = seeded || [];
      }
      setPhases(phases);
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

  // ── Phase item progress (SCHEDULING_ARC slice 3) ─────────────────────────
  // Must be above the early return — useMemo is a hook and must be called on
  // every render in the same order. phases/items start as [] so this is safe.
  const phaseProgressMap = useMemo(() => {
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

  if (!loaded) return <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF', fontSize: 13 }}>Loading schedule...</div>;

  // ── Derived data ──────────────────────────────────────────────────────────
  const phaseNameMap = Object.fromEntries(phases.map(p => [p.id, p.phase_name]));
  const phaseMap = Object.fromEntries(phases.map(p => [p.phase_name, p]));
  const orderedPhases = PHASE_ORDER.map(name => phaseMap[name]).filter(Boolean);

  const hasFilter = phaseFilter !== null;
  const phaseFiltered = hasFilter ? items.filter(i => i.phase_id === phaseFilter) : items;
  const dayFiltered = selectedDate
    ? phaseFiltered.filter(i => i.scheduled_date && isSameDayLocal(i.scheduled_date, selectedDate) && i.status !== 'cancelled')
    : null;
  const groups = dayFiltered ? null : groupByWeek(phaseFiltered, today);

  const openEdit = (item) => { setEditItem(item); setShowModal(true); };

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

      {/* ── Phase pills (clickable filter) ── */}
      {orderedPhases.length > 0 && (() => {
        const doneCount = orderedPhases.filter(p => p.status === 'complete').length;
        return (
          <div style={{ background: '#fff', border: '1px solid #EBE6D2', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#0A1F44', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phase Progress</div>
              <div style={{ fontSize: 11, color: 'rgba(10,31,68,0.55)' }}>
                {doneCount} of {orderedPhases.length} phases complete
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {orderedPhases.map(ph => {
                const ps = PILL_STYLE[ph.status] || PILL_STYLE.not_started;
                const isActive = phaseFilter === ph.id;
                return (
                  <button key={ph.id} onClick={() => setPhaseFilter(isActive ? null : ph.id)}
                    aria-pressed={isActive}
                    style={{ background: ps.bg, border: `${isActive ? '2px' : '1px'} solid ${isActive ? '#C9A84C' : ps.border}`,
                      borderRadius: 20, padding: '4px 11px', fontSize: 11, fontWeight: 600, color: ps.color, whiteSpace: 'nowrap',
                      cursor: 'pointer', opacity: hasFilter && !isActive ? 0.55 : 1,
                      transition: 'opacity 0.12s, border-color 0.12s', fontFamily: 'inherit', lineHeight: 1.4 }}>
                    {ph.status === 'complete' ? '✓ ' : ''}{ph.phase_name}
                  </button>
                );
              })}
              {hasFilter && (
                <button onClick={() => setPhaseFilter(null)}
                  style={{ fontSize: 11, color: 'rgba(10,31,68,0.5)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 4px', fontFamily: 'inherit' }}>
                  × Clear
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── Week strip ── */}
      <WeekStrip
        items={phaseFiltered}
        today={today}
        weekOffset={weekOffset}
        onWeekOffsetChange={setWeekOffset}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
      />

      {/* ── Schedule items section ── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0A1F44' }}>
            {selectedDate ? `${fmtWeekDay(selectedDate)}, ${fmtMonthDay(selectedDate)}` : 'Schedule Items'}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {selectedDate && (
              <button onClick={() => setSelectedDate(null)}
                style={{ fontSize: 11, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', fontFamily: 'inherit' }}>
                × All
              </button>
            )}
            <button
              className="btn btn-gold"
              style={{ fontSize: 12, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => { setEditItem(null); setShowModal(true); }}
            >
              <span style={{ width: 14, height: 14, display: 'flex' }}>{Ic.plus}</span>
              Add schedule item
            </button>
          </div>
        </div>

        {items.filter(i => i.status !== 'cancelled').length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 24px', background: '#F5F2E8', border: '1px dashed #C9A84C', borderRadius: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0A1F44', marginBottom: 6 }}>Get the schedule rolling</div>
            <div style={{ fontSize: 13, color: 'rgba(10,31,68,0.6)', marginBottom: 20, lineHeight: 1.5 }}>
              Add your first delivery, inspection, or sub start to start tracking progress.
            </div>
            <button className="btn btn-gold" style={{ fontSize: 12 }} onClick={() => { setEditItem(null); setShowModal(true); }}>
              + Add schedule item
            </button>
          </div>
        ) : dayFiltered ? (
          dayFiltered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 20px', color: '#9CA3AF', fontSize: 13 }}>No items on this day.</div>
          ) : (
            <ItemGroup label="" items={dayFiltered} phaseNameMap={phaseNameMap} onEdit={openEdit} onCancel={requestCancel} />
          )
        ) : (
          <>
            {[
              { key: 'thisWeek', label: 'This Week' },
              { key: 'nextWeek', label: 'Next Week' },
              { key: 'later',    label: 'Later' },
              { key: 'noDate',   label: 'No Date Set' },
            ].map(({ key, label }) => groups[key].length > 0 && (
              <ItemGroup key={key} label={label} items={groups[key]} phaseNameMap={phaseNameMap}
                onEdit={openEdit} onCancel={requestCancel}
              />
            ))}

            {groups.past.length > 0 && (
              <div>
                <button
                  onClick={() => setPastExpanded(v => !v)}
                  style={{ background: '#F5F2E8', border: '1px solid #EBE6D2', borderRadius: 20, cursor: 'pointer',
                    fontSize: 11, color: '#0A1F44', display: 'flex', alignItems: 'center', gap: 4,
                    padding: '4px 12px', marginBottom: 6, fontFamily: 'inherit', fontWeight: 500 }}
                >
                  <span style={{ display: 'inline-block', transform: pastExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', color: '#C9A84C', fontSize: 14, lineHeight: 1 }}>›</span>
                  Past ({groups.past.length} item{groups.past.length !== 1 ? 's' : ''})
                </button>
                {pastExpanded && (
                  <ItemGroup label="Past" items={groups.past} phaseNameMap={phaseNameMap}
                    onEdit={openEdit} onCancel={requestCancel}
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
function ItemGroup({ label, items, phaseNameMap, onEdit, onCancel }) {
  if (!items.length) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(10,31,68,0.55)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, marginTop: 10 }}>{label}</div>}
      {items.map(item => (
        <ItemCard key={item.id} item={item} phaseName={phaseNameMap?.[item.phase_id]} onEdit={onEdit} onCancel={onCancel} />
      ))}
    </div>
  );
}

// ── Item card ─────────────────────────────────────────────────────────────────
function ItemCard({ item, phaseName, onEdit, onCancel }) {
  const iconKey = TYPE_ICON[item.type] || 'cal';
  const icon = Ic[iconKey];
  const av = TYPE_AVATAR[item.type] || { bg: '#EBE6D2', color: '#6B5F3F', outline: 'none' };
  const badge = STATUS_BADGE[item.status] || null;
  return (
    <div style={{ background: '#fff', border: '0.5px solid #EBE6D2', borderRadius: 8, padding: '12px 14px', marginBottom: 8, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: av.bg, outline: av.outline, outlineOffset: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
        <span style={{ width: 14, height: 14, display: 'flex', color: av.color }}>{icon}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: '#0A1F44' }}>{item.title}</div>
          {badge && (
            <span style={{ background: badge.bg, color: badge.color, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, padding: '2px 8px', borderRadius: 20, whiteSpace: 'nowrap' }}>
              {badge.label}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'rgba(10,31,68,0.55)', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ color: '#0A1F44', fontWeight: 500, opacity: 0.7 }}>{TYPE_LABELS[item.type]}</span>
          {item.scheduled_date && <span>{fD(item.scheduled_date)}{item.scheduled_time ? ` ${item.scheduled_time.slice(0, 5)}` : ''}{item.scheduled_end_date ? ` → ${fD(item.scheduled_end_date)}` : ''}</span>}
          {item.trade && <span style={{ background: '#F5F2E8', padding: '1px 6px', borderRadius: 10, color: '#6B5F3F' }}>{item.trade}</span>}
          {item.assigned_sub?.full_name && <span>→ {item.assigned_sub.full_name}</span>}
          {phaseName && <span style={{ color: '#9E7E2A', fontWeight: 500 }}>{phaseName}</span>}
        </div>
        {item.notes && (
          <div style={{ fontSize: 12, color: 'rgba(10,31,68,0.65)', marginTop: 5, background: '#F5F2E8', padding: '6px 8px', borderRadius: 4, lineHeight: 1.4 }}>
            {item.notes.slice(0, 120)}{item.notes.length > 120 ? '…' : ''}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginTop: 2 }}>
        <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12, minHeight: 36 }} onClick={() => onEdit(item)}>Edit</button>
        <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 12, minHeight: 36, color: '#6B7280' }} onClick={() => onCancel(item)}>Cancel</button>
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
    phase_id:           item?.phase_id        || '',
  });
  const [notifyOnSave, setNotifyOnSave] = useState(true);
  const [showEndDate, setShowEndDate]   = useState(!!item?.scheduled_end_date);
  const [saving, setSaving]             = useState(false);
  const [err, setErr]                   = useState(null);
  const [conflictWarning, setConflictWarning] = useState(null); // null | { conflicts }
  const [conflictOverride, setConflictOverride] = useState(false);
  const [trades, setTrades]             = useState([]);
  const [subs, setSubs]                 = useState([]);
  const [phases, setPhases]             = useState([]);
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
    sbLoadPhases(job.id).then(data => setPhases(Array.isArray(data) ? data : []));
    if (!isNew && PHOTO_GATE_TYPES.includes(item.type)) {
      sbCountPhotosForEntity('schedule_item', item.id).then(setEntityPhotoCount);
      sbLoadPhotosForEntity('schedule_item', item.id).then(setEntityPhotos);
    }
    if (!isNew && item.type === 'site_visit') {
      sbLoadChecklistForScheduleItem(item.id).then(rows => setHasChecklist(rows.length > 0)).catch(() => {});
    }
  }, []);

  // Title → trade fuzzy match. Fires only when trade is empty (never overwrites).
  // Modal-side fallback for when the agent omits/guesses trade or the user types
  // a title before picking a sub. Scoring: trailing segment (3) > leading (2) > word (1).
  useEffect(() => {
    if (form.trade) return;
    if (!trades.length) return;
    const norm = form.title.toLowerCase().replace(/[^\w\s/-]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!norm) return;
    const titleWords = norm.split(' ').filter(w => w.length >= 4);
    let bestScore = 0;
    let bestTrade = '';
    for (const t of trades) {
      const tl = t.toLowerCase();
      const parts = tl.split(/\s+-\s+|\s+\/\s+/);
      const trailing = parts[parts.length - 1].trim();
      const leading  = parts[0].trim();
      let score = 0;
      if (trailing && norm.includes(trailing))      score = 3;
      else if (leading && norm.includes(leading))   score = 2;
      else if (titleWords.some(w => tl.includes(w))) score = 1;
      if (score > bestScore) { bestScore = score; bestTrade = t; }
    }
    if (bestScore > 0) setField('trade', bestTrade);
  }, [form.title, trades, form.trade]);

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
      phase_id:           form.phase_id           || null,
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

        {/* Phase */}
        {phases.length > 0 && (
          <div className="fg">
            <label className="flbl">Phase</label>
            <select className="finp" style={ssty} value={form.phase_id || ''} onChange={e => setField('phase_id', e.target.value || null)}>
              <option value="">— No phase —</option>
              {phases.map(p => <option key={p.id} value={p.id}>{p.phase_name}</option>)}
            </select>
          </div>
        )}

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
