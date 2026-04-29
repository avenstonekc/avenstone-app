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
    .select('id, rooms, height_meters')
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
        areaSf,
        wallAreaSf: Math.round(perimeterLf * ceilingFt * 100) / 100,
        perimeterLf: Math.round(perimeterLf * 100) / 100,
      });
    });
  }

  const rooms = roomIds
    ? allRooms.filter(r => roomIds.includes(r.roomId))
    : allRooms;

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

  const costMap = {};
  for (const row of (costRows || [])) {
    const prev = costMap[row.trade];
    if (!prev || (row.tenant_id !== null && prev.tenant_id === null)) {
      costMap[row.trade] = row;
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
      const costRow = costMap[def.trade];
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
    }
  }

  // 7. Summary
  const linesNeedingRate     = lines.filter(l => l.baseRateMissing).length;
  const linesNeedingQuantity = lines.filter(l => !l.quantityPreFilled).length;
  const linesReady           = lines.filter(l => l.lineCostStatus === 'ok').length;
  const subtotal = Math.round(lines.reduce((s, l) => s + (l.lineCost ?? 0), 0) * 100) / 100;

  return {
    jobId,
    roomType,
    rooms,
    lines,
    summary: {
      totalRooms: rooms.length,
      totalLines: lines.length,
      linesNeedingRate,
      linesNeedingQuantity,
      linesReady,
      subtotal,
      subtotalIncomplete: lines.some(l => l.lineCost == null),
    },
  };
}

function emptyDraft(jobId, roomType) {
  return {
    jobId, roomType, rooms: [], lines: [],
    summary: {
      totalRooms: 0, totalLines: 0, linesNeedingRate: 0,
      linesNeedingQuantity: 0, linesReady: 0,
      subtotal: 0, subtotalIncomplete: false,
    },
  };
}
