/**
 * TAKEOFF_QA regression tests for computePricingLines — run with:
 *   node avenstone-vite/src/lib/pricingCore.takeoffqa.test.mjs
 *
 * Locks the bathroom takeoff fixes so they can't silently regress:
 *   Sym 3 — optional/alternate trades (LVP) don't auto-fire under a full/all scope
 *   Sym 4 — no duplicate fixtures (vanity cabinet / vanity top / toilet / sink appear once)
 *   Sym 5 — tub/shower trim follows shower_type (no tub spout on a shower-only bath)
 *   Sym 6 — the selected shower door (swing) is honored, not the old slider default
 *   Sym 7 — door casing quantity reflects a full cased opening (~17 LF/door, not one 7 LF leg)
 *   Sym 8 — shower_only tiles 3 walls (open front), not 4
 */
import { computePricingLines } from './pricingCore.js';
import assert from 'node:assert/strict';

// ── Fixtures: a trimmed but faithful slice of the seeded bathroom catalog ────────
const templates = [
  { trade: 'Demo', scope_definition: { summary: 'Gut demo', default_unit: 'ls' } },
  { trade: 'Tile - Wall / shower', scope_definition: {
      summary: 'Shower wall tile', default_unit: 'sf',
      labor_formula: { qty_basis: 'scope_detail', scope_detail_key: 'shower_wall_sf' },
      materials_formula: [{ material_name: 'Wall tile field', qty_basis: 'scope_detail', scope_detail_key: 'shower_wall_sf', qty_multiplier: 1 }] } },
  { trade: 'Tile - Floor', scope_definition: {
      summary: 'Floor tile', default_unit: 'sf',
      labor_formula: { qty_basis: 'scope_detail', scope_detail_key: 'floor_tile_sf' } } },
  { trade: 'Flooring - LVP', scope_definition: {
      summary: 'LVP alternate', optional: true, conditional: 'alternate to Tile - Floor', default_unit: 'sf',
      materials_formula: [
        { material_name: 'LVP plank',       qty_basis: 'floor_sf', qty_multiplier: 1 },
        { material_name: 'LVP underlayment', qty_basis: 'floor_sf', qty_multiplier: 1 }] } },
  { trade: 'Cabinets / vanities - Install', scope_definition: {
      summary: 'Vanity', default_unit: 'ls',
      materials_formula: [
        { material_name: 'Vanity cabinet 30in', qty_basis: 'fixed', fixed_qty: 1, qty_multiplier: 1 },
        { material_name: 'Vanity top',          qty_basis: 'fixed', fixed_qty: 1, qty_multiplier: 1 },
        { material_name: 'Vanity sink',         qty_basis: 'fixed', fixed_qty: 1, qty_multiplier: 1 },
        { material_name: 'Mirror',              qty_basis: 'fixed', fixed_qty: 1, qty_multiplier: 1 }] } },
  { trade: 'Plumbing - Finish / fixtures', scope_definition: {
      summary: 'Fixtures', default_unit: 'ls',
      materials_formula: [
        { material_name: 'Toilet',              qty_basis: 'fixed', fixed_qty: 1, qty_multiplier: 1 },
        { material_name: 'Shower valve trim kit', qty_basis: 'fixed', fixed_qty: 1, qty_multiplier: 1, when: { scope_detail: 'shower_type', in: ['shower_only', 'tub_plus_shower'] } },
        { material_name: 'Tub spout',           qty_basis: 'fixed', fixed_qty: 1, qty_multiplier: 1, when: { scope_detail: 'shower_type', in: ['tub_only', 'tub_plus_shower'] } },
        { material_name: 'Bath faucet',         qty_basis: 'fixed', fixed_qty: 1, qty_multiplier: 1 }] } },
  { trade: 'Trim / carpentry - Base / case', scope_definition: {
      summary: 'Trim', default_unit: 'lf',
      materials_formula: [
        { material_name: 'Baseboard MDF primed', qty_basis: 'perimeter_lf', qty_multiplier: 1 },
        { material_name: 'Door casing MDF',      qty_basis: 'door_count',   qty_multiplier: 17 }] } },
];

const unitCosts = [
  { trade: 'Demo', category: 'labor', material_name: null, unit: 'sf', base_rate: 5.5, tenant_id: null },
  { trade: 'Tile - Wall / shower', category: 'labor', material_name: null, unit: 'sf', base_rate: 20.5, tenant_id: null },
  { trade: 'Tile - Floor', category: 'labor', material_name: null, unit: 'sf', base_rate: 8.25, tenant_id: null },
  { trade: 'Trim / carpentry - Base / case', category: 'materials', material_name: 'Door casing MDF', unit: 'lf', base_rate: 1.2, waste_pct: 5, tenant_id: null },
  { trade: 'Tile - Wall / shower', category: 'materials', material_name: 'Shower door - glass swing semi-frameless', unit: 'each', base_rate: 1200, tenant_id: null },
];

const scopeSubsets = [{ room_type: 'bathroom', scope_tag: 'full_remodel', trades: ['__all__'] }];

const schema = { fields: [
  { key: 'shower_type', type: 'select', default: 'shower_only' },
  { key: 'shower_width_in', type: 'feet_inches' },
  { key: 'shower_length_in', type: 'feet_inches' },
  { key: 'shower_wall_height_in', type: 'feet_inches' },
  { key: 'shower_wall_sf', type: 'computed', compute_fn: 'shower_wall_sf_from_dims', override_key: 'shower_wall_sf_override' },
  { key: 'shower_floor_sf', type: 'computed', compute_fn: 'shower_floor_sf_from_dims', override_key: 'shower_floor_sf_override' },
  { key: 'shower_door_type', type: 'fixture_select', trade: 'Tile - Wall / shower', options: [
      { value: 'slider', material_name: 'Shower door - glass slider' },
      { value: 'swing_semi', material_name: 'Shower door - glass swing semi-frameless' }] },
  { key: 'floor_tile_sf', type: 'number', default_from: 'room.floorSf', subtract: ['shower_floor_sf'] },
  { key: 'vanity_width', type: 'fixture_select', trade: 'Cabinets / vanities - Install', options: [
      { value: '30', material_name: 'Vanity cabinet 30in' }] },
  { key: 'vanity_top', type: 'fixture_select', trade: 'Cabinets / vanities - Install',
      options: [{ value: 'cultured_marble', material_label: 'Cultured marble' }],
      options_from: 'vanity_width', options_template: 'Vanity top - {material} {vanity_width}in' },
  { key: 'sink_count', type: 'number', default: 1 },
  { key: 'toilet_type', type: 'fixture_select', trade: 'Plumbing - Finish / fixtures', options: [
      { value: 'standard', material_name: 'Toilet standard' }] },
] };
const schemas = [{ room_type: 'bathroom', scope_tag: 'full_remodel', tenant_id: null, schema }];

function makeRoom(overrides = {}) {
  return {
    roomId: 'r1', roomLabel: 'Bath', floor: 0, roomType: 'bathroom', isSynthetic: false,
    scopeTag: 'full_remodel', customTrades: [],
    scopeDetails: {
      shower_type: 'shower_only', shower_width_in: 48, shower_length_in: 36, shower_wall_height_in: 96,
      shower_door_type: 'swing_semi', vanity_width: '30', vanity_top: 'cultured_marble', sink_count: 1,
      toilet_type: 'standard', ...overrides,
    },
    geometry: { floorSf: 52, wallSf: 320, perimeterLf: 30, ceilingFt: 8, doors: 1, windows: 0 },
  };
}
const run = (room) => computePricingLines({ rooms: [room], templates, unitCosts, scopeSubsets, schemas, wasteRows: [] });

let passed = 0, failed = 0;
function test(label, fn) {
  try { fn(); console.log(`  ✓ ${label}`); passed++; }
  catch (e) { console.error(`  ✗ FAIL: ${label}\n    ${e.message}`); failed++; }
}
const countMatch = (lines, re) => lines.filter(l => re.test(String(l.materialName || ''))).length;

console.log('\nTAKEOFF_QA — computePricingLines (bathroom full_remodel, shower_only)');

test('Sym 4 — no exact duplicate (trade+category+material) lines', () => {
  const { lines } = run(makeRoom());
  const seen = new Set();
  for (const l of lines) {
    const k = `${l.trade}::${l.category}::${l.materialName || ''}`;
    assert.ok(!seen.has(k), `duplicate line: ${k}`);
    seen.add(k);
  }
});

test('Sym 4 — exactly one vanity cabinet / vanity top / vanity sink / toilet', () => {
  const { lines } = run(makeRoom());
  assert.equal(countMatch(lines, /vanity cabinet/i), 1, 'vanity cabinet');
  assert.equal(countMatch(lines, /vanity top/i),     1, 'vanity top');
  assert.equal(countMatch(lines, /vanity sink/i),    1, 'vanity sink');
  assert.equal(countMatch(lines, /^toilet/i),        1, 'toilet');
});

test('Sym 3 — Flooring - LVP does not auto-fire under __all__', () => {
  const { lines } = run(makeRoom());
  assert.equal(lines.filter(l => l.trade === 'Flooring - LVP').length, 0);
});

test('Sym 3 — no line is surfaced as optional', () => {
  const { lines } = run(makeRoom());
  assert.equal(lines.filter(l => l.optional).length, 0);
});

test('Sym 5 — shower_only: shower valve trim present, tub spout absent', () => {
  const { lines } = run(makeRoom());
  assert.equal(countMatch(lines, /shower valve trim/i), 1, 'shower valve trim');
  assert.equal(countMatch(lines, /tub spout/i),         0, 'tub spout');
});

test('Sym 5 — tub_only: tub spout present, shower valve trim absent', () => {
  const { lines } = run(makeRoom({ shower_type: 'tub_only' }));
  assert.equal(countMatch(lines, /tub spout/i),         1, 'tub spout');
  assert.equal(countMatch(lines, /shower valve trim/i), 0, 'shower valve trim');
});

test('Sym 6 — selected swing door is honored (no slider)', () => {
  const { lines } = run(makeRoom());
  assert.equal(countMatch(lines, /swing/i),  1, 'swing door');
  assert.equal(countMatch(lines, /slider/i), 0, 'no slider');
});

test('Sym 7 — door casing quantity is a full cased opening (>15 LF), not one leg', () => {
  const { lines } = run(makeRoom());
  const casing = lines.find(l => /door casing/i.test(String(l.materialName || '')));
  assert.ok(casing, 'casing line exists');
  assert.ok(casing.quantity > 15, `casing qty ${casing.quantity} should be > 15 (was ~7.35 one-leg bug)`);
});

test('Sym 8 — shower_only tiles 3 walls: 48x36x96 => 80 sf', () => {
  const { lines } = run(makeRoom());
  const tileWallLabor = lines.find(l => l.trade === 'Tile - Wall / shower' && l.category === 'labor');
  assert.ok(tileWallLabor, 'tile wall labor line exists');
  assert.equal(tileWallLabor.quantity, 80, `expected 80 sf (3-wall), got ${tileWallLabor.quantity}`);
});

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
