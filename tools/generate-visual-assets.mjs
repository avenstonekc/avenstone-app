#!/usr/bin/env node
// Generate the full visual-option library via the Gemini image API.
//
// Owner decision (2026-07-10): ALL 195 assets (139 CLAUDE + 56 KALIN manifest
// rows) are AI-generated in one style; the photo-sourcing split is retired.
//
// Subjects + locked style_prefix: tools/image_gen_subjects.json (filenames are the
// LOCKED VISUAL_ASSET_MANIFEST.md names). Prompt per image = style_prefix + subject.
//
// Model: gemini-3.1-flash-image (the current recommended general-purpose flash image
// model — best quality/cost balance for 195 client-facing cards; --model to override).
// All Gemini image models use :generateContent (verified via ListModels on the key).
// Output image bytes come back at candidates[].content.parts[].inlineData.data (base64).
//
// RESUMABLE: skips any filename already present at target spec (1024x1024 PNG), so a
// re-run only fills gaps. --regen <filename> forces one file (the retouch loop).
//
// Rate limits: exponential backoff on 429 rate errors. If the key is free-tier (image
// quota limit: 0) or the daily cap is hit, it exits cleanly with a resume/billing
// message and the remaining count — nothing partial is corrupted.
//
// Key: C:/Users/Kalin/gemini-key.txt (never printed/logged/committed).
// Output: C:/Users/Kalin/Avenstone-Assets (outside the repo — images are NOT committed).
//
// Usage:
//   node tools/generate-visual-assets.mjs                 # fill all gaps
//   node tools/generate-visual-assets.mjs --regen bath_glass_frameless.png
//   node tools/generate-visual-assets.mjs --model gemini-3.1-flash-lite-image

import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import https from 'node:https';
import sharp from 'sharp';

const HERE = dirname(fileURLToPath(import.meta.url));
const SUBJECTS = join(HERE, 'image_gen_subjects.json');
const KEY_FILE = 'C:/Users/Kalin/gemini-key.txt';
const OUT_DIR = 'C:/Users/Kalin/Avenstone-Assets';

// ── args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getFlag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const MODEL = getFlag('--model') || 'gemini-3.1-flash-image';
const REGEN = getFlag('--regen'); // single filename to force
const OUT = getFlag('--out') || OUT_DIR;

const key = readFileSync(KEY_FILE, 'utf8').trim();
if (!key) { console.error('Empty API key at ' + KEY_FILE); process.exit(2); }
const { style_prefix, images } = JSON.parse(readFileSync(SUBJECTS, 'utf8'));
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const TARGET = 1024;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const safeJson = (s) => { try { return JSON.parse(s); } catch { return {}; } };

// ── one generateContent call ───────────────────────────────────────────────────
function callGemini(prompt) {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '1:1' } },
  });
  return new Promise((res, rej) => {
    const r = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${MODEL}:generateContent`,
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (x) => { let d = ''; x.on('data', (c) => (d += c)); x.on('end', () => res({ status: x.statusCode, body: d })); });
    r.on('error', rej); r.write(body); r.end();
  });
}

// Returns a PNG Buffer, or throws { freeTier } / { dailyCap } / { fatal }.
async function generateImage(prompt) {
  for (let attempt = 0; ; attempt++) {
    const r = await callGemini(prompt);
    if (r.status === 200) {
      const j = safeJson(r.body);
      const parts = j.candidates?.[0]?.content?.parts || [];
      const img = parts.find((p) => p.inlineData?.data);
      if (img) return Buffer.from(img.inlineData.data, 'base64');
      const reason = j.candidates?.[0]?.finishReason || 'no image part';
      throw { fatal: `no image returned (finishReason: ${reason})` };
    }
    if (r.status === 429) {
      const msg = safeJson(r.body).error?.message || '';
      if (/limit:\s*0/i.test(msg)) throw { freeTier: true, msg }; // image gen not on free tier
      if (attempt >= 6) throw { dailyCap: true, msg };            // sustained rate exhaustion
      const m = msg.match(/retry in ([\d.]+)s/i);
      const waitS = m ? Math.min(Math.ceil(parseFloat(m[1])), 90) : Math.min(2 ** attempt, 60);
      await sleep(waitS * 1000);
      continue;
    }
    throw { fatal: `HTTP ${r.status}: ${(safeJson(r.body).error?.message || r.body || '').slice(0, 200)}` };
  }
}

// center-crop to square → 1024×1024 PNG, exact filename
async function saveSquare(buf, filename) {
  const meta = await sharp(buf).metadata();
  const side = Math.min(meta.width, meta.height);
  const left = Math.floor((meta.width - side) / 2), top = Math.floor((meta.height - side) / 2);
  await sharp(buf).extract({ left, top, width: side, height: side }).resize(TARGET, TARGET).png().toFile(join(OUT, filename));
}

async function alreadyGood(filename) {
  const p = join(OUT, filename);
  if (!existsSync(p)) return false;
  try { const m = await sharp(p).metadata(); return m.format === 'png' && m.width === TARGET && m.height === TARGET; } catch { return false; }
}

// ── run ─────────────────────────────────────────────────────────────────────────
const allNames = Object.keys(images);
let todo;
if (REGEN) {
  if (!images[REGEN]) { console.error(`--regen: "${REGEN}" is not in the subjects list.`); process.exit(2); }
  todo = [REGEN];
} else {
  todo = [];
  for (const f of allNames) if (!(await alreadyGood(f))) todo.push(f);
}
const total = allNames.length;
const skipped = total - (REGEN ? 1 : todo.length);
console.log(`Model: ${MODEL} · output: ${OUT}`);
console.log(`${total} assets · ${skipped} already present · ${todo.length} to generate${REGEN ? ' (--regen)' : ''}\n`);

let done = 0, failed = 0;
for (const filename of todo) {
  const prompt = `${style_prefix} ${images[filename]}`;
  try {
    const buf = await generateImage(prompt);
    await saveSquare(buf, filename);
    done++;
    console.log(`[${skipped + done}/${total}] saved ${filename}`);
  } catch (e) {
    if (e.freeTier) {
      console.log(`\n⛔ Image generation is not available on this key's FREE tier (quota limit: 0).`);
      console.log(`   Enable billing on the Google Cloud project behind the key (https://aistudio.google.com → Get API key → enable billing),`);
      console.log(`   then re-run — it resumes and fills the remaining ${todo.length - done} of ${total}.`);
      process.exit(3);
    }
    if (e.dailyCap) {
      console.log(`\n⛔ Rate/daily cap hit after ${done} this run. Resume tomorrow (or raise the quota / enable billing).`);
      console.log(`   Re-run to continue — ${todo.length - done} of ${total} remaining.`);
      process.exit(3);
    }
    failed++;
    console.log(`[--/${total}] FAILED ${filename}: ${e.fatal || e.msg || e}`);
  }
}

console.log(`\nDone. generated ${done}, skipped ${skipped}, failed ${failed}, of ${total}.`);
process.exit(failed ? 1 : 0);
