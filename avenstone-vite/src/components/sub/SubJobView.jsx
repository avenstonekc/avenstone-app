import { useState, useEffect, useRef } from 'react';
import { sbLoadMessages, sbPostMessage, sbPhoto, sbLoadDailyLogs, sbSubmitDailyLog, sbNotify, sbLoadSubPhases, sbLoadJobDocuments, sbLoadSubPayments, sbLoadSubCOs, sbLoadStaffMessages, sbPostStaffMessage, AV_USER_ID } from '../../lib/supabase';
import { Ic, sc, sl, fD, fDT, f$ } from '../../lib/utils';
import { t } from '../../lib/i18n';

const WEATHER_OPTS_KEYS = ['Clear', 'Partly Cloudy', 'Overcast', 'Rain', 'Heavy Rain', 'Snow', 'Wind', 'Extreme Heat'];

export default function SubJobView({ job, back, profile, lang = 'en' }) {
  const SUB_TABS = [
    { id: 'info', lb: t('Info', lang), ic: 'info' },
    { id: 'schedule', lb: t('Schedule', lang), ic: 'cal' },
    { id: 'photos', lb: t('Photos', lang), ic: 'cam' },
    { id: 'logs', lb: t('Daily Log', lang), ic: 'clip' },
    { id: 'docs', lb: t('Documents', lang), ic: 'folder' },
    { id: 'payments', lb: t('Payments', lang), ic: 'box' },
    { id: 'cos', lb: t('Change Orders', lang), ic: 'doc' },
    { id: 'msgs', lb: t('Messages', lang), ic: 'note' },
    { id: 'pmchat', lb: lang === 'es' ? 'Chat con PM' : 'PM Chat', ic: 'note' },
  ];

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
  const [phases, setPhases] = useState([]);
  const [phasesLoaded, setPhasesLoaded] = useState(false);
  const [docs, setDocs] = useState([]);
  const [docsLoaded, setDocsLoaded] = useState(false);
  const [payments, setPayments] = useState([]);
  const [paymentsLoaded, setPaymentsLoaded] = useState(false);
  const [cos, setCos] = useState([]);
  const [cosLoaded, setCosLoaded] = useState(false);
  const [staffMsgs, setStaffMsgs] = useState([]);
  const [staffMsgsLoaded, setStaffMsgsLoaded] = useState(false);
  const [staffMsgTxt, setStaffMsgTxt] = useState('');
  const [sendingStaffMsg, setSendingStaffMsg] = useState(false);
  const staffMsgsEndRef = useRef();

  useEffect(() => {
    if (tab !== 'msgs' || msgsLoaded) return;
    sbLoadMessages(job.id).then(d => { setMsgs(d); setMsgsLoaded(true); });
  }, [tab, msgsLoaded]);

  useEffect(() => {
    if (tab !== 'logs' || logsLoaded) return;
    sbLoadDailyLogs(job.id).then(d => { setLogs(d); setLogsLoaded(true); });
  }, [tab, logsLoaded]);

  useEffect(() => {
    if (tab !== 'schedule' || phasesLoaded) return;
    sbLoadSubPhases(AV_USER_ID, job.id).then(d => { setPhases(d); setPhasesLoaded(true); });
  }, [tab, phasesLoaded]);

  useEffect(() => {
    if (tab !== 'docs' || docsLoaded) return;
    sbLoadJobDocuments(job.id).then(d => { setDocs(d); setDocsLoaded(true); });
  }, [tab, docsLoaded]);

  useEffect(() => {
    if (tab !== 'payments' || paymentsLoaded) return;
    sbLoadSubPayments(AV_USER_ID, job.id).then(d => { setPayments(d); setPaymentsLoaded(true); });
  }, [tab, paymentsLoaded]);

  useEffect(() => {
    if (tab !== 'cos' || cosLoaded) return;
    sbLoadSubCOs(job.id).then(d => { setCos(d); setCosLoaded(true); });
  }, [tab, cosLoaded]);

  useEffect(() => {
    if (tab !== 'pmchat' || staffMsgsLoaded) return;
    sbLoadStaffMessages(job.id).then(d => { setStaffMsgs(d); setStaffMsgsLoaded(true); });
  }, [tab, staffMsgsLoaded]);

  useEffect(() => { if (msgs.length && msgsEndRef.current) msgsEndRef.current.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  useEffect(() => {
    if (staffMsgs.length && staffMsgsEndRef.current) staffMsgsEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [staffMsgs]);

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

  const sendStaffMsg = async () => {
    if (!staffMsgTxt.trim()) return;
    setSendingStaffMsg(true);
    const m = await sbPostStaffMessage(job.id, staffMsgTxt.trim());
    if (m) {
      setStaffMsgs(p => [...p, m]);
      sbNotify('staff_message', `Staff message — ${job.address}`, staffMsgTxt.trim().slice(0, 120), job.id, AV_USER_ID);
      setStaffMsgTxt('');
    }
    setSendingStaffMsg(false);
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
          <div><div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 2 }}>{t('Project', lang)}</div><div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{job.address}</div></div>
        </div>
      </div>
      <div className="tabbar">{SUB_TABS.map(tb => <button key={tb.id} className={`tab${tab === tb.id ? ' on' : ''}`} onClick={() => setTab(tb.id)}><span style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Ic[tb.ic] || Ic.info}</span>{tb.lb}</button>)}</div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {tab === 'info' && <div className="ig">
          {[[t('Address', lang), job.address], [t('Status', lang), sl(job.status)], [t('Client', lang), job.client_name], [t('Started', lang), fD(job.created)]].filter(([, v]) => v).map(([lb, v]) => <div className="ii" key={lb}><div className="ii-l">{lb}</div><div className="ii-v">{v}</div></div>)}
        </div>}
        {tab === 'photos' && <div>
          <div style={{ marginBottom: 16 }}>
            <input ref={pr} type="file" accept="image/*,video/*" multiple onChange={onFile} style={{ display: 'none' }} />
            <button className="btn btn-outline" style={{ width: '100%', padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={() => pr.current.click()} disabled={upl}><span style={{ width: 16, height: 16 }}>{Ic.cam}</span>{t('Upload Photos / Video', lang)}</button>
          </div>
          {upl && <div className="upbar"><div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>{t('Uploading', lang)}</span><span style={{ fontSize: 11, color: '#C9A84C', fontWeight: 700 }}>{uplPct}%</span></div><div className="uptr"><div className="upfl" style={{ width: `${uplPct}%` }} /></div></div>}
          {!photos.length && !upl && <div className="empty">{Ic.cam}<div className="empty-t">{t('No photos yet', lang)}</div><div>{t('Upload site photos above', lang)}</div></div>}
          <div className="pgrid">{photos.map(p => <div key={p.id} className="pcell"><div style={{ position: 'absolute', inset: 0 }}>{p.type === 'video' ? <video src={p.url || p.data} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={p.url || p.data} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</div></div>)}</div>
        </div>}
        {tab === 'logs' && <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44' }}>{t('Daily Logs', lang)}</div>
            <button className="btn btn-navy" style={{ fontSize: 12 }} onClick={() => setShowLogForm(true)}>{t('+ Add Log', lang)}</button>
          </div>
          {showLogForm && <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="fg"><label className="flbl">{t('Date', lang)}</label><input className="finp" type="date" value={logForm.log_date} onChange={e => setLogForm(p => ({ ...p, log_date: e.target.value }))} /></div>
              <div className="fg"><label className="flbl">{t('Weather', lang)}</label><select className="finp" value={logForm.weather} onChange={e => setLogForm(p => ({ ...p, weather: e.target.value }))}>{WEATHER_OPTS_KEYS.map(w => <option key={w} value={w}>{t(w, lang)}</option>)}</select></div>
              <div className="fg"><label className="flbl">{t('Crew Count', lang)}</label><input className="finp" type="number" value={logForm.crew_count} onChange={e => setLogForm(p => ({ ...p, crew_count: e.target.value }))} placeholder={t('e.g. 4', lang)} /></div>
              <div className="fg"><label className="flbl">{t('Hours Worked', lang)}</label><input className="finp" type="number" value={logForm.hours_worked} onChange={e => setLogForm(p => ({ ...p, hours_worked: e.target.value }))} placeholder={t('e.g. 8', lang)} /></div>
            </div>
            <div className="fg"><label className="flbl">{t('Work Completed', lang)}</label><textarea className="finp fta" rows={2} value={logForm.work_completed} onChange={e => setLogForm(p => ({ ...p, work_completed: e.target.value }))} placeholder={t('Describe work completed today...', lang)} /></div>
            <div className="fg"><label className="flbl">{t('Materials Used', lang)}</label><textarea className="finp fta" rows={2} value={logForm.materials_used} onChange={e => setLogForm(p => ({ ...p, materials_used: e.target.value }))} placeholder={t('List materials used...', lang)} /></div>
            <div className="fg"><label className="flbl">{t('Issues / Delays', lang)}</label><textarea className="finp fta" rows={2} value={logForm.issues} onChange={e => setLogForm(p => ({ ...p, issues: e.target.value }))} placeholder={t('Any issues or delays...', lang)} /></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowLogForm(false)}>{t('Cancel', lang)}</button>
              <button className="btn btn-navy" style={{ flex: 1 }} onClick={submitLog} disabled={logSaving}>{logSaving ? t('Saving...', lang) : t('Submit Log', lang)}</button>
            </div>
          </div>}
          {!logs.length && !showLogForm && <div className="empty">{Ic.clip}<div className="empty-t">{t('No logs yet', lang)}</div><div>{t('Submit your first daily log above', lang)}</div></div>}
          {logs.map(l => (
            <div key={l.id} style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '12px 14px', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44' }}>{l.log_date}</div>
                <div style={{ fontSize: 12, color: '#9CA3AF' }}>{l.weather} · {l.crew_count || 0} {t('crew', lang)} · {l.hours_worked || 0}h</div>
              </div>
              {l.work_completed && <div style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>{l.work_completed}</div>}
              {l.issues && <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4 }}>⚠ {l.issues}</div>}
            </div>
          ))}
        </div>}
        {tab === 'schedule' && <div>
          {!phasesLoaded && <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>{t('Loading schedule...', lang)}</div>}
          {phasesLoaded && !phases.length && <div className="empty">{Ic.cal}<div className="empty-t">{t('No phases assigned to you', lang)}</div><div>{t('Your contractor will update your schedule here', lang)}</div></div>}
          {phases.map(p => {
            const today = new Date().toISOString().slice(0, 10);
            const isOverdue = p.end_date && p.end_date < today && p.status !== 'complete';
            const isActive = p.status === 'in_progress';
            return (
              <div key={p.id} style={{ background: '#fff', border: `1px solid #E8E4DC`, borderLeft: `4px solid ${isOverdue ? '#ef4444' : isActive ? '#C9A84C' : p.status === 'complete' ? '#22c55e' : '#E8E4DC'}`, padding: '14px 16px', marginBottom: 10, borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0A1F44' }}>{p.name}</div>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: isOverdue ? '#FEE2E2' : isActive ? '#FEF3C7' : p.status === 'complete' ? '#D1FAE5' : '#F3F4F6', color: isOverdue ? '#991B1B' : isActive ? '#92400E' : p.status === 'complete' ? '#065F46' : '#6B7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {isOverdue ? t('Overdue', lang) : p.status?.replace(/_/g, ' ') || t('Pending', lang)}
                  </span>
                </div>
                {p.description && <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>{p.description}</div>}
                <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: '#9CA3AF' }}>
                  {p.start_date && <span>{t('Start', lang)}: <strong style={{ color: '#374151' }}>{fD(p.start_date)}</strong></span>}
                  {p.end_date && <span>{t('Due', lang)}: <strong style={{ color: isOverdue ? '#ef4444' : '#374151' }}>{fD(p.end_date)}</strong></span>}
                </div>
              </div>
            );
          })}
        </div>}

        {tab === 'docs' && <div>
          {!docsLoaded && <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>{t('Loading documents...', lang)}</div>}
          {docsLoaded && !docs.length && <div className="empty">{Ic.folder}<div className="empty-t">{t('No documents yet', lang)}</div><div>{t('Plans, specs, and permits will appear here', lang)}</div></div>}
          {docs.map(d => (
            <a key={d.id} href={d.url || d.file_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid #E8E4DC', padding: '12px 16px', marginBottom: 8, borderRadius: 8, textDecoration: 'none', color: 'inherit' }}>
              <span style={{ width: 20, height: 20, flexShrink: 0, color: '#C9A84C', display: 'flex' }}>{Ic.doc}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0A1F44' }}>{d.name || d.file_name || t('Document', lang)}</div>
                {d.created_at && <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{fD(d.created_at)}</div>}
              </div>
              <span style={{ width: 16, height: 16, color: '#9CA3AF', flexShrink: 0 }}>{Ic.dl}</span>
            </a>
          ))}
        </div>}

        {tab === 'payments' && <div>
          {!paymentsLoaded && <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>{t('Loading payments...', lang)}</div>}
          {paymentsLoaded && !payments.length && <div className="empty">{Ic.box}<div className="empty-t">{t('No payment schedule yet', lang)}</div><div>{t('Your contractor will set up draws here', lang)}</div></div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {payments.map(p => {
              const isPaid = p.status === 'paid';
              const isOverdue = !isPaid && p.due_date && p.due_date < new Date().toISOString().slice(0, 10);
              return (
                <div key={p.id} style={{ background: '#fff', border: '1px solid #E8E4DC', borderLeft: `4px solid ${isPaid ? '#22c55e' : isOverdue ? '#ef4444' : '#C9A84C'}`, padding: '14px 16px', borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0A1F44' }}>{p.description || t('Draw', lang)}</div>
                      {p.due_date && <div style={{ fontSize: 12, color: isOverdue ? '#ef4444' : '#9CA3AF', marginTop: 2 }}>{t('Due', lang)}: {fD(p.due_date)}</div>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#0A1F44' }}>{f$(p.amount || 0)}</div>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: isPaid ? '#D1FAE5' : isOverdue ? '#FEE2E2' : '#FEF3C7', color: isPaid ? '#065F46' : isOverdue ? '#991B1B' : '#92400E', fontWeight: 700, textTransform: 'uppercase' }}>
                        {isPaid ? t('Paid', lang) : isOverdue ? t('Overdue', lang) : t('Pending', lang)}
                      </span>
                    </div>
                  </div>
                  {p.notes && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 8 }}>{p.notes}</div>}
                </div>
              );
            })}
          </div>
        </div>}

        {tab === 'cos' && <div>
          {!cosLoaded && <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>{t('Loading change orders...', lang)}</div>}
          {cosLoaded && !cos.length && <div className="empty">{Ic.doc}<div className="empty-t">{t('No change orders', lang)}</div><div>{t('Scope changes will appear here', lang)}</div></div>}
          {cos.map(co => (
            <div key={co.id} style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '14px 16px', marginBottom: 8, borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0A1F44' }}>{co.title}</div>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: co.status === 'approved' ? '#D1FAE5' : co.status === 'rejected' ? '#FEE2E2' : '#FEF3C7', color: co.status === 'approved' ? '#065F46' : co.status === 'rejected' ? '#991B1B' : '#92400E', fontWeight: 700, textTransform: 'uppercase' }}>
                  {co.status ? t(co.status.charAt(0).toUpperCase() + co.status.slice(1), lang) : t('Pending', lang)}
                </span>
              </div>
              {co.description && <div style={{ fontSize: 13, color: '#374151', marginBottom: 8 }}>{co.description}</div>}
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#9CA3AF' }}>
                {co.amount != null && <span>{t('Amount', lang)}: <strong style={{ color: co.amount >= 0 ? '#065F46' : '#991B1B' }}>{co.amount >= 0 ? '+' : ''}{f$(co.amount)}</strong></span>}
                {co.created_at && <span>{fD(co.created_at)}</span>}
              </div>
            </div>
          ))}
        </div>}

        {tab === 'msgs' && <div style={{ display: 'flex', flexDirection: 'column', minHeight: 300 }}>
          {!msgsLoaded && <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF', fontSize: 13 }}>{t('Loading...', lang)}</div>}
          {msgsLoaded && <>
            <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
              {!msgs.length && <div className="empty">{Ic.note}<div className="empty-t">{t('No messages yet', lang)}</div><div>{t('Send a message to your contractor below', lang)}</div></div>}
              {msgs.map(m => {
                const mine = m.sender_id === AV_USER_ID;
                const nm = m.sender?.full_name || t('Contractor', lang);
                return (
                  <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600 }}>{mine ? t('You', lang) : nm}</span>
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
                <textarea className="finp fta" value={msgTxt} onChange={e => setMsgTxt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }} placeholder={lang === 'es' ? 'Escribe un mensaje… (Enter para enviar)' : 'Type a message… (Enter to send)'} rows={2} style={{ flex: 1, marginBottom: 0, resize: 'none' }} />
                <button className={`btn ${msgTxt.trim() ? 'btn-navy' : 'btn-ghost'}`} style={{ padding: '10px 16px', flexShrink: 0 }} onClick={sendMsg} disabled={sendingMsg || !msgTxt.trim()}>{sendingMsg ? '...' : t('Send', lang)}</button>
              </div>
            </div>
          </>}
        </div>}

        {tab === 'pmchat' && (
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 300 }}>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 12, padding: '8px 12px', background: '#fff', borderRadius: 8, border: '1px solid #E8E4DC' }}>
              {lang === 'es' ? 'Mensajes directos con tu Project Manager — solo visible para el equipo de trabajo.' : 'Direct messages with your Project Manager — visible to staff only, not the client.'}
            </div>
            {!staffMsgsLoaded && <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF', fontSize: 13 }}>{t('Loading...', lang)}</div>}
            {staffMsgsLoaded && (
              <>
                <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
                  {!staffMsgs.length && (
                    <div className="empty">
                      {Ic.note}
                      <div className="empty-t">{lang === 'es' ? 'Sin mensajes aún' : t('No messages yet', lang)}</div>
                      <div>{lang === 'es' ? 'Envía un mensaje a tu PM abajo' : 'Send a message to your PM below'}</div>
                    </div>
                  )}
                  {staffMsgs.map(m => {
                    const mine = m.sender_id === AV_USER_ID;
                    const nm = m.sender?.full_name || (lang === 'es' ? 'Contratista' : 'Contractor');
                    return (
                      <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600 }}>{mine ? t('You', lang) : nm}</span>
                          <span style={{ fontSize: 10, color: '#D1C9B8' }}>{fDT(m.created_at)}</span>
                        </div>
                        <div style={{ maxWidth: '80%', background: mine ? '#0A1F44' : '#fff', color: mine ? '#fff' : '#374151', padding: '10px 14px', borderRadius: mine ? '12px 12px 2px 12px' : '12px 12px 12px 2px', fontSize: 13, lineHeight: 1.55, border: mine ? 'none' : '1px solid #E8E4DC' }}>
                          {m.content}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={staffMsgsEndRef} />
                </div>
                <div style={{ borderTop: '1px solid #E8E4DC', paddingTop: 12, background: '#F7F5F0' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <textarea
                      className="finp fta"
                      value={staffMsgTxt}
                      onChange={e => setStaffMsgTxt(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendStaffMsg(); } }}
                      placeholder={lang === 'es' ? 'Escribe un mensaje al PM…' : 'Message your PM… (Enter to send)'}
                      rows={2}
                      style={{ flex: 1, marginBottom: 0, resize: 'none' }}
                    />
                    <button
                      className={`btn ${staffMsgTxt.trim() ? 'btn-navy' : 'btn-ghost'}`}
                      style={{ padding: '10px 16px', flexShrink: 0 }}
                      onClick={sendStaffMsg}
                      disabled={sendingStaffMsg || !staffMsgTxt.trim()}
                    >
                      {sendingStaffMsg ? '...' : t('Send', lang)}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
