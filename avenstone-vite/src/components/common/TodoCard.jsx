import { useState, useEffect } from 'react';
import { sb, sbCompleteTodo, sbSnoozeTodo, sbDismissTodo } from '../../lib/supabase';

const SEV_COLOR = { high: 'var(--red-text)', medium: 'var(--gold-500)', low: 'var(--text-subtle)' };
const AMBER = 'var(--amber-text)';
const AMBER_BG = 'var(--amber-bg)';   /* #FEF3C7 — LOCKED */
const AMBER_BORDER = 'var(--amber-border)'; /* #FCD34D — LOCKED */

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function TodoCard({ todo, onRemove, setPendingAction, onOpenWalkthrough }) {
  const [showSnooze, setShowSnooze] = useState(false);
  const [snoozing, setSnoozing] = useState(false);
  const [bugStatus, setBugStatus] = useState(null);

  useEffect(() => {
    if (!todo.bug_report_id) return;

    // Fetch initial status
    sb.from('bug_reports').select('status').eq('id', todo.bug_report_id).single()
      .then(({ data }) => { if (data) setBugStatus(data.status); });

    // Subscribe to status transitions
    const channel = sb.channel(`bug-${todo.bug_report_id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'bug_reports',
        filter: `id=eq.${todo.bug_report_id}`,
      }, payload => {
        if (payload.new?.status) setBugStatus(payload.new.status);
      })
      .subscribe();

    return () => { sb.removeChannel(channel); };
  }, [todo.bug_report_id]);

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

  const isFailedIntent    = todo.type === 'failed_intent';
  const isWalkthroughPrep = todo.type === 'walkthrough_prep';
  const accentColor = isFailedIntent ? AMBER : (SEV_COLOR[todo.priority] || '#C9A84C');

  const handleResume = () => {
    if (!setPendingAction || !todo.payload) return;
    setPendingAction({ kind: todo.payload.kind, payload: todo.payload, todoId: todo.id, jobId: todo.payload.jobId || null });
  };

  const btnBase = {
    border: '1px solid var(--border)', background: 'var(--card-bg)', cursor: 'pointer',
    fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 'var(--r-xs)',
    color: 'var(--text-muted)', transition: 'all 0.12s',
  };

  const renderResumeArea = () => {
    if (!isFailedIntent) return null;

    if (bugStatus === 'attempting') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: AMBER, fontWeight: 600 }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: `2px solid ${AMBER}`, borderTopColor: 'transparent', animation: 'aiSpin 0.8s linear infinite' }} />
          AI fix in progress…
        </div>
      );
    }

    if (bugStatus === 'auto_fixed') {
      return (
        <>
          <div style={{ fontSize: 12, color: 'var(--green-text)', fontWeight: 600 }}>✓ AI fixed it</div>
          <button
            style={{ ...btnBase, background: 'var(--green-text)', border: '1px solid var(--green-text)', color: '#fff', fontWeight: 700 }}
            onClick={handleResume}
          >
            ↩ Try again
          </button>
        </>
      );
    }

    if (bugStatus === 'auto_fix_failed') {
      return (
        <>
          <div style={{ fontSize: 12, color: AMBER, fontWeight: 600 }}>Fix failed — reported</div>
          {todo.payload?.resumable !== false && (
            <button style={{ ...btnBase, background: AMBER, border: `1px solid ${AMBER}`, color: '#0A1F44', fontWeight: 700 }} onClick={handleResume}>
              ↩ Resume
            </button>
          )}
        </>
      );
    }

    if (bugStatus === 'auto_fix_unknown') {
      return (
        <>
          <div style={{ fontSize: 12, color: AMBER, fontWeight: 600 }}>Fix status unknown</div>
          {todo.payload?.resumable !== false && (
            <button style={{ ...btnBase, background: AMBER, border: `1px solid ${AMBER}`, color: '#0A1F44', fontWeight: 700 }} onClick={handleResume}>
              ↩ Resume
            </button>
          )}
        </>
      );
    }

    if (bugStatus === 'needs_human') {
      return (
        <>
          <div style={{ fontSize: 12, color: AMBER, fontWeight: 600 }}>Reported to team</div>
          {todo.payload?.resumable !== false && (
            <button style={{ ...btnBase, background: AMBER, border: `1px solid ${AMBER}`, color: '#0A1F44', fontWeight: 700 }} onClick={handleResume}>
              ↩ Resume
            </button>
          )}
        </>
      );
    }

    // Default: no bug linked or open/in_progress
    if (todo.payload?.resumable !== false) {
      return (
        <button style={{ ...btnBase, background: AMBER, border: `1px solid ${AMBER}`, color: '#0A1F44', fontWeight: 700 }} onClick={handleResume}>
          ↩ Resume
        </button>
      );
    }

    return null;
  };

  return (
    <div style={{ background: isFailedIntent ? AMBER_BG : 'var(--card-bg)', border: `1px solid ${isFailedIntent ? AMBER_BORDER : 'var(--border)'}`, borderLeft: `3px solid ${accentColor}`, borderRadius: 'var(--r-sm)', padding: '14px 16px', marginBottom: 10, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: accentColor, marginTop: 5, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{todo.title}</div>
          {(todo.notes || todo.body) && <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 4 }}>{todo.notes || todo.body}</div>}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-subtle)' }}>
            {todo.job?.address && <span>📍 {todo.job.address}</span>}
            <span>{timeAgo(todo.created_at)}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {isWalkthroughPrep && onOpenWalkthrough && todo.payload?.work_type && (
          <button
            style={{ ...btnBase, background: '#0A1F44', border: '1px solid #0A1F44', color: '#C9A84C', fontWeight: 700 }}
            onClick={() => onOpenWalkthrough(todo.job_id, todo.payload.work_type, todo.id)}
          >
            📋 Start Walkthrough
          </button>
        )}
        {renderResumeArea()}
        <button style={{ ...btnBase, background: 'var(--green-bg)', border: '1px solid #BBF7D0', color: 'var(--green-text)' }} onClick={handleDone}>
          ✓ Done
        </button>

        <div style={{ position: 'relative' }}>
          <button style={btnBase} onClick={() => setShowSnooze(p => !p)} disabled={snoozing}>
            Snooze ▾
          </button>
          {showSnooze && (
            <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 4, background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', boxShadow: 'var(--shadow-md)', zIndex: 100, minWidth: 140 }}>
              {[['1 day', 24], ['3 days', 72], ['1 week', 168]].map(([label, hours]) => (
                <button key={hours} onClick={() => handleSnooze(hours)} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '9px 14px', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
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
