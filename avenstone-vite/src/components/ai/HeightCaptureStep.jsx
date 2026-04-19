import { useState } from 'react';
import { validateHeight, feetToMeters, metersToFeet, HEIGHT_MIN_M, HEIGHT_MAX_M } from '../../lib/captureHeight';
import { startInteriorHeightCapture } from '../../lib/lidar';

const NAVY = '#0A1F44';
const GOLD = '#C9A84C';
const CREAM = '#F7F5F0';
const BORDER = '#E8E4DC';

/**
 * HeightCaptureStep — shared height confirmation UI for both interior and exterior captures.
 *
 * Interior: auto-derived from LiDAR (max room height). Show value + allow AR re-measure or manual override.
 *           "Tap to Measure" launches InteriorHeightCaptureViewController for trey/vaulted ceilings.
 * Exterior: captured inside ExteriorScanViewController. Show value, allow override.
 * Both: manual numeric fallback. Confirm required — no skip.
 */
export default function HeightCaptureStep({ captureMode, autoHeightFt, onConfirm }) {
  const [arHeightFt, setArHeightFt] = useState(null);   // set when user does AR tap measure
  const [overriding, setOverriding] = useState(!autoHeightFt);
  const [inputFt, setInputFt] = useState(autoHeightFt ? String(autoHeightFt) : '');
  const [error, setError] = useState('');
  const [arScanning, setArScanning] = useState(false);

  const isInterior = captureMode === 'interior';

  // Effective displayed height: AR tap > manual input > auto from scan
  const displayFt = arHeightFt ?? (overriding ? null : autoHeightFt);
  const confirmedFt = arHeightFt ?? (overriding ? parseFloat(inputFt) : autoHeightFt);
  const confirmedM = confirmedFt ? feetToMeters(confirmedFt) : null;
  const canConfirm = confirmedM && validateHeight(confirmedM);

  const source = arHeightFt ? 'auto' : (overriding && !autoHeightFt ? 'manual' : overriding ? 'manual' : 'auto');

  function handleConfirm() {
    if (!canConfirm) return;
    onConfirm(confirmedM, source, [confirmedM]);
  }

  function handleInput(val) {
    setInputFt(val);
    setArHeightFt(null); // manual entry clears AR measurement
    const ft = parseFloat(val);
    const m = feetToMeters(ft);
    if (val && (isNaN(ft) || !validateHeight(m))) {
      setError(`Enter a height between ${metersToFeet(HEIGHT_MIN_M)} and ${metersToFeet(HEIGHT_MAX_M)} ft`);
    } else {
      setError('');
    }
  }

  async function handleArMeasure() {
    setArScanning(true);
    try {
      const result = await startInteriorHeightCapture();
      const ft = metersToFeet(result.heightMeters);
      setArHeightFt(ft);
      setOverriding(false);
      setError('');
    } catch (err) {
      // cancelled — no-op
    }
    setArScanning(false);
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
            ? 'Used for paint, drywall, and trim takeoffs. Tap to measure if LiDAR got it wrong.'
            : 'Measured from ground to eave/gutter. Used for siding and roofing takeoffs.'}
        </div>
      </div>

      {/* Confirmed height display (auto or AR-measured) */}
      {displayFt && !overriding && (
        <div style={{
          background: '#fff', borderRadius: 10, padding: '20px',
          marginBottom: 16, boxShadow: '0 1px 4px rgba(10,31,68,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 11, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: '"DM Sans", sans-serif' }}>
              {arHeightFt ? 'AR measured' : isInterior ? 'Detected ceiling height' : 'Measured wall height'}
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, color: NAVY, fontFamily: '"DM Sans", sans-serif', lineHeight: 1 }}>
              {displayFt} <span style={{ fontSize: 18, fontWeight: 500, color: '#666' }}>ft</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            {isInterior && (
              <button
                onClick={handleArMeasure}
                disabled={arScanning}
                style={{
                  background: NAVY, border: 'none', borderRadius: 8,
                  padding: '8px 14px', fontSize: 13, cursor: arScanning ? 'not-allowed' : 'pointer',
                  fontFamily: '"DM Sans", sans-serif', color: '#fff', fontWeight: 600,
                  opacity: arScanning ? 0.6 : 1,
                }}
              >
                {arScanning ? 'Opening AR...' : 'Re-measure'}
              </button>
            )}
            <button
              onClick={() => { setOverriding(true); setInputFt(String(displayFt)); setArHeightFt(null); }}
              style={{
                background: CREAM, border: `1px solid ${BORDER}`, borderRadius: 8,
                padding: '8px 14px', fontSize: 13, cursor: 'pointer',
                fontFamily: '"DM Sans", sans-serif', color: '#555',
              }}
            >
              Override
            </button>
          </div>
        </div>
      )}

      {/* Interior: no height yet — AR tap as primary CTA */}
      {isInterior && !displayFt && !overriding && (
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={handleArMeasure}
            disabled={arScanning}
            className="btn btn-navy"
            style={{
              width: '100%', padding: '14px', fontSize: 15, fontWeight: 700, marginBottom: 12,
              opacity: arScanning ? 0.6 : 1, cursor: arScanning ? 'not-allowed' : 'pointer',
            }}
          >
            {arScanning ? 'Opening AR scanner...' : 'Tap to Measure Ceiling'}
          </button>
          <button
            onClick={() => setOverriding(true)}
            style={{
              background: 'none', border: 'none', color: '#9CA3AF', fontSize: 13,
              cursor: 'pointer', fontFamily: '"DM Sans", sans-serif', display: 'block', margin: '0 auto',
            }}
          >
            Enter manually instead
          </button>
        </div>
      )}

      {/* Manual entry */}
      {(overriding || (!isInterior && !displayFt)) && (
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
            <div style={{ color: '#EF4444', fontSize: 12, marginTop: 4, fontFamily: '"DM Sans", sans-serif' }}>
              {error}
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
            {isInterior && (
              <button
                onClick={handleArMeasure}
                disabled={arScanning}
                style={{
                  background: 'none', border: `1px solid ${NAVY}`, borderRadius: 8,
                  padding: '6px 14px', fontSize: 13, cursor: arScanning ? 'not-allowed' : 'pointer',
                  fontFamily: '"DM Sans", sans-serif', color: NAVY,
                }}
              >
                {arScanning ? 'Opening...' : 'Use AR instead'}
              </button>
            )}
            {(autoHeightFt || arHeightFt) && (
              <button
                onClick={() => { setOverriding(false); setError(''); }}
                style={{
                  background: 'none', border: 'none', color: '#9CA3AF',
                  fontSize: 12, cursor: 'pointer',
                  fontFamily: '"DM Sans", sans-serif', padding: 0,
                }}
              >
                ← Use {arHeightFt ? 'AR' : 'detected'} value ({arHeightFt ?? autoHeightFt} ft)
              </button>
            )}
          </div>
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
