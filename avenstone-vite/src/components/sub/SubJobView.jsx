import { useState, useEffect, useRef } from 'react';
import { sbLoadMessages, sbPostMessage, sbPhoto, sbLoadDailyLogs, sbSubmitDailyLog, sbNotify, AV_USER_ID } from '../../lib/supabase';
import { Ic, sc, sl, fD, fDT } from '../../lib/utils';

const WEATHER_OPTS = ['Clear', 'Partly Cloudy', 'Overcast', 'Rain', 'Heavy Rain', 'Snow', 'Wind', 'Extreme Heat'];
const SUB_TABS = [{ id: 'info', lb: 'Info', ic: 'info' }, { id: 'photos', lb: 'Photos', ic: 'cam' }, { id: 'logs', lb: 'Daily Log', ic: 'clip' }, { id: 'msgs', lb: 'Messages', ic: 'note' }];

export default function SubJobView({ job, back, profile }) {
  const [tab, setTab] = useState('info');
  const [msgs, setMsgs] = useState([]);
  const [msgsLoaded, setMsgsLoaded] = useState(false);
  const [msgTxt, setMsgTxt] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [photos, setPhotos] = useState(job.photos || []);
  const [upl, setUpl] = useState(false);
  const [uplPct, setUplPct] = useState(0);
  const pr = useRef();
  const msgsEndRef = useRef();
  const [logs, setLogs] = useState([]);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const [logForm, setLogForm] = useState({ log_date: new Date().toISOString().slice(0, 10), weather: 'Clear', crew_count: '', hours_worked: '', work_completed: '', materials_used: '', issues: '' });
  const [logSaving, setLogSaving] = useState(false);

  useEffect(() => {
    if (tab !== 'msgs' || msgsLoaded) return;
    sbLoadMessages(job.id).then(d => { setMsgs(d); setMsgsLoaded(true); });
  }, [tab, msgsLoaded]);

  useEffect(() => {
    if (tab !== 'logs' || logsLoaded) return;
    sbLoadDailyLogs(job.id).then(d => { setLogs(d); setLogsLoaded(true); });
  }, [tab, logsLoaded]);

  useEffect(() => { if (msgs.length && msgsEndRef.current) msgsEndRef.current.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

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

  const sendMsg = async () => {
    if (!msgTxt.trim()) return; setSendingMsg(true);
    const m = await sbPostMessage(job.id, msgTxt.trim());
    if (m) { setMsgs(p => [...p, m]); sbNotify('job_message', `Message on ${job.address}`, msgTxt.trim().slice(0, 120), job.id, AV_USER_ID); setMsgTxt(''); }
    setSendingMsg(false);
  };

  const onFile = async e => {
    const files = Array.from(e.target.files); if (!files.length) return;
    setUpl(true); setUplPct(0); const res = [];
    for (let i = 0; i < files.length; i++) { const p = await sbPhoto(job.id, files[i]); if (p) res.push(p); setUplPct(Math.round(((i + 1) / files.length) * 100)); }
    if (res.length) setPhotos(p => [...p, ...res]);
    setUpl(false); setUplPct(0);
  };

  return (
    <div style={{ minHeight: '100dvh', background: '#F7F5F0', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: '#0A1F44', padding: '16px 20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={back} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', width: 24, height: 24, display: 'flex', alignItems: 'center' }}>{Ic.back}</button>
          <div><div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 2 }}>Project</div><div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{job.address}</div></div>
        </div>
      </div>
      <div className="tabbar">{SUB_TABS.map(t => <button key={t.id} className={`tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}><span style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Ic[t.ic] || Ic.info}</span>{t.lb}</button>)}</div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {tab === 'info' && <div className="ig">
          {[['Address', job.address], ['Status', sl(job.status)], ['Client', job.client_name], ['Started', fD(job.created)]].filter(([, v]) => v).map(([lb, v]) => <div className="ii" key={lb}><div className="ii-l">{lb}</div><div className="ii-v">{v}</div></div>)}
        </div>}
        {tab === 'photos' && <div>
          <div style={{ marginBottom: 16 }}>
            <input ref={pr} type="file" accept="image/*,video/*" multiple onChange={onFile} style={{ display: 'none' }} />
            <button className="btn btn-outline" style={{ width: '100%', padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={() => pr.current.click()} disabled={upl}><span style={{ width: 16, height: 16 }}>{Ic.cam}</span>Upload Photos / Video</button>
          </div>
          {upl && <div className="upbar"><div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Uploading</span><span style={{ fontSize: 11, color: '#C9A84C', fontWeight: 700 }}>{uplPct}%</span></div><div className="uptr"><div className="upfl" style={{ width: `${uplPct}%` }} /></div></div>}
          {!photos.length && !upl && <div className="empty">{Ic.cam}<div className="empty-t">No photos yet</div><div>Upload site photos above</div></div>}
          <div className="pgrid">{photos.map(p => <div key={p.id} className="pcell"><div style={{ position: 'absolute', inset: 0 }}>{p.type === 'video' ? <video src={p.url || p.data} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={p.url || p.data} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</div></div>)}</div>
        </div>}
        {tab === 'logs' && <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44' }}>Daily Logs</div>
            <button className="btn btn-navy" style={{ fontSize: 12 }} onClick={() => setShowLogForm(true)}>+ Add Log</button>
          </div>
          {showLogForm && <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="fg"><label className="flbl">Date</label><input className="finp" type="date" value={logForm.log_date} onChange={e => setLogForm(p => ({ ...p, log_date: e.target.value }))} /></div>
              <div className="fg"><label className="flbl">Weather</label><select className="finp" value={logForm.weather} onChange={e => setLogForm(p => ({ ...p, weather: e.target.value }))}>{WEATHER_OPTS.map(w => <option key={w} value={w}>{w}</option>)}</select></div>
              <div className="fg"><label className="flbl">Crew Count</label><input className="finp" type="number" value={logForm.crew_count} onChange={e => setLogForm(p => ({ ...p, crew_count: e.target.value }))} placeholder="e.g. 4" /></div>
              <div className="fg"><label className="flbl">Hours Worked</label><input className="finp" type="number" value={logForm.hours_worked} onChange={e => setLogForm(p => ({ ...p, hours_worked: e.target.value }))} placeholder="e.g. 8" /></div>
            </div>
            <div className="fg"><label className="flbl">Work Completed</label><textarea className="finp fta" rows={2} value={logForm.work_completed} onChange={e => setLogForm(p => ({ ...p, work_completed: e.target.value }))} placeholder="Describe work completed today..." /></div>
            <div className="fg"><label className="flbl">Materials Used</label><textarea className="finp fta" rows={2} value={logForm.materials_used} onChange={e => setLogForm(p => ({ ...p, materials_used: e.target.value }))} placeholder="List materials used..." /></div>
            <div className="fg"><label className="flbl">Issues / Delays</label><textarea className="finp fta" rows={2} value={logForm.issues} onChange={e => setLogForm(p => ({ ...p, issues: e.target.value }))} placeholder="Any issues or delays..." /></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowLogForm(false)}>Cancel</button>
              <button className="btn btn-navy" style={{ flex: 1 }} onClick={submitLog} disabled={logSaving}>{logSaving ? 'Saving...' : 'Submit Log'}</button>
            </div>
          </div>}
          {!logs.length && !showLogForm && <div className="empty">{Ic.clip}<div className="empty-t">No logs yet</div><div>Submit your first daily log above</div></div>}
          {logs.map(l => (
            <div key={l.id} style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '12px 14px', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44' }}>{l.log_date}</div>
                <div style={{ fontSize: 12, color: '#9CA3AF' }}>{l.weather} · {l.crew_count || 0} crew · {l.hours_worked || 0}h</div>
              </div>
              {l.work_completed && <div style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>{l.work_completed}</div>}
              {l.issues && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>⚠ {l.issues}</div>}
            </div>
          ))}
        </div>}
        {tab === 'msgs' && <div style={{ display: 'flex', flexDirection: 'column', minHeight: 300 }}>
          {!msgsLoaded && <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF', fontSize: 13 }}>Loading...</div>}
          {msgsLoaded && <>
            <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
              {!msgs.length && <div className="empty">{Ic.note}<div className="empty-t">No messages yet</div><div>Send a message to your contractor below</div></div>}
              {msgs.map(m => {
                const mine = m.sender_id === AV_USER_ID;
                const nm = m.sender?.full_name || 'Contractor';
                return (
                  <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600 }}>{mine ? 'You' : nm}</span>
                      <span style={{ fontSize: 10, color: '#D1C9B8' }}>{fDT(m.created_at)}</span>
                    </div>
                    <div style={{ maxWidth: '80%', background: mine ? '#0A1F44' : '#fff', color: mine ? '#fff' : '#374151', padding: '10px 14px', borderRadius: mine ? '12px 12px 2px 12px' : '12px 12px 12px 2px', fontSize: 13, lineHeight: 1.55, border: mine ? 'none' : '1px solid #E8E4DC' }}>{m.content}</div>
                  </div>
                );
              })}
              <div ref={msgsEndRef} />
            </div>
            <div style={{ borderTop: '1px solid #E8E4DC', paddingTop: 12, background: '#F7F5F0' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea className="finp fta" value={msgTxt} onChange={e => setMsgTxt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }} placeholder="Type a message… (Enter to send)" rows={2} style={{ flex: 1, marginBottom: 0, resize: 'none' }} />
                <button className={`btn ${msgTxt.trim() ? 'btn-navy' : 'btn-ghost'}`} style={{ padding: '10px 16px', flexShrink: 0 }} onClick={sendMsg} disabled={sendingMsg || !msgTxt.trim()}>{sendingMsg ? '...' : 'Send'}</button>
              </div>
            </div>
          </>}
        </div>}
      </div>
    </div>
  );
}
