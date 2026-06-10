import { useState, useEffect } from 'react';
import { sb, AV_TENANT, sbSignJobFileUrl, sbCategorizeJobFile, sbDeleteJobFile } from '../../../../lib/supabase';
import { Ic, fDT } from '../../../../lib/utils';
import CategoryPicker from './CategoryPicker';

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FileDetailPanel({ fileId, onClose, onUpdated, onDeleted, folderFiles, onFileChange }) {
  const [file, setFile] = useState(null);
  const [signedUrl, setSignedUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recatOpen, setRecatOpen] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [newSub, setNewSub] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);

  // Keyboard nav — ArrowLeft/Right cycle through folder, Escape closes
  useEffect(() => {
    if (!folderFiles?.length || !onFileChange) return;
    const handler = e => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const idx = folderFiles.findIndex(f => f.id === fileId);
        if (idx === -1) return;
        const next = e.key === 'ArrowRight'
          ? (idx + 1) % folderFiles.length
          : (idx - 1 + folderFiles.length) % folderFiles.length;
        onFileChange(folderFiles[next].id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [fileId, folderFiles, onFileChange, onClose]);

  useEffect(() => {
    if (!fileId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setSignedUrl(null);

    sb.from('job_files').select('*').eq('id', fileId).single().then(({ data, error: err }) => {
      if (cancelled) return;
      if (err || !data) { setError('File not found'); setLoading(false); return; }
      setFile(data);
      setNewCat(data.category || '');
      setNewSub(data.subcategory || null);
      setLoading(false);
      // Load signed URL
      sbSignJobFileUrl(fileId, 3600 * 24 * 7).then(r => {
        if (!cancelled) setSignedUrl(r.url || null);
      }).catch(() => {});
    });

    return () => { cancelled = true; };
  }, [fileId]);

  const handleToggleVisible = async () => {
    if (!file || toggling) return;
    setToggling(true);
    const newVal = !file.client_visible;
    const { error: err } = await sb.from('job_files')
      .update({ client_visible: newVal })
      .eq('id', fileId);
    setToggling(false);
    if (err) { setError('Failed to update visibility'); return; }
    const updated = { ...file, client_visible: newVal };
    setFile(updated);
    onUpdated?.(updated);
  };

  const handleRecategorize = async () => {
    if (!newCat || saving) return;
    setSaving(true);
    const result = await sbCategorizeJobFile(fileId, { category: newCat, subcategory: newSub });
    setSaving(false);
    if (result.error) { setError(result.error); return; }
    const updated = { ...file, category: newCat, subcategory: newSub };
    setFile(updated);
    onUpdated?.(updated);
    setRecatOpen(false);
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${file?.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    const result = await sbDeleteJobFile(fileId);
    setDeleting(false);
    if (result.error) { setError(result.error); return; }
    onDeleted?.(fileId);
    onClose();
  };

  const isImage = file?.mime_type?.startsWith('image/');

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 500, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#fff', zIndex: 1, borderBottom: '1px solid #E8E4DC', paddingBottom: 12, marginBottom: 0 }}>
          <span style={{ fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '85%' }}>
            {loading ? 'Loading…' : (file?.name || 'File')}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', fontSize: 18, lineHeight: 1, padding: 4, flexShrink: 0 }}>×</button>
        </div>

        {loading && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-subtle)' }}>
            <div style={{ width: 24, height: 24, border: '2px solid #C9A84C', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 12px' }} />
            Loading file…
          </div>
        )}

        {error && !loading && (
          <div style={{ margin: 16, padding: '10px 14px', background: '#FEE2E2', color: '#991b1b', borderRadius: 6, fontSize: 13 }}>{error}</div>
        )}

        {!loading && file && (
          <div style={{ padding: '12px 0' }}>
            {/* Preview */}
            <div style={{ margin: '0 0 14px', borderRadius: 8, overflow: 'hidden', background: '#F7F5F0', minHeight: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isImage && signedUrl ? (
                <img src={signedUrl} alt={file.name} style={{ maxWidth: '100%', maxHeight: 280, objectFit: 'contain', display: 'block', margin: '0 auto' }} />
              ) : isImage && !signedUrl ? (
                <div style={{ padding: '40px 0', color: 'var(--text-subtle)', textAlign: 'center' }}>
                  <div style={{ width: 20, height: 20, border: '2px solid #C9A84C', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 8px' }} />
                  <div style={{ fontSize: 12 }}>Loading preview…</div>
                </div>
              ) : (
                <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-subtle)' }}>
                  <span style={{ width: 36, height: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, opacity: 0.5 }}>{Ic.doc}</span>
                  <div style={{ fontSize: 12 }}>{file.mime_type || 'File'}</div>
                  {signedUrl && (
                    <a href={signedUrl} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-block', marginTop: 10, fontSize: 12, color: 'var(--navy-900)', textDecoration: 'underline' }}>
                      Open file ↗
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Metadata */}
            <div style={{ background: '#F7F5F0', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#374151' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
                <div><span style={{ color: 'var(--text-subtle)' }}>Category</span><br /><strong>{file.category}{file.subcategory ? ` / ${file.subcategory}` : ''}</strong></div>
                {file.size_bytes && <div><span style={{ color: 'var(--text-subtle)' }}>Size</span><br /><strong>{formatBytes(file.size_bytes)}</strong></div>}
                <div><span style={{ color: 'var(--text-subtle)' }}>Uploaded</span><br /><strong>{fDT(file.created_at)}</strong></div>
                {file.ai_confidence && <div><span style={{ color: 'var(--text-subtle)' }}>AI confidence</span><br /><strong>{Math.round(file.ai_confidence * 100)}%</strong></div>}
              </div>
            </div>

            {/* Client visible toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#fff', border: '1px solid #E8E4DC', borderRadius: 8, marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy-900)' }}>Client visible</div>
                <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>Show this file in the client portal</div>
              </div>
              <button
                onClick={handleToggleVisible}
                disabled={toggling}
                style={{
                  width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: file.client_visible ? 'var(--navy-900)' : 'var(--border)',
                  position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                  opacity: toggling ? 0.6 : 1,
                }}
              >
                <span style={{
                  position: 'absolute', top: 3, width: 18, height: 18, borderRadius: '50%', background: '#fff',
                  transition: 'left 0.2s', left: file.client_visible ? 23 : 3,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                }} />
              </button>
            </div>

            {/* Re-categorize */}
            <div style={{ border: '1px solid #E8E4DC', borderRadius: 8, marginBottom: 10, overflow: 'hidden' }}>
              <button
                onClick={() => setRecatOpen(v => !v)}
                style={{ width: '100%', background: '#F7F5F0', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'var(--navy-900)' }}
              >
                Re-categorize
                <span style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', color: 'var(--text-subtle)', transform: recatOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>{Ic.chev}</span>
              </button>
              {recatOpen && (
                <div style={{ padding: '12px 14px', borderTop: '1px solid #E8E4DC' }}>
                  <CategoryPicker
                    category={newCat}
                    subcategory={newSub}
                    onChange={({ category: c, subcategory: s }) => { setNewCat(c || ''); setNewSub(s || null); }}
                  />
                  <button
                    onClick={handleRecategorize}
                    disabled={saving || !newCat}
                    className="btn btn-navy"
                    style={{ marginTop: 10, width: '100%', opacity: (saving || !newCat) ? 0.45 : 1 }}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                </div>
              )}
            </div>

            {/* Delete */}
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{ width: '100%', padding: '10px 14px', background: '#FEF2F2', color: '#991b1b', border: '1px solid #FECACA', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: deleting ? 0.6 : 1 }}
            >
              {deleting ? 'Deleting…' : '🗑 Delete file'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
