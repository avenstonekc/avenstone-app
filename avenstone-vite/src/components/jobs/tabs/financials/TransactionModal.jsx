import { useState, useEffect } from 'react';
import { sbCreateTransaction, sbUpdateTransaction, sbVoidTransaction, sbUploadReceipt, sbUploadLienWaiverTx, sbLoadPhases } from '../../../../lib/supabase';
import { f$ } from '../../../../lib/utils';

const TX_TYPES_IN  = ['client_payment','client_deposit','client_refund','other_income'];
const TX_TYPES_OUT = ['sub_payout','vendor_payment','material_purchase','equipment_rental','permit','fuel','commission','other_expense'];
const TYPE_LABELS  = {
  client_payment: 'Client Payment', client_deposit: 'Deposit', client_refund: 'Refund',
  sub_payout: 'Sub Payout', vendor_payment: 'Vendor Payment', material_purchase: 'Materials',
  equipment_rental: 'Equipment Rental', permit: 'Permit', fuel: 'Fuel', commission: 'Commission',
  other_expense: 'Other Expense', other_income: 'Other Income',
};
const ALL_STATUSES    = ['draft','pending','paid','overdue','void','refunded'];
const SIMPLE_STATUSES = ['paid','pending','draft'];  // handled by toggle
const TODAY = new Date().toISOString().slice(0, 10);

export default function TransactionModal({ mode: initialMode, tx, job, onClose, onSaved }) {
  const isNew = !tx.id;

  // quickStatus: one of 'paid'|'pending'|'draft' when toggle is active, null when status is complex
  const initQS = isNew ? 'paid' : (SIMPLE_STATUSES.includes(tx.status) ? tx.status : null);

  const [mode, setMode] = useState(initialMode);
  const [quickStatus, setQuickStatus] = useState(initQS);
  const [form, setForm] = useState({
    direction:          tx.direction          || (isNew ? 'out'               : 'in'),
    type:               tx.type               || (isNew ? 'material_purchase' : 'client_payment'),
    amount:             tx.amount != null      ? String(tx.amount)             : '',
    description:        tx.description         || '',
    date_incurred:      tx.date_incurred       || TODAY,
    due_date:           tx.due_date            || '',
    status:             isNew ? 'paid'         : (tx.status || 'pending'),
    payer_or_payee_name: tx.payer_or_payee_name || '',
    phase:              tx.phase               || '',
    phase_id:           tx.phase_id            || null,
    notes:              tx.notes               || '',
  });
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState(null);
  const [uploading, setUploading] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState(tx.receipt_url     || null);
  const [lienUrl,    setLienUrl]    = useState(tx.lien_waiver_url  || null);
  const [phases,     setPhases]     = useState([]);

  useEffect(() => {
    sbLoadPhases(job.id).then(data => setPhases(data || []));
  }, [job.id]);

  const isView   = mode === 'view';
  const set      = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const useToggle = !isView && (isNew || quickStatus !== null);

  const handleQS = qs => {
    setQuickStatus(qs);
    set('status', qs);
  };

  const setDir = dir => {
    const valid      = dir === 'in' ? TX_TYPES_IN : TX_TYPES_OUT;
    const defaultType = dir === 'in' ? 'client_payment' : 'material_purchase';
    setForm(p => ({ ...p, direction: dir, type: valid.includes(p.type) ? p.type : defaultType }));
  };

  const save = async () => {
    if (!form.amount || !form.type) { setErr('Amount and type are required.'); return; }
    setSaving(true); setErr(null);
    const payload = {
      job_id:              job.id,
      direction:           form.direction,
      type:                form.type,
      amount:              Number(form.amount),
      description:         form.description         || null,
      date_incurred:       form.date_incurred,
      date_paid:           form.status === 'paid'    ? TODAY : null,
      due_date:            form.due_date             || null,
      status:              form.status,
      payer_or_payee_name: form.payer_or_payee_name  || null,
      phase:               form.phase                || null,
      phase_id:            form.phase_id             || null,
      notes:               form.notes                || null,
    };
    const result = isNew
      ? await sbCreateTransaction(payload)
      : await sbUpdateTransaction(tx.id, payload);
    if (result.error) { setErr(result.error.message || 'Save failed'); setSaving(false); return; }
    onSaved();
  };

  const voidTx = async () => {
    if (!confirm('Void this transaction? This cannot be undone.')) return;
    await sbVoidTransaction(tx.id);
    onSaved();
  };

  const uploadReceipt = async file => {
    setUploading(true);
    const res = await sbUploadReceipt(file, job.id);
    if (!res.error && res.path) {
      if (!isNew && tx.id) await sbUpdateTransaction(tx.id, { receipt_url: res.path });
      setReceiptUrl(res.path);
    }
    setUploading(false);
  };

  const uploadLien = async file => {
    setUploading(true);
    const res = await sbUploadLienWaiverTx(file, job.id);
    if (!res.error && res.path) {
      if (!isNew && tx.id) await sbUpdateTransaction(tx.id, { lien_waiver_url: res.path, lien_waiver_signed_date: TODAY });
      setLienUrl(res.path);
    }
    setUploading(false);
  };

  const types      = form.direction === 'in' ? TX_TYPES_IN : TX_TYPES_OUT;
  const lienMissing = tx.lien_waiver_required && !lienUrl;
  const inp = { border: '1px solid #E8E4DC', padding: '8px 10px', fontSize: 13, borderRadius: 6, width: '100%', fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' };
  const lbl = { fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, display: 'block' };
  const fg  = { marginBottom: 14 };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div className="modal-title" style={{ margin: 0 }}>
            {isView ? (TYPE_LABELS[tx.type] || tx.type) : isNew ? 'New Transaction' : 'Edit Transaction'}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isView && <button onClick={() => setMode('edit')} style={{ fontSize: 12, color: '#C9A84C', border: '1px solid #E8E4DC', borderRadius: 6, padding: '4px 10px', background: '#fff', cursor: 'pointer' }}>Edit</button>}
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#9CA3AF', cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
        </div>

        {lienMissing && (
          <div style={{ background: '#FEE2E2', border: '1px solid #fca5a5', borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#991b1b', fontWeight: 600 }}>
            ⚠ Lien waiver required for this transaction
          </div>
        )}

        {/* ── VIEW MODE ── */}
        {isView ? (
          <div>
            {[
              ['Direction',    tx.direction === 'in' ? '↑ Income' : '↓ Expense'],
              ['Type',         TYPE_LABELS[tx.type] || tx.type],
              ['Amount',       f$(tx.amount)],
              ['Status',       tx.status],
              ['Date',         tx.date_incurred],
              ['Phase',        tx.phase || '—'],
              ['Due Date',     tx.due_date || '—'],
              ['Payee / Payer', tx.payer_or_payee_name || '—'],
              ['Description',  tx.description || '—'],
              ['Notes',        tx.notes || '—'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F3F0EB', fontSize: 13 }}>
                <span style={{ color: '#9CA3AF', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>{k}</span>
                <span style={{ color: '#0A1F44', fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>{v}</span>
              </div>
            ))}
            {receiptUrl && <div style={{ marginTop: 12, fontSize: 12, color: '#3B82F6' }}>📎 Receipt attached</div>}
            {lienUrl    && <div style={{ marginTop:  6, fontSize: 12, color: '#3B82F6' }}>📎 Lien waiver attached</div>}
            {tx.status !== 'void' && (
              <button onClick={voidTx} style={{ marginTop: 20, width: '100%', padding: 10, background: '#FEE2E2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>Void Transaction</button>
            )}
          </div>

        ) : (
          /* ── CREATE / EDIT MODE ── */
          <div>

            {/* Quick-status segmented toggle (paid/pending/draft) */}
            {useToggle && (
              <div style={{ display: 'flex', gap: 0, marginBottom: 16, background: '#F7F5F0', borderRadius: 8, padding: 3 }}>
                {SIMPLE_STATUSES.map(s => (
                  <button key={s} onClick={() => handleQS(s)} style={{
                    flex: 1, padding: '9px 0', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
                    borderRadius: 6, transition: 'all 0.15s',
                    background: quickStatus === s ? '#0A1F44' : 'transparent',
                    color:      quickStatus === s ? '#C9A84C' : '#6B7280',
                  }}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            )}

            {/* Full status dropdown — only when editing a complex status (void/overdue/refunded) */}
            {!useToggle && !isNew && (
              <div style={fg}>
                <label style={lbl}>Status</label>
                <select style={inp} value={form.status} onChange={e => set('status', e.target.value)}>
                  {ALL_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                </select>
              </div>
            )}

            {/* Direction + Type */}
            <div style={{ ...fg, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lbl}>Direction</label>
                <select style={inp} value={form.direction} onChange={e => setDir(e.target.value)}>
                  <option value="in">↑ Income</option>
                  <option value="out">↓ Expense</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Type</label>
                <select style={inp} value={form.type} onChange={e => set('type', e.target.value)}>
                  {types.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
              </div>
            </div>

            {/* Amount + Date */}
            <div style={{ ...fg, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={lbl}>Amount</label>
                <input style={inp} type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Date</label>
                <input style={inp} type="date" value={form.date_incurred} onChange={e => set('date_incurred', e.target.value)} />
              </div>
            </div>

            {/* Due Date — only when pending */}
            {form.status === 'pending' && (
              <div style={fg}>
                <label style={lbl}>Due Date</label>
                <input style={inp} type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
              </div>
            )}

            {/* Payee / Payer */}
            <div style={fg}>
              <label style={lbl}>Payee / Payer Name</label>
              <input style={inp} placeholder="Company or person name" value={form.payer_or_payee_name} onChange={e => set('payer_or_payee_name', e.target.value)} />
            </div>

            {/* Phase */}
            <div style={fg}>
              <label style={lbl}>Phase</label>
              <select style={inp} value={form.phase_id || ''} onChange={e => {
                const selected = phases.find(p => p.id === e.target.value);
                setForm(f => ({ ...f, phase_id: selected?.id || null, phase: selected?.name || '' }));
              }}>
                <option value="">— No phase —</option>
                {phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {/* Description */}
            <div style={fg}>
              <label style={lbl}>Description</label>
              <input style={inp} placeholder="Brief description" value={form.description} onChange={e => set('description', e.target.value)} />
            </div>

            {/* Notes */}
            <div style={fg}>
              <label style={lbl}>Notes</label>
              <textarea style={{ ...inp, minHeight: 56, resize: 'vertical' }} placeholder="Internal notes" value={form.notes} onChange={e => set('notes', e.target.value)} />
            </div>

            {/* File uploads */}
            <div style={{ ...fg, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ border: '1px solid #E8E4DC', borderRadius: 6, padding: '10px 12px', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 6 }}>Receipt</div>
                {receiptUrl
                  ? <span style={{ fontSize: 12, color: '#22c55e' }}>✓ Attached</span>
                  : <label style={{ fontSize: 12, color: '#C9A84C', cursor: uploading ? 'not-allowed' : 'pointer' }}>
                      Upload<input type="file" style={{ display: 'none' }} accept=".pdf,.jpg,.jpeg,.png" onChange={e => e.target.files[0] && uploadReceipt(e.target.files[0])} disabled={uploading} />
                    </label>}
              </div>
              <div style={{ border: `1px solid ${lienMissing ? '#fca5a5' : '#E8E4DC'}`, borderRadius: 6, padding: '10px 12px', textAlign: 'center', background: lienMissing ? '#FEF2F2' : '#fff' }}>
                <div style={{ fontSize: 11, color: lienMissing ? '#991b1b' : '#9CA3AF', marginBottom: 6 }}>Lien Waiver{lienMissing ? ' ⚠' : ''}</div>
                {lienUrl
                  ? <span style={{ fontSize: 12, color: '#22c55e' }}>✓ Attached</span>
                  : <label style={{ fontSize: 12, color: lienMissing ? '#ef4444' : '#C9A84C', cursor: uploading ? 'not-allowed' : 'pointer', fontWeight: lienMissing ? 700 : 400 }}>
                      Upload<input type="file" style={{ display: 'none' }} accept=".pdf,.jpg,.jpeg,.png" onChange={e => e.target.files[0] && uploadLien(e.target.files[0])} disabled={uploading} />
                    </label>}
              </div>
            </div>

            {err && <div style={{ background: '#FEE2E2', color: '#991b1b', padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 12 }}>{err}</div>}

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Cancel</button>
              <button onClick={save} disabled={saving} className="btn btn-navy" style={{ flex: 2 }}>{saving ? 'Saving...' : isNew ? 'Add Transaction' : 'Save Changes'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
