import { useState, useRef, useEffect } from 'react';
import { sbUploadJobFile } from '../../../../lib/supabase';
import { inferFileCategory } from '../../../../lib/jobFiles/inferFileCategory';
import { Ic } from '../../../../lib/utils';
import CategoryPicker from './CategoryPicker';

const ACCEPT = 'image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt';

function ConfidenceBadge({ confidence, source }) {
  const pct = Math.round((confidence || 0) * 100);
  const color = pct >= 80 ? '#22C55E' : pct >= 60 ? '#F59E0B' : 'var(--text-subtle)';
  if (source === 'rule') return (
    <span style={{ fontSize: 10, background: '#D1FAE5', color: '#065F46', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>Rule-matched</span>
  );
  if (source === 'phase') return (
    <span style={{ fontSize: 10, background: '#DBEAFE', color: '#1E3A8A', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>Phase-matched</span>
  );
  return (
    <span style={{ fontSize: 10, background: '#F3F4F6', color, borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>{pct}% confidence</span>
  );
}

/**
 * FileUploadFlow — handles single or multi-file upload with AI categorization preview.
 *
 * Props:
 *   jobId          — required
 *   onClose        — called when the user dismisses or upload completes
 *   onUploaded     — called once per successfully uploaded file with the jobFile object
 *   preloadedFiles — optional File[] to pre-load, skipping the pick stage
 */
export default function FileUploadFlow({ jobId, onClose, onUploaded, preloadedFiles }) {
  // fileItems: [{id, file, inferred, category, subcategory}]
  const [fileItems, setFileItems] = useState([]);
  const [stage, setStage] = useState('pick'); // 'pick' | 'review' | 'uploading'
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();
  const initRef = useRef(false);

  // If preloadedFiles provided, skip pick stage on mount
  useEffect(() => {
    if (preloadedFiles?.length > 0 && !initRef.current) {
      initRef.current = true;
      handleFilesChosen(preloadedFiles);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Accept File[] from any source (picker, drop, camera, preload).
   * Sets stage to review immediately; inference fills in per-file as it completes.
   */
  const handleFilesChosen = (files) => {
    const arr = Array.from(files).filter(Boolean);
    if (!arr.length) return;
    setError('');

    // Build initial items with no inference yet
    const ids = arr.map(() => crypto.randomUUID());
    const initial = arr.map((f, i) => ({
      id: ids[i], file: f, inferred: null, category: '', subcategory: null,
    }));
    setFileItems(initial);
    setStage('review');

    // Run inference per-file; update state as each completes without clobbering edits
    arr.forEach(async (f, i) => {
      try {
        const result = await inferFileCategory({ file: f, jobId, uploadSource: 'manual' });
        setFileItems(prev => prev.map(item =>
          item.id !== ids[i] ? item : {
            ...item,
            inferred: result,
            // Only set if user hasn't already chosen a category
            category: item.category || result.category || '',
            subcategory: item.subcategory !== null ? item.subcategory : (result.subcategory || null),
          }
        ));
      } catch {
        setFileItems(prev => prev.map(item =>
          item.id !== ids[i] ? item : {
            ...item, inferred: null,
            category: item.category || 'Documents',
            subcategory: item.subcategory || null,
          }
        ));
      }
    });
  };

  const handleInputChange = e => {
    if (e.target.files?.length > 0) handleFilesChosen(e.target.files);
    // Reset input so the same file can be re-selected (important for camera re-capture)
    e.target.value = '';
  };

  const handleDrop = e => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length > 0) handleFilesChosen(e.dataTransfer.files);
  };

  const updateItem = (id, patch) => {
    setFileItems(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item));
  };

  const removeItem = (id) => {
    setFileItems(prev => {
      const next = prev.filter(item => item.id !== id);
      if (!next.length) { setStage('pick'); setError(''); }
      return next;
    });
  };

  const allCategorized = fileItems.length > 0 && fileItems.every(item => !!item.category);

  const handleUpload = async () => {
    if (!allCategorized) return;
    setStage('uploading');
    setError('');
    setUploadProgress({ done: 0, total: fileItems.length });
    const errors = [];
    for (let i = 0; i < fileItems.length; i++) {
      const item = fileItems[i];
      try {
        const result = await sbUploadJobFile({
          jobId,
          file: item.file,
          category: item.category,
          subcategory: item.subcategory || null,
          uploadSource: 'manual',
        });
        if (!result.ok) {
          errors.push(`${item.file.name}: ${result.error || 'Upload failed'}`);
        } else if (result.data) {
          onUploaded(result.data);
        }
      } catch (err) {
        errors.push(`${item.file.name}: ${err?.message || 'Upload failed'}`);
      }
      setUploadProgress({ done: i + 1, total: fileItems.length });
    }
    if (errors.length) {
      setError(errors.join('\n'));
      setStage('review');
    } else {
      onClose();
    }
  };

  const pct = uploadProgress.total > 0
    ? Math.round((uploadProgress.done / uploadProgress.total) * 100)
    : 0;

  return (
    <div className="overlay">
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 480, width: '100%' }}
      >
        {/* Title */}
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>
            {stage === 'pick'
              ? 'Upload File'
              : stage === 'uploading'
                ? 'Uploading…'
                : `Review ${fileItems.length} file${fileItems.length !== 1 ? 's' : ''}`}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', fontSize: 18, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {/* ── Stage: pick ───────────────────────────────────────────────── */}
        {stage === 'pick' && (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? 'var(--navy-900)' : 'var(--border)'}`,
              borderRadius: 8, padding: '36px 20px', textAlign: 'center',
              cursor: 'pointer', background: dragging ? '#F0F4FF' : '#F7F5F0',
              transition: 'all 0.15s', margin: '4px 0 12px',
            }}
          >
            <span style={{ width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, color: 'var(--navy-900)', opacity: 0.5 }}>
              {Ic.folder}
            </span>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy-900)', marginBottom: 4 }}>Drop files here</div>
            <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>or click to browse — photos, PDFs, docs</div>
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              multiple
              style={{ display: 'none' }}
              onChange={handleInputChange}
            />
          </div>
        )}

        {/* ── Stage: review ─────────────────────────────────────────────── */}
        {stage === 'review' && fileItems.length > 0 && (
          <div style={{ margin: '4px 0 0' }}>
            {/* Scrollable file list */}
            <div style={{ maxHeight: '55vh', overflowY: 'auto', paddingBottom: 4 }}>
              {fileItems.map(item => (
                <div
                  key={item.id}
                  style={{
                    background: '#F7F5F0', borderRadius: 8, padding: '12px 14px', marginBottom: 10,
                    border: item.category ? '1px solid #E8E4DC' : '1px solid #FCA5A5',
                  }}
                >
                  {/* File header row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy-900)', wordBreak: 'break-all' }}>
                        {item.file.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>
                        {item.file.type || 'unknown type'}
                        {item.file.size ? ` · ${(item.file.size / 1024).toFixed(0)} KB` : ''}
                      </div>
                      {!item.inferred && (
                        <div style={{ fontSize: 10, color: 'var(--text-subtle)', marginTop: 4, fontStyle: 'italic' }}>
                          Categorizing…
                        </div>
                      )}
                      {item.inferred && (
                        <div style={{ marginTop: 4, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>AI suggests:</span>
                          <strong style={{ fontSize: 10, color: 'var(--navy-900)' }}>
                            {item.inferred.category}{item.inferred.subcategory ? ` / ${item.inferred.subcategory}` : ''}
                          </strong>
                          <ConfidenceBadge confidence={item.inferred.confidence} source={item.inferred.source} />
                        </div>
                      )}
                    </div>
                    {fileItems.length > 1 && (
                      <button
                        onClick={() => removeItem(item.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', fontSize: 18, lineHeight: 1, padding: '0 0 0 4px', flexShrink: 0 }}
                      >
                        ×
                      </button>
                    )}
                  </div>

                  <CategoryPicker
                    category={item.category}
                    subcategory={item.subcategory}
                    onChange={({ category: c, subcategory: s }) =>
                      updateItem(item.id, { category: c || '', subcategory: s || null })
                    }
                  />
                </div>
              ))}
            </div>

            {/* Error */}
            {error && (
              <div style={{ marginBottom: 10, padding: '8px 12px', background: '#FEE2E2', color: '#991b1b', borderRadius: 6, fontSize: 12, whiteSpace: 'pre-line' }}>
                {error}
              </div>
            )}

            {/* Sticky action row */}
            <div style={{ display: 'flex', gap: 8, paddingTop: 8 }}>
              <button
                onClick={handleUpload}
                disabled={!allCategorized}
                className="btn btn-navy"
                style={{ flex: 1, opacity: allCategorized ? 1 : 0.45 }}
              >
                Upload {fileItems.length > 1 ? `${fileItems.length} files` : 'file'}
              </button>
              <button
                onClick={() => { setStage('pick'); setFileItems([]); setError(''); }}
                className="btn btn-ghost"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {/* ── Stage: uploading ──────────────────────────────────────────── */}
        {stage === 'uploading' && (
          <div style={{ padding: '24px 0 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy-900)', marginBottom: 12 }}>
              {uploadProgress.done < uploadProgress.total
                ? `Uploading ${uploadProgress.done + 1} of ${uploadProgress.total}…`
                : 'Finishing up…'}
            </div>
            <div style={{ background: 'var(--border)', borderRadius: 6, height: 8, overflow: 'hidden', marginBottom: 6 }}>
              <div style={{
                height: '100%', background: 'var(--navy-900)', borderRadius: 6,
                width: `${pct}%`, transition: 'width 0.3s',
              }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{uploadProgress.done} / {uploadProgress.total}</div>
          </div>
        )}
      </div>
    </div>
  );
}
