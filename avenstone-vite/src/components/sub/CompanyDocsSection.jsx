import { useState, useEffect } from 'react';
import { sbLoadCompanyFilesForSub, sbSignCompanyFileUrl } from '../../lib/companyFiles';
import { Ic, fD } from '../../lib/utils';

const NAV    = '#0A1F44';
const GOLD   = '#C9A84C';
const BORDER = '#E8E4DC';

function ExpirationBadge({ date }) {
  if (!date) return null;
  const today = new Date();
  const exp   = new Date(date);
  const daysLeft = Math.floor((exp - today) / 86400000);
  if (daysLeft < 0)  return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#FEE2E2', color: '#EF4444', border: '1px solid #FECACA' }}>Expired {fD(date)}</span>;
  if (daysLeft <= 30) return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#FEF3C7', color: '#D97706', border: '1px solid #FDE68A' }}>Exp {fD(date)}</span>;
  return <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: '#D1FAE5', color: '#059669', border: '1px solid #A7F3D0' }}>Exp {fD(date)}</span>;
}

function CategoryBadge({ category }) {
  const palette = {
    Insurance:  { bg: '#EFF6FF', color: '#1D4ED8' },
    License:    { bg: '#F5F3FF', color: '#6D28D9' },
    Tax:        { bg: '#FEF9C3', color: '#854D0E' },
    Legal:      { bg: '#FEF3C7', color: '#D97706' },
    Compliance: { bg: '#ECFDF5', color: '#065F46' },
    Template:   { bg: '#F1F5F9', color: '#475569' },
    Other:      { bg: '#F7F5F0', color: '#6B7280' },
  };
  const { bg, color } = palette[category] || palette.Other;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: bg, color, border: `1px solid ${color}22`, textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {category}
    </span>
  );
}

function FileRow({ file, lang }) {
  const [opening, setOpening] = useState(false);

  const handleView = async () => {
    if (opening) return;
    setOpening(true);
    const res = await sbSignCompanyFileUrl(file.storagePath);
    setOpening(false);
    if (!res.ok) { alert('Could not open file. Please try again.'); return; }
    window.open(res.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ width: 20, height: 20, display: 'flex', flexShrink: 0, color: NAV, opacity: 0.5 }}>{Ic.doc}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: NAV, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.type}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <CategoryBadge category={file.category} />
          {file.expirationDate && <ExpirationBadge date={file.expirationDate} />}
          {file.issuer && <span style={{ fontSize: 11, color: '#9CA3AF' }}>{file.issuer}</span>}
        </div>
      </div>
      <button
        onClick={handleView}
        disabled={opening}
        style={{ flexShrink: 0, background: opening ? '#F7F5F0' : NAV, color: opening ? '#9CA3AF' : '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: opening ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
      >
        <span style={{ width: 13, height: 13, display: 'flex' }}>{Ic.eye}</span>
        {opening ? 'Opening…' : 'View'}
      </button>
    </div>
  );
}

export default function CompanyDocsSection({ profile, lang = 'en' }) {
  const [files, setFiles]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await sbLoadCompanyFilesForSub();
      if (cancelled) return;
      if (!res.ok) { setError(res.error); setLoading(false); return; }
      setFiles(res.data || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // Group by category in display order
  const CATEGORY_ORDER = ['Insurance', 'License', 'Tax', 'Legal', 'Compliance', 'Template', 'Other'];
  const grouped = CATEGORY_ORDER.reduce((acc, cat) => {
    const rows = files.filter(f => f.category === cat);
    if (rows.length) acc.push({ cat, rows });
    return acc;
  }, []);
  // Any stray categories not in the list
  files.forEach(f => {
    if (!CATEGORY_ORDER.includes(f.category) && !grouped.find(g => g.cat === f.category)) {
      grouped.push({ cat: f.category, rows: files.filter(x => x.category === f.category) });
    }
  });

  if (loading) return (
    <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF', fontSize: 13 }}>
      Loading documents…
    </div>
  );

  if (error) return (
    <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, padding: '12px 16px', color: '#991B1B', fontSize: 13 }}>
      Failed to load documents: {error}
    </div>
  );

  if (!files.length) return (
    <div style={{ textAlign: 'center', padding: '40px 20px', color: '#9CA3AF' }}>
      <span style={{ width: 32, height: 32, display: 'inline-flex', marginBottom: 10, opacity: 0.4 }}>{Ic.folder}</span>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#6B7280', marginBottom: 4 }}>No documents shared yet</div>
      <div style={{ fontSize: 12 }}>Check back later or contact your GC.</div>
    </div>
  );

  return (
    <div>
      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: NAV, marginBottom: 14 }}>
        Company Documents
      </div>
      {grouped.map(({ cat, rows }) => (
        <div key={cat} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            {cat}
            <span style={{ background: '#F7F5F0', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '1px 7px', fontSize: 10, color: '#9CA3AF' }}>{rows.length}</span>
          </div>
          {rows.map(f => <FileRow key={f.id} file={f} lang={lang} />)}
        </div>
      ))}
    </div>
  );
}
