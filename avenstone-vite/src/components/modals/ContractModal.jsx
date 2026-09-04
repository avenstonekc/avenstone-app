import { useState, useEffect } from 'react';
import { sbSendContractEmail, sbGetContractSnapshot } from '../../lib/supabase';
import { buildContractPDF, DEFAULT_CONTRACT_TEXT } from '../../lib/pdf';

const f$ = n => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ContractModal({ job, onClose, onSent, proposalDoc }) {
  const [contractText, setContractText] = useState(() => DEFAULT_CONTRACT_TEXT(job, f$));
  const [clientName, setClientName] = useState(job.client_name || '');
  const [clientEmail, setClientEmail] = useState(job.client_email || '');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [snapLoaded, setSnapLoaded] = useState(false);

  // Load the accept-time frozen snapshot so the no-proposal fallback builds a
  // priced contract (not $0 boilerplate). If a proposal PDF exists we keep
  // sending that verbatim, so a missing snapshot only blocks the fallback path.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await sbGetContractSnapshot(job.id, job.tenant_id);
      if (cancelled) return;
      if (r.ok && r.snapshot) {
        setSnapshot(r.snapshot);
        setContractText(DEFAULT_CONTRACT_TEXT({ ...job, contract_value: r.contractTotal ?? r.snapshot.grand_total }, f$));
      }
      setSnapLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [job.id, job.tenant_id]);

  const send = async () => {
    if (!clientEmail.trim()) { setErr('Client email is required.'); return; }
    setSending(true); setErr('');
    let blob;
    if (proposalDoc) {
      try {
        const r = await fetch(proposalDoc.signed_url || proposalDoc.file_url);
        if (!r.ok) throw new Error('Could not fetch proposal PDF');
        blob = await r.blob();
      } catch (e) { setErr(e.message || 'Failed to load proposal PDF'); setSending(false); return; }
    } else {
      // Fixed-price contracts fail loud with no proposal AND no priced snapshot.
      // Cost-plus ("flow") jobs have no fixed total — the clause text IS the contract,
      // so we send it with whatever snapshot exists (a rough estimate rides along
      // non-binding, or none at all).
      if (!job.cost_plus && (!snapshot || !Array.isArray(snapshot.rows) || snapshot.rows.length === 0)) {
        setErr('No priced contract on file — accept an estimate before sending.');
        setSending(false); return;
      }
      const doc = buildContractPDF({
        job: { ...job, client_name: clientName, client_email: clientEmail },
        snapshot, signaturePng: null, clauseText: contractText,
      });
      blob = doc.output('blob');
    }
    const res = await sbSendContractEmail({ ...job, client_name: clientName, client_email: clientEmail }, 'contract', blob);
    if (res.error) { setErr(res.error); setSending(false); return; }
    setSending(false);
    if (onSent) onSent(clientEmail, clientName);
  };

  // Cost-plus ("flow") jobs are never blocked on a missing priced snapshot — there is no total.
  const blockedNoSnapshot = snapLoaded && !proposalDoc && !job.cost_plus && (!snapshot || !(snapshot.rows || []).length);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ flexShrink: 0 }}>Send Contract</div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
            {proposalDoc && (
              <div style={{ background: 'var(--green-bg-soft)', border: '1px solid #BBF7D0', padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--green-text-strong)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>✓</span>
                <span><strong>Proposal PDF found</strong> — "{proposalDoc.name}" will be sent as the contract.</span>
              </div>
            )}
            {blockedNoSnapshot && (
              <div style={{ background: 'var(--red-bg, #FEE2E2)', border: '1px solid #FCA5A5', padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--red-text, #991B1B)' }}>
                No priced contract on file — accept an estimate before sending.
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div className="fg"><label className="flbl">Client Name</label><input className="finp" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Full name" /></div>
              <div className="fg"><label className="flbl"><span className="freq">*</span>Client Email</label><input className="finp" type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="client@email.com" /></div>
            </div>
            {!proposalDoc && (
              <div className="fg"><label className="flbl">Contract Text (legal clauses — line items & total append automatically)</label><textarea className="finp fta" rows={14} value={contractText} onChange={e => setContractText(e.target.value)} style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5 }} /></div>
            )}
            {err && <div style={{ fontSize: 12, color: 'var(--red-text)', marginBottom: 8 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 8, flexShrink: 0 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
              <button className={`btn ${clientEmail && !blockedNoSnapshot ? 'btn-navy' : 'btn-ghost'}`} style={{ flex: 2 }} onClick={send} disabled={sending || !clientEmail || blockedNoSnapshot}>{sending ? 'Sending...' : 'Send Contract to Client'}</button>
            </div>
          </div>
      </div>
    </div>
  );
}
