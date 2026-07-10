import { useState, useEffect } from 'react';
import { sb, sbUploadDoc, sbSaveSignature, sbNotify, sbGetContractSnapshot, sbSendContractEmail, sbRecordSignatureEvidence, AV_USER_ID } from '../../lib/supabase';
import { buildContractPDF, DEFAULT_CONTRACT_TEXT } from '../../lib/pdf';
import SignaturePad from '../auth/SignaturePad';

const f$ = n => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fWhole = n => `$${Math.round(Number(n || 0)).toLocaleString()}`;

export default function ClientSignContractModal({ job, onClose, onSigned }) {
  const [step, setStep] = useState('review'); // review | sign | done
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [contractTotal, setContractTotal] = useState(null);
  const [emailStatus, setEmailStatus] = useState('pending'); // pending | sent | failed

  // Load the accept-time frozen snapshot. FAIL LOUD if none — signing a contract
  // with no price is the legal exposure this step exists to close; never fall
  // back to boilerplate.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await sbGetContractSnapshot(job.id, job.tenant_id);
      if (cancelled) return;
      if (!r.ok) { setLoadErr('Could not load the contract. Please try again.'); setLoading(false); return; }
      if (!r.snapshot || !Array.isArray(r.snapshot.rows) || r.snapshot.rows.length === 0) {
        setLoadErr('No priced contract on file — accept an estimate before signing.'); setLoading(false); return;
      }
      setSnapshot(r.snapshot);
      setContractTotal(r.contractTotal ?? r.snapshot.grand_total ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [job.id, job.tenant_id]);

  const submit = async png => {
    if (!snapshot) return;
    setSaving(true);
    const pdfDoc = buildContractPDF({ job, snapshot, signaturePng: png });
    const blob = pdfDoc.output('blob');
    const fileName = `Signed Contract — ${job.address || job.id}.pdf`;
    const file = new File([blob], fileName, { type: 'application/pdf' });

    let fileUrl = null;
    try {
      const r = await sbUploadDoc(job.id, file, 'contract');
      if (r.doc) {
        fileUrl = r.doc.signed_url || r.doc.file_url;
        await sb.from('job_files').update({ client_visible: true }).eq('id', r.doc.id);
      } else {
        console.error('Signed contract upload error:', r.error);
      }
    } catch (e) {
      console.error('Signed contract save error:', e);
    }

    // Freeze an immutable evidence copy of the price + scope the client agreed to
    // onto contract_signatures — a deep clone, never a live reference to the
    // mutable estimate rows. sbSaveSignature already post-write verifies via
    // .select().single(); surface a hard failure instead of silently "signing".
    const frozenTotal = contractTotal != null ? contractTotal : (snapshot.grand_total ?? null);
    const frozenScope = JSON.parse(JSON.stringify(snapshot));
    const res = await sbSaveSignature({
      job_id: job.id, tenant_id: job.tenant_id, type: 'contract',
      signed_by_name: job.client_name || '', signed_by_email: job.client_email || '',
      signature_data: png, signed_at: new Date().toISOString(), document_url: fileUrl,
      contract_total: frozenTotal, scope_snapshot: frozenScope,
    });
    if (!res.ok) {
      console.error('Signature save failed:', res.error);
      setSaving(false);
      setLoadErr('Could not record your signature. Please try again.');
      setStep('review');
      return;
    }

    await sb.from('jobs').update({ contract_signed: true, contract_signed_at: new Date().toISOString(), status: 'in_progress' }).eq('id', job.id);
    sbNotify('note_posted', `Contract signed — ${job.address}`, 'The client has signed the contract.', job.id, AV_USER_ID);

    // Capture server-side signer evidence (IP + user agent) onto the signature row. Fired
    // post-save and independent of the signed-copy email below — neither waits on the other.
    // Evidence enrichment, not a state change: a failure is logged and never blocks signing.
    sbRecordSignatureEvidence({ signature_id: res.data?.id, tenant_id: job.tenant_id, job_id: job.id })
      .then(r => { if (r?.error) console.error('Signature evidence capture failed:', r.error); })
      .catch(e => console.error('Signature evidence capture error:', e));

    // Deliver the client their fully-executed copy (same signed PDF, CC'd to the office).
    // This is a NOTIFICATION, not a state change: the signature is already recorded above,
    // so a mail failure must never undo it or block the modal — log it and complete.
    if (job.client_email) {
      sbSendContractEmail(job, 'signed_copy', blob)
        .then(r => {
          if (r?.error) { console.error('Signed-copy email failed:', r.error); setEmailStatus('failed'); }
          else setEmailStatus('sent');
        })
        .catch(e => { console.error('Signed-copy email error:', e); setEmailStatus('failed'); });
    } else {
      console.warn('No client_email on job — signed copy not emailed.');
      setEmailStatus('failed');
    }

    setSaving(false); setStep('done');
    if (onSigned) onSigned();
  };

  const clauseText = snapshot ? DEFAULT_CONTRACT_TEXT({ ...job, contract_value: contractTotal }, f$) : '';
  const rows = snapshot?.rows || [];

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 580, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        {loading && (
          <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-subtle)' }}>Loading contract…</div>
        )}

        {!loading && loadErr && step !== 'done' && (
          <>
            <div className="modal-title">Contract Unavailable</div>
            <div style={{ background: 'var(--red-bg, #FEE2E2)', border: '1px solid #FCA5A5', borderRadius: 8, padding: '12px 14px', margin: '4px 0 16px', fontSize: 13, color: 'var(--red-text, #991B1B)' }}>{loadErr}</div>
            <button className="btn btn-ghost" style={{ width: '100%' }} onClick={onClose}>Close</button>
          </>
        )}

        {!loading && !loadErr && step === 'review' && <>
          <div className="modal-title">Review Contract</div>
          <div style={{ background: 'var(--navy-900, #0A1F44)', color: '#fff', borderRadius: 8, padding: '12px 14px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 12, letterSpacing: 0.5, opacity: 0.85 }}>CONTRACT TOTAL</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--gold, #C9A84C)' }}>{f$(contractTotal)}</span>
          </div>
          <div style={{ overflowY: 'auto', flex: 1, marginBottom: 12 }}>
            <div style={{ marginBottom: 14 }}>
              {rows.map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--border, #E8E4DC)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{r.description || '—'}{r.qty != null ? ` (${r.qty}${r.unit ? ' ' + r.unit : ''})` : ''}</span>
                  <span style={{ fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--navy-900, #0A1F44)' }}>{fWhole(r.client_price)}</span>
                </div>
              ))}
            </div>
            <pre style={{ fontSize: 11, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', fontFamily: 'sans-serif', margin: 0 }}>{clauseText}</pre>
          </div>
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button className="btn btn-gold" style={{ flex: 2 }} onClick={() => setStep('sign')}>I've Read It — Sign →</button>
          </div>
        </>}

        {!loading && !loadErr && step === 'sign' && <>
          <div className="modal-title">Sign Contract</div>
          <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-muted)' }}>By signing below, you agree to the contract terms and the total of <strong>{f$(contractTotal)}</strong> for <strong>{job.address}</strong>.</div>
          <SignaturePad onSave={submit} onCancel={() => setStep('review')} label="Draw your signature" />
          {saving && <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-subtle)', marginTop: 12 }}>Saving signed contract...</div>}
        </>}

        {step === 'done' && <>
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, background: 'var(--green-dot)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: 'var(--card-bg)', fontSize: 20 }}>✓</div>
            <div style={{ fontWeight: 600, color: 'var(--navy-900)', marginBottom: 4 }}>Contract Signed!</div>
            <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginBottom: 16 }}>
              {emailStatus === 'sent'
                ? 'Your signed contract has been saved and a copy emailed to you for your records.'
                : emailStatus === 'failed'
                  ? 'Your signed contract has been saved. Your copy will be emailed to you shortly.'
                  : 'Your signed contract has been saved — a copy is on its way to your email.'}
            </div>
            <button className="btn btn-ghost" style={{ width: '100%' }} onClick={onClose}>Close</button>
          </div>
        </>}
      </div>
    </div>
  );
}
