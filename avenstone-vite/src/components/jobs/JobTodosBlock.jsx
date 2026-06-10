import { useState, useEffect, useRef } from 'react';
import { sbLoadTodosForJob, sbResolveTodoManually, sbUpdateTodo } from '../../lib/supabase';
import { fD } from '../../lib/utils';
import TodoCreateEditModal from '../modals/TodoCreateEditModal';

// Source chip — matches MyTodosScreen palette
const SOURCE_CHIP = {
  engine:    { label: 'engine',    bg: 'var(--blue-bg)',  color: 'var(--blue-text)' },
  vigilance: { label: 'vigilance', bg: 'var(--amber-bg)', color: 'var(--amber-text-strong)' },
  manual:    null,
};

function KebabMenu({ onEdit, onCancel }) {
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
        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-xs)', width: 26, height: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'var(--text-subtle)', lineHeight: 1 }}
      >&#x22EE;</button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 30, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', boxShadow: 'var(--shadow-md)', zIndex: 100, minWidth: 130 }}>
          {[
            { label: 'Edit',   action: () => { onEdit();   setOpen(false); } },
            { label: 'Cancel', action: () => { onCancel(); setOpen(false); }, danger: true },
          ].map(item => (
            <button key={item.label} onClick={item.action}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '8px 12px', fontSize: 12, color: item.danger ? 'var(--red-text)' : 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'var(--font-body)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >{item.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function JobTodosBlock({ job, profile }) {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await sbLoadTodosForJob(job.id, { status: 'open' });
      setTodos(data || []);
    } catch { setTodos([]); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [job.id]);

  const handleResolve = async (id) => {
    try { await sbResolveTodoManually(id); load(); } catch {}
  };
  const handleCancel = async (id) => {
    try { await sbUpdateTodo(id, { status: 'cancelled' }); load(); } catch {}
  };

  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 1 }}>Job To-dos</div>
        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 12px' }} onClick={() => setCreateOpen(true)}>+ Add To-do</button>
      </div>

      {loading && <div style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Loading&#x2026;</div>}

      {!loading && !todos.length && (
        <div style={{ fontSize: 13, color: 'var(--text-subtle)', textAlign: 'center', padding: '12px 0' }}>No open to-dos for this job.</div>
      )}

      {!loading && todos.map(t => {
        const chip = SOURCE_CHIP[t.source];
        const isPast = t.due_date && new Date(t.due_date) < new Date() && t.status === 'open';
        return (
          <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--bg-alt)' }}>
            {/* Visible resolve button */}
            <button
              onClick={() => handleResolve(t.id)}
              title="Resolve"
              style={{ width: 20, height: 20, borderRadius: '50%', border: '1.5px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2, fontSize: 10, color: 'var(--text-subtle)', transition: 'all 0.12s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--green-dot)'; e.currentTarget.style.color = 'var(--green-dot)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-subtle)'; }}
            >&#x2713;</button>

            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Title row: priority chip + title + source chip */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: 2 }}>
                {t.priority && (
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8,
                    background: t.priority === 'high' ? 'var(--red-bg)' : t.priority === 'medium' ? 'var(--amber-bg)' : 'var(--neutral-bg)',
                    color: t.priority === 'high' ? 'var(--red-text-strong)' : t.priority === 'medium' ? 'var(--amber-text-strong)' : 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: 0.3, flexShrink: 0 }}>
                    {t.priority}
                  </span>
                )}
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy-900)' }}>{t.title}</span>
                {chip && (
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: chip.bg, color: chip.color, textTransform: 'uppercase', letterSpacing: 0.3, flexShrink: 0 }}>{chip.label}</span>
                )}
              </div>

              {/* Metadata line — wraps, no truncation, no raw separators */}
              {(t.notes || t.due_date) && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, lineHeight: 1.5 }}>
                  {t.notes && <span>{t.notes}</span>}
                  {t.notes && t.due_date && <span style={{ margin: '0 4px', color: 'var(--border-strong)' }}>{'·'}</span>}
                  {t.due_date && (
                    <span style={{ color: isPast ? 'var(--red-text)' : 'var(--text-subtle)' }}>
                      Due {fD(t.due_date)}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Kebab: Edit + Cancel demoted from visible buttons */}
            <KebabMenu
              onEdit={() => setEditing(t)}
              onCancel={() => handleCancel(t.id)}
            />
          </div>
        );
      })}

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
