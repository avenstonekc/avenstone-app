import { useState, useEffect } from 'react';
import { sbCheckPhaseGates, sbAdvancePhase } from '../../lib/supabase';
import { sc } from '../../lib/utils';
import PhaseOverrideModal from '../modals/PhaseOverrideModal';

export default function PhaseAdvanceCard({ jobId, onAdvanced = () => {} }) {
  const [gs, setGs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [advancing, setAdvancing] = useState(false);
  const [error, setError] = useState(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [auditExpanded, setAuditExpanded] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await sbCheckPhaseGates(jobId);
      setGs(status);
    } catch (e) {
      setError(e.message || 'Failed to load phase status.');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [jobId]);

  const advance = async () => {
    setAdvancing(true);
    setError(null);
    const r = await sbAdvancePhase(jobId);
    setAdvancing(false);
    if (!r.ok) {
      setError(r.error || 'Advance failed.');
      return;
    }
    await load();
    onAdvanced();
  };

  const handleOverride = async (reason) => {
    const r = await sbAdvancePhase(jobId, { reason });
    if (!r.ok) {
      setError(r.error || 'Advance failed.');
      return;
    }
    setOverrideOpen(false);
    await load();
    onAdvanced();
  };

  const handleAdvanceClick = () => {
    if (gs.allPassed) advance();
    else setOverrideOpen(true);
  };

  const card = { background: '#fff', border: '1px solid #E8E4DC', padding: 16, marginBottom: 16 };
  const lbl = { fontSize: 11, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 };

  if (loading) {
    return (
      <div style={card}>
        <div style={lbl}>Lifecycle Phase</div>
        <div style={{ fontSize: 13, color: '#9CA3AF' }}>Loading…</div>
      </div>
    );
  }

  if (!gs) return null;

  // Terminal phase
  if (!gs.nextPhase) {
    return (
      <div style={card}>
        <div style={lbl}>Lifecycle Phase</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <PhasePill value={gs.currentPhase} label={gs.currentPhaseLabel} />
        </div>
        <div style={{ fontSize: 13, color: '#6B7280' }}>Job is at terminal phase. No further advancement.</div>
        {gs.lastOverride && <OverrideAudit lastOverride={gs.lastOverride} expanded={auditExpanded} onToggle={() => setAuditExpanded(p => !p)} />}
      </div>
    );
  }

  const failingGates = gs.gates.filter(g => !g.passed);

  return (
    <>
      <div style={card}>
        <div style={lbl}>Lifecycle Phase</div>

        {/* Current → Next */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <PhasePill value={gs.currentPhase} label={gs.currentPhaseLabel} />
          <span style={{ fontSize: 13, color: '#9CA3AF' }}>→</span>
          <PhasePill value={gs.nextPhase} label={gs.nextPhaseLabel} dim />
        </div>

        {/* Gate checklist */}
        {gs.gates.length > 0 ? (
          <div style={{ marginBottom: 14 }}>
            {gs.gates.map(g => (
              <div key={g.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <span style={{ fontSize: 14, color: g.passed ? '#22c55e' : '#ef4444', flexShrink: 0, lineHeight: 1 }}>
                  {g.passed ? '✓' : '✗'}
                </span>
                <span style={{ fontSize: 13, color: g.passed ? '#374151' : '#6B7280' }}>{g.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7, marginBottom: 14 }}>
            <span style={{ fontSize: 13, color: '#9CA3AF', flexShrink: 0 }}>ⓘ</span>
            <span style={{ fontSize: 13, color: '#9CA3AF', fontStyle: 'italic' }}>
              This transition requires manual override — no automatic gates defined.
            </span>
          </div>
        )}

        {/* Advance button */}
        <button
          className={gs.allPassed ? 'btn btn-navy' : 'btn btn-gold'}
          style={{ width: '100%' }}
          disabled={advancing || loading}
          onClick={handleAdvanceClick}
        >
          {advancing ? 'Advancing…' : `Advance to ${gs.nextPhaseLabel}`}
          {!gs.allPassed && !advancing && <span style={{ marginLeft: 6, fontSize: 13, opacity: 1 }}>— tap to override</span>}
        </button>

        {error && (
          <div style={{ background: '#FEE2E2', color: '#991b1b', padding: '8px 12px', fontSize: 13, marginTop: 10 }}>
            {error}
          </div>
        )}

        {gs.lastOverride && <OverrideAudit lastOverride={gs.lastOverride} expanded={auditExpanded} onToggle={() => setAuditExpanded(p => !p)} />}
      </div>

      {overrideOpen && (
        <PhaseOverrideModal
          currentPhase={gs.currentPhaseLabel}
          nextPhase={gs.nextPhaseLabel}
          failingGates={failingGates}
          onOverride={handleOverride}
          onClose={() => setOverrideOpen(false)}
        />
      )}
    </>
  );
}

function PhasePill({ value, label, dim }) {
  const color = sc(value);
  return (
    <span style={{
      fontSize: 12,
      fontWeight: 700,
      color: dim ? '#9CA3AF' : color,
      background: dim ? '#F7F5F0' : color + '18',
      border: `1px solid ${dim ? '#E8E4DC' : color + '44'}`,
      padding: '3px 10px',
      borderRadius: 20,
      letterSpacing: 0.3,
    }}>
      {label}
    </span>
  );
}

function OverrideAudit({ lastOverride, expanded, onToggle }) {
  const date = lastOverride.at
    ? new Date(lastOverride.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;
  return (
    <div style={{ marginTop: 12, borderTop: '1px solid #F3F0E8', paddingTop: 10 }}>
      <button
        onClick={onToggle}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <span style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600 }}>⚠ Override used{date ? ` · ${date}` : ''}</span>
        <span style={{ fontSize: 11, color: '#9CA3AF' }}>{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && lastOverride.reason && (
        <div style={{ fontSize: 12, color: '#6B7280', marginTop: 6, paddingLeft: 2 }}>
          {lastOverride.reason}
        </div>
      )}
    </div>
  );
}
