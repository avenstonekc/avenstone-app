import { useState, useEffect, useMemo } from 'react';
import { sbLoadUnreimbursedExpenses, sbGetBucketBalance } from '../../../lib/supabase';
import { f$, fD } from '../../../lib/utils';

const NAVY   = '#0A1F44';
const GOLD   = '#C9A84C';
const CREAM  = '#F7F5F0';
const BORDER = '#E8E4DC';

const round2 = n => Math.round(Number(n) * 100) / 100;

const TYPE_LABELS = {
  material:   'Material',
  labor:      'Labor',
  sub_payout: 'Sub Payout',
  equipment:  'Equipment',
  permit:     'Permit',
  dump:       'Dump',
  misc:       'Misc',
};

export default function ComposeDrawScr({ job, onClose }) {
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [expenses, setExpenses]       = useState([]);
  const [balance, setBalance]         = useState({ bucket: 0, unreimbursed: 0, float: 0 });
  const [overrides, setOverrides]     = useState({}); // { [txId]: markupPct }
  const [title, setTitle]             = useState('');
  const [description, setDescription] = useState('');
  const [applyBucket, setApplyBucket] = useState(true);
  // Forward-looking line items: rows NOT tied to an existing job_transactions row.
  // Keyed by client-side temp id so add/remove/edit stays stable across renders.
  // Shape: { [tempId]: { description, base_amount, markup_pct } }
  const [forwardLines, setForwardLines] = useState({});

  const nextForwardId = () => `fwd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const addForwardLine = () => {
    const id = nextForwardId();
    setForwardLines(prev => ({
      ...prev,
      [id]: { description: '', base_amount: '', markup_pct: Number(job?.material_markup_pct) || 0 },
    }));
  };
  const removeForwardLine = id => setForwardLines(prev => { const n = { ...prev }; delete n[id]; return n; });
  const updateForwardLine = (id, field, value) =>
    setForwardLines(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));

  useEffect(() => { load(); }, [job.id]);

  // Seed markup overrides when expense list changes
  useEffect(() => {
    const seed = {};
    for (const e of expenses) seed[e.id] = e.markup_pct ?? 0;
    setOverrides(seed);
  }, [expenses]);

  const load = async () => {
    setLoading(true);
    setError(null);
    const [expRes, balRes] = await Promise.all([
      sbLoadUnreimbursedExpenses(job.id),
      sbGetBucketBalance(job.id),
    ]);
    if (!expRes.ok) { setError(expRes.error); setLoading(false); return; }
    if (!balRes.ok) { setError(balRes.error); setLoading(false); return; }
    setExpenses(expRes.data);
    setBalance(balRes.data);
    setLoading(false);
  };

  // Derive per-row totals from current markup overrides
  const lineItems = useMemo(() => expenses.map(e => {
    const base      = Number(e.amount) || 0;
    const pct       = Number(overrides[e.id] ?? e.markup_pct ?? 0);
    const markupAmt = round2(base * pct / 100);
    const total     = round2(base + markupAmt);
    return { ...e, base, pct, markupAmt, total };
  }), [expenses, overrides]);

  const subtotal = useMemo(() => {
    const txTotal = lineItems.reduce((s, r) => s + r.total, 0);
    let fwdTotal = 0;
    for (const fwd of Object.values(forwardLines)) {
      const base = Number(fwd.base_amount) || 0;
      const pct  = Number(fwd.markup_pct) || 0;
      fwdTotal += base * (1 + pct / 100);
    }
    return round2(txTotal + fwdTotal);
  }, [lineItems, forwardLines]);

  // Submit is eligible when any transaction rows are loaded OR any forward lines exist.
  // The button stays hard-disabled in this slice — Phase 2C wires the actual call.
  const canSubmit = expenses.length > 0 || Object.keys(forwardLines).length > 0; // eslint-disable-line no-unused-vars

  const netDue   = useMemo(
    () => round2(applyBucket ? subtotal - balance.bucket : subtotal),
    [subtotal, balance.bucket, applyBucket],
  );

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: CREAM,
      zIndex: 2100,
      display: 'flex', flexDirection: 'column',
      overflowY: 'auto',
    }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px',
        borderBottom: `1px solid ${BORDER}`,
        background: '#fff',
        position: 'sticky', top: 0, zIndex: 10,
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: NAVY }}>Compose Draw</div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{job.name || job.id}</div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: `1px solid ${BORDER}`,
            borderRadius: 6, padding: '6px 14px',
            fontSize: 12, color: '#6B7280', cursor: 'pointer', fontWeight: 600,
          }}
        >✕ Close</button>
      </div>

      {/* ── Body ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: '20px', maxWidth: 760, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>

        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: '#9CA3AF', fontSize: 13 }}>Loading expenses…</div>
        )}

        {error && (
          <div style={{ background: '#FEE2E2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', color: '#991b1b', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* ── Section 1: Bucket Balance ─────────────────────── */}
            <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Client Balance</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {[
                  ['Bucket (credit)',  f$(balance.bucket),        balance.bucket > 0       ? '#22c55e' : '#6B7280'],
                  ['Unreimbursed',     f$(balance.unreimbursed),  balance.unreimbursed > 0 ? NAVY      : '#6B7280'],
                  ['Float',            (balance.float > 0 ? '+' : '') + f$(balance.float),
                    balance.float > 0 ? '#f59e0b' : balance.float < 0 ? '#22c55e' : '#6B7280'],
                ].map(([lb, val, c]) => (
                  <div key={lb} style={{ textAlign: 'center', background: CREAM, borderRadius: 6, padding: '10px 8px' }}>
                    <div style={{ fontSize: 9, color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{lb}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: c }}>{val}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 10 }}>
                Float = unreimbursed − bucket. Positive means client owes more than they've deposited.
              </div>
            </div>

            {/* ── Draw Details inputs ───────────────────────────── */}
            <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Draw Details</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, display: 'block', marginBottom: 4 }}>Title *</label>
                  <input
                    className="finp"
                    style={{ width: '100%', fontSize: 14, padding: '8px 10px', boxSizing: 'border-box' }}
                    placeholder="e.g. Draw #3 — Framing & Rough-in"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, display: 'block', marginBottom: 4 }}>Description (optional)</label>
                  <textarea
                    className="finp"
                    style={{ width: '100%', fontSize: 14, padding: '8px 10px', boxSizing: 'border-box', resize: 'vertical', minHeight: 60 }}
                    placeholder="Notes for this draw…"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* ── Section 2: Expense list ───────────────────────── */}
            <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
                Unreimbursed Expenses ({expenses.length})
              </div>

              {/* Transaction-linked rows */}
              {expenses.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0 8px', color: '#9CA3AF', fontSize: 13 }}>
                  No unreimbursed expenses for this job.
                </div>
              ) : (
                <>
                  {/* Column headers */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 1fr 76px 76px 60px 76px',
                    gap: 6, padding: '4px 6px', marginBottom: 4,
                    borderBottom: `1px solid ${BORDER}`,
                  }}>
                    {['Date', 'Description', 'Type', 'Cost', 'Markup %', 'Total'].map(h => (
                      <div key={h} style={{ fontSize: 9, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 4 }}>
                    {lineItems.map(row => (
                      <div key={row.id} style={{
                        display: 'grid',
                        gridTemplateColumns: '80px 1fr 76px 76px 60px 76px',
                        gap: 6, alignItems: 'center',
                        padding: '6px 6px', borderRadius: 4, background: CREAM,
                      }}>
                        <div style={{ fontSize: 11, color: '#6B7280' }}>{fD(row.date_incurred)}</div>
                        <div style={{ fontSize: 11, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.description || ''}>
                          {row.description || '—'}
                        </div>
                        <div style={{ fontSize: 10, color: '#6B7280' }}>{TYPE_LABELS[row.type] || row.type}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{f$(row.base)}</div>
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          value={overrides[row.id] ?? row.markup_pct ?? 0}
                          onChange={ev => setOverrides(prev => ({ ...prev, [row.id]: parseFloat(ev.target.value) || 0 }))}
                          style={{
                            width: '100%', fontSize: 11, padding: '3px 5px',
                            border: `1px solid ${BORDER}`, borderRadius: 4,
                            boxSizing: 'border-box', background: '#fff', textAlign: 'right',
                          }}
                        />
                        <div style={{ fontSize: 12, fontWeight: 700, color: row.markupAmt > 0 ? GOLD : NAVY }}>{f$(row.total)}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Forward-looking rows */}
              {Object.keys(forwardLines).length > 0 && (
                <>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    borderTop: expenses.length > 0 ? `1px dashed ${BORDER}` : 'none',
                    paddingTop: expenses.length > 0 ? 10 : 4,
                    marginBottom: 6,
                  }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>Forward-looking</span>
                    <span style={{ fontSize: 10, background: '#DBEAFE', color: '#1e40af', padding: '1px 7px', borderRadius: 10, fontWeight: 700 }}>Pre-billing</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                    {Object.entries(forwardLines).map(([id, fwd]) => {
                      const base     = Number(fwd.base_amount) || 0;
                      const pct      = Number(fwd.markup_pct) || 0;
                      const fwdTotal = round2(base * (1 + pct / 100));
                      return (
                        <div key={id} style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '6px 8px', borderRadius: 4,
                          background: '#EFF6FF', border: `1px dashed #BFDBFE`,
                        }}>
                          <input
                            type="text"
                            placeholder="e.g. Upcoming concrete pour deposit"
                            value={fwd.description}
                            onChange={ev => updateForwardLine(id, 'description', ev.target.value)}
                            style={{
                              flex: 1, fontSize: 11, padding: '3px 6px', minWidth: 0,
                              border: `1px solid ${BORDER}`, borderRadius: 4, background: '#fff',
                            }}
                          />
                          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                            <span style={{ fontSize: 10, color: '#9CA3AF' }}>$</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="0.00"
                              value={fwd.base_amount}
                              onChange={ev => updateForwardLine(id, 'base_amount', ev.target.value)}
                              style={{
                                width: 76, fontSize: 11, padding: '3px 5px',
                                border: `1px solid ${BORDER}`, borderRadius: 4,
                                background: '#fff', textAlign: 'right',
                              }}
                            />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              value={fwd.markup_pct}
                              onChange={ev => updateForwardLine(id, 'markup_pct', ev.target.value)}
                              style={{
                                width: 52, fontSize: 11, padding: '3px 5px',
                                border: `1px solid ${BORDER}`, borderRadius: 4,
                                background: '#fff', textAlign: 'right',
                              }}
                            />
                            <span style={{ fontSize: 10, color: '#9CA3AF' }}>%</span>
                          </div>
                          <div style={{ width: 76, fontSize: 12, fontWeight: 700, color: fwdTotal > 0 ? GOLD : NAVY, textAlign: 'right', flexShrink: 0 }}>
                            {f$(fwdTotal)}
                          </div>
                          <button
                            onClick={() => removeForwardLine(id)}
                            title="Remove line"
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: '#9CA3AF', fontSize: 14, lineHeight: 1,
                              padding: '2px 4px', borderRadius: 4, flexShrink: 0,
                            }}
                          >✕</button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* "+ Add line item" button */}
              <button
                onClick={addForwardLine}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 6, padding: '8px 0',
                  background: 'none', border: `1px dashed ${BORDER}`, borderRadius: 6,
                  fontSize: 12, color: '#6B7280', cursor: 'pointer',
                  marginTop: 4,
                }}
              >
                <span style={{ fontWeight: 700 }}>+</span> Add line item
              </button>
            </div>

            {/* ── Section 3: Draw Summary ───────────────────────── */}
            <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16, marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Draw Summary</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#6B7280' }}>
                  <span>Expense subtotal (with markup)</span>
                  <span style={{ fontWeight: 700, color: NAVY }}>{f$(subtotal)}</span>
                </div>
                {Object.keys(forwardLines).length > 0 && (
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: -4 }}>
                    Includes {Object.keys(forwardLines).length} forward-looking line{Object.keys(forwardLines).length === 1 ? '' : 's'}
                  </div>
                )}

                {balance.bucket > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6B7280', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={applyBucket}
                        onChange={e => setApplyBucket(e.target.checked)}
                        style={{ width: 14, height: 14, cursor: 'pointer' }}
                      />
                      Apply client bucket credit ({f$(balance.bucket)})
                    </label>
                    <span style={{ fontWeight: 700, color: '#22c55e' }}>−{f$(balance.bucket)}</span>
                  </div>
                )}

                <div style={{ borderTop: `2px solid ${BORDER}`, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
                  <span style={{ fontWeight: 700, color: NAVY }}>Net draw amount</span>
                  <span style={{ fontWeight: 700, color: netDue >= 0 ? NAVY : '#22c55e', fontSize: 17 }}>{f$(netDue)}</span>
                </div>
              </div>
            </div>

            {/* ── Action bar ────────────────────────────────────── */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingBottom: 8 }}>
              <button
                onClick={onClose}
                style={{
                  background: 'none', border: `1px solid ${BORDER}`,
                  borderRadius: 6, padding: '8px 20px',
                  fontSize: 13, color: '#6B7280', cursor: 'pointer',
                }}
              >Cancel</button>
              <button
                disabled
                title="Submit wiring ships in Phase 2C"
                style={{
                  background: NAVY, border: 'none',
                  borderRadius: 6, padding: '8px 20px',
                  fontSize: 13, color: '#fff', fontWeight: 700,
                  opacity: 0.45, cursor: 'not-allowed',
                }}
              >Submit Draw — Phase 2C</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
