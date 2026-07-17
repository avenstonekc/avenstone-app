/**
 * Unit tests for the source-aware selections gate (C3 rule).
 * Run with: node avenstone-vite/src/lib/selectionsGate.test.mjs
 *
 * Tests the filter logic that MUST be identical across all three copies:
 *   phaseGates.js (authoritative)
 *   ai-master-agent/index.ts (mirror)
 *   ai-field-agent/index.ts (mirror)
 *
 * Rule (SCOPE_PREFILL P4b C3): a job_scope_answers row with source='scope_prefill'
 * and confirmed_by=null must NOT count toward the selections lock, even if status='confirmed'.
 * Only rep/client picks (other sources) or human-confirmed prefills (confirmed_by set) count.
 *
 * Covers:
 *   T1 — bare scope_prefill auto-answer → gate BLOCKS
 *   T2 — scope_prefill with confirmed_by set → gate PASSES
 *   T3 — source='rep_card' (non-prefill) → gate PASSES
 *   T4 — source='client_selected' → gate PASSES
 *   T5 — mixed: one scope_prefill unconfirmed + one rep_card → gate BLOCKS on unconfirmed
 *   T6 — no applicable fields → gate PASSES silently
 *   T7 — applicable fields but zero confirmed rows → gate BLOCKS all
 *   T8 — all applicable fields covered by non-prefill sources → gate PASSES
 *   T9 — scope_prefill confirmed_by=null for one, confirmed_by set for another → correct split
 */

import assert from 'node:assert/strict';

// ── The authoritative filter logic (must match all three copies exactly) ──────

function runSelectionsGate(confirmedRows, applicable) {
  // C3 rule: source_prefill auto-answers don't satisfy the lock until confirmed_by is set.
  const confirmed = new Set((confirmedRows || [])
    .filter(r => r.source !== 'scope_prefill' || r.confirmed_by)
    .map(r => r.field_key));
  const unconfirmed = applicable.filter(fk => !confirmed.has(fk));
  const lockedN = applicable.length - unconfirmed.length;
  return {
    passed: unconfirmed.length === 0,
    unconfirmed,
    label: unconfirmed.length
      ? `Client selections locked (${lockedN} of ${applicable.length}) — unconfirmed: ${unconfirmed.join(', ')}`
      : `Client selections locked (${applicable.length} of ${applicable.length})`,
  };
}

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (e) { console.error(`  ✗ ${name}: ${e.message}`); fail++; }
}

console.log('\nSelectionsGate source-awareness (C3 rule)\n');

// T1 — bare scope_prefill auto-answer → BLOCKS
test('T1: scope_prefill unconfirmed auto-answer does not satisfy lock', () => {
  const rows = [{ field_key: 'floor_tile', source: 'scope_prefill', confirmed_by: null }];
  const result = runSelectionsGate(rows, ['floor_tile']);
  assert.equal(result.passed, false, 'should block');
  assert.deepEqual(result.unconfirmed, ['floor_tile']);
});

// T2 — scope_prefill WITH confirmed_by set → PASSES
test('T2: scope_prefill with confirmed_by satisfies lock', () => {
  const rows = [{ field_key: 'floor_tile', source: 'scope_prefill', confirmed_by: 'some-user-uuid' }];
  const result = runSelectionsGate(rows, ['floor_tile']);
  assert.equal(result.passed, true, 'should pass');
  assert.deepEqual(result.unconfirmed, []);
});

// T3 — rep_card source → PASSES
test('T3: rep_card source satisfies lock regardless of confirmed_by', () => {
  const rows = [{ field_key: 'floor_tile', source: 'rep_card', confirmed_by: null }];
  const result = runSelectionsGate(rows, ['floor_tile']);
  assert.equal(result.passed, true, 'rep_card should pass');
});

// T4 — client_selected source → PASSES
test('T4: client_selected source satisfies lock', () => {
  const rows = [{ field_key: 'toilet', source: 'client_selected', confirmed_by: null }];
  const result = runSelectionsGate(rows, ['toilet']);
  assert.equal(result.passed, true, 'client_selected should pass');
});

// T5 — mixed: one scope_prefill unconfirmed (floor_tile), one rep_card (toilet) → BLOCKS on floor_tile
test('T5: mixed sources — unconfirmed scope_prefill blocks even when other fields are covered', () => {
  const rows = [
    { field_key: 'floor_tile', source: 'scope_prefill', confirmed_by: null },
    { field_key: 'toilet',     source: 'rep_card',      confirmed_by: null },
  ];
  const result = runSelectionsGate(rows, ['floor_tile', 'toilet']);
  assert.equal(result.passed, false, 'should block on floor_tile');
  assert.deepEqual(result.unconfirmed, ['floor_tile']);
  assert.ok(result.label.includes('1 of 2'), `label should show 1 of 2, got: ${result.label}`);
});

// T6 — no applicable fields → PASSES silently (zero is_selection fields for project type)
test('T6: no applicable selection fields → passes silently', () => {
  const result = runSelectionsGate([], []);
  assert.equal(result.passed, true, 'no fields = pass');
});

// T7 — applicable fields but zero confirmed rows → BLOCKS all
test('T7: applicable fields with no confirmed answers → blocks all', () => {
  const result = runSelectionsGate([], ['floor_tile', 'toilet']);
  assert.equal(result.passed, false, 'no answers = block');
  assert.deepEqual(result.unconfirmed, ['floor_tile', 'toilet']);
});

// T8 — all covered by non-prefill sources → PASSES
test('T8: all applicable fields covered by non-prefill sources → passes', () => {
  const rows = [
    { field_key: 'floor_tile',    source: 'rep_typed',       confirmed_by: null },
    { field_key: 'toilet',        source: 'client_selected', confirmed_by: null },
    { field_key: 'vanity_config', source: 'rep_card',        confirmed_by: null },
  ];
  const result = runSelectionsGate(rows, ['floor_tile', 'toilet', 'vanity_config']);
  assert.equal(result.passed, true, 'all non-prefill should pass');
  assert.deepEqual(result.unconfirmed, []);
});

// T9 — two scope_prefill rows: one confirmed_by null (blocks), one confirmed_by set (passes)
test('T9: two scope_prefill rows — confirmed_by=null blocks, confirmed_by set passes', () => {
  const rows = [
    { field_key: 'floor_tile', source: 'scope_prefill', confirmed_by: null },
    { field_key: 'toilet',     source: 'scope_prefill', confirmed_by: 'pm-user-uuid' },
  ];
  const result = runSelectionsGate(rows, ['floor_tile', 'toilet']);
  assert.equal(result.passed, false, 'should block on floor_tile');
  assert.deepEqual(result.unconfirmed, ['floor_tile']);
  // toilet covered because confirmed_by is set
  assert.ok(!result.unconfirmed.includes('toilet'), 'toilet should not be unconfirmed');
});

console.log(`\n${pass + fail} tests: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
