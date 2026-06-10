#!/usr/bin/env node
/**
 * audit_hex.js — count raw hex color literals in src/ style props.
 *
 * Exits 0  when current count <= baseline.
 * Exits 1  when current count > baseline (design debt is growing — fix before merging).
 * Exits 2  on usage / IO error.
 *
 * Usage:
 *   node tools/audit_hex.js            # compare against tools/baseline.json
 *   node tools/audit_hex.js --set      # write current count as new baseline
 *   node tools/audit_hex.js --report   # print per-file breakdown, no exit-code gate
 */

const fs   = require('fs');
const path = require('path');

const ROOT     = path.resolve(__dirname, '..');
const SRC_DIR  = path.join(ROOT, 'avenstone-vite', 'src');
const BASELINE = path.join(__dirname, 'baseline.json');

// Matches '#RRGGBB' and '#RGB' inside single-quoted JS strings in style objects.
// Does NOT match CSS class files (tokens.css etc) — those are by design.
const HEX_RE = /'#[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{3})?'/g;

function scan(dir, counts = {}) {
  for (const entry of fs.readdirSync(dir)) {
    const fp = path.join(dir, entry);
    const stat = fs.statSync(fp);
    if (stat.isDirectory()) { scan(fp, counts); continue; }
    const ext = path.extname(fp);
    if (!['.jsx', '.tsx', '.js', '.ts'].includes(ext)) continue;
    const src = fs.readFileSync(fp, 'utf8');
    const hits = (src.match(HEX_RE) || []).length;
    if (hits > 0) counts[path.relative(SRC_DIR, fp)] = hits;
  }
  return counts;
}

const args = process.argv.slice(2);
const setMode    = args.includes('--set');
const reportMode = args.includes('--report');

let counts;
try { counts = scan(SRC_DIR); }
catch (e) { console.error('scan failed:', e.message); process.exit(2); }

const total = Object.values(counts).reduce((s, n) => s + n, 0);

if (setMode) {
  fs.writeFileSync(BASELINE, JSON.stringify({ total, updatedAt: new Date().toISOString() }, null, 2));
  console.log(`✓ Baseline set: ${total} hex literals.`);
  process.exit(0);
}

if (reportMode) {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  console.log(`Hex literal count: ${total}\n`);
  for (const [file, n] of sorted.slice(0, 20)) console.log(`  ${n.toString().padStart(4)}  ${file}`);
  process.exit(0);
}

// Gate mode: compare against baseline
let baseline;
try { baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8')); }
catch { console.error('baseline.json missing — run `npm run audit:hex -- --set` first.'); process.exit(2); }

const diff = total - baseline.total;
if (diff > 0) {
  console.error(`✗ Hex literals grew: ${total} (was ${baseline.total}, +${diff}). Fix before closing this UI slice.`);
  process.exit(1);
}
console.log(`✓ Hex literals: ${total} (baseline ${baseline.total}${diff < 0 ? ', -' + Math.abs(diff) + ' improvement' : ''}).`);
process.exit(0);
