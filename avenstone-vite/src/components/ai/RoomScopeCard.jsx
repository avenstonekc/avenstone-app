import { useState } from 'react';

const NAVY  = 'var(--navy-900)';
const GOLD  = 'var(--gold-500)';
const CREAM = 'var(--bg)';
const BORDER = 'var(--border)';
const WHITE = 'var(--card-bg)';

const CHIP_LABELS = [
  'Bedroom', 'Bathroom', 'Master Bath', 'Kitchen', 'Living', 'Dining',
  'Office', 'Laundry', 'Garage', 'Basement', 'Hall', 'Closet',
];

function stripTrailingNumber(name) {
  if (!name) return '';
  return name.replace(/\s+\d+$/, '');
}

function autoNumber(bases) {
  const counts = {};
  bases.forEach(b => { const k = (b || '').trim(); if (k) counts[k] = (counts[k] || 0) + 1; });
  const seen = {};
  return bases.map(b => {
    const k = (b || '').trim();
    if (!k) return '';
    if (counts[k] > 1) { seen[k] = (seen[k] || 0) + 1; return `${k} ${seen[k]}`; }
    return k;
  });
}

export default function RoomScopeCard({ rooms, onChange, onConfirm, onBack }) {
  const [bases, setBases] = useState(() => rooms.map(r => stripTrailingNumber(r.name)));
  const [scopes, setScopes] = useState(() => rooms.map(r => r.scope_note || ''));

  const numberedNames = autoNumber(bases);

  function setBase(i, val) {
    const next = [...bases];
    next[i] = val;
    setBases(next);
  }

  function setScope(i, val) {
    const next = [...scopes];
    next[i] = val;
    setScopes(next);
  }

  function handleConfirm() {
    const updated = rooms.map((r, i) => ({
      ...r,
      name: numberedNames[i] || r.name,
      scope_note: (scopes[i] || '').trim() || undefined,
    }));
    onChange(updated);
    onConfirm();
  }

  return (
    <div
      style={{
        fontFamily: '"DM Sans", sans-serif',
        background: CREAM,
        maxWidth: 620,
        margin: '0 auto',
        boxSizing: 'border-box',
        paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
      }}
    >
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: NAVY,
          fontSize: 13,
          fontFamily: '"DM Sans", sans-serif',
          padding: '0 0 14px 0',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        ← Back
      </button>

      {/* Heading */}
      <h2
        style={{
          fontFamily: '"DM Serif Display", serif',
          color: NAVY,
          fontSize: 22,
          margin: '0 0 6px 0',
        }}
      >
        Name Your Rooms
      </h2>
      <p
        style={{
          fontSize: 13,
          color: '#666',
          margin: '0 0 20px 0',
          lineHeight: 1.5,
        }}
      >
        Pick a room type for each space, then add an optional scope note.
      </p>

      {/* Room blocks */}
      {rooms.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '32px 0',
            color: '#888',
            fontSize: 14,
          }}
        >
          No rooms to label.
        </div>
      ) : (
        rooms.map((room, i) => {
          const base = bases[i];
          const numbered = numberedNames[i];
          const showSavesAs = numbered && numbered !== base.trim() && base.trim();

          return (
            <div
              key={i}
              style={{
                background: WHITE,
                borderLeft: `3px solid ${NAVY}`,
                borderRadius: 8,
                padding: '14px 16px',
                marginBottom: 12,
                boxShadow: '0 1px 4px rgba(10,31,68,0.07)',
                boxSizing: 'border-box',
              }}
            >
              {/* Room header */}
              <div
                style={{
                  fontFamily: '"DM Serif Display", serif',
                  fontSize: 15,
                  color: NAVY,
                  fontWeight: 700,
                  marginBottom: 2,
                }}
              >
                Room {i + 1}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: '#777',
                  marginBottom: 12,
                }}
              >
                {room.sqft ? room.sqft.toLocaleString() + ' sf' : '—'}
                {' · '}
                {room.doors} {room.doors === 1 ? 'door' : 'doors'}
                {' · '}
                {room.windows} {room.windows === 1 ? 'window' : 'windows'}
              </div>

              {/* Chips */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 7,
                  marginBottom: 10,
                }}
              >
                {CHIP_LABELS.map(label => {
                  const isActive = base === label;
                  return (
                    <button
                      key={label}
                      onClick={() => setBase(i, label)}
                      style={{
                        border: `1.5px solid ${NAVY}`,
                        borderRadius: 20,
                        padding: '5px 13px',
                        fontSize: 13,
                        fontFamily: '"DM Sans", sans-serif',
                        cursor: 'pointer',
                        background: isActive ? GOLD : '#fff',
                        color: isActive ? '#fff' : NAVY,
                        fontWeight: isActive ? '600' : '400',
                        transition: 'background 0.15s, color 0.15s',
                        minHeight: 36,
                        boxSizing: 'border-box',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Custom name input */}
              <input
                type="text"
                value={base}
                onChange={e => setBase(i, e.target.value)}
                placeholder="Custom name"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: 16,
                  fontFamily: '"DM Sans", sans-serif',
                  border: `1.5px solid ${BORDER}`,
                  borderRadius: 8,
                  background: '#fff',
                  color: NAVY,
                  outline: 'none',
                  boxSizing: 'border-box',
                  marginBottom: showSavesAs ? 4 : 10,
                }}
              />

              {/* Auto-number preview */}
              {showSavesAs && (
                <div
                  style={{
                    fontSize: 11,
                    color: '#999',
                    marginBottom: 10,
                    paddingLeft: 2,
                  }}
                >
                  Saves as: {numbered}
                </div>
              )}
              {!showSavesAs && <div style={{ marginBottom: 0 }} />}

              {/* Scope textarea */}
              <textarea
                value={scopes[i]}
                onChange={e => setScope(i, e.target.value)}
                placeholder="Scope of work — optional"
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: 16,
                  fontFamily: '"DM Sans", sans-serif',
                  border: `1.5px solid ${BORDER}`,
                  borderRadius: 8,
                  background: '#fff',
                  color: NAVY,
                  outline: 'none',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                  display: 'block',
                }}
              />
            </div>
          );
        })
      )}

      {/* Confirm button */}
      <button
        onClick={handleConfirm}
        style={{
          background: GOLD,
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '12px 22px',
          fontFamily: '"DM Sans", sans-serif',
          fontWeight: '600',
          fontSize: 15,
          cursor: 'pointer',
          letterSpacing: 0.2,
          width: '100%',
          minHeight: 44,
          marginTop: 8,
          boxSizing: 'border-box',
        }}
      >
        Save Rooms &amp; Continue
      </button>
    </div>
  );
}
