import { Ic, fD } from '../../../../lib/utils';

const CAT_COLORS = {
  Photos:          '#3B82F6',
  Documents:       '#6366F1',
  Receipts:        '#22C55E',
  'Floor Plans':   '#F59E0B',
  'Change Orders': '#EF4444',
  Communications:  '#8B5CF6',
};

function fileIcon(mime) {
  if (!mime) return Ic.doc;
  if (mime.startsWith('image/')) return Ic.cam;
  return Ic.doc;
}

function FileRow({ file, onSelect, checked, onToggle, bulkTagMode }) {
  const color = CAT_COLORS[file.category] || '#6B7280';
  return (
    <div
      onClick={() => bulkTagMode ? onToggle(file.id) : onSelect(file.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
        borderBottom: '1px solid #F3F0E8', cursor: 'pointer', background: checked ? '#EFF6FF' : '#fff',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => { if (!checked) e.currentTarget.style.background = '#F7F5F0'; }}
      onMouseLeave={e => { if (!checked) e.currentTarget.style.background = checked ? '#EFF6FF' : '#fff'; }}
    >
      {bulkTagMode && (
        <input type="checkbox" checked={!!checked} onChange={() => onToggle(file.id)}
          onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }} />
      )}
      <span style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
        {fileIcon(file.mime_type)}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#0A1F44', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {file.name}
        </div>
        <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ background: color + '22', color, borderRadius: 4, padding: '1px 6px', fontWeight: 600, fontSize: 10 }}>
            {file.category}
          </span>
          {file.subcategory && (
            <span style={{ color: '#6B7280' }}>{file.subcategory}</span>
          )}
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0 }}>{fD(file.created_at)}</div>
      {!bulkTagMode && (
        <span style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', flexShrink: 0 }}>
          {Ic.chev}
        </span>
      )}
    </div>
  );
}

export default function FilesRecentView({ files, onSelectFile, bulkTagMode, selectedFileIds, onToggleSelect }) {
  const recent = [...files].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 20);

  if (!recent.length) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 20px', color: '#9CA3AF' }}>
        <span style={{ width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8, opacity: 0.4 }}>{Ic.folder}</span>
        <div style={{ fontSize: 14, fontWeight: 500 }}>No files yet</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>Upload a file to get started</div>
      </div>
    );
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E8E4DC', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '8px 12px', background: '#F7F5F0', borderBottom: '1px solid #E8E4DC', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Recent ({recent.length})
      </div>
      {recent.map(f => (
        <FileRow
          key={f.id} file={f}
          onSelect={onSelectFile}
          checked={selectedFileIds?.includes(f.id)}
          onToggle={onToggleSelect}
          bulkTagMode={bulkTagMode}
        />
      ))}
    </div>
  );
}

export { FileRow, CAT_COLORS, fileIcon };
