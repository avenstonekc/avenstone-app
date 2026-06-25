import { useState, useEffect } from 'react';
import { sbLoadBidModelConfig, sbSaveBidModelConfig, AV_TENANT } from '../../lib/supabase';

const NAV  = 'var(--navy-900)';
const GOLD = 'var(--gold-500)';

const DEFAULTS = { supply_model: 'contractor', markup_pct: 30, pm_fee: 1200, allowance: false };

const SUPPLY_OPTIONS = [
  {
    value: 'contractor',
    label: 'Contractor supplies',
    desc: 'You purchase and mark up all materials. Standard for most GC jobs.',
  },
  {
    value: 'owner',
    label: 'Owner supplies',
    desc: 'Client purchases materials directly. You provide labor only.',
  },
];

const ALLOWANCE_OPTIONS = [
  {
    value: true,
    label: 'Yes — use allowances by default',
    desc: 'Budget a client-held amount for finishes (tile, fixtures, cabinets). Client owns the over/under.',
  },
  {
    value: false,
    label: 'No — fixed pricing only',
    desc: 'All materials are specified and priced by you upfront.',
  },
];

const STEPS = [
  { id: 'supply_model', title: 'Supply Model' },
  { id: 'markup_pct',   title: 'Markup %' },
  { id: 'pm_fee',       title: 'PM Fee' },
  { id: 'allowance',    title: 'Allowance Default' },
  { id: 'review',       title: 'Review' },
];

function OptionCard({ option, selected, onSelect }) {
  return (
    <button
      onClick={() => onSelect(option.value)}
      style={{
        width: '100%', textAlign: 'left', padding: '14px 16px', borderRadius: 8,
        cursor: 'pointer', marginBottom: 10, transition: 'all 0.15s',
        border: `2px solid ${selected ? NAV : 'var(--border)'}`,
        background: selected ? 'rgba(10,31,68,0.04)' : 'var(--card-bg)',
        display: 'flex', alignItems: 'flex-start', gap: 12,
      }}
    >
      <span style={{
        width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 2,
        border: `2px solid ${selected ? NAV : 'var(--border-strong)'}`,
        background: selected ? NAV : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {selected && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', display: 'block' }} />}
      </span>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>
          {option.label}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>
          {option.desc}
        </div>
      </div>
    </button>
  );
}

function ReviewRow({ label, value }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '11px 0', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

export default function BidModelWizard({ onDone }) {
  const [step, setStep]       = useState(0);
  const [loading, setLoading] = useState(true);
  const [vals, setVals]       = useState(DEFAULTS);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [err, setErr]         = useState('');

  useEffect(() => {
    sbLoadBidModelConfig(AV_TENANT).then(result => {
      if (result.ok && result.data) {
        setVals({
          supply_model: result.data.supply_model ?? DEFAULTS.supply_model,
          markup_pct:   result.data.markup_pct   ?? DEFAULTS.markup_pct,
          pm_fee:       result.data.pm_fee        ?? DEFAULTS.pm_fee,
          allowance:    result.data.allowance     ?? DEFAULTS.allowance,
        });
      }
      setLoading(false);
    });
  }, []);

  const set = (key, val) => setVals(p => ({ ...p, [key]: val }));

  const save = async () => {
    setSaving(true);
    setErr('');
    const result = await sbSaveBidModelConfig(AV_TENANT, {
      supply_model: vals.supply_model,
      markup_pct:   Number(vals.markup_pct),
      pm_fee:       Number(vals.pm_fee),
      allowance:    Boolean(vals.allowance),
    });
    if (!result.ok) {
      setErr(result.error || 'Save failed — check your role or connection.');
      setSaving(false);
      return;
    }
    setSaved(true);
    setSaving(false);
  };

  const next = () => {
    if (step === 1) {
      const n = Number(vals.markup_pct);
      if (vals.markup_pct === '' || isNaN(n) || n < 0 || n > 100) {
        setErr('Enter a markup between 0 and 100.');
        return;
      }
      set('markup_pct', n);
    }
    if (step === 2) {
      const n = Number(vals.pm_fee);
      if (vals.pm_fee === '' || isNaN(n) || n < 0) {
        setErr('Enter a PM fee of 0 or more.');
        return;
      }
      set('pm_fee', n);
    }
    setErr('');
    setStep(s => s + 1);
  };

  const progress = (step / (STEPS.length - 1)) * 100;
  const isReview = step === STEPS.length - 1;

  if (loading) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(10,31,68,0.7)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ color: '#fff', fontSize: 14 }}>Loading your current config…</div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2000,
      background: 'rgba(10,31,68,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: 520,
        boxShadow: '0 24px 60px rgba(10,31,68,0.25)', overflow: 'hidden',
      }}>
        {/* Progress bar */}
        <div style={{ height: 4, background: '#F3F4F6' }}>
          <div style={{ height: '100%', background: GOLD, width: `${progress}%`, transition: 'width 0.4s ease' }} />
        </div>

        {/* Header */}
        <div style={{ background: NAV, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 17 }}>⚙</span>
            <div style={{ fontFamily: "'DM Serif Display',serif", fontSize: 18, color: '#fff' }}>
              Estimating Defaults
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.45)' }}>
            {isReview
              ? 'Review your defaults before saving'
              : `Step ${step + 1} of ${STEPS.length - 1} — ${STEPS[step].title}`}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '28px 28px 8px' }}>

          {step === 0 && (
            <>
              <div style={{ fontSize: 16, fontWeight: 600, color: NAV, marginBottom: 6 }}>
                Who supplies materials on a typical job?
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5 }}>
                This sets the default line structure the estimator produces.
              </div>
              {SUPPLY_OPTIONS.map(o => (
                <OptionCard
                  key={o.value}
                  option={o}
                  selected={vals.supply_model === o.value}
                  onSelect={v => { set('supply_model', v); setErr(''); }}
                />
              ))}
            </>
          )}

          {step === 1 && (
            <>
              <div style={{ fontSize: 16, fontWeight: 600, color: NAV, marginBottom: 6 }}>
                What is your standard material markup?
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5 }}>
                Applied to all material line items as a percentage above your cost.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                <input
                  type="number"
                  className="finp"
                  style={{ flex: 1, borderRadius: '6px 0 0 6px', fontSize: 14 }}
                  value={vals.markup_pct}
                  onChange={e => { set('markup_pct', e.target.value); setErr(''); }}
                  onKeyDown={e => e.key === 'Enter' && next()}
                  placeholder="30"
                  min="0"
                  max="100"
                  autoFocus
                />
                <span style={{
                  padding: '9px 12px', background: '#F9FAFB', border: '1px solid #E5E7EB',
                  borderLeft: 'none', borderRadius: '0 6px 6px 0',
                  fontSize: 14, color: 'var(--text-muted)', flexShrink: 0,
                }}>%</span>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div style={{ fontSize: 16, fontWeight: 600, color: NAV, marginBottom: 6 }}>
                What is your standard project management fee?
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5 }}>
                A flat fee added to every estimate on top of labor and materials.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                <span style={{
                  padding: '9px 12px', background: '#F9FAFB', border: '1px solid #E5E7EB',
                  borderRight: 'none', borderRadius: '6px 0 0 6px',
                  fontSize: 14, color: 'var(--text-muted)', flexShrink: 0,
                }}>$</span>
                <input
                  type="number"
                  className="finp"
                  style={{ flex: 1, borderRadius: '0 6px 6px 0', fontSize: 14 }}
                  value={vals.pm_fee}
                  onChange={e => { set('pm_fee', e.target.value); setErr(''); }}
                  onKeyDown={e => e.key === 'Enter' && next()}
                  placeholder="1200"
                  min="0"
                  autoFocus
                />
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div style={{ fontSize: 16, fontWeight: 600, color: NAV, marginBottom: 6 }}>
                Do you use material allowances by default?
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5 }}>
                Allowances let the client hold a budget amount for finish materials they choose themselves.
              </div>
              {ALLOWANCE_OPTIONS.map(o => (
                <OptionCard
                  key={String(o.value)}
                  option={o}
                  selected={vals.allowance === o.value}
                  onSelect={v => { set('allowance', v); setErr(''); }}
                />
              ))}
            </>
          )}

          {step === 4 && (
            <>
              <div style={{ fontSize: 16, fontWeight: 600, color: NAV, marginBottom: 6 }}>
                These will become your estimating defaults
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
                Review before saving. Applied to every new estimate.
              </div>
              <div style={{ borderTop: '1px solid var(--border)' }}>
                <ReviewRow
                  label="Supply model"
                  value={vals.supply_model === 'contractor' ? 'Contractor supplies' : 'Owner supplies'}
                />
                <ReviewRow label="Material markup" value={`${vals.markup_pct}%`} />
                <ReviewRow label="PM fee" value={`$${Number(vals.pm_fee).toLocaleString()}`} />
                <ReviewRow label="Allowances by default" value={vals.allowance ? 'Yes' : 'No'} />
              </div>
              {saved && (
                <div style={{
                  marginTop: 16, padding: '9px 13px', borderRadius: 6,
                  background: '#D1FAE5', border: '1px solid #6EE7B7',
                  fontSize: 12.5, color: '#065F46', fontWeight: 500,
                }}>
                  ✓ Estimating defaults saved.
                </div>
              )}
            </>
          )}

          {err && (
            <div style={{ fontSize: 12.5, color: 'var(--red-strong)', marginTop: 8 }}>{err}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 28px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="btn btn-ghost" onClick={onDone} style={{ fontSize: 13 }}>
            Close
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button
                className="btn btn-ghost"
                onClick={() => { setStep(s => s - 1); setErr(''); }}
                style={{ fontSize: 13 }}
              >
                Back
              </button>
            )}
            {isReview ? (
              saved ? (
                <button className="btn btn-navy" onClick={onDone} style={{ minWidth: 120 }}>
                  Done →
                </button>
              ) : (
                <button
                  className="btn btn-navy"
                  onClick={save}
                  disabled={saving}
                  style={{ minWidth: 120 }}
                >
                  {saving ? 'Saving…' : 'Save Defaults'}
                </button>
              )
            ) : (
              <button className="btn btn-navy" onClick={next} style={{ minWidth: 100 }}>
                Next →
              </button>
            )}
          </div>
        </div>

        {/* Dot progress */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, paddingBottom: 20 }}>
          {STEPS.map((_, i) => (
            <span key={i} style={{
              width: i === step ? 20 : 7, height: 7, borderRadius: 4,
              background: i < step ? GOLD : i === step ? NAV : 'var(--border)',
              transition: 'all 0.3s', display: 'inline-block',
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}
