import { useState, useEffect } from 'react';
import { AV_USER_ID, sbLoadDailyLogs, sbSubmitDailyLog, sbNotify, WEATHER_OPTS } from '../../../lib/supabase';
import { Ic, fD } from '../../../lib/utils';

export default function LogsTab({ job }) {
  const [logs, setLogs] = useState([]);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const [logForm, setLogForm] = useState({ log_date: new Date().toISOString().slice(0, 10), weather: 'Clear', crew_count: '', hours_worked: '', work_completed: '', materials_used: '', issues: '' });
  const [logSaving, setLogSaving] = useState(false);

  const ssty = { appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 32 };

  useEffect(() => {
    if (logsLoaded) return;
    sbLoadDailyLogs(job.id).then(d => { setLogs(d); setLogsLoaded(true); });
  }, [logsLoaded]);

  const submitLog = async () => {
    setLogSaving(true);
    const d = await sbSubmitDailyLog({ job_id: job.id, log_date: logForm.log_date, weather: logForm.weather, crew_count: logForm.crew_count ? Number(logForm.crew_count) : null, hours_worked: logForm.hours_worked ? Number(logForm.hours_worked) : null, work_completed: logForm.work_completed || null, materials_used: logForm.materials_used || null, issues: logForm.issues || null });
    if (d) {
      setLogs(p => [d, ...p]);
      sbNotify('daily_log_submitted', `Daily log — ${job.address}`, `${logForm.log_date}: ${(logForm.work_completed || '').slice(0, 80)}`, job.id, AV_USER_ID);
      setShowLogForm(false);
      setLogForm({ log_date: new Date().toISOString().slice(0, 10), weather: 'Clear', crew_count: '', hours_worked: '', work_completed: '', materials_used: '', issues: '' });
    }
    setLogSaving(false);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 }}>Daily Field Logs</div>
        <button className="btn btn-navy" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowLogForm(true)}><span style={{ width: 14, height: 14 }}>{Ic.plus}</span>New Log</button>
      </div>
      {!logsLoaded && <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF', fontSize: 13 }}>Loading...</div>}
      {logsLoaded && !logs.length && <div className="empty">{Ic.clip}<div className="empty-t">No logs yet</div><div>Submit the first daily log above</div></div>}
      {logs.map(l => (
        <div key={l.id} style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 16, marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0A1F44' }}>{fD(l.log_date)}</div>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{l.author?.full_name || 'Unknown'}{l.weather && ` · ${l.weather}`}</div>
            </div>
            <div style={{ display: 'flex', gap: 12, textAlign: 'right' }}>
              {l.crew_count && <div><div style={{ fontSize: 11, color: '#9CA3AF' }}>Crew</div><div style={{ fontSize: 14, fontWeight: 700, color: '#0A1F44' }}>{l.crew_count}</div></div>}
              {l.hours_worked && <div><div style={{ fontSize: 11, color: '#9CA3AF' }}>Hours</div><div style={{ fontSize: 14, fontWeight: 700, color: '#0A1F44' }}>{l.hours_worked}</div></div>}
            </div>
          </div>
          {l.work_completed && <div style={{ marginBottom: 8 }}><div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Work Completed</div><div style={{ fontSize: 13, color: '#374151', lineHeight: 1.65 }}>{l.work_completed}</div></div>}
          {l.materials_used && <div style={{ marginBottom: 8 }}><div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Materials Used</div><div style={{ fontSize: 13, color: '#374151', lineHeight: 1.65 }}>{l.materials_used}</div></div>}
          {l.issues && <div style={{ background: '#FEF9EC', border: '1px solid #FDE68A', padding: '8px 12px' }}><div style={{ fontSize: 10, fontWeight: 600, color: '#92400E', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Issues / Delays</div><div style={{ fontSize: 13, color: '#78350F', lineHeight: 1.65 }}>{l.issues}</div></div>}
        </div>
      ))}
      {showLogForm && <div className="overlay" onClick={() => setShowLogForm(false)}><div className="modal" style={{ maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="modal-title">Daily Field Log</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="fg" style={{ marginBottom: 0 }}><label className="flbl">Date</label><input className="finp" type="date" value={logForm.log_date} onChange={e => setLogForm(p => ({ ...p, log_date: e.target.value }))} /></div>
          <div className="fg" style={{ marginBottom: 0 }}><label className="flbl">Weather</label>
            <select className="finp" value={logForm.weather} onChange={e => setLogForm(p => ({ ...p, weather: e.target.value }))} style={ssty}>
              {WEATHER_OPTS.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>
          <div className="fg" style={{ marginBottom: 0 }}><label className="flbl">Crew Size</label><input className="finp" type="number" value={logForm.crew_count} onChange={e => setLogForm(p => ({ ...p, crew_count: e.target.value }))} placeholder="e.g. 4" /></div>
          <div className="fg" style={{ marginBottom: 0 }}><label className="flbl">Hours Worked</label><input className="finp" type="number" step="0.5" value={logForm.hours_worked} onChange={e => setLogForm(p => ({ ...p, hours_worked: e.target.value }))} placeholder="e.g. 8" /></div>
        </div>
        <div className="fg" style={{ marginTop: 10 }}><label className="flbl">Work Completed</label><textarea className="finp fta" value={logForm.work_completed} onChange={e => setLogForm(p => ({ ...p, work_completed: e.target.value }))} placeholder="Describe what was accomplished today..." rows={3} /></div>
        <div className="fg"><label className="flbl">Materials Used</label><textarea className="finp fta" value={logForm.materials_used} onChange={e => setLogForm(p => ({ ...p, materials_used: e.target.value }))} placeholder="List materials delivered or consumed..." rows={2} /></div>
        <div className="fg"><label className="flbl">Issues / Delays</label><textarea className="finp fta" value={logForm.issues} onChange={e => setLogForm(p => ({ ...p, issues: e.target.value }))} placeholder="Any problems, delays, safety concerns..." rows={2} /></div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowLogForm(false)}>Cancel</button>
          <button className="btn btn-navy" style={{ flex: 1 }} onClick={submitLog} disabled={logSaving}>{logSaving ? 'Saving...' : 'Submit Log'}</button>
        </div>
      </div></div>}
    </div>
  );
}
