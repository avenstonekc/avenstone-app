import { useState } from 'react';
import { f$ } from '../../lib/utils';
import {
  sbDeclineBid,
  sbWithdrawEngagement,
  sbRemoveEngagement,
  sbAcceptBid,
  sbCompleteEngagement,
} from '../../lib/supabase';

const ACTION_CONFIG = {
  decline: {
    title:    'Decline this engagement?',
    btnLabel: 'Decline',
    color:    'red',
    hasReason: true,
    message: eng => `You'll be removed from this job for the ${eng.trade} trade. The general contractor will be notified.`,
    handler: (eng, reason) => sbDeclineBid({ engagementId: eng.id, reason: reason || null }),
  },
  withdraw: {
    title:    'Withdraw your bid?',
    btnLabel: 'Withdraw',
    color:    'red',
    hasReason: true,
    message: () => `Your bid will be removed and you'll exit this engagement.`,
    handler: (eng, reason) => sbWithdrawEngagement({ engagementId: eng.id, reason: reason || null }),
  },
  remove: {
    title:    'Remove this sub from the job?',
    btnLabel: 'Remove',
    color:    'red',
    hasReason: true,
    message: eng => `${eng.sub?.full_name || 'This sub'} will be removed from the ${eng.trade} trade. They'll see this if they check the engagement.`,
    handler: (eng, reason) => sbRemoveEngagement({ engagementId: eng.id, reason: reason || null }),
  },
  accept: {
    title:    'Accept this bid?',
    btnLabel: 'Accept Bid',
    color:    'navy',
    hasReason: false,
    message: eng => `Accept the ${f$(eng.current_bid?.total_amount)} bid from ${eng.sub?.full_name}? This activates the engagement and creates schedule items from the bid line items.`,
    handler: eng => sbAcceptBid({ engagementId: eng.id }),
  },
  complete: {
    title:    'Mark engagement complete?',
    btnLabel: 'Complete',
    color:    'navy',
    hasReason: false,
    message: eng => `Confirm ${eng.sub?.full_name} has finished the ${eng.trade} work? This moves the engagement off the active list.`,
    handler: eng => sbCompleteEngagement({ engagementId: eng.id }),
  },
};

export default function EngagementActionModal({ engagement, action, onClose, onConfirmed }) {
  const [reason,     setReason]     = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState(null);

  const cfg = ACTION_CONFIG[action];
  if (!cfg) return null;

  const handleConfirm = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await cfg.handler(engagement, reason.trim() || null);
      if (!res?.ok) {
        setError(res?.error || 'Action failed. Please try again.');
        return;
      }
      onConfirmed();
      onClose();
    } catch (e) {
      setError(e.message || 'Unexpected error.');
    } finally {
      setSubmitting(false);
    }
  };

  const redBtnStyle = {
    flex: 2, backgroundColor: '#dc2626', borderColor: '#b91c1c', color: '#fff',
    opacity: submitting ? 0.6 : 1, cursor: submitting ? 'not-allowed' : 'pointer',
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440, width: '100%' }} onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="modal-title" style={{ margin: 0 }}>{cfg.title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#9CA3AF', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.6, marginBottom: cfg.hasReason ? 20 : 24, marginTop: 0 }}>
          {cfg.message(engagement)}
        </p>

        {cfg.hasReason && (
          <div className="fg">
            <label className="flbl">Reason (optional)</label>
            <textarea
              className="finp"
              rows={3}
              placeholder="Add a note..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              style={{ resize: 'vertical', width: '100%', boxSizing: 'border-box' }}
            />
          </div>
        )}

        {error && (
          <div style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Cancel</button>
          {cfg.color === 'navy' ? (
            <button
              onClick={handleConfirm}
              disabled={submitting}
              className="btn btn-navy"
              style={{ flex: 2, opacity: submitting ? 0.6 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}
            >
              {submitting ? 'Working...' : cfg.btnLabel}
            </button>
          ) : (
            <button onClick={handleConfirm} disabled={submitting} className="btn" style={redBtnStyle}>
              {submitting ? 'Working...' : cfg.btnLabel}
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
