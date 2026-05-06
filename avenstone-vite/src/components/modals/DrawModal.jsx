import { useState } from 'react';
import { sbCreateDrawSchedule, sbUpdateDrawSchedule } from '../../lib/supabase';

const STATUSES = ['planned', 'in_progress', 'paid', 'cancelled'];

export default function DrawModal({ job, existingDraws, draw, onClose, onSaved }) {
  const isEdit = !!draw;

  const nextNum = isEdit
    ? draw.draw_number
    : (existingDraws.length ? Math.max(...existingDraws.map(d => d.draw_number)) + 1 : 1);

  const [form, setForm] = useState({
    draw_number: nextNum,
    title: draw?.title || '',
    description: draw?.description || '',
    target_amount: draw?.target_amount ?? '',
    target_date: draw?.target_date || '',
    phase: draw?.phase || '',
    display_order: draw?.display_order ?? '',
    status: draw?.status || 'planned',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const save = async () => {
    const title = form.title.trim();
    if (!title) { setErr('Title is required.'); return; }
    const amount = Number(form.target_amount);
    if (!amount || amount <= 0) { setErr('Target amount must be greater than 0.'); return; }
    const drawNum = parseInt(form.draw_number, 10);
    if (!drawNum || drawNum < 1) { setErr('Draw number must be a positive integer.'); return; }

    setSaving(true); setErr('');
    try {
      const payload = {
        draw_number: drawNum,
        title,
        description: form.description.trim() || null,
        target_amount: amount,
        target_date: form.target_date || null,
        phase: form.phase.trim() || null,
        display_order: form.display_order !== '' ? parseInt(form.display_order, 10) : drawNum,
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

  const inp = { border: '1px solid #E8E4DC', padding: '8px 10px', fontSize: 13, borderRadius: 6, width: '100%', fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' };
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
              <select style={{ ...inp, appearance: 'none' }} value={form.status} onChange={e => set('status', e.target.value)}>
                {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
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
