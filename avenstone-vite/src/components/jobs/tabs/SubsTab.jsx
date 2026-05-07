import { useState, useEffect } from 'react';
import { sbLoadEngagementsForJob } from '../../../lib/supabase';
import { Ic, f$, fD, fDT } from '../../../lib/utils';
import AddSubToJobModal from '../../modals/AddSubToJobModal';
import EngagementActionModal from '../../modals/EngagementActionModal';

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
  const [showOffJob, setShowOffJob] = useState(false);
  const [engagementAction, setEngagementAction] = useState(null); // { engagement, action } | null

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

            const btnStyle = (variant) => ({
              background: variant === 'primary' ? '#1e3a5f' : 'transparent',
              border: `1px solid ${variant === 'primary' ? '#3b82f6' : '#374151'}`,
              color: variant === 'primary' ? '#60a5fa' : '#9ca3af',
              borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            });

            const open = (action) => setEngagementAction({ engagement: eng, action });

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
                      <button style={btnStyle('ghost')} onClick={() => open('withdraw')}>Withdraw</button>
                    )}
                    {eng.status === 'bid_submitted' && (<>
                      <button style={btnStyle('primary')} onClick={() => open('accept')}>Accept</button>
                      <button style={btnStyle('ghost')} onClick={() => open('decline')}>Decline</button>
                      <button style={btnStyle('ghost')} onClick={() => open('withdraw')}>Withdraw</button>
                    </>)}
                    {eng.status === 'active' && (<>
                      <button style={btnStyle('primary')} onClick={() => open('complete')}>Complete</button>
                      <button style={btnStyle('ghost')} onClick={() => open('remove')}>Remove</button>
                    </>)}
                  </div>
                </div>
                {eng.current_bid?.earliest_start_date && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #1f2937', fontSize: 11, color: '#9ca3af' }}>
                    <span>Available: </span>
                    <span style={{ color: '#d1d5db', fontWeight: 600 }}>{fD(eng.current_bid.earliest_start_date)}</span>
                    {eng.current_bid.availability_notes && (
                      <span> — {eng.current_bid.availability_notes}</span>
                    )}
                  </div>
                )}
                {Array.isArray(eng.current_bid?.line_items) && eng.current_bid.line_items.length > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #1f2937' }}>
                    {eng.current_bid.line_items.map((li, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 8, fontSize: 11, color: '#9ca3af', padding: '2px 0' }}>
                        <span style={{ flex: 1, color: '#d1d5db' }}>{li.description}</span>
                        <span style={{ flexShrink: 0 }}>{li.quantity}{li.unit ? ' ' + li.unit : ''} @ {f$(li.unit_price)}</span>
                        <span style={{ flexShrink: 0, color: '#60a5fa', fontWeight: 600, minWidth: 60, textAlign: 'right' }}>{f$(li.line_total)}</span>
                      </div>
                    ))}
                  </div>
                )}
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

      {engagementAction && (
        <EngagementActionModal
          engagement={engagementAction.engagement}
          action={engagementAction.action}
          onClose={() => setEngagementAction(null)}
          onConfirmed={() => {
            const msgs = {
              accept:   'Bid accepted — review draft schedule items',
              decline:  'Bid declined',
              withdraw: 'Engagement withdrawn',
              complete: 'Engagement completed',
              remove:   'Sub removed from job',
            };
            showToast(msgs[engagementAction.action] || 'Done');
            loadEngagements();
          }}
        />
      )}
    </div>
  );
}
