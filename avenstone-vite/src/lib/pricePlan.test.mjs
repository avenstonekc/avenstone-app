/**
 * PRICE_DETERMINISM P3 — price_plan pipeline integration tests.
 * Tests the pure chain (translateAnswers → deriveScopeTag → resolveGeometry
 * → computePricingLines) exactly as the edge handler runs it.
 *
 * Run: node avenstone-vite/src/lib/pricePlan.test.mjs
 *
 * Tests:
 *   P3-1: full_remodel bathroom with scan geo → 15+ lines, Countertops PENDING RATE
 *   P3-2: vanity_swap with countertop → Countertops lines present (now in subset)
 *   P3-3: untranslated_fields populated (fixture_finish, ventilation, etc.)
 *   P3-4: purity — two identical calls → deep-equal output
 *   P3-5: no countertop answer → Countertops absent (skip_when_missing)
 *   P3-6: scan geometry wins over measured answers
 */

import assert from 'node:assert/strict';
import { deriveScopeTag, translateAnswers, resolveGeometry } from './scopeTranslation.js';
import { computePricingLines } from './pricingCore.js';

// ── Minimal catalog fixtures (bathroom, with Countertops) ─────────────────────

const TEMPLATES = [
  { trade: 'Demo', scope_definition: { summary: 'Demo', optional: false, default_unit: 'ls' } },
  { trade: 'Tile - Wall / shower', scope_definition: {
      summary: 'Shower tile', optional: false, default_unit: 'sf', waste_pct: 15,
      labor_formula: { qty_basis: 'scope_detail', scope_detail_key: 'shower_wall_sf' },
      materials_formula: [{ qty_basis: 'scope_detail', material_name: 'Wall tile field', qty_multiplier: 1, scope_detail_key: 'shower_wall_sf' }],
    } },
  { trade: 'Tile - Floor', scope_definition: {
      summary: 'Floor tile', optional: false, default_unit: 'sf',
      labor_formula: { qty_basis: 'scope_detail', scope_detail_key: 'floor_tile_sf' },
      materials_formula: [
        { qty_basis: 'scope_detail', material_name: 'Floor tile field', qty_multiplier: 1, scope_detail_key: 'floor_tile_sf' },
        { qty_basis: 'scope_detail', material_name: 'Floor tile field', qty_multiplier: 1, scope_detail_key: 'shower_floor_sf' },
      ],
    } },
  { trade: 'Paint - Interior', scope_definition: { summary: 'Paint', optional: false, default_unit: 'sf' } },
  { trade: 'Plumbing - Finish / fixtures', scope_definition: {
      summary: 'Set fixtures', optional: false, default_unit: 'ls',
      materials_formula: [{ qty_basis: 'fixed', material_name: 'Toilet standard', qty_multiplier: 1, fixed_qty: 1 }],
    } },
  { trade: 'Cabinets / vanities - Install', scope_definition: {
      summary: 'Set vanity', optional: false, default_unit: 'ls',
      materials_formula: [{ qty_basis: 'fixed', material_name: 'Vanity cabinet 30in', qty_multiplier: 1, fixed_qty: 1 }],
    } },
  { trade: 'Cleanup', scope_definition: { summary: 'Cleanup', optional: false, default_unit: 'ls',
      labor_formula: { qty_basis: 'metric', metric_key: 'floor_sf' } } },
  { trade: 'Countertops', scope_definition: {
      summary: 'Install countertop', optional: false, default_unit: 'sf',
      labor_formula: { qty_basis: 'scope_detail', scope_detail_key: 'countertop_sf', skip_when_missing: true },
      materials_formula: [
        { qty_basis: 'scope_detail', material_name: 'Countertop slab', qty_multiplier: 1, scope_detail_key: 'countertop_sf' },
        { qty_basis: 'scope_detail', material_name: 'Countertop sink cutout', qty_multiplier: 1, scope_detail_key: 'sink_count' },
      ],
    } },
];

const UNIT_COSTS = [
  { id: 'lc1', trade: 'Demo',                         category: 'labor',    base_rate: 4.5,  unit: 'sf',   multipliers: {}, material_name: null, tenant_id: null, waste_pct: null, coverage_sf: null },
  { id: 'lc2', trade: 'Tile - Wall / shower',         category: 'labor',    base_rate: 14.0, unit: 'sf',   multipliers: {}, material_name: null, tenant_id: null, waste_pct: null, coverage_sf: null },
  { id: 'lc3', trade: 'Tile - Floor',                 category: 'labor',    base_rate: 12.0, unit: 'sf',   multipliers: {}, material_name: null, tenant_id: null, waste_pct: null, coverage_sf: null },
  { id: 'lc4', trade: 'Paint - Interior',             category: 'labor',    base_rate: 1.8,  unit: 'sf',   multipliers: {}, material_name: null, tenant_id: null, waste_pct: null, coverage_sf: null },
  { id: 'lc5', trade: 'Plumbing - Finish / fixtures', category: 'labor',    base_rate: 800,  unit: 'ls',   multipliers: {}, material_name: null, tenant_id: null, waste_pct: null, coverage_sf: null },
  { id: 'lc6', trade: 'Cabinets / vanities - Install',category: 'labor',    base_rate: 350,  unit: 'ls',   multipliers: {}, material_name: null, tenant_id: null, waste_pct: null, coverage_sf: null },
  { id: 'lc7', trade: 'Cleanup',                      category: 'labor',    base_rate: 0.8,  unit: 'sf',   multipliers: {}, material_name: null, tenant_id: null, waste_pct: null, coverage_sf: null },
  // No Countertops rate rows — PENDING RATE by design (KALIN_QUEUE item j)
  { id: 'mc1', trade: 'Tile - Wall / shower',         category: 'materials',base_rate: 4.0,  unit: 'sf',   material_name: 'Wall tile field',     tenant_id: null, waste_pct: 15, coverage_sf: null },
  { id: 'mc2', trade: 'Tile - Floor',                 category: 'materials',base_rate: 3.5,  unit: 'sf',   material_name: 'Floor tile field',    tenant_id: null, waste_pct: 15, coverage_sf: null },
  { id: 'mc3', trade: 'Plumbing - Finish / fixtures', category: 'materials',base_rate: 320,  unit: 'each', material_name: 'Toilet standard',     tenant_id: null, waste_pct: 0,  coverage_sf: null },
  { id: 'mc4', trade: 'Cabinets / vanities - Install',category: 'materials',base_rate: 480,  unit: 'each', material_name: 'Vanity cabinet 30in', tenant_id: null, waste_pct: 0,  coverage_sf: null },
];

const SCOPE_SUBSETS = [
  { scope_tag: 'full_remodel', trades: ['__all__'],                                                                  tenant_id: null, room_type: 'bathroom' },
  { scope_tag: 'not_in_scope', trades: [],                                                                           tenant_id: null, room_type: 'bathroom' },
  { scope_tag: 'tile_only',    trades: ['Demo','Tile - Floor','Tile - Wall / shower','Plumbing - Finish / fixtures','Cleanup'], tenant_id: null, room_type: 'bathroom' },
  // vanity_swap now includes Countertops (P3 migration):
  { scope_tag: 'vanity_swap',  trades: ['Plumbing - Finish / fixtures','Cabinets / vanities - Install','Cleanup','Countertops'], tenant_id: null, room_type: 'bathroom' },
];

const SCHEMA = {
  room_type: 'bathroom', scope_tag: 'full_remodel', tenant_id: null,
  schema: { fields: [
    { key: 'shower_type',          type: 'select',     default: 'shower_only' },
    { key: 'shower_width_in',      type: 'feet_inches', default: 60 },
    { key: 'shower_length_in',     type: 'feet_inches', default: 36 },
    { key: 'shower_wall_height_in',type: 'feet_inches', default: 96 },
    { key: 'shower_wall_sf',       type: 'computed', compute_fn: 'shower_wall_sf_from_dims', overridable: true, override_key: 'shower_wall_sf_override' },
    { key: 'shower_floor_sf',      type: 'computed', compute_fn: 'shower_floor_sf_from_dims', overridable: true, override_key: 'shower_floor_sf_override' },
    { key: 'floor_tile_sf', type: 'number', default_from: 'room.floorSf', subtract: ['shower_floor_sf'] },
    { key: 'sink_count',    type: 'number', default: 1 },
    { key: 'toilet_type', type: 'fixture_select', label: 'Toilet',
      trade: 'Plumbing - Finish / fixtures', default: 'standard',
      options: [{ value: 'standard', material_name: 'Toilet standard' }, { value: 'keep', material_name: null }] },
  ] },
};
const VANITY_SCHEMA = {
  room_type: 'bathroom', scope_tag: 'vanity_swap', tenant_id: null,
  schema: { fields: [
    { key: 'sink_count', type: 'number', default: 1 },
    { key: 'toilet_type', type: 'fixture_select', label: 'Toilet',
      trade: 'Plumbing - Finish / fixtures', default: 'keep',
      options: [{ value: 'standard', material_name: 'Toilet standard' }, { value: 'keep', material_name: null }] },
  ] },
};
const SCHEMAS = [SCHEMA, VANITY_SCHEMA];
const WASTE_ROWS = [
  { parent_trade: 'Tile', sub_trade: 'Wall / shower', default_waste_pct: 15 },
  { parent_trade: 'Tile', sub_trade: 'Floor',         default_waste_pct: 15 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function runPipeline(answersInput, scanGeo) {
  const tag  = deriveScopeTag(answersInput);
  const { scopeDetails, untranslated } = translateAnswers(answersInput);
  const geo  = resolveGeometry({ scanGeometry: scanGeo ?? null, answers: answersInput });
  const room = {
    roomId: 'test_room', roomLabel: 'Bathroom', floor: 0, roomType: 'bathroom',
    isSynthetic: false, scopeTag: tag, scopeLabel: null, scopeMissing: false,
    customTrades: [], scopeDetails,
    geometry: {
      floorSf:     geo.floorSf     ?? 49,
      wallSf:      geo.wallSf      ?? 224,
      perimeterLf: geo.perimeterLf ?? 28,
      ceilingFt:   geo.ceilingFt   ?? 8,
      doors:       geo.doors       ?? 1,
      windows:     geo.windows     ?? 0,
      source:      geo.source,
    },
  };
  const result = computePricingLines({ rooms: [room], templates: TEMPLATES,
    unitCosts: UNIT_COSTS, scopeSubsets: SCOPE_SUBSETS, schemas: SCHEMAS, wasteRows: WASTE_ROWS });
  return { ...result, tag, untranslated };
}

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0, failed = 0;
function test(label, fn) {
  try { fn(); console.log(`  ✓ ${label}`); passed++; }
  catch (e) { console.error(`  ✗ FAIL: ${label}\n    ${e.message}`); failed++; }
}

const FULL_ANSWERS = {
  tub_shower_config: 'walkin', shower_width_in: 60, shower_length_in: 36,
  shower_wall_height_in: 96, vanity_config: 'single', vanity_size_in: '60',
  countertop: 'granite', toilet: 'standard', niche: 'none', shower_bench: false,
  floor_tile: 'porcelain_stonelook', floor_sf: 49, wall_height_in: 96,
  fixture_finish: 'brushed_nickel', ventilation: 'none', shower_glass: 'frameless',
};

const SCAN_GEO = { floorSf: 49, wallSf: 241.62, perimeterLf: 30.24, ceilingFt: 7.99, doors: 1, windows: 0 };

console.log('\npricePlan.computePricingLines pipeline');

// P3-1: full_remodel with scan → Countertops present as PENDING RATE
test('P3-1: deriveScopeTag → full_remodel', () => {
  assert.equal(deriveScopeTag(FULL_ANSWERS), 'full_remodel');
});

test('P3-1: pricingCore emits all template trades for full_remodel', () => {
  const { lines } = runPipeline(FULL_ANSWERS, SCAN_GEO);
  const trades = [...new Set(lines.map(l => l.trade))];
  assert.ok(trades.includes('Demo'));
  assert.ok(trades.includes('Tile - Wall / shower'));
  assert.ok(trades.includes('Countertops'));
  assert.ok(trades.includes('Paint - Interior'));
});

test('P3-1: Countertops labor line qty=9.17 (60"×22/144) PENDING RATE', () => {
  const { lines } = runPipeline(FULL_ANSWERS, SCAN_GEO);
  const clab = lines.find(l => l.trade === 'Countertops' && l.category === 'labor');
  assert.ok(clab, 'Countertops labor missing');
  assert.equal(clab.quantity, 9.17);
  assert.equal(clab.lineCostStatus, 'pending_rate');
  assert.equal(clab.baseRateMissing, true);
});

test('P3-1: Countertop slab material qty=9.17 PENDING RATE', () => {
  const { lines } = runPipeline(FULL_ANSWERS, SCAN_GEO);
  const slab = lines.find(l => l.materialName === 'Countertop slab');
  assert.ok(slab, 'Countertop slab missing');
  assert.equal(slab.quantity, 9.17);
  assert.equal(slab.baseRateMissing, true);
});

test('P3-1: Countertop sink cutout qty=1 (single vanity)', () => {
  const { lines } = runPipeline(FULL_ANSWERS, SCAN_GEO);
  const cutout = lines.find(l => l.materialName === 'Countertop sink cutout');
  assert.ok(cutout, 'cutout missing');
  assert.equal(cutout.quantity, 1);
});

// P3-2: vanity_swap now includes Countertops (P3 migration)
test('P3-2: vanity_swap scope_tag → Countertops in allowed trades', () => {
  const vsAnswers = { vanity_config: 'single', vanity_size_in: '30', countertop: 'quartz' };
  assert.equal(deriveScopeTag(vsAnswers), 'vanity_swap');
  const { lines } = runPipeline(vsAnswers, null);
  const cLines = lines.filter(l => l.trade === 'Countertops');
  assert.ok(cLines.length > 0, 'Countertops not emitted for vanity_swap');
  // countertop_sf for 30": 30×22/144 = 4.58
  const clab = cLines.find(l => l.category === 'labor');
  assert.ok(clab);
  assert.equal(clab.quantity, 4.58);
});

// P3-3: untranslated_fields populated
test('P3-3: untranslated receives fixture_finish, ventilation, shower_glass', () => {
  const { untranslated } = runPipeline(FULL_ANSWERS, SCAN_GEO);
  assert.equal(untranslated.fixture_finish, 'brushed_nickel');
  assert.equal(untranslated.ventilation,    'none');
  assert.equal(untranslated.shower_glass,   'frameless');
});

test('P3-3: translated scope answers are NOT in untranslated', () => {
  const { untranslated } = runPipeline(FULL_ANSWERS, SCAN_GEO);
  assert.equal(untranslated.tub_shower_config, undefined);
  assert.equal(untranslated.vanity_config,     undefined);
  assert.equal(untranslated.countertop,        undefined);
});

// P3-4: purity
test('P3-4: two identical calls → deep-equal output', () => {
  const a = runPipeline(FULL_ANSWERS, SCAN_GEO);
  const b = runPipeline(FULL_ANSWERS, SCAN_GEO);
  assert.deepEqual(a, b);
});

// P3-5: no countertop answer → Countertops absent
test('P3-5: no countertop answer → Countertops lines absent (skip_when_missing)', () => {
  const noCounter = { tub_shower_config: 'walkin', shower_width_in: 60, shower_length_in: 36 };
  const { lines } = runPipeline(noCounter, null);
  const cLines = lines.filter(l => l.trade === 'Countertops');
  assert.equal(cLines.length, 0);
});

// P3-6: scan geometry wins over measured answers
test('P3-6: scan floorSf wins over measured answer', () => {
  const { tag } = runPipeline(FULL_ANSWERS, SCAN_GEO);
  const geo = resolveGeometry({
    scanGeometry: SCAN_GEO,
    answers: { floor_sf: { value: 99, source: 'measured' } },
  });
  assert.equal(geo.floorSf, 49);    // scan wins
  assert.equal(geo.source, 'scan');
});

test('P3-6: no scan + measured → measured wins over manual', () => {
  const geo = resolveGeometry({
    scanGeometry: null,
    answers: { floor_sf: { value: 49, source: 'measured' }, wall_height_in: 108 },
  });
  assert.equal(geo.floorSf, 49);
  assert.equal(geo.source, 'mixed');  // floor=measured, ceil=manual
});

// ── Results ───────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
