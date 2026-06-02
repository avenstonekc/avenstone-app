/**
 * Unit tests for markupConfig.js — run with: node src/lib/markupConfig.test.js
 * (from avenstone-vite/ directory)
 *
 * Verifies the audit table: with default config + 22/22 rates every category
 * returns 22. With custom config and divergent rates, each bucket separates correctly.
 */

import { normalizeCategoryKey, markupRateForCategory, DEFAULT_CATEGORY_CONFIG } from './markupConfig.js';

let passed = 0;
let failed = 0;

function assert(label, actual, expected) {
  if (actual === expected) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ── normalizeCategoryKey ──────────────────────────────────────────────────────
console.log('\nnormalizeCategoryKey');
assert('labor passthrough',          normalizeCategoryKey('labor'),            'labor');
assert('sub passthrough',            normalizeCategoryKey('sub'),              'sub');
assert('materials passthrough',      normalizeCategoryKey('materials'),        'materials');
assert('equipment passthrough',      normalizeCategoryKey('equipment'),        'equipment');
assert('permit passthrough',         normalizeCategoryKey('permit'),           'permit');
assert('other passthrough',          normalizeCategoryKey('other'),            'other');
assert('sub_payout → sub',          normalizeCategoryKey('sub_payout'),       'sub');
assert('material_purchase → materials', normalizeCategoryKey('material_purchase'), 'materials');
assert('material → materials',       normalizeCategoryKey('material'),         'materials');
assert('supply → materials',         normalizeCategoryKey('supply'),           'materials');
assert('equipment_rental → equipment', normalizeCategoryKey('equipment_rental'), 'equipment');
assert('fuel → equipment',           normalizeCategoryKey('fuel'),             'equipment');
assert('change_order → other',       normalizeCategoryKey('change_order'),     'other');
assert('null → other',               normalizeCategoryKey(null),               'other');
assert('undefined → other',          normalizeCategoryKey(undefined),          'other');
assert('unknown string passthrough', normalizeCategoryKey('mystery_type'),     'mystery_type');

// ── markupRateForCategory — default config, equal rates (Houston anchor 22/22) ──
console.log('\nmarkupRateForCategory — default config, 22/22 rates (all must return 22)');
const opts22 = { laborPct: 22, materialPct: 22 };
for (const cat of ['labor', 'sub', 'materials', 'equipment', 'permit', 'other']) {
  assert(`category '${cat}'`, markupRateForCategory(cat, opts22), 22);
}
// Ledger aliases also return 22
for (const alias of ['sub_payout', 'material_purchase', 'equipment_rental']) {
  assert(`ledger alias '${alias}'`, markupRateForCategory(alias, opts22), 22);
}

// ── markupRateForCategory — divergent rates (25 labor / 18 material) ─────────
console.log('\nmarkupRateForCategory — default config, 25 labor / 18 material');
const opts = { laborPct: 25, materialPct: 18 };
assert("labor → 25",      markupRateForCategory('labor',     opts), 25);
assert("sub → 25",        markupRateForCategory('sub',       opts), 25);
assert("sub_payout → 25", markupRateForCategory('sub_payout', opts), 25);
assert("materials → 18",  markupRateForCategory('materials', opts), 18);
assert("equipment → 18",  markupRateForCategory('equipment', opts), 18);
assert("permit → 18",     markupRateForCategory('permit',    opts), 18);
assert("other → 18",      markupRateForCategory('other',     opts), 18);

// ── markupRateForCategory — custom config (permit flat, sub material_rate) ───
console.log('\nmarkupRateForCategory — custom config overrides');
const customConfig = { ...DEFAULT_CATEGORY_CONFIG, permit: 'flat', sub: 'material_rate' };
const optsC = { laborPct: 30, materialPct: 15, categoryConfig: customConfig };
assert("permit flat → 0",        markupRateForCategory('permit', optsC), 0);
assert("sub → material_rate 15", markupRateForCategory('sub',    optsC), 15);
assert("labor still → 30",       markupRateForCategory('labor',  optsC), 30);

// ── markupRateForCategory — missing / bad inputs ──────────────────────────────
console.log('\nmarkupRateForCategory — edge cases');
assert("null category → material_rate", markupRateForCategory(null, opts), 18);
assert("unknown type → material_rate",  markupRateForCategory('xyz', opts), 18);
assert("laborPct string coercion",      markupRateForCategory('labor', { laborPct: '20', materialPct: 10 }), 20);
assert("no categoryConfig uses default", markupRateForCategory('labor', { laborPct: 5, materialPct: 3 }), 5);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
