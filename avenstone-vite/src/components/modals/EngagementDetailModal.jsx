import { useState, useEffect } from 'react';
import { sb, VIEW_ENGAGEMENT_URL } from '../../lib/supabase';
import { f$, fD, fDT } from '../../lib/utils';

const NAV = '#0A1F44';
const GOLD = '#C9A84C';
const BORDER = '#E8E4DC';

const STATUS_META = {
  invited:       { label: 'Invited',       color: GOLD,      bg: 'rgba(201,168,76,0.12)' },
  bid_submitted: { label: 'Bid Submitted',  color: '#3b82f6', bg: 'rgba(59,130,246,0.1)'  },
  active:        { label: 'Active',         color: '#22c55e', bg: 'rgba(34,197,94,0.1)'   },
  completed:     { label: 'Completed',      color: '#9CA3AF', bg: 'rgba(156,163,175,0.1)' },
  declined:      { label: 'Declined',       color: '#ef4444', bg: 'rgba(239,68,68,0.1)'   },
  withdrawn:     { label: 'Withdrawn',      color: '#ef4444', bg: 'rgba(239,68,68,0.1)'   },
  removed:       { label: 'Removed',        color: '#ef4444', bg: 'rgba(239,68,68,0.1)'   },
};

export default function EngagementDetailModal({ isOpen, onClose, engagementId }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [eng, setEng] = useState(null);

  useEffect(() => {
    if (!isOpen || !engagementId) return;
    setLoading(true); setErr(''); setEng(null);
    (async () => {
      try {
        const { data: { session } } = await sb.auth.getSession();
        const res = await fetch(`${VIEW_ENGAGEMENT_URL}?id=${engagementId}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const json = await res.json();
        if (!res.ok || json.error) { setErr(json.error || 'Failed to load engagement'); return; }
        setEng(json.data || json);
      } catch (e) {
        setErr(e?.message || 'Network error');
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen, engagementId]);

  if (!isOpen) return null;

  const meta = eng ? (STATUS_META[eng.status] || STATUS_META.invited) : null;
  const bid = eng?.current_bid;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480, width: '90%', maxHeight: '85dvh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>

        {loading && <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Loading...</div>}

        {err && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{err}</div>}

        {eng && <>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: NAV, marginBottom: 4 }}>{eng.job?.address || '—'}</div>
              {eng.trade && <div style={{ fontSize: 13, color: '#6B7280' }}>{eng.trade}</div>}
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: meta.bg, color: meta.color, border: `1px solid ${meta.color}44`, textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 0 }}>{meta.label}</span>
          </div>

          {/* Scope */}
          {eng.scope_description && (
            <div style={{ background: '#F7F5F0', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Scope</div>
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{eng.scope_description}</div>
            </div>
          )}

          {/* Budget / dates / type */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
            {eng.due_date && (
              <div style={{ fontSize: 12 }}>
                <span style={{ color: '#9CA3AF' }}>Due: </span>
                <span style={{ color: NAV, fontWeight: 600 }}>{fD(eng.due_date)}</span>
              </div>
            )}
            {(eng.budget_min != null || eng.budget_max != null) && (
              <div style={{ fontSize: 12 }}>
                <span style={{ color: '#9CA3AF' }}>Budget: </span>
                <span style={{ color: NAV, fontWeight: 600 }}>
                  {eng.budget_min != null && eng.budget_max != null
                    ? `${f$(eng.budget_min)} – ${f$(eng.budget_max)}`
                    : eng.budget_min != null ? `from ${f$(eng.budget_min)}` : `up to ${f$(eng.budget_max)}`}
                </span>
              </div>
            )}
            {eng.bid_type && (
              <div style={{ fontSize: 12 }}>
                <span style={{ color: '#9CA3AF' }}>Type: </span>
                <span style={{ color: NAV, fontWeight: 600 }}>{eng.bid_type === 'gc_drafted' ? 'GC-drafted' : 'Sub bid'}</span>
              </div>
            )}
          </div>

          {/* Current bid */}
          {bid && (
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                Current Bid{bid.revision_number > 1 ? ` (Rev ${bid.revision_number})` : ''}
              </div>
              {bid.total_amount != null && (
                <div style={{ fontSize: 22, fontWeight: 700, color: NAV, marginBottom: 8 }}>{f$(bid.total_amount)}</div>
              )}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, marginBottom: bid.terms ? 8 : 0 }}>
                {bid.start_date && <span><span style={{ color: '#9CA3AF' }}>Start: </span><span style={{ color: '#374151' }}>{fD(bid.start_date)}</span></span>}
                {bid.end_date && <span><span style={{ color: '#9CA3AF' }}>End: </span><span style={{ color: '#374151' }}>{fD(bid.end_date)}</span></span>}
                {bid.submitted_at && <span><span style={{ color: '#9CA3AF' }}>Submitted: </span><span style={{ color: '#374151' }}>{fDT(bid.submitted_at)}</span></span>}
              </div>
              {bid.terms && (
                <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5, marginTop: 4 }}>{bid.terms}</div>
              )}
              {Array.isArray(bid.line_items) && bid.line_items.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Line Items</div>
                  {bid.line_items.map((li, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: i < bid.line_items.length - 1 ? '1px solid #D1FAE5' : 'none' }}>
                      <span style={{ color: '#374151' }}>{li.description || li.name || `Item ${i + 1}`}</span>
                      {li.amount != null && <span style={{ color: NAV, fontWeight: 600 }}>{f$(li.amount)}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Timestamps */}
          {(eng.invited_at || eng.activated_at || eng.completed_at) && (
            <div style={{ fontSize: 11, color: '#9CA3AF', display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
              {eng.invited_at && <span>Invited {fDT(eng.invited_at)}</span>}
              {eng.activated_at && <span>Activated {fDT(eng.activated_at)}</span>}
              {eng.completed_at && <span>Completed {fDT(eng.completed_at)}</span>}
            </div>
          )}
        </>}

        <button className="btn btn-ghost" style={{ width: '100%', marginTop: 4 }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
