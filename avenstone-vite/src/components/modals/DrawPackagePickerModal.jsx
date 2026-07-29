import { useState, useEffect, useRef } from 'react';
import { sb, AV_TENANT, sbBuildDrawPackage, sbSendDrawPackage, sbSaveDrawPackageToFiles, sbGetDrawPackageSignedUrl, sbUploadDrawAttachment } from '../../lib/supabase';

const COMPLIANCE_CATS = ['Insurance', 'License', 'Compliance'];
const MAX_ATTACHMENTS = 20;

// Downscale an image to keep the build-draw-package edge worker under its memory ceiling, and to
// convert alpha PNGs → JPEG (pdf-lib embedPng on an RGBA PNG OOMs the worker). Non-images pass through.
async function downscaleImage(file, maxDim = 2000, quality = 0.82) {
  if (!file?.type?.startsWith('image/')) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.type === 'image/jpeg') return file;
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
    if (!blob) return file;
    const name = (file.name || 'photo').replace(/\.(png|webp|heic|heif|jpe?g)$/i, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch { return file; }
}

function PhotoThumb({ file, selected, onToggle }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let active = true;
    sb.storage.from(file.storage_bucket || 'job-photos')
      .createSignedUrl(file.storage_path, 3600)
      .then(({ data }) => { if (active && data?.signedUrl) setUrl(data.signedUrl); });
    return () => { active = false; };
  }, [file.id]);

  return (
    <div onClick={onToggle} style={{
      width: 80, height: 80, borderRadius: 6, overflow: 'hidden', cursor: 'pointer', flexShrink: 0,
      border: `2px solid ${selected ? 'var(--gold-500)' : 'var(--border)'}`,
      boxShadow: selected ? '0 0 0 1px #C9A84C' : 'none',
      position: 'relative', background: '#F5F2E8',
    }}>
      {url
        ? <img src={url} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🖼️</div>
      }
      {selected && (
        <div style={{ position: 'absolute', top: 3, right: 3, width: 18, height: 18, borderRadius: '50%', background: 'var(--gold-500)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--card-bg)', fontWeight: 700, lineHeight: 1 }}>✓</div>
      )}
      {file.subcategory && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(10,31,68,0.65)', fontSize: 9, color: 'var(--card-bg)', textAlign: 'center', padding: '2px 4px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.subcategory}</div>
      )}
    </div>
  );
}

export default function DrawPackagePickerModal({ job, draw, existingPkg, onClose }) {
  const [jobFiles, setJobFiles]       = useState([]);
  const [compFiles, setCompFiles]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState(new Set());
  const [txAmounts, setTxAmounts]     = useState(new Map());

  // Build/save state
  const [saving, setSaving]           = useState(false);
  const [savedThisSession, setSavedThisSession] = useState(false);
  const [saveError, setSaveError]     = useState(null);
  const [savedPath, setSavedPath]     = useState(null);
  const [savedPkgId, setSavedPkgId]  = useState(null);
  const [previewing, setPreviewing]   = useState(false);

  // Send form
  const [sendOpen, setSendOpen]       = useState(false);
  const [recipEmail, setRecipEmail]   = useState('');
  const [recipLabel, setRecipLabel]   = useState('');
  const [message, setMessage]         = useState('');
  const [sending, setSending]         = useState(false);
  const [sendError, setSendError]     = useState(null);
  const [sentInfo, setSentInfo]       = useState(null);

  // Search
  const [search, setSearch]           = useState('');

  // Manual attachment upload
  const [uploading, setUploading]     = useState(false);
  const fileInputRef                  = useRef(null);

  // Copy link
  const [copied, setCopied]           = useState(false);
  const [copying, setCopying]         = useState(false);

  const hasSaved = savedThisSession || !!(existingPkg?.generated_pdf_path);
  const activePkgId = savedPkgId || existingPkg?.id;
  const activePath  = savedPath  || existingPkg?.generated_pdf_path;

  useEffect(() => { loadFiles(); }, [job.id]);

  useEffect(() => {
    if (existingPkg?.status === 'sent') {
      setSentInfo({ email: existingPkg.recipient_email, label: existingPkg.recipient_label || existingPkg.recipient_email });
    }
  }, [existingPkg]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const [jfRes, cfRes, liRes] = await Promise.all([
        sb.from('job_files')
          .select('id, category, subcategory, mime_type, name, storage_path, storage_bucket, related_entity_type, related_entity_id')
          .eq('job_id', job.id)
          .eq('lifecycle_status', 'active')
          .neq('category', 'Draws')
          .order('category').order('created_at'),
        sb.from('company_files')
          .select('id, category, type, name, storage_path, storage_bucket, mime_type')
          .eq('tenant_id', AV_TENANT)
          .eq('lifecycle_status', 'active')
          .in('category', COMPLIANCE_CATS)
          .order('category').order('type'),
        sb.from('draw_line_items')
          .select('transaction_id')
          .eq('draw_id', draw.id)
          .not('transaction_id', 'is', null),
      ]);
      const files = jfRes.data || [];
      setJobFiles(files);
      setCompFiles(cfRes.data || []);

      // Fetch amounts for all receipt files linked to transactions
      const linkedTxIds = [...new Set(
        files
          .filter(f => f.related_entity_type === 'job_transaction' && f.related_entity_id)
          .map(f => f.related_entity_id)
      )];
      if (linkedTxIds.length > 0) {
        const { data: txData } = await sb.from('job_transactions')
          .select('id, amount, date_incurred')
          .in('id', linkedTxIds);
        if (txData) {
          setTxAmounts(new Map(txData.map(tx => [tx.id, { amount: tx.amount, date: tx.date_incurred }])));
        }
      }

      // Auto-select receipt files that belong to this draw's line items
      const drawTxIds = new Set((liRes.data || []).map(li => li.transaction_id));
      if (drawTxIds.size > 0) {
        const autoKeys = files
          .filter(f => f.related_entity_type === 'job_transaction' && drawTxIds.has(f.related_entity_id))
          .map(f => `job_file:${f.id}`);
        if (autoKeys.length > 0) {
          setSelected(prev => {
            const next = new Set(prev);
            autoKeys.forEach(k => next.add(k));
            return next;
          });
        }
      }
    } catch (e) {
      setSaveError(e.message || 'Failed to load files.');
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

  // Manual attachment: upload a file (e.g. a sub's invoice) → job_files → pre-selected for this draw.
  const handleAddAttachment = async (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    if (sentInfo) { setSaveError('Package already sent — start a new draw to add files.'); return; }
    if (selected.size >= MAX_ATTACHMENTS) { setSaveError(`Attachment limit reached (${MAX_ATTACHMENTS}).`); return; }
    setUploading(true); setSaveError(null);
    const prepared = await downscaleImage(file);
    const res = await sbUploadDrawAttachment(job.id, prepared, 'Documents');
    setUploading(false);
    if (!res.ok) { setSaveError(res.error || 'Upload failed'); return; }
    setJobFiles(prev => [res.data, ...prev]);
    setSelected(prev => { const next = new Set(prev); next.add(`job_file:${res.data.id}`); return next; });
  };

  const buildFileRefs = () => {
    const refs = [];
    for (const key of selected) {
      const [source, id] = key.split(':');
      const ref = { id, source };
      if (source === 'job_file') {
        const file = jobFiles.find(f => f.id === id);
        if (file?.related_entity_type === 'job_transaction') {
          const tx = txAmounts.get(file.related_entity_id);
          if (tx) { ref.amount = tx.amount; ref.date = tx.date; }
        }
      }
      refs.push(ref);
    }
    return refs;
  };

  const handleSave = async () => {
    setSaving(true); setSaveError(null);
    try {
      const result = await sbBuildDrawPackage(draw.id, job.id, null, buildFileRefs());
      const pdfPath = `${job.id}/${draw.id}/cover.pdf`;
      const saveRes = await sbSaveDrawPackageToFiles(job.id, result.draw_package_id, pdfPath, draw.draw_number);
      if (!saveRes.ok) throw new Error(saveRes.error);
      setSavedPkgId(result.draw_package_id);
      setSavedPath(pdfPath);
      setSavedThisSession(true);
    } catch (e) {
      setSaveError(e.message || 'Save failed.');
    } finally { setSaving(false); }
  };

  const handlePreviewSaved = async () => {
    if (!activePath) return;
    setPreviewing(true);
    try {
      const url = await sbGetDrawPackageSignedUrl(activePath);
      window.open(url, '_blank');
    } catch (e) {
      setSaveError(e.message || 'Preview failed.');
    } finally { setPreviewing(false); }
  };

  const handleDownload = async () => {
    if (!activePath) return;
    try {
      const filename = `draw-${draw.draw_number}${draw.title ? '-' + draw.title.replace(/\s+/g, '-') : ''}.pdf`;
      const url = await sbGetDrawPackageSignedUrl(activePath, filename);
      window.location.href = url;
    } catch (e) { alert(e.message || 'Download failed.'); }
  };

  const handleCopyLink = async () => {
    if (!activePath) return;
    setCopying(true);
    try {
      const url = await sbGetDrawPackageSignedUrl(activePath);
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* ignore */
    } finally { setCopying(false); }
  };

  const handleSend = async () => {
    if (!recipEmail.trim()) { setSendError('Recipient email is required.'); return; }
    setSending(true); setSendError(null);
    try {
      if (!activePkgId) throw new Error('Save the package first.');
      await sbSendDrawPackage(activePkgId, recipEmail.trim(), recipLabel.trim(), message.trim() || null);
      setSentInfo({ email: recipEmail.trim(), label: recipLabel.trim() || recipEmail.trim() });
      setSendOpen(false);
    } catch (e) {
      setSendError(e.message || 'Send failed.');
    } finally { setSending(false); }
  };

  const q = search.trim().toLowerCase();
  const matchesSearch = (f) => {
    if (!q) return true;
    if ((f.name || '').toLowerCase().includes(q)) return true;
    const tx = f.related_entity_type === 'job_transaction' ? txAmounts.get(f.related_entity_id) : null;
    if (tx?.date && tx.date.includes(q)) return true;
    if (tx?.amount != null && String(tx.amount).includes(q)) return true;
    if (tx?.date) {
      const dateStr = new Date(tx.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toLowerCase();
      if (dateStr.includes(q)) return true;
    }
    return false;
  };

  const jobGroups = {};
  for (const f of jobFiles) {
    if (!matchesSearch(f)) continue;
    const c = f.category || 'Other';
    if (!jobGroups[c]) jobGroups[c] = [];
    jobGroups[c].push(f);
  }
  const jobCats = Object.keys(jobGroups).sort();

  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 580, width: '100%', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid #E8E4DC', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy-900)' }}>Draw Package — Draw #{draw.draw_number}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, marginBottom: 10 }}>{draw.title || job.address}</div>
          <input
            className="finp"
            type="search"
            placeholder="Search by name, date, or amount…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', fontSize: 13 }}
          />
        </div>

        {/* Action Panel — only when package is saved */}
        {hasSaved && (
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #E8E4DC', flexShrink: 0, background: 'var(--green-bg-soft)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-text-strong)' }}>
                  {sentInfo ? `✓ Sent to ${sentInfo.label}` : '✓ Saved'}
                </div>
                {existingPkg?.sent_at && !sentInfo && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                    Previously sent to {existingPkg.recipient_label || existingPkg.recipient_email}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={handlePreviewSaved} disabled={previewing} className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>
                  {previewing ? '…' : 'Preview'}
                </button>
                <button onClick={handleDownload} className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>Download</button>
                <button onClick={handleCopyLink} disabled={copying} className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px', color: copied ? 'var(--green-text-strong)' : undefined }}>
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
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy-900)', marginBottom: 10 }}>Send draw package to</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Recipient email *</div>
                    <input className="finp" type="email" placeholder="bank@example.com" value={recipEmail} onChange={e => setRecipEmail(e.target.value)} style={{ width: '100%', fontSize: 12 }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Recipient label</div>
                    <input className="finp" type="text" placeholder="First National Bank" value={recipLabel} onChange={e => setRecipLabel(e.target.value)} style={{ width: '100%', fontSize: 12 }} />
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Message (optional)</div>
                  <textarea className="finp" placeholder="Please find our draw package attached for your review." value={message} onChange={e => setMessage(e.target.value)} rows={2} style={{ width: '100%', fontSize: 12, resize: 'vertical' }} />
                </div>
                {sendError && <div style={{ fontSize: 12, color: 'var(--red-text-strong)', marginBottom: 8 }}>{sendError}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button onClick={() => setSendOpen(false)} className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}>Cancel</button>
                  <button onClick={handleSend} disabled={sending} className="btn btn-gold" style={{ fontSize: 12, padding: '6px 16px', opacity: sending ? 0.6 : 1 }}>
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
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-subtle)', fontSize: 13 }}>Loading files...</div>
          ) : (
            <>
              {/* Job Files */}
              <div style={{ marginBottom: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Job Files</div>
                  <input ref={fileInputRef} type="file" accept="image/*,application/pdf" onChange={handleAddAttachment} style={{ display: 'none' }} />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || !!sentInfo || selected.size >= MAX_ATTACHMENTS}
                    title={sentInfo ? 'Package already sent' : selected.size >= MAX_ATTACHMENTS ? `Limit ${MAX_ATTACHMENTS}` : 'Upload an invoice or photo and attach it'}
                    style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--gold-500)', background: '#C9A84C15', color: 'var(--amber-text-strong)', cursor: (uploading || sentInfo || selected.size >= MAX_ATTACHMENTS) ? 'not-allowed' : 'pointer', opacity: (uploading || sentInfo || selected.size >= MAX_ATTACHMENTS) ? 0.5 : 1 }}
                  >{uploading ? 'Uploading…' : '+ Add attachment'}</button>
                </div>
                {jobFiles.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-subtle)', fontStyle: 'italic' }}>No files on this job.</div>
                ) : (
                  jobCats.map(cat => {
                    const files = jobGroups[cat];
                    const isPhotoGroup = cat === 'Photos';
                    return (
                      <div key={cat} style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }} onClick={() => toggleAll(files, 'job_file')}>
                          <input type="checkbox" readOnly checked={files.every(f => isSelected('job_file', f.id))} style={{ cursor: 'pointer', accentColor: 'var(--gold-500)' }} />
                          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{cat}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>({files.length})</span>
                        </div>
                        {isPhotoGroup ? (
                          <div style={{ paddingLeft: 20, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {files.map(f => (
                              <PhotoThumb key={f.id} file={f} selected={isSelected('job_file', f.id)} onToggle={() => toggleFile('job_file', f.id)} />
                            ))}
                          </div>
                        ) : (
                          <div style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {[...files].sort((a, b) => {
                              const dateA = txAmounts.get(a.related_entity_id)?.date ?? '';
                              const dateB = txAmounts.get(b.related_entity_id)?.date ?? '';
                              return dateB.localeCompare(dateA);
                            }).map(f => {
                              const tx = f.related_entity_type === 'job_transaction'
                                ? txAmounts.get(f.related_entity_id)
                                : null;
                              const dateStr = tx?.date
                                ? new Date(tx.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                : null;
                              return (
                                <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '5px 10px', borderRadius: 6, background: isSelected('job_file', f.id) ? 'var(--cream-banner)' : 'var(--card-bg)', border: `1px solid ${isSelected('job_file', f.id) ? 'var(--gold-500)' : 'var(--border)'}` }}>
                                  <input type="checkbox" checked={isSelected('job_file', f.id)} onChange={() => toggleFile('job_file', f.id)} style={{ cursor: 'pointer', accentColor: 'var(--gold-500)' }} />
                                  <span style={{ fontSize: 12, color: 'var(--navy-900)', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name || '(unnamed)'}</span>
                                  {dateStr && (
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{dateStr}</span>
                                  )}
                                  {tx?.amount != null && (
                                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--navy-900)', flexShrink: 0 }}>
                                      ${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  )}
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Compliance Docs */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Compliance Documents</div>
                {compFiles.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-subtle)', fontStyle: 'italic' }}>No Insurance, License, or Compliance documents on file.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {compFiles.filter(f => !q || (f.name || '').toLowerCase().includes(q)).map(f => (
                      <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '5px 10px', borderRadius: 6, background: isSelected('company_file', f.id) ? 'var(--cream-banner)' : 'var(--card-bg)', border: `1px solid ${isSelected('company_file', f.id) ? 'var(--gold-500)' : 'var(--border)'}` }}>
                        <input type="checkbox" checked={isSelected('company_file', f.id)} onChange={() => toggleFile('company_file', f.id)} style={{ cursor: 'pointer', accentColor: 'var(--gold-500)' }} />
                        <span style={{ fontSize: 12, color: 'var(--navy-900)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name || '(unnamed)'}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {(() => {
          const MAX = MAX_ATTACHMENTS;
          const overCap = selected.size > MAX;
          const atCap   = selected.size === MAX;
          return (
            <div style={{ padding: '12px 20px', borderTop: '1px solid #E8E4DC', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, background: 'var(--bg)', gap: 8 }}>
              <div style={{ fontSize: 12, flexShrink: 0 }}>
                {selected.size === 0
                  ? <span style={{ color: 'var(--text-muted)' }}>Cover sheet only</span>
                  : <span style={{ color: overCap ? 'var(--red-text)' : atCap ? 'var(--amber-text-strong)' : 'var(--text-muted)' }}>
                      {selected.size} / {MAX} attachments
                      {overCap && ' — too many for email'}
                    </span>
                }
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {saveError && <span style={{ fontSize: 11, color: 'var(--red-text)' }}>{saveError}</span>}
                <button onClick={onClose} className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 14px' }}>Close</button>
                <button onClick={handleSave} disabled={saving || overCap} className="btn btn-gold" style={{ fontSize: 12, padding: '6px 16px', opacity: (saving || overCap) ? 0.5 : 1 }}>
                  {saving ? 'Saving...' : savedThisSession ? 'Resave' : 'Save Package'}
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
