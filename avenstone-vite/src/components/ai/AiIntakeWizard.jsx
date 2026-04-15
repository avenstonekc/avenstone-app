import { useState } from 'react';
import LidarScanner from './LidarScanner';

// NOTE: This wizard used to be a 3-step AI chat + manual grid + review flow.
// Replaced with a pure LiDAR scanning flow (Phase 1). Keeping the original
// component name / export signature so existing callers don't need updates.
// Path A — results are held in local state only, not persisted. DB write
// happens in Phase 2/3 along with multi-room RoomPlan 2.0 and floor plan export.

export default function AiIntakeWizard({ profile, onClose, onJobCreated }) {
  const [rooms, setRooms] = useState([]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Room Scanner"
      style={{
        position: 'fixed',
        inset: 0,
        background: '#F7F5F0',
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          flexShrink: 0,
          padding: '14px 18px',
          background: '#0A1F44',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '3px solid #C9A84C',
        }}
      >
        <div>
          <h2
            style={{
              fontFamily: '"DM Serif Display", serif',
              fontSize: 20,
              margin: 0,
              lineHeight: 1.1,
            }}
          >
            Room Scanner
          </h2>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
            Scan rooms with LiDAR to capture real dimensions
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.3)',
            color: '#fff',
            fontSize: 22,
            width: 38,
            height: 38,
            borderRadius: 8,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          ×
        </button>
      </div>

      {/* Scanner body */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '18px 14px',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <LidarScanner rooms={rooms} onRoomsChange={setRooms} onDone={onClose} />
      </div>
    </div>
  );
}
