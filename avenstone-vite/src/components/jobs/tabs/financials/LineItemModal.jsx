import { useState } from 'react';
import { sbSaveEstimateLineItems, sbLoadEstimateLineItems, AV_USER_ID, AV_TENANT } from '../../../../lib/supabase';
import { f$ } from '../../../../lib/utils';

const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' };
const inp = { width: '100%', padding: '8px 10px', border: '1px solid #E8E4DC', borderRadius: 6, fontSize: 14, fontFamily: 'DM Sans, sans-serif', color: '#0A1F44', background: '#fff', boxSizing: 'border-box' };
const fg = { marginBottom: 16 };

export default function LineItemModal({ mode: initialMode, item = {}, job, onClose, onSaved }) {
  const [phase, setPhase] = useState(item.phase ?? '');
  const [trade, setTrade] = useState(item.trade ?? '');
  const [category, setCategory] = useState(item.category ?? 'labor');
  const [description, setDescription] = useState(item.description ?? '');
  const [quantity, setQuantity] = useState(item.quantity ?? 1);
  const [unit, setUnit] = useState(item.unit ?? '');
  const [unitCost, setUnitCost] = useState(item.unit_cost ?? 0);
  const [markupPct, setMarkupPct] = useState(item.markup_pct ?? 0);
  const [notes, setNotes] = useState(item.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const subtotal = parseFloat(quantity || 0) * parseFloat(unitCost || 0) * (1 + parseFloat(markupPct || 0) / 100);

  async function handleSave() {
    if (!description.trim()) { setError('Description is required.'); return; }
    setError('');
    setSaving(true);
    try {
      const existing = await sbLoadEstimateLineItems(job.id);
      const newItem = {
        id: item.id ?? crypto.randomUUID(),
        phase: phase.trim(),
        trade: trade.trim(),
        category,
        description: description.trim(),
        quantity: parseFloat(quantity) || 0,
        unit: unit.trim(),
        unit_cost: parseFloat(unitCost) || 0,
        markup_pct: parseFloat(markupPct) || 0,
        display_order: item.display_order ?? (existing.length + 1),
        notes: notes.trim(),
      };
      let updated;
      if (initialMode === 'edit') {
        updated = existing.map(i => i.id === item.id ? newItem : i);
      } else {
        updated = [...existing, newItem];
      }
      await sbSaveEstimateLineItems(job.id, null, updated);
      onSaved();
    } catch (e) {
      setError(e.message || 'Failed to save line item.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this line item?')) return;
    setSaving(true);
    setError('');
    try {
      const existing = await sbLoadEstimateLineItems(job.id);
      const filtered = existing.filter(i => i.id !== item.id);
      await sbSaveEstimateLineItems(job.id, null, filtered);
      onSaved();
    } catch (e) {
      setError(e.message || 'Failed to delete line item.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 460, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <h2 className="modal-title" style={{ fontFamily: 'DM Serif Display, serif', color: '#0A1F44', marginBottom: 20 }}>
          {initialMode === 'edit' ? 'Edit Line Item' : 'New Line Item'}
        </h2>

        {error && (
          <div style={{ background: '#FEE2E2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 6, padding: '10px 14px', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ ...fg, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Phase</label>
            <input style={inp} placeholder="e.g. Rough, Finish, Demo" value={phase} onChange={e => setPhase(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Trade</label>
            <input style={inp} placeholder="e.g. Electrical, Plumbing" value={trade} onChange={e => setTrade(e.target.value)} />
          </div>
        </div>

        <div style={fg}>
          <label style={lbl}>Category</label>
          <select style={inp} value={category} onChange={e => setCategory(e.target.value)}>
            <option value="labor">Labor</option>
            <option value="materials">Materials</option>
            <option value="equipment">Equipment</option>
            <option value="sub">Sub</option>
            <option value="permit">Permit</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div style={fg}>
          <label style={lbl}>Description *</label>
          <input style={inp} value={description} onChange={e => setDescription(e.target.value)} />
        </div>

        <div style={{ ...fg, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Quantity</label>
            <input style={inp} type="number" min={0} step={0.01} value={quantity} onChange={e => setQuantity(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Unit</label>
            <input style={inp} placeholder="ea, sqft, lf, hr" value={unit} onChange={e => setUnit(e.target.value)} />
          </div>
        </div>

        <div style={{ ...fg, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={lbl}>Unit Cost ($)</label>
            <input style={inp} type="number" min={0} step={0.01} value={unitCost} onChange={e => setUnitCost(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Markup %</label>
            <input style={inp} type="number" min={0} step={0.1} value={markupPct} onChange={e => setMarkupPct(e.target.value)} />
          </div>
        </div>

        <div style={fg}>
          <label style={lbl}>Notes</label>
          <textarea style={{ ...inp, resize: 'vertical' }} rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>

        <div style={{ background: '#F7F5F0', border: '1px solid #E8E4DC', borderRadius: 6, padding: '10px 14px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Subtotal</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#0A1F44', fontFamily: 'DM Serif Display, serif' }}>{f$(subtotal)}</span>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-navy" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
        </div>

        {initialMode === 'edit' && (
          <button
            onClick={handleDelete}
            disabled={saving}
            style={{ marginTop: 12, width: '100%', padding: '9px 0', background: '#FEE2E2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif' }}
          >
            Delete Line Item
          </button>
        )}
      </div>
    </div>
  );
}
