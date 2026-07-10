import { f$, isMob } from '../../../lib/utils';

const NAV    = 'var(--navy-900)';
const BORDER = 'var(--border)';

// ai_knowledge category (e.g. "pricing_tile") → a short human citation.
const prettySource = (s) => (s || '').replace(/^pricing[_-]/, '').replace(/_/g, ' ').trim() || 'KC reference';

/**
 * Batch-ask panel for labor/material gaps (source_label:'regional_avg').
 * Shows after the estimate FACE, before commit. Rep confirms/overrides AI guesses.
 *
 * S7 — two explicit paths per gap:
 *   WITH a KC anchor (regional_rate != null): a one-tap ACCEPT control fills the input
 *     with the cited anchor (shown "KC Avg: $X · from {anchor_source}"); the $/unit input
 *     is the override. Provenance ('rep_accepted_anchor' vs 'rep_override') is derived at
 *     apply time by numeric comparison — typing the anchor value counts as accept.
 *   WITHOUT an anchor (null): no accept control, input only — the rep must enter it.
 *
 * Props:
 *   gaps        — pricedScope lines with source_label==='regional_avg' && gap_key
 *   gapRates    — Record<gap_key, string> — currently entered rate values
 *   setGapRates — setter
 *   onApply     — apply entered rates to pricedScope (deterministic, no AI)
 */
export default function GapBatchAsk({ gaps, gapRates, setGapRates, onApply }) {
  const mob = isMob();
  const withAnchor = gaps.filter(g => g.regional_rate != null).length;
  const unset = gaps.filter(g => {
    const v = gapRates[g.gap_key];
    return !v || isNaN(parseFloat(v)) || parseFloat(v) <= 0;
  }).length;

  const acceptAnchor = (g) => setGapRates(p => ({ ...p, [g.gap_key]: String(g.regional_rate) }));

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
          {gaps.length} gap{gaps.length !== 1 ? 's' : ''} · {withAnchor} with KC anchor — accept the anchor or set your own.
        </div>
      </div>

      {/* Gap rows */}
      {gaps.map((g, i) => {
        const rate     = gapRates[g.gap_key] ?? '';
        const rateNum  = parseFloat(rate);
        const hasAnchor = g.regional_rate != null;
        const accepted = hasAnchor && !isNaN(rateNum) && Math.abs(rateNum - Number(g.regional_rate)) < 0.005;
        const liveAmt = (!isNaN(rateNum) && rateNum > 0)
          ? `= ${f$(Math.round(rateNum * g.quantity * 100) / 100)}`
          : '';
        const fallback = hasAnchor
          ? `est. ${f$(Math.round(g.regional_rate * g.quantity * 100) / 100)}`
          : 'TBD';
        const catLabel = g.category === 'labor' ? 'labor' : g.category === 'materials' ? 'materials' : null;

        // The anchor affordance (WITH anchor) or the "you set this" hint (WITHOUT). Layout-agnostic.
        const anchorRow = (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            padding: '4px 0 2px', marginTop: 4,
          }}>
            {hasAnchor ? (
              <>
                <button
                  type="button"
                  onClick={() => acceptAnchor(g)}
                  style={{
                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    padding: '3px 10px', borderRadius: 20, minHeight: 28,
                    border: `1px solid ${accepted ? 'var(--green-text)' : 'var(--amber-border)'}`,
                    background: accepted ? 'var(--green-bg-soft, #D1FAE5)' : 'var(--card-bg)',
                    color: accepted ? 'var(--green-text)' : 'var(--amber-text-deep)',
                  }}
                >
                  {accepted ? '✓ Using KC Avg' : 'Accept KC Avg'}
                </button>
                <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>
                  KC Avg: <strong style={{ color: NAV }}>{f$(g.regional_rate)}</strong>/{g.unit} · from {prettySource(g.anchor_source)}
                </span>
              </>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--amber-text-strong)' }}>
                No regional anchor for this — please set your rate.
              </span>
            )}
          </div>
        );

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
                  placeholder={hasAnchor ? String(g.regional_rate) : '—'}
                  style={{ flex: 1, fontSize: 16, padding: '6px 8px', border: `1px solid ${BORDER}`, borderRadius: 4, minHeight: 36 }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {liveAmt || fallback}
                </span>
              </div>
              {anchorRow}
            </div>
          );
        }

        return (
          <div key={g.gap_key || i} style={{
            padding: '8px 14px',
            borderTop: `1px solid var(--amber-border-soft)`,
            background: 'var(--card-bg)',
          }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '2fr 110px 1fr',
              gap: 8, alignItems: 'center',
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
                placeholder={hasAnchor ? String(g.regional_rate) : '$/unit'}
                style={{ fontSize: 16, padding: '6px 8px', border: `1px solid ${BORDER}`, borderRadius: 4, textAlign: 'right', minHeight: 36 }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right' }}>
                {liveAmt || fallback}
              </span>
            </div>
            {anchorRow}
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
