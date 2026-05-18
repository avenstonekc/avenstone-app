import { useState, useEffect } from 'react';
import { sbCreateDrawSchedule, sbUpdateDrawSchedule, sbLoadActiveTradeStrings } from '../../lib/supabase';

const STATUSES = ['planned', 'in_progress', 'paid', 'cancelled'];

const TRIGGER_TYPES = [
  { value: '',                    label: '(none — manual invoicing)' },
  { value: 'sub_start_in_progress', label: 'When sub starts a trade' },
  { value: 'sub_start_complete',   label: 'When sub completes a trade' },
  { value: 'delivery_complete',    label: 'When materials are delivered' },
  { value: 'phase_advanced',       label: 'When job advances to a phase' },
];

const PHASE_OPTIONS = [
  { value: 'lead',          label: 'Lead' },
  { value: 'proposal',      label: 'Proposal' },
  { value: 'contract',      label: 'Contract' },
  { value: 'in_progress',   label: 'In Progress' },
  { value: 'final_touches', label: 'Final Touches' },
  { value: 'complete',      label: 'Complete' },
];

const TRADE_TRIGGER_TYPES = ['sub_start_in_progress', 'sub_start_complete', 'delivery_complete'];

export default function DrawModal({ job, existingDraws, draw, onClose, onSaved }) {
  const isEdit = !!draw;

  const nextNum = isEdit
    ? draw.draw_number
    : (existingDraws.length ? Math.max(...existingDraws.map(d => d.draw_number)) + 1 : 1);

  const existingTrigger = draw?.auto_invoice_trigger || null;

  const [form, setForm] = useState({
    draw_number:   nextNum,
    title:         draw?.title || '',
    description:   draw?.description || '',
    target_amount: draw?.target_amount ?? '',
    target_date:   draw?.target_date || '',
    phase:         draw?.phase || '',
    display_order: draw?.display_order ?? '',
    status:        draw?.status || 'planned',
  });
  const [triggerType,  setTriggerType]  = useState(existingTrigger?.type  || '');
  const [triggerTrade, setTriggerTrade] = useState(existingTrigger?.trade || '');
  const [triggerPhase, setTriggerPhase] = useState(existingTrigger?.phase || '');
  const [trades, setTrades] = useState([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    sbLoadActiveTradeStrings().then(setTrades).catch(() => {});
  }, []);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    const title = form.title.trim();
    if (!title) { setErr('Title is required.'); return; }
    const amount = Number(form.target_amount);
    if (!amount || amount <= 0) { setErr('Target amount must be greater than 0.'); return; }
    const drawNum = parseInt(form.draw_number, 10);
    if (!drawNum || drawNum < 1) { setErr('Draw number must be a positive integer.'); return; }

    // Validate trigger fields
    if (triggerType && TRADE_TRIGGER_TYPES.includes(triggerType) && !triggerTrade) {
      setErr('Select a trade for this trigger.'); return;
    }
    if (triggerType === 'phase_advanced' && !triggerPhase) {
      setErr('Select a phase for this trigger.'); return;
    }

    let auto_invoice_trigger = null;
    if (triggerType) {
      auto_invoice_trigger = { type: triggerType };
      if (TRADE_TRIGGER_TYPES.includes(triggerType)) auto_invoice_trigger.trade = triggerTrade;
      if (triggerType === 'phase_advanced') auto_invoice_trigger.phase = triggerPhase;
    }

    setSaving(true); setErr('');
    try {
      const payload = {
        draw_number:          drawNum,
        title,
        description:          form.description.trim() || null,
        target_amount:        amount,
        target_date:          form.target_date || null,
        phase:                form.phase.trim() || null,
        display_order:        form.display_order !== '' ? parseInt(form.display_order, 10) : drawNum,
        auto_invoice_trigger,
        ...(isEdit ? { status: form.status } : {}),
      };
      if (isEdit) {
        await sbUpdateDrawSchedule(draw.id, payload);
      } else {
        await sbCreateDrawSchedule(job.id, payload);
      }
      onSaved();
      onClose();
    } catch (e) {
      setErr(e.message || 'Save failed.');
      setSaving(false);
    }
  };

  const inp = { border: '1px solid #E8E4DC', padding: '8px 10px', fontSize: 16, borderRadius: 6, width: '100%', fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' };
  const sel = { ...inp, appearance: 'none' };
  const lbl = { fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, display: 'block' };
  const fg = { marginBottom: 14 };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440, width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div className="modal-title" style={{ margin: 0 }}>{isEdit ? 'Edit Draw' : 'Add Draw'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#9CA3AF', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div>
            <label style={lbl}>Draw #</label>
            <input style={inp} type="number" min="1" step="1" value={form.draw_number} onChange={e => set('draw_number', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Target Amount ($)</label>
            <input style={inp} type="number" min="0.01" step="0.01" placeholder="0.00" value={form.target_amount} onChange={e => set('target_amount', e.target.value)} />
          </div>
        </div>

        <div style={fg}>
          <label style={lbl}>Title</label>
          <input style={inp} placeholder="Deposit / At framing complete / Final payment" value={form.title} onChange={e => set('title', e.target.value)} />
        </div>

        <div style={fg}>
          <label style={lbl}>Description (optional)</label>
          <textarea style={{ ...inp, minHeight: 56, resize: 'vertical' }} placeholder="Additional details..." value={form.description} onChange={e => set('description', e.target.value)} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div>
            <label style={lbl}>Target Date</label>
            <input style={inp} type="date" value={form.target_date} onChange={e => set('target_date', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Phase (optional)</label>
            <input style={inp} placeholder="Framing" value={form.phase} onChange={e => set('phase', e.target.value)} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isEdit ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 14 }}>
          <div>
            <label style={lbl}>Display Order (optional)</label>
            <input style={inp} type="number" min="0" step="1" placeholder="Defaults to draw #" value={form.display_order} onChange={e => set('display_order', e.target.value)} />
          </div>
          {isEdit && (
            <div>
              <label style={lbl}>Status</label>
              <select style={sel} value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Auto-invoice trigger */}
        <div style={{ borderTop: '1px solid #F3F0E8', paddingTop: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Auto-invoice trigger (optional)</div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 10 }}>Auto-draft an invoice when a milestone is hit. PM still reviews and sends.</div>
          <div style={fg}>
            <label style={lbl}>Trigger</label>
            <select style={sel} value={triggerType} onChange={e => { setTriggerType(e.target.value); setTriggerTrade(''); setTriggerPhase(''); }}>
              {TRIGGER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          {TRADE_TRIGGER_TYPES.includes(triggerType) && (
            <div style={fg}>
              <label style={lbl}>Trade</label>
              <select style={sel} value={triggerTrade} onChange={e => setTriggerTrade(e.target.value)}>
                <option value="">— Select trade —</option>
                {trades.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}
          {triggerType === 'phase_advanced' && (
            <div style={fg}>
              <label style={lbl}>Phase</label>
              <select style={sel} value={triggerPhase} onChange={e => setTriggerPhase(e.target.value)}>
                <option value="">— Select phase —</option>
                {PHASE_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          )}
        </div>

        {err && <div style={{ background: '#FEE2E2', color: '#991b1b', padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 12 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }}>Cancel</button>
          <button onClick={save} disabled={saving} className="btn btn-navy" style={{ flex: 2 }}>{saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Draw'}</button>
        </div>
      </div>
    </div>
  );
}
