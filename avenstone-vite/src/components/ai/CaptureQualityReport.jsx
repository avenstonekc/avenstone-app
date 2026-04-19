import { DEDUCTION_MESSAGES, gradeColor, gradeBg } from '../../lib/captureQuality';

const NAVY = '#0A1F44';
const GOLD = '#C9A84C';
const CREAM = '#F7F5F0';
const BORDER = '#E8E4DC';

function gradeDescription(grade) {
  if (grade === 'A' || grade === 'B') {
    return { text: 'Great scan — ready to use for estimates.', color: '#2E7D32' };
  }
  if (grade === 'C') {
    return { text: 'Acceptable — minor issues noted below.', color: '#B45309' };
  }
  return { text: 'Low quality — consider re-scanning.', color: '#C62828' };
}

export default function CaptureQualityReport({ captureMode, qualityData, onAccept, onRescan }) {
  const { score, grade, deductions, rooms } = qualityData;
  const desc = gradeDescription(grade);
  const isInterior = captureMode === 'interior';

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', fontFamily: '"DM Sans", sans-serif', paddingBottom: 24 }}>
      {/* Score Card */}
      <div style={{
        background: '#fff',
        borderRadius: 12,
        boxShadow: '0 1px 4px rgba(10,31,68,0.08)',
        padding: 20,
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          {/* Left: score + badge */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 56, fontWeight: 700, lineHeight: 1, color: gradeColor(score) }}>
                {score}
              </span>
              <span style={{ fontSize: 18, color: '#999', lineHeight: 1 }}>/ 100</span>
            </div>
            <div style={{
              display: 'inline-block',
              background: gradeBg(score),
              color: gradeColor(score),
              fontSize: 13,
              fontWeight: 700,
              padding: '3px 12px',
              borderRadius: 20,
              marginTop: 6,
            }}>
              {grade}
            </div>
          </div>

          {/* Right: labels */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: '"DM Serif Display", serif', fontSize: 17, color: NAVY }}>
              Scan Quality
            </div>
            <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
              {isInterior ? 'Interior room scan' : 'Exterior outline scan'}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ background: BORDER, borderRadius: 4, height: 8, overflow: 'hidden', marginBottom: 10 }}>
          <div style={{
            height: '100%',
            width: `${score}%`,
            borderRadius: 4,
            background: gradeColor(score),
            transition: 'width 0.6s ease',
          }} />
        </div>

        {/* Description */}
        <div style={{ fontSize: 13, color: desc.color, fontWeight: 500 }}>
          {desc.text}
        </div>
      </div>

      {/* Deductions */}
      {deductions.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontFamily: '"DM Serif Display", serif',
            fontSize: 15,
            color: NAVY,
            marginBottom: 8,
          }}>
            Issues Found
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {deductions.map((key) => (
              <div key={key} style={{
                background: '#fff',
                padding: '10px 14px',
                borderRadius: 8,
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
              }}>
                <div style={{
                  fontSize: 14,
                  color: '#B45309',
                  background: '#FEF3C7',
                  borderRadius: '50%',
                  width: 24,
                  height: 24,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  ⚠
                </div>
                <div style={{ fontSize: 13, color: '#555', lineHeight: 1.5 }}>
                  {DEDUCTION_MESSAGES[key] ?? key}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Room Breakdown */}
      {isInterior && rooms.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontFamily: '"DM Serif Display", serif',
            fontSize: 15,
            color: NAVY,
            marginBottom: 8,
          }}>
            Room Breakdown
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rooms.map((room, i) => (
              <div key={i} style={{
                background: '#fff',
                padding: '8px 14px',
                borderRadius: 8,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{room.name}</span>
                  {room.sqft != null && (
                    <span style={{ marginLeft: 6, fontSize: 12, color: '#888' }}>{room.sqft} sqft</span>
                  )}
                </div>
                {room.score != null ? (
                  <div style={{
                    background: gradeBg(room.score ?? 70),
                    color: gradeColor(room.score ?? 70),
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: 12,
                  }}>
                    {room.grade ?? room.score}
                  </div>
                ) : (
                  <span style={{ fontSize: 12, color: '#aaa' }}>No data</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ paddingTop: 16 }}>
        <button
          onClick={onRescan}
          style={{
            width: '100%',
            border: `1.5px solid ${BORDER}`,
            background: CREAM,
            color: '#555',
            borderRadius: 8,
            padding: '13px',
            fontSize: 15,
            cursor: 'pointer',
            marginBottom: 10,
            fontFamily: '"DM Sans", sans-serif',
          }}
        >
          Re-scan
        </button>
        <button
          onClick={onAccept}
          style={{
            width: '100%',
            background: GOLD,
            color: '#0A1F44',
            border: 'none',
            borderRadius: 8,
            padding: '14px',
            fontSize: 16,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: '"DM Sans", sans-serif',
          }}
        >
          Accept &amp; Continue →
        </button>
      </div>
    </div>
  );
}
