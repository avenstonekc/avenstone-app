import { useState, useEffect, useRef } from 'react';
import { sbLoadMessages, sbPostMessage, sbPhoto, sbLoadDailyLogs, sbSubmitDailyLog, sbGenerateDailyLogDraft, sbSaveDailyLogClientMessage, sbNotify, sbLoadScheduleItemsForSub, sbLoadJobDocuments, sbLoadSubPayments, sbLoadSubCOs, sbSubSubmitCO, sbLoadStaffMessages, sbPostStaffMessage, AV_USER_ID, sbUpdateScheduleItem, sbCountPhotosForEntity, sbLoadPhotosForEntity, sbLoadScheduleInvitees, sbRespondToScheduleInvite } from '../../lib/supabase';
import { Ic, sc, sl, fD, fDT, f$ } from '../../lib/utils';
import { t } from '../../lib/i18n';

const NAV    = 'var(--navy-900)';
const GOLD   = 'var(--gold-500)';
const BORDER = 'var(--border)';
const CREAM  = 'var(--bg)';

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
  const [captureNote, setCaptureNote] = useState('');
  const [capturePhotos, setCapturePhotos] = useState([]);
  const [logSaving, setLogSaving] = useState(false);
  const [logErr, setLogErr] = useState('');
  const capturePhotoRef = useRef();
  const [schedItems, setSchedItems] = useState([]);
  const [schedLoaded, setSchedLoaded] = useState(false);
  const [inviteByItemId, setInviteByItemId] = useState({});
  const [respondingId, setRespondingId] = useState(null);
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
  const [showCOForm, setShowCOForm] = useState(false);
  const [coForm, setCoForm] = useState({ title: '', description: '', amount: '' });
  const [coSaving, setCoSaving] = useState(false);
  const [pendingComplete, setPendingComplete] = useState(null);
  const [completePhotoCounts, setCompletePhotoCounts] = useState({});
  const [completePhotos, setCompletePhotos] = useState({});
  const [completeUploading, setCompleteUploading] = useState(false);
  const [completeWorking, setCompleteWorking] = useState(null);
  const [completeErr, setCompleteErr] = useState(null);
  const completePhotoRef = useRef();

  useEffect(() => {
    if (tab !== 'msgs' || msgsLoaded) return;
    sbLoadMessages(job.id).then(d => { setMsgs(d); setMsgsLoaded(true); });
  }, [tab, msgsLoaded]);

  useEffect(() => {
    if (tab !== 'logs' || logsLoaded) return;
    sbLoadDailyLogs(job.id).then(d => { setLogs(d); setLogsLoaded(true); });
  }, [tab, logsLoaded]);

  useEffect(() => {
    if (tab !== 'schedule' || schedLoaded) return;
    sbLoadScheduleItemsForSub(AV_USER_ID).then(r => {
      const active = (r.data || []).filter(i => i.job_id === job.id && ['scheduled', 'in_progress'].includes(i.status));
      setSchedItems(active);
      setSchedLoaded(true);
    });
  }, [tab, schedLoaded]);

  // Load invite rows for each visible schedule item (SCHEDULING_ARC slice 4/8)
  useEffect(() => {
    if (!schedLoaded || !schedItems.length) return;
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        schedItems.map(async (item) => {
          const res = await sbLoadScheduleInvitees(item.id);
          if (!res?.ok) return [item.id, null];
          const myInvite = (res.data || []).find(inv => inv.invitee_user_id === AV_USER_ID);
          return [item.id, myInvite || null];
        })
      );
      if (cancelled) return;
      const map = {};
      for (const [itemId, invite] of results) map[itemId] = invite;
      setInviteByItemId(map);
    })();
    return () => { cancelled = true; };
  }, [schedLoaded, schedItems]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const resetLogForm = () => { setShowLogForm(false); setCaptureNote(''); setCapturePhotos([]); setLogErr(''); };

  const submitLog = async () => {
    if (!captureNote.trim()) return;
    setLogSaving(true); setLogErr('');
    const d = await sbSubmitDailyLog({ job_id: job.id, work_completed: captureNote.trim() });
    if (!d.ok) { setLogErr(d.error || t('Save failed', lang)); setLogSaving(false); return; }
    const logId = d.data.id;
    for (const file of capturePhotos) { await sbPhoto(job.id, file, 'daily_log', logId); }
    let patchedData = d.data;
    const aiRes = await sbGenerateDailyLogDraft(job.id, captureNote.trim());
    if (aiRes.ok && aiRes.data.client_message) {
      await sbSaveDailyLogClientMessage(logId, aiRes.data.client_message);
      patchedData = { ...d.data, client_message: aiRes.data.client_message };
    }
    setLogs(p => [patchedData, ...p]);
    sbNotify('daily_log_submitted', `Daily log — ${job.address}`, captureNote.trim().slice(0, 80), job.id, AV_USER_ID);
    resetLogForm();
    setLogSaving(false);
  };

  const sendMsg = async () => {
    if (!msgTxt.trim()) return; setSendingMsg(true);
    const m = await sbPostMessage(job.id, msgTxt.trim());
    if (m.ok) { setMsgs(p => [...p, m.data]); sbNotify('job_message', `Message on ${job.address}`, msgTxt.trim().slice(0, 120), job.id, AV_USER_ID); setMsgTxt(''); }
    setSendingMsg(false);
  };

  const sendStaffMsg = async () => {
    if (!staffMsgTxt.trim()) return;
    setSendingStaffMsg(true);
    const m = await sbPostStaffMessage(job.id, staffMsgTxt.trim());
    if (m.ok) {
      setStaffMsgs(p => [...p, m.data]);
      sbNotify('staff_message', `Staff message — ${job.address}`, staffMsgTxt.trim().slice(0, 120), job.id, AV_USER_ID);
      setStaffMsgTxt('');
    }
    setSendingStaffMsg(false);
  };

  const submitCO = async () => {
    if (!coForm.title.trim()) return;
    setCoSaving(true);
    const co = await sbSubSubmitCO({ job_id: job.id, tenant_id: profile.tenant_id, description: coForm.title.trim(), amount: coForm.amount });
    if (co.ok) {
      setCos(p => [co.data, ...p]);
      sbNotify('co_submitted', `Change order request — ${job.address}`, coForm.title.trim(), job.id, AV_USER_ID);
      setShowCOForm(false);
      setCoForm({ title: '', description: '', amount: '' });
    }
    setCoSaving(false);
  };

  const PHOTO_GATE_TYPES = ['sub_start', 'site_visit', 'inspection'];

  const startComplete = async (item) => {
    setCompleteErr(null);
    if (PHOTO_GATE_TYPES.includes(item.type)) {
      const existing = await sbCountPhotosForEntity('schedule_item', item.id);
      setCompletePhotoCounts(p => ({ ...p, [item.id]: existing }));
    }
    setPendingComplete(item.id);
  };

  const handleCompletePhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !pendingComplete) return;
    setCompleteUploading(true);
    const result = await sbPhoto(job.id, file, 'schedule_item', pendingComplete);
    if (result.ok) {
      setCompletePhotoCounts(p => ({ ...p, [pendingComplete]: (p[pendingComplete] ?? 0) + 1 }));
      setCompletePhotos(p => ({ ...p, [pendingComplete]: [...(p[pendingComplete] || []), result.data] }));
    }
    setCompleteUploading(false);
    e.target.value = '';
  };

  const confirmComplete = async (itemId) => {
    setCompleteWorking(itemId);
    setCompleteErr(null);
    const res = await sbUpdateScheduleItem(itemId, { status: 'complete' });
    setCompleteWorking(null);
    if (!res.ok) { setCompleteErr(res.error || 'Failed to mark complete'); return; }
    setSchedItems(p => p.filter(i => i.id !== itemId));
    setPendingComplete(null);
  };

  const onFile = async e => {
    const files = Array.from(e.target.files); if (!files.length) return;
    setUpl(true); setUplPct(0); const res = [];
    for (let i = 0; i < files.length; i++) { const p = await sbPhoto(job.id, files[i]); if (p.ok) res.push(p.data); setUplPct(Math.round(((i + 1) / files.length) * 100)); }
    if (res.length) setPhotos(p => [...p, ...res]);
    setUpl(false); setUplPct(0);
  };

  return (
    <div style={{ minHeight: '100dvh', background: CREAM, display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: NAV, padding: '16px 20px', flexShrink: 0 }}>
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
          {upl && <div className="upbar"><div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>{t('Uploading', lang)}</span><span style={{ fontSize: 11, color: GOLD, fontWeight: 700 }}>{uplPct}%</span></div><div className="uptr"><div className="upfl" style={{ width: `${uplPct}%` }} /></div></div>}
          {!photos.length && !upl && <div className="empty">{Ic.cam}<div className="empty-t">{t('No photos yet', lang)}</div><div>{t('Upload site photos above', lang)}</div></div>}
          <div className="pgrid">{photos.map(p => <div key={p.id} className="pcell"><div style={{ position: 'absolute', inset: 0 }}>{p.type === 'video' ? <video src={p.url || p.data} controls style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={p.url || p.data} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}</div></div>)}</div>
        </div>}
        {tab === 'logs' && <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: NAV }}>{t('Daily Logs', lang)}</div>
            <button className="btn btn-navy" style={{ fontSize: 12 }} onClick={() => setShowLogForm(true)}>{t('+ Add Log', lang)}</button>
          </div>
          {showLogForm && <div style={{ background: 'var(--card-bg)', border: `1px solid ${BORDER}`, padding: 16, marginBottom: 16 }}>
            <div className="fg">
              <label className="flbl">{t('What happened today', lang)}</label>
              <textarea className="finp fta" rows={5} value={captureNote} onChange={e => setCaptureNote(e.target.value)} placeholder={t('Describe what was accomplished on site today...', lang)} />
            </div>
            <input ref={capturePhotoRef} type="file" accept="image/*,video/*" multiple onChange={e => { const files = Array.from(e.target.files); if (files.length) setCapturePhotos(p => [...p, ...files]); e.target.value = ''; }} style={{ display: 'none' }} />
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{t('Photos', lang)}</div>
              {capturePhotos.length > 0 && (
                <div className="pgrid" style={{ marginBottom: 10 }}>
                  {capturePhotos.map((f, i) => (
                    <div key={i} className="pcell">
                      <div style={{ position: 'absolute', inset: 0 }}>
                        {f.type.startsWith('video') ? <video src={URL.createObjectURL(f)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={URL.createObjectURL(f)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                      </div>
                      <button className="pdel" onClick={() => setCapturePhotos(p => p.filter((_, j) => j !== i))}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              <button className="btn btn-ghost" style={{ width: '100%', fontSize: 13 }} onClick={() => capturePhotoRef.current.click()}>{t('+ Add Photos', lang)}</button>
            </div>
            {logErr && <div style={{ background: 'var(--red-bg)', border: `1px solid var(--red-border)`, color: 'var(--red-text)', padding: '8px 12px', fontSize: 12, marginBottom: 8 }}>{logErr}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={resetLogForm}>{t('Cancel', lang)}</button>
              <button className="btn btn-navy" style={{ flex: 1 }} onClick={submitLog} disabled={logSaving || !captureNote.trim()}>{logSaving ? t('Submitting...', lang) : t('Submit', lang)}</button>
            </div>
          </div>}
          {!logs.length && !showLogForm && <div className="empty">{Ic.clip}<div className="empty-t">{t('No logs yet', lang)}</div><div>{t('Submit your first daily log above', lang)}</div></div>}
          {logs.map(l => (
            <div key={l.id} style={{ background: 'var(--card-bg)', border: `1px solid ${BORDER}`, padding: '12px 14px', marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: NAV }}>{l.log_date}</div>
                <div style={{ fontSize: 11, color: l.status === 'approved' ? 'var(--green-dot)' : 'var(--text-subtle)', fontWeight: 600, textTransform: 'uppercase' }}>{l.status === 'approved' ? t('Sent', lang) : t('Draft', lang)}</div>
              </div>
              {l.work_completed && <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: l.client_message ? 8 : 0 }}>{l.work_completed}</div>}
              {l.client_message && (
                <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 10px' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{t('Client Update', lang)}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{l.client_message}</div>
                </div>
              )}
            </div>
          ))}
        </div>}
        {tab === 'schedule' && <div>
          {!schedLoaded && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-subtle)' }}>{t('Loading schedule...', lang)}</div>}
          {schedLoaded && !schedItems.length && (
            <div className="empty">{Ic.cal}<div className="empty-t">{t('Nothing scheduled yet', lang)}</div><div>{t('Your contractor will add items here', lang)}</div></div>
          )}
          {completeErr && <div style={{ background: 'var(--red-bg)', color: 'var(--red-text-strong)', padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 12 }}>{completeErr}</div>}
          <input ref={completePhotoRef} type="file" accept="image/*" capture="environment" onChange={handleCompletePhoto} style={{ display: 'none' }} />
          {schedItems.map(item => {
            const today = new Date().toISOString().slice(0, 10);
            const isOverdue = item.status === 'scheduled' && item.scheduled_date && item.scheduled_date < today;
            const isActive  = item.status === 'in_progress';
            const accentCol = isOverdue ? 'var(--red-text)' : isActive ? GOLD : BORDER;
            const badgeBg   = isOverdue ? 'var(--red-bg)' : isActive ? 'var(--amber-bg)' : 'var(--blue-bg)';
            const badgeCol  = isOverdue ? 'var(--red-text-strong)' : isActive ? 'var(--amber-text-strong)' : '#1D4ED8';
            const badgeTxt  = isOverdue ? (lang === 'es' ? 'Vencido' : 'Overdue') : item.status?.replace(/_/g, ' ') || 'scheduled';
            const needsPhoto = PHOTO_GATE_TYPES.includes(item.type);
            const photoCount = completePhotoCounts[item.id] ?? 0;
            const isPending  = pendingComplete === item.id;
            const invite = inviteByItemId[item.id] || null;
            const isResponding = respondingId === item.id;
            const handleInviteResponse = async (status) => {
              if (!invite) return;
              setRespondingId(item.id);
              const result = await sbRespondToScheduleInvite(invite.id, status);
              setRespondingId(null);
              if (result?.ok) {
                setInviteByItemId(prev => ({
                  ...prev,
                  [item.id]: { ...invite, status, responded_at: new Date().toISOString() },
                }));
              }
            };
            return (
              <div key={item.id} style={{ background: 'var(--card-bg)', border: `1px solid ${BORDER}`, borderLeft: `4px solid ${accentCol}`, padding: '14px 16px', marginBottom: 10, borderRadius: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: NAV }}>{item.title}</div>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: badgeBg, color: badgeCol, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{badgeTxt}</span>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 12, color: 'var(--text-subtle)', flexWrap: 'wrap' }}>
                  {item.scheduled_date && <span>{fD(item.scheduled_date)}{item.scheduled_end_date ? ` → ${fD(item.scheduled_end_date)}` : ''}</span>}
                  {item.trade && <span style={{ background: CREAM, padding: '1px 6px', borderRadius: 10 }}>{item.trade}</span>}
                </div>
                {item.notes && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, background: CREAM, padding: '6px 8px', borderRadius: 4, lineHeight: 1.4 }}>{item.notes}</div>}

                {/* Invite response (SCHEDULING_ARC slice 4/8) */}
                {invite && (invite.status === 'invited' || invite.status === 'tentative') && (
                  <div style={{ marginTop: 8, padding: '10px 12px', background: 'var(--gold-100)', border: '1px solid var(--gold-200)', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: NAV, marginBottom: 8 }}>
                      {invite.status === 'tentative' ? 'You marked this tentative — confirm or decline?' : "You're invited — please respond"}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button onClick={() => handleInviteResponse('accepted')} disabled={isResponding} style={{ padding: '8px 14px', background: '#3a7', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, cursor: isResponding ? 'wait' : 'pointer', flex: '1 1 auto', minWidth: 90 }}>✓ Accept</button>
                      <button onClick={() => handleInviteResponse('tentative')} disabled={isResponding || invite.status === 'tentative'} style={{ padding: '8px 14px', background: GOLD, color: NAV, border: 'none', borderRadius: 6, fontWeight: 600, cursor: isResponding ? 'wait' : 'pointer', opacity: invite.status === 'tentative' ? 0.5 : 1, flex: '0 0 auto' }}>Tentative</button>
                      <button onClick={() => handleInviteResponse('declined')} disabled={isResponding} style={{ padding: '8px 14px', background: 'rgba(196,68,68,0.12)', color: '#c44', border: '1px solid rgba(196,68,68,0.45)', borderRadius: 6, fontWeight: 600, cursor: isResponding ? 'wait' : 'pointer', flex: '1 1 auto', minWidth: 90 }}>Decline</button>
                    </div>
                  </div>
                )}
                {invite && invite.status === 'accepted' && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(58,119,71,0.10)', border: '1px solid rgba(58,119,71,0.35)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 13, color: '#3a7', fontWeight: 600 }}>✓ Accepted</span>
                    <button onClick={() => handleInviteResponse('declined')} disabled={isResponding} style={{ padding: '4px 10px', background: 'transparent', color: '#c44', border: '1px solid rgba(196,68,68,0.4)', borderRadius: 4, fontSize: 11, cursor: isResponding ? 'wait' : 'pointer' }}>Can't make it</button>
                  </div>
                )}
                {invite && invite.status === 'declined' && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(196,68,68,0.08)', border: '1px solid rgba(196,68,68,0.35)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 13, color: '#c44', fontWeight: 600 }}>Declined</span>
                    <button onClick={() => handleInviteResponse('accepted')} disabled={isResponding} style={{ padding: '4px 10px', background: 'transparent', color: '#3a7', border: '1px solid rgba(58,119,71,0.45)', borderRadius: 4, fontSize: 11, cursor: isResponding ? 'wait' : 'pointer' }}>Reconsider</button>
                  </div>
                )}

                {/* Mark Complete flow */}
                {!isPending && (
                  <div style={{ marginTop: 10 }}>
                    <button onClick={() => startComplete(item)} style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 6, border: `1px solid ${NAV}`, background: NAV, color: '#fff', cursor: 'pointer' }}>
                      {t('Mark Complete', lang)}
                    </button>
                  </div>
                )}
                {isPending && (
                  <div style={{ marginTop: 10, background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '10px 12px' }}>
                    {needsPhoto && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: NAV, marginBottom: 4 }}>
                          {photoCount > 0
                            ? `✓ ${photoCount} ${t('photo', lang)}${photoCount !== 1 ? 's' : ''} ${t('uploaded', lang)}`
                            : t('📷 Take a photo of the completed work to mark complete.', lang)}
                        </div>
                        {photoCount === 0 && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                            {t('Required for', lang)} {item.type.replace(/_/g, ' ')}: {t('at least 1 photo.', lang)}
                          </div>
                        )}
                        <button onClick={() => completePhotoRef.current?.click()} disabled={completeUploading} style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 5, border: `1px solid ${NAV}`, background: 'var(--card-bg)', color: NAV, cursor: 'pointer' }}>
                          {completeUploading ? t('Uploading…', lang) : t('📷 Add Photo', lang)}
                        </button>
                        {(completePhotos[item.id] || []).length > 0 && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                            {(completePhotos[item.id] || []).map(p => (
                              <a key={p.id} href={p.url} target="_blank" rel="noreferrer" style={{ display: 'block', flexShrink: 0 }}>
                                <img src={p.url} alt="photo" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 4, border: `1px solid ${BORDER}` }} />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => confirmComplete(item.id)}
                        disabled={completeWorking === item.id || (needsPhoto && photoCount === 0)}
                        style={{ fontSize: 12, fontWeight: 600, padding: '6px 14px', borderRadius: 5, border: `1px solid ${needsPhoto && photoCount === 0 ? BORDER : 'var(--green-dot)'}`, background: needsPhoto && photoCount === 0 ? 'var(--surface)' : 'var(--green-bg)', color: needsPhoto && photoCount === 0 ? 'var(--text-subtle)' : 'var(--green-text-strong)', cursor: needsPhoto && photoCount === 0 ? 'not-allowed' : 'pointer' }}
                      >
                        {completeWorking === item.id ? t('Saving…', lang) : t('Confirm Complete', lang)}
                      </button>
                      <button onClick={() => { setPendingComplete(null); setCompleteErr(null); }} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 5, border: `1px solid ${BORDER}`, background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        {t('Cancel', lang)}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>}

        {tab === 'docs' && <div>
          {!docsLoaded && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-subtle)' }}>{t('Loading documents...', lang)}</div>}
          {docsLoaded && !docs.length && <div className="empty">{Ic.folder}<div className="empty-t">{t('No documents yet', lang)}</div><div>{t('Plans, specs, and permits will appear here', lang)}</div></div>}
          {docs.map(d => (
            <a key={d.id} href={d.url || d.file_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--card-bg)', border: `1px solid ${BORDER}`, padding: '12px 16px', marginBottom: 8, borderRadius: 8, textDecoration: 'none', color: 'inherit' }}>
              <span style={{ width: 20, height: 20, flexShrink: 0, color: GOLD, display: 'flex' }}>{Ic.doc}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: NAV }}>{d.name || d.file_name || t('Document', lang)}</div>
                {d.created_at && <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 2 }}>{fD(d.created_at)}</div>}
              </div>
              <span style={{ width: 16, height: 16, color: 'var(--text-subtle)', flexShrink: 0 }}>{Ic.dl}</span>
            </a>
          ))}
        </div>}

        {tab === 'payments' && <div>
          {!paymentsLoaded && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-subtle)' }}>{t('Loading payments...', lang)}</div>}
          {paymentsLoaded && !payments.length && <div className="empty">{Ic.box}<div className="empty-t">{t('No payment schedule yet', lang)}</div><div>{t('Your contractor will set up draws here', lang)}</div></div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {payments.map(p => {
              const isPaid = p.status === 'paid';
              const isOverdue = !isPaid && p.due_date && p.due_date < new Date().toISOString().slice(0, 10);
              return (
                <div key={p.id} style={{ background: 'var(--card-bg)', border: `1px solid ${BORDER}`, borderLeft: `4px solid ${isPaid ? 'var(--green-dot)' : isOverdue ? 'var(--red-text)' : GOLD}`, padding: '14px 16px', borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: NAV }}>{p.description || t('Draw', lang)}</div>
                      {p.due_date && <div style={{ fontSize: 12, color: isOverdue ? 'var(--red-text)' : 'var(--text-subtle)', marginTop: 2 }}>{t('Due', lang)}: {fD(p.due_date)}</div>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: NAV }}>{f$(p.amount || 0)}</div>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: isPaid ? 'var(--green-bg)' : isOverdue ? 'var(--red-bg)' : 'var(--amber-bg)', color: isPaid ? 'var(--green-text-strong)' : isOverdue ? 'var(--red-text-strong)' : 'var(--amber-text-strong)', fontWeight: 700, textTransform: 'uppercase' }}>
                        {isPaid ? t('Paid', lang) : isOverdue ? t('Overdue', lang) : t('Pending', lang)}
                      </span>
                    </div>
                  </div>
                  {p.notes && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>{p.notes}</div>}
                </div>
              );
            })}
          </div>
        </div>}

        {tab === 'cos' && <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: NAV }}>{t('Change Orders', lang)}</div>
            <button className="btn btn-navy" style={{ fontSize: 12 }} onClick={() => setShowCOForm(true)}>
              {lang === 'es' ? '+ Solicitar CO' : '+ Request CO'}
            </button>
          </div>
          {showCOForm && (
            <div style={{ background: 'var(--card-bg)', border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: NAV, marginBottom: 12 }}>{lang === 'es' ? 'Solicitar Cambio de Orden' : 'Request Change Order'}</div>
              <div className="fg"><label className="flbl">{lang === 'es' ? 'Título' : 'Title'}</label><input className="finp" value={coForm.title} onChange={e => setCoForm(p => ({ ...p, title: e.target.value }))} placeholder={lang === 'es' ? 'Ej. Trabajo adicional en baño' : 'e.g. Additional bathroom work'} /></div>
              <div className="fg"><label className="flbl">{lang === 'es' ? 'Descripción' : 'Description'}</label><textarea className="finp fta" rows={3} value={coForm.description} onChange={e => setCoForm(p => ({ ...p, description: e.target.value }))} placeholder={lang === 'es' ? 'Describe el trabajo adicional...' : 'Describe the additional scope or reason...'} /></div>
              <div className="fg"><label className="flbl">{lang === 'es' ? 'Monto Estimado ($)' : 'Estimated Amount ($)'}</label><input className="finp" type="number" value={coForm.amount} onChange={e => setCoForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" /></div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setShowCOForm(false); setCoForm({ title: '', description: '', amount: '' }); }}>{t('Cancel', lang)}</button>
                <button className="btn btn-gold" style={{ flex: 1 }} onClick={submitCO} disabled={coSaving || !coForm.title.trim()}>{coSaving ? t('Submitting...', lang) : t('Submit Request', lang)}</button>
              </div>
            </div>
          )}
          {!cosLoaded && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-subtle)' }}>{t('Loading change orders...', lang)}</div>}
          {cosLoaded && !cos.length && !showCOForm && <div className="empty">{Ic.doc}<div className="empty-t">{t('No change orders', lang)}</div><div>{t('Scope changes will appear here', lang)}</div></div>}
          {cos.map(co => (
            <div key={co.id} style={{ background: 'var(--card-bg)', border: `1px solid ${BORDER}`, padding: '14px 16px', marginBottom: 8, borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: NAV }}>{co.co_number ? `${co.co_number} — ` : ''}{co.description || co.title}</div>
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: co.status === 'approved' ? 'var(--green-bg)' : co.status === 'rejected' ? 'var(--red-bg)' : 'var(--amber-bg)', color: co.status === 'approved' ? 'var(--green-text-strong)' : co.status === 'rejected' ? 'var(--red-text-strong)' : 'var(--amber-text-strong)', fontWeight: 700, textTransform: 'uppercase' }}>
                  {co.status ? t(co.status.charAt(0).toUpperCase() + co.status.slice(1), lang) : t('Pending', lang)}
                </span>
              </div>
              {co.description && <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>{co.description}</div>}
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-subtle)' }}>
                {co.amount != null && <span>{t('Amount', lang)}: <strong style={{ color: co.amount >= 0 ? 'var(--green-text-strong)' : 'var(--red-text-strong)' }}>{co.amount >= 0 ? '+' : ''}{f$(co.amount)}</strong></span>}
                {co.created_at && <span>{fD(co.created_at)}</span>}
              </div>
            </div>
          ))}
        </div>}

        {tab === 'msgs' && <div style={{ display: 'flex', flexDirection: 'column', minHeight: 300 }}>
          {!msgsLoaded && <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-subtle)', fontSize: 13 }}>{t('Loading...', lang)}</div>}
          {msgsLoaded && <>
            <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
              {!msgs.length && <div className="empty">{Ic.note}<div className="empty-t">{t('No messages yet', lang)}</div><div>{t('Send a message to your contractor below', lang)}</div></div>}
              {msgs.map(m => {
                const mine = m.sender_id === AV_USER_ID;
                const nm = m.sender?.full_name || t('Contractor', lang);
                return (
                  <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-subtle)', fontWeight: 600 }}>{mine ? t('You', lang) : nm}</span>
                      <span style={{ fontSize: 10, color: 'var(--border-strong)' }}>{fDT(m.created_at)}</span>
                    </div>
                    <div style={{ maxWidth: '80%', background: mine ? NAV : 'var(--card-bg)', color: mine ? '#fff' : 'var(--text-secondary)', padding: '10px 14px', borderRadius: mine ? '12px 12px 2px 12px' : '12px 12px 12px 2px', fontSize: 13, lineHeight: 1.55, border: mine ? 'none' : `1px solid ${BORDER}` }}>{m.content}</div>
                  </div>
                );
              })}
              <div ref={msgsEndRef} />
            </div>
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12, background: CREAM }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea className="finp fta" value={msgTxt} onChange={e => setMsgTxt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }} placeholder={lang === 'es' ? 'Escribe un mensaje… (Enter para enviar)' : 'Type a message… (Enter to send)'} rows={2} style={{ flex: 1, marginBottom: 0, resize: 'none' }} />
                <button className={`btn ${msgTxt.trim() ? 'btn-navy' : 'btn-ghost'}`} style={{ padding: '10px 16px', flexShrink: 0 }} onClick={sendMsg} disabled={sendingMsg || !msgTxt.trim()}>{sendingMsg ? '...' : t('Send', lang)}</button>
              </div>
            </div>
          </>}
        </div>}

        {tab === 'pmchat' && (
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 300 }}>
            <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginBottom: 12, padding: '8px 12px', background: 'var(--card-bg)', borderRadius: 8, border: `1px solid ${BORDER}` }}>
              {lang === 'es' ? 'Mensajes directos con tu Project Manager — solo visible para el equipo de trabajo.' : 'Direct messages with your Project Manager — visible to staff only, not the client.'}
            </div>
            {!staffMsgsLoaded && <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-subtle)', fontSize: 13 }}>{t('Loading...', lang)}</div>}
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
                          <span style={{ fontSize: 11, color: 'var(--text-subtle)', fontWeight: 600 }}>{mine ? t('You', lang) : nm}</span>
                          <span style={{ fontSize: 10, color: 'var(--border-strong)' }}>{fDT(m.created_at)}</span>
                        </div>
                        <div style={{ maxWidth: '80%', background: mine ? NAV : 'var(--card-bg)', color: mine ? '#fff' : 'var(--text-secondary)', padding: '10px 14px', borderRadius: mine ? '12px 12px 2px 12px' : '12px 12px 12px 2px', fontSize: 13, lineHeight: 1.55, border: mine ? 'none' : `1px solid ${BORDER}` }}>
                          {m.content}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={staffMsgsEndRef} />
                </div>
                <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12, background: CREAM }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <textarea className="finp fta" value={staffMsgTxt} onChange={e => setStaffMsgTxt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendStaffMsg(); } }} placeholder={lang === 'es' ? 'Escribe un mensaje al PM…' : 'Message your PM… (Enter to send)'} rows={2} style={{ flex: 1, marginBottom: 0, resize: 'none' }} />
                    <button className={`btn ${staffMsgTxt.trim() ? 'btn-navy' : 'btn-ghost'}`} style={{ padding: '10px 16px', flexShrink: 0 }} onClick={sendStaffMsg} disabled={sendingStaffMsg || !staffMsgTxt.trim()}>
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
