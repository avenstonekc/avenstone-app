import { useState, useEffect } from 'react';
import { sbCreateMaterialOrder, AV_TENANT } from '../../lib/supabase';

const EMPTY_MAT = { description: '', quantity: '', unit: '', unit_price: '' };

export default function AddQuoteModal({ isOpen, onClose, onSuccess, jobId, initialTrade, tradeOptions }) {
  const [trade, setTrade] = useState('');
  const [customTrade, setCustomTrade] = useState('');
  const [supplier, setSupplier] = useState('');
  const [quoteTotal, setQuoteTotal] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [materials, setMaterials] = useState([{ ...EMPTY_MAT }]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setTrade(initialTrade || '');
      setCustomTrade('');
      setSupplier('');
      setQuoteTotal('');
      setDeliveryDate('');
      setMaterials([{ ...EMPTY_MAT }]);
      setNotes('');
      setError(null);
      setSaving(false);
    }
  }, [isOpen, initialTrade]);

  const resetForm = () => {
    setTrade('');
    setCustomTrade('');
    setSupplier('');
    setQuoteTotal('');
    setDeliveryDate('');
    setMaterials([{ ...EMPTY_MAT }]);
    setNotes('');
    setError(null);
    setSaving(false);
  };

  if (!isOpen) return null;

  const activeTrade = trade === '__custom__' ? customTrade.trim() : trade;
  const hasMats = materials.some(m => m.description.trim());

  const updateMat = (i, field, val) =>
    setMaterials(ms => ms.map((m, idx) => idx === i ? { ...m, [field]: val } : m));

  const addMat = () => setMaterials(ms => [...ms, { ...EMPTY_MAT }]);
  const removeMat = (i) => setMaterials(ms => ms.filter((_, idx) => idx !== i));

  const handleSubmit = async e => {
    e.preventDefault();
    if (!activeTrade) { setError('Trade is required'); return; }
    setSaving(true);
    setError(null);

    const mats = hasMats
      ? materials
          .filter(m => m.description.trim())
          .map(m => ({
            description: m.description.trim(),
            quantity: m.quantity !== '' ? Number(m.quantity) : null,
            unit: m.unit.trim() || null,
            unit_price: m.unit_price !== '' ? Number(m.unit_price) : null,
          }))
      : [];

    const order = {
      tenant_id: AV_TENANT,
      trade: activeTrade,
      supplier_name: supplier.trim() || null,
      quote_total: quoteTotal !== '' ? Number(quoteTotal) : null,
      quoted_delivery_date: deliveryDate || null,
      materials: mats,
      notes: notes.trim() || null,
    };

    const res = await sbCreateMaterialOrder(jobId, order);
    setSaving(false);
    if (res.ok) {
      resetForm();
      onSuccess();
    } else {
      setError(res.error || 'Save failed');
    }
  };

  const inp = { className: 'finp' };

  return (
    <div className="overlay" onClick={() => { resetForm(); onClose(); }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520, width: '100%' }}>
        <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: '#f9fafb', marginBottom: 16 }}>
          Add Material Order
        </div>

        {error && (
          <div style={{ background: '#450a0a', color: 'var(--red-text)', padding: '8px 12px', borderRadius: 6, fontSize: 12, marginBottom: 12 }}>{error}</div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Trade */}
          <div className="fg">
            <label className="flbl">Trade *</label>
            {tradeOptions.length > 0 ? (
              <>
                <select {...inp} value={trade} onChange={e => setTrade(e.target.value)} required={trade !== '__custom__'}>
                  <option value="">Select trade…</option>
                  {tradeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                  <option value="__custom__">Other (type below)</option>
                </select>
                {trade === '__custom__' && (
                  <input
                    {...inp}
                    style={{ marginTop: 6 }}
                    type="text"
                    value={customTrade}
                    onChange={e => setCustomTrade(e.target.value)}
                    placeholder="Trade name"
                    required
                  />
                )}
              </>
            ) : (
              <input {...inp} type="text" value={trade} onChange={e => setTrade(e.target.value)} placeholder="e.g. Framing, Tile" required />
            )}
          </div>

          {/* Supplier */}
          <div className="fg">
            <label className="flbl">Supplier</label>
            <input {...inp} type="text" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="e.g. Home Depot, local lumber yard" />
          </div>

          {/* Quote total + Delivery date */}
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="fg" style={{ flex: 1 }}>
              <label className="flbl">Quote Total ($)</label>
              <input {...inp} type="number" min="0" step="any" value={quoteTotal} onChange={e => setQuoteTotal(e.target.value)} placeholder="0.00" />
            </div>
            <div className="fg" style={{ flex: 1 }}>
              <label className="flbl">Quoted Delivery</label>
              <input {...inp} type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
            </div>
          </div>

          {/* Materials line items */}
          <div className="fg">
            <label className="flbl">Materials (optional)</label>
            {materials.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 6 }}>
                <input
                  className="finp"
                  style={{ flex: 3 }}
                  type="text"
                  value={m.description}
                  onChange={e => updateMat(i, 'description', e.target.value)}
                  placeholder="Description"
                />
                <input
                  className="finp"
                  style={{ flex: 1, minWidth: 52 }}
                  type="number"
                  min="0"
                  step="any"
                  value={m.quantity}
                  onChange={e => updateMat(i, 'quantity', e.target.value)}
                  placeholder="Qty"
                />
                <input
                  className="finp"
                  style={{ flex: 1, minWidth: 48 }}
                  type="text"
                  value={m.unit}
                  onChange={e => updateMat(i, 'unit', e.target.value)}
                  placeholder="Unit"
                />
                <input
                  className="finp"
                  style={{ flex: 1, minWidth: 64 }}
                  type="number"
                  min="0"
                  step="any"
                  value={m.unit_price}
                  onChange={e => updateMat(i, 'unit_price', e.target.value)}
                  placeholder="$/unit"
                />
                {materials.length > 1 && (
                  <button type="button" onClick={() => removeMat(i)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 16, padding: '8px 4px', lineHeight: 1 }}>×</button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addMat}
              style={{ fontSize: 11, padding: '3px 10px', borderRadius: 5, border: '1px solid #374151', background: 'transparent', color: '#9ca3af', cursor: 'pointer' }}
            >
              + Add line
            </button>
          </div>

          {/* Notes */}
          <div className="fg">
            <label className="flbl">Notes</label>
            <textarea
              className="finp"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Lead time, specs, PO notes…"
              style={{ resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="btn btn-ghost" onClick={() => { resetForm(); onClose(); }} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-navy" disabled={saving || !activeTrade}>
              {saving ? 'Saving…' : 'Add Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
