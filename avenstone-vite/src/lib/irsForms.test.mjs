/**
 * Unit-check: W-4/W-9 signature + date draw rects fall inside each form's "Sign Here" y-band.
 * Cheap guard against a coordinate regression (e.g. the W-9 date drawing in the Certification
 * paragraph). Run: node avenstone-vite/src/lib/irsForms.test.mjs
 */
import assert from 'node:assert/strict';
import { SIG, SIG_YBAND } from './irsForms.js';

let passed = 0, failed = 0;
const test = (l, fn) => { try { fn(); console.log(`  ✓ ${l}`); passed++; } catch (e) { console.error(`  ✗ ${l}\n    ${e.message}`); failed++; } };

console.log('\nirsForms — signature/date within Sign Here block');
for (const form of ['w4', 'w9']) {
  const [lo, hi] = SIG_YBAND[form];
  const s = SIG[form].sig, d = SIG[form].date;
  test(`${form}: signature box bottom in band [${lo},${hi}]`, () => assert.ok(s.y >= lo && s.y <= hi, `sig.y=${s.y}`));
  test(`${form}: signature box top in band`, () => assert.ok(s.y + s.h >= lo && s.y + s.h <= hi, `sig top=${s.y + s.h}`));
  test(`${form}: date baseline in band`, () => assert.ok(d.y >= lo && d.y <= hi, `date.y=${d.y}`));
}

console.log(`\n${failed === 0 ? 'ALL GREEN' : 'FAILURES'} — ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
