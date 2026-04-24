/**
 * lidar.js — Capacitor bridge for RoomPlan LiDAR scanning
 *
 * On web / non-native: returns realistic mock scan data for UI development.
 * On native iOS: calls the Swift RoomPlanPlugin which wraps Apple's RoomPlan API.
 *
 * Plugin interface contract (implemented in ios/App/CapApp-SPM/Sources/CapApp-SPM/RoomPlanPlugin.swift):
 *   RoomPlanPlugin.startScan({ roomName: string })
 *     → { name, length, width, height, sqft, doors, windows, simulated: false }
 *   RoomPlanPlugin.isSupported()
 *     → { supported: boolean }
 *   RoomPlanPlugin.exportFloorPlan({ rooms })
 *     → { imageBase64: string | null, pdfBase64: string | null }
 */

import { Capacitor, registerPlugin } from '@capacitor/core';
import { floorLabel } from './captureTypes.js';

const RoomPlanPlugin = registerPlugin('RoomPlanPlugin', {
  web: () => ({
    isSupported: async () => ({ supported: false }),
    startScan: async () => { throw new Error('LiDAR only available on native iOS'); },
    startMultiRoomScan: async () => { throw new Error('LiDAR only available on native iOS'); },
    exportFloorPlan: async () => ({ imageBase64: null, pdfBase64: null }),
    startExteriorScan: async () => { throw new Error('Exterior scan only available on native iOS'); },
    startInteriorHeightCapture: async () => { throw new Error('Interior height capture only available on native iOS'); },
  }),
});

const isNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

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
  const exact = MOCK_ROOMS[key];
  if (exact) return exact;
  for (const [k, v] of Object.entries(MOCK_ROOMS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
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
 * Native iOS: queries the Swift plugin (true on iPhone 12 Pro+ / iPad Pro 2020+).
 * Web / non-iOS native: always returns false.
 */
export async function isLidarSupported() {
  if (!isNative) return false;
  try {
    const { supported } = await RoomPlanPlugin.isSupported();
    return !!supported;
  } catch (err) {
    console.warn('[lidar] isSupported failed, falling back to simulation:', err);
    return false;
  }
}

/**
 * Scan a single room.
 * Native iOS with LiDAR: launches RoomPlan scanning UI, returns real dimensions.
 * Web / simulator / non-LiDAR device: simulates with a delay and returns mock data.
 *
 * @param {string} roomName - Name of the room (e.g. "Master Bedroom")
 * @param {function} onProgress - Optional callback for scan progress (0–100) — only used in simulation mode
 * @returns {Promise<{name, length, width, height, sqft, doors, windows, simulated}>}
 */
export async function scanRoom(roomName, onProgress) {
  if (isNative) {
    try {
      const { supported } = await RoomPlanPlugin.isSupported();
      if (supported) {
        const result = await RoomPlanPlugin.startScan({ roomName });
        return { ...result, simulated: false };
      }
    } catch (err) {
      console.warn('[lidar] native scan failed, falling back to simulation:', err);
    }
  }

  // Simulation fallback (web, non-LiDAR device, or native scan error)
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
    objects: [],
    qualityScore: 85,
    qualityGrade: 'B',
    qualityDeductions: [],
    simulated: true,
  };
}

/**
 * Scan multiple rooms in a single continuous ARKit session (Phase 2).
 * Native iOS: launches ContinuousRoomScanViewController — user scans room by room,
 *   names each via the native overlay, taps "Complete — Build Floor Plan" to finish.
 *   Returns all rooms with worldX/worldZ for spatially-accurate floor plan layout.
 * Web / non-LiDAR: returns 3 mock rooms with world coordinates after a brief delay.
 *
 * @returns {Promise<Array<{name,length,width,height,sqft,doors,windows,worldX,worldZ,wallSegments,simulated}>>}
 */
export async function scanMultipleRooms(floorIndex = 0) {
  console.log(`[LIDAR_DEBUG] starting scan on floor ${floorIndex} (${floorLabel(floorIndex)})`);
  if (isNative) {
    try {
      const { supported } = await RoomPlanPlugin.isSupported();
      if (supported) {
        const result = await RoomPlanPlugin.startMultiRoomScan({ floorIndex });
        return (result.rooms || []).map(r => ({ ...r, simulated: false }));
      }
    } catch (err) {
      if (err?.message?.includes('cancelled') || err?.message?.includes('Cancelled')) throw err;
      console.warn('[lidar] multi-room scan failed, falling back to simulation:', err);
    }
  }
  // Web / non-LiDAR simulation — 3 connected rooms laid out spatially
  await new Promise(r => setTimeout(r, 1200));
  return [
    { name: 'Living Room',    length: 18.5, width: 14.0, height: 9.0, sqft: 259, doors: 2, windows: 3, worldX: 0,    worldZ: 0,    floor: floorIndex, objects: [], simulated: true },
    { name: 'Kitchen',        length: 14.0, width: 12.0, height: 9.0, sqft: 168, doors: 1, windows: 2, worldX: 18.5, worldZ: 0,    floor: floorIndex, objects: [], simulated: true },
    { name: 'Master Bedroom', length: 15.0, width: 13.5, height: 9.0, sqft: 202, doors: 1, windows: 2, worldX: 0,    worldZ: 14.0, floor: floorIndex, objects: [], simulated: true },
  ];
}

/**
 * Start an exterior perimeter scan using ARKit corner placement.
 * Native iOS: launches ExteriorScanViewController, user taps corners, shoelace computes area.
 * Web / non-iOS: returns a mock result after a short delay.
 *
 * @returns {Promise<{corners: Array<{x,z}>, perimeterFt: number, areaSqft: number, simulated: boolean}>}
 */
export async function startExteriorScan() {
  if (isNative) {
    try {
      const result = await RoomPlanPlugin.startExteriorScan({});
      return { ...result, simulated: false };
    } catch (err) {
      if (err?.message?.includes('cancelled')) throw err;
      console.warn('[lidar] exterior scan failed, falling back to simulation:', err);
    }
  }
  // Web / non-iOS simulation — mock a rectangular 40×30 building
  await new Promise(r => setTimeout(r, 1000));
  return {
    corners: [
      { x: 0, z: 0 }, { x: 12.2, z: 0 },
      { x: 12.2, z: 9.1 }, { x: 0, z: 9.1 },
    ],
    perimeterFt: 141.8,
    areaSqft: 1196,
    heightMeters: 2.74,
    heightSource: 'auto',
    heightPoints: [2.74],
    qualityScore: 80,
    qualityGrade: 'B',
    qualityDeductions: [],
    simulated: true,
  };
}

/**
 * Interior height capture — AR tap-to-measure for trey/vaulted ceilings.
 * Auto-detects floor plane, user taps ceiling. Returns heightMeters.
 * Native iOS: launches InteriorHeightCaptureViewController.
 * Web: mock result.
 */
export async function startInteriorHeightCapture() {
  if (isNative) {
    try {
      const result = await RoomPlanPlugin.startInteriorHeightCapture({});
      return { ...result, simulated: false };
    } catch (err) {
      if (err?.message?.includes('Cancelled') || err?.message?.includes('cancelled')) throw err;
      console.warn('[lidar] interior height capture failed:', err);
    }
  }
  await new Promise(r => setTimeout(r, 800));
  return { heightMeters: 2.74, heightSource: 'auto', simulated: true };
}

/**
 * Export the full floor plan as an image + PDF.
 * Native iOS (Phase 2): returns base64 image + PDF from RoomPlan's merged model.
 * Web / Phase 1 native: returns null (floor plan rendered client-side via SVG).
 */
export async function exportFloorPlan(rooms) {
  if (isNative) {
    try {
      return await RoomPlanPlugin.exportFloorPlan({ rooms });
    } catch (err) {
      console.warn('[lidar] exportFloorPlan failed:', err);
      return null;
    }
  }
  return null;
}
