// INTENTIONAL DUPLICATE — edge/src circular-import boundary.
// Source of truth: avenstone-vite/src/lib/pricingCore.js
// This file MUST be kept in lockstep with that file. Any logic change there
// must be applied here, and vice versa. Do not merge — the circular-import
// constraint (edge fns cannot import src/lib; src/lib cannot import supabase.js)
// makes a shared npm/Deno module infeasible. The divergence guard is the only
// safeguard against silent drift.
//
// Divergences from src/lib/pricingCore.js:
//   1. Import path: './computeFns.ts' (not '.js') — Deno explicit-extension convention.
//   2. File extension .ts — Deno/TypeScript convention.
//   3. ADDENDUM: export function deriveGeometryFromScan(scan) at end of file.
//      Extracted from buildTakeoffDraft (takeoff.js) so the edge handler doesn't
//      need to know about scan JSONB shape. No equivalent in src/lib/pricingCore.js
//      (that file is browser-facing; scan loading lives in takeoff.js).
//
// pricingCore.js — pure ESM pricing computation.
// NO imports of supabase, browser APIs, or Deno-specific modules.
// Depends only on computeFns.ts (also pure).
//
// Entry point: computePricingLines({ rooms, templates, unitCosts, scopeSubsets, schemas, wasteRows })
// Returns: { lines, summary }

// deno-lint-ignore-file no-explicit-any

import { runCompute } from "./computeFns.ts";

// ── Quantity source mapping ────────────────────────────────────────────────────

function quantitySource(trade: string, unit: string): string | null {
  if (/Drywall/.test(trade))                              return "wallSf";
  if (/Paint - Interior/.test(trade))                    return "wallSf";
  if (/Paint - Exterior/.test(trade))                    return "wallSf";
  if (/Tile - Wall|Tile.*[Ss]hower/.test(trade))         return "wallSf";
  if (/Tile - Backsplash/.test(trade))                   return null;
  if (/Tile - Floor/.test(trade))                        return "areaSf";
  if (/Flooring/.test(trade))                            return "areaSf";
  if (/Demo/.test(trade))                                return "areaSf_noWaste";
  if (/Framing/.test(trade))                             return "areaSf";
  if (/Insulation/.test(trade))                          return "wallSf";
  if (/[Bb]ase.*[Cc]ase|carpentry.*[Bb]ase/.test(trade)) return "lf";
  if (/Crown/.test(trade))                               return "lf";
  if (unit === "lump")                                   return "lump";
  if (unit === "each")                                   return "each";
  return null;
}

function buildQuantity({ trade, unit, areaSf, wallAreaSf, perimeterLf, wastePct }: any): any {
  const src = quantitySource(trade, unit);
  const w = wastePct || 0;
  if (src === "areaSf") {
    const qty = areaSf * (1 + w / 100);
    return { quantity: Math.round(qty * 100) / 100, quantityPreFilled: areaSf > 0, quantityNotes: `from scan: ${areaSf.toFixed(1)} sf × ${w}% waste = ${qty.toFixed(1)} sf` };
  }
  if (src === "areaSf_noWaste") {
    return { quantity: Math.round(areaSf * 100) / 100, quantityPreFilled: areaSf > 0, quantityNotes: `from scan: ${areaSf.toFixed(1)} sf (no waste — demo labor)` };
  }
  if (src === "wallSf") {
    const qty = wallAreaSf * (1 + w / 100);
    return { quantity: Math.round(qty * 100) / 100, quantityPreFilled: wallAreaSf > 0, quantityNotes: `from scan: ${wallAreaSf.toFixed(1)} wall sf × ${w}% waste = ${qty.toFixed(1)} sf` };
  }
  if (src === "lf") {
    return { quantity: Math.round(perimeterLf * 100) / 100, quantityPreFilled: perimeterLf > 0, quantityNotes: `from scan: ${perimeterLf.toFixed(1)} lf perimeter` };
  }
  if (src === "lump") {
    return { quantity: 1, quantityPreFilled: true, quantityNotes: "lump — quantity = 1" };
  }
  return { quantity: null, quantityPreFilled: false, quantityNotes: null };
}

function resolveMultiplier(floor: number, multipliers: any): number {
  if (!multipliers || Object.keys(multipliers).length === 0) return 1.0;
  if (floor === -1) return multipliers.basement    ?? 1.0;
  if (floor === 0)  return multipliers.first_floor ?? 1.0;
  return               multipliers.second_floor ?? 1.0;
}

export function resolveLineCostStatus(baseRate: any, quantity: any): string {
  if (baseRate == null && quantity == null) return "pending_both";
  if (baseRate == null)                     return "pending_rate";
  if (quantity == null)                     return "pending_quantity";
  return "ok";
}

function evaluateFormula(formula: any, metrics: any, materialRow: any, scopeDetails: any): number {
  if (formula.qty_basis === "fixed") return Number(formula.fixed_qty || 0);
  if (formula.qty_basis === "scope_detail") {
    const key    = formula.scope_detail_key;
    const detail = scopeDetails?.[key];
    if (detail === undefined || detail === null) return 0;
    if (typeof detail === "boolean") return detail ? Number(formula.fixed_qty || 1) : 0;
    const num = Number(detail);
    if (!isFinite(num) || num === 0) return 0;
    const multiplier  = Number(formula.qty_multiplier || 1);
    const wasteFactor = 1 + (Number(materialRow.waste_pct || 0) / 100);
    let qty = num * multiplier * wasteFactor;
    if (formula.qty_divisor === "coverage_sf") {
      const coverage = Number(materialRow.coverage_sf || 0);
      if (coverage > 0) qty = qty / coverage;
    }
    return qty;
  }
  const basisVal = metrics[formula.qty_basis];
  if (basisVal == null || basisVal === 0) return 0;
  const multiplier   = Number(formula.qty_multiplier || 1);
  const wasteFactor  = 1 + (Number(materialRow.waste_pct || 0) / 100);
  let qty = basisVal * multiplier * wasteFactor;
  if (formula.qty_divisor === "coverage_sf") {
    const coverage = Number(materialRow.coverage_sf || 0);
    if (coverage > 0) qty = qty / coverage;
  }
  return qty;
}

function resolveDetails(schema: any, scopeDetails: any, room: any): any {
  if (!schema?.fields) return scopeDetails ?? {};
  const resolved = { ...(scopeDetails ?? {}) };
  for (const field of schema.fields) {
    if (field.type === "computed") continue;
    if (resolved[field.key] !== undefined) continue;
    if (field.default_from === "room.floorSf") { resolved[field.key] = room.areaSf || 0; }
    else if (field.default !== undefined)       { resolved[field.key] = field.default; }
  }
  for (const field of schema.fields) {
    if (field.type !== "computed") continue;
    const overrideVal = field.override_key != null ? resolved[field.override_key] : undefined;
    if (overrideVal != null) { resolved[field.key] = Number(overrideVal); }
    else { const computed = runCompute(field.compute_fn, resolved); if (computed != null) resolved[field.key] = computed; }
  }
  for (const field of schema.fields) {
    if (!field.subtract?.length) continue;
    const base = Number(resolved[field.key] ?? 0);
    const net  = field.subtract.reduce((acc: number, k: string) => acc - Number(resolved[k] ?? 0), base);
    resolved[field.key] = Math.max(0, net);
  }
  return resolved;
}

function roomMetrics(room: any): any {
  const floorSf    = Number(room.areaSf    || 0);
  const wallHeight = Number(room.height    || 8);
  const perimLf    = Number(room.perimeterLf || 0);
  const wallSf     = Number(room.wallAreaSf || (perimLf * wallHeight));
  return { floor_sf: floorSf, ceiling_sf: floorSf, wall_sf: wallSf, perimeter_lf: perimLf, wall_height: wallHeight, door_count: Number(room.doors || 0), window_count: Number(room.windows || 0), room_count: 1 };
}

function buildTradeDefs(templates: any[]): any[] {
  return (templates || []).map(t => ({
    trade: t.trade, summary: t.scope_definition?.summary ?? null, optional: t.scope_definition?.optional ?? false,
    conditional: t.scope_definition?.conditional ?? null, materialsFormula: t.scope_definition?.materials_formula ?? null,
    laborFormula: t.scope_definition?.labor_formula ?? null, laborExtras: t.scope_definition?.labor_extras ?? null,
  }));
}

// T2#4 S2a: up to four rows can now compete for one key — {tenant, platform} × {room-specific,
// all-rooms (room_type NULL)}. Rank each and merge:
//   rank = (tenant_id != null ? 2 : 0) + (room_type != null ? 1 : 0)
//   tenant+room (3) > tenant+all (2) > platform+room (1) > platform+all (0)
// Tenant ALWAYS beats platform on the rate (locked principle #5). Preserves the partial-merge
// semantic: the best-ranked PLATFORM row is the base (supplies coverage_sf / waste_pct / unit),
// the best-ranked TENANT row supplies the rate (base_rate + tenant_id + id). Falls back to the
// tenant row as base when no platform row exists. Order-independent — the unique index guarantees
// no two rows share a rank within a (plat|tenant) tier for a key, so selection never ties.
// LOCKSTEP with src/lib/pricingCore.js buildCostMaps — keep identical.
// T2#4 S2b: supabase.js sbLoadTakeoffCatalog carries a DELIBERATE second copy of this rank rule
// (the Rate Book screen resolves the live rate the same way) — keep the two in sync.
function buildCostMaps(unitCosts: any[]): any {
  const laborBuckets: any = {}, laborExtrasBuckets: any = {}, materialBuckets: any = {};

  const consider = (buckets: any, key: string, row: any) => {
    const isTenant = row.tenant_id != null;
    const rank = (isTenant ? 2 : 0) + (row.room_type != null ? 1 : 0);
    let b = buckets[key];
    if (!b) b = buckets[key] = { plat: null, platRank: -1, ten: null, tenRank: -1 };
    if (isTenant) {
      if (rank > b.tenRank) { b.ten = row; b.tenRank = rank; }
    } else {
      if (rank > b.platRank) { b.plat = row; b.platRank = rank; }
    }
  };

  for (const row of (unitCosts || [])) {
    if (row.category === "materials") {
      consider(materialBuckets, `${row.trade}::${row.material_name}`, row);
    } else if (row.material_name) {
      consider(laborExtrasBuckets, `${row.trade}::${row.material_name}`, row);
    } else {
      consider(laborBuckets, `${row.trade}`, row);
    }
  }

  const resolve = (buckets: any): any => {
    const out: any = {};
    for (const key of Object.keys(buckets)) {
      const { plat, ten } = buckets[key];
      out[key] = (plat && ten)
        ? { ...plat, base_rate: ten.base_rate, tenant_id: ten.tenant_id, id: ten.id }
        : (ten || plat);
    }
    return out;
  };

  return {
    laborCostMap:       resolve(laborBuckets),
    laborExtrasCostMap: resolve(laborExtrasBuckets),
    materialRateMap:    resolve(materialBuckets),
  };
}

function buildSubsetMap(scopeSubsets: any[]): any {
  const m: any = {};
  for (const s of (scopeSubsets || [])) m[s.scope_tag] = s;
  return m;
}

function buildSchemaMap(schemas: any[]): any {
  const m: any = {};
  for (const row of (schemas || [])) {
    const key = `${row.room_type}::${row.scope_tag}`, prev = m[key];
    if (!prev || (row.tenant_id !== null && prev.tenant_id === null)) m[key] = row;
  }
  return m;
}

function buildWasteMap(wasteRows: any[]): any {
  const m: any = {};
  for (const row of (wasteRows || [])) {
    const key = row.sub_trade ? `${row.parent_trade} - ${row.sub_trade}` : row.parent_trade;
    m[key] = row.default_waste_pct ?? 0;
  }
  return m;
}

function getWastePct(wasteMap: any, trade: string): number {
  if (wasteMap[trade] !== undefined) return wasteMap[trade];
  const prefix = trade.split(" - ")[0];
  const hit = Object.keys(wasteMap).find(k => k.startsWith(prefix));
  return hit ? wasteMap[hit] : 0;
}

// TAKEOFF_QA Sym 5 — structured conditional for a material formula entry (see src/lib/pricingCore.js).
export function matchesWhen(when: any, details: any): boolean {
  if (!when) return true;
  const v = details?.[when.scope_detail];
  if (Array.isArray(when.in))     return when.in.includes(v);
  if (Array.isArray(when.not_in)) return !when.not_in.includes(v);
  if ("equals" in when)           return v === when.equals;
  return true;
}

// TAKEOFF_QA Sym 4 — fixture identity for template↔schema de-dup (see src/lib/pricingCore.js).
const SCHEMA_FIELD_TO_FIXTURE: Record<string, string> = { vanity_width: "vanity_cabinet", vanity_top: "vanity_top", toilet_type: "toilet" };
const MATERIAL_FIXTURE_PATTERNS: [RegExp, string][] = [
  [/^vanity cabinet/i, "vanity_cabinet"],
  [/^vanity top/i,     "vanity_top"],
  [/^vanity sink/i,    "vanity_sink"],
  [/^toilet/i,         "toilet"],
];
function schemaOwnedFixtureSet(schema: any): Set<string> {
  const owned = new Set<string>();
  for (const f of (schema?.fields ?? [])) {
    if (SCHEMA_FIELD_TO_FIXTURE[f.key]) owned.add(SCHEMA_FIELD_TO_FIXTURE[f.key]);
    if (f.key === "sink_count")         owned.add("vanity_sink");
  }
  return owned;
}
function fixtureIdForMaterial(name: any): string | null {
  const s = String(name || "");
  for (const [re, id] of MATERIAL_FIXTURE_PATTERNS) if (re.test(s)) return id;
  return null;
}

export function computePricingLines({ rooms, templates, unitCosts, scopeSubsets, schemas, wasteRows }: any): any {
  const tradeDefs = buildTradeDefs(templates);
  const { laborCostMap, laborExtrasCostMap, materialRateMap } = buildCostMaps(unitCosts);
  const subsetByTag = buildSubsetMap(scopeSubsets);
  const schemaByKey = buildSchemaMap(schemas);
  const wasteMap    = buildWasteMap(wasteRows);

  const normalizedRooms = (rooms || []).map((r: any) => ({
    roomId: r.roomId, roomLabel: r.roomLabel ?? r.roomId, floor: r.floor ?? 0, roomType: r.roomType,
    isSynthetic: r.isSynthetic ?? false, scopeTag: r.scopeTag ?? null, scopeLabel: r.scopeLabel ?? null,
    scopeMissing: r.scopeMissing ?? false, customTrades: r.customTrades ?? [],
    areaSf: r.geometry?.floorSf ?? 0, wallAreaSf: r.geometry?.wallSf ?? 0,
    perimeterLf: r.geometry?.perimeterLf ?? 0, height: r.geometry?.ceilingFt ?? 8,
    doors: r.geometry?.doors ?? 0, windows: r.geometry?.windows ?? 0,
    scope_details: r.scopeDetails ?? {},
  }));

  const activeRooms = normalizedRooms.filter((r: any) => r.scopeTag !== "not_in_scope");
  const lines: any[] = [];
  const scopeDetailsResolved: any[] = [];

  for (const room of activeRooms) {
    let allowedTrades: Set<string> | null = null;
    if (room.scopeTag) {
      if (room.scopeTag === "custom") {
        allowedTrades = new Set(room.customTrades ?? []);
      } else {
        const subset = subsetByTag[room.scopeTag];
        if (subset) {
          const trades = subset.trades ?? [];
          if (!trades.includes("__all__")) allowedTrades = new Set(trades);
        }
      }
    }
    const schemaKey   = room.scopeTag ? `${room.roomType}::${room.scopeTag}` : null;
    const schemaEntry = schemaKey ? schemaByKey[schemaKey] : null;
    const resolvedDets = resolveDetails(schemaEntry?.schema ?? null, room.scope_details ?? {}, room);
    const ownedFixtures = schemaOwnedFixtureSet(schemaEntry?.schema); // Sym 4 — fixtures the schema owns
    if (!room.isSynthetic && room.scopeTag) scopeDetailsResolved.push({ roomId: room.roomId, scopeTag: room.scopeTag, resolved: resolvedDets });

    for (const def of tradeDefs) {
      if (allowedTrades !== null && !allowedTrades.has(def.trade)) continue;
      // Sym 3 — optional/alternate trades fire only when EXPLICITLY selected, never under __all__.
      const explicitlySelected = allowedTrades !== null && allowedTrades.has(def.trade);
      if (def.optional && !explicitlySelected) continue;
      const lineOptional = false; // in scope if it reaches here — never show "optional"
      const costRow   = laborCostMap[def.trade];
      const baseRate  = costRow?.base_rate != null ? Number(costRow.base_rate) : null;
      const unit      = costRow?.unit ?? "lump";
      const multiplier = resolveMultiplier(room.floor, costRow?.multipliers ?? {});
      const wastePct   = getWastePct(wasteMap, def.trade);

      let skipTrade = false;
      let quantity: any, quantityPreFilled: any, quantityNotes: any;

      if (def.laborFormula) {
        const lf = def.laborFormula;
        if (lf.qty_basis === "scope_detail") {
          const val = Number(resolvedDets[lf.scope_detail_key] ?? 0);
          if (val > 0) { quantity = Math.round(val * 100) / 100; quantityPreFilled = true; quantityNotes = `scope: ${lf.scope_detail_key} = ${val.toFixed(1)}`; }
          else if (lf.skip_when_missing) { skipTrade = true; }
        } else if (lf.qty_basis === "metric") {
          const metricMap: any = { floor_sf: room.areaSf, wall_sf: room.wallAreaSf, perimeter_lf: room.perimeterLf };
          const val = metricMap[lf.metric_key];
          if (val != null && val > 0) { quantity = Math.round(val * 100) / 100; quantityPreFilled = true; quantityNotes = `metric: ${lf.metric_key} = ${val.toFixed(1)}`; }
        }
      }
      if (skipTrade) continue;
      if (quantity === undefined) ({ quantity, quantityPreFilled, quantityNotes } = buildQuantity({ trade: def.trade, unit, areaSf: room.areaSf, wallAreaSf: room.wallAreaSf, perimeterLf: room.perimeterLf, wastePct: 0 }));

      const lineCost = (baseRate != null && quantity != null) ? Math.round(baseRate * quantity * multiplier * 100) / 100 : null;
      lines.push({ roomId: room.roomId, trade: def.trade, category: "labor", templateNotes: def.summary, optional: lineOptional, conditional: def.conditional, unit, unitCostId: costRow?.id ?? null, unitCostSource: costRow ? (costRow.tenant_id !== null ? "tenant_override" : "platform_default") : null, baseRate, baseRateMissing: baseRate == null, multiplier, wastePct, quantity, quantityPreFilled, quantityNotes, lineCost, lineCostStatus: resolveLineCostStatus(baseRate, quantity) });

      if (def.laborExtras?.length) {
        for (const extra of def.laborExtras) {
          const gateVal = resolvedDets[extra.scope_detail_key];
          if (!gateVal) continue;
          const extraKey = `${def.trade}::${extra.material_name}`, extraRow = laborExtrasCostMap[extraKey];
          const extraRate = extraRow?.base_rate != null ? Number(extraRow.base_rate) : null;
          const extraUnit = extraRow?.unit ?? "each", extraQty = Number(extra.fixed_qty) || 1;
          const extraCost = extraRate != null ? Math.round(extraRate * extraQty * 100) / 100 : null;
          lines.push({ roomId: room.roomId, trade: def.trade, category: "labor", materialName: extra.material_name, description: extra.material_name, templateNotes: extra.material_name, optional: false, conditional: null, unit: extraUnit, unitCostId: extraRow?.id ?? null, unitCostSource: extraRow ? (extraRow.tenant_id !== null ? "tenant_override" : "platform_default") : null, baseRate: extraRate, baseRateMissing: extraRate == null, multiplier: 1, wastePct: 0, quantity: extraQty, quantityPreFilled: true, quantityNotes: `scope: ${extra.scope_detail_key}`, lineCost: extraCost, lineCostStatus: resolveLineCostStatus(extraRate, extraQty) });
        }
      }

      if (def.materialsFormula?.length) {
        const metrics = roomMetrics(room);
        const pendingMatLines: any[] = [];
        for (const formula of def.materialsFormula) {
          // Sym 5 — skip a material whose `when` doesn't match the scope answer (tub vs shower trim).
          if (formula.when && !matchesWhen(formula.when, resolvedDets)) continue;
          // Sym 4 — skip a template fixture the schema already owns (prevents the duplicate line).
          const fxId = fixtureIdForMaterial(formula.material_name);
          if (fxId && ownedFixtures.has(fxId)) continue;
          const matKey = `${def.trade}::${formula.material_name}`, matRow = materialRateMap[matKey];
          const matRate = matRow?.base_rate != null ? Number(matRow.base_rate) : null;
          const matUnit = matRow?.unit ?? "each";
          let matQty = null, matQtyNotes = "";
          if (matRow || formula.qty_basis === "scope_detail") {
            const raw = evaluateFormula(formula, metrics, matRow ?? {}, resolvedDets);
            if (raw === 0 && formula.qty_basis === "scope_detail") continue;
            matQty = Math.round(raw * 100) / 100;
            const divisorLabel = formula.qty_divisor === "coverage_sf" ? " ÷ coverage" : "";
            const wasteLabel   = Number(matRow?.waste_pct || 0) > 0 ? ` + ${matRow.waste_pct}% waste` : "";
            if (formula.qty_basis === "scope_detail")      matQtyNotes = `scope: ${formula.scope_detail_key}${divisorLabel}${wasteLabel}`;
            else if (formula.qty_basis === "fixed")         matQtyNotes = `fixed: ${formula.fixed_qty}`;
            else                                            matQtyNotes = `${formula.qty_basis} × ${formula.qty_multiplier}${divisorLabel}${wasteLabel}`;
          } else { matQtyNotes = "no rate row found for material — rep must enter"; }
          const matLineCost = (matRate != null && matQty != null) ? Math.round(matRate * matQty * 100) / 100 : null;
          pendingMatLines.push({ roomId: room.roomId, trade: def.trade, category: "materials", materialName: formula.material_name, templateNotes: def.summary, optional: lineOptional, conditional: def.conditional, unit: matUnit, unitCostId: matRow?.id ?? null, unitCostSource: matRow ? (matRow.tenant_id !== null ? "tenant_override" : "platform_default") : null, baseRate: matRate, baseRateMissing: matRate == null, multiplier: 1, wastePct: matRow?.waste_pct != null ? Number(matRow.waste_pct) : 0, quantity: matQty, quantityPreFilled: matQty != null, quantityNotes: matQtyNotes, lineCost: matLineCost, lineCostStatus: resolveLineCostStatus(matRate, matQty) });
        }
        const matByName = new Map<string, any>();
        for (const ml of pendingMatLines) {
          if (!matByName.has(ml.materialName)) { matByName.set(ml.materialName, { ...ml }); }
          else {
            const existing = matByName.get(ml.materialName)!;
            const newQty = Math.round(((existing.quantity || 0) + (ml.quantity || 0)) * 100) / 100;
            const newCost = existing.baseRate != null ? Math.round(existing.baseRate * newQty * 100) / 100 : null;
            matByName.set(ml.materialName, { ...existing, quantity: newQty, quantityPreFilled: true, quantityNotes: `${existing.quantityNotes} + ${ml.quantityNotes}`, lineCost: newCost, lineCostStatus: resolveLineCostStatus(existing.baseRate, newQty) });
          }
        }
        for (const ml of matByName.values()) lines.push(ml);
      }
    }

    if (schemaEntry?.schema?.fields) {
      for (const field of schemaEntry.schema.fields) {
        if (field.type !== "fixture_select") continue;
        const selectedValue = resolvedDets[field.key];
        if (!selectedValue || selectedValue === "custom") continue;
        let materialName: string | null = null;
        if (field.options_template) {
          const opt = field.options?.find((o: any) => o.value === selectedValue);
          if (opt?.material_label) materialName = field.options_template.replace("{material}", opt.material_label.toLowerCase()).replace("{vanity_width}", resolvedDets.vanity_width || "");
        } else {
          const opt = field.options?.find((o: any) => o.value === selectedValue);
          materialName = opt?.material_name ?? null;
        }
        if (!materialName) continue;
        const matKey = `${field.trade}::${materialName}`, matRow = materialRateMap[matKey];
        const matRate = matRow?.base_rate != null ? Number(matRow.base_rate) : null;
        const matUnit = matRow?.unit ?? "each";
        lines.push({ roomId: room.roomId, trade: field.trade, category: "materials", materialName, templateNotes: field.label, optional: false, conditional: null, unit: matUnit, unitCostId: matRow?.id ?? null, unitCostSource: matRow ? (matRow.tenant_id !== null ? "tenant_override" : "platform_default") : null, baseRate: matRate, baseRateMissing: matRate == null, multiplier: 1, wastePct: 0, quantity: 1, quantityPreFilled: true, quantityNotes: `fixture: ${field.label}`, lineCost: matRate != null ? Math.round(matRate * 100) / 100 : null, lineCostStatus: resolveLineCostStatus(matRate, 1) });
      }
      const sinkCount = Number(resolvedDets.sink_count ?? 0);
      if (sinkCount > 0) {
        const sinkName = "Vanity sink standard", sinkKey = `Plumbing - Finish / fixtures::${sinkName}`;
        const sinkRow = materialRateMap[sinkKey], sinkRate = sinkRow?.base_rate != null ? Number(sinkRow.base_rate) : null;
        lines.push({ roomId: room.roomId, trade: "Plumbing - Finish / fixtures", category: "materials", materialName: sinkName, templateNotes: "Vanity sink", optional: false, conditional: null, unit: sinkRow?.unit ?? "each", unitCostId: sinkRow?.id ?? null, unitCostSource: sinkRow ? (sinkRow.tenant_id !== null ? "tenant_override" : "platform_default") : null, baseRate: sinkRate, baseRateMissing: sinkRate == null, multiplier: 1, wastePct: 0, quantity: sinkCount, quantityPreFilled: true, quantityNotes: `fixture: ${sinkCount} sink(s)`, lineCost: sinkRate != null ? Math.round(sinkRate * sinkCount * 100) / 100 : null, lineCostStatus: resolveLineCostStatus(sinkRate, sinkCount) });
      }
    }
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    if (String(lines[i].roomId).startsWith("answer_") && lines[i].category === "labor") lines.splice(i, 1);
  }

  const laborLinesList    = lines.filter((l: any) => l.category === "labor");
  const materialLinesList = lines.filter((l: any) => l.category === "materials");
  const linesNeedingRate     = lines.filter((l: any) => l.baseRateMissing).length;
  const linesNeedingQuantity = lines.filter((l: any) => !l.quantityPreFilled).length;
  const linesReady           = lines.filter((l: any) => l.lineCostStatus === "ok").length;
  const laborSubtotal    = Math.round(laborLinesList.reduce((s: number, l: any) => s + (l.lineCost ?? 0), 0) * 100) / 100;
  const materialSubtotal = Math.round(materialLinesList.reduce((s: number, l: any) => s + (l.lineCost ?? 0), 0) * 100) / 100;
  const subtotal         = Math.round((laborSubtotal + materialSubtotal) * 100) / 100;
  const roomsMissingScope = activeRooms.filter((r: any) => r.scopeMissing).length;

  return { lines, summary: { totalRooms: activeRooms.length, totalLines: lines.length, laborLines: laborLinesList.length, materialLines: materialLinesList.length, linesNeedingRate, linesNeedingQuantity, linesReady, laborSubtotal, materialSubtotal, subtotal, subtotalIncomplete: lines.some((l: any) => l.lineCost == null), roomsMissingScope, scope_details_resolved: scopeDetailsResolved } };
}

// ── ADDENDUM: geometry derivation from scan row ───────────────────────────────
// Extracted from buildTakeoffDraft (takeoff.js:351-385) so the edge handler
// doesn't need to know the scan JSONB shape. Not present in src/lib/pricingCore.js.

export function deriveGeometryFromScan(scan: any): { floorSf: number; wallSf: number; perimeterLf: number; ceilingFt: number; doors: number; windows: number; source: string } | null {
  const rooms = scan.rooms || [];
  if (rooms.length === 0) return null;
  const ng = scan.normalized_geometry ?? null;
  const normRoom = ng?.rooms?.[0] ?? null;
  const rawRoom  = rooms[0];
  const scanCeilingFt = scan.height_meters ? scan.height_meters * 3.28084 : null;
  let floorSf: number, perimeterLf: number, ceilingFt: number, wallSf: number, source: string;
  if (normRoom?.area_sqft != null) {
    floorSf   = normRoom.area_sqft;
    ceilingFt = normRoom.height ?? scanCeilingFt ?? 8;
    const rw  = (ng?.walls || []).filter((w: any) => w.room_id === normRoom.id);
    const rawPerim = rw.reduce((s: number, w: any) => { const dx = w.p2[0]-w.p1[0], dz = w.p2[1]-w.p1[1]; return s + Math.sqrt(dx*dx+dz*dz); }, 0);
    perimeterLf = Math.round(rawPerim * 100) / 100;
    wallSf      = Math.round(perimeterLf * ceilingFt * 100) / 100;
    source      = "normalized";
  } else {
    ceilingFt   = rawRoom.height ?? scanCeilingFt ?? 8;
    const w     = rawRoom.wallSegments?.reduce
      ? rawRoom.wallSegments.reduce((s: number, seg: any) => { const dx=seg.x2-seg.x1,dz=seg.z2-seg.z1; return s+Math.sqrt(dx*dx+dz*dz); }, 0)
      : 2 * ((rawRoom.width || 0) + (rawRoom.length || 0));
    floorSf     = rawRoom.sqft ?? 0;
    perimeterLf = Math.round(w * 100) / 100;
    wallSf      = Math.round(perimeterLf * ceilingFt * 100) / 100;
    source      = "raw";
  }
  return { floorSf, wallSf, perimeterLf, ceilingFt, doors: rawRoom.doors ?? 0, windows: rawRoom.windows ?? 0, source };
}
