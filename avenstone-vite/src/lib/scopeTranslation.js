// scopeTranslation.js — pure ESM scope vocabulary bridge.
// NO imports of supabase, browser APIs, or Deno-specific modules.
// Zero dependencies — no imports at all.
//
// Bridges the configurator vocab (job_scope_answers / scope_checklists, 35 bathroom
// fields) to the takeoff engine vocab (scope_details / scope_detail_schemas). These are
// disjoint key/type systems (2026-07-16 seam audit §3).
//
// Exports:
//   deriveScopeTag(answers)                    → scope_tag string (bathroom v1)
//   translateAnswers(answers)                  → { scopeDetails, untranslated, flags }
//   resolveGeometry({ scanGeometry, answers }) → geometry record

// ── deriveScopeTag ────────────────────────────────────────────────────────────
//
// Maps a configurator answer set to one of the four bathroom scope_tag values.
// Rule table (derived from template_scope_subsets.trades, live DB 2026-07-16):
//
//   full_remodel  → trades: __all__  (all 15 templates incl. Countertops post-P2)
//   tile_only     → trades: Demo, Tile-Floor, Tile-Wall/shower, Plumbing-Finish, Cleanup
//   vanity_swap   → trades: Plumbing-Finish, Cabinets/vanities-Install, Cleanup
//   paint_and_floor → trades: Demo, Paint-Interior, Flooring-LVP, Trim-Base/case, Cleanup
//
// Discrimination logic:
//   1. Structural signals (layout_change or drywall replacement) → always full_remodel
//   2. Two or more distinct work categories → full_remodel
//      Work categories: wet-area (shower/tub), fixed-surface (vanity/counter), floor
//   3. Wet area only (no vanity, counter, or LVP floor) → tile_only
//      Note: tile floor (porcelain/stone) can accompany a shower under tile_only since
//      Tile-Floor is in that subset. LVP floor is NOT in tile_only → triggers full_remodel.
//   4. Fixed surface only (vanity/counter, no wet area, no tile floor) → vanity_swap
//   5. Floor only (tile or LVP, no wet area, no vanity) → paint_and_floor
//   6. Default: full_remodel (broadest tag — missing-info bias; losing a trade silently
//      is worse than emitting extra pending lines).
//
// "Ambiguous → BROADER tag" is the governing rule. When in doubt, full_remodel.

export function deriveScopeTag(answers) {
  if (!answers || typeof answers !== 'object') return 'full_remodel';

  const hasShower   = !!(answers.tub_shower_config ||
                         Number(answers.shower_width_in) > 0 ||
                         Number(answers.shower_length_in) > 0);
  const hasVanity   = !!(answers.vanity_config && answers.vanity_config !== 'none');
  const hasCounter  = !!answers.countertop;
  // Tile floor (porcelain/stone/natural_stone) — LVP handled separately
  const hasFloorTile = !!(answers.floor_tile &&
                          answers.floor_tile !== 'keep_existing' &&
                          answers.floor_tile !== 'lvp');
  const hasLvp      = answers.floor_tile === 'lvp';
  const hasDrywall  = !!(answers.drywall_wet_area &&
                         answers.drywall_wet_area !== 'existing_keep');
  const hasLayout   = !!(answers.layout_change &&
                         answers.layout_change !== 'keep_layout');

  // ── 1. Structural signals always mean full gut ─────────────────────────────
  if (hasLayout || hasDrywall) return 'full_remodel';

  // ── 2. Multiple distinct work categories → full_remodel ───────────────────
  const wetArea      = hasShower;
  const fixedSurface = hasVanity || hasCounter;
  const floor        = hasFloorTile || hasLvp;
  // LVP floor + shower: LVP trade not in tile_only, needs full_remodel
  if (hasShower && hasLvp) return 'full_remodel';
  if ([wetArea, fixedSurface, floor].filter(Boolean).length >= 2) return 'full_remodel';

  // ── 3. Single-category tags ────────────────────────────────────────────────
  if (hasShower)                  return 'tile_only';
  if (fixedSurface && !floor)     return 'vanity_swap';
  if (floor)                      return 'paint_and_floor';

  // ── 6. Default ────────────────────────────────────────────────────────────
  return 'full_remodel';
}

// ── translateAnswers ─────────────────────────────────────────────────────────
//
// Maps the configurator answer flat-map → scope_details (scope_detail_schemas vocab).
//
// Mapping table (bathroom v1, from 2026-07-16 seam audit §3):
//
//   scope_checklists field       → scope_detail_schemas key    Notes
//   ─────────────────────────────────────────────────────────────────────────
//   tub_shower_config            → shower_type                 see value map below
//   shower_width_in              → shower_width_in             number passthrough
//   shower_length_in             → shower_length_in            number passthrough
//   shower_wall_height_in        → shower_wall_height_in       number passthrough (wins over tile_height)
//   tile_height (ceiling)        → shower_wall_height_in       uses wall_height_in from answers
//   tile_height (standard)       → shower_wall_height_in = 84  ~7 ft shower tile
//   tile_height (wainscot)       → shower_wall_height_in = 48  ~4 ft half-wall tile
//   vanity_config                → sink_count                  single→1, double→2, none→0
//   vanity_size_in               → vanity_width                custom → allowance flag
//   countertop                   → vanity_top + countertop_sf  countertop_sf = width×22/144
//   toilet                       → toilet_type                 see value map below
//   niche (choice recessed/…)    → niche (boolean)             none→false, else true
//   shower_bench (bool)          → bench                       key rename
//
// tub_shower_config value map:
//   walkin              → shower_only
//   combo               → tub_plus_shower
//   freestanding_plus_shower → tub_plus_shower
//   tub_only            → tub_only
//
// toilet value map:
//   reuse               → keep
//   standard            → standard
//   comfort_height      → upgrade
//   wall_hung           → upgrade
//   bidet_circuit       → upgrade
//
// Fields with NO takeoff destination (P6+ content work):
//   fixture_finish, shower_valve, shower_glass, shower_drain, shower_entry,
//   heated_floor, wet_wall_window, ventilation, access_panel, drywall_wet_area,
//   layout_change, age_of_home, wall_tile_layout
//   + perception fields: existing_tub_shower, existing_wall_finish, existing_floor_finish,
//     existing_vanity, existing_countertop, vanity_style, shower_floor_tiled, shower_drain
// These are passed through to untranslated[] — never dropped silently.
//
// Measurement fields fed to resolveGeometry, not scope_details:
//   floor_sf, wall_height_in

export function translateAnswers(answers) {
  if (!answers || typeof answers !== 'object') {
    return { scopeDetails: {}, untranslated: {}, flags: [] };
  }

  const sd = {};          // scope_details (scope_detail_schemas vocab)
  const untranslated = {}; // fields with no current takeoff destination
  const flags = [];        // allowance / derivation markers

  // tub_shower_config → shower_type
  if (answers.tub_shower_config != null) {
    const TUB_MAP = {
      walkin:                 'shower_only',
      combo:                  'tub_plus_shower',
      freestanding_plus_shower: 'tub_plus_shower',
      tub_only:               'tub_only',
    };
    sd.shower_type = TUB_MAP[answers.tub_shower_config] ?? 'shower_only';
  }

  // shower dims → passthrough numbers
  if (Number(answers.shower_width_in) > 0)       sd.shower_width_in = Number(answers.shower_width_in);
  if (Number(answers.shower_length_in) > 0)      sd.shower_length_in = Number(answers.shower_length_in);
  if (Number(answers.shower_wall_height_in) > 0) sd.shower_wall_height_in = Number(answers.shower_wall_height_in);

  // tile_height → shower_wall_height_in fallback (explicit dim wins, checked above)
  if (!sd.shower_wall_height_in && answers.tile_height) {
    if (answers.tile_height === 'ceiling') {
      // ceiling tile to the room height; wall_height_in (from scope answers) is in inches
      sd.shower_wall_height_in = Number(answers.wall_height_in) || 96;
    } else if (answers.tile_height === 'standard') {
      sd.shower_wall_height_in = 84; // standard shower tile height ~7 ft
    } else if (answers.tile_height === 'wainscot') {
      sd.shower_wall_height_in = 48; // half-wall surround ~4 ft
    }
  }

  // vanity_config → sink_count
  if (answers.vanity_config != null) {
    const SINK_MAP = { single: 1, double: 2, none: 0 };
    if (answers.vanity_config in SINK_MAP) sd.sink_count = SINK_MAP[answers.vanity_config];
  }

  // vanity_size_in → vanity_width (string value matching fixture_select option keys)
  if (answers.vanity_size_in != null) {
    if (answers.vanity_size_in === 'custom') {
      flags.push({ type: 'allowance', field: 'vanity_width', reason: 'custom vanity size — countertop SF cannot be computed' });
    } else {
      sd.vanity_width = answers.vanity_size_in; // '24'|'30'|'36'|'48'|'60'|'72'
    }
  }

  // countertop → vanity_top + countertop_sf (width × 22in depth / 144 = SF)
  if (answers.countertop != null) {
    sd.vanity_top = answers.countertop;
    if (sd.vanity_width) {
      const wIn = Number(sd.vanity_width);
      if (wIn > 0) {
        sd.countertop_sf = Math.round((wIn * 22 / 144) * 100) / 100;
      }
    } else if (answers.vanity_size_in !== 'custom') {
      // vanity_width not yet derivable (neither present nor custom)
      flags.push({ type: 'allowance', field: 'countertop_sf', reason: 'vanity width unknown — countertop SF cannot be computed' });
    }
  }

  // toilet → toilet_type
  if (answers.toilet != null) {
    const TOILET_MAP = {
      reuse:          'keep',
      standard:       'standard',
      comfort_height: 'upgrade',
      wall_hung:      'upgrade',
      bidet_circuit:  'upgrade',
    };
    sd.toilet_type = TOILET_MAP[answers.toilet] ?? 'standard';
  }

  // niche (choice: recessed/shelf/corner/none) → boolean
  if (answers.niche != null) {
    sd.niche = answers.niche !== 'none';
  }

  // shower_bench → bench (key rename, boolean passthrough)
  if (answers.shower_bench != null) {
    sd.bench = !!answers.shower_bench;
  }

  // ── Fields with no current takeoff destination ─────────────────────────────
  // Passed to untranslated — never dropped silently. P6+ content work gives them lines.
  const NO_DEST = new Set([
    // Explicitly listed no-destination fields (dispatch §1b):
    'fixture_finish', 'shower_valve', 'shower_glass', 'shower_drain', 'shower_entry',
    'heated_floor', 'wet_wall_window', 'ventilation', 'access_panel', 'drywall_wet_area',
    'layout_change', 'age_of_home', 'wall_tile_layout',
    // Perception fields (SCOPE_VISION P1 — existing conditions, no pricing destination yet):
    'existing_tub_shower', 'existing_wall_finish', 'existing_floor_finish',
    'existing_vanity', 'existing_countertop',
    // Other fields with no scope_detail_schemas key:
    'vanity_style', 'shower_floor_tiled',
    // floor_tile drives scope_tag derivation but has no scope_detail key of its own:
    'floor_tile',
  ]);
  // Measurement fields consumed by resolveGeometry only:
  const GEO_ONLY = new Set(['floor_sf', 'wall_height_in']);

  // Keys already translated to scope_details above:
  const TRANSLATED = new Set([
    'tub_shower_config', 'shower_width_in', 'shower_length_in', 'shower_wall_height_in',
    'tile_height', 'vanity_config', 'vanity_size_in', 'countertop', 'toilet', 'niche',
    'shower_bench',
  ]);

  for (const [key, val] of Object.entries(answers)) {
    if (TRANSLATED.has(key) || GEO_ONLY.has(key)) continue;
    if (NO_DEST.has(key)) {
      untranslated[key] = val;
    } else if (sd[key] === undefined) {
      // Anything not explicitly handled goes to untranslated (future-safe)
      untranslated[key] = val;
    }
  }

  return { scopeDetails: sd, untranslated, flags };
}

// ── resolveGeometry ──────────────────────────────────────────────────────────
//
// Produces a single geometry record from scan + answer sources with explicit
// field-level precedence: scan > measured > manual > null.
//
// Input:
//   scanGeometry — { floorSf, wallSf, perimeterLf, ceilingFt, doors, windows } | null
//     Values come from a LiDAR scan's normalized_geometry (or raw scan). All fields
//     optional — absent fields are null.
//   answers — flat map { field_key: value | { value, source } }
//     Supports both plain values (treated as source='manual') and annotated objects
//     { value, source: 'measured'|'rep_typed'|... } so SCOPE_VISION P2 measured
//     values receive their proper precedence.
//
// Output:
//   { floorSf, wallSf, perimeterLf, ceilingFt, doors, windows, source }
//   source — the dominant provider: 'scan' | 'measured' | 'manual' | 'mixed' | null
//   Per-field nulls are propagated; the core's PENDING semantics handle absence.

export function resolveGeometry({ scanGeometry, answers }) {
  // Annotated lookup — supports both plain values and { value, source } objects
  function getAnnotated(key) {
    const raw = answers?.[key];
    if (raw == null) return { val: null, src: null };
    if (typeof raw === 'object' && 'value' in raw) {
      return { val: raw.value != null ? Number(raw.value) || null : null, src: raw.source || 'manual' };
    }
    const num = Number(raw);
    return { val: isFinite(num) && num > 0 ? num : null, src: 'manual' };
  }

  const scan = scanGeometry ?? {};

  const { val: ansFloor, src: ansFloorSrc } = getAnnotated('floor_sf');
  const { val: ansWallIn, src: ansWallSrc } = getAnnotated('wall_height_in');

  const measuredFloor  = ansFloorSrc === 'measured' ? ansFloor : null;
  const measuredWallIn = ansWallSrc  === 'measured' ? ansWallIn : null;
  const manualFloor    = (ansFloorSrc && ansFloorSrc !== 'measured') ? ansFloor : null;
  const manualWallIn   = (ansWallSrc  && ansWallSrc  !== 'measured') ? ansWallIn : null;

  // Per-field precedence: scan > measured > manual > null
  const floorSf    = scan.floorSf    ?? measuredFloor   ?? manualFloor  ?? null;
  const rawCeilIn  = scan.ceilingFt != null ? null
    : measuredWallIn ?? manualWallIn ?? null;
  const ceilingFt  = scan.ceilingFt  ??
    (rawCeilIn != null ? rawCeilIn / 12 : null);
  const wallSf     = scan.wallSf     ?? null;
  const perimeterLf = scan.perimeterLf ?? null;
  const doors      = scan.doors      ?? null;
  const windows    = scan.windows    ?? null;

  // Overall source: the dominant provider
  const floorSrc = scan.floorSf != null ? 'scan'
    : measuredFloor  != null ? 'measured'
    : manualFloor    != null ? 'manual'
    : null;
  const ceilSrc  = scan.ceilingFt != null ? 'scan'
    : measuredWallIn != null ? 'measured'
    : manualWallIn   != null ? 'manual'
    : null;
  let source;
  if (!floorSrc && !ceilSrc)           source = null;
  else if (floorSrc === ceilSrc)       source = floorSrc;
  else if (floorSrc && !ceilSrc)       source = floorSrc;
  else if (!floorSrc && ceilSrc)       source = ceilSrc;
  else                                 source = 'mixed';

  return { floorSf, wallSf, perimeterLf, ceilingFt, doors, windows, source };
}
