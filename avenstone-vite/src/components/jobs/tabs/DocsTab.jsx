import { useState, useEffect, useRef } from 'react';
import { sbLoadDocs, sbUploadDoc, sbDelDoc, sbToggleDocVisible, DOC_TYPES, docTypeColor } from '../../../lib/supabase';
import { Ic, fD } from '../../../lib/utils';

export default function DocsTab({ job, docs, setDocs, docsLoaded, setDocsLoaded }) {
  const [docUpl, setDocUpl] = useState(false);
  const [docUplPct, setDocUplPct] = useState(0);
  const [docType, setDocType] = useState('other');
  const [docErr, setDocErr] = useState('');
  const docRef = useRef();

  useEffect(() => {
    if (docsLoaded) return;
    sbLoadDocs(job.id).then(d => { setDocs(d); setDocsLoaded(true); });
  }, [docsLoaded]);

  const onDocFile = async e => {
    const file = e.target.files[0];
    if (!file) return;
    setDocUpl(true); setDocErr(''); setDocUplPct(0);
    const tick = setInterval(() => setDocUplPct(p => Math.min(p + 15, 85)), 200);
    const { doc, error } = await sbUploadDoc(job.id, file, docType);
    clearInterval(tick); setDocUplPct(100);
    if (error) { setDocErr(error); setDocUpl(false); setDocUplPct(0); return; }
    setDocs(p => [doc, ...p]);
    setDocUpl(false); setDocUplPct(0);
    docRef.current.value = '';
  };

  const delDoc = async doc => {
    if (!window.confirm(`Delete "${doc.name}"?`)) return;
    await sbDelDoc(doc);
    setDocs(p => p.filter(d => d.id !== doc.id));
  };

  const toggleDocVisible = async doc => {
    const val = !doc.client_visible;
    await sbToggleDocVisible(doc.id, val);
    setDocs(p => p.map(d => d.id === doc.id ? { ...d, client_visible: val } : d));
  };

  const ssty = { appearance: 'none', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 32 };

  return (
    <div>
      <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="fg" style={{ flex: 1, minWidth: 140, marginBottom: 0 }}>
            <label className="flbl">File Type</label>
            <select className="finp" value={docType} onChange={e => setDocType(e.target.value)} style={ssty}>
              {DOC_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
          </div>
          <input ref={docRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.dwg,.csv" onChange={onDocFile} style={{ display: 'none' }} />
          <button className="btn btn-navy" style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }} onClick={() => docRef.current.click()} disabled={docUpl}>
            <span style={{ width: 14, height: 14 }}>{Ic.plus}</span>{docUpl ? 'Uploading...' : 'Upload Document'}
          </button>
        </div>
        {docUpl && <div className="upbar" style={{ marginTop: 10, marginBottom: 0 }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>Uploading</span><span style={{ fontSize: 11, color: '#C9A84C', fontWeight: 700 }}>{docUplPct}%</span></div><div className="uptr"><div className="upfl" style={{ width: `${docUplPct}%` }} /></div></div>}
        {docErr && <div style={{ marginTop: 8, background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', padding: '8px 12px', fontSize: 12 }}>{docErr}</div>}
      </div>
      {!docsLoaded && <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF', fontSize: 13 }}>Loading documents...</div>}
      {docsLoaded && !docs.length && <div className="empty">{Ic.folder}<div className="empty-t">No documents yet</div><div>Upload plans, permits, contracts, and specs</div></div>}
      {docsLoaded && docs.map(d => (
        <div key={d.id} className="doc-item">
          <span className="doc-type" style={{ background: docTypeColor(d.file_type) + '18', color: docTypeColor(d.file_type) }}>{d.file_type}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="doc-name">{d.name}</div>
            <div className="doc-meta">
              {d.version > 1 && <span style={{ marginRight: 8, color: '#C9A84C', fontWeight: 600 }}>v{d.version}</span>}
              {fD(d.created_at)}
              {d.client_visible && <span style={{ marginLeft: 8, color: '#22c55e', fontWeight: 600 }}>· Client visible</span>}
            </div>
          </div>
          <div className="doc-actions">
            <button title={d.client_visible ? 'Hide from client' : 'Show to client'} onClick={() => toggleDocVisible(d)} style={{ background: d.client_visible ? 'rgba(34,197,94,0.1)' : 'transparent', border: `1px solid ${d.client_visible ? '#22c55e' : '#E8E4DC'}`, color: d.client_visible ? '#22c55e' : '#9CA3AF', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <span style={{ width: 14, height: 14, display: 'flex' }}>{Ic.eye}</span>
            </button>
            <a href={d.signed_url || d.file_url} target="_blank" rel="noreferrer" title="Download" style={{ background: 'transparent', border: '1px solid #E8E4DC', color: '#0A1F44', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', flexShrink: 0 }}>
              <span style={{ width: 14, height: 14, display: 'flex' }}>{Ic.dl}</span>
            </a>
            <button title="Delete" onClick={() => delDoc(d)} style={{ background: 'transparent', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
              <span style={{ width: 13, height: 13, display: 'flex' }}>{Ic.trash}</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
