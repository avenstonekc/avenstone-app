import { useState } from 'react';
import { sb, sbUploadDoc, sbSaveSignature, sbNotify, AV_USER_ID } from '../../lib/supabase';
import { buildGenericPDF, DEFAULT_CONTRACT_TEXT } from '../../lib/pdf';
import SignaturePad from '../auth/SignaturePad';

export default function ClientSignContractModal({ job, onClose, onSigned }) {
  const [step, setStep] = useState('review'); // review | sign | done
  const [saving, setSaving] = useState(false);
  const contractText = DEFAULT_CONTRACT_TEXT(job);

  const submit = async png => {
    setSaving(true);
    const pdfDoc = buildGenericPDF({ docType: 'CONTRACT', job, bodyText: contractText, signaturePng: png });
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

    await sbSaveSignature({ job_id: job.id, tenant_id: job.tenant_id, type: 'contract', signed_by_name: job.client_name || '', signed_by_email: job.client_email || '', signature_data: png, signed_at: new Date().toISOString(), document_url: fileUrl });
    await sb.from('jobs').update({ contract_signed: true, contract_signed_at: new Date().toISOString(), status: 'in_progress' }).eq('id', job.id);
    sbNotify('note_posted', `Contract signed — ${job.address}`, 'The client has signed the contract.', job.id, AV_USER_ID);
    setSaving(false); setStep('done');
    if (onSigned) onSigned();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 580, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        {step === 'review' && <>
          <div className="modal-title">Review Contract</div>
          <div style={{ overflowY: 'auto', flex: 1, marginBottom: 12 }}>
            <pre style={{ fontSize: 11, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)', fontFamily: 'sans-serif' }}>{contractText}</pre>
          </div>
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button className="btn btn-gold" style={{ flex: 2 }} onClick={() => setStep('sign')}>I've Read It — Sign →</button>
          </div>
        </>}
        {step === 'sign' && <>
          <div className="modal-title">Sign Contract</div>
          <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-muted)' }}>By signing below, you agree to the contract terms for <strong>{job.address}</strong>.</div>
          <SignaturePad onSave={submit} onCancel={() => setStep('review')} label="Draw your signature" />
          {saving && <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-subtle)', marginTop: 12 }}>Saving signed contract...</div>}
        </>}
        {step === 'done' && <>
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, background: 'var(--green-dot)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: 'var(--card-bg)', fontSize: 20 }}>✓</div>
            <div style={{ fontWeight: 600, color: 'var(--navy-900)', marginBottom: 4 }}>Contract Signed!</div>
            <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginBottom: 16 }}>Your signed contract has been saved.</div>
            <button className="btn btn-ghost" style={{ width: '100%' }} onClick={onClose}>Close</button>
          </div>
        </>}
      </div>
    </div>
  );
}
