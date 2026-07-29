/**
 * Unit tests for TIME_CLOCK_ARC S2 straight-time earnings math.
 * Run: node avenstone-vite/src/lib/earnings.test.mjs
 */
import assert from 'node:assert/strict';
import { chicagoDate, weekStart, effectiveRate, computeEarnings } from './earnings.js';

let passed = 0, failed = 0;
function test(label, fn) {
  try { fn(); console.log(`  ✓ ${label}`); passed++; }
  catch (e) { console.error(`  ✗ FAIL: ${label}\n    ${e.message}`); failed++; }
}

const rate = (effective_date, r) => ({ effective_date, rate: r });
const entry = (inIso, outIso) => ({ clock_in: inIso, clock_out: outIso });

console.log('\nearnings — straight-time math');

// ── date helpers ────────────────────────────────────────────────────────────
test('chicagoDate: 9am CDT lands on the local calendar day', () => {
  assert.equal(chicagoDate('2026-07-28T14:00:00Z'), '2026-07-28'); // 14:00Z = 9am CDT
});
test('weekStart: Monday backs up to the prior Sunday', () => {
  assert.equal(weekStart('2026-07-20'), '2026-07-19'); // Mon -> Sun
  assert.equal(weekStart('2026-07-31'), '2026-07-26'); // Fri -> Sun
});

// ── effective rate (greatest effective_date <= entry date) ────────────────────
const RATES = [rate('2026-07-27', 20), rate('2026-07-30', 25)]; // raise Mon->Thu
test('effectiveRate: before any rate → null (no rate on file)', () => {
  assert.equal(effectiveRate(RATES, '2026-07-20'), null);
});
test('effectiveRate: between the two rates → the earlier (Monday) rate', () => {
  assert.equal(effectiveRate(RATES, '2026-07-29'), 20);
});
test('effectiveRate: on/after the raise date → the new rate (inclusive)', () => {
  assert.equal(effectiveRate(RATES, '2026-07-30'), 25);
  assert.equal(effectiveRate(RATES, '2026-08-15'), 25);
});

// ── VERIFY #2: mid-stream raise ───────────────────────────────────────────────
// rate A=$20 eff Mon 07-27, rate B=$25 eff Thu 07-30. Entries both sides:
//   Tue 07-28: 2h @ $20 = $40  |  Fri 07-31: 3h @ $25 = $75  →  YTD gross = $115.00 exactly.
// Plus a Mon 07-20 entry BEFORE the first rate: 1h, no rate → hours count, $0 excluded.
console.log('\nVERIFY #2 — mid-stream raise (hand vs computed)');
test('mid-raise YTD gross = $115.00 to the cent; hours 6; one no-rate entry', () => {
  const entries = [
    entry('2026-07-28T14:00:00Z', '2026-07-28T16:00:00Z'), // 2h @ 20 = 40
    entry('2026-07-31T14:00:00Z', '2026-07-31T17:00:00Z'), // 3h @ 25 = 75
    entry('2026-07-20T14:00:00Z', '2026-07-20T15:00:00Z'), // 1h, no rate on file
  ];
  const r = computeEarnings(entries, RATES, '2026-07-31T18:00:00Z');
  assert.equal(r.ytdGross, 115.00);   // 2*20 + 3*25 = 40 + 75
  assert.equal(r.ytdHours, 6);        // 2 + 3 + 1 (hours count even with no rate)
  assert.equal(r.noRateCount, 1);
  // this-week (Sun 07-26..Sat 08-01): the 28th + 31st, not the 20th
  assert.equal(r.weekHours, 5);
  assert.equal(r.weekGross, 115.00);
  // weekly history: current week ($115) most recent; the no-rate week flagged, $0 gross
  assert.equal(r.weeks[0].weekStart, '2026-07-26');
  assert.equal(r.weeks[0].gross, 115.00);
  const noRateWeek = r.weeks.find(w => w.weekStart === '2026-07-19');
  assert.equal(noRateWeek.hours, 1);
  assert.equal(noRateWeek.gross, 0);
  assert.equal(noRateWeek.hasNoRate, true);
});

// ── VERIFY #3: no-rate case never priced at $0 silently ───────────────────────
test('no-rate entry: hours counted, gross excluded, noRateCount reported', () => {
  const r = computeEarnings([entry('2026-07-20T14:00:00Z', '2026-07-20T16:00:00Z')], RATES, '2026-07-20T18:00:00Z');
  assert.equal(r.ytdHours, 2);
  assert.equal(r.ytdGross, 0);       // NOT priced — the caller shows "—" + the note
  assert.equal(r.noRateCount, 1);
});

// ── open entries excluded from dollars ────────────────────────────────────────
test('open (unclosed) entry: in-progress hours only, no dollars', () => {
  const r = computeEarnings([{ clock_in: '2026-07-31T15:00:00Z', clock_out: null }], RATES, '2026-07-31T17:00:00Z');
  assert.equal(r.ytdGross, 0);
  assert.equal(r.ytdHours, 0);       // open entries are not in YTD gross/hours
  assert.equal(r.openHours, 2);      // shown separately as in-progress
});

console.log(`\n${failed === 0 ? 'ALL GREEN' : 'FAILURES'} — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
