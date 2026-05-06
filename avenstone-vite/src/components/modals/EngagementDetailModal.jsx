import { useState, useEffect } from 'react';
import { sb, VIEW_ENGAGEMENT_URL, SUBMIT_BID_RESPONSE_URL } from '../../lib/supabase';
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

export default function EngagementDetailModal({ isOpen, onClose, engagementId, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [eng, setEng] = useState(null);

  const [mode, setMode] = useState('view');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [form, setForm] = useState({ totalAmount: '', terms: '', startDate: '', endDate: '' });
  const [lineItems, setLineItems] = useState([]);

  const updateLine = (idx, field, rawValue) => {
    setLineItems(prev => prev.map((li, i) => {
      if (i !== idx) return li;
      const updated = { ...li, [field]: rawValue };
      const qty = field === 'quantity' ? Number(rawValue) : Number(li.quantity);
      const price = field === 'unit_price' ? Number(rawValue) : Number(li.unit_price);
      if ((field === 'quantity' || field === 'unit_price') && !isNaN(qty) && !isNaN(price)) {
        updated.line_total = qty * price;
      }
      return updated;
    }));
  };

  const addLine = () => setLineItems(prev => [...prev, { description: '', quantity: 1, unit: '', unit_price: '', line_total: 0 }]);
  const removeLine = idx => setLineItems(prev => prev.filter((_, i) => i !== idx));

  const refetchModalData = async () => {
    try {
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(VIEW_ENGAGEMENT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ engagementId }),
      });
      const json = await res.json();
      if (!res.ok || json.error) { setErr(json.error || 'Failed to load engagement'); return; }
      // fn returns { ok, data: { engagement, currentBid } }
      const { engagement, currentBid } = json.data;
      const fetched = { ...engagement, current_bid: currentBid || null };
      setEng(fetched);
      const savedLines = Array.isArray(currentBid?.line_items) ? currentBid.line_items : [];
      setLineItems(savedLines);
      setForm({
        totalAmount: savedLines.length > 0 ? '' : (currentBid?.total_amount ?? ''),
        terms: currentBid?.terms ?? '',
        startDate: currentBid?.start_date ?? '',
        endDate: currentBid?.end_date ?? '',
      });
    } catch (e) {
      setErr(e?.message || 'Network error');
    }
  };

  useEffect(() => {
    if (!isOpen || !engagementId) return;
    setLoading(true); setErr(''); setEng(null); setMode('view'); setFormError(null); setLineItems([]);
    refetchModalData().finally(() => setLoading(false));
  }, [isOpen, engagementId]);

  const handleSubmit = async () => {
    let payload;
    if (lineItems.length > 0) {
      for (const li of lineItems) {
        if (!li.description?.trim()) { setFormError('Each line item requires a description'); return; }
        if (!li.quantity || Number(li.quantity) <= 0) { setFormError('Each line item requires a quantity greater than zero'); return; }
        if (li.unit_price === '' || Number(li.unit_price) < 0) { setFormError('Each line item requires a non-negative unit price'); return; }
      }
      const finalTotal = lineItems.reduce((s, li) => s + Number(li.line_total || 0), 0);
      if (finalTotal <= 0) { setFormError('Line items must sum to a positive total'); return; }
      payload = { lineItems: lineItems.map(li => ({ ...li, quantity: Number(li.quantity), unit_price: Number(li.unit_price), line_total: Number(li.line_total) })) };
    } else {
      const amount = Number(form.totalAmount);
      if (!form.totalAmount || isNaN(amount) || amount <= 0) {
        setFormError('Total amount is required and must be greater than zero');
        return;
      }
      payload = { totalAmount: amount, lineItems: [] };
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const { data: { session } } = await sb.auth.getSession();
      const res = await fetch(SUBMIT_BID_RESPONSE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          engagementId: eng.id,
          terms: form.terms || null,
          startDate: form.startDate || null,
          endDate: form.endDate || null,
          attachedDocIds: [],
          ...payload,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setFormError(json.error || `Server error (${res.status})`);
        return;
      }
      await refetchModalData();
      setMode('view');
      if (typeof onSuccess === 'function') onSuccess();
    } catch (e) {
      setFormError(e?.message || 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const meta = eng ? (STATUS_META[eng.status] || STATUS_META.invited) : null;
  const bid = eng?.current_bid;

  const actionLabel = (() => {
    if (!eng || eng.status !== 'invited') return null;
    if (eng.bid_type === 'gc_drafted' && bid?.drafted_by === 'gc') return 'Review and submit';
    if (bid?.drafted_by === 'sub' && bid?.revision_number > 1) return 'Modify and resubmit';
    if (!bid) return 'Submit your bid';
    return null;
  })();

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480, width: '90%', maxHeight: '85dvh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>

        {loading && <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF' }}>Loading...</div>}
        {err && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{err}</div>}

        {eng && mode === 'view' && <>
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
                      <span style={{ color: '#374151', flex: 1 }}>{li.description || `Item ${i + 1}`}{li.quantity ? ` × ${li.quantity}${li.unit ? ' ' + li.unit : ''}` : ''}</span>
                      {li.line_total != null && <span style={{ color: NAV, fontWeight: 600, flexShrink: 0 }}>{f$(li.line_total)}</span>}
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

          {/* Action footer */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button className="btn btn-ghost" style={{ flex: actionLabel ? 1 : undefined, width: actionLabel ? undefined : '100%' }} onClick={onClose}>Close</button>
            {actionLabel && (
              <button className="btn btn-navy" style={{ flex: 1 }} onClick={() => setMode('edit')}>{actionLabel}</button>
            )}
          </div>
        </>}

        {eng && mode === 'edit' && (
          <>
            {/* Breadcrumb */}
            <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 14 }}>
              Submitting bid for <strong style={{ color: NAV }}>{eng.job?.address || '—'}</strong>{eng.trade ? ` – ${eng.trade}` : ''}
            </div>

            {formError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', padding: '10px 14px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{formError}</div>
            )}

            {/* Line items */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <label className="flbl" style={{ margin: 0 }}>Line Items</label>
                <button type="button" onClick={addLine} style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0 }}>+ Add Line</button>
              </div>
              {lineItems.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                  {lineItems.map((li, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        className="finp"
                        style={{ flex: 3, fontSize: 12 }}
                        placeholder="Description"
                        value={li.description}
                        onChange={e => updateLine(i, 'description', e.target.value)}
                      />
                      <input
                        className="finp"
                        style={{ width: 52, fontSize: 12 }}
                        type="number"
                        min="0"
                        step="any"
                        placeholder="Qty"
                        value={li.quantity}
                        onChange={e => updateLine(i, 'quantity', e.target.value)}
                      />
                      <input
                        className="finp"
                        style={{ width: 48, fontSize: 12 }}
                        placeholder="Unit"
                        value={li.unit}
                        onChange={e => updateLine(i, 'unit', e.target.value)}
                      />
                      <input
                        className="finp"
                        style={{ width: 72, fontSize: 12 }}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="$/unit"
                        value={li.unit_price}
                        onChange={e => updateLine(i, 'unit_price', e.target.value)}
                      />
                      <span style={{ width: 64, fontSize: 12, color: NAV, fontWeight: 600, flexShrink: 0, textAlign: 'right' }}>{li.line_total != null && li.line_total !== '' ? f$(Number(li.line_total)) : '—'}</span>
                      <button type="button" onClick={() => removeLine(i)} style={{ background: 'none', border: 'none', color: '#9CA3AF', fontSize: 16, cursor: 'pointer', padding: '0 2px', lineHeight: 1 }}>×</button>
                    </div>
                  ))}
                  <div style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: NAV, paddingRight: 26 }}>
                    Total: {f$(lineItems.reduce((s, li) => s + Number(li.line_total || 0), 0))}
                  </div>
                </div>
              )}
            </div>

            {lineItems.length === 0 && (
              <div className="fg">
                <label className="flbl"><span className="freq">*</span>Total Amount ($)</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF', fontSize: 14 }}>$</span>
                  <input
                    className="finp"
                    style={{ paddingLeft: 22 }}
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.totalAmount}
                    onChange={e => setForm(p => ({ ...p, totalAmount: e.target.value }))}
                    placeholder="0.00"
                    autoFocus
                  />
                </div>
              </div>
            )}

            <div className="fg">
              <label className="flbl">Terms / Notes</label>
              <textarea
                className="finp fta"
                rows={3}
                value={form.terms}
                onChange={e => setForm(p => ({ ...p, terms: e.target.value }))}
                placeholder="Payment terms, conditions, exclusions, etc."
              />
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div className="fg" style={{ flex: 1 }}>
                <label className="flbl">Start Date</label>
                <input className="finp" type="date" value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} />
              </div>
              <div className="fg" style={{ flex: 1 }}>
                <label className="flbl">End Date</label>
                <input className="finp" type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setMode('view')} disabled={submitting}>Cancel</button>
              <button className="btn btn-navy" style={{ flex: 1 }} onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Submitting...' : 'Submit Bid'}
              </button>
            </div>
          </>
        )}

        {!eng && !loading && (
          <button className="btn btn-ghost" style={{ width: '100%', marginTop: 4 }} onClick={onClose}>Close</button>
        )}
      </div>
    </div>
  );
}
