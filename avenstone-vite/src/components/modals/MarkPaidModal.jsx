import { useState } from 'react';
import { sbMarkInvoicePaid } from '../../lib/supabase';
import { f$ } from '../../lib/utils';

const today = () => new Date().toISOString().slice(0, 10);

export default function MarkPaidModal({ invoice, onClose, onSaved }) {
  const outstanding = Number(invoice.total_amount) - Number(invoice.amount_paid);

  const [amount, setAmount]               = useState(outstanding.toFixed(2));
  const [paymentMethod, setPaymentMethod] = useState('check');
  const [datePaid, setDatePaid]           = useState(today());
  const [reference, setReference]         = useState('');
  const [notes, setNotes]                 = useState('');
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState(null);

  const amountNum = Number(amount);
  const isValid   = amountNum > 0 && amountNum <= outstanding + 0.01 && paymentMethod && datePaid;

  const handleSave = async () => {
    setError(null);
    if (!isValid) return;
    setSaving(true);
    try {
      await sbMarkInvoicePaid(invoice.id, {
        amount:         amountNum,
        payment_method: paymentMethod,
        date_paid:      datePaid,
        reference:      reference.trim() || undefined,
        notes:          notes.trim() || undefined,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message || 'Mark paid failed.');
      setSaving(false);
    }
  };

  const inp = { border: '1px solid #E8E4DC', padding: '8px 10px', fontSize: 13, borderRadius: 6, width: '100%', fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' };
  const lbl = { fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, display: 'block' };
  const fg  = { marginBottom: 14 };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440, width: '100%' }} onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div className="modal-title" style={{ margin: 0 }}>Mark Paid — {invoice.invoice_number}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#9CA3AF', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 20 }}>
          Outstanding balance: <strong style={{ color: '#0A1F44' }}>{f$(outstanding)}</strong>
        </div>

        <div style={fg}>
          <label style={lbl}>Amount</label>
          <input
            style={inp}
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={e => setAmount(e.target.value)}
          />
        </div>

        <div style={fg}>
          <label style={lbl}>Payment method</label>
          <select style={{ ...inp, appearance: 'none' }} value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
            <option value="check">Check</option>
            <option value="cash">Cash</option>
            <option value="wire">Wire transfer</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div style={fg}>
          <label style={lbl}>Date received</label>
          <input style={inp} type="date" value={datePaid} onChange={e => setDatePaid(e.target.value)} />
        </div>

        <div style={fg}>
          <label style={lbl}>Reference / check number (optional)</label>
          <input style={inp} placeholder="Check #1234" value={reference} onChange={e => setReference(e.target.value)} />
        </div>

        <div style={fg}>
          <label style={lbl}>Notes (optional)</label>
          <textarea style={{ ...inp, minHeight: 56, resize: 'vertical' }} rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        {error && (
          <div style={{ background: '#FEE2E2', color: '#991b1b', padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !isValid}
            className="btn btn-navy"
            style={{ flex: 2 }}
          >
            {saving ? 'Saving...' : 'Mark Paid'}
          </button>
        </div>
      </div>
    </div>
  );
}
