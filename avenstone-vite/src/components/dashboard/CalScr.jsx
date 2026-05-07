import { useState, useEffect } from 'react';
import { sb } from '../../lib/supabase';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SC = { lead: '#9CA3AF', proposal: '#f59e0b', contract: '#22c55e', in_progress: '#C9A84C', final_touches: '#3B82F6', complete: '#10B981', on_hold: '#F97316' };

export default function CalScr({ jobs, profile, onSelectJob }) {
  const [view, setView] = useState('month');
  const [cur, setCur] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [phases, setPhases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!jobs.length) { setLoading(false); return; }
    sb.from('job_phases').select('*').in('job_id', jobs.map(j => j.id)).then(({ data }) => { setPhases(data || []); setLoading(false); });
  }, []);

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
    return evs.sort((a, b) => a.date - b.date);
  };

  return (
    <div style={{ padding: '0 0 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={prevMonth} style={{ background: 'transparent', border: '1px solid #E8E4DC', borderRadius: 4, width: 32, height: 32, cursor: 'pointer', fontSize: 18, color: '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: '#0A1F44', minWidth: 200, textAlign: 'center' }}>{MONTHS[month]} {year}</div>
          <button onClick={nextMonth} style={{ background: 'transparent', border: '1px solid #E8E4DC', borderRadius: 4, width: 32, height: 32, cursor: 'pointer', fontSize: 18, color: '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
          <button onClick={() => setCur(() => { const d = new Date(); d.setDate(1); return d; })} style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #E8E4DC', borderRadius: 4, background: 'transparent', color: '#9CA3AF', cursor: 'pointer' }}>Today</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={filter} onChange={e => setFilter(e.target.value)} style={{ fontSize: 12, padding: '6px 10px', border: '1px solid #E8E4DC', borderRadius: 4, background: '#fff', color: '#374151' }}>
            <option value="all">All Projects</option>
            <option value="lead">Lead</option>
            <option value="in_progress">In Progress</option>
            <option value="final_touches">Final Touches</option>
            <option value="complete">Complete</option>
          </select>
          <div style={{ display: 'flex', border: '1px solid #E8E4DC', borderRadius: 4, overflow: 'hidden' }}>
            {[['month', 'Month'], ['list', 'List']].map(([v, lb]) => (
              <button key={v} onClick={() => setView(v)} style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', background: v === view ? '#0A1F44' : 'transparent', color: v === view ? '#C9A84C' : '#9CA3AF' }}>{lb}</button>
            ))}
          </div>
        </div>
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 60, color: '#9CA3AF' }}>Loading...</div> : view === 'month' ? (
        <div style={{ background: '#fff', border: '1px solid #E8E4DC', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid #E8E4DC' }}>
            {DAYS.map(d => <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: 11, fontWeight: 600, color: '#9CA3AF', letterSpacing: 1 }}>{d}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
            {days.map((day, i) => {
              const ds = toStr(day.date);
              const isToday = ds === today;
              const dj = jobsForDay(day.date);
              const dp = phasesForDay(day.date);
              const total = dj.length + dp.length;
              return (
                <div key={i} style={{ minHeight: 80, padding: '5px 3px', borderRight: i % 7 !== 6 ? '1px solid #F3F0EB' : 'none', borderBottom: i < 35 ? '1px solid #F3F0EB' : 'none', background: !day.in ? '#FAFAF8' : isToday ? '#FFFBF0' : '#fff' }}>
                  <div style={{ fontSize: 11, fontWeight: isToday ? 700 : 400, color: isToday ? '#C9A84C' : day.in ? '#6B7280' : '#D1D5DB', textAlign: 'right', marginBottom: 3 }}>{day.date.getDate()}</div>
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
                  {dj.slice(0, total <= 3 ? 2 : 1).map(j => (
                    <div key={j.id} onClick={() => onSelectJob(j.id)} title={j.address}
                      style={{ fontSize: 10, padding: '2px 4px', marginBottom: 2, cursor: 'pointer', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', background: SC[j.status] + '22', color: SC[j.status], border: '1px solid ' + SC[j.status] + '44', borderRadius: 3, fontWeight: 600 }}>
                      ⚑ {j.address.split(',')[0]}
                    </div>
                  ))}
                  {total > 3 && <div style={{ fontSize: 10, color: '#9CA3AF', paddingLeft: 3 }}>+{total - 3} more</div>}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div>
          {upcoming().length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#9CA3AF', fontSize: 14 }}>No upcoming events in the next 90 days.</div>
          ) : upcoming().map((ev, i) => {
            const ds = ev.date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
            const icon = ev.type === 'completion' ? '⚑' : ev.type === 'start' ? '▶' : '◼';
            const color = ev.type === 'completion' ? SC[ev.job.status] : '#3B82F6';
            const lbl = ev.type === 'completion' ? 'Completion — ' + ev.job.address : ev.type === 'start' ? ev.ph.name + ' starts — ' + ev.job.address : ev.ph.name + ' ends — ' + ev.job.address;
            return (
              <div key={i} onClick={() => onSelectJob(ev.job.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', background: '#fff', border: '1px solid #E8E4DC', borderRadius: 6, marginBottom: 8, cursor: 'pointer', transition: 'border-color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#C9A84C'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#E8E4DC'}>
                <div style={{ minWidth: 80, fontSize: 12, color: '#9CA3AF', fontWeight: 500 }}>{ds}</div>
                <div style={{ fontSize: 14, color, width: 16, textAlign: 'center' }}>{icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44' }}>{lbl}</div>
                  {ev.ph && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{ev.job.assigned_rep || ''}</div>}
                </div>
                <div style={{ fontSize: 11, padding: '3px 8px', borderRadius: 10, background: SC[ev.job.status] + '22', color: SC[ev.job.status], fontWeight: 600 }}>{ev.job.status}</div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 11, color: '#9CA3AF' }}><span style={{ display: 'inline-block', width: 10, height: 10, background: '#DBEAFE', border: '1px solid #93C5FD', borderRadius: 2, marginRight: 4 }}></span>Phase</div>
        {Object.entries({ lead: 'Lead', active: 'Active', punch: 'Punch List', complete: 'Complete' }).map(([s, lb]) => (
          <div key={s} style={{ fontSize: 11, color: '#9CA3AF' }}><span style={{ display: 'inline-block', width: 10, height: 10, background: SC[s] + '33', border: '1px solid ' + SC[s], borderRadius: 2, marginRight: 4 }}></span>{lb}</div>
        ))}
      </div>
    </div>
  );
}
