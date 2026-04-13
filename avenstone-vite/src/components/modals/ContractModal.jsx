import { useState } from 'react';
import { sbSendContractEmail } from '../../lib/supabase';
import { buildGenericPDF, DEFAULT_CONTRACT_TEXT } from '../../lib/pdf';

export default function ContractModal({ job, onClose, onSent, proposalDoc }) {
  const [contractText, setContractText] = useState(() => DEFAULT_CONTRACT_TEXT(job));
  const [clientName, setClientName] = useState(job.client_name || '');
  const [clientEmail, setClientEmail] = useState(job.client_email || '');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState('');

  const send = async () => {
    if (!clientEmail.trim()) { setErr('Client email is required.'); return; }
    setSending(true); setErr('');
    let blob;
    if (proposalDoc) {
      try {
        const r = await fetch(proposalDoc.file_url);
        if (!r.ok) throw new Error('Could not fetch proposal PDF');
        blob = await r.blob();
      } catch (e) { setErr(e.message || 'Failed to load proposal PDF'); setSending(false); return; }
    } else {
      const doc = buildGenericPDF({ docType: 'CONTRACT', job: { ...job, client_name: clientName, client_email: clientEmail }, bodyText: contractText, signaturePng: null });
      blob = doc.output('blob');
    }
    const res = await sbSendContractEmail({ ...job, client_name: clientName, client_email: clientEmail }, 'contract', blob);
    if (res.error) { setErr(res.error); setSending(false); return; }
    setSent(true); setSending(false);
    if (onSent) onSent(clientEmail, clientName);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ flexShrink: 0 }}>Send Contract</div>
        {sent ? (
          <div style={{ padding: '20px 0', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, background: '#22c55e', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: '#fff', fontSize: 20 }}>✓</div>
            <div style={{ fontWeight: 600, color: '#0A1F44', marginBottom: 4 }}>Contract sent!</div>
            <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 16 }}>{clientEmail}</div>
            <button className="btn btn-ghost" style={{ width: '100%' }} onClick={onClose}>Close</button>
          </div>
        ) : (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {proposalDoc && (
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#065F46', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 16 }}>✓</span>
                <span><strong>Proposal PDF found</strong> — "{proposalDoc.name}" will be sent as the contract.</span>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div className="fg"><label className="flbl">Client Name</label><input className="finp" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Full name" /></div>
              <div className="fg"><label className="flbl"><span className="freq">*</span>Client Email</label><input className="finp" type="email" value={clientEmail} onChange={e => setClientEmail(e.target.value)} placeholder="client@email.com" /></div>
            </div>
            {!proposalDoc && (
              <div className="fg"><label className="flbl">Contract Text</label><textarea className="finp fta" rows={14} value={contractText} onChange={e => setContractText(e.target.value)} style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5 }} /></div>
            )}
            {err && <div style={{ fontSize: 12, color: '#ef4444', marginBottom: 8 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 8, flexShrink: 0 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
              <button className={`btn ${clientEmail ? 'btn-navy' : 'btn-ghost'}`} style={{ flex: 2 }} onClick={send} disabled={sending || !clientEmail}>{sending ? 'Sending...' : 'Send Contract to Client'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
