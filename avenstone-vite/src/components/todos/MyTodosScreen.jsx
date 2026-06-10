import { useState, useEffect } from 'react';
import { sbLoadMyTodos, sbResolveTodoManually, sbUpdateTodo } from '../../lib/supabase';
import { fD } from '../../lib/utils';
import TodoCreateEditModal from '../modals/TodoCreateEditModal';

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

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const data = await sbLoadMyTodos({ status: statusFilter === 'all' ? null : statusFilter });
      setTodos(data || []);
    } catch (e) { setError(e.message || 'Failed to load to-dos'); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [statusFilter]);

  const handleResolve = async (id) => {
    await sbResolveTodoManually(id);
    load();
  };

  const handleCancel = async (id) => {
    await sbUpdateTodo(id, { status: 'cancelled' });
    setTodos(prev => prev.filter(t => t.id !== id));
    setCancelConfirm(null);
  };

  let filtered = todos;
  if (scopeFilter === 'unscoped') filtered = filtered.filter(t => !t.job_id);
  if (scopeFilter === 'job_scoped') filtered = filtered.filter(t => !!t.job_id);
  if (priorityFilter !== 'all') filtered = filtered.filter(t => t.priority === priorityFilter);

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: 'var(--navy-900)' }}>To-dos</div>
          <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginTop: 2 }}>{profile?.full_name}'s tasks across all jobs and personal work</div>
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

      {loading && <div style={{ color: 'var(--text-subtle)' }}>Loading…</div>}
      {error && <div style={{ background: 'var(--red-bg)', color: 'var(--red-text-strong)', padding: '10px 14px', borderRadius: 6, marginBottom: 12 }}>{error}</div>}
      {!loading && !error && filtered.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--text-subtle)', marginTop: 40 }}>
          No {statusFilter === 'open' ? 'open' : statusFilter} to-dos.
        </div>
      )}
      {!loading && !error && filtered.map(t => (
        <div key={t.id} style={{ background: 'var(--card-bg)', border: '1px solid #E8E4DC', padding: '12px 14px', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                {t.priority && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                    background: t.priority === 'high' ? 'var(--red-bg)' : t.priority === 'medium' ? 'var(--amber-bg)' : 'var(--neutral-bg)',
                    color: t.priority === 'high' ? 'var(--red-text-strong)' : t.priority === 'medium' ? 'var(--amber-text-strong)' : 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {t.priority}
                  </span>
                )}
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--navy-900)' }}>{t.title}</span>
                <span style={{ fontSize: 10, color: 'var(--text-subtle)', background: 'var(--bg)', border: '1px solid #E8E4DC', padding: '1px 6px', borderRadius: 4, marginLeft: 2 }}>{t.source}</span>
              </div>
              {t.notes && <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 480, marginBottom: 3 }}>{t.notes}</div>}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-subtle)', alignItems: 'center' }}>
                {t.job?.address && <span style={{ color: 'var(--text-muted)' }}>→ {t.job.client_name || t.job.address}</span>}
                {t.due_date && (() => {
                  const isPast = new Date(t.due_date) < new Date() && t.status === 'open';
                  return <span style={{ color: isPast ? 'var(--red-text)' : 'var(--text-subtle)' }}>Due {fD(t.due_date)}</span>;
                })()}
                {t.resolved_reason && <span style={{ color: 'var(--green-dot)', fontSize: 10 }}>✓ {t.resolved_reason.replace(/_/g, ' ')}</span>}
              </div>
            </div>
            {t.status === 'open' && (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 10px', color: 'var(--green-dot)', borderColor: 'var(--green-border-soft)' }}
                  onClick={() => handleResolve(t.id)}>Resolve</button>
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 10px' }}
                  onClick={() => setEditing(t)}>Edit</button>
                {cancelConfirm === t.id ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 10px', color: 'var(--red-text)', borderColor: 'var(--red-border)' }}
                      onClick={() => handleCancel(t.id)}>Confirm cancel</button>
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 10px' }}
                      onClick={() => setCancelConfirm(null)}>Keep</button>
                  </div>
                ) : (
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 10px', color: 'var(--text-subtle)' }}
                    onClick={() => setCancelConfirm(t.id)}>Cancel</button>
                )}
              </div>
            )}
          </div>
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
