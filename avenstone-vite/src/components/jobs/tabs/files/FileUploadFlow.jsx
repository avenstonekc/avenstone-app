import { useState, useRef } from 'react';
import { sbUploadJobFile } from '../../../../lib/supabase';
import { inferFileCategory } from '../../../../lib/jobFiles/inferFileCategory';
import { Ic } from '../../../../lib/utils';
import CategoryPicker from './CategoryPicker';

const ACCEPT = 'image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt';

function ConfidenceBadge({ confidence, source }) {
  const pct = Math.round((confidence || 0) * 100);
  const color = pct >= 80 ? '#22C55E' : pct >= 60 ? '#F59E0B' : '#9CA3AF';
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

export default function FileUploadFlow({ jobId, onClose, onUploaded }) {
  const [stage, setStage] = useState('pick'); // 'pick' | 'review' | 'uploading'
  const [file, setFile] = useState(null);
  const [inferred, setInferred] = useState(null);
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uplPct, setUplPct] = useState(0);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const handleFileChosen = async f => {
    if (!f) return;
    setFile(f);
    setError('');
    try {
      const result = await inferFileCategory({ file: f, jobId, uploadSource: 'manual' });
      setInferred(result);
      setCategory(result.category || '');
      setSubcategory(result.subcategory || null);
    } catch {
      setCategory('Documents');
      setSubcategory(null);
      setInferred(null);
    }
    setStage('review');
  };

  const handleInputChange = e => {
    const f = e.target.files?.[0];
    if (f) handleFileChosen(f);
  };

  const handleDrop = e => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileChosen(f);
  };

  const handleUpload = async () => {
    if (!file || !category) return;
    setUploading(true);
    setUplPct(0);
    setStage('uploading');
    setError('');
    const tick = setInterval(() => setUplPct(p => Math.min(p + 12, 88)), 250);
    try {
      const result = await sbUploadJobFile({
        jobId,
        file,
        category,
        subcategory: subcategory || null,
        uploadSource: 'manual',
      });
      clearInterval(tick);
      setUplPct(100);
      if (result.error) {
        setError(result.error);
        setStage('review');
        setUploading(false);
        return;
      }
      setTimeout(() => {
        onUploaded(result.jobFile);
        onClose();
      }, 300);
    } catch (err) {
      clearInterval(tick);
      setError(err?.message || 'Upload failed');
      setStage('review');
      setUploading(false);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460, width: '100%' }}>
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Upload File</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 18, lineHeight: 1, padding: 4 }}>×</button>
        </div>

        {/* Stage: pick */}
        {stage === 'pick' && (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? '#0A1F44' : '#E8E4DC'}`,
              borderRadius: 8, padding: '36px 20px', textAlign: 'center',
              cursor: 'pointer', background: dragging ? '#F0F4FF' : '#F7F5F0',
              transition: 'all 0.15s', margin: '4px 0 12px',
            }}
          >
            <span style={{ width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, color: '#0A1F44', opacity: 0.5 }}>{Ic.folder}</span>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0A1F44', marginBottom: 4 }}>Drop a file here</div>
            <div style={{ fontSize: 12, color: '#9CA3AF' }}>or click to browse — photos, PDFs, docs</div>
            <input ref={inputRef} type="file" accept={ACCEPT} style={{ display: 'none' }} onChange={handleInputChange} />
          </div>
        )}

        {/* Stage: review */}
        {stage === 'review' && file && (
          <div style={{ margin: '4px 0 12px' }}>
            <div style={{ background: '#F7F5F0', borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44', wordBreak: 'break-all' }}>{file.name}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>
                {file.type || 'unknown type'} · {file.size ? (file.size / 1024).toFixed(0) + ' KB' : ''}
              </div>
              {inferred && (
                <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: '#6B7280' }}>AI suggests:</span>
                  <strong style={{ fontSize: 11, color: '#0A1F44' }}>{inferred.category}{inferred.subcategory ? ` / ${inferred.subcategory}` : ''}</strong>
                  <ConfidenceBadge confidence={inferred.confidence} source={inferred.source} />
                </div>
              )}
            </div>

            <CategoryPicker
              category={category}
              subcategory={subcategory}
              onChange={({ category: c, subcategory: s }) => { setCategory(c || ''); setSubcategory(s || null); }}
            />

            {error && (
              <div style={{ marginTop: 10, padding: '8px 12px', background: '#FEE2E2', color: '#991b1b', borderRadius: 6, fontSize: 12 }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button
                onClick={handleUpload}
                disabled={!category}
                className="btn btn-navy"
                style={{ flex: 1, opacity: category ? 1 : 0.45 }}
              >
                Upload
              </button>
              <button onClick={() => setStage('pick')} className="btn btn-ghost">Back</button>
            </div>
          </div>
        )}

        {/* Stage: uploading */}
        {stage === 'uploading' && (
          <div style={{ padding: '24px 0 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44', marginBottom: 12 }}>Uploading…</div>
            <div style={{ background: '#E8E4DC', borderRadius: 6, height: 8, overflow: 'hidden', marginBottom: 6 }}>
              <div style={{ height: '100%', background: '#0A1F44', borderRadius: 6, width: `${uplPct}%`, transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontSize: 11, color: '#9CA3AF' }}>{uplPct}%</div>
          </div>
        )}
      </div>
    </div>
  );
}
