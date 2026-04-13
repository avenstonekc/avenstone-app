import { useState } from 'react';
import { sbUploadDoc, sbSaveSignature, sbNotify, AV_USER_ID } from '../../lib/supabase';
import { buildGenericPDF } from '../../lib/pdf';
import SignaturePad from '../auth/SignaturePad';

export default function CompletionSignoffModal({ job, onClose, onSigned }) {
  const [step, setStep] = useState('review');
  const [saving, setSaving] = useState(false);

  const completionText = `PROJECT COMPLETION SIGN-OFF\n\nProject Address: ${job.address}\nClient: ${job.client_name || ''}\nDate: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\n\nI, the undersigned, confirm that all work described in the Construction Services Agreement and any approved Change Orders has been completed to my satisfaction at the above property.\n\nI acknowledge that:\n• All work has been completed per the agreed scope\n• I have had the opportunity to inspect all work\n• Any punch list items have been addressed\n• Final payment is now due per the payment schedule\n\nBy signing below, I release Avenstone Group LLC from any further obligations under the contract, with the exception of warranty claims which remain in effect for one (1) year from this date.`;

  const submit = async png => {
    setSaving(true);
    const doc = buildGenericPDF({ docType: 'COMPLETION SIGN-OFF', job, bodyText: completionText, signaturePng: png });
    const blob = doc.output('blob');
    const file = new File([blob], `Completion Sign-off — ${job.address || job.id}.pdf`, { type: 'application/pdf' });
    const up = await sbUploadDoc(job.id, file, 'contract');
    await sbSaveSignature({ job_id: job.id, type: 'completion', signed_by_name: job.client_name || '', signed_by_email: job.client_email || '', signature_data: png, signed_at: new Date().toISOString(), document_url: up?.doc?.file_url || null });
    sbNotify('note_posted', `Completion signed — ${job.address}`, 'The client has signed the completion sign-off.', job.id, AV_USER_ID);
    setSaving(false); setStep('done');
    if (onSigned) onSigned();
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
        {step === 'review' && <>
          <div className="modal-title">Completion Sign-off</div>
          <div style={{ overflowY: 'auto', flex: 1, marginBottom: 12 }}>
            <pre style={{ fontSize: 11, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: '#374151', fontFamily: 'sans-serif' }}>{completionText}</pre>
          </div>
          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button className="btn btn-gold" style={{ flex: 2 }} onClick={() => setStep('sign')}>I've Read It — Sign →</button>
          </div>
        </>}
        {step === 'sign' && <>
          <div className="modal-title">Sign Completion</div>
          <div style={{ marginBottom: 12, fontSize: 13, color: '#6B7280' }}>By signing, you confirm the work at <strong>{job.address}</strong> is complete and satisfactory.</div>
          <SignaturePad onSave={submit} onCancel={() => setStep('review')} label="Draw your signature" />
          {saving && <div style={{ textAlign: 'center', fontSize: 13, color: '#9CA3AF', marginTop: 12 }}>Saving...</div>}
        </>}
        {step === 'done' && <>
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, background: '#22c55e', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: '#fff', fontSize: 20 }}>✓</div>
            <div style={{ fontWeight: 600, color: '#0A1F44', marginBottom: 4 }}>Sign-off Complete</div>
            <div style={{ fontSize: 13, color: '#9CA3AF', marginBottom: 16 }}>PDF saved to documents.</div>
            <button className="btn btn-ghost" style={{ width: '100%' }} onClick={onClose}>Close</button>
          </div>
        </>}
      </div>
    </div>
  );
}
