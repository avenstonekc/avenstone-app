import { useState } from 'react';
import { sbCompleteTodo, sbSnoozeTodo, sbDismissTodo } from '../../lib/supabase';

const SEV_COLOR = { high: '#EF4444', medium: '#C9A84C', low: '#9CA3AF' };

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function TodoCard({ todo, onRemove }) {
  const [showSnooze, setShowSnooze] = useState(false);
  const [snoozing, setSnoozing] = useState(false);

  const handleDone = async () => {
    onRemove(todo.id);
    await sbCompleteTodo(todo.id);
  };

  const handleDismiss = async () => {
    onRemove(todo.id);
    await sbDismissTodo(todo.id);
  };

  const handleSnooze = async (hours) => {
    setSnoozing(true);
    setShowSnooze(false);
    onRemove(todo.id);
    await sbSnoozeTodo(todo.id, hours);
    setSnoozing(false);
  };

  const btnBase = {
    border: '1px solid #E8E4DC', background: '#fff', cursor: 'pointer',
    fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 5,
    color: '#6B7280', transition: 'all 0.12s',
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #E8E4DC', borderLeft: `3px solid ${SEV_COLOR[todo.severity] || '#C9A84C'}`, borderRadius: 8, padding: '14px 16px', marginBottom: 10, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: SEV_COLOR[todo.severity] || '#C9A84C', marginTop: 5, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#0A1F44', marginBottom: 2 }}>{todo.title}</div>
          {todo.body && <div style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.5, marginBottom: 4 }}>{todo.body}</div>}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: '#9CA3AF' }}>
            {todo.job?.address && <span>📍 {todo.job.address}</span>}
            <span>{timeAgo(todo.created_at)}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
        <button style={{ ...btnBase, background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#16a34a' }} onClick={handleDone}>
          ✓ Done
        </button>

        <div style={{ position: 'relative' }}>
          <button style={btnBase} onClick={() => setShowSnooze(p => !p)} disabled={snoozing}>
            Snooze ▾
          </button>
          {showSnooze && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: '#fff', border: '1px solid #E8E4DC', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, minWidth: 140 }}>
              {[['1 day', 24], ['3 days', 72], ['1 week', 168]].map(([label, hours]) => (
                <button key={hours} onClick={() => handleSnooze(hours)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '9px 14px', fontSize: 13, color: '#374151', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F7F5F0'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button style={{ ...btnBase, marginLeft: 'auto' }} onClick={handleDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
