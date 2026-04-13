/**
 * lidar.js — Capacitor bridge for RoomPlan LiDAR scanning
 *
 * On web / non-native: returns realistic mock scan data for UI development.
 * On native iOS (post Apple Developer approval + Swift plugin): calls RoomPlanPlugin.
 *
 * Plugin interface contract (what the Swift plugin must implement):
 *   RoomPlanPlugin.startScan({ roomName: string })
 *     → { name, length, width, height, sqft, doors, windows, polygon }
 *   RoomPlanPlugin.isSupported()
 *     → { supported: boolean }
 *   RoomPlanPlugin.exportFloorPlan({ rooms })
 *     → { imageBase64: string, pdfBase64: string }
 */

// Mock room data by room name for realistic web simulation
const MOCK_ROOMS = {
  'living room':    { length: 18.5, width: 14.0, height: 9.0,  doors: 2, windows: 3 },
  'kitchen':        { length: 14.0, width: 12.0, height: 9.0,  doors: 1, windows: 2 },
  'master bedroom': { length: 15.0, width: 13.5, height: 9.0,  doors: 1, windows: 2 },
  'bedroom':        { length: 12.0, width: 11.0, height: 9.0,  doors: 1, windows: 1 },
  'bathroom':       { length: 9.0,  width: 7.5,  height: 9.0,  doors: 1, windows: 1 },
  'master bath':    { length: 11.0, width: 9.0,  height: 9.0,  doors: 1, windows: 1 },
  'dining room':    { length: 13.0, width: 11.5, height: 9.0,  doors: 2, windows: 2 },
  'office':         { length: 11.0, width: 10.0, height: 9.0,  doors: 1, windows: 1 },
  'laundry':        { length: 8.0,  width: 6.0,  height: 9.0,  doors: 1, windows: 0 },
  'garage':         { length: 22.0, width: 20.0, height: 10.0, doors: 2, windows: 1 },
  'basement':       { length: 28.0, width: 24.0, height: 8.0,  doors: 1, windows: 3 },
};

function getMockRoom(name) {
  const key = name.toLowerCase().trim();
  // Try exact match first, then partial match
  const exact = MOCK_ROOMS[key];
  if (exact) return exact;
  for (const [k, v] of Object.entries(MOCK_ROOMS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  // Default: generic room with slight randomness
  return {
    length: Math.round((10 + Math.random() * 8) * 10) / 10,
    width:  Math.round((9  + Math.random() * 6) * 10) / 10,
    height: 9.0,
    doors:  1,
    windows: 1,
  };
}

/**
 * Check if the device supports LiDAR scanning.
 * On web: always returns false (simulation mode).
 * On native: queries the Swift plugin.
 */
export async function isLidarSupported() {
  // RoomPlanPlugin only exists after Capacitor + Swift plugin are built.
  // Until then this always returns false and the scanner runs in simulation mode.
  return false;
}

/**
 * Scan a single room.
 * On web: simulates a scan with a delay and returns mock data.
 * On native: launches the RoomPlan scanning UI.
 *
 * @param {string} roomName - Name of the room (e.g. "Master Bedroom")
 * @param {function} onProgress - Optional callback for scan progress (0–100)
 * @returns {Promise<{name, length, width, height, sqft, doors, windows}>}
 */
export async function scanRoom(roomName, onProgress) {
  // Web / pre-Capacitor simulation — realistic delay with progress callbacks
  // TODO: when Swift plugin exists, replace this block with:
  //   const { RoomPlanPlugin } = await import('./RoomPlanPlugin');
  //   return await RoomPlanPlugin.startScan({ roomName });
  const steps = [10, 25, 40, 60, 75, 90, 100];
  for (const pct of steps) {
    await new Promise(r => setTimeout(r, 180 + Math.random() * 120));
    if (onProgress) onProgress(pct);
  }

  const mock = getMockRoom(roomName);
  const sqft = Math.round(mock.length * mock.width);
  return {
    name: roomName,
    length: mock.length,
    width:  mock.width,
    height: mock.height,
    sqft,
    doors:   mock.doors,
    windows: mock.windows,
    simulated: true,
  };
}

/**
 * Export the full floor plan as an image.
 * On web: returns null (floor plan is rendered client-side via SVG).
 * On native: returns base64 image + PDF from RoomPlan's merged model.
 *
 * @param {Array} rooms - Array of scanned room objects
 * @returns {Promise<{imageBase64, pdfBase64} | null>}
 */
export async function exportFloorPlan(_rooms) {
  // Returns null until Swift plugin is built.
  // TODO: when plugin exists:
  //   const { RoomPlanPlugin } = await import('./RoomPlanPlugin');
  //   return await RoomPlanPlugin.exportFloorPlan({ rooms });
  return null; // Web: floor plan rendered as SVG component
}
