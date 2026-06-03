import { useState, useEffect } from 'react';
import { sbLoadJobWalkthroughs } from '../../../lib/supabase.js';

const STATUS_CONFIG = {
  not_started: { label: 'Not started', color: '#9CA3AF', bg: '#F9FAFB', border: '#E5E7EB' },
  in_progress: { label: 'In progress', color: '#92400e', bg: '#FEF3C7', border: '#FCD34D' },
  complete:    { label: 'Complete',    color: '#166534', bg: '#F0FDF4', border: '#BBF7D0' },
};

export default function WalkthroughsTab({ job, onOpenWalkthrough }) {
  const [walkthroughs, setWalkthroughs] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);

  useEffect(() => { load(); }, [job?.id]);

  const load = async () => {
    if (!job?.id) return;
    setLoading(true);
    setError(null);
    const { ok, data, error: err } = await sbLoadJobWalkthroughs(job.id);
    if (!ok) { setError(err); setLoading(false); return; }
    setWalkthroughs(data || []);
    setLoading(false);
  };

  if (loading) return (
    <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: '#9CA3AF' }}>
      Loading walkthroughs…
    </div>
  );

  if (error) return (
    <div style={{ background: '#FEE2E2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>
      {error}
    </div>
  );

  if (!walkthroughs.length) return (
    <div style={{ padding: '32px 0', textAlign: 'center' }}>
      <div style={{ fontSize: 13, color: '#9CA3AF' }}>No walkthroughs generated for this job yet.</div>
      <div style={{ fontSize: 12, color: '#D1D5DB', marginTop: 4 }}>Walkthroughs generate when a job is sold.</div>
    </div>
  );

  const done    = walkthroughs.filter(w => w.status === 'complete').length;
  const pending = walkthroughs.filter(w => w.status !== 'complete').length;

  return (
    <div>
      {/* Summary bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: '#6B7280' }}>
          {done} of {walkthroughs.length} complete
        </div>
        {pending > 0 && (
          <div style={{ fontSize: 12, color: '#92400e', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 4, padding: '2px 8px' }}>
            {pending} pending
          </div>
        )}
      </div>

      {/* Walkthrough list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {walkthroughs.map(w => {
          const cfg = STATUS_CONFIG[w.status];
          const canOpen = !!onOpenWalkthrough;
          const progressPct = w.total > 0 ? Math.round((w.resolved / w.total) * 100) : 0;

          return (
            <button
              key={w.work_type}
              onClick={() => canOpen && onOpenWalkthrough(job.id, w.work_type, null)}
              disabled={!canOpen}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                background: cfg.bg, border: `1px solid ${cfg.border}`,
                borderLeft: `4px solid ${cfg.color}`,
                borderRadius: 8, padding: '14px 14px',
                cursor: canOpen ? 'pointer' : 'default',
                transition: 'all 0.12s',
                minHeight: 60,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0A1F44', flex: 1, lineHeight: 1.3 }}>
                  {w.work_type}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: cfg.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {cfg.label}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Progress */}
                <div style={{ fontSize: 12, color: '#6B7280' }}>
                  {w.status === 'not_started'
                    ? `${w.item_count} item${w.item_count !== 1 ? 's' : ''}`
                    : `${w.resolved}/${w.total} items`}
                </div>

                {/* Progress bar (only when started) */}
                {w.status !== 'not_started' && w.total > 0 && (
                  <div style={{ flex: 1, minWidth: 60, maxWidth: 100, height: 4, background: '#E5E7EB', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${progressPct}%`, background: w.status === 'complete' ? '#16a34a' : '#C9A84C', borderRadius: 2, transition: 'width 0.3s' }} />
                  </div>
                )}

                {/* Must-doc pending badge */}
                {w.must_doc_pending > 0 && (
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#d97706', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 3, padding: '1px 6px', whiteSpace: 'nowrap' }}>
                    ⚠ {w.must_doc_pending} must-doc
                  </div>
                )}

                {/* Must-doc satisfied */}
                {w.status === 'complete' && w.must_doc_count > 0 && (
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#16a34a' }}>
                    ✓ docs captured
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
