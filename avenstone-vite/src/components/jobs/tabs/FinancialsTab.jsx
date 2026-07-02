import { useState, useEffect, useRef } from 'react';
import COTab from './COTab';
import InvoicesSubTab from './InvoicesSubTab';
import MaterialsTab from './MaterialsTab';
import TransactionModal from './financials/TransactionModal';
import LineItemModal from './financials/LineItemModal';
import SubInvoicesSection from './financials/SubInvoicesSection';
import ComposeDrawScr from './ComposeDrawScr';
import PaymentScheduleTab from './PaymentScheduleTab';
import { sbLoadJobTransactions, sbLoadJobFinancialSummary, sbLoadEstimateLineItems, sbLoadQbCategoryMap, sbLoadTransactionsForExport, sbStampQbSynced, sbCompleteTodo, sbMarkTransactionsPaid } from '../../../lib/supabase';
import { generateQbCsv, downloadCsv } from '../../../lib/qbExport';
import { f$, isMob } from '../../../lib/utils';

// SUB_TABS is computed inside the component — cost_plus aware

const TYPE_LABELS = {
  client_payment: 'Client Payment', client_deposit: 'Deposit', client_refund: 'Refund',
  sub_payout: 'Sub Payout', vendor_payment: 'Vendor Payment', material_purchase: 'Materials',
  equipment_rental: 'Equipment Rental', permit: 'Permit', fuel: 'Fuel', commission: 'Commission',
  labor: 'Labor', other_expense: 'Other Expense', other_income: 'Other Income',
};

const STATUS_COLOR = { paid: 'var(--green-dot)', pending: '#f59e0b', overdue: 'var(--red-text)', void: 'var(--text-subtle)', draft: 'var(--text-subtle)', refunded: '#8b5cf6' };

// Fraction of contract value in unreimbursed costs that triggers a draw-request nudge (passive banner).
// Overridable at the job level in the future; currently a module constant.
const DRAW_NUDGE_THRESHOLD = 0.10;
// Agent poke threshold — fires when unreimbursed costs reach within 10% of total contract ceiling.
// Higher bar than the passive nudge; structured for per-job config (adaptive guardrails arc).
const DRAW_POKE_THRESHOLD = 0.90;

export default function FinancialsTab({ job, upd, profile, docs, setDocs, pendingAction, clearPendingAction, financialsAction, clearFinancialsAction, onAgentDrawPoke }) {
  const mob = isMob();
  // Dual-read: financial_model (Phase 3+) overrides legacy cost_plus boolean.
  const model = job.financial_model || (job.cost_plus ? 'cost_plus' : 'fixed_bid');
  const isDrawMode = model === 'cost_plus' || model === 'flip';
  // Draw modes (cost_plus + flip): Draws tab. Fixed-price: Invoices / Payment Schedule.
  // Flip also gets a Margin tab for ARV vs cost basis tracking.
  const SUB_TABS = [
    { id: 'ledger',      lb: 'Ledger' },
    { id: 'budget',      lb: 'Budget' },
    { id: 'co',          lb: 'Change Orders' },
    ...(isDrawMode
      ? [{ id: 'draws',   lb: 'Draws' }]
      : [{ id: 'billing', lb: 'Invoices / Payment Schedule' }]),
    ...(model === 'flip' ? [{ id: 'margin', lb: 'Margin' }] : []),
    { id: 'sub_invoices', lb: 'Sub Invoices' },
    { id: 'materials',   lb: 'Materials' },
  ];
  const [sub, setSub] = useState('ledger');
  const [txs, setTxs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filterDir, setFilterDir] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [modal, setModal] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [budgetLoading, setBudgetLoading] = useState(false);
  const [liModal, setLiModal] = useState(null);
  const [qbModal, setQbModal] = useState(false);
  const [qbRange, setQbRange] = useState('this_month');
  const [qbDateFrom, setQbDateFrom] = useState('');
  const [qbDateTo, setQbDateTo] = useState('');
  const [qbAllJobs, setQbAllJobs] = useState(false);
  const [qbMarkSynced, setQbMarkSynced] = useState(true);
  const [qbExporting, setQbExporting] = useState(false);
  const [showSynced, setShowSynced] = useState(true);
  const [catMap, setCatMap] = useState([]);
  const [pendingTodoId, setPendingTodoId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showComposeDraw, setShowComposeDraw] = useState(false);
  const [openSubInvoiceOnMount, setOpenSubInvoiceOnMount] = useState(false);
  const [dismissedDrawNudge, setDismissedDrawNudge] = useState(false);
  const drawPokedRef = useRef(false); // fire agent poke once per mount
  // Flip Margin tab state
  const [arvInput, setArvInput] = useState('');
  const [arvEditing, setArvEditing] = useState(false);
  const [arvSaving, setArvSaving] = useState(false);
  const [arvError, setArvError] = useState(null);
  const [salePriceInput, setSalePriceInput] = useState('');
  const [soldDateInput, setSoldDateInput] = useState('');
  const [saleDetailsSaving, setSaleDetailsSaving] = useState(false);

  useEffect(() => {
    if (!pendingAction) return;
    if (pendingAction.kind === 'transaction_save') {
      setSub('ledger');
      setModal({ mode: 'new', tx: pendingAction.payload || {} });
      setPendingTodoId(pendingAction.todoId || null);
      clearPendingAction?.();
    } else if (pendingAction.kind === 'line_item_save') {
      setSub('budget');
      setLiModal({ mode: 'add', item: pendingAction.payload || {} });
      setPendingTodoId(pendingAction.todoId || null);
      clearPendingAction?.();
    }
  }, [pendingAction]);

  useEffect(() => {
    if (sub === 'ledger') loadLedger();
    if (sub === 'budget') loadBudget();
  }, [sub, job.id]);

  useEffect(() => { setSelectedIds(new Set()); }, [filterDir, filterStatus]);
  useEffect(() => { if (sub !== 'sub_invoices') setOpenSubInvoiceOnMount(false); }, [sub]);
  // Reset to ledger if current sub-tab doesn't exist for this billing model
  useEffect(() => {
    if (isDrawMode && sub === 'billing') setSub('ledger');
    if (!isDrawMode && sub === 'draws') setSub('ledger');
  }, [model]);
  useEffect(() => {
    if (!financialsAction) return;
    if (financialsAction.kind === 'compose_draw') { setSub('ledger'); setShowComposeDraw(true); }
    else if (financialsAction.kind === 'add_receipt') { setSub('ledger'); setModal({ mode: 'create', tx: {} }); }
    else if (financialsAction.kind === 'log_sub_invoice') { setSub('sub_invoices'); setOpenSubInvoiceOnMount(true); }
    clearFinancialsAction?.();
  }, [financialsAction]);

  const loadLedger = async () => {
    setLoading(true);
    const [data, sum] = await Promise.all([
      sbLoadJobTransactions(job.id),
      sbLoadJobFinancialSummary(job.id, { contractValue: job.contract_value, coTotal: job.co_total, costPlus: job.cost_plus, financialModel: job.financial_model }),
    ]);
    setTxs(data);
    setSummary(sum);
    setLoading(false);
    // Agent draw poke — draw modes only (cost_plus + flip), owner/PM only, fires once per mount
    if (isDrawMode && sum && !drawPokedRef.current) {
      const unreimb = sum.float_unreimbursed || 0;
      const cv = Number(job.contract_value) || 0;
      if (cv > 0 && unreimb >= DRAW_POKE_THRESHOLD * cv) {
        drawPokedRef.current = true;
        onAgentDrawPoke?.({
          jobId: job.id,
          jobName: job.scope || job.client_name || '(job)',
          unreimb,
          contractValue: cv,
        });
      }
    }
  };

  const loadBudget = async () => {
    setBudgetLoading(true);
    const [items, txData] = await Promise.all([
      sbLoadEstimateLineItems(job.id),
      sbLoadJobTransactions(job.id),
    ]);
    // attach actuals: sum paid direction='out' transactions matching phase
    const paidOut = txData.filter(t => t.direction === 'out' && t.status === 'paid');
    const withActuals = items.map(li => {
      const actual = paidOut
        .filter(t => li.phase && t.phase && t.phase.trim().toLowerCase() === li.phase.trim().toLowerCase())
        .reduce((s, t) => s + Number(t.amount || 0), 0);
      return { ...li, actual };
    });
    setLineItems(withActuals);
    setBudgetLoading(false);
  };

  const lienCount = txs.filter(t => t.lien_waiver_required && !t.lien_waiver_url && t.status !== 'void').length;
  const isManager = ['owner', 'project_manager'].includes(profile?.role);

  const openQbModal = async () => {
    if (!catMap.length) { const m = await sbLoadQbCategoryMap(); setCatMap(m); }
    setQbModal(true);
  };

  const runQbExport = async () => {
    setQbExporting(true);
    const today = new Date();
    const y = today.getFullYear(), mo = today.getMonth();
    const getRange = () => {
      if (qbRange === 'this_month') return { from: new Date(y, mo, 1).toISOString().slice(0, 10), to: new Date(y, mo + 1, 0).toISOString().slice(0, 10) };
      if (qbRange === 'this_quarter') { const q = Math.floor(mo / 3); return { from: new Date(y, q * 3, 1).toISOString().slice(0, 10), to: new Date(y, q * 3 + 3, 0).toISOString().slice(0, 10) }; }
      if (qbRange === 'ytd') return { from: `${y}-01-01`, to: today.toISOString().slice(0, 10) };
      if (qbRange === 'custom') return { from: qbDateFrom, to: qbDateTo };
      return { from: null, to: null };
    };
    const { from, to } = getRange();
    const data = await sbLoadTransactionsForExport({ jobId: job.id, dateFrom: from, dateTo: to, allJobs: qbAllJobs });
    const csv = generateQbCsv(data, catMap, qbAllJobs ? null : job.address);
    const label = qbAllJobs ? 'all-jobs' : job.address.replace(/[^a-z0-9]/gi, '-').toLowerCase().slice(0, 30);
    downloadCsv(csv, `qb-${label}-${today.toISOString().slice(0, 10)}.csv`);
    if (qbMarkSynced) {
      const ids = data.filter(t => t.status !== 'void' && t.status !== 'draft').map(t => t.id);
      await sbStampQbSynced(ids);
    }
    setQbExporting(false);
    setQbModal(false);
    if (qbMarkSynced) loadLedger();
  };

  const saveArv = async () => {
    const n = Number(String(arvInput).replace(/[$,]/g, ''));
    if (!n || n <= 0) { setArvError('Enter a valid dollar amount'); return; }
    setArvSaving(true); setArvError(null);
    upd(job.id, { arv: n });
    await loadLedger();
    setArvInput(''); setArvEditing(false); setArvSaving(false);
  };

  const saveSaleDetails = async () => {
    const price = Number(String(salePriceInput).replace(/[$,]/g, ''));
    if (!price || price <= 0) return;
    setSaleDetailsSaving(true);
    upd(job.id, { sale_price: price, ...(soldDateInput ? { sold_date: soldDateInput } : {}) });
    await loadLedger();
    setSalePriceInput(''); setSoldDateInput(''); setSaleDetailsSaving(false);
  };

  const handleMarkPaid = async () => {
    const ids = Array.from(selectedIds);
    const total = txs.filter(r => selectedIds.has(r.id)).reduce((sum, r) => sum + Number(r.amount || 0), 0);
    const confirmed = window.confirm(
      `Mark ${ids.length} expense${ids.length === 1 ? '' : 's'} as paid (total: ${f$(total)})? This will update the ledger.`
    );
    if (!confirmed) return;
    const result = await sbMarkTransactionsPaid({ transactionIds: ids });
    if (result.ok) {
      setSelectedIds(new Set());
      loadLedger();
    } else {
      alert(`Failed: ${result.error}`);
    }
  };

  const filtered = txs.filter(tx => {
    if (!showSynced && tx.qb_synced_at) return false;
    if (filterDir === 'in' && tx.direction !== 'in') return false;
    if (filterDir === 'out' && tx.direction !== 'out') return false;
    if (filterStatus === 'pending' && tx.status !== 'pending') return false;
    if (filterStatus === 'paid' && tx.status !== 'paid') return false;
    if (filterStatus === 'lien_due' && !(tx.lien_waiver_required && !tx.lien_waiver_url)) return false;
    return true;
  });

  return (
    <div>
      {/* Sub-tab bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid #E8E4DC', overflowX: 'auto', flexWrap: 'nowrap' }}>
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSub(t.id)} style={{
            padding: '8px 14px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: 'none', borderBottom: `2px solid ${sub === t.id ? 'var(--gold-500)' : 'transparent'}`,
            marginBottom: -2, color: sub === t.id ? 'var(--navy-900)' : 'var(--text-subtle)', transition: 'color 0.15s',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {t.id === 'co' && mob ? 'COs' : t.lb}{t.id === 'ledger' && lienCount > 0 ? ` ⚠ ${lienCount}` : ''}
          </button>
        ))}
      </div>

      {sub === 'co' && <COTab job={job} upd={upd} profile={profile} />}

      {sub === 'draws' && isDrawMode && <InvoicesSubTab job={job} profile={profile} />}

      {sub === 'margin' && model === 'flip' && (
        <div style={{ maxWidth: 640 }}>

          {/* ── ARV ─────────────────────────────────────────────── */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px', marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>After-Repair Value (ARV)</div>
            {job.arv != null && !arvEditing ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--navy-900)' }}>{f$(job.arv)}</div>
                <button onClick={() => { setArvInput(String(job.arv)); setArvEditing(true); }} style={{ fontSize: 12, padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>Edit</button>
              </div>
            ) : (
              <div>
                {job.arv == null && <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginBottom: 10 }}>Set the projected sale price to calculate your margin.</div>}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>$</span>
                    <input className="finp" type="number" min="0" step="1000" placeholder="e.g. 280000" value={arvInput} onChange={e => { setArvInput(e.target.value); setArvError(null); }} style={{ width: 160, fontSize: 14 }} autoFocus={arvEditing} />
                  </div>
                  <button className="btn btn-navy" onClick={saveArv} disabled={arvSaving || !arvInput.trim()} style={{ fontSize: 12, padding: '6px 16px' }}>{arvSaving ? 'Saving…' : job.arv != null ? 'Update ARV' : 'Set ARV'}</button>
                  {arvEditing && <button onClick={() => { setArvEditing(false); setArvInput(''); setArvError(null); }} style={{ fontSize: 12, padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 6, background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>Cancel</button>}
                </div>
                {arvError && <div style={{ fontSize: 12, color: 'var(--red-text)', marginTop: 6 }}>{arvError}</div>}
              </div>
            )}
          </div>

          {/* ── KPI Cards ───────────────────────────────────────── */}
          {summary && (
            <div style={{ display: 'grid', gridTemplateColumns: mob ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
              {[
                { lb: 'Cost Basis',        v: f$(summary.cost_basis ?? 0),   c: (summary.cost_basis ?? 0) > 0 ? 'var(--red-text)' : 'var(--text-subtle)',                                                                                                          note: 'total invested' },
                { lb: 'ARV',               v: job.arv != null ? f$(job.arv) : 'Not set',                                c: job.arv != null ? 'var(--navy-900)' : 'var(--text-subtle)',                                                                              note: job.arv != null ? 'target sale price' : 'set above' },
                { lb: 'Projected Profit',  v: summary.projected_flip_profit != null ? f$(summary.projected_flip_profit) : '—', c: summary.projected_flip_profit != null ? (summary.projected_flip_profit >= 0 ? 'var(--green-dot)' : 'var(--red-text)') : 'var(--text-subtle)', note: summary.projected_flip_profit == null ? 'set ARV' : undefined },
                { lb: 'Margin',            v: summary.margin_on_arv_pct != null ? `${summary.margin_on_arv_pct}%` : '—',    c: summary.margin_on_arv_pct != null ? 'var(--navy-900)' : 'var(--text-subtle)',                                                         note: summary.margin_on_arv_pct != null ? 'of ARV' : undefined },
              ].map(({ lb, v, c, note }) => (
                <div key={lb} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-subtle)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{lb}</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: mob ? 18 : 22, color: c }}>{v}</div>
                  {note && <div style={{ fontSize: 10, color: 'var(--text-subtle)', marginTop: 4 }}>{note}</div>}
                </div>
              ))}
            </div>
          )}

          {/* ── Visual bar: cost vs ARV ──────────────────────────── */}
          {summary && job.arv != null && (summary.cost_basis ?? 0) >= 0 && (() => {
            const arv = Number(job.arv);
            const basis = summary.cost_basis ?? 0;
            const pct = arv > 0 ? Math.min(100, Math.round((basis / arv) * 100)) : 0;
            const over = pct >= 100;
            return (
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 18px', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-subtle)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  <span>Cost basis</span>
                  <span>ARV {f$(arv)}</span>
                </div>
                <div style={{ height: 10, background: '#E5E7EB', borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: over ? 'var(--red-text)' : 'var(--navy-900)', borderRadius: 5, transition: 'width 0.4s ease' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 6 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{f$(basis)} ({pct}%)</span>
                  <span style={{ color: over ? 'var(--red-text)' : 'var(--green-dot)', fontWeight: 600 }}>
                    {over ? `Over ARV by ${f$(basis - arv)}` : `${f$(arv - basis)} margin`}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* ── Actual Realization (once sold) ──────────────────── */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 8, padding: '16px 20px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>Actual Realization</div>
            {job.sale_price != null ? (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: mob ? '1fr 1fr' : 'repeat(3, 1fr)', gap: 8, marginBottom: 8 }}>
                  {(() => {
                    const sp = Number(job.sale_price);
                    const basis = summary?.cost_basis ?? 0;
                    const actualProfit = sp - basis;
                    const actualMargin = sp > 0 ? Math.round((actualProfit / sp) * 1000) / 10 : 0;
                    const vsProjected = summary?.projected_flip_profit != null ? actualProfit - summary.projected_flip_profit : null;
                    return [
                      { lb: 'Sale Price',     v: f$(sp),          c: 'var(--green-dot)' },
                      { lb: 'Actual Profit',  v: f$(actualProfit), c: actualProfit >= 0 ? 'var(--green-dot)' : 'var(--red-text)' },
                      { lb: 'Actual Margin',  v: `${actualMargin}%`, c: 'var(--navy-900)' },
                    ].map(({ lb, v, c }) => (
                      <div key={lb} style={{ background: 'var(--green-bg-soft)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
                        <div style={{ fontSize: 9, color: 'var(--text-subtle)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{lb}</div>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: mob ? 16 : 20, color: c }}>{v}</div>
                      </div>
                    ));
                  })()}
                </div>
                {job.sold_date && <div style={{ fontSize: 11, color: 'var(--text-subtle)' }}>Closed {job.sold_date}</div>}
                {summary?.projected_flip_profit != null && (() => {
                  const sp = Number(job.sale_price); const basis = summary.cost_basis ?? 0;
                  const delta = (sp - basis) - summary.projected_flip_profit;
                  return (
                    <div style={{ marginTop: 10, fontSize: 12, color: delta >= 0 ? 'var(--green-dot)' : 'var(--red-text)', fontWeight: 600 }}>
                      {delta >= 0 ? `+${f$(delta)} vs projected` : `${f$(delta)} vs projected`}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 13, color: 'var(--text-subtle)', marginBottom: 12 }}>Not yet sold. Record the sale price when the property closes.</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Sale Price</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>$</span>
                      <input className="finp" type="number" min="0" step="1000" placeholder="e.g. 295000" value={salePriceInput} onChange={e => setSalePriceInput(e.target.value)} style={{ width: 140, fontSize: 14 }} />
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Closing Date (optional)</div>
                    <input className="finp" type="date" value={soldDateInput} onChange={e => setSoldDateInput(e.target.value)} style={{ width: 150, fontSize: 14 }} />
                  </div>
                  <button className="btn btn-navy" onClick={saveSaleDetails} disabled={saleDetailsSaving || !salePriceInput.trim()} style={{ fontSize: 12, padding: '8px 16px' }}>{saleDetailsSaving ? 'Saving…' : 'Record Sale'}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {sub === 'billing' && model === 'fixed_bid' && (
        <div>
          <PaymentScheduleTab job={job} profile={profile} />
          <div style={{ borderTop: '2px solid #E8E4DC', margin: '28px 0 20px' }} />
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--navy-900)', marginBottom: 14 }}>Invoices</div>
          <InvoicesSubTab job={job} profile={profile} />
        </div>
      )}

      {sub === 'sub_invoices' && <SubInvoicesSection job={job} profile={profile} openAddInvoiceOnMount={openSubInvoiceOnMount} />}

      {sub === 'materials' && <MaterialsTab job={job} />}

      {sub === 'budget' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button onClick={() => setLiModal({ mode: 'create', item: {} })} style={{ fontSize: 12, padding: '6px 14px', background: 'var(--navy-900)', color: 'var(--gold-500)', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>+ Add Line Item</button>
          </div>
          {budgetLoading ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-subtle)' }}>Loading...</div>
          ) : !lineItems.length ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-subtle)', fontSize: 13 }}>
              No budget line items yet — generate an estimate or tap + Add Line Item
            </div>
          ) : (() => {
            const totalBudget = lineItems.reduce((s, li) => s + Number(li.client_price ?? li.total_cost ?? 0), 0);
            const totalActual = lineItems.reduce((s, li) => s + Number(li.actual || 0), 0);
            const totalVariance = totalBudget - totalActual;
            const statusPill = (budget, actual) => {
              if (!budget) return null;
              const pct = actual / budget;
              if (pct > 1.10) return { label: 'Over', bg: 'var(--red-bg)', color: 'var(--red-text-strong)' };
              if (pct >= 0.90) return { label: 'On Track', bg: 'var(--green-bg)', color: '#065f46' };
              return { label: 'Under', bg: '#DBEAFE', color: '#1e40af' };
            };
            return (
              <>
                {/* Desktop table */}
                {!mob && <div className="budget-desktop">
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 80px 80px', gap: 8, padding: '6px 10px', background: 'var(--navy-900)', borderRadius: '6px 6px 0 0', fontSize: 10, fontWeight: 700, color: 'var(--gold-500)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {['Line Item', 'Budget', 'Actual', 'Variance', '% Budg', 'Status'].map(h => <div key={h}>{h}</div>)}
                  </div>
                  {lineItems.map(li => {
                    const budget = Number(li.client_price ?? li.total_cost ?? 0);
                    const actual = Number(li.actual || 0);
                    const variance = budget - actual;
                    const pctOfBudget = budget ? Math.round((actual / budget) * 100) : 0;
                    const pill = statusPill(budget, actual);
                    return (
                      <div key={li.id} onClick={() => setLiModal({ mode: 'edit', item: li })} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 80px 80px', gap: 8, padding: '8px 10px', borderBottom: '1px solid #F3F0EB', fontSize: 13, cursor: 'pointer', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--navy-900)' }}>{li.description}</div>
                          {li.phase && <div style={{ fontSize: 10, color: 'var(--text-subtle)' }}>{li.phase}{li.trade ? ` · ${li.trade}` : ''}</div>}
                        </div>
                        <div style={{ color: 'var(--navy-900)', fontWeight: 500 }}>{f$(budget)}</div>
                        <div style={{ color: actual > 0 ? 'var(--red-text)' : 'var(--text-subtle)', fontWeight: 500 }}>{actual > 0 ? f$(actual) : '—'}</div>
                        <div style={{ color: variance < 0 ? 'var(--red-text)' : 'var(--green-dot)', fontWeight: 600 }}>{actual > 0 ? (variance < 0 ? `-${f$(Math.abs(variance))}` : f$(variance)) : '—'}</div>
                        <div style={{ color: 'var(--text-muted)' }}>{actual > 0 ? `${pctOfBudget}%` : '—'}</div>
                        <div>{pill && <span style={{ background: pill.bg, color: pill.color, padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>{pill.label}</span>}</div>
                      </div>
                    );
                  })}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 80px 80px', gap: 8, padding: '10px', background: 'var(--bg)', borderTop: '2px solid #E8E4DC', fontSize: 13, fontWeight: 700 }}>
                    <div style={{ color: 'var(--navy-900)' }}>Total</div>
                    <div style={{ color: 'var(--navy-900)' }}>{f$(totalBudget)}</div>
                    <div style={{ color: totalActual > 0 ? 'var(--red-text)' : 'var(--text-subtle)' }}>{totalActual > 0 ? f$(totalActual) : '—'}</div>
                    <div style={{ color: totalVariance < 0 ? 'var(--red-text)' : 'var(--green-dot)' }}>{totalActual > 0 ? (totalVariance < 0 ? `-${f$(Math.abs(totalVariance))}` : f$(totalVariance)) : '—'}</div>
                    <div /><div />
                  </div>
                </div>}
                {/* Mobile cards */}
                {mob && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {lineItems.map(li => {
                    const budget = Number(li.client_price ?? li.total_cost ?? 0);
                    const actual = Number(li.actual || 0);
                    const variance = budget - actual;
                    const pill = statusPill(budget, actual);
                    return (
                      <div key={li.id} onClick={() => setLiModal({ mode: 'edit', item: li })} style={{ background: '#fff', border: '1px solid #E8E4DC', borderRadius: 8, padding: '12px 14px', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy-900)' }}>{li.description}</div>
                            {li.phase && <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>{li.phase}{li.trade ? ` · ${li.trade}` : ''}</div>}
                          </div>
                          {pill && <span style={{ background: pill.bg, color: pill.color, padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{pill.label}</span>}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
                          {[['Budget', f$(budget), 'var(--navy-900)'], ['Actual', actual > 0 ? f$(actual) : '—', 'var(--red-text)'], ['Variance', actual > 0 ? (variance < 0 ? `-${f$(Math.abs(variance))}` : f$(variance)) : '—', variance < 0 ? 'var(--red-text)' : 'var(--green-dot)']].map(([lb, val, c]) => (
                            <div key={lb} style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: 9, color: 'var(--text-subtle)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{lb}</div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: c }}>{val}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {lineItems.length > 0 && (
                    <div style={{ background: 'var(--bg)', border: '1px solid #E8E4DC', borderRadius: 8, padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      {[['Total Budget', f$(totalBudget), 'var(--navy-900)'], ['Total Actual', totalActual > 0 ? f$(totalActual) : '—', 'var(--red-text)'], ['Remaining', totalActual > 0 ? (totalVariance < 0 ? `-${f$(Math.abs(totalVariance))}` : f$(totalVariance)) : '—', totalVariance < 0 ? 'var(--red-text)' : 'var(--green-dot)']].map(([lb, val, c]) => (
                        <div key={lb} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 9, color: 'var(--text-subtle)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{lb}</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: c }}>{val}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>}
              </>
            );
          })()}
        </div>
      )}

      {liModal && (
        <LineItemModal
          mode={liModal.mode}
          item={liModal.item}
          job={job}
          onClose={() => setLiModal(null)}
          onSaved={() => { if (pendingTodoId) { sbCompleteTodo(pendingTodoId).catch(() => {}); setPendingTodoId(null); } setLiModal(null); loadBudget(); }}
        />
      )}

      {sub === 'ledger' && (
        <div>
          {/* Stat bar — three-mode: cost_plus / flip / fixed_bid */}
          {summary && (() => {
            const owes = summary.client_owes;
            // Cost-plus stat cards — cost-ledger language (redesigned B1 session).
            const cpSpent = (summary.paid_out ?? summary.total_out ?? 0) + (summary.pending_out ?? 0);
            const cpStats = [
              { lb: 'Spent',     v: f$(cpSpent),                                    c: cpSpent > 0 ? 'var(--red-text)' : 'var(--text-subtle)',          note: 'all costs logged' },
              { lb: 'Received',  v: f$(summary.total_in ?? 0),                      c: (summary.total_in ?? 0) > 0 ? 'var(--green-dot)' : 'var(--text-subtle)', note: 'draws paid back' },
              { lb: 'Next Draw', v: f$(summary.next_draw ?? 0),                     c: (summary.next_draw ?? 0) > 0 ? 'var(--amber-text-strong)' : 'var(--text-subtle)', note: 'pending, not yet drawn' },
              { lb: 'Settled',   v: f$(summary.paid_out ?? summary.total_out ?? 0), c: 'var(--text-muted)',                                               note: 'paid costs' },
              ...(summary.outstanding_pending > 0 ? [{ lb: 'Outstanding', v: f$(summary.outstanding_pending), c: 'var(--amber-text-strong)', note: 'approved sub invoices unpaid' }] : []),
              ...(summary.retainage_held > 0 ? [{ lb: 'Retainage Held', v: f$(summary.retainage_held), c: 'var(--amber-text-strong)', note: 'released at final draw' }] : []),
            ];
            // Flip stat cards — flip language, no bucket/client-money fields.
            const flipStats = [
              {
                lb: 'Cost Basis',
                v: f$(summary.cost_basis ?? 0),
                c: (summary.cost_basis ?? 0) > 0 ? 'var(--red-text)' : 'var(--text-subtle)',
                note: 'total invested',
              },
              {
                lb: 'ARV',
                v: summary.arv_target != null ? f$(summary.arv_target) : 'Not set',
                c: summary.arv_target != null ? 'var(--navy-900)' : 'var(--text-subtle)',
                note: summary.arv_target != null ? 'after-repair value' : 'enter ARV to see profit',
              },
              {
                lb: 'Projected Profit',
                v: summary.projected_flip_profit != null ? f$(summary.projected_flip_profit) : '—',
                c: summary.projected_flip_profit != null
                  ? summary.projected_flip_profit >= 0 ? 'var(--green-dot)' : 'var(--red-text)'
                  : 'var(--text-subtle)',
                note: summary.projected_flip_profit == null ? 'set ARV to see profit' : undefined,
              },
              {
                lb: 'Margin',
                v: summary.margin_on_arv_pct != null ? `${summary.margin_on_arv_pct}%` : '—',
                c: summary.margin_on_arv_pct != null ? 'var(--navy-900)' : 'var(--text-subtle)',
                note: summary.margin_on_arv_pct != null ? 'of ARV' : undefined,
              },
              // Next Draw renders on all draws-enabled models (flip + cost_plus),
              // gated on the financial_model enum via `model`, not legacy cost_plus.
              { lb: 'Next Draw', v: f$(summary.next_draw ?? 0), c: (summary.next_draw ?? 0) > 0 ? 'var(--amber-text-strong)' : 'var(--text-subtle)', note: 'pending, not yet drawn' },
              ...(summary.outstanding_pending > 0 ? [{ lb: 'Outstanding', v: f$(summary.outstanding_pending), c: 'var(--amber-text-strong)', note: 'approved sub invoices unpaid' }] : []),
              ...(summary.retainage_held > 0 ? [{ lb: 'Retainage Held', v: f$(summary.retainage_held), c: 'var(--amber-text-strong)', note: 'released at final draw' }] : []),
            ];
            // Fixed-price stat cards: Contract + Received removed — in header KPI strip.
            const stats = model === 'flip'
              ? flipStats
              : model === 'cost_plus'
              ? cpStats
              : [
                  { lb: 'Client Owes', v: owes < 0 ? `Overpaid ${f$(Math.abs(owes))}` : f$(owes),        c: owes < 0 ? 'var(--green-dot)' : owes > 0 ? 'var(--gold-500)' : 'var(--text-subtle)' },
                  { lb: 'Pending Out', v: f$(summary.pending_out),                                        c: summary.pending_out > 0 ? 'var(--amber-text-strong)' : 'var(--text-subtle)' },
                  { lb: 'Paid Out',    v: f$(summary.total_out),                                          c: summary.total_out > 0 ? 'var(--red-text)' : 'var(--text-subtle)' },
                ];
            return (
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {stats.map(({ lb, v, c, bold, note, noteColor }) => (
                  <div key={lb} style={{ flex: 1, minWidth: 90, background: '#fff', border: '1px solid #E8E4DC', padding: '10px 14px', borderRadius: 6 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-subtle)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{lb}</div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: c, fontWeight: bold ? 700 : 400 }}>{v}</div>
                    {note && <div style={{ fontSize: 9, color: noteColor || 'var(--text-subtle)', marginTop: 3, lineHeight: 1.3 }}>{note}</div>}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Draw-request nudge — draw modes (cost_plus + flip), non-blocking */}
          {isDrawMode && isManager && summary && !dismissedDrawNudge && (() => {
            const unreimb = summary.float_unreimbursed || 0;
            const cv = Number(job.contract_value) || 0;
            if (unreimb < DRAW_NUDGE_THRESHOLD * cv) return null;
            const pct = cv > 0 ? Math.round(unreimb / cv * 100) : 0;
            return (
              <div style={{ background: 'var(--amber-bg)', border: '1px solid #FCD34D', borderLeft: '4px solid #F59E0B', borderRadius: 8, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber-text-strong)' }}>Consider composing a draw</div>
                  <div style={{ fontSize: 11, color: 'var(--amber-text-strong)', marginTop: 2 }}>
                    Carrying {f$(unreimb)} unreimbursed — {pct}% of contract. PM&rsquo;s call.
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => setDismissedDrawNudge(true)}
                    style={{ fontSize: 11, padding: '4px 10px', border: '1px solid #FCD34D', borderRadius: 6, background: 'transparent', color: 'var(--amber-text-strong)', cursor: 'pointer' }}
                  >Dismiss</button>
                  <button
                    onClick={() => setShowComposeDraw(true)}
                    style={{ fontSize: 11, padding: '4px 12px', border: 'none', borderRadius: 6, background: 'var(--amber-text-strong)', color: '#fff', cursor: 'pointer', fontWeight: 700 }}
                  >Compose Draw →</button>
                </div>
              </div>
            );
          })()}

          {/* Filters + Add */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {[{ id: 'all', lb: 'All' }, { id: 'in', lb: '↑ Income' }, { id: 'out', lb: '↓ Expense' }].map(f => (
              <button key={f.id} onClick={() => setFilterDir(f.id)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 12, border: '1px solid', borderColor: filterDir === f.id ? 'var(--navy-900)' : 'var(--border)', background: filterDir === f.id ? 'var(--navy-900)' : '#fff', color: filterDir === f.id ? '#fff' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 500 }}>{f.lb}</button>
            ))}
            <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
            {[
              { id: 'all', lb: 'Any Status' },
              { id: 'pending', lb: 'Pending' },
              { id: 'paid', lb: 'Paid' },
              { id: 'lien_due', lb: `Lien Due${lienCount ? ` (${lienCount})` : ''}` },
            ].map(f => (
              <button key={f.id} onClick={() => setFilterStatus(f.id)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 12, border: '1px solid', borderColor: filterStatus === f.id ? 'var(--gold-500)' : 'var(--border)', background: filterStatus === f.id ? '#C9A84C22' : '#fff', color: filterStatus === f.id ? 'var(--amber-text-strong)' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 500 }}>{f.lb}</button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              <button onClick={() => setShowSynced(s => !s)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 12, border: '1px solid', borderColor: !showSynced ? 'var(--gold-500)' : 'var(--border)', background: !showSynced ? '#C9A84C22' : '#fff', color: !showSynced ? 'var(--amber-text-strong)' : 'var(--text-muted)', cursor: 'pointer', fontWeight: 500 }}>{showSynced ? 'Hide Synced' : 'Show Synced'}</button>
              <button onClick={openQbModal} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, border: '1px solid #C9A84C', background: '#C9A84C15', color: 'var(--amber-text-strong)', cursor: 'pointer', fontWeight: 600 }}>QB Export</button>
              <button onClick={() => setModal({ mode: 'create', tx: {} })} style={{ fontSize: 12, padding: '6px 14px', background: 'var(--navy-900)', color: 'var(--gold-500)', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>+ Add</button>
            </div>
          </div>

          {/* Transaction list */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-subtle)' }}>Loading...</div>
          ) : !filtered.length ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-subtle)', fontSize: 13 }}>
              {filterDir !== 'all' || filterStatus !== 'all' ? 'No transactions match this filter' : 'No transactions yet — tap + Add to record one'}
            </div>
          ) : (() => {
            const pendingExpenseRows = filtered.filter(r => r.status === 'pending' && r.direction === 'out');
            const selectedTotal = filtered.filter(r => selectedIds.has(r.id)).reduce((sum, r) => sum + Number(r.amount || 0), 0);
            const allChecked = pendingExpenseRows.length > 0 && pendingExpenseRows.every(r => selectedIds.has(r.id));
            const someChecked = pendingExpenseRows.some(r => selectedIds.has(r.id));
            return (
              <div>
                {/* Floating bulk action bar */}
                {selectedIds.size > 0 && isManager && (
                  <div style={{ position: 'sticky', top: 0, background: '#fef3c7', border: '1px solid #fcd34d', padding: '8px 12px', borderRadius: 4, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10, flexWrap: 'wrap', gap: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--amber-text-strong)', fontWeight: 500 }}>
                      {selectedIds.size} pending expense{selectedIds.size === 1 ? '' : 's'} selected — total: {f$(selectedTotal)}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setSelectedIds(new Set())} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #E8E4DC', background: '#fff', color: 'var(--text-muted)', cursor: 'pointer' }}>Clear</button>
                      <button onClick={handleMarkPaid} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--green-text)', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                        Mark {selectedIds.size} as Paid
                      </button>
                    </div>
                  </div>
                )}
                {/* Select-all row */}
                {pendingExpenseRows.length > 0 && isManager && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 14px 6px', marginBottom: 2 }}>
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedIds(new Set(pendingExpenseRows.map(r => r.id)));
                        } else {
                          setSelectedIds(new Set());
                        }
                      }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Select all pending expenses ({pendingExpenseRows.length})</span>
                  </div>
                )}
                {/* Row list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {filtered.map(tx => {
                    const isIn = tx.direction === 'in';
                    const lienMissing = tx.lien_waiver_required && !tx.lien_waiver_url;
                    const isPendingExpense = tx.status === 'pending' && tx.direction === 'out';
                    return (
                      <div key={tx.id} onClick={() => setModal({ mode: 'view', tx })} style={{ background: '#fff', border: `1px solid ${lienMissing ? 'var(--red-border)' : 'var(--border)'}`, borderRadius: 8, padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        {isManager && (
                          <div style={{ width: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {isPendingExpense && (
                              <input
                                type="checkbox"
                                checked={selectedIds.has(tx.id)}
                                onClick={e => e.stopPropagation()}
                                onChange={e => {
                                  const next = new Set(selectedIds);
                                  if (e.target.checked) next.add(tx.id); else next.delete(tx.id);
                                  setSelectedIds(next);
                                }}
                              />
                            )}
                          </div>
                        )}
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: isIn ? 'var(--green-bg)' : 'var(--red-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{isIn ? '↑' : '↓'}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--navy-900)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            {TYPE_LABELS[tx.type] || tx.type}
                            {lienMissing && <span style={{ fontSize: 10, background: 'var(--red-bg)', color: 'var(--red-text-strong)', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>Lien Missing</span>}
                            {tx.receipt_url && <span style={{ fontSize: 11, color: '#3B82F6' }}>📎</span>}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>
                            {tx.date_incurred}
                            {tx.payer_or_payee_name ? ` · ${tx.payer_or_payee_name}` : ''}
                            {tx.description ? ` · ${tx.description.slice(0, 40)}` : ''}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: isIn ? 'var(--green-dot)' : 'var(--red-text)' }}>{isIn ? '+' : '-'}{f$(tx.amount)}</div>
                          <div style={{ fontSize: 10, marginTop: 2, color: STATUS_COLOR[tx.status] || 'var(--text-subtle)', fontWeight: 600, textTransform: 'uppercase' }}>{tx.status}</div>
                          {!isIn && (tx.reimbursement_status === 'in_draw' || tx.reimbursement_status === 'reimbursed') && (
                            <span style={{ display: 'inline-block', marginTop: 3, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, padding: '1px 6px', borderRadius: 4,
                              background: tx.reimbursement_status === 'reimbursed' ? 'var(--green-bg)' : 'var(--neutral-bg)',
                              color:      tx.reimbursement_status === 'reimbursed' ? 'var(--green-text-strong)' : 'var(--text-muted)' }}>
                              {tx.reimbursement_status === 'reimbursed' ? 'Reimbursed' : 'In Draw'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {qbModal && (
        <div className="overlay" onClick={() => setQbModal(false)}>
          <div className="modal" style={{ maxWidth: 380, width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--navy-900)' }}>QuickBooks Export</div>
              <button onClick={() => setQbModal(false)} style={{ background: 'none', border: 'none', fontSize: 22, color: 'var(--text-subtle)', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Date Range</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[['this_month', 'This Month'], ['this_quarter', 'This Quarter'], ['ytd', 'YTD'], ['all', 'All Time'], ['custom', 'Custom']].map(([v, lb]) => (
                  <button key={v} onClick={() => setQbRange(v)} style={{ padding: '8px 0', fontSize: 12, fontWeight: 600, border: '1px solid', borderColor: qbRange === v ? 'var(--navy-900)' : 'var(--border)', borderRadius: 6, background: qbRange === v ? 'var(--navy-900)' : '#fff', color: qbRange === v ? 'var(--gold-500)' : 'var(--text-muted)', cursor: 'pointer' }}>{lb}</button>
                ))}
              </div>
            </div>
            {qbRange === 'custom' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                {[['From', qbDateFrom, setQbDateFrom], ['To', qbDateTo, setQbDateTo]].map(([lb, val, set]) => (
                  <div key={lb}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>{lb}</label>
                    <input type="date" value={val} onChange={e => set(e.target.value)} style={{ border: '1px solid #E8E4DC', padding: '8px 10px', fontSize: 13, borderRadius: 6, width: '100%', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginBottom: 16 }}>
              {profile?.role === 'owner' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', marginBottom: 8 }}>
                  <input type="checkbox" checked={qbAllJobs} onChange={e => setQbAllJobs(e.target.checked)} />
                  All jobs (tenant-wide)
                </label>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={qbMarkSynced} onChange={e => setQbMarkSynced(e.target.checked)} />
                Mark as synced after export
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setQbModal(false)} className="btn btn-ghost" style={{ flex: 1 }}>Cancel</button>
              <button onClick={runQbExport} disabled={qbExporting || (qbRange === 'custom' && (!qbDateFrom || !qbDateTo))} className="btn btn-navy" style={{ flex: 2 }}>{qbExporting ? 'Exporting...' : 'Export CSV'}</button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <TransactionModal
          mode={modal.mode}
          tx={modal.tx}
          job={job}
          onClose={() => setModal(null)}
          onSaved={() => { if (pendingTodoId) { sbCompleteTodo(pendingTodoId).catch(() => {}); setPendingTodoId(null); } setModal(null); loadLedger(); }}
        />
      )}

      {showComposeDraw && isDrawMode && (
        <ComposeDrawScr
          job={job}
          onClose={() => setShowComposeDraw(false)}
          onComposed={() => { setShowComposeDraw(false); setSub('draws'); loadLedger(); }}
        />
      )}
    </div>
  );
}
