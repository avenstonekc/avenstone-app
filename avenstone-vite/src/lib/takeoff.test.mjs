/**
 * Tests for computeMetricsFromNormalized — run with:
 *   node avenstone-vite/src/lib/takeoff.test.mjs
 */

// Isolated import — takeoff.js has top-level imports from supabase.js which
// won't resolve in a bare node run. We import only the exported pure helper
// by shimming the module graph via a tiny inline re-export trick: read the
// source, extract the function, and eval it in isolation.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';

const __dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dir, 'takeoff.js'), 'utf8');

// Pull out just the helper body (between its export and the next export/function
// at column-0). Regex is intentionally narrow so it breaks loudly if the source
// changes shape rather than silently testing the wrong code.
const match = src.match(/export function computeMetricsFromNormalized[\s\S]+?\n\}/);
if (!match) throw new Error('computeMetricsFromNormalized not found in takeoff.js');

// eslint-disable-next-line no-new-func
const computeMetricsFromNormalized = new Function(`return (${match[0].replace(/^export /, '')})`)();

// ── Fixtures ──────────────────────────────────────────────────────────────────

// 10×10 ft room (room_a). Perimeter = 40 lf. height = 9 ft → wallAreaSf = 360.
const roomA = { id: 'room_a', height: 9 };

// Walls for room_a: four sides of 10 ft each.
const wallsA = [
  { id: 'w0', p1: [0, 0],   p2: [10, 0],  room_id: 'room_a', classification: 'exterior' },
  { id: 'w1', p1: [10, 0],  p2: [10, 10], room_id: 'room_a', classification: 'exterior' },
  { id: 'w2', p1: [10, 10], p2: [0, 10],  room_id: 'room_a', classification: 'exterior' },
  { id: 'w3', p1: [0, 10],  p2: [0, 0],   room_id: 'room_a', classification: 'exterior' },
];

// Walls belonging to a DIFFERENT room — must be filtered out.
const wallsOther = [
  { id: 'w4', p1: [0, 0], p2: [5, 0], room_id: 'room_b', classification: 'exterior' },
  { id: 'w5', p1: [5, 0], p2: [5, 5], room_id: 'room_b', classification: 'exterior' },
];

// 3-4-5 right triangle room (room_c). One wall is 5 ft (hypotenuse). height = 8.
const roomC = { id: 'room_c', height: 8 };
const wallsC = [
  { id: 'c0', p1: [0, 0], p2: [3, 0], room_id: 'room_c', classification: 'exterior' }, // 3 ft
  { id: 'c1', p1: [3, 0], p2: [3, 4], room_id: 'room_c', classification: 'exterior' }, // 4 ft
  { id: 'c2', p1: [3, 4], p2: [0, 0], room_id: 'room_c', classification: 'exterior' }, // 5 ft (hyp)
];

// ── Tests ─────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(label, fn) {
  try {
    fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ FAIL: ${label}\n    ${e.message}`);
    failed++;
  }
}

console.log('\ncomputeMetricsFromNormalized');

test('square room: perimeterLf = 40', () => {
  const { perimeterLf } = computeMetricsFromNormalized(roomA, wallsA);
  assert.equal(perimeterLf, 40);
});

test('square room: wallAreaSf = perimeterLf × height = 360', () => {
  const { wallAreaSf } = computeMetricsFromNormalized(roomA, wallsA);
  assert.equal(wallAreaSf, 360);
});

test('wrong-room walls filtered out: only room_a walls counted', () => {
  const mixed = [...wallsA, ...wallsOther];
  const { perimeterLf } = computeMetricsFromNormalized(roomA, mixed);
  assert.equal(perimeterLf, 40); // wallsOther must not add to perimeter
});

test('empty walls array returns zeros', () => {
  const result = computeMetricsFromNormalized(roomA, []);
  assert.deepEqual(result, { perimeterLf: 0, wallAreaSf: 0 });
});

test('null walls returns zeros', () => {
  const result = computeMetricsFromNormalized(roomA, null);
  assert.deepEqual(result, { perimeterLf: 0, wallAreaSf: 0 });
});

test('no matching room_id returns zeros', () => {
  const result = computeMetricsFromNormalized(roomA, wallsOther);
  assert.deepEqual(result, { perimeterLf: 0, wallAreaSf: 0 });
});

test('3-4-5 triangle: perimeterLf = 12', () => {
  const { perimeterLf } = computeMetricsFromNormalized(roomC, wallsC);
  assert.equal(perimeterLf, 12);
});

test('3-4-5 triangle: wallAreaSf = 12 × 8 = 96', () => {
  const { wallAreaSf } = computeMetricsFromNormalized(roomC, wallsC);
  assert.equal(wallAreaSf, 96);
});

test('missing height defaults to 8 ft', () => {
  const noHeight = { id: 'room_a' }; // no height field
  const { wallAreaSf } = computeMetricsFromNormalized(noHeight, wallsA);
  assert.equal(wallAreaSf, 40 * 8); // 320
});

test('rounding: perimeterLf and wallAreaSf are rounded to 2dp', () => {
  // Wall of length sqrt(2) ≈ 1.41421... ft
  const roomR = { id: 'room_r', height: 9 };
  const wallsR = [{ id: 'r0', p1: [0, 0], p2: [1, 1], room_id: 'room_r' }];
  const { perimeterLf, wallAreaSf } = computeMetricsFromNormalized(roomR, wallsR);
  assert.equal(perimeterLf, Math.round(Math.sqrt(2) * 100) / 100);
  assert.equal(wallAreaSf, Math.round(perimeterLf * 9 * 100) / 100);
});

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
