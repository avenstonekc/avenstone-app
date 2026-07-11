import { useState, useEffect } from 'react';
import { sbLoadEngagementsForJob, sbBuildSubWorkPacket } from '../../../lib/supabase';
import { buildSubWorkPacketPDF } from '../../../lib/pdf';
import { Ic, f$, fD, fDT } from '../../../lib/utils';
import AddSubToJobModal from '../../modals/AddSubToJobModal';
import EngagementActionModal from '../../modals/EngagementActionModal';

// ── Engagement status display ─────────────────────────────────────────────────
const ENG_STATUS_META = {
  invited:       { label: 'Invited',    color: 'var(--purple-text)',         bg: 'var(--purple-bg)' },
  bid_submitted: { label: 'Bid In',     color: 'var(--blue-text)',           bg: 'var(--blue-bg)' },
  active:        { label: 'Active',     color: 'var(--green-text-strong)',   bg: 'var(--green-bg)' },
  completed:     { label: 'Completed',  color: 'var(--text-muted)',          bg: 'var(--neutral-bg)' },
  declined:      { label: 'Declined',   color: 'var(--red-text-strong)',     bg: 'var(--red-bg)' },
  withdrawn:     { label: 'Withdrawn',  color: 'var(--red-text-strong)',     bg: 'var(--red-bg)' },
  removed:       { label: 'Removed',    color: 'var(--red-text-strong)',     bg: 'var(--red-bg)' },
};

// ── Main component ────────────────────────────────────────────────────────────
export default function SubsTab({ job, profile, setTab }) {
  const [engModalOpen, setEngModalOpen] = useState(false);
  const [toast, setToast] = useState('');
  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 4000); };

  const [engagements, setEngagements] = useState([]);
  const [showOffJob, setShowOffJob] = useState(false);
  const [engagementAction, setEngagementAction] = useState(null); // { engagement, action } | null
  const [packetBusy, setPacketBusy] = useState(null); // engagement id currently generating

  const loadEngagements = () => {
    sbLoadEngagementsForJob(job.id).then(res => { if (res.ok) setEngagements(res.data); });
  };

  useEffect(() => { loadEngagements(); }, [job.id]);

  // SCOPE_TO_ESTIMATE Phase D — generate a per-sub work packet PDF from the job's confirmed
  // selections, filtered to this engagement's trade (+ any trade-less "Unassigned" picks).
  const generatePacket = async (eng) => {
    if (!eng.trade) { showToast('This engagement has no trade set'); return; }
    setPacketBusy(eng.id);
    try {
      const res = await sbBuildSubWorkPacket(job.id, eng.trade);
      if (!res.ok) { showToast(res.error || 'Could not build work packet'); return; }
      const hasContent = (res.data.rooms?.length || 0) > 0 || (res.data.unassigned?.length || 0) > 0;
      if (!hasContent) { showToast('No confirmed selections on this job yet'); return; }
      const doc = await buildSubWorkPacketPDF({ packet: res.data, subName: eng.sub?.full_name });
      const safe = s => String(s || '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
      doc.save(`work-packet-${safe(eng.trade)}-${safe(job.address)}.pdf`);
    } catch (e) {
      showToast(e?.message || 'Work packet failed');
    } finally {
      setPacketBusy(null);
    }
  };

  return (
    <div style={{ padding: '0 0 80px', display: 'flex', flexDirection: 'column', gap: 24 }}>

      {toast && <div style={{ background: 'var(--green-bg)', color: 'var(--green-text-strong)', padding: '10px 14px', borderRadius: 'var(--r-sm)', fontSize: 13, border: '1px solid #BBF7D0' }}>{toast}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setEngModalOpen(true)} className="btn btn-navy" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12 }}>{Ic.plus}</span>Add Sub
        </button>
      </div>

      {/* ── Engagements ── */}
      <section>
        <h3 style={{ color: 'var(--text-primary)', fontSize: 15, fontWeight: 700, margin: '0 0 12px', fontFamily: 'var(--font-display)' }}>Engagements</h3>
        {engagements.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No engagements yet. Click 'Add Sub' to create one.</p>
        ) : (() => {
          const awaiting  = engagements.filter(e => ['invited', 'bid_submitted'].includes(e.status));
          const active    = engagements.filter(e => e.status === 'active');
          const completed = engagements.filter(e => e.status === 'completed');
          const offJob    = engagements.filter(e => ['declined', 'withdrawn', 'removed'].includes(e.status));

          const rowStyle = { background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-xs)', padding: '12px 16px', marginBottom: 8 };
          const groupLbl = (label, count) => (
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              {label}
              <span style={{ background: 'var(--neutral-bg)', color: 'var(--text-subtle)', borderRadius: 'var(--r-full)', padding: '1px 7px', fontSize: 10 }}>{count}</span>
            </div>
          );

          const renderRow = eng => {
            const meta = ENG_STATUS_META[eng.status] || ENG_STATUS_META.invited;
            const lastTs = [eng.invited_at, eng.bid_submitted_at, eng.activated_at, eng.completed_at, eng.terminated_at].filter(Boolean).sort().pop();

            const btnStyle = (variant) => ({
              background: variant === 'primary' ? 'var(--navy-100)' : 'transparent',
              border: `1px solid ${variant === 'primary' ? 'var(--navy-900)' : 'var(--border)'}`,
              color: variant === 'primary' ? 'var(--navy-900)' : 'var(--text-muted)',
              borderRadius: 'var(--r-xs)', padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            });

            const open = (action) => setEngagementAction({ engagement: eng, action });

            return (
              <div key={eng.id} style={rowStyle}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{eng.sub?.full_name || '—'}</span>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--r-full)', background: meta.bg, color: meta.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>{meta.label}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      {eng.trade && <span>{eng.trade}</span>}
                      {eng.status === 'bid_submitted' && eng.current_bid?.total_amount != null && (
                        <span style={{ color: 'var(--navy-900)', fontWeight: 600 }}>{f$(eng.current_bid.total_amount)}</span>
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
                      <button style={btnStyle('ghost')} onClick={() => generatePacket(eng)} disabled={packetBusy === eng.id}>
                        {packetBusy === eng.id ? 'Building…' : 'Work packet'}
                      </button>
                      <button style={btnStyle('primary')} onClick={() => open('complete')}>Complete</button>
                      <button style={btnStyle('ghost')} onClick={() => open('remove')}>Remove</button>
                    </>)}
                  </div>
                </div>
                {eng.current_bid?.earliest_start_date && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-subtle)' }}>
                    <span>Available: </span>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{fD(eng.current_bid.earliest_start_date)}</span>
                    {eng.current_bid.availability_notes && (
                      <span> — {eng.current_bid.availability_notes}</span>
                    )}
                  </div>
                )}
                {Array.isArray(eng.current_bid?.line_items) && eng.current_bid.line_items.length > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                    {eng.current_bid.line_items.map((li, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--text-subtle)', padding: '2px 0' }}>
                        <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{li.description}</span>
                        <span style={{ flexShrink: 0 }}>{li.quantity}{li.unit ? ' ' + li.unit : ''} @ {f$(li.unit_price)}</span>
                        <span style={{ flexShrink: 0, color: 'var(--navy-900)', fontWeight: 600, minWidth: 60, textAlign: 'right' }}>{f$(li.line_total)}</span>
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
                  <button onClick={() => setShowOffJob(v => !v)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', padding: 0, marginBottom: 8 }}>
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
