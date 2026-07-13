import { sb, AV_TENANT, sbSaveEstimate, sbSaveTenantUnitCostOverride, sbResolveTodosBySource, sbLoadJobRoomScopes, sbLoadScopeSubsets } from './supabase';
import { sbCommitEstimate } from './commitEstimate';
import { floorLabel } from './captureTypes';
import { runCompute } from './computeFns';

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


/**
 * Derive perimeterLf and wallAreaSf from normalized_geometry walls[].
 * Drop-in complement to computePerimeter for the normalized path.
 * Pure: no DB, no side effects.
 */
export function computeMetricsFromNormalized(normRoom, walls) {
  if (!walls || walls.length === 0) return { perimeterLf: 0, wallAreaSf: 0 };
  const roomWalls = walls.filter(w => w.room_id === normRoom.id);
  if (roomWalls.length === 0) return { perimeterLf: 0, wallAreaSf: 0 };
  const rawPerimeter = roomWalls.reduce((sum, w) => {
    const dx = w.p2[0] - w.p1[0];
    const dz = w.p2[1] - w.p1[1];
    return sum + Math.sqrt(dx * dx + dz * dz);
  }, 0);
  const perimeterLf = Math.round(rawPerimeter * 100) / 100;
  const height = normRoom.height ?? 8;
  const wallAreaSf = Math.round(perimeterLf * height * 100) / 100;
  return { perimeterLf, wallAreaSf };
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
    case 'bedroom':
      return label.includes('bedroom'); // TAKEOFF_BRIDGE Phase 4 — paint verification vehicle
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
// Three-pass resolver: defaults → computed fields → subtract.
// 'computed' field type runs a named COMPUTE_FNS function (from computeFns.js).
// Override wins when the field's override_key is set in scope_details.

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

// ── TAKEOFF_BRIDGE Phase 4 — synthetic rooms from the answer store ──────────────
// When no scan covers a room, build a synthetic room from job_rooms + job_scope_answers so takeoff
// runs interview-only. Dimensions from answers: floor_sf→areaSf, wall_height_in→height; perimeter
// is a stated SQUARE-ROOM APPROXIMATION (4×√floorSf) marked approximate (never silent); wall SF =
// perimeter × height. Answers map into the scope_detail schema keys (audit's (2)⇄(3) table) so the
// existing computed shower SF + fixture lines run. Per-room: a room already covered by a scan is
// skipped (scan metrics win). Materials-only is enforced at commit (acceptTakeoffDraft).
function labelMatchesType(label, roomType) {
  const l = (label || '').toLowerCase();
  switch (roomType) {
    case 'bathroom': return l.includes('bath');
    case 'kitchen':  return l.includes('kitchen');
    case 'bedroom':  return l.includes('bedroom');
    case 'basement': return l.includes('basement');
    case 'refresh':  return true;
    default:         return false;
  }
}

async function loadSyntheticRooms(jobId, roomType, coveredScanRoomIds) {
  const [jrRes, ansRes] = await Promise.all([
    sb.from('job_rooms').select('id, label, scan_room_id').eq('job_id', jobId),
    sb.from('job_scope_answers').select('room_id, field_key, value, option_key').eq('job_id', jobId),
  ]);
  const jobRooms = jrRes.data || [];
  const ansByRoom = {};
  for (const a of (ansRes.data || [])) {
    const v = a.value != null ? a.value : a.option_key;
    (ansByRoom[a.room_id] ||= {})[a.field_key] = v;
  }
  const out = [];
  for (const jr of jobRooms) {
    if (!labelMatchesType(jr.label, roomType)) continue;
    if (jr.scan_room_id && coveredScanRoomIds.has(jr.scan_room_id)) continue; // scan wins for this room
    const ans = ansByRoom[jr.id] || {};
    const floorSf = Number(ans.floor_sf) || 0;
    const heightFt = (Number(ans.wall_height_in) || 96) / 12;
    const perimeterLf = floorSf > 0 ? Math.round(4 * Math.sqrt(floorSf) * 100) / 100 : 0; // square-room approx
    const wallAreaSf = Math.round(perimeterLf * heightFt * 100) / 100;
    // Map answers → scope_detail schema keys (the (2)⇄(3) table). The schema's computed/subtract
    // passes then derive shower_wall_sf/shower_floor_sf and net floor_tile_sf.
    const sd = {};
    if (floorSf > 0) sd.floor_tile_sf = floorSf; // schema subtract nets out shower_floor_sf
    if (ans.shower_width_in)       sd.shower_width_in = Number(ans.shower_width_in);
    if (ans.shower_length_in)      sd.shower_length_in = Number(ans.shower_length_in);
    if (ans.shower_wall_height_in) sd.shower_wall_height_in = Number(ans.shower_wall_height_in);
    // 4d — tile_height (categorical) → shower wall-tile height inches, FALLBACK when the precise
    // shower_wall_height_in dimension wasn't captured. Templates consume shower_wall_height_in →
    // shower_wall_sf. ceiling→full ceiling height; standard≈84 (standard shower tile); wainscot≈48
    // (half-wall). (The dispatch's ~48"/~42" are room-wainscot heights; takeoff consumes the SHOWER
    // wall, so realistic shower heights are used — stated in the report.)
    if (!sd.shower_wall_height_in && ans.tile_height) {
      sd.shower_wall_height_in = ans.tile_height === 'ceiling' ? (Number(ans.wall_height_in) || 96)
        : ans.tile_height === 'wainscot' ? 48 : 84;
    }
    if (ans.tub_shower_config)     sd.shower_type = ans.tub_shower_config === 'tub_only' ? 'tub_only' : 'shower_only';
    if (ans.vanity_size_in && ans.vanity_size_in !== 'custom') sd.vanity_width = Number(ans.vanity_size_in);
    if (ans.countertop)            sd.vanity_top = ans.countertop;
    if (ans.vanity_config)         sd.sink_count = ans.vanity_config === 'double' ? 2 : (ans.vanity_config === 'none' ? 0 : 1);
    if (ans.toilet)                sd.toilet_type = ans.toilet;
    if (ans.shower_glass)          sd.shower_door_type = ans.shower_glass;
    out.push({
      roomId: `answer_${jr.id}`, roomLabel: jr.label, floor: 0, floorLabel: floorLabel(0),
      captureMode: null, areaSf: floorSf, wallAreaSf, perimeterLf, height: heightFt, doors: 0, windows: 0,
      _synthetic: true, _approx: perimeterLf > 0, _scopeDetails: sd,
      // Bathroom synthetic rooms use the full_remodel schema/subset so the computed shower SF +
      // fixture lines run. Other types: unscoped (all trades) — materials-only filters at commit.
      _scopeTag: roomType === 'bathroom' ? 'full_remodel' : null,
    });
  }
  return out;
}

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
    .select('id, rooms, height_meters, capture_mode, normalized_geometry')
    .eq('job_id', jobId)
    .order('created_at', { ascending: false })
    .limit(5);

  const allRooms = [];
  for (const scan of (scans || [])) {
    const scanCeilingFt = scan.height_meters ? scan.height_meters * 3.28084 : null;
    // normalized_geometry is { rooms, walls, ... } stored as .data (without ok wrapper).
    // Rooms are in the same order as scan.rooms — match by index, not by id.
    const normGeom = scan.normalized_geometry ?? null;
    (scan.rooms || []).forEach((room, idx) => {
      const normRoom = normGeom?.rooms?.[idx] ?? null;
      let areaSf, perimeterLf, ceilingFt, wallAreaSf;
      if (normRoom?.area_sqft != null) {
        // Normalized path: use Shoelace area + wall metrics from classified walls.
        areaSf    = normRoom.area_sqft;
        ceilingFt = normRoom.height ?? scanCeilingFt ?? 8;
        ({ perimeterLf, wallAreaSf } = computeMetricsFromNormalized(normRoom, normGeom.walls));
      } else {
        // Raw fallback: legacy scans or scans where normalization hasn't run yet.
        ceilingFt = room.height ?? scanCeilingFt ?? 8;
        const rawPerimeter = computePerimeter(room);
        areaSf    = room.sqft ?? 0;
        perimeterLf = Math.round(rawPerimeter * 100) / 100;
        wallAreaSf  = Math.round(rawPerimeter * ceilingFt * 100) / 100;
      }
      allRooms.push({
        roomId: `${scan.id}_${idx}`,
        roomLabel: room.name || `Room ${idx + 1}`,
        // Scan data has no floor field — default 0 (first floor). Wizard UI (Prompt B) lets rep override.
        floor: 0,
        floorLabel: floorLabel(0),
        captureMode: scan.capture_mode ?? null,
        areaSf,
        wallAreaSf,
        perimeterLf,
        height:  ceilingFt,
        doors:   room.doors   ?? 0,
        windows: room.windows ?? 0,
      });
    });
  }

  const matchedScanRooms = roomIds
    ? allRooms.filter(r => roomIds.includes(r.roomId))
    : allRooms.filter(r => roomMatchesType(r, roomType));

  // TAKEOFF_BRIDGE Phase 4 — scan-optional: add synthetic rooms from the answer store for matching
  // rooms not already covered by a scan (per-room; scan metrics win where a scan exists).
  const coveredScanRoomIds = new Set(matchedScanRooms.map(r => r.roomId));
  const syntheticRooms = await loadSyntheticRooms(jobId, roomType, coveredScanRoomIds);
  const matchedRooms = [...matchedScanRooms, ...syntheticRooms];

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

  // Annotate each matched room with its saved scope metadata (synthetic rooms carry their own,
  // answer-derived — no job_room_scopes row).
  const rooms = matchedRooms.map(room => {
    if (room._synthetic) {
      const subset = room._scopeTag ? subsetByTag[room._scopeTag] : null;
      return {
        ...room,
        scope_tag:     room._scopeTag ?? null,
        scope_label:   subset?.label ?? 'From interview answers',
        scope_missing: false,
        scope_details: room._scopeDetails ?? {},
      };
    }
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
    laborFormula: t.scope_definition?.labor_formula ?? null,
    laborExtras: t.scope_definition?.labor_extras ?? null,
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

  // Split into labor, labor-extras, and material maps. Both loaded from the same fetch.
  // Tenant row beats platform default (same de-dup logic, per key).
  // Labor extras: labor rows with material_name set — keyed by trade::material_name.
  const laborCostMap = {};
  const laborExtrasCostMap = {};
  const materialRateMap = {};

  for (const row of (costRows || [])) {
    if (row.category === 'materials') {
      const key = `${row.trade}::${row.material_name}`;
      const prev = materialRateMap[key];
      if (!prev) {
        materialRateMap[key] = row;
      } else if (row.tenant_id !== null && prev.tenant_id === null) {
        materialRateMap[key] = { ...prev, base_rate: row.base_rate, tenant_id: row.tenant_id, id: row.id };
      }
    } else if (row.material_name) {
      // Labor row with material_name = boolean-gated extra (e.g. Niche install, Bench framing)
      const key = `${row.trade}::${row.material_name}`;
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
    const scopeRow = scopeByRoomId[room.roomId]; // undefined for synthetic (answer-derived) rooms

    // Resolve scope_details with schema defaults + subtract. Use the room's ANNOTATED scope_tag /
    // scope_details so synthetic rooms (which carry their own, answer-derived) flow the same as scan
    // rooms. Synthetic bathroom rooms use the roomType + full_remodel schema.
    const stRoomType   = scopeRow?.room_type ?? roomType;
    const schemaKey    = room.scope_tag ? `${stRoomType}::${room.scope_tag}` : null;
    const schemaEntry  = schemaKey ? schemaByKey[schemaKey] : null;
    const resolvedDets = resolveDetails(schemaEntry?.schema ?? null, room.scope_details ?? {}, room);

    if (room.scope_tag) {
      if (room.scope_tag === 'custom') {
        allowedTrades = new Set(scopeRow?.custom_trades ?? []);
      } else {
        const subset = subsetByTag[room.scope_tag];
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

      // Resolve labor quantity: schema labor_formula wins, falls back to buildQuantity.
      // labor_formula qty_basis 'scope_detail' → use resolved scope_details value directly.
      // labor_formula qty_basis 'metric'       → use named room metric directly.
      // No formula → quantitySource regex mapping in buildQuantity.
      // Labor never applies waste — waste_pct is materials-only.
      let quantity, quantityPreFilled, quantityNotes;

      if (def.laborFormula) {
        const lf = def.laborFormula;
        if (lf.qty_basis === 'scope_detail') {
          const val = Number(resolvedDets[lf.scope_detail_key] ?? 0);
          if (val > 0) {
            quantity          = Math.round(val * 100) / 100;
            quantityPreFilled = true;
            quantityNotes     = `scope: ${lf.scope_detail_key} = ${val.toFixed(1)}`;
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

      // Fall back to buildQuantity (quantitySource regex) when labor_formula didn't resolve
      if (quantity === undefined) {
        ({ quantity, quantityPreFilled, quantityNotes } = buildQuantity({
          trade: def.trade, unit,
          areaSf: room.areaSf,
          wallAreaSf: room.wallAreaSf,
          perimeterLf: room.perimeterLf,
          wastePct: 0,
        }));
      }

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

      // Labor extras — boolean-gated fixed-qty lines (e.g. niche install, bench framing)
      if (def.laborExtras?.length) {
        for (const extra of def.laborExtras) {
          const gateVal = resolvedDets[extra.scope_detail_key];
          if (!gateVal) continue; // falsy = skip
          const extraKey = `${def.trade}::${extra.material_name}`;
          const extraRow = laborExtrasCostMap[extraKey];
          const extraRate = extraRow?.base_rate != null ? Number(extraRow.base_rate) : null;
          const extraUnit = extraRow?.unit ?? 'each';
          const extraQty = Number(extra.fixed_qty) || 1;
          const extraCost = extraRate != null
            ? Math.round(extraRate * extraQty * 100) / 100
            : null;
          lines.push({
            roomId: room.roomId,
            trade: def.trade,
            category: 'labor',
            materialName: extra.material_name,
            description: extra.material_name,
            templateNotes: extra.material_name,
            optional: false,
            conditional: null,
            unit: extraUnit,
            unitCostId: extraRow?.id ?? null,
            unitCostSource: extraRow
              ? (extraRow.tenant_id !== null ? 'tenant_override' : 'platform_default')
              : null,
            baseRate: extraRate,
            baseRateMissing: extraRate == null,
            multiplier: 1,
            wastePct: 0,
            quantity: extraQty,
            quantityPreFilled: true,
            quantityNotes: `scope: ${extra.scope_detail_key}`,
            lineCost: extraCost,
            lineCostStatus: resolveLineCostStatus(extraRate, extraQty),
          });
        }
      }

      // Material lines from template formula — pass resolvedDets for scope_detail basis
      if (def.materialsFormula?.length) {
        const metrics = roomMetrics(room);
        const pendingMatLines = [];

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

          pendingMatLines.push({
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

        // Merge lines with the same material_name within this trade+room.
        // e.g. "Floor tile field" appears twice (bathroom floor + shower floor) — sum qty.
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

  // TAKEOFF_BRIDGE Phase 4c — OWNERSHIP: synthetic (answer-path) rooms contribute MATERIALS only;
  // the estimator owns labor. Drop synthetic-room labor lines so takeoff builds the materials list
  // and never re-prices labor the estimator already priced. Scan rooms keep full labor+materials.
  for (let i = lines.length - 1; i >= 0; i--) {
    if (String(lines[i].roomId).startsWith('answer_') && lines[i].category === 'labor') lines.splice(i, 1);
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
 * @param {{ draft, edits, excluded, customLines, tenantId, userId }} args
 *   edits — map keyed by lineKey (`${roomId}__${trade}__${materialName||''}`)
 *            each value is { quantity?, baseRate? } with the rep's overrides
 *   customLines — array of one-off lines added by the rep (not in templates)
 * @returns {{ jobEstimateId, lineItemCount, overrideCount, errors[] }}
 */
export async function acceptTakeoffDraft({ draft, edits, excluded, customLines, tenantId, userId }) {
  const errors = [];

  // 1. Upsert a job_estimates row so we have an estimate_id for line items
  //    and a source_id to resolve estimate_no_proposal_24h todos.
  const jobEstimateRow = await sbSaveEstimate(draft.jobId, []);
  const jobEstimateId  = jobEstimateRow?.id ?? null;

  // 2. Resolve final qty + rate per line, detect rep edits, mark excluded.
  //    Custom lines use their stable lineKey field; formula lines derive it.
  const resolveKey = (line) =>
    line.lineKey ?? `${line.roomId}__${line.trade}__${line.materialName || ''}`;
  const excludedSet = excluded instanceof Set ? excluded : new Set(excluded ?? []);

  const resolveOneLine = (line) => {
    const k = resolveKey(line);
    const e = edits[k] || {};
    const qty  = e.quantity !== undefined ? e.quantity : line.quantity;
    const rate = e.baseRate !== undefined ? e.baseRate : line.baseRate;
    const rateEdited = e.baseRate !== undefined && e.baseRate !== line.baseRate;
    return { ...line, resolvedQty: qty, resolvedRate: rate, rateEdited, isExcluded: excludedSet.has(k) };
  };

  const resolvedFormula = draft.lines.map(resolveOneLine);
  const resolvedCustom  = (customLines ?? []).map(resolveOneLine);
  const resolvedLines   = [...resolvedFormula, ...resolvedCustom];

  // 3. Save rate overrides for formula lines only (custom lines aren't in the catalog).
  const overridesSeen = new Set();
  let overrideCount = 0;

  for (const line of resolvedFormula) {
    if (line.isExcluded) continue;
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

  // 4. Build NormalizedEstimateInput items and commit through sbCommitEstimate.
  //    sbCommitEstimate handles the scoped delete (notes LIKE 'takeoff:%') internally
  //    for source='takeoff' — do NOT also delete here; delete fires exactly once.
  const commitItems = resolvedLines.filter(l => !l.isExcluded).map((line) => {
    const qty    = line.resolvedQty  ?? 1;
    const rate   = line.resolvedRate ?? 0;
    const noRate = line.resolvedRate == null;

    let noteBase;
    if (line.isCustom) {
      noteBase = `takeoff:custom:${draft.roomType}:${line.roomId}`;
      if (line.notes) noteBase = `${noteBase} — ${line.notes.replace(/^custom:\s*/i, '')}`;
    } else {
      noteBase = line.category === 'materials'
        ? `takeoff:${draft.roomType}:${line.roomId}:${line.trade}`
        : `takeoff:${draft.roomType}:${line.roomId}`;
    }

    return {
      source:      'takeoff',
      trade:       line.trade,
      category:    line.category,
      description: line.isCustom
        ? (line.description ?? line.templateNotes ?? line.trade)
        : (line.category === 'materials'
          ? (line.materialName ?? line.trade)
          : (line.templateNotes ?? line.trade)),
      quantity:    qty,
      unit:        line.unit ?? null,
      unit_cost:   rate,
      multiplier:  line.multiplier ?? 1,
      markup_pct:  0,
      notes:       noRate ? `${noteBase} PENDING RATE` : noteBase,
      waste_pct:   null,
    };
  });

  const commitResult = await sbCommitEstimate(sb, tenantId, userId, {
    source:     'takeoff',
    jobId:      draft.jobId,
    estimateId: jobEstimateId,
    items:      commitItems,
  });

  if (!commitResult.ok) {
    errors.push({ type: 'insert', error: commitResult.error });
    return { jobEstimateId, lineItemCount: 0, overrideCount, errors };
  }

  // 5. Resolve estimate-related todos. Two passes:
  //    a) by job_estimates ID → catches estimate_no_proposal_24h
  //    b) by jobs ID         → catches any job-level estimate todos from older rule shapes
  if (jobEstimateId) {
    await sbResolveTodosBySource('job_estimates', jobEstimateId);
  }
  await sbResolveTodosBySource('jobs', draft.jobId);

  return { jobEstimateId, lineItemCount: commitResult.data?.inserted_count ?? 0, overrideCount, errors };
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
