// Regression test — SCAN_EXPORT_FIX Slice 1
// Run: node --experimental-vm-modules tools/test_polygon_area.mjs
//   or: node tools/test_polygon_area.mjs  (Node 22+)
//
// Asserts:
//   1. normalizeFloorPlan → per-room area_sqft ≈ PDF ground truth for Pawnee scan 1c6b2257
//   2. buildScanArtifact uses normalized area, NOT bounding-box L×W
//   3. v2 artifact bounding_length/bounding_width carry the original dims; length/width absent

import { normalizeFloorPlan } from '../avenstone-vite/src/lib/floorPlan/normalize.js';
import { buildScanArtifact, SCAN_ARTIFACT_VERSION } from '../avenstone-vite/src/lib/scanArtifact.js';

let passed = 0, failed = 0;

function assert(condition, label, detail = '') {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

// ── Fixture: scan 1c6b2257 (Pawnee "Main Floor — Kitchen / Laundry / Great Room") ──
// Raw rooms exactly as stored in job_lidar_scans.rooms JSONB.
// PDF ground truth: Kitchen=402, Laundry=118, Living=673, total=1,190 (±tolerance).

const FIXTURE_SCAN = {
  id: '1c6b2257-cd11-4356-93d1-1752b0a54df9',
  scan_name: 'Main Floor — Kitchen / Laundry / Great Room',
  total_sqft: 2784,
  capture_mode: 'interior',
  height_meters: 5.505,
  rooms: [
    {
      name: 'Laundry Room', sqft: 232, length: 16.17, width: 14.36, height: 9.11,
      doors: 2, windows: 1, floor: 0,
      worldX: 38.491, worldZ: 42.246,
      wallSegments: [
        { x1: 14.362, z1: 7.769,  x2: 5.909,  z2: 0 },
        { x1: 6.644,  z1: 16.167, x2: 14.362, z2: 7.769 },
        { x1: 2.234,  z1: 12.113, x2: 6.644,  z2: 16.167 },
        { x1: 4.016,  z1: 10.174, x2: 2.234,  z2: 12.113 },
        { x1: 0,      z1: 6.483,  x2: 4.016,  z2: 10.174 },
        { x1: 5.909,  z1: 0,      x2: 0,      z2: 6.483 },
      ],
      doorSegments: [], windowSegments: [], openingSegments: [], objects: [],
    },
    {
      name: 'Kitchen', sqft: 813, length: 27.71, width: 29.33, height: 9.11,
      doors: 3, windows: 0, floor: 0,
      worldX: 15.598, worldZ: 23.079,
      wallSegments: [
        { x1: 29.331, z1: 18.587, x2: 28.611, z2: 13.680 },
        { x1: 28.611, z1: 13.680, x2: 14.056, z2: 0 },
        { x1: 0,      z1: 8.548,  x2: 21.019, z2: 27.706 },
        { x1: 21.019, z1: 27.706, x2: 29.331, z2: 18.587 },
        { x1: 14.056, z1: 0,      x2: 5.806,  z2: 8.976 },
      ],
      doorSegments: [], windowSegments: [], openingSegments: [], objects: [],
    },
    {
      name: 'Living Room', sqft: 1739, length: 43.57, width: 39.92, height: 18.06,
      doors: 4, windows: 4, floor: 0,
      worldX: 0, worldZ: 0,
      wallSegments: [
        { x1: 39.917, z1: 11.913, x2: 26.956, z2: 0 },
        { x1: 11.918, z1: 22.892, x2: 21.444, z2: 31.648 },
        { x1: 0,      z1: 36.273, x2: 7.942,  z2: 43.573 },
        { x1: 8.397,  z1: 19.935, x2: 2.074,  z2: 26.814 },
        { x1: 5.663,  z1: 30.112, x2: 0,      z2: 36.273 },
        { x1: 3.768,  z1: 15.681, x2: 8.397,  z2: 19.935 },
        { x1: 10.889, z1: 17.481, x2: 8.265,  z2: 15.069 },
        { x1: 12.772, z1: 38.318, x2: 15.760, z2: 32.550 },
        { x1: 2.074,  z1: 26.814, x2: 2.770,  z2: 27.454 },
        { x1: 8.865,  z1: 26.212, x2: 9.384,  z2: 25.648 },
        { x1: 21.444, z1: 31.648, x2: 22.110, z2: 31.193 },
        { x1: 15.760, z1: 32.550, x2: 8.865,  z2: 26.212 },
        { x1: 26.956, z1: 0,      x2: 10.889, z2: 17.481 },
        { x1: 2.074,  z1: 26.814, x2: 5.663,  z2: 30.112 },
        { x1: 7.942,  z1: 43.573, x2: 12.772, z2: 38.318 },
        { x1: 8.865,  z1: 26.212, x2: 11.918, z2: 22.892 },
        { x1: 22.110, z1: 31.193, x2: 39.917, z2: 11.913 },
      ],
      doorSegments: [], windowSegments: [], openingSegments: [], objects: [],
    },
  ],
};

console.log('\nSCAN_EXPORT_FIX Slice 1 — polygon area regression\n');

// ── Part 1: normalizeFloorPlan gives correct per-room areas ──────────────────

const normResult = normalizeFloorPlan({ rooms: FIXTURE_SCAN.rooms, scanner_version: null });
assert(normResult.ok, 'normalizeFloorPlan succeeds');

if (normResult.ok) {
  const normRooms = normResult.data.rooms;
  const [laundry, kitchen, living] = normRooms;

  console.log(`\n  Normalized areas: Laundry=${Math.round(laundry.area_sqft)}, Kitchen=${Math.round(kitchen.area_sqft)}, Living=${Math.round(living.area_sqft)}`);
  console.log(`  Bounding boxes:   Laundry=${Math.round(16.17*14.36)}, Kitchen=${Math.round(27.71*29.33)}, Living=${Math.round(43.57*39.92)}\n`);

  assert(Math.abs(Math.round(laundry.area_sqft) - 118) <= 15,
    `Laundry polygon ≈ 118 sf (got ${Math.round(laundry.area_sqft)})`);
  assert(Math.abs(Math.round(kitchen.area_sqft) - 402) <= 20,
    `Kitchen polygon ≈ 402 sf (got ${Math.round(kitchen.area_sqft)})`);
  assert(Math.abs(Math.round(living.area_sqft) - 673) <= 30,
    `Living Room polygon ≈ 673 sf (got ${Math.round(living.area_sqft)})`);

  const normTotal = normRooms.reduce((s, r) => s + Math.round(r.area_sqft), 0);
  assert(Math.abs(normTotal - 1190) <= 50,
    `Normalize total ≈ 1,190 sf (got ${normTotal}, bounding-box was 2,784)`);

  // ── Part 2: buildScanArtifact uses normalized area, not bounding box ─────

  // Inject normalized_geometry (simulating what sbSaveJobLidarScan stores)
  const scanWithNorm = { ...FIXTURE_SCAN, normalized_geometry: normResult.data };
  const artifact = buildScanArtifact(scanWithNorm);

  assert(artifact.version === SCAN_ARTIFACT_VERSION && artifact.version === 2,
    `Artifact version is 2 (got ${artifact.version})`);

  const aRooms = artifact.scan.rooms;
  const [aLaundry, aKitchen, aLiving] = aRooms;

  assert(Math.abs(aLaundry.sqft - Math.round(laundry.area_sqft)) <= 1,
    `Artifact Laundry sqft = polygon area (${aLaundry.sqft})`);
  assert(Math.abs(aKitchen.sqft - Math.round(kitchen.area_sqft)) <= 1,
    `Artifact Kitchen sqft = polygon area (${aKitchen.sqft})`);
  assert(Math.abs(aLiving.sqft - Math.round(living.area_sqft)) <= 1,
    `Artifact Living Room sqft = polygon area (${aLiving.sqft})`);

  assert(aKitchen.sqft !== Math.round(27.71 * 29.33),
    `Artifact Kitchen sqft ≠ bounding box (${aKitchen.sqft} ≠ ${Math.round(27.71*29.33)})`);

  // ── Part 3: bounding_length/bounding_width carry original dims ────────────

  assert(aKitchen.bounding_length === 27.71, `Kitchen bounding_length = 27.71 (got ${aKitchen.bounding_length})`);
  assert(aKitchen.bounding_width  === 29.33, `Kitchen bounding_width = 29.33 (got ${aKitchen.bounding_width})`);
  assert(!('length' in aKitchen), `Kitchen has no .length field (bounding dims renamed)`);
  assert(!('width'  in aKitchen), `Kitchen has no .width field (bounding dims renamed)`);

  const artifactTotal = artifact.scan.total_sqft;
  assert(Math.abs(artifactTotal - normTotal) <= 2,
    `Artifact total_sqft = sum of polygon areas (${artifactTotal} ≈ ${normTotal})`);

  assert(artifactTotal !== FIXTURE_SCAN.total_sqft,
    `Artifact total_sqft ≠ original bounding-box total (${artifactTotal} ≠ ${FIXTURE_SCAN.total_sqft})`);

  assert('scan_name' in artifact.scan,
    `Artifact carries scan_name (${artifact.scan.scan_name})`);
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
