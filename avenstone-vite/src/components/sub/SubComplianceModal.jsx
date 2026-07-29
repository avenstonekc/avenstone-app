import { useState, useRef, useEffect } from 'react';
import { sb, AV_TENANT, CONTRACT_EMAIL_URL, ANON_KEY, sbSendPaperwork, sbLoadPaperwork } from '../../lib/supabase';

// S2b: fillable paperwork lands in the private employee-docs bucket ({user_id}/...); legacy
// uploads live in job-documents (w9/..., insurance/...). Route the viewer by path prefix and
// use a short-expiry (10 min) signed URL — these can contain TINs.
const bucketFor = path => (path.startsWith('w9/') || path.startsWith('insurance/')) ? 'job-documents' : 'employee-docs';
const signStoragePath = async path => {
  if (!path) return null;
  const { data } = await sb.storage.from(bucketFor(path)).createSignedUrl(path, 600);
  return data?.signedUrl || null;
};
const pathFromUrl = v => !v ? null
  : v.includes('/job-documents/') ? v.split('/job-documents/')[1]
  : v.includes('/employee-docs/') ? v.split('/employee-docs/')[1]
  : v; // already a plain path

export default function SubComplianceModal({ sub, onClose, onUpdated }) {
  const [tab, setTab] = useState('w9');
  const [w9Uploading, setW9Uploading] = useState(false);
  const [insUploading, setInsUploading] = useState(false);
  const [insExpiry, setInsExpiry] = useState(sub.insurance_expiry || '');
  const [insVerified, setInsVerified] = useState(sub.insurance_verified || false);
  const [savingIns, setSavingIns] = useState(false);
  const [w9SignedUrl, setW9SignedUrl] = useState(null);
  const [insSignedUrl, setInsSignedUrl] = useState(null);
  const [w9Req, setW9Req] = useState(null);   // fillable-W-9 paperwork request
  const [w9Sending, setW9Sending] = useState(false);
  const w9Ref = useRef(); const insRef = useRef();

  useEffect(() => {
    if (sub.w9_url) signStoragePath(pathFromUrl(sub.w9_url)).then(setW9SignedUrl);
    if (sub.insurance_url) signStoragePath(pathFromUrl(sub.insurance_url)).then(setInsSignedUrl);
    sbLoadPaperwork(sub.id).then(r => setW9Req((r.data || []).find(p => p.doc_type === 'w9') || null));
  }, [sub.w9_url, sub.insurance_url, sub.id]);

  const sendFillableW9 = async () => {
    setW9Sending(true);
    const r = await sbSendPaperwork(sub.id, 'w9');
    setW9Sending(false);
    if (!r.ok) { alert('Send failed: ' + r.error); return; }
    const pw = await sbLoadPaperwork(sub.id);
    setW9Req((pw.data || []).find(p => p.doc_type === 'w9') || null);
  };

  const uploadW9 = async file => {
    if (!file) return; setW9Uploading(true);
    const ext = file.name.split('.').pop() || 'pdf';
    const path = `w9/${sub.id}_${Date.now()}.${ext}`;
    const { error: ue } = await sb.storage.from('job-documents').upload(path, file, { contentType: file.type, upsert: true });
    if (ue) { setW9Uploading(false); alert('Upload failed: ' + ue.message); return; }
    await sb.from('profiles').update({ w9_url: path, w9_submitted_at: new Date().toISOString() }).eq('id', sub.id);
    signStoragePath(path).then(setW9SignedUrl);
    if (onUpdated) onUpdated({ ...sub, w9_url: path, w9_submitted_at: new Date().toISOString() });
    setW9Uploading(false);
  };

  const uploadIns = async file => {
    if (!file) return; setInsUploading(true);
    const ext = file.name.split('.').pop() || 'pdf';
    const path = `insurance/${sub.id}_${Date.now()}.${ext}`;
    const { error: ue } = await sb.storage.from('job-documents').upload(path, file, { contentType: file.type, upsert: true });
    if (ue) { setInsUploading(false); alert('Upload failed: ' + ue.message); return; }
    await sb.from('profiles').update({ insurance_url: path }).eq('id', sub.id);
    signStoragePath(path).then(setInsSignedUrl);
    if (onUpdated) onUpdated({ ...sub, insurance_url: path });
    setInsUploading(false);
  };

  const saveInsDetails = async () => {
    setSavingIns(true);
    await sb.from('profiles').update({ insurance_expiry: insExpiry || null, insurance_verified: insVerified }).eq('id', sub.id);
    if (onUpdated) onUpdated({ ...sub, insurance_expiry: insExpiry, insurance_verified: insVerified });
    setSavingIns(false);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div className="modal-title" style={{ marginBottom: 2 }}>{sub.full_name || sub.email}</div>
            {sub.trade && <div style={{ fontSize: 12, color: '#C9A84C', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>{sub.trade}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 0, marginBottom: 16, border: '1px solid #E8E4DC', borderRadius: 4, overflow: 'hidden' }}>
          {[['w9', 'W-9'], ['ins', 'Insurance'], ['agreement', 'Agreement']].map(([id, lb]) => (
            <button key={id} onClick={() => setTab(id)} style={{ flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', borderRight: '1px solid #E8E4DC', background: tab === id ? '#0A1F44' : '#fff', color: tab === id ? '#C9A84C' : '#9CA3AF' }}>{lb}</button>
          ))}
        </div>

        {tab === 'w9' && <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44' }}>W-9 Form</div>
              {sub.w9_submitted_at
                ? <div style={{ fontSize: 12, color: '#22c55e', marginTop: 2 }}>✓ Submitted {new Date(sub.w9_submitted_at).toLocaleDateString()}</div>
                : <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 2 }}>Not submitted</div>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {sub.w9_url && w9SignedUrl && <a href={w9SignedUrl} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>View</a>}
              <button className="btn btn-navy" style={{ fontSize: 12, padding: '7px 14px' }} onClick={() => w9Ref.current.click()} disabled={w9Uploading}>{w9Uploading ? 'Uploading...' : 'Upload W-9'}</button>
            </div>
          </div>
          <input ref={w9Ref} type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={e => uploadW9(e.target.files[0])} />
          {/* S2b: send a fillable W-9 the sub e-signs in the app (upload stays as an option) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#F8FAFC', border: '1px solid #E8E4DC', borderRadius: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, color: '#0A1F44', flex: 1, minWidth: 140 }}>
              <strong>Send a fillable W-9</strong> — they fill and e-sign it on their phone.
              {w9Req && <span style={{ marginLeft: 6, color: w9Req.status === 'completed' ? '#22c55e' : '#f59e0b', fontWeight: 600 }}>{w9Req.status === 'completed' ? `✓ Completed ${new Date(w9Req.completed_at).toLocaleDateString()}` : `Sent ${new Date(w9Req.sent_at).toLocaleDateString()}`}</span>}
            </div>
            <button className="btn btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }} onClick={sendFillableW9} disabled={w9Sending}>{w9Sending ? 'Sending…' : (w9Req ? 'Re-send' : 'Send fillable W-9')}</button>
          </div>
          {!sub.w9_url && !sub.w9_submitted_at && !w9Req && <div style={{ background: '#FEF9EC', border: '1px solid #FDE68A', padding: '10px 14px', fontSize: 12, color: '#78350F', borderRadius: 4 }}>W-9 has not been received for this subcontractor. Upload a signed copy or request them to submit one.</div>}
        </div>}

        {tab === 'ins' && <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44' }}>Certificate of Insurance</div>
              {sub.insurance_url
                ? <div style={{ fontSize: 12, color: '#22c55e', marginTop: 2 }}>✓ On file{sub.insurance_verified ? ' · Verified' : ''}</div>
                : <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 2 }}>Not on file</div>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {sub.insurance_url && insSignedUrl && <a href={insSignedUrl} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ fontSize: 12, padding: '7px 14px' }}>View</a>}
              <button className="btn btn-navy" style={{ fontSize: 12, padding: '7px 14px' }} onClick={() => insRef.current.click()} disabled={insUploading}>{insUploading ? 'Uploading...' : 'Upload COI'}</button>
            </div>
          </div>
          <input ref={insRef} type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={e => uploadIns(e.target.files[0])} />
          <div className="fg" style={{ marginTop: 12 }}><label className="flbl">Expiry Date</label><input className="finp" type="date" value={insExpiry} onChange={e => setInsExpiry(e.target.value)} /></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <input type="checkbox" id="ins-verified" checked={insVerified} onChange={e => setInsVerified(e.target.checked)} style={{ width: 16, height: 16, cursor: 'pointer' }} />
            <label htmlFor="ins-verified" style={{ fontSize: 13, color: '#374151', cursor: 'pointer' }}>Insurance verified</label>
          </div>
          {(insExpiry || insVerified !== sub.insurance_verified) && <button className="btn btn-gold" style={{ width: '100%' }} onClick={saveInsDetails} disabled={savingIns}>{savingIns ? 'Saving...' : 'Save Insurance Details'}</button>}
          {sub.insurance_expiry && new Date(sub.insurance_expiry) < new Date() && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', padding: '10px 14px', fontSize: 12, borderRadius: 4, marginTop: 10 }}>⚠ Insurance expired on {new Date(sub.insurance_expiry).toLocaleDateString()}</div>}
        </div>}

        {tab === 'agreement' && <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44', marginBottom: 8 }}>Subcontractor Agreement</div>
          <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 16, lineHeight: 1.6 }}>Send a digital subcontractor agreement for {sub.full_name || 'this sub'} to sign electronically.</div>
          <button className="btn btn-navy" style={{ width: '100%' }} onClick={async () => {
            if (!sub.email) { alert('No email on file for this sub.'); return; }
            const res = await fetch(CONTRACT_EMAIL_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` }, body: JSON.stringify({ email: sub.email, client_name: sub.full_name || '', job_address: '', job_id: 'sub-' + sub.id, tenant_id: AV_TENANT, contract_type: 'subcontractor_agreement' }) });
            if (res.ok) alert(`Agreement sent to ${sub.email}`);
          }}>Send Agreement for Signature</button>
        </div>}

        <button className="btn btn-ghost" style={{ width: '100%', marginTop: 12 }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
