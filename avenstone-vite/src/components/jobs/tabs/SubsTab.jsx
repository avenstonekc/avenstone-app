import { useState, useEffect } from 'react';
import {
  sbLoadEngagementsForJob, sbAcceptBid, sbDeclineBid,
  sbWithdrawEngagement, sbRemoveEngagement, sbCompleteEngagement,
} from '../../../lib/supabase';
import { Ic, f$, fDT } from '../../../lib/utils';
import AddSubToJobModal from '../../modals/AddSubToJobModal';

// ── Engagement status display ─────────────────────────────────────────────────
const ENG_STATUS_META = {
  invited:       { label: 'Invited',    color: '#c084fc', bg: '#3b0764' },
  bid_submitted: { label: 'Bid In',     color: '#60a5fa', bg: '#1e3a5f' },
  active:        { label: 'Active',     color: '#22c55e', bg: '#052e16' },
  completed:     { label: 'Completed',  color: '#9ca3af', bg: '#1f2937' },
  declined:      { label: 'Declined',   color: '#ef4444', bg: '#450a0a' },
  withdrawn:     { label: 'Withdrawn',  color: '#ef4444', bg: '#450a0a' },
  removed:       { label: 'Removed',    color: '#ef4444', bg: '#450a0a' },
};

// ── Main component ────────────────────────────────────────────────────────────
export default function SubsTab({ job, profile, setTab }) {
  const [engModalOpen, setEngModalOpen] = useState(false);
  const [toast, setToast] = useState('');
  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 4000); };

  const [engagements, setEngagements] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [showOffJob, setShowOffJob] = useState(false);

  const loadEngagements = () => {
    sbLoadEngagementsForJob(job.id).then(res => { if (res.ok) setEngagements(res.data); });
  };

  useEffect(() => { loadEngagements(); }, [job.id]);

  return (
    <div style={{ padding: '0 0 80px', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {toast && <div style={{ background: '#D1FAE5', color: '#065F46', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>{toast}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setEngModalOpen(true)} style={{ background: '#1f2937', border: '1px solid #374151', color: '#f9fafb', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12 }}>{Ic.plus}</span>Add Sub
        </button>
      </div>

      {/* ── Engagements ── */}
      <section>
        <h3 style={{ color: '#f9fafb', fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>Engagements</h3>
        {engagements.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: 13 }}>No engagements yet. Click 'Add Sub' to create one.</p>
        ) : (() => {
          const awaiting  = engagements.filter(e => ['invited', 'bid_submitted'].includes(e.status));
          const active    = engagements.filter(e => e.status === 'active');
          const completed = engagements.filter(e => e.status === 'completed');
          const offJob    = engagements.filter(e => ['declined', 'withdrawn', 'removed'].includes(e.status));

          const rowStyle = { background: '#111827', border: '1px solid #1f2937', borderRadius: 10, padding: '12px 16px', marginBottom: 8 };
          const groupLbl = (label, count) => (
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              {label}
              <span style={{ background: '#1f2937', color: '#9ca3af', borderRadius: 10, padding: '1px 7px', fontSize: 10 }}>{count}</span>
            </div>
          );

          const renderRow = eng => {
            const meta = ENG_STATUS_META[eng.status] || ENG_STATUS_META.invited;
            const lastTs = [eng.invited_at, eng.bid_submitted_at, eng.activated_at, eng.completed_at, eng.terminated_at].filter(Boolean).sort().pop();
            const busy = busyId === eng.id;

            const btnStyle = (variant) => ({
              background: variant === 'primary' ? '#1e3a5f' : 'transparent',
              border: `1px solid ${variant === 'primary' ? '#3b82f6' : '#374151'}`,
              color: variant === 'primary' ? '#60a5fa' : '#9ca3af',
              borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
            });

            const doAccept = async () => {
              if (!window.confirm('Accept this bid? Schedule items will be auto-drafted.')) return;
              setBusyId(eng.id);
              try {
                const res = await sbAcceptBid({ engagementId: eng.id });
                if (!res.ok) { alert(res.error || 'Accept failed'); return; }
                showToast('Bid accepted — review draft schedule items');
                loadEngagements();
              } finally { setBusyId(null); }
            };
            const doDecline = async () => {
              const reason = window.prompt('Reason for declining (required):');
              if (!reason?.trim()) return;
              setBusyId(eng.id);
              try {
                const res = await sbDeclineBid({ engagementId: eng.id, reason: reason.trim() });
                if (!res.ok) { alert(res.error || 'Decline failed'); return; }
                showToast('Bid declined');
                loadEngagements();
              } finally { setBusyId(null); }
            };
            const doWithdraw = async () => {
              const reason = window.prompt('Reason for withdrawing (required):');
              if (!reason?.trim()) return;
              setBusyId(eng.id);
              try {
                const res = await sbWithdrawEngagement({ engagementId: eng.id, reason: reason.trim() });
                if (!res.ok) { alert(res.error || 'Withdraw failed'); return; }
                showToast('Engagement withdrawn');
                loadEngagements();
              } finally { setBusyId(null); }
            };
            const doComplete = async () => {
              if (!window.confirm('Mark this engagement complete?')) return;
              setBusyId(eng.id);
              try {
                const res = await sbCompleteEngagement({ engagementId: eng.id });
                if (!res.ok) { alert(res.error || 'Complete failed'); return; }
                showToast('Engagement completed');
                loadEngagements();
              } finally { setBusyId(null); }
            };
            const doRemove = async () => {
              const reason = window.prompt('Reason for removing sub from job (required):');
              if (!reason?.trim()) return;
              setBusyId(eng.id);
              try {
                const res = await sbRemoveEngagement({ engagementId: eng.id, reason: reason.trim() });
                if (!res.ok) { alert(res.error || 'Remove failed'); return; }
                showToast('Sub removed from job');
                loadEngagements();
              } finally { setBusyId(null); }
            };

            return (
              <div key={eng.id} style={rowStyle}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: '#f9fafb' }}>{eng.sub?.full_name || '—'}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: meta.bg, color: meta.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>{meta.label}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {eng.trade && <span>{eng.trade}</span>}
                      {eng.status === 'bid_submitted' && eng.current_bid?.total_amount != null && (
                        <span style={{ color: '#60a5fa', fontWeight: 600 }}>{f$(eng.current_bid.total_amount)}</span>
                      )}
                      {lastTs && <span>{fDT(lastTs)}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {eng.status === 'invited' && (
                      <button style={btnStyle('ghost')} disabled={busy} onClick={doWithdraw}>Withdraw</button>
                    )}
                    {eng.status === 'bid_submitted' && (<>
                      <button style={btnStyle('primary')} disabled={busy} onClick={doAccept}>Accept</button>
                      <button style={btnStyle('ghost')} disabled={busy} onClick={doDecline}>Decline</button>
                      <button style={btnStyle('ghost')} disabled={busy} onClick={doWithdraw}>Withdraw</button>
                    </>)}
                    {eng.status === 'active' && (<>
                      <button style={btnStyle('primary')} disabled={busy} onClick={doComplete}>Complete</button>
                      <button style={btnStyle('ghost')} disabled={busy} onClick={doRemove}>Remove</button>
                    </>)}
                  </div>
                </div>
              </div>
            );
          };

          return (
            <div>
              {awaiting.length > 0 && <div style={{ marginBottom: 16 }}>{groupLbl('Awaiting bid', awaiting.length)}{awaiting.map(renderRow)}</div>}
              {active.length > 0 && <div style={{ marginBottom: 16 }}>{groupLbl('Active', active.length)}{active.map(renderRow)}</div>}
              {completed.length > 0 && <div style={{ marginBottom: 16 }}>{groupLbl('Completed', completed.length)}{completed.map(renderRow)}</div>}
              {offJob.length > 0 && (
                <div>
                  <button onClick={() => setShowOffJob(v => !v)} style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 8 }}>
                    {showOffJob ? '▾' : '▸'} Show {offJob.length} off-job
                  </button>
                  {showOffJob && offJob.map(renderRow)}
                </div>
              )}
            </div>
          );
        })()}
      </section>

      <AddSubToJobModal isOpen={engModalOpen} onClose={() => setEngModalOpen(false)} onSuccess={() => { showToast('Engagement created — sub invited to bid'); loadEngagements(); }} initialJobId={job.id} />
    </div>
  );
}
