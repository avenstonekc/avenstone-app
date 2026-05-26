/**
 * FLOOR_PLAN_LAYOUT_ARC Phase 2A+2B — Layout Rules Engine
 *
 * Pure-function module. No React, no DOM, no Supabase.
 * Input:  output of normalizeFloorPlan() from Phase 1.
 * Output: { layout_hints, issues }
 *
 * Phase 2A rules (committed d8df8ac):
 *   1. Label position via polylabel (fixes L-shape centroid-outside bug)
 *   2. Abbreviation table for common room names + truncation fallback
 *   3. Rotation: 90° for tall narrow rooms (aspect ratio > 1.5)
 *   4. SF badge position — inline for small rooms, below label for large
 *
 * Phase 2B rules (this commit):
 *   5. Dimension-line collision detection (no-op when chain_dims absent)
 *   6. Door swing clearance (circle approximation, errs safe)
 *   7. Adjacent label collision — O(n²) AABB pass, severity 'ambiguous'
 *   8. Hallway micro-room SF gate — suppress SF badge on tiny hallways
 *
 * Issue severities:
 *   'info'      — advisory, renderer may ignore
 *   'warn'      — renderer should attempt to nudge label or dim
 *   'ambiguous' — no deterministic fix; flagged for Phase 3 Opus tiebreaker
 *
 * Input contract for Phase 2B:
 *   normalized.doors[]      — from Phase 1 normalizeFloorPlan() output ✓
 *   normalized.walls[]      — from Phase 1 output ✓
 *   normalized.chain_dims[] — Phase 4 renderer responsibility; rule 5 is
 *                             no-op when absent. Shape per element:
 *                             { p1:[x,y], p2:[x,y], offset_text_at:[x,y],
 *                               text_width: number, text_height: number }
 *                             All coordinates in feet (same space as polygon).
 *
 * Phase 3: Opus tiebreaker for 'ambiguous' issues.
 * Phase 4: pdf.js renderer consumes layout_hints directly.
 */

import polylabel from 'polylabel';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_FONT_SIZE_PX = 14;

// text width ≈ chars * fontSize * CHAR_WIDTH_RATIO (heuristic; renderer refines)
const CHAR_WIDTH_RATIO = 0.55;

// Abbreviate when estimated text width > this fraction of the safe-zone diameter
const ABBREV_THRESHOLD = 0.6;

// Rooms below this area get inline "Name XX SF" label instead of separate badge
const SMALL_ROOM_THRESHOLD_SQFT = 50;

// SF badge sits this many px below the label baseline at canonical zoom
const SF_BADGE_OFFSET_BELOW_LABEL_PX = 4;

const SF_BADGE_FONT_SIZE_PX = 11;

// Rotate label 90° when height/width (or width/height) exceeds this ratio
const ROOM_ROTATION_ASPECT_THRESHOLD = 1.5;

// polylabel distance below this (feet) triggers a label_distance_low warning
const MIN_LABEL_DISTANCE_FT = 0.5;

// polylabel precision (feet) — matches Phase 1 grid snap
const POLYLABEL_PRECISION = 0.1;

// Phase 2B: hallways below this area get SF badge suppressed
const HALLWAY_MICRO_THRESHOLD_SQFT = 30;

// Phase 2B: at canonical zoom 1 ft = 10 px (grid snap 0.1 ft/px)
const CANONICAL_PX_PER_FT = 10;

// ─── Abbreviation table ───────────────────────────────────────────────────────

// Sorted longest-first so "Master Bedroom" beats "Bedroom".
// Values may include a suffix-preservation directive: if the room name ends
// with a digit (e.g. "Bedroom 2"), the digit is appended to the abbreviation.
const ABBREV_TABLE = [
  { pattern: /^master\s*bedroom/i,      short: 'MBR', keepSuffix: true  },
  { pattern: /^master\s*bath(room)?/i,  short: 'MBA', keepSuffix: false },
  { pattern: /^walk-?in\s*closet/i,     short: 'WIC', keepSuffix: true  },
  { pattern: /^powder\s*room/i,         short: 'PR',  keepSuffix: false },
  { pattern: /^family\s*room/i,         short: 'FAM', keepSuffix: false },
  { pattern: /^living\s*room/i,         short: 'LIV', keepSuffix: false },
  { pattern: /^dining\s*room/i,         short: 'DIN', keepSuffix: false },
  { pattern: /^bed\s*room|^bedroom/i,   short: 'BR',  keepSuffix: true  },
  { pattern: /^bath\s*room|^bathroom/i, short: 'BA',  keepSuffix: true  },
  { pattern: /^laundry/i,               short: 'LDY', keepSuffix: false },
  { pattern: /^hallway|^hall$/i,        short: 'HALL',keepSuffix: false },
  { pattern: /^closet/i,                short: 'CL',  keepSuffix: true  },
  { pattern: /^kitchen/i,               short: 'KIT', keepSuffix: false },
  { pattern: /^garage/i,                short: 'GAR', keepSuffix: true  },
  { pattern: /^office/i,                short: 'OFF', keepSuffix: false },
  { pattern: /^pantry/i,                short: 'PAN', keepSuffix: false },
  { pattern: /^foyer/i,                 short: 'FOY', keepSuffix: false },
  { pattern: /^mudroom/i,               short: 'MUD', keepSuffix: false },
];

// ─── Phase 2A — Public helpers ────────────────────────────────────────────────

/**
 * computeLabelPosition(room, options)
 * Rule 1 — uses polylabel to find the pole of inaccessibility.
 * For L-shaped rooms the centroid often lands outside the polygon;
 * polylabel always returns a point strictly inside.
 * Returns { x, y, distance_to_edge }
 */
export function computeLabelPosition(room, options = {}) {
  const polygon = room.polygon; // [[x,z], ...]
  if (!polygon || polygon.length < 3) {
    const c = room.centroid;
    const x = (c && Number.isFinite(c[0])) ? c[0] : 0;
    const y = (c && Number.isFinite(c[1])) ? c[1] : 0;
    return { x, y, distance_to_edge: 0 };
  }
  // polylabel wants GeoJSON ring: [[[x,y],...]] — x=east, y=north (z in our system)
  const ring = polygon.map(([x, z]) => [x, z]);
  const precision = options.polylabelPrecision ?? POLYLABEL_PRECISION;
  const result = polylabel([ring], precision);
  return { x: result[0], y: result[1], distance_to_edge: result.distance };
}

/**
 * abbreviateRoomName(name, maxChars, options)
 * Rule 2 — applies abbreviation table, then falls back to truncation.
 * options.abbreviations — custom override table (same shape as ABBREV_TABLE)
 * Returns { text, was_abbreviated }
 */
export function abbreviateRoomName(name, maxChars, options = {}) {
  if (!name) return { text: '', was_abbreviated: false };
  if (name.length <= maxChars) return { text: name, was_abbreviated: false };

  const table = options.abbreviations ?? ABBREV_TABLE;

  for (const entry of table) {
    if (entry.pattern.test(name)) {
      let short = entry.short;
      if (entry.keepSuffix) {
        // Extract trailing digit(s) from the original name
        const suffix = name.match(/\s*(\d+)\s*$/);
        if (suffix) short = short + suffix[1];
      }
      return { text: short, was_abbreviated: true };
    }
  }

  // Unknown name — truncate with ellipsis
  if (maxChars <= 1) return { text: name.slice(0, maxChars), was_abbreviated: true };
  return { text: name.slice(0, maxChars - 1) + '…', was_abbreviated: true };
}

/**
 * computeLabelRotation(room, options)
 * Rule 3 — rotate 90° when the room's taller than wide by the aspect threshold.
 * Uses axis-aligned bounding box (v1). True OBB in Phase 5+ if needed.
 * Returns 0 | 90.
 */
export function computeLabelRotation(room, options = {}) {
  const polygon = room.polygon;
  if (!polygon || polygon.length < 2) return 0;
  const threshold = options.rotationAspectThreshold ?? ROOM_ROTATION_ASPECT_THRESHOLD;

  const xs = polygon.map(p => p[0]);
  const zs = polygon.map(p => p[1]);
  const width  = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...zs) - Math.min(...zs);

  if (width < 1e-6) return 90; // degenerate: zero-width → must rotate
  return (height / width > threshold) ? 90 : 0;
}

/**
 * computeSfBadgePosition(room, labelHint, options)
 * Rule 4 — SF badge below label for normal rooms; inline for small rooms.
 * options.smallRoomThresholdSqft — override for the inline threshold.
 * Returns { sf_x, sf_y, sf_text, sf_inline_with_label }
 */
export function computeSfBadgePosition(room, labelHint, options = {}) {
  const threshold = options.smallRoomThresholdSqft ?? SMALL_ROOM_THRESHOLD_SQFT;
  const roundedSf = Math.round(room.area_sqft ?? 0);
  const sfText = `${roundedSf} SF`;
  const isSmall = (room.area_sqft ?? 0) < threshold;

  if (isSmall) {
    return {
      sf_x: labelHint.label_x,
      sf_y: labelHint.label_y,
      sf_text: `${labelHint.label_text} ${roundedSf} SF`,
      sf_inline_with_label: true,
    };
  }

  const offset = options.sfBadgeOffsetPx ?? SF_BADGE_OFFSET_BELOW_LABEL_PX;
  const labelFontSize = options.labelFontSize ?? DEFAULT_FONT_SIZE_PX;

  return {
    sf_x: labelHint.label_x,
    sf_y: labelHint.label_y + labelFontSize + offset,
    sf_text: sfText,
    sf_inline_with_label: false,
  };
}

// ─── Phase 2B — Public helpers ────────────────────────────────────────────────

/**
 * detectDimensionCollisions(labelBbox, chainDims)
 * Rule 5 — detect if a room label's AABB overlaps any chain dimension text box.
 *
 * labelBbox: { x, y, w, h } in feet.
 * chainDims: array of { p1, p2, offset_text_at:[x,y], text_width, text_height }
 *            — all in feet. Phase 4 renderer populates this.
 *
 * Returns array of { dim_index, severity }.
 * Empty array = no collisions.
 */
export function detectDimensionCollisions(labelBbox, chainDims) {
  if (!chainDims || chainDims.length === 0) return [];
  const hits = [];

  for (let i = 0; i < chainDims.length; i++) {
    const dim = chainDims[i];
    if (!dim.offset_text_at) continue;
    const [tx, ty] = dim.offset_text_at;
    const tw = dim.text_width ?? 0;
    const th = dim.text_height ?? 0;
    const dimBbox = { x: tx - tw / 2, y: ty - th / 2, w: tw, h: th };

    if (_aabbOverlap(labelBbox, dimBbox)) {
      // 'ambiguous' if label center is inside the dim text box (near-total occlusion)
      const lcx = labelBbox.x + labelBbox.w / 2;
      const lcy = labelBbox.y + labelBbox.h / 2;
      const totalOcclusion = lcy >= dimBbox.y && lcy <= dimBbox.y + dimBbox.h
                          && lcy >= dimBbox.x && lcy <= dimBbox.x + dimBbox.w;
      hits.push({ dim_index: i, severity: totalOcclusion ? 'ambiguous' : 'warn' });
    }
  }

  return hits;
}

/**
 * detectDoorSwingCollisions(room, labelBbox, doors, walls)
 * Rule 6 — detect if a label bbox is inside any door swing zone.
 *
 * Simplification: swing zone is a full circle of radius = door.width centered
 * at door midpoint. Over-conservative (~15-25% false positives vs quarter-arc),
 * but always safe — labels never render inside a real swing zone.
 * Phase 5+ can refine to quarter-arc using wall normal direction.
 *
 * Returns array of { door_id } for each colliding door.
 */
export function detectDoorSwingCollisions(room, labelBbox, doors, walls) {
  if (!doors || doors.length === 0) return [];
  const hits = [];

  for (const door of doors) {
    if (!door.room_ids || !door.room_ids.includes(room.id)) continue;
    if (!door.midpoint) continue;

    const [cx, cy] = door.midpoint;
    const radius = door.width ?? 0;
    if (radius < 1e-6) continue;

    // Check if any corner of the label bbox is within the swing circle
    const corners = [
      [labelBbox.x,              labelBbox.y             ],
      [labelBbox.x + labelBbox.w, labelBbox.y            ],
      [labelBbox.x,              labelBbox.y + labelBbox.h],
      [labelBbox.x + labelBbox.w, labelBbox.y + labelBbox.h],
    ];

    const hit = corners.some(([px, py]) => Math.hypot(px - cx, py - cy) < radius);
    if (hit) hits.push({ door_id: door.id });
  }

  return hits;
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * computeLayoutHints(normalizedFloorPlan, options)
 *
 * Input:  output of normalizeFloorPlan() — pass the full result or just result.data.
 * Output: { ok, data: { layout_hints, issues } } | { ok: false, error }
 *
 * layout_hints keys are room IDs. Each value carries everything the renderer needs
 * for label + SF badge placement without further computation.
 */
export function computeLayoutHints(normalized, options = {}) {
  // Accept either the raw ok/data envelope or just the data object
  const plan = normalized?.data ?? normalized;

  if (!plan || !Array.isArray(plan.rooms)) {
    return { ok: false, error: 'computeLayoutHints: input must be normalizeFloorPlan() output' };
  }

  try {
    const layout_hints = {};
    const issues = [];

    const fontSizePx   = options.labelFontSize ?? DEFAULT_FONT_SIZE_PX;
    const charRatio    = options.charWidthRatio ?? CHAR_WIDTH_RATIO;
    const abbrevThresh = options.abbrevThreshold ?? ABBREV_THRESHOLD;
    const hallwayMicroThresh = options.hallwayMicroThresholdSqft ?? HALLWAY_MICRO_THRESHOLD_SQFT;

    // ── Phase 2A + 2B rule 8: per-room pass ───────────────────────────────────
    for (const room of plan.rooms) {
      // Rule 1 — label position
      const pos = computeLabelPosition(room, options);

      if (pos.distance_to_edge < MIN_LABEL_DISTANCE_FT) {
        issues.push({
          kind: 'label_distance_low',
          room_id: room.id,
          severity: 'warn',
          details: { distance_to_edge: pos.distance_to_edge, threshold: MIN_LABEL_DISTANCE_FT },
        });
      }

      // Rule 3 — rotation (before abbreviation, affects text width budget)
      const rotation = computeLabelRotation(room, options);

      // How many pixels wide is our safe zone?
      // Safe zone diameter = 2 * distance_to_edge (inscribed circle at pole of inaccessibility)
      // Convert from feet to pixels: 1 ft = 10px at canonical zoom (0.1 ft/px grid snap)
      const safeZoneFt = 2 * pos.distance_to_edge;
      const safeZonePx = safeZoneFt * CANONICAL_PX_PER_FT;

      // Max chars that fit within ABBREV_THRESHOLD of safe zone
      const maxCharsPx  = safeZonePx * abbrevThresh;
      const maxChars    = Math.max(2, Math.floor(maxCharsPx / (fontSizePx * charRatio)));

      // Rule 2 — abbreviation
      const { text: labelText, was_abbreviated } = abbreviateRoomName(room.name ?? '', maxChars, options);

      if (!was_abbreviated && !_inAbbrevTable(room.name ?? '', options.abbreviations ?? ABBREV_TABLE)) {
        const wouldFit = (room.name ?? '').length <= maxChars;
        if (!wouldFit) {
          issues.push({
            kind: 'room_unknown_name',
            room_id: room.id,
            severity: 'info',
            details: { name: room.name, truncated_to: labelText },
          });
        }
      }

      const labelHint = {
        label_x: pos.x,
        label_y: pos.y,
        label_text: labelText,
        label_full_text: room.name ?? '',
        label_rotation: rotation,
        label_font_size: fontSizePx,
        label_distance_to_edge: pos.distance_to_edge,
      };

      // Rule 4 — SF badge
      const sfHint = computeSfBadgePosition(room, labelHint, options);

      layout_hints[room.id] = {
        ...labelHint,
        sf_x: sfHint.sf_x,
        sf_y: sfHint.sf_y,
        sf_text: sfHint.sf_text,
        sf_inline_with_label: sfHint.sf_inline_with_label,
      };

      // Rule 8 — Hallway micro SF gate (applied before collision passes so
      //           the suppressed SF badge doesn't generate false dim collisions)
      const isHallwayLike = /hallway|hall|corridor|stairs|landing/i.test(room.type ?? '');
      if (isHallwayLike && (room.area_sqft ?? 0) < hallwayMicroThresh) {
        layout_hints[room.id].sf_text = '';
        layout_hints[room.id].sf_inline_with_label = false;
        issues.push({
          kind: 'hallway_sf_suppressed',
          room_id: room.id,
          severity: 'info',
          details: { reason: 'micro_hallway_decluttered', area_sqft: room.area_sqft },
        });
      }
    }

    // ── Phase 2B rule 5+6: per-room collision pass ────────────────────────────
    const chainDims = plan.chain_dims || [];
    const doors     = plan.doors     || [];
    const walls     = plan.walls     || [];

    for (const room of plan.rooms) {
      const hint = layout_hints[room.id];
      if (!hint) continue;
      const bbox = _computeLabelBbox(hint);

      // Rule 5 — dimension line collision (no-op when chain_dims absent)
      if (chainDims.length > 0) {
        const dimHits = detectDimensionCollisions(bbox, chainDims);
        for (const hit of dimHits) {
          issues.push({
            kind: hit.severity === 'ambiguous' ? 'dim_collision_severe' : 'dim_collision',
            room_id: room.id,
            severity: hit.severity,
            details: { dim_index: hit.dim_index },
          });
        }
      }

      // Rule 6 — door swing collision
      if (doors.length > 0) {
        const doorHits = detectDoorSwingCollisions(room, bbox, doors, walls);
        if (doorHits.length === 1) {
          issues.push({
            kind: 'door_swing_collision',
            room_id: room.id,
            severity: 'warn',
            details: { door_id: doorHits[0].door_id },
          });
        } else if (doorHits.length > 1) {
          // Multiple door swing conflicts → no deterministic winner, Opus tiebreaker
          issues.push({
            kind: 'door_swing_collision',
            room_id: room.id,
            severity: 'ambiguous',
            details: { door_ids: doorHits.map(h => h.door_id) },
          });
        }
      }
    }

    // ── Phase 2B rule 7: pairwise adjacent label collision ────────────────────
    // O(n²) over rooms — fine for residential floor plans (<30 rooms typical)
    const roomIds = plan.rooms.map(r => r.id);
    for (let i = 0; i < roomIds.length; i++) {
      for (let j = i + 1; j < roomIds.length; j++) {
        const a = layout_hints[roomIds[i]];
        const b = layout_hints[roomIds[j]];
        if (!a || !b) continue;
        if (_aabbOverlap(_computeLabelBbox(a), _computeLabelBbox(b))) {
          issues.push({
            kind: 'adjacent_label_collision',
            room_id: roomIds[i],
            severity: 'ambiguous',
            details: { other_room_id: roomIds[j] },
          });
        }
      }
    }

    return { ok: true, data: { layout_hints, issues } };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

// ─── Internal ─────────────────────────────────────────────────────────────────

function _inAbbrevTable(name, table) {
  return table.some(entry => entry.pattern.test(name));
}

/**
 * _computeLabelBbox(hint) → { x, y, w, h } in feet.
 * AABB of a rendered label. Accounts for 90° rotation (swaps w/h).
 * Centered on (label_x, label_y).
 */
function _computeLabelBbox(hint) {
  const fontSizePx = hint.label_font_size ?? DEFAULT_FONT_SIZE_PX;
  const text = hint.label_text ?? '';
  // Convert from pixels to feet at canonical zoom
  let w = (text.length * fontSizePx * CHAR_WIDTH_RATIO) / CANONICAL_PX_PER_FT;
  let h = fontSizePx / CANONICAL_PX_PER_FT;
  if (hint.label_rotation === 90) { const tmp = w; w = h; h = tmp; }
  return { x: hint.label_x - w / 2, y: hint.label_y - h / 2, w, h };
}

/**
 * _aabbOverlap(a, b) — true when two axis-aligned bounding boxes overlap.
 * Both in { x, y, w, h } form.
 */
function _aabbOverlap(a, b) {
  return !(a.x + a.w < b.x || b.x + b.w < a.x ||
           a.y + a.h < b.y || b.y + b.h < a.y);
}
