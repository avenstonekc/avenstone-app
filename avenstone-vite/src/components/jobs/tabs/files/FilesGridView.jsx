import { useState, useEffect, useRef } from 'react';
import { sbSignJobFileUrl } from '../../../../lib/supabase';
import { Ic } from '../../../../lib/utils';
import { FileRow } from './FilesRecentView';

function PhotoThumbnail({ file, onSelect, checked, onToggle, bulkTagMode }) {
  const [url, setUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [inView, setInView] = useState(false);
  const containerRef = useRef();

  // IntersectionObserver — start URL fetch 200px before entering viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { setInView(true); observer.disconnect(); }
      },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fetch signed URL only once in-view
  useEffect(() => {
    if (!inView) return;
    let cancelled = false;
    setLoading(true);
    sbSignJobFileUrl(file.id, 3600).then(r => {
      if (!cancelled) { setUrl(r.url || null); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [inView, file.id]);

  return (
    <div
      ref={containerRef}
      onClick={() => bulkTagMode ? onToggle(file.id) : onSelect(file.id)}
      style={{
        position: 'relative', aspectRatio: '1 / 1', borderRadius: 6,
        overflow: 'hidden', cursor: 'pointer', background: '#E8E4DC',
        border: checked ? '2px solid #3B82F6' : '2px solid transparent',
        transition: 'border-color 0.12s',
        flexShrink: 0,
      }}
    >
      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 18, height: 18, border: '2px solid #C9A84C', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
      )}
      {url && <img src={url} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      {!url && !loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-subtle)' }}>
          {Ic.cam}
        </div>
      )}
      {bulkTagMode && (
        <div style={{ position: 'absolute', top: 4, left: 4, zIndex: 2 }}>
          <input type="checkbox" checked={!!checked} onChange={() => onToggle(file.id)} onClick={e => e.stopPropagation()} />
        </div>
      )}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(transparent, rgba(0,0,0,0.55))',
        padding: '12px 6px 4px', opacity: 0, transition: 'opacity 0.15s',
      }}
        onMouseEnter={e => { e.currentTarget.style.opacity = 1; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = 0; }}
      >
        <div style={{ fontSize: 10, color: '#fff', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {file.subcategory || file.name}
        </div>
      </div>
    </div>
  );
}

export default function FilesGridView({ files, onSelectFile, bulkTagMode, selectedFileIds, onToggleSelect, onShareFolder }) {
  const photos = files.filter(f => f.category === 'Photos');
  const others = files.filter(f => f.category !== 'Photos');

  if (!files.length) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-subtle)' }}>
        <span style={{ width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, opacity: 0.4 }}>{Ic.cam}</span>
        <div style={{ fontSize: 14, fontWeight: 500 }}>No files yet</div>
      </div>
    );
  }

  return (
    <div>
      {photos.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Photos ({photos.length})
            </div>
            {onShareFolder && (
              <button
                onClick={() => onShareFolder({ folderLabel: 'Photos', files: photos })}
                style={{
                  marginLeft: 'auto', fontSize: 11, color: '#C9A84C',
                  background: 'transparent', border: '1px solid rgba(201,168,76,0.4)',
                  padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Share
              </button>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 6 }}>
            {photos.map(f => (
              <PhotoThumbnail
                key={f.id} file={f}
                onSelect={onSelectFile}
                checked={selectedFileIds?.includes(f.id)}
                onToggle={onToggleSelect}
                bulkTagMode={bulkTagMode}
              />
            ))}
          </div>
        </div>
      )}
      {others.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E8E4DC', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', background: '#F7F5F0', borderBottom: '1px solid #E8E4DC', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Documents &amp; Other ({others.length})
          </div>
          {others.map(f => (
            <FileRow
              key={f.id} file={f}
              onSelect={onSelectFile}
              checked={selectedFileIds?.includes(f.id)}
              onToggle={onToggleSelect}
              bulkTagMode={bulkTagMode}
            />
          ))}
        </div>
      )}
    </div>
  );
}
