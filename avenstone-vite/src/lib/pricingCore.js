// pricingCore.js — pure ESM pricing computation.
// NO imports of supabase, browser APIs, or Deno-specific modules.
// Depends only on computeFns.js (also pure).
//
// Entry point: computePricingLines({ rooms, templates, unitCosts, scopeSubsets, schemas, wasteRows })
// Returns: { lines, summary }
//
// Input shape per room:
//   { roomId, roomLabel, floor, roomType, isSynthetic, scopeTag, scopeLabel, scopeMissing,
//     scopeDetails, customTrades, geometry: { floorSf, wallSf, perimeterLf, ceilingFt, doors, windows, source } }
//
// Catalog inputs are raw DB rows — this module does all map-building and de-dup internally.
// See buildTakeoffDraft in takeoff.js for the DB-load + scan-geometry provider that calls this.

import { runCompute } from './computeFns.js';

// ── Quantity source mapping ────────────────────────────────────────────────────

function quantitySource(trade, unit) {
  if (/Drywall/.test(trade))                              return 'wallSf';
  if (/Paint - Interior/.test(trade))                    return 'wallSf';
  if (/Paint - Exterior/.test(trade))                    return 'wallSf';
  if (/Tile - Wall|Tile.*[Ss]hower/.test(trade))         return 'wallSf';
  if (/Tile - Backsplash/.test(trade))                   return null;
  if (/Tile - Floor/.test(trade))                        return 'areaSf';
  if (/Flooring/.test(trade))                            return 'areaSf';
  if (/Demo/.test(trade))                                return 'areaSf_noWaste';
  if (/Framing/.test(trade))                             return 'areaSf';
  if (/Insulation/.test(trade))                          return 'wallSf';
  if (/[Bb]ase.*[Cc]ase|carpentry.*[Bb]ase/.test(trade)) return 'lf';
  if (/Crown/.test(trade))                               return 'lf';
  if (unit === 'lump')                                   return 'lump';
  if (unit === 'each')                                   return 'each';
  return null;
}

function buildQuantity({ trade, unit, areaSf, wallAreaSf, perimeterLf, wastePct }) {
  const src = quantitySource(trade, unit);
  const w = wastePct || 0;

  if (src === 'areaSf') {
    const qty = areaSf * (1 + w / 100);
    return {
      quantity: Math.round(qty * 100) / 100,
      quantityPreFilled: areaSf > 0,
      quantityNotes: `from scan: ${areaSf.toFixed(1)} sf × ${w}% waste = ${qty.toFixed(1)} sf`,
    };
  }
  if (src === 'areaSf_noWaste') {
    return {
      quantity: Math.round(areaSf * 100) / 100,
      quantityPreFilled: areaSf > 0,
      quantityNotes: `from scan: ${areaSf.toFixed(1)} sf (no waste — demo labor)`,
    };
  }
  if (src === 'wallSf') {
    const qty = wallAreaSf * (1 + w / 100);
    return {
      quantity: Math.round(qty * 100) / 100,
      quantityPreFilled: wallAreaSf > 0,
      quantityNotes: `from scan: ${wallAreaSf.toFixed(1)} wall sf × ${w}% waste = ${qty.toFixed(1)} sf`,
    };
  }
  if (src === 'lf') {
    return {
      quantity: Math.round(perimeterLf * 100) / 100,
      quantityPreFilled: perimeterLf > 0,
      quantityNotes: `from scan: ${perimeterLf.toFixed(1)} lf perimeter`,
    };
  }
  if (src === 'lump') {
    return { quantity: 1, quantityPreFilled: true, quantityNotes: 'lump — quantity = 1' };
  }
  return { quantity: null, quantityPreFilled: false, quantityNotes: null };
}

// ── Multiplier resolution ──────────────────────────────────────────────────────

function resolveMultiplier(floor, multipliers) {
  if (!multipliers || Object.keys(multipliers).length === 0) return 1.0;
  if (floor === -1) return multipliers.basement    ?? 1.0;
  if (floor === 0)  return multipliers.first_floor ?? 1.0;
  return               multipliers.second_floor ?? 1.0;
}

export function resolveLineCostStatus(baseRate, quantity) {
  if (baseRate == null && quantity == null) return 'pending_both';
  if (baseRate == null)                     return 'pending_rate';
  if (quantity == null)                     return 'pending_quantity';
  return 'ok';
}

// ── Material formula evaluator ────────────────────────────────────────────────

function evaluateFormula(formula, metrics, materialRow, scopeDetails) {
  if (formula.qty_basis === 'fixed') {
    return Number(formula.fixed_qty || 0);
  }

  if (formula.qty_basis === 'scope_detail') {
    const key    = formula.scope_detail_key;
    const detail = scopeDetails?.[key];
    if (detail === undefined || detail === null) return 0;
    if (typeof detail === 'boolean') {
      return detail ? Number(formula.fixed_qty || 1) : 0;
    }
    const num = Number(detail);
    if (!isFinite(num) || num === 0) return 0;
    const multiplier  = Number(formula.qty_multiplier || 1);
    const wasteFactor = 1 + (Number(materialRow.waste_pct || 0) / 100);
    let qty = num * multiplier * wasteFactor;
    if (formula.qty_divisor === 'coverage_sf') {
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

  if (formula.qty_divisor === 'coverage_sf') {
    const coverage = Number(materialRow.coverage_sf || 0);
    if (coverage > 0) qty = qty / coverage;
  }

  return qty;
}

// ── Scope details resolver ─────────────────────────────────────────────────────
// Three-pass resolver: defaults → computed fields → subtract.
// 'computed' field type runs a named COMPUTE_FNS function (from computeFns.js).

function resolveDetails(schema, scopeDetails, room) {
  if (!schema?.fields) return scopeDetails ?? {};
  const resolved = { ...(scopeDetails ?? {}) };

  // Pass 1: defaults for non-computed fields
  for (const field of schema.fields) {
    if (field.type === 'computed') continue;
    if (resolved[field.key] !== undefined) continue;
    if (field.default_from === 'room.floorSf') {
      resolved[field.key] = room.areaSf || 0;
    } else if (field.default !== undefined) {
      resolved[field.key] = field.default;
    }
  }

  // Pass 2: computed fields — override_key wins when explicitly set
  for (const field of schema.fields) {
    if (field.type !== 'computed') continue;
    const overrideVal = field.override_key != null ? resolved[field.override_key] : undefined;
    if (overrideVal != null) {
      resolved[field.key] = Number(overrideVal);
    } else {
      const computed = runCompute(field.compute_fn, resolved);
      if (computed != null) resolved[field.key] = computed;
    }
  }

  // Pass 3: subtract (e.g. floor_tile_sf nets out shower_floor_sf)
  for (const field of schema.fields) {
    if (!field.subtract?.length) continue;
    const base = Number(resolved[field.key] ?? 0);
    const net  = field.subtract.reduce((acc, k) => acc - Number(resolved[k] ?? 0), base);
    resolved[field.key] = Math.max(0, net);
  }

  return resolved;
}

// ── Room metrics for material formula evaluation ───────────────────────────────

function roomMetrics(room) {
  const floorSf    = Number(room.areaSf    || 0);
  const wallHeight = Number(room.height    || 8);
  const perimLf    = Number(room.perimeterLf || 0);
  const wallSf     = Number(room.wallAreaSf || (perimLf * wallHeight));
  return {
    floor_sf:     floorSf,
    ceiling_sf:   floorSf,
    wall_sf:      wallSf,
    perimeter_lf: perimLf,
    wall_height:  wallHeight,
    door_count:   Number(room.doors   || 0),
    window_count: Number(room.windows || 0),
    room_count:   1,
  };
}

// ── Catalog map builders ───────────────────────────────────────────────────────
// These replicate the in-line de-dup logic from buildTakeoffDraft.

function buildTradeDefs(templates) {
  return (templates || []).map(t => ({
    trade:           t.trade,
    summary:         t.scope_definition?.summary         ?? null,
    optional:        t.scope_definition?.optional        ?? false,
    conditional:     t.scope_definition?.conditional     ?? null,
    materialsFormula: t.scope_definition?.materials_formula ?? null,
    laborFormula:    t.scope_definition?.labor_formula   ?? null,
    laborExtras:     t.scope_definition?.labor_extras    ?? null,
  }));
}

function buildCostMaps(unitCosts) {
  const laborCostMap       = {};
  const laborExtrasCostMap = {};
  const materialRateMap    = {};

  for (const row of (unitCosts || [])) {
    if (row.category === 'materials') {
      const key  = `${row.trade}::${row.material_name}`;
      const prev = materialRateMap[key];
      if (!prev) {
        materialRateMap[key] = row;
      } else if (row.tenant_id !== null && prev.tenant_id === null) {
        materialRateMap[key] = { ...prev, base_rate: row.base_rate, tenant_id: row.tenant_id, id: row.id };
      }
    } else if (row.material_name) {
      const key  = `${row.trade}::${row.material_name}`;
      const prev = laborExtrasCostMap[key];
      if (!prev) {
        laborExtrasCostMap[key] = row;
      } else if (row.tenant_id !== null && prev.tenant_id === null) {
        laborExtrasCostMap[key] = { ...prev, base_rate: row.base_rate, tenant_id: row.tenant_id, id: row.id };
      }
    } else {
      const prev = laborCostMap[row.trade];
      if (!prev) {
        laborCostMap[row.trade] = row;
      } else if (row.tenant_id !== null && prev.tenant_id === null) {
        laborCostMap[row.trade] = { ...prev, base_rate: row.base_rate, tenant_id: row.tenant_id, id: row.id };
      }
    }
  }

  return { laborCostMap, laborExtrasCostMap, materialRateMap };
}

function buildSubsetMap(scopeSubsets) {
  const subsetByTag = {};
  for (const sub of (scopeSubsets || [])) subsetByTag[sub.scope_tag] = sub;
  return subsetByTag;
}

function buildSchemaMap(schemas) {
  const schemaByKey = {};
  for (const row of (schemas || [])) {
    const key  = `${row.room_type}::${row.scope_tag}`;
    const prev = schemaByKey[key];
    if (!prev || (row.tenant_id !== null && prev.tenant_id === null)) {
      schemaByKey[key] = row;
    }
  }
  return schemaByKey;
}

function buildWasteMap(wasteRows) {
  const wasteMap = {};
  for (const row of (wasteRows || [])) {
    const key = row.sub_trade
      ? `${row.parent_trade} - ${row.sub_trade}`
      : row.parent_trade;
    wasteMap[key] = row.default_waste_pct ?? 0;
  }
  return wasteMap;
}

function getWastePct(wasteMap, trade) {
  if (wasteMap[trade] !== undefined) return wasteMap[trade];
  const prefix = trade.split(' - ')[0];
  const hit = Object.keys(wasteMap).find(k => k.startsWith(prefix));
  return hit ? wasteMap[hit] : 0;
}

// ── TAKEOFF_QA Sym 5 — structured conditional for a material formula entry ───────
// A formula entry may carry `when: { scope_detail, in?[], equals?, not_in?[] }`. When present
// and it does NOT match the room's resolved scope_details, the material line is skipped.
// This is how the tub/shower trim package follows the shower_type answer (tub spout only when a
// tub is present, shower valve trim only when a shower is present) instead of always firing.
export function matchesWhen(when, details) {
  if (!when) return true;
  const v = details?.[when.scope_detail];
  if (Array.isArray(when.in))     return when.in.includes(v);
  if (Array.isArray(when.not_in)) return !when.not_in.includes(v);
  if ('equals' in when)           return v === when.equals;
  return true;
}

// ── TAKEOFF_QA Sym 4 — fixture identity for template↔schema de-dup ───────────────
// The bathroom schemas drive fixtures via fixture_select (vanity_width, vanity_top, toilet_type)
// and sink_count, while the takeoff TEMPLATES also hardcode the same fixtures as fixed-qty
// materials — producing a duplicate line for each (vanity cabinet ×2, vanity top ×2, toilet ×2,
// sink ×2). When a room's schema OWNS a fixture, the template's generic version is suppressed so
// the schema-selected line is the single source of truth. Scopes without the schema field (e.g.
// tile_only has no toilet selector) keep the template fixture — this cannot regress them.
const SCHEMA_FIELD_TO_FIXTURE = { vanity_width: 'vanity_cabinet', vanity_top: 'vanity_top', toilet_type: 'toilet' };
const MATERIAL_FIXTURE_PATTERNS = [
  [/^vanity cabinet/i, 'vanity_cabinet'],
  [/^vanity top/i,     'vanity_top'],
  [/^vanity sink/i,    'vanity_sink'],
  [/^toilet/i,         'toilet'],
];
function schemaOwnedFixtureSet(schema) {
  const owned = new Set();
  for (const f of (schema?.fields ?? [])) {
    if (SCHEMA_FIELD_TO_FIXTURE[f.key]) owned.add(SCHEMA_FIELD_TO_FIXTURE[f.key]);
    if (f.key === 'sink_count')         owned.add('vanity_sink');
  }
  return owned;
}
function fixtureIdForMaterial(name) {
  const s = String(name || '');
  for (const [re, id] of MATERIAL_FIXTURE_PATTERNS) if (re.test(s)) return id;
  return null;
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Compute all pricing lines for a set of rooms given the loaded catalog data.
 * Pure: no DB access, no side effects, deterministic for identical inputs.
 *
 * @param {{ rooms, templates, unitCosts, scopeSubsets, schemas, wasteRows }} input
 * @returns {{ lines: Array, summary: object }}
 */
export function computePricingLines({ rooms, templates, unitCosts, scopeSubsets, schemas, wasteRows }) {
  const tradeDefs                               = buildTradeDefs(templates);
  const { laborCostMap, laborExtrasCostMap, materialRateMap } = buildCostMaps(unitCosts);
  const subsetByTag                             = buildSubsetMap(scopeSubsets);
  const schemaByKey                             = buildSchemaMap(schemas);
  const wasteMap                                = buildWasteMap(wasteRows);

  // Normalize rooms to internal shape (mirrors allRooms shape from buildTakeoffDraft)
  const normalizedRooms = (rooms || []).map(r => ({
    roomId:       r.roomId,
    roomLabel:    r.roomLabel   ?? r.roomId,
    floor:        r.floor       ?? 0,
    roomType:     r.roomType,
    isSynthetic:  r.isSynthetic ?? false,
    scopeTag:     r.scopeTag    ?? null,
    scopeLabel:   r.scopeLabel  ?? null,
    scopeMissing: r.scopeMissing ?? false,
    customTrades: r.customTrades ?? [],
    // Geometry mapped to internal names
    areaSf:       r.geometry?.floorSf     ?? 0,
    wallAreaSf:   r.geometry?.wallSf      ?? 0,
    perimeterLf:  r.geometry?.perimeterLf ?? 0,
    height:       r.geometry?.ceilingFt   ?? 8,
    doors:        r.geometry?.doors       ?? 0,
    windows:      r.geometry?.windows     ?? 0,
    // Pass through scopeDetails for schema resolution
    scope_details: r.scopeDetails ?? {},
  }));

  // Filter not_in_scope (same as activeRooms in buildTakeoffDraft)
  const activeRooms = normalizedRooms.filter(r => r.scopeTag !== 'not_in_scope');

  const lines = [];
  const scopeDetailsResolved = [];

  for (const room of activeRooms) {
    // Resolve allowed trades from scope tag (null = no filter = all trades)
    let allowedTrades = null;
    if (room.scopeTag) {
      if (room.scopeTag === 'custom') {
        allowedTrades = new Set(room.customTrades ?? []);
      } else {
        const subset = subsetByTag[room.scopeTag];
        if (subset) {
          const trades = subset.trades ?? [];
          if (!trades.includes('__all__')) allowedTrades = new Set(trades);
        }
      }
    }

    // Resolve scope_details with schema defaults + computed + subtract
    const schemaKey   = room.scopeTag ? `${room.roomType}::${room.scopeTag}` : null;
    const schemaEntry = schemaKey ? schemaByKey[schemaKey] : null;
    const resolvedDets = resolveDetails(schemaEntry?.schema ?? null, room.scope_details ?? {}, room);
    const ownedFixtures = schemaOwnedFixtureSet(schemaEntry?.schema); // Sym 4 — fixtures the schema owns

    // Collect resolved details for debug (non-synthetic rooms with a scope_tag)
    if (!room.isSynthetic && room.scopeTag) {
      scopeDetailsResolved.push({ roomId: room.roomId, scopeTag: room.scopeTag, resolved: resolvedDets });
    }

    // Build one labor line + material lines per trade template
    for (const def of tradeDefs) {
      if (allowedTrades !== null && !allowedTrades.has(def.trade)) continue;
      // TAKEOFF_QA Sym 3 — an optional/alternate trade (e.g. Flooring - LVP, "alternate to
      // Tile - Floor") must NOT auto-fire under a full/all-trades scope. It fires ONLY when
      // explicitly named by a subset or the custom trade list. This kills the LVP-alongside-tile
      // double-floor and the "checked AND optional" contradiction the rep saw.
      const explicitlySelected = allowedTrades !== null && allowedTrades.has(def.trade);
      if (def.optional && !explicitlySelected) continue;
      // A trade that reaches here is genuinely in scope — never surface it as "optional".
      const lineOptional = false;

      const costRow   = laborCostMap[def.trade];
      const baseRate  = costRow?.base_rate != null ? Number(costRow.base_rate) : null;
      const unit      = costRow?.unit ?? 'lump';
      const multiplier = resolveMultiplier(room.floor, costRow?.multipliers ?? {});
      const wastePct   = getWastePct(wasteMap, def.trade);

      // Resolve labor quantity: schema labor_formula wins, falls back to buildQuantity.
      // skip_when_missing: when a scope_detail value is absent/zero and the template sets
      // this flag, skip the entire trade rather than falling back to a lump-sum default.
      // Used by trades (e.g. Countertops) whose quantity is meaningless without the detail.
      let skipTrade = false;
      let quantity, quantityPreFilled, quantityNotes;

      if (def.laborFormula) {
        const lf = def.laborFormula;
        if (lf.qty_basis === 'scope_detail') {
          const val = Number(resolvedDets[lf.scope_detail_key] ?? 0);
          if (val > 0) {
            quantity          = Math.round(val * 100) / 100;
            quantityPreFilled = true;
            quantityNotes     = `scope: ${lf.scope_detail_key} = ${val.toFixed(1)}`;
          } else if (lf.skip_when_missing) {
            skipTrade = true;
          }
        } else if (lf.qty_basis === 'metric') {
          const metricMap = { floor_sf: room.areaSf, wall_sf: room.wallAreaSf, perimeter_lf: room.perimeterLf };
          const val = metricMap[lf.metric_key];
          if (val != null && val > 0) {
            quantity          = Math.round(val * 100) / 100;
            quantityPreFilled = true;
            quantityNotes     = `metric: ${lf.metric_key} = ${val.toFixed(1)}`;
          }
        }
      }

      if (skipTrade) continue;

      if (quantity === undefined) {
        ({ quantity, quantityPreFilled, quantityNotes } = buildQuantity({
          trade: def.trade, unit,
          areaSf:      room.areaSf,
          wallAreaSf:  room.wallAreaSf,
          perimeterLf: room.perimeterLf,
          wastePct:    0,
        }));
      }

      const lineCost = (baseRate != null && quantity != null)
        ? Math.round(baseRate * quantity * multiplier * 100) / 100
        : null;

      lines.push({
        roomId:       room.roomId,
        trade:        def.trade,
        category:     'labor',
        templateNotes: def.summary,
        optional:     lineOptional,
        conditional:  def.conditional,
        unit,
        unitCostId:   costRow?.id ?? null,
        unitCostSource: costRow
          ? (costRow.tenant_id !== null ? 'tenant_override' : 'platform_default')
          : null,
        baseRate,
        baseRateMissing: baseRate == null,
        multiplier,
        wastePct,
        quantity,
        quantityPreFilled,
        quantityNotes,
        lineCost,
        lineCostStatus: resolveLineCostStatus(baseRate, quantity),
      });

      // Labor extras — boolean-gated fixed-qty lines (e.g. niche install, bench framing)
      if (def.laborExtras?.length) {
        for (const extra of def.laborExtras) {
          const gateVal = resolvedDets[extra.scope_detail_key];
          if (!gateVal) continue;
          const extraKey  = `${def.trade}::${extra.material_name}`;
          const extraRow  = laborExtrasCostMap[extraKey];
          const extraRate = extraRow?.base_rate != null ? Number(extraRow.base_rate) : null;
          const extraUnit = extraRow?.unit ?? 'each';
          const extraQty  = Number(extra.fixed_qty) || 1;
          const extraCost = extraRate != null
            ? Math.round(extraRate * extraQty * 100) / 100
            : null;
          lines.push({
            roomId:       room.roomId,
            trade:        def.trade,
            category:     'labor',
            materialName: extra.material_name,
            description:  extra.material_name,
            templateNotes: extra.material_name,
            optional:     false,
            conditional:  null,
            unit:         extraUnit,
            unitCostId:   extraRow?.id ?? null,
            unitCostSource: extraRow
              ? (extraRow.tenant_id !== null ? 'tenant_override' : 'platform_default')
              : null,
            baseRate:       extraRate,
            baseRateMissing: extraRate == null,
            multiplier:     1,
            wastePct:       0,
            quantity:       extraQty,
            quantityPreFilled: true,
            quantityNotes:  `scope: ${extra.scope_detail_key}`,
            lineCost:       extraCost,
            lineCostStatus: resolveLineCostStatus(extraRate, extraQty),
          });
        }
      }

      // Material lines from template formula
      if (def.materialsFormula?.length) {
        const metrics       = roomMetrics(room);
        const pendingMatLines = [];

        for (const formula of def.materialsFormula) {
          // Sym 5 — skip a material whose `when` condition doesn't match the scope answer
          // (e.g. Tub spout only when a tub is present, Shower valve trim only when a shower is).
          if (formula.when && !matchesWhen(formula.when, resolvedDets)) continue;
          // Sym 4 — skip a template fixture the schema already owns (prevents the duplicate line).
          const fxId = fixtureIdForMaterial(formula.material_name);
          if (fxId && ownedFixtures.has(fxId)) continue;

          const matKey  = `${def.trade}::${formula.material_name}`;
          const matRow  = materialRateMap[matKey];
          const matRate = matRow?.base_rate != null ? Number(matRow.base_rate) : null;
          const matUnit = matRow?.unit ?? 'each';

          let matQty = null;
          let matQtyNotes = '';

          if (matRow || formula.qty_basis === 'scope_detail') {
            const raw = evaluateFormula(formula, metrics, matRow ?? {}, resolvedDets);
            if (raw === 0 && formula.qty_basis === 'scope_detail') continue;
            matQty = Math.round(raw * 100) / 100;
            const divisorLabel = formula.qty_divisor === 'coverage_sf' ? ' ÷ coverage' : '';
            const wasteLabel   = Number(matRow?.waste_pct || 0) > 0
              ? ` + ${matRow.waste_pct}% waste` : '';
            if (formula.qty_basis === 'scope_detail') {
              matQtyNotes = `scope: ${formula.scope_detail_key}${divisorLabel}${wasteLabel}`;
            } else if (formula.qty_basis === 'fixed') {
              matQtyNotes = `fixed: ${formula.fixed_qty}`;
            } else {
              matQtyNotes = `${formula.qty_basis} × ${formula.qty_multiplier}${divisorLabel}${wasteLabel}`;
            }
          } else {
            matQtyNotes = 'no rate row found for material — rep must enter';
          }

          const matLineCost = (matRate != null && matQty != null)
            ? Math.round(matRate * matQty * 100) / 100
            : null;

          pendingMatLines.push({
            roomId:    room.roomId,
            trade:     def.trade,
            category:  'materials',
            materialName: formula.material_name,
            templateNotes: def.summary,
            optional:  lineOptional,
            conditional: def.conditional,
            unit:       matUnit,
            unitCostId: matRow?.id ?? null,
            unitCostSource: matRow
              ? (matRow.tenant_id !== null ? 'tenant_override' : 'platform_default')
              : null,
            baseRate:       matRate,
            baseRateMissing: matRate == null,
            multiplier:     1,
            wastePct:       matRow?.waste_pct != null ? Number(matRow.waste_pct) : 0,
            quantity:       matQty,
            quantityPreFilled: matQty != null,
            quantityNotes:  matQtyNotes,
            lineCost:       matLineCost,
            lineCostStatus: resolveLineCostStatus(matRate, matQty),
          });
        }

        // Merge duplicate material names within the same trade+room
        const matByName = new Map();
        for (const ml of pendingMatLines) {
          if (!matByName.has(ml.materialName)) {
            matByName.set(ml.materialName, { ...ml });
          } else {
            const existing = matByName.get(ml.materialName);
            const newQty   = Math.round(((existing.quantity || 0) + (ml.quantity || 0)) * 100) / 100;
            const newCost  = existing.baseRate != null
              ? Math.round(existing.baseRate * newQty * 100) / 100
              : null;
            matByName.set(ml.materialName, {
              ...existing,
              quantity:          newQty,
              quantityPreFilled: true,
              quantityNotes:     `${existing.quantityNotes} + ${ml.quantityNotes}`,
              lineCost:          newCost,
              lineCostStatus:    resolveLineCostStatus(existing.baseRate, newQty),
            });
          }
        }
        for (const ml of matByName.values()) lines.push(ml);
      }
    }

    // Fixture-select lines from scope detail schema (shower door, vanity, toilet)
    if (schemaEntry?.schema?.fields) {
      for (const field of schemaEntry.schema.fields) {
        if (field.type !== 'fixture_select') continue;
        const selectedValue = resolvedDets[field.key];
        if (!selectedValue || selectedValue === 'custom') continue;

        let materialName = null;
        if (field.options_template) {
          const opt = field.options?.find(o => o.value === selectedValue);
          if (opt?.material_label) {
            materialName = field.options_template
              .replace('{material}', opt.material_label.toLowerCase())
              .replace('{vanity_width}', resolvedDets.vanity_width || '');
          }
        } else {
          const opt = field.options?.find(o => o.value === selectedValue);
          materialName = opt?.material_name ?? null;
        }

        if (!materialName) continue;

        const matKey  = `${field.trade}::${materialName}`;
        const matRow  = materialRateMap[matKey];
        const matRate = matRow?.base_rate != null ? Number(matRow.base_rate) : null;
        const matUnit = matRow?.unit ?? 'each';

        lines.push({
          roomId:    room.roomId,
          trade:     field.trade,
          category:  'materials',
          materialName,
          templateNotes: field.label,
          optional:  false,
          conditional: null,
          unit:      matUnit,
          unitCostId: matRow?.id ?? null,
          unitCostSource: matRow
            ? (matRow.tenant_id !== null ? 'tenant_override' : 'platform_default')
            : null,
          baseRate:       matRate,
          baseRateMissing: matRate == null,
          multiplier:     1,
          wastePct:       0,
          quantity:       1,
          quantityPreFilled: true,
          quantityNotes:  `fixture: ${field.label}`,
          lineCost:       matRate != null ? Math.round(matRate * 100) / 100 : null,
          lineCostStatus: resolveLineCostStatus(matRate, 1),
        });
      }

      // sink_count: qty>1 line for Vanity sink standard
      const sinkCount = Number(resolvedDets.sink_count ?? 0);
      if (sinkCount > 0) {
        const sinkName = 'Vanity sink standard';
        const sinkKey  = `Plumbing - Finish / fixtures::${sinkName}`;
        const sinkRow  = materialRateMap[sinkKey];
        const sinkRate = sinkRow?.base_rate != null ? Number(sinkRow.base_rate) : null;
        lines.push({
          roomId:    room.roomId,
          trade:     'Plumbing - Finish / fixtures',
          category:  'materials',
          materialName: sinkName,
          templateNotes: 'Vanity sink',
          optional:  false,
          conditional: null,
          unit:      sinkRow?.unit ?? 'each',
          unitCostId: sinkRow?.id ?? null,
          unitCostSource: sinkRow
            ? (sinkRow.tenant_id !== null ? 'tenant_override' : 'platform_default')
            : null,
          baseRate:       sinkRate,
          baseRateMissing: sinkRate == null,
          multiplier:     1,
          wastePct:       0,
          quantity:       sinkCount,
          quantityPreFilled: true,
          quantityNotes:  `fixture: ${sinkCount} sink(s)`,
          lineCost:       sinkRate != null ? Math.round(sinkRate * sinkCount * 100) / 100 : null,
          lineCostStatus: resolveLineCostStatus(sinkRate, sinkCount),
        });
      }
    }
  }

  // TAKEOFF_BRIDGE Phase 4c: synthetic rooms contribute MATERIALS only
  for (let i = lines.length - 1; i >= 0; i--) {
    if (String(lines[i].roomId).startsWith('answer_') && lines[i].category === 'labor') {
      lines.splice(i, 1);
    }
  }

  // Summary
  const laborLinesList    = lines.filter(l => l.category === 'labor');
  const materialLinesList = lines.filter(l => l.category === 'materials');
  const linesNeedingRate     = lines.filter(l => l.baseRateMissing).length;
  const linesNeedingQuantity = lines.filter(l => !l.quantityPreFilled).length;
  const linesReady           = lines.filter(l => l.lineCostStatus === 'ok').length;
  const laborSubtotal    = Math.round(laborLinesList.reduce((s, l) => s + (l.lineCost ?? 0), 0) * 100) / 100;
  const materialSubtotal = Math.round(materialLinesList.reduce((s, l) => s + (l.lineCost ?? 0), 0) * 100) / 100;
  const subtotal         = Math.round((laborSubtotal + materialSubtotal) * 100) / 100;
  const roomsMissingScope = activeRooms.filter(r => r.scopeMissing).length;

  return {
    lines,
    summary: {
      totalRooms:    activeRooms.length,
      totalLines:    lines.length,
      laborLines:    laborLinesList.length,
      materialLines: materialLinesList.length,
      linesNeedingRate,
      linesNeedingQuantity,
      linesReady,
      laborSubtotal,
      materialSubtotal,
      subtotal,
      subtotalIncomplete: lines.some(l => l.lineCost == null),
      roomsMissingScope,
      scope_details_resolved: scopeDetailsResolved,
    },
  };
}
