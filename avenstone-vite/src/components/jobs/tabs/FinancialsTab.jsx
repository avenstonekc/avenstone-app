import { useState, useEffect } from 'react';
import EstimateTab from './EstimateTab';
import COTab from './COTab';
import CostsTab from './CostsTab';
import TransactionModal from './financials/TransactionModal';
import { sbLoadJobTransactions, sbLoadJobFinancialSummary } from '../../../lib/supabase';
import { f$ } from '../../../lib/utils';

const SUB_TABS = [
  { id: 'ledger', lb: 'Ledger' },
  { id: 'estimate', lb: 'Estimate' },
  { id: 'co', lb: 'Change Orders' },
  { id: 'costs', lb: 'Costs' },
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

  useEffect(() => {
    if (sub === 'ledger') loadLedger();
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
