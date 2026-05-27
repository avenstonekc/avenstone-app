import { useState } from 'react';
import { Ic, fD } from '../../../../lib/utils';
import { FileRow, CAT_COLORS } from './FilesRecentView';

const CAT_ORDER = ['Photos', 'Documents', 'Receipts', 'Floor Plans', 'Change Orders', 'Communications'];

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
  const [open, setOpen] = useState(true);
  const isUncat = label === '_uncategorized';
  const displayLabel = isUncat ? 'Uncategorized' : label;
  const folderLabel = `${category} / ${displayLabel}`;
  return (
    <div style={{ marginBottom: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button
          onClick={() => setOpen(v => !v)}
          style={{
            flex: 1, background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px 6px 20px',
            fontSize: 12, color: '#6B7280', fontWeight: 600, textAlign: 'left',
          }}
        >
          <span style={{ width: 12, height: 12, display: 'flex', alignItems: 'center', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
            {Ic.chev}
          </span>
          <span style={{ opacity: isUncat ? 0.6 : 1, fontStyle: isUncat ? 'italic' : 'normal' }}>
            {displayLabel}
          </span>
          <span style={{ marginLeft: 'auto', background: '#E8E4DC', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700, color: '#6B7280' }}>
            {files.length}
          </span>
        </button>
        {onShareFolder && (
          <button
            onClick={e => { e.stopPropagation(); onShareFolder({ folderLabel, files }); }}
            style={{
              marginRight: 10, fontSize: 11, color: '#C9A84C',
              background: 'transparent', border: '1px solid rgba(201,168,76,0.4)',
              padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
              flexShrink: 0, fontWeight: 600,
            }}
          >
            Share
          </button>
        )}
      </div>
      {open && (
        <div style={{ paddingLeft: 8 }}>
          {files.map(f => (
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

function CatSection({ category, subs, onSelectFile, bulkTagMode, selectedFileIds, onToggleSelect, onShareFolder }) {
  const [open, setOpen] = useState(true);
  const color = CAT_COLORS[category] || '#6B7280';
  const total = Object.values(subs).reduce((n, arr) => n + arr.length, 0);
  const allFiles = Object.values(subs).flat();
  return (
    <div style={{ border: '1px solid #E8E4DC', borderRadius: 8, marginBottom: 8, overflow: 'hidden', background: '#fff' }}>
      <div style={{ background: '#F7F5F0', display: 'flex', alignItems: 'center' }}>
        <button
          onClick={() => setOpen(v => !v)}
          style={{
            flex: 1, background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 8px 10px 12px',
            fontSize: 13, color: '#0A1F44', fontWeight: 700, textAlign: 'left',
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
          {category}
          <span style={{ marginLeft: 'auto', background: color + '22', color, borderRadius: 10, padding: '1px 8px', fontSize: 10, fontWeight: 700 }}>
            {total}
          </span>
          <span style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', color: '#9CA3AF' }}>
            {Ic.chev}
          </span>
        </button>
        {onShareFolder && (
          <button
            onClick={e => { e.stopPropagation(); onShareFolder({ folderLabel: category, files: allFiles }); }}
            style={{
              marginRight: 10, fontSize: 11, color: '#C9A84C',
              background: 'transparent', border: '1px solid rgba(201,168,76,0.4)',
              padding: '2px 8px', borderRadius: 4, cursor: 'pointer',
              flexShrink: 0, fontWeight: 600,
            }}
          >
            Share all
          </button>
        )}
      </div>
      {open && (
        <div style={{ borderTop: '1px solid #E8E4DC' }}>
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
      <div style={{ textAlign: 'center', padding: '48px 20px', color: '#9CA3AF' }}>
        <span style={{ width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, opacity: 0.4 }}>{Ic.folder}</span>
        <div style={{ fontSize: 14, fontWeight: 500 }}>No files yet</div>
      </div>
    );
  }

  return (
    <div>
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
