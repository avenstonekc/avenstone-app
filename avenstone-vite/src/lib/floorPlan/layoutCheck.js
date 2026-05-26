/**
 * FLOOR_PLAN_LAYOUT_ARC Phase 2A — Layout Rules Engine
 *
 * Pure-function module. No React, no DOM, no Supabase.
 * Input:  output of normalizeFloorPlan() from Phase 1.
 * Output: { layout_hints, issues }
 *
 * Phase 2A rules:
 *   1. Label position via polylabel (fixes L-shape centroid-outside bug)
 *   2. Abbreviation table for common room names + truncation fallback
 *   3. Rotation: 90° for tall narrow rooms (aspect ratio > 1.5)
 *   4. SF badge position — inline for small rooms, below label for large
 *
 * Phase 2B (next): collision detection, door swing clearance, hallway SF gate.
 * Phase 3: 'ambiguous' severity for Opus tiebreaker on layout conflicts.
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

// ─── Public helpers ───────────────────────────────────────────────────────────

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
      const safeZonePx = safeZoneFt * 10;

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
