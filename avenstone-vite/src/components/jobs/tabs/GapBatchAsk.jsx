import { f$, isMob } from '../../../lib/utils';

const NAV    = 'var(--navy-900)';
const BORDER = 'var(--border)';

/**
 * Batch-ask panel for labor/material gaps (source_label:'regional_avg').
 * Shows after the estimate FACE, before commit. Rep confirms/overrides AI guesses.
 *
 * Props:
 *   gaps       — pricedScope lines with source_label==='regional_avg' && gap_key
 *   gapRates   — Record<gap_key, string> — currently entered rate values
 *   setGapRates — setter
 *   onApply    — callback: apply entered rates to pricedScope in-memory, mutate
 *                source_label to 'user_entered' for filled gaps (deterministic, no AI)
 */
export default function GapBatchAsk({ gaps, gapRates, setGapRates, onApply }) {
  const mob = isMob();
  const unset = gaps.filter(g => {
    const v = gapRates[g.gap_key];
    return !v || isNaN(parseFloat(v)) || parseFloat(v) <= 0;
  }).length;

  return (
    <div style={{ border: `1px solid var(--amber-border)`, borderRadius: 8, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        background: 'var(--amber-bg-soft)', padding: '10px 14px',
        borderBottom: `1px solid var(--amber-border-soft)`,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--amber-text-deep)', marginBottom: 2 }}>
          I don't have vetted rates for {gaps.length} item{gaps.length !== 1 ? 's' : ''}
        </div>
        <div style={{ fontSize: 11, color: 'var(--amber-text-strong)' }}>
          Here's my regional estimate for each — confirm or set your own.
        </div>
      </div>

      {/* Gap rows */}
      {gaps.map((g, i) => {
        const rate    = gapRates[g.gap_key] ?? '';
        const rateNum = parseFloat(rate);
        const liveAmt = (!isNaN(rateNum) && rateNum > 0)
          ? `= ${f$(Math.round(rateNum * g.quantity * 100) / 100)}`
          : '';
        const fallback = g.regional_rate != null
          ? `est. ${f$(Math.round(g.regional_rate * g.quantity * 100) / 100)}`
          : 'TBD';
        const catLabel = g.category === 'labor' ? 'labor' : g.category === 'materials' ? 'materials' : null;

        if (mob) {
          return (
            <div key={g.gap_key || i} style={{
              padding: '8px 14px',
              borderTop: `1px solid var(--amber-border-soft)`,
              background: 'var(--card-bg)',
            }}>
              <div style={{ fontSize: 13, color: NAV, marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-subtle)', marginRight: 6, fontVariantNumeric: 'tabular-nums' }}>{i + 1}.</span>
                {g.description}
                <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>· {g.unit}</span>
                {catLabel && <span style={{ fontSize: 10, color: 'var(--text-subtle)', marginLeft: 6 }}>{catLabel}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>$/unit</span>
                <input
                  type="number" min="0" step="0.01"
                  value={rate}
                  onChange={e => setGapRates(p => ({ ...p, [g.gap_key]: e.target.value }))}
                  placeholder={g.regional_rate != null ? String(g.regional_rate) : '—'}
                  style={{ flex: 1, fontSize: 16, padding: '6px 8px', border: `1px solid ${BORDER}`, borderRadius: 4, minHeight: 36 }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {liveAmt || fallback}
                </span>
              </div>
            </div>
          );
        }

        return (
          <div key={g.gap_key || i} style={{
            display: 'grid', gridTemplateColumns: '2fr 110px 1fr',
            gap: 8, padding: '8px 14px',
            borderTop: `1px solid var(--amber-border-soft)`,
            alignItems: 'center', background: 'var(--card-bg)',
          }}>
            <span style={{ fontSize: 13, color: NAV }}>
              <span style={{ fontSize: 11, color: 'var(--text-subtle)', marginRight: 6, fontVariantNumeric: 'tabular-nums' }}>{i + 1}.</span>
              {g.description}
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>
                {g.quantity} {g.unit}
              </span>
              {catLabel && <span style={{ fontSize: 10, color: 'var(--text-subtle)', marginLeft: 6 }}>{catLabel}</span>}
            </span>
            <input
              type="number" min="0" step="0.01"
              value={rate}
              onChange={e => setGapRates(p => ({ ...p, [g.gap_key]: e.target.value }))}
              placeholder={g.regional_rate != null ? String(g.regional_rate) : '$/unit'}
              style={{ fontSize: 16, padding: '6px 8px', border: `1px solid ${BORDER}`, borderRadius: 4, textAlign: 'right', minHeight: 36 }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>
              {liveAmt || fallback}
            </span>
          </div>
        );
      })}

      {/* Footer */}
      <div style={{
        padding: '10px 14px', borderTop: `1px solid var(--amber-border-soft)`,
        background: 'var(--amber-bg-soft)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 8, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 11, color: unset > 0 ? 'var(--amber-text-strong)' : 'var(--green-text)' }}>
          {unset > 0
            ? `${unset} of ${gaps.length} rate${unset !== 1 ? 's' : ''} still unset — will commit as TBD`
            : 'All rates set ✓'}
        </span>
        <button
          className="btn btn-navy"
          style={{ fontSize: 12, minHeight: 36, padding: '0 16px' }}
          onClick={onApply}
        >
          Use these rates
        </button>
      </div>
    </div>
  );
}
