import { useState, useEffect, useRef } from 'react';
import { AV_USER_ID, AV_TENANT, ANON_KEY, NOTIFY_REALTOR_URL, AI_PM_URL, sbNotify, authHeader } from '../../lib/supabase';
import { Ic, sc, sl, f$, STATS, isMob } from '../../lib/utils';
import InfoTab from './tabs/InfoTab';
import ScheduleTab from './tabs/ScheduleTab';
import DocsTab from './tabs/DocsTab';
import MessagesTab from './tabs/MessagesTab';
import ConsultationTab from './tabs/ConsultationTab';
import AiCompanionChat from '../shared/AiCompanionChat';
import FloorPlanTab from './tabs/FloorPlanTab';
import FinancialsTab from './tabs/FinancialsTab';
import FieldTab from './tabs/FieldTab';
import EstimateTab from './tabs/EstimateTab';
import SubsTab from './tabs/SubsTab';
import MaterialsTab from './tabs/MaterialsTab';

const TABS = [
  { id: 'info',       lb: 'Info',         ic: 'info' },
  { id: 'estimate',   lb: 'Estimate',     ic: 'doc' },
  { id: 'subs',       lb: 'Subs',         ic: 'clip' },
  { id: 'materials',  lb: 'Materials',    ic: 'box',  pmOnly: true },
  { id: 'financials', lb: 'Financials',   ic: 'doc' },
  { id: 'sched',      lb: 'Schedule',     ic: 'sched' },
  { id: 'field',      lb: 'Field',        ic: 'clip' },
  { id: 'msgs',       lb: 'Messages',     ic: 'note' },
  { id: 'docs',       lb: 'Documents',    ic: 'folder' },
  { id: 'floorplan',  lb: 'Scanner',      ic: 'doc' },
  { id: 'session',    lb: 'Consultation', ic: 'eye' },
];

export default function JobDet({ job, upd, del, back, profile, pendingAction, clearPendingAction }) {
  const [tab, setTab] = useState('info');
  const [showSt, setShowSt] = useState(false);
  const [editInf, setEditInf] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiBanner, setAiBanner] = useState(null); // { type: 'success'|'error', msg: string }
  const [showAiPmConfirm, setShowAiPmConfirm] = useState(false);
  const [reviewCopied, setReviewCopied] = useState(false);
  const [completionCopied, setCompletionCopied] = useState(false);

  useEffect(() => {
    if (pendingAction?.kind === 'transaction_save' || pendingAction?.kind === 'line_item_save') {
      setTab('financials');
    }
  }, [pendingAction]);

  const reviewLink = `${window.location.origin}?review=${job.id}&rt=${AV_TENANT}`;
  const completionLink = `${window.location.origin}?completion=${job.id}`;
  const copyReviewLink = () => {
    navigator.clipboard.writeText(reviewLink);
    setReviewCopied(true);
    setTimeout(() => setReviewCopied(false), 2500);
  };
  const copyCompletionLink = () => {
    navigator.clipboard.writeText(completionLink);
    setCompletionCopied(true);
    setTimeout(() => setCompletionCopied(false), 2500);
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
    cost_plus: job.cost_plus || false,
    default_markup_pct: Number(job.default_markup_pct || 0),
    referring_realtor_name: job.referring_realtor_name || '',
    referring_realtor_phone: job.referring_realtor_phone || '',
    referring_realtor_email: job.referring_realtor_email || '',
  });

  // Docs/photos state shared between DocsTab and EstimateTab (for ITB sharing)
  const [docs, setDocs] = useState([]);
  const [docsLoaded, setDocsLoaded] = useState(false);

  // Re-fetch docs every time the user navigates to the docs tab
  useEffect(() => {
    if (tab === 'docs') setDocsLoaded(false);
  }, [tab]);

  const mob = isMob();
  const tabbarRef = useRef(null);
  useEffect(() => {
    const el = tabbarRef.current?.querySelector('.tab.on');
    if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }, [tab]);

  const coT = Number(job.co_total || 0);
  const cv = Number(job.contract_value || 0);
  const rev = cv + coT;

  return (
    <>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#F7F5F0' }}>
      {/* Header */}
      <div style={{ background: '#0A1F44', padding: '16px 20px', flexShrink: 0 }}>
        {mob ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0', flexShrink: 0 }} onClick={back}>
                <span style={{ width: 16, height: 16, display: 'flex', alignItems: 'center' }}>{Ic.back}</span>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>Projects</span>
              </button>
              <div style={{ flex: 1 }} />
              <button onClick={() => setShowSt(true)} style={{ background: sc(job.status) + '22', border: `1px solid ${sc(job.status)}55`, color: sc(job.status), padding: '6px 12px', fontFamily: "'DM Sans',sans-serif", fontSize: 11, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                {sl(job.status)}<span style={{ width: 12, height: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.7 }}>{Ic.chev}</span>
              </button>
              {canRunAi && (
                <button
                  title="Run AI Analysis"
                  disabled={analyzing}
                  onClick={() => setShowAiPmConfirm(true)}
                  style={{ width: 36, height: 36, borderRadius: 8, background: analyzing ? '#0d2a5e' : '#0A1F44', border: '1px solid #C9A84C55', cursor: analyzing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: analyzing ? 0.7 : 1 }}
                >
                  {analyzing
                    ? <span style={{ width: 16, height: 16, border: '2px solid #C9A84C', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'aiSpin 0.7s linear infinite' }} />
                    : <span style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C9A84C' }}>{Ic.grid}</span>
                  }
                </button>
              )}
            </div>
            <div style={{ marginBottom: rev > 0 ? 10 : 0 }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 2 }}>
                Project{job.po_number && <span style={{ marginLeft: 8, color: '#C9A84C', letterSpacing: 1.2 }}>· PO {job.po_number}</span>}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', lineHeight: 1.3 }}>{job.address}</div>
              {job.client_name && <div style={{ fontSize: 12, color: '#C9A84C', marginTop: 2, fontWeight: 500 }}>{job.client_name}</div>}
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: rev > 0 ? 10 : 0 }}>
            <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0', flexShrink: 0 }} onClick={back}>
              <span style={{ width: 16, height: 16, display: 'flex', alignItems: 'center' }}>{Ic.back}</span>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>Projects</span>
            </button>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 2 }}>
                Project{job.po_number && <span style={{ marginLeft: 8, color: '#C9A84C', letterSpacing: 1.2 }}>· PO {job.po_number}</span>}
              </div>
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
                onClick={() => setShowAiPmConfirm(true)}
                style={{ width: 36, height: 36, borderRadius: 8, background: analyzing ? '#0d2a5e' : '#0A1F44', border: '1px solid #C9A84C55', cursor: analyzing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: analyzing ? 0.7 : 1 }}
              >
                {analyzing
                  ? <span style={{ width: 16, height: 16, border: '2px solid #C9A84C', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'aiSpin 0.7s linear infinite' }} />
                  : <span style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C9A84C' }}>{Ic.grid}</span>
                }
              </button>
            )}
          </div>
        )}
        {rev > 0 && <div className="cbar">
          <div className="cc"><div className="cc-l">Contract</div><div className="cc-v" style={{ color: '#fff' }}>{f$(cv)}</div></div>
          {coT > 0 && <div className="cc"><div className="cc-l">COs</div><div className="cc-v" style={{ color: '#f59e0b' }}>+{f$(coT)}</div></div>}
          {coT > 0 && <div className="cc"><div className="cc-l">Revised</div><div className="cc-v" style={{ color: '#C9A84C' }}>{f$(rev)}</div></div>}
        </div>}
      </div>

      {/* Tab bar */}
      <div className="tabbar" ref={tabbarRef}>
        {TABS.filter(t => !t.pmOnly || ['owner', 'project_manager', 'sales_rep'].includes(profile?.role)).map(t => (
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
        {/* Completion Package banner */}
        {job.status === 'complete' && canRunAi && (() => {
          const beforePhoto = (job.photos || []).find(p => p.label === 'before');
          const afterPhoto  = (job.photos || []).find(p => p.label === 'after');
          const hasPackage  = beforePhoto && afterPhoto;
          return (
            <div style={{ background: hasPackage ? 'linear-gradient(135deg,#0d2a1a,#1a4a2e)' : 'linear-gradient(135deg,#1a1a0d,#2a2a14)', borderRadius: 8, padding: '12px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', border: `1px solid ${hasPackage ? '#22C55E33' : '#C9A84C33'}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: hasPackage ? '#4ADE80' : '#C9A84C', marginBottom: 2 }}>
                  {hasPackage ? '📦 Completion Package Ready' : '📸 Create Completion Package'}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
                  {hasPackage
                    ? `Before & after labeled — share this branded page with ${job.client_name || 'your client'} and use it for marketing.`
                    : 'Go to Photos tab and tap B/A on photos to label your before & after for this project.'}
                </div>
              </div>
              {hasPackage && (
                <button
                  onClick={copyCompletionLink}
                  style={{ background: completionCopied ? '#22C55E' : '#4ADE80', color: '#0A2010', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, transition: 'background 0.2s' }}>
                  {completionCopied ? '✓ Copied!' : '📤 Copy Package Link'}
                </button>
              )}
              {!hasPackage && (
                <button
                  onClick={() => setTab('field')}
                  style={{ background: 'transparent', color: '#C9A84C', border: '1px solid #C9A84C55', borderRadius: 6, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  Go to Photos →
                </button>
              )}
            </div>
          );
        })()}
        {aiBanner && (
          <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, background: aiBanner.type === 'success' ? '#D1FAE5' : '#FEE2E2', color: aiBanner.type === 'success' ? '#065f46' : '#991b1b', border: `1px solid ${aiBanner.type === 'success' ? '#6ee7b7' : '#fca5a5'}` }}>
            {aiBanner.msg}
          </div>
        )}
        {tab === 'info' && <InfoTab job={job} upd={upd} del={del} profile={profile} inf={inf} setInf={setInf} editInf={editInf} setEditInf={setEditInf} setTab={setTab} />}
        {tab === 'estimate' && <EstimateTab job={job} photos={job.photos || []} docs={docs} setDocs={setDocs} />}
        {tab === 'subs' && <SubsTab job={job} profile={profile} setTab={setTab} />}
        {tab === 'materials' && <MaterialsTab job={job} />}
        {tab === 'financials' && <FinancialsTab job={job} upd={upd} profile={profile} docs={docs} setDocs={setDocs} pendingAction={pendingAction} clearPendingAction={clearPendingAction} />}
        {tab === 'sched' && <ScheduleTab job={job} />}
        {tab === 'msgs' && <MessagesTab job={job} profile={profile} />}
        {tab === 'field' && <FieldTab job={job} upd={upd} profile={profile} />}
        {tab === 'docs' && <DocsTab job={job} docs={docs} setDocs={setDocs} docsLoaded={docsLoaded} setDocsLoaded={setDocsLoaded} />}
        {tab === 'floorplan' && <FloorPlanTab job={job} profile={profile} />}
        {tab === 'session' && <ConsultationTab job={job} profile={profile} setTab={setTab} />}
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
              if (['in_progress', 'final_touches', 'complete'].includes(s.id) && (job.referring_realtor_phone || job.referring_realtor_email)) {
                const ms = s.id === 'in_progress' ? 'kickoff' : s.id === 'final_touches' ? 'punch_list' : 'complete';
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

    {showAiPmConfirm && (
      <div className="overlay" onClick={() => setShowAiPmConfirm(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-title">Run deep AI analysis?</div>
          <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5, marginBottom: 16 }}>
            This runs Opus-level AI analysis on this job. Costs approximately $0.30.
            Limited to once per job per 24 hours — repeat clicks within 24h return
            the previous analysis.
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowAiPmConfirm(false)}>Cancel</button>
            <button className="btn btn-navy" style={{ flex: 1 }} onClick={() => { setShowAiPmConfirm(false); runAiAnalysis(); }}>Run Analysis</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
