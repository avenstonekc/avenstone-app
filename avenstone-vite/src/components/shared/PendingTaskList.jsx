import { useState, useEffect } from 'react';
import { sbLoadMyPendingTasks, sbDiscardPendingTask, sbIncrementSnooze } from '../../lib/pendingTasks';
import ChipPicker from './ChipPicker';

const VERB_LABELS = {
  receipt: 'Receipt',
  todo: 'Todo',
  lead: 'Lead',
  change_order: 'Change Order',
  bug: 'Bug',
};

const DISCARD_CHIPS = [
  { id: 'misclick', label: 'Misclick' },
  { id: 'duplicate', label: 'Duplicate' },
  { id: 'no_longer_needed', label: 'No longer needed' },
  { id: 'completed_outside_app', label: 'Completed outside app' },
];

function agePill(createdAt) {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours < 24) return { color: '#166534', bg: '#D1FAE5', label: '< 24h' };
  if (ageHours < 48) return { color: '#92400e', bg: '#FEF3C7', label: '1–2 days' };
  return { color: '#991b1b', bg: '#FEE2E2', label: '> 2 days' };
}

/**
 * PendingTaskList — horizontally scrollable card row above tile grid.
 * Props:
 *   onResume  (task) => void — called when Resume is tapped
 */
export default function PendingTaskList({ onResume }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [discardingId, setDiscardingId] = useState(null);

  const load = async () => {
    const result = await sbLoadMyPendingTasks();
    setTasks(result.data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleResume = async (task) => {
    if (task.last_opened_at) {
      await sbIncrementSnooze(task.id);
    }
    if (onResume) onResume(task);
  };

  const handleDiscard = async (task, chipResult) => {
    await sbDiscardPendingTask(task.id, chipResult.id);
    setDiscardingId(null);
    setTasks(prev => prev.filter(t => t.id !== task.id));
  };

  if (loading || tasks.length === 0) return null;

  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{
        fontSize: 11,
        fontFamily: 'DM Sans, sans-serif',
        color: 'rgba(247,245,240,0.4)',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 8,
      }}>
        In progress ({tasks.length})
      </div>
      <div style={{
        display: 'flex',
        gap: 10,
        overflowX: 'auto',
        paddingBottom: 4,
        scrollbarWidth: 'none',
      }}>
        {tasks.map(task => {
          const age = agePill(task.created_at);
          const isDiscarding = discardingId === task.id;
          const verbLabel = VERB_LABELS[task.verb] || task.verb;

          return (
            <div
              key={task.id}
              style={{
                minWidth: 180,
                maxWidth: 220,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(201,168,76,0.25)',
                borderRadius: 10,
                padding: 12,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              {isDiscarding ? (
                <div>
                  <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, color: 'rgba(247,245,240,0.7)', marginBottom: 8 }}>
                    Why are you discarding this?
                  </div>
                  <ChipPicker
                    chips={DISCARD_CHIPS}
                    allowOther={false}
                    onSelect={(chip) => handleDiscard(task, chip)}
                  />
                  <button
                    onClick={() => setDiscardingId(null)}
                    style={{ marginTop: 8, background: 'none', border: 'none', color: 'rgba(247,245,240,0.4)', fontFamily: 'DM Sans, sans-serif', fontSize: 11, cursor: 'pointer', padding: 0 }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 600, color: '#C9A84C' }}>{verbLabel}</span>
                    <span style={{ background: age.bg, color: age.color, borderRadius: 10, padding: '2px 7px', fontSize: 10, fontFamily: 'DM Sans, sans-serif', fontWeight: 600 }}>{age.label}</span>
                  </div>
                  {task.quick_label && (
                    <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 13, color: 'rgba(247,245,240,0.85)', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {task.quick_label}
                    </div>
                  )}
                  {task.snooze_count > 0 && (
                    <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 11, color: 'rgba(247,245,240,0.4)' }}>
                      Snoozed {task.snooze_count}×
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                    <button
                      onClick={() => handleResume(task)}
                      style={{ flex: 1, padding: '6px 10px', borderRadius: 6, background: '#C9A84C', color: '#0A1F44', border: 'none', fontFamily: 'DM Sans, sans-serif', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Resume
                    </button>
                    <button
                      onClick={() => setDiscardingId(task.id)}
                      title="Discard"
                      style={{ padding: '6px 8px', borderRadius: 6, background: 'transparent', border: '1px solid rgba(247,245,240,0.15)', color: 'rgba(247,245,240,0.4)', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', fontSize: 12 }}
                    >
                      ✕
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
