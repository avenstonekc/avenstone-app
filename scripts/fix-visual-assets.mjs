#!/usr/bin/env node
// Auto-fix the geometry-only failures the visual-asset validator reports.
//
// For every KALIN-row file that fails ONLY on geometry (non-square ±2% and/or
// >5MB) AND whose short side is >= 800px: center-crop to square, resize to exactly
// 800x800, re-encode PNG. The original is copied to <folder>/_originals/ FIRST, so
// nothing is destroyed (the validator ignores _originals — it's not top-level KALIN).
//
// NEVER upscales. Any file with short side < 800px is left untouched and listed as
// RE-SOURCE REQUIRED (pull full-res from the manufacturer page; the fixer squares it
// on the next run). Format problems (webp/heic) are not geometry — left for re-export.
//
// Image lib: `sharp` — already the monorepo's image library (avenstone-vite) and
// installed at root; native crop/resize is fast. Manifest-parse + spec thresholds
// mirror scripts/validate-visual-assets.mjs (the source of truth for the rules).
//
// Usage: node scripts/fix-visual-assets.mjs <folder>

import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { join, extname, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(HERE, '..', 'docs', 'arcs', 'VISUAL_ASSET_MANIFEST.md');
const VALIDATOR = join(HERE, 'validate-visual-assets.mjs');

const folder = process.argv[2];
if (!folder || !existsSync(folder) || !statSync(folder).isDirectory()) {
  console.error('Usage: node scripts/fix-visual-assets.mjs <folder>');
  process.exit(2);
}

// ── KALIN filenames from the manifest (mirrors the validator) ─────────────────
const FN_RE = /^`([a-z0-9_]+\.png)`$/;
const kalinFiles = new Set();
for (const line of readFileSync(MANIFEST, 'utf8').split('\n')) {
  if (!line.includes('|')) continue;
  const cells = line.split('|').map((c) => c.trim());
  const who = cells.find((c) => c === 'KALIN' || c === 'CLAUDE');
  const fnCell = cells.find((c) => FN_RE.test(c));
  if (who === 'KALIN' && fnCell) kalinFiles.add(fnCell.replace(/`/g, ''));
}

const BAD_FMT = new Set(['.webp', '.heic', '.heif']);
const origDir = join(folder, '_originals');

const fixed = [], resource = [], skipped = [];
const files = readdirSync(folder).filter((f) => statSync(join(folder, f)).isFile() && kalinFiles.has(f));

for (const f of files) {
  const full = join(folder, f);
  const ext = extname(f).toLowerCase();
  if (BAD_FMT.has(ext)) { skipped.push(`${f} (format ${ext} — re-export as PNG, not a geometry fix)`); continue; }

  let meta;
  try { meta = await sharp(readFileSync(full)).metadata(); }
  catch { skipped.push(`${f} (unreadable image)`); continue; }
  const w = meta.width, h = meta.height;
  if (!w || !h) { skipped.push(`${f} (no dimensions)`); continue; }

  const shortSide = Math.min(w, h);
  const nonSquare = Math.abs(w - h) / Math.max(w, h) > 0.02;
  const oversize = statSync(full).size > 5 * 1024 * 1024;

  if (shortSide < 800) {
    resource.push(`${f}  (${w}x${h} → need short side ≥ 800px; the fixer will square it to 800x800 next run)`);
    continue;
  }
  if (!nonSquare && !oversize && (w === 800 && h === 800)) { skipped.push(`${f} (already 800x800, spec-clean)`); continue; }
  if (!nonSquare && !oversize) { // square + not oversize but not 800 (e.g. 1000x1000) — a pure resize is still geometry
    // fall through to fix (resize down to 800x800)
  }

  // FIX: center-crop to square, resize 800x800, PNG. Preserve original first.
  try {
    const side = shortSide;
    const left = Math.floor((w - side) / 2);
    const top = Math.floor((h - side) / 2);
    const out = await sharp(readFileSync(full))
      .extract({ left, top, width: side, height: side })
      .resize(800, 800)
      .png({ compressionLevel: 9 })
      .toBuffer();
    if (out.length > 5 * 1024 * 1024) { skipped.push(`${f} (still >5MB after re-encode — unexpected, left as-is)`); continue; }
    if (!existsSync(origDir)) mkdirSync(origDir);
    const origPath = join(origDir, f);
    if (!existsSync(origPath)) copyFileSync(full, origPath); // keep the TRUE original once
    writeFileSync(full, out);
    fixed.push(`${f}  (${w}x${h} → 800x800)`);
  } catch (e) {
    skipped.push(`${f} (fix failed: ${e.message})`);
  }
}

// ── report ────────────────────────────────────────────────────────────────────
const out = [];
out.push(`VISUAL ASSET AUTO-FIX — ${folder}`);
out.push('');
out.push(`FIXED to 800x800 (originals saved to _originals/) (${fixed.length}):`);
fixed.sort().forEach((s) => out.push(`  - ${s}`));
out.push('');
out.push(`RE-SOURCE REQUIRED — short side < 800px, cannot upscale (${resource.length}):`);
resource.sort().forEach((s) => out.push(`  - ${s}`));
out.push('');
if (skipped.length) {
  out.push(`SKIPPED (${skipped.length}):`);
  skipped.sort().forEach((s) => out.push(`  - ${s}`));
  out.push('');
}
console.log(out.join('\n'));

// ── re-run the validator for the new counts ────────────────────────────────────
console.log('─── re-running validator ───\n');
const res = spawnSync(process.execPath, [VALIDATOR, folder], { encoding: 'utf8' });
process.stdout.write(res.stdout || '');
if (res.stderr) process.stderr.write(res.stderr);
process.exit(res.status ?? 0);
