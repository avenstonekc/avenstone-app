import { useState, useEffect, useRef } from 'react';
import { sbLoadMyTodos, sbResolveTodoManually, sbUpdateTodo } from '../../lib/supabase';
import { fD } from '../../lib/utils';
import TodoCreateEditModal from '../modals/TodoCreateEditModal';

const SOURCE_CHIP = {
  engine:    { label: 'engine',    bg: 'var(--blue-bg)',    color: 'var(--blue-text)' },
  vigilance: { label: 'vigilance', bg: 'var(--amber-bg)',   color: 'var(--amber-text-strong)' },
  manual:    null,
};

function KebabMenu({ onResolve, onEdit, onCancel }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'var(--text-subtle)', lineHeight: 1 }}
      >⋮</button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 32, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', boxShadow: 'var(--shadow-md)', zIndex: 100, minWidth: 140 }}>
          {[
            { label: 'Edit',   action: () => { onEdit(); setOpen(false); } },
            { label: 'Cancel', action: () => { onCancel(); setOpen(false); }, danger: true },
          ].map(item => (
            <button key={item.label} onClick={item.action}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '9px 14px', fontSize: 13, color: item.danger ? 'var(--red-text)' : 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >{item.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MyTodosScreen({ profile, jobs }) {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('open');
  const [scopeFilter, setScopeFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [cancelConfirm, setCancelConfirm] = useState(null);
  const [collapsed, setCollapsed] = useState(new Set());

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const data = await sbLoadMyTodos({ status: statusFilter === 'all' ? null : statusFilter });
      setTodos(data || []);
    } catch (e) { setError(e.message || 'Failed to load to-dos'); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [statusFilter]);

  const handleResolve = async (id) => { await sbResolveTodoManually(id); load(); };
  const handleCancel = async (id) => {
    await sbUpdateTodo(id, { status: 'cancelled' });
    setTodos(prev => prev.filter(t => t.id !== id));
    setCancelConfirm(null);
  };
  const toggleGroup = key => setCollapsed(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  let filtered = todos;
  if (scopeFilter === 'unscoped') filtered = filtered.filter(t => !t.job_id);
  if (scopeFilter === 'job_scoped') filtered = filtered.filter(t => !!t.job_id);
  if (priorityFilter !== 'all') filtered = filtered.filter(t => t.priority === priorityFilter);

  // Group by job
  const groups = {};
  for (const t of filtered) {
    const key = t.job_id || '__general__';
    if (!groups[key]) {
      groups[key] = {
        key,
        label: t.job_id
          ? (t.job?.address || t.job?.client_name || t.job_id)
          : 'General',
        items: [],
      };
    }
    groups[key].items.push(t);
  }
  const sortedGroups = Object.values(groups).sort((a, b) => {
    if (a.key === '__general__') return 1;
    if (b.key === '__general__') return -1;
    return a.label.localeCompare(b.label);
  });

  const renderRow = t => {
    const chip = SOURCE_CHIP[t.source];
    const isPast = t.due_date && new Date(t.due_date) < new Date() && t.status === 'open';
    return (
      <div key={t.id} style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '10px 14px', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          {/* Resolve inline check — one visible button per row */}
          {t.status === 'open' && (
            <button
              onClick={() => handleResolve(t.id)}
              title="Resolve"
              style={{ width: 22, height: 22, borderRadius: '50%', border: '1.5px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1, fontSize: 11, color: 'var(--text-subtle)', transition: 'all 0.12s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green-dot)'; e.currentTarget.style.color = 'var(--green-dot)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-subtle)'; }}
            >✓</button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 }}>
              {t.priority && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10,
                  background: t.priority === 'high' ? 'var(--red-bg)' : t.priority === 'medium' ? 'var(--amber-bg)' : 'var(--neutral-bg)',
                  color: t.priority === 'high' ? 'var(--red-text-strong)' : t.priority === 'medium' ? 'var(--amber-text-strong)' : 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {t.priority}
                </span>
              )}
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{t.title}</span>
              {chip && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: chip.bg, color: chip.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>{chip.label}</span>
              )}
            </div>
            {t.notes && <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 480, marginBottom: 2 }}>{t.notes}</div>}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-subtle)', alignItems: 'center' }}>
              {t.due_date && <span style={{ color: isPast ? 'var(--red-text)' : 'var(--text-subtle)' }}>Due {fD(t.due_date)}</span>}
              {t.resolved_reason && <span style={{ color: 'var(--green-text-strong)', fontSize: 10 }}>&#x2713; {t.resolved_reason.replace(/_/g, ' ')}</span>}
            </div>
          </div>
          {t.status === 'open' && (
            cancelConfirm === t.id ? (
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px', color: 'var(--red-text)', borderColor: 'var(--red-border)' }} onClick={() => handleCancel(t.id)}>Confirm</button>
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => setCancelConfirm(null)}>Keep</button>
              </div>
            ) : (
              <KebabMenu
                onEdit={() => setEditing(t)}
                onCancel={() => setCancelConfirm(t.id)}
              />
            )
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, color: 'var(--navy-900)' }}>To-dos</div>
          <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 2 }}>{profile?.full_name}&apos;s tasks across all jobs and personal work</div>
        </div>
        <button className="btn btn-navy" style={{ flexShrink: 0 }} onClick={() => setCreateOpen(true)}>+ New To-do</button>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="finp" style={{ width: 'auto', minWidth: 110 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="cancelled">Cancelled</option>
          <option value="all">All statuses</option>
        </select>
        <select className="finp" style={{ width: 'auto', minWidth: 130 }} value={scopeFilter} onChange={e => setScopeFilter(e.target.value)}>
          <option value="all">All scopes</option>
          <option value="job_scoped">Job to-dos only</option>
          <option value="unscoped">Personal only</option>
        </select>
        <select className="finp" style={{ width: 'auto', minWidth: 110 }} value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
          <option value="all">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {loading && <div style={{ color: 'var(--text-subtle)' }}>Loading&#8230;</div>}
      {error && <div style={{ background: 'var(--red-bg)', color: 'var(--red-text-strong)', padding: '10px 14px', borderRadius: 6, marginBottom: 12 }}>{error}</div>}
      {!loading && !error && filtered.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-subtle)', marginTop: 40 }}>
          No {statusFilter === 'open' ? 'open' : statusFilter} to-dos.
        </div>
      )}

      {!loading && !error && sortedGroups.map(group => (
        <div key={group.key} style={{ marginBottom: 16 }}>
          {/* Group header */}
          <button
            onClick={() => toggleGroup(group.key)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', marginBottom: 6, width: '100%', textAlign: 'left' }}
          >
            <span style={{ fontSize: 11, color: 'var(--text-subtle)', transform: collapsed.has(group.key) ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>&#x25BE;</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, color: 'var(--text-primary)' }}>{group.label}</span>
            <span style={{ fontSize: 11, color: 'var(--text-subtle)', background: 'var(--neutral-bg)', borderRadius: 'var(--r-full)', padding: '1px 7px', fontFamily: 'var(--font-body)' }}>{group.items.length}</span>
          </button>
          {!collapsed.has(group.key) && group.items.map(renderRow)}
        </div>
      ))}

      {(createOpen || editing) && (
        <TodoCreateEditModal
          todo={editing}
          defaultJobId={null}
          tenantJobs={jobs}
          onClose={() => { setCreateOpen(false); setEditing(null); }}
          onSaved={() => { setCreateOpen(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
