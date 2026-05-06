import { useState, useEffect, useRef } from 'react';
import { sb, AV_USER_ID, AV_TENANT, sbLoadPhases, sbLoadMessages, sbPostMessage, sbNotify, sbNotifyEmail, sbLoadCostItems, sbLoadCostInvoices, sbLoadEstimateLineItems } from '../../lib/supabase';
import { Ic, sc, sl, f$, fD, fDT, phSc, phSl, isMob } from '../../lib/utils';
import PhotoLightbox from '../shared/PhotoLightbox';
import ClientSignContractModal from '../modals/ClientSignContractModal';
import ClientInvoicesTab from './ClientInvoicesTab';

async function sbSubmitRating(subId, stars, comment, jobId) {
  const { data, error } = await sb.from('sub_ratings').upsert({ tenant_id: AV_TENANT, sub_id: subId, rater_id: AV_USER_ID, job_id: jobId || null, stars, comment: comment || null }, { onConflict: 'tenant_id,sub_id,rater_id,job_id' }).select().single();
  return { data, error };
}

async function sbSubmitJobReview(jobId, tenantId, r) {
  return await sb.from('job_reviews').insert({ job_id: jobId, tenant_id: tenantId, client_name: r.client_name || null, client_email: r.client_email || null, rating_quality: r.quality, rating_communication: r.communication, rating_timeliness: r.timeliness, would_recommend: r.would_recommend, review_text: r.text || null, created_at: new Date().toISOString() });
}

async function sbLoadJobReview(jobId) {
  const { data } = await sb.from('job_reviews').select('*').eq('job_id', jobId).maybeSingle();
  return data || null;
}

function ClientScheduleView({ jobId }) {
  const [phases, setPhases] = useState([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { sbLoadPhases(jobId).then(d => { setPhases(d); setLoaded(true); }); }, [jobId]);
  if (!loaded) return <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF', fontSize: 13 }}>Loading schedule...</div>;
  if (!phases.length) return <div className="empty">{Ic.sched}<div className="empty-t">Schedule not set</div><div>Your contractor will add the project schedule here</div></div>;
  const done = phases.filter(p => p.status === 'complete').length;
  const pct = Math.round((done / phases.length) * 100);
  return (
    <div>
      <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 }}>Overall Progress</div>
          <div style={{ fontSize: 12, color: '#0A1F44', fontWeight: 700 }}>{pct}% complete</div>
        </div>
        <div style={{ background: '#E8E4DC', height: 8, borderRadius: 4 }}>
          <div style={{ background: '#22c55e', height: 8, borderRadius: 4, width: `${pct}%`, transition: 'width 0.4s' }} />
        </div>
      </div>
      {phases.map(ph => (
        <div key={ph.id} style={{ background: '#fff', border: '1px solid #E8E4DC', borderLeft: `3px solid ${phSc(ph.status)}`, marginBottom: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44', marginBottom: 2 }}>{ph.phase_name}</div>
            {(ph.start_date || ph.end_date) && <div style={{ fontSize: 11, color: '#9CA3AF' }}>{ph.start_date ? fD(ph.start_date) : 'TBD'} → {ph.end_date ? fD(ph.end_date) : 'TBD'}</div>}
          </div>
          <span style={{ fontSize: 9, background: phSc(ph.status) + '18', color: phSc(ph.status), padding: '3px 8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{phSl(ph.status)}</span>
        </div>
      ))}
    </div>
  );
}

const JOB_STAGES = [
  { label: 'Review', statuses: ['lead'] },
  { label: 'Proposal', statuses: ['bid_sent'] },
  { label: 'Contract', statuses: ['signed'] },
  { label: 'In Progress', statuses: ['active', 'demo', 'framing', 'rough_mep', 'drywall', 'finish'] },
  { label: 'Final Touches', statuses: ['punch'] },
  { label: 'Complete', statuses: ['complete'] },
];

function ProgressStepper({ status }) {
  const curIdx = JOB_STAGES.findIndex(s => s.statuses.includes(status));
  return (
    <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '16px 20px', marginBottom: 16, overflowX: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', minWidth: 320 }}>
        {JOB_STAGES.map((s, i) => {
          const done = i < curIdx;
          const active = i === curIdx;
          return (
            <div key={s.label} style={{ display: 'flex', alignItems: 'flex-start', flex: i < JOB_STAGES.length - 1 ? 1 : 'none' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  background: done ? '#22c55e' : active ? '#0A1F44' : '#F3F0EB',
                  border: active ? '2.5px solid #C9A84C' : 'none',
                  color: done || active ? '#fff' : '#9CA3AF',
                  fontSize: done ? 12 : 11, fontWeight: 700,
                  boxShadow: active ? '0 0 0 4px rgba(201,168,76,0.18)' : 'none',
                  transition: 'all 0.3s ease',
                }}>
                  {done ? '✓' : i + 1}
                </div>
                <div style={{ fontSize: 9, fontWeight: active ? 700 : 500, color: active ? '#0A1F44' : done ? '#22c55e' : '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap', textAlign: 'center' }}>{s.label}</div>
              </div>
              {i < JOB_STAGES.length - 1 && (
                <div style={{ flex: 1, height: 2, background: done ? '#22c55e' : '#E8E4DC', marginTop: 13, transition: 'background 0.4s ease' }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const BASE_CLIENT_TABS = [
  { id: 'overview',  lb: 'Overview',  ic: 'info' },
  { id: 'invoices',  lb: 'Invoices',  ic: 'doc'  },
  { id: 'schedule',  lb: 'Schedule',  ic: 'sched' },
  { id: 'photos',    lb: 'Photos',    ic: 'cam'  },
  { id: 'msgs',      lb: 'Messages',  ic: 'note' },
];
const getClientTabs = job => job?.cost_plus ? [...BASE_CLIENT_TABS, { id: 'financials', lb: 'Financials', ic: 'doc' }] : BASE_CLIENT_TABS;

const CLIENT_STATUS = s => ({
  lead: 'In Review', bid_sent: 'Proposal Sent', signed: 'Contract Signed',
  active: 'In Progress', demo: 'In Progress', framing: 'In Progress',
  rough_mep: 'In Progress', drywall: 'In Progress', finish: 'In Progress',
  punch: 'Final Touches', complete: 'Complete', on_hold: 'On Hold',
}[s] || sl(s));

export default function ClientPortal({ profile, signOut }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);
  const [tab, setTab] = useState('overview');
  const [phases, setPhases] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [docs, setDocs] = useState([]);
  const [payments, setPayments] = useState([]);
  const [msgs, setMsgs] = useState([]);
  const [jobSubs, setJobSubs] = useState([]);
  const [loaded, setLoaded] = useState({ phases: false, photos: false, docs: false, payments: false, msgs: false, subs: false, notes: false });
  const [msgTxt, setMsgTxt] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [showIntake, setShowIntake] = useState(false);
  const [materialsJob, setMaterialsJob] = useState(null); // set when intake completes → auto-opens materials flow
  const [showSignContract, setShowSignContract] = useState(false);
  const [bannerSignJob, setBannerSignJob] = useState(null);
  const [crForm, setCrForm] = useState({ description: '', reason: '' });
  const [crSaving, setCrSaving] = useState(false);
  const [crDone, setCrDone] = useState(false);
  const [ratings, setRatings] = useState({});
  const [ratingSaving, setRatingSaving] = useState(false);
  const [ratingDone, setRatingDone] = useState({});
  const [clbIdx, setClbIdx] = useState(null);
  const [notes, setNotes] = useState([]);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [costItems, setCostItems] = useState([]);
  const [costInvoices, setCostInvoices] = useState([]);
  const [budgetItems, setBudgetItems] = useState([]);
  const [staffOwnerId, setStaffOwnerId] = useState(null);
  const [jobReview, setJobReview] = useState(null);
  const [reviewForm, setReviewForm] = useState({ quality: 0, communication: 0, timeliness: 0, would_recommend: null, text: '' });
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewDone, setReviewDone] = useState(false);
  const msgsEndRef = useRef();

  useEffect(() => {
    if (!profile?.id) return;
    sb.from('jobs').select('*').or(`client_user_id.eq.${profile.id},client_email.eq.${profile.email}`).then(({ data }) => { setJobs(data || []); setLoading(false); });
  }, [profile?.id]);

  const job = sel ? jobs.find(j => j.id === sel) : null;

  useEffect(() => {
    if (!job) return;
    if (!loaded.phases) { sbLoadPhases(job.id).then(d => { setPhases(d); setLoaded(p => ({ ...p, phases: true })); }); }
    if (!loaded.subs) { sb.from('job_sub_engagements').select('id,trade,sub:profiles!sub_id(id,full_name,email)').eq('job_id', job.id).eq('status', 'active').order('activated_at', { ascending: true }).then(({ data }) => { setJobSubs(data || []); setLoaded(p => ({ ...p, subs: true })); }); }
    if (!staffOwnerId) { sb.from('profiles').select('id').eq('tenant_id', AV_TENANT).eq('role', 'owner').limit(1).single().then(({ data }) => { if (data?.id) setStaffOwnerId(data.id); }); }
  }, [job?.id]);

  useEffect(() => {
    if (!job || tab !== 'photos' || loaded.photos) return;
    sb.from('photos').select('*').eq('job_id', job.id).order('created_at', { ascending: true }).then(({ data }) => { setPhotos(data || []); setLoaded(p => ({ ...p, photos: true })); });
  }, [job?.id, tab]);

  useEffect(() => {
    if (!job || tab !== 'docs' || loaded.docs) return;
    sb.from('job_documents').select('*').eq('job_id', job.id).eq('client_visible', true).order('created_at', { ascending: false }).then(({ data }) => { setDocs(data || []); setLoaded(p => ({ ...p, docs: true })); });
  }, [job?.id, tab]);

  useEffect(() => {
    if (!job || (tab !== 'payments' && tab !== 'overview') || loaded.payments) return;
    sb.from('payments').select('*').eq('job_id', job.id).order('created_at', { ascending: false }).then(({ data }) => { setPayments(data || []); setLoaded(p => ({ ...p, payments: true })); });
  }, [job?.id, tab]);

  useEffect(() => {
    if (!job || tab !== 'msgs' || loaded.msgs) return;
    sbLoadMessages(job.id).then(d => { setMsgs(d); setLoaded(p => ({ ...p, msgs: true })); });
  }, [job?.id, tab]);

  useEffect(() => {
    if (!job || tab !== 'notes' || loaded.notes) return;
    sb.from('job_notes').select('*').eq('job_id', job.id).order('created_at', { ascending: true }).then(({ data }) => { setNotes(data || []); setLoaded(p => ({ ...p, notes: true })); });
  }, [job?.id, tab]);

  useEffect(() => { if (msgs.length && msgsEndRef.current) msgsEndRef.current.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  useEffect(() => {
    if (!job || tab !== 'financials' || !job.cost_plus) return;
    Promise.all([sbLoadCostItems(job.id), sbLoadCostInvoices(job.id), sbLoadEstimateLineItems(job.id)])
      .then(([its, invs, budget]) => { setCostItems(its); setCostInvoices(invs); setBudgetItems(budget); });
  }, [job?.id, tab]);

  useEffect(() => {
    if (!profile?.id) return;
    const ch = sb.channel('client-job-updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'jobs', filter: `client_user_id=eq.${profile.id}` }, payload => {
        setJobs(prev => prev.map(j => j.id === payload.new.id ? { ...j, ...payload.new } : j));
      })
      .subscribe();
    return () => sb.removeChannel(ch);
  }, [profile?.id]);

  useEffect(() => {
    if (!job?.id) return;
    const ch = sb.channel('client-phase-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_phases', filter: `job_id=eq.${job.id}` }, () => {
        sbLoadPhases(job.id).then(d => setPhases(d));
      })
      .subscribe();
    return () => sb.removeChannel(ch);
  }, [job?.id]);

  const openJob = id => {
    setSel(id); setTab('overview');
    setLoaded({ phases: false, photos: false, docs: false, payments: false, msgs: false, subs: false });
    setPhases([]); setPhotos([]); setDocs([]); setPayments([]); setMsgs([]); setJobSubs([]);
    setRatings({}); setRatingDone({}); setJobReview(null); setCostItems([]); setCostInvoices([]); setNotes([]); setNoteText('');
    setReviewForm({ quality: 0, communication: 0, timeliness: 0, would_recommend: null, text: '' }); setReviewDone(false);
    sbLoadJobReview(id).then(r => setJobReview(r || false));
  };

  const sendMsg = async () => {
    if (!msgTxt.trim() || !job) return; setSendingMsg(true);
    const m = await sbPostMessage(job.id, msgTxt.trim());
    if (m) { setMsgs(p => [...p, m]); sbNotify('job_message', `Client message on ${job.address}`, msgTxt.trim().slice(0, 120), job.id, AV_USER_ID); sbNotifyEmail(staffOwnerId, `New message from ${profile?.full_name || 'your client'} on ${job.address}`, msgTxt.trim().slice(0, 160), job.id); setMsgTxt(''); }
    setSendingMsg(false);
  };

  const submitRating = async sub => {
    const r = ratings[sub.id]; if (!r?.stars) return;
    setRatingSaving(true);
    await sbSubmitRating(sub.id, r.stars, r.comment || '', job.id);
    setRatingDone(p => ({ ...p, [sub.id]: true }));
    setRatingSaving(false);
  };

  if (loading) return <div style={{ minHeight: '100dvh', background: '#0A1F44', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: 3, textTransform: 'uppercase' }}>Loading</div></div>;
  if (!jobs.length) return <div style={{ minHeight: '100dvh', background: '#F7F5F0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 24, textAlign: 'center' }}><div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: '#0A1F44' }}>No projects found</div><div style={{ fontSize: 14, color: '#9CA3AF', maxWidth: 320, lineHeight: 1.7 }}>Your contractor hasn't linked your account to a project yet.</div><button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={signOut}>Sign Out</button></div>;

  return (
    <div style={{ minHeight: '100dvh', background: '#F7F5F0' }}>
      <div style={{ background: '#0A1F44', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, color: '#C9A84C', letterSpacing: 4, textTransform: 'uppercase', marginBottom: 2 }}>Avenstone Group</div>
          {!job ? (
            <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>My Projects</div>
          ) : (
            <div>
              <button onClick={() => setSel(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', fontSize: 12, padding: 0, marginBottom: 2 }}>← Back</button>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#fff' }}>{job.address}</div>
            </div>
          )}
        </div>
        <button onClick={signOut} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', padding: 4 }}><span style={{ width: 16, height: 16, display: 'flex' }}>{Ic.logout}</span></button>
      </div>

      {!job && jobs.filter(j => !j.contract_signed).map(j => (
        <div key={j.id} style={{ background: '#0A1F44', padding: '14px 20px', display: 'flex', flexDirection: isMob() ? 'column' : 'row', alignItems: isMob() ? 'flex-start' : 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid rgba(201,168,76,0.25)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 3 }}>Your contract is ready to sign</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.address}</div>
          </div>
          <button style={{ background: '#C9A84C', color: '#0A1F44', border: 'none', padding: '10px 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0, borderRadius: 4, letterSpacing: 0.3 }} onClick={() => setBannerSignJob(j)}>
            Review &amp; Sign
          </button>
        </div>
      ))}

      {!job && <div style={{ padding: 16 }}>
        {jobs.map(j => (
          <div key={j.id} onClick={() => openJob(j.id)} style={{ background: '#fff', border: '1px solid #E8E4DC', borderLeft: `4px solid ${sc(j.status)}`, padding: 16, marginBottom: 10, cursor: 'pointer' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#0A1F44', marginBottom: 6 }}>{j.address}</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, background: sc(j.status) + '18', color: sc(j.status), padding: '3px 10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{sl(j.status)}</span>
              {j.target_completion && <span style={{ fontSize: 12, color: '#9CA3AF' }}>Target: {j.target_completion}</span>}
              {Number(j.contract_value || 0) > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: '#0A1F44' }}>{f$(Number(j.contract_value || 0))}</span>}
            </div>
          </div>
        ))}
      </div>}

      {job && <>
        {!job.contract_signed && <div style={{ background: '#FEF9EC', borderBottom: '2px solid #C9A84C', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>Your contract is ready to sign</div>
          <button className="btn btn-gold" style={{ fontSize: 12, padding: '7px 16px', flexShrink: 0 }} onClick={() => setShowSignContract(true)}>Sign Now</button>
        </div>}
        {job.contract_signed && <div style={{ background: '#F0FDF4', borderBottom: '1px solid #BBF7D0', padding: '8px 16px', fontSize: 12, color: '#16a34a', fontWeight: 600 }}>✓ Contract signed{job.contract_signed_at ? ` ${fD(job.contract_signed_at.slice(0, 10))}` : ''}</div>}

        <div className="tabbar" style={{ overflowX: 'auto', flexWrap: 'nowrap' }}>
          {getClientTabs(job).map(t => <button key={t.id} className={`tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)} style={{ whiteSpace: 'nowrap' }}><span style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Ic[t.ic] || Ic.info}</span>{t.lb}</button>)}
        </div>

        <div style={{ padding: 16, maxWidth: 720, margin: '0 auto' }}>
          {tab === 'overview' && <>
            {/* A) Status Hero Card */}
            {(() => {
              const done = loaded.phases ? phases.filter(p => p.status === 'complete').length : 0;
              const total = loaded.phases ? phases.length : 0;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <div style={{ background: '#0A1F44', padding: '24px 20px', marginBottom: 16, borderRadius: 2 }}>
                  <div style={{ fontSize: 9, color: '#C9A84C', letterSpacing: 4, textTransform: 'uppercase', marginBottom: 8 }}>Project Status</div>
                  <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 28, color: '#fff', lineHeight: 1.2, marginBottom: 6 }}>{CLIENT_STATUS(job.status)}</div>
                  {job.address && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginBottom: 2 }}>{job.address}</div>}
                  {job.client_name && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 20 }}>{job.client_name}</div>}
                  {loaded.phases && total > 0 && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
                        <span>{done} of {total} phases complete</span>
                        <span style={{ fontWeight: 700, color: pct === 100 ? '#22c55e' : '#C9A84C' }}>{pct}%</span>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.12)', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ background: pct === 100 ? '#22c55e' : '#C9A84C', height: 8, borderRadius: 4, width: `${pct}%`, transition: 'width 0.6s ease' }} />
                      </div>
                    </div>
                  )}
                  {!loaded.phases && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Loading phases...</div>}
                </div>
              );
            })()}

            <ProgressStepper status={job.status} />

            {/* B) Next Milestone Card */}
            {loaded.phases && phases.length > 0 && (() => {
              const inProgress = phases.find(p => p.status === 'in_progress');
              const next = inProgress || phases.find(p => p.status === 'pending');
              const allDone = phases.every(p => p.status === 'complete');
              return (
                <div style={{ background: '#fff', border: '1px solid #E8E4DC', borderLeft: '4px solid #C9A84C', padding: 20, marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#C9A84C', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>What's Happening Next</div>
                  {allDone ? (
                    <div style={{ textAlign: 'center', padding: '12px 0' }}>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>🎉</div>
                      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: '#0A1F44', marginBottom: 4 }}>Your project is complete!</div>
                      <div style={{ fontSize: 13, color: '#6B7280' }}>All phases have been finished. Thank you for choosing us.</div>
                    </div>
                  ) : next ? (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        {inProgress && <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', display: 'inline-block', flexShrink: 0, animation: 'pulse 1.8s ease-in-out infinite', boxShadow: '0 0 0 0 rgba(34,197,94,0.4)' }} />}
                        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: '#0A1F44' }}>{next.phase_name}</div>
                        {inProgress && <span style={{ fontSize: 10, background: '#D1FAE5', color: '#065F46', padding: '2px 8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0 }}>In Progress</span>}
                      </div>
                      {(next.start_date || next.end_date) && (
                        <div style={{ fontSize: 12, color: '#9CA3AF' }}>
                          {next.start_date && <span>Starts: <strong style={{ color: '#374151' }}>{fD(next.start_date)}</strong></span>}
                          {next.start_date && next.end_date && <span style={{ margin: '0 8px', color: '#E8E4DC' }}>·</span>}
                          {next.end_date && <span>Est. end: <strong style={{ color: '#374151' }}>{fD(next.end_date)}</strong></span>}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: '#6B7280' }}>Schedule not set yet — your contractor will update this soon.</div>
                  )}
                </div>
              );
            })()}

            {/* C) Next Payment Card */}
            {loaded.payments && (() => {
              const pending = payments.filter(p => p.status === 'pending' || p.status === 'due');
              if (!pending.length) return null;
              const next = pending[0];
              return (
                <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 20, marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>Your Next Payment</div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 26, color: '#0A1F44', marginBottom: 4 }}>{f$(Number(next.amount))}</div>
                      {next.description && <div style={{ fontSize: 13, color: '#374151', marginBottom: 4 }}>{next.description}</div>}
                      {next.due_date && <div style={{ fontSize: 12, color: '#9CA3AF' }}>Due: <strong style={{ color: '#374151' }}>{fD(next.due_date)}</strong></div>}
                    </div>
                    {next.stripe_checkout_url && (
                      <a href={next.stripe_checkout_url} target="_blank" rel="noreferrer" style={{ background: '#0A1F44', color: '#C9A84C', padding: '10px 18px', fontWeight: 700, fontSize: 13, textDecoration: 'none', flexShrink: 0, alignSelf: 'center' }}>Pay Now →</a>
                    )}
                  </div>
                  <div style={{ marginTop: 12, fontSize: 11, color: '#9CA3AF', borderTop: '1px solid #F3F0EB', paddingTop: 10 }}>Contact your contractor with payment questions.</div>
                </div>
              );
            })()}

            {/* D) Quick Stats Row */}
            {Number(job.contract_value || 0) > 0 && (() => {
              const contractTotal = Number(job.contract_value || 0) + Number(job.co_total || 0);
              const paid = loaded.payments ? payments.filter(p => p.status === 'paid' || p.status === 'completed').reduce((s, p) => s + Number(p.amount || 0), 0) : 0;
              const remaining = contractTotal - paid;
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: '#E8E4DC', marginBottom: 16 }}>
                  {[
                    { lb: 'Contract Value', val: f$(contractTotal) },
                    { lb: 'Paid to Date', val: f$(paid), green: paid > 0 },
                    { lb: 'Remaining', val: f$(Math.max(0, remaining)) },
                  ].map(({ lb, val, green }) => (
                    <div key={lb} style={{ background: '#fff', padding: '14px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>{lb}</div>
                      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16, color: green ? '#22c55e' : '#0A1F44', fontWeight: 700 }}>{val}</div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* What to Expect */}
            {loaded.phases && phases.length > 0 && (() => {
              const PHASE_DESC = name => {
                const n = (name || '').toLowerCase();
                if (/demo|demolition/.test(n)) return 'Your contractor will remove existing materials. Expect noise and dust. The space will look rough — that\'s normal.';
                if (/framing/.test(n)) return 'The structural skeleton of your project takes shape. You\'ll start to see the layout come to life.';
                if (/rough_mep|rough mep|electrical|plumbing|hvac/.test(n)) return 'Behind-the-walls work: electrical, plumbing, and HVAC are installed before walls close up.';
                if (/insulation/.test(n)) return 'Insulation goes in for energy efficiency and soundproofing.';
                if (/drywall/.test(n)) return 'Walls and ceilings get closed up. The space starts looking like a real room.';
                if (/paint|painting/.test(n)) return 'Color goes on the walls. This is where the vision really starts to show.';
                if (/flooring/.test(n)) return 'Floors are installed. One of the most visible transformations.';
                if (/trim|fixtures|finish/.test(n)) return 'Final details: trim, fixtures, hardware. The polish that makes it look finished.';
                if (/punch/.test(n)) return 'Final walkthrough and touch-ups. Almost done.';
                if (/complete/.test(n)) return 'Your project is complete!';
                return null;
              };
              const upcoming = phases
                .filter(p => p.status !== 'complete')
                .slice(0, 3)
                .map(p => ({ ...p, desc: PHASE_DESC(p.phase_name) }))
                .filter(p => p.desc);
              if (!upcoming.length) return null;
              return (
                <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 20, marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>What to Expect</div>
                  {upcoming.map((ph, i) => (
                    <div key={ph.id} style={{ display: 'flex', gap: 14, marginBottom: i < upcoming.length - 1 ? 18 : 0, paddingBottom: i < upcoming.length - 1 ? 18 : 0, borderBottom: i < upcoming.length - 1 ? '1px solid #F3F0EB' : 'none' }}>
                      <div style={{ width: 32, height: 32, background: ph.status === 'in_progress' ? '#D1FAE5' : '#F3F0EB', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, color: ph.status === 'in_progress' ? '#065F46' : '#9CA3AF', fontWeight: 700, marginTop: 2 }}>{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0A1F44', marginBottom: 4 }}>{ph.phase_name}</div>
                        <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.6, marginBottom: ph.start_date || ph.end_date ? 6 : 0 }}>{ph.desc}</div>
                        {(ph.start_date || ph.end_date) && (
                          <div style={{ fontSize: 11, color: '#9CA3AF' }}>
                            {ph.start_date && <span>{fD(ph.start_date)}</span>}
                            {ph.start_date && ph.end_date && <span> → </span>}
                            {ph.end_date && <span>{fD(ph.end_date)}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {['complete', 'punch'].includes(job.status) && jobReview !== null && (jobReview ?
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', padding: 20, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 36, height: 36, background: '#22c55e', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, flexShrink: 0 }}>✓</div>
                  <div><div style={{ fontSize: 14, fontWeight: 700, color: '#065F46' }}>Thanks for your review!</div><div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>Your feedback helps us improve.</div></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                  {[['Quality', jobReview.rating_quality], ['Communication', jobReview.rating_communication], ['Timeliness', jobReview.rating_timeliness]].map(([lb, v]) => (
                    <div key={lb} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 3 }}>{lb}</div>
                      <div style={{ fontSize: 16 }}>{[1, 2, 3, 4, 5].map(s => <span key={s} style={{ color: v >= s ? '#C9A84C' : '#E8E4DC' }}>★</span>)}</div>
                    </div>
                  ))}
                </div>
                {jobReview.review_text && <div style={{ marginTop: 12, fontSize: 13, color: '#374151', fontStyle: 'italic', borderTop: '1px solid #BBF7D0', paddingTop: 12 }}>"{jobReview.review_text}"</div>}
              </div>
              : (reviewDone ?
                <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', padding: 20, marginBottom: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>🙏</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#065F46', marginBottom: 4 }}>Thank you!</div>
                  <div style={{ fontSize: 13, color: '#6B7280' }}>Your review means a lot to our team.</div>
                </div>
                : <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 20, marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>How Did We Do?</div>
                  <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 18, lineHeight: 1.6 }}>Your project is complete — we'd love your honest feedback.</div>
                  {[['quality', 'Quality of Work'], ['communication', 'Communication'], ['timeliness', 'On Time']].map(([key, lb]) => (
                    <div key={key} style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>{lb}</div>
                      <div style={{ display: 'flex', gap: 4 }}>{[1, 2, 3, 4, 5].map(s => <button key={s} onClick={() => setReviewForm(p => ({ ...p, [key]: s }))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 30, color: reviewForm[key] >= s ? '#C9A84C' : '#E8E4DC', padding: 0, lineHeight: 1 }}>★</button>)}</div>
                    </div>
                  ))}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>Would you recommend us?</div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => setReviewForm(p => ({ ...p, would_recommend: true }))} className={`btn ${reviewForm.would_recommend === true ? 'btn-navy' : 'btn-ghost'}`} style={{ flex: 1, fontSize: 13 }}>👍 Yes</button>
                      <button onClick={() => setReviewForm(p => ({ ...p, would_recommend: false }))} className={`btn ${reviewForm.would_recommend === false ? 'btn-navy' : 'btn-ghost'}`} style={{ flex: 1, fontSize: 13 }}>👎 No</button>
                    </div>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Anything else? <span style={{ fontWeight: 400, color: '#9CA3AF' }}>(optional)</span></div>
                    <textarea className="finp fta" rows={3} value={reviewForm.text} onChange={e => setReviewForm(p => ({ ...p, text: e.target.value }))} placeholder="Tell us about your experience..." />
                  </div>
                  <button className={`btn ${reviewForm.quality && reviewForm.communication && reviewForm.timeliness && reviewForm.would_recommend !== null ? 'btn-gold' : 'btn-ghost'}`} style={{ width: '100%' }} disabled={reviewSaving || !reviewForm.quality || !reviewForm.communication || !reviewForm.timeliness || reviewForm.would_recommend === null} onClick={async () => { setReviewSaving(true); await sbSubmitJobReview(job.id, job.tenant_id, { ...reviewForm, client_name: job.client_name, client_email: job.client_email }); setReviewDone(true); setReviewSaving(false); }}>{reviewSaving ? 'Submitting...' : 'Submit Review'}</button>
                </div>
              )
            )}

            {['complete', 'punch'].includes(job.status) && loaded.subs && jobSubs.length > 0 && <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Rate Our Team</div>
              <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 16, lineHeight: 1.6 }}>Your feedback helps us keep standards high and rewards our best crew.</div>
              {jobSubs.map(js => {
                const sub = js.sub || {};
                const r = ratings[sub.id] || { stars: 0, comment: '' };
                const done = ratingDone[sub.id];
                return (
                  <div key={js.id} style={{ borderTop: '1px solid #F3F0EB', paddingTop: 14, marginTop: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <div style={{ width: 36, height: 36, background: '#0A1F4418', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#0A1F44', flexShrink: 0 }}>{(sub.full_name || '?')[0].toUpperCase()}</div>
                      <div><div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44' }}>{sub.full_name || sub.email}</div>{js.trade && <div style={{ fontSize: 11, color: '#9CA3AF' }}>{js.trade}</div>}</div>
                    </div>
                    {done ? <div style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>✓ Review submitted — thank you!</div> : (
                      <>
                        <div style={{ display: 'flex', gap: 2, marginBottom: 10 }}>{[1, 2, 3, 4, 5].map(s => <button key={s} onClick={() => setRatings(p => ({ ...p, [sub.id]: { ...r, stars: s } }))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 26, color: r.stars >= s ? '#C9A84C' : '#E8E4DC', padding: 0, lineHeight: 1 }}>★</button>)}</div>
                        <textarea className="finp fta" rows={2} value={r.comment || ''} onChange={e => setRatings(p => ({ ...p, [sub.id]: { ...r, comment: e.target.value } }))} placeholder="Optional comment..." />
                        <button className={`btn ${r.stars ? 'btn-gold' : 'btn-ghost'}`} style={{ marginTop: 8, width: '100%' }} disabled={!r.stars || ratingSaving} onClick={() => submitRating(sub)}>{ratingSaving ? 'Saving...' : 'Submit Review'}</button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>}
          </>}

          {tab === 'invoices' && <ClientInvoicesTab job={job} />}

          {tab === 'schedule' && <ClientScheduleView jobId={job.id} />}

          {tab === 'photos' && <div>
            {!loaded.photos && <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF' }}>Loading...</div>}
            {loaded.photos && !photos.length && <div className="empty">{Ic.cam}<div className="empty-t">No photos yet</div><div>Your contractor will add progress photos here</div></div>}
            {loaded.photos && photos.length > 0 && (() => {
              // Group photos by week starting Monday
              const getWeekKey = dateStr => {
                const d = new Date(dateStr);
                const day = d.getDay(); // 0=Sun
                const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
                const mon = new Date(d.setDate(diff));
                return mon.toISOString().slice(0, 10);
              };
              const fmt = key => {
                const d = new Date(key + 'T12:00:00');
                const end = new Date(d); end.setDate(d.getDate() + 6);
                const opts = { month: 'short', day: 'numeric' };
                return `Week of ${d.toLocaleDateString('en-US', opts)}`;
              };
              const groups = {};
              photos.forEach((p, i) => {
                const key = getWeekKey(p.created_at || new Date().toISOString());
                if (!groups[key]) groups[key] = [];
                groups[key].push({ ...p, _i: i });
              });
              const sortedKeys = Object.keys(groups).sort().reverse();
              return (
                <div>
                  {sortedKeys.map(key => (
                    <div key={key} style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #E8E4DC' }}>{fmt(key)}</div>
                      <div className="pgrid">
                        {groups[key].map(p => (
                          <div key={p.id} className="pcell" onClick={() => setClbIdx(p._i)} style={{ cursor: 'pointer' }}>
                            <div style={{ position: 'absolute', inset: 0 }}>
                              <img src={p.url || p.data} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
            {clbIdx !== null && <PhotoLightbox photos={photos} startIdx={clbIdx} onClose={() => setClbIdx(null)} />}
          </div>}

          {tab === 'payments' && <div>
            {!loaded.payments && <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF' }}>Loading...</div>}
            {loaded.payments && !payments.length && <div className="empty">{Ic.doc}<div className="empty-t">No payment requests yet</div><div>Payment requests from your contractor will appear here</div></div>}
            {payments.map(p => (
              <div key={p.id} style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 16, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0A1F44', marginBottom: 3 }}>{p.description}</div>
                    <div style={{ fontSize: 12, color: '#9CA3AF' }}>{p.payment_type}{p.created_at ? ` · ${fD(p.created_at.slice(0, 10))}` : ''}{p.paid_at && <span style={{ color: '#22c55e' }}> · Paid {fD(p.paid_at.slice(0, 10))}</span>}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: '#0A1F44' }}>{f$(Number(p.amount))}</div>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: p.status === 'paid' ? '#D1FAE5' : '#FEF9EC', color: p.status === 'paid' ? '#065F46' : '#92400E', textTransform: 'uppercase' }}>{p.status}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>}

          {tab === 'msgs' && <div style={{ display: 'flex', flexDirection: 'column', minHeight: 400 }}>
            {!loaded.msgs && <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF' }}>Loading...</div>}
            {loaded.msgs && <>
              <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
                {!msgs.length && <div className="empty">{Ic.note}<div className="empty-t">No messages yet</div><div>Send your contractor a message below</div></div>}
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
              <div style={{ borderTop: '1px solid #E8E4DC', paddingTop: 12 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <textarea className="finp fta" value={msgTxt} onChange={e => setMsgTxt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }} placeholder="Message your contractor… (Enter to send)" rows={2} style={{ flex: 1, marginBottom: 0, resize: 'none' }} />
                  <button className={`btn ${msgTxt.trim() ? 'btn-navy' : 'btn-ghost'}`} style={{ padding: '10px 16px', flexShrink: 0 }} onClick={sendMsg} disabled={sendingMsg || !msgTxt.trim()}>{sendingMsg ? '...' : 'Send'}</button>
                </div>
              </div>
            </>}
          </div>}

          {tab === 'notes' && <div>
            {!loaded.notes && <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF' }}>Loading...</div>}
            {loaded.notes && <>
              {!notes.length && <div className="empty">{Ic.note}<div className="empty-t">No notes yet</div><div>Notes from your contractor will appear here</div></div>}
              {notes.map(n => (
                <div key={n.id} style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '12px 14px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#0A1F44' }}>{n.author || 'Contractor'}</span>
                    <span style={{ fontSize: 11, color: '#9CA3AF' }}>{n.created_at ? fD(n.created_at.slice(0, 10)) : ''}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{n.content}</div>
                </div>
              ))}
              <div style={{ marginTop: 16, borderTop: '1px solid #E8E4DC', paddingTop: 16 }}>
                <textarea className="finp fta" rows={3} value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Add a note..." style={{ width: '100%', marginBottom: 8, resize: 'none', boxSizing: 'border-box' }} />
                <button className="btn btn-navy" style={{ width: '100%' }} disabled={savingNote || !noteText.trim()} onClick={async () => {
                  if (!noteText.trim() || !job) return;
                  setSavingNote(true);
                  const { data } = await sb.from('job_notes').insert({ job_id: job.id, tenant_id: job.tenant_id, content: noteText.trim(), author: profile?.full_name || 'Client', created_at: new Date().toISOString() }).select().single();
                  if (data) setNotes(p => [...p, data]);
                  setNoteText(''); setSavingNote(false);
                }}>{savingNote ? 'Saving...' : 'Add Note'}</button>
              </div>
            </>}
          </div>}

          {tab === 'financials' && job?.cost_plus && <div>
            {budgetItems.length > 0 && (() => {
              const totalBudget = budgetItems.reduce((s, li) => s + Number(li.client_price ?? li.total_cost ?? 0), 0);
              return (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Estimate</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {budgetItems.map(li => (
                      <div key={li.id} style={{ background: '#fff', border: '1px solid #E8E4DC', borderRadius: 8, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44' }}>{li.description}</div>
                          {li.phase && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{li.phase}{li.trade ? ` · ${li.trade}` : ''}</div>}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#0A1F44', fontFamily: "'DM Serif Display',serif" }}>{f$(Number(li.client_price ?? li.total_cost ?? 0))}</div>
                      </div>
                    ))}
                    <div style={{ background: '#F7F5F0', border: '1px solid #E8E4DC', borderRadius: 8, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0A1F44' }}>Total Estimate</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#0A1F44', fontFamily: "'DM Serif Display',serif" }}>{f$(totalBudget)}</div>
                    </div>
                  </div>
                </div>
              );
            })()}
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Project Costs</div>
            {!costItems.filter(i => i.client_visible).length && <div className="empty">{Ic.doc}<div className="empty-t">No cost items yet</div><div>Your contractor will add cost details here</div></div>}
            {costItems.filter(i => i.client_visible).map(item => {
              const factor = 1 + Number(item.markup_pct || 0) / 100;
              const estimate = Number(item.estimate || 0);
              const clientPrice = estimate * factor;
              const itemInvs = costInvoices.filter(i => i.cost_item_id === item.id && i.paid);
              const paidToDate = itemInvs.reduce((a, i) => a + Number(i.amount || 0), 0) * factor;
              return (
                <div key={item.id} style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 16, marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#0A1F44' }}>{item.trade}</div>
                      {item.vendor && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{item.vendor}</div>}
                      {item.proposal_signed_url && (
                        <a href={item.proposal_signed_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 6, fontSize: 12, color: '#3B82F6', textDecoration: 'none', fontWeight: 600 }}>📄 View Proposal</a>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>Estimate</div>
                      <div style={{ fontSize: 13, color: '#6B7280' }}>{f$(estimate)}</div>
                      <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6, marginBottom: 2 }}>Markup</div>
                      <div style={{ fontSize: 13, color: '#6B7280' }}>{item.markup_pct || 0}%</div>
                      <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 6, marginBottom: 2 }}>Your Price</div>
                      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: '#0A1F44', fontWeight: 700 }}>{f$(clientPrice)}</div>
                      {paidToDate > 0 && <div style={{ fontSize: 12, color: '#22c55e', marginTop: 4 }}>Paid {f$(paidToDate)}</div>}
                    </div>
                  </div>
                  {itemInvs.length > 0 && (
                    <div style={{ borderTop: '1px solid #F0ECE6', paddingTop: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Paid Invoices</div>
                      {itemInvs.map(inv => (
                        <div key={inv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, color: '#374151' }}>
                          <span>{inv.date || '—'}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontWeight: 600 }}>{f$(Number(inv.amount || 0) * factor)}</span>
                            {inv.lien_waiver_signed_url && <a href={inv.lien_waiver_signed_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#3B82F6', textDecoration: 'none' }}>📎 Lien Waiver</a>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>}

        </div>

        {showSignContract && job && <ClientSignContractModal job={job} onClose={() => setShowSignContract(false)} onSigned={() => { setJobs(js => js.map(j => j.id === job.id ? { ...j, contract_signed: true, contract_signed_at: new Date().toISOString(), status: 'active' } : j)); setShowSignContract(false); }} />}
        {bannerSignJob && <ClientSignContractModal job={bannerSignJob} onClose={() => setBannerSignJob(null)} onSigned={() => { setJobs(js => js.map(j => j.id === bannerSignJob.id ? { ...j, contract_signed: true, contract_signed_at: new Date().toISOString(), status: 'active' } : j)); setBannerSignJob(null); }} />}
      </>}
    </div>
  );
}
