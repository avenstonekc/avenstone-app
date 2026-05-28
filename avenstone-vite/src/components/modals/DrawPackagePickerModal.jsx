import { useState, useEffect } from 'react';
import { sb, AV_TENANT, sbBuildDrawPackage, sbSendDrawPackage } from '../../lib/supabase';
import { fD } from '../../lib/utils';

const FILE_ICON = { pdf: '📄', image: '🖼️', other: '📎' };
const getFileIcon = (m) => {
  if (!m) return FILE_ICON.other;
  if (m === 'application/pdf') return FILE_ICON.pdf;
  if (m.startsWith('image/')) return FILE_ICON.image;
  return FILE_ICON.other;
};

const COMPLIANCE_CATS = ['Insurance', 'License', 'Compliance'];

export default function DrawPackagePickerModal({ job, draw, existingPkg, onClose }) {
  const [jobFiles, setJobFiles]     = useState([]);
  const [compFiles, setCompFiles]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState(new Set());
  const [building, setBuilding]     = useState(false);
  const [buildError, setBuildError] = useState(null);

  // Post-build state
  const [builtPkg, setBuiltPkg]     = useState(null); // { signed_url, draw_package_id }

  // Send form state
  const [sendOpen, setSendOpen]     = useState(false);
  const [recipEmail, setRecipEmail] = useState('');
  const [recipLabel, setRecipLabel] = useState('');
  const [message, setMessage]       = useState('');
  const [sending, setSending]       = useState(false);
  const [sendError, setSendError]   = useState(null);
  const [sentInfo, setSentInfo]     = useState(null); // { email, label } after send

  // Copy link state
  const [copied, setCopied]         = useState(false);
  const [copying, setCopying]       = useState(false);

  useEffect(() => { loadFiles(); }, [job.id]);

  // If there's already a built package, show action panel right away
  useEffect(() => {
    if (existingPkg?.generated_pdf_path && existingPkg?.status !== 'draft') {
      // We don't have the signed_url without re-fetching, so just show the pkg id
      // The user can still rebuild to get a fresh URL or use the Send/Copy actions
      if (existingPkg.status === 'sent') {
        setSentInfo({ email: existingPkg.recipient_email, label: existingPkg.recipient_label || existingPkg.recipient_email });
      }
    }
  }, [existingPkg]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const [jfRes, cfRes] = await Promise.all([
        sb.from('job_files')
          .select('id, category, subcategory, mime_type, name, storage_path, storage_bucket')
          .eq('job_id', job.id)
          .eq('lifecycle_status', 'active')
          .order('category').order('created_at'),
        sb.from('company_files')
          .select('id, category, type, name, storage_path, storage_bucket, mime_type')
          .eq('tenant_id', AV_TENANT)
          .eq('lifecycle_status', 'active')
          .in('category', COMPLIANCE_CATS)
          .order('category').order('type'),
      ]);
      setJobFiles(jfRes.data || []);
      setCompFiles(cfRes.data || []);
    } catch (e) {
      setBuildError(e.message || 'Failed to load files.');
    }
    setLoading(false);
  };

  const toggleFile = (source, id) => {
    const key = `${source}:${id}`;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const isSelected = (source, id) => selected.has(`${source}:${id}`);
  const toggleAll = (files, source) => {
    const keys = files.map(f => `${source}:${f.id}`);
    const allOn = keys.every(k => selected.has(k));
    setSelected(prev => {
      const next = new Set(prev);
      if (allOn) keys.forEach(k => next.delete(k)); else keys.forEach(k => next.add(k));
      return next;
    });
  };

  const buildFileRefs = () => {
    const refs = [];
    for (const key of selected) { const [source, id] = key.split(':'); refs.push({ id, source }); }
    return refs;
  };

  const handleBuild = async () => {
    setBuilding(true); setBuildError(null);
    try {
      const result = await sbBuildDrawPackage(draw.id, job.id, null, buildFileRefs());
      setBuiltPkg(result);
      window.open(result.signed_url, '_blank');
    } catch (e) {
      setBuildError(e.message || 'Failed to build package.');
    } finally { setBuilding(false); }
  };

  const handleCopyLink = async () => {
    if (!builtPkg && !existingPkg?.generated_pdf_path) return;
    setCopying(true);
    try {
      const path = builtPkg
        ? `${job.id}/${draw.id}/cover.pdf`
        : existingPkg.generated_pdf_path;
      const { data } = await sb.storage.from('draw-packages').createSignedUrl(path, 60 * 60 * 24 * 30);
      if (data?.signedUrl) {
        await navigator.clipboard.writeText(data.signedUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      if (builtPkg?.signed_url) {
        await navigator.clipboard.writeText(builtPkg.signed_url).catch(() => {});
        setCopied(true); setTimeout(() => setCopied(false), 2500);
      }
    } finally { setCopying(false); }
  };

  const handleDownload = async () => {
    const path = builtPkg
      ? `${job.id}/${draw.id}/cover.pdf`
      : existingPkg?.generated_pdf_path;
    if (!path) return;
    try {
      const filename = `draw-${draw.draw_number}${draw.title ? '-' + draw.title.replace(/\s+/g, '-') : ''}.pdf`;
      const { data } = await sb.storage.from('draw-packages').createSignedUrl(path, 120, { download: filename });
      if (data?.signedUrl) window.location.href = data.signedUrl;
    } catch (e) {
      alert(e.message || 'Download failed.');
    }
  };

  const handleSend = async () => {
    if (!recipEmail.trim()) { setSendError('Recipient email is required.'); return; }
    setSending(true); setSendError(null);
    try {
      const pkgId = builtPkg?.draw_package_id || existingPkg?.id;
      if (!pkgId) throw new Error('Build the package first.');
      await sbSendDrawPackage(pkgId, recipEmail.trim(), recipLabel.trim(), message.trim() || null);
      setSentInfo({ email: recipEmail.trim(), label: recipLabel.trim() || recipEmail.trim() });
      setSendOpen(false);
    } catch (e) {
      setSendError(e.message || 'Send failed.');
    } finally { setSending(false); }
  };

  // Group job files by category
  const jobGroups = {};
  for (const f of jobFiles) { const c = f.category || 'Other'; if (!jobGroups[c]) jobGroups[c] = []; jobGroups[c].push(f); }
  const jobCats = Object.keys(jobGroups).sort();
  const hasPkg = !!(builtPkg || (existingPkg?.generated_pdf_path));

  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 580, width: '100%', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid #E8E4DC', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0A1F44' }}>Draw Package — Draw #{draw.draw_number}</div>
          <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{draw.title || job.address}</div>
        </div>

        {/* Package Action Panel — shown if there's a built or existing package */}
        {hasPkg && (
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #E8E4DC', flexShrink: 0, background: '#F0FDF4' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#065f46' }}>
                  {sentInfo ? `✓ Sent to ${sentInfo.label}` : '✓ Package ready'}
                </div>
                {existingPkg?.sent_at && !sentInfo && (
                  <div style={{ fontSize: 11, color: '#6B7280', marginTop: 1 }}>Previously sent to {existingPkg.recipient_label || existingPkg.recipient_email}</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {builtPkg && (
                  <button onClick={() => window.open(builtPkg.signed_url, '_blank')} className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>Preview</button>
                )}
                <button onClick={handleDownload} className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>Download</button>
                <button onClick={handleCopyLink} disabled={copying} className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px', color: copied ? '#065f46' : undefined }}>
                  {copied ? 'Copied!' : copying ? '…' : 'Copy Link'}
                </button>
                <button onClick={() => { setSendOpen(s => !s); setSendError(null); }} className="btn btn-navy" style={{ fontSize: 11, padding: '4px 12px' }}>
                  {sendOpen ? 'Cancel' : 'Send Package'}
                </button>
              </div>
            </div>

            {/* Inline send form */}
            {sendOpen && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #BBF7D0' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#0A1F44', marginBottom: 10 }}>Send draw package to</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 3 }}>Recipient email *</div>
                    <input
                      className="finp"
                      type="email"
                      placeholder="bank@example.com"
                      value={recipEmail}
                      onChange={e => setRecipEmail(e.target.value)}
                      style={{ width: '100%', fontSize: 12 }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 3 }}>Recipient label</div>
                    <input
                      className="finp"
                      type="text"
                      placeholder="First National Bank"
                      value={recipLabel}
                      onChange={e => setRecipLabel(e.target.value)}
                      style={{ width: '100%', fontSize: 12 }}
                    />
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 3 }}>Message (optional)</div>
                  <textarea
                    className="finp"
                    placeholder="Please find our draw package attached for your review."
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    rows={2}
                    style={{ width: '100%', fontSize: 12, resize: 'vertical' }}
                  />
                </div>
                {sendError && <div style={{ fontSize: 12, color: '#991b1b', marginBottom: 8 }}>{sendError}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button onClick={() => setSendOpen(false)} className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}>Cancel</button>
                  <button
                    onClick={handleSend}
                    disabled={sending}
                    className="btn btn-gold"
                    style={{ fontSize: 12, padding: '6px 16px', opacity: sending ? 0.6 : 1 }}
                  >
                    {sending ? 'Sending...' : `Send to ${recipLabel || recipEmail || 'recipient'}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* File Picker Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF', fontSize: 13 }}>Loading files...</div>
          ) : (
            <>
              {/* Job Files */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Job Files</div>
                {jobFiles.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>No files on this job.</div>
                ) : (
                  jobCats.map(cat => (
                    <div key={cat} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5, cursor: 'pointer' }} onClick={() => toggleAll(jobGroups[cat], 'job_file')}>
                        <input type="checkbox" readOnly checked={jobGroups[cat].every(f => isSelected('job_file', f.id))} style={{ cursor: 'pointer', accentColor: '#C9A84C' }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{cat}</span>
                        <span style={{ fontSize: 11, color: '#9CA3AF' }}>({jobGroups[cat].length})</span>
                      </div>
                      <div style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {jobGroups[cat].map(f => (
                          <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '5px 10px', borderRadius: 6, background: isSelected('job_file', f.id) ? '#FEF9EE' : '#fff', border: `1px solid ${isSelected('job_file', f.id) ? '#C9A84C' : '#E8E4DC'}` }}>
                            <input type="checkbox" checked={isSelected('job_file', f.id)} onChange={() => toggleFile('job_file', f.id)} style={{ cursor: 'pointer', accentColor: '#C9A84C' }} />
                            <span style={{ fontSize: 13 }}>{getFileIcon(f.mime_type)}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, color: '#0A1F44', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name || '(unnamed)'}</div>
                              {f.subcategory && <div style={{ fontSize: 10, color: '#C9A84C', fontWeight: 600 }}>{f.subcategory}</div>}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Compliance Docs */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Compliance Documents</div>
                {compFiles.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>No Insurance, License, or Compliance documents on file.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {compFiles.map(f => (
                      <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '5px 10px', borderRadius: 6, background: isSelected('company_file', f.id) ? '#FEF9EE' : '#fff', border: `1px solid ${isSelected('company_file', f.id) ? '#C9A84C' : '#E8E4DC'}` }}>
                        <input type="checkbox" checked={isSelected('company_file', f.id)} onChange={() => toggleFile('company_file', f.id)} style={{ cursor: 'pointer', accentColor: '#C9A84C' }} />
                        <span style={{ fontSize: 13 }}>{getFileIcon(f.mime_type)}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: '#0A1F44', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name || '(unnamed)'}</div>
                          <div style={{ fontSize: 10, color: '#6B7280' }}>{f.category}{f.type ? ` · ${f.type}` : ''}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #E8E4DC', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: '#F7F5F0' }}>
          <div style={{ fontSize: 12, color: '#6B7280' }}>
            {selected.size === 0 ? 'No files selected — cover sheet only' : `${selected.size} file${selected.size > 1 ? 's' : ''} selected`}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {buildError && <span style={{ fontSize: 11, color: '#ef4444', alignSelf: 'center' }}>{buildError}</span>}
            <button onClick={onClose} className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 14px' }}>Close</button>
            <button onClick={handleBuild} disabled={building} className="btn btn-gold" style={{ fontSize: 12, padding: '6px 16px', opacity: building ? 0.6 : 1 }}>
              {building ? 'Building...' : hasPkg ? 'Rebuild' : 'Build Package'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
