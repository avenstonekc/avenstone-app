import { useState, useEffect } from 'react';
import {
  sb, AV_USER_ID, AV_TENANT,
  sbLoadUpcomingScheduleItems, sbCreateScheduleItem, sbUpdateScheduleItem, sbDeleteScheduleItem,
  sbLoadScheduleInvitees, sbAddScheduleInvitee, sbRemoveScheduleInvitee,
  sbLoadTeam, sbLoadActiveSubs, sbCheckResourceConflicts, sbCheckLeadTime,
} from '../../lib/supabase';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const SC = { lead:'var(--text-subtle)', proposal:'#f59e0b', contract:'#22c55e', in_progress:'var(--gold-500)', final_touches:'#3B82F6', complete:'#10B981', on_hold:'#F97316' };

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

function inviteStatusColor(status) {
  return { invited:'#888', accepted:'#22c55e', declined:'#EF4444', tentative:'var(--gold-500)' }[status] || '#888';
}

export default function CalScr({ jobs, profile, onSelectJob }) {
  const [view, setView] = useState('month');
  const [cur, setCur] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [phases, setPhases] = useState([]);
  const [scheduleItems, setScheduleItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [editingItem, setEditingItem] = useState(null);

  useEffect(() => {
    if (!jobs.length) { setLoading(false); return; }
    sb.from('job_phases').select('*').in('job_id', jobs.map(j => j.id)).then(({ data }) => {
      setPhases(data || []);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    sbLoadUpcomingScheduleItems(90).then(r => { if (r?.ok) setScheduleItems(r.data || []); });
  }, []);

  const reloadItems = () =>
    sbLoadUpcomingScheduleItems(90).then(r => { if (r?.ok) setScheduleItems(r.data || []); });

  const prevMonth = () => setCur(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const nextMonth = () => setCur(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  const toStr = d => d.toISOString().split('T')[0];
  const today = toStr(new Date());
  const filtJobs = filter === 'all' ? jobs : jobs.filter(j => j.status === filter);

  const year = cur.getFullYear(), month = cur.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDays = new Date(year, month, 0).getDate();
  const days = [];
  for (let i = firstDay - 1; i >= 0; i--) days.push({ date: new Date(year, month - 1, prevDays - i), in: false });
  for (let d = 1; d <= daysInMonth; d++) days.push({ date: new Date(year, month, d), in: true });
  while (days.length < 42) days.push({ date: new Date(year, month + 1, days.length - firstDay - daysInMonth + 1), in: false });

  const jobsForDay = date => { const ds = toStr(date); return filtJobs.filter(j => j.target_completion === ds); };
  const phasesForDay = date => {
    const ds = toStr(date);
    return phases.filter(ph => {
      if (!ph.start_date || !ph.end_date) return false;
      const job = jobs.find(j => j.id === ph.job_id);
      if (!job) return false;
      if (filter !== 'all' && job.status !== filter) return false;
      return ph.start_date <= ds && ph.end_date >= ds;
    });
  };
  const schedItemsForDay = date => {
    const ds = toStr(date);
    return scheduleItems.filter(si => si.scheduled_date === ds);
  };

  const upcoming = () => {
    const evs = [], now = new Date(), cut = new Date(); cut.setDate(cut.getDate() + 90);
    filtJobs.forEach(j => {
      if (j.target_completion) { const d = new Date(j.target_completion + 'T12:00:00'); if (d >= now && d <= cut) evs.push({ type: 'completion', date: d, job: j }); }
    });
    phases.forEach(ph => {
      const job = jobs.find(j => j.id === ph.job_id); if (!job) return;
      if (filter !== 'all' && job.status !== filter) return;
      if (ph.start_date) { const d = new Date(ph.start_date + 'T12:00:00'); if (d >= now && d <= cut) evs.push({ type: 'start', date: d, job, ph }); }
      if (ph.end_date) { const d = new Date(ph.end_date + 'T12:00:00'); if (d >= now && d <= cut) evs.push({ type: 'end', date: d, job, ph }); }
    });
    scheduleItems.forEach(si => {
      if (!si.scheduled_date) return;
      const d = new Date(si.scheduled_date + 'T12:00:00');
      if (d >= now && d <= cut) evs.push({ type: 'schedule_item', date: d, si });
    });
    return evs.sort((a, b) => a.date - b.date);
  };

  return (
    <div style={{ padding: '0 0 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={prevMonth} style={{ background: 'transparent', border: '1px solid #E8E4DC', borderRadius: 4, width: 32, height: 32, cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: 'var(--navy-900)', minWidth: 200, textAlign: 'center' }}>{MONTHS[month]} {year}</div>
          <button onClick={nextMonth} style={{ background: 'transparent', border: '1px solid #E8E4DC', borderRadius: 4, width: 32, height: 32, cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
          <button onClick={() => setCur(() => { const d = new Date(); d.setDate(1); return d; })} style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #E8E4DC', borderRadius: 4, background: 'transparent', color: 'var(--text-subtle)', cursor: 'pointer' }}>Today</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setEditingItem({ create: true })} className="btn btn-navy" style={{ fontSize: 12, height: 32, padding: '0 14px' }}>+ Event</button>
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{ fontSize: 12, padding: '6px 10px', border: '1px solid #E8E4DC', borderRadius: 4, background: 'var(--card-bg)', color: 'var(--text-secondary)' }}>
            <option value="all">All Projects</option>
            <option value="lead">Lead</option>
            <option value="in_progress">In Progress</option>
            <option value="final_touches">Final Touches</option>
            <option value="complete">Complete</option>
          </select>
          <div style={{ display: 'flex', border: '1px solid #E8E4DC', borderRadius: 4, overflow: 'hidden' }}>
            {[['month', 'Month'], ['list', 'List']].map(([v, lb]) => (
              <button key={v} onClick={() => setView(v)} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: v === view ? 'var(--navy-900)' : 'transparent', color: v === view ? 'var(--gold-500)' : 'var(--text-subtle)' }}>{lb}</button>
            ))}
          </div>
        </div>
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-subtle)' }}>Loading...</div> : view === 'month' ? (
        <div style={{ background: 'var(--card-bg)', border: '1px solid #E8E4DC', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid #E8E4DC' }}>
            {DAYS.map(d => <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', letterSpacing: 1 }}>{d}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
            {days.map((day, i) => {
              const ds = toStr(day.date);
              const isToday = ds === today;
              const dj = jobsForDay(day.date);
              const dp = phasesForDay(day.date);
              const dsi = schedItemsForDay(day.date);
              const total = dj.length + dp.length + dsi.length;
              return (
                <div key={i} style={{ minHeight: 80, padding: '5px 3px', borderRight: i % 7 !== 6 ? '1px solid #F3F0EB' : 'none', borderBottom: i < 35 ? '1px solid #F3F0EB' : 'none', background: !day.in ? '#FAFAF8' : isToday ? '#FFFBF0' : 'var(--card-bg)' }}>
                  <div style={{ fontSize: 11, fontWeight: isToday ? 700 : 400, color: isToday ? 'var(--gold-500)' : day.in ? 'var(--text-muted)' : '#D1D5DB', textAlign: 'right', marginBottom: 3 }}>{day.date.getDate()}</div>
                  {dp.slice(0, 2).map(ph => {
                    const job = jobs.find(j => j.id === ph.job_id);
                    const isStart = ph.start_date === ds;
                    return (
                      <div key={ph.id} onClick={() => onSelectJob(job.id)} title={ph.name + ' — ' + job?.address}
                        style={{ fontSize: 10, padding: '2px 4px', marginBottom: 2, cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', background: '#DBEAFE', color: '#1D4ED8', borderRadius: 3, borderLeft: isStart ? '2px solid #3B82F6' : 'none', fontWeight: 500 }}>
                        {isStart ? ph.name : '·'}
                      </div>
                    );
                  })}
                  {dsi.slice(0, Math.max(0, 3 - dp.length)).map(si => (
                    <div key={si.id} onClick={() => setEditingItem(si)} title={si.title + (si.job?.address ? ' — ' + si.job.address : '')}
                      style={{ fontSize: 10, padding: '2px 4px', marginBottom: 2, cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', background: 'var(--amber-bg)', color: '#D97706', border: '1px solid #FDE68A', borderRadius: 3, fontWeight: 500 }}>
                      {si.title}
                    </div>
                  ))}
                  {dj.slice(0, total <= 3 ? 2 : 1).map(j => (
                    <div key={j.id} onClick={() => onSelectJob(j.id)} title={j.address}
                      style={{ fontSize: 10, padding: '2px 4px', marginBottom: 2, cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', background: SC[j.status] + '22', color: SC[j.status], border: '1px solid ' + SC[j.status] + '44', borderRadius: 3, fontWeight: 600 }}>
                      ⚑ {j.address.split(',')[0]}
                    </div>
                  ))}
                  {total > 3 && <div style={{ fontSize: 10, color: 'var(--text-subtle)', paddingLeft: 3 }}>+{total - 3} more</div>}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div>
          {upcoming().length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-subtle)', fontSize: 14 }}>No upcoming events in the next 90 days.</div>
          ) : upcoming().map((ev, i) => {
            const ds = ev.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            const isSchedItem = ev.type === 'schedule_item';
            const icon = isSchedItem ? '●' : ev.type === 'completion' ? '⚑' : ev.type === 'start' ? '▶' : '◼';
            const color = isSchedItem ? '#D97706' : ev.type === 'completion' ? SC[ev.job.status] : '#3B82F6';
            const lbl = isSchedItem
              ? ev.si.title + (ev.si.job?.address ? ' — ' + ev.si.job.address.split(',')[0] : '')
              : ev.type === 'completion' ? 'Completion — ' + ev.job.address
              : ev.type === 'start' ? ev.ph.name + ' starts — ' + ev.job.address
              : ev.ph.name + ' ends — ' + ev.job.address;
            return (
              <div key={i}
                onClick={() => isSchedItem ? setEditingItem(ev.si) : onSelectJob(ev.job.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: 'var(--card-bg)', border: '1px solid #E8E4DC', borderRadius: 6, marginBottom: 8, cursor: 'pointer', transition: 'border-color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--gold-500)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#E8E4DC'}>
                <div style={{ minWidth: 80, fontSize: 12, color: 'var(--text-subtle)', fontWeight: 500 }}>{ds}</div>
                <div style={{ fontSize: 14, color, width: 16, textAlign: 'center' }}>{icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy-900)' }}>{lbl}</div>
                  {ev.ph && <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>{ev.job.assigned_rep || ''}</div>}
                  {isSchedItem && ev.si.notes && <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>{ev.si.notes}</div>}
                </div>
                {!isSchedItem && (
                  <div style={{ fontSize: 11, padding: '3px 8px', borderRadius: 10, background: SC[ev.job.status] + '22', color: SC[ev.job.status], fontWeight: 600 }}>{ev.job.status}</div>
                )}
                {isSchedItem && (
                  <div style={{ fontSize: 11, padding: '3px 8px', borderRadius: 10, background: 'var(--amber-bg)', color: '#D97706', fontWeight: 600 }}>{ev.si.type.replace(/_/g, ' ')}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}><span style={{ display: 'inline-block', width: 10, height: 10, background: '#DBEAFE', border: '1px solid #93C5FD', borderRadius: 2, marginRight: 4 }}></span>Phase</div>
        <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--amber-bg)', border: '1px solid #FDE68A', borderRadius: 2, marginRight: 4 }}></span>Event</div>
        {Object.entries({ lead: 'Lead', active: 'Active', punch: 'Punch List', complete: 'Complete' }).map(([s, lb]) => (
          <div key={s} style={{ fontSize: 11, color: 'var(--text-subtle)' }}><span style={{ display: 'inline-block', width: 10, height: 10, background: SC[s] + '33', border: '1px solid ' + SC[s], borderRadius: 2, marginRight: 4 }}></span>{lb}</div>
        ))}
      </div>

      {editingItem && (
        <EventModal
          item={editingItem.create ? null : editingItem}
          jobs={jobs}
          onClose={() => setEditingItem(null)}
          onSaved={() => { setEditingItem(null); reloadItems(); }}
        />
      )}
    </div>
  );
}

// ── EventModal ──────────────────────────────────────────────────────────────────

function EventModal({ item, jobs, onClose, onSaved }) {
  const isNew = !item;
  const ssty = { appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 32 };

  const [form, setForm] = useState({
    type:           item?.type           || 'milestone',
    title:          item?.title          || TYPE_SUGGESTIONS['milestone'],
    scheduled_date: item?.scheduled_date || new Date().toISOString().slice(0, 10),
    scheduled_time: item?.scheduled_time || '',
    job_id:         item?.job_id         || '',
    trade:          item?.trade          || '',
    notes:          item?.notes          || '',
  });
  const [saving, setSaving]           = useState(false);
  const [deleting, setDeleting]       = useState(false);
  const [err, setErr]                 = useState(null);
  const [leadWarn, setLeadWarn]       = useState(null);
  const [invitees, setInvitees]       = useState([]);
  const [pendingInvId, setPendingInvId] = useState('');
  const [staff, setStaff]             = useState([]);
  const [conflictWarning, setConflictWarning] = useState(null); // null | { conflicts }
  const [conflictOverride, setConflictOverride] = useState(false);

  useEffect(() => {
    if (!item?.id) return;
    sbLoadScheduleInvitees(item.id).then(r => { if (r?.ok) setInvitees(r.data || []); });
    Promise.all([sbLoadTeam(), sbLoadActiveSubs()]).then(([teamData, subsData]) => {
      setStaff([...(teamData || []), ...(subsData || [])]);
    });
  }, [item?.id]);

  const setField = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleTypeChange = type => {
    setField('type', type);
    if (TYPE_SUGGESTIONS[form.type] === form.title) setField('title', TYPE_SUGGESTIONS[type]);
  };

  const activeJobs = jobs.filter(j => j.status !== 'complete' && j.status !== 'on_hold');
  const invitedIds = new Set(invitees.map(inv => inv.invitee_user_id));
  const availableStaff = staff.filter(p => p.id !== AV_USER_ID && !invitedIds.has(p.id));

  const save = async (override = conflictOverride, forceLeadOverride = false) => {
    if (!form.title.trim()) { setErr('Title is required'); return; }
    if (!form.scheduled_date) { setErr('Date is required'); return; }
    if (!form.job_id) { setErr('Job is required'); return; }
    setErr(null);

    // Soft conflict check — only for existing items with invitees on edit
    if (!override && !isNew && invitees.length > 0) {
      const inviteeIds = invitees.map(inv => inv.invitee_user_id).filter(Boolean);
      if (inviteeIds.length > 0) {
        const { conflicts } = await sbCheckResourceConflicts({
          scheduledDate:    form.scheduled_date,
          scheduledEndDate: null,
          inviteeUserIds:   inviteeIds,
          excludeItemId:    item.id,
        });
        if (conflicts.length > 0) {
          setConflictWarning({ conflicts });
          return;
        }
      }
    }

    // Lead-time check (only when trade is set and not already overridden)
    if (!forceLeadOverride && form.trade) {
      const ltResult = await sbCheckLeadTime({ jobId: form.job_id, trade: form.trade, scheduledDate: form.scheduled_date });
      if (ltResult.warning) { setLeadWarn(ltResult.warning); return; }
    }

    setConflictWarning(null); setLeadWarn(null);
    setSaving(true);
    const payload = {
      type:           form.type,
      title:          form.title.trim(),
      scheduled_date: form.scheduled_date,
      scheduled_time: form.scheduled_time || null,
      job_id:         form.job_id,
      trade:          form.trade || null,
      notes:          form.notes.trim() || null,
    };
    const result = isNew
      ? await sbCreateScheduleItem(payload)
      : await sbUpdateScheduleItem(item.id, payload);
    setSaving(false);
    if (!result.ok) { setErr(result.error || 'Save failed'); return; }

    if (forceLeadOverride && result.data?.id) {
      sb.from('schedule_change_log').insert({
        tenant_id:        AV_TENANT,
        schedule_item_id: result.data.id,
        job_id:           form.job_id,
        change_kind:      'date_moved',
        old_value:        { scheduled_date: form.scheduled_date, trade: form.trade },
        new_value:        { scheduled_date: form.scheduled_date, trade: form.trade },
        reason:           `Lead-time override: PM confirmed ${form.trade} scheduled for ${form.scheduled_date}`,
        changed_by_id:    AV_USER_ID,
      }).then(() => {});
    }

    onSaved();
  };

  const handleDelete = async () => {
    if (!item?.id) return;
    if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
    setDeleting(true); setErr(null);
    const result = await sbDeleteScheduleItem(item.id);
    setDeleting(false);
    if (!result.ok) { setErr(result.error || 'Delete failed'); return; }
    onSaved();
  };

  const addInvitee = async () => {
    if (!pendingInvId || !item?.id) return;
    const r = await sbAddScheduleInvitee({ scheduleItemId: item.id, inviteeUserId: pendingInvId, scheduleItem: item });
    if (r?.ok) {
      setPendingInvId('');
      sbLoadScheduleInvitees(item.id).then(r2 => { if (r2?.ok) setInvitees(r2.data || []); });
    } else {
      setErr(r.error || 'Could not add invitee');
    }
  };

  const removeInvitee = async (inviteeRowId) => {
    const r = await sbRemoveScheduleInvitee(inviteeRowId);
    if (r?.ok) {
      sbLoadScheduleInvitees(item.id).then(r2 => { if (r2?.ok) setInvitees(r2.data || []); });
    } else {
      setErr(r.error || 'Could not remove invitee');
    }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--navy-900)' }}>{isNew ? 'Add Event' : 'Edit Event'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, color: 'var(--text-subtle)', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {err && <div style={{ background: 'var(--red-bg)', border: '1px solid #FECACA', color: 'var(--red-strong)', padding: '8px 12px', fontSize: 12, marginBottom: 12, borderRadius: 4 }}>{err}</div>}

        {conflictWarning && (
          <div style={{ background: 'var(--amber-bg)', border: '1px solid #FCD34D', color: 'var(--amber-text-strong)', padding: '10px 12px', fontSize: 12, marginBottom: 12, borderRadius: 4 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Scheduling conflict detected</div>
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

        <div className="fg">
          <label className="flbl">Type *</label>
          <select className="finp" style={ssty} value={form.type} onChange={e => handleTypeChange(e.target.value)}>
            {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="fg">
          <label className="flbl">Title *</label>
          <input className="finp" value={form.title} onChange={e => setField('title', e.target.value)} placeholder={TYPE_SUGGESTIONS[form.type]} />
        </div>

        <div className="fg">
          <label className="flbl">Job *</label>
          <select className="finp" style={ssty} value={form.job_id} onChange={e => setField('job_id', e.target.value)}>
            <option value="">Select job…</option>
            {activeJobs.map(j => <option key={j.id} value={j.id}>{j.address?.split(',')[0] || j.id}</option>)}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="fg">
            <label className="flbl">Date *</label>
            <input className="finp" type="date" value={form.scheduled_date} onChange={e => setField('scheduled_date', e.target.value)} />
          </div>
          <div className="fg">
            <label className="flbl">Time</label>
            <input className="finp" type="time" value={form.scheduled_time} onChange={e => setField('scheduled_time', e.target.value)} />
          </div>
        </div>

        <div className="fg">
          <label className="flbl">Notes</label>
          <textarea className="finp" rows={3} value={form.notes} onChange={e => setField('notes', e.target.value)} style={{ resize: 'vertical' }} />
        </div>

        <div className="fg">
          <label className="flbl">Trade (optional — enables lead-time check)</label>
          <input className="finp" value={form.trade} onChange={e => setField('trade', e.target.value)} placeholder="e.g. Tile - Floor" />
        </div>

        {!isNew && (
          <div className="fg" style={{ marginTop: 4 }}>
            <label className="flbl">Invitees</label>
            {invitees.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                {invitees.map(inv => (
                  <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(10,31,68,0.05)', borderRadius: 6 }}>
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--text-secondary)' }}>
                      {inv.profile?.full_name || inv.profile?.email || 'Unknown'}
                      {inv.profile?.role && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-subtle)', textTransform: 'capitalize' }}>({inv.profile.role.replace(/_/g, ' ')})</span>}
                    </span>
                    <span style={{ fontSize: 10, textTransform: 'uppercase', color: inviteStatusColor(inv.status), fontWeight: 700 }}>{inv.status}</span>
                    <button onClick={() => removeInvitee(inv.id)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }} title="Remove">×</button>
                  </div>
                ))}
              </div>
            )}
            {availableStaff.length > 0 && (
              <div style={{ display: 'flex', gap: 8 }}>
                <select className="finp" style={{ ...ssty, flex: 1 }} value={pendingInvId} onChange={e => setPendingInvId(e.target.value)}>
                  <option value="">Add person…</option>
                  {availableStaff.map(p => (
                    <option key={p.id} value={p.id}>{p.full_name || p.email} ({(p.role || '').replace(/_/g, ' ')})</option>
                  ))}
                </select>
                <button onClick={addInvitee} disabled={!pendingInvId} className="btn btn-navy" style={{ opacity: pendingInvId ? 1 : 0.4, flexShrink: 0 }}>Add</button>
              </div>
            )}
          </div>
        )}

        {leadWarn && (
          <div style={{ background: 'var(--amber-bg)', border: '1px solid #FCD34D', borderRadius: 6, padding: '10px 14px', marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber-text-strong)', marginBottom: 4 }}>Material lead-time warning</div>
            <div style={{ fontSize: 12, color: 'var(--amber-text-strong)', marginBottom: 10 }}>{leadWarn.message}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setLeadWarn(null)} className="btn btn-ghost" style={{ fontSize: 12, padding: '4px 10px' }}>Cancel</button>
              <button onClick={() => save(conflictOverride, true)} className="btn btn-navy" style={{ fontSize: 12, padding: '4px 10px' }}>Override — I'll handle it</button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 16, alignItems: 'center' }}>
          <div>
            {!isNew && (
              <button onClick={handleDelete} disabled={deleting} style={{ background: 'none', border: '1px solid #FECACA', color: 'var(--red-strong)', borderRadius: 4, padding: '6px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                {deleting ? 'Deleting…' : 'Delete event'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} className="btn btn-ghost">Cancel</button>
            <button onClick={save} disabled={saving} className="btn btn-navy">{saving ? 'Saving…' : isNew ? 'Add Event' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
