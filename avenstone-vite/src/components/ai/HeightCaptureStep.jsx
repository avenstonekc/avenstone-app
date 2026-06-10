import { useState } from 'react';
import { validateHeight, feetToMeters, metersToFeet, HEIGHT_MIN_M, HEIGHT_MAX_M } from '../../lib/captureHeight';

const NAVY   = 'var(--navy-900)';
const GOLD   = 'var(--gold-500)';
const CREAM  = 'var(--bg)';
const BORDER = 'var(--border)';

export default function HeightCaptureStep({ captureMode, autoHeightFt, onConfirm }) {
  const [overriding, setOverriding] = useState(!autoHeightFt);
  const [inputFt, setInputFt]       = useState(autoHeightFt ? String(autoHeightFt) : '');
  const [error, setError]           = useState('');

  const isInterior  = captureMode === 'interior';
  const displayFt   = overriding ? null : autoHeightFt;
  const confirmedFt = overriding ? parseFloat(inputFt) : autoHeightFt;
  const confirmedM  = confirmedFt ? feetToMeters(confirmedFt) : null;
  const canConfirm  = confirmedM && validateHeight(confirmedM);
  const source      = overriding ? 'manual' : 'auto';

  function handleConfirm() {
    if (!canConfirm) return;
    onConfirm(confirmedM, source, [confirmedM]);
  }

  function handleInput(val) {
    setInputFt(val);
    const ft = parseFloat(val);
    const m  = feetToMeters(ft);
    if (val && (isNaN(ft) || !validateHeight(m))) {
      setError(`Enter a height between ${metersToFeet(HEIGHT_MIN_M)} and ${metersToFeet(HEIGHT_MAX_M)} ft`);
    } else {
      setError('');
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      {/* Header card */}
      <div style={{
        background: '#fff', borderRadius: 10, padding: '18px 20px',
        marginBottom: 18, boxShadow: '0 1px 4px rgba(10,31,68,0.08)',
      }}>
        <div style={{ fontFamily: '"DM Serif Display", serif', fontSize: 17, color: NAVY, marginBottom: 6 }}>
          {isInterior ? 'Ceiling Height' : 'Wall Height'}
        </div>
        <div style={{ fontSize: 13, color: '#666', fontFamily: '"DM Sans", sans-serif', lineHeight: 1.5 }}>
          {isInterior
            ? 'Used for paint, drywall, and trim takeoffs.'
            : 'Measured from ground to eave/gutter. Used for siding and roofing takeoffs.'}
        </div>
      </div>

      {/* Auto-detected height display */}
      {displayFt && !overriding && (
        <div style={{
          background: '#fff', borderRadius: 10, padding: '20px',
          marginBottom: 16, boxShadow: '0 1px 4px rgba(10,31,68,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: '"DM Sans", sans-serif' }}>
              {isInterior ? 'Detected ceiling height' : 'Measured wall height'}
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, color: NAVY, fontFamily: '"DM Sans", sans-serif', lineHeight: 1 }}>
              {displayFt} <span style={{ fontSize: 18, fontWeight: 500, color: '#666' }}>ft</span>
            </div>
          </div>
          <button
            onClick={() => { setOverriding(true); setInputFt(String(displayFt)); }}
            style={{
              background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 8,
              padding: '8px 14px', fontSize: 13, cursor: 'pointer',
              fontFamily: '"DM Sans", sans-serif', color: '#555',
            }}
          >
            Override
          </button>
        </div>
      )}

      {/* No auto height + exterior: prompt manual entry */}
      {!isInterior && !displayFt && !overriding && (
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => setOverriding(true)}
            className="btn btn-navy"
            style={{ width: '100%', padding: '14px', fontSize: 15, fontWeight: 700 }}
          >
            Enter Wall Height
          </button>
        </div>
      )}

      {/* Manual entry */}
      {overriding && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, color: '#666', fontFamily: '"DM Sans", sans-serif', marginBottom: 6 }}>
            Height (feet)
          </label>
          <input
            className="finp"
            type="number"
            inputMode="decimal"
            placeholder={isInterior ? 'e.g. 9.0' : 'e.g. 12.5'}
            value={inputFt}
            onChange={e => handleInput(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 18 }}
            autoFocus
          />
          {error && (
            <div style={{ color: 'var(--red-text)', fontSize: 12, marginTop: 4, fontFamily: '"DM Sans", sans-serif' }}>
              {error}
            </div>
          )}
          {autoHeightFt && (
            <button
              onClick={() => { setOverriding(false); setError(''); }}
              style={{
                background: 'none', border: 'none', color: '#9CA3AF',
                fontSize: 12, cursor: 'pointer', marginTop: 8,
                fontFamily: '"DM Sans", sans-serif', padding: 0,
              }}
            >
              ← Use detected value ({autoHeightFt} ft)
            </button>
          )}
        </div>
      )}

      <button
        onClick={handleConfirm}
        disabled={!canConfirm}
        className="btn btn-gold"
        style={{
          width: '100%', padding: '14px', fontSize: 16, fontWeight: 700,
          opacity: canConfirm ? 1 : 0.45, cursor: canConfirm ? 'pointer' : 'not-allowed',
        }}
      >
        Confirm Height
      </button>
    </div>
  );
}
