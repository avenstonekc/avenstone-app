import { useState } from 'react';

const NAV    = 'var(--navy-900)';
const GOLD   = 'var(--gold-500)';
const BORDER = 'var(--border)';
const CREAM  = 'var(--bg)';

const UNITS = ['each', 'sf', 'lf', 'ls', 'set', 'bag', 'sheet', 'bottle'];

export default function AddCustomLineModal({ roomId, existingTrades, onAdd, onClose }) {
  const [type,        setType]        = useState('labor');
  const [trade,       setTrade]       = useState(existingTrades[0] ?? '');
  const [customTrade, setCustomTrade] = useState('');
  const [description, setDescription] = useState('');
  const [quantity,    setQuantity]    = useState('');
  const [unit,        setUnit]        = useState('each');
  const [unitCost,    setUnitCost]    = useState('');
  const [notes,       setNotes]       = useState('');
  const [errors,      setErrors]      = useState({});

  const tradeOptions = [...existingTrades, 'Other'];
  const effectiveTrade = trade === 'Other' ? customTrade.trim() : trade;

  const validate = () => {
    const e = {};
    if (!description.trim())               e.description = 'Required';
    if (!quantity || Number(quantity) <= 0) e.quantity    = 'Must be > 0';
    if (unitCost === '' || Number(unitCost) < 0) e.unitCost = 'Must be ≥ 0';
    if (trade === 'Other' && !customTrade.trim()) e.customTrade = 'Required';
    return e;
  };

  const handleAdd = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }

    const qty  = Number(quantity);
    const rate = Number(unitCost);
    onAdd({
      lineKey:         `custom__${roomId}__${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      roomId,
      trade:           effectiveTrade,
      materialName:    type === 'materials' ? description.trim() : null,
      category:        type,
      description:     description.trim(),
      templateNotes:   description.trim(),
      optional:        false,
      conditional:     null,
      unit,
      unitCostId:      null,
      unitCostSource:  null,
      baseRate:        rate,
      baseRateMissing: false,
      multiplier:      1,
      wastePct:        0,
      quantity:        qty,
      quantityPreFilled: true,
      quantityNotes:   'custom',
      lineCost:        Math.round(rate * qty * 100) / 100,
      lineCostStatus:  'ok',
      notes:           notes.trim() ? `custom: ${notes.trim()}` : 'custom',
      isCustom:        true,
    });
  };

  const field = (label, err, children) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>{label}</label>
      {children}
      {err && <div style={{ fontSize: 11, color: '#DC2626', marginTop: 3 }}>{err}</div>}
    </div>
  );

  const inp = (style = {}) => ({
    fontSize: 13, border: `1px solid ${BORDER}`, borderRadius: 6,
    padding: '7px 10px', width: '100%', color: NAV, background: '#fff',
    boxSizing: 'border-box', ...style,
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 520, padding: '20px 20px 32px', maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: NAV }}>Add Custom Line</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9CA3AF', lineHeight: 1 }}>✕</button>
        </div>

        {/* Type toggle */}
        {field('Type', null,
          <div style={{ display: 'flex', gap: 0, border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'hidden' }}>
            {['labor', 'materials'].map(t => (
              <button key={t} onClick={() => setType(t)} style={{ flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: type === t ? NAV : '#fff', color: type === t ? '#fff' : '#374151', textTransform: 'capitalize', transition: 'all 0.15s' }}>
                {t === 'labor' ? 'Labor' : 'Material'}
              </button>
            ))}
          </div>
        )}

        {/* Trade */}
        {field('Trade', errors.customTrade,
          <>
            <select value={trade} onChange={e => setTrade(e.target.value)} style={inp()}>
              {tradeOptions.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {trade === 'Other' && (
              <input
                value={customTrade}
                onChange={e => setCustomTrade(e.target.value)}
                placeholder="Enter trade name"
                style={{ ...inp(), marginTop: 6, borderColor: errors.customTrade ? '#EF4444' : BORDER }}
              />
            )}
          </>
        )}

        {/* Description */}
        {field('Description', errors.description,
          <input
            value={description}
            onChange={e => { setDescription(e.target.value); setErrors(p => ({ ...p, description: null })); }}
            placeholder={type === 'materials' ? 'e.g. Heated towel bar' : 'e.g. Asbestos abatement'}
            style={inp({ borderColor: errors.description ? '#EF4444' : BORDER })}
          />
        )}

        {/* Qty + Unit row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Quantity</label>
            <input
              type="number" min="0" step="any"
              value={quantity}
              onChange={e => { setQuantity(e.target.value); setErrors(p => ({ ...p, quantity: null })); }}
              placeholder="0"
              style={inp({ borderColor: errors.quantity ? '#EF4444' : BORDER })}
            />
            {errors.quantity && <div style={{ fontSize: 11, color: '#DC2626', marginTop: 3 }}>{errors.quantity}</div>}
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>Unit</label>
            <select value={unit} onChange={e => setUnit(e.target.value)} style={inp()}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>

        {/* Unit cost */}
        {field('Unit cost ($)', errors.unitCost,
          <input
            type="number" min="0" step="any"
            value={unitCost}
            onChange={e => { setUnitCost(e.target.value); setErrors(p => ({ ...p, unitCost: null })); }}
            placeholder="0.00"
            style={inp({ borderColor: errors.unitCost ? '#EF4444' : BORDER })}
          />
        )}

        {/* Notes */}
        {field('Notes (optional)', null,
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any context for this line item"
            rows={2}
            style={{ ...inp(), resize: 'vertical', fontFamily: 'inherit' }}
          />
        )}

        {/* Line cost preview */}
        {quantity && unitCost !== '' && Number(quantity) > 0 && Number(unitCost) >= 0 && (
          <div style={{ background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '8px 12px', marginBottom: 16, fontSize: 13, color: NAV }}>
            Line total: <strong>${(Number(quantity) * Number(unitCost)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px 0', borderRadius: 6, border: `1px solid ${BORDER}`, background: '#fff', color: '#374151', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleAdd} style={{ flex: 2, padding: '10px 0', borderRadius: 6, border: 'none', background: NAV, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            Add Line
          </button>
        </div>
      </div>
    </div>
  );
}
