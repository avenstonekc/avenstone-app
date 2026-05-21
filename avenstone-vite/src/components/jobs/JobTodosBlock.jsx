import { useState, useEffect } from 'react';
import { sbLoadTodosForJob, sbResolveTodoManually } from '../../lib/supabase';
import TodoCreateEditModal from '../modals/TodoCreateEditModal';

export default function JobTodosBlock({ job, profile }) {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await sbLoadTodosForJob(job.id, { status: 'open' });
      setTodos(data || []);
    } catch { setTodos([]); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [job.id]);

  return (
    <div style={{ background: '#fff', border: '1px solid #E8E4DC', padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 }}>Job To-dos</div>
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 12px' }} onClick={() => setCreateOpen(true)}>+ Add To-do</button>
      </div>

      {loading && <div style={{ fontSize: 13, color: '#9CA3AF' }}>Loading…</div>}

      {!loading && !todos.length && (
        <div style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', padding: '12px 0' }}>No open to-dos for this job.</div>
      )}

      {!loading && todos.map(t => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 0', borderBottom: '1px solid #F3F0E8' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {t.priority && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8,
                  background: t.priority === 'high' ? '#FEE2E2' : t.priority === 'medium' ? '#FEF3C7' : '#F3F4F6',
                  color: t.priority === 'high' ? '#991b1b' : t.priority === 'medium' ? '#92400e' : '#6B7280',
                  textTransform: 'uppercase', letterSpacing: 0.3 }}>
                  {t.priority}
                </span>
              )}
              <span style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>{t.title}</span>
              <span style={{ fontSize: 9, color: '#9CA3AF', background: '#F7F5F0', border: '1px solid #E8E4DC', padding: '1px 5px', borderRadius: 3 }}>{t.source}</span>
            </div>
            {t.notes && <div style={{ fontSize: 11, color: '#6B7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 320, marginTop: 1 }}>{t.notes}</div>}
          </div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            <button className="btn btn-ghost" style={{ fontSize: 10, padding: '3px 8px', color: '#22c55e', borderColor: '#BBF7D0' }}
              onClick={async () => { try { await sbResolveTodoManually(t.id); load(); } catch {} }}>Resolve</button>
            <button className="btn btn-ghost" style={{ fontSize: 10, padding: '3px 8px' }}
              onClick={() => setEditing(t)}>Edit</button>
          </div>
        </div>
      ))}

      {(createOpen || editing) && (
        <TodoCreateEditModal
          todo={editing}
          defaultJobId={job.id}
          tenantJobs={[job]}
          onClose={() => { setCreateOpen(false); setEditing(null); }}
          onSaved={() => { setCreateOpen(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
