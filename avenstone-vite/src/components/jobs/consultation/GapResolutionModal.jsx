import { useState } from 'react';
import { isMob } from '../../../lib/utils';

const NAV = '#0A1F44';
const GOLD = '#C9A84C';
const BORDER = '#E8E4DC';

const SEV_COLORS = {
  blocker:      { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5', label: 'BLOCKER' },
  strong:       { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D', label: 'STRONG' },
  nice_to_have: { bg: '#F3F4F6', text: '#374151', border: '#D1D5DB', label: 'NICE TO HAVE' },
};

export default function GapResolutionModal({ open, gaps, busy, onClose, onGenerate }) {
  const mob = isMob();
  const [gapResolutions, setGapResolutions] = useState({});
  const [gapNotes, setGapNotes] = useState({});
  const [gapNotesOpen, setGapNotesOpen] = useState({});

  if (!open || !gaps || gaps.length === 0) return null;

  const hasBlockerPending = gaps.some(
    (g, i) => g.severity === 'blocker' && !gapResolutions[i]
  );

  const handleGenerate = () => {
    const unresolved = gaps.filter((_, i) => !['resolved', 'skip'].includes(gapResolutions[i]));
    onGenerate(unresolved);
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(10,31,68,0.65)', zIndex: 2000,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: '16px 16px 0 0',
        width: '100%', maxWidth: 680,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 -8px 40px rgba(10,31,68,0.25)',
      }}>
        {/* Header */}
        <div style={{ padding: mob ? '16px 16px 12px' : '20px 24px 14px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ fontFamily: 'DM Serif Display, serif', fontSize: mob ? 18 : 20, color: NAV }}>
            Review Consultation Gaps
          </div>
          <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>
            {gaps.length} item{gaps.length !== 1 ? 's' : ''} flagged — resolve blockers before generating the estimate.
          </div>
        </div>

        {/* Gap list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: mob ? '12px 16px' : '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {gaps.map((g, i) => {
            const sev = SEV_COLORS[g.severity] || SEV_COLORS.nice_to_have;
            const res = gapResolutions[i];
            const noteOpen = gapNotesOpen[i];
            return (
              <div key={i} style={{
                border: `1px solid ${res ? '#D1FAE5' : BORDER}`,
                borderRadius: 10,
                padding: mob ? '12px 14px' : '14px 18px',
                background: res === 'resolved' ? '#F0FDF4' : res === 'skip' ? '#F9FAFB' : '#fff',
                opacity: res === 'skip' ? 0.7 : 1,
                transition: 'all 0.15s',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
                  <span style={{
                    padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 700,
                    letterSpacing: 0.5, whiteSpace: 'nowrap', flexShrink: 0,
                    background: sev.bg, color: sev.text, border: `1px solid ${sev.border}`,
                  }}>
                    {sev.label}
                  </span>
                  <span style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, color: NAV, fontSize: 14, lineHeight: 1.3 }}>
                    {g.title}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: '#4B5563', lineHeight: 1.5, marginBottom: 6 }}>
                  {g.description}
                </div>
                {g.suggested_action && (
                  <div style={{ fontSize: 12, color: '#6B7280', fontStyle: 'italic', marginBottom: 10 }}>
                    <span style={{ fontWeight: 600, fontStyle: 'normal', color: NAV }}>Ask: </span>
                    {g.suggested_action}
                  </div>
                )}

                {noteOpen && (
                  <textarea
                    placeholder="Add a note…"
                    value={gapNotes[i] || ''}
                    onChange={e => setGapNotes(prev => ({ ...prev, [i]: e.target.value }))}
                    rows={2}
                    className="finp"
                    style={{ width: '100%', marginBottom: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }}
                  />
                )}

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setGapResolutions(prev => ({ ...prev, [i]: 'resolved' }))}
                    style={{
                      padding: '4px 12px', borderRadius: 6, border: `1px solid ${res === 'resolved' ? '#22c55e' : BORDER}`,
                      background: res === 'resolved' ? '#D1FAE5' : '#fff',
                      color: res === 'resolved' ? '#065F46' : '#374151',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {res === 'resolved' ? '✓ Resolved' : 'Resolved'}
                  </button>
                  <button
                    onClick={() => setGapResolutions(prev => ({ ...prev, [i]: 'skip' }))}
                    style={{
                      padding: '4px 12px', borderRadius: 6, border: `1px solid ${res === 'skip' ? '#9CA3AF' : BORDER}`,
                      background: res === 'skip' ? '#F3F4F6' : '#fff',
                      color: '#6B7280', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Skip
                  </button>
                  <button
                    onClick={() => {
                      setGapNotesOpen(prev => ({ ...prev, [i]: !noteOpen }));
                      if (!noteOpen) setGapResolutions(prev => ({ ...prev, [i]: 'noted' }));
                    }}
                    style={{
                      padding: '4px 12px', borderRadius: 6, border: `1px solid ${res === 'noted' ? GOLD : BORDER}`,
                      background: res === 'noted' ? '#FFFBEB' : '#fff',
                      color: res === 'noted' ? '#92400E' : '#6B7280',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    Add note
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: mob ? '12px 16px' : '14px 24px', borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 10, flexDirection: mob ? 'column' : 'row' }}>
          {hasBlockerPending && (
            <div style={{ fontSize: 12, color: '#991B1B', alignSelf: 'center', flex: 1 }}>
              Resolve all blockers before generating.
            </div>
          )}
          <button
            className="btn btn-ghost"
            style={{ flex: mob ? 1 : 'none' }}
            onClick={() => { onClose(); onGenerate([]); }}
            disabled={busy}
          >
            Skip all & generate
          </button>
          <button
            className="btn btn-gold"
            style={{ flex: mob ? 1 : 'none', minWidth: 160 }}
            disabled={hasBlockerPending || busy}
            onClick={handleGenerate}
          >
            {busy ? 'Generating…' : 'Generate estimate'}
          </button>
        </div>
      </div>
    </div>
  );
}
