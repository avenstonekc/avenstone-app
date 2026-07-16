import { sb, AV_TENANT, sbSaveEstimate, sbSaveTenantUnitCostOverride, sbResolveTodosBySource, sbLoadJobRoomScopes, sbLoadScopeSubsets } from './supabase';
import { sbCommitEstimate } from './commitEstimate';
import { floorLabel } from './captureTypes';
import { computePricingLines } from './pricingCore';

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

  // 4. Templates, unit costs, and taxonomy in parallel (pre-filter by room_type / active).
  const catalogFilter = tenantId
    ? `tenant_id.is.null,tenant_id.eq.${tenantId}`
    : 'tenant_id.is.null';

  const [{ data: templates }, { data: costRows }, { data: taxonomy }] = await Promise.all([
    sb.from('takeoff_templates')
      .select('trade, scope_definition')
      .eq('room_type', roomType).eq('active', true).or(catalogFilter),
    sb.from('takeoff_unit_costs')
      .select('*')
      .eq('room_type', roomType).eq('active', true).or(catalogFilter),
    sb.from('trade_taxonomy')
      .select('parent_trade, sub_trade, default_waste_pct'),
  ]);

  // 5. Convert annotated rooms → pricingCore input shape (camelCase geometry contract).
  //    scopeRow.room_type is preserved per-room so cross-type schema keys resolve correctly.
  const pricingRooms = activeRooms.map(room => {
    const scopeRow = scopeByRoomId[room.roomId];
    return {
      roomId:       room.roomId,
      roomLabel:    room.roomLabel,
      floor:        room.floor,
      roomType:     scopeRow?.room_type ?? roomType,
      isSynthetic:  !!room._synthetic,
      scopeTag:     room.scope_tag     ?? null,
      scopeLabel:   room.scope_label   ?? null,
      scopeMissing: room.scope_missing ?? false,
      scopeDetails: room.scope_details ?? {},
      customTrades: scopeRow?.custom_trades ?? [],
      geometry: {
        floorSf:     room.areaSf,
        wallSf:      room.wallAreaSf,
        perimeterLf: room.perimeterLf,
        ceilingFt:   room.height,
        doors:       room.doors,
        windows:     room.windows,
        source:      null,
      },
    };
  });

  // 6. Delegate all line/quantity/rate/waste computation to the pure pricingCore module.
  const { lines, summary } = computePricingLines({
    rooms:       pricingRooms,
    templates:   templates   ?? [],
    unitCosts:   costRows    ?? [],
    scopeSubsets: scopeSubsets ?? [],
    schemas:     schemaRows  ?? [],
    wasteRows:   taxonomy    ?? [],
  });

  return { jobId, roomType, rooms: activeRooms, lines, summary };
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
