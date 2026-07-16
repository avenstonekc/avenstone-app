/**
 * Unit tests for pricingCore.computePricingLines.
 * Run with: node avenstone-vite/src/lib/pricingCore.test.mjs
 *
 * Covers:
 *   F1 — full_remodel bathroom with scan geometry + shower dims scope_details
 *   F2 — labor extras (niche install) gated on scope_detail boolean
 *   F3 — missing-rate line (PENDING RATE status)
 *   F4 — purity: two identical calls → deep-equal output
 *   F5 — unscoped room (null scopeTag) emits all trades
 *   F6 — not_in_scope rooms are excluded
 *   F7 — tile_only subset filters to 5 trades only
 *   F8 — synthetic room: labor lines stripped, material lines kept
 *   F9 — fixture_select line emitted for shower door
 *   F10 — material line merge: "Floor tile field" summed across floor + shower floor
 */

import { computePricingLines } from './pricingCore.js';
import assert from 'node:assert/strict';

// ── Fixtures ──────────────────────────────────────────────────────────────────

// Minimal bathroom scan room: 49 sqft, perim ~28 lf (square approx), 8 ft ceiling
const BATHROOM_ROOM = {
  roomId: 'scan_001',
  roomLabel: 'Bathroom',
  floor: 0,
  roomType: 'bathroom',
  isSynthetic: false,
  scopeTag: 'full_remodel',
  scopeLabel: 'Full Remodel',
  scopeMissing: false,
  scopeDetails: {
    // Shower dims — drives the tile quantities
    shower_type:          'shower_only',
    shower_width_in:      60,
    shower_length_in:     36,
    shower_wall_height_in: 96,
    // Fixtures
    vanity_width: '30',
    vanity_top:   'cultured_marble',
    sink_count:   1,
    toilet_type:  'standard',
    shower_door_type: 'slider',
  },
  customTrades: [],
  geometry: {
    floorSf:     49,
    wallSf:      224,   // 28 lf × 8 ft
    perimeterLf: 28,
    ceilingFt:   8,
    doors:       1,
    windows:     1,
    source:      'normalized',
  },
};

// Minimal templates — Demo, Tile-Floor, Tile-Wall/shower, Paint-Interior, Plumbing-Finish, Cabinets
const TEMPLATES = [
  {
    trade: 'Demo',
    scope_definition: {
      summary: 'Full gut demo',
      optional: false,
      conditional: null,
      default_unit: 'ls',
    },
  },
  {
    trade: 'Tile - Floor',
    scope_definition: {
      summary: 'Floor tile',
      optional: false,
      conditional: null,
      default_unit: 'sf',
      waste_pct: 15,
      labor_formula: { qty_basis: 'scope_detail', scope_detail_key: 'floor_tile_sf' },
      materials_formula: [
        { qty_basis: 'scope_detail', material_name: 'Floor tile field', qty_multiplier: 1, scope_detail_key: 'floor_tile_sf' },
        { qty_basis: 'scope_detail', material_name: 'Floor tile field', qty_multiplier: 1, scope_detail_key: 'shower_floor_sf' },
      ],
    },
  },
  {
    trade: 'Tile - Wall / shower',
    scope_definition: {
      summary: 'Shower tile',
      optional: false,
      conditional: null,
      default_unit: 'sf',
      waste_pct: 15,
      labor_formula: { qty_basis: 'scope_detail', scope_detail_key: 'shower_wall_sf' },
      labor_extras: [
        { material_name: 'Niche install',            scope_detail_key: 'niche', fixed_qty: 1 },
        { material_name: 'Bench framing + waterproof', scope_detail_key: 'bench', fixed_qty: 1 },
      ],
      materials_formula: [
        { qty_basis: 'scope_detail', material_name: 'Wall tile field', qty_multiplier: 1, scope_detail_key: 'shower_wall_sf' },
      ],
    },
  },
  {
    trade: 'Paint - Interior',
    scope_definition: {
      summary: 'Interior paint',
      optional: false,
      conditional: null,
      default_unit: 'sf',
    },
  },
  {
    trade: 'Plumbing - Finish / fixtures',
    scope_definition: {
      summary: 'Set fixtures',
      optional: false,
      conditional: null,
      default_unit: 'ls',
      materials_formula: [
        { qty_basis: 'fixed', material_name: 'Toilet standard', qty_multiplier: 1, fixed_qty: 1 },
      ],
    },
  },
  {
    trade: 'Cabinets / vanities - Install',
    scope_definition: {
      summary: 'Set vanity',
      optional: false,
      conditional: null,
      default_unit: 'ls',
      materials_formula: [
        { qty_basis: 'fixed', material_name: 'Vanity cabinet 30in', qty_multiplier: 1, fixed_qty: 1 },
      ],
    },
  },
];

// Labor unit costs (one per trade, no tenant overrides)
const LABOR_COSTS = [
  { id: 'lc1', trade: 'Demo',                        category: 'labor', base_rate: 4.50, unit: 'sf', multipliers: {}, material_name: null, tenant_id: null, waste_pct: null, coverage_sf: null },
  { id: 'lc2', trade: 'Tile - Floor',                category: 'labor', base_rate: 12.00, unit: 'sf', multipliers: {}, material_name: null, tenant_id: null, waste_pct: null, coverage_sf: null },
  { id: 'lc3', trade: 'Tile - Wall / shower',        category: 'labor', base_rate: 14.00, unit: 'sf', multipliers: {}, material_name: null, tenant_id: null, waste_pct: null, coverage_sf: null },
  { id: 'lc4', trade: 'Paint - Interior',            category: 'labor', base_rate: 1.80, unit: 'sf', multipliers: {}, material_name: null, tenant_id: null, waste_pct: null, coverage_sf: null },
  { id: 'lc5', trade: 'Plumbing - Finish / fixtures',category: 'labor', base_rate: 800.00, unit: 'ls', multipliers: {}, material_name: null, tenant_id: null, waste_pct: null, coverage_sf: null },
  { id: 'lc6', trade: 'Cabinets / vanities - Install',category: 'labor', base_rate: 350.00, unit: 'ls', multipliers: {}, material_name: null, tenant_id: null, waste_pct: null, coverage_sf: null },
  // Labor extras for niche/bench
  { id: 'le1', trade: 'Tile - Wall / shower',        category: 'labor', base_rate: 250.00, unit: 'each', multipliers: {}, material_name: 'Niche install',             tenant_id: null, waste_pct: null, coverage_sf: null },
  { id: 'le2', trade: 'Tile - Wall / shower',        category: 'labor', base_rate: 400.00, unit: 'each', multipliers: {}, material_name: 'Bench framing + waterproof', tenant_id: null, waste_pct: null, coverage_sf: null },
];

// Material unit costs
const MATERIAL_COSTS = [
  { id: 'mc1', trade: 'Tile - Floor',                 category: 'materials', base_rate: 3.50, unit: 'sf', material_name: 'Floor tile field',   tenant_id: null, waste_pct: 15, coverage_sf: null },
  { id: 'mc2', trade: 'Tile - Wall / shower',         category: 'materials', base_rate: 4.00, unit: 'sf', material_name: 'Wall tile field',    tenant_id: null, waste_pct: 15, coverage_sf: null },
  { id: 'mc3', trade: 'Plumbing - Finish / fixtures', category: 'materials', base_rate: 320.00, unit: 'each', material_name: 'Toilet standard',  tenant_id: null, waste_pct: 0, coverage_sf: null },
  { id: 'mc4', trade: 'Cabinets / vanities - Install',category: 'materials', base_rate: 480.00, unit: 'each', material_name: 'Vanity cabinet 30in', tenant_id: null, waste_pct: 0, coverage_sf: null },
  // Fixture select: shower door
  { id: 'mc5', trade: 'Tile - Wall / shower',         category: 'materials', base_rate: 680.00, unit: 'each', material_name: 'Shower door - glass slider', tenant_id: null, waste_pct: 0, coverage_sf: null },
  // Vanity top (fixture_select via options_template path)
  { id: 'mc6', trade: 'Cabinets / vanities - Install',category: 'materials', base_rate: 240.00, unit: 'each', material_name: 'Vanity top - cultured marble 30in', tenant_id: null, waste_pct: 0, coverage_sf: null },
  { id: 'mc7', trade: 'Plumbing - Finish / fixtures', category: 'materials', base_rate: 95.00, unit: 'each', material_name: 'Vanity sink standard', tenant_id: null, waste_pct: 0, coverage_sf: null },
];

const ALL_UNIT_COSTS = [...LABOR_COSTS, ...MATERIAL_COSTS];

// full_remodel subset — all trades (__all__)
const SCOPE_SUBSETS = [
  { scope_tag: 'full_remodel', label: 'Full Remodel', trades: ['__all__'], tenant_id: null, room_type: 'bathroom' },
  { scope_tag: 'not_in_scope', label: 'Not in bid',   trades: [],          tenant_id: null, room_type: 'bathroom' },
  { scope_tag: 'tile_only',    label: 'Tile Only',    trades: ['Demo', 'Tile - Floor', 'Tile - Wall / shower', 'Plumbing - Finish / fixtures', 'Cabinets / vanities - Install'], tenant_id: null, room_type: 'bathroom' },
];

// Minimal bathroom full_remodel schema — enough to drive computed shower SF + fixture selects
const FULL_REMODEL_SCHEMA = {
  room_type: 'bathroom', scope_tag: 'full_remodel', tenant_id: null,
  schema: {
    fields: [
      { key: 'shower_type',          type: 'select',   default: 'shower_only' },
      { key: 'shower_width_in',      type: 'feet_inches', default: 60 },
      { key: 'shower_length_in',     type: 'feet_inches', default: 36 },
      { key: 'shower_wall_height_in',type: 'feet_inches', default: 96 },
      { key: 'shower_wall_sf',       type: 'computed',  compute_fn: 'shower_wall_sf_from_dims', overridable: true, override_key: 'shower_wall_sf_override' },
      { key: 'shower_floor_sf',      type: 'computed',  compute_fn: 'shower_floor_sf_from_dims', overridable: true, override_key: 'shower_floor_sf_override' },
      {
        key: 'shower_door_type', type: 'fixture_select', label: 'Shower door',
        trade: 'Tile - Wall / shower', default: 'slider',
        options: [
          { value: 'slider',          material_name: 'Shower door - glass slider' },
          { value: 'swing_frameless', material_name: 'Shower door - glass swing frameless' },
          { value: 'curtain',         material_name: 'Shower door - curtain rod' },
          { value: 'none',            material_name: null },
          { value: 'keep_existing',   material_name: null },
        ],
      },
      { key: 'niche', type: 'boolean', default: false },
      { key: 'bench', type: 'boolean', default: false },
      { key: 'floor_tile_sf', type: 'number', default_from: 'room.floorSf', subtract: ['shower_floor_sf'] },
      { key: 'vanity_width',  type: 'fixture_select', label: 'Vanity width',
        trade: 'Cabinets / vanities - Install', default: '30',
        options: [{ value: '30', material_name: 'Vanity cabinet 30in' }, { value: '24', material_name: 'Vanity cabinet 24in' }] },
      {
        key: 'vanity_top', type: 'fixture_select', label: 'Vanity top material',
        trade: 'Cabinets / vanities - Install', default: 'cultured_marble',
        options: [
          { value: 'cultured_marble', material_label: 'Cultured marble' },
          { value: 'quartz',          material_label: 'Quartz' },
        ],
        options_from: 'vanity_width',
        options_template: 'Vanity top - {material} {vanity_width}in',
      },
      { key: 'sink_count', type: 'number', default: 1 },
      {
        key: 'toilet_type', type: 'fixture_select', label: 'Toilet replacement',
        trade: 'Plumbing - Finish / fixtures', default: 'standard',
        options: [
          { value: 'standard', material_name: 'Toilet standard' },
          { value: 'upgrade',  material_name: 'Toilet upgrade one-piece' },
          { value: 'keep',     material_name: null },
        ],
      },
    ],
  },
};

const SCHEMAS = [FULL_REMODEL_SCHEMA];

// Minimal waste rows
const WASTE_ROWS = [
  { parent_trade: 'Tile', sub_trade: 'Floor',        default_waste_pct: 15 },
  { parent_trade: 'Tile', sub_trade: 'Wall / shower', default_waste_pct: 15 },
  { parent_trade: 'Demo', sub_trade: null,             default_waste_pct: 0  },
  { parent_trade: 'Paint', sub_trade: 'Interior',     default_waste_pct: 0  },
];

// ── Helper ────────────────────────────────────────────────────────────────────

function run(roomsOverride, templatesOverride, unitCostsOverride) {
  return computePricingLines({
    rooms:       roomsOverride   ?? [BATHROOM_ROOM],
    templates:   templatesOverride ?? TEMPLATES,
    unitCosts:   unitCostsOverride ?? ALL_UNIT_COSTS,
    scopeSubsets: SCOPE_SUBSETS,
    schemas:     SCHEMAS,
    wasteRows:   WASTE_ROWS,
  });
}

// ── Test runner ───────────────────────────────────────────────────────────────

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

console.log('\npricingCore.computePricingLines');

// ── F1: full_remodel bathroom ─────────────────────────────────────────────────

test('F1: produces lines for all 6 fixture templates', () => {
  const { lines } = run();
  const trades = [...new Set(lines.map(l => l.trade))];
  assert.ok(trades.includes('Demo'), 'Demo missing');
  assert.ok(trades.includes('Tile - Floor'), 'Tile - Floor missing');
  assert.ok(trades.includes('Tile - Wall / shower'), 'Tile - Wall / shower missing');
  assert.ok(trades.includes('Paint - Interior'), 'Paint - Interior missing');
  assert.ok(trades.includes('Plumbing - Finish / fixtures'), 'Plumbing missing');
  assert.ok(trades.includes('Cabinets / vanities - Install'), 'Cabinets missing');
});

test('F1: Demo labor quantity = floorSf (no waste, areaSf_noWaste)', () => {
  const { lines } = run();
  const demo = lines.find(l => l.trade === 'Demo' && l.category === 'labor');
  assert.equal(demo?.quantity, 49);
  assert.equal(demo?.lineCostStatus, 'ok');
});

test('F1: Tile-Wall labor quantity uses computed shower_wall_sf (scope_detail labor_formula)', () => {
  // shower_only: 2*(60+36)/12 * 96/12 = 2*8ft * 8ft = 128 sf → Math.round(12.8 * 10)/10 via computeFns
  // shower_wall_sf_from_dims: 2*(60+36)/12 * 96/12 = 128.0
  const { lines } = run();
  const tileWall = lines.find(l => l.trade === 'Tile - Wall / shower' && l.category === 'labor' && !l.materialName);
  assert.ok(tileWall, 'Tile-Wall labor line not found');
  assert.equal(tileWall.quantity, 128);
  assert.equal(tileWall.quantityNotes, 'scope: shower_wall_sf = 128.0');
});

test('F1: Tile-Floor labor quantity = floor_tile_sf (floorSf minus shower_floor_sf)', () => {
  // shower_floor_sf = (60/12)*(36/12) = 5*3 = 15.0
  // floor_tile_sf = 49 - 15 = 34
  const { lines } = run();
  const tileFloor = lines.find(l => l.trade === 'Tile - Floor' && l.category === 'labor');
  assert.ok(tileFloor, 'Tile-Floor labor line not found');
  assert.equal(tileFloor.quantity, 34);
});

test('F1: Paint-Interior labor uses wallSf (quantitySource regex → wallSf)', () => {
  const { lines } = run();
  const paint = lines.find(l => l.trade === 'Paint - Interior' && l.category === 'labor');
  assert.equal(paint?.quantity, 224);  // wallAreaSf
});

test('F1: Plumbing labor quantity = null (unit "ls" not matched by quantitySource → pending_quantity)', () => {
  const { lines } = run();
  const plumb = lines.find(l => l.trade === 'Plumbing - Finish / fixtures' && l.category === 'labor');
  assert.ok(plumb, 'Plumbing labor line missing');
  assert.equal(plumb.quantity, null);
  assert.equal(plumb.lineCostStatus, 'pending_quantity');
});

test('F1: Toilet standard material line (fixed qty=1)', () => {
  const { lines } = run();
  const toilet = lines.find(l => l.trade === 'Plumbing - Finish / fixtures' && l.category === 'materials' && l.materialName === 'Toilet standard');
  assert.ok(toilet, 'Toilet material line not found');
  assert.equal(toilet.quantity, 1);
  assert.equal(toilet.lineCost, 320);
});

test('F1: Floor tile field quantity merges floor + shower floor with 15% waste (34*1.15 + 15*1.15 = 56.35)', () => {
  const { lines } = run();
  const tileField = lines.find(l => l.materialName === 'Floor tile field');
  assert.ok(tileField, 'Floor tile field not found');
  // Waste (15%) applied to each scope_detail segment before merge:
  // floor_tile_sf=34 → 39.1, shower_floor_sf=15 → 17.25, merged = 56.35
  assert.equal(tileField.quantity, 56.35);
});

test('F1: summary.subtotal is a finite number > 0', () => {
  const { summary } = run();
  assert.ok(typeof summary.subtotal === 'number' && summary.subtotal > 0, `subtotal: ${summary.subtotal}`);
});

test('F1: summary.totalLines equals lines.length', () => {
  const { lines, summary } = run();
  assert.equal(summary.totalLines, lines.length);
});

// ── F2: labor extras (niche) ──────────────────────────────────────────────────

test('F2: niche=false → no Niche install labor extra', () => {
  const { lines } = run();
  const niche = lines.find(l => l.materialName === 'Niche install');
  assert.equal(niche, undefined, 'Niche install should not appear when niche=false');
});

test('F2: niche=true → Niche install labor extra emitted with qty=1', () => {
  const room = { ...BATHROOM_ROOM, scopeDetails: { ...BATHROOM_ROOM.scopeDetails, niche: true } };
  const { lines } = run([room]);
  const niche = lines.find(l => l.materialName === 'Niche install');
  assert.ok(niche, 'Niche install labor extra missing');
  assert.equal(niche.quantity, 1);
  assert.equal(niche.lineCost, 250);
});

// ── F3: missing-rate line ─────────────────────────────────────────────────────

test('F3: trade with no labor cost row → lineCostStatus pending_rate', () => {
  // Add a template for a trade with no unit cost entry
  const templates = [...TEMPLATES, {
    trade: 'Heated Flooring',
    scope_definition: { summary: 'Radiant floor heat', optional: true, default_unit: 'sf' },
  }];
  const { lines } = run(undefined, templates, undefined);
  const heated = lines.find(l => l.trade === 'Heated Flooring' && l.category === 'labor');
  assert.ok(heated, 'Missing-rate trade not found');
  assert.equal(heated.lineCostStatus, 'pending_rate');
  assert.equal(heated.baseRateMissing, true);
  assert.equal(heated.lineCost, null);
});

// ── F4: purity ────────────────────────────────────────────────────────────────

test('F4: two identical calls produce deep-equal output', () => {
  const a = run();
  const b = run();
  assert.deepEqual(a, b);
});

test('F4: summary.subtotal is the same on repeated calls', () => {
  const runs = Array.from({ length: 3 }, () => run().summary.subtotal);
  assert.ok(runs.every(v => v === runs[0]), `subtotals differ: ${runs}`);
});

// ── F5: unscoped room emits all trades ────────────────────────────────────────

test('F5: null scopeTag → all template trades emitted', () => {
  const room = { ...BATHROOM_ROOM, scopeTag: null, scopeMissing: true, scopeDetails: {} };
  const { lines } = run([room]);
  const trades = [...new Set(lines.map(l => l.trade))];
  assert.ok(trades.includes('Demo'), 'Demo missing for unscoped room');
  assert.ok(trades.includes('Tile - Floor'), 'Tile-Floor missing for unscoped room');
});

// ── F6: not_in_scope excluded ─────────────────────────────────────────────────

test('F6: not_in_scope room is excluded from lines entirely', () => {
  const room = { ...BATHROOM_ROOM, scopeTag: 'not_in_scope' };
  const { lines, summary } = run([room]);
  assert.equal(lines.length, 0);
  assert.equal(summary.totalRooms, 0);
});

// ── F7: tile_only subset filters trades ──────────────────────────────────────

test('F7: tile_only subset emits only the 5 allowed trades', () => {
  const room = { ...BATHROOM_ROOM, scopeTag: 'tile_only', scopeLabel: 'Tile Only' };
  const { lines } = run([room]);
  const trades = [...new Set(lines.map(l => l.trade))];
  const allowedSet = new Set(['Demo', 'Tile - Floor', 'Tile - Wall / shower', 'Plumbing - Finish / fixtures', 'Cabinets / vanities - Install']);
  for (const t of trades) {
    assert.ok(allowedSet.has(t), `Unexpected trade in tile_only: ${t}`);
  }
  // Paint - Interior must be absent
  assert.ok(!trades.includes('Paint - Interior'), 'Paint - Interior should be excluded by tile_only');
});

// ── F8: synthetic room strips labor ──────────────────────────────────────────

test('F8: synthetic room (isSynthetic=true, roomId starts "answer_") has no labor lines', () => {
  const room = { ...BATHROOM_ROOM, roomId: 'answer_jr123', isSynthetic: true };
  const { lines } = run([room]);
  const laborLines = lines.filter(l => l.category === 'labor');
  assert.equal(laborLines.length, 0, `Expected 0 labor lines for synthetic room, got ${laborLines.length}`);
});

test('F8: synthetic room still emits material lines', () => {
  const room = { ...BATHROOM_ROOM, roomId: 'answer_jr123', isSynthetic: true };
  const { lines } = run([room]);
  const matLines = lines.filter(l => l.category === 'materials');
  assert.ok(matLines.length > 0, 'Synthetic room should have material lines');
});

// ── F9: fixture_select shower door line ───────────────────────────────────────

test('F9: shower_door_type=slider emits fixture material line Shower door - glass slider', () => {
  const { lines } = run();
  const door = lines.find(l => l.materialName === 'Shower door - glass slider');
  assert.ok(door, 'Shower door fixture line not found');
  assert.equal(door.quantity, 1);
  assert.equal(door.lineCost, 680);
  assert.equal(door.quantityNotes, 'fixture: Shower door');
});

test('F9: shower_door_type=none → no shower door line', () => {
  const room = { ...BATHROOM_ROOM, scopeDetails: { ...BATHROOM_ROOM.scopeDetails, shower_door_type: 'none' } };
  const { lines } = run([room]);
  const door = lines.find(l => l.materialName?.includes('Shower door'));
  assert.equal(door, undefined, 'No door line expected for none');
});

// ── F10: Floor tile field quantity merge ──────────────────────────────────────

test('F10: Floor tile field merges floor_tile_sf + shower_floor_sf into one line (waste applied per segment)', () => {
  const { lines } = run();
  const allTileField = lines.filter(l => l.materialName === 'Floor tile field');
  assert.equal(allTileField.length, 1, 'Floor tile field should be merged to one line');
  assert.equal(allTileField[0].quantity, 56.35);  // 34*1.15 + 15*1.15
});

// ── F11: vanity_top fixture_select via options_template ───────────────────────

test('F11: vanity_top cultured_marble + width 30 → Vanity top - cultured marble 30in fixture line', () => {
  const { lines } = run();
  const vtop = lines.find(l => l.materialName === 'Vanity top - cultured marble 30in');
  assert.ok(vtop, 'Vanity top fixture line not found');
  assert.equal(vtop.quantity, 1);
  assert.equal(vtop.lineCost, 240);
});

// ── Results ───────────────────────────────────────────────────────────────────

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
