import { useState, useEffect, useRef } from 'react';
import { scanRoom, isLidarSupported } from '../../lib/lidar';

const NAVY = '#0A1F44';
const GOLD = '#C9A84C';
const CREAM = '#F7F5F0';
const BORDER = '#E8E4DC';
const WHITE = '#FFFFFF';
const GREEN = '#2E7D32';

const COMMON_ROOMS = [
  'Living Room',
  'Kitchen',
  'Master Bedroom',
  'Bedroom',
  'Bathroom',
  'Master Bath',
  'Dining Room',
  'Office',
  'Laundry',
  'Garage',
  'Basement',
];

const PULSE_KEYFRAMES = `
  @keyframes lidar-pulse {
    0% { transform: scale(0.6); opacity: 0.9; }
    100% { transform: scale(1.4); opacity: 0; }
  }
  @keyframes lidar-pulse-inner {
    0% { transform: scale(0.4); opacity: 0.9; }
    100% { transform: scale(1.2); opacity: 0; }
  }
`;

function useKeyframes(css) {
  useEffect(() => {
    const el = document.createElement('style');
    el.textContent = css;
    document.head.appendChild(el);
    return () => document.head.removeChild(el);
  }, [css]);
}

function FloorPlanSVG({ rooms }) {
  const SVG_WIDTH = 560;
  const COLS = 2;
  const PAD = 16;
  const CELL_W = (SVG_WIDTH - PAD * (COLS + 1)) / COLS;
  const MAX_CELL_H = 110;

  const maxSqft = Math.max(...rooms.map((r) => r.sqft || 1), 1);

  const rows = Math.ceil(rooms.length / COLS);
  const SVG_HEIGHT = rows * (MAX_CELL_H + PAD) + PAD;

  const totalSqft = rooms.reduce((sum, r) => sum + (r.sqft || 0), 0);

  return (
    <div style={{ marginTop: 20 }}>
      <div
        style={{
          fontFamily: '"DM Serif Display", serif',
          fontSize: 15,
          color: NAVY,
          marginBottom: 6,
        }}
      >
        Floor Plan Preview
      </div>
      <div
        style={{
          fontSize: 11,
          color: '#888',
          marginBottom: 10,
          fontFamily: '"DM Sans", sans-serif',
        }}
      >
        (spatial layout available after native scan)
      </div>
      <svg
        width="100%"
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block', borderRadius: 8, background: CREAM }}
      >
        {rooms.map((room, i) => {
          const col = i % COLS;
          const row = Math.floor(i / COLS);
          const x = PAD + col * (CELL_W + PAD);
          const ratio = Math.max(0.35, (room.sqft || 1) / maxSqft);
          const cellH = Math.max(60, Math.round(MAX_CELL_H * ratio));
          const y = PAD + row * (MAX_CELL_H + PAD) + (MAX_CELL_H - cellH) / 2;

          return (
            <g key={room.name + i}>
              <rect
                x={x}
                y={y}
                width={CELL_W}
                height={cellH}
                rx={6}
                fill={NAVY}
                fillOpacity={0.1}
                stroke={NAVY}
                strokeWidth={1.5}
              />
              <text
                x={x + CELL_W / 2}
                y={y + cellH / 2 - 6}
                textAnchor="middle"
                fontFamily='"DM Sans", sans-serif'
                fontSize={12}
                fill={NAVY}
                fontWeight="600"
              >
                {room.name}
              </text>
              <text
                x={x + CELL_W / 2}
                y={y + cellH / 2 + 12}
                textAnchor="middle"
                fontFamily='"DM Sans", sans-serif'
                fontSize={11}
                fill={GOLD}
                fontWeight="500"
              >
                {room.sqft ? `${room.sqft.toLocaleString()} sf` : '—'}
              </text>
            </g>
          );
        })}
      </svg>
      <div
        style={{
          display: 'inline-block',
          marginTop: 10,
          background: GOLD,
          color: WHITE,
          borderRadius: 20,
          padding: '5px 16px',
          fontFamily: '"DM Sans", sans-serif',
          fontWeight: '600',
          fontSize: 14,
        }}
      >
        Total: {totalSqft.toLocaleString()} sf
      </div>
    </div>
  );
}

function RoomCard({ room, onRemove }) {
  return (
    <div
      style={{
        background: WHITE,
        borderLeft: `3px solid ${NAVY}`,
        borderRadius: 6,
        padding: '14px 16px',
        marginBottom: 10,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        boxShadow: '0 1px 4px rgba(10,31,68,0.07)',
      }}
    >
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontFamily: '"DM Serif Display", serif',
            fontSize: 16,
            color: NAVY,
            marginBottom: 4,
          }}
        >
          {room.name}
        </div>
        <div
          style={{
            fontFamily: '"DM Sans", sans-serif',
            fontSize: 13,
            color: '#555',
            marginBottom: 4,
          }}
        >
          {room.length} ft × {room.width} ft × {room.height} ft (H)
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span
            style={{
              background: GOLD,
              color: WHITE,
              borderRadius: 12,
              padding: '2px 10px',
              fontSize: 12,
              fontFamily: '"DM Sans", sans-serif',
              fontWeight: '600',
            }}
          >
            {room.sqft ? room.sqft.toLocaleString() : '—'} sf
          </span>
          <span
            style={{
              fontSize: 12,
              color: '#777',
              fontFamily: '"DM Sans", sans-serif',
            }}
          >
            {room.doors} {room.doors === 1 ? 'door' : 'doors'} · {room.windows}{' '}
            {room.windows === 1 ? 'window' : 'windows'}
          </span>
        </div>
      </div>
      <button
        onClick={onRemove}
        aria-label={`Remove ${room.name}`}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#aaa',
          fontSize: 18,
          lineHeight: 1,
          padding: '0 0 0 12px',
          fontFamily: '"DM Sans", sans-serif',
          flexShrink: 0,
          marginTop: 2,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#c00')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#aaa')}
      >
        ×
      </button>
    </div>
  );
}

export default function LidarScanner({ rooms, onRoomsChange, onDone }) {
  const [phase, setPhase] = useState('list');
  const [roomName, setRoomName] = useState('');
  const [scanProgress, setScanProgress] = useState(0);
  const [lastScanned, setLastScanned] = useState(null);
  const [supported, setSupported] = useState(true);
  const inputRef = useRef(null);

  useKeyframes(PULSE_KEYFRAMES);

  useEffect(() => {
    setSupported(isLidarSupported());
  }, []);

  useEffect(() => {
    if (phase === 'naming' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [phase]);

  function handleStartScan() {
    if (!roomName.trim()) return;
    setPhase('scanning');
    setScanProgress(0);

    scanRoom(roomName.trim(), (progress) => {
      setScanProgress(progress);
    }).then((result) => {
      const newRoom = { ...result, name: roomName.trim() };
      onRoomsChange([...rooms, newRoom]);
      setLastScanned(newRoom);
      setPhase('result');
    });
  }

  function handleAddAnother() {
    setRoomName('');
    setScanProgress(0);
    setLastScanned(null);
    setPhase('naming');
  }

  function handleRemoveRoom(index) {
    onRoomsChange(rooms.filter((_, i) => i !== index));
  }

  const containerStyle = {
    fontFamily: '"DM Sans", sans-serif',
    background: CREAM,
    borderRadius: 12,
    padding: 24,
    maxWidth: 620,
    margin: '0 auto',
    boxSizing: 'border-box',
  };

  const btnGold = {
    background: GOLD,
    color: WHITE,
    border: 'none',
    borderRadius: 8,
    padding: '11px 22px',
    fontFamily: '"DM Sans", sans-serif',
    fontWeight: '600',
    fontSize: 15,
    cursor: 'pointer',
    letterSpacing: 0.2,
  };

  const btnNavy = {
    background: NAVY,
    color: WHITE,
    border: 'none',
    borderRadius: 8,
    padding: '11px 22px',
    fontFamily: '"DM Sans", sans-serif',
    fontWeight: '600',
    fontSize: 15,
    cursor: 'pointer',
    letterSpacing: 0.2,
  };

  const headingStyle = {
    fontFamily: '"DM Serif Display", serif',
    color: NAVY,
    margin: '0 0 4px 0',
  };

  return (
    <div style={containerStyle}>
      {!supported && (
        <div
          style={{
            background: '#FDF8EC',
            border: `1px solid ${GOLD}`,
            borderRadius: 8,
            padding: '9px 14px',
            marginBottom: 18,
            fontFamily: '"DM Sans", sans-serif',
            fontSize: 13,
            color: '#7A6020',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 16 }}>📡</span>
          LiDAR simulation mode — install on iPhone Pro to scan live
        </div>
      )}

      {phase === 'list' && (
        <ListPhase
          rooms={rooms}
          onAddRoom={() => {
            setRoomName('');
            setPhase('naming');
          }}
          onRemoveRoom={handleRemoveRoom}
          onDone={onDone}
          headingStyle={headingStyle}
          btnGold={btnGold}
          btnNavy={btnNavy}
        />
      )}

      {phase === 'naming' && (
        <NamingPhase
          roomName={roomName}
          setRoomName={setRoomName}
          onStartScan={handleStartScan}
          onBack={() => setPhase('list')}
          inputRef={inputRef}
          headingStyle={headingStyle}
          btnGold={btnGold}
          btnNavy={btnNavy}
        />
      )}

      {phase === 'scanning' && (
        <ScanningPhase
          roomName={roomName}
          scanProgress={scanProgress}
          headingStyle={headingStyle}
        />
      )}

      {phase === 'result' && lastScanned && (
        <ResultPhase
          room={lastScanned}
          onAddAnother={handleAddAnother}
          onDone={onDone}
          headingStyle={headingStyle}
          btnGold={btnGold}
          btnNavy={btnNavy}
        />
      )}
    </div>
  );
}

function ListPhase({ rooms, onAddRoom, onRemoveRoom, onDone, headingStyle, btnGold, btnNavy }) {
  return (
    <div>
      <h2 style={{ ...headingStyle, fontSize: 22, marginBottom: 18 }}>Room Measurements</h2>

      {rooms.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '32px 0',
            color: '#888',
            fontSize: 14,
            fontFamily: '"DM Sans", sans-serif',
          }}
        >
          No rooms scanned yet. Add your first room to begin.
        </div>
      ) : (
        <>
          {rooms.map((room, i) => (
            <RoomCard key={room.name + i} room={room} onRemove={() => onRemoveRoom(i)} />
          ))}
          <FloorPlanSVG rooms={rooms} />
        </>
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
        <button style={btnGold} onClick={onAddRoom}>
          + Add Room
        </button>
        {rooms.length > 0 && (
          <button style={btnNavy} onClick={onDone}>
            Done / Use These Measurements
          </button>
        )}
      </div>
    </div>
  );
}

function NamingPhase({ roomName, setRoomName, onStartScan, onBack, inputRef, headingStyle, btnGold, btnNavy }) {
  const [hovered, setHovered] = useState(null);

  function handleKeyDown(e) {
    if (e.key === 'Enter') onStartScan();
  }

  return (
    <div>
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

      <h2 style={{ ...headingStyle, fontSize: 20, marginBottom: 16 }}>What room are you scanning?</h2>

      <input
        ref={inputRef}
        type="text"
        value={roomName}
        onChange={(e) => setRoomName(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="e.g. Living Room"
        style={{
          width: '100%',
          padding: '12px 14px',
          fontSize: 15,
          fontFamily: '"DM Sans", sans-serif',
          border: `1.5px solid ${BORDER}`,
          borderRadius: 8,
          background: '#fff',
          color: NAVY,
          outline: 'none',
          boxSizing: 'border-box',
          marginBottom: 16,
        }}
      />

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 22,
        }}
      >
        {COMMON_ROOMS.map((name) => {
          const isActive = roomName === name || hovered === name;
          return (
            <button
              key={name}
              onClick={() => setRoomName(name)}
              onMouseEnter={() => setHovered(name)}
              onMouseLeave={() => setHovered(null)}
              style={{
                border: `1.5px solid ${NAVY}`,
                borderRadius: 20,
                padding: '5px 14px',
                fontSize: 13,
                fontFamily: '"DM Sans", sans-serif',
                cursor: 'pointer',
                background: isActive ? GOLD : '#fff',
                color: isActive ? '#fff' : NAVY,
                fontWeight: isActive ? '600' : '400',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {name}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button
          style={{
            ...btnGold,
            opacity: roomName.trim() ? 1 : 0.5,
            cursor: roomName.trim() ? 'pointer' : 'not-allowed',
          }}
          onClick={onStartScan}
          disabled={!roomName.trim()}
        >
          Start Scan
        </button>
        <button style={{ ...btnNavy, background: '#ccc', color: '#555' }} onClick={onBack}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function ScanningPhase({ roomName, scanProgress, headingStyle }) {
  return (
    <div style={{ textAlign: 'center', padding: '12px 0 4px' }}>
      <h2 style={{ ...headingStyle, fontSize: 20, marginBottom: 6 }}>
        Scanning {roomName}...
      </h2>
      <p
        style={{
          color: '#666',
          fontSize: 13,
          fontFamily: '"DM Sans", sans-serif',
          marginBottom: 28,
        }}
      >
        Hold your device steady and move slowly around the room.
      </p>

      <div
        style={{
          position: 'relative',
          width: 140,
          height: 140,
          margin: '0 auto 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: 140,
            height: 140,
            borderRadius: '50%',
            border: `3px solid ${GOLD}`,
            opacity: 0,
            animation: 'lidar-pulse 1.8s ease-out infinite',
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: 100,
            height: 100,
            borderRadius: '50%',
            border: `3px solid ${GOLD}`,
            opacity: 0,
            animation: 'lidar-pulse-inner 1.8s ease-out infinite 0.5s',
          }}
        />
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: '50%',
            background: GOLD,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1,
          }}
        >
          <span style={{ fontSize: 24 }}>📐</span>
        </div>
      </div>

      <div
        style={{
          background: '#E8E4DC',
          borderRadius: 8,
          height: 12,
          width: '100%',
          overflow: 'hidden',
          marginBottom: 8,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${scanProgress}%`,
            background: GOLD,
            borderRadius: 8,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      <div
        style={{
          fontFamily: '"DM Sans", sans-serif',
          fontSize: 13,
          color: '#777',
          textAlign: 'right',
        }}
      >
        {Math.round(scanProgress)}%
      </div>
    </div>
  );
}

function ResultPhase({ room, onAddAnother, onDone, headingStyle, btnGold, btnNavy }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: GREEN,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 16px',
        }}
      >
        <span style={{ color: '#fff', fontSize: 24, fontWeight: '700', lineHeight: 1 }}>✓</span>
      </div>

      <h2 style={{ ...headingStyle, fontSize: 20, marginBottom: 4 }}>Scan Complete</h2>
      <p
        style={{
          color: '#666',
          fontSize: 13,
          fontFamily: '"DM Sans", sans-serif',
          marginBottom: 20,
        }}
      >
        Here are the measurements we captured.
      </p>

      <div
        style={{
          background: WHITE,
          borderRadius: 10,
          padding: '20px 24px',
          boxShadow: '0 2px 10px rgba(10,31,68,0.1)',
          marginBottom: 24,
          textAlign: 'left',
        }}
      >
        <div
          style={{
            fontFamily: '"DM Serif Display", serif',
            fontSize: 20,
            color: NAVY,
            marginBottom: 12,
          }}
        >
          {room.name}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 12,
            marginBottom: 14,
          }}
        >
          {[
            { label: 'Length', value: `${room.length} ft` },
            { label: 'Width', value: `${room.width} ft` },
            { label: 'Height', value: `${room.height} ft` },
          ].map(({ label, value }) => (
            <div
              key={label}
              style={{
                background: CREAM,
                borderRadius: 6,
                padding: '10px 12px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: '#888',
                  fontFamily: '"DM Sans", sans-serif',
                  marginBottom: 4,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontSize: 17,
                  fontWeight: '700',
                  color: NAVY,
                  fontFamily: '"DM Sans", sans-serif',
                }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span
            style={{
              background: GOLD,
              color: WHITE,
              borderRadius: 16,
              padding: '4px 14px',
              fontFamily: '"DM Sans", sans-serif',
              fontWeight: '700',
              fontSize: 15,
            }}
          >
            {room.sqft ? room.sqft.toLocaleString() : '—'} sf
          </span>
          <span
            style={{
              fontSize: 13,
              color: '#777',
              fontFamily: '"DM Sans", sans-serif',
            }}
          >
            {room.doors} {room.doors === 1 ? 'door' : 'doors'} · {room.windows}{' '}
            {room.windows === 1 ? 'window' : 'windows'}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button style={btnGold} onClick={onAddAnother}>
          + Add Another Room
        </button>
        <button style={btnNavy} onClick={onDone}>
          Done / Use These Measurements
        </button>
      </div>
    </div>
  );
}
