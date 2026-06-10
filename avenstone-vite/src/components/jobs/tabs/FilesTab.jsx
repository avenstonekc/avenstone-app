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
  const [preloadedFiles, setPreloadedFiles] = useState(null); // File[] for camera/drop → FileUploadFlow
  const [dragActive, setDragActive] = useState(false);
  const debounceRef = useRef(null);
  const cameraRef = useRef(null);
  const dragCounterRef = useRef(0);

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

  // Camera capture (mobile) — routes captured photo into FileUploadFlow review stage
  const handleCameraCapture = e => {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = ''; // reset so same file can be re-captured
    setPreloadedFiles([f]);
    setUploadOpen(true);
  };

  // Drag-drop zone handlers (desktop) — counter prevents flicker on child boundaries
  const handleDragEnter = e => {
    e.preventDefault();
    dragCounterRef.current++;
    setDragActive(true);
  };
  const handleDragLeave = e => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) { dragCounterRef.current = 0; setDragActive(false); }
  };
  const handleDragOver = e => { e.preventDefault(); };
  const handleFileDrop = e => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragActive(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;
    setPreloadedFiles(files);
    setUploadOpen(true);
  };

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
    if (!newFile?.id) return;
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
        background: view === id ? 'var(--navy-900)' : 'transparent',
        color: view === id ? '#fff' : 'var(--text-muted)',
        border: 'none', borderRadius: 6, cursor: 'pointer',
        fontSize: 12, fontWeight: 600, transition: 'all 0.12s',
      }}
    >
      <span style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      {!mob && <span>{label}</span>}
    </button>
  );

  return (
    <div
      style={{ position: 'relative', paddingBottom: bulkTagMode && selectedFileIds.length ? 88 : 0, minHeight: 200 }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleFileDrop}
    >
      {/* Drag-drop overlay (desktop) */}
      {dragActive && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20,
          background: 'rgba(201,168,76,0.12)',
          border: '2px dashed #C9A84C', borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 16, color: 'var(--gold-500)', fontWeight: 700, background: 'rgba(255,255,255,0.85)', padding: '10px 20px', borderRadius: 8 }}>
            Drop files to upload
          </div>
        </div>
      )}
      {/* Search input */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <span style={{
          position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
          width: 15, height: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--text-subtle)', pointerEvents: 'none',
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
            background: 'var(--bg)', fontSize: 13, color: 'var(--navy-900)',
            outline: 'none', transition: 'border-color 0.12s',
          }}
          onFocus={e => { e.target.style.borderColor = 'var(--gold-500)'; e.target.style.background = '#fff'; }}
          onBlur={e => { e.target.style.borderColor = 'var(--border)'; e.target.style.background = 'var(--bg)'; }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-subtle)', fontSize: 16, lineHeight: 1, padding: '2px 4px',
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
        <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', borderRadius: 8, padding: 2, border: '1px solid #E8E4DC' }}>
          <ViewToggle id="recent" icon={Ic.note} label="Recent" />
          <ViewToggle id="tree" icon={Ic.folder} label="Tree" />
          <ViewToggle id="grid" icon={Ic.cam} label="Grid" />
        </div>

        <div style={{ flex: 1 }} />

        {/* Bulk tag toggle */}
        <button
          onClick={() => { setBulkTagMode(v => !v); setSelectedFileIds([]); }}
          style={{
            padding: '6px 10px', background: bulkTagMode ? 'var(--gold-500)' : 'transparent',
            color: bulkTagMode ? 'var(--navy-900)' : 'var(--text-muted)',
            border: `1px solid ${bulkTagMode ? 'var(--gold-500)' : 'var(--border)'}`,
            borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, transition: 'all 0.12s',
          }}
        >
          {bulkTagMode ? (bulkApplying ? 'Applying…' : `Tag (${selectedFileIds.length})`) : 'Bulk tag'}
        </button>

        {/* Camera capture button (mobile only) */}
        {mob && (
          <>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handleCameraCapture}
            />
            <button
              onClick={() => cameraRef.current?.click()}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                background: 'var(--bg)', color: 'var(--navy-900)',
                border: '1px solid #E8E4DC', borderRadius: 6,
                cursor: 'pointer', fontSize: 12, fontWeight: 600,
              }}
            >
              <span style={{ fontSize: 13 }}>📷</span>
              Photo
            </button>
          </>
        )}

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
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-subtle)' }}>
          <div style={{ width: 24, height: 24, border: '2px solid #C9A84C', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 12px' }} />
          Loading files…
        </div>
      )}

      {/* Searching indicator */}
      {searching && (
        <div style={{ textAlign: 'center', padding: '12px 20px', color: 'var(--text-subtle)', fontSize: 12 }}>
          Searching…
        </div>
      )}

      {/* Empty search state */}
      {!loading && !searching && searchQuery.trim() && filteredFiles.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-subtle)' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-muted)' }}>No files match "{searchQuery}"</div>
          <div style={{ fontSize: 12, marginTop: 4, marginBottom: 16 }}>Try a different search or browse all files</div>
          <button
            onClick={() => setSearchQuery('')}
            style={{
              padding: '7px 16px', background: 'var(--navy-900)', color: '#fff',
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
          folderFiles={filteredFiles}
          onFileChange={setDetailFileId}
        />
      )}

      {/* Upload modal */}
      {uploadOpen && (
        <FileUploadFlow
          jobId={job.id}
          preloadedFiles={preloadedFiles}
          onClose={() => { setUploadOpen(false); setPreloadedFiles(null); }}
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
