import { useState } from 'react';

export default function PhaseOverrideModal({ currentPhase, nextPhase, failingGates, onOverride, onClose }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const reasonValid = reason.trim().length >= 10;

  const handleSubmit = async () => {
    if (!reasonValid) { setError('Reason must be at least 10 characters.'); return; }
    setError(null);
    setSubmitting(true);
    try {
      await onOverride(reason.trim());
    } catch (e) {
      setError(e.message || 'Override failed.');
      setSubmitting(false);
    }
  };

  const inp = { border: '1px solid #E8E4DC', padding: '8px 10px', fontSize: 13, borderRadius: 6, width: '100%', fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box' };
  const lbl = { fontSize: 11, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, display: 'block' };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460, width: '100%' }} onClick={e => e.stopPropagation()}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <div className="modal-title" style={{ margin: 0 }}>Override gates — advance to {nextPhase}?</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, color: '#9CA3AF', cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ marginBottom: 18 }}>
          {failingGates.length > 0 ? (
            <>
              <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 8 }}>
                The following gates are not satisfied:
              </div>
              {failingGates.map(g => (
                <div key={g.key} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0' }}>
                  <span style={{ fontSize: 14, color: '#ef4444', lineHeight: 1 }}>✗</span>
                  <span style={{ fontSize: 13, color: '#374151' }}>{g.label}</span>
                </div>
              ))}
            </>
          ) : (
            <div style={{ fontSize: 13, color: '#6B7280' }}>
              This transition requires manual override — no automatic gates are defined for{' '}
              <strong>{currentPhase} → {nextPhase}</strong>.
            </div>
          )}
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={lbl}>Reason for override</label>
          <textarea
            style={{ ...inp, minHeight: 80, resize: 'vertical' }}
            rows={3}
            placeholder="Describe why you're advancing past these requirements…"
            value={reason}
            onChange={e => { setReason(e.target.value); setError(null); }}
          />
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
            This reason is logged on the job and visible to other PMs. Min 10 characters.
          </div>
        </div>

        {error && (
          <div style={{ background: '#FEE2E2', color: '#991b1b', padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 14 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex: 1 }} disabled={submitting}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !reasonValid}
            className="btn btn-navy"
            style={{ flex: 2 }}
          >
            {submitting ? 'Advancing…' : 'Override and Advance'}
          </button>
        </div>

      </div>
    </div>
  );
}
