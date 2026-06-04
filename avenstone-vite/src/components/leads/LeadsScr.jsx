import { useState, useEffect, useMemo } from 'react';
import { sbLoadLeads } from '../../lib/supabase.js';
import { isMob } from '../../lib/utils.jsx';

const NAVY  = '#0A1F44';
const GOLD  = '#C9A84C';
const CREAM = '#F7F5F0';
const WHITE = '#FFFFFF';
const BORDER = '#E8E4DC';
const PAGE_SIZE = 10;

// lead_status → display config
const STATUS_CFG = {
  new:       { label: 'New',       bg: '#DBEAFE', color: '#1E40AF' },
  contacted: { label: 'Contacted', bg: '#FEF3C7', color: '#92400E' },
  qualified: { label: 'Qualified', bg: '#D1FAE5', color: '#065F46' },
  customer:  { label: 'Won',       bg: '#E0E7FF', color: '#3730A3' },
  lost:      { label: 'Lost',      bg: '#FEE2E2', color: '#991B1B' },
  proposal:  { label: 'Proposal',  bg: '#F3E8FF', color: '#7C3AED' },
};

const SOURCE_LABELS = {
  website: 'Website', referral: 'Referral', facebook: 'Facebook',
  instagram: 'Instagram', google: 'Google Ads', ghl: 'GHL',
  manual: 'Manual', other: 'Other',
};

function fShort(n) {
  const v = Number(n || 0);
  if (!v) return null;
  if (v >= 1_000_000) return `$${(v/1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v/1_000).toFixed(0)}k`;
  return `$${v}`;
}

function fDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function parseAddr(addr) {
  if (!addr) return { street: '(No address)', city: '' };
  const i = addr.indexOf(',');
  return i >= 0
    ? { street: addr.substring(0, i).trim(), city: addr.substring(i + 1).trim() }
    : { street: addr, city: '' };
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.substring(0, 2).toUpperCase();
}

const AVATAR_COLORS = ['#0A1F44','#1D4ED8','#065F46','#7C3AED','#92400E','#991B1B'];
function avatarColor(name) { return AVATAR_COLORS[(name?.charCodeAt(0) || 0) % AVATAR_COLORS.length]; }

function StatusPill({ status }) {
  const s = STATUS_CFG[status] || { label: (status || 'New').replace(/_/g,' '), bg: '#F3F4F6', color: '#6B7280' };
  return (
    <span style={{ background: s.bg, color: s.color, fontSize: 11, fontWeight: 700,
      padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap',
      fontFamily: 'DM Sans, sans-serif', letterSpacing: '0.03em' }}>{s.label}</span>
  );
}

function Avatar({ name, size = 36 }) {
  const initials = getInitials(name);
  const bg = avatarColor(name);
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, color: WHITE, fontSize: size * 0.33,
      fontWeight: 700, fontFamily: 'DM Sans, sans-serif' }}>
      {initials}
    </div>
  );
}

// ── SelectFilter helper ────────────────────────────────────────────────────────
function SelectFilter({ value, onChange, children }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: NAVY,
      background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 8,
      padding: '7px 28px 7px 10px', cursor: 'pointer', outline: 'none',
      appearance: 'none', WebkitAppearance: 'none',
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236B7280' strokeWidth='1.5' fill='none' strokeLinecap='round'/%3E%3C/svg%3E")`,
      backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
    }}>{children}</select>
  );
}

// ── Desktop table row ──────────────────────────────────────────────────────────
function TableRow({ lead, onClick }) {
  const { street, city } = parseAddr(lead.address);
  const name = lead.client_name || '(No name)';
  const effectiveStatus = lead.status === 'proposal' ? 'proposal' : (lead.lead_status || 'new');
  return (
    <tr onClick={onClick} style={{ cursor: 'pointer', borderBottom: `1px solid ${BORDER}` }}
      onMouseEnter={e => e.currentTarget.style.background = CREAM}
      onMouseLeave={e => e.currentTarget.style.background = WHITE}>
      <td style={{ padding: '11px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={name} size={36} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: NAVY,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{name}</div>
            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{street}</div>
            {city && <div style={{ fontSize: 10, color: '#D1D5DB' }}>{city}</div>}
          </div>
        </div>
      </td>
      <td style={{ padding: '11px 14px', fontSize: 13, color: '#374151', maxWidth: 140 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {lead.scope || <span style={{ color: '#D1D5DB' }}>—</span>}
        </div>
      </td>
      <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
        <StatusPill status={effectiveStatus} />
      </td>
      <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 600, color: NAVY, whiteSpace: 'nowrap' }}>
        {fShort(lead.contract_value) || <span style={{ color: '#D1D5DB', fontWeight: 400 }}>—</span>}
      </td>
      <td style={{ padding: '11px 14px', fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap' }}>
        {lead.lead_source ? (SOURCE_LABELS[lead.lead_source] || lead.lead_source) : <span style={{ color: '#D1D5DB' }}>—</span>}
      </td>
      <td style={{ padding: '11px 14px', fontSize: 12, color: '#9CA3AF', whiteSpace: 'nowrap' }}>
        {fDate(lead.created_at)}
      </td>
    </tr>
  );
}

// ── Mobile card ───────────────────────────────────────────────────────────────
function LeadCard({ lead, onClick }) {
  const { street, city } = parseAddr(lead.address);
  const name = lead.client_name || '(No name)';
  const effectiveStatus = lead.status === 'proposal' ? 'proposal' : (lead.lead_status || 'new');
  return (
    <div onClick={onClick} style={{
      background: WHITE, borderRadius: 12, border: `1px solid ${BORDER}`,
      boxShadow: '0 1px 4px rgba(10,31,68,0.05)', padding: '12px 14px',
      display: 'flex', gap: 12, cursor: 'pointer', marginBottom: 10,
    }}>
      <Avatar name={name} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 3 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: NAVY,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
            <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1 }}>{street}</div>
            {city && <div style={{ fontSize: 10, color: '#D1D5DB' }}>{city}</div>}
          </div>
          <StatusPill status={effectiveStatus} />
        </div>
        {lead.scope && (
          <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>{lead.scope}</div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
          <div style={{ fontSize: 11, color: '#9CA3AF' }}>
            {lead.lead_source ? (SOURCE_LABELS[lead.lead_source] || lead.lead_source) : '—'} · {fDate(lead.created_at)}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>
            {fShort(lead.contract_value) || <span style={{ color: '#D1D5DB', fontWeight: 400, fontSize: 11 }}>No value</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function LeadsScr({ profile, onConvertToJob, onOpenLead, onNewLead }) {
  const mob = isMob();
  const [leads, setLeads]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState(null);
  const [search, setSearch]     = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [sort, setSort]         = useState('newest');
  const [page, setPage]         = useState(1);
  const [mobileShown, setMobileShown] = useState(PAGE_SIZE);

  useEffect(() => {
    if (!profile?.tenant_id) return;
    sbLoadLeads(profile.tenant_id).then(r => {
      if (r.ok) setLeads(r.data || []);
      else setErr(r.error);
      setLoading(false);
    });
  }, [profile?.tenant_id]);

  // Unique sources for filter
  const sourceOptions = useMemo(() =>
    [...new Set(leads.map(l => l.lead_source).filter(Boolean))].sort(),
    [leads]
  );

  // Filter + sort
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let out = leads.filter(l => {
      if (q && !(l.client_name || '').toLowerCase().includes(q) && !(l.address || '').toLowerCase().includes(q)) return false;
      if (filterStatus !== 'all') {
        const eff = l.status === 'proposal' ? 'proposal' : (l.lead_status || 'new');
        if (eff !== filterStatus) return false;
      }
      if (filterSource !== 'all' && l.lead_source !== filterSource) return false;
      return true;
    });
    if (sort === 'oldest') out = [...out].sort((a, b) => a.created_at?.localeCompare(b.created_at));
    else if (sort === 'value') out = [...out].sort((a, b) => (b.contract_value || 0) - (a.contract_value || 0));
    return out;
  }, [leads, search, filterStatus, filterSource, sort]);

  useEffect(() => { setPage(1); setMobileShown(PAGE_SIZE); }, [search, filterStatus, filterSource, sort]);

  const totalPages  = Math.ceil(filtered.length / PAGE_SIZE);
  const desktopRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const mobileCards = filtered.slice(0, mobileShown);

  const handleOpen = id => { onOpenLead?.(id); };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: 200, color: '#9CA3AF', fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}>
      Loading leads…
    </div>
  );
  if (err) return (
    <div style={{ background: '#FEE2E2', color: '#991B1B', padding: '10px 16px',
      borderRadius: 8, fontSize: 13, margin: 16 }}>{err}</div>
  );

  return (
    <div style={{ background: CREAM, minHeight: '100vh', padding: mob ? '16px' : '24px 32px',
      fontFamily: 'DM Sans, sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: mob ? 'flex-start' : 'center',
        justifyContent: 'space-between', marginBottom: 20, gap: 12,
        flexDirection: mob ? 'column' : 'row' }}>
        <div>
          <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: mob ? 22 : 26, color: NAVY }}>
            Leads
          </div>
          <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 3 }}>
            {filtered.length} of {leads.length} lead{leads.length !== 1 ? 's' : ''}
          </div>
        </div>
        <button className="btn btn-navy" onClick={onNewLead || onConvertToJob}
          style={{ alignSelf: mob ? 'stretch' : 'auto' }}>
          + New Lead
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input type="text" placeholder="Search leads…" value={search}
          onChange={e => setSearch(e.target.value)} className="finp"
          style={{ flex: '1 1 160px', minWidth: 130, fontSize: 13, padding: '7px 12px' }} />
        <SelectFilter value={filterStatus} onChange={setFilterStatus}>
          <option value="all">All Statuses</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="qualified">Qualified</option>
          <option value="proposal">Proposal</option>
          <option value="customer">Won</option>
          <option value="lost">Lost</option>
        </SelectFilter>
        {sourceOptions.length > 0 && (
          <SelectFilter value={filterSource} onChange={setFilterSource}>
            <option value="all">All Sources</option>
            {sourceOptions.map(s => <option key={s} value={s}>{SOURCE_LABELS[s] || s}</option>)}
          </SelectFilter>
        )}
        <SelectFilter value={sort} onChange={setSort}>
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="value">Highest Value</option>
        </SelectFilter>
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 16px', color: '#9CA3AF', fontSize: 14 }}>
          {leads.length === 0 ? 'No leads yet — tap "+ New Lead" to add one.' : 'No leads match your filters.'}
        </div>
      )}

      {/* ── Mobile cards ── */}
      {mob && filtered.length > 0 && (
        <>
          {mobileCards.map(lead => (
            <LeadCard key={lead.id} lead={lead} onClick={() => handleOpen(lead.id)} />
          ))}
          {mobileShown < filtered.length && (
            <button onClick={() => setMobileShown(n => n + PAGE_SIZE)} style={{
              width: '100%', padding: 12, background: WHITE, border: `1px solid ${BORDER}`,
              borderRadius: 10, fontSize: 13, color: NAVY, fontWeight: 600, cursor: 'pointer', marginTop: 4,
            }}>Load more ({filtered.length - mobileShown} remaining)</button>
          )}
        </>
      )}

      {/* ── Desktop table ── */}
      {!mob && filtered.length > 0 && (
        <>
          <div style={{ background: WHITE, borderRadius: 14, border: `1px solid ${BORDER}`,
            boxShadow: '0 2px 12px rgba(10,31,68,0.06)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: CREAM, borderBottom: `2px solid ${BORDER}` }}>
                  {['Lead', 'Project Type', 'Status', 'Est. Value', 'Source', 'Date'].map((h, i) => (
                    <th key={i} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11,
                      fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.08em',
                      fontFamily: 'DM Sans, sans-serif', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {desktopRows.map(lead => (
                  <TableRow key={lead.id} lead={lead} onClick={() => handleOpen(lead.id)} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
              <span style={{ fontSize: 13, color: '#9CA3AF' }}>
                Showing {(page-1)*PAGE_SIZE+1}–{Math.min(page*PAGE_SIZE, filtered.length)} of {filtered.length} leads
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button disabled={page===1} onClick={() => setPage(p=>p-1)} style={{
                  padding: '6px 12px', background: WHITE, border: `1px solid ${BORDER}`,
                  borderRadius: 6, fontSize: 13, cursor: page===1 ? 'not-allowed' : 'pointer',
                  color: page===1 ? '#D1D5DB' : NAVY }}>← Prev</button>
                {Array.from({length: totalPages}, (_,i) => i+1).slice(
                  Math.max(0, page-3), Math.min(totalPages, page+2)
                ).map(p => (
                  <button key={p} onClick={() => setPage(p)} style={{
                    width: 32, height: 32, background: p===page ? NAVY : WHITE,
                    border: `1px solid ${p===page ? NAVY : BORDER}`, borderRadius: 6,
                    fontSize: 13, cursor: 'pointer',
                    color: p===page ? WHITE : NAVY, fontWeight: p===page ? 700 : 400 }}>{p}</button>
                ))}
                <button disabled={page===totalPages} onClick={() => setPage(p=>p+1)} style={{
                  padding: '6px 12px', background: WHITE, border: `1px solid ${BORDER}`,
                  borderRadius: 6, fontSize: 13,
                  cursor: page===totalPages ? 'not-allowed' : 'pointer',
                  color: page===totalPages ? '#D1D5DB' : NAVY }}>Next →</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
