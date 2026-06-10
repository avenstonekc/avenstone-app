#!/usr/bin/env node
/**
 * gen_brand_assets.js — renders brand SVGs to raster exports.
 *
 * Requires:  npm install --save-dev sharp  (in avenstone-vite/)
 * Run from repo root: node tools/gen_brand_assets.js
 *
 * Outputs:
 *   public/favicon.ico              — 32×32 + 16×16 ICO (from compact mark -navy)
 *   public/apple-touch-icon.png     — 180×180 PNG
 *   public/icon-192.png             — 192×192 PNG
 *   public/icon-512.png             — 512×512 PNG
 *   assets-src/ios-icon-1024.png    — 1024×1024 full-bleed navy, mark ~65% canvas
 *   src/assets/brand/logo-pdf@2x.png— 600px wide, lockup white-knockout on transparent
 */

const fs   = require('fs');
const path = require('path');

const ROOT       = path.join(__dirname, '..');
const BRAND_DIR  = path.join(ROOT, 'avenstone-vite/src/assets/brand');
const PUBLIC_DIR = path.join(ROOT, 'avenstone-vite/public');
const ASSETS_SRC = path.join(ROOT, 'assets-src');

let sharp;
try {
  sharp = require(path.join(ROOT, 'avenstone-vite/node_modules/sharp'));
} catch {
  console.error('sharp not found. Run: cd avenstone-vite && npm install --save-dev sharp');
  process.exit(1);
}

const NAVY = '#0A1F44';
const GOLD = '#C9A84C';

// ── SVG wrapper for iOS 1024 icon (full-bleed navy square, mark at 65% canvas)
function buildIosIconSvg(size) {
  const markSize = Math.round(size * 0.65);
  const offset   = Math.round((size - markSize) / 2);
  const scale    = markSize / 100;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${NAVY}"/>
  <g transform="translate(${offset},${offset}) scale(${scale})">
    <!-- Outer house -->
    <path d="M50,8 L90,44 L90,90 L10,90 L10,44 Z"
          fill="none" stroke="${GOLD}" stroke-width="3.5"
          stroke-linejoin="miter" stroke-miterlimit="8"/>
    <!-- Inner A (compact) -->
    <path d="M50,26 L72,50 L72,83 L62,83 M38,83 L28,83 L28,50 Z"
          fill="none" stroke="${GOLD}" stroke-width="3.5"
          stroke-linejoin="miter" stroke-miterlimit="8"
          stroke-linecap="round"/>
    <!-- A crossbar -->
    <line x1="34" y1="67" x2="66" y2="67"
          stroke="${GOLD}" stroke-width="3.5" stroke-linecap="round"/>
  </g>
</svg>`;
}

async function renderSvgToPng(svgPath, outPath, width, height) {
  const svgBuf = fs.readFileSync(svgPath);
  await sharp(svgBuf, { density: Math.round(72 * width / 100) })
    .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outPath);
  console.log(`  ✓ ${path.relative(ROOT, outPath)} (${width}×${height})`);
}

async function renderSvgStringToPng(svgStr, outPath, width, height) {
  const buf = Buffer.from(svgStr);
  await sharp(buf, { density: Math.round(72 * width / 100) })
    .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outPath);
  console.log(`  ✓ ${path.relative(ROOT, outPath)} (${width}×${height})`);
}

async function buildIco(pngPath32, pngPath16, outPath) {
  // Build minimal ICO: 2-image ICO file (32×32 + 16×16)
  // ICO format: 6-byte header, N×16-byte dir entries, then PNG data
  const png32 = fs.readFileSync(pngPath32);
  const png16 = fs.readFileSync(pngPath16);

  const headerSize  = 6;
  const entrySize   = 16;
  const dirSize     = entrySize * 2;
  const data0offset = headerSize + dirSize;
  const data1offset = data0offset + png32.length;

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);   // reserved
  header.writeUInt16LE(1, 2);   // type = ICO
  header.writeUInt16LE(2, 4);   // count = 2

  function dirEntry(w, h, dataLen, offset) {
    const e = Buffer.alloc(16);
    e.writeUInt8(w === 256 ? 0 : w, 0);  // width (0 = 256)
    e.writeUInt8(h === 256 ? 0 : h, 1);  // height
    e.writeUInt8(0, 2);   // colour count
    e.writeUInt8(0, 3);   // reserved
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bit count
    e.writeUInt32LE(dataLen, 8);
    e.writeUInt32LE(offset, 12);
    return e;
  }

  const ico = Buffer.concat([
    header,
    dirEntry(32, 32, png32.length, data0offset),
    dirEntry(16, 16, png16.length, data1offset),
    png32,
    png16,
  ]);

  fs.writeFileSync(outPath, ico);
  console.log(`  ✓ ${path.relative(ROOT, outPath)} (ICO 32+16)`);
}

async function main() {
  console.log('Generating brand raster exports…\n');

  const compactNavy = path.join(BRAND_DIR, 'avenstone-mark-compact-navy.svg');
  const lockupWhite = path.join(BRAND_DIR, 'avenstone-lockup-white.svg');

  const tmp32  = path.join(ASSETS_SRC, '_favicon32.png');
  const tmp16  = path.join(ASSETS_SRC, '_favicon16.png');

  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  fs.mkdirSync(ASSETS_SRC,  { recursive: true });

  // ── App icons (compact mark on navy) ────────────────────────────────────
  await renderSvgToPng(compactNavy, path.join(PUBLIC_DIR, 'apple-touch-icon.png'), 180, 180);
  await renderSvgToPng(compactNavy, path.join(PUBLIC_DIR, 'icon-192.png'),         192, 192);
  await renderSvgToPng(compactNavy, path.join(PUBLIC_DIR, 'icon-512.png'),         512, 512);

  // ── Favicon (temp PNGs → ICO) ────────────────────────────────────────────
  await renderSvgToPng(compactNavy, tmp32, 32, 32);
  await renderSvgToPng(compactNavy, tmp16, 16, 16);
  await buildIco(tmp32, tmp16, path.join(PUBLIC_DIR, 'favicon.ico'));
  fs.unlinkSync(tmp32);
  fs.unlinkSync(tmp16);

  // ── iOS 1024 (full-bleed navy, 65% canvas mark) ─────────────────────────
  const iosSvg = buildIosIconSvg(1024);
  await renderSvgStringToPng(iosSvg, path.join(ASSETS_SRC, 'ios-icon-1024.png'), 1024, 1024);

  // ── PDF lockup (white-knockout, 600px wide) ──────────────────────────────
  await renderSvgToPng(lockupWhite,
    path.join(BRAND_DIR, 'logo-pdf@2x.png'), 600, Math.round(600 * 155 / 300));

  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });
