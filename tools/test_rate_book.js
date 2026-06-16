// Rate Book engine test harness — ESTIMATOR_KNOWLEDGE_ARC Phase 3b-1
// Node.js (no Deno, no imports). Pure functions inlined to run standalone.
// Run: node tools/test_rate_book.js
//
// Mock rateBook uses real values from the live DB (confirmed post-migration).
// These are the same rows the deployed edge function will receive.

"use strict";

// ── Inline pure functions (mirrors _shared/rateBook.ts) ────────────────────

const TIER_UNITS = new Set(["SF", "LF"]);

const ALIASES = {
  "hang":                   { trade: "Drywall",    line_item: "hang" },
  "drywall hang":           { trade: "Drywall",    line_item: "hang" },
  "drywall hanging":        { trade: "Drywall",    line_item: "hang" },
  "hang drywall":           { trade: "Drywall",    line_item: "hang" },
  "tape mud":               { trade: "Drywall",    line_item: "tape_mud_finish" },
  "tape and mud":           { trade: "Drywall",    line_item: "tape_mud_finish" },
  "tape mud finish":        { trade: "Drywall",    line_item: "tape_mud_finish" },
  "drywall finish":         { trade: "Drywall",    line_item: "tape_mud_finish" },
  "patch":                  { trade: "Drywall",    line_item: "patch_small" },
  "small patch":            { trade: "Drywall",    line_item: "patch_small" },
  "panel upgrade":          { trade: "Electrical", line_item: "panel_upgrade_100_200a" },
  "toilet":                 { trade: "Plumbing",   line_item: "toilet_standard" },
  "mini split":             { trade: "HVAC",       line_item: "minisplit_1zone" },
};

function getTier(projectSf) {
  if (projectSf <= 750)  return "high";
  if (projectSf <= 1999) return "mid";
  return "low";
}

function collapseRate(rateLow, rateHigh, tier, unit) {
  const hi  = rateHigh ?? rateLow;
  const mid = (rateLow + hi) / 2;
  if (!TIER_UNITS.has(unit)) return mid;
  if (tier === "high") return hi;
  if (tier === "low")  return rateLow;
  return mid;
}

function norm(s) { return String(s).toLowerCase().trim(); }

function findByTradeItem(laborRows, trade, lineItem) {
  return laborRows.find(r => norm(r.trade) === norm(trade) && norm(r.line_item) === norm(lineItem));
}

function matchLaborRow(input, laborRows) {
  const t  = norm(input.trade);
  const li = norm(input.line_item);
  const u  = norm(input.unit);
  const exact = laborRows.find(r => norm(r.trade) === t && norm(r.line_item) === li && norm(r.unit) === u);
  if (exact) return exact;

  const resolved =
    ALIASES[norm(`${input.trade} ${input.line_item}`)] ??
    ALIASES[norm(input.line_item)];
  if (resolved) return findByTradeItem(laborRows, resolved.trade, resolved.line_item);
  return undefined;
}

function resolveRate(input, rateBook) {
  const row = matchLaborRow(input, rateBook.laborRows);
  if (!row) {
    return {
      matched: false, source_label: "regional_avg",
      tier: null, rate_point: null, amount: null,
      gap_key: `${input.trade}::${input.line_item}::${input.unit}`,
    };
  }
  const rateLow   = parseFloat(String(row.rate_low));
  const rateHigh  = row.rate_high != null ? parseFloat(String(row.rate_high)) : null;
  const tier      = getTier(input.project_sf);
  const ratePoint = collapseRate(rateLow, rateHigh, tier, row.unit);
  const amount    = Math.round(ratePoint * input.quantity * 100) / 100;
  return {
    matched: true, source_label: "labor_rate",
    tier, rate_point: ratePoint, amount,
    labor_row_id: row.id,
    resolved_trade: row.trade,
    resolved_line_item: row.line_item,
  };
}

// ── Mock Rate Book (real DB values, post-correction) ───────────────────────

const mockRateBook = {
  laborRows: [
    { id: "lab-01", trade: "Drywall",    line_item: "hang",                   unit: "SF",  rate_low: 0.38,  rate_high: 0.55,   rate_data: {}, vetted: false },
    { id: "lab-02", trade: "Drywall",    line_item: "tape_mud_finish",         unit: "SF",  rate_low: 0.55,  rate_high: 0.80,   rate_data: {}, vetted: false },
    { id: "lab-03", trade: "Drywall",    line_item: "combined_hang_finish",    unit: "SF",  rate_low: 1.25,  rate_high: 1.85,   rate_data: {}, vetted: false },
    { id: "lab-04", trade: "Drywall",    line_item: "moisture_resistant",      unit: "SF",  rate_low: 1.60,  rate_high: 2.20,   rate_data: {}, vetted: false },
    { id: "lab-05", trade: "Drywall",    line_item: "patch_small",             unit: "EA",  rate_low: 150,   rate_high: 300,    rate_data: {}, vetted: false },
    { id: "lab-06", trade: "Electrical", line_item: "panel_upgrade_100_200a",  unit: "LS",  rate_low: 2200,  rate_high: 3800,   rate_data: {}, vetted: false },
    { id: "lab-07", trade: "Electrical", line_item: "recessed_light_new",      unit: "EA",  rate_low: 80,    rate_high: 160,    rate_data: {}, vetted: false },
    { id: "lab-08", trade: "Plumbing",   line_item: "toilet_standard",         unit: "EA",  rate_low: 300,   rate_high: 500,    rate_data: {}, vetted: false },
    { id: "lab-09", trade: "HVAC",       line_item: "minisplit_1zone",          unit: "LS",  rate_low: 2800,  rate_high: 4500,   rate_data: {}, vetted: false },
    { id: "lab-10", trade: "Roofing",    line_item: "tearoff_1layer",           unit: "sq",  rate_low: 80,    rate_high: 110,    rate_data: {}, vetted: false },
    { id: "lab-11", trade: "Demo",       line_item: "full_gut",                unit: "SF",  rate_low: 5.00,  rate_high: 9.00,   rate_data: {}, vetted: false },
    { id: "lab-12", trade: "Paint",      line_item: "interior_walls_prime_2coat", unit: "SF", rate_low: 1.60, rate_high: 2.60, rate_data: {}, vetted: false },
  ],
  materialRows: [],
};

// ── Test cases ─────────────────────────────────────────────────────────────

const tests = [
  {
    desc: "TC1: Exact match, SF, small job (≤750 SF) → HIGH end",
    input: { trade: "Drywall", line_item: "hang", unit: "SF", quantity: 100, project_sf: 600 },
    expect: { matched: true, source_label: "labor_rate", tier: "high", rate_point: 0.55, amount: 55 },
  },
  {
    desc: "TC2: Exact match, SF, mid job (751–1999 SF) → MID",
    input: { trade: "Drywall", line_item: "hang", unit: "SF", quantity: 100, project_sf: 1200 },
    expect: { matched: true, source_label: "labor_rate", tier: "mid", rate_point: 0.465, amount: 46.5 },
  },
  {
    desc: "TC3: Exact match, SF, large job (≥2000 SF) → LOW end",
    input: { trade: "Drywall", line_item: "hang", unit: "SF", quantity: 100, project_sf: 2500 },
    expect: { matched: true, source_label: "labor_rate", tier: "low", rate_point: 0.38, amount: 38 },
  },
  {
    desc: "TC4: LS unit → always MID regardless of project_sf (tier ignored)",
    input: { trade: "Electrical", line_item: "panel_upgrade_100_200a", unit: "LS", quantity: 1, project_sf: 600 },
    expect: { matched: true, source_label: "labor_rate", tier: "high", rate_point: 3000, amount: 3000 },
    note: "tier=high (600 SF) but LS → mid applied: (2200+3800)/2=3000",
  },
  {
    desc: "TC5: EA unit → always MID (same rule as LS)",
    input: { trade: "Drywall", line_item: "patch_small", unit: "EA", quantity: 2, project_sf: 600 },
    expect: { matched: true, source_label: "labor_rate", tier: "high", rate_point: 225, amount: 450 },
    note: "tier=high but EA → mid: (150+300)/2=225 × 2 = 450",
  },
  {
    desc: "TC6: sq unit (roofing square) → always MID (non SF/LF)",
    input: { trade: "Roofing", line_item: "tearoff_1layer", unit: "sq", quantity: 10, project_sf: 500 },
    expect: { matched: true, source_label: "labor_rate", tier: "high", rate_point: 95, amount: 950 },
    note: "tier=high but sq → mid: (80+110)/2=95 × 10 = 950",
  },
  {
    desc: "TC7: No match → GAP, source_label=regional_avg, price null",
    input: { trade: "Unknown", line_item: "xyz_unknown", unit: "SF", quantity: 100, project_sf: 1000 },
    expect: { matched: false, source_label: "regional_avg", tier: null, rate_point: null, amount: null },
  },
  {
    desc: "TC8: Alias 'tape mud' → tape_mud_finish, mid tier (1200 SF)",
    input: { trade: "Drywall", line_item: "tape mud", unit: "SF", quantity: 100, project_sf: 1200 },
    expect: { matched: true, source_label: "labor_rate", tier: "mid", rate_point: 0.675, amount: 67.5 },
    note: "exact fails (no 'tape mud' line_item), alias fires → tape_mud_finish; mid: (0.55+0.80)/2=0.675",
  },
  {
    desc: "TC9: Alias 'hang' with no trade → resolves to Drywall hang via single-key alias",
    input: { trade: "", line_item: "hang", unit: "SF", quantity: 50, project_sf: 600 },
    expect: { matched: true, source_label: "labor_rate", tier: "high", rate_point: 0.55, amount: 27.5 },
    note: "compound key '' hang fails; single key 'hang' alias fires",
  },
  {
    desc: "TC10: Alias 'toilet' → toilet_standard EA, mid (1200 SF) → MID applied (EA ignores tier)",
    input: { trade: "", line_item: "toilet", unit: "EA", quantity: 1, project_sf: 1200 },
    expect: { matched: true, source_label: "labor_rate", tier: "mid", rate_point: 400, amount: 400 },
    note: "EA → mid always: (300+500)/2=400",
  },
];

// ── Runner ─────────────────────────────────────────────────────────────────

let pass = 0, fail = 0;

for (const tc of tests) {
  const result = resolveRate(tc.input, mockRateBook);
  const e = tc.expect;

  const ok =
    result.matched      === e.matched      &&
    result.source_label === e.source_label &&
    result.tier         === e.tier         &&
    result.rate_point   === e.rate_point   &&
    result.amount       === e.amount;

  if (ok) {
    pass++;
    console.log(`  PASS  ${tc.desc}`);
  } else {
    fail++;
    console.log(`  FAIL  ${tc.desc}`);
    console.log(`         expect: matched=${e.matched} tier=${e.tier} rate=${e.rate_point} amount=${e.amount}`);
    console.log(`         got:    matched=${result.matched} tier=${result.tier} rate=${result.rate_point} amount=${result.amount}`);
    if (tc.note) console.log(`         note: ${tc.note}`);
  }
  if (tc.note && ok) console.log(`         note: ${tc.note}`);
}

console.log(`\n${pass}/${tests.length} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
