#!/usr/bin/env node
// Visual-asset upload gate for the SCE Phase 4B Visual Option Library.
//
// Parses docs/arcs/VISUAL_ASSET_MANIFEST.md (the LOCKED source of filenames),
// collects the KALIN-owned filenames (photos Kalin sources), and validates a
// folder of files against them — MISSING / MISNAMED / EXTRA / BAD SPECS / READY.
// CLAUDE-owned illustrations are ignored for the punch list, but a CLAUDE-named
// file appearing in Kalin's folder is flagged.
//
// Usage:  node scripts/validate-visual-assets.mjs <folder>
// Exit 0 ONLY when MISSING, MISNAMED, and BAD SPECS are all zero (the upload gate).
// EXTRA files and CLAUDE-named files are reported but do NOT block.
//
// Image dimensions: `image-size` (tiny, pure-JS, header-only read). Named in
// package.json devDependencies.
//
// Spec (from the manifest §1): PNG, square 800×800. This validator enforces:
//   square (±2%), short side ≥ 800px, ≤ 5MB, format not webp/heic.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, extname, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageSize } from 'image-size';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(HERE, '..', 'docs', 'arcs', 'VISUAL_ASSET_MANIFEST.md');

// ── args ──────────────────────────────────────────────────────────────────────
const folder = process.argv[2];
if (!folder) {
  console.error('Usage: node scripts/validate-visual-assets.mjs <folder>');
  process.exit(2);
}
if (!existsSync(folder) || !statSync(folder).isDirectory()) {
  console.error(`Not a folder: ${folder}`);
  process.exit(2);
}

// ── parse the manifest tables ───────────────────────────────────────────────
// A valid asset row has a Who cell (KALIN|CLAUDE) and a backtick-wrapped *.png
// filename cell. The tally (§12) and prefix table (§1) have neither → skipped.
const FN_RE = /^`([a-z0-9_]+\.png)`$/;
const kalin = new Map(); // stem → exact filename
const claude = new Map();
for (const line of readFileSync(MANIFEST, 'utf8').split('\n')) {
  if (!line.includes('|')) continue;
  const cells = line.split('|').map((c) => c.trim());
  const who = cells.find((c) => c === 'KALIN' || c === 'CLAUDE');
  const fnCell = cells.find((c) => FN_RE.test(c));
  if (!who || !fnCell) continue;
  const filename = fnCell.replace(/`/g, '');
  const stem = filename.slice(0, -4); // drop .png
  (who === 'KALIN' ? kalin : claude).set(stem, filename);
}

// ── helpers ─────────────────────────────────────────────────────────────────
const norm = (name) =>
  basename(name, extname(name)).toLowerCase().replace(/[\s-]+/g, '_').replace(/_+/g, '_');

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

// Fuzzy-match a folder file's normalized stem to an expected set (case / spaces /
// extension / close typo). Returns the exact expected filename or null.
function fuzzyMatch(nstem, expectedMap) {
  if (expectedMap.has(nstem)) return expectedMap.get(nstem); // same stem, wrong case/ext/spaces
  let best = null, bestD = Infinity;
  for (const [stem, file] of expectedMap) {
    const d = levenshtein(nstem, stem);
    if (d < bestD) { bestD = d; best = file; }
  }
  return bestD <= 2 ? best : null; // close typo
}

const BAD_FMT = new Set(['.webp', '.heic', '.heif']);
function checkSpecs(fullPath, filename) {
  const reasons = [];
  const ext = extname(filename).toLowerCase();
  if (BAD_FMT.has(ext)) reasons.push(`format ${ext} (need .png)`);
  const bytes = statSync(fullPath).size;
  if (bytes > 5 * 1024 * 1024) reasons.push(`${(bytes / 1048576).toFixed(1)}MB > 5MB`);
  let dims = null;
  try { dims = imageSize(readFileSync(fullPath)); } catch { reasons.push('could not read image dimensions'); }
  if (dims?.width && dims?.height) {
    const { width: w, height: h } = dims;
    if (Math.abs(w - h) / Math.max(w, h) > 0.02) reasons.push(`${w}x${h} not square (>2%)`);
    if (Math.min(w, h) < 800) reasons.push(`short side ${Math.min(w, h)}px < 800`);
  }
  return { ok: reasons.length === 0, reasons };
}

// ── classify folder files ────────────────────────────────────────────────────
const files = readdirSync(folder).filter((f) => statSync(join(folder, f)).isFile());
const kalinExact = new Map([...kalin.values()].map((f) => [f, true]));
const claudeExact = new Set(claude.values());

const missing = [], misnamed = [], extra = [], badSpecs = [], ready = [], claudeFlag = [];
const matchedKalinStems = new Set();

for (const f of files) {
  const full = join(folder, f);
  if (kalinExact.has(f)) { // exact KALIN name
    matchedKalinStems.add(norm(f));
    const spec = checkSpecs(full, f);
    if (spec.ok) ready.push(f);
    else badSpecs.push({ file: f, reasons: spec.reasons });
    continue;
  }
  if (claudeExact.has(f)) { claudeFlag.push({ file: f, note: 'exact CLAUDE asset name' }); continue; }

  const nstem = norm(f);
  const kMatch = fuzzyMatch(nstem, kalin);
  if (kMatch) {
    matchedKalinStems.add(norm(kMatch));
    const spec = checkSpecs(full, f);
    const extraReasons = spec.ok ? '' : ` — also fails specs: ${spec.reasons.join('; ')}`;
    misnamed.push({ actual: f, expected: kMatch, extra: extraReasons });
    continue;
  }
  const cMatch = fuzzyMatch(nstem, claude);
  if (cMatch) { claudeFlag.push({ file: f, note: `fuzzy-matches CLAUDE ${cMatch}` }); continue; }
  extra.push(f);
}

for (const [stem, file] of kalin) if (!matchedKalinStems.has(stem)) missing.push(file);

// ── report ────────────────────────────────────────────────────────────────────
const kalinTotal = kalin.size;
const pct = kalinTotal ? Math.round((ready.length / kalinTotal) * 100) : 0;
const sortF = (a, b) => a.localeCompare(b);
const L = [];
L.push(`VISUAL ASSET VALIDATOR — ${folder}`);
L.push(`Manifest: ${kalinTotal} KALIN assets expected · ${claude.size} CLAUDE illustrations (ignored for punch list)`);
L.push('');
L.push(`MISSING (${missing.length}) — expected KALIN photo, no file found:`);
missing.sort(sortF).forEach((f) => L.push(`  - ${f}`));
L.push('');
L.push(`MISNAMED (${misnamed.length}) — a file that should be renamed:`);
misnamed.sort((a, b) => a.actual.localeCompare(b.actual)).forEach((m) => L.push(`  - "${m.actual}"  →  rename to  ${m.expected}${m.extra}`));
L.push('');
L.push(`BAD SPECS (${badSpecs.length}) — correctly named but off-spec:`);
badSpecs.sort((a, b) => a.file.localeCompare(b.file)).forEach((b) => L.push(`  - ${b.file}: ${b.reasons.join('; ')}`));
L.push('');
L.push(`EXTRA (${extra.length}) — in the folder, match nothing in the manifest:`);
extra.sort(sortF).forEach((f) => L.push(`  - ${f}`));
L.push('');
L.push(`CLAUDE-NAMED FILES PRESENT (${claudeFlag.length}) — Claude-generated, not Kalin's to upload:`);
claudeFlag.sort((a, b) => a.file.localeCompare(b.file)).forEach((c) => L.push(`  - ${c.file}  (${c.note})`));
L.push('');
L.push(`READY: ${ready.length} / ${kalinTotal} KALIN assets (${pct}%)`);
L.push('');

const blocked = missing.length + misnamed.length + badSpecs.length;
if (blocked === 0) {
  L.push('RESULT: READY ✓ — all KALIN assets present, named, spec-clean. Exit 0.');
} else {
  L.push(`RESULT: BLOCKED ✗ — ${missing.length} missing, ${misnamed.length} misnamed, ${badSpecs.length} bad spec. Nothing uploads to the bucket until this exits 0.`);
}
console.log(L.join('\n'));
process.exit(blocked === 0 ? 0 : 1);
