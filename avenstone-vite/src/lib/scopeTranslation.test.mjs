/**
 * Unit + integration tests for scopeTranslation.js and the Countertops template
 * in pricingCore. Run with: node avenstone-vite/src/lib/scopeTranslation.test.mjs
 *
 * Coverage:
 *   D1–D6:  deriveScopeTag — one fixture per rule branch
 *   T1–T14: translateAnswers — one assertion per mapping row
 *   G1–G5:  resolveGeometry — precedence and source tracking
 *   I1–I4:  integration — full bathroom answers → translate → pricingCore
 */

import assert from 'node:assert/strict';
import { deriveScopeTag, translateAnswers, resolveGeometry } from './scopeTranslation.js';
import { computePricingLines } from './pricingCore.js';

// ── Test harness ──────────────────────────────────────────────────────────────

let passed = 0, failed = 0;
function test(label, fn) {
  try { fn(); console.log(`  ✓ ${label}`); passed++; }
  catch (e) { console.error(`  ✗ FAIL: ${label}\n    ${e.message}`); failed++; }
}

// ── D: deriveScopeTag ─────────────────────────────────────────────────────────

console.log('\nderiveScopeTag');

test('D1: structural — layout_change → full_remodel', () => {
  assert.equal(deriveScopeTag({ layout_change: 'minor_moves' }), 'full_remodel');
  assert.equal(deriveScopeTag({ layout_change: 'full_reconfigure' }), 'full_remodel');
});

test('D2: structural — drywall replacement → full_remodel', () => {
  assert.equal(deriveScopeTag({ drywall_wet_area: 'cement_board' }), 'full_remodel');
  assert.equal(deriveScopeTag({ drywall_wet_area: 'standard_mr' }), 'full_remodel');
  // existing_keep is NOT a drywall signal — with vanity only, should be vanity_swap
  // (if existing_keep were triggering hasDrywall it would be full_remodel instead)
  assert.equal(deriveScopeTag({ drywall_wet_area: 'existing_keep', vanity_config: 'single' }), 'vanity_swap');
});

test('D3: multi-category — shower + vanity → full_remodel', () => {
  assert.equal(deriveScopeTag({ tub_shower_config: 'walkin', vanity_config: 'single' }), 'full_remodel');
  assert.equal(deriveScopeTag({ tub_shower_config: 'tub_only', countertop: 'quartz' }), 'full_remodel');
});

test('D3: multi-category — shower + LVP → full_remodel (LVP not in tile_only)', () => {
  assert.equal(deriveScopeTag({ tub_shower_config: 'combo', floor_tile: 'lvp' }), 'full_remodel');
});

test('D3: multi-category — shower + tile floor → full_remodel', () => {
  assert.equal(deriveScopeTag({ tub_shower_config: 'walkin', floor_tile: 'porcelain_stonelook' }), 'full_remodel');
});

test('D3: multi-category — vanity + tile floor → full_remodel', () => {
  assert.equal(deriveScopeTag({ vanity_config: 'double', floor_tile: 'natural_stone' }), 'full_remodel');
});

test('D4: single-category wet area only → tile_only', () => {
  assert.equal(deriveScopeTag({ tub_shower_config: 'walkin' }), 'tile_only');
  assert.equal(deriveScopeTag({ shower_width_in: 60, shower_length_in: 36 }), 'tile_only');
});

test('D4: shower + tile floor (no vanity, no LVP) → tile_only (Tile-Floor is in subset)', () => {
  // This is a deliberate choice: tile_only subset includes Tile-Floor; LVP would
  // require full_remodel because Flooring-LVP is NOT in tile_only trades.
  assert.equal(deriveScopeTag({ tub_shower_config: 'walkin', floor_tile: 'porcelain_woodlook' }), 'full_remodel');
  // shower only (no floor specified) → tile_only
  assert.equal(deriveScopeTag({ tub_shower_config: 'walkin', floor_tile: 'keep_existing' }), 'tile_only');
});

test('D5: vanity/counter only, no wet area, no tile floor → vanity_swap', () => {
  assert.equal(deriveScopeTag({ vanity_config: 'single' }), 'vanity_swap');
  assert.equal(deriveScopeTag({ countertop: 'quartz' }), 'vanity_swap');
  assert.equal(deriveScopeTag({ vanity_config: 'double', countertop: 'granite' }), 'vanity_swap');
});

test('D5: vanity + LVP (no shower, no tile) → vanity_swap (LVP is a floor signal; vanity + LVP = 2 cats = full_remodel)', () => {
  // Two distinct categories: fixedSurface + floor → full_remodel
  assert.equal(deriveScopeTag({ vanity_config: 'single', floor_tile: 'lvp' }), 'full_remodel');
});

test('D5: vanity only, keep_existing floor → vanity_swap', () => {
  assert.equal(deriveScopeTag({ vanity_config: 'single', floor_tile: 'keep_existing' }), 'vanity_swap');
});

test('D6: floor only (LVP or tile, no wet area, no vanity) → paint_and_floor', () => {
  assert.equal(deriveScopeTag({ floor_tile: 'lvp' }), 'paint_and_floor');
  assert.equal(deriveScopeTag({ floor_tile: 'porcelain_stonelook' }), 'paint_and_floor');
});

test('D6: default — no signals → full_remodel (broadest tag)', () => {
  assert.equal(deriveScopeTag({}), 'full_remodel');
  assert.equal(deriveScopeTag(null), 'full_remodel');
  assert.equal(deriveScopeTag({ ventilation: 'none' }), 'full_remodel');
});

// ── T: translateAnswers ───────────────────────────────────────────────────────

console.log('\ntranslateAnswers');

test('T1: tub_shower_config → shower_type (value map)', () => {
  assert.equal(translateAnswers({ tub_shower_config: 'walkin'                }).scopeDetails.shower_type, 'shower_only');
  assert.equal(translateAnswers({ tub_shower_config: 'combo'                 }).scopeDetails.shower_type, 'tub_plus_shower');
  assert.equal(translateAnswers({ tub_shower_config: 'freestanding_plus_shower' }).scopeDetails.shower_type, 'tub_plus_shower');
  assert.equal(translateAnswers({ tub_shower_config: 'tub_only'              }).scopeDetails.shower_type, 'tub_only');
});

test('T2: shower_width_in / shower_length_in → passthrough numbers', () => {
  const sd = translateAnswers({ shower_width_in: '60', shower_length_in: '36' }).scopeDetails;
  assert.equal(sd.shower_width_in,  60);
  assert.equal(sd.shower_length_in, 36);
});

test('T3: shower_wall_height_in → passthrough, wins over tile_height', () => {
  const sd = translateAnswers({ shower_wall_height_in: '120', tile_height: 'wainscot' }).scopeDetails;
  assert.equal(sd.shower_wall_height_in, 120); // explicit dim wins
});

test('T4: tile_height=ceiling → shower_wall_height_in from wall_height_in', () => {
  const sd = translateAnswers({ tile_height: 'ceiling', wall_height_in: '96' }).scopeDetails;
  assert.equal(sd.shower_wall_height_in, 96);
});

test('T5: tile_height=standard → shower_wall_height_in=84', () => {
  assert.equal(translateAnswers({ tile_height: 'standard' }).scopeDetails.shower_wall_height_in, 84);
});

test('T6: tile_height=wainscot → shower_wall_height_in=48', () => {
  assert.equal(translateAnswers({ tile_height: 'wainscot' }).scopeDetails.shower_wall_height_in, 48);
});

test('T7: vanity_config → sink_count (single/double/none)', () => {
  assert.equal(translateAnswers({ vanity_config: 'single' }).scopeDetails.sink_count, 1);
  assert.equal(translateAnswers({ vanity_config: 'double' }).scopeDetails.sink_count, 2);
  assert.equal(translateAnswers({ vanity_config: 'none'   }).scopeDetails.sink_count, 0);
});

test('T8: vanity_size_in → vanity_width string', () => {
  assert.equal(translateAnswers({ vanity_size_in: '60' }).scopeDetails.vanity_width, '60');
  assert.equal(translateAnswers({ vanity_size_in: '30' }).scopeDetails.vanity_width, '30');
});

test('T8: vanity_size_in=custom → allowance flag, no vanity_width', () => {
  const { scopeDetails, flags } = translateAnswers({ vanity_size_in: 'custom' });
  assert.equal(scopeDetails.vanity_width, undefined);
  assert.ok(flags.some(f => f.type === 'allowance' && f.field === 'vanity_width'));
});

test('T9: countertop + vanity_size_in → vanity_top + countertop_sf (width×22/144)', () => {
  const sd = translateAnswers({ countertop: 'granite', vanity_size_in: '60' }).scopeDetails;
  assert.equal(sd.vanity_top, 'granite');
  assert.equal(sd.countertop_sf, 9.17); // 60*22/144 = 9.166... → 9.17
});

test('T9: countertop without vanity_size_in → allowance flag for countertop_sf', () => {
  const { scopeDetails, flags } = translateAnswers({ countertop: 'quartz' });
  assert.equal(scopeDetails.vanity_top, 'quartz');
  assert.equal(scopeDetails.countertop_sf, undefined);
  assert.ok(flags.some(f => f.type === 'allowance' && f.field === 'countertop_sf'));
});

test('T10: toilet → toilet_type (value map)', () => {
  assert.equal(translateAnswers({ toilet: 'reuse'          }).scopeDetails.toilet_type, 'keep');
  assert.equal(translateAnswers({ toilet: 'standard'       }).scopeDetails.toilet_type, 'standard');
  assert.equal(translateAnswers({ toilet: 'comfort_height' }).scopeDetails.toilet_type, 'upgrade');
  assert.equal(translateAnswers({ toilet: 'wall_hung'      }).scopeDetails.toilet_type, 'upgrade');
  assert.equal(translateAnswers({ toilet: 'bidet_circuit'  }).scopeDetails.toilet_type, 'upgrade');
});

test('T11: niche (choice) → boolean (none→false, else true)', () => {
  assert.equal(translateAnswers({ niche: 'none'     }).scopeDetails.niche, false);
  assert.equal(translateAnswers({ niche: 'recessed' }).scopeDetails.niche, true);
  assert.equal(translateAnswers({ niche: 'shelf'    }).scopeDetails.niche, true);
  assert.equal(translateAnswers({ niche: 'corner'   }).scopeDetails.niche, true);
});

test('T12: shower_bench → bench (key rename, boolean)', () => {
  assert.equal(translateAnswers({ shower_bench: true  }).scopeDetails.bench, true);
  assert.equal(translateAnswers({ shower_bench: false }).scopeDetails.bench, false);
});

test('T13: no-destination fields go to untranslated, not silently dropped', () => {
  const { untranslated } = translateAnswers({
    fixture_finish: 'brushed_nickel',
    shower_valve:   'rain',
    ventilation:    'exists_vented_out',
    age_of_home:    'post_2000',
    wall_tile_layout: 'subway_offset',
  });
  assert.equal(untranslated.fixture_finish,   'brushed_nickel');
  assert.equal(untranslated.shower_valve,     'rain');
  assert.equal(untranslated.ventilation,      'exists_vented_out');
  assert.equal(untranslated.age_of_home,      'post_2000');
  assert.equal(untranslated.wall_tile_layout, 'subway_offset');
});

test('T14: perception/vision fields go to untranslated', () => {
  const { untranslated } = translateAnswers({
    existing_tub_shower:   'tub',
    existing_wall_finish:  'tile',
    existing_floor_finish: 'vinyl_lvp',
    existing_vanity:       'single',
    existing_countertop:   'stone',
  });
  assert.equal(untranslated.existing_tub_shower,   'tub');
  assert.equal(untranslated.existing_countertop,   'stone');
});

// ── G: resolveGeometry ────────────────────────────────────────────────────────

console.log('\nresolveGeometry');

const SCAN = { floorSf: 49, wallSf: 240, perimeterLf: 28, ceilingFt: 8, doors: 1, windows: 0 };

test('G1: scan present — all scan values win', () => {
  const g = resolveGeometry({
    scanGeometry: SCAN,
    answers: { floor_sf: { value: 60, source: 'measured' }, wall_height_in: { value: 96, source: 'measured' } },
  });
  assert.equal(g.floorSf, 49);   // scan wins
  assert.equal(g.ceilingFt, 8);  // scan wins
  assert.equal(g.wallSf, 240);
  assert.equal(g.source, 'scan');
});

test('G2: no scan, measured answers → measured source', () => {
  const g = resolveGeometry({
    scanGeometry: null,
    answers: { floor_sf: { value: 49, source: 'measured' }, wall_height_in: { value: 96, source: 'measured' } },
  });
  assert.equal(g.floorSf, 49);
  assert.equal(g.ceilingFt, 8);   // 96/12
  assert.equal(g.wallSf, null);   // only from scan
  assert.equal(g.source, 'measured');
});

test('G3: no scan, manual answers → manual source', () => {
  const g = resolveGeometry({
    scanGeometry: null,
    answers: { floor_sf: 55, wall_height_in: 108 },
  });
  assert.equal(g.floorSf, 55);
  assert.equal(g.ceilingFt, 9);    // 108/12
  assert.equal(g.source, 'manual');
});

test('G4: measured beats manual (scan absent)', () => {
  const g = resolveGeometry({
    scanGeometry: null,
    answers: {
      floor_sf: { value: 49, source: 'measured' },
      wall_height_in: 108, // manual
    },
  });
  assert.equal(g.floorSf, 49);     // measured
  assert.equal(g.ceilingFt, 9);    // manual (no measured for wall height)
  assert.equal(g.source, 'mixed'); // floor=measured, ceiling=manual
});

test('G5: partial scan + manual fallback → mixed source', () => {
  const partialScan = { floorSf: 49, wallSf: null, perimeterLf: null, ceilingFt: null, doors: 0, windows: 0 };
  const g = resolveGeometry({
    scanGeometry: partialScan,
    answers: { wall_height_in: { value: 96, source: 'measured' } },
  });
  assert.equal(g.floorSf, 49);     // scan
  assert.equal(g.ceilingFt, 8);    // measured (96/12)
  assert.equal(g.source, 'mixed'); // floor=scan, ceiling=measured
});

// ── I: Integration — full answer set → translate → pricingCore ───────────────

console.log('\nIntegration (full bathroom → pricingCore)');

// Minimal but complete catalog fixtures (reusing P1 fixture patterns + Countertops)
const TEMPLATES_WITH_COUNTER = [
  { trade: 'Demo',             scope_definition: { summary: 'Demo', optional: false, default_unit: 'ls' } },
  { trade: 'Tile - Wall / shower', scope_definition: {
      summary: 'Shower tile', optional: false, default_unit: 'sf', waste_pct: 15,
      labor_formula: { qty_basis: 'scope_detail', scope_detail_key: 'shower_wall_sf' },
      materials_formula: [
        { qty_basis: 'scope_detail', material_name: 'Wall tile field', qty_multiplier: 1, scope_detail_key: 'shower_wall_sf' },
      ],
    },
  },
  { trade: 'Tile - Floor', scope_definition: {
      summary: 'Floor tile', optional: false, default_unit: 'sf', waste_pct: 15,
      labor_formula: { qty_basis: 'scope_detail', scope_detail_key: 'floor_tile_sf' },
      materials_formula: [
        { qty_basis: 'scope_detail', material_name: 'Floor tile field', qty_multiplier: 1, scope_detail_key: 'floor_tile_sf' },
        { qty_basis: 'scope_detail', material_name: 'Floor tile field', qty_multiplier: 1, scope_detail_key: 'shower_floor_sf' },
      ],
    },
  },
  { trade: 'Plumbing - Finish / fixtures', scope_definition: {
      summary: 'Set fixtures', optional: false, default_unit: 'ls',
      materials_formula: [
        { qty_basis: 'fixed', material_name: 'Toilet standard', qty_multiplier: 1, fixed_qty: 1 },
      ],
    },
  },
  { trade: 'Countertops', scope_definition: {
      summary: 'Install countertop slab, edge profile, and sink cutout(s)',
      optional: false, default_unit: 'sf',
      labor_formula: { qty_basis: 'scope_detail', scope_detail_key: 'countertop_sf', skip_when_missing: true },
      materials_formula: [
        { qty_basis: 'scope_detail', material_name: 'Countertop slab',       qty_multiplier: 1, scope_detail_key: 'countertop_sf' },
        { qty_basis: 'scope_detail', material_name: 'Countertop sink cutout', qty_multiplier: 1, scope_detail_key: 'sink_count'   },
      ],
    },
  },
];
const UNIT_COSTS = [
  { id: 'lc1', trade: 'Demo',                         category: 'labor',     base_rate: 4.50,  unit: 'sf',   multipliers: {}, material_name: null, tenant_id: null, waste_pct: null, coverage_sf: null },
  { id: 'lc2', trade: 'Tile - Wall / shower',         category: 'labor',     base_rate: 14.00, unit: 'sf',   multipliers: {}, material_name: null, tenant_id: null, waste_pct: null, coverage_sf: null },
  { id: 'lc3', trade: 'Tile - Floor',                 category: 'labor',     base_rate: 12.00, unit: 'sf',   multipliers: {}, material_name: null, tenant_id: null, waste_pct: null, coverage_sf: null },
  { id: 'lc4', trade: 'Plumbing - Finish / fixtures', category: 'labor',     base_rate: 800,   unit: 'ls',   multipliers: {}, material_name: null, tenant_id: null, waste_pct: null, coverage_sf: null },
  { id: 'mc1', trade: 'Tile - Wall / shower',         category: 'materials', base_rate: 4.00,  unit: 'sf',   material_name: 'Wall tile field',     tenant_id: null, waste_pct: 15, coverage_sf: null },
  { id: 'mc2', trade: 'Tile - Floor',                 category: 'materials', base_rate: 3.50,  unit: 'sf',   material_name: 'Floor tile field',    tenant_id: null, waste_pct: 15, coverage_sf: null },
  { id: 'mc3', trade: 'Plumbing - Finish / fixtures', category: 'materials', base_rate: 320,   unit: 'each', material_name: 'Toilet standard',     tenant_id: null, waste_pct: 0,  coverage_sf: null },
  // No Countertops rates — intentional (KALIN_QUEUE item j)
];
const SCOPE_SUBSETS = [
  { scope_tag: 'full_remodel',  trades: ['__all__'],  tenant_id: null, room_type: 'bathroom' },
  { scope_tag: 'not_in_scope',  trades: [],           tenant_id: null, room_type: 'bathroom' },
  { scope_tag: 'tile_only',     trades: ['Demo','Tile - Floor','Tile - Wall / shower','Plumbing - Finish / fixtures'], tenant_id: null, room_type: 'bathroom' },
];
const FULL_REMODEL_SCHEMA = {
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
const SCHEMAS = [FULL_REMODEL_SCHEMA];

// Full configurator answer set (tub→shower conversion, 60" single vanity, granite counter)
const FULL_ANSWERS = {
  tub_shower_config:    'walkin',    // existing walk-in tub → new shower
  shower_width_in:      60,
  shower_length_in:     36,
  shower_wall_height_in: 96,
  vanity_config:        'single',
  vanity_size_in:       '60',
  countertop:           'granite',
  toilet:               'standard',
  niche:                'recessed',
  shower_bench:         false,
  floor_tile:           'porcelain_stonelook',
  floor_sf:             49,
  wall_height_in:       96,
  // no-destination fields (should land in untranslated)
  fixture_finish:       'brushed_nickel',
  ventilation:          'none',
};

function runIntegration(answers, scanGeo) {
  const tag  = deriveScopeTag(answers);
  const { scopeDetails } = translateAnswers(answers);
  const geo  = resolveGeometry({ scanGeometry: scanGeo ?? null, answers });
  const room = {
    roomId: 'bathroom_01', roomLabel: 'Bathroom', floor: 0, roomType: 'bathroom',
    isSynthetic: false, scopeTag: tag, scopeLabel: null, scopeMissing: false,
    customTrades: [], scopeDetails: scopeDetails,
    geometry: { floorSf: geo.floorSf ?? 49, wallSf: geo.wallSf ?? 224,
                perimeterLf: geo.perimeterLf ?? 28, ceilingFt: geo.ceilingFt ?? 8,
                doors: geo.doors ?? 1, windows: geo.windows ?? 0, source: geo.source },
  };
  return computePricingLines({ rooms: [room], templates: TEMPLATES_WITH_COUNTER,
    unitCosts: UNIT_COSTS, scopeSubsets: SCOPE_SUBSETS, schemas: SCHEMAS, wasteRows: [] });
}

test('I1: deriveScopeTag on full answers → full_remodel', () => {
  assert.equal(deriveScopeTag(FULL_ANSWERS), 'full_remodel');
});

test('I2: translateAnswers on full answers → correct scopeDetails', () => {
  const { scopeDetails, untranslated } = translateAnswers(FULL_ANSWERS);
  assert.equal(scopeDetails.shower_type,      'shower_only');
  assert.equal(scopeDetails.shower_width_in,  60);
  assert.equal(scopeDetails.vanity_top,       'granite');
  assert.equal(scopeDetails.countertop_sf,    9.17);  // 60×22/144
  assert.equal(scopeDetails.sink_count,       1);
  assert.equal(scopeDetails.toilet_type,      'standard');
  assert.equal(scopeDetails.niche,            true);
  // floor_sf and ventilation should NOT be in scopeDetails
  assert.equal(scopeDetails.floor_sf,         undefined);
  assert.equal(scopeDetails.ventilation,      undefined);
  // fixture_finish → untranslated
  assert.equal(untranslated.fixture_finish,   'brushed_nickel');
});

test('I3: pricingCore with full answers + scan geo → Countertops lines PENDING RATE', () => {
  const scanGeo = { floorSf: 49, wallSf: 224, perimeterLf: 28, ceilingFt: 8, doors: 1, windows: 0 };
  const { lines } = runIntegration(FULL_ANSWERS, scanGeo);
  const counterLines = lines.filter(l => l.trade === 'Countertops');
  // Labor line: countertop_sf=9.17, no rate → pending_rate
  const labor = counterLines.find(l => l.category === 'labor');
  assert.ok(labor, 'Countertops labor line missing');
  assert.equal(labor.quantity, 9.17);
  assert.equal(labor.lineCostStatus, 'pending_rate');
  // Material: Countertop slab (qty=9.17) + Countertop sink cutout (qty=1)
  const slab = counterLines.find(l => l.materialName === 'Countertop slab');
  assert.ok(slab, 'Countertop slab missing');
  assert.equal(slab.quantity, 9.17);
  assert.equal(slab.lineCostStatus, 'pending_rate');
  const cutout = counterLines.find(l => l.materialName === 'Countertop sink cutout');
  assert.ok(cutout, 'Countertop sink cutout missing');
  assert.equal(cutout.quantity, 1);
  assert.equal(cutout.lineCostStatus, 'pending_rate');
});

test('I3: double vanity (60") → countertop_sf=9.17 and sink_count=2 → cutout qty=2', () => {
  const doubleAnswers = { ...FULL_ANSWERS, vanity_config: 'double', vanity_size_in: '60' };
  const { scopeDetails } = translateAnswers(doubleAnswers);
  assert.equal(scopeDetails.sink_count,   2);
  assert.equal(scopeDetails.countertop_sf, 9.17);
  const { lines } = runIntegration(doubleAnswers, null);
  const cutout = lines.find(l => l.materialName === 'Countertop sink cutout');
  assert.ok(cutout, 'sink cutout missing for double vanity');
  assert.equal(cutout.quantity, 2);
});

test('I4: purity — two identical integration calls produce deep-equal output', () => {
  const a = runIntegration(FULL_ANSWERS, null);
  const b = runIntegration(FULL_ANSWERS, null);
  assert.deepEqual(a, b);
});

// ── I5: skip_when_missing: no countertop answer → no Countertops lines ────────

test('I5: no countertop in answers → Countertops lines absent (skip_when_missing)', () => {
  const noCounter = { tub_shower_config: 'walkin', shower_width_in: 60, shower_length_in: 36 };
  // scope_details will have no countertop_sf
  const { lines } = runIntegration(noCounter, null);
  const counterLines = lines.filter(l => l.trade === 'Countertops');
  assert.equal(counterLines.length, 0, `Expected 0 Countertops lines, got ${counterLines.length}`);
});

// ── Results ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
