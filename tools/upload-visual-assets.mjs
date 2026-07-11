#!/usr/bin/env node
// SCE Phase 4B — upload the visual option library to Supabase + bind options.
//
// 1. REFUSES to run unless scripts/validate-visual-assets.mjs exits 0 (the upload gate).
// 2. Uploads every PNG in the folder to the public scope-option-images bucket.
// 3. Upserts scope_option_images binding rows by matching each filename against the LIVE
//    scope_checklists (project_type, field_key, option). univ_ files bind project_type=NULL.
//    Filenames that match no live option are uploaded anyway and listed as orphans.
//
// Creds: Management PAT (C:/Users/Kalin/supabase-token.txt) → fetches the service_role key
// at runtime for storage writes and runs the binding upserts. The key is never printed/saved.
//
// Usage: node tools/upload-visual-assets.mjs [folder]   (default C:/Users/Kalin/Avenstone-Assets)

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import https from 'node:https';

const HERE = dirname(fileURLToPath(import.meta.url));
const VALIDATOR = join(HERE, '..', 'scripts', 'validate-visual-assets.mjs');
const REF = 'cbfftukmhqvvjlrlnltk';
const BUCKET = 'scope-option-images';
const PAT = readFileSync('C:/Users/Kalin/supabase-token.txt', 'utf8').trim();
const FOLDER = process.argv[2] || 'C:/Users/Kalin/Avenstone-Assets';

// prefix → scope_checklists.project_type (univ → NULL, shared). From the manifest §1.
const PREFIX_PT = { bath: 'bathroom', kitch: 'kitchen', deck: 'deck', addn: 'addition', roof: 'roof', fence: 'fence', bsmt: 'basement', ext: 'exterior' };
// univ_ field tokens (manifest §11), longest-first so floor_layout beats floor.
const UNIV_FIELDS = ['floor_layout', 'casing', 'floor', 'crown', 'door', 'base'];

const mgmt = (path, method, body) => new Promise((res, rej) => {
  const b = body ? JSON.stringify(body) : null;
  const r = https.request({ hostname: 'api.supabase.com', path, method, headers: { Authorization: `Bearer ${PAT}`, ...(b ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b) } : {}) } },
    (x) => { let d = ''; x.on('data', (c) => (d += c)); x.on('end', () => res({ status: x.statusCode, body: d })); });
  r.on('error', rej); if (b) r.write(b); r.end();
});
const sql = async (q) => { const r = await mgmt(`/v1/projects/${REF}/database/query`, 'POST', { query: q }); if (r.status >= 400) throw new Error(r.body); return JSON.parse(r.body); };
const uploadObject = (serviceKey, path, buf) => new Promise((res, rej) => {
  const r = https.request({ hostname: `${REF}.supabase.co`, path: `/storage/v1/object/${BUCKET}/${encodeURIComponent(path)}`, method: 'POST',
    headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'image/png', 'x-upsert': 'true', 'Content-Length': buf.length } },
    (x) => { let d = ''; x.on('data', (c) => (d += c)); x.on('end', () => res({ status: x.statusCode, body: d })); });
  r.on('error', rej); r.write(buf); r.end();
});

// ── 1. GATE: validator must exit 0 ─────────────────────────────────────────────
const gate = spawnSync(process.execPath, [VALIDATOR, FOLDER], { encoding: 'utf8' });
if (gate.status !== 0) {
  console.error(`REFUSING to upload — validator did not exit 0 (status ${gate.status}). Fix the punch list first:\n`);
  console.error(gate.stdout || gate.stderr);
  process.exit(2);
}
console.log('Validator gate: PASS (exit 0).\n');

// ── 2. service_role key (never logged) ─────────────────────────────────────────
const keysRes = await mgmt(`/v1/projects/${REF}/api-keys`, 'GET');
const serviceKey = JSON.parse(keysRes.body).find((k) => k.name === 'service_role')?.api_key;
if (!serviceKey) { console.error('Could not fetch service_role key via PAT.'); process.exit(1); }

// ── 3. live checklist (choice fields, all types) ───────────────────────────────
const rows = await sql("SELECT project_type, field_key, options FROM scope_checklists WHERE tenant_id IS NULL AND field_type='choice'");
const byType = {};
for (const r of rows) { (byType[r.project_type] ||= []).push({ field_key: r.field_key, options: r.options || [] }); }

function matchImage(stem) {
  const us = stem.indexOf('_');
  const prefix = stem.slice(0, us), body = stem.slice(us + 1);
  if (prefix === 'univ') {
    for (const f of UNIV_FIELDS) if (body.startsWith(f + '_')) return { project_type: null, field_key: f, option_key: body.slice(f.length + 1) };
    return null;
  }
  const pt = PREFIX_PT[prefix];
  if (!pt) return null;
  const fields = byType[pt] || [];
  for (const F of fields) for (const o of F.options) if (body === `${F.field_key}_${o}`) return { project_type: pt, field_key: F.field_key, option_key: o };
  const cands = [];
  for (const F of fields) for (const o of F.options) if (body.endsWith(`_${o}`)) cands.push({ project_type: pt, field_key: F.field_key, option_key: o });
  return cands.length === 1 ? cands[0] : null; // unique option-suffix, else orphan
}

// ── 4. upload + resolve bindings ───────────────────────────────────────────────
const files = readdirSync(FOLDER).filter((f) => f.endsWith('.png') && statSync(join(FOLDER, f)).isFile());
const bindings = [], orphans = [];
let uploaded = 0, uploadFail = 0;
for (const f of files) {
  const buf = readFileSync(join(FOLDER, f));
  const up = await uploadObject(serviceKey, f, buf);
  if (up.status >= 200 && up.status < 300) uploaded++;
  else { uploadFail++; console.log(`  upload FAILED ${f}: HTTP ${up.status} ${up.body.slice(0, 100)}`); continue; }
  const m = matchImage(f.replace(/\.png$/, ''));
  if (m) bindings.push({ ...m, storage_path: f });
  else orphans.push(f);
}
console.log(`Uploaded ${uploaded}/${files.length} to ${BUCKET}${uploadFail ? ` (${uploadFail} failed)` : ''}.`);

// ── 5. upsert bindings ─────────────────────────────────────────────────────────
if (bindings.length) {
  const esc = (s) => s.replace(/'/g, "''");
  const vals = bindings.map((b) => `(${b.project_type ? `'${esc(b.project_type)}'` : 'NULL'}, '${esc(b.field_key)}', '${esc(b.option_key)}', '${esc(b.storage_path)}', true)`).join(',\n');
  await sql(`INSERT INTO scope_option_images (project_type, field_key, option_key, storage_path, active) VALUES\n${vals}\nON CONFLICT (project_type, field_key, option_key) DO UPDATE SET storage_path=EXCLUDED.storage_path, active=true;`);
}

// ── report ──────────────────────────────────────────────────────────────────────
const objCount = JSON.parse((await mgmt(`/v1/projects/${REF}/database/query`, 'POST', { query: `SELECT count(*) n FROM storage.objects WHERE bucket_id='${BUCKET}'` })).body)[0].n;
const rowCount = (await sql('SELECT count(*) n FROM scope_option_images'))[0].n;
console.log(`\n── SUMMARY ──`);
console.log(`bucket objects: ${objCount}`);
console.log(`binding rows:   ${rowCount} (${bindings.length} upserted this run)`);
console.log(`orphans (uploaded, no confident binding): ${orphans.length}`);
orphans.sort().forEach((o) => console.log(`  - ${o}`));
process.exit(uploadFail ? 1 : 0);
