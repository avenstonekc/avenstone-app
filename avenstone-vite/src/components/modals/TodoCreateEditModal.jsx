import { useState, useEffect } from 'react';
import { sb, sbCreateUserTodo, sbUpdateTodo, AV_TENANT, AV_USER_ID } from '../../lib/supabase';

export default function TodoCreateEditModal({ todo, defaultJobId, tenantJobs, onClose, onSaved }) {
  const [title, setTitle] = useState(todo?.title || '');
  const [notes, setNotes] = useState(todo?.notes || '');
  const [jobId, setJobId] = useState(todo?.job_id || defaultJobId || '');
  const [assignedToUserId, setAssignedToUserId] = useState(todo?.assigned_to_user_id || AV_USER_ID || '');
  const [dueDate, setDueDate] = useState(todo?.due_date || '');
  const [priority, setPriority] = useState(todo?.priority || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [teamUsers, setTeamUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);

  useEffect(() => {
    sb.from('profiles').select('id, full_name, role').eq('tenant_id', AV_TENANT)
      .in('role', ['owner', 'project_manager', 'sales_rep'])
      .order('full_name', { ascending: true })
      .then(({ data }) => { setTeamUsers(data || []); setUsersLoading(false); });
  }, []);

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required.'); return; }
    setSaving(true); setError(null);
    try {
      if (todo) {
        await sbUpdateTodo(todo.id, {
          title: title.trim(),
          notes: notes.trim() || null,
          job_id: jobId || null,
          assigned_to_user_id: assignedToUserId || null,
          due_date: dueDate || null,
          priority: priority || null,
        });
      } else {
        await sbCreateUserTodo({
          title: title.trim(),
          notes: notes.trim() || null,
          jobId: jobId || null,
          assignedToUserId: assignedToUserId || null,
          dueDate: dueDate || null,
          priority: priority || null,
        });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message || 'Save failed.');
      setSaving(false);
    }
  };

  const currentUser = teamUsers.find(u => u.id === AV_USER_ID);
  const otherUsers = teamUsers.filter(u => u.id !== AV_USER_ID);
  const sortedJobs = tenantJobs ? [...tenantJobs].sort((a, b) => (a.address || '').localeCompare(b.address || '')) : [];

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480, width: '100%' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="modal-title" style={{ margin: 0 }}>{todo ? 'Edit To-do' : 'New To-do'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text-subtle)', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div className="fg">
          <label className="flbl">Title *</label>
          <input className="finp" type="text" maxLength={200} placeholder="Follow up with John about kitchen scope" value={title} onChange={e => setTitle(e.target.value)} />
        </div>

        <div className="fg">
          <label className="flbl">Notes</label>
          <textarea className="finp" rows={3} placeholder="Context, links, meeting notes..." value={notes} onChange={e => setNotes(e.target.value)} style={{ resize: 'vertical' }} />
        </div>

        {sortedJobs.length > 0 && (
          <div className="fg">
            <label className="flbl">Job</label>
            <select className="finp" value={jobId} onChange={e => setJobId(e.target.value)}>
              <option value="">(none — personal)</option>
              {sortedJobs.map(j => (
                <option key={j.id} value={j.id}>{j.address}{j.client_name ? ` — ${j.client_name}` : ''}</option>
              ))}
            </select>
          </div>
        )}

        {!usersLoading && teamUsers.length > 0 && (
          <div className="fg">
            <label className="flbl">Assigned to</label>
            <select className="finp" value={assignedToUserId} onChange={e => setAssignedToUserId(e.target.value)}>
              {currentUser && <option value={currentUser.id}>{currentUser.full_name}</option>}
              {otherUsers.map(u => (
                <option key={u.id} value={u.id}>{u.full_name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="fg">
          <label className="flbl">Due date</label>
          <input className="finp" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </div>

        <div className="fg">
          <label className="flbl">Priority</label>
          <select className="finp" value={priority} onChange={e => setPriority(e.target.value)}>
            <option value="">None</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        {error && (
          <div style={{ background: 'var(--red-bg)', color: 'var(--red-text-strong)', padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 14 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }} disabled={saving}>Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn btn-navy" style={{ flex: 2 }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
