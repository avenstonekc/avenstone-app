import { useState, useEffect, useMemo } from 'react';
import { sbLoadProjectsList } from '../../lib/supabase.js';
import { f$, isMob } from '../../lib/utils.jsx';

const NAVY  = 'var(--navy-900)';
const GOLD  = 'var(--gold-500)';
const CREAM = 'var(--bg)';
const WHITE = '#FFFFFF';
const BORDER = 'var(--border)';

const STATUS_MAP = {
  lead:          { label: 'Lead',          bg: 'var(--neutral-bg)', color: 'var(--text-secondary)' },
  proposal:      { label: 'Proposal',      bg: 'var(--blue-bg)',    color: 'var(--blue-text)' },
  contract:      { label: 'Contract',      bg: 'var(--amber-bg)',   color: 'var(--amber-text-strong)' },
  in_progress:   { label: 'In Progress',   bg: 'var(--green-bg)',   color: 'var(--green-text-strong)' },
  final_touches: { label: 'Final Touches', bg: 'var(--blue-bg)',    color: 'var(--blue-text)' },
  complete:      { label: 'Complete',      bg: NAVY,                color: WHITE },
  on_hold:       { label: 'On Hold',       bg: 'var(--amber-bg)',   color: 'var(--amber-text-strong)' },
};

const PAGE_SIZE = 8;

function parseAddress(addr) {
  if (!addr) return { street: '(No address)', city: '' };
  const idx = addr.indexOf(',');
  if (idx < 0) return { street: addr, city: '' };
  return { street: addr.substring(0, idx).trim(), city: addr.substring(idx + 1).trim() };
}

function StatusPill({ status }) {
  const s = STATUS_MAP[status] || { label: (status || '').replace(/_/g, ' '), bg: '#F3F4F6', color: '#374151' };
  return (
    <span style={{
      background: s.bg, color: s.color,
      fontSize: 10, fontWeight: 700, fontFamily: 'DM Sans, sans-serif',
      padding: '3px 8px', borderRadius: 20, letterSpacing: '0.05em',
      textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>{s.label}</span>
  );
}

function ProgressBar({ pct }) {
  const p = Math.min(100, Math.max(0, pct || 0));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 4, background: '#E5E7EB', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${p}%`, height: '100%', background: NAVY, borderRadius: 2 }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-subtle)', whiteSpace: 'nowrap', fontFamily: 'DM Sans, sans-serif' }}>{p}%</span>
    </div>
  );
}

function Thumbnail({ url, address }) {
  const [imgErr, setImgErr] = useState(false);
  if (url && !imgErr) {
    return (
      <img
        src={url}
        alt={address}
        onError={() => setImgErr(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }}
      />
    );
  }
  // Placeholder: navy bg + gold house icon
  return (
    <div style={{
      width: '100%', height: '100%', background: NAVY, borderRadius: 'inherit',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1v-9.5z" stroke={GOLD} strokeWidth="1.5" fill="none"/>
        <path d="M9 21V12h6v9" stroke={GOLD} strokeWidth="1.5"/>
      </svg>
    </div>
  );
}

function SelectFilter({ value, onChange, children, style }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: NAVY,
        background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 8,
        padding: '7px 28px 7px 10px', cursor: 'pointer', outline: 'none',
        appearance: 'none', WebkitAppearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236B7280' strokeWidth='1.5' fill='none' strokeLinecap='round'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
        ...style,
      }}
    >{children}</select>
  );
}

// ── Desktop table row ──────────────────────────────────────────────────────────
function TableRow({ job, onClick }) {
  const { street, city } = parseAddress(job.address);
  return (
    <tr
      onClick={onClick}
      style={{ cursor: 'pointer', borderBottom: `1px solid ${BORDER}` }}
      onMouseEnter={e => e.currentTarget.style.background = CREAM}
      onMouseLeave={e => e.currentTarget.style.background = WHITE}
    >
      <td style={{ padding: '10px 12px', width: 52 }}>
        <div style={{ width: 44, height: 44, borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
          <Thumbnail url={job.thumbnail_url} address={street} />
        </div>
      </td>
      <td style={{ padding: '10px 12px', maxWidth: 240 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{street}</div>
        {city && <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 1 }}>{city}</div>}
      </td>
      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
        <StatusPill status={job.status} />
      </td>
      <td style={{ padding: '10px 12px', minWidth: 120 }}>
        <ProgressBar pct={job.phase_pct_complete} />
      </td>
      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', fontSize: 13, color: NAVY, fontFamily: 'DM Sans, sans-serif', fontWeight: 500 }}>
        {job.contract_value > 0 ? f$(job.contract_value) : <span style={{ color: '#D1D5DB' }}>—</span>}
      </td>
      <td style={{ padding: '10px 12px' }}>
        {job.open_todos > 0 ? (
          <span style={{
            background: '#EF4444', color: WHITE, fontSize: 11, fontWeight: 700,
            width: 20, height: 20, borderRadius: '50%', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center',
          }}>{job.open_todos > 9 ? '9+' : job.open_todos}</span>
        ) : null}
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-subtle)' }}>
        {job.pm_name || <span style={{ color: '#D1D5DB' }}>—</span>}
      </td>
    </tr>
  );
}

// ── Mobile card ───────────────────────────────────────────────────────────────
function ProjectCard({ job, onClick }) {
  const { street, city } = parseAddress(job.address);
  return (
    <div
      onClick={onClick}
      style={{
        background: WHITE, borderRadius: 12, border: `1px solid ${BORDER}`,
        boxShadow: '0 1px 4px rgba(10,31,68,0.06)', padding: '12px 14px',
        display: 'flex', gap: 12, cursor: 'pointer', marginBottom: 10,
      }}
    >
      <div style={{ width: 60, height: 60, borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
        <Thumbnail url={job.thumbnail_url} address={street} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{street}</div>
            {city && <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 1 }}>{city}</div>}
          </div>
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            {job.open_todos > 0 && (
              <span style={{
                background: '#EF4444', color: WHITE, fontSize: 10, fontWeight: 700,
                width: 18, height: 18, borderRadius: '50%', display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center',
              }}>{job.open_todos > 9 ? '9+' : job.open_todos}</span>
            )}
            <StatusPill status={job.status} />
          </div>
        </div>
        <ProgressBar pct={job.phase_pct_complete} />
        <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>
            {job.contract_value > 0 ? f$(job.contract_value) : <span style={{ color: '#D1D5DB', fontSize: 12 }}>No contract value</span>}
          </span>
          {job.pm_name && <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{job.pm_name}</span>}
        </div>
      </div>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ProjectsListScr({ profile, onOpenJob, onNewProject }) {
  const mob = isMob();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPM, setFilterPM] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [mobileShown, setMobileShown] = useState(PAGE_SIZE);

  useEffect(() => {
    if (!profile?.tenant_id) return;
    sbLoadProjectsList(profile.tenant_id).then(r => {
      if (r.ok) setProjects(r.data || []);
      else setErr(r.error);
      setLoading(false);
    });
  }, [profile?.tenant_id]);

  // Unique PM names for filter
  const pmOptions = useMemo(() =>
    [...new Set(projects.map(p => p.pm_name).filter(Boolean))].sort(),
    [projects]
  );

  // Filter + sort
  const filtered = useMemo(() => {
    let out = projects.filter(p => {
      if (search && !p.address?.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterStatus !== 'all' && p.status !== filterStatus) return false;
      if (filterPM !== 'all' && p.pm_name !== filterPM) return false;
      return true;
    });
    if (sort === 'oldest')   out = [...out].sort((a, b) => a.created_at?.localeCompare(b.created_at));
    else if (sort === 'value-desc') out = [...out].sort((a, b) => (b.contract_value || 0) - (a.contract_value || 0));
    else if (sort === 'value-asc')  out = [...out].sort((a, b) => (a.contract_value || 0) - (b.contract_value || 0));
    // default 'newest': already sorted desc by created_at from DB
    return out;
  }, [projects, search, filterStatus, filterPM, sort]);

  // Reset pagination when filters change
  useEffect(() => { setPage(1); setMobileShown(PAGE_SIZE); }, [search, filterStatus, filterPM, sort]);

  const totalPages  = Math.ceil(filtered.length / PAGE_SIZE);
  const desktopRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const mobileCards = filtered.slice(0, mobileShown);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, color: 'var(--text-subtle)', fontSize: 13 }}>
      Loading projects…
    </div>
  );
  if (err) return (
    <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 16px', borderRadius: 8, fontSize: 13, margin: 16 }}>{err}</div>
  );

  return (
    <div style={{ background: CREAM, minHeight: '100vh', padding: mob ? '16px' : '24px 32px', fontFamily: 'DM Sans, sans-serif' }}>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: mob ? 'flex-start' : 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexDirection: mob ? 'column' : 'row' }}>
        <div>
          <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: mob ? 22 : 26, color: NAVY, lineHeight: 1.1 }}>Projects</div>
          <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 3 }}>
            {filtered.length} of {projects.length} project{projects.length !== 1 ? 's' : ''}
          </div>
        </div>
        <button
          className="btn btn-navy"
          onClick={onNewProject}
          style={{ flexShrink: 0, alignSelf: mob ? 'stretch' : 'auto' }}
        >
          + New Project
        </button>
      </div>

      {/* Search + Filters row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search by address…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="finp"
          style={{ flex: '1 1 180px', minWidth: 140, fontSize: 13, padding: '7px 12px' }}
        />
        <SelectFilter value={filterStatus} onChange={setFilterStatus}>
          <option value="all">All Statuses</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </SelectFilter>
        {pmOptions.length > 0 && (
          <SelectFilter value={filterPM} onChange={setFilterPM}>
            <option value="all">All Project Managers</option>
            {pmOptions.map(pm => <option key={pm} value={pm}>{pm}</option>)}
          </SelectFilter>
        )}
        <SelectFilter value={sort} onChange={setSort}>
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="value-desc">Highest Value</option>
          <option value="value-asc">Lowest Value</option>
        </SelectFilter>
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-subtle)', fontSize: 14 }}>
          No projects match your filters.
        </div>
      )}

      {/* ── MOBILE: cards ── */}
      {mob && filtered.length > 0 && (
        <>
          {mobileCards.map(job => (
            <ProjectCard key={job.id} job={job} onClick={() => onOpenJob(job.id)} />
          ))}
          {mobileShown < filtered.length && (
            <button
              onClick={() => setMobileShown(n => n + PAGE_SIZE)}
              style={{
                width: '100%', padding: '12px', background: WHITE, border: `1px solid ${BORDER}`,
                borderRadius: 10, fontSize: 13, color: NAVY, fontWeight: 600, cursor: 'pointer', marginTop: 4,
              }}
            >
              Load more ({filtered.length - mobileShown} remaining)
            </button>
          )}
        </>
      )}

      {/* ── DESKTOP: table ── */}
      {!mob && filtered.length > 0 && (
        <>
          <div style={{ background: WHITE, borderRadius: 12, border: `1px solid ${BORDER}`, boxShadow: '0 1px 6px rgba(10,31,68,0.07)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: CREAM, borderBottom: `2px solid ${BORDER}` }}>
                  {['', 'Address', 'Status', 'Progress', 'Value', 'Tasks', 'PM'].map((h, i) => (
                    <th key={i} style={{
                      padding: i === 0 ? '10px 12px' : '10px 12px',
                      textAlign: 'left', fontSize: 11, fontWeight: 700,
                      color: 'var(--text-subtle)', letterSpacing: '0.08em',
                      fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {desktopRows.map(job => (
                  <TableRow key={job.id} job={job} onClick={() => onOpenJob(job.id)} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
              <span style={{ fontSize: 13, color: 'var(--text-subtle)' }}>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} projects
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                  style={{
                    padding: '6px 12px', background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 6,
                    fontSize: 13, cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? '#D1D5DB' : NAVY,
                  }}
                >← Prev</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    style={{
                      width: 32, height: 32, background: p === page ? NAVY : WHITE,
                      border: `1px solid ${p === page ? NAVY : BORDER}`, borderRadius: 6,
                      fontSize: 13, cursor: 'pointer', color: p === page ? WHITE : NAVY, fontWeight: p === page ? 700 : 400,
                    }}
                  >{p}</button>
                ))}
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage(p => p + 1)}
                  style={{
                    padding: '6px 12px', background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 6,
                    fontSize: 13, cursor: page === totalPages ? 'not-allowed' : 'pointer', color: page === totalPages ? '#D1D5DB' : NAVY,
                  }}
                >Next →</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
