import { useState } from 'react';
import { AV_USER_ID, sbCO, sbUpdCO, sbNotify, sbNotifyUser, sbSendContractEmail, sbPhoto, sbCountPhotosForEntity, sbCreateCOAccrualRow } from '../../../lib/supabase';
import { Ic, f$, fD } from '../../../lib/utils';
import { buildGenericPDF } from '../../../lib/pdf';
import { PROOF_CONFIG } from '../../../lib/proofConfig';

export default function COTab({ job, upd, profile }) {
  const [showCO, setShowCO] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [cod, setCod] = useState('');
  const [cor, setCor] = useState('');
  const [coa, setCoa] = useState('');
  const [coMarkup, setCoMarkup] = useState('');
  const [savCO, setSavCO] = useState(false);
  const [coErr, setCoErr] = useState('');
  const [editingCOId, setEditingCOId] = useState(null);
  const [editForm, setEditForm] = useState({ description: '', amount: '', markup_pct: '' });

  // CO condition photo gate (new CO modal)
  const [coPhotos, setCoPhotos] = useState([]);
  const [coBypassReason, setCoBypassReason] = useState('');
  const [showBypass, setShowBypass] = useState(false);

  // CO fix gate (completion flow)
  const [fixGate, setFixGate] = useState(null); // { coId, co } | null
  const [fixPhotos, setFixPhotos] = useState([]);
  const [fixBypassReason, setFixBypassReason] = useState('');
  const [showFixBypass, setShowFixBypass] = useState(false);
  const [savFix, setSavFix] = useState(false);
  const [fixErr, setFixErr] = useState('');

  const apCOs = (job.change_orders || []).filter(c => c.status === 'approved' || c.status === 'complete');
  const coT = Number(job.co_total || 0);
  const cv = Number(job.contract_value || 0);

  // For cost-plus: contract_value is bumped by client price on approval; co_total stays 0.
  // Compute the approved client total for display from the CO rows directly.
  const approvedClientTotal = job.cost_plus
    ? (job.change_orders || [])
      .filter(c => c.status === 'approved' || c.status === 'complete')
      .reduce((s, c) => {
        const m = Number(c.markup_pct ?? job.default_markup_pct ?? 0);
        return s + Math.round(Number(c.amount || 0) * (1 + m / 100) * 100) / 100;
      }, 0)
    : coT;
  const rev = job.cost_plus ? cv : cv + coT;

  const canBypass = ['owner', 'project_manager'].includes(profile?.role);
  const condMin = PROOF_CONFIG.change_order.co_condition.min;
  const fixMin  = PROOF_CONFIG.change_order.co_fix.min;

  const closeNewCO = () => {
    setShowCO(false);
    setCod(''); setCor(''); setCoa(''); setCoMarkup('');
    setCoPhotos([]); setCoBypassReason(''); setShowBypass(false);
    setCoErr('');
  };

  const closeFixGate = () => {
    setFixGate(null);
    setFixPhotos([]); setFixBypassReason(''); setShowFixBypass(false);
    setFixErr('');
  };

  const addCO = async () => {
    if (!cod.trim() || !coa) return;

    const needsCondition = coPhotos.length < condMin;
    if (needsCondition && !canBypass) {
      setCoErr(`At least ${condMin} condition photo required. Ask your PM or owner to submit.`);
      return;
    }
    if (needsCondition && canBypass && !coBypassReason.trim()) {
      setShowBypass(true);
      setCoErr('Attach a condition photo or add a bypass reason to proceed.');
      return;
    }

    setSavCO(true);
    setCoErr('');
    const num = `CO-${String((job.change_orders || []).length + 1).padStart(3, '0')}`;
    const co = {
      job_id: job.id, co_number: num,
      description: cod.trim(), reason: cor.trim(),
      amount: Number(coa), status: 'pending',
      created_at: new Date().toISOString(), submitted_by: AV_USER_ID,
      ...(job.cost_plus ? { markup_pct: coMarkup !== '' ? Number(coMarkup) : (job.default_markup_pct || null) } : {}),
      ...(needsCondition && coBypassReason.trim() ? { co_condition_bypass_reason: coBypassReason.trim() } : {}),
    };
    const s = await sbCO(co);
    if (s.ok) {
      for (const file of coPhotos) {
        await sbPhoto(job.id, file, 'change_order', s.data.id, 'co_condition');
      }
      upd({ change_orders: [s.data, ...(job.change_orders || [])] });
      sbNotify('co_submitted', `New CO on ${job.address}`, `${num}: ${cod.trim()} — ${f$(Number(coa))}`, job.id, AV_USER_ID);
      closeNewCO();
    } else {
      setCoErr(s.error || 'Save failed');
    }
    setSavCO(false);
  };

  // Approval no longer gates on fix photo — just approve.
  const apCO = async id => {
    await _doApCO(id, null);
  };

  const _doApCO = async (id, fixBypass) => {
    const co = (job.change_orders || []).find(c => c.id === id);
    const patch = {
      status: 'approved', approved_at: new Date().toISOString(),
      ...(fixBypass ? { co_fix_bypass_reason: fixBypass } : {}),
    };
    await sbUpdCO(id, patch);
    const u = (job.change_orders || []).map(c => c.id === id ? { ...c, ...patch } : c);

    if (job.cost_plus && co) {
      // Cost-plus: grow contract_value by client price; don't update co_total (avoids double-count).
      const markup = Number(co.markup_pct ?? job.default_markup_pct ?? 0);
      const clientPrice = Math.round(Number(co.amount) * (1 + markup / 100) * 100) / 100;
      const newCv = Math.round((Number(job.contract_value || 0) + clientPrice) * 100) / 100;
      sbCreateCOAccrualRow(id, job.id, Number(co.amount), AV_USER_ID).catch(console.error);
      upd({ change_orders: u, contract_value: newCv });
    } else {
      const nct = u.filter(c => c.status === 'approved').reduce((a, c) => a + Number(c.amount || 0), 0);
      upd({ change_orders: u, co_total: nct });
    }

    if (co) {
      sbNotify('co_approved', `CO approved on ${job.address}`, `${co.co_number} (${f$(co.amount)}) has been approved`, job.id, AV_USER_ID);
      if (co.submitted_by && co.submitted_by !== AV_USER_ID) sbNotifyUser(co.submitted_by, 'co_approved', 'Your change order was approved', `${co.co_number} (${f$(co.amount)}) on ${job.address}`, job.id);
    }
  };

  // Mark Complete — triggers fix photo gate.
  const compCO = async id => {
    const fixCount = await sbCountPhotosForEntity('change_order', id, 'co_fix');
    const needsFix = fixCount < fixMin;
    if (needsFix && !canBypass) {
      setCoErr(`At least ${fixMin} fix photo required before marking complete. Ask your PM or owner.`);
      return;
    }
    if (needsFix && canBypass) {
      const co = (job.change_orders || []).find(c => c.id === id);
      setFixGate({ coId: id, co: co || null });
      return;
    }
    await _doCompCO(id, null);
  };

  const _doCompCO = async (id, fixBypass) => {
    const patch = { status: 'complete', ...(fixBypass ? { co_fix_bypass_reason: fixBypass } : {}) };
    await sbUpdCO(id, patch);
    upd({ change_orders: (job.change_orders || []).map(c => c.id === id ? { ...c, ...patch } : c) });
  };

  const confirmFixGate = async () => {
    if (!fixGate) return;
    const needsBypass = fixPhotos.length < fixMin;
    if (needsBypass && !fixBypassReason.trim()) {
      setShowFixBypass(true);
      setFixErr('Attach a fix photo or add a bypass reason.');
      return;
    }
    setSavFix(true);
    setFixErr('');
    for (const file of fixPhotos) {
      await sbPhoto(job.id, file, 'change_order', fixGate.coId, 'co_fix');
    }
    await _doCompCO(fixGate.coId, needsBypass ? fixBypassReason.trim() : null);
    closeFixGate();
    setSavFix(false);
  };

  const rjCO = async id => {
    await sbUpdCO(id, { status: 'rejected' });
    upd({ change_orders: (job.change_orders || []).map(c => c.id === id ? { ...c, status: 'rejected' } : c) });
    const co = (job.change_orders || []).find(c => c.id === id);
    if (co) {
      sbNotify('co_rejected', `CO rejected on ${job.address}`, `${co.co_number} has been rejected`, job.id, AV_USER_ID);
      if (co.submitted_by && co.submitted_by !== AV_USER_ID) sbNotifyUser(co.submitted_by, 'co_rejected', 'Your change order was rejected', `${co.co_number} (${f$(co.amount)}) on ${job.address}`, job.id);
    }
  };

  const coStatusColor = s => s === 'approved' ? '#22c55e' : s === 'complete' ? '#15803d' : s === 'rejected' ? '#ef4444' : '#f59e0b';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1 }}>Change Orders</div>
          {approvedClientTotal > 0 && <div style={{ fontSize: 13, color: '#f59e0b', fontWeight: 600, marginTop: 2 }}>Approved: {f$(approvedClientTotal)}{job.cost_plus ? ' (client price)' : ''}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {apCOs.length > 0 && <button className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }} onClick={() => setShowInvoice(true)}><span style={{ width: 13, height: 13 }}>{Ic.doc}</span>Invoice</button>}
          <button className="btn btn-navy" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setShowCO(true)}><span style={{ width: 14, height: 14 }}>{Ic.plus}</span>New CO</button>
        </div>
      </div>

      {coErr && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', padding: '8px 12px', fontSize: 12, marginBottom: 8, borderRadius: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{coErr}</span>
          <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontWeight: 700, marginLeft: 8, padding: 0 }} onClick={() => setCoErr('')}>✕</button>
        </div>
      )}

      {!(job.change_orders || []).length && <div className="empty">{Ic.doc}<div className="empty-t">No change orders</div><div>Tap New CO to document a scope change</div></div>}
      {(job.change_orders || []).map((co, i) => (
        <div key={co.id || i} className="co-item" style={{ borderLeftColor: coStatusColor(co.status) }}>
          <div className="co-num">{co.co_number}</div>
          {co.submitted_by_role && (
            <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 600, color: '#0A1F44', background: '#F7F5F0', border: '1px solid #E8E4DC', borderRadius: 20, padding: '2px 8px', marginBottom: 4 }}>
              Submitted by {co.submitted_by_role.toUpperCase().replace(/_/g, ' ')}
            </span>
          )}
          {co.co_condition_bypass_reason && (
            <div style={{ fontSize: 11, color: '#92400E', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 4, padding: '4px 8px', marginBottom: 4 }}>
              ⚠ Condition bypassed: {co.co_condition_bypass_reason}
            </div>
          )}
          {co.co_fix_bypass_reason && (
            <div style={{ fontSize: 11, color: '#92400E', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 4, padding: '4px 8px', marginBottom: 4 }}>
              ⚠ Fix bypassed: {co.co_fix_bypass_reason}
            </div>
          )}
          {editingCOId === co.id ? (
            <div style={{ marginBottom: 8 }}>
              <textarea className="finp" rows={2} style={{ marginBottom: 8, resize: 'vertical' }} value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
              <input className="finp" type="number" style={{ marginBottom: 8 }} value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} placeholder="Amount ($)" />
              {job.cost_plus && (
                <input className="finp" type="number" step="0.5" min="0" style={{ marginBottom: 8 }} value={editForm.markup_pct} onChange={e => setEditForm(f => ({ ...f, markup_pct: e.target.value }))} placeholder={`Markup % (${job.default_markup_pct || 0} default)`} />
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost" style={{ flex: 1, fontSize: 11 }} onClick={() => setEditingCOId(null)}>Cancel</button>
                <button className="btn btn-navy" style={{ flex: 1, fontSize: 11 }} onClick={async () => {
                  const patch = {
                    description: editForm.description.trim(),
                    amount: Number(editForm.amount),
                    ...(job.cost_plus && editForm.markup_pct !== '' ? { markup_pct: Number(editForm.markup_pct) } : {}),
                  };
                  const r = await sbUpdCO(co.id, patch);
                  if (r.ok) {
                    upd({ change_orders: (job.change_orders || []).map(c => c.id === co.id ? { ...c, ...patch } : c) });
                    setEditingCOId(null);
                  }
                }}>Save</button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div style={{ flex: 1 }}>
                <div className="co-desc">{co.description}</div>
                {co.reason && <div className="co-reason">{co.reason}</div>}
                {job.cost_plus && co.status === 'pending' && (
                  <div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>
                    Markup: {co.markup_pct != null ? co.markup_pct : (job.default_markup_pct || 0)}% → Client price: {f$(Math.round(Number(co.amount || 0) * (1 + Number(co.markup_pct ?? job.default_markup_pct ?? 0) / 100) * 100) / 100)}
                  </div>
                )}
              </div>
              <div style={{ textAlign: 'right', marginLeft: 16 }}>
                <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 20, color: '#22c55e' }}>{f$(co.amount)}</div>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: coStatusColor(co.status) }}>{co.status}</div>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <span style={{ fontSize: 11, color: '#9CA3AF' }}>{fD(co.created_at)}</span>
            {co.status === 'pending' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn" style={{ background: '#fff', border: '1px solid #0A1F44', color: '#0A1F44', padding: '5px 12px', fontSize: 11, fontWeight: 600 }} onClick={() => { setEditingCOId(co.id); setEditForm({ description: co.description || '', amount: co.amount ?? '', markup_pct: co.markup_pct ?? '' }); }}>Edit</button>
                {['owner', 'project_manager'].includes(profile?.role) && job.client_email && (
                  <button className="btn" style={{ background: '#0A1F44', border: '1px solid #0A1F44', color: '#C9A84C', padding: '5px 12px', fontSize: 11, fontWeight: 600 }} onClick={async () => {
                    const coText = `CHANGE ORDER: ${co.co_number || ''}\n\nProject: ${job.address}\nClient: ${job.client_name || ''}\n\nDescription:\n${co.description || ''}\n\nReason: ${co.reason || ''}\n\nAmount: ${f$(co.amount || 0)}\n\nThis Change Order must be approved by the client before work proceeds.`;
                    const doc = buildGenericPDF({ docType: 'CHANGE ORDER', job, bodyText: coText, signaturePng: null });
                    const blob = doc.output('blob');
                    await sbSendContractEmail(job, 'change_order', blob);
                    alert(`Change order sent to ${job.client_email} for signature.`);
                  }}>Send for Approval</button>
                )}
                {['owner', 'project_manager'].includes(profile?.role) && (
                  <>
                    <button className="btn" style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', color: '#16a34a', padding: '5px 12px', fontSize: 11, fontWeight: 600 }} onClick={() => apCO(co.id)}>✓ Approve</button>
                    <button className="btn" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#ef4444', padding: '5px 12px', fontSize: 11, fontWeight: 600 }} onClick={() => rjCO(co.id)}>✕ Reject</button>
                  </>
                )}
              </div>
            )}
            {co.status === 'approved' && ['owner', 'project_manager'].includes(profile?.role) && (
              <button className="btn" style={{ background: '#0A1F44', border: '1px solid #0A1F44', color: '#fff', padding: '5px 12px', fontSize: 11, fontWeight: 600 }} onClick={() => compCO(co.id)}>✓ Mark Complete</button>
            )}
          </div>
        </div>
      ))}

      {/* ── New CO modal ── */}
      {showCO && (
        <div className="overlay" onClick={closeNewCO}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">New Change Order</div>
            <div className="fg">
              <label className="flbl"><span className="freq">*</span>Description</label>
              <input className="finp" value={cod} onChange={e => setCod(e.target.value)} placeholder="What work is being added or changed?" />
            </div>
            <div className="fg">
              <label className="flbl">Reason</label>
              <input className="finp" value={cor} onChange={e => setCor(e.target.value)} placeholder="Why is this change needed?" />
            </div>
            <div className="fg">
              <label className="flbl"><span className="freq">*</span>Amount ($)</label>
              <input className="finp" type="number" value={coa} onChange={e => setCoa(e.target.value)} placeholder="e.g. 2500" />
            </div>
            {job.cost_plus && (
              <div className="fg">
                <label className="flbl">Markup %</label>
                <input className="finp" type="number" step="0.5" min="0" value={coMarkup} onChange={e => setCoMarkup(e.target.value)} placeholder={`${job.default_markup_pct || 0} (job default)`} />
              </div>
            )}

            {/* Condition photos */}
            <div className="fg">
              <label className="flbl">
                Condition photos
                <span style={{ color: '#9CA3AF', fontWeight: 400, marginLeft: 4 }}>— why this CO is needed</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: '#F7F5F0', border: '1px solid #E8E4DC', borderRadius: 6, padding: '8px 12px', fontSize: 13, minHeight: 44 }}>
                <span style={{ width: 16, height: 16, flexShrink: 0 }}>{Ic.cam}</span>
                <span style={{ color: '#6B7280' }}>
                  {coPhotos.length > 0 ? `${coPhotos.length} photo${coPhotos.length !== 1 ? 's' : ''} selected` : 'Add photos'}
                </span>
                <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => {
                  const files = Array.from(e.target.files || []);
                  setCoPhotos(p => [...p, ...files]);
                  setCoErr('');
                }} />
              </label>
              {coPhotos.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {coPhotos.map((f, idx) => (
                    <div key={idx} style={{ position: 'relative' }}>
                      <img src={URL.createObjectURL(f)} alt={f.name} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 4 }} />
                      <button
                        onClick={() => setCoPhotos(p => p.filter((_, j) => j !== idx))}
                        style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', border: 'none', borderRadius: '50%', width: 16, height: 16, cursor: 'pointer', color: '#fff', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              {canBypass && (
                <button
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 11, marginTop: 6, textDecoration: 'underline', padding: 0, display: 'block' }}
                  onClick={() => setShowBypass(b => !b)}>
                  {showBypass ? 'Hide bypass' : 'No visible condition? Add a bypass reason'}
                </button>
              )}
              {showBypass && (
                <textarea
                  className="finp"
                  rows={2}
                  style={{ marginTop: 6, fontSize: 13 }}
                  value={coBypassReason}
                  onChange={e => setCoBypassReason(e.target.value)}
                  placeholder="Explain why no photo is available (e.g. 'Pre-existing issue in daily log 5/15')" />
              )}
            </div>

            {coErr && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', padding: '8px 12px', fontSize: 12, marginBottom: 8 }}>{coErr}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={closeNewCO}>Cancel</button>
              <button className={`btn ${cod.trim() && coa ? 'btn-gold' : 'btn-ghost'}`} style={{ flex: 1 }} onClick={addCO} disabled={savCO || !cod.trim() || !coa}>
                {savCO ? 'Saving...' : 'Create CO'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Complete CO — fix gate modal (owner/PM only) ── */}
      {fixGate && (
        <div className="overlay" onClick={closeFixGate}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">Complete CO — Fix Photo Required</div>
            {fixGate.co && (
              <div style={{ fontSize: 13, color: '#374151', marginBottom: 8, fontWeight: 600 }}>
                {fixGate.co.co_number}: {fixGate.co.description}
              </div>
            )}
            <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 12, margin: '0 0 12px' }}>
              Attach at least 1 photo showing the completed work, or add a bypass reason.
            </p>

            <div className="fg">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', background: '#F7F5F0', border: '1px solid #E8E4DC', borderRadius: 6, padding: '8px 12px', fontSize: 13, minHeight: 44 }}>
                <span style={{ width: 16, height: 16, flexShrink: 0 }}>{Ic.cam}</span>
                <span style={{ color: '#6B7280' }}>
                  {fixPhotos.length > 0 ? `${fixPhotos.length} fix photo${fixPhotos.length !== 1 ? 's' : ''} selected` : 'Add fix photos'}
                </span>
                <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={e => {
                  const files = Array.from(e.target.files || []);
                  setFixPhotos(p => [...p, ...files]);
                  setFixErr('');
                }} />
              </label>
              {fixPhotos.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {fixPhotos.map((f, idx) => (
                    <div key={idx} style={{ position: 'relative' }}>
                      <img src={URL.createObjectURL(f)} alt={f.name} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 4 }} />
                      <button
                        onClick={() => setFixPhotos(p => p.filter((_, j) => j !== idx))}
                        style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', border: 'none', borderRadius: '50%', width: 16, height: 16, cursor: 'pointer', color: '#fff', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              <button
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: 11, marginTop: 6, textDecoration: 'underline', padding: 0, display: 'block' }}
                onClick={() => setShowFixBypass(b => !b)}>
                {showFixBypass ? 'Hide bypass' : 'Complete without fix photo'}
              </button>
              {showFixBypass && (
                <textarea
                  className="finp"
                  rows={2}
                  style={{ marginTop: 6, fontSize: 13 }}
                  value={fixBypassReason}
                  onChange={e => setFixBypassReason(e.target.value)}
                  placeholder="Explain why no fix photo is available" />
              )}
            </div>

            {fixErr && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', padding: '8px 12px', fontSize: 12, marginBottom: 8 }}>{fixErr}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={closeFixGate}>Cancel</button>
              <button className="btn btn-gold" style={{ flex: 1 }} onClick={confirmFixGate} disabled={savFix}>
                {savFix ? 'Completing...' : 'Confirm Complete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Invoice modal ── */}
      {showInvoice && (
        <div className="overlay" onClick={() => setShowInvoice(false)}>
          <div className="modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: '#0A1F44' }}>Invoice Summary</div>
                <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{job.address}</div>
              </div>
              <button onClick={() => window.print()} style={{ background: '#0A1F44', color: '#C9A84C', border: 'none', padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderRadius: 3 }}>Print / Save PDF</button>
            </div>
            <div style={{ borderTop: '2px solid #0A1F44', borderBottom: '1px solid #E8E4DC', padding: '12px 0', marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                <span>Item</span><span>Amount</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F3F0E8', fontSize: 14 }}>
                <span style={{ color: '#374151' }}>Base Contract — {job.scope || 'General Construction'}</span>
                <span style={{ fontWeight: 700, color: '#0A1F44' }}>{f$(cv)}</span>
              </div>
              {apCOs.map(co => {
                const m = Number(co.markup_pct ?? job.default_markup_pct ?? 0);
                const displayAmt = job.cost_plus
                  ? Math.round(Number(co.amount || 0) * (1 + m / 100) * 100) / 100
                  : Number(co.amount);
                return (
                  <div key={co.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F3F0E8', fontSize: 13 }}>
                    <div>
                      <div style={{ color: '#374151' }}>{co.co_number} — {co.description}</div>
                      {co.reason && <div style={{ fontSize: 11, color: '#9CA3AF' }}>{co.reason}</div>}
                      {job.cost_plus && <div style={{ fontSize: 10, color: '#9CA3AF' }}>{m}% markup on {f$(co.amount)} cost</div>}
                    </div>
                    <span style={{ fontWeight: 600, color: '#f59e0b', flexShrink: 0, marginLeft: 16 }}>{f$(displayAmt)}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0A1F44', textTransform: 'uppercase', letterSpacing: 1 }}>Total</div>
              <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 26, color: '#0A1F44' }}>{f$(rev)}</div>
            </div>
            {job.client_name && <div style={{ marginTop: 8, fontSize: 12, color: '#9CA3AF' }}>Client: {job.client_name}{job.client_email ? ` · ${job.client_email}` : ''}</div>}
            <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowInvoice(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
