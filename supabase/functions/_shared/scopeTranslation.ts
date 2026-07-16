// INTENTIONAL DUPLICATE — edge/src circular-import boundary.
// Source of truth: avenstone-vite/src/lib/scopeTranslation.js
// This file MUST be kept in lockstep with that file. Any logic change there
// must be applied here, and vice versa. Do not merge — the circular-import
// constraint (edge fns cannot import src/lib; src/lib cannot import supabase.js)
// makes a shared npm/Deno module infeasible. The divergence guard is the only
// safeguard against silent drift.
//
// Divergences from src/lib/scopeTranslation.js:
//   - File extension .ts instead of .js (Deno/TypeScript convention).
//   - No logic changes.
//
// scopeTranslation.ts — pure scope vocabulary bridge (zero imports).
// Bridges the configurator vocab (job_scope_answers / scope_checklists, 35 bathroom
// fields) to the takeoff engine vocab (scope_details / scope_detail_schemas).
//
// Exports: deriveScopeTag, translateAnswers, resolveGeometry

// deno-lint-ignore-file no-explicit-any

export function deriveScopeTag(answers: Record<string, any>): string {
  if (!answers || typeof answers !== "object") return "full_remodel";

  const hasShower   = !!(answers.tub_shower_config ||
                         Number(answers.shower_width_in) > 0 ||
                         Number(answers.shower_length_in) > 0);
  const hasVanity   = !!(answers.vanity_config && answers.vanity_config !== "none");
  const hasCounter  = !!answers.countertop;
  const hasFloorTile = !!(answers.floor_tile &&
                          answers.floor_tile !== "keep_existing" &&
                          answers.floor_tile !== "lvp");
  const hasLvp      = answers.floor_tile === "lvp";
  const hasDrywall  = !!(answers.drywall_wet_area &&
                         answers.drywall_wet_area !== "existing_keep");
  const hasLayout   = !!(answers.layout_change &&
                         answers.layout_change !== "keep_layout");

  if (hasLayout || hasDrywall) return "full_remodel";

  const wetArea      = hasShower;
  const fixedSurface = hasVanity || hasCounter;
  const floor        = hasFloorTile || hasLvp;
  if (hasShower && hasLvp) return "full_remodel";
  if ([wetArea, fixedSurface, floor].filter(Boolean).length >= 2) return "full_remodel";

  if (hasShower)                  return "tile_only";
  if (fixedSurface && !floor)     return "vanity_swap";
  if (floor)                      return "paint_and_floor";

  return "full_remodel";
}

export function translateAnswers(answers: Record<string, any>): { scopeDetails: Record<string, any>; untranslated: Record<string, any>; flags: any[] } {
  if (!answers || typeof answers !== "object") {
    return { scopeDetails: {}, untranslated: {}, flags: [] };
  }

  const sd: Record<string, any> = {};
  const untranslated: Record<string, any> = {};
  const flags: any[] = [];

  if (answers.tub_shower_config != null) {
    const TUB_MAP: Record<string, string> = {
      walkin:                 "shower_only",
      combo:                  "tub_plus_shower",
      freestanding_plus_shower: "tub_plus_shower",
      tub_only:               "tub_only",
    };
    sd.shower_type = TUB_MAP[answers.tub_shower_config] ?? "shower_only";
  }

  if (Number(answers.shower_width_in) > 0)       sd.shower_width_in = Number(answers.shower_width_in);
  if (Number(answers.shower_length_in) > 0)      sd.shower_length_in = Number(answers.shower_length_in);
  if (Number(answers.shower_wall_height_in) > 0) sd.shower_wall_height_in = Number(answers.shower_wall_height_in);

  if (!sd.shower_wall_height_in && answers.tile_height) {
    if (answers.tile_height === "ceiling") {
      sd.shower_wall_height_in = Number(answers.wall_height_in) || 96;
    } else if (answers.tile_height === "standard") {
      sd.shower_wall_height_in = 84;
    } else if (answers.tile_height === "wainscot") {
      sd.shower_wall_height_in = 48;
    }
  }

  if (answers.vanity_config != null) {
    const SINK_MAP: Record<string, number> = { single: 1, double: 2, none: 0 };
    if (answers.vanity_config in SINK_MAP) sd.sink_count = SINK_MAP[answers.vanity_config];
  }

  if (answers.vanity_size_in != null) {
    if (answers.vanity_size_in === "custom") {
      flags.push({ type: "allowance", field: "vanity_width", reason: "custom vanity size — countertop SF cannot be computed" });
    } else {
      sd.vanity_width = answers.vanity_size_in;
    }
  }

  if (answers.countertop != null) {
    sd.vanity_top = answers.countertop;
    if (sd.vanity_width) {
      const wIn = Number(sd.vanity_width);
      if (wIn > 0) {
        sd.countertop_sf = Math.round((wIn * 22 / 144) * 100) / 100;
      }
    } else if (answers.vanity_size_in !== "custom") {
      flags.push({ type: "allowance", field: "countertop_sf", reason: "vanity width unknown — countertop SF cannot be computed" });
    }
  }

  if (answers.toilet != null) {
    const TOILET_MAP: Record<string, string> = {
      reuse:          "keep",
      standard:       "standard",
      comfort_height: "upgrade",
      wall_hung:      "upgrade",
      bidet_circuit:  "upgrade",
    };
    sd.toilet_type = TOILET_MAP[answers.toilet] ?? "standard";
  }

  if (answers.niche != null)        sd.niche = answers.niche !== "none";
  if (answers.shower_bench != null) sd.bench = !!answers.shower_bench;

  const NO_DEST = new Set([
    "fixture_finish","shower_valve","shower_glass","shower_drain","shower_entry",
    "heated_floor","wet_wall_window","ventilation","access_panel","drywall_wet_area",
    "layout_change","age_of_home","wall_tile_layout",
    "existing_tub_shower","existing_wall_finish","existing_floor_finish",
    "existing_vanity","existing_countertop",
    "vanity_style","shower_floor_tiled",
    "floor_tile",
  ]);
  const GEO_ONLY = new Set(["floor_sf","wall_height_in"]);
  const TRANSLATED = new Set([
    "tub_shower_config","shower_width_in","shower_length_in","shower_wall_height_in",
    "tile_height","vanity_config","vanity_size_in","countertop","toilet","niche","shower_bench",
  ]);

  for (const [key, val] of Object.entries(answers)) {
    if (TRANSLATED.has(key) || GEO_ONLY.has(key)) continue;
    if (NO_DEST.has(key)) { untranslated[key] = val; }
    else if (sd[key] === undefined) { untranslated[key] = val; }
  }

  return { scopeDetails: sd, untranslated, flags };
}

export function resolveGeometry({ scanGeometry, answers }: { scanGeometry: any; answers: any }): any {
  function getAnnotated(key: string): { val: number | null; src: string | null } {
    const raw = answers?.[key];
    if (raw == null) return { val: null, src: null };
    if (typeof raw === "object" && "value" in raw) {
      return { val: raw.value != null ? Number(raw.value) || null : null, src: raw.source || "manual" };
    }
    const num = Number(raw);
    return { val: isFinite(num) && num > 0 ? num : null, src: "manual" };
  }

  const scan = scanGeometry ?? {};
  const { val: ansFloor, src: ansFloorSrc } = getAnnotated("floor_sf");
  const { val: ansWallIn, src: ansWallSrc }  = getAnnotated("wall_height_in");

  const measuredFloor  = ansFloorSrc === "measured" ? ansFloor : null;
  const measuredWallIn = ansWallSrc  === "measured" ? ansWallIn : null;
  const manualFloor    = (ansFloorSrc && ansFloorSrc !== "measured") ? ansFloor : null;
  const manualWallIn   = (ansWallSrc  && ansWallSrc  !== "measured") ? ansWallIn : null;

  const floorSf    = scan.floorSf    ?? measuredFloor   ?? manualFloor  ?? null;
  const rawCeilIn  = scan.ceilingFt != null ? null : measuredWallIn ?? manualWallIn ?? null;
  const ceilingFt  = scan.ceilingFt  ?? (rawCeilIn != null ? rawCeilIn / 12 : null);
  const wallSf     = scan.wallSf     ?? null;
  const perimeterLf = scan.perimeterLf ?? null;
  const doors      = scan.doors      ?? null;
  const windows    = scan.windows    ?? null;

  const floorSrc = scan.floorSf != null ? "scan" : measuredFloor != null ? "measured" : manualFloor != null ? "manual" : null;
  const ceilSrc  = scan.ceilingFt != null ? "scan" : measuredWallIn != null ? "measured" : manualWallIn != null ? "manual" : null;
  let source: string | null;
  if (!floorSrc && !ceilSrc)     source = null;
  else if (floorSrc === ceilSrc) source = floorSrc;
  else if (floorSrc && !ceilSrc) source = floorSrc;
  else if (!floorSrc && ceilSrc) source = ceilSrc;
  else                           source = "mixed";

  return { floorSf, wallSf, perimeterLf, ceilingFt, doors, windows, source };
}
