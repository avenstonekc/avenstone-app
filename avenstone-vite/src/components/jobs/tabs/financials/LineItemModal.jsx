import { useState, useEffect } from 'react';
import { sb, sbLoadActiveTradeStrings, AV_USER_ID, AV_TENANT, captureFailedIntent } from '../../../../lib/supabase';
import { sbCommitEstimate } from '../../../../lib/commitEstimate';
import { f$ } from '../../../../lib/utils';

const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' };
const inp = { width: '100%', padding: '8px 10px', border: '1px solid #E8E4DC', borderRadius: 6, fontSize: 16, fontFamily: 'DM Sans, sans-serif', color: '#0A1F44', background: '#fff', boxSizing: 'border-box' };
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
  const [tradeStrings, setTradeStrings] = useState([]);

  useEffect(() => { sbLoadActiveTradeStrings().then(setTradeStrings); }, []);

  const subtotal = parseFloat(quantity || 0) * parseFloat(unitCost || 0) * (1 + parseFloat(markupPct || 0) / 100);

  async function handleSave() {
    if (!description.trim()) { setError('Description is required.'); return; }
    setError('');
    setSaving(true);
    try {
      // EDIT: delete the existing row by id, then insert the updated version via sbCommitEstimate.
      // ADD: insert directly via sbCommitEstimate (no prior delete needed).
      if (initialMode === 'edit') {
        const { error: delErr } = await sb.from('estimate_line_items').delete().eq('id', item.id).eq('tenant_id', AV_TENANT);
        if (delErr) throw delErr;
      }
      const commitItem = {
        source:      'manual',
        phase:       phase.trim() || null,
        trade:       trade.trim(),
        category,
        description: description.trim(),
        quantity:    parseFloat(quantity) || 0,
        unit:        unit.trim() || null,
        unit_cost:   parseFloat(unitCost) || 0,
        // Preserve existing floor premium on edits; new items have no geometry — pass 1.0 deliberately.
        multiplier:  item.multiplier ?? 1.0,
        markup_pct:  0,
        notes:       notes.trim() || null,
        waste_pct:   null,
      };
      const commitResult = await sbCommitEstimate(sb, AV_TENANT, AV_USER_ID, {
        source:     'manual',
        jobId:      job.id,
        estimateId: null,
        items:      [commitItem],
      });
      if (!commitResult.ok) throw new Error(commitResult.error);
      onSaved();
    } catch (e) {
      const msg = e.message || 'Failed to save line item.';
      setError(msg);
      if (initialMode !== 'edit') captureFailedIntent({ kind: 'line_item_save', payload: { phase, trade, category, description, quantity, unit, unitCost, markupPct, notes }, jobId: job.id, message: msg }).catch(() => {});
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this line item?')) return;
    setSaving(true);
    setError('');
    try {
      const { error } = await sb.from('estimate_line_items').delete().eq('id', item.id).eq('tenant_id', AV_TENANT);
      if (error) throw error;
      onSaved();
    } catch (e) {
      setError(e.message || 'Failed to delete line item.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="overlay">
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
            <select style={inp} value={trade} onChange={e => setTrade(e.target.value)}>
              <option value="">— Select trade —</option>
              {tradeStrings.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
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
