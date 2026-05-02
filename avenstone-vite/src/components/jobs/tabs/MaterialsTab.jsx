import { useState, useEffect, useCallback } from 'react';
import { sbLoadMaterials, sbSaveMaterial, sbUpdMaterial, sbDelMaterial, MATERIAL_STATUSES, MATERIAL_UNITS } from '../../../lib/supabase';
import { Ic } from '../../../lib/utils';

const STATUS_STYLE = {
  needed:    { bg: '#FEF3C7', color: '#92400E' },
  ordered:   { bg: '#EFF6FF', color: '#1D4ED8' },
  delivered: { bg: '#D1FAE5', color: '#065F46' },
  installed: { bg: '#F3F4F6', color: '#374151' },
};

const STATUS_LABEL = { needed: 'Needed', ordered: 'Ordered', delivered: 'Delivered', installed: 'Installed' };
const NEXT_STATUS  = { needed: 'ordered', ordered: 'delivered', delivered: 'installed' };

const today = () => new Date().toISOString().slice(0, 10);

function isUrgent(mat) {
  if (mat.status !== 'needed' && mat.status !== 'ordered') return false;
  if (!mat.expected_delivery) return false;
  const diff = (new Date(mat.expected_delivery) - new Date(today())) / 86400000;
  return diff <= 7;
}

const EMPTY_FORM = {
  name: '', phase: '', quantity: '', unit: 'ea', supplier: '',
  unit_cost: '', order_date: '', expected_delivery: '', status: 'needed', notes: '',
};

export default function MaterialsTab({ job, profile }) {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [filter, setFilter]       = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null); // null = add, object = edit
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [deleting, setDeleting]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await sbLoadMaterials(job.id);
      setMaterials(data);
    } catch (e) {
      setError('Failed to load materials.');
    } finally {
      setLoading(false);
    }
  }, [job.id]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = mat => {
    setEditTarget(mat);
    setForm({
      name: mat.name || '',
      phase: mat.phase || '',
      quantity: mat.quantity != null ? String(mat.quantity) : '',
      unit: mat.unit || 'ea',
      supplier: mat.supplier || '',
      unit_cost: mat.unit_cost != null ? String(mat.unit_cost) : '',
      order_date: mat.order_date || '',
      expected_delivery: mat.expected_delivery || '',
      status: mat.status || 'needed',
      notes: mat.notes || '',
    });
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditTarget(null); setForm(EMPTY_FORM); };

  const handleSave = async e => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      job_id: job.id,
      name: form.name.trim(),
      phase: form.phase.trim() || null,
      quantity: form.quantity !== '' ? Number(form.quantity) : null,
      unit: form.unit || 'ea',
      supplier: form.supplier.trim() || null,
      unit_cost: form.unit_cost !== '' ? Number(form.unit_cost) : null,
      order_date: form.order_date || null,
      expected_delivery: form.expected_delivery || null,
      status: form.status || 'needed',
      notes: form.notes.trim() || null,
    };
    if (editTarget) {
      const r = await sbUpdMaterial(editTarget.id, payload);
      if (!r.ok) { setError(r.error || 'Save failed'); setSaving(false); return; }
    } else {
      const r = await sbSaveMaterial(payload);
      if (!r.ok) { setError(r.error || 'Save failed'); setSaving(false); return; }
    }
    setSaving(false);
    closeModal();
    load();
  };

  const handleAdvance = async mat => {
    const next = NEXT_STATUS[mat.status];
    if (!next) return;
    const r = await sbUpdMaterial(mat.id, { status: next });
    if (r.ok) load();
  };

  const handleDelete = async mat => {
    if (!window.confirm(`Delete "${mat.name}"?`)) return;
    setDeleting(mat.id);
    const r = await sbDelMaterial(mat.id);
    setDeleting(null);
    if (r.ok) load();
    else setError(r.error || 'Delete failed');
  };

  const filtered = filter === 'all' ? materials : materials.filter(m => m.status === filter);

  const counts = MATERIAL_STATUSES.reduce((acc, s) => {
    acc[s] = materials.filter(m => m.status === s).length;
    return acc;
  }, {});

  const totalCost = materials.reduce((acc, m) => {
    if (m.unit_cost != null && m.quantity != null) acc += Number(m.unit_cost) * Number(m.quantity);
    return acc;
  }, 0);

  const hasCosts = materials.some(m => m.unit_cost != null);

  const fD = d => {
    if (!d) return '';
    try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return d; }
  };

  const f$ = n => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 20, color: '#0A1F44', margin: 0, lineHeight: 1.2 }}>
            Materials &amp; Orders
          </h2>
          {hasCosts && totalCost > 0 && (
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 3 }}>
              Total material cost: <strong style={{ color: '#0A1F44' }}>{f$(totalCost)}</strong>
            </div>
          )}
        </div>
        <button className="btn btn-navy" onClick={openAdd} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <span style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Ic.plus}</span>
          Add Material
        </button>
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {[{ id: 'all', lb: 'All' }, ...MATERIAL_STATUSES.map(s => ({ id: s, lb: STATUS_LABEL[s] }))].map(f => {
          const cnt = f.id === 'all' ? materials.length : counts[f.id];
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer',
                border: active ? '1px solid #0A1F44' : '1px solid #E8E4DC',
                background: active ? '#0A1F44' : '#fff',
                color: active ? '#fff' : '#6B7280',
                fontFamily: "'DM Sans', sans-serif",
                transition: 'all 0.15s',
              }}
            >
              {f.lb} {cnt > 0 && <span style={{ opacity: 0.7 }}>({cnt})</span>}
            </button>
          );
        })}
      </div>

      {/* States */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#9CA3AF', fontSize: 14 }}>
          Loading materials…
        </div>
      )}
      {!loading && error && (
        <div style={{ background: '#FEE2E2', color: '#991b1b', padding: '12px 16px', borderRadius: 8, fontSize: 13 }}>
          {error}
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 16px', color: '#9CA3AF' }}>
          <div style={{ width: 40, height: 40, margin: '0 auto 12px', color: '#D1D5DB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Ic.box}</div>
          {filter === 'all'
            ? 'No materials tracked yet. Add materials to monitor order status and delivery timing.'
            : `No ${STATUS_LABEL[filter].toLowerCase()} materials.`}
        </div>
      )}

      {/* Cards */}
      {!loading && !error && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(mat => {
            const urgent = isUrgent(mat);
            const st = STATUS_STYLE[mat.status] || STATUS_STYLE.needed;
            const lineTotal = mat.unit_cost != null && mat.quantity != null
              ? Number(mat.unit_cost) * Number(mat.quantity)
              : null;
            const nextSt = NEXT_STATUS[mat.status];

            return (
              <div
                key={mat.id}
                style={{
                  background: '#fff',
                  border: '1px solid #E8E4DC',
                  borderRadius: 10,
                  borderLeft: urgent ? '4px solid #EF4444' : '1px solid #E8E4DC',
                  padding: '14px 16px',
                  position: 'relative',
                }}
              >
                {/* Top row: name + status + actions */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: '#0A1F44' }}>{mat.name}</span>
                      {mat.phase && (
                        <span style={{ fontSize: 11, padding: '2px 8px', border: '1px solid #C9A84C', color: '#C9A84C', borderRadius: 12, whiteSpace: 'nowrap' }}>
                          {mat.phase}
                        </span>
                      )}
                      {urgent && (
                        <span style={{ fontSize: 11, padding: '2px 8px', background: '#FEE2E2', color: '#991b1b', borderRadius: 12, fontWeight: 600 }}>
                          {mat.expected_delivery < today() ? 'Overdue' : 'Due Soon'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status badge */}
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 12, background: st.bg, color: st.color, whiteSpace: 'nowrap' }}>
                    {STATUS_LABEL[mat.status] || mat.status}
                  </span>
                </div>

                {/* Details grid */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 20px', fontSize: 12, color: '#6B7280', marginBottom: 10 }}>
                  {(mat.quantity != null || mat.unit) && (
                    <span>
                      <strong style={{ color: '#374151' }}>Qty:</strong>{' '}
                      {mat.quantity != null ? mat.quantity : '—'} {mat.unit || ''}
                    </span>
                  )}
                  {mat.supplier && (
                    <span><strong style={{ color: '#374151' }}>Supplier:</strong> {mat.supplier}</span>
                  )}
                  {mat.unit_cost != null && (
                    <span><strong style={{ color: '#374151' }}>Unit cost:</strong> {f$(mat.unit_cost)}</span>
                  )}
                  {lineTotal != null && (
                    <span><strong style={{ color: '#374151' }}>Total:</strong> <strong style={{ color: '#0A1F44' }}>{f$(lineTotal)}</strong></span>
                  )}
                  {(mat.order_date || mat.expected_delivery) && (
                    <span>
                      <strong style={{ color: '#374151' }}>
                        {mat.order_date ? `Ordered ${fD(mat.order_date)}` : ''}
                        {mat.order_date && mat.expected_delivery ? ' → ' : ''}
                        {mat.expected_delivery ? `Exp. ${fD(mat.expected_delivery)}` : ''}
                      </strong>
                    </span>
                  )}
                </div>

                {mat.notes && (
                  <div style={{ fontSize: 12, color: '#6B7280', fontStyle: 'italic', marginBottom: 10, borderTop: '1px solid #F3F4F6', paddingTop: 8 }}>
                    {mat.notes}
                  </div>
                )}

                {/* Action row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {nextSt && (
                    <button
                      onClick={() => handleAdvance(mat)}
                      style={{
                        fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 6,
                        border: '1px solid #C9A84C', background: '#fff', color: '#92400E',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                        fontFamily: "'DM Sans', sans-serif",
                      }}
                    >
                      → Mark {STATUS_LABEL[nextSt]}
                    </button>
                  )}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => openEdit(mat)}
                      title="Edit"
                      style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #E8E4DC', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280' }}
                    >
                      <span style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Ic.edit}</span>
                    </button>
                    <button
                      onClick={() => handleDelete(mat)}
                      title="Delete"
                      disabled={deleting === mat.id}
                      style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #FEE2E2', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#EF4444', opacity: deleting === mat.id ? 0.5 : 1 }}
                    >
                      <span style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{Ic.trash}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, width: '100%' }}>
            <div className="modal-title" style={{ fontFamily: "'DM Serif Display', serif", fontSize: 18, color: '#0A1F44', marginBottom: 16 }}>
              {editTarget ? 'Edit Material' : 'Add Material'}
            </div>
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Name */}
              <div className="fg">
                <label className="flbl">Material Name *</label>
                <input
                  className="finp"
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. 2×4 Framing Lumber"
                  required
                />
              </div>

              {/* Phase */}
              <div className="fg">
                <label className="flbl">Phase</label>
                <input
                  className="finp"
                  type="text"
                  value={form.phase}
                  onChange={e => setForm(f => ({ ...f, phase: e.target.value }))}
                  placeholder="e.g. Framing, Rough MEP"
                />
              </div>

              {/* Qty + Unit */}
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="fg" style={{ flex: 1 }}>
                  <label className="flbl">Quantity</label>
                  <input
                    className="finp"
                    type="number"
                    min="0"
                    step="any"
                    value={form.quantity}
                    onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div className="fg" style={{ flex: 1 }}>
                  <label className="flbl">Unit</label>
                  <select
                    className="finp"
                    value={form.unit}
                    onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                  >
                    {MATERIAL_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>

              {/* Supplier */}
              <div className="fg">
                <label className="flbl">Supplier</label>
                <input
                  className="finp"
                  type="text"
                  value={form.supplier}
                  onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))}
                  placeholder="e.g. Home Depot, local lumber yard"
                />
              </div>

              {/* Unit cost */}
              <div className="fg">
                <label className="flbl">Unit Cost ($)</label>
                <input
                  className="finp"
                  type="number"
                  min="0"
                  step="any"
                  value={form.unit_cost}
                  onChange={e => setForm(f => ({ ...f, unit_cost: e.target.value }))}
                  placeholder="0.00"
                />
              </div>

              {/* Order date + Expected delivery */}
              <div style={{ display: 'flex', gap: 10 }}>
                <div className="fg" style={{ flex: 1 }}>
                  <label className="flbl">Order Date</label>
                  <input
                    className="finp"
                    type="date"
                    value={form.order_date}
                    onChange={e => setForm(f => ({ ...f, order_date: e.target.value }))}
                  />
                </div>
                <div className="fg" style={{ flex: 1 }}>
                  <label className="flbl">Expected Delivery</label>
                  <input
                    className="finp"
                    type="date"
                    value={form.expected_delivery}
                    onChange={e => setForm(f => ({ ...f, expected_delivery: e.target.value }))}
                  />
                </div>
              </div>

              {/* Status */}
              <div className="fg">
                <label className="flbl">Status</label>
                <select
                  className="finp"
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                >
                  {MATERIAL_STATUSES.map(s => (
                    <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div className="fg">
                <label className="flbl">Notes</label>
                <textarea
                  className="finp"
                  rows={3}
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Additional details, specs, SKU, etc."
                  style={{ resize: 'vertical' }}
                />
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                <button type="button" className="btn btn-ghost" onClick={closeModal} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-navy" disabled={saving || !form.name.trim()}>
                  {saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Add Material'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
