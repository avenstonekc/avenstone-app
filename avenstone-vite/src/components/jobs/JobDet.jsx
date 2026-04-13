import { useState } from 'react';
import { AV_USER_ID, ANON_KEY, NOTIFY_REALTOR_URL, sbNotify } from '../../lib/supabase';
import { Ic, sc, sl, f$, STATS } from '../../lib/utils';
import InfoTab from './tabs/InfoTab';
import ScheduleTab from './tabs/ScheduleTab';
import { NotesTab, PhotosTab } from './tabs/NotesPhotosTab';
import DocsTab from './tabs/DocsTab';
import COTab from './tabs/COTab';
import EstimateTab from './tabs/EstimateTab';
import MessagesTab from './tabs/MessagesTab';
import LogsTab from './tabs/LogsTab';
import PaymentsTab from './tabs/PaymentsTab';

const TABS = [
  { id: 'info', lb: 'Info', ic: 'info' },
  { id: 'sched', lb: 'Schedule', ic: 'sched' },
  { id: 'notes', lb: 'Notes', ic: 'note' },
  { id: 'photos', lb: 'Photos', ic: 'cam' },
  { id: 'docs', lb: 'Documents', ic: 'folder' },
  { id: 'co', lb: 'Change Orders', ic: 'warn' },
  { id: 'msgs', lb: 'Messages', ic: 'note' },
  { id: 'bids', lb: 'Estimate', ic: 'doc' },
  { id: 'logs', lb: 'Daily Logs', ic: 'clip' },
  { id: 'payments', lb: 'Payments', ic: 'doc' },
];

export default function JobDet({ job, upd, del, back, profile }) {
  const [tab, setTab] = useState('info');
  const [showSt, setShowSt] = useState(false);
  const [editInf, setEditInf] = useState(false);
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
        {tab === 'info' && <InfoTab job={job} upd={upd} del={del} profile={profile} inf={inf} setInf={setInf} editInf={editInf} setEditInf={setEditInf} />}
        {tab === 'sched' && <ScheduleTab job={job} />}
        {tab === 'notes' && <NotesTab job={job} upd={upd} profile={profile} />}
        {tab === 'photos' && <PhotosTab job={job} upd={upd} />}
        {tab === 'docs' && <DocsTab job={job} docs={docs} setDocs={setDocs} docsLoaded={docsLoaded} setDocsLoaded={setDocsLoaded} />}
        {tab === 'co' && <COTab job={job} upd={upd} profile={profile} />}
        {tab === 'msgs' && <MessagesTab job={job} />}
        {tab === 'bids' && <EstimateTab job={job} photos={job.photos || []} docs={docs} setDocs={setDocs} />}
        {tab === 'logs' && <LogsTab job={job} />}
        {tab === 'payments' && <PaymentsTab job={job} />}
      </div>

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
