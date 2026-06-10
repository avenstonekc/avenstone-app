#!/usr/bin/env node
/**
 * create_brand_svgs.js — generates all brand SVG variants.
 * Run once from repo root: node tools/create_brand_svgs.js
 *
 * Geometry judgment calls:
 * - Three nests: uniform ~13-unit apex spacing, ~11-13 unit wall spacing.
 *   Intentionally NOT a true parallel-offset (too complex); visually balanced.
 * - Inner A: house shape with center floor notch (37px opening in 42px floor).
 *   Crossbar at wall midpoint. Notch feet are 8px each side.
 * - Compact mark: two nests only, heavier stroke (3.5px), notch simplified.
 * - Roof slope: ~51° from horizontal (matches reference steep geometry).
 * - All strokes: miter join (sharp peak), round cap on open ends.
 */

const fs   = require('fs');
const path = require('path');

const GOLD  = '#C9A84C';  // --gold-500
const NAVY  = '#0A1F44';  // --navy-900
const WHITE = '#FFFFFF';

const BRAND_DIR = path.join(__dirname, '../avenstone-vite/src/assets/brand');
fs.mkdirSync(BRAND_DIR, { recursive: true });

// ── Geometry ────────────────────────────────────────────────────────────────

// Full mark — three nested houses, centered in 100×100
const MARK_PATHS = (stroke) => `
  <!-- Outer house -->
  <path d="M50,5 L95,41 L95,92 L5,92 L5,41 Z"
        fill="none" stroke="${stroke}" stroke-width="2.8"
        stroke-linejoin="miter" stroke-miterlimit="8"/>
  <!-- Middle house -->
  <path d="M50,19 L82,47 L82,84 L18,84 L18,47 Z"
        fill="none" stroke="${stroke}" stroke-width="2.5"
        stroke-linejoin="miter" stroke-miterlimit="8"/>
  <!-- Inner A: house frame with center-floor notch -->
  <path d="M50,33 L71,54 L71,78 L63,78 M37,78 L29,78 L29,54 Z"
        fill="none" stroke="${stroke}" stroke-width="2.5"
        stroke-linejoin="miter" stroke-miterlimit="8"
        stroke-linecap="round"/>
  <!-- A crossbar -->
  <line x1="35" y1="66" x2="65" y2="66"
        stroke="${stroke}" stroke-width="2.5" stroke-linecap="round"/>`;

// Compact mark — two nests, heavier strokes, centred in 100×100
const COMPACT_PATHS = (stroke) => `
  <!-- Outer house (compact) -->
  <path d="M50,8 L90,44 L90,90 L10,90 L10,44 Z"
        fill="none" stroke="${stroke}" stroke-width="3.5"
        stroke-linejoin="miter" stroke-miterlimit="8"/>
  <!-- Inner A (compact, simplified notch) -->
  <path d="M50,26 L72,50 L72,83 L62,83 M38,83 L28,83 L28,50 Z"
        fill="none" stroke="${stroke}" stroke-width="3.5"
        stroke-linejoin="miter" stroke-miterlimit="8"
        stroke-linecap="round"/>
  <!-- A crossbar (compact) -->
  <line x1="34" y1="67" x2="66" y2="67"
        stroke="${stroke}" stroke-width="3.5" stroke-linecap="round"/>`;

// Lockup mark — full three nests, shifted +100 in X for 300-wide canvas
// Centered at x=150 in viewBox "0 0 300 200"
const LOCKUP_MARK = (stroke) => `
  <!-- Outer house -->
  <path d="M150,8 L195,44 L195,95 L105,95 L105,44 Z"
        fill="none" stroke="${stroke}" stroke-width="2.8"
        stroke-linejoin="miter" stroke-miterlimit="8"/>
  <!-- Middle house -->
  <path d="M150,22 L182,50 L182,87 L118,87 L118,50 Z"
        fill="none" stroke="${stroke}" stroke-width="2.5"
        stroke-linejoin="miter" stroke-miterlimit="8"/>
  <!-- Inner A -->
  <path d="M150,36 L171,57 L171,81 L163,81 M137,81 L129,81 L129,57 Z"
        fill="none" stroke="${stroke}" stroke-width="2.5"
        stroke-linejoin="miter" stroke-miterlimit="8"
        stroke-linecap="round"/>
  <!-- A crossbar -->
  <line x1="135" y1="69" x2="165" y2="69"
        stroke="${stroke}" stroke-width="2.5" stroke-linecap="round"/>`;

const LOCKUP_TEXT = (wordmark, sub, rule) => `
  <!-- Wordmark: AVENSTONE -->
  <!-- NOTE: font-family references DM Serif Display; convert to paths in Figma/Inkscape for production -->
  <text x="150" y="118"
        font-family="'DM Serif Display', Georgia, serif"
        font-size="20" font-weight="400"
        fill="${wordmark}" text-anchor="middle"
        letter-spacing="5">AVENSTONE</text>
  <!-- Flanking rules -->
  <line x1="82" y1="132" x2="112" y2="132"
        stroke="${rule}" stroke-width="0.8"/>
  <line x1="188" y1="132" x2="218" y2="132"
        stroke="${rule}" stroke-width="0.8"/>
  <!-- GROUP subline -->
  <text x="150" y="135"
        font-family="'DM Sans', system-ui, sans-serif"
        font-size="9" font-weight="600"
        fill="${sub}" text-anchor="middle"
        letter-spacing="4">GROUP</text>`;

// ── SVG builders ─────────────────────────────────────────────────────────────

function navyBg(w, h, r = 14) {
  return `<rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${NAVY}"/>`;
}

function markSVG({ stroke, bg, viewBox = '0 0 100 100', compact = false, size = 100 }) {
  const paths = compact ? COMPACT_PATHS(stroke) : MARK_PATHS(stroke);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${size}" height="${size}" role="img" aria-label="Avenstone mark">
${bg ? '  ' + navyBg(100, 100) : ''}${paths}
</svg>`;
}

function lockupSVG({ markStroke, wordmark, sub, rule, bg }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 155" role="img" aria-label="Avenstone Group">
${bg ? '  ' + navyBg(300, 155, 18) : ''}${LOCKUP_MARK(markStroke)}${LOCKUP_TEXT(wordmark, sub, rule)}
</svg>`;
}

// ── Variant matrix ────────────────────────────────────────────────────────────
// -navy    = gold mark/text on navy rounded-square bg
// -gold    = gold mark/text on transparent
// -white   = white mark/text on transparent (knockout for dark backgrounds)
// -dark    = navy mark/text on transparent (for light backgrounds)

const MARK_VARIANTS = [
  { suffix: '-navy',  stroke: GOLD,  bg: true  },
  { suffix: '-gold',  stroke: GOLD,  bg: false },
  { suffix: '-white', stroke: WHITE, bg: false },
  { suffix: '-dark',  stroke: NAVY,  bg: false },
];

const LOCKUP_VARIANTS = [
  { suffix: '-navy',  markStroke: GOLD,  wordmark: WHITE, sub: GOLD,  rule: GOLD,  bg: true  },
  { suffix: '-gold',  markStroke: GOLD,  wordmark: GOLD,  sub: GOLD,  rule: GOLD,  bg: false },
  { suffix: '-white', markStroke: WHITE, wordmark: WHITE, sub: WHITE, rule: WHITE, bg: false },
  { suffix: '-dark',  markStroke: NAVY,  wordmark: NAVY,  sub: NAVY,  rule: NAVY,  bg: false },
];

// ── Write files ───────────────────────────────────────────────────────────────

let written = [];

for (const v of MARK_VARIANTS) {
  const name = `avenstone-mark${v.suffix}.svg`;
  fs.writeFileSync(path.join(BRAND_DIR, name),
    markSVG({ stroke: v.stroke, bg: v.bg }));
  written.push(name);

  const cname = `avenstone-mark-compact${v.suffix}.svg`;
  fs.writeFileSync(path.join(BRAND_DIR, cname),
    markSVG({ stroke: v.stroke, bg: v.bg, compact: true }));
  written.push(cname);
}

for (const v of LOCKUP_VARIANTS) {
  const name = `avenstone-lockup${v.suffix}.svg`;
  fs.writeFileSync(path.join(BRAND_DIR, name),
    lockupSVG(v));
  written.push(name);
}

console.log(`✓ Wrote ${written.length} SVG files to ${BRAND_DIR}`);
written.forEach(f => console.log('  ' + f));
