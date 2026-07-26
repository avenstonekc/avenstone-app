// rateAuthority.test.mjs — TIER 2 #4 Slice 1 regression guard.
//
// THE BUG THIS GUARDS: gap-filled rates were written to `rate_book_labor` while the
// deterministic engine reads `takeoff_unit_costs`. Write target ≠ read target, so every
// run re-asked for a rate the rep had already typed ("gap roulette").
//
// This test closes the loop in pure JS — no network, no DB:
//   engine emits gap → edge fn attaches unit_cost_key → applyGapRates carries it →
//   saveLearnedRates routes to the override helper → row re-enters the catalog →
//   next run prices it. Plus a negative control proving the test can actually fail.
//
// It reads the LIVE ai-estimator source and strips types, so it fails loudly if the
// gap-line shape drifts. That is deliberate — this is a drift guard, not a copy.
//
// Run:  node avenstone-vite/src/lib/rateAuthority.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computePricingLines } from './pricingCore.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EDGE = path.resolve(HERE, '../../../supabase/functions/ai-estimator/index.ts');

// ── extract the real draftLineToPricedLine from the edge fn ──────────────────
function loadDraftLineFn() {
  const src = fs.readFileSync(EDGE, 'utf8');
  const s = src.indexOf('function draftLineToPricedLine');
  const e = src.indexOf('async function handlePricePlan');
  if (s < 0 || e < 0) throw new Error('draftLineToPricedLine not found in ai-estimator/index.ts');
  let fn = src.slice(s, e).trim()
    .replace('function draftLineToPricedLine(line: Record<string, unknown>, geoSource: string, projectType: string): PricedLine {',
             'return function draftLineToPricedLine(line, geoSource, projectType) {')
    .replace(/ as "labor" \| "materials" \| "general"/g, '')
    .replace(/ as number \| null/g, '').replace(/ as string \| null/g, '').replace(/ as number/g, '');
  if (/:\s*(PricedLine|Record<)/.test(fn)) throw new Error('residual TS types after strip — update the stripper');
  return new Function(fn + '\nreturn draftLineToPricedLine;')();
}
const draftLineToPricedLine = loadDraftLineFn();

const PT = 'bathroom';
const TENANT = '00000000-0000-0000-0000-000000000001';
const GAP_TRADE = 'Tile - Wall / shower';
const rooms = [{ roomId:'r1', roomLabel:'Bathroom', floor:0, roomType:PT, scopeTag:null,
  geometry:{ floorSf:50, wallSf:200, perimeterLf:30, ceilingFt:8, doors:1, windows:1 } }];
const WASTE = [{ parent_trade:'Tile', sub_trade:'Wall / shower', default_waste_pct:10 }];

// mirrors the loader's .eq("room_type", projectType).eq("active", true)
const price = (templates, rows) => computePricingLines({
  rooms, templates, unitCosts: rows.filter(r => r.room_type === PT && r.active),
  scopeSubsets: [], schemas: [], wasteRows: WASTE });

// mirrors sbSaveTenantUnitCostOverride's INSERT (coverage/waste inherited from platform default)
const overrideRowFrom = (k, rate, platform) => ({
  id:'t-test', tenant_id:TENANT, room_type:k.room_type, trade:k.trade, category:k.category,
  material_name:k.material_name, unit:k.unit ?? platform?.unit ?? null, base_rate:Number(rate),
  coverage_sf:platform?.coverage_sf ?? null, waste_pct:platform?.waste_pct ?? null,
  multipliers:{}, active:true });

let pass = 0, fail = 0;
const chk = (n, c, got) => c ? (pass++, console.log(`  PASS  ${n}`))
                             : (fail++, console.log(`  FAIL  ${n} → got ${JSON.stringify(got)}`));

// ── A: no catalog row at all ─────────────────────────────────────────────────
console.log('\nA — uncosted trade (no catalog row)');
{
  const templates = [
    { trade:'Demo', scope_definition:{ summary:'Demo bathroom' } },
    { trade:GAP_TRADE, scope_definition:{ summary:'Tile shower walls' } }];
  const base = [{ id:'p1', tenant_id:null, room_type:PT, trade:'Demo', category:'labor',
    material_name:null, unit:'sf', base_rate:5.5, coverage_sf:null, waste_pct:0, multipliers:{}, active:true }];
  const r1 = price(templates, base);
  const gapDraft = r1.lines.find(l => l.trade === GAP_TRADE && l.baseRateMissing);
  const okDraft  = r1.lines.find(l => l.trade === 'Demo' && !l.baseRateMissing);
  chk('engine emits a gap line', !!gapDraft, r1.lines.map(l => [l.trade, l.baseRateMissing]));

  const gap   = draftLineToPricedLine(gapDraft, 'scan', PT);
  const good  = draftLineToPricedLine(okDraft,  'scan', PT);
  chk('gap source_label = regional_avg', gap.source_label === 'regional_avg', gap.source_label);
  chk('gap carries unit_cost_key', !!gap.unit_cost_key, gap.unit_cost_key);
  chk('room_type === projectType (byte-identical)', gap.unit_cost_key?.room_type === PT, gap.unit_cost_key?.room_type);
  chk('material_name null for base labor', gap.unit_cost_key?.material_name === null, gap.unit_cost_key?.material_name);
  chk('priced line carries NO unit_cost_key', good.unit_cost_key === undefined, good.unit_cost_key);

  // applyGapRates (EstimateTab.jsx) — labor gaps only, carrying unit_cost_key
  const cands = [gap, good]
    .filter(l => l.source_label === 'regional_avg' && l.gap_key && l.category === 'labor')
    .map(l => ({ trade:l.trade, line_item:l.line_item, unit:l.unit, rate:12.5,
                 source:'rep_entered', unit_cost_key:l.unit_cost_key ?? null }));
  chk('exactly one candidate', cands.length === 1, cands.length);
  chk('candidate carries unit_cost_key', !!cands[0]?.unit_cost_key, cands[0]?.unit_cost_key);
  chk('routes to takeoff_unit_costs', (cands[0].unit_cost_key ? 'takeoff' : 'ratebook') === 'takeoff', 'ratebook');

  const after = price(templates, [...base, overrideRowFrom(cands[0].unit_cost_key, 12.5, null)])
    .lines.find(l => l.trade === GAP_TRADE);
  chk('next run: gap is priced', after && !after.baseRateMissing, after?.baseRateMissing);
  chk('next run: baseRate = 12.5', after?.baseRate === 12.5, after?.baseRate);
  chk('next run: unitCostSource = tenant_override', after?.unitCostSource === 'tenant_override', after?.unitCostSource);

  const bad = price(templates, [...base, { ...overrideRowFrom(cands[0].unit_cost_key, 12.5, null), room_type:'Bathroom' }])
    .lines.find(l => l.trade === GAP_TRADE);
  chk('NEGATIVE CONTROL: wrong room_type re-opens the gap', bad?.baseRateMissing === true, bad?.baseRateMissing);
}

// ── B: platform row exists with base_rate NULL (locked principle #3) ─────────
console.log('\nB — platform row present, base_rate NULL ("REP MUST ENTER")');
{
  const templates = [{ trade:GAP_TRADE, scope_definition:{ summary:'Tile shower walls' } }];
  const platform = { id:'p9', tenant_id:null, room_type:PT, trade:GAP_TRADE, category:'labor',
    material_name:null, unit:'sf', base_rate:null, coverage_sf:null, waste_pct:10, multipliers:{}, active:true };
  const d = price(templates, [platform]).lines.find(l => l.trade === GAP_TRADE);
  chk('NULL base_rate produces a gap', d?.baseRateMissing === true, d?.baseRateMissing);
  const gap = draftLineToPricedLine(d, 'scan', PT);
  chk('gap carries unit_cost_key', !!gap.unit_cost_key, gap.unit_cost_key);
  const ov = overrideRowFrom(gap.unit_cost_key, 20.5, platform);
  for (const [label, rows] of [['platform→tenant', [platform, ov]], ['tenant→platform', [ov, platform]]]) {
    const a = price(templates, rows).lines.find(l => l.trade === GAP_TRADE);
    chk(`${label}: priced at 20.5`, a?.baseRate === 20.5, a?.baseRate);
    chk(`${label}: unitCostSource = tenant_override`, a?.unitCostSource === 'tenant_override', a?.unitCostSource);
    chk(`${label}: taxonomy waste_pct intact`, a?.wastePct === 10, a?.wastePct);
  }
}

// ── C: 4-level tenant/room precedence (T2#4 S2a) ─────────────────────────────
// Observed through computePricingLines: the emitted labor line's baseRate reveals which row
// won, unitCostSource reveals tenant vs platform. Every rank asserted in BOTH input orders —
// row order must never change the winner (order-independence is the load-bearing property).
//   rank = (tenant?2:0) + (room?1:0): tenant+room(3) > tenant+all(2) > platform+room(1) > platform+all(0)
console.log('\nC — 4-level precedence (labor base rate, keyed by trade)');
{
  const templates = [{ trade: GAP_TRADE, scope_definition: { summary: 'Tile shower walls' } }];
  const labor = (id, tenant, room, rate) => ({
    id, tenant_id: tenant ? TENANT : null, room_type: room ? PT : null,
    trade: GAP_TRADE, category: 'labor', material_name: null, unit: 'sf',
    base_rate: rate, coverage_sf: null, waste_pct: 0, multipliers: {}, active: true });
  // mirrors the NEW loader: room-specific OR all-rooms (room_type NULL)
  const priceRA = rows => computePricingLines({
    rooms, templates, unitCosts: rows.filter(r => r.active && (r.room_type === PT || r.room_type == null)),
    scopeSubsets: [], schemas: [], wasteRows: WASTE }).lines.find(l => l.trade === GAP_TRADE);

  const bothOrders = (name, rows, expectRate, expectSource) => {
    for (const order of [rows, [...rows].reverse()]) {
      const tag = order.map(r => r.id).join(',');
      const l = priceRA(order);
      chk(`${name} [${tag}]: rate=${expectRate}`, l?.baseRate === expectRate, l?.baseRate);
      chk(`${name} [${tag}]: source=${expectSource}`, l?.unitCostSource === expectSource, l?.unitCostSource);
    }
  };

  const tr = labor('tr', true,  true,  11); // rank 3 tenant+room
  const ta = labor('ta', true,  false, 22); // rank 2 tenant+all
  const pr = labor('pr', false, true,  33); // rank 1 platform+room
  const pa = labor('pa', false, false, 44); // rank 0 platform+all

  bothOrders('tenant+room beats tenant+all',        [tr, ta],         11, 'tenant_override');
  bothOrders('tenant+all beats platform+room',      [ta, pr],         22, 'tenant_override');
  bothOrders('platform+room beats platform+all',    [pr, pa],         33, 'platform_default');
  bothOrders('all four present → tenant+room wins',  [pa, pr, ta, tr], 11, 'tenant_override');
  bothOrders('all-rooms tenant rate prices a room with no room-specific row', [ta], 22, 'tenant_override');
}

// ── D: material coverage merge — coverage_sf from platform, rate from tenant ──
// The single highest-risk detail: a tenant rate override must NOT drag its own null coverage_sf
// into the ÷coverage formula. wall_sf=200, platform coverage=32 → qty 6.25. If coverage were wrongly
// taken from the tenant row (null → undivided) qty would be 200. Both input orders.
console.log('\nD — material precedence keeps coverage_sf from the platform row');
{
  const MAT = 'Wall tile field';
  const templates = [{ trade: GAP_TRADE, scope_definition: { summary: 'Tile', default_unit: 'sf',
    materials_formula: [{ qty_basis: 'wall_sf', material_name: MAT, qty_multiplier: 1, qty_divisor: 'coverage_sf' }] } }];
  const mat = (id, tenant, rate, coverage) => ({
    id, tenant_id: tenant ? TENANT : null, room_type: PT,
    trade: GAP_TRADE, category: 'materials', material_name: MAT, unit: 'sf',
    base_rate: rate, coverage_sf: coverage, waste_pct: 0, multipliers: {}, active: true });
  const platform = mat('mp', false, 14, 32);   // platform: coverage 32
  const tenant   = mat('mt', true,  20, null); // rep rate override: coverage null
  const priceRA = rows => computePricingLines({
    rooms, templates, unitCosts: rows.filter(r => r.active && (r.room_type === PT || r.room_type == null)),
    scopeSubsets: [], schemas: [], wasteRows: WASTE }).lines.find(l => l.category === 'materials' && l.materialName === MAT);

  for (const order of [[platform, tenant], [tenant, platform]]) {
    const tag = order.map(r => r.id).join(',');
    const l = priceRA(order);
    chk(`material [${tag}]: qty uses platform coverage → 6.25`, l?.quantity === 6.25, l?.quantity);
    chk(`material [${tag}]: rate = tenant 20`,                  l?.baseRate === 20,    l?.baseRate);
    chk(`material [${tag}]: source = tenant_override`,          l?.unitCostSource === 'tenant_override', l?.unitCostSource);
  }
}

console.log(`\n${fail === 0 ? 'ALL GREEN' : 'FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
