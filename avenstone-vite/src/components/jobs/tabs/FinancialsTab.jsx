import { useState, useEffect } from 'react';
import EstimateTab from './EstimateTab';
import COTab from './COTab';
import CostsTab from './CostsTab';
import TransactionModal from './financials/TransactionModal';
import LineItemModal from './financials/LineItemModal';
import { sbLoadJobTransactions, sbLoadJobFinancialSummary, sbLoadEstimateLineItems } from '../../../lib/supabase';
import { f$ } from '../../../lib/utils';

const SUB_TABS = [
  { id: 'ledger',   lb: 'Ledger' },
  { id: 'estimate', lb: 'Estimate' },
  { id: 'budget',   lb: 'Budget' },
  { id: 'co',       lb: 'Change Orders' },
  { id: 'costs',    lb: 'Costs' },
];

const TYPE_LABELS = {
  client_payment: 'Client Payment', client_deposit: 'Deposit', client_refund: 'Refund',
  sub_payout: 'Sub Payout', vendor_payment: 'Vendor Payment', material_purchase: 'Materials',
  equipment_rental: 'Equipment Rental', permit: 'Permit', fuel: 'Fuel', commission: 'Commission',
  other_expense: 'Other Expense', other_income: 'Other Income',
};

const STATUS_COLOR = { paid: '#22c55e', pending: '#f59e0b', overdue: '#ef4444', void: '#9CA3AF', draft: '#9CA3AF', refunded: '#8b5cf6' };

export default function FinancialsTab({ job, upd, profile, docs, setDocs }) {
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

  useEffect(() => {
    if (sub === 'ledger') loadLedger();
    if (sub === 'budget') loadBudget();
  }, [sub, job.id]);

  const loadLedger = async () => {
    setLoading(true);
    const [data, sum] = await Promise.all([
      sbLoadJobTransactions(job.id),
      sbLoadJobFinancialSummary(job.id, { contractValue: job.contract_value, coTotal: job.co_total }),
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
        .filter(t => li.phase && t.phase === li.phase)
        .reduce((s, t) => s + Number(t.amount || 0), 0);
      return { ...li, actual };
    });
    setLineItems(withActuals);
    setBudgetLoading(false);
  };

  const lienCount = txs.filter(t => t.lien_waiver_required && !t.lien_waiver_url).length;

  const filtered = txs.filter(tx => {
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
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid #E8E4DC' }}>
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSub(t.id)} style={{
            padding: '8px 14px', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: 'none', borderBottom: `2px solid ${sub === t.id ? '#C9A84C' : 'transparent'}`,
            marginBottom: -2, color: sub === t.id ? '#0A1F44' : '#9CA3AF', transition: 'color 0.15s',
          }}>
            {t.lb}{t.id === 'ledger' && lienCount > 0 ? ` ⚠ ${lienCount}` : ''}
          </button>
        ))}
      </div>

      {sub === 'estimate' && <EstimateTab job={job} photos={job.photos || []} docs={docs} setDocs={setDocs} />}
      {sub === 'co' && <COTab job={job} upd={upd} profile={profile} />}
      {sub === 'costs' && <CostsTab job={job} />}

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
                <div style={{ display: 'none' }} className="budget-desktop">
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
                </div>
                {/* Mobile cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                </div>
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
          onSaved={() => { setLiModal(null); loadBudget(); }}
        />
      )}

      {sub === 'ledger' && (
        <div>
          {/* Stat bar — 5 stats, wraps to 3+2 on mobile */}
          {summary && (() => {
            const owes = summary.client_owes;
            const stats = [
              { lb: 'Contract',    v: f$(summary.contract_total),                                    c: '#0A1F44',  bold: true },
              { lb: 'Received',    v: f$(summary.total_in),                                          c: summary.total_in > 0 ? '#22c55e' : '#9CA3AF' },
              { lb: 'Client Owes', v: owes < 0 ? `Overpaid ${f$(Math.abs(owes))}` : f$(owes),       c: owes < 0 ? '#22c55e' : owes > 0 ? '#C9A84C' : '#9CA3AF' },
              { lb: 'Paid Out',    v: f$(summary.total_out),                                         c: summary.total_out > 0 ? '#ef4444' : '#9CA3AF' },
              { lb: 'Outstanding', v: f$(summary.outstanding),                                       c: summary.outstanding > 0 ? '#C9A84C' : '#9CA3AF' },
            ];
            return (
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                {stats.map(({ lb, v, c, bold }) => (
                  <div key={lb} style={{ flex: 1, minWidth: 90, background: '#fff', border: '1px solid #E8E4DC', padding: '10px 14px', borderRadius: 6 }}>
                    <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{lb}</div>
                    <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 16, color: c, fontWeight: bold ? 700 : 400 }}>{v}</div>
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
            <button onClick={() => setModal({ mode: 'create', tx: {} })} style={{ marginLeft: 'auto', fontSize: 12, padding: '6px 14px', background: '#0A1F44', color: '#C9A84C', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>+ Add</button>
          </div>

          {/* Transaction list */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF' }}>Loading...</div>
          ) : !filtered.length ? (
            <div style={{ textAlign: 'center', padding: 32, color: '#9CA3AF', fontSize: 13 }}>
              {filterDir !== 'all' || filterStatus !== 'all' ? 'No transactions match this filter' : 'No transactions yet — tap + Add to record one'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filtered.map(tx => {
                const isIn = tx.direction === 'in';
                const lienMissing = tx.lien_waiver_required && !tx.lien_waiver_url;
                return (
                  <div key={tx.id} onClick={() => setModal({ mode: 'view', tx })} style={{ background: '#fff', border: `1px solid ${lienMissing ? '#fca5a5' : '#E8E4DC'}`, borderRadius: 8, padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: isIn ? '#D1FAE5' : '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{isIn ? '↑' : '↓'}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0A1F44', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {TYPE_LABELS[tx.type] || tx.type}
                        {lienMissing && <span style={{ fontSize: 10, background: '#FEE2E2', color: '#991b1b', padding: '1px 6px', borderRadius: 4, fontWeight: 700 }}>Lien Missing</span>}
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
          )}
        </div>
      )}

      {modal && (
        <TransactionModal
          mode={modal.mode}
          tx={modal.tx}
          job={job}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); loadLedger(); }}
        />
      )}
    </div>
  );
}
