import { sb } from './supabase';
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

function evaluateFormula(formula, metrics, materialRow) {
  if (formula.qty_basis === 'fixed') {
    return Number(formula.fixed_qty || 0);
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

  const rooms = matchedRooms;

  if (!rooms.length) {
    return emptyDraft(jobId, roomType);
  }

  // 3. Templates for this room_type (platform defaults + tenant overrides)
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
      if (!prev || (row.tenant_id !== null && prev.tenant_id === null)) {
        materialRateMap[key] = row;
      }
    } else {
      const prev = laborCostMap[row.trade];
      if (!prev || (row.tenant_id !== null && prev.tenant_id === null)) {
        laborCostMap[row.trade] = row;
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

  // 6. Build lines: one per (room × trade)
  const lines = [];
  for (const room of rooms) {
    for (const def of tradeDefs) {
      const costRow = laborCostMap[def.trade];
      const baseRate = costRow?.base_rate != null ? Number(costRow.base_rate) : null;
      const unit = costRow?.unit ?? 'lump';
      const multiplier = resolveMultiplier(room.floor, costRow?.multipliers ?? {});
      const wastePct = getWastePct(def.trade);

      const { quantity, quantityPreFilled, quantityNotes } = buildQuantity({
        trade: def.trade, unit,
        areaSf: room.areaSf,
        wallAreaSf: room.wallAreaSf,
        perimeterLf: room.perimeterLf,
        wastePct,
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

      // Material lines from template formula
      if (def.materialsFormula?.length) {
        const metrics = roomMetrics(room);
        for (const formula of def.materialsFormula) {
          const matKey  = `${def.trade}::${formula.material_name}`;
          const matRow  = materialRateMap[matKey];
          const matRate = matRow?.base_rate != null ? Number(matRow.base_rate) : null;
          const matUnit = matRow?.unit ?? 'each';

          let matQty = null;
          let matQtyNotes = '';

          if (matRow) {
            const raw = evaluateFormula(formula, metrics, matRow);
            matQty = Math.round(raw * 100) / 100;
            const divisorLabel = formula.qty_divisor === 'coverage_sf' ? ' ÷ coverage' : '';
            const wasteLabel   = Number(matRow.waste_pct || 0) > 0
              ? ` + ${matRow.waste_pct}% waste` : '';
            matQtyNotes = formula.qty_basis === 'fixed'
              ? `fixed: ${formula.fixed_qty}`
              : `${formula.qty_basis} × ${formula.qty_multiplier}${divisorLabel}${wasteLabel}`;
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

  const draft = {
    jobId,
    roomType,
    rooms,
    lines,
    summary: {
      totalRooms:    rooms.length,
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
    },
  };

  console.log(`[TAKEOFF DRAFT V2 — ${roomType}]`, {
    rooms:           draft.summary.totalRooms,
    laborLines:      draft.summary.laborLines,
    materialLines:   draft.summary.materialLines,
    laborSubtotal:   draft.summary.laborSubtotal,
    materialSubtotal: draft.summary.materialSubtotal,
    sample_material_line: draft.lines.find(l => l.category === 'materials') || null,
  });

  return draft;
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
