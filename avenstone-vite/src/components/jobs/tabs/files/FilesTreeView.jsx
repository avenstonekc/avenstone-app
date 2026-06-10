import { useState } from 'react';
import { Ic, fD } from '../../../../lib/utils';
import { FileRow, CAT_COLORS } from './FilesRecentView';
import { PhotoThumbnail } from './FilesGridView';

const CAT_ORDER = ['Photos', 'Documents', 'Invoices', 'Receipts', 'Floor Plans', 'Change Orders', 'Communications', 'Draws'];

const CAT_ICON = {
  Photos:          'cam',
  Documents:       'doc',
  Invoices:        'doc',
  Receipts:        'doc',
  'Floor Plans':   'folder',
  'Change Orders': 'warn',
  Communications:  'note',
  Draws:           'box',
};

function groupByTree(files) {
  const tree = {};
  for (const f of files) {
    const cat = f.category || 'Other';
    const sub = f.subcategory || '_uncategorized';
    if (!tree[cat]) tree[cat] = {};
    if (!tree[cat][sub]) tree[cat][sub] = [];
    tree[cat][sub].push(f);
  }
  return tree;
}

function sortedCats(tree) {
  const keys = Object.keys(tree);
  return keys.sort((a, b) => {
    const ai = CAT_ORDER.indexOf(a);
    const bi = CAT_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function sortedSubs(subs) {
  const keys = Object.keys(subs);
  return keys.sort((a, b) => {
    if (a === '_uncategorized') return 1;
    if (b === '_uncategorized') return -1;
    return a.localeCompare(b);
  });
}

function SubSection({ label, category, files, onSelectFile, bulkTagMode, selectedFileIds, onToggleSelect, onShareFolder }) {
  const isUncat = label === '_uncategorized';
  const displayLabel = isUncat ? null : label; // skip label for single-sub categories
  const folderLabel = `${category} / ${(isUncat ? 'Uncategorized' : label)}`;
  const isPhotos = category === 'Photos';

  return (
    <div>
      {displayLabel && (
        <div style={{ padding: '10px 16px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {displayLabel} <span style={{ fontWeight: 400 }}>({files.length})</span>
          </span>
          {onShareFolder && (
            <button
              title={`Share ${folderLabel}`}
              onClick={e => { e.stopPropagation(); onShareFolder({ folderLabel, files }); }}
              style={{ width: 26, height: 26, borderRadius: 'var(--r-xs)', border: '1px solid var(--gold-200)', background: 'var(--gold-050)', color: 'var(--gold-500)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              <span style={{ width: 12, height: 12, display: 'flex' }}>{Ic.dl}</span>
            </button>
          )}
        </div>
      )}
      {isPhotos ? (
        <div style={{ padding: '4px 16px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 6 }}>
          {files.map(f => (
            <PhotoThumbnail key={f.id} file={f} onSelect={onSelectFile} checked={selectedFileIds?.includes(f.id)} onToggle={onToggleSelect} bulkTagMode={bulkTagMode} />
          ))}
        </div>
      ) : (
        <div>
          {files.map(f => (
            <FileRow key={f.id} file={f} onSelect={onSelectFile} checked={selectedFileIds?.includes(f.id)} onToggle={onToggleSelect} bulkTagMode={bulkTagMode} />
          ))}
        </div>
      )}
    </div>
  );
}

function CatSection({ category, subs, onSelectFile, bulkTagMode, selectedFileIds, onToggleSelect, onShareFolder }) {
  const [open, setOpen] = useState(false);
  const color = CAT_COLORS[category] || 'var(--text-muted)';
  const iconKey = CAT_ICON[category] || 'doc';
  const total = Object.values(subs).reduce((n, arr) => n + arr.length, 0);
  const allFiles = Object.values(subs).flat();
  const lastDate = allFiles.reduce((d, f) => (!d || f.created_at > d) ? f.created_at : d, null);
  const photoFiles = category === 'Photos' ? allFiles.filter(f => f.mime_type?.startsWith('image/')) : [];

  return (
    <div className="av-card" style={{ marginBottom: 10, overflow: 'hidden' }}>

      {/* ── Card header ─────────────────────────────────────────── */}
      <div
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', cursor: 'pointer',
          background: open ? 'var(--bg)' : 'var(--card-bg)',
          transition: 'background 0.12s', userSelect: 'none',
        }}
      >
        {/* Category icon in tinted square */}
        <div style={{ width: 40, height: 40, borderRadius: 'var(--r-sm)', background: color + '1a', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color }}>
          <span style={{ width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Ic[iconKey] || Ic.folder}</span>
        </div>

        {/* Name + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--text-primary)', lineHeight: 1.2 }}>{category}</div>
          <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 3 }}>
            {total} file{total !== 1 ? 's' : ''}
            {lastDate ? ` · last ${fD(lastDate)}` : ''}
          </div>
        </div>

        {/* Count badge */}
        <span style={{ background: color + '18', color, borderRadius: 'var(--r-full)', padding: '3px 10px', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
          {total}
        </span>

        {/* Share icon button */}
        {onShareFolder && (
          <button
            title={`Share ${category} folder`}
            onClick={e => { e.stopPropagation(); onShareFolder({ folderLabel: category, files: allFiles }); }}
            style={{
              width: 32, height: 32, borderRadius: 'var(--r-xs)',
              border: '1px solid var(--gold-200)', background: 'var(--gold-050)',
              color: 'var(--gold-500)', cursor: 'pointer', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--gold-100)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--gold-050)'; }}
          >
            <span style={{ width: 14, height: 14, display: 'flex' }}>{Ic.dl}</span>
          </button>
        )}

        {/* Chevron */}
        <span style={{ width: 16, height: 16, display: 'flex', alignItems: 'center', color: 'var(--text-subtle)', flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
          {Ic.chev}
        </span>
      </div>

      {/* ── Photo preview strip (Photos, collapsed) ─────────────── */}
      {!open && category === 'Photos' && photoFiles.length > 0 && (
        <div style={{ padding: '0 16px 14px', display: 'flex', gap: 6, alignItems: 'center', borderTop: '1px solid var(--border)' }}>
          {photoFiles.slice(0, 5).map(f => (
            <div key={f.id} style={{ width: 52, height: 52, flexShrink: 0 }}>
              <PhotoThumbnail file={f} onSelect={() => setOpen(true)} checked={false} onToggle={() => {}} bulkTagMode={false} />
            </div>
          ))}
          {photoFiles.length > 5 && (
            <div
              onClick={() => setOpen(true)}
              style={{ width: 52, height: 52, borderRadius: 'var(--r-xs)', background: 'var(--bg-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0, border: '1px solid var(--border)' }}
            >
              +{photoFiles.length - 5}
            </div>
          )}
        </div>
      )}

      {/* ── Expanded content ────────────────────────────────────── */}
      {open && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {sortedSubs(subs).map(sub => (
            <SubSection
              key={sub}
              label={sub}
              category={category}
              files={subs[sub]}
              onSelectFile={onSelectFile}
              bulkTagMode={bulkTagMode}
              selectedFileIds={selectedFileIds}
              onToggleSelect={onToggleSelect}
              onShareFolder={onShareFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FilesTreeView({ files, onSelectFile, bulkTagMode, selectedFileIds, onToggleSelect, onShareFolder }) {
  const tree = groupByTree(files);

  if (!files.length) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-subtle)' }}>
        <span style={{ width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, opacity: 0.4 }}>{Ic.folder}</span>
        <div style={{ fontSize: 14, fontWeight: 500 }}>No files yet</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, width: '100%' }}>
      {sortedCats(tree).map(cat => (
        <CatSection
          key={cat}
          category={cat}
          subs={tree[cat]}
          onSelectFile={onSelectFile}
          bulkTagMode={bulkTagMode}
          selectedFileIds={selectedFileIds}
          onToggleSelect={onToggleSelect}
          onShareFolder={onShareFolder}
        />
      ))}
    </div>
  );
}
