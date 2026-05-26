import { useState, useEffect, useRef } from 'react';
import { scanRoom, isLidarSupported, scanMultipleRooms } from '../../lib/lidar';
import { floorLabel, FLOOR_LABELS } from '../../lib/captureTypes.js';
import FloorPlanCanvas from './FloorPlanCanvas';

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

// Floors available in the picker (sub-basement omitted — rare, still reachable via existing rooms)
const FLOOR_OPTIONS = [-1, 0, 1, 2, 3].map(i => ({ index: i, label: floorLabel(i) }));

// Return the lowest floor index not already present in the scanned rooms.
// Prefers 1st Floor (0) as the natural starting default; Basement is last.
function computeNextFloor(rooms) {
  const scanned = new Set(rooms.map(r => r.floor ?? 0));
  for (const idx of [0, 1, 2, 3, -1]) {
    if (!scanned.has(idx)) return idx;
  }
  return 0;
}

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
          {(+room.length).toFixed(2)} ft × {(+room.width).toFixed(2)} ft × {(+room.height).toFixed(2)} ft (H)
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
  const [supported, setSupported] = useState(false);
  const [multiScanning, setMultiScanning] = useState(false);
  const [pendingFloorIndex, setPendingFloorIndex] = useState(0);
  const inputRef = useRef(null);

  useKeyframes(PULSE_KEYFRAMES);

  useEffect(() => {
    let cancelled = false;
    isLidarSupported().then((s) => {
      if (!cancelled) setSupported(s);
    });
    return () => {
      cancelled = true;
    };
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

  function handleOpenFloorPicker() {
    const next = computeNextFloor(rooms);
    console.log(`[LIDAR_DEBUG] floor picker shown, defaulted to floorIndex=${next}`);
    setPendingFloorIndex(next);
    setPhase('floorPicker');
  }

  async function handleFloorPicked(floorIndex) {
    setPhase('list');
    setMultiScanning(true);
    try {
      const newRooms = await scanMultipleRooms(floorIndex);
      onRoomsChange([...rooms, ...newRooms]);
    } catch (err) {
      // cancelled — no-op
    }
    setMultiScanning(false);
  }

  async function handleStartMultiRoomScan(floorIndex = 0) {
    setMultiScanning(true);
    try {
      const newRooms = await scanMultipleRooms(floorIndex);
      onRoomsChange([...rooms, ...newRooms]);
    } catch (err) {
      // cancelled — no-op
    }
    setMultiScanning(false);
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
          supported={supported}
          onAddRoom={() => { setRoomName(''); setPhase('naming'); }}
          onOpenFloorPicker={handleOpenFloorPicker}
          onStartMultiRoomScan={handleStartMultiRoomScan}
          multiScanning={multiScanning}
          onRemoveRoom={handleRemoveRoom}
          onDone={onDone}
          headingStyle={headingStyle}
          btnGold={btnGold}
          btnNavy={btnNavy}
        />
      )}

      {phase === 'floorPicker' && (
        <FloorPicker
          rooms={rooms}
          selectedFloor={pendingFloorIndex}
          onSelect={setPendingFloorIndex}
          onConfirm={() => handleFloorPicked(pendingFloorIndex)}
          onBack={() => setPhase('list')}
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
          allRooms={rooms}
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

function ListPhase({ rooms, supported, onAddRoom, onOpenFloorPicker, onStartMultiRoomScan, multiScanning, onRemoveRoom, onDone, headingStyle, btnGold, btnNavy }) {
  return (
    <div>
      <h2 style={{ ...headingStyle, fontSize: 22, marginBottom: 18 }}>Room Measurements</h2>
      {rooms.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: '#888', fontSize: 14, fontFamily: '"DM Sans", sans-serif' }}>
          No rooms scanned yet. Add your first room to begin.
        </div>
      ) : (
        <>
          {rooms.map((room, i) => (
            <RoomCard key={room.name + i} room={room} onRemove={() => onRemoveRoom(i)} />
          ))}
          <FloorPlanCanvas rooms={rooms} />
        </>
      )}
      <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
        {supported ? (
          multiScanning ? (
            <div style={{ fontSize: 13, color: NAVY, fontFamily: '"DM Sans", sans-serif', fontWeight: 600, padding: '11px 0' }}>
              Launching scanner...
            </div>
          ) : (
            <button style={btnGold} onClick={onOpenFloorPicker}>
              {rooms.length === 0 ? 'Start Scan' : '+ Add Another Floor'}
            </button>
          )
        ) : (
          <button style={btnGold} onClick={onAddRoom}>+ Add Room</button>
        )}
        {rooms.length > 0 && !multiScanning && (
          <button style={btnNavy} onClick={onDone}>Done / Use These Measurements</button>
        )}
      </div>
    </div>
  );
}

function FloorPicker({ rooms, selectedFloor, onSelect, onConfirm, onBack, headingStyle, btnGold, btnNavy }) {
  const scannedFloors = new Set(rooms.map(r => r.floor ?? 0));
  return (
    <div>
      <button
        onClick={onBack}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', color: NAVY,
          fontSize: 13, fontFamily: '"DM Sans", sans-serif', padding: '0 0 14px 0',
          display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        ← Back
      </button>
      <h2 style={{ ...headingStyle, fontSize: 20, marginBottom: 6 }}>Which floor are you scanning?</h2>
      <p style={{ fontSize: 13, color: '#666', fontFamily: '"DM Sans", sans-serif', marginBottom: 20, lineHeight: 1.5 }}>
        Each floor scans separately. Rooms are grouped by floor in the floor plan.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        {FLOOR_OPTIONS.map(({ index, label }) => {
          const alreadyScanned = scannedFloors.has(index);
          const isSelected = selectedFloor === index;
          return (
            <button
              key={index}
              onClick={() => onSelect(index)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '13px 16px', border: `2px solid ${isSelected ? GOLD : BORDER}`,
                borderRadius: 8, background: isSelected ? '#FDF8EC' : WHITE,
                cursor: 'pointer', fontFamily: '"DM Sans", sans-serif',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <span style={{ fontWeight: isSelected ? 700 : 400, color: NAVY, fontSize: 15 }}>
                {label}
              </span>
              {alreadyScanned && (
                <span style={{
                  fontSize: 11, color: '#888', background: '#F0F0F0',
                  borderRadius: 10, padding: '2px 8px', fontWeight: 400,
                }}>
                  already scanned
                </span>
              )}
              {isSelected && !alreadyScanned && (
                <span style={{
                  fontSize: 11, color: GOLD, fontWeight: 700,
                }}>
                  ✓ selected
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <button style={btnGold} onClick={onConfirm}>
          Start Scanning
        </button>
        <button style={{ ...btnNavy, background: '#ccc', color: '#555' }} onClick={onBack}>
          Cancel
        </button>
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
        placeholder="e.g. Master Suite, Game Room, Future Office"
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

function ResultPhase({ room, allRooms, onAddAnother, onDone, headingStyle, btnGold, btnNavy }) {
  const prevRooms = allRooms.filter(r => r.name !== room.name || r !== allRooms[allRooms.length - 1]);
  const totalSqft = allRooms.reduce((s, r) => s + (r.sqft || 0), 0);
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
            { label: 'Length', value: `${(+room.length).toFixed(2)} ft` },
            { label: 'Width', value: `${(+room.width).toFixed(2)} ft` },
            { label: 'Height', value: `${(+room.height).toFixed(2)} ft` },
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

      <div style={{ textAlign: 'left', marginBottom: 20 }}>
        <FloorPlanCanvas rooms={allRooms} highlightLast={true} />
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
