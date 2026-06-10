import { useState, useEffect } from 'react';
import { sb } from '../../lib/supabase';
import BugReportDetailModal from './BugReportDetailModal';

const NAV    = 'var(--navy-900)';
const GOLD   = 'var(--gold-500)';
const BORDER = 'var(--border)';

const STATUS_OPTIONS = ['open', 'in_progress', 'fixed', 'wontfix'];
const STATUS_COLORS = {
  open:        { bg: 'var(--red-bg)',     color: 'var(--red-text-strong)' },
  in_progress: { bg: 'var(--amber-bg)',   color: 'var(--amber-text-strong)' },
  fixed:       { bg: 'var(--green-bg)',   color: 'var(--green-text-deep)' },
  wontfix:     { bg: 'var(--neutral-bg)', color: 'var(--neutral-text)' },
};

function relativeTime(ts) {
  if (!ts) return '—';
  const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function BugReportsScr({ profile }) {
  const [bugs, setBugs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('open');
  const [tenantFilter, setTenantFilter] = useState('');
  const [selectedBug, setSelectedBug] = useState(null);

  const load = async () => {
    let q = sb.from('bug_reports').select('*').order('created_at', { ascending: false });
    const { data } = await q;
    setBugs(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const tenants = [...new Set(bugs.map(b => b.tenant_id))];
  const filtered = bugs.filter(b => {
    if (statusFilter && b.status !== statusFilter) return false;
    if (tenantFilter && b.tenant_id !== tenantFilter) return false;
    return true;
  });

  const handleFixed = (bugId) => {
    setBugs(prev => prev.map(b => b.id === bugId ? { ...b, status: 'fixed', fixed_at: new Date().toISOString() } : b));
  };

  return (
    <div style={{ padding: '16px 20px', maxWidth: 900, fontFamily: 'DM Sans, sans-serif' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: NAV, marginBottom: 4 }}>Bug Reports</div>
        <div style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Platform-owner view · all tenants</div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {STATUS_OPTIONS.map(s => (
            <button key={s} onClick={() => setStatusFilter(s === statusFilter ? '' : s)}
              style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid', borderColor: statusFilter === s ? NAV : BORDER, background: statusFilter === s ? NAV : 'var(--card-bg)', color: statusFilter === s ? '#fff' : 'var(--text-muted)', fontFamily: 'DM Sans, sans-serif', fontSize: 12, cursor: 'pointer', fontWeight: statusFilter === s ? 600 : 400 }}>
              {s}
            </button>
          ))}
        </div>
        {tenants.length > 1 && (
          <select value={tenantFilter} onChange={e => setTenantFilter(e.target.value)}
            style={{ border: `1px solid ${BORDER}`, borderRadius: 8, padding: '6px 10px', fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'var(--text-secondary)', outline: 'none' }}>
            <option value="">All tenants</option>
            {tenants.map(tid => <option key={tid} value={tid}>{tid.slice(0, 8)}…</option>)}
          </select>
        )}
      </div>

      {loading && <div style={{ color: 'var(--text-subtle)', fontSize: 14 }}>Loading…</div>}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-subtle)', fontSize: 14 }}>
          No bugs with status "{statusFilter || 'any'}"
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(bug => {
          const st = STATUS_COLORS[bug.status] || STATUS_COLORS.open;
          return (
            <div key={bug.id} onClick={() => setSelectedBug(bug)}
              style={{ background: 'var(--card-bg)', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px 16px', cursor: 'pointer', transition: 'border-color 0.13s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = GOLD)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: NAV, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {bug.description.slice(0, 80)}{bug.description.length > 80 ? '…' : ''}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>
                    {bug.user_role} · {bug.route || '—'} · {relativeTime(bug.created_at)}
                    <span style={{ fontSize: 11, color: 'var(--border-strong)', marginLeft: 6 }}>{bug.tenant_id?.slice(0, 8)}</span>
                  </div>
                </div>
                <span style={{ background: st.bg, color: st.color, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>{bug.status}</span>
              </div>
            </div>
          );
        })}
      </div>

      {selectedBug && (
        <BugReportDetailModal
          bug={selectedBug}
          onClose={() => setSelectedBug(null)}
          onFixed={handleFixed}
        />
      )}
    </div>
  );
}
