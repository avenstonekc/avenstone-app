import { useState, useEffect } from 'react';
import { AV_USER_ID, AV_TENANT, sbLoadPayments, sbCreatePaymentLink } from '../../../lib/supabase';
import { Ic, f$, fD } from '../../../lib/utils';

export default function PaymentsTab({ job }) {
  const [payments, setPayments] = useState([]);
  const [paymentsLoaded, setPaymentsLoaded] = useState(false);
  const [showPayForm, setShowPayForm] = useState(false);
  const [payForm, setPayForm] = useState({ description: '', amount: '', payment_type: 'deposit', client_email: job.client_email || '', client_name: job.client_name || '' });
  const [paySending, setPaySending] = useState(false);
  const [payErr, setPayErr] = useState('');

  const ssty = { appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 32 };

  useEffect(() => {
    if (paymentsLoaded) return;
    sbLoadPayments(job.id).then(d => { setPayments(d); setPaymentsLoaded(true); });
  }, [paymentsLoaded]);

  const sendPaymentRequest = async () => {
    if (!payForm.description.trim() || !payForm.amount || !payForm.client_email.trim()) return;
    setPaySending(true); setPayErr('');
    const r = await sbCreatePaymentLink({ job_id: job.id, tenant_id: AV_TENANT, amount: payForm.amount, description: payForm.description.trim(), payment_type: payForm.payment_type, client_email: payForm.client_email.trim(), client_name: payForm.client_name.trim(), job_address: job.address, created_by: AV_USER_ID });
    if (r.payment) {
      setPayments(p => [r.payment, ...p]);
      setShowPayForm(false);
      setPayForm({ description: '', amount: '', payment_type: 'deposit', client_email: job.client_email || '', client_name: job.client_name || '' });
    } else {
      setPayErr(r.error || 'Failed to send payment request');
    }
    setPaySending(false);
  };

  const contractVal = Number(job.contract_value || 0);
  const coTotal = Number(job.co_total || 0);
  const totalContracted = contractVal + coTotal;
  const collected = payments.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0);
  const pending = payments.filter(p => p.status === 'pending').reduce((s, p) => s + Number(p.amount), 0);
  const balance = Math.max(totalContracted - collected, 0);
  const pct = totalContracted > 0 ? Math.min(Math.round((collected / totalContracted) * 100), 100) : 0;

  return (
    <div>
      <div style={{ background: '#fff', border: '1px solid #E8E4DC', borderRadius: 6, padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Financial Summary</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(130px,1fr))', gap: 12, marginBottom: 16 }}>
          {[
            { lb: 'Contract', val: f$(contractVal), c: '#0A1F44' },
            { lb: 'Change Orders', val: coTotal > 0 ? '+' + f$(coTotal) : f$(0), c: coTotal > 0 ? '#f59e0b' : '#9CA3AF' },
            { lb: 'Total Contracted', val: f$(totalContracted), c: '#0A1F44', bold: true },
            { lb: 'Collected', val: f$(collected), c: '#22c55e', bold: true },
            { lb: 'Pending Requests', val: f$(pending), c: pending > 0 ? '#f59e0b' : '#9CA3AF' },
            { lb: 'Balance Due', val: f$(balance), c: balance > 0 ? '#ef4444' : '#22c55e', bold: true },
          ].map(({ lb, val, c, bold }) => (
            <div key={lb}>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 3 }}>{lb}</div>
              <div style={{ fontSize: 16, fontWeight: bold ? 700 : 500, color: c, fontFamily: bold ? "'DM Serif Display',serif" : 'inherit' }}>{val}</div>
            </div>
          ))}
        </div>
        {totalContracted > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#9CA3AF', marginBottom: 4 }}>
              <span>Collection progress</span><span style={{ color: pct === 100 ? '#22c55e' : '#0A1F44', fontWeight: 600 }}>{pct}% collected</span>
            </div>
            <div style={{ background: '#F3F0EB', height: 8, borderRadius: 4 }}>
              <div style={{ background: pct === 100 ? '#22c55e' : '#C9A84C', height: 8, borderRadius: 4, width: `${pct}%`, transition: 'width 0.4s' }} />
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 }}>Payment Requests</div>
        <button className="btn btn-navy" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => { setPayForm({ description: '', amount: '', payment_type: 'deposit', client_email: job.client_email || '', client_name: job.client_name || '' }); setPayErr(''); setShowPayForm(true); }}><span style={{ width: 14, height: 14 }}>{Ic.plus}</span>Request Payment</button>
      </div>
      {!paymentsLoaded && <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF', fontSize: 13 }}>Loading...</div>}
      {paymentsLoaded && !payments.length && <div className="empty">{Ic.doc}<div className="empty-t">No payments yet</div><div>Send a payment request to the client</div></div>}
      {payments.map(p => (
        <div key={p.id} style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 16, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#0A1F44' }}>{p.description}</span>
              <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 12, background: p.status === 'paid' ? '#D1FAE5' : '#FEF9EC', color: p.status === 'paid' ? '#065F46' : '#92400E', textTransform: 'uppercase', letterSpacing: 0.5 }}>{p.status}</span>
            </div>
            <div style={{ fontSize: 12, color: '#9CA3AF' }}>{p.client_email}{p.payment_type && ` · ${p.payment_type}`}{p.created_at && ` · ${fD(p.created_at.slice(0, 10))}`}</div>
            {p.paid_at && <div style={{ fontSize: 12, color: '#22c55e', marginTop: 2 }}>Paid {fD(p.paid_at.slice(0, 10))}</div>}
          </div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: '#0A1F44', flexShrink: 0 }}>{f$(Number(p.amount))}</div>
        </div>
      ))}

      {showPayForm && <div className="overlay" onClick={() => setShowPayForm(false)}><div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">Request Payment</div>
        {payErr && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', padding: '10px 12px', fontSize: 13, marginBottom: 12, borderRadius: 4 }}>{payErr}</div>}
        <div className="fg"><label className="flbl"><span className="freq">*</span>Description</label><input className="finp" value={payForm.description} onChange={e => setPayForm(p => ({ ...p, description: e.target.value }))} placeholder="e.g. Deposit — Kitchen Remodel" /></div>
        <div className="fg"><label className="flbl"><span className="freq">*</span>Amount ($)</label><input className="finp" type="number" step="0.01" value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} placeholder="e.g. 5000" /></div>
        <div className="fg"><label className="flbl">Payment Type</label>
          <select className="finp" value={payForm.payment_type} onChange={e => setPayForm(p => ({ ...p, payment_type: e.target.value }))} style={ssty}>
            <option value="deposit">Deposit</option>
            <option value="progress">Progress Payment</option>
            <option value="final">Final Payment</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div className="fg"><label className="flbl"><span className="freq">*</span>Client Email</label><input className="finp" type="email" value={payForm.client_email} onChange={e => setPayForm(p => ({ ...p, client_email: e.target.value }))} placeholder="client@email.com" /></div>
        <div className="fg"><label className="flbl">Client Name</label><input className="finp" value={payForm.client_name} onChange={e => setPayForm(p => ({ ...p, client_name: e.target.value }))} placeholder="Full name (optional)" /></div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowPayForm(false)}>Cancel</button>
          <button className={`btn ${payForm.description.trim() && payForm.amount && payForm.client_email.trim() ? 'btn-gold' : 'btn-ghost'}`} style={{ flex: 1 }} onClick={sendPaymentRequest} disabled={paySending || !payForm.description.trim() || !payForm.amount || !payForm.client_email.trim()}>{paySending ? 'Sending...' : 'Send Request'}</button>
        </div>
      </div></div>}
    </div>
  );
}
