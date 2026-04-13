import { useState, useEffect } from 'react';
import { AV_USER_ID, AV_TENANT, ANON_KEY, NOTIFY_REALTOR_URL, sb, sbLoadPhases, sbSavePhase, DEFAULT_PHASES, sbNotify } from '../../../lib/supabase';
import { Ic, fD, phSc, phSl, gcalUrl } from '../../../lib/utils';

export default function ScheduleTab({ job }) {
  const [phases, setPhases] = useState([]);
  const [phasesLoaded, setPhasesLoaded] = useState(false);
  const [phaseEdit, setPhaseEdit] = useState(null);
  const [phaseEdits, setPhaseEdits] = useState({});
  const [schedView, setSchedView] = useState('list');

  useEffect(() => {
    if (phasesLoaded) return;
    (async () => {
      try {
        let data = await sbLoadPhases(job.id);
        if (!data.length) {
          const defaults = DEFAULT_PHASES.map((name, i) => ({
            tenant_id: AV_TENANT,
            job_id: job.id,
            phase_name: name,
            phase_order: i + 1,
            status: 'not_started',
          }));
          const { error } = await sb.from('job_phases').insert(defaults);
          if (error) console.error('Phase insert error:', error);
          data = await sbLoadPhases(job.id);
        }
        setPhases(data);
      } catch (e) { console.error('Schedule load error:', e); }
      finally { setPhasesLoaded(true); }
    })();
  }, [phasesLoaded]);

  const ssty = { appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 32 };

  if (!phasesLoaded) return <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF', fontSize: 13 }}>Loading schedule...</div>;

  const done = phases.filter(p => p.status === 'complete').length;
  const pct = phases.length ? Math.round((done / phases.length) * 100) : 0;
  const datedPhases = phases.filter(p => p.start_date && p.end_date);
  const allDates = datedPhases.flatMap(p => [new Date(p.start_date), new Date(p.end_date)]);
  const minD = allDates.length ? new Date(Math.min(...allDates)) : null;
  const maxD = allDates.length ? new Date(Math.max(...allDates)) : null;
  const totalDays = minD && maxD ? Math.max((maxD - minD) / 86400000, 1) : 1;

  return (
    <div>
      {phases.length > 0 && (
        <>
          <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 }}>Phase Progress</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 12, color: '#0A1F44', fontWeight: 700 }}>{done} of {phases.length} complete &middot; {pct}%</div>
                <div style={{ display: 'flex', border: '1px solid #E8E4DC', borderRadius: 4, overflow: 'hidden' }}>
                  {[['list', 'List'], ['gantt', 'Timeline']].map(([v, lb]) => (
                    <button key={v} onClick={() => setSchedView(v)} style={{ padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none', background: schedView === v ? '#0A1F44' : 'transparent', color: schedView === v ? '#C9A84C' : '#9CA3AF' }}>{lb}</button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ background: '#E8E4DC', height: 6, borderRadius: 3 }}>
              <div style={{ background: '#22c55e', height: 6, borderRadius: 3, width: `${pct}%`, transition: 'width 0.4s' }} />
            </div>
          </div>
          {schedView === 'gantt' && datedPhases.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 16, marginBottom: 16, overflowX: 'auto' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Timeline</div>
              {datedPhases.map(p => {
                const s = (new Date(p.start_date) - minD) / 86400000;
                const len = Math.max((new Date(p.end_date) - new Date(p.start_date)) / 86400000, 1);
                const left = `${(s / totalDays) * 100}%`;
                const width = `${Math.max((len / totalDays) * 100, 2)}%`;
                const col = phSc(p.status);
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 120, fontSize: 11, fontWeight: 600, color: '#374151', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.phase_name}</div>
                    <div style={{ flex: 1, height: 20, background: '#F7F5F0', borderRadius: 3, position: 'relative', minWidth: 100 }}>
                      <div style={{ position: 'absolute', left, width, height: '100%', background: col, borderRadius: 3, display: 'flex', alignItems: 'center', paddingLeft: 6, overflow: 'hidden' }}>
                        <span style={{ fontSize: 9, color: '#fff', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fD(p.start_date)}</span>
                      </div>
                    </div>
                    <div style={{ width: 70, fontSize: 10, color: '#9CA3AF', flexShrink: 0, textAlign: 'right' }}>{fD(p.end_date)}</div>
                  </div>
                );
              })}
              <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                {[['not_started', '#9CA3AF', 'Not Started'], ['in_progress', '#f59e0b', 'In Progress'], ['complete', '#22c55e', 'Complete'], ['blocked', '#ef4444', 'Blocked']].map(([s, c, lb]) => (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#6B7280' }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: c }} />{lb}
                  </div>
                ))}
              </div>
            </div>
          )}
          {schedView === 'gantt' && datedPhases.length === 0 && (
            <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 20, marginBottom: 16, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Set start and end dates on phases to view timeline</div>
          )}
        </>
      )}

      {phases.map(ph => {
        const isEd = phaseEdit === ph.id;
        const ed = phaseEdits[ph.id] || {};
        const cal = gcalUrl(ph, job.address);
        return (
          <div key={ph.id} style={{ background: '#fff', border: '1px solid #E8E4DC', borderLeft: `3px solid ${phSc(ph.status)}`, marginBottom: 8, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44', marginBottom: 2 }}>{ph.phase_name}</div>
                {!isEd && (ph.start_date || ph.end_date) && <div style={{ fontSize: 11, color: '#9CA3AF' }}>{ph.start_date ? fD(ph.start_date) : 'TBD'} &rarr; {ph.end_date ? fD(ph.end_date) : 'TBD'}</div>}
                {!isEd && !ph.start_date && !ph.end_date && <div style={{ fontSize: 11, color: '#D1C9B8', fontStyle: 'italic' }}>No dates set</div>}
              </div>
              {!isEd && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <span style={{ background: phSc(ph.status) + '18', color: phSc(ph.status), fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '3px 8px', whiteSpace: 'nowrap' }}>{phSl(ph.status)}</span>
                  {cal && <a href={cal} target="_blank" rel="noreferrer" title="Add to Google Calendar" style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F7F5F0', border: '1px solid #E8E4DC', color: '#0A1F44', textDecoration: 'none', flexShrink: 0 }}><span style={{ width: 14, height: 14, display: 'flex' }}>{Ic.cal}</span></a>}
                  <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => { setPhaseEdit(ph.id); setPhaseEdits(p => ({ ...p, [ph.id]: { status: ph.status, start_date: ph.start_date || '', end_date: ph.end_date || '' } })); }}>Edit</button>
                </div>
              )}
            </div>
            {isEd && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                  <div className="fg" style={{ marginBottom: 0 }}><label className="flbl">Start Date</label><input className="finp" type="date" value={ed.start_date || ''} onChange={e => setPhaseEdits(p => ({ ...p, [ph.id]: { ...p[ph.id], start_date: e.target.value } }))} /></div>
                  <div className="fg" style={{ marginBottom: 0 }}><label className="flbl">End Date</label><input className="finp" type="date" value={ed.end_date || ''} onChange={e => setPhaseEdits(p => ({ ...p, [ph.id]: { ...p[ph.id], end_date: e.target.value } }))} /></div>
                </div>
                <div className="fg" style={{ marginBottom: 10 }}><label className="flbl">Status</label>
                  <select className="finp" style={ssty} value={ed.status || 'not_started'} onChange={e => setPhaseEdits(p => ({ ...p, [ph.id]: { ...p[ph.id], status: e.target.value } }))}>
                    {['not_started', 'in_progress', 'complete', 'blocked'].map(s => <option key={s} value={s}>{phSl(s)}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost" style={{ flex: 1, fontSize: 12 }} onClick={() => setPhaseEdit(null)}>Cancel</button>
                  <button className="btn btn-navy" style={{ flex: 1, fontSize: 12 }} onClick={async () => {
                    const updated = { ...ph, ...ed };
                    const saved = await sbSavePhase(updated);
                    setPhases(p => p.map(x => x.id === ph.id ? (saved || updated) : x));
                    if (ed.status === 'complete' && ph.status !== 'complete') {
                      sbNotify('phase_complete', `Phase complete: ${ph.phase_name}`, `${ph.phase_name} marked complete on ${job.address}`, job.id, AV_USER_ID);
                      if (job.referring_realtor_phone || job.referring_realtor_email) {
                        const pn = (ph.phase_name || '').toLowerCase();
                        let ms = null;
                        if (pn.includes('rough') || pn.includes('mep') || pn.includes('framing')) ms = 'rough_in';
                        else if (pn.includes('paint') || pn.includes('drywall') || pn.includes('finish') || pn.includes('flooring')) ms = 'finishes';
                        else if (pn.includes('punch')) ms = 'punch_list';
                        if (ms) fetch(NOTIFY_REALTOR_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` }, body: JSON.stringify({ job_id: job.id, milestone: ms }) }).catch(() => {});
                      }
                    }
                    setPhaseEdit(null);
                  }}>Save Phase</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
