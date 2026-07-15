import { useState, useEffect, useMemo } from 'react';
import { sbLoadUnreimbursedExpenses, sbGetBucketBalance, sbComposeDraw, sbLoadJobDrawTotals, sbLoadPhases, sbLoadUncollectedClientPaidMarkup } from '../../../lib/supabase';
import { f$, fD } from '../../../lib/utils';

const NAVY   = 'var(--navy-900)';
const GOLD   = 'var(--gold-500)';
const CREAM  = 'var(--bg)';
const BORDER = 'var(--border)';

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

export default function ComposeDrawScr({ job, onClose, onComposed }) {
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [expenses, setExpenses]       = useState([]);
  // Uncollected markup on client-direct purchases — billable %, offered as markup-only lines.
  const [clientPaidRows, setClientPaidRows]               = useState([]);
  const [selectedClientPaidIds, setSelectedClientPaidIds] = useState(() => new Set());
  const [balance, setBalance]         = useState({ bucket: 0, unreimbursed: 0, float: 0 });
  const [overrides, setOverrides]     = useState({}); // { [txId]: markupPct }
  const [title, setTitle]             = useState('');
  const [description, setDescription] = useState('');
  const [applyBucket, setApplyBucket] = useState(true);
  // Forward-looking line items: rows NOT tied to an existing job_transactions row.
  // Keyed by client-side temp id so add/remove/edit stays stable across renders.
  // Shape: { [tempId]: { description, base_amount, markup_pct } }
  const [forwardLines, setForwardLines] = useState({});
  const [selectedIds, setSelectedIds]   = useState(() => new Set());
  const [submitting, setSubmitting]     = useState(false);
  const [submitError, setSubmitError]   = useState(null);
  const [drawTotals, setDrawTotals]                     = useState(null);
  const [phases, setPhases]                             = useState([]);
  const [holdRetainage, setHoldRetainage]               = useState(false);
  const [releaseRetainage, setReleaseRetainage]         = useState(false);
  const [retainagePctOverride, setRetainagePctOverride] = useState(null);

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
  useEffect(() => {
    sbLoadJobDrawTotals(job.id).then(r => { if (r.ok) setDrawTotals(r.data); });
    sbLoadPhases(job.id).then(data => setPhases(data || []));
  }, [job.id]);

  // Seed markup overrides when expense list changes
  useEffect(() => {
    const seed = {};
    for (const e of expenses) seed[e.id] = e.markup_pct ?? 0;
    setOverrides(seed);
  }, [expenses]);

  const load = async () => {
    setLoading(true);
    setError(null);
    const [expRes, balRes, cpRes] = await Promise.all([
      sbLoadUnreimbursedExpenses(job.id),
      sbGetBucketBalance(job.id),
      sbLoadUncollectedClientPaidMarkup(job.id),
    ]);
    if (!expRes.ok) { setError(expRes.error); setLoading(false); return; }
    if (!balRes.ok) { setError(balRes.error); setLoading(false); return; }
    setExpenses(expRes.data);
    setSelectedIds(new Set(expRes.data.filter(r => r.status === 'pending').map(r => r.id)));
    const cpRows = cpRes.ok ? cpRes.data : [];
    setClientPaidRows(cpRows);
    setSelectedClientPaidIds(new Set(cpRows.map(r => r.id)));
    setBalance(balRes.data);
    setLoading(false);
  };

  // Submission-ready line items: checked tx rows + all forward rows.
  // Drives both sbComposeDraw payload and summary math.
  const lineItems = useMemo(() => {
    const items = [];
    let idx = 0;
    for (const e of expenses) {
      if (!selectedIds.has(e.id)) continue;
      const base      = Number(e.amount) || 0;
      const pct       = Number(overrides[e.id] ?? e.markup_pct ?? 0);
      const markupAmt = round2(base * pct / 100);
      items.push({
        transaction_id:    e.id,
        description:       e.description || TYPE_LABELS[e.type] || e.type || '',
        base_amount:       base,
        markup_pct:        pct,
        markup_amount:     markupAmt,
        total_with_markup: round2(base + markupAmt),
        is_forward_looking: false,
        display_order:     idx++,
        notes:             null,
      });
    }
    for (const fwd of Object.values(forwardLines)) {
      const base      = Number(fwd.base_amount) || 0;
      const pct       = Number(fwd.markup_pct) || 0;
      const markupAmt = round2(base * pct / 100);
      items.push({
        transaction_id:    null,
        description:       fwd.description || 'Forward-looking line',
        base_amount:       base,
        markup_pct:        pct,
        markup_amount:     markupAmt,
        total_with_markup: round2(base + markupAmt),
        is_forward_looking: true,
        display_order:     idx++,
        notes:             null,
      });
    }
    // Markup-only lines for client-direct purchases: base 0, markup billable, bound to
    // the source transaction_id so compose_draw's in_draw flip blocks double-collection.
    for (const cp of clientPaidRows) {
      if (!selectedClientPaidIds.has(cp.id)) continue;
      items.push({
        transaction_id:    cp.id,
        description:       `Markup on client-direct purchase — ${cp.description || TYPE_LABELS[cp.type] || cp.type || 'item'} (${cp.markup_pct}%)`,
        base_amount:       0,
        markup_pct:        cp.markup_pct,
        markup_amount:     cp.markup_amount,
        total_with_markup: cp.markup_amount,
        is_forward_looking: false,
        display_order:     idx++,
        notes:             'client_paid markup only',
      });
    }
    return items;
  }, [expenses, selectedIds, overrides, forwardLines, clientPaidRows, selectedClientPaidIds]);

  const subtotal = useMemo(
    () => round2(lineItems.reduce((s, r) => s + r.total_with_markup, 0)),
    [lineItems],
  );

  const validationError = useMemo(() => {
    if (!title.trim()) return 'Draw title is required';
    if (lineItems.length === 0) return 'Select at least one expense or add a line item';
    if (lineItems.some(l => !l.description?.trim())) return 'Every line item needs a description';
    if (lineItems.some(l => !Number.isFinite(l.base_amount) || l.base_amount < 0)) return 'Base amounts must be non-negative numbers';
    return null;
  }, [title, lineItems]);

  const canSubmit = !validationError && !submitting;

  const netDue = useMemo(
    () => round2(applyBucket ? subtotal - balance.bucket : subtotal),
    [subtotal, balance.bucket, applyBucket],
  );

  // Retainage — operator-driven, math base = expense subtotal with markup (not contract value)
  const jobRetainagePct    = drawTotals?.retainage_pct ?? 0;
  const retainagePct       = retainagePctOverride !== null ? retainagePctOverride : jobRetainagePct;
  const totalDrawn         = drawTotals?.total_drawn ?? 0;
  const contractValue      = drawTotals?.contract_value ?? 0;
  const heldRetainageTotal = round2(drawTotals?.held_retainage_total ?? 0);
  const retainagePerDraw   = (jobRetainagePct > 0 && holdRetainage) ? round2(subtotal * retainagePct / 100) : 0;
  const NUDGE_PHASES       = ['Drywall', 'Finishes', 'Final touches', 'Complete'];
  const RELEASE_PHASES     = ['Final touches', 'Complete'];
  const currentPhase       = phases.find(p => p.status === 'in_progress')
    || [...phases].filter(p => p.status === 'complete').sort((a, b) => b.phase_order - a.phase_order)[0]
    || null;
  const showRetainageNudge   = jobRetainagePct > 0 && !holdRetainage && currentPhase && NUDGE_PHASES.includes(currentPhase.phase_name);
  const canReleaseRetainage  = jobRetainagePct > 0 && RELEASE_PHASES.includes(currentPhase?.phase_name) && heldRetainageTotal > 0;
  const finalDrawAmount      = round2(netDue - retainagePerDraw + (jobRetainagePct > 0 && releaseRetainage ? heldRetainageTotal : 0));
  const newTotalDrawn        = round2(totalDrawn + finalDrawAmount);
  const overContract         = contractValue > 0 && newTotalDrawn > contractValue;
  const nearContract         = contractValue > 0 && !overContract && newTotalDrawn > contractValue * 0.9;
  const contractWarning      = overContract
    ? `⚠ This draw brings total billed to ${f$(newTotalDrawn)} — exceeds signed contract of ${f$(contractValue)}. Consider a change order if scope grew.`
    : nearContract
    ? `⚠ Total billed after this draw: ${f$(newTotalDrawn)} of ${f$(contractValue)}. If retainage hasn't been held, consider holding on this or upcoming draws.`
    : null;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    const result = await sbComposeDraw({
      jobId:        job.id,
      title:        title.trim(),
      description:  description.trim() || null,
      lineItems,
      targetAmount: finalDrawAmount,
      retainageHeld: retainagePerDraw,
      applyBucket,
    });
    setSubmitting(false);
    if (!result.ok) {
      setSubmitError(result.error || 'Failed to compose draw');
      return;
    }
    onComposed?.(result.data?.draw_id);
    onClose?.();
  };

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
          <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>{job.name || job.id}</div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: `1px solid ${BORDER}`,
            borderRadius: 6, padding: '6px 14px',
            fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer', fontWeight: 600,
          }}
        >✕ Close</button>
      </div>

      {/* ── Body ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, padding: '20px', maxWidth: 760, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>

        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-subtle)', fontSize: 13 }}>Loading expenses…</div>
        )}

        {error && (
          <div style={{ background: 'var(--red-bg)', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', color: '#991b1b', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* ── Section 1: Bucket Balance ─────────────────────── */}
            <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Client Balance</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {[
                  ['Bucket (credit)',  f$(balance.bucket),        balance.bucket > 0       ? 'var(--green-dot)' : 'var(--text-muted)'],
                  ['Unreimbursed',     f$(balance.unreimbursed),  balance.unreimbursed > 0 ? NAVY      : 'var(--text-muted)'],
                  ['Float',            (balance.float > 0 ? '+' : '') + f$(balance.float),
                    balance.float > 0 ? 'var(--amber-text)' : balance.float < 0 ? 'var(--green-dot)' : 'var(--text-muted)'],
                ].map(([lb, val, c]) => (
                  <div key={lb} style={{ textAlign: 'center', background: CREAM, borderRadius: 6, padding: '10px 8px' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-subtle)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{lb}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: c }}>{val}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 10 }}>
                Float = unreimbursed − bucket. Positive means client owes more than they've deposited.
              </div>
            </div>

            {/* ── Draw Details inputs ───────────────────────────── */}
            <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Draw Details</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Title *</label>
                  <input
                    className="finp"
                    style={{ width: '100%', fontSize: 14, padding: '8px 10px', boxSizing: 'border-box' }}
                    placeholder="e.g. Draw #3 — Framing & Rough-in"
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, display: 'block', marginBottom: 4 }}>Description (optional)</label>
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Unreimbursed Expenses ({expenses.length})
                </div>
                {expenses.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedIds(
                      selectedIds.size === expenses.length
                        ? new Set()
                        : new Set(expenses.map(r => r.id))
                    )}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, padding: '2px 6px',
                    }}
                  >
                    {selectedIds.size === expenses.length ? 'Deselect all' : 'Select all'}
                  </button>
                )}
              </div>

              {/* Transaction-linked rows */}
              {expenses.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '16px 0 8px', color: 'var(--text-subtle)', fontSize: 13 }}>
                  No unreimbursed expenses for this job.
                </div>
              ) : (
                <>
                  {/* Column headers */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '24px 80px 1fr 108px 76px 60px 76px',
                    gap: 6, padding: '4px 6px', marginBottom: 4,
                    borderBottom: `1px solid ${BORDER}`,
                  }}>
                    {['', 'Date', 'Description', 'Type', 'Cost', 'Markup %', 'Total'].map(h => (
                      <div key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</div>
                    ))}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 4 }}>
                    {expenses.map(row => {
                      const base      = Number(row.amount) || 0;
                      const pct       = Number(overrides[row.id] ?? row.markup_pct ?? 0);
                      const markupAmt = round2(base * pct / 100);
                      const rowTotal  = round2(base + markupAmt);
                      const checked   = selectedIds.has(row.id);
                      return (
                        <div key={row.id} style={{
                          display: 'grid',
                          gridTemplateColumns: '24px 80px 1fr 108px 76px 60px 76px',
                          gap: 6, alignItems: 'center',
                          padding: '6px 6px', borderRadius: 4,
                          background: checked ? CREAM : '#F9FAFB',
                          opacity: checked ? 1 : 0.55,
                          transition: 'opacity 0.1s',
                        }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            aria-label={`Include ${row.description || row.type} in this draw`}
                            onChange={ev => setSelectedIds(prev => {
                              const next = new Set(prev);
                              if (ev.target.checked) next.add(row.id); else next.delete(row.id);
                              return next;
                            })}
                            style={{ width: 14, height: 14, cursor: 'pointer', margin: 0 }}
                          />
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fD(row.date_incurred)}</div>
                          <div style={{ fontSize: 12, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.description || ''}>
                            {row.description || '—'}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{TYPE_LABELS[row.type] || row.type}</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{f$(base)}</div>
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={overrides[row.id] ?? row.markup_pct ?? 0}
                            onChange={ev => setOverrides(prev => ({ ...prev, [row.id]: parseFloat(ev.target.value) || 0 }))}
                            style={{
                              width: '100%', fontSize: 12, padding: '3px 5px',
                              border: `1px solid ${BORDER}`, borderRadius: 4,
                              boxSizing: 'border-box', background: '#fff', textAlign: 'right',
                            }}
                          />
                          <div style={{ fontSize: 13, fontWeight: 700, color: markupAmt > 0 ? GOLD : NAVY }}>{f$(rowTotal)}</div>
                        </div>
                      );
                    })}
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
                    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Forward-looking</span>
                    <span style={{ fontSize: 10, background: 'var(--blue-bg)', color: 'var(--blue-text)', padding: '1px 7px', borderRadius: 10, fontWeight: 700 }}>Pre-billing</span>
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
                            <span style={{ fontSize: 10, color: 'var(--text-subtle)' }}>$</span>
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
                            <span style={{ fontSize: 10, color: 'var(--text-subtle)' }}>%</span>
                          </div>
                          <div style={{ width: 76, fontSize: 12, fontWeight: 700, color: fwdTotal > 0 ? GOLD : NAVY, textAlign: 'right', flexShrink: 0 }}>
                            {f$(fwdTotal)}
                          </div>
                          <button
                            onClick={() => removeForwardLine(id)}
                            title="Remove line"
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: 'var(--text-subtle)', fontSize: 14, lineHeight: 1,
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
                  fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer',
                  marginTop: 4,
                }}
              >
                <span style={{ fontWeight: 700 }}>+</span> Add line item
              </button>
            </div>

            {/* ── Section 2b: Markup on client-direct purchases ── */}
            {clientPaidRows.length > 0 && (
              <div style={{ background: 'var(--card-bg)', border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16, marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                  Markup on Client-Direct Purchases ({clientPaidRows.length})
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginBottom: 10 }}>
                  Client bought these directly — cost is not reimbursable, only the markup is billable. Collect it here as its own draw line.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {clientPaidRows.map(cp => {
                    const checked = selectedClientPaidIds.has(cp.id);
                    return (
                      <div key={cp.id} style={{
                        display: 'grid', gridTemplateColumns: '24px 1fr 88px 60px 76px', gap: 6, alignItems: 'center',
                        padding: '6px 6px', borderRadius: 4,
                        background: checked ? CREAM : 'var(--surface)', opacity: checked ? 1 : 0.55,
                      }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          aria-label={`Collect markup on ${cp.description || cp.type}`}
                          onChange={ev => setSelectedClientPaidIds(prev => {
                            const next = new Set(prev);
                            if (ev.target.checked) next.add(cp.id); else next.delete(cp.id);
                            return next;
                          })}
                          style={{ width: 14, height: 14, cursor: 'pointer', margin: 0 }}
                        />
                        <div style={{ fontSize: 12, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cp.description || ''}>
                          {cp.description || TYPE_LABELS[cp.type] || cp.type || '—'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-subtle)', textAlign: 'right' }} title="Client-paid amount (not billed)">
                          {f$(cp.amount)} paid
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>{cp.markup_pct}%</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, textAlign: 'right' }}>{f$(cp.markup_amount)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Section 3: Draw Summary ───────────────────────── */}
            <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16, marginBottom: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Draw Summary</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-muted)' }}>
                  <span>Expense subtotal (with markup)</span>
                  <span style={{ fontWeight: 700, color: NAVY }}>{f$(subtotal)}</span>
                </div>
                {Object.keys(forwardLines).length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: -4 }}>
                    Includes {Object.keys(forwardLines).length} forward-looking line{Object.keys(forwardLines).length === 1 ? '' : 's'}
                  </div>
                )}

                {balance.bucket > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={applyBucket}
                        onChange={e => setApplyBucket(e.target.checked)}
                        style={{ width: 14, height: 14, cursor: 'pointer' }}
                      />
                      Apply client bucket credit ({f$(balance.bucket)})
                    </label>
                    <span style={{ fontWeight: 700, color: 'var(--green-dot)' }}>−{f$(balance.bucket)}</span>
                  </div>
                )}

                {retainagePerDraw > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--amber-text-strong)' }}>
                    <span>Hold {retainagePct}% retainage</span>
                    <span style={{ fontWeight: 700 }}>−{f$(retainagePerDraw)}</span>
                  </div>
                )}
                {releaseRetainage && heldRetainageTotal > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--green-dot)' }}>
                    <span>Release held retainage</span>
                    <span style={{ fontWeight: 700 }}>+{f$(heldRetainageTotal)}</span>
                  </div>
                )}
                <div style={{ borderTop: `2px solid ${BORDER}`, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
                  <span style={{ fontWeight: 700, color: NAVY }}>Net draw amount</span>
                  <span style={{ fontWeight: 700, color: finalDrawAmount >= 0 ? NAVY : 'var(--green-dot)', fontSize: 17 }}>{f$(finalDrawAmount)}</span>
                </div>
              </div>
            </div>

            {/* ── Retainage controls (cost-plus jobs with retainage_pct > 0) ── */}
            {jobRetainagePct > 0 && (
              <div style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 8, padding: 16, marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Retainage</div>

                {/* Phase-aware nudge */}
                {showRetainageNudge && (
                  <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: NAVY }}>
                    💡 You're in the {currentPhase.phase_name} phase. Consider holding {jobRetainagePct}% retainage on this draw.
                  </div>
                )}

                {/* Hold retainage row */}
                <div style={{ marginBottom: 10 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer', flexWrap: 'wrap' }}>
                    <input
                      type="checkbox"
                      checked={holdRetainage}
                      onChange={e => { setHoldRetainage(e.target.checked); if (!e.target.checked) setReleaseRetainage(false); }}
                      style={{ width: 14, height: 14, cursor: 'pointer', flexShrink: 0 }}
                    />
                    <span>Hold</span>
                    <input
                      type="number"
                      value={retainagePctOverride !== null ? retainagePctOverride : jobRetainagePct}
                      onChange={e => setRetainagePctOverride(Number(e.target.value))}
                      min="0" max="50" step="0.5"
                      style={{ width: 52, fontSize: 13, padding: '2px 5px', border: `1px solid ${BORDER}`, borderRadius: 4, textAlign: 'right' }}
                    />
                    <span>% retainage from this draw</span>
                  </label>
                  {retainagePctOverride !== null && retainagePctOverride !== jobRetainagePct && (
                    <div style={{ marginTop: 3, marginLeft: 22, fontSize: 10, color: 'var(--text-subtle)' }}>
                      Job default: {jobRetainagePct}% — <button onClick={() => setRetainagePctOverride(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C9A84C', fontSize: 10, fontWeight: 600, padding: 0 }}>Reset</button>
                    </div>
                  )}
                </div>

                {/* Release retainage row */}
                {holdRetainage && (
                  <div style={{ marginBottom: 4 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: canReleaseRetainage ? 'var(--text-secondary)' : 'var(--text-subtle)', cursor: canReleaseRetainage ? 'pointer' : 'not-allowed' }}>
                      <input
                        type="checkbox"
                        checked={releaseRetainage}
                        onChange={e => setReleaseRetainage(e.target.checked)}
                        disabled={!canReleaseRetainage}
                        style={{ width: 14, height: 14, cursor: canReleaseRetainage ? 'pointer' : 'not-allowed' }}
                      />
                      Release held retainage ({f$(heldRetainageTotal)}) — final draw
                    </label>
                    {!canReleaseRetainage && (
                      <div style={{ marginTop: 4, marginLeft: 22, fontSize: 11, color: 'var(--text-subtle)' }}>
                        {heldRetainageTotal === 0
                          ? 'No retainage held on prior draws.'
                          : 'Available when job reaches Final touches or Complete phase.'}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Action bar ────────────────────────────────────── */}
            {contractWarning && (
              <div style={{ background: overContract ? 'var(--red-bg)' : '#FEF3C7', border: `1px solid ${overContract ? 'var(--red-border)' : '#FCD34D'}`, borderRadius: 8, padding: '10px 14px', fontSize: 12, color: overContract ? '#991b1b' : '#92400e', marginBottom: 12 }}>
                {contractWarning}
              </div>
            )}
            {submitError && (
              <div style={{
                background: 'var(--red-bg)', border: '1px solid #fca5a5', borderRadius: 8,
                padding: '10px 14px', color: '#991b1b', fontSize: 13, marginBottom: 12,
              }}>
                {submitError}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingBottom: 8 }}>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                style={{
                  background: 'none', border: `1px solid ${BORDER}`,
                  borderRadius: 6, padding: '8px 20px',
                  fontSize: 13, color: 'var(--text-muted)',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.5 : 1,
                }}
              >Cancel</button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                title={validationError || ''}
                style={{
                  background: canSubmit ? GOLD : NAVY, border: 'none',
                  borderRadius: 6, padding: '8px 20px',
                  fontSize: 13, color: '#fff', fontWeight: 700,
                  opacity: canSubmit ? 1 : 0.45,
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  transition: 'all 0.15s',
                }}
              >{submitting ? 'Composing…' : 'Compose Draw →'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
