import { useState, useEffect } from 'react';
import { sbLoadSubsTabData, sbLoadSubDirectory, sbLoadJobTransactions } from '../../../lib/supabase';
import { f$ } from '../../../lib/utils';

function computeSubStatus(subId, quoteRequests, transactions) {
  const awarded = quoteRequests.some(qr =>
    (qr.responses || []).some(r => r.sub_id === subId && r.status === 'awarded')
  );
  if (awarded) {
    const paid = transactions.filter(t => t.direction === 'out' && t.status === 'paid' && t.payer_or_payee_id === subId);
    const pending = transactions.filter(t => t.direction === 'out' && t.status === 'pending' && t.payer_or_payee_id === subId);
    const lienMissing = paid.some(t => t.lien_waiver_required && !t.lien_waiver_url);
    if (lienMissing) return 'lien_pending';
    if (paid.length > 0) return 'paid';
    if (pending.length > 0) return 'payment_pending';
    return 'awarded';
  }
  const hasBid = quoteRequests.some(qr =>
    (qr.responses || []).some(r => r.sub_id === subId && r.status === 'submitted')
  );
  if (hasBid) return 'bid_submitted';
  const invited = quoteRequests.some(qr =>
    (qr.invitees || []).some(i => i.sub_id === subId)
  );
  if (invited) return 'invited';
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

export default function SubsTab({ job, profile, setTab }) {
  const [jobSubs, setJobSubs] = useState([]);
  const [quoteRequests, setQuoteRequests] = useState([]);
  const [allSubs, setAllSubs] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <p style={{ color: '#9ca3af', padding: 24 }}>Loading…</p>;

  return (
    <div style={{ padding: '0 0 80px', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Assigned Subs ── */}
      <section>
        <h3 style={{ color: '#f9fafb', fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Assigned Subs</h3>
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

      {/* placeholder for ITB/quote section — Commits 6+7 will fill this */}
      <section>
        <h3 style={{ color: '#f9fafb', fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Quote Requests</h3>
        {quoteRequests.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: 13 }}>No quote requests yet.</p>
        ) : (
          <p style={{ color: '#9ca3af', fontSize: 13 }}>{quoteRequests.length} quote request(s) — full UI in next build step.</p>
        )}
      </section>

    </div>
  );
}
