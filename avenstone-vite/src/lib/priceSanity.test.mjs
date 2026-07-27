/**
 * Unit tests for the T2#5 gap-entry sanity rails + the repointed envelope.
 * Run: node avenstone-vite/src/lib/priceSanity.test.mjs
 *
 * Covers:
 *   E — buildRateEnvelope from takeoff_unit_costs (lo/hi from the effective-rate distribution,
 *       precedence rank honored, category separated)
 *   R1 — live line total: per-unit vs lump-sum breakdowns differ
 *   R2 — draft-share outlier (>=25%) with the actual %
 *   R3 — unit envelope outlier (>5x / <0.2x); AND the no-envelope → NO flag case (#3)
 *   INC — the 2026-07-17 incident regression: $250/sf × 49 on a ~$22k draft
 */
import assert from 'node:assert/strict';
import { SANITY, buildRateEnvelope, checkGapEntry } from './priceSanity.js';

let passed = 0, failed = 0;
function test(label, fn) {
  try { fn(); console.log(`  ✓ ${label}`); passed++; }
  catch (e) { console.error(`  ✗ FAIL: ${label}\n    ${e.message}`); failed++; }
}

const row = (trade, unit, base_rate, { tenant = null, room = null, category = 'labor' } = {}) =>
  ({ category, trade, unit, base_rate, tenant_id: tenant, room_type: room });

console.log('\npriceSanity — envelope + entry rails');

// ── E: envelope derivation ─────────────────────────────────────────────────────
test('E1: room-varying platform defaults widen the band to [min,max]', () => {
  const env = buildRateEnvelope([
    row('Plumbing - Rough-in', 'each', 525, { room: 'bathroom' }),
    row('Plumbing - Rough-in', 'each', 1150, { room: 'kitchen' }),
  ]);
  assert.deepEqual(env.get('labor|plumbingroughin|each'), { lo: 525, hi: 1150 });
});

test('E2: an all-rooms TENANT rate collapses the band to one point (engine uses it everywhere)', () => {
  const env = buildRateEnvelope([
    row('Plumbing - Rough-in', 'each', 525, { room: 'bathroom' }),
    row('Plumbing - Rough-in', 'each', 1150, { room: 'kitchen' }),
    row('Plumbing - Rough-in', 'each', 500, { tenant: 'T', room: null }), // tenant+all (rank 2) beats platform+room (rank 1) everywhere
  ]);
  assert.deepEqual(env.get('labor|plumbingroughin|each'), { lo: 500, hi: 500 });
});

test('E3: precedence per room — tenant room-specific wins its room, tenant-all wins the rest', () => {
  const env = buildRateEnvelope([
    row('Plumbing - Rough-in', 'each', 1150, { room: 'kitchen' }),               // platform kitchen (rank 1)
    row('Plumbing - Rough-in', 'each', 500,  { tenant: 'T', room: null }),        // tenant all (rank 2)
    row('Plumbing - Rough-in', 'each', 600,  { tenant: 'T', room: 'bathroom' }),  // tenant bathroom (rank 3)
  ]);
  // bathroom → 600, kitchen → 500 (tenant-all beats platform kitchen)
  assert.deepEqual(env.get('labor|plumbingroughin|each'), { lo: 500, hi: 600 });
});

test('E4: category is part of the key — labor and material on the same (trade,unit) never mix', () => {
  const env = buildRateEnvelope([
    row('Tile - Wall / shower', 'sf', 20.50, { room: 'bathroom', category: 'labor' }),
    row('Tile - Wall / shower', 'sf', 5.50,  { room: 'bathroom', category: 'materials' }),
  ]);
  assert.deepEqual(env.get('labor|tilewallshower|sf'), { lo: 20.5, hi: 20.5 });
  assert.deepEqual(env.get('materials|tilewallshower|sf'), { lo: 5.5, hi: 5.5 });
});

test('E5: rows with null base_rate contribute nothing', () => {
  const env = buildRateEnvelope([row('Cleanup', 'lump', null, { room: 'bathroom' })]);
  assert.equal(env.size, 0);
});

// ── R1: live line total ─────────────────────────────────────────────────────────
test('R1: per-unit breakdown shows the arithmetic', () => {
  const { lineTotal, breakdown } = checkGapEntry({ rate: 250, quantity: 49, isLumpSum: false, trade: 'Cleanup', unit: 'sf', category: 'labor' }, new Map());
  assert.equal(lineTotal, 12250);
  assert.equal(breakdown, '$250.00/sf × 49 sf = $12,250.00');
});

test('R1: lump-sum breakdown shows the whole line, NOT rate×qty', () => {
  const { lineTotal, breakdown } = checkGapEntry({ rate: 250, quantity: 49, isLumpSum: true, trade: 'Cleanup', unit: 'sf', category: 'labor' }, new Map());
  assert.equal(lineTotal, 250);
  assert.equal(breakdown, 'whole line = $250.00');
});

test('R1: rate-only mode (no quantity) → unit-basis echo, no line total', () => {
  const { lineTotal, breakdown } = checkGapEntry({ rate: 20.5, quantity: null, isLumpSum: false, trade: 'Tile - Wall / shower', unit: 'sf', category: 'labor' }, new Map());
  assert.equal(lineTotal, null);
  assert.equal(breakdown, '$20.50 / sf');
});

test('R1: blank/zero rate → no breakdown, no warnings', () => {
  const a = checkGapEntry({ rate: '', quantity: 49, isLumpSum: false, trade: 'Cleanup', unit: 'sf' }, new Map());
  assert.equal(a.breakdown, '');
  assert.equal(a.warnings.length, 0);
});

// ── R2: draft-share ─────────────────────────────────────────────────────────────
test('R2: line >=25% of the draft flags with the actual %', () => {
  const { warnings } = checkGapEntry({ rate: 250, quantity: 49, isLumpSum: false, trade: 'X', unit: 'sf', draftTotal: 22250 }, new Map());
  const r2 = warnings.find(w => w.rail === 2);
  assert.ok(r2, 'expected Rail 2');
  assert.match(r2.text, /55% of the estimate/);
});

test('R2: line under 25% of the draft does NOT flag', () => {
  const { warnings } = checkGapEntry({ rate: 10, quantity: 5, isLumpSum: false, trade: 'X', unit: 'sf', draftTotal: 22250 }, new Map());
  assert.equal(warnings.find(w => w.rail === 2), undefined);
});

test('R2: no draftTotal → no draft-share flag', () => {
  const { warnings } = checkGapEntry({ rate: 250, quantity: 49, isLumpSum: false, trade: 'X', unit: 'sf' }, new Map());
  assert.equal(warnings.find(w => w.rail === 2), undefined);
});

// ── R3: unit envelope ────────────────────────────────────────────────────────────
const CLEANUP_ENV = buildRateEnvelope([row('Cleanup', 'sf', 5, { room: 'bathroom' })]); // band [5,5]

test('R3: rate over 5x the envelope high flags', () => {
  const { warnings } = checkGapEntry({ rate: 250, quantity: 49, isLumpSum: false, trade: 'Cleanup', unit: 'sf', category: 'labor' }, CLEANUP_ENV);
  const r3 = warnings.find(w => w.rail === 3);
  assert.ok(r3, 'expected Rail 3 high');
  assert.match(r3.text, /over 5× the typical high/);
});

test('R3: rate under 0.2x the envelope low flags', () => {
  const { warnings } = checkGapEntry({ rate: 0.5, quantity: 49, isLumpSum: false, trade: 'Cleanup', unit: 'sf', category: 'labor' }, CLEANUP_ENV);
  const r3 = warnings.find(w => w.rail === 3);
  assert.ok(r3, 'expected Rail 3 low');
  assert.match(r3.text, /under 0.2× the typical low/);
});

test('R3: rate within the envelope does NOT flag', () => {
  const { warnings } = checkGapEntry({ rate: 5, quantity: 49, isLumpSum: false, trade: 'Cleanup', unit: 'sf', category: 'labor' }, CLEANUP_ENV);
  assert.equal(warnings.find(w => w.rail === 3), undefined);
});

test('R3: NO envelope for (category,trade,unit) → NO flag even for an absurd rate (#3, never invent)', () => {
  const { warnings } = checkGapEntry({ rate: 99999, quantity: 49, isLumpSum: false, trade: 'Trade With No Rate', unit: 'sf', category: 'labor' }, CLEANUP_ENV);
  assert.equal(warnings.find(w => w.rail === 3), undefined);
  assert.equal(warnings.length, 0);
});

test('R3: lump-sum entry is never envelope-checked (a lump sum is not a unit rate)', () => {
  const { warnings } = checkGapEntry({ rate: 99999, isLumpSum: true, trade: 'Cleanup', unit: 'sf', category: 'labor' }, CLEANUP_ENV);
  assert.equal(warnings.find(w => w.rail === 3), undefined);
});

// ── INC: 2026-07-17 incident regression ──────────────────────────────────────────
// $250 typed into a per-SF cleanup slot on a ~$22k draft → silently $12,250 (55%).
// The rep meant a lump sum. BEFORE (per-unit) must raise the rails; AFTER (lump-sum) must be clean.
console.log('\nINC — 2026-07-17 incident regression');
test('INC: per-unit $250/sf × 49 on a ~$22k draft raises Rail 1 (math), Rail 2 (55%), Rail 3 (envelope)', () => {
  const r = checkGapEntry({ rate: 250, quantity: 49, isLumpSum: false, trade: 'Cleanup', unit: 'sf', category: 'labor', draftTotal: 22250 }, CLEANUP_ENV);
  assert.equal(r.lineTotal, 12250);                                   // Rail 1
  assert.equal(r.breakdown, '$250.00/sf × 49 sf = $12,250.00');       // Rail 1 arithmetic visible
  assert.ok(r.warnings.find(w => w.rail === 2), 'Rail 2 must fire');   // draft share
  assert.match(r.warnings.find(w => w.rail === 2).text, /55%/);
  assert.ok(r.warnings.find(w => w.rail === 3), 'Rail 3 must fire');   // envelope outlier
});

test('INC: the fix — same number as a LUMP SUM ($250 whole line) raises nothing', () => {
  const r = checkGapEntry({ rate: 250, quantity: 49, isLumpSum: true, trade: 'Cleanup', unit: 'sf', category: 'labor', draftTotal: 10250 }, CLEANUP_ENV);
  assert.equal(r.lineTotal, 250);
  assert.equal(r.breakdown, 'whole line = $250.00');
  assert.equal(r.warnings.length, 0);
});

test('INC: nothing blocks — checkGapEntry only ever returns warnings, no throw / no gate', () => {
  // Sanity: even the worst input returns a plain object; the callers render warnings and still allow commit.
  const r = checkGapEntry({ rate: 1e9, quantity: 1e6, isLumpSum: false, trade: 'Cleanup', unit: 'sf', category: 'labor', draftTotal: 1 }, CLEANUP_ENV);
  assert.equal(typeof r, 'object');
  assert.ok(Array.isArray(r.warnings));
});

console.log(`\n${failed === 0 ? 'ALL GREEN' : 'FAILURES'} — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
