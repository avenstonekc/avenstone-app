import { useState } from 'react';
import { sb, sbSaveSignature, sbNotify, AV_USER_ID } from '../../lib/supabase';
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
      const path = `${job.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`;
      const { error: ue } = await sb.storage.from('job-documents').upload(path, file, { contentType: 'application/pdf', upsert: false });
      if (!ue) {
        const { data: ud } = sb.storage.from('job-documents').getPublicUrl(path);
        fileUrl = ud.publicUrl;
        await sb.from('job_documents').insert({
          job_id: job.id, tenant_id: job.tenant_id, name: fileName,
          file_url: fileUrl, file_type: 'contract', version: 1, client_visible: true,
        });
      } else {
        console.error('Signed contract upload error:', ue);
      }
    } catch (e) {
      console.error('Signed contract save error:', e);
    }

    await sbSaveSignature({ job_id: job.id, tenant_id: job.tenant_id, type: 'contract', signed_by_name: job.client_name || '', signed_by_email: job.client_email || '', signature_data: png, signed_at: new Date().toISOString(), document_url: fileUrl });
    await sb.from('jobs').update({ contract_signed: true, contract_signed_at: new Date().toISOString(), status: 'active' }).eq('id', job.id);
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
            <pre style={{ fontSize: 11, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: '#374151', fontFamily: 'sans-serif' }}>{contractText}</pre>
          </div>
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button className="btn btn-gold" style={{ flex: 2 }} onClick={() => setStep('sign')}>I've Read It — Sign →</button>
          </div>
        </>}
        {step === 'sign' && <>
          <div className="modal-title">Sign Contract</div>
          <div style={{ marginBottom: 12, fontSize: 13, color: '#6B7280' }}>By signing below, you agree to the contract terms for <strong>{job.address}</strong>.</div>
          <SignaturePad onSave={submit} onCancel={() => setStep('review')} label="Draw your signature" />
          {saving && <div style={{ textAlign: 'center', fontSize: 13, color: '#9CA3AF', marginTop: 12 }}>Saving signed contract...</div>}
        </>}
        {step === 'done' && <>
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, background: '#22c55e', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: '#fff', fontSize: 20 }}>✓</div>
            <div style={{ fontWeight: 600, color: '#0A1F44', marginBottom: 4 }}>Contract Signed!</div>
            <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 16 }}>Your signed contract has been saved.</div>
            <button className="btn btn-ghost" style={{ width: '100%' }} onClick={onClose}>Close</button>
          </div>
        </>}
      </div>
    </div>
  );
}
