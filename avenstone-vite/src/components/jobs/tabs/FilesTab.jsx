import { useState, useEffect, useCallback, useRef } from 'react';
import { sbLoadJobFiles, sbSearchJobFiles, sbCategorizeJobFile, AV_TENANT } from '../../../lib/supabase';
import { Ic, isMob } from '../../../lib/utils';
import FilesRecentView from './files/FilesRecentView';
import FilesTreeView from './files/FilesTreeView';
import FilesGridView from './files/FilesGridView';
import FileUploadFlow from './files/FileUploadFlow';
import FilesBulkTagBar from './files/FilesBulkTagBar';
import FileDetailPanel from './files/FileDetailPanel';
import ShareFolderModal from './files/ShareFolderModal';

export default function FilesTab({ job, profile }) {
  const mob = isMob();
  const defaultView = mob ? 'grid' : 'tree';

  const [view, setView] = useState(defaultView);
  const [files, setFiles] = useState([]);
  const [filteredFiles, setFilteredFiles] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [bulkTagMode, setBulkTagMode] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState([]);
  const [detailFileId, setDetailFileId] = useState(null);
  const [bulkApplying, setBulkApplying] = useState(false);
  const [shareModal, setShareModal] = useState(null); // { folderLabel, files }
  const debounceRef = useRef(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError('');
    const result = await sbLoadJobFiles(job.id, { limit: 200 });
    if (result.error) {
      setError(result.error);
    } else {
      const loaded = result.data || [];
      setFiles(loaded);
      setFilteredFiles(loaded);
    }
    setLoading(false);
  }, [job.id]);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  // Debounced search effect
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!searchQuery.trim()) {
      setFilteredFiles(files);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const result = await sbSearchJobFiles(job.id, searchQuery);
      setFilteredFiles(result.data || []);
      setSearching(false);
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQuery, files, job.id]);

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
    setFiles(prev => {
      const updated = [newFile, ...prev];
      if (!searchQuery.trim()) setFilteredFiles(updated);
      return updated;
    });
  };

  const handleFileUpdated = updatedFile => {
    setFiles(prev => prev.map(f => f.id === updatedFile.id ? updatedFile : f));
    setFilteredFiles(prev => prev.map(f => f.id === updatedFile.id ? updatedFile : f));
  };

  const handleFileDeleted = deletedId => {
    setFiles(prev => prev.filter(f => f.id !== deletedId));
    setFilteredFiles(prev => prev.filter(f => f.id !== deletedId));
  };

  const viewProps = {
    files: filteredFiles,
    onSelectFile: setDetailFileId,
    bulkTagMode,
    selectedFileIds,
    onToggleSelect: handleToggleSelect,
    onShareFolder: ({ folderLabel, files }) => setShareModal({ folderLabel, files }),
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
      {/* Search input */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <span style={{
          position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
          width: 15, height: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#9CA3AF', pointerEvents: 'none',
        }}>
          {Ic.doc}
        </span>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search files, vendors, receipts…"
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '9px 36px 9px 32px',
            border: '1px solid #E8E4DC', borderRadius: 8,
            background: '#F7F5F0', fontSize: 13, color: '#0A1F44',
            outline: 'none', transition: 'border-color 0.12s',
          }}
          onFocus={e => { e.target.style.borderColor = '#C9A84C'; e.target.style.background = '#fff'; }}
          onBlur={e => { e.target.style.borderColor = '#E8E4DC'; e.target.style.background = '#F7F5F0'; }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#9CA3AF', fontSize: 16, lineHeight: 1, padding: '2px 4px',
            }}
          >×</button>
        )}
      </div>

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

      {/* Searching indicator */}
      {searching && (
        <div style={{ textAlign: 'center', padding: '12px 20px', color: '#9CA3AF', fontSize: 12 }}>
          Searching…
        </div>
      )}

      {/* Empty search state */}
      {!loading && !searching && searchQuery.trim() && filteredFiles.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: '#9CA3AF' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#6B7280' }}>No files match "{searchQuery}"</div>
          <div style={{ fontSize: 12, marginTop: 4, marginBottom: 16 }}>Try a different search or browse all files</div>
          <button
            onClick={() => setSearchQuery('')}
            style={{
              padding: '7px 16px', background: '#0A1F44', color: '#fff',
              border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}
          >
            Clear search
          </button>
        </div>
      )}

      {/* Views */}
      {!loading && !searching && !(searchQuery.trim() && filteredFiles.length === 0) && view === 'recent' && <FilesRecentView {...viewProps} />}
      {!loading && !searching && !(searchQuery.trim() && filteredFiles.length === 0) && view === 'tree' && <FilesTreeView {...viewProps} />}
      {!loading && !searching && !(searchQuery.trim() && filteredFiles.length === 0) && view === 'grid' && <FilesGridView {...viewProps} />}

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

      {/* Share folder modal */}
      {shareModal && (
        <ShareFolderModal
          folderLabel={shareModal.folderLabel}
          files={shareModal.files}
          job={job}
          onClose={() => setShareModal(null)}
          onSent={() => setShareModal(null)}
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
