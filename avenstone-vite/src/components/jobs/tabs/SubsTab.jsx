import { useState, useEffect } from 'react';
import {
  sbLoadSubsTabData, sbLoadSubDirectory, sbLoadJobTransactions,
  sbLoadQuoteRequests, sbCreateQuoteRequest, sbUpdateQuoteRequest,
  sbSendBidInvite, sbUpdateBidStatus, sbAssignSub, sbResolveTodosBySource,
  sbLoadActiveTradeStrings,
} from '../../../lib/supabase';
import { Ic, f$, fD } from '../../../lib/utils';
import SubPicker from '../../sub/SubPicker';

// ── computeSubStatus ──────────────────────────────────────────────────────────
function computeSubStatus(subId, quoteRequests, transactions) {
  const awarded = quoteRequests.some(qr =>
    (qr.responses || []).some(r => r.sub_id === subId && r.status === 'awarded')
  );
  if (awarded) {
    const paid = transactions.filter(t => t.direction === 'out' && t.status === 'paid' && t.payer_or_payee_id === subId);
    const pending = transactions.filter(t => t.direction === 'out' && t.status === 'pending' && t.payer_or_payee_id === subId);
    if (paid.some(t => t.lien_waiver_required && !t.lien_waiver_url)) return 'lien_pending';
    if (paid.length > 0) return 'paid';
    if (pending.length > 0) return 'payment_pending';
    return 'awarded';
  }
  if (quoteRequests.some(qr => (qr.responses || []).some(r => r.sub_id === subId && r.status === 'submitted'))) return 'bid_submitted';
  if (quoteRequests.some(qr => (qr.invitees || []).some(i => i.sub_id === subId))) return 'invited';
  return 'assigned';
}

const STATUS_META = {
  awarded:         { label: 'Awarded',         color: '#22c55e', bg: '#052e16' },
  paid:            { label: 'Paid',            color: '#22c55e', bg: '#052e16' },
  payment_pending: { label: 'Payment Pending', color: '#f59e0b', bg: '#451a03' },
  lien_pending:    { label: 'Lien Waiver Due', color: '#ef4444', bg: '#450a0a' },
  bid_submitted:   { label: 'Bid In',          color: '#60a5fa', bg: '#1e3a5f' },
  invited:         { label: 'Invited',         color: '#c084fc', bg: '#3b0764' },
  assigned:        { label: 'Assigned',        color: '#9ca3af', bg: '#1f2937' },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.assigned;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: m.bg, color: m.color, border: `1px solid ${m.color}44` }}>
      {m.label}
    </span>
  );
}

function SubPaymentSummary({ subId, transactions }) {
  const txs = transactions.filter(t => t.payer_or_payee_id === subId && t.direction === 'out');
  if (!txs.length) return null;
  const paid = txs.filter(t => t.status === 'paid').reduce((s, t) => s + Number(t.amount || 0), 0);
  const pending = txs.filter(t => t.status === 'pending').reduce((s, t) => s + Number(t.amount || 0), 0);
  return (
    <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
      {paid > 0 && <span style={{ fontSize: 12, color: '#6b7280' }}>Paid: <span style={{ color: '#22c55e', fontWeight: 600 }}>{f$(paid)}</span></span>}
      {pending > 0 && <span style={{ fontSize: 12, color: '#6b7280' }}>Pending: <span style={{ color: '#f59e0b', fontWeight: 600 }}>{f$(pending)}</span></span>}
    </div>
  );
}

// ── ITB select styles ─────────────────────────────────────────────────────────
const ssty = { appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 32 };

// ── Main component ────────────────────────────────────────────────────────────
export default function SubsTab({ job, profile, setTab }) {
  const [jobSubs, setJobSubs] = useState([]);
  const [quoteRequests, setQuoteRequests] = useState([]);
  const [allSubs, setAllSubs] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tradeStrings, setTradeStrings] = useState([]);

  // QR state
  const [showNewQR, setShowNewQR] = useState(false);
  const [qrForm, setQrForm] = useState({ trade: '', description: '', budget_range: '', due_date: '' });
  const [qrSaving, setQrSaving] = useState(false);
  const [expandedQR, setExpandedQR] = useState(null);
  const [qrInviteEmail, setQrInviteEmail] = useState('');
  const [qrInviteName, setQrInviteName] = useState('');
  const [qrSendingTo, setQrSendingTo] = useState(null);
  const [qrErr, setQrErr] = useState('');

  // Assign from directory
  const [showPicker, setShowPicker] = useState(false);

  const reload = () => {
    setLoading(true);
    Promise.all([
      sbLoadSubsTabData(job.id),
      sbLoadSubDirectory(),
      sbLoadJobTransactions(job.id, { direction: 'out' }),
    ]).then(([d, subs, txs]) => {
      setJobSubs(d.jobSubs);
      setQuoteRequests(d.quoteRequests);
      setAllSubs(subs);
      setTransactions(txs);
      setLoading(false);
    });
  };

  useEffect(() => { reload(); }, [job.id]);
  useEffect(() => { sbLoadActiveTradeStrings().then(setTradeStrings); }, []);

  const createQR = async () => {
    if (!qrForm.trade) return;
    setQrSaving(true); setQrErr('');
    const d = await sbCreateQuoteRequest({
      job_id: job.id,
      title: `${qrForm.trade} — ${job.address}`,
      description: qrForm.description,
      trade: qrForm.trade,
      budget_range: qrForm.budget_range,
      due_date: qrForm.due_date || null,
      status: 'draft',
      kind: 'sub_bid',
    });
    if (d) {
      setQuoteRequests(p => [d, ...p]);
      setShowNewQR(false);
      setQrForm({ trade: '', description: '', budget_range: '', due_date: '' });
      setExpandedQR(d.id);
    }
    setQrSaving(false);
  };

  const sendInvite = async qr => {
    if (!qrInviteEmail.trim()) return;
    setQrSendingTo(qr.id); setQrErr('');
    const res = await sbSendBidInvite({ ...qr, _jobAddress: job.address }, qrInviteEmail.trim(), qrInviteName.trim());
    if (res.error) { setQrErr(res.error); } else {
      await sbUpdateQuoteRequest(qr.id, { status: 'sent' });
      setQuoteRequests(p => p.map(x => x.id === qr.id
        ? { ...x, status: 'sent', invitees: [...(x.invitees || []), { email: qrInviteEmail.trim(), profile: { full_name: qrInviteName.trim() } }] }
        : x));
      setQrInviteEmail(''); setQrInviteName('');
    }
    setQrSendingTo(null);
  };

  const awardBid = async (bidId, qrId, subId) => {
    await sbUpdateBidStatus(bidId, 'awarded');
    await sbUpdateQuoteRequest(qrId, { status: 'awarded' });
    await sbAssignSub(job.id, subId, job.address);
    sbResolveTodosBySource('bid_responses', bidId).catch(() => {});
    setQuoteRequests(p => p.map(qr => qr.id === qrId
      ? { ...qr, status: 'awarded', responses: (qr.responses || []).map(r => r.id === bidId ? { ...r, status: 'awarded' } : r) }
      : qr));
    reload();
  };

  const rejectBid = async (bidId, qrId) => {
    await sbUpdateBidStatus(bidId, 'rejected');
    setQuoteRequests(p => p.map(qr => qr.id === qrId
      ? { ...qr, responses: (qr.responses || []).map(r => r.id === bidId ? { ...r, status: 'rejected' } : r) }
      : qr));
  };

  const handleAssignFromDirectory = async sub => {
    setShowPicker(false);
    await sbAssignSub(job.id, sub.id, job.address);
    reload();
  };

  if (loading) return <p style={{ color: '#9ca3af', padding: 24 }}>Loading…</p>;

  const assignedIds = jobSubs.map(js => js.sub_id);

  return (
    <div style={{ padding: '0 0 80px', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Assigned Subs ── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ color: '#f9fafb', fontSize: 15, fontWeight: 700, margin: 0 }}>Assigned Subs</h3>
          <button
            onClick={() => setShowPicker(true)}
            style={{ background: '#1f2937', border: '1px solid #374151', color: '#f9fafb', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span style={{ width: 12, height: 12 }}>{Ic.plus}</span>Invite from Directory
          </button>
        </div>
        {jobSubs.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: 13 }}>No subs assigned yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {jobSubs.map(js => {
              const p = js.profile || {};
              const status = computeSubStatus(js.sub_id, quoteRequests, transactions);
              return (
                <div key={js.id} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 10, padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <p style={{ color: '#f9fafb', fontWeight: 600, fontSize: 14, margin: 0 }}>{p.full_name || '—'}</p>
                      {p.trade && <p style={{ color: '#6b7280', fontSize: 12, margin: '2px 0 0' }}>{p.trade}</p>}
                      <SubPaymentSummary subId={js.sub_id} transactions={transactions} />
                    </div>
                    <StatusBadge status={status} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Quote Requests ── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ color: '#f9fafb', fontSize: 15, fontWeight: 700, margin: 0 }}>Quote Requests</h3>
          <button
            onClick={() => setShowNewQR(true)}
            style={{ background: '#1f2937', border: '1px solid #374151', color: '#f9fafb', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span style={{ width: 12, height: 12 }}>{Ic.plus}</span>New Quote Request
          </button>
        </div>

        {quoteRequests.length === 0 && (
          <p style={{ color: '#6b7280', fontSize: 13 }}>No quote requests yet. Create one to invite subs to bid.</p>
        )}

        {quoteRequests.map(qr => {
          const isOpen = expandedQR === qr.id;
          const statusColor = { draft: '#9ca3af', sent: '#f59e0b', closed: '#6b7280', awarded: '#22c55e' }[qr.status] || '#9ca3af';
          const responses = qr.responses || [];
          const invitees = qr.invitees || [];
          return (
            <div key={qr.id} style={{ background: '#111827', border: '1px solid #1f2937', borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
              <div
                style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}
                onClick={() => setExpandedQR(isOpen ? null : qr.id)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#f9fafb' }}>{qr.trade || 'General'}</span>
                    <span style={{ fontSize: 9, background: statusColor + '22', color: statusColor, padding: '2px 8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, borderRadius: 4 }}>{qr.status}</span>
                  </div>
                  {qr.description && <div style={{ fontSize: 12, color: '#9ca3af', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{qr.description}</div>}
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                    {invitees.length} invited · {responses.length} {responses.length === 1 ? 'response' : 'responses'}
                    {qr.due_date && ` · Due ${fD(qr.due_date)}`}
                  </div>
                </div>
                <span style={{ width: 14, height: 14, color: '#6b7280', transform: isOpen ? 'rotate(180deg)' : 'none', transition: '0.15s', display: 'flex' }}>{Ic.chev}</span>
              </div>

              {isOpen && (
                <div style={{ borderTop: '1px solid #1f2937', padding: 16 }}>
                  {/* Send invite row */}
                  <div style={{ background: '#0d1117', border: '1px solid #1f2937', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Send Invite</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                      <div className="fg" style={{ marginBottom: 0 }}><label className="flbl">Name (optional)</label><input className="finp" value={qrInviteName} onChange={e => setQrInviteName(e.target.value)} placeholder="John Smith" /></div>
                      <div className="fg" style={{ marginBottom: 0 }}><label className="flbl">Email</label><input className="finp" type="email" value={qrInviteEmail} onChange={e => setQrInviteEmail(e.target.value)} placeholder="john@smithelectric.com" /></div>
                    </div>
                    {allSubs.length > 0 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>Quick pick from directory:</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {allSubs.filter(s => !invitees.find(i => i.email === s.email)).map(s => (
                            <button key={s.id} onClick={() => { setQrInviteEmail(s.email || ''); setQrInviteName(s.full_name || ''); }}
                              style={{ background: qrInviteEmail === s.email ? '#1e3a5f' : '#1f2937', color: qrInviteEmail === s.email ? '#60a5fa' : '#9ca3af', border: `1px solid ${qrInviteEmail === s.email ? '#3b82f6' : '#374151'}`, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600, borderRadius: 6 }}>
                              {s.full_name || s.email}{s.trade && ` · ${s.trade}`}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {qrErr && <div style={{ background: '#450a0a', border: '1px solid #ef4444', color: '#ef4444', padding: '6px 10px', fontSize: 12, marginBottom: 8, borderRadius: 6 }}>{qrErr}</div>}
                    <button
                      className={`btn ${qrInviteEmail.trim() ? 'btn-gold' : 'btn-ghost'}`}
                      style={{ width: '100%' }}
                      onClick={() => sendInvite(qr)}
                      disabled={qrSendingTo === qr.id || !qrInviteEmail.trim()}
                    >
                      {qrSendingTo === qr.id ? 'Sending invite...' : 'Send Bid Invite'}
                    </button>
                  </div>

                  {/* Invited list */}
                  {invitees.length > 0 && (
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Invited ({invitees.length})</div>
                      {invitees.map((inv, i) => {
                        const resp = responses.find(r => r.sub_id === inv.sub_id);
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #1f2937' }}>
                            <div style={{ width: 28, height: 28, background: '#1f2937', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#9ca3af', flexShrink: 0 }}>
                              {(inv.profile?.full_name || inv.email || '?')[0].toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#f9fafb' }}>{inv.profile?.full_name || inv.email}</div>
                              {inv.profile?.trade && <div style={{ fontSize: 11, color: '#6b7280' }}>{inv.profile.trade}</div>}
                            </div>
                            {resp
                              ? <span style={{ fontSize: 10, background: resp.status === 'awarded' ? '#052e16' : resp.status === 'rejected' ? '#450a0a' : '#451a03', color: resp.status === 'awarded' ? '#22c55e' : resp.status === 'rejected' ? '#ef4444' : '#f59e0b', padding: '2px 8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, borderRadius: 4 }}>{resp.status === 'submitted' ? 'Bid in' : resp.status}</span>
                              : <span style={{ fontSize: 10, color: '#6b7280', fontStyle: 'italic' }}>Awaiting</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Responses */}
                  {responses.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Bids Received ({responses.length})</div>
                      {responses.map(r => {
                        const inv = invitees.find(i => i.sub_id === r.sub_id);
                        return (
                          <div key={r.id} style={{ background: '#0d1117', border: `1px solid #1f2937`, borderLeft: `3px solid ${r.status === 'awarded' ? '#22c55e' : r.status === 'rejected' ? '#ef4444' : '#f59e0b'}`, borderRadius: 8, padding: 14, marginBottom: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#f9fafb' }}>{inv?.profile?.full_name || r.sub_id}</div>
                                {inv?.profile?.trade && <div style={{ fontSize: 11, color: '#6b7280' }}>{inv.profile.trade}</div>}
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                {r.amount && <div style={{ fontSize: 18, fontWeight: 700, color: '#f9fafb' }}>{f$(r.amount)}</div>}
                                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: r.status === 'awarded' ? '#22c55e' : r.status === 'rejected' ? '#ef4444' : '#f59e0b' }}>{r.status}</div>
                              </div>
                            </div>
                            {r.notes && <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.6, marginBottom: 8 }}>{r.notes}</div>}
                            {r.quote_file_url && (
                              <a href={r.quote_file_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#60a5fa', border: '1px solid #1f2937', padding: '5px 10px', textDecoration: 'none', marginBottom: 8, borderRadius: 6, background: '#111827' }}>
                                <span style={{ width: 12, height: 12, display: 'flex' }}>{Ic.dl}</span>{r.quote_file_name || 'Download Quote'}
                              </a>
                            )}
                            {r.status === 'submitted' && (
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn" style={{ flex: 1, background: '#052e16', border: '1px solid #22c55e44', color: '#22c55e', fontSize: 11, fontWeight: 600 }} onClick={() => awardBid(r.id, qr.id, r.sub_id)}>✓ Award This Sub</button>
                                <button className="btn" style={{ flex: 1, background: '#450a0a', border: '1px solid #ef444444', color: '#ef4444', fontSize: 11, fontWeight: 600 }} onClick={() => rejectBid(r.id, qr.id)}>✕ Reject</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* ── New Quote Request modal ── */}
      {showNewQR && (
        <div className="overlay" onClick={() => setShowNewQR(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">New Quote Request</div>
            <div className="fg">
              <label className="flbl"><span className="freq">*</span>Trade</label>
              <select className="finp" value={qrForm.trade} onChange={e => setQrForm(p => ({ ...p, trade: e.target.value }))} style={ssty}>
                <option value="">Select trade...</option>
                {tradeStrings.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="fg"><label className="flbl">Scope Description</label><textarea className="finp fta" value={qrForm.description} onChange={e => setQrForm(p => ({ ...p, description: e.target.value }))} placeholder="Describe the work scope, specs, requirements..." rows={3} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="fg" style={{ marginBottom: 0 }}><label className="flbl">Budget Range</label><input className="finp" value={qrForm.budget_range} onChange={e => setQrForm(p => ({ ...p, budget_range: e.target.value }))} placeholder="e.g. $8,000–$12,000" /></div>
              <div className="fg" style={{ marginBottom: 0 }}><label className="flbl">Bid Due Date</label><input className="finp" type="date" value={qrForm.due_date} onChange={e => setQrForm(p => ({ ...p, due_date: e.target.value }))} /></div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowNewQR(false)}>Cancel</button>
              <button className={`btn ${qrForm.trade ? 'btn-gold' : 'btn-ghost'}`} style={{ flex: 1 }} onClick={createQR} disabled={qrSaving || !qrForm.trade}>{qrSaving ? 'Creating...' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Invite from directory modal ── */}
      {showPicker && (
        <div className="overlay" onClick={() => setShowPicker(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Invite from Directory</div>
            <SubPicker
              subs={allSubs}
              exclude={assignedIds}
              onSelect={handleAssignFromDirectory}
              emptyMsg="All subs already assigned to this job"
            />
          </div>
        </div>
      )}
    </div>
  );
}
