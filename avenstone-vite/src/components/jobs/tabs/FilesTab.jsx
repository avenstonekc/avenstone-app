import { useState, useEffect, useCallback } from 'react';
import { sbLoadJobFiles, sbCategorizeJobFile, AV_TENANT } from '../../../lib/supabase';
import { Ic, isMob } from '../../../lib/utils';
import FilesRecentView from './files/FilesRecentView';
import FilesTreeView from './files/FilesTreeView';
import FilesGridView from './files/FilesGridView';
import FileUploadFlow from './files/FileUploadFlow';
import FilesBulkTagBar from './files/FilesBulkTagBar';
import FileDetailPanel from './files/FileDetailPanel';

export default function FilesTab({ job, profile }) {
  const mob = isMob();
  const defaultView = mob ? 'grid' : 'tree';

  const [view, setView] = useState(defaultView);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [bulkTagMode, setBulkTagMode] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState([]);
  const [detailFileId, setDetailFileId] = useState(null);
  const [bulkApplying, setBulkApplying] = useState(false);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError('');
    const result = await sbLoadJobFiles(job.id, { limit: 200 });
    if (result.error) {
      setError(result.error);
    } else {
      setFiles(result.files || []);
    }
    setLoading(false);
  }, [job.id]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const handleToggleSelect = id => {
    setSelectedFileIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleBulkApply = async (category, subcategory) => {
    if (!selectedFileIds.length) return;
    setBulkApplying(true);
    await Promise.all(
      selectedFileIds.map(id => sbCategorizeJobFile(id, { category, subcategory }))
    );
    setBulkApplying(false);
    setSelectedFileIds([]);
    setBulkTagMode(false);
    // Refresh to show updated categories
    loadFiles();
  };

  const handleFileUploaded = newFile => {
    setFiles(prev => [newFile, ...prev]);
  };

  const handleFileUpdated = updatedFile => {
    setFiles(prev => prev.map(f => f.id === updatedFile.id ? updatedFile : f));
  };

  const handleFileDeleted = deletedId => {
    setFiles(prev => prev.filter(f => f.id !== deletedId));
  };

  const viewProps = {
    files,
    onSelectFile: setDetailFileId,
    bulkTagMode,
    selectedFileIds,
    onToggleSelect: handleToggleSelect,
  };

  const ViewToggle = ({ id, icon, label }) => (
    <button
      onClick={() => setView(id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px',
        background: view === id ? '#0A1F44' : 'transparent',
        color: view === id ? '#fff' : '#6B7280',
        border: 'none', borderRadius: 6, cursor: 'pointer',
        fontSize: 12, fontWeight: 600, transition: 'all 0.12s',
      }}
    >
      <span style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      {!mob && <span>{label}</span>}
    </button>
  );

  return (
    <div style={{ position: 'relative', paddingBottom: bulkTagMode && selectedFileIds.length ? 88 : 0 }}>
      {/* Header bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
        flexWrap: 'wrap',
      }}>
        {/* View switcher */}
        <div style={{ display: 'flex', gap: 2, background: '#F7F5F0', borderRadius: 8, padding: 2, border: '1px solid #E8E4DC' }}>
          <ViewToggle id="recent" icon={Ic.note} label="Recent" />
          <ViewToggle id="tree" icon={Ic.folder} label="Tree" />
          <ViewToggle id="grid" icon={Ic.cam} label="Grid" />
        </div>

        <div style={{ flex: 1 }} />

        {/* Bulk tag toggle */}
        <button
          onClick={() => { setBulkTagMode(v => !v); setSelectedFileIds([]); }}
          style={{
            padding: '6px 10px', background: bulkTagMode ? '#C9A84C' : 'transparent',
            color: bulkTagMode ? '#0A1F44' : '#6B7280',
            border: `1px solid ${bulkTagMode ? '#C9A84C' : '#E8E4DC'}`,
            borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.12s',
          }}
        >
          {bulkTagMode ? (bulkApplying ? 'Applying…' : `Tag (${selectedFileIds.length})`) : 'Bulk tag'}
        </button>

        {/* Upload button */}
        <button
          onClick={() => setUploadOpen(true)}
          className="btn btn-navy"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', fontSize: 12 }}
        >
          <span style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Ic.plus}</span>
          Upload
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ marginBottom: 12, padding: '10px 14px', background: '#FEE2E2', color: '#991b1b', borderRadius: 8, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
          {error}
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>×</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#9CA3AF' }}>
          <div style={{ width: 24, height: 24, border: '2px solid #C9A84C', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 12px' }} />
          Loading files…
        </div>
      )}

      {/* Views */}
      {!loading && view === 'recent' && <FilesRecentView {...viewProps} />}
      {!loading && view === 'tree' && <FilesTreeView {...viewProps} />}
      {!loading && view === 'grid' && <FilesGridView {...viewProps} />}

      {/* File detail panel */}
      {detailFileId && (
        <FileDetailPanel
          fileId={detailFileId}
          onClose={() => setDetailFileId(null)}
          onUpdated={handleFileUpdated}
          onDeleted={handleFileDeleted}
        />
      )}

      {/* Upload modal */}
      {uploadOpen && (
        <FileUploadFlow
          jobId={job.id}
          onClose={() => setUploadOpen(false)}
          onUploaded={handleFileUploaded}
        />
      )}

      {/* Bulk tag bar */}
      {bulkTagMode && selectedFileIds.length > 0 && (
        <FilesBulkTagBar
          selectedCount={selectedFileIds.length}
          selectedFileIds={selectedFileIds}
          onApply={handleBulkApply}
          onCancel={() => { setBulkTagMode(false); setSelectedFileIds([]); }}
        />
      )}
    </div>
  );
}
