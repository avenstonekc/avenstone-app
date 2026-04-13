import { useState, useEffect, useRef } from 'react';
import { sb, AV_USER_ID, AV_TENANT, sbLoadPhases, sbLoadMessages, sbPostMessage, sbNotify } from '../../lib/supabase';
import { Ic, sc, sl, f$, fD, fDT, phSc, phSl } from '../../lib/utils';
import PhotoLightbox from '../shared/PhotoLightbox';
import ClientSignContractModal from '../modals/ClientSignContractModal';

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

const CLIENT_TABS = [
  { id: 'overview', lb: 'Overview', ic: 'info' },
  { id: 'schedule', lb: 'Schedule', ic: 'sched' },
  { id: 'photos', lb: 'Photos', ic: 'cam' },
  { id: 'docs', lb: 'Documents', ic: 'folder' },
  { id: 'payments', lb: 'Payments', ic: 'doc' },
  { id: 'msgs', lb: 'Messages', ic: 'note' },
  { id: 'request', lb: 'Change Request', ic: 'warn' },
];

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
  const [loaded, setLoaded] = useState({ phases: false, photos: false, docs: false, payments: false, msgs: false, subs: false });
  const [msgTxt, setMsgTxt] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [showSignContract, setShowSignContract] = useState(false);
  const [crForm, setCrForm] = useState({ description: '', reason: '' });
  const [crSaving, setCrSaving] = useState(false);
  const [crDone, setCrDone] = useState(false);
  const [ratings, setRatings] = useState({});
  const [ratingSaving, setRatingSaving] = useState(false);
  const [ratingDone, setRatingDone] = useState({});
  const [clbIdx, setClbIdx] = useState(null);
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
    if (!loaded.subs) { sb.from('job_subs').select('*,profile:profiles(id,full_name,email,trade)').eq('job_id', job.id).then(({ data }) => { setJobSubs(data || []); setLoaded(p => ({ ...p, subs: true })); }); }
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
    if (!job || tab !== 'payments' || loaded.payments) return;
    sb.from('payments').select('*').eq('job_id', job.id).order('created_at', { ascending: false }).then(({ data }) => { setPayments(data || []); setLoaded(p => ({ ...p, payments: true })); });
  }, [job?.id, tab]);

  useEffect(() => {
    if (!job || tab !== 'msgs' || loaded.msgs) return;
    sbLoadMessages(job.id).then(d => { setMsgs(d); setLoaded(p => ({ ...p, msgs: true })); });
  }, [job?.id, tab]);

  useEffect(() => { if (msgs.length && msgsEndRef.current) msgsEndRef.current.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const openJob = id => {
    setSel(id); setTab('overview');
    setLoaded({ phases: false, photos: false, docs: false, payments: false, msgs: false, subs: false });
    setPhases([]); setPhotos([]); setDocs([]); setPayments([]); setMsgs([]); setJobSubs([]);
    setRatings({}); setRatingDone({}); setJobReview(null);
    setReviewForm({ quality: 0, communication: 0, timeliness: 0, would_recommend: null, text: '' }); setReviewDone(false);
    sbLoadJobReview(id).then(r => setJobReview(r || false));
  };

  const sendMsg = async () => {
    if (!msgTxt.trim() || !job) return; setSendingMsg(true);
    const m = await sbPostMessage(job.id, msgTxt.trim());
    if (m) { setMsgs(p => [...p, m]); sbNotify('job_message', `Client message on ${job.address}`, msgTxt.trim().slice(0, 120), job.id, AV_USER_ID); setMsgTxt(''); }
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
          {CLIENT_TABS.map(t => <button key={t.id} className={`tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)} style={{ whiteSpace: 'nowrap' }}><span style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Ic[t.ic] || Ic.info}</span>{t.lb}</button>)}
        </div>

        <div style={{ padding: 16, maxWidth: 720, margin: '0 auto' }}>
          {tab === 'overview' && <>
            <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Project Details</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 13 }}>
                {job.address && <div style={{ gridColumn: '1/-1', marginBottom: 4 }}><div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 2 }}>Address</div><div style={{ fontWeight: 600, color: '#0A1F44' }}>{job.address}</div></div>}
                {job.client_name && <div><div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 2 }}>Client</div><div style={{ color: '#374151' }}>{job.client_name}</div></div>}
                {job.client_phone && <div><div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 2 }}>Phone</div><div style={{ color: '#374151' }}>{job.client_phone}</div></div>}
                {job.assigned_rep && <div><div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 2 }}>Your Rep</div><div style={{ color: '#374151' }}>{job.assigned_rep}</div></div>}
                {job.target_completion && <div><div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 2 }}>Target Completion</div><div style={{ color: '#374151' }}>{job.target_completion}</div></div>}
              </div>
            </div>
            <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 20, marginBottom: 16 }}>
              <div style={{ marginBottom: loaded.phases && phases.length ? 16 : 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Current Status</div>
                <span style={{ fontSize: 13, background: sc(job.status) + '18', color: sc(job.status), padding: '4px 14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{CLIENT_STATUS(job.status)}</span>
              </div>
              {loaded.phases && phases.length > 0 && (() => {
                const done = phases.filter(p => p.status === 'complete').length;
                const pct = Math.round((done / phases.length) * 100);
                const current = phases.find(p => p.status === 'in_progress') || phases.find(p => p.status === 'pending');
                return (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9CA3AF', marginBottom: 5 }}>
                      <span>{current ? `Currently: ${current.phase_name}` : `${done} of ${phases.length} phases done`}</span>
                      <span style={{ fontWeight: 700, color: pct === 100 ? '#22c55e' : '#0A1F44' }}>{pct}%</span>
                    </div>
                    <div style={{ background: '#F3F0EB', height: 10, borderRadius: 5 }}><div style={{ background: pct === 100 ? '#22c55e' : '#C9A84C', height: 10, borderRadius: 5, width: `${pct}%`, transition: 'width 0.4s' }} /></div>
                  </div>
                );
              })()}
            </div>

            {Number(job.contract_value || 0) > 0 && <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Your Investment</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 12 }}>
                <div><div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 3 }}>Contract Value</div><div style={{ fontSize: 17, fontWeight: 700, color: '#0A1F44', fontFamily: "'DM Serif Display',serif" }}>{f$(Number(job.contract_value || 0))}</div></div>
                {Number(job.co_total || 0) > 0 && <div><div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 3 }}>Approved Changes</div><div style={{ fontSize: 17, fontWeight: 700, color: '#f59e0b', fontFamily: "'DM Serif Display',serif" }}>+{f$(Number(job.co_total || 0))}</div></div>}
                <div><div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 3 }}>Total</div><div style={{ fontSize: 17, fontWeight: 700, color: '#0A1F44', fontFamily: "'DM Serif Display',serif" }}>{f$(Number(job.contract_value || 0) + Number(job.co_total || 0))}</div></div>
              </div>
            </div>}

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
                const sub = js.profile || {};
                const r = ratings[sub.id] || { stars: 0, comment: '' };
                const done = ratingDone[sub.id];
                return (
                  <div key={js.id} style={{ borderTop: '1px solid #F3F0EB', paddingTop: 14, marginTop: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <div style={{ width: 36, height: 36, background: '#0A1F4418', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#0A1F44', flexShrink: 0 }}>{(sub.full_name || '?')[0].toUpperCase()}</div>
                      <div><div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44' }}>{sub.full_name || sub.email}</div>{sub.trade && <div style={{ fontSize: 11, color: '#9CA3AF' }}>{sub.trade}</div>}</div>
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

          {tab === 'schedule' && <ClientScheduleView jobId={job.id} />}

          {tab === 'photos' && <div>
            {!loaded.photos && <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF' }}>Loading...</div>}
            {loaded.photos && !photos.length && <div className="empty">{Ic.cam}<div className="empty-t">No photos yet</div><div>Your contractor will upload progress photos here</div></div>}
            <div className="pgrid">{photos.map((p, i) => <div key={p.id} className="pcell" onClick={() => setClbIdx(i)} style={{ cursor: 'pointer' }}><div style={{ position: 'absolute', inset: 0 }}><img src={p.url || p.data} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div></div>)}</div>
            {clbIdx !== null && <PhotoLightbox photos={photos} startIdx={clbIdx} onClose={() => setClbIdx(null)} />}
          </div>}

          {tab === 'docs' && <div>
            {!loaded.docs && <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF' }}>Loading...</div>}
            {loaded.docs && !docs.length && <div className="empty">{Ic.folder}<div className="empty-t">No documents yet</div><div>Signed contracts and shared documents will appear here</div></div>}
            {docs.map(d => (
              <div key={d.id} style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '12px 16px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, background: '#0A1F4412', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><span style={{ width: 18, height: 18, color: '#0A1F44' }}>{Ic.doc}</span></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{d.file_type}{d.created_at ? ` · ${fD(d.created_at.slice(0, 10))}` : ''}</div>
                </div>
                {d.file_url && <a href={d.file_url} target="_blank" rel="noreferrer" style={{ color: '#C9A84C', fontWeight: 600, fontSize: 12, textDecoration: 'none', flexShrink: 0 }}>View →</a>}
              </div>
            ))}
          </div>}

          {tab === 'payments' && <div>
            {!loaded.payments && <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF' }}>Loading...</div>}
            {loaded.payments && !payments.length && <div className="empty">{Ic.doc}<div className="empty-t">No payment requests yet</div><div>Payment requests from your contractor will appear here</div></div>}
            {payments.map(p => (
              <div key={p.id} style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 16, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: p.status === 'pending' && p.stripe_checkout_url ? 12 : 0 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0A1F44', marginBottom: 3 }}>{p.description}</div>
                    <div style={{ fontSize: 12, color: '#9CA3AF' }}>{p.payment_type}{p.created_at ? ` · ${fD(p.created_at.slice(0, 10))}` : ''}{p.paid_at && <span style={{ color: '#22c55e' }}> · Paid {fD(p.paid_at.slice(0, 10))}</span>}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: '#0A1F44' }}>{f$(Number(p.amount))}</div>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: p.status === 'paid' ? '#D1FAE5' : '#FEF9EC', color: p.status === 'paid' ? '#065F46' : '#92400E', textTransform: 'uppercase' }}>{p.status}</span>
                  </div>
                </div>
                {p.status === 'pending' && (p.stripe_checkout_url
                  ? <a href={p.stripe_checkout_url} target="_blank" rel="noreferrer" style={{ display: 'block', background: '#0A1F44', color: '#C9A84C', padding: 12, textAlign: 'center', fontWeight: 700, fontSize: 14, textDecoration: 'none', borderRadius: 4 }}>Pay Now →</a>
                  : <div style={{ background: '#F7F5F0', border: '1px solid #E8E4DC', padding: '10px 14px', fontSize: 12, color: '#6B7280', textAlign: 'center' }}>Payment link sent to your email — check your inbox to pay securely.</div>
                )}
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

          {tab === 'request' && <div style={{ maxWidth: 500 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Request a Change</div>
            <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 16, lineHeight: 1.6 }}>Submit a change request and your contractor will review it. Approved requests become official change orders.</div>
            {crDone ? <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#16a34a', padding: '14px 16px', borderRadius: 4, fontSize: 14, fontWeight: 600, textAlign: 'center', marginBottom: 12 }}>
              ✓ Submitted! Your contractor will review it shortly.
              <div style={{ marginTop: 10 }}><button className="btn btn-ghost" style={{ width: '100%' }} onClick={() => { setCrDone(false); setCrForm({ description: '', reason: '' }); }}>Submit Another</button></div>
            </div> : <>
              <div className="fg"><label className="flbl"><span className="freq">*</span>What change are you requesting?</label><textarea className="finp fta" rows={3} value={crForm.description} onChange={e => setCrForm(p => ({ ...p, description: e.target.value }))} placeholder="e.g. Add a walk-in closet to master bedroom, upgrade countertops to quartz..." /></div>
              <div className="fg"><label className="flbl">Why / Additional context</label><textarea className="finp fta" rows={2} value={crForm.reason} onChange={e => setCrForm(p => ({ ...p, reason: e.target.value }))} placeholder="Any details that would help your contractor understand..." /></div>
              <button className="btn btn-navy" style={{ width: '100%' }} disabled={crSaving || !crForm.description.trim()} onClick={async () => {
                if (!crForm.description.trim() || !job) return;
                setCrSaving(true);
                const num = `CR-${Date.now().toString().slice(-4)}`;
                const co = { id: Date.now().toString(), job_id: job.id, co_number: num, description: crForm.description.trim(), reason: crForm.reason.trim() || 'Client-requested change', amount: 0, status: 'pending', created_at: new Date().toISOString() };
                await sb.from('change_orders').insert({ ...co, tenant_id: AV_TENANT });
                sbNotify('co_submitted', `Client change request on ${job.address}`, crForm.description.trim().slice(0, 120), job.id, AV_USER_ID);
                setCrSaving(false); setCrDone(true);
              }}>{crSaving ? 'Submitting...' : 'Submit Change Request'}</button>
            </>}
          </div>}
        </div>

        {showSignContract && job && <ClientSignContractModal job={job} onClose={() => setShowSignContract(false)} onSigned={() => { setJobs(js => js.map(j => j.id === job.id ? { ...j, contract_signed: true, contract_signed_at: new Date().toISOString(), status: 'active' } : j)); setShowSignContract(false); }} />}
      </>}
    </div>
  );
}
