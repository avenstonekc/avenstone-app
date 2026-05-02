// TODO: wire push notifications on todo insert. send-push edge fn exists, just need to call it from the writers.
import { useState, useEffect, useCallback } from 'react';
import { sbLoadMyTodos } from '../../lib/supabase';
import TodoCard from '../common/TodoCard';

export default function TodayScr({ profile, setPendingAction }) {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await sbLoadMyTodos();
    setTodos(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const removeTodo = (id) => setTodos(p => p.filter(t => t.id !== id));

  const now = new Date();
  const active = todos.filter(t => t.status === 'pending' || (t.status === 'snoozed' && new Date(t.snoozed_until) <= now));
  const snoozed = todos.filter(t => t.status === 'snoozed' && new Date(t.snoozed_until) > now);

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div style={{ padding: '0 0 40px' }}>
      <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid #F3F0EB' }}>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: '#0A1F44', marginBottom: 2 }}>Today</div>
        <div style={{ fontSize: 13, color: '#9CA3AF' }}>{today}</div>
      </div>

      <div style={{ padding: '16px 20px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#9CA3AF', fontSize: 14 }}>Loading...</div>
        ) : active.length === 0 && snoozed.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✓</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#0A1F44', marginBottom: 6 }}>All clear.</div>
            <div style={{ fontSize: 14, color: '#9CA3AF' }}>Nothing needs your attention right now.</div>
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                  Needs attention · {active.length}
                </div>
                {active.map(t => (
                  <TodoCard key={t.id} todo={t} onRemove={removeTodo} setPendingAction={setPendingAction} />
                ))}
              </>
            )}

            {snoozed.length > 0 && (
              <details style={{ marginTop: 24 }}>
                <summary style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                  <span>Snoozed · {snoozed.length}</span>
                </summary>
                {snoozed.map(t => (
                  <TodoCard key={t.id} todo={t} onRemove={removeTodo} setPendingAction={setPendingAction} />
                ))}
              </details>
            )}
          </>
        )}

        <button
          onClick={load}
          style={{ marginTop: 16, fontSize: 12, color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
          Refresh
        </button>
      </div>
    </div>
  );
}
