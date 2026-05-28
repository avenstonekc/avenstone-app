import { useState, useEffect } from 'react';
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

const STATUS_COLOR = { paid: '#22c55e', pending: '#f59e0b', overdue: '#ef4444', void: '#9CA3AF', draft: '#9CA3AF', refunded: '#8b5cf6' };

export default function FinancialsTab({ job, upd, profile, docs, setDocs, pendingAction, clearPendingAction, financialsAction, clearFinancialsAction }) {
  const mob = isMob();
  // Cost-plus: Draws tab instead of Invoices. Fixed-price: Invoices tab, no Draws.
  const SUB_TABS = [
    { id: 'ledger',      lb: 'Ledger' },
    { id: 'budget',      lb: 'Budget' },
    { id: 'co',          lb: 'Change Orders' },
    ...(job.cost_plus
      ? [{ id: 'draws',    lb: 'Draws' }]
      : [{ id: 'invoices', lb: 'Invoices' }, { id: 'payment_schedule', lb: 'Payment Schedule' }]),
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
    if (job.cost_plus && (sub === 'invoices' || sub === 'payment_schedule')) setSub('ledger');
    if (!job.cost_plus && sub === 'draws') setSub('ledger');
  }, [job.cost_plus]);
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
      sbLoadJobFinancialSummary(job.id, { contractValue: job.contract_value, coTotal: job.co_total, costPlus: job.cost_plus }),
    ]);
    setTxs(data);
    setSummary(sum);
    setLoading(false);
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

  const lienCount = txs.filter(t => t.lien_waiver_required && !t.lien_waiver_url).length;
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
            background: 'none', borderBottom: `2px solid ${sub === t.id ? '#C9A84C' : 'transparent'}`,
            marginBottom: -2, color: sub === t.id ? '#0A1F44' : '#9CA3AF', transition: 'color 0.15s',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {t.id === 'co' && mob ? 'COs' : t.lb}{t.id === 'ledger' && lienCount > 0 ? ` ⚠ ${lienCount}` : ''}
          </button>
        ))}
      </div>

      {sub === 'co' && <COTab job={job} upd={upd} profile={profile} />}

      {sub === 'draws' && job.cost_plus && <InvoicesSubTab job={job} profile={profile} />}
      {sub === 'invoices' && !job.cost_plus && <InvoicesSubTab job={job} profile={profile} />}

      {sub === 'payment_schedule' && !job.cost_plus && <PaymentScheduleTab job={job} profile={profile} />}

      {sub === 'sub_invoices' && <SubInvoicesSection job={job} profile={profile} openAddInvoiceOnMount={openSubInvoiceOnMount} />}

      {sub === 'materials' && <MaterialsTab job={job} />}

      {sub === 'budget' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button onClick={() => setLiModal({ mode: 'create', item: {} })} style={{ fontSize: 12, padding: '6px 14px', background: '#0A1F44', color: '#C9A84C', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>+ Add Line Item</button>
          </div>
          {budgetLoading ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF' }}>Loading...</div>
          ) : !lineItems.length ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF', fontSize: 13 }}>
              No budget line items yet — generate an estimate or tap + Add Line Item
            </div>
          ) : (() => {
            const totalBudget = lineItems.reduce((s, li) => s + Number(li.client_price ?? li.total_cost ?? 0), 0);
            const totalActual = lineItems.reduce((s, li) => s + Number(li.actual || 0), 0);
            const totalVariance = totalBudget - totalActual;
            const statusPill = (budget, actual) => {
              if (!budget) return null;
              const pct = actual / budget;
              if (pct > 1.10) return { label: 'Over', bg: '#FEE2E2', color: '#991b1b' };
              if (pct >= 0.90) return { label: 'On Track', bg: '#D1FAE5', color: '#065f46' };
              return { label: 'Under', bg: '#DBEAFE', color: '#1e40af' };
            };
            return (
              <>
                {/* Desktop table */}
                {!mob && <div className="budget-desktop">
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 80px 80px', gap: 8, padding: '6px 10px', background: '#0A1F44', borderRadius: '6px 6px 0 0', fontSize: 10, fontWeight: 700, color: '#C9A84C', textTransform: 'uppercase', letterSpacing: 0.5 }}>
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
                          <div style={{ fontWeight: 600, color: '#0A1F44' }}>{li.description}</div>
                          {li.phase && <div style={{ fontSize: 10, color: '#9CA3AF' }}>{li.phase}{li.trade ? ` · ${li.trade}` : ''}</div>}
                        </div>
                        <div style={{ color: '#0A1F44', fontWeight: 500 }}>{f$(budget)}</div>
                        <div style={{ color: actual > 0 ? '#ef4444' : '#9CA3AF', fontWeight: 500 }}>{actual > 0 ? f$(actual) : '—'}</div>
                        <div style={{ color: variance < 0 ? '#ef4444' : '#22c55e', fontWeight: 600 }}>{actual > 0 ? (variance < 0 ? `-${f$(Math.abs(variance))}` : f$(variance)) : '—'}</div>
                        <div style={{ color: '#6B7280' }}>{actual > 0 ? `${pctOfBudget}%` : '—'}</div>
                        <div>{pill && <span style={{ background: pill.bg, color: pill.color, padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>{pill.label}</span>}</div>
                      </div>
                    );
                  })}
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 80px 80px', gap: 8, padding: '10px', background: '#F7F5F0', borderTop: '2px solid #E8E4DC', fontSize: 13, fontWeight: 700 }}>
                    <div style={{ color: '#0A1F44' }}>Total</div>
                    <div style={{ color: '#0A1F44' }}>{f$(totalBudget)}</div>
                    <div style={{ color: totalActual > 0 ? '#ef4444' : '#9CA3AF' }}>{totalActual > 0 ? f$(totalActual) : '—'}</div>
                    <div style={{ color: totalVariance < 0 ? '#ef4444' : '#22c55e' }}>{totalActual > 0 ? (totalVariance < 0 ? `-${f$(Math.abs(totalVariance))}` : f$(totalVariance)) : '—'}</div>
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
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44' }}>{li.description}</div>
                            {li.phase && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{li.phase}{li.trade ? ` · ${li.trade}` : ''}</div>}
                          </div>
                          {pill && <span style={{ background: pill.bg, color: pill.color, padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{pill.label}</span>}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
                          {[['Budget', f$(budget), '#0A1F44'], ['Actual', actual > 0 ? f$(actual) : '—', '#ef4444'], ['Variance', actual > 0 ? (variance < 0 ? `-${f$(Math.abs(variance))}` : f$(variance)) : '—', variance < 0 ? '#ef4444' : '#22c55e']].map(([lb, val, c]) => (
                            <div key={lb} style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: 9, color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{lb}</div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: c }}>{val}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {lineItems.length > 0 && (
                    <div style={{ background: '#F7F5F0', border: '1px solid #E8E4DC', borderRadius: 8, padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      {[['Total Budget', f$(totalBudget), '#0A1F44'], ['Total Actual', totalActual > 0 ? f$(totalActual) : '—', '#ef4444'], ['Remaining', totalActual > 0 ? (totalVariance < 0 ? `-${f$(Math.abs(totalVariance))}` : f$(totalVariance)) : '—', totalVariance < 0 ? '#ef4444' : '#22c55e']].map(([lb, val, c]) => (
                        <div key={lb} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 9, color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{lb}</div>
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
          {/* Stat bar — cost-plus-aware */}
          {summary && (() => {
            const owes = summary.client_owes;
            const isCostPlus = job?.cost_plus === true && summary.received !== undefined;
            const cpBucketBalance = summary.bucket_balance ?? 0;
            const cpStats = [
              { lb: 'Contract (signed)', v: f$(job.contract_value || 0), c: '#0A1F44', bold: true,
                note: summary.projected_final_bill != null
                  ? `${f$(summary.projected_final_bill)} projected · ${f$(Math.abs(summary.contract_variance ?? 0))} ${(summary.contract_variance ?? 0) >= 0 ? 'under' : 'over'}`
                  : `actuals + ${job.labor_markup_pct ?? 25}% markup determine final billing`,
                noteColor: summary.projected_final_bill != null
                  ? ((summary.contract_variance ?? 0) >= 0 ? '#22c55e' : '#ef4444')
                  : undefined },
              { lb: 'Received',          v: f$(summary.received ?? summary.total_in), c: (summary.received ?? summary.total_in) > 0 ? '#22c55e' : '#9CA3AF' },
              { lb: 'Paid Out',          v: f$(summary.paid_out ?? summary.total_out), c: (summary.paid_out ?? summary.total_out) > 0 ? '#ef4444' : '#9CA3AF' },
              ...(summary.outstanding_pending > 0 ? [{ lb: 'Outstanding', v: f$(summary.outstanding_pending), c: '#b45309', note: 'approved sub invoices unpaid' }] : []),
              ...(summary.retainage_held > 0 ? [{ lb: 'Retainage Held', v: f$(summary.retainage_held), c: '#b45309', note: 'released at final draw' }] : []),
              { lb: 'Projected Profit',  v: f$(summary.projected_profit), c: summary.projected_profit > 0 ? '#22c55e' : '#9CA3AF', note: `${summary.margin_pct ?? 0}% margin · +${f$(summary.pm_fee ?? 0)} PM` },
              ...(cpBucketBalance >= 0
                ? [{ lb: 'Bucket Credit', v: f$(cpBucketBalance), c: '#22c55e', note: 'client prepaid balance' }]
                : [{ lb: 'Client Owes',   v: f$(Math.abs(cpBucketBalance)), c: '#ef4444', note: 'request a draw' }]
              ),
            ];
            const stats = isCostPlus
              ? cpStats
              : [
                  { lb: 'Contract',    v: f$(summary.contract_total),                                     c: '#0A1F44',  bold: true },
                  { lb: 'Received',    v: f$(summary.total_in),                                           c: summary.total_in > 0 ? '#22c55e' : '#9CA3AF' },
                  { lb: 'Client Owes', v: owes < 0 ? `Overpaid ${f$(Math.abs(owes))}` : f$(owes),        c: owes < 0 ? '#22c55e' : owes > 0 ? '#C9A84C' : '#9CA3AF' },
                  { lb: 'Pending Out', v: f$(summary.pending_out),                                        c: summary.pending_out > 0 ? '#b45309' : '#9CA3AF' },
                  { lb: 'Paid Out',    v: f$(summary.total_out),                                          c: summary.total_out > 0 ? '#ef4444' : '#9CA3AF' },
                ];
            return (
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {stats.map(({ lb, v, c, bold, note, noteColor }) => (
                  <div key={lb} style={{ flex: 1, minWidth: 90, background: '#fff', border: '1px solid #E8E4DC', padding: '10px 14px', borderRadius: 6 }}>
                    <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{lb}</div>
                    <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16, color: c, fontWeight: bold ? 700 : 400 }}>{v}</div>
                    {note && <div style={{ fontSize: 9, color: noteColor || '#9CA3AF', marginTop: 3, lineHeight: 1.3 }}>{note}</div>}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Filters + Add */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {[{ id: 'all', lb: 'All' }, { id: 'in', lb: '↑ Income' }, { id: 'out', lb: '↓ Expense' }].map(f => (
              <button key={f.id} onClick={() => setFilterDir(f.id)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 12, border: '1px solid', borderColor: filterDir === f.id ? '#0A1F44' : '#E8E4DC', background: filterDir === f.id ? '#0A1F44' : '#fff', color: filterDir === f.id ? '#fff' : '#6B7280', cursor: 'pointer', fontWeight: 500 }}>{f.lb}</button>
            ))}
            <div style={{ width: 1, height: 18, background: '#E8E4DC' }} />
            {[
              { id: 'all', lb: 'Any Status' },
              { id: 'pending', lb: 'Pending' },
              { id: 'paid', lb: 'Paid' },
              { id: 'lien_due', lb: `Lien Due${lienCount ? ` (${lienCount})` : ''}` },
            ].map(f => (
              <button key={f.id} onClick={() => setFilterStatus(f.id)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 12, border: '1px solid', borderColor: filterStatus === f.id ? '#C9A84C' : '#E8E4DC', background: filterStatus === f.id ? '#C9A84C22' : '#fff', color: filterStatus === f.id ? '#92400e' : '#6B7280', cursor: 'pointer', fontWeight: 500 }}>{f.lb}</button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              <button onClick={() => setShowSynced(s => !s)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 12, border: '1px solid', borderColor: !showSynced ? '#C9A84C' : '#E8E4DC', background: !showSynced ? '#C9A84C22' : '#fff', color: !showSynced ? '#92400e' : '#6B7280', cursor: 'pointer', fontWeight: 500 }}>{showSynced ? 'Hide Synced' : 'Show Synced'}</button>
              <button onClick={openQbModal} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, border: '1px solid #C9A84C', background: '#C9A84C15', color: '#92400e', cursor: 'pointer', fontWeight: 600 }}>QB Export</button>
              <button onClick={() => setModal({ mode: 'create', tx: {} })} style={{ fontSize: 12, padding: '6px 14px', background: '#0A1F44', color: '#C9A84C', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>+ Add</button>
            </div>
          </div>

          {/* Transaction list */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF' }}>Loading...</div>
          ) : !filtered.length ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF', fontSize: 13 }}>
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
                    <span style={{ fontSize: 12, color: '#92400e', fontWeight: 500 }}>
                      {selectedIds.size} pending expense{selectedIds.size === 1 ? '' : 's'} selected — total: {f$(selectedTotal)}
                    </span>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setSelectedIds(new Set())} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #E8E4DC', background: '#fff', color: '#6B7280', cursor: 'pointer' }}>Clear</button>
                      <button onClick={handleMarkPaid} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: 'none', background: '#059669', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
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
                    <span style={{ fontSize: 11, color: '#6B7280' }}>Select all pending expenses ({pendingExpenseRows.length})</span>
                  </div>
                )}
                {/* Row list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {filtered.map(tx => {
                    const isIn = tx.direction === 'in';
                    const lienMissing = tx.lien_waiver_required && !tx.lien_waiver_url;
                    const isPendingExpense = tx.status === 'pending' && tx.direction === 'out';
                    return (
                      <div key={tx.id} onClick={() => setModal({ mode: 'view', tx })} style={{ background: '#fff', border: `1px solid ${lienMissing ? '#fca5a5' : '#E8E4DC'}`, borderRadius: 8, padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
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
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: isIn ? '#D1FAE5' : '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{isIn ? '↑' : '↓'}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            {TYPE_LABELS[tx.type] || tx.type}
                            {lienMissing && <span style={{ fontSize: 10, background: '#FEE2E2', color: '#991b1b', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>Lien Missing</span>}
                            {tx.receipt_url && <span style={{ fontSize: 11, color: '#3B82F6' }}>📎</span>}
                          </div>
                          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                            {tx.date_incurred}
                            {tx.payer_or_payee_name ? ` · ${tx.payer_or_payee_name}` : ''}
                            {tx.description ? ` · ${tx.description.slice(0, 40)}` : ''}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: isIn ? '#22c55e' : '#ef4444' }}>{isIn ? '+' : '-'}{f$(tx.amount)}</div>
                          <div style={{ fontSize: 10, marginTop: 2, color: STATUS_COLOR[tx.status] || '#9CA3AF', fontWeight: 600, textTransform: 'uppercase' }}>{tx.status}</div>
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
              <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: '#0A1F44' }}>QuickBooks Export</div>
              <button onClick={() => setQbModal(false)} style={{ background: 'none', border: 'none', fontSize: 22, color: '#9CA3AF', cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Date Range</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {[['this_month', 'This Month'], ['this_quarter', 'This Quarter'], ['ytd', 'YTD'], ['all', 'All Time'], ['custom', 'Custom']].map(([v, lb]) => (
                  <button key={v} onClick={() => setQbRange(v)} style={{ padding: '8px 0', fontSize: 12, fontWeight: 600, border: '1px solid', borderColor: qbRange === v ? '#0A1F44' : '#E8E4DC', borderRadius: 6, background: qbRange === v ? '#0A1F44' : '#fff', color: qbRange === v ? '#C9A84C' : '#6B7280', cursor: 'pointer' }}>{lb}</button>
                ))}
              </div>
            </div>
            {qbRange === 'custom' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                {[['From', qbDateFrom, setQbDateFrom], ['To', qbDateTo, setQbDateTo]].map(([lb, val, set]) => (
                  <div key={lb}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>{lb}</label>
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

      {showComposeDraw && job.cost_plus && (
        <ComposeDrawScr
          job={job}
          onClose={() => setShowComposeDraw(false)}
          onComposed={() => { setShowComposeDraw(false); setSub('draws'); loadLedger(); }}
        />
      )}
    </div>
  );
}
