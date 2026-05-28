import { useEffect, useState, useCallback } from 'react';
import {
  sbLoadPaymentSchedule,
  sbSavePaymentSchedule,
  sbLoadPhases,
  sbGenerateMilestoneInvoice,
  sbReleaseRetainageMilestone,
} from '../../../lib/supabase';
import { f$ } from '../../../lib/utils';

const round2 = (n) => Math.round(n * 100) / 100;

const STATUS_PILL = {
  pending:  { bg: '#F3F4F6', color: '#6B7280' },
  invoiced: { bg: '#DBEAFE', color: '#1E40AF' },
  paid:     { bg: '#D1FAE5', color: '#065F46' },
  released: { bg: '#EDE9FE', color: '#5B21B6' },
};

const mapMilestone = (m, total) => ({
  id:           m.id,
  label:        m.label || '',
  pct:          m.pct ?? 0,
  amount:       m.amount ?? round2((m.pct ?? 0) / 100 * total),
  phase_id:     m.phase_id ?? null,
  is_retainage: m.is_retainage ?? false,
  status:       m.status || 'pending',
  invoice_id:   m.invoice_id ?? null,
});

export default function PaymentScheduleTab({ job, profile }) {
  const readOnly = profile?.role === 'sub' || profile?.role === 'client';

  const [contractTotal, setContractTotal] = useState(job?.contract_value || 0);
  const [milestones, setMilestones]       = useState([]);
  const [phases, setPhases]               = useState([]);
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [saveError, setSaveError]         = useState(null);
  const [saved, setSaved]                 = useState(false);
  const [generating, setGenerating]       = useState(null);
  const [genError, setGenError]           = useState(null);
  const [genSuccess, setGenSuccess]       = useState(null);
  const [releasing, setReleasing]         = useState(false);

  const loadData = useCallback(async () => {
    if (!job?.id) return;
    const [schedRes, phasesData] = await Promise.all([
      sbLoadPaymentSchedule(job.id),
      sbLoadPhases(job.id),
    ]);
    const phaseList = Array.isArray(phasesData) ? phasesData : [];
    setPhases(phaseList.slice().sort((a, b) => (a.phase_order ?? 0) - (b.phase_order ?? 0)));

    if (schedRes.ok && schedRes.data) {
      const { schedule, milestones: ms } = schedRes.data;
      const total = schedule?.contract_total || job?.contract_value || 0;
      setContractTotal(total);
      setMilestones((ms || []).map((m) => mapMilestone(m, total)));
    }
    setLoading(false);
  }, [job?.id, job?.contract_value]);

  useEffect(() => { loadData(); }, [loadData]);

  const recomputeAmounts = (ms, total) =>
    ms.map((m) => ({ ...m, amount: round2((m.pct || 0) / 100 * total) }));

  const handleTotalChange = (val) => {
    const total = parseFloat(val) || 0;
    setContractTotal(total);
    setMilestones((prev) => recomputeAmounts(prev, total));
  };

  const updateMilestone = (id, field, value) => {
    setMilestones((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const updated = { ...m, [field]: value };
        if (field === 'pct') updated.amount = round2((parseFloat(value) || 0) / 100 * contractTotal);
        return updated;
      })
    );
  };

  const addMilestone = () => {
    setMilestones((prev) => [
      ...prev,
      { id: Date.now(), label: '', pct: 0, amount: 0, phase_id: null, is_retainage: false, status: 'pending', invoice_id: null },
    ]);
  };

  const removeMilestone = (id) => setMilestones((prev) => prev.filter((m) => m.id !== id));

  const applyTemplate = () => {
    const findPhase = (name) =>
      phases.find((p) => p.phase_name?.toLowerCase() === name.toLowerCase())?.id ?? null;

    const template = [
      { label: 'At contract signing',    pct: 25, phase_id: null,                      is_retainage: false },
      { label: 'Rough-ins complete',     pct: 25, phase_id: findPhase('Rough-ins'),     is_retainage: false },
      { label: 'Drywall complete',       pct: 25, phase_id: findPhase('Drywall'),       is_retainage: false },
      { label: 'Substantial completion', pct: 15, phase_id: findPhase('Final touches'), is_retainage: false },
      { label: 'Retainage release',      pct: 10, phase_id: findPhase('Complete'),      is_retainage: true  },
    ];

    setMilestones(
      template.map((t) => ({
        id:           Date.now() + Math.random(),
        label:        t.label,
        pct:          t.pct,
        amount:       round2(t.pct / 100 * contractTotal),
        phase_id:     t.phase_id,
        is_retainage: t.is_retainage,
        status:       'pending',
        invoice_id:   null,
      }))
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    const { ok, error } = await sbSavePaymentSchedule(job.id, contractTotal, milestones);
    setSaving(false);
    if (!ok) { setSaveError(error || 'Save failed'); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    await loadData();
  };

  const handleRelease = async (milestoneId) => {
    setReleasing(true);
    setGenError(null);
    const { ok, error } = await sbReleaseRetainageMilestone(milestoneId);
    setReleasing(false);
    if (!ok) { setGenError(error || 'Failed to release retainage'); return; }
    setGenSuccess('Retainage release');
    setTimeout(() => setGenSuccess(null), 4000);
    await loadData();
  };

  const handleGenerate = async (milestoneId, label) => {
    setGenerating(milestoneId);
    setGenError(null);
    const { ok, error } = await sbGenerateMilestoneInvoice(milestoneId);
    setGenerating(null);
    if (!ok) { setGenError(error || 'Failed to generate invoice'); return; }
    setGenSuccess(label);
    setTimeout(() => setGenSuccess(null), 4000);
    await loadData();
  };

  const totalPct       = milestones.reduce((sum, m) => sum + (parseFloat(m.pct) || 0), 0);
  const pctWarning     = milestones.length > 0 && Math.abs(totalPct - 100) > 0.01;
  const totalInvoiced      = milestones.filter(m => m.status === 'invoiced').reduce((s, m) => s + Number(m.amount || 0), 0);
  const totalPaidAmt       = milestones.filter(m => ['paid', 'released'].includes(m.status)).reduce((s, m) => s + Number(m.amount || 0), 0);
  const totalRemaining     = milestones.filter(m => m.status === 'pending' && !m.is_retainage).reduce((s, m) => s + Number(m.amount || 0), 0);
  const totalRetainageHeld = milestones.filter(m => m.is_retainage && ['pending', 'invoiced'].includes(m.status)).reduce((s, m) => s + Number(m.amount || 0), 0);
  const allOthersPaid      = milestones.filter(m => !m.is_retainage).every(m => m.status === 'paid');
  const jobAtFinalPhase    = ['final_touches', 'complete'].includes(job?.status);

  if (job?.cost_plus) return <p style={{ color: '#0A1F44' }}>Not available for cost-plus jobs.</p>;
  if (loading) return <p style={{ color: '#0A1F44' }}>Loading payment schedule…</p>;

  return (
    <div style={{ fontFamily: 'inherit', color: '#0A1F44' }}>
      {/* Contract Total */}
      <div style={{ background: '#F5F2E8', border: '1px solid #E8E4DC', borderRadius: 10, padding: '14px 18px', marginBottom: 20, display: 'inline-block', minWidth: 220 }}>
        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Contract Total ($)</div>
        {readOnly ? (
          <div style={{ fontSize: 20, fontWeight: 600 }}>{f$(contractTotal)}</div>
        ) : (
          <input
            type="number"
            value={contractTotal}
            onChange={(e) => handleTotalChange(e.target.value)}
            style={{ fontSize: 20, fontWeight: 600, border: 'none', background: 'transparent', color: '#0A1F44', width: 160, outline: 'none' }}
          />
        )}
      </div>

      {/* Banners */}
      {pctWarning && (
        <div style={{ background: '#FEF3C7', color: '#92400E', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 14 }}>
          Milestone percentages total {round2(totalPct)}% — must equal 100% before invoicing.
        </div>
      )}
      {saveError && (
        <div style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 14 }}>
          {saveError}
        </div>
      )}
      {genError && (
        <div style={{ background: '#FEE2E2', color: '#991B1B', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 14 }}>
          {genError}
          <button onClick={() => setGenError(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 16 }}>×</button>
        </div>
      )}
      {genSuccess && (
        <div style={{ background: '#D1FAE5', color: '#065F46', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 14 }}>
          Draft invoice generated for "{genSuccess}" — review and send when ready.
        </div>
      )}

      {/* Empty state */}
      {milestones.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: '#6B7280' }}>
          <div style={{ marginBottom: 16, fontSize: 15 }}>No payment schedule yet</div>
          {!readOnly && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={applyTemplate} style={btnSecondary}>Standard template</button>
              <button onClick={addMilestone}  style={btnSecondary}>+ Add milestone</button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Scrollable table wrapper for mobile */}
          <div style={{ overflowX: 'auto' }}>
            {/* Header row */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', fontSize: 12, color: '#6B7280', fontWeight: 600, minWidth: 680 }}>
              <span style={{ flex: 3 }}>Label</span>
              <span style={{ flex: 2 }}>Phase</span>
              <span style={{ width: 64, textAlign: 'right' }}>%</span>
              <span style={{ width: 80, textAlign: 'right' }}>Amount</span>
              <span style={{ width: 80 }}>Retainage</span>
              <span style={{ width: 140 }}>Status / Action</span>
              {!readOnly && <span style={{ width: 24 }} />}
            </div>

            {milestones.map((m) => {
              const isPending    = m.status === 'pending';
              const canEdit      = !readOnly && isPending && !m.invoice_id;
              const pill         = STATUS_PILL[m.status] || STATUS_PILL.pending;
              const canGenerate  = !readOnly && isPending && !m.invoice_id && !m.is_retainage;
              const canRelease   = !readOnly && m.is_retainage && isPending && !m.invoice_id && allOthersPaid && jobAtFinalPhase;

              return (
                <div key={m.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #E8E4DC', minWidth: 680 }}>
                  <input
                    value={m.label}
                    onChange={(e) => canEdit && updateMilestone(m.id, 'label', e.target.value)}
                    disabled={!canEdit}
                    placeholder="Label"
                    style={{ flex: 3, border: '1px solid #E8E4DC', borderRadius: 6, padding: '5px 8px', background: canEdit ? '#fff' : '#F5F2E8', color: '#0A1F44', fontSize: 14 }}
                  />
                  <select
                    value={m.phase_id ?? ''}
                    onChange={(e) => canEdit && updateMilestone(m.id, 'phase_id', e.target.value || null)}
                    disabled={!canEdit}
                    style={{ flex: 2, border: '1px solid #E8E4DC', borderRadius: 6, padding: '5px 8px', background: canEdit ? '#fff' : '#F5F2E8', color: '#0A1F44', fontSize: 14 }}
                  >
                    <option value="">No phase</option>
                    {phases.map((p) => <option key={p.id} value={p.id}>{p.phase_name}</option>)}
                  </select>
                  <input
                    type="number"
                    min={0} max={100} step={0.01}
                    value={m.pct}
                    onChange={(e) => canEdit && updateMilestone(m.id, 'pct', e.target.value)}
                    disabled={!canEdit}
                    style={{ width: 64, border: '1px solid #E8E4DC', borderRadius: 6, padding: '5px 8px', background: canEdit ? '#fff' : '#F5F2E8', color: '#0A1F44', fontSize: 14, textAlign: 'right' }}
                  />
                  <div style={{ width: 80, textAlign: 'right', fontSize: 14, fontWeight: 500 }}>
                    {f$(m.amount)}
                  </div>
                  <div style={{ width: 80, display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={m.is_retainage}
                      onChange={(e) => canEdit && updateMilestone(m.id, 'is_retainage', e.target.checked)}
                      disabled={!canEdit}
                    />
                    {m.is_retainage && <span style={{ fontSize: 11, color: '#5B21B6' }}>Yes</span>}
                  </div>
                  {/* Status + Action */}
                  <div style={{ width: 140, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                    <span style={{
                      background: pill.bg, color: pill.color,
                      borderRadius: 99, padding: '2px 8px',
                      fontSize: 11, fontWeight: 600,
                    }}>
                      {m.status}
                    </span>
                    {canGenerate && (
                      <button
                        onClick={() => handleGenerate(m.id, m.label)}
                        disabled={generating === m.id}
                        style={btnGenerate}
                      >
                        {generating === m.id ? '…' : 'Generate Invoice'}
                      </button>
                    )}
                    {m.invoice_id && (
                      <span style={{ fontSize: 11, color: '#1E40AF' }}>Invoice created ↗</span>
                    )}
                    {canRelease && (
                      <button
                        onClick={() => handleRelease(m.id)}
                        disabled={releasing}
                        style={{ ...btnRelease }}
                      >
                        {releasing ? '…' : 'Release & Invoice'}
                      </button>
                    )}
                    {m.is_retainage && isPending && !canRelease && !m.invoice_id && (
                      <span style={{ fontSize: 11, color: '#9CA3AF', fontStyle: 'italic' }}>Held — released at completion</span>
                    )}
                  </div>
                  {!readOnly && (
                    <button
                      onClick={() => isPending && !m.invoice_id && removeMilestone(m.id)}
                      disabled={!isPending || !!m.invoice_id}
                      style={{ width: 24, height: 24, border: 'none', background: 'transparent', cursor: isPending && !m.invoice_id ? 'pointer' : 'default', color: isPending && !m.invoice_id ? '#9CA3AF' : '#D1D5DB', fontSize: 16, lineHeight: 1 }}
                    >×</button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Billing progress summary */}
          {milestones.length > 0 && (
            <div style={{ background: '#F7F5F0', border: '1px solid #E8E4DC', borderRadius: 8, padding: '10px 16px', marginTop: 16, display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12, color: '#6B7280' }}>
              <span>Contract: <strong style={{ color: '#0A1F44' }}>{f$(contractTotal)}</strong></span>
              <span>Invoiced: <strong style={{ color: totalInvoiced > 0 ? '#1E40AF' : '#6B7280' }}>{f$(totalInvoiced)}</strong></span>
              <span>Paid: <strong style={{ color: totalPaidAmt > 0 ? '#065F46' : '#6B7280' }}>{f$(totalPaidAmt)}</strong></span>
              {totalRetainageHeld > 0 && (
                <span>Retainage held: <strong style={{ color: '#5B21B6' }}>{f$(totalRetainageHeld)}</strong></span>
              )}
              <span>Remaining: <strong style={{ color: totalRemaining > 0 ? '#0A1F44' : '#9CA3AF' }}>{f$(totalRemaining)}</strong></span>
            </div>
          )}

          {!readOnly && (
            <div style={{ display: 'flex', gap: 10, marginTop: 16, alignItems: 'center' }}>
              <button onClick={addMilestone}  style={btnSecondary}>+ Add milestone</button>
              <button onClick={applyTemplate} style={btnSecondary}>Standard template</button>
              <div style={{ flex: 1 }} />
              <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, minWidth: 130 }}>
                {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Schedule'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const btnPrimary = {
  background: '#C9A84C', color: '#0A1F44', border: 'none', borderRadius: 8,
  padding: '9px 18px', fontWeight: 600, fontSize: 14, cursor: 'pointer',
};
const btnSecondary = {
  background: '#F5F2E8', color: '#0A1F44', border: '1px solid #E8E4DC', borderRadius: 8,
  padding: '8px 14px', fontWeight: 500, fontSize: 14, cursor: 'pointer',
};
const btnGenerate = {
  background: '#0A1F44', color: '#fff', border: 'none', borderRadius: 6,
  padding: '4px 10px', fontWeight: 500, fontSize: 12, cursor: 'pointer',
  whiteSpace: 'nowrap',
};
const btnRelease = {
  background: '#5B21B6', color: '#fff', border: 'none', borderRadius: 6,
  padding: '4px 10px', fontWeight: 600, fontSize: 12, cursor: 'pointer',
  whiteSpace: 'nowrap',
};
