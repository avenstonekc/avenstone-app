// Quick smoke test for normalize.js — run with: node --input-type=module _smoke.mjs
// Or: node avenstone-vite/src/lib/floorPlan/_smoke.mjs

import { snapToGrid, polygonCentroid, polygonAreaSqft, dedupeDoors, normalizeFloorPlan, classifyAndStandardizeWalls, isPolygonSelfIntersecting } from './normalize.js';

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

// ── classifyAndStandardizeWalls ───────────────────────────────────────────────
console.log('\nclassifyAndStandardizeWalls');
{
  const EXT = 5.5 / 12;
  const INT = 3.5 / 12;

  // ── Test 1: single-room — all walls exterior ────────────────────────────────
  {
    const scan = {
      rooms: [{
        id: 's1', name: 'Room', worldX: 0, worldZ: 0,
        wallSegments: [
          {x1:0,z1:0,x2:10,z2:0}, {x1:10,z1:0,x2:10,z2:10},
          {x1:10,z1:10,x2:0,z2:10}, {x1:0,z1:10,x2:0,z2:0},
        ],
        doorSegments: [], windowSegments: [],
      }],
    };
    const result = normalizeFloorPlan(scan);
    const walls = result.data.walls;
    assert('single room: all 4 walls exterior', walls.every(w => w.classification === 'exterior'));
    assert('single room: thickness = 2x6 standard', walls.every(w => approx(w.thickness_ft, EXT, 0.001)));
    assert('single room: each wall adjoins 1 room', walls.every(w => w.adjoining_room_ids.length === 1));
  }

  // ── Test 2: two adjacent rooms — shared wall interior ───────────────────────
  {
    const scan = {
      rooms: [
        {
          id: 'r1', name: 'Room A', worldX: 0, worldZ: 0,
          wallSegments: [
            {x1:0,z1:0,x2:10,z2:0}, {x1:10,z1:0,x2:10,z2:10},
            {x1:10,z1:10,x2:0,z2:10}, {x1:0,z1:10,x2:0,z2:0},
          ],
          doorSegments: [], windowSegments: [],
        },
        {
          id: 'r2', name: 'Room B', worldX: 10, worldZ: 0,
          wallSegments: [
            {x1:0,z1:0,x2:5,z2:0}, {x1:5,z1:0,x2:5,z2:10},
            {x1:5,z1:10,x2:0,z2:10}, {x1:0,z1:10,x2:0,z2:0},
          ],
          doorSegments: [], windowSegments: [],
        },
      ],
    };
    const result = normalizeFloorPlan(scan);
    const walls = result.data.walls;
    const intWalls = walls.filter(w => w.classification === 'interior');
    const extWalls = walls.filter(w => w.classification === 'exterior');
    assert('two rooms: 2 shared walls classified interior', intWalls.length === 2);
    assert('two rooms: interior thickness = 2x4 standard', intWalls.every(w => approx(w.thickness_ft, INT, 0.001)));
    assert('two rooms: interior walls each adjoin both rooms', intWalls.every(w => w.adjoining_room_ids.includes('r1') && w.adjoining_room_ids.includes('r2')));
    assert('two rooms: 6 outer walls still exterior', extWalls.length === 6);
  }

  // ── Test 3: three rooms in a row — middle shared walls interior ─────────────
  {
    const scan = {
      rooms: [
        {
          id: 'a', name: 'Left', worldX: 0, worldZ: 0,
          wallSegments: [
            {x1:0,z1:0,x2:5,z2:0}, {x1:5,z1:0,x2:5,z2:10},
            {x1:5,z1:10,x2:0,z2:10}, {x1:0,z1:10,x2:0,z2:0},
          ],
          doorSegments: [], windowSegments: [],
        },
        {
          id: 'b', name: 'Middle', worldX: 5, worldZ: 0,
          wallSegments: [
            {x1:0,z1:0,x2:5,z2:0}, {x1:5,z1:0,x2:5,z2:10},
            {x1:5,z1:10,x2:0,z2:10}, {x1:0,z1:10,x2:0,z2:0},
          ],
          doorSegments: [], windowSegments: [],
        },
        {
          id: 'c', name: 'Right', worldX: 10, worldZ: 0,
          wallSegments: [
            {x1:0,z1:0,x2:5,z2:0}, {x1:5,z1:0,x2:5,z2:10},
            {x1:5,z1:10,x2:0,z2:10}, {x1:0,z1:10,x2:0,z2:0},
          ],
          doorSegments: [], windowSegments: [],
        },
      ],
    };
    const result = normalizeFloorPlan(scan);
    const walls = result.data.walls;
    const intWalls = walls.filter(w => w.classification === 'interior');
    const extWalls = walls.filter(w => w.classification === 'exterior');
    assert('3 rooms in a row: 4 interior walls (2 shared boundaries)', intWalls.length === 4);
    assert('3 rooms in a row: 8 exterior walls', extWalls.length === 8);
  }

  // ── Test 4: raw thickness preserved ─────────────────────────────────────────
  {
    const scan = {
      rooms: [{
        id: 't1', name: 'Room', worldX: 0, worldZ: 0,
        wallSegments: [
          {x1:0,z1:0,x2:10,z2:0, thickness:0.7},  // noisy scanner value
          {x1:10,z1:0,x2:10,z2:10},
          {x1:10,z1:10,x2:0,z2:10},
          {x1:0,z1:10,x2:0,z2:0},
        ],
        doorSegments: [], windowSegments: [],
      }],
    };
    const result = normalizeFloorPlan(scan);
    const wallWithRaw = result.data.walls.find(w => w.thickness_raw_ft !== null);
    assert('raw scanner thickness preserved as thickness_raw_ft', wallWithRaw?.thickness_raw_ft === 0.7);
    assert('standardized thickness overrides scanner value', approx(wallWithRaw?.thickness_ft, EXT, 0.001));
  }

  // ── Test 5: adjoining_room_ids count ────────────────────────────────────────
  {
    const rooms = [
      { id: 'x1', polygon: [[0,0],[10,0],[10,10],[0,10]] },
      { id: 'x2', polygon: [[10,0],[15,0],[15,10],[10,10]] },
    ];
    const walls = [
      { id: 'w_shared', p1: [10,0], p2: [10,10] },
      { id: 'w_outer',  p1: [0,0],  p2: [0,10]  },
    ];
    const classified = classifyAndStandardizeWalls(walls, rooms);
    const shared = classified.find(w => w.id === 'w_shared');
    const outer  = classified.find(w => w.id === 'w_outer');
    assert('interior wall adjoining_room_ids length = 2', shared.adjoining_room_ids.length === 2);
    assert('exterior wall adjoining_room_ids length = 1', outer.adjoining_room_ids.length === 1);
  }

  // ── Test 6: override options ─────────────────────────────────────────────────
  {
    const scan = {
      rooms: [
        {
          id: 'o1', name: 'A', worldX: 0, worldZ: 0,
          wallSegments: [
            {x1:0,z1:0,x2:5,z2:0}, {x1:5,z1:0,x2:5,z2:5},
            {x1:5,z1:5,x2:0,z2:5}, {x1:0,z1:5,x2:0,z2:0},
          ],
          doorSegments: [], windowSegments: [],
        },
        {
          id: 'o2', name: 'B', worldX: 5, worldZ: 0,
          wallSegments: [
            {x1:0,z1:0,x2:5,z2:0}, {x1:5,z1:0,x2:5,z2:5},
            {x1:5,z1:5,x2:0,z2:5}, {x1:0,z1:5,x2:0,z2:0},
          ],
          doorSegments: [], windowSegments: [],
        },
      ],
    };
    const result = normalizeFloorPlan(scan, { interiorWallThicknessFt: 0.5 });
    const intWalls = result.data.walls.filter(w => w.classification === 'interior');
    assert('override interiorWallThicknessFt applied', intWalls.length > 0 && intWalls.every(w => approx(w.thickness_ft, 0.5, 0.001)));
  }

  // ── Test 7: adjacency tolerance — 0.04 ft off boundary (within 0.05) ────────
  {
    const rooms = [{ id: 'r1', polygon: [[0,0],[10,0],[10,10],[0,10]] }];
    const walls = [{ id: 'wt', p1: [0.04, 2], p2: [0.04, 8] }];
    const classified = classifyAndStandardizeWalls(walls, rooms, { adjacencyToleranceFt: 0.05 });
    assert('wall 0.04 ft off boundary adjoin within 0.05 tolerance', classified[0].adjoining_room_ids.includes('r1'));
  }

  // ── Test 8: adjacency tolerance — 0.1 ft off boundary (outside 0.05) ────────
  {
    const rooms = [{ id: 'r1', polygon: [[0,0],[10,0],[10,10],[0,10]] }];
    const walls = [{ id: 'wf', p1: [0.1, 2], p2: [0.1, 8] }];
    const classified = classifyAndStandardizeWalls(walls, rooms, { adjacencyToleranceFt: 0.05 });
    assert('wall 0.1 ft off boundary not adjoining outside 0.05 tolerance', !classified[0].adjoining_room_ids.includes('r1'));
  }
}

// ── isPolygonSelfIntersecting + ring construction ─────────────────────────────
console.log('\nisPolygonSelfIntersecting + ring construction');
{
  // Rectangle regression: 4 segments in order → valid ring, no needs_review
  const rectScan = {
    rooms: [{
      id: 'rect', name: 'Rect', worldX: 0, worldZ: 0,
      wallSegments: [
        {x1:0,z1:0,x2:10,z2:0}, {x1:10,z1:0,x2:10,z2:10},
        {x1:10,z1:10,x2:0,z2:10}, {x1:0,z1:10,x2:0,z2:0},
      ],
      doorSegments: [], windowSegments: [],
    }],
  };
  const rectResult = normalizeFloorPlan(rectScan);
  assert('rectangle: ok', rectResult.ok === true);
  const rectRoom = rectResult.data.rooms[0];
  assert('rectangle: area ≈ 100 sqft', approx(rectRoom.area_sqft, 100, 1));
  assert('rectangle: no needs_review flag', !rectRoom.needs_review);
  assert('rectangle: polygon not self-intersecting', !isPolygonSelfIntersecting(rectRoom.polygon));

  // L-shape: 6 segments in scrambled order → area = 75 sqft, no self-intersection
  const lScan = {
    rooms: [{
      id: 'lshape', name: 'L-Shape', worldX: 0, worldZ: 0,
      wallSegments: [
        {x1:5,z1:10,x2:0,z2:10},   // top (scrambled order)
        {x1:0,z1:0,x2:10,z2:0},    // bottom
        {x1:10,z1:5,x2:5,z2:5},    // inner horizontal
        {x1:0,z1:10,x2:0,z2:0},    // left side
        {x1:10,z1:0,x2:10,z2:5},   // right side
        {x1:5,z1:5,x2:5,z2:10},    // inner vertical
      ],
      doorSegments: [], windowSegments: [],
    }],
  };
  const lResult = normalizeFloorPlan(lScan);
  assert('L-shape: ok', lResult.ok === true);
  const lRoom = lResult.data.rooms[0];
  assert('L-shape: area ≈ 75 sqft', approx(lRoom.area_sqft, 75, 1));
  assert('L-shape: no needs_review', !lRoom.needs_review);
  assert('L-shape: polygon not self-intersecting', !isPolygonSelfIntersecting(lRoom.polygon));

  // U-shape: 8 segments → area = 32 sqft, no self-intersection
  const uScan = {
    rooms: [{
      id: 'ushape', name: 'U-Shape', worldX: 0, worldZ: 0,
      wallSegments: [
        {x1:0,z1:0,x2:8,z2:0},    // bottom
        {x1:8,z1:0,x2:8,z2:6},    // right outer
        {x1:8,z1:6,x2:6,z2:6},    // right inner top
        {x1:6,z1:6,x2:6,z2:2},    // right inner side
        {x1:6,z1:2,x2:2,z2:2},    // inner bottom
        {x1:2,z1:2,x2:2,z2:6},    // left inner side
        {x1:2,z1:6,x2:0,z2:6},    // left inner top
        {x1:0,z1:6,x2:0,z2:0},    // left outer
      ],
      doorSegments: [], windowSegments: [],
    }],
  };
  const uResult = normalizeFloorPlan(uScan);
  assert('U-shape: ok', uResult.ok === true);
  const uRoom = uResult.data.rooms[0];
  assert('U-shape: area ≈ 32 sqft', approx(uRoom.area_sqft, 32, 1));
  assert('U-shape: no needs_review', !uRoom.needs_review);
  assert('U-shape: polygon not self-intersecting', !isPolygonSelfIntersecting(uRoom.polygon));

  // Gapped room: one endpoint 0.2 ft off (> _RING_EPS) → needs_review=true, no throw
  const gapScan = {
    rooms: [{
      id: 'gapped', name: 'Gapped', worldX: 0, worldZ: 0,
      wallSegments: [
        {x1:0,z1:0,x2:5,z2:0},
        {x1:5,z1:0,x2:5,z2:5},
        {x1:5,z1:5,x2:0,z2:5},
        {x1:0.2,z1:5,x2:0.2,z2:0},  // 0.2 ft gap at start endpoint
      ],
      doorSegments: [], windowSegments: [],
    }],
  };
  const gapResult = normalizeFloorPlan(gapScan);
  assert('gapped room: ok (no throw)', gapResult.ok === true);
  const gapRoom = gapResult.data.rooms[0];
  assert('gapped room: needs_review = true', gapRoom.needs_review === true);

  // isPolygonSelfIntersecting: bowtie → true
  const bowtie = [[0,0],[10,10],[10,0],[0,10]];
  assert('bowtie polygon is self-intersecting', isPolygonSelfIntersecting(bowtie) === true);

  // isPolygonSelfIntersecting: convex square → false
  const square = [[0,0],[10,0],[10,10],[0,10]];
  assert('convex square is not self-intersecting', isPolygonSelfIntersecting(square) === false);

  // isPolygonSelfIntersecting: triangle (<4 pts) → false
  const tri = [[0,0],[5,10],[10,0]];
  assert('triangle (<4 pts) → false', isPolygonSelfIntersecting(tri) === false);
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
