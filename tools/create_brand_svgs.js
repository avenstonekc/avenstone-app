#!/usr/bin/env node
/**
 * create_brand_svgs.js — generates all 12 brand SVG variants.
 * Run from repo root: node tools/create_brand_svgs.js
 *
 * GEOMETRY — locked iteration 3 (Slice 1b, 2026-06-10):
 *   Outer:  M50,5  L95,43 L95,92 L5,92  L5,43  Z
 *   Middle: M50,18 L82,44 L82,80 L18,80 L18,44 Z
 *   Inner A: single open path (right-foot→right-wall→shoulder→apex→
 *            left-shoulder→left-wall→left-foot, NO Z), walls x=35/65,
 *            apex y=31, shoulder y=55, feet y=70.  Crossbar at y=63.
 *   Compact (2-nest): outer same, inner A walls x=30/70, apex y=28,
 *            shoulder y=54, feet y=76, crossbar y=65. Stroke 3.5px.
 *
 * FONT: opentype.js + DMSerifDisplay-Regular.ttf converts both
 *   "AVENSTONE" and "GROUP" to outlined paths (font-independent SVG).
 *   Uses DM Serif Display for both lines for consistent quality.
 */

'use strict';

const fs    = require('fs');
const path  = require('path');
const https = require('https');

const ROOT      = path.join(__dirname, '..');
const BRAND_DIR = path.join(ROOT, 'avenstone-vite/src/assets/brand');
const FONTS_DIR = path.join(ROOT, 'assets-src/fonts');

fs.mkdirSync(BRAND_DIR, { recursive: true });
fs.mkdirSync(FONTS_DIR, { recursive: true });

const GOLD  = '#C9A84C';
const NAVY  = '#0A1F44';
const WHITE = '#FFFFFF';

// ── Font download ─────────────────────────────────────────────────────────────
const SERIF_TTF_URL = 'https://github.com/google/fonts/raw/main/ofl/dmserifdisplay/DMSerifDisplay-Regular.ttf';
const SERIF_TTF_PATH = path.join(FONTS_DIR, 'DMSerifDisplay-Regular.ttf');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) { resolve(dest); return; }
    console.log(`  Downloading ${path.basename(dest)}…`);
    const follow = (u) => https.get(u, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) { follow(res.headers.location); return; }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
    follow(url);
  });
}

// ── Geometry ──────────────────────────────────────────────────────────────────
const MARK_PATHS = (s) => `
  <path d="M50,5 L95,43 L95,92 L5,92 L5,43 Z"
        fill="none" stroke="${s}" stroke-width="2.8" stroke-linejoin="miter" stroke-miterlimit="8"/>
  <path d="M50,18 L82,44 L82,80 L18,80 L18,44 Z"
        fill="none" stroke="${s}" stroke-width="2.5" stroke-linejoin="miter" stroke-miterlimit="8"/>
  <path d="M57,70 L65,70 L65,55 L50,31 L35,55 L35,70 L43,70"
        fill="none" stroke="${s}" stroke-width="2.5"
        stroke-linejoin="miter" stroke-miterlimit="8" stroke-linecap="round"/>
  <line x1="37" y1="63" x2="63" y2="63" stroke="${s}" stroke-width="2.5" stroke-linecap="round"/>`;

const COMPACT_PATHS = (s) => `
  <path d="M50,5 L95,43 L95,92 L5,92 L5,43 Z"
        fill="none" stroke="${s}" stroke-width="3.5" stroke-linejoin="miter" stroke-miterlimit="8"/>
  <path d="M60,76 L70,76 L70,54 L50,28 L30,54 L30,76 L40,76"
        fill="none" stroke="${s}" stroke-width="3.5"
        stroke-linejoin="miter" stroke-miterlimit="8" stroke-linecap="round"/>
  <line x1="32" y1="65" x2="68" y2="65" stroke="${s}" stroke-width="3.5" stroke-linecap="round"/>`;

const LOCKUP_MARK = (s) => `
  <path d="M150,5 L195,43 L195,92 L105,92 L105,43 Z"
        fill="none" stroke="${s}" stroke-width="2.8" stroke-linejoin="miter" stroke-miterlimit="8"/>
  <path d="M150,18 L182,44 L182,80 L118,80 L118,44 Z"
        fill="none" stroke="${s}" stroke-width="2.5" stroke-linejoin="miter" stroke-miterlimit="8"/>
  <path d="M157,70 L165,70 L165,55 L150,31 L135,55 L135,70 L143,70"
        fill="none" stroke="${s}" stroke-width="2.5"
        stroke-linejoin="miter" stroke-miterlimit="8" stroke-linecap="round"/>
  <line x1="137" y1="63" x2="163" y2="63" stroke="${s}" stroke-width="2.5" stroke-linecap="round"/>`;

// ── Text-to-path ──────────────────────────────────────────────────────────────
function buildTextPaths(font, text, cx, baselineY, size, letterSpacing) {
  // Measure total width with letter-spacing
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    total += font.charToGlyph(text[i]).advanceWidth / font.unitsPerEm * size;
    if (i < text.length - 1) total += letterSpacing;
  }
  let x = cx - total / 2;
  let combined = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    // Round x to 3 dp before getPath — prevents floating-point NaN in opentype.js
    // path calculation (fp accumulation can produce ~113.9560000000001728 which
    // triggers a NaN in certain glyph bezier computations).
    const xSnap = Math.round(x * 1000) / 1000;
    combined += font.getPath(ch, xSnap, baselineY, size).toPathData(2) + ' ';
    x += font.charToGlyph(ch).advanceWidth / font.unitsPerEm * size + letterSpacing;
  }
  return { d: combined.trim(), width: total };
}

async function buildWordmarkElement(wColor, subColor, ruleColor) {
  let font;
  try {
    const opentype = require(path.join(ROOT, 'avenstone-vite/node_modules/opentype.js'));
    const buf = fs.readFileSync(SERIF_TTF_PATH);
    font = opentype.parse(buf.buffer);
  } catch (e) {
    console.warn('  opentype.js unavailable — using <text> fallback:', e.message);
    return fallbackText(wColor, subColor, ruleColor);
  }

  // "AVENSTONE" — DM Serif Display 19px, letter-spacing 4px, baseline y=116
  const { d: wordD, width: ww } = buildTextPaths(font, 'AVENSTONE', 150, 116, 19, 4);

  // "GROUP" — DM Serif Display 8px, letter-spacing 3.5px, baseline y=132
  // Using the same serif font; looks clean and consistent at this small size
  const { d: subD, width: sw } = buildTextPaths(font, 'GROUP', 150, 132, 8, 3.5);

  // Flanking rules around GROUP, 6px gap + 26px rule each side
  const gap = 6, ruleLen = 26;
  const ruleY = 128;
  const rL = 150 - sw / 2 - gap;
  const rR = 150 + sw / 2 + gap;

  return `
  <path d="${wordD}" fill="${wColor}"/>
  <line x1="${(rL - ruleLen).toFixed(1)}" y1="${ruleY}" x2="${rL.toFixed(1)}" y2="${ruleY}" stroke="${ruleColor}" stroke-width="0.7"/>
  <line x1="${rR.toFixed(1)}" y1="${ruleY}" x2="${(rR + ruleLen).toFixed(1)}" y2="${ruleY}" stroke="${ruleColor}" stroke-width="0.7"/>
  <path d="${subD}" fill="${subColor}"/>`;
}

function fallbackText(wc, sc, rc) {
  return `
  <text x="150" y="116" font-family="'DM Serif Display',Georgia,serif"
        font-size="19" fill="${wc}" text-anchor="middle" letter-spacing="4">AVENSTONE</text>
  <line x1="90" y1="128" x2="114" y2="128" stroke="${rc}" stroke-width="0.7"/>
  <line x1="186" y1="128" x2="210" y2="128" stroke="${rc}" stroke-width="0.7"/>
  <text x="150" y="132" font-family="'DM Sans',system-ui,sans-serif"
        font-size="8" fill="${sc}" text-anchor="middle" letter-spacing="3.5">GROUP</text>`;
}

// ── SVG builders ──────────────────────────────────────────────────────────────
function bg(w, h, r = 14) {
  return `<rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${NAVY}"/>`;
}

function markSVG({ stroke, hasBg, compact }) {
  const paths = compact ? COMPACT_PATHS(stroke) : MARK_PATHS(stroke);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Avenstone mark">
${hasBg ? '  ' + bg(100, 100) : ''}${paths}
</svg>`;
}

async function lockupSVG({ markStroke, wordmark, sub, rule, hasBg }) {
  const text = await buildWordmarkElement(wordmark, sub, rule);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 148" role="img" aria-label="Avenstone Group">
${hasBg ? '  ' + bg(300, 148, 18) : ''}${LOCKUP_MARK(markStroke)}${text}
</svg>`;
}

// ── Variants ──────────────────────────────────────────────────────────────────
const MARK_V = [
  { suffix: '-navy',  stroke: GOLD,  hasBg: true  },
  { suffix: '-gold',  stroke: GOLD,  hasBg: false },
  { suffix: '-white', stroke: WHITE, hasBg: false },
  { suffix: '-dark',  stroke: NAVY,  hasBg: false },
];
const LOCK_V = [
  { suffix: '-navy',  markStroke: GOLD,  wordmark: WHITE, sub: GOLD,  rule: GOLD,  hasBg: true  },
  { suffix: '-gold',  markStroke: GOLD,  wordmark: GOLD,  sub: GOLD,  rule: GOLD,  hasBg: false },
  { suffix: '-white', markStroke: WHITE, wordmark: WHITE, sub: WHITE, rule: WHITE, hasBg: false },
  { suffix: '-dark',  markStroke: NAVY,  wordmark: NAVY,  sub: NAVY,  rule: NAVY,  hasBg: false },
];

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Downloading fonts…');
  try { await download(SERIF_TTF_URL, SERIF_TTF_PATH); console.log('  ✓ DMSerifDisplay-Regular.ttf'); }
  catch (e) { console.warn('  ⚠ Font download failed:', e.message); }

  const written = [];

  for (const v of MARK_V) {
    for (const compact of [false, true]) {
      const name = `avenstone-mark${compact ? '-compact' : ''}${v.suffix}.svg`;
      fs.writeFileSync(path.join(BRAND_DIR, name),
        markSVG({ stroke: v.stroke, hasBg: v.hasBg, compact }));
      written.push(name);
    }
  }

  for (const v of LOCK_V) {
    const name = `avenstone-lockup${v.suffix}.svg`;
    fs.writeFileSync(path.join(BRAND_DIR, name), await lockupSVG(v));
    written.push(name);
  }

  console.log(`\n✓ Wrote ${written.length} SVG files:`);
  written.forEach(f => console.log('  ' + f));
}

main().catch(e => { console.error(e); process.exit(1); });
