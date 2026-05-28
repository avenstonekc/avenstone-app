import { useState, useEffect } from 'react';
import { sb, AV_TENANT, sbBuildDrawPackage } from '../../lib/supabase';

const FILE_ICON = {
  pdf: '📄',
  image: '🖼️',
  other: '📎',
};

const getFileIcon = (mimeType) => {
  if (!mimeType) return FILE_ICON.other;
  if (mimeType === 'application/pdf') return FILE_ICON.pdf;
  if (mimeType.startsWith('image/')) return FILE_ICON.image;
  return FILE_ICON.other;
};

const COMPLIANCE_CATS = ['Insurance', 'License', 'Compliance'];

export default function DrawPackagePickerModal({ job, draw, onClose }) {
  const [jobFiles, setJobFiles]       = useState([]);
  const [compFiles, setCompFiles]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState(new Set());
  const [building, setBuilding]       = useState(false);
  const [error, setError]             = useState(null);

  useEffect(() => {
    load();
  }, [job.id]);

  const load = async () => {
    setLoading(true);
    try {
      const [jfRes, cfRes] = await Promise.all([
        sb.from('job_files')
          .select('id, category, subcategory, mime_type, name, storage_path, storage_bucket')
          .eq('job_id', job.id)
          .eq('lifecycle_status', 'active')
          .order('category')
          .order('created_at'),
        sb.from('company_files')
          .select('id, category, type, name, storage_path, storage_bucket, mime_type')
          .eq('tenant_id', AV_TENANT)
          .eq('lifecycle_status', 'active')
          .in('category', COMPLIANCE_CATS)
          .order('category')
          .order('type'),
      ]);
      setJobFiles(jfRes.data || []);
      setCompFiles(cfRes.data || []);
    } catch (e) {
      setError(e.message || 'Failed to load files.');
    }
    setLoading(false);
  };

  const toggleFile = (source, id) => {
    const key = `${source}:${id}`;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isSelected = (source, id) => selected.has(`${source}:${id}`);

  const toggleAll = (files, source) => {
    const keys = files.map(f => `${source}:${f.id}`);
    const allSelected = keys.every(k => selected.has(k));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) keys.forEach(k => next.delete(k));
      else keys.forEach(k => next.add(k));
      return next;
    });
  };

  const buildFileRefs = () => {
    const refs = [];
    for (const key of selected) {
      const [source, id] = key.split(':');
      refs.push({ id, source });
    }
    return refs;
  };

  const handleBuild = async () => {
    setBuilding(true);
    setError(null);
    try {
      const fileRefs = buildFileRefs();
      const result = await sbBuildDrawPackage(draw.id, job.id, null, fileRefs);
      window.open(result.signed_url, '_blank');
    } catch (e) {
      setError(e.message || 'Failed to build package.');
    } finally {
      setBuilding(false);
    }
  };

  // Group job files by category
  const jobGroups = {};
  for (const f of jobFiles) {
    const cat = f.category || 'Other';
    if (!jobGroups[cat]) jobGroups[cat] = [];
    jobGroups[cat].push(f);
  }
  const jobCats = Object.keys(jobGroups).sort();

  const selCount = selected.size;

  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 560, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid #E8E4DC', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0A1F44' }}>Build Draw Package</div>
          <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>Draw #{draw.draw_number}{draw.title ? ` — ${draw.title}` : ''}</div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF', fontSize: 13 }}>Loading files...</div>
          ) : error ? (
            <div style={{ background: '#FEE2E2', color: '#991b1b', padding: '10px 14px', borderRadius: 6, fontSize: 12 }}>{error}</div>
          ) : (
            <>
              {/* Job Files */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                  Job Files
                </div>

                {jobFiles.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>No files on this job.</div>
                ) : (
                  jobCats.map(cat => (
                    <div key={cat} style={{ marginBottom: 12 }}>
                      <div
                        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, cursor: 'pointer' }}
                        onClick={() => toggleAll(jobGroups[cat], 'job_file')}
                      >
                        <input
                          type="checkbox"
                          readOnly
                          checked={jobGroups[cat].every(f => isSelected('job_file', f.id))}
                          style={{ cursor: 'pointer', accentColor: '#C9A84C' }}
                        />
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{cat}</span>
                        <span style={{ fontSize: 11, color: '#9CA3AF' }}>({jobGroups[cat].length})</span>
                      </div>
                      <div style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {jobGroups[cat].map(f => (
                          <label
                            key={f.id}
                            style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '6px 10px', borderRadius: 6, background: isSelected('job_file', f.id) ? '#FEF9EE' : '#fff', border: `1px solid ${isSelected('job_file', f.id) ? '#C9A84C' : '#E8E4DC'}`, transition: 'all 0.1s' }}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected('job_file', f.id)}
                              onChange={() => toggleFile('job_file', f.id)}
                              style={{ cursor: 'pointer', accentColor: '#C9A84C' }}
                            />
                            <span style={{ fontSize: 14 }}>{getFileIcon(f.mime_type)}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, color: '#0A1F44', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name || '(unnamed)'}</div>
                              {f.subcategory && (
                                <div style={{ fontSize: 10, color: '#C9A84C', fontWeight: 600 }}>{f.subcategory}</div>
                              )}
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
                <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                  Compliance Documents
                </div>

                {compFiles.length === 0 ? (
                  <div style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>No compliance documents on file (Insurance, License, Compliance).</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {compFiles.map(f => (
                      <label
                        key={f.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '6px 10px', borderRadius: 6, background: isSelected('company_file', f.id) ? '#FEF9EE' : '#fff', border: `1px solid ${isSelected('company_file', f.id) ? '#C9A84C' : '#E8E4DC'}`, transition: 'all 0.1s' }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected('company_file', f.id)}
                          onChange={() => toggleFile('company_file', f.id)}
                          style={{ cursor: 'pointer', accentColor: '#C9A84C' }}
                        />
                        <span style={{ fontSize: 14 }}>{getFileIcon(f.mime_type)}</span>
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
            {selCount === 0 ? 'No files selected — cover sheet only' : `${selCount} file${selCount > 1 ? 's' : ''} selected`}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 14px' }}>Cancel</button>
            <button
              onClick={handleBuild}
              disabled={building}
              className="btn btn-gold"
              style={{ fontSize: 12, padding: '6px 16px', opacity: building ? 0.6 : 1 }}
            >
              {building ? 'Building...' : 'Build Package'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
