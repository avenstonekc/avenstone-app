import { useState } from 'react';
import { AV_USER_ID, sbCO, sbUpdCO, sbNotify, sbSendContractEmail } from '../../../lib/supabase';
import { Ic, f$, fD } from '../../../lib/utils';
import { buildGenericPDF } from '../../../lib/pdf';

export default function COTab({ job, upd, profile }) {
  const [showCO, setShowCO] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [cod, setCod] = useState('');
  const [cor, setCor] = useState('');
  const [coa, setCoa] = useState('');
  const [savCO, setSavCO] = useState(false);

  const apCOs = (job.change_orders || []).filter(c => c.status === 'approved');
  const coT = Number(job.co_total || 0);
  const cv = Number(job.contract_value || 0);
  const rev = cv + coT;

  const addCO = async () => {
    if (!cod.trim() || !coa) return;
    setSavCO(true);
    const num = `CO-${String((job.change_orders || []).length + 1).padStart(3, '0')}`;
    const co = { job_id: job.id, co_number: num, description: cod.trim(), reason: cor.trim(), amount: Number(coa), status: 'pending', created_at: new Date().toISOString(), submitted_by_id: AV_USER_ID, submitted_by_role: profile?.role || 'project_manager' };
    const s = await sbCO(co);
    if (s) {
      upd({ change_orders: [s, ...(job.change_orders || [])] });
      sbNotify('co_submitted', `New CO on ${job.address}`, `${num}: ${cod.trim()} — ${f$(Number(coa))}`, job.id, AV_USER_ID);
      setCod(''); setCor(''); setCoa(''); setShowCO(false);
    }
    setSavCO(false);
  };

  const apCO = async id => {
    await sbUpdCO(id, { status: 'approved', approved_at: new Date().toISOString() });
    const u = (job.change_orders || []).map(c => c.id === id ? { ...c, status: 'approved' } : c);
    const nct = u.filter(c => c.status === 'approved').reduce((a, c) => a + Number(c.amount || 0), 0);
    upd({ change_orders: u, co_total: nct });
    const co = (job.change_orders || []).find(c => c.id === id);
    if (co) sbNotify('co_approved', `CO approved on ${job.address}`, `${co.co_number} (${f$(co.amount)}) has been approved`, job.id, AV_USER_ID);
  };

  const rjCO = async id => {
    await sbUpdCO(id, { status: 'rejected' });
    upd({ change_orders: (job.change_orders || []).map(c => c.id === id ? { ...c, status: 'rejected' } : c) });
    const co = (job.change_orders || []).find(c => c.id === id);
    if (co) sbNotify('co_rejected', `CO rejected on ${job.address}`, `${co.co_number} has been rejected`, job.id, AV_USER_ID);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 }}>Change Orders</div>
          {coT > 0 && <div style={{ fontSize: 13, color: '#f59e0b', fontWeight: 600, marginTop: 2 }}>Approved: {f$(coT)}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {apCOs.length > 0 && <button className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }} onClick={() => setShowInvoice(true)}><span style={{ width: 13, height: 13 }}>{Ic.doc}</span>Invoice</button>}
          <button className="btn btn-navy" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowCO(true)}><span style={{ width: 14, height: 14 }}>{Ic.plus}</span>New CO</button>
        </div>
      </div>

      {!(job.change_orders || []).length && <div className="empty">{Ic.doc}<div className="empty-t">No change orders</div><div>Tap New CO to document a scope change</div></div>}
      {(job.change_orders || []).map((co, i) => (
        <div key={co.id || i} className="co-item" style={{ borderLeftColor: co.status === 'approved' ? '#22c55e' : co.status === 'rejected' ? '#ef4444' : '#f59e0b' }}>
          <div className="co-num">{co.co_number}</div>
          {co.submitted_by_role && (
            <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 600, color: '#0A1F44', background: '#F7F5F0', border: '1px solid #E8E4DC', borderRadius: 20, padding: '2px 8px', marginBottom: 4 }}>
              Submitted by {co.submitted_by_role.toUpperCase().replace(/_/g, ' ')}
            </span>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <div style={{ flex: 1 }}><div className="co-desc">{co.description}</div>{co.reason && <div className="co-reason">{co.reason}</div>}</div>
            <div style={{ textAlign: 'right', marginLeft: 16 }}>
              <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: '#22c55e' }}>{f$(co.amount)}</div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: co.status === 'approved' ? '#22c55e' : co.status === 'rejected' ? '#ef4444' : '#f59e0b' }}>{co.status}</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>{fD(co.created_at)}</span>
            {co.status === 'pending' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['owner', 'project_manager'].includes(profile?.role) && job.client_email && (
                  <button className="btn" style={{ background: '#0A1F44', border: '1px solid #0A1F44', color: '#C9A84C', padding: '5px 12px', fontSize: 11, fontWeight: 600 }} onClick={async () => {
                    const coText = `CHANGE ORDER: ${co.co_number || ''}\n\nProject: ${job.address}\nClient: ${job.client_name || ''}\n\nDescription:\n${co.description || ''}\n\nReason: ${co.reason || ''}\n\nAmount: ${f$(co.amount || 0)}\n\nThis Change Order must be approved by the client before work proceeds.`;
                    const doc = buildGenericPDF({ docType: 'CHANGE ORDER', job, bodyText: coText, signaturePng: null });
                    const blob = doc.output('blob');
                    await sbSendContractEmail(job, 'change_order', blob);
                    alert(`Change order sent to ${job.client_email} for signature.`);
                  }}>Send for Approval</button>
                )}
                <button className="btn" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#16a34a', padding: '5px 12px', fontSize: 11, fontWeight: 600 }} onClick={() => apCO(co.id)}>✓ Approve</button>
                <button className="btn" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#ef4444', padding: '5px 12px', fontSize: 11, fontWeight: 600 }} onClick={() => rjCO(co.id)}>✕ Reject</button>
              </div>
            )}
          </div>
        </div>
      ))}

      {showCO && <div className="overlay" onClick={() => setShowCO(false)}><div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">New Change Order</div>
        <div className="fg"><label className="flbl"><span className="freq">*</span>Description</label><input className="finp" value={cod} onChange={e => setCod(e.target.value)} placeholder="What work is being added or changed?" /></div>
        <div className="fg"><label className="flbl">Reason</label><input className="finp" value={cor} onChange={e => setCor(e.target.value)} placeholder="Why is this change needed?" /></div>
        <div className="fg"><label className="flbl"><span className="freq">*</span>Amount ($)</label><input className="finp" type="number" value={coa} onChange={e => setCoa(e.target.value)} placeholder="e.g. 2500" /></div>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowCO(false)}>Cancel</button>
          <button className={`btn ${cod.trim() && coa ? 'btn-gold' : 'btn-ghost'}`} style={{ flex: 1 }} onClick={addCO} disabled={savCO || !cod.trim() || !coa}>{savCO ? 'Saving...' : 'Create CO'}</button>
        </div>
      </div></div>}

      {showInvoice && <div className="overlay" onClick={() => setShowInvoice(false)}><div className="modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div><div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: '#0A1F44' }}>Invoice Summary</div><div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{job.address}</div></div>
          <button onClick={() => window.print()} style={{ background: '#0A1F44', color: '#C9A84C', border: 'none', padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 3 }}>Print / Save PDF</button>
        </div>
        <div style={{ borderTop: '2px solid #0A1F44', borderBottom: '1px solid #E8E4DC', padding: '12px 0', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
            <span>Item</span><span>Amount</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F3F0E8', fontSize: 14 }}>
            <span style={{ color: '#374151' }}>Base Contract — {job.scope || 'General Construction'}</span>
            <span style={{ fontWeight: 700, color: '#0A1F44' }}>{f$(cv)}</span>
          </div>
          {apCOs.map(co => (
            <div key={co.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F3F0E8', fontSize: 13 }}>
              <div>
                <div style={{ color: '#374151' }}>{co.co_number} — {co.description}</div>
                {co.reason && <div style={{ fontSize: 11, color: '#9CA3AF' }}>{co.reason}</div>}
              </div>
              <span style={{ fontWeight: 600, color: '#f59e0b', flexShrink: 0, marginLeft: 16 }}>{f$(Number(co.amount))}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0A1F44', textTransform: 'uppercase', letterSpacing: 1 }}>Total</div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 26, color: '#0A1F44' }}>{f$(rev)}</div>
        </div>
        {job.client_name && <div style={{ marginTop: 8, fontSize: 12, color: '#9CA3AF' }}>Client: {job.client_name}{job.client_email ? ` · ${job.client_email}` : ''}</div>}
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowInvoice(false)}>Close</button>
        </div>
      </div></div>}
    </div>
  );
}
