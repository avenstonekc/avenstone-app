// Unit tests for src/lib/lifecycle.js — no vitest/jest in this repo, so a plain
// node runner (matches the existing scripts/*.mjs pattern). Run:
//   node scripts/test-lifecycle.mjs   (from avenstone-vite/)
// Exit 0 = all pass, 1 = any failure.

import { deriveStatusFromPhases, compareStatus, PHASE_STATUS_MAP } from '../src/lib/lifecycle.js';

let pass = 0, fail = 0;
const eq = (got, want, name) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`); }
};

// Full 10-row template (DEFAULT_PHASES), all not_started by default.
const template = () => [
  { phase_name: 'Lead',          phase_order: 1,  status: 'not_started' },
  { phase_name: 'Proposal',      phase_order: 2,  status: 'not_started' },
  { phase_name: 'Contract',      phase_order: 3,  status: 'not_started' },
  { phase_name: 'Demo',          phase_order: 4,  status: 'not_started' },
  { phase_name: 'Rough-ins',     phase_order: 5,  status: 'not_started' },
  { phase_name: 'Inspections',   phase_order: 6,  status: 'not_started' },
  { phase_name: 'Drywall',       phase_order: 7,  status: 'not_started' },
  { phase_name: 'Finishes',      phase_order: 8,  status: 'not_started' },
  { phase_name: 'Final touches', phase_order: 9,  status: 'not_started' },
  { phase_name: 'Complete',      phase_order: 10, status: 'not_started' },
];
// Set the given phase_names to `st`, return the rows.
const withAdvanced = (names, st = 'complete') => template().map(p => names.includes(p.phase_name) ? { ...p, status: st } : p);

console.log('deriveStatusFromPhases — phase→status map (exhaustive, each name as furthest advanced):');
// Each phase name, when it is the furthest advanced phase, maps to its status.
const expectedForName = {
  'Lead': 'lead', 'Proposal': 'proposal', 'Contract': 'contract',
  'Demo': 'in_progress', 'Rough-ins': 'in_progress', 'Inspections': 'in_progress',
  'Drywall': 'in_progress', 'Finishes': 'in_progress',
  'Final touches': 'final_touches', 'Complete': 'complete',
};
for (const [name, want] of Object.entries(expectedForName)) {
  // advance everything up to and including `name` (so `name` is the furthest)
  const order = template().find(p => p.phase_name === name).phase_order;
  const names = template().filter(p => p.phase_order <= order).map(p => p.phase_name);
  eq(deriveStatusFromPhases(withAdvanced(names, 'complete')), { status: want, reason: null }, `furthest=${name} → ${want}`);
}
// Every key in the map is covered above.
eq(Object.keys(expectedForName).sort(), Object.keys(PHASE_STATUS_MAP).sort(), 'test covers every PHASE_STATUS_MAP key');

console.log('\nfurthest-wins semantics:');
// Contract complete + Demo in_progress → furthest advanced is Demo → in_progress.
eq(deriveStatusFromPhases([
  ...withAdvanced(['Lead','Proposal','Contract'], 'complete').slice(0,3),
  { phase_name: 'Demo', phase_order: 4, status: 'in_progress' },
  ...template().slice(4),
]), { status: 'in_progress', reason: null }, 'Contract done + Demo active → in_progress');
// Complete row done, everything else not_started → furthest is Complete.
eq(deriveStatusFromPhases(withAdvanced(['Complete'], 'complete')), { status: 'complete', reason: null }, 'only Complete done → complete');

console.log('\nall-not_started + on_hold + malformed:');
eq(deriveStatusFromPhases(template()), { status: 'lead', reason: 'all phases not_started' }, 'all not_started → lead');
eq(deriveStatusFromPhases(template(), { onHold: true }), { status: 'on_hold', reason: 'on_hold overlay (not derivable from phases)' }, 'onHold overlay → on_hold');
eq(deriveStatusFromPhases(withAdvanced(['Demo'], 'in_progress'), { onHold: true }), { status: 'on_hold', reason: 'on_hold overlay (not derivable from phases)' }, 'onHold short-circuits even with active phases');
eq(deriveStatusFromPhases([]), { status: null, reason: 'no phase rows' }, 'empty array → null');
eq(deriveStatusFromPhases(null), { status: null, reason: 'no phase rows' }, 'null → null (no throw)');
eq(deriveStatusFromPhases(undefined), { status: null, reason: 'no phase rows' }, 'undefined → null (no throw)');
eq(deriveStatusFromPhases([{ phase_name: 'Bogus', phase_order: 1, status: 'complete' }]).status, null, 'unknown phase_name → null status');
eq(deriveStatusFromPhases([{ status: 'complete' }]).status, null, 'missing phase_order/name → null status');
// Malformed rows mixed with valid ones: skip the bad, derive from the good.
eq(deriveStatusFromPhases([
  { phase_name: 'Lead', phase_order: 1, status: 'complete' },
  { status: 'complete' },                       // malformed — skipped
  { phase_name: 'XYZ', phase_order: 99, status: 'complete' }, // unknown — skipped
]), { status: 'lead', reason: null }, 'skips malformed/unknown rows, derives from valid');

console.log('\ncompareStatus helper:');
eq(compareStatus('lead', template()), { derived: 'lead', agree: true, reason: 'all phases not_started' }, 'stored lead vs all-not_started → agree');
eq(compareStatus('complete', template()).agree, false, 'stored complete vs all-not_started → DIVERGE');
eq(compareStatus('on_hold', template(), { onHold: true }), { derived: 'on_hold', agree: true, reason: 'on_hold overlay (not derivable from phases)' }, 'on_hold overlay agrees');

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
