import { useState } from 'react';
import { sb } from '../../lib/supabase';

function relativeTime(ts) {
  if (!ts) return '—';
  const secs = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

const STATUS_COLORS = {
  open: { bg: '#FEE2E2', color: '#991B1B' },
  in_progress: { bg: '#FEF3C7', color: '#92400E' },
  fixed: { bg: '#D1FAE5', color: '#166534' },
  wontfix: { bg: '#F3F4F6', color: '#6B7280' },
};

export default function BugReportDetailModal({ bug, onClose, onFixed }) {
  const [copyDone, setCopyDone] = useState(false);
  const [marking, setMarking] = useState(false);

  if (!bug) return null;

  const buildClaudePrompt = () => {
    const breadcrumbs = Array.isArray(bug.breadcrumbs) ? bug.breadcrumbs : [];
    const consoleErrors = Array.isArray(bug.console_errors) ? bug.console_errors : [];
    const networkErrors = Array.isArray(bug.network_errors) ? bug.network_errors : [];
    const formatBc = breadcrumbs.map((b, i) =>
      `${i + 1}. [${(b.ts || '').slice(11, 19)}] ${b.type} — ${b.label || b.route || ''}`
    ).join('\n');
    const formatCe = consoleErrors.map(e => `• ${(e.ts || '').slice(11, 19)} ${e.message || ''}`).join('\n');
    const formatNe = networkErrors.map(e => `• ${(e.ts || '').slice(11, 19)} [${e.type}] ${e.message || ''}`).join('\n');

    return `Bug report from user (${bug.user_role}) at bug ID ${bug.id}.

User said:
"${bug.description}"

Route at time of bug: ${bug.route || 'unknown'}
App version: ${bug.app_version || 'unknown'} | Device: ${bug.device_info || 'unknown'}
Submitted: ${bug.created_at}

Last 20 user actions before bug:
${formatBc || 'None'}

Console errors (last 10):
${formatCe || 'None'}

Network errors (last 10):
${formatNe || 'None'}

Screenshot: ${bug.screenshot_url || 'none'}

---

Tasks:
1. AUDIT FIRST. Read the component(s) at the failing route and any edge fn called in the network errors above. Report what's there before any fix hypothesis. Cite specific file paths and line numbers.
2. State your hypothesis labeled "Hypothesis:" not "Confirmed:" — must be grounded in the breadcrumbs/errors above, not invented.
3. If the fix is one-line obvious (typo, missing await, off-by-one, wrong return shape), patch and explain. Otherwise wait for human greenlight on the hypothesis before patching.
4. One commit per logical change. Push to main per commit. Do not batch.
5. Append a [LOG — YYYY-MM-DD] entry to CLAUDE_MEMORY.md noting bug ID ${bug.id}, root cause, and fix.
6. After merge, update bug_reports row ${bug.id}: status='fixed', fixed_at=NOW().

Do not touch unrelated files. Stay in scope. Do not opportunistically refactor.`;
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(buildClaudePrompt());
      setCopyDone(true);
      setTimeout(() => setCopyDone(false), 3000);
    } catch (e) {
      alert('Copy failed — use Ctrl+C');
    }
  };

  const markFixed = async () => {
    setMarking(true);
    await sb.from('bug_reports').update({
      status: 'fixed',
      fixed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', bug.id);
    setMarking(false);
    onFixed?.(bug.id);
    onClose?.();
  };

  const breadcrumbs = Array.isArray(bug.breadcrumbs) ? bug.breadcrumbs : [];
  const consoleErrors = Array.isArray(bug.console_errors) ? bug.console_errors : [];
  const networkErrors = Array.isArray(bug.network_errors) ? bug.network_errors : [];
  const statusStyle = STATUS_COLORS[bug.status] || STATUS_COLORS.open;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 16px' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 700, padding: 28, fontFamily: 'DM Sans, sans-serif', position: 'relative' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 16, right: 16, background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#9CA3AF', lineHeight: 1 }}>✕</button>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ background: statusStyle.bg, color: statusStyle.color, borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600 }}>{bug.status}</span>
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>{relativeTime(bug.created_at)} · {bug.route || '—'} · {bug.user_role}</span>
        </div>

        <div style={{ fontSize: 18, fontWeight: 700, color: '#0A1F44', marginBottom: 16, lineHeight: 1.4 }}>{bug.description}</div>

        {/* Screenshot */}
        {bug.screenshot_url && (
          <div style={{ marginBottom: 20 }}>
            <img src={bug.screenshot_url} alt="screenshot" loading="lazy"
              style={{ maxWidth: '100%', borderRadius: 8, border: '1px solid #E8E4DC' }} />
          </div>
        )}

        {/* Breadcrumbs timeline */}
        {breadcrumbs.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44', marginBottom: 8 }}>Last actions</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {breadcrumbs.map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, color: '#374151' }}>
                  <span style={{ color: '#9CA3AF', flexShrink: 0 }}>{(b.ts || '').slice(11, 19)}</span>
                  <span style={{ fontWeight: 600, color: '#C9A84C', flexShrink: 0 }}>{b.type}</span>
                  <span>{b.label || b.route || ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Console errors */}
        {consoleErrors.length > 0 && (
          <details style={{ marginBottom: 16 }}>
            <summary style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44', cursor: 'pointer', marginBottom: 6 }}>
              Console errors ({consoleErrors.length})
            </summary>
            <div style={{ background: '#FEF2F2', borderRadius: 6, padding: 10, fontFamily: 'monospace', fontSize: 11, color: '#991B1B' }}>
              {consoleErrors.map((e, i) => <div key={i}>{(e.ts || '').slice(11, 19)} {e.message}</div>)}
            </div>
          </details>
        )}

        {/* Network errors */}
        {networkErrors.length > 0 && (
          <details style={{ marginBottom: 16 }}>
            <summary style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44', cursor: 'pointer', marginBottom: 6 }}>
              Network errors ({networkErrors.length})
            </summary>
            <div style={{ background: '#FEF2F2', borderRadius: 6, padding: 10, fontFamily: 'monospace', fontSize: 11, color: '#991B1B' }}>
              {networkErrors.map((e, i) => <div key={i}>{(e.ts || '').slice(11, 19)} [{e.type}] {e.message}</div>)}
            </div>
          </details>
        )}

        <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 20 }}>
          ID: {bug.id} · v{bug.app_version || '—'} · {bug.device_info || '—'}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={copyPrompt}
            style={{ flex: 1, padding: '10px 16px', borderRadius: 8, background: copyDone ? '#D1FAE5' : '#0A1F44', color: copyDone ? '#166534' : '#C9A84C', border: 'none', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'background 0.2s' }}>
            {copyDone ? '✓ Copied!' : 'Copy as Claude prompt'}
          </button>
          {bug.status !== 'fixed' && (
            <button onClick={markFixed} disabled={marking}
              style={{ flex: 1, padding: '10px 16px', borderRadius: 8, background: '#D1FAE5', color: '#166534', border: '1px solid #22c55e', fontFamily: 'DM Sans, sans-serif', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {marking ? 'Marking…' : 'Mark fixed'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
