import { useState } from 'react';
import { AV_USER_ID, AV_TENANT, ANON_KEY, NOTIFY_REALTOR_URL, sbNotify, authHeader } from '../../lib/supabase';
import { Ic, sc, sl, f$, STATS } from '../../lib/utils';

const AI_PM_URL = 'https://cbfftukmhqvvjlrlnltk.supabase.co/functions/v1/ai-project-manager';
import InfoTab from './tabs/InfoTab';
import ScheduleTab from './tabs/ScheduleTab';
import { NotesTab, PhotosTab } from './tabs/NotesPhotosTab';
import DocsTab from './tabs/DocsTab';
import COTab from './tabs/COTab';
import EstimateTab from './tabs/EstimateTab';
import MessagesTab from './tabs/MessagesTab';
import LogsTab from './tabs/LogsTab';
import PaymentsTab from './tabs/PaymentsTab';
import ConsultationTab from './tabs/ConsultationTab';
import AiCompanionChat from '../shared/AiCompanionChat';
import MaterialsTab from './tabs/MaterialsTab';

const TABS = [
  { id: 'info', lb: 'Info', ic: 'info' },
  { id: 'sched', lb: 'Schedule', ic: 'sched' },
  { id: 'materials', lb: 'Materials', ic: 'box' },
  { id: 'notes', lb: 'Notes', ic: 'note' },
  { id: 'photos', lb: 'Photos', ic: 'cam' },
  { id: 'docs', lb: 'Documents', ic: 'folder' },
  { id: 'co', lb: 'Change Orders', ic: 'warn' },
  { id: 'msgs', lb: 'Messages', ic: 'note' },
  { id: 'bids', lb: 'Estimate', ic: 'doc' },
  { id: 'logs', lb: 'Daily Logs', ic: 'clip' },
  { id: 'payments', lb: 'Payments', ic: 'doc' },
  { id: 'session', lb: 'AI Session', ic: 'grid' },
];

export default function JobDet({ job, upd, del, back, profile }) {
  const [tab, setTab] = useState('info');
  const [showSt, setShowSt] = useState(false);
  const [editInf, setEditInf] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiBanner, setAiBanner] = useState(null); // { type: 'success'|'error', msg: string }
  const [reviewCopied, setReviewCopied] = useState(false);

  const reviewLink = `${window.location.origin}?review=${job.id}&rt=${AV_TENANT}`;
  const copyReviewLink = () => {
    navigator.clipboard.writeText(reviewLink);
    setReviewCopied(true);
    setTimeout(() => setReviewCopied(false), 2500);
  };

  const canRunAi = profile?.role === 'owner' || profile?.role === 'project_manager';

  const runAiAnalysis = async () => {
    setAnalyzing(true);
    setAiBanner(null);
    try {
      const res = await fetch(AI_PM_URL, {
        method: 'POST',
        headers: authHeader(),
        body: JSON.stringify({ job_id: job.id, request_type: 'analyze', send_sms: false }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      setAiBanner({ type: 'success', msg: 'AI analysis complete — check Notes tab' });
    } catch (err) {
      setAiBanner({ type: 'error', msg: String(err?.message || err) });
    } finally {
      setAnalyzing(false);
      setTimeout(() => setAiBanner(null), 4000);
    }
  };
  const [inf, setInf] = useState({
    client_name: job.client_name || '',
    client_phone: job.client_phone || '',
    client_email: job.client_email || '',
    assigned_rep: job.assigned_rep || '',
    assigned_subs: job.assigned_subs || '',
    contract_value: job.contract_value || '',
    target_completion: job.target_completion || '',
    sqft: job.sqft || '',
    client_notify: job.client_notify || 'portal',
    referring_realtor_name: job.referring_realtor_name || '',
    referring_realtor_phone: job.referring_realtor_phone || '',
    referring_realtor_email: job.referring_realtor_email || '',
  });

  // Docs/photos state shared between DocsTab and EstimateTab (for ITB sharing)
  const [docs, setDocs] = useState([]);
  const [docsLoaded, setDocsLoaded] = useState(false);

  const apCOs = (job.change_orders || []).filter(c => c.status === 'approved');
  const coT = apCOs.reduce((a, c) => a + Number(c.amount || 0), 0);
  const cv = Number(job.contract_value || 0);
  const rev = cv + coT;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#F7F5F0' }}>
      {/* Header */}
      <div style={{ background: '#0A1F44', padding: '16px 20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: rev > 0 ? 10 : 0 }}>
          <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', width: 24, height: 24, display: 'flex', alignItems: 'center' }} onClick={back}>{Ic.back}</button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 2 }}>Project</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', lineHeight: 1.3 }}>{job.address}</div>
            {job.client_name && <div style={{ fontSize: 12, color: '#C9A84C', marginTop: 2, fontWeight: 500 }}>{job.client_name}</div>}
          </div>
          <button onClick={() => setShowSt(true)} style={{ background: sc(job.status) + '22', border: `1px solid ${sc(job.status)}55`, color: sc(job.status), padding: '6px 12px', fontFamily: "'DM Sans',sans-serif", fontSize: 11, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            {sl(job.status)}<span style={{ width: 12, height: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.7 }}>{Ic.chev}</span>
          </button>
          {canRunAi && (
            <button
              title="Run AI Analysis"
              disabled={analyzing}
              onClick={runAiAnalysis}
              style={{ width: 36, height: 36, borderRadius: 8, background: analyzing ? '#0d2a5e' : '#0A1F44', border: '1px solid #C9A84C55', cursor: analyzing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: analyzing ? 0.7 : 1 }}
            >
              {analyzing
                ? <span style={{ width: 16, height: 16, border: '2px solid #C9A84C', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'aiSpin 0.7s linear infinite' }} />
                : <span style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C9A84C' }}>{Ic.grid}</span>
              }
            </button>
          )}
        </div>
        {rev > 0 && <div className="cbar">
          <div className="cc"><div className="cc-l">Contract</div><div className="cc-v" style={{ color: '#fff' }}>{f$(cv)}</div></div>
          {coT > 0 && <div className="cc"><div className="cc-l">COs</div><div className="cc-v" style={{ color: '#f59e0b' }}>+{f$(coT)}</div></div>}
          {coT > 0 && <div className="cc"><div className="cc-l">Revised</div><div className="cc-v" style={{ color: '#C9A84C' }}>{f$(rev)}</div></div>}
        </div>}
      </div>

      {/* Tab bar */}
      <div className="tabbar">
        {TABS.map(t => (
          <button key={t.id} className={`tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
            <span style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Ic[t.ic] || Ic.info}</span>{t.lb}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {job.status === 'complete' && canRunAi && (
          <div style={{ background: 'linear-gradient(135deg,#0A1F44,#1a3a6e)', borderRadius: 8, padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#C9A84C', marginBottom: 2 }}>🌟 Request a Review</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
                Send {job.client_name || 'your client'} this link — their review goes straight to your public profile.
              </div>
            </div>
            <button
              onClick={copyReviewLink}
              style={{ background: reviewCopied ? '#22C55E' : '#C9A84C', color: '#0A1F44', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, transition: 'background 0.2s' }}>
              {reviewCopied ? '✓ Copied!' : 'Copy Review Link'}
            </button>
          </div>
        )}
        {aiBanner && (
          <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: aiBanner.type === 'success' ? '#D1FAE5' : '#FEE2E2', color: aiBanner.type === 'success' ? '#065f46' : '#991b1b', border: `1px solid ${aiBanner.type === 'success' ? '#6ee7b7' : '#fca5a5'}` }}>
            {aiBanner.msg}
          </div>
        )}
        {tab === 'info' && <InfoTab job={job} upd={upd} del={del} profile={profile} inf={inf} setInf={setInf} editInf={editInf} setEditInf={setEditInf} />}
        {tab === 'sched' && <ScheduleTab job={job} />}
        {tab === 'materials' && <MaterialsTab job={job} profile={profile} />}
        {tab === 'notes' && <NotesTab job={job} upd={upd} profile={profile} />}
        {tab === 'photos' && <PhotosTab job={job} upd={upd} />}
        {tab === 'docs' && <DocsTab job={job} docs={docs} setDocs={setDocs} docsLoaded={docsLoaded} setDocsLoaded={setDocsLoaded} />}
        {tab === 'co' && <COTab job={job} upd={upd} profile={profile} />}
        {tab === 'msgs' && <MessagesTab job={job} />}
        {tab === 'bids' && <EstimateTab job={job} photos={job.photos || []} docs={docs} setDocs={setDocs} />}
        {tab === 'logs' && <LogsTab job={job} />}
        {tab === 'payments' && <PaymentsTab job={job} />}
        {tab === 'session' && <ConsultationTab job={job} profile={profile} />}
      </div>

      <AiCompanionChat job={job} profile={profile} />

      {/* Status picker modal */}
      {showSt && <div className="overlay" onClick={() => setShowSt(false)}><div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Update Status</div>
        {STATS.map(s => (
          <button key={s.id} className={`st-opt${job.status === s.id ? ' on' : ''}`} onClick={() => {
            upd({ status: s.id });
            setShowSt(false);
            if (s.id !== job.status) {
              sbNotify('status_changed', `Status updated — ${job.address}`, `Job moved to: ${s.lb}`, job.id, AV_USER_ID);
              if (['active', 'punch', 'complete'].includes(s.id) && (job.referring_realtor_phone || job.referring_realtor_email)) {
                const ms = s.id === 'active' ? 'kickoff' : s.id === 'punch' ? 'punch_list' : 'complete';
                fetch(NOTIFY_REALTOR_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` }, body: JSON.stringify({ job_id: job.id, milestone: ms }) }).catch(() => {});
              }
            }
          }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: s.c, flexShrink: 0 }} />{s.lb}
            {job.status === s.id && <span style={{ marginLeft: 'auto', color: '#C9A84C', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Ic.check}</span>}
          </button>
        ))}
      </div></div>}
    </div>
  );
}
