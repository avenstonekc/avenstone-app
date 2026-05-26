// Quick smoke test for normalize.js — run with: node --input-type=module _smoke.mjs
// Or: node avenstone-vite/src/lib/floorPlan/_smoke.mjs

import { snapToGrid, polygonCentroid, polygonAreaSqft, dedupeDoors, normalizeFloorPlan } from './normalize.js';

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

function approx(a, b, tol = 0.01) {
  return Math.abs(a - b) <= tol;
}

// ── snapToGrid ────────────────────────────────────────────────────────────────
console.log('\nsnapToGrid');
{
  const [x, z] = snapToGrid([1.234, 5.678]);
  assert('x snapped to 0.1', approx(x, 1.2));
  assert('z snapped to 0.1', approx(z, 5.7));

  const [x2, z2] = snapToGrid([1.0, 2.0], 0.5);
  assert('custom gridSize 0.5', approx(x2, 1.0) && approx(z2, 2.0));
}

// ── polygonCentroid ───────────────────────────────────────────────────────────
console.log('\npolygonCentroid');
{
  // 10×10 square centroid should be [5, 5]
  const square = [[0,0],[10,0],[10,10],[0,10]];
  const [cx, cz] = polygonCentroid(square);
  assert('square centroid x ≈ 5', approx(cx, 5));
  assert('square centroid z ≈ 5', approx(cz, 5));

  // Degenerate: 2 points → midpoint
  const [mx, mz] = polygonCentroid([[0,0],[4,6]]);
  assert('2-point midpoint x = 2', approx(mx, 2));
  assert('2-point midpoint z = 3', approx(mz, 3));

  // Empty
  const [ex, ez] = polygonCentroid([]);
  assert('empty returns [0,0]', ex === 0 && ez === 0);
}

// ── polygonAreaSqft ───────────────────────────────────────────────────────────
console.log('\npolygonAreaSqft');
{
  // 10×10 square = 100 sqft
  const square = [[0,0],[10,0],[10,10],[0,10]];
  assert('10×10 square = 100 sqft', approx(polygonAreaSqft(square), 100));

  // 5×5 square = 25 sqft
  const small = [[0,0],[5,0],[5,5],[0,5]];
  assert('5×5 square = 25 sqft', approx(polygonAreaSqft(small), 25));

  // meters conversion: 1m² square → 10.7639 sqft
  const oneMeter = [[0,0],[1,0],[1,1],[0,1]];
  assert('1m² = 10.7639 sqft', approx(polygonAreaSqft(oneMeter, 'meters'), 10.7639));
}

// ── dedupeDoors ───────────────────────────────────────────────────────────────
console.log('\ndedupeDoors');
{
  // Two doors at same position, opposite normals → 1 merged door, 2 room_ids
  const raw = [
    { id: 'd1', p1: [10,2], p2: [10,5], midpoint: [10,3.5], width: 3, nx: 1,  nz: 0, room_ids: ['r1'] },
    { id: 'd2', p1: [10,2], p2: [10,5], midpoint: [10,3.5], width: 3, nx: -1, nz: 0, room_ids: ['r2'] },
  ];
  const merged = dedupeDoors(raw, []);
  assert('shared doorway merges to 1 door', merged.length === 1);
  assert('merged door has both room_ids', merged[0].room_ids.includes('r1') && merged[0].room_ids.includes('r2'));

  // Two far-apart doors → 2 kept
  const far = [
    { id: 'f1', p1: [10,0], p2: [10,3], midpoint: [10,1.5], width: 3, nx: 1, nz: 0, room_ids: ['r1'] },
    { id: 'f2', p1: [10,6], p2: [10,9], midpoint: [10,7.5], width: 3, nx: 1, nz: 0, room_ids: ['r1'] },
  ];
  const kept = dedupeDoors(far, []);
  assert('far-apart doors stay distinct (6 ft > 0.5 ft threshold)', kept.length === 2);

  // No normals: proximity alone merges
  const noNorm = [
    { id: 'n1', p1: [0,0], p2: [0,3], midpoint: [0,1.5], width: 3, nx: null, nz: null, room_ids: ['r1'] },
    { id: 'n2', p1: [0,0], p2: [0,3], midpoint: [0,1.5], width: 3, nx: null, nz: null, room_ids: ['r2'] },
  ];
  const normMerge = dedupeDoors(noNorm, []);
  assert('no-normal doors merge on proximity alone', normMerge.length === 1);

  // Perpendicular normals: close but different wall → not merged
  const perp = [
    { id: 'p1', p1: [0,0], p2: [0,3], midpoint: [0,1.5], width: 3, nx: 1, nz: 0, room_ids: ['r1'] },
    { id: 'p2', p1: [0,0], p2: [0,3], midpoint: [0,1.5], width: 3, nx: 0, nz: 1, room_ids: ['r2'] },
  ];
  const perpKept = dedupeDoors(perp, []);
  assert('perpendicular normals at same position not merged', perpKept.length === 2);
}

// ── normalizeFloorPlan ────────────────────────────────────────────────────────
console.log('\nnormalizeFloorPlan');
{
  // Error paths
  assert('null input → ok:false', normalizeFloorPlan(null).ok === false);
  assert('missing rooms → ok:false', normalizeFloorPlan({}).ok === false);

  // 2-room scan: Kitchen 10×10 + Hallway 5×5, shared door at x=10
  const scan = {
    scanner_version: 'smoke-1.0',
    rooms: [
      {
        id: 'r1', name: 'Kitchen', worldX: 0, worldZ: 0,
        wallSegments: [
          {x1:0,z1:0,x2:10,z2:0}, {x1:10,z1:0,x2:10,z2:10},
          {x1:10,z1:10,x2:0,z2:10}, {x1:0,z1:10,x2:0,z2:0},
        ],
        doorSegments: [{x1:10,z1:2,x2:10,z2:5, nx:1,nz:0, width:3}],
        windowSegments: [{x1:0,z1:4,x2:0,z2:7}],
      },
      {
        id: 'r2', name: 'Hallway', worldX: 10, worldZ: 0,
        wallSegments: [
          {x1:0,z1:0,x2:5,z2:0}, {x1:5,z1:0,x2:5,z2:5},
          {x1:5,z1:5,x2:0,z2:5}, {x1:0,z1:5,x2:0,z2:0},
        ],
        doorSegments: [{x1:0,z1:2,x2:0,z2:5, nx:-1,nz:0, width:3}],
        windowSegments: [],
      },
    ],
  };

  const result = normalizeFloorPlan(scan);
  assert('ok:true', result.ok === true);

  const { rooms, walls, doors, windows, metadata } = result.data;
  assert('2 rooms', rooms.length === 2);

  const kitchen = rooms.find(r => r.id === 'r1');
  const hallway = rooms.find(r => r.id === 'r2');
  assert('kitchen exists', !!kitchen);
  assert('hallway exists', !!hallway);
  assert('kitchen area ≈ 100 sqft', approx(kitchen.area_sqft, 100, 1));
  assert('hallway area ≈ 25 sqft', approx(hallway.area_sqft, 25, 1));

  assert('shared door deduped to 1', doors.length === 1);
  assert('shared door has both room_ids', doors[0].room_ids.includes('r1') && doors[0].room_ids.includes('r2'));
  assert('door width = 3', approx(doors[0].width, 3));

  assert('1 window', windows.length === 1);
  assert('window belongs to r1', windows[0].room_id === 'r1');

  assert('walls present', walls.length > 0);
  assert('metadata.room_count = 2', metadata.room_count === 2);
  assert('metadata.scanner_version set', metadata.scanner_version === 'smoke-1.0');
  assert('normalize_version = 1', metadata.normalize_version === 1);
  assert('total_area ≈ 125 sqft', approx(metadata.total_area_sqft, 125, 2));
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
