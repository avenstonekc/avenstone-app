import { useState, useEffect } from 'react';
import { sbLoadUpcomingScheduleItems, sbLoadMyTodos } from '../../lib/supabase';
import { isMob } from '../../lib/utils';
import TodoCard from '../common/TodoCard';
import { fetchWeather, formatDayLabel } from '../../lib/weather';

const STATUS_LABEL = {
  lead: 'Lead', proposal: 'Proposal', contract: 'Contract',
  in_progress: 'In Progress', final_touches: 'Final Touches',
};
const STATUS_DOT = {
  lead: '#9CA3AF', proposal: '#C9A84C', contract: '#22c55e',
  in_progress: '#0A1F44', final_touches: '#f59e0b',
};
const TYPE_LABEL = {
  material_delivery: 'Delivery', sub_start: 'Sub Start', site_visit: 'Site Visit',
  inspection: 'Inspection', milestone: 'Milestone', delay: 'Delay',
};

function SectionHeader({ title, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 17, color: '#0A1F44' }}>{title}</div>
      {count != null && count > 0 && (
        <span style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', background: '#F3F0EB', borderRadius: 10, padding: '1px 7px' }}>{count}</span>
      )}
    </div>
  );
}

function EmptyState({ text }) {
  return <div style={{ fontSize: 13, color: '#9CA3AF', padding: '10px 0 6px' }}>{text}</div>;
}

function formatSchedDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (d.getTime() === today.getTime()) return 'Today';
  if (d.getTime() === tomorrow.getTime()) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function HomeScr({ profile, jobs, setPendingAction, onOpenJob, onOpenWalkthrough }) {
  const mob = isMob();
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (profile?.full_name || '').split(' ')[0] || 'there';

  const [schedItems, setSchedItems] = useState([]);
  const [todos, setTodos] = useState([]);
  const [loadingSched, setLoadingSched] = useState(true);
  const [loadingTodos, setLoadingTodos] = useState(true);
  const [weather, setWeather] = useState(null);
  const [weatherErr, setWeatherErr] = useState(null);

  useEffect(() => {
    sbLoadUpcomingScheduleItems(7).then(r => { setSchedItems(r.data || []); setLoadingSched(false); });
    sbLoadMyTodos().then(d => { setTodos(d || []); setLoadingTodos(false); });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchWeather();
      if (cancelled) return;
      if (result.ok) { setWeather(result.data); setWeatherErr(null); }
      else setWeatherErr(result.error);
    })();
    return () => { cancelled = true; };
  }, []);

  const activeJobs = (jobs || []).filter(j => !['complete', 'on_hold'].includes(j.status));
  const activeTodos = todos.filter(t => t.status === 'open');

  const schedByDate = {};
  for (const item of schedItems) {
    const d = item.scheduled_date || '__nodate';
    if (!schedByDate[d]) schedByDate[d] = [];
    schedByDate[d].push(item);
  }
  const schedDates = Object.keys(schedByDate).sort();

  const removeTodo = (id) => setTodos(p => p.filter(t => t.id !== id));

  const cardStyle = {
    background: '#fff',
    border: '1px solid #E8E4DC',
    borderRadius: 8,
    padding: '12px 14px',
  };

  return (
    <div style={{ padding: '0 0 calc(40px + env(safe-area-inset-bottom))' }}>
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid #F3F0EB' }}>
        <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, color: '#0A1F44', marginBottom: 2 }}>
          {greeting}, {firstName}.
        </div>
        <div style={{ fontSize: 13, color: '#9CA3AF' }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
      </div>

      <div style={{ padding: '20px 20px 0' }}>

        {/* ── Weather ─────────────────────────────────────── */}
        {weather && (
          <div style={{
            background: 'linear-gradient(135deg, #0A1F44 0%, #143264 100%)',
            color: '#F7F5F0',
            padding: '16px 18px',
            borderRadius: 12,
            marginBottom: 24,
            boxShadow: '0 2px 8px rgba(10,31,68,0.15)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 40, lineHeight: 1 }}>{weather.current.icon}</div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>
                  {weather.current.temp_f}°F
                </div>
                <div style={{ fontSize: 12, opacity: 0.85 }}>
                  {weather.current.label} · Kansas City
                </div>
              </div>
            </div>
            <div style={{
              display: 'flex', gap: 4, paddingTop: 12,
              borderTop: '1px solid rgba(247,245,240,0.15)',
              overflowX: 'auto', WebkitOverflowScrolling: 'touch',
            }}>
              {weather.daily.map((day, i) => (
                <div key={day.date} style={{
                  flex: '1 1 0', minWidth: 52, textAlign: 'center', padding: '6px 4px',
                  background: i === 0 ? 'rgba(201,168,76,0.18)' : 'transparent',
                  borderRadius: 6,
                }}>
                  <div style={{ fontSize: 10, fontWeight: 600, opacity: 0.85, marginBottom: 2 }}>
                    {formatDayLabel(day.date, i)}
                  </div>
                  <div style={{ fontSize: 18, lineHeight: 1, marginBottom: 2 }}>{day.icon}</div>
                  <div style={{ fontSize: 11, fontWeight: 600 }}>{day.high_f}°</div>
                  <div style={{ fontSize: 10, opacity: 0.65 }}>{day.low_f}°</div>
                  {day.precip_pct >= 30 && (
                    <div style={{ fontSize: 9, color: '#7BD3F7', marginTop: 2 }}>
                      💧{day.precip_pct}%
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {weatherErr && (
          <div style={{
            background: 'rgba(196,68,68,0.08)', color: '#c44',
            padding: '8px 14px', borderRadius: 8, marginBottom: 16, fontSize: 12,
          }}>
            Weather unavailable: {weatherErr}
          </div>
        )}

        {/* ── Active Projects ─────────────────────────────── */}
        <div style={{ marginBottom: 28 }}>
          <SectionHeader title="Active Projects" count={activeJobs.length} />
          {activeJobs.length === 0 ? (
            <EmptyState text="No active projects." />
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: mob ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 10,
            }}>
              {activeJobs.map(j => (
                <button key={j.id}
                  onClick={() => onOpenJob?.(j.id)}
                  style={{ ...cardStyle, cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s', width: '100%' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = '#C9A84C'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#E8E4DC'}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {j.address || '(No address)'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                      background: STATUS_DOT[j.status] || '#9CA3AF',
                    }} />
                    <span style={{ fontSize: 12, color: '#6B7280' }}>
                      {STATUS_LABEL[j.status] || j.status}
                    </span>
                    {j.client_name && (
                      <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        · {j.client_name}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── This Week ───────────────────────────────────── */}
        <div style={{ marginBottom: 28 }}>
          <SectionHeader title="This Week" count={schedItems.length} />
          {loadingSched ? (
            <div style={{ fontSize: 13, color: '#9CA3AF' }}>Loading...</div>
          ) : schedDates.length === 0 ? (
            <EmptyState text="Nothing scheduled for the next 7 days." />
          ) : (
            <div>
              {schedDates.map(date => (
                <div key={date} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                    {date === '__nodate' ? 'No date' : formatSchedDate(date)}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {schedByDate[date].map(item => (
                      <div key={item.id} style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 10 }}>
                        {item.scheduled_time && (
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#C9A84C', minWidth: 38, flexShrink: 0 }}>
                            {item.scheduled_time.slice(0, 5)}
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: '#0A1F44', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.title}
                          </div>
                          {item.job?.address && (
                            <div style={{ fontSize: 11, color: '#9CA3AF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.job.address}
                            </div>
                          )}
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', background: '#F7F5F0', borderRadius: 4, padding: '2px 6px', flexShrink: 0, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                          {TYPE_LABEL[item.type] || item.type}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Open To-dos ─────────────────────────────────── */}
        <div style={{ marginBottom: 28 }}>
          <SectionHeader title="Open To-dos" count={activeTodos.length} />
          {loadingTodos ? (
            <div style={{ fontSize: 13, color: '#9CA3AF' }}>Loading...</div>
          ) : activeTodos.length === 0 ? (
            <EmptyState text="All clear. Nothing needs your attention." />
          ) : (
            activeTodos.map(t => (
              <TodoCard key={t.id} todo={t} onRemove={removeTodo} setPendingAction={setPendingAction} onOpenWalkthrough={onOpenWalkthrough} />
            ))
          )}
        </div>

      </div>
    </div>
  );
}
