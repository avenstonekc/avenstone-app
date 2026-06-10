/**
 * COMPANY_FILES_ARC Phase 2 — admin UI for tenant-level compliance documents.
 *
 * Visible to: owner, project_manager, sales_rep (isStaff).
 * Subs and clients never see this surface — they access via Phase 3a/3b.
 *
 * Features:
 *  - File list grouped by category (Insurance / License / Tax / Legal / Compliance / Template / Other)
 *  - Upload modal: file picker, category, type, expiration, 5-role visibility multiselect
 *  - Detail panel: metadata, View File (signed URL), Edit Visibility, Replace, Archive
 *  - Toggle to show archived files
 *  - Visibility chips on each row
 *  - Expiration badge (green / amber-30d / red-expired)
 */

import { useState, useEffect, useRef } from 'react';
import {
  sbUploadCompanyFile, sbLoadCompanyFiles, sbSetCompanyFileRoles,
  sbArchiveCompanyFile, sbReplaceCompanyFile, sbSignCompanyFileUrl,
  sbUpdateCompanyFile,
} from '../../lib/companyFiles.js';
import { isMob } from '../../lib/utils.jsx';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = ['Insurance', 'License', 'Tax', 'Legal', 'Compliance', 'Template', 'Other'];

const ROLE_LABELS = {
  owner:           'Owner',
  project_manager: 'PM',
  sales_rep:       'Sales',
  sub:             'Sub',
  client:          'Client',
};

const ROLE_COLORS = {
  owner:           { bg: 'var(--purple-bg)', color: '#6D28D9' },
  project_manager: { bg: '#DBEAFE',          color: '#1D4ED8' },
  sales_rep:       { bg: 'var(--green-bg)',   color: 'var(--green-text-strong)' },
  sub:             { bg: 'var(--amber-bg)',   color: 'var(--amber-text-strong)' },
  client:          { bg: '#FCE7F3',           color: '#9D174D' },
};

const canManage = (role) => ['owner', 'project_manager'].includes(role);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function VisibilityChips({ roles }) {
  if (!roles || roles.length === 0) {
    return <span style={{ color: 'var(--text-subtle)', fontSize: 11 }}>Owner only</span>;
  }
  return (
    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
      {roles.map(r => {
        const c = ROLE_COLORS[r] || { bg: 'var(--neutral-bg)', color: 'var(--text-secondary)' };
        return (
          <span key={r} style={{ background: c.bg, color: c.color, fontSize: 10, fontWeight: 700,
            padding: '2px 6px', borderRadius: 10, whiteSpace: 'nowrap' }}>
            {ROLE_LABELS[r] || r}
          </span>
        );
      })}
    </div>
  );
}

function ExpirationBadge({ date }) {
  if (!date) return null;
  const d = new Date(date);
  const now = new Date();
  const daysOut = Math.floor((d - now) / 86400000);
  let color = 'var(--green-text)', bg = 'var(--green-bg)';
  if (daysOut < 0)  { color = 'var(--red-strong)'; bg = 'var(--red-bg)'; }
  else if (daysOut <= 30) { color = 'var(--amber-text-strong)'; bg = 'var(--amber-bg)'; }
  return (
    <span style={{ background: bg, color, fontSize: 10, fontWeight: 700, padding: '2px 7px',
      borderRadius: 10, whiteSpace: 'nowrap' }}>
      {daysOut < 0 ? `Expired ${d.toLocaleDateString()}` : `Expires ${d.toLocaleDateString()}`}
    </span>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CompanyFilesScr({ profile }) {
  const mob = isMob();
  const userRole = profile?.role;

  const [files, setFiles]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [err, setErr]                 = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId]   = useState(null);
  const [showUpload, setShowUpload]   = useState(false);

  const load = async () => {
    setLoading(true);
    setErr(null);
    const res = await sbLoadCompanyFiles();
    if (res.ok) setFiles(res.data || []);
    else setErr(res.error || 'Failed to load company files');
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const visibleFiles = showArchived
    ? files
    : files.filter(f => f.lifecycleStatus === 'active');

  // Group by category in display order
  const grouped = CATEGORIES.reduce((acc, cat) => {
    const group = visibleFiles.filter(f => f.category === cat);
    if (group.length > 0) acc[cat] = group;
    return acc;
  }, {});

  const selectedFile = files.find(f => f.id === selectedId) || null;

  return (
    <div style={{ padding: mob ? '16px 14px' : '20px 24px', maxWidth: 860, margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: 'var(--navy-900)' }}>Company Files</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>
            Compliance documents, licenses, and templates — visible to your team and portals.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)',
            cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)}
              style={{ cursor: 'pointer' }} />
            Show archived
          </label>
          {canManage(userRole) && (
            <button onClick={() => setShowUpload(true)} className="btn btn-navy"
              style={{ fontSize: 12, padding: '7px 16px' }}>
              + Upload Company File
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {err && (
        <div style={{ background: 'var(--red-bg)', border: '1px solid #FECACA', color: 'var(--red-strong)',
          padding: '8px 12px', fontSize: 12, marginBottom: 14, borderRadius: 4,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {err}
          <button onClick={() => setErr(null)} style={{ background: 'none', border: 'none',
            color: 'var(--red-strong)', cursor: 'pointer', fontSize: 16 }}>×</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-subtle)', fontSize: 13 }}>
          Loading company files…
        </div>
      )}

      {/* Empty state */}
      {!loading && visibleFiles.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 20px', background: '#fff',
          border: '1px solid #E8E4DC', borderRadius: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
            No company files yet
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginBottom: 16 }}>
            Upload your certificate of insurance, business license, or W-9 to get started.
          </div>
          {canManage(userRole) && (
            <button onClick={() => setShowUpload(true)} className="btn btn-navy"
              style={{ fontSize: 12, padding: '8px 18px' }}>
              + Upload Company File
            </button>
          )}
        </div>
      )}

      {/* File list grouped by category */}
      {!loading && Object.keys(grouped).map(cat => (
        <div key={cat} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase',
            letterSpacing: '0.08em', marginBottom: 8, paddingBottom: 4,
            borderBottom: '1px solid #E8E4DC' }}>
            {cat}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {grouped[cat].map(file => (
              <FileRow
                key={file.id}
                file={file}
                selected={selectedId === file.id}
                onClick={() => setSelectedId(selectedId === file.id ? null : file.id)}
                canManage={canManage(userRole)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Detail panel */}
      {selectedFile && (
        <DetailPanel
          file={selectedFile}
          canManage={canManage(userRole)}
          onClose={() => setSelectedId(null)}
          onRefresh={() => { setSelectedId(null); load(); }}
        />
      )}

      {/* Upload modal */}
      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onSaved={() => { setShowUpload(false); load(); }}
        />
      )}
    </div>
  );
}

// ─── FileRow ─────────────────────────────────────────────────────────────────

function FileRow({ file, selected, onClick, canManage }) {
  const isArchived = file.lifecycleStatus === 'archived';
  return (
    <div
      onClick={onClick}
      style={{
        background: selected ? '#F0F4FF' : '#fff',
        border: `1px solid ${selected ? '#1D4ED8' : 'var(--border)'}`,
        borderRadius: 6, padding: '10px 14px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        opacity: isArchived ? 0.55 : 1, transition: 'all 0.12s',
      }}
    >
      <div style={{ flex: 1, minWidth: 140 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy-900)', display: 'flex',
          alignItems: 'center', gap: 6 }}>
          📄 {file.type}
          {isArchived && (
            <span style={{ background: 'var(--neutral-bg)', color: 'var(--text-subtle)', fontSize: 10, fontWeight: 700,
              padding: '1px 6px', borderRadius: 10 }}>ARCHIVED</span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{file.name}</div>
      </div>
      <ExpirationBadge date={file.expirationDate} />
      <VisibilityChips roles={file.visibleToRoles} />
      <div style={{ color: 'var(--text-subtle)', fontSize: 12, flexShrink: 0 }}>{selected ? '▲' : '▼'}</div>
    </div>
  );
}

// ─── DetailPanel ─────────────────────────────────────────────────────────────

function DetailPanel({ file, canManage, onClose, onRefresh }) {
  const [editingRoles, setEditingRoles]       = useState(false);
  const [roles, setRoles]                     = useState(file.visibleToRoles || []);
  const [savingRoles, setSavingRoles]         = useState(false);
  const [replacing, setReplacing]             = useState(false);
  const [archiving, setArchiving]             = useState(false);
  const [viewErr, setViewErr]                 = useState(null);
  const [actionErr, setActionErr]             = useState(null);
  const replaceRef                            = useRef();

  // Reset when file changes
  useEffect(() => {
    setRoles(file.visibleToRoles || []);
    setEditingRoles(false);
    setActionErr(null);
    setViewErr(null);
  }, [file.id]);

  const handleView = async () => {
    setViewErr(null);
    const res = await sbSignCompanyFileUrl(file.storagePath);
    if (res.ok) window.open(res.url, '_blank');
    else setViewErr(res.error || 'Could not load file');
  };

  const handleSaveRoles = async () => {
    setSavingRoles(true);
    const res = await sbSetCompanyFileRoles(file.id, roles);
    setSavingRoles(false);
    if (res.ok) { setEditingRoles(false); onRefresh(); }
    else setActionErr(res.error || 'Save failed');
  };

  const handleArchive = async () => {
    if (!window.confirm(`Archive "${file.type}"? It will be hidden from the active list but not deleted.`)) return;
    setArchiving(true);
    const res = await sbArchiveCompanyFile(file.id);
    setArchiving(false);
    if (res.ok) onRefresh();
    else setActionErr(res.error || 'Archive failed');
  };

  const handleReplaceFile = async (e) => {
    const newFile = e.target.files?.[0];
    if (!newFile) return;
    if (!window.confirm(`Replace "${file.type}" with "${newFile.name}"? The current file will be archived.`)) return;
    setReplacing(true);
    const res = await sbReplaceCompanyFile({
      existingId: file.id,
      file: newFile,
      category: file.category,
      type: file.type,
      metadata: {
        issuer: file.issuer,
        policyNumber: file.policyNumber,
        effectiveDate: file.effectiveDate,
        expirationDate: file.expirationDate,
      },
      visibleToRoles: file.visibleToRoles,
    });
    setReplacing(false);
    if (res.ok) onRefresh();
    else setActionErr(res.error || 'Replace failed');
    // Reset file input
    if (replaceRef.current) replaceRef.current.value = '';
  };

  const toggleRole = (role) => {
    setRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy-900)' }}>{file.type}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{file.category}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20,
            color: 'var(--text-subtle)', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Archived banner */}
        {file.lifecycleStatus === 'archived' && (
          <div style={{ background: 'var(--neutral-bg)', border: '1px solid #E5E7EB', color: 'var(--text-muted)',
            padding: '7px 10px', borderRadius: 4, fontSize: 12, marginBottom: 12 }}>
            <strong>ARCHIVED</strong>
            {file.archivedAt && ` — ${new Date(file.archivedAt).toLocaleDateString()}`}
          </div>
        )}

        {/* Metadata grid */}
        <div style={{ background: 'var(--bg)', borderRadius: 6, padding: '10px 12px', marginBottom: 14, fontSize: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              ['File', file.name],
              ['Category', file.category],
              ...(file.issuer       ? [['Issuer', file.issuer]] : []),
              ...(file.policyNumber ? [['Policy #', file.policyNumber]] : []),
              ...(file.effectiveDate  ? [['Effective',  new Date(file.effectiveDate).toLocaleDateString()]] : []),
              ...(file.expirationDate ? [['Expiration', new Date(file.expirationDate).toLocaleDateString()]] : []),
              ['Uploaded', new Date(file.createdAt).toLocaleDateString()],
            ].map(([lb, val]) => (
              <div key={lb}>
                <div style={{ fontSize: 10, color: 'var(--text-subtle)', fontWeight: 600, textTransform: 'uppercase',
                  letterSpacing: 0.5 }}>{lb}</div>
                <div style={{ color: 'var(--navy-900)', fontWeight: 500, marginTop: 1, wordBreak: 'break-word' }}>{val}</div>
              </div>
            ))}
          </div>
          {file.expirationDate && (
            <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid #E8E4DC' }}>
              <ExpirationBadge date={file.expirationDate} />
            </div>
          )}
        </div>

        {/* Visibility section */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase',
              letterSpacing: 1 }}>Visibility</div>
            {canManage && !editingRoles && file.lifecycleStatus === 'active' && (
              <button onClick={() => setEditingRoles(true)} style={{ fontSize: 11, background: 'none',
                border: '1px solid #E8E4DC', borderRadius: 4, padding: '2px 8px',
                cursor: 'pointer', color: 'var(--text-muted)' }}>Edit</button>
            )}
          </div>

          {editingRoles ? (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Who can see this file in their portal?
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* Owner always on, disabled */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
                  color: 'var(--text-subtle)', cursor: 'default' }}>
                  <input type="checkbox" checked disabled style={{ cursor: 'default' }} />
                  <span style={{ fontWeight: 500 }}>Owner</span>
                  <span style={{ fontSize: 11 }}>(always has access)</span>
                </label>
                {['project_manager', 'sales_rep', 'sub', 'client'].map(r => (
                  <label key={r} style={{ display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={roles.includes(r)}
                      onChange={() => toggleRole(r)} style={{ cursor: 'pointer' }} />
                    <span style={{ fontWeight: 500 }}>{ROLE_LABELS[r]}</span>
                    {r === 'client' && <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>(client portal via job)</span>}
                    {r === 'sub' && <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>(sub portal Company Docs)</span>}
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button onClick={handleSaveRoles} disabled={savingRoles} className="btn btn-navy"
                  style={{ fontSize: 12, padding: '6px 14px' }}>
                  {savingRoles ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => { setEditingRoles(false); setRoles(file.visibleToRoles || []); }}
                  className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 14px' }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <VisibilityChips roles={file.visibleToRoles} />
          )}
        </div>

        {/* Error */}
        {(viewErr || actionErr) && (
          <div style={{ background: 'var(--red-bg)', color: 'var(--red-strong)', padding: '6px 10px',
            borderRadius: 4, fontSize: 12, marginBottom: 10 }}>
            {viewErr || actionErr}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={handleView} className="btn btn-navy" style={{ fontSize: 12, padding: '7px 14px' }}>
            📎 View File
          </button>

          {canManage && file.lifecycleStatus === 'active' && (
            <>
              {/* Replace — hidden file input */}
              <label className="btn btn-ghost" style={{ fontSize: 12, padding: '7px 14px',
                cursor: 'pointer', margin: 0 }}>
                {replacing ? 'Replacing…' : '↺ Replace'}
                <input ref={replaceRef} type="file"
                  accept="application/pdf,image/*,.doc,.docx"
                  style={{ display: 'none' }} onChange={handleReplaceFile} />
              </label>

              <button onClick={handleArchive} disabled={archiving} className="btn btn-ghost"
                style={{ fontSize: 12, padding: '7px 14px', color: 'var(--red-strong)', marginLeft: 'auto' }}>
                {archiving ? 'Archiving…' : 'Archive'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── UploadModal ──────────────────────────────────────────────────────────────

function UploadModal({ onClose, onSaved }) {
  const [file, setFile]         = useState(null);
  const [form, setForm]         = useState({
    category:       'Insurance',
    type:           '',
    issuer:         '',
    policyNumber:   '',
    effectiveDate:  '',
    expirationDate: '',
  });
  const [roles, setRoles]       = useState([]);
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState(null);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const toggleRole = (role) => {
    setRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const handleSubmit = async () => {
    if (!file)           { setErr('Please select a file'); return; }
    if (!form.type.trim()) { setErr('Document type is required (e.g. "GL Insurance")'); return; }
    setErr(null);
    setSaving(true);

    const res = await sbUploadCompanyFile({
      file,
      category: form.category,
      type: form.type.trim(),
      metadata: {
        issuer:         form.issuer.trim()        || undefined,
        policyNumber:   form.policyNumber.trim()  || undefined,
        effectiveDate:  form.effectiveDate        || undefined,
        expirationDate: form.expirationDate       || undefined,
      },
      visibleToRoles: roles,
    });

    setSaving(false);
    if (res.ok) onSaved();
    else setErr(res.error || 'Upload failed');
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480, maxHeight: '92vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--navy-900)' }}>Upload Company File</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20,
            color: 'var(--text-subtle)', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* File picker */}
        <div style={{ marginBottom: 14 }}>
          <label className="flbl">File *</label>
          <div style={{ border: '2px dashed #E8E4DC', borderRadius: 6, padding: '16px',
            textAlign: 'center', cursor: 'pointer', position: 'relative',
            background: file ? '#F0FDF4' : '#FAFAFA' }}
            onClick={() => document.getElementById('cf-file-input').click()}>
            <input id="cf-file-input" type="file"
              accept="application/pdf,image/*,.doc,.docx"
              style={{ display: 'none' }}
              onChange={e => { setFile(e.target.files?.[0] || null); setErr(null); }} />
            {file
              ? <span style={{ fontSize: 12, color: '#065F46', fontWeight: 600 }}>✓ {file.name}</span>
              : <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>Click to choose a file (PDF, image, DOC)</span>
            }
          </div>
        </div>

        {/* Category */}
        <div style={{ marginBottom: 12 }}>
          <label className="flbl">Category *</label>
          <select className="finp" value={form.category} onChange={e => set('category', e.target.value)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Type */}
        <div style={{ marginBottom: 12 }}>
          <label className="flbl">Document Type * <span style={{ fontWeight: 400, color: 'var(--text-subtle)' }}>(e.g. "GL Insurance", "W-9")</span></label>
          <input className="finp" placeholder="GL Insurance" value={form.type}
            onChange={e => set('type', e.target.value)} />
        </div>

        {/* Issuer + Policy # side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
          <div>
            <label className="flbl">Issuer</label>
            <input className="finp" placeholder="Liberty Mutual" value={form.issuer}
              onChange={e => set('issuer', e.target.value)} />
          </div>
          <div>
            <label className="flbl">Policy #</label>
            <input className="finp" placeholder="GL-1234567" value={form.policyNumber}
              onChange={e => set('policyNumber', e.target.value)} />
          </div>
        </div>

        {/* Effective + Expiration dates side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div>
            <label className="flbl">Effective Date</label>
            <input className="finp" type="date" value={form.effectiveDate}
              onChange={e => set('effectiveDate', e.target.value)} />
          </div>
          <div>
            <label className="flbl">Expiration Date</label>
            <input className="finp" type="date" value={form.expirationDate}
              onChange={e => set('expirationDate', e.target.value)} />
          </div>
        </div>

        {/* Visibility */}
        <div style={{ marginBottom: 16 }}>
          <label className="flbl">Visible to</label>
          <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 6 }}>
            Who should see this file? Owner always has access. Default: no one else (internal only).
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
              color: 'var(--text-subtle)', cursor: 'default' }}>
              <input type="checkbox" checked disabled style={{ cursor: 'default' }} />
              <span style={{ fontWeight: 500 }}>Owner</span>
              <span style={{ fontSize: 11 }}>(always has access)</span>
            </label>
            {[
              { role: 'project_manager', label: 'Project Manager' },
              { role: 'sales_rep',       label: 'Sales Rep' },
              { role: 'sub',             label: 'Sub', note: 'sub portal Company Docs' },
              { role: 'client',          label: 'Client', note: 'client portal via job creation' },
            ].map(({ role, label, note }) => (
              <label key={role} style={{ display: 'flex', alignItems: 'center', gap: 8,
                fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={roles.includes(role)}
                  onChange={() => toggleRole(role)} style={{ cursor: 'pointer' }} />
                <span style={{ fontWeight: 500 }}>{label}</span>
                {note && <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>({note})</span>}
              </label>
            ))}
          </div>
        </div>

        {/* Error */}
        {err && (
          <div style={{ background: 'var(--red-bg)', color: 'var(--red-strong)', padding: '6px 10px',
            borderRadius: 4, fontSize: 12, marginBottom: 10 }}>
            {err}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn btn-ghost"
            style={{ fontSize: 12, padding: '7px 16px' }}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="btn btn-navy"
            style={{ fontSize: 12, padding: '7px 16px' }}>
            {saving ? 'Uploading…' : 'Upload File'}
          </button>
        </div>
      </div>
    </div>
  );
}
