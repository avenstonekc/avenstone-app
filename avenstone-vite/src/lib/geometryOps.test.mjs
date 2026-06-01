/**
 * Smoke tests for geometryOps.js — run with: node geometryOps.test.mjs
 */

import { applyOp, applyOps } from './geometryOps.js';
import assert from 'node:assert/strict';

// ── Fixture ───────────────────────────────────────────────────────────────────

/** Two 5×10 ft rooms side by side (total 10×10). */
function mkGeometry() {
  return {
    rooms: [
      {
        id: 'room_0', name: 'Living Room', type: null,
        polygon: [[0,0],[5,0],[5,10],[0,10]],
        centroid: [2.5,5], area_sqft: 50,
        worldX: 0, worldZ: 0, height: 9, floor: 0,
      },
      {
        id: 'room_1', name: 'Bedroom', type: null,
        polygon: [[5,0],[10,0],[10,10],[5,10]],
        centroid: [7.5,5], area_sqft: 50,
        worldX: 5, worldZ: 0, height: 9, floor: 0,
      },
    ],
    walls: [
      { id: 'wall_0_0', p1:[0,0],  p2:[5,0],  room_id:'room_0', classification:'exterior', adjoining_room_ids:[], thickness_ft:0.458, thickness_raw_ft:null },
      { id: 'wall_0_1', p1:[5,0],  p2:[5,10], room_id:'room_0', classification:'interior', adjoining_room_ids:['room_1'], thickness_ft:0.292, thickness_raw_ft:null },
      { id: 'wall_0_2', p1:[5,10], p2:[0,10], room_id:'room_0', classification:'exterior', adjoining_room_ids:[], thickness_ft:0.458, thickness_raw_ft:null },
      { id: 'wall_0_3', p1:[0,10], p2:[0,0],  room_id:'room_0', classification:'exterior', adjoining_room_ids:[], thickness_ft:0.458, thickness_raw_ft:null },
      { id: 'wall_1_0', p1:[5,0],  p2:[10,0], room_id:'room_1', classification:'exterior', adjoining_room_ids:[], thickness_ft:0.458, thickness_raw_ft:null },
      { id: 'wall_1_1', p1:[10,0], p2:[10,10],room_id:'room_1', classification:'exterior', adjoining_room_ids:[], thickness_ft:0.458, thickness_raw_ft:null },
      { id: 'wall_1_2', p1:[10,10],p2:[5,10], room_id:'room_1', classification:'exterior', adjoining_room_ids:[], thickness_ft:0.458, thickness_raw_ft:null },
      { id: 'wall_1_3', p1:[5,10], p2:[5,0],  room_id:'room_1', classification:'interior', adjoining_room_ids:['room_0'], thickness_ft:0.292, thickness_raw_ft:null },
    ],
    doors: [{
      id: 'door_0', p1:[5,4], p2:[5,6], midpoint:[5,5],
      width: 2, height: 7, nx: 1, nz: 0, room_ids: ['room_0','room_1'],
    }],
    windows: [{
      id: 'win_0', p1:[10,3], p2:[10,6], midpoint:[10,4.5], width: 3, room_id: 'room_1',
    }],
    metadata: { scanner_version: null, total_area_sqft: 100, room_count: 2, normalize_version: 1 },
  };
}

// ── Runner ────────────────────────────────────────────────────────────────────

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

// ── relabel_room ──────────────────────────────────────────────────────────────
console.log('\nrelabel_room');

test('renames a room', () => {
  const r = applyOp(mkGeometry(), { op: 'relabel_room', room_id: 'room_0', name: 'Kitchen' });
  assert.ok(r.ok, r.error);
  assert.equal(r.data.rooms[0].name, 'Kitchen');
});

test('sets type', () => {
  const r = applyOp(mkGeometry(), { op: 'relabel_room', room_id: 'room_1', type: 'bedroom' });
  assert.ok(r.ok, r.error);
  assert.equal(r.data.rooms[1].type, 'bedroom');
});

test('rejects unknown room', () => {
  const r = applyOp(mkGeometry(), { op: 'relabel_room', room_id: 'room_99' });
  assert.ok(!r.ok);
});

test('does not mutate input geometry', () => {
  const g = mkGeometry();
  applyOp(g, { op: 'relabel_room', room_id: 'room_0', name: 'X' });
  assert.equal(g.rooms[0].name, 'Living Room');
});

// ── move_corner ───────────────────────────────────────────────────────────────
console.log('\nmove_corner');

test('moves a corner and grows area', () => {
  // Stretch room_0 right by moving corner [5,0] to [6,0]
  const r = applyOp(mkGeometry(), { op: 'move_corner', room_id: 'room_0', corner_index: 1, to: [6,0] });
  assert.ok(r.ok, r.error);
  assert.deepEqual(r.data.rooms[0].polygon[1], [6,0]);
  assert.ok(r.data.rooms[0].area_sqft > 50, 'area should increase');
});

test('propagates shared vertex to adjacent room', () => {
  // corner_index 1 of room_0 is [5,0], which is also in room_1
  const r = applyOp(mkGeometry(), { op: 'move_corner', room_id: 'room_0', corner_index: 1, to: [6,0] });
  assert.ok(r.ok, r.error);
  const room1 = r.data.rooms.find(r => r.id === 'room_1');
  assert.ok(room1.polygon.some(p => p[0] === 6 && p[1] === 0), 'room_1 should have the moved vertex');
});

test('rejects out-of-range corner_index', () => {
  const r = applyOp(mkGeometry(), { op: 'move_corner', room_id: 'room_0', corner_index: 99, to: [0,0] });
  assert.ok(!r.ok);
});

// ── move_wall ─────────────────────────────────────────────────────────────────
console.log('\nmove_wall');

test('shifts wall endpoints by delta', () => {
  // Shift wall_0_0 ([0,0]→[5,0]) inward by [0, 1]
  const r = applyOp(mkGeometry(), { op: 'move_wall', wall_id: 'wall_0_0', delta: [0, 1] });
  assert.ok(r.ok, r.error);
  const poly = r.data.rooms[0].polygon;
  assert.ok(poly.some(p => Math.abs(p[0]-0) < 0.01 && Math.abs(p[1]-1) < 0.01), 'vertex [0,1] expected');
  assert.ok(poly.some(p => Math.abs(p[0]-5) < 0.01 && Math.abs(p[1]-1) < 0.01), 'vertex [5,1] expected');
});

test('rejects unknown wall', () => {
  const r = applyOp(mkGeometry(), { op: 'move_wall', wall_id: 'wall_99', delta: [0, 0] });
  assert.ok(!r.ok);
});

test('updates metadata after move', () => {
  const r = applyOp(mkGeometry(), { op: 'move_wall', wall_id: 'wall_0_0', delta: [0, 1] });
  assert.ok(r.ok, r.error);
  // room_0 loses 5 sqft (5 ft wide × 1 ft shift)
  assert.ok(Math.abs(r.data.rooms[0].area_sqft - 45) < 1, `expected ~45 sqft, got ${r.data.rooms[0].area_sqft}`);
});

// ── add_wall / delete_wall ────────────────────────────────────────────────────
console.log('\nadd_wall / delete_wall');

test('inserts a new vertex into the polygon', () => {
  const r = applyOp(mkGeometry(), { op: 'add_wall', room_id: 'room_0', p1: [0,0], p2: [2.5,0] });
  assert.ok(r.ok, r.error);
  assert.equal(r.data.rooms[0].polygon.length, 5);
  assert.ok(r.data.rooms[0].polygon.some(p => Math.abs(p[0]-2.5) < 0.01 && Math.abs(p[1]-0) < 0.01));
});

test('add_wall rejects unknown room', () => {
  const r = applyOp(mkGeometry(), { op: 'add_wall', room_id: 'room_99', p1: [0,0], p2: [1,0] });
  assert.ok(!r.ok);
});

test('add_wall rejects p1 not on polygon', () => {
  const r = applyOp(mkGeometry(), { op: 'add_wall', room_id: 'room_0', p1: [3,3], p2: [4,4] });
  assert.ok(!r.ok);
});

test('delete_wall removes a vertex and restores polygon', () => {
  // Add then delete to verify round-trip
  const g1 = applyOp(mkGeometry(), { op: 'add_wall', room_id: 'room_0', p1: [0,0], p2: [2.5,0] });
  assert.ok(g1.ok, g1.error);
  // The new wall starts at p1=[0,0] (vertex just before [2.5,0] was inserted)
  // wallsFromPolygon assigns id=wall_room_0_N; find the one ending at [2.5,0]
  const newWall = g1.data.walls.find(w => w.room_id === 'room_0' &&
    Math.abs(w.p2[0]-2.5) < 0.01 && Math.abs(w.p2[1]-0) < 0.01);
  assert.ok(newWall, 'new wall should exist');
  const g2 = applyOp(g1.data, { op: 'delete_wall', wall_id: newWall.id });
  assert.ok(g2.ok, g2.error);
  assert.equal(g2.data.rooms[0].polygon.length, 4, 'polygon should be back to 4 vertices');
});

test('delete_wall rejects reducing below 3 vertices', () => {
  // Create a triangle room and try to delete a wall
  const g = mkGeometry();
  g.rooms[0].polygon = [[0,0],[5,0],[0,5]];
  const r1 = applyOp(g, { op: 'add_wall', room_id: 'room_0', p1: [5,0], p2: [2.5, 2.5] });
  // After add: 4 vertices. Now delete any wall to get back to 3, which is ok.
  // Instead just try to delete from a 3-vertex polygon directly
  const wall = g.walls.find(w => w.room_id === 'room_0');
  // Build minimal 3-vertex geometry manually
  const g2 = mkGeometry();
  g2.rooms[0].polygon = [[0,0],[5,0],[0,5]];
  g2.walls = g2.walls.filter(w => w.room_id !== 'room_0');
  g2.walls.push(
    { id: 'tw_0', p1:[0,0], p2:[5,0], room_id:'room_0', classification:'exterior', adjoining_room_ids:[], thickness_ft:0.458, thickness_raw_ft:null },
    { id: 'tw_1', p1:[5,0], p2:[0,5], room_id:'room_0', classification:'exterior', adjoining_room_ids:[], thickness_ft:0.458, thickness_raw_ft:null },
    { id: 'tw_2', p1:[0,5], p2:[0,0], room_id:'room_0', classification:'exterior', adjoining_room_ids:[], thickness_ft:0.458, thickness_raw_ft:null },
  );
  const r = applyOp(g2, { op: 'delete_wall', wall_id: 'tw_0' });
  assert.ok(!r.ok, 'deleting from 3-vertex polygon should fail');
});

// ── add_opening / move_opening / delete_opening ───────────────────────────────
console.log('\nopenings');

test('adds a door', () => {
  const r = applyOp(mkGeometry(), { op: 'add_opening', kind: 'door', room_ids: ['room_0'], p1:[0,2], p2:[0,4], height:7 });
  assert.ok(r.ok, r.error);
  assert.equal(r.data.doors.length, 2);
  assert.ok(Math.abs(r.data.doors[1].midpoint[0] - 0) < 0.01);
  assert.ok(Math.abs(r.data.doors[1].midpoint[1] - 3) < 0.01);
});

test('adds a window', () => {
  const r = applyOp(mkGeometry(), { op: 'add_opening', kind: 'window', room_ids: ['room_1'], p1:[10,1], p2:[10,3] });
  assert.ok(r.ok, r.error);
  assert.equal(r.data.windows.length, 2);
  assert.equal(r.data.windows[1].room_id, 'room_1');
});

test('add_opening rejects unknown kind', () => {
  const r = applyOp(mkGeometry(), { op: 'add_opening', kind: 'portal', room_ids: [], p1:[0,0], p2:[1,0] });
  assert.ok(!r.ok);
});

test('move_opening repositions door midpoint', () => {
  const r = applyOp(mkGeometry(), { op: 'move_opening', kind: 'door', opening_id: 'door_0', p1:[5,2], p2:[5,4] });
  assert.ok(r.ok, r.error);
  assert.ok(Math.abs(r.data.doors[0].midpoint[1] - 3) < 0.01, 'midpoint z should be 3');
});

test('move_opening rejects unknown id', () => {
  const r = applyOp(mkGeometry(), { op: 'move_opening', kind: 'door', opening_id: 'door_999', p1:[0,0], p2:[0,1] });
  assert.ok(!r.ok);
});

test('delete_opening removes door', () => {
  const r = applyOp(mkGeometry(), { op: 'delete_opening', kind: 'door', opening_id: 'door_0' });
  assert.ok(r.ok, r.error);
  assert.equal(r.data.doors.length, 0);
});

test('delete_opening rejects unknown id', () => {
  const r = applyOp(mkGeometry(), { op: 'delete_opening', kind: 'door', opening_id: 'door_999' });
  assert.ok(!r.ok);
});

test('delete_opening removes window', () => {
  const r = applyOp(mkGeometry(), { op: 'delete_opening', kind: 'window', opening_id: 'win_0' });
  assert.ok(r.ok, r.error);
  assert.equal(r.data.windows.length, 0);
});

// ── split_room ────────────────────────────────────────────────────────────────
console.log('\nsplit_room');

test('splits room_0 into two equal halves at z=5', () => {
  // Horizontal cut at z=5 through room_0 (5×10)
  const r = applyOp(mkGeometry(), {
    op: 'split_room', room_id: 'room_0',
    cut_p1: [-1, 5], cut_p2: [6, 5],
    name_a: 'North', name_b: 'South',
  });
  assert.ok(r.ok, r.error);
  assert.equal(r.data.rooms.length, 3, 'should have 3 rooms');
  const north = r.data.rooms.find(r => r.name === 'North');
  const south = r.data.rooms.find(r => r.name === 'South');
  assert.ok(north && south, 'both halves should exist');
  assert.ok(Math.abs(north.area_sqft - 25) < 1, `north area ~25 got ${north.area_sqft}`);
  assert.ok(Math.abs(south.area_sqft - 25) < 1, `south area ~25 got ${south.area_sqft}`);
});

test('metadata updates after split', () => {
  const r = applyOp(mkGeometry(), {
    op: 'split_room', room_id: 'room_0',
    cut_p1: [-1, 5], cut_p2: [6, 5],
  });
  assert.ok(r.ok, r.error);
  assert.equal(r.data.metadata.room_count, 3);
  assert.ok(Math.abs(r.data.metadata.total_area_sqft - 100) < 1,
    `total area should be ~100, got ${r.data.metadata.total_area_sqft}`);
});

test('rejects cut that misses the room entirely', () => {
  const r = applyOp(mkGeometry(), {
    op: 'split_room', room_id: 'room_0',
    cut_p1: [20, 0], cut_p2: [20, 10],
  });
  assert.ok(!r.ok);
});

test('rejects unknown room', () => {
  const r = applyOp(mkGeometry(), { op: 'split_room', room_id: 'room_99', cut_p1: [0,5], cut_p2: [5,5] });
  assert.ok(!r.ok);
});

// ── merge_rooms ───────────────────────────────────────────────────────────────
console.log('\nmerge_rooms');

test('merges two adjacent rooms into one', () => {
  const r = applyOp(mkGeometry(), { op: 'merge_rooms', room_id_a: 'room_0', room_id_b: 'room_1' });
  assert.ok(r.ok, r.error);
  assert.equal(r.data.rooms.length, 1, 'should have 1 room');
  assert.ok(Math.abs(r.data.rooms[0].area_sqft - 100) < 1,
    `merged area ~100, got ${r.data.rooms[0].area_sqft}`);
});

test('metadata updates after merge', () => {
  const r = applyOp(mkGeometry(), { op: 'merge_rooms', room_id_a: 'room_0', room_id_b: 'room_1' });
  assert.ok(r.ok, r.error);
  assert.equal(r.data.metadata.room_count, 1);
  assert.ok(Math.abs(r.data.metadata.total_area_sqft - 100) < 1);
});

test('door room_ids updated after merge', () => {
  const r = applyOp(mkGeometry(), { op: 'merge_rooms', room_id_a: 'room_0', room_id_b: 'room_1' });
  assert.ok(r.ok, r.error);
  const door = r.data.doors.find(d => d.id === 'door_0');
  assert.ok(door, 'door should persist');
  assert.ok(!door.room_ids.includes('room_1'), 'room_1 should be gone from door.room_ids');
  assert.ok(door.room_ids.includes('room_0'), 'room_0 survives as the merged room');
});

test('window room_id updated after merge', () => {
  const r = applyOp(mkGeometry(), { op: 'merge_rooms', room_id_a: 'room_0', room_id_b: 'room_1' });
  assert.ok(r.ok, r.error);
  const win = r.data.windows.find(w => w.id === 'win_0');
  assert.ok(win, 'window should persist');
  assert.equal(win.room_id, 'room_0');
});

test('rejects merging non-adjacent rooms', () => {
  const g = mkGeometry();
  g.rooms.push({
    id: 'room_2', name: 'Garage', type: null,
    polygon: [[20,0],[25,0],[25,10],[20,10]],
    centroid: [22.5,5], area_sqft: 50,
    worldX: 20, worldZ: 0, height: 9, floor: 0,
  });
  const r = applyOp(g, { op: 'merge_rooms', room_id_a: 'room_0', room_id_b: 'room_2' });
  assert.ok(!r.ok);
});

test('rejects merging same room with itself', () => {
  const r = applyOp(mkGeometry(), { op: 'merge_rooms', room_id_a: 'room_0', room_id_b: 'room_0' });
  assert.ok(!r.ok);
});

// ── applyOps (atomic sequence) ────────────────────────────────────────────────
console.log('\napplyOps');

test('applies multiple ops in sequence', () => {
  const r = applyOps(mkGeometry(), [
    { op: 'relabel_room', room_id: 'room_0', name: 'Kitchen' },
    { op: 'relabel_room', room_id: 'room_1', name: 'Dining' },
  ]);
  assert.ok(r.ok, r.error);
  assert.equal(r.data.rooms[0].name, 'Kitchen');
  assert.equal(r.data.rooms[1].name, 'Dining');
});

test('reverts all on first failure — input geometry unchanged', () => {
  const g = mkGeometry();
  const r = applyOps(g, [
    { op: 'relabel_room', room_id: 'room_0', name: 'Changed' },
    { op: 'relabel_room', room_id: 'room_99', name: 'Fails' },   // invalid
  ]);
  assert.ok(!r.ok);
  assert.equal(r.data, null);
  assert.equal(g.rooms[0].name, 'Living Room', 'original untouched');
});

test('rejects empty ops array', () => {
  const r = applyOps(mkGeometry(), []);
  assert.ok(!r.ok);
});

test('error message cites failing op index', () => {
  const r = applyOps(mkGeometry(), [
    { op: 'relabel_room', room_id: 'room_0', name: 'A' },
    { op: 'relabel_room', room_id: 'room_99', name: 'B' },
  ]);
  assert.ok(r.error.includes('op[1]'));
});

// ── validation ────────────────────────────────────────────────────────────────
console.log('\nvalidation');

test('rejects missing geometry', () => {
  const r = applyOp(null, { op: 'relabel_room', room_id: 'room_0', name: 'X' });
  assert.ok(!r.ok);
});

test('rejects missing op.op', () => {
  const r = applyOp(mkGeometry(), { room_id: 'room_0' });
  assert.ok(!r.ok);
});

test('rejects unknown op type', () => {
  const r = applyOp(mkGeometry(), { op: 'teleport_room', room_id: 'room_0' });
  assert.ok(!r.ok);
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
