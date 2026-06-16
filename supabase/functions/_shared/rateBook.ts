// ── Rate Book engine — ESTIMATOR_KNOWLEDGE_ARC Phase 3b-1 ───────────────────
// Pure functions: no Deno APIs, no fetch, no env vars.
// Single consumer: ai-estimator/index.ts.
// Move to a broader shared module only when a second edge fn needs rate-matching.
//
// Public API: resolveRate(input, rateBook) → CollapseResult
// Called by: ai-estimator 3b-2 (wiring slice). Not yet called in 3b-1.
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ──────────────────────────────────────────────────────────────────

export interface LaborRow {
  id: string;
  trade: string;
  line_item: string;
  unit: string;
  rate_low: number;
  rate_high: number | null;
  rate_data: Record<string, unknown>;
  vetted: boolean;
}

export interface MaterialRow {
  category: string;
  description: string;
  unit: string;
  tier_low_min: number | null;
  tier_low_max: number | null;
  tier_mid_min: number | null;
  tier_mid_max: number | null;
  tier_hi_min: number | null;
  tier_hi_max: number | null;
  tier_low_label: string;
  tier_mid_label: string;
  tier_hi_label: string;
}

export interface RateBook {
  laborRows: LaborRow[];
  materialRows: MaterialRow[];
}

export interface LineItemInput {
  trade: string;
  line_item: string;
  unit: string;
  quantity: number;
  project_sf: number;
}

export type Tier = "high" | "mid" | "low";

export interface CollapseResult {
  matched: boolean;
  source_label: "labor_rate" | "regional_avg";
  tier: Tier | null;       // project tier (getTier(project_sf)) — for SF/LF this IS the applied tier
  rate_point: number | null; // collapsed single price per unit
  amount: number | null;     // rate_point * quantity, rounded to cents
  labor_row_id?: string;     // Rate Book row ID for source tracing
  resolved_trade?: string;
  resolved_line_item?: string;
  gap_key?: string;          // "trade::line_item::unit" — for 3b-2 ask/regional-avg path
}

// ── Alias map ──────────────────────────────────────────────────────────────
// Maps AI-generated phrasings → { trade, line_item }.
// Keys: lowercase, trimmed. Match checked against both "trade line_item" and
// "line_item" alone (compound first, single second).
//
// *** EXTEND THIS as new phrasings appear in estimate output. ***
// Pattern: common_phrasings → canonical Rate Book (trade, line_item).

const ALIASES: Record<string, { trade: string; line_item: string }> = {
  // ── Drywall ────────────────────────────────────────────────────────────
  "hang":                        { trade: "Drywall",   line_item: "hang" },
  "drywall hang":                { trade: "Drywall",   line_item: "hang" },
  "drywall hanging":             { trade: "Drywall",   line_item: "hang" },
  "hang drywall":                { trade: "Drywall",   line_item: "hang" },
  "tape mud":                    { trade: "Drywall",   line_item: "tape_mud_finish" },
  "tape and mud":                { trade: "Drywall",   line_item: "tape_mud_finish" },
  "tape mud finish":             { trade: "Drywall",   line_item: "tape_mud_finish" },
  "drywall finish":              { trade: "Drywall",   line_item: "tape_mud_finish" },
  "tape":                        { trade: "Drywall",   line_item: "tape_mud_finish" },
  "patch":                       { trade: "Drywall",   line_item: "patch_small" },
  "small patch":                 { trade: "Drywall",   line_item: "patch_small" },
  "drywall patch":               { trade: "Drywall",   line_item: "patch_small" },
  "ceiling drywall":             { trade: "Drywall",   line_item: "ceiling_level4" },
  "primer skim":                 { trade: "Drywall",   line_item: "primer_skim" },
  "skim coat":                   { trade: "Drywall",   line_item: "primer_skim" },
  // ── Demo ───────────────────────────────────────────────────────────────
  "full gut":                    { trade: "Demo",      line_item: "full_gut" },
  "gut demo":                    { trade: "Demo",      line_item: "full_gut" },
  "gut":                         { trade: "Demo",      line_item: "full_gut" },
  "soft demo":                   { trade: "Demo",      line_item: "soft_demo" },
  "selective demo":              { trade: "Demo",      line_item: "soft_demo" },
  "tearout":                     { trade: "Demo",      line_item: "soft_demo" },
  "haul":                        { trade: "Demo",      line_item: "haul_per_load" },
  "haul away":                   { trade: "Demo",      line_item: "haul_per_load" },
  "dumpster":                    { trade: "Demo",      line_item: "haul_per_load" },
  "deck demo":                   { trade: "Demo",      line_item: "deck_demo" },
  "roof tearoff":                { trade: "Demo",      line_item: "roof_tearoff_demo_only" },
  // ── Paint ──────────────────────────────────────────────────────────────
  "interior paint":              { trade: "Paint",     line_item: "interior_walls_prime_2coat" },
  "paint walls":                 { trade: "Paint",     line_item: "interior_walls_prime_2coat" },
  "prime and paint":             { trade: "Paint",     line_item: "interior_walls_prime_2coat" },
  "prime paint":                 { trade: "Paint",     line_item: "interior_walls_prime_2coat" },
  "wall paint":                  { trade: "Paint",     line_item: "interior_walls_prime_2coat" },
  "ceiling paint":               { trade: "Paint",     line_item: "ceiling_only" },
  "paint ceiling":               { trade: "Paint",     line_item: "ceiling_only" },
  "cabinet spray":               { trade: "Paint",     line_item: "cabinet_spray" },
  "cabinet paint":               { trade: "Paint",     line_item: "cabinet_spray" },
  "exterior paint":              { trade: "Paint",     line_item: "exterior_siding" },
  "exterior door paint":         { trade: "Paint",     line_item: "exterior_door" },
  // ── Tile ───────────────────────────────────────────────────────────────
  "tile demo":                   { trade: "Tile",      line_item: "tile_demo_floor" },
  "remove tile":                 { trade: "Tile",      line_item: "tile_demo_floor" },
  "floor tile demo":             { trade: "Tile",      line_item: "tile_demo_floor" },
  "wall tile demo":              { trade: "Tile",      line_item: "tile_demo_wall" },
  "remove wall tile":            { trade: "Tile",      line_item: "tile_demo_wall" },
  "waterproof membrane":         { trade: "Tile",      line_item: "schluter_membrane" },
  "schluter":                    { trade: "Tile",      line_item: "schluter_membrane" },
  "ditra":                       { trade: "Tile",      line_item: "schluter_membrane" },
  "shower pan":                  { trade: "Tile",      line_item: "shower_pan_mudbed" },
  "mud bed":                     { trade: "Tile",      line_item: "shower_pan_mudbed" },
  "regrout":                     { trade: "Tile",      line_item: "regrouting" },
  "niche":                       { trade: "Tile",      line_item: "tiled_niche" },
  // ── Flooring ───────────────────────────────────────────────────────────
  "hardwood refinish":           { trade: "Flooring",  line_item: "hardwood_refinish" },
  "sand and finish":             { trade: "Flooring",  line_item: "hardwood_refinish" },
  "sand finish":                 { trade: "Flooring",  line_item: "hardwood_refinish" },
  "floor refinish":              { trade: "Flooring",  line_item: "hardwood_refinish" },
  "remove flooring":             { trade: "Flooring",  line_item: "remove_existing_flooring" },
  "floor removal":               { trade: "Flooring",  line_item: "remove_existing_flooring" },
  "subfloor repair":             { trade: "Flooring",  line_item: "subfloor_repair" },
  // ── Plumbing ───────────────────────────────────────────────────────────
  "toilet":                      { trade: "Plumbing",  line_item: "toilet_standard" },
  "toilet install":              { trade: "Plumbing",  line_item: "toilet_standard" },
  "standard toilet":             { trade: "Plumbing",  line_item: "toilet_standard" },
  "elongated toilet":            { trade: "Plumbing",  line_item: "toilet_elongated" },
  "vanity sink":                 { trade: "Plumbing",  line_item: "vanity_sink_install" },
  "bathroom sink":               { trade: "Plumbing",  line_item: "vanity_sink_install" },
  "kitchen sink":                { trade: "Plumbing",  line_item: "kitchen_sink_install" },
  "water heater":                { trade: "Plumbing",  line_item: "water_heater_40gal_gas" },
  "hot water heater":            { trade: "Plumbing",  line_item: "water_heater_40gal_gas" },
  "tankless water heater":       { trade: "Plumbing",  line_item: "water_heater_tankless" },
  "shower valve":                { trade: "Plumbing",  line_item: "shower_valve_install" },
  "tub shower":                  { trade: "Plumbing",  line_item: "tub_shower_install" },
  "tub":                         { trade: "Plumbing",  line_item: "tub_shower_install" },
  "freestanding tub":            { trade: "Plumbing",  line_item: "freestanding_tub_labor" },
  "fixture rough in":            { trade: "Plumbing",  line_item: "fixture_roughin" },
  "rough in":                    { trade: "Plumbing",  line_item: "fixture_roughin" },
  "bathroom rough in":           { trade: "Plumbing",  line_item: "bath_roughin_3fixture" },
  "expansion tank":              { trade: "Plumbing",  line_item: "expansion_tank" },
  "gas line":                    { trade: "Plumbing",  line_item: "gas_line" },
  "repipe":                      { trade: "Plumbing",  line_item: "repipe_pex" },
  // ── Electrical ─────────────────────────────────────────────────────────
  "panel upgrade":               { trade: "Electrical", line_item: "panel_upgrade_100_200a" },
  "service upgrade":             { trade: "Electrical", line_item: "panel_upgrade_100_200a" },
  "subpanel":                    { trade: "Electrical", line_item: "subpanel_100a_new" },
  "outlet":                      { trade: "Electrical", line_item: "outlet_switch" },
  "switch":                      { trade: "Electrical", line_item: "outlet_switch" },
  "gfci":                        { trade: "Electrical", line_item: "gfci_outlet" },
  "recessed light":              { trade: "Electrical", line_item: "recessed_light_new" },
  "can light":                   { trade: "Electrical", line_item: "recessed_light_new" },
  "recessed can":                { trade: "Electrical", line_item: "recessed_light_new" },
  "retrofit can":                { trade: "Electrical", line_item: "recessed_light_retrofit" },
  "ceiling fan":                 { trade: "Electrical", line_item: "ceiling_fan_install" },
  "light fixture":               { trade: "Electrical", line_item: "fixture_standard" },
  "ev charger":                  { trade: "Electrical", line_item: "ev_charger_level2" },
  "smoke detector":              { trade: "Electrical", line_item: "smoke_co_detector" },
  "smoke co detector":           { trade: "Electrical", line_item: "smoke_co_detector" },
  "generator":                   { trade: "Electrical", line_item: "generator_hookup" },
  "full rewire":                 { trade: "Electrical", line_item: "full_rewire" },
  // ── HVAC ───────────────────────────────────────────────────────────────
  "hvac system":                 { trade: "HVAC",       line_item: "central_split_3ton" },
  "hvac":                        { trade: "HVAC",       line_item: "central_split_3ton" },
  "central ac":                  { trade: "HVAC",       line_item: "ac_condenser_3ton" },
  "air conditioner":             { trade: "HVAC",       line_item: "ac_condenser_3ton" },
  "mini split":                  { trade: "HVAC",       line_item: "minisplit_1zone" },
  "minisplit":                   { trade: "HVAC",       line_item: "minisplit_1zone" },
  "ductless":                    { trade: "HVAC",       line_item: "minisplit_1zone" },
  "furnace":                     { trade: "HVAC",       line_item: "furnace_80pct" },
  "ductwork":                    { trade: "HVAC",       line_item: "ductwork_new" },
  "thermostat":                  { trade: "HVAC",       line_item: "thermostat" },
  "humidifier":                  { trade: "HVAC",       line_item: "humidifier" },
  // ── Framing ────────────────────────────────────────────────────────────
  "wall framing":                { trade: "Framing",    line_item: "wall_framing_2x4" },
  "framing":                     { trade: "Framing",    line_item: "wall_framing_2x4" },
  "lvl beam":                    { trade: "Framing",    line_item: "lvl_beam" },
  "steel beam":                  { trade: "Framing",    line_item: "steel_beam" },
  "deck":                        { trade: "Framing",    line_item: "deck_groundlevel_pt" },
  // ── Insulation ─────────────────────────────────────────────────────────
  "batt insulation":             { trade: "Insulation", line_item: "batt_r15_2x4_wall" },
  "insulation":                  { trade: "Insulation", line_item: "batt_r15_2x4_wall" },
  "spray foam":                  { trade: "Insulation", line_item: "spray_foam_opencell_3_5in" },
  "closed cell foam":            { trade: "Insulation", line_item: "spray_foam_closedcell_2in" },
  "blown in":                    { trade: "Insulation", line_item: "blown_fiberglass_r38" },
  "blown insulation":            { trade: "Insulation", line_item: "blown_fiberglass_r38" },
  // ── Roofing ────────────────────────────────────────────────────────────
  "tearoff":                     { trade: "Roofing",    line_item: "tearoff_1layer" },
  "roof tearoff":                { trade: "Roofing",    line_item: "tearoff_1layer" },
  "shingle":                     { trade: "Roofing",    line_item: "shingle_30yr_all_in" },
  "shingles":                    { trade: "Roofing",    line_item: "shingle_30yr_all_in" },
  "gutter":                      { trade: "Roofing",    line_item: "gutter_5in_kstyle" },
  "gutters":                     { trade: "Roofing",    line_item: "gutter_5in_kstyle" },
  "tpo":                         { trade: "Roofing",    line_item: "tpo_60mil" },
  // ── Concrete ───────────────────────────────────────────────────────────
  "patio":                       { trade: "Concrete",   line_item: "patio_unreinforced" },
  "concrete patio":              { trade: "Concrete",   line_item: "patio_reinforced" },
  "driveway":                    { trade: "Concrete",   line_item: "driveway" },
  "sidewalk":                    { trade: "Concrete",   line_item: "sidewalk" },
  "garage floor":                { trade: "Concrete",   line_item: "garage_floor" },
  "basement floor":              { trade: "Concrete",   line_item: "basement_floor" },
  "concrete steps":              { trade: "Concrete",   line_item: "steps" },
  "steps":                       { trade: "Concrete",   line_item: "steps" },
  // ── Cabinets ───────────────────────────────────────────────────────────
  "stock cabinets":              { trade: "Cabinets / vanities", line_item: "cabinet_stock_installed" },
  "semi custom cabinets":        { trade: "Cabinets / vanities", line_item: "cabinet_semi_custom_installed" },
  "custom cabinets":             { trade: "Cabinets / vanities", line_item: "cabinet_custom_installed" },
};

// ── Units where project-SF tier applies ────────────────────────────────────
// EA, LS, room, load, sq — always MID (fixed items don't scale with job size).
const TIER_UNITS = new Set(["SF", "LF"]);

// ── Tier resolution ────────────────────────────────────────────────────────

export function getTier(projectSf: number): Tier {
  if (projectSf <= 750)  return "high";
  if (projectSf <= 1999) return "mid";
  return "low";
}

// Collapse rate_low–rate_high to a single point per Keystone Decision 6.
export function collapseRate(
  rateLow: number,
  rateHigh: number | null,
  tier: Tier,
  unit: string,
): number {
  const hi  = rateHigh ?? rateLow;
  const mid = (rateLow + hi) / 2;
  if (!TIER_UNITS.has(unit)) return mid; // EA, LS, sq, room, load → always MID
  if (tier === "high") return hi;
  if (tier === "low")  return rateLow;
  return mid;
}

// ── Match ──────────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().trim();
}

function findByTradeItem(laborRows: LaborRow[], trade: string, lineItem: string): LaborRow | undefined {
  const t  = norm(trade);
  const li = norm(lineItem);
  return laborRows.find(r => norm(r.trade) === t && norm(r.line_item) === li);
}

function matchLaborRow(input: LineItemInput, laborRows: LaborRow[]): LaborRow | undefined {
  // 1. Exact match on (trade, line_item, unit)
  const t  = norm(input.trade);
  const li = norm(input.line_item);
  const u  = norm(input.unit);
  const exact = laborRows.find(
    r => norm(r.trade) === t && norm(r.line_item) === li && norm(r.unit) === u,
  );
  if (exact) return exact;

  // 2. Alias — compound "trade line_item" key first, then "line_item" alone
  const resolved =
    ALIASES[norm(`${input.trade} ${input.line_item}`)] ??
    ALIASES[norm(input.line_item)];
  if (resolved) return findByTradeItem(laborRows, resolved.trade, resolved.line_item);

  return undefined;
}

// ── Public API ─────────────────────────────────────────────────────────────

export function resolveRate(input: LineItemInput, rateBook: RateBook): CollapseResult {
  const row = matchLaborRow(input, rateBook.laborRows);

  if (!row) {
    return {
      matched:      false,
      source_label: "regional_avg",
      tier:         null,
      rate_point:   null,
      amount:       null,
      gap_key:      `${input.trade}::${input.line_item}::${input.unit}`,
    };
  }

  const rateLow   = parseFloat(String(row.rate_low));
  const rateHigh  = row.rate_high != null ? parseFloat(String(row.rate_high)) : null;
  const tier      = getTier(input.project_sf);
  const ratePoint = collapseRate(rateLow, rateHigh, tier, row.unit);
  const amount    = Math.round(ratePoint * input.quantity * 100) / 100;

  return {
    matched:            true,
    source_label:       "labor_rate",
    tier,
    rate_point:         ratePoint,
    amount,
    labor_row_id:       row.id,
    resolved_trade:     row.trade,
    resolved_line_item: row.line_item,
  };
}
