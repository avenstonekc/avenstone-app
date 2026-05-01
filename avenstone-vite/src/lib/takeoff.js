import { sb, AV_TENANT, sbSaveEstimate, sbSaveTenantUnitCostOverride, sbResolveTodosBySource, sbLoadJobRoomScopes, sbLoadScopeSubsets } from './supabase';
import { floorLabel } from './captureTypes';

// ── Geometry helpers ───────────────────────────────────────────────────────────

function computePerimeter(room) {
  if (room.wallSegments && room.wallSegments.length > 0) {
    return room.wallSegments.reduce((sum, seg) => {
      const dx = seg.x2 - seg.x1;
      const dz = seg.z2 - seg.z1;
      return sum + Math.sqrt(dx * dx + dz * dz);
    }, 0);
  }
  return 2 * ((room.width || 0) + (room.length || 0));
}

// ── Labor scope-detail override map ──────────────────────────────────────────
// For trades where the labor qty scales with a shower/fixture area rather than
// the full room metric, map trade → scope_details key.
// Used in buildTakeoffDraft when resolved scope_details has a non-zero value.
// Falls back to room metric when key is missing or zero.

const LABOR_SCOPE_DETAIL_OVERRIDE = {
  'Tile - Wall / shower': 'shower_wall_sf',
  'Tile - Floor':         'floor_tile_sf',
};

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

// ── Room-type filter ──────────────────────────────────────────────────────────
// capture_mode is passed through from the scan row so exterior scans are detectable.

function roomMatchesType(room, roomType) {
  const label = (room.roomLabel || '').toLowerCase();
  switch (roomType) {
    case 'bathroom':
      return label.includes('bath');
    case 'kitchen':
      return label.includes('kitchen');
    case 'basement':
      return label.includes('basement') || room.floor === -1;
    case 'exterior':
      return room.captureMode === 'exterior';
    case 'refresh':
      return true; // whole-job refresh — all rooms included by design
    default:
      return false;
  }
}

// ── Multiplier resolution ──────────────────────────────────────────────────────

function resolveMultiplier(floor, multipliers) {
  if (!multipliers || Object.keys(multipliers).length === 0) return 1.0;
  if (floor === -1) return multipliers.basement    ?? 1.0;
  if (floor === 0)  return multipliers.first_floor ?? 1.0;
  return               multipliers.second_floor ?? 1.0;
}

function resolveLineCostStatus(baseRate, quantity) {
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
    // Boolean fields (e.g. niche) — true emits fixed_qty, false emits 0
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

// ── Scope details resolver ────────────────────────────────────────────────────
// Merges rep-saved scope_details with schema field defaults for any missing key.
// Applies subtract logic (e.g. floor_tile_sf = room.areaSf - shower_floor_sf).
// Returns a flat object safe to pass into evaluateFormula.

function resolveDetails(schema, scopeDetails, room) {
  if (!schema?.fields) return scopeDetails ?? {};
  const resolved = { ...(scopeDetails ?? {}) };
  for (const field of schema.fields) {
    if (resolved[field.key] !== undefined) continue;
    if (field.default_from === 'room.floorSf') {
      resolved[field.key] = room.areaSf || 0;
    } else if (field.default !== undefined) {
      resolved[field.key] = field.default;
    }
  }
  // Apply subtract: floor_tile_sf → floor_tile_sf - shower_floor_sf (net bathroom floor)
  for (const field of schema.fields) {
    if (field.subtract?.length) {
      const base = Number(resolved[field.key] ?? 0);
      const net  = field.subtract.reduce((acc, k) => acc - Number(resolved[k] ?? 0), base);
      resolved[field.key] = Math.max(0, net);
    }
  }
  return resolved;
}

// ── Room metrics for material formula evaluation ───────────────────────────────
// Takes a processed room object (already in allRooms — has areaSf, wallAreaSf,
// perimeterLf, height, doors, windows threaded through from raw scan JSONB).
// Every metric defaults to 0 — never throws.

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

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} TakeoffDraft
 * @property {string} jobId
 * @property {string} roomType
 * @property {Array}  rooms   - one entry per scanned room included
 * @property {Array}  lines   - one entry per (room × trade-from-template)
 * @property {Object} summary - counts + subtotal
 */

/**
 * Build a takeoff draft for a job + room_type.
 * Reads job_lidar_scans, takeoff_templates, takeoff_unit_costs, trade_taxonomy.
 * Pure read — does NOT write anywhere.
 *
 * @param {{ jobId: string, roomType: string, roomIds?: string[] }} args
 * @returns {Promise<TakeoffDraft>}
 */
export async function buildTakeoffDraft({ jobId, roomType, roomIds }) {

  // 1. Job → tenant_id
  const { data: jobRow } = await sb.from('jobs').select('id, tenant_id').eq('id', jobId).single();
  const tenantId = jobRow?.tenant_id ?? null;

  // 2. Scans → flatten rooms (most recent 5 scans, newest first)
  const { data: scans } = await sb
    .from('job_lidar_scans')
    .select('id, rooms, height_meters, capture_mode')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(5);

  const allRooms = [];
  for (const scan of (scans || [])) {
    const scanCeilingFt = scan.height_meters ? scan.height_meters * 3.28084 : null;
    (scan.rooms || []).forEach((room, idx) => {
      // room.height is ceiling height in feet when present (from RoomPlan)
      const ceilingFt = room.height ?? scanCeilingFt ?? 8;
      const perimeterLf = computePerimeter(room);
      const areaSf = room.sqft ?? 0;
      allRooms.push({
        roomId: `${scan.id}_${idx}`,
        roomLabel: room.name || `Room ${idx + 1}`,
        // Scan data has no floor field — default 0 (first floor). Wizard UI (Prompt B) lets rep override.
        floor: 0,
        floorLabel: floorLabel(0),
        captureMode: scan.capture_mode ?? null,
        areaSf,
        wallAreaSf:  Math.round(perimeterLf * ceilingFt * 100) / 100,
        perimeterLf: Math.round(perimeterLf * 100) / 100,
        height:  ceilingFt,
        doors:   room.doors   ?? 0,
        windows: room.windows ?? 0,
      });
    });
  }

  const matchedRooms = roomIds
    ? allRooms.filter(r => roomIds.includes(r.roomId))
    : allRooms.filter(r => roomMatchesType(r, roomType));

  if (!matchedRooms.length) {
    return emptyDraft(jobId, roomType);
  }

  // 3. Fetch scope rows, subsets, and detail schemas in parallel.
  //    scopeByRoomId — keyed by room_id, value is the saved scope row.
  //    subsetByTag   — keyed by scope_tag, value is the template_scope_subsets row.
  //    schemaByKey   — keyed by "${room_type}::${scope_tag}", value is the schema JSONB.
  const [scopeRows, scopeSubsets, schemaRows] = await Promise.all([
    sbLoadJobRoomScopes(jobId),
    sbLoadScopeSubsets(null), // load all room types so cross-type tags resolve correctly
    sb.from('scope_detail_schemas').select('*').eq('active', true).then(r => r.data || []),
  ]);

  const scopeByRoomId = {};
  for (const row of scopeRows) scopeByRoomId[row.room_id] = row;

  const subsetByTag = {};
  for (const sub of scopeSubsets) subsetByTag[sub.scope_tag] = sub;

  // De-dup schemas: tenant override beats platform default for same (room_type, scope_tag).
  const schemaByKey = {};
  for (const row of schemaRows) {
    const key  = `${row.room_type}::${row.scope_tag}`;
    const prev = schemaByKey[key];
    if (!prev || (row.tenant_id !== null && prev.tenant_id === null)) {
      schemaByKey[key] = row;
    }
  }

  // Annotate each matched room with its saved scope metadata.
  const rooms = matchedRooms.map(room => {
    const scopeRow = scopeByRoomId[room.roomId];
    const subset   = scopeRow ? subsetByTag[scopeRow.scope_tag] : null;
    return {
      ...room,
      scope_tag:     scopeRow?.scope_tag     ?? null,
      scope_label:   subset?.label           ?? null,
      scope_missing: !scopeRow,
      scope_details: scopeRow?.scope_details ?? {},
    };
  });

  // Exclude not_in_scope rooms from the draft entirely — they contribute no lines and
  // should not appear in TakeoffWizard. Rooms with no scope row (untagged) are kept.
  const activeRooms = rooms.filter(r => r.scope_tag !== 'not_in_scope');

  // 4. Templates for this room_type (platform defaults + tenant overrides)
  const templateFilter = tenantId
    ? `tenant_id.is.null,tenant_id.eq.${tenantId}`
    : 'tenant_id.is.null';
  const { data: templates } = await sb
    .from('takeoff_templates')
    .select('trade, scope_definition')
    .eq('room_type', roomType)
    .eq('active', true)
    .or(templateFilter);

  const tradeDefs = (templates || []).map(t => ({
    trade: t.trade,
    summary: t.scope_definition?.summary ?? null,
    optional: t.scope_definition?.optional ?? false,
    conditional: t.scope_definition?.conditional ?? null,
    materialsFormula: t.scope_definition?.materials_formula ?? null,
  }));

  // 4. Unit costs — fetch all matching rows, resolve tenant override in JS
  //    (tenant row beats platform default for same trade)
  const costFilter = tenantId
    ? `tenant_id.is.null,tenant_id.eq.${tenantId}`
    : 'tenant_id.is.null';
  const { data: costRows } = await sb
    .from('takeoff_unit_costs')
    .select('*')
    .eq('room_type', roomType)
    .eq('active', true)
    .or(costFilter);

  // Split into labor and material maps. Both loaded from the same fetch — no second query.
  // Tenant row beats platform default (same de-dup logic as before, per key).
  const laborCostMap = {};
  const materialRateMap = {};

  for (const row of (costRows || [])) {
    if (row.category === 'materials') {
      const key = `${row.trade}::${row.material_name}`;
      const prev = materialRateMap[key];
      if (!prev) {
        materialRateMap[key] = row;
      } else if (row.tenant_id !== null && prev.tenant_id === null) {
        // Merge: keep platform fields (coverage_sf, waste_pct), overlay the tenant rate.
        // Full replacement loses coverage_sf/waste_pct when the override row omits them.
        materialRateMap[key] = { ...prev, base_rate: row.base_rate, tenant_id: row.tenant_id, id: row.id };
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

  // 5. Trade taxonomy → waste pct map
  const { data: taxonomy } = await sb
    .from('trade_taxonomy')
    .select('parent_trade, sub_trade, default_waste_pct');

  const wasteMap = {};
  for (const row of (taxonomy || [])) {
    const key = row.sub_trade
      ? `${row.parent_trade} - ${row.sub_trade}`
      : row.parent_trade;
    wasteMap[key] = row.default_waste_pct ?? 0;
  }
  function getWastePct(trade) {
    if (wasteMap[trade] !== undefined) return wasteMap[trade];
    // Partial prefix match as fallback
    const prefix = trade.split(' - ')[0];
    const hit = Object.keys(wasteMap).find(k => k.startsWith(prefix));
    return hit ? wasteMap[hit] : 0;
  }

  // 6. Build lines: one per (room × trade), filtered by saved scope tag.
  const lines = [];
  const scopeDetailsResolved = []; // debug: per-room resolved details

  for (const room of activeRooms) {
    // Resolve allowed trades for this room from its saved scope row.
    // null allowedTrades = no filter (all trades emitted — default when unscoped).
    let allowedTrades = null;
    const scopeRow = scopeByRoomId[room.roomId];

    // Resolve scope_details with schema defaults + subtract logic
    const schemaKey      = scopeRow ? `${scopeRow.room_type}::${scopeRow.scope_tag}` : null;
    const schemaEntry    = schemaKey ? schemaByKey[schemaKey] : null;
    const resolvedDets   = resolveDetails(schemaEntry?.schema ?? null, scopeRow?.scope_details ?? {}, room);

    if (scopeRow) {
      if (scopeRow.scope_tag === 'custom') {
        allowedTrades = new Set(scopeRow.custom_trades ?? []);
      } else {
        const subset = subsetByTag[scopeRow.scope_tag];
        if (subset) {
          const trades = subset.trades ?? [];
          if (!trades.includes('__all__')) {
            allowedTrades = new Set(trades);
          }
        }
      }
    }

    for (const def of tradeDefs) {
      if (allowedTrades !== null && !allowedTrades.has(def.trade)) continue;
      const costRow = laborCostMap[def.trade];
      const baseRate = costRow?.base_rate != null ? Number(costRow.base_rate) : null;
      const unit = costRow?.unit ?? 'lump';
      const multiplier = resolveMultiplier(room.floor, costRow?.multipliers ?? {});
      const wastePct = getWastePct(def.trade);

      // Check if this trade has a labor scope-detail override (e.g. shower area instead
      // of full room walls). Only applies when scope_details has a non-zero value.
      const laborOverrideKey = LABOR_SCOPE_DETAIL_OVERRIDE[def.trade];
      const laborOverrideVal = laborOverrideKey ? Number(resolvedDets[laborOverrideKey] ?? 0) : 0;
      const effectiveAreaSf   = (laborOverrideKey === 'floor_tile_sf' && laborOverrideVal > 0)
        ? laborOverrideVal : room.areaSf;
      const effectiveWallSf   = (laborOverrideKey === 'shower_wall_sf' && laborOverrideVal > 0)
        ? laborOverrideVal : room.wallAreaSf;

      // Labor quantity never applies waste — waste_pct is materials-only.
      const { quantity, quantityPreFilled, quantityNotes } = buildQuantity({
        trade: def.trade, unit,
        areaSf: effectiveAreaSf,
        wallAreaSf: effectiveWallSf,
        perimeterLf: room.perimeterLf,
        wastePct: 0,
      });

      const lineCost = (baseRate != null && quantity != null)
        ? Math.round(baseRate * quantity * multiplier * 100) / 100
        : null;

      lines.push({
        roomId: room.roomId,
        trade: def.trade,
        category: 'labor',
        templateNotes: def.summary,
        optional: def.optional,
        conditional: def.conditional,
        unit,
        unitCostId: costRow?.id ?? null,
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

      // Material lines from template formula — pass resolvedDets for scope_detail basis
      if (def.materialsFormula?.length) {
        const metrics = roomMetrics(room);
        for (const formula of def.materialsFormula) {
          const matKey  = `${def.trade}::${formula.material_name}`;
          const matRow  = materialRateMap[matKey];
          const matRate = matRow?.base_rate != null ? Number(matRow.base_rate) : null;
          const matUnit = matRow?.unit ?? 'each';

          let matQty = null;
          let matQtyNotes = '';

          if (matRow || formula.qty_basis === 'scope_detail') {
            const raw = evaluateFormula(formula, metrics, matRow ?? {}, resolvedDets);
            if (raw === 0 && formula.qty_basis === 'scope_detail') {
              // skip zero-qty scope_detail lines (e.g. niche=false → niche kit qty 0)
              continue;
            }
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

          lines.push({
            roomId:    room.roomId,
            trade:     def.trade,
            category:  'materials',
            materialName: formula.material_name,
            templateNotes: def.summary,
            optional:  def.optional,
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
      }
    }

    // Fixture-select lines from scope detail schema.
    // These are NOT in any materials_formula — they're driven purely by the rep's
    // fixture choices (shower door, vanity, toilet). Emitted once per room after
    // the normal trade loop.
    if (schemaEntry?.schema?.fields) {
      for (const field of schemaEntry.schema.fields) {
        if (field.type !== 'fixture_select') continue;
        const selectedValue = resolvedDets[field.key];
        if (!selectedValue || selectedValue === 'custom') continue;

        let materialName = null;
        if (field.options_template) {
          // e.g. "Vanity top - {material} {vanity_width}in"
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

        if (!materialName) continue; // "keep" or null = no line item

        const matKey = `${field.trade}::${materialName}`;
        const matRow = materialRateMap[matKey];
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

      // sink_count is a number field — emits a qty>1 line for Vanity sink standard
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

    // Track resolved details for debug
    if (scopeRow) {
      scopeDetailsResolved.push({ roomId: room.roomId, scopeTag: scopeRow.scope_tag, resolved: resolvedDets });
    }
  }

  // 7. Summary
  const laborLinesList    = lines.filter(l => l.category === 'labor');
  const materialLinesList = lines.filter(l => l.category === 'materials');
  const linesNeedingRate     = lines.filter(l => l.baseRateMissing).length;
  const linesNeedingQuantity = lines.filter(l => !l.quantityPreFilled).length;
  const linesReady           = lines.filter(l => l.lineCostStatus === 'ok').length;
  const laborSubtotal    = Math.round(laborLinesList.reduce((s, l) => s + (l.lineCost ?? 0), 0) * 100) / 100;
  const materialSubtotal = Math.round(materialLinesList.reduce((s, l) => s + (l.lineCost ?? 0), 0) * 100) / 100;
  const subtotal         = Math.round((laborSubtotal + materialSubtotal) * 100) / 100;
  const roomsMissingScope = activeRooms.filter(r => r.scope_missing).length;

  const draft = {
    jobId,
    roomType,
    rooms: activeRooms,
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

  return draft;
}

/**
 * Accept a takeoff draft. Writes labor + material lines to estimate_line_items.
 * Saves any rate edits the rep made back to takeoff_unit_costs as tenant overrides.
 * Resolves estimate-related todos tied to this job.
 *
 * @param {{ draft, edits, tenantId, userId }} args
 *   edits — map keyed by lineKey (`${roomId}__${trade}__${materialName||''}`)
 *            each value is { quantity?, baseRate? } with the rep's overrides
 * @returns {{ jobEstimateId, lineItemCount, overrideCount, errors[] }}
 */
export async function acceptTakeoffDraft({ draft, edits, tenantId, userId }) {
  const errors = [];

  // 1. Upsert a job_estimates row so we have an estimate_id for line items
  //    and a source_id to resolve estimate_no_proposal_24h todos.
  //    sbSaveEstimate upserts on job_id — safe to call even if row exists.
  const jobEstimateRow = await sbSaveEstimate(draft.jobId, []);
  const jobEstimateId  = jobEstimateRow?.id ?? null;

  // 2. Resolve final qty + rate per line, detect rep edits
  const lineKey = (line) =>
    `${line.roomId}__${line.trade}__${line.materialName || ''}`;

  const resolvedLines = draft.lines.map(line => {
    const k = lineKey(line);
    const e = edits[k] || {};
    const qty  = e.quantity  !== undefined ? e.quantity  : line.quantity;
    const rate = e.baseRate  !== undefined ? e.baseRate  : line.baseRate;
    const rateEdited = e.baseRate !== undefined && e.baseRate !== line.baseRate;
    return { ...line, resolvedQty: qty, resolvedRate: rate, rateEdited };
  });

  // 3. Save rate overrides — deduplicated by (roomType, trade, materialName, category)
  //    so editing the same material across multiple rooms writes a single override row.
  const overridesSeen = new Set();
  let overrideCount = 0;

  for (const line of resolvedLines) {
    if (!line.rateEdited || line.resolvedRate == null || line.resolvedRate <= 0) continue;
    const dedupeKey = `${line.trade}::${line.materialName || ''}::${line.category}`;
    if (overridesSeen.has(dedupeKey)) continue;
    overridesSeen.add(dedupeKey);

    const { error } = await sbSaveTenantUnitCostOverride({
      tenantId,
      roomType:       draft.roomType,
      trade:          line.trade,
      materialName:   line.materialName ?? null,
      category:       line.category,
      unit:           line.unit,
      baseRate:       line.resolvedRate,
      sourceUnitCostId: line.unitCostId,
    });
    if (error) {
      errors.push({ type: 'override_save', trade: line.trade, material: line.materialName, error: error.message ?? error });
    } else {
      overrideCount++;
    }
  }

  // 4. Delete existing takeoff-sourced line items for this job (notes prefix isolates
  //    them from AI estimator / consultation rows — those are untouched).
  await sb.from('estimate_line_items')
    .delete()
    .eq('job_id', draft.jobId)
    .like('notes', 'takeoff:%');

  // 5. Build row payloads
  const rows = resolvedLines.map((line, i) => {
    const qty      = line.resolvedQty  ?? 1;
    const rate     = line.resolvedRate ?? 0;
    const noRate   = line.resolvedRate == null;
    const noteBase = line.category === 'materials'
      ? `takeoff:${draft.roomType}:${line.roomId}:${line.trade}`
      : `takeoff:${draft.roomType}:${line.roomId}`;
    const notes    = noRate ? `${noteBase} PENDING RATE` : noteBase;

    return {
      tenant_id:    tenantId,
      job_id:       draft.jobId,
      estimate_id:  jobEstimateId,
      phase:        line.trade,
      category:     line.category,
      trade:        line.trade,
      description:  line.category === 'materials'
        ? (line.materialName ?? line.trade)
        : (line.templateNotes ?? line.trade),
      quantity:     qty,
      unit:         line.unit ?? null,
      unit_cost:    rate,
      markup_pct:   0,
      display_order: i,
      notes,
      created_by:   userId,
    };
  });

  // 6. Insert all rows
  const { error: insertError } = await sb.from('estimate_line_items').insert(rows);
  if (insertError) {
    errors.push({ type: 'insert', error: insertError.message ?? insertError });
    return { jobEstimateId, lineItemCount: 0, overrideCount, errors };
  }

  // 7. Resolve estimate-related todos. Two passes:
  //    a) by job_estimates ID → catches estimate_no_proposal_24h
  //    b) by jobs ID         → catches any job-level estimate todos from older rule shapes
  if (jobEstimateId) {
    await sbResolveTodosBySource('job_estimates', jobEstimateId);
  }
  await sbResolveTodosBySource('jobs', draft.jobId);

  return { jobEstimateId, lineItemCount: rows.length, overrideCount, errors };
}

function emptyDraft(jobId, roomType) {
  return {
    jobId, roomType, rooms: [], lines: [],
    summary: {
      totalRooms: 0, totalLines: 0,
      laborLines: 0, materialLines: 0,
      linesNeedingRate: 0, linesNeedingQuantity: 0, linesReady: 0,
      laborSubtotal: 0, materialSubtotal: 0,
      subtotal: 0, subtotalIncomplete: false,
    },
  };
}
