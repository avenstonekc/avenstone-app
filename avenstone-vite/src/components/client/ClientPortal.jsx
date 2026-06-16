import { useState, useEffect, useRef } from 'react';
// Note: legacy `payments` compat view is deprecated. ClientPortal reads invoices + job_transactions directly.
// Compat view still alive in DB until verified no consumers remain. — Phase 6a, 2026-05-06
import { sb, AV_USER_ID, AV_TENANT, sbLoadPhases, sbLoadMessages, sbPostMessage, sbNotify, sbNotifyEmail, sbLoadCostItems, sbLoadCostInvoices, sbLoadEstimateLineItems, sbLoadInvoicesForJob, sbLoadJobTotalPaid, deriveInvoiceStatus, sbRegenerateInvoicePaymentUrl, sbLoadClientUpdates, sbLoadClientMilestones, sbLoadClientDrawBreakdown, sbLoadClientActualSpend } from '../../lib/supabase';
import { Ic, sc, sl, f$, fD, fDT, phSc, phSl, isMob } from '../../lib/utils';
import PhotoLightbox from '../shared/PhotoLightbox';
import ClientSignContractModal from '../modals/ClientSignContractModal';
import ClientInvoicesTab from './ClientInvoicesTab';

const NAV    = 'var(--navy-900)';
const GOLD   = 'var(--gold-500)';
const CREAM  = 'var(--bg)';
const BORDER = 'var(--border)';

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

// MS_STATUS_COLOR uses raw hex — values are concatenated with '18' for badge backgrounds
const MS_STATUS_COLOR = { completed: '#22c55e', in_progress: '#22c55e', upcoming: '#0A1F44', delayed: '#EF4444', unscheduled: '#9CA3AF' };
const MS_STATUS_LABEL = { completed: '✓ Done', in_progress: 'In Progress', upcoming: 'Upcoming', delayed: 'Delayed', unscheduled: 'Unscheduled' };

function clientFacingStatus(item) {
  if (item.actual_finish_date) return 'completed';
  if (!item.scheduled_date) return 'unscheduled';
  const today = new Date().toISOString().slice(0, 10);
  if (item.scheduled_date > today) return 'upcoming';
  const slipDays = Math.floor((new Date(today) - new Date(item.scheduled_date)) / (1000 * 60 * 60 * 24));
  return slipDays <= 5 ? 'in_progress' : 'delayed';
}

function ClientScheduleView({ jobId }) {
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadMilestones() {
    if (!jobId) return;
    const result = await sbLoadClientMilestones(jobId);
    if (result?.ok) setMilestones(result.data || []);
    setLoading(false);
  }

  useEffect(() => { loadMilestones(); }, [jobId]);

  useEffect(() => {
    if (!jobId) return;
    const ch = sb.channel(`schedule-milestones-${jobId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_items', filter: `job_id=eq.${jobId}` }, () => { loadMilestones(); })
      .subscribe();
    return () => sb.removeChannel(ch);
  }, [jobId]);

  if (loading) return <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-subtle)', fontSize: 13 }}>Loading schedule...</div>;
  if (!milestones.length) return <div className="empty">{Ic.sched}<div className="empty-t">No milestones set</div><div>Your contractor will add project milestones here</div></div>;

  const total = milestones.length;
  const done = milestones.filter(m => m.computed_status === 'completed' || m.computed_status === 'completed_late').length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div style={{ background: 'var(--card-bg)', border: `1px solid ${BORDER}`, padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 1 }}>Overall Progress</div>
          <div style={{ fontSize: 12, color: NAV, fontWeight: 700 }}>{pct}% complete</div>
        </div>
        <div style={{ background: BORDER, height: 8, borderRadius: 4 }}>
          <div style={{ background: 'var(--green-dot)', height: 8, borderRadius: 4, width: `${pct}%`, transition: 'width 0.4s' }} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 6 }}>{done} of {total} milestones complete</div>
      </div>
      {milestones.map(m => {
        const cfs = clientFacingStatus(m);
        const color = MS_STATUS_COLOR[cfs];
        const label = MS_STATUS_LABEL[cfs];
        const daysRemaining = m.scheduled_date && m.scheduled_date > today
          ? Math.ceil((new Date(m.scheduled_date) - new Date(today)) / (1000 * 60 * 60 * 24))
          : null;
        const daysLate = cfs === 'delayed' && m.scheduled_date
          ? Math.floor((new Date(today) - new Date(m.scheduled_date)) / (1000 * 60 * 60 * 24))
          : null;
        return (
          <div key={m.id} style={{ background: 'var(--card-bg)', border: `1px solid ${BORDER}`, borderLeft: `3px solid ${color}`, marginBottom: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: NAV, marginBottom: 2 }}>
                {m.title}
                {m.trade && <span style={{ fontSize: 11, color: 'var(--text-subtle)', fontWeight: 400, marginLeft: 6 }}>{m.trade}</span>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>
                {cfs === 'completed' && m.actual_finish_date && <span>Completed {fD(m.actual_finish_date)}</span>}
                {cfs === 'in_progress' && m.scheduled_date && <span>Scheduled {fD(m.scheduled_date)} · On track</span>}
                {cfs === 'upcoming' && m.scheduled_date && (
                  <span>{fD(m.scheduled_date)}{daysRemaining != null ? ` · ${daysRemaining}d away` : ''}</span>
                )}
                {cfs === 'delayed' && m.scheduled_date && (
                  <span style={{ color: 'var(--red-text)' }}>Was {fD(m.scheduled_date)}{daysLate != null ? ` · ${daysLate}d late` : ''}</span>
                )}
                {cfs === 'unscheduled' && <span>Date TBD</span>}
              </div>
            </div>
            <span style={{ fontSize: 9, background: color + '18', color, padding: '3px 8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

const JOB_STAGES = [
  { label: 'Lead',          statuses: ['lead'] },
  { label: 'Proposal',      statuses: ['proposal'] },
  { label: 'Contract',      statuses: ['contract'] },
  { label: 'In Progress',   statuses: ['in_progress'] },
  { label: 'Final Touches', statuses: ['final_touches'] },
  { label: 'Complete',      statuses: ['complete'] },
];

function ProgressStepper({ status }) {
  const curIdx = JOB_STAGES.findIndex(s => s.statuses.includes(status));
  return (
    <div style={{ background: 'var(--card-bg)', border: `1px solid ${BORDER}`, padding: '16px 20px', marginBottom: 16, overflowX: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', minWidth: 320 }}>
        {JOB_STAGES.map((s, i) => {
          const done = i < curIdx;
          const active = i === curIdx;
          return (
            <div key={s.label} style={{ display: 'flex', alignItems: 'flex-start', flex: i < JOB_STAGES.length - 1 ? 1 : 'none' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  background: done ? 'var(--green-dot)' : active ? NAV : 'var(--bg-alt)',
                  border: active ? `2.5px solid ${GOLD}` : 'none',
                  color: done || active ? '#fff' : 'var(--text-subtle)',
                  fontSize: done ? 12 : 11, fontWeight: 700,
                  boxShadow: active ? '0 0 0 4px rgba(201,168,76,0.18)' : 'none',
                  transition: 'all 0.3s ease',
                }}>
                  {done ? '✓' : i + 1}
                </div>
                <div style={{ fontSize: 9, fontWeight: active ? 700 : 500, color: active ? NAV : done ? 'var(--green-dot)' : 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap', textAlign: 'center' }}>{s.label}</div>
              </div>
              {i < JOB_STAGES.length - 1 && (
                <div style={{ flex: 1, height: 2, background: done ? 'var(--green-dot)' : BORDER, marginTop: 13, transition: 'background 0.4s ease' }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const DRAW_STATUS_STYLE = {
  paid:           { text: 'Paid ✓',        color: 'var(--green-dot)',      bg: 'var(--green-bg-soft)' },
  partially_paid: { text: 'Partially Paid', color: 'var(--amber-partial)',               bg: 'var(--amber-bg)' },
  sent:           { text: 'Invoice Sent',   color: 'var(--amber-partial)',               bg: 'var(--amber-bg)' },
  viewed:         { text: 'Invoice Sent',   color: 'var(--amber-partial)',               bg: 'var(--amber-bg)' },
  overdue:        { text: 'Overdue',        color: 'var(--red-text-strong)', bg: 'var(--red-bg)' },
};

function DrawCard({ draw, lineItems, invoice }) {
  const [expanded, setExpanded] = useState(true);
  const baseSum    = lineItems.reduce((s, l) => s + Number(l.base_amount   || 0), 0);
  const markupSum  = lineItems.reduce((s, l) => s + Number(l.markup_amount || 0), 0);
  const drawTotal  = baseSum + markupSum;
  const invoiced   = Number(invoice?.total_amount || 0);
  const creditApplied = drawTotal - invoiced;
  const style = DRAW_STATUS_STYLE[invoice?.status] || { text: invoice?.status || '—', color: 'var(--text-subtle)', bg: CREAM };

  return (
    <div style={{ background: 'var(--card-bg)', border: `1px solid ${BORDER}`, marginBottom: 16 }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', borderBottom: expanded ? `1px solid ${BORDER}` : 'none' }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: NAV, marginBottom: 3 }}>
            {draw.title || `Draw ${draw.draw_number}`}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>
            {lineItems.length} line item{lineItems.length !== 1 ? 's' : ''} · Draw total {f$(drawTotal)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 10, background: style.bg, color: style.color, padding: '3px 10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{style.text}</span>
          <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '0 16px 16px' }}>
          <div style={{ marginTop: 14, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid var(--bg-alt)` }}>
                  <th style={{ textAlign: 'left', padding: '6px 8px 6px 0', color: 'var(--text-subtle)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Description</th>
                  <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--text-subtle)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>Cost</th>
                  <th style={{ textAlign: 'right', padding: '6px 0', color: 'var(--text-subtle)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Markup</th>
                  <th style={{ textAlign: 'right', padding: '6px 0 6px 8px', color: 'var(--text-subtle)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map(li => (
                  <tr key={li.id} style={{ borderBottom: `1px solid ${CREAM}` }}>
                    <td style={{ padding: '8px 8px 8px 0', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      {li.description}
                      {li.is_forward_looking && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>(pre-bill)</span>}
                    </td>
                    <td style={{ padding: '8px 0', textAlign: 'right', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{f$(Number(li.base_amount))}</td>
                    <td style={{ padding: '8px 0', textAlign: 'right', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{Number(li.markup_pct).toFixed(0)}%</td>
                    <td style={{ padding: '8px 0 8px 8px', textAlign: 'right', color: NAV, fontWeight: 600, whiteSpace: 'nowrap' }}>{f$(Number(li.total_with_markup))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ borderTop: `2px solid ${BORDER}`, marginTop: 10, paddingTop: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
                <span>Subtotal (costs)</span><span>{f$(baseSum)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
                <span>Markup</span><span>{f$(markupSum)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: NAV, borderTop: `1px solid var(--bg-alt)`, paddingTop: 6, marginTop: 3 }}>
                <span>Draw Total</span><span style={{ fontFamily: "'DM Serif Display',serif" }}>{f$(drawTotal)}</span>
              </div>
              {creditApplied > 0.01 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--green-text)' }}>
                  <span>Credit Applied (deposit)</span><span>−{f$(creditApplied)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: NAV, borderTop: `1px solid var(--bg-alt)`, paddingTop: 6, marginTop: 3 }}>
                <span>Amount Invoiced</span><span style={{ fontFamily: "'DM Serif Display',serif" }}>{f$(invoiced)}</span>
              </div>
              {invoice?.paid_at && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--green-dot)', fontWeight: 600 }}>
                  <span>Paid</span><span>{fD(invoice.paid_at.slice(0, 10))}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const BASE_CLIENT_TABS = [
  { id: 'overview',  lb: 'Overview',  ic: 'info' },
  { id: 'updates',   lb: 'Updates',   ic: 'bell' },
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
  const [totalPaid, setTotalPaid] = useState(0);
  const [payingNext, setPayingNext] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [jobSubs, setJobSubs] = useState([]);
  const [loaded, setLoaded] = useState({ phases: false, photos: false, docs: false, payments: false, msgs: false, subs: false, notes: false, updates: false, spend: false });
  const [updates, setUpdates] = useState([]);
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
  const [drawBreakdown, setDrawBreakdown] = useState(null);
  const [drawBreakdownLoading, setDrawBreakdownLoading] = useState(false);
  const [actualSpend, setActualSpend] = useState(null);
  const [actualSpendLoading, setActualSpendLoading] = useState(false);
  const [staffOwnerId, setStaffOwnerId] = useState(null);
  const [jobReview, setJobReview] = useState(null);
  const [reviewForm, setReviewForm] = useState({ quality: 0, communication: 0, timeliness: 0, would_recommend: null, text: '' });
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewDone, setReviewDone] = useState(false);
  const msgsEndRef = useRef();

  useEffect(() => {
    if (!profile?.id) return;
    sb.from('jobs').select('*').or(`client_user_id.eq.${profile.id},client_email.eq.${profile.email}`).eq('tenant_id', AV_TENANT).then(({ data }) => { setJobs(data || []); setLoading(false); });
  }, [profile?.id]);

  const job = sel ? jobs.find(j => j.id === sel) : null;

  useEffect(() => {
    if (!job) return;
    if (!loaded.phases) { sbLoadPhases(job.id).then(d => { setPhases(d); setLoaded(p => ({ ...p, phases: true })); }); }
    if (!loaded.subs) { sb.from('job_sub_engagements').select('id,trade,sub:profiles!sub_id(id,full_name,email)').eq('job_id', job.id).eq('status', 'active').order('activated_at', { ascending: true }).then(({ data }) => { setJobSubs(data || []); setLoaded(p => ({ ...p, subs: true })); }); }
    if (!staffOwnerId) { sb.from('profiles').select('id').eq('tenant_id', AV_TENANT).eq('role', 'owner').limit(1).single().then(({ data }) => { if (data?.id) setStaffOwnerId(data.id); }); }
  }, [job?.id]);

  useEffect(() => {
    if (!job || (tab !== 'photos' && tab !== 'updates') || loaded.updates) return;
    sbLoadClientUpdates(job.id).then(d => {
      setUpdates(d);
      const allPhotos = d.flatMap(u => u.photos || []);
      setPhotos(allPhotos);
      setLoaded(p => ({ ...p, updates: true, photos: true }));
    });
  }, [job?.id, tab]);

  useEffect(() => {
    if (!job || tab !== 'docs' || loaded.docs) return;
    // Migrated to job_files (slice 6/12). Note: 'docs' tab is not in BASE_CLIENT_TABS; this
    // effect is currently dead code but kept for forward-compatibility if the tab returns.
    sb.from('job_files').select('*').eq('job_id', job.id).eq('storage_bucket', 'job-documents').eq('client_visible', true).eq('lifecycle_status', 'active').order('created_at', { ascending: false }).then(({ data }) => {
      const _sub = { Plans:'plan', Permits:'permit', Contracts:'contract', Inspections:'inspection', Specs:'spec' };
      setDocs((data || []).map(jf => ({ ...jf, file_url: jf.storage_path, file_type: _sub[jf.subcategory] || 'other' })));
      setLoaded(p => ({ ...p, docs: true }));
    });
  }, [job?.id, tab]);

  useEffect(() => {
    if (!job || tab !== 'overview' || loaded.payments) return;
    Promise.all([
      sbLoadInvoicesForJob(job.id),
      sbLoadJobTotalPaid(job.id),
    ]).then(([invs, paid]) => {
      setPayments(invs);
      setTotalPaid(paid);
      setLoaded(p => ({ ...p, payments: true }));
    }).catch(e => { console.error('ClientPortal overview load error:', e); setLoaded(p => ({ ...p, payments: true })); });
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
    // Legacy helpers kept for backward compat fallback (jobs with no draws)
    Promise.all([sbLoadCostItems(job.id), sbLoadCostInvoices(job.id), sbLoadEstimateLineItems(job.id)])
      .then(([its, invs, budget]) => { setCostItems(its); setCostInvoices(invs); setBudgetItems(budget); });
    // New draw breakdown (Phase 6)
    setDrawBreakdownLoading(true);
    sbLoadClientDrawBreakdown(job.id).then(result => {
      setDrawBreakdown(result.ok ? result.data : []);
      setDrawBreakdownLoading(false);
    });
  }, [job?.id, tab]);

  // Actual-spend helper — fires on overview OR financials tab for cost_plus jobs (once per job open)
  useEffect(() => {
    if (!job || !job.cost_plus) return;
    if (tab !== 'overview' && tab !== 'financials') return;
    if (loaded.spend) return;
    setActualSpendLoading(true);
    sbLoadClientActualSpend(sb, job.id, AV_TENANT).then(result => {
      setActualSpend(result.ok ? result.data : null);
      setActualSpendLoading(false);
      setLoaded(p => ({ ...p, spend: true }));
    });
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
    const ch = sb.channel(`client-phases-${job.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'job_phases', filter: `job_id=eq.${job.id}` }, () => {
        sbLoadPhases(job.id).then(d => setPhases(d));
      })
      .subscribe();
    return () => sb.removeChannel(ch);
  }, [job?.id]);

  const openJob = id => {
    setSel(id); setTab('overview');
    setLoaded({ phases: false, photos: false, docs: false, payments: false, msgs: false, subs: false, notes: false, updates: false, spend: false });
    setPhases([]); setPhotos([]); setDocs([]); setPayments([]); setMsgs([]); setJobSubs([]);
    setTotalPaid(0); setPayingNext(false);
    setRatings({}); setRatingDone({}); setJobReview(null); setCostItems([]); setCostInvoices([]); setDrawBreakdown(null); setActualSpend(null); setNotes([]); setNoteText('');
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

  if (loading) return <div style={{ minHeight: '100dvh', background: NAV, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: 3, textTransform: 'uppercase' }}>Loading</div></div>;
  if (!jobs.length) return <div style={{ minHeight: '100dvh', background: CREAM, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 24, textAlign: 'center' }}><div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: NAV }}>No projects found</div><div style={{ fontSize: 14, color: 'var(--text-subtle)', maxWidth: 320, lineHeight: 1.7 }}>Your contractor hasn't linked your account to a project yet.</div><button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={signOut}>Sign Out</button></div>;

  return (
    <div style={{ minHeight: '100dvh', background: CREAM }}>
      <div style={{ background: NAV, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, color: GOLD, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 2 }}>Avenstone Group</div>
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
        <div key={j.id} style={{ background: NAV, padding: '14px 20px', display: 'flex', flexDirection: isMob() ? 'column' : 'row', alignItems: isMob() ? 'flex-start' : 'center', justifyContent: 'space-between', gap: 12, borderBottom: `1px solid var(--gold-200)` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 3 }}>Your contract is ready to sign</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.address}</div>
          </div>
          <button style={{ background: GOLD, color: NAV, border: 'none', padding: '10px 20px', fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0, borderRadius: 4, letterSpacing: 0.3 }} onClick={() => setBannerSignJob(j)}>
            Review &amp; Sign
          </button>
        </div>
      ))}

      {!job && <div style={{ padding: 16 }}>
        {jobs.map(j => (
          <div key={j.id} onClick={() => openJob(j.id)} style={{ background: 'var(--card-bg)', border: `1px solid ${BORDER}`, borderLeft: `4px solid ${sc(j.status)}`, padding: 16, marginBottom: 10, cursor: 'pointer' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: NAV, marginBottom: 6 }}>{j.address}</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, background: sc(j.status) + '18', color: sc(j.status), padding: '3px 10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{sl(j.status)}</span>
              {j.target_completion && <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>Target: {j.target_completion}</span>}
              {Number(j.contract_value || 0) > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: NAV }}>{f$(Number(j.contract_value || 0))}</span>}
            </div>
          </div>
        ))}
      </div>}

      {job && <>
        {!job.contract_signed && <div style={{ background: 'var(--cream-banner)', borderBottom: `2px solid ${GOLD}`, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--amber-text-strong)', fontWeight: 600 }}>Your contract is ready to sign</div>
          <button className="btn btn-gold" style={{ fontSize: 12, padding: '7px 16px', flexShrink: 0 }} onClick={() => setShowSignContract(true)}>Sign Now</button>
        </div>}
        {job.contract_signed && <div style={{ background: 'var(--green-bg-soft)', borderBottom: '1px solid #BBF7D0', padding: '8px 16px', fontSize: 12, color: '#16a34a', fontWeight: 600 }}>✓ Contract signed{job.contract_signed_at ? ` ${fD(job.contract_signed_at.slice(0, 10))}` : ''}</div>}

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
                <div style={{ background: NAV, padding: '24px 20px', marginBottom: 16, borderRadius: 2 }}>
                  <div style={{ fontSize: 9, color: GOLD, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 8 }}>Project Status</div>
                  <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 28, color: '#fff', lineHeight: 1.2, marginBottom: 6 }}>{CLIENT_STATUS(job.status)}</div>
                  {job.address && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginBottom: 2 }}>{job.address}</div>}
                  {job.client_name && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 20 }}>{job.client_name}</div>}
                  {loaded.phases && total > 0 && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>
                        <span>{done} of {total} phases complete</span>
                        <span style={{ fontWeight: 700, color: pct === 100 ? 'var(--green-dot)' : GOLD }}>{pct}%</span>
                      </div>
                      <div style={{ background: 'rgba(255,255,255,0.12)', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ background: pct === 100 ? 'var(--green-dot)' : GOLD, height: 8, borderRadius: 4, width: `${pct}%`, transition: 'width 0.6s ease' }} />
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
              const next = inProgress || phases.find(p => p.status === 'not_started');
              const allDone = phases.every(p => p.status === 'complete');
              return (
                <div style={{ background: 'var(--card-bg)', border: `1px solid ${BORDER}`, borderLeft: `4px solid ${GOLD}`, padding: 20, marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: GOLD, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>What's Happening Next</div>
                  {allDone ? (
                    <div style={{ textAlign: 'center', padding: '12px 0' }}>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>🎉</div>
                      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: NAV, marginBottom: 4 }}>Your project is complete!</div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>All phases have been finished. Thank you for choosing us.</div>
                    </div>
                  ) : next ? (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        {inProgress && <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--green-dot)', display: 'inline-block', flexShrink: 0, animation: 'pulse 1.8s ease-in-out infinite', boxShadow: '0 0 0 0 rgba(34,197,94,0.4)' }} />}
                        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: NAV }}>{next.phase_name}</div>
                        {inProgress && <span style={{ fontSize: 10, background: 'var(--green-bg)', color: 'var(--green-text-strong)', padding: '2px 8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0 }}>In Progress</span>}
                      </div>
                      {(next.start_date || next.end_date) && (
                        <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
                          {next.start_date && <span>Starts: <strong style={{ color: 'var(--text-secondary)' }}>{fD(next.start_date)}</strong></span>}
                          {next.start_date && next.end_date && <span style={{ margin: '0 8px', color: BORDER }}>·</span>}
                          {next.end_date && <span>Est. end: <strong style={{ color: 'var(--text-secondary)' }}>{fD(next.end_date)}</strong></span>}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Schedule not set yet — your contractor will update this soon.</div>
                  )}
                </div>
              );
            })()}

            {/* C) Next Payment Card */}
            {loaded.payments && (() => {
              const unpaid = (payments || [])
                .filter(inv => ['sent', 'viewed', 'partially_paid', 'overdue'].includes(inv.status))
                .sort((a, b) => {
                  if (!a.due_date) return 1;
                  if (!b.due_date) return -1;
                  return a.due_date.localeCompare(b.due_date);
                });
              const next = unpaid[0] ?? null;
              if (!next) return null;
              const balance = Number(next.total_amount) - Number(next.amount_paid);
              const isOverdue = deriveInvoiceStatus(next) === 'overdue';
              return (
                <div style={{ background: 'var(--card-bg)', border: `1px solid ${BORDER}`, padding: 20, marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>Your Next Payment</div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 26, color: NAV, marginBottom: 4 }}>{f$(balance)}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>{next.invoice_number}</div>
                      {next.due_date && (
                        <div style={{ fontSize: 12, color: isOverdue ? 'var(--red-text-strong)' : 'var(--text-subtle)', fontWeight: isOverdue ? 700 : 400 }}>
                          {isOverdue ? '⚠ Overdue — ' : 'Due: '}<strong>{fD(next.due_date)}</strong>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignSelf: 'center', flexWrap: 'wrap' }}>
                      {next.pdf_url && (
                        <button onClick={() => window.open(next.pdf_url, '_blank', 'noopener,noreferrer')} className="btn btn-ghost" style={{ fontSize: 12, padding: '8px 14px' }}>View Invoice</button>
                      )}
                      <button
                        disabled={payingNext}
                        onClick={async () => {
                          try {
                            setPayingNext(true);
                            const url = await sbRegenerateInvoicePaymentUrl(next.id);
                            window.open(url, '_blank', 'noopener,noreferrer');
                          } catch (e) {
                            alert(`Could not generate payment link: ${e.message}`);
                          } finally {
                            setPayingNext(false);
                          }
                        }}
                        style={{ background: NAV, color: GOLD, padding: '10px 18px', fontWeight: 700, fontSize: 13, border: 'none', cursor: payingNext ? 'default' : 'pointer', flexShrink: 0, opacity: payingNext ? 0.7 : 1 }}
                      >
                        {payingNext ? 'Loading...' : 'Pay Now →'}
                      </button>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-subtle)', borderTop: `1px solid var(--bg-alt)`, paddingTop: 10 }}>Contact your contractor with payment questions.</div>
                </div>
              );
            })()}

            {/* D) Quick Stats Row — cost_plus reads from the same helper as Financials tab */}
            {(() => {
              if (job.cost_plus && actualSpend) {
                const s = actualSpend;
                const contractLabel = s.original_signed_contract != null ? 'Original Contract' : 'Authorized Contract';
                const contractVal = s.original_signed_contract != null ? s.original_signed_contract : s.authorized_contract;
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: BORDER, marginBottom: 16 }}>
                    {[
                      { lb: contractLabel, val: f$(contractVal) },
                      { lb: 'Paid to Date', val: f$(s.paid_to_date), green: s.paid_to_date > 0 },
                      { lb: 'Remaining Balance', val: f$(Math.max(0, s.remaining_balance)) },
                    ].map(({ lb, val, green }) => (
                      <div key={lb} style={{ background: 'var(--card-bg)', padding: '14px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>{lb}</div>
                        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16, color: green ? 'var(--green-dot)' : NAV, fontWeight: 700 }}>{val}</div>
                      </div>
                    ))}
                  </div>
                );
              }
              if (!Number(job.contract_value || 0)) return null;
              const contractTotal = Number(job.contract_value || 0) + Number(job.co_total || 0);
              const paid = loaded.payments ? totalPaid : 0;
              const remaining = contractTotal - paid;
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: BORDER, marginBottom: 16 }}>
                  {[
                    { lb: 'Contract Value', val: f$(contractTotal) },
                    { lb: 'Paid to Date', val: f$(paid), green: paid > 0 },
                    { lb: 'Remaining', val: f$(Math.max(0, remaining)) },
                  ].map(({ lb, val, green }) => (
                    <div key={lb} style={{ background: 'var(--card-bg)', padding: '14px 12px', textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>{lb}</div>
                      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16, color: green ? 'var(--green-dot)' : NAV, fontWeight: 700 }}>{val}</div>
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
                <div style={{ background: 'var(--card-bg)', border: `1px solid ${BORDER}`, padding: 20, marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>What to Expect</div>
                  {upcoming.map((ph, i) => (
                    <div key={ph.id} style={{ display: 'flex', gap: 14, marginBottom: i < upcoming.length - 1 ? 18 : 0, paddingBottom: i < upcoming.length - 1 ? 18 : 0, borderBottom: i < upcoming.length - 1 ? `1px solid var(--bg-alt)` : 'none' }}>
                      <div style={{ width: 32, height: 32, background: ph.status === 'in_progress' ? 'var(--green-bg)' : 'var(--bg-alt)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, color: ph.status === 'in_progress' ? 'var(--green-text-strong)' : 'var(--text-subtle)', fontWeight: 700, marginTop: 2 }}>{i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: NAV, marginBottom: 4 }}>{ph.phase_name}</div>
                        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: ph.start_date || ph.end_date ? 6 : 0 }}>{ph.desc}</div>
                        {(ph.start_date || ph.end_date) && (
                          <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>
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

            {['complete', 'final_touches'].includes(job.status) && jobReview !== null && (jobReview ?
              <div style={{ background: 'var(--green-bg-soft)', border: '1px solid #BBF7D0', padding: 20, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 36, height: 36, background: 'var(--green-dot)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, flexShrink: 0 }}>✓</div>
                  <div><div style={{ fontSize: 14, fontWeight: 700, color: 'var(--green-text-strong)' }}>Thanks for your review!</div><div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Your feedback helps us improve.</div></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
                  {[['Quality', jobReview.rating_quality], ['Communication', jobReview.rating_communication], ['Timeliness', jobReview.rating_timeliness]].map(([lb, v]) => (
                    <div key={lb} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 3 }}>{lb}</div>
                      <div style={{ fontSize: 16 }}>{[1, 2, 3, 4, 5].map(s => <span key={s} style={{ color: v >= s ? GOLD : BORDER }}>★</span>)}</div>
                    </div>
                  ))}
                </div>
                {jobReview.review_text && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)', fontStyle: 'italic', borderTop: '1px solid #BBF7D0', paddingTop: 12 }}>"{jobReview.review_text}"</div>}
              </div>
              : (reviewDone ?
                <div style={{ background: 'var(--green-bg-soft)', border: '1px solid #BBF7D0', padding: 20, marginBottom: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>🙏</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--green-text-strong)', marginBottom: 4 }}>Thank you!</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Your review means a lot to our team.</div>
                </div>
                : <div style={{ background: 'var(--card-bg)', border: `1px solid ${BORDER}`, padding: 20, marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>How Did We Do?</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.6 }}>Your project is complete — we'd love your honest feedback.</div>
                  {[['quality', 'Quality of Work'], ['communication', 'Communication'], ['timeliness', 'On Time']].map(([key, lb]) => (
                    <div key={key} style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>{lb}</div>
                      <div style={{ display: 'flex', gap: 4 }}>{[1, 2, 3, 4, 5].map(s => <button key={s} onClick={() => setReviewForm(p => ({ ...p, [key]: s }))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 30, color: reviewForm[key] >= s ? GOLD : BORDER, padding: 0, lineHeight: 1 }}>★</button>)}</div>
                    </div>
                  ))}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Would you recommend us?</div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => setReviewForm(p => ({ ...p, would_recommend: true }))} className={`btn ${reviewForm.would_recommend === true ? 'btn-navy' : 'btn-ghost'}`} style={{ flex: 1, fontSize: 13 }}>👍 Yes</button>
                      <button onClick={() => setReviewForm(p => ({ ...p, would_recommend: false }))} className={`btn ${reviewForm.would_recommend === false ? 'btn-navy' : 'btn-ghost'}`} style={{ flex: 1, fontSize: 13 }}>👎 No</button>
                    </div>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Anything else? <span style={{ fontWeight: 400, color: 'var(--text-subtle)' }}>(optional)</span></div>
                    <textarea className="finp fta" rows={3} value={reviewForm.text} onChange={e => setReviewForm(p => ({ ...p, text: e.target.value }))} placeholder="Tell us about your experience..." />
                  </div>
                  <button className={`btn ${reviewForm.quality && reviewForm.communication && reviewForm.timeliness && reviewForm.would_recommend !== null ? 'btn-gold' : 'btn-ghost'}`} style={{ width: '100%' }} disabled={reviewSaving || !reviewForm.quality || !reviewForm.communication || !reviewForm.timeliness || reviewForm.would_recommend === null} onClick={async () => { setReviewSaving(true); await sbSubmitJobReview(job.id, job.tenant_id, { ...reviewForm, client_name: job.client_name, client_email: job.client_email }); setReviewDone(true); setReviewSaving(false); }}>{reviewSaving ? 'Submitting...' : 'Submit Review'}</button>
                </div>
              )
            )}

            {['complete', 'final_touches'].includes(job.status) && loaded.subs && jobSubs.length > 0 && <div style={{ background: 'var(--card-bg)', border: `1px solid ${BORDER}`, padding: 20, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Rate Our Team</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>Your feedback helps us keep standards high and rewards our best crew.</div>
              {jobSubs.map(js => {
                const sub = js.sub || {};
                const r = ratings[sub.id] || { stars: 0, comment: '' };
                const done = ratingDone[sub.id];
                return (
                  <div key={js.id} style={{ borderTop: `1px solid var(--bg-alt)`, paddingTop: 14, marginTop: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <div style={{ width: 36, height: 36, background: 'var(--navy-100)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: NAV, flexShrink: 0 }}>{(sub.full_name || '?')[0].toUpperCase()}</div>
                      <div><div style={{ fontSize: 13, fontWeight: 600, color: NAV }}>{sub.full_name || sub.email}</div>{js.trade && <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{js.trade}</div>}</div>
                    </div>
                    {done ? <div style={{ fontSize: 12, color: 'var(--green-dot)', fontWeight: 600 }}>✓ Review submitted — thank you!</div> : (
                      <>
                        <div style={{ display: 'flex', gap: 2, marginBottom: 10 }}>{[1, 2, 3, 4, 5].map(s => <button key={s} onClick={() => setRatings(p => ({ ...p, [sub.id]: { ...r, stars: s } }))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 26, color: r.stars >= s ? GOLD : BORDER, padding: 0, lineHeight: 1 }}>★</button>)}</div>
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

          {tab === 'updates' && <div>
            {!loaded.updates && <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-subtle)' }}>Loading...</div>}
            {loaded.updates && !updates.length && <div className="empty">{Ic.bell}<div className="empty-t">No updates yet</div><div>Your contractor will send project updates here</div></div>}
            {loaded.updates && updates.map(u => (
              <div key={u.id} style={{ background: 'var(--card-bg)', border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>{fD(u.log_date)}</div>
                <div style={{ fontSize: 14, color: '#1F2937', lineHeight: 1.7, marginBottom: u.photos.length ? 12 : 0 }}>{u.client_message}</div>
                {u.photos.length > 0 && (
                  <div className="pgrid">
                    {u.photos.map(p => (
                      <div key={p.id} className="pcell" style={{ cursor: 'pointer' }} onClick={() => { setClbIdx(photos.findIndex(ph => ph.id === p.id)); }}>
                        <div style={{ position: 'absolute', inset: 0 }}>
                          {p.type === 'video' ? <video src={p.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {clbIdx !== null && <PhotoLightbox photos={photos} startIdx={clbIdx} onClose={() => setClbIdx(null)} />}
          </div>}

          {tab === 'photos' && <div>
            {!loaded.photos && <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-subtle)' }}>Loading...</div>}
            {loaded.photos && !photos.length && <div className="empty">{Ic.cam}<div className="empty-t">No photos yet</div><div>Project photos will appear here as updates are sent</div></div>}
            {loaded.photos && photos.length > 0 && (() => {
              const getWeekKey = dateStr => {
                const d = new Date(dateStr);
                const day = d.getDay();
                const diff = d.getDate() - day + (day === 0 ? -6 : 1);
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
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${BORDER}` }}>{fmt(key)}</div>
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

          {tab === 'msgs' && <div style={{ display: 'flex', flexDirection: 'column', minHeight: 400 }}>
            {!loaded.msgs && <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-subtle)' }}>Loading...</div>}
            {loaded.msgs && <>
              <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }}>
                {!msgs.length && <div className="empty">{Ic.note}<div className="empty-t">No messages yet</div><div>Send your contractor a message below</div></div>}
                {msgs.map(m => {
                  const mine = m.sender_id === AV_USER_ID;
                  const nm = m.sender?.full_name || 'Contractor';
                  return (
                    <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-subtle)', fontWeight: 600 }}>{mine ? 'You' : nm}</span>
                        <span style={{ fontSize: 10, color: 'var(--border-strong)' }}>{fDT(m.created_at)}</span>
                      </div>
                      <div style={{ maxWidth: '80%', background: mine ? NAV : 'var(--card-bg)', color: mine ? '#fff' : 'var(--text-secondary)', padding: '10px 14px', borderRadius: mine ? '12px 12px 2px 12px' : '12px 12px 12px 2px', fontSize: 13, lineHeight: 1.55, border: mine ? 'none' : `1px solid ${BORDER}` }}>{m.content}</div>
                    </div>
                  );
                })}
                <div ref={msgsEndRef} />
              </div>
              <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12, paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <textarea className="finp fta" value={msgTxt} onChange={e => setMsgTxt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } }} placeholder="Message your contractor… (Enter to send)" rows={2} style={{ flex: 1, marginBottom: 0, resize: 'none' }} />
                  <button className={`btn ${msgTxt.trim() ? 'btn-navy' : 'btn-ghost'}`} style={{ padding: '10px 16px', flexShrink: 0 }} onClick={sendMsg} disabled={sendingMsg || !msgTxt.trim()}>{sendingMsg ? '...' : 'Send'}</button>
                </div>
              </div>
            </>}
          </div>}

          {tab === 'notes' && <div>
            {!loaded.notes && <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-subtle)' }}>Loading...</div>}
            {loaded.notes && <>
              {!notes.length && <div className="empty">{Ic.note}<div className="empty-t">No notes yet</div><div>Notes from your contractor will appear here</div></div>}
              {notes.map(n => (
                <div key={n.id} style={{ background: 'var(--card-bg)', border: `1px solid ${BORDER}`, padding: '12px 14px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: NAV }}>{n.author || 'Contractor'}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{n.created_at ? fD(n.created_at.slice(0, 10)) : ''}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{n.content}</div>
                </div>
              ))}
              <div style={{ marginTop: 16, borderTop: `1px solid ${BORDER}`, paddingTop: 16 }}>
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
            {/* ── Actual-spend ledger (cost-plus) ── */}
            {actualSpendLoading && (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-subtle)', fontSize: 13 }}>Loading financials...</div>
            )}
            {!actualSpendLoading && actualSpend && (() => {
              const s = actualSpend;
              const markupEqual = s.labor_markup_pct === s.material_markup_pct;
              const markupLabel = markupEqual
                ? `+${s.labor_markup_pct}%`
                : `labor +${s.labor_markup_pct}% / materials +${s.material_markup_pct}%`;
              const TYPE_LABEL = {
                material_purchase: 'Materials',
                material: 'Materials',
                supply: 'Materials',
                sub_payout: 'Labor',
                labor: 'Labor',
                subcontractor: 'Labor',
                equipment: 'Equipment',
                permit: 'Permit',
                other: 'Other',
              };
              const hasOriginal = s.original_signed_contract !== null;
              const headlineCards = [
                ...(hasOriginal ? [{ lb: 'Original Contract', val: f$(s.original_signed_contract) }] : []),
                { lb: 'Authorized Contract', val: f$(s.authorized_contract), caption: hasOriginal ? 'incl. approved change orders' : null },
                { lb: 'Paid to Date', val: f$(s.paid_to_date) },
                { lb: 'Current Projected Total', val: f$(s.firm_projected_total), gold: true },
              ];
              return (
                <div style={{ marginBottom: 24 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${headlineCards.length},1fr)`, gap: 1, background: BORDER, marginBottom: 16 }}>
                    {headlineCards.map(({ lb, val, gold, caption }) => (
                      <div key={lb} style={{ background: 'var(--card-bg)', padding: '14px 12px', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>{lb}</div>
                        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 15, color: gold ? GOLD : NAV, fontWeight: 700 }}>{val}</div>
                        {caption && <div style={{ fontSize: 9, color: 'var(--text-subtle)', marginTop: 3 }}>{caption}</div>}
                      </div>
                    ))}
                  </div>

                  {s.potential_additional > 0 && (
                    <div style={{ background: 'var(--amber-bg-soft)', border: '1px solid #FDE68A', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 12 }}>
                      <div style={{ fontWeight: 700, color: 'var(--amber-text-strong)', marginBottom: 4 }}>Potential Additional Work</div>
                      <div style={{ color: 'var(--amber-text-deep)', lineHeight: 1.5 }}>
                        {f$(s.potential_additional)} in submitted invoices is pending approval and not yet included in the projected total above. This amount may be added once reviewed.
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: CREAM, borderRadius: 8, marginBottom: 20, fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>Remaining Balance</span>
                    <span style={{ fontWeight: 700, color: NAV, fontFamily: "'DM Serif Display',serif" }}>{f$(Math.max(0, s.remaining_balance))}</span>
                  </div>

                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>What We've Spent</div>
                  {!s.transactions.length && (
                    <div className="empty">{Ic.doc}<div className="empty-t">No expenses recorded yet</div><div>Paid expenses will appear here as work progresses</div></div>
                  )}
                  {s.transactions.length > 0 && (
                    <div style={{ background: 'var(--card-bg)', border: `1px solid ${BORDER}`, marginBottom: 16 }}>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr style={{ borderBottom: `1px solid var(--bg-alt)` }}>
                              <th style={{ textAlign: 'left', padding: '10px 12px 10px 16px', color: 'var(--text-subtle)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>Date</th>
                              <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-subtle)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Payee</th>
                              <th style={{ textAlign: 'left', padding: '10px 12px', color: 'var(--text-subtle)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Category</th>
                              <th style={{ textAlign: 'right', padding: '10px 16px 10px 12px', color: 'var(--text-subtle)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.transactions.map((t, i) => (
                              <tr key={i} style={{ borderBottom: `1px solid ${CREAM}` }}>
                                <td style={{ padding: '9px 12px 9px 16px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t.date ? fD(t.date) : '—'}</td>
                                <td style={{ padding: '9px 12px', color: 'var(--text-secondary)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.payee}</td>
                                <td style={{ padding: '9px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{TYPE_LABEL[t.category] || t.category || '—'}</td>
                                <td style={{ padding: '9px 16px 9px 12px', textAlign: 'right', color: NAV, fontWeight: 600, whiteSpace: 'nowrap' }}>{f$(t.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div style={{ borderTop: `2px solid ${BORDER}`, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
                          <span>Subtotal (cost)</span><span>{f$(s.cost_subtotal)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
                          <span>Markup ({markupLabel})</span><span>+{f$(s.markup_amount)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700, color: NAV, borderTop: `1px solid var(--bg-alt)`, paddingTop: 8, marginTop: 2 }}>
                          <span>Total</span><span style={{ fontFamily: "'DM Serif Display',serif" }}>{f$(s.marked_up_total)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
            {/* ── New draw breakdown (Phase 6) ── */}
            {drawBreakdownLoading && (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-subtle)', fontSize: 13 }}>Loading draws...</div>
            )}

            {!drawBreakdownLoading && drawBreakdown && drawBreakdown.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Draw History</div>
                {drawBreakdown.map(({ draw, lineItems: dli, invoice }) => (
                  <DrawCard key={draw.id} draw={draw} lineItems={dli} invoice={invoice} />
                ))}
              </>
            )}

            {/* ── Legacy fallback (jobs with no draws — predates the arc) ── */}
            {!drawBreakdownLoading && drawBreakdown !== null && drawBreakdown.length === 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Project Costs</div>
                {!costItems.filter(i => i.client_visible).length && <div className="empty">{Ic.doc}<div className="empty-t">No cost items yet</div><div>Your contractor will add cost details here</div></div>}
                {costItems.filter(i => i.client_visible).map(item => {
                  const factor = 1 + Number(item.markup_pct || 0) / 100;
                  const estimate = Number(item.estimate || 0);
                  const clientPrice = estimate * factor;
                  const itemInvs = costInvoices.filter(i => i.cost_item_id === item.id && i.paid);
                  const paidToDate = itemInvs.reduce((a, i) => a + Number(i.amount || 0), 0) * factor;
                  return (
                    <div key={item.id} style={{ background: 'var(--card-bg)', border: `1px solid ${BORDER}`, padding: 16, marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: NAV }}>{item.trade}</div>
                          {item.vendor && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{item.vendor}</div>}
                          {item.proposal_signed_url && (
                            <a href={item.proposal_signed_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 6, fontSize: 12, color: 'var(--blue-link)', textDecoration: 'none', fontWeight: 600 }}>📄 View Proposal</a>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 4 }}>Estimate</div>
                          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{f$(estimate)}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 6, marginBottom: 2 }}>Markup</div>
                          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{item.markup_pct || 0}%</div>
                          <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 6, marginBottom: 2 }}>Your Price</div>
                          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: NAV, fontWeight: 700 }}>{f$(clientPrice)}</div>
                          {paidToDate > 0 && <div style={{ fontSize: 12, color: 'var(--green-dot)', marginTop: 4 }}>Paid {f$(paidToDate)}</div>}
                        </div>
                      </div>
                      {itemInvs.length > 0 && (
                        <div style={{ borderTop: '1px solid #F0ECE6', paddingTop: 10 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Paid Invoices</div>
                          {itemInvs.map(inv => (
                            <div key={inv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                              <span>{inv.date || '—'}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontWeight: 600 }}>{f$(Number(inv.amount || 0) * factor)}</span>
                                {inv.lien_waiver_signed_url && <a href={inv.lien_waiver_signed_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--blue-link)', textDecoration: 'none' }}>📎 Lien Waiver</a>}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>}

        </div>

        {showSignContract && job && <ClientSignContractModal job={job} onClose={() => setShowSignContract(false)} onSigned={() => { setJobs(js => js.map(j => j.id === job.id ? { ...j, contract_signed: true, contract_signed_at: new Date().toISOString(), status: 'in_progress' } : j)); setShowSignContract(false); }} />}
        {bannerSignJob && <ClientSignContractModal job={bannerSignJob} onClose={() => setBannerSignJob(null)} onSigned={() => { setJobs(js => js.map(j => j.id === bannerSignJob.id ? { ...j, contract_signed: true, contract_signed_at: new Date().toISOString(), status: 'in_progress' } : j)); setBannerSignJob(null); }} />}
      </>}
    </div>
  );
}
