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
    } catch (e) { setError(e.message || 'Failed to load todos'); }
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
          <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: '#0A1F44' }}>Todos</div>
          <div style={{ fontSize: 13, color: '#9CA3AF', marginTop: 2 }}>{profile?.full_name}'s tasks across all jobs and personal work</div>
        </div>
        <button className="btn btn-navy" style={{ flexShrink: 0 }} onClick={() => setCreateOpen(true)}>+ New Todo</button>
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
          <option value="job_scoped">Job todos only</option>
          <option value="unscoped">Personal only</option>
        </select>
        <select className="finp" style={{ width: 'auto', minWidth: 110 }} value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
          <option value="all">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {loading && <div style={{ color: '#9CA3AF' }}>Loading…</div>}
      {error && <div style={{ background: '#FEE2E2', color: '#991b1b', padding: '10px 14px', borderRadius: 6, marginBottom: 12 }}>{error}</div>}
      {!loading && !error && filtered.length === 0 && (
        <div style={{ textAlign: 'center', color: '#9CA3AF', marginTop: 40 }}>
          No {statusFilter === 'open' ? 'open' : statusFilter} todos.
        </div>
      )}
      {!loading && !error && filtered.map(t => (
        <div key={t.id} style={{ background: '#fff', border: '1px solid #E8E4DC', padding: '12px 14px', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                {t.priority && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                    background: t.priority === 'high' ? '#FEE2E2' : t.priority === 'medium' ? '#FEF3C7' : '#F3F4F6',
                    color: t.priority === 'high' ? '#991b1b' : t.priority === 'medium' ? '#92400e' : '#6B7280',
                    textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {t.priority}
                  </span>
                )}
                <span style={{ fontSize: 14, fontWeight: 600, color: '#0A1F44' }}>{t.title}</span>
                <span style={{ fontSize: 10, color: '#9CA3AF', background: '#F7F5F0', border: '1px solid #E8E4DC', padding: '1px 6px', borderRadius: 4, marginLeft: 2 }}>{t.source}</span>
              </div>
              {t.notes && <div style={{ fontSize: 12, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 480, marginBottom: 3 }}>{t.notes}</div>}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: '#9CA3AF', alignItems: 'center' }}>
                {t.job?.address && <span style={{ color: '#6B7280' }}>→ {t.job.client_name || t.job.address}</span>}
                {t.due_date && (() => {
                  const isPast = new Date(t.due_date) < new Date() && t.status === 'open';
                  return <span style={{ color: isPast ? '#ef4444' : '#9CA3AF' }}>Due {fD(t.due_date)}</span>;
                })()}
                {t.resolved_reason && <span style={{ color: '#22c55e', fontSize: 10 }}>✓ {t.resolved_reason.replace(/_/g, ' ')}</span>}
              </div>
            </div>
            {t.status === 'open' && (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 10px', color: '#22c55e', borderColor: '#BBF7D0' }}
                  onClick={() => handleResolve(t.id)}>Resolve</button>
                <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 10px' }}
                  onClick={() => setEditing(t)}>Edit</button>
                {cancelConfirm === t.id ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 10px', color: '#ef4444', borderColor: '#FCA5A5' }}
                      onClick={() => handleCancel(t.id)}>Confirm cancel</button>
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 10px' }}
                      onClick={() => setCancelConfirm(null)}>Keep</button>
                  </div>
                ) : (
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 10px', color: '#9CA3AF' }}
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
