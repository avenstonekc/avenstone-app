'use strict';
// Dry-run backfill: detects job_lidar_scans rows whose stored rings are self-intersecting
// (corrupted by the old greedy walk) and re-normalizes them with the fixed algorithm.
//
// Usage (from repo root):
//   node scripts/backfill-normalize-rings.js           # dry run — report only
//   node scripts/backfill-normalize-rings.js --write   # apply fixes to DB

const fs = require('fs');
const path = require('path');
const https = require('https');
const { pathToFileURL } = require('url');

const WRITE_MODE  = process.argv.includes('--write');
const PAT_PATH    = 'C:/Users/Kalin/supabase-token.txt';
const PROJECT_REF = 'cbfftukmhqvvjlrlnltk';

const isTTY = process.stdout.isTTY;
const C = {
  red:    s => isTTY ? `\x1b[31m${s}\x1b[0m` : s,
  green:  s => isTTY ? `\x1b[32m${s}\x1b[0m` : s,
  yellow: s => isTTY ? `\x1b[33m${s}\x1b[0m` : s,
  bold:   s => isTTY ? `\x1b[1m${s}\x1b[0m`  : s,
  gray:   s => isTTY ? `\x1b[90m${s}\x1b[0m` : s,
};

function dbQuery(pat, sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const options = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`API ${res.statusCode}: ${JSON.stringify(parsed)}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`JSON parse error — raw: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  console.log(C.bold('\n=== normalize ring backfill ==='));
  console.log(WRITE_MODE ? C.yellow('  MODE: WRITE (fixes will be applied)') : C.gray('  MODE: DRY RUN (no DB writes)'));
  console.log('');

  const pat = fs.readFileSync(PAT_PATH, 'utf8').trim();

  // Dynamic import of the fixed normalize.js (ES module)
  const normalizePath = pathToFileURL(
    path.resolve(__dirname, '../avenstone-vite/src/lib/floorPlan/normalize.js')
  ).href;
  const { normalizeFloorPlan, isPolygonSelfIntersecting } = await import(normalizePath);

  // ── Query job_lidar_scans ────────────────────────────────────────────────────
  console.log(C.bold('Scanning job_lidar_scans...'));
  const scanRows = await dbQuery(pat, `
    SELECT id, tenant_id, rooms, normalized_geometry
    FROM job_lidar_scans
    WHERE normalized_geometry IS NOT NULL
    ORDER BY created_at DESC
  `);

  let scansChecked = 0, scansCorrupted = 0, scansFixed = 0, scansSkipped = 0;

  for (const row of scanRows) {
    scansChecked++;
    const ng = row.normalized_geometry;
    if (!ng || !Array.isArray(ng.rooms)) { scansSkipped++; continue; }

    const corruptedRooms = ng.rooms.filter(r =>
      Array.isArray(r.polygon) && isPolygonSelfIntersecting(r.polygon)
    );

    if (corruptedRooms.length === 0) continue;

    scansCorrupted++;
    const beforeAreas = corruptedRooms.map(r => ({ id: r.id, name: r.name, area: r.area_sqft }));

    const rawScan = {
      rooms: row.rooms ?? [],
      scanner_version: null,
    };
    const fixed = normalizeFloorPlan(rawScan);
    if (!fixed.ok) {
      console.error(C.red(`  [SKIP] scan ${row.id}: re-normalize failed — ${fixed.error}`));
      scansSkipped++;
      continue;
    }

    const afterAreas = corruptedRooms.map(r => {
      const fixedRoom = fixed.data.rooms.find(fr => fr.id === r.id);
      return { id: r.id, name: r.name, area: fixedRoom?.area_sqft ?? '?' };
    });

    const needsReviewRooms = fixed.data.rooms.filter(r => r.needs_review);

    console.log(C.yellow(`  [CORRUPTED] scan ${row.id} (tenant ${row.tenant_id})`));
    for (let i = 0; i < beforeAreas.length; i++) {
      const b = beforeAreas[i], a = afterAreas[i];
      console.log(`    room ${b.id} "${b.name}": ${b.area} sqft → ${a.area} sqft`);
    }
    if (needsReviewRooms.length > 0) {
      console.log(C.yellow(`    needs_review rooms: ${needsReviewRooms.map(r => r.id).join(', ')}`));
    }

    if (WRITE_MODE) {
      const jsonb = JSON.stringify(fixed.data);
      await dbQuery(pat, `
        UPDATE job_lidar_scans
        SET normalized_geometry = $${jsonb}$::jsonb
        WHERE id = '${row.id}'
          AND tenant_id = '${row.tenant_id}'
      `);
      console.log(C.green(`    → written`));
      scansFixed++;
    }
  }

  console.log('');
  console.log(C.bold('job_lidar_scans:'));
  console.log(`  checked: ${scansChecked}, corrupted: ${scansCorrupted}, fixed: ${WRITE_MODE ? scansFixed : 0} (dry run skips writes), skipped: ${scansSkipped}`);

  // ── Query floor_plans ────────────────────────────────────────────────────────
  console.log('');
  console.log(C.bold('Scanning floor_plans...'));
  const fpRows = await dbQuery(pat, `
    SELECT id, tenant_id, raw_scan, normalized_geometry
    FROM floor_plans
    WHERE normalized_geometry IS NOT NULL
    ORDER BY created_at DESC
  `);

  let fpsChecked = 0, fpsCorrupted = 0, fpsFixed = 0, fpsSkipped = 0;

  for (const row of fpRows) {
    fpsChecked++;
    const ng = row.normalized_geometry;
    if (!ng || !Array.isArray(ng.rooms)) { fpsSkipped++; continue; }

    const corruptedRooms = ng.rooms.filter(r =>
      Array.isArray(r.polygon) && isPolygonSelfIntersecting(r.polygon)
    );

    if (corruptedRooms.length === 0) continue;

    fpsCorrupted++;
    const beforeAreas = corruptedRooms.map(r => ({ id: r.id, name: r.name, area: r.area_sqft }));

    const rawScanInput = row.raw_scan?.rooms
      ? { rooms: row.raw_scan.rooms, scanner_version: row.raw_scan.scanner_version ?? null }
      : null;

    if (!rawScanInput) {
      console.error(C.red(`  [SKIP] floor_plan ${row.id}: no raw_scan.rooms available`));
      fpsSkipped++;
      continue;
    }

    const fixed = normalizeFloorPlan(rawScanInput);
    if (!fixed.ok) {
      console.error(C.red(`  [SKIP] floor_plan ${row.id}: re-normalize failed — ${fixed.error}`));
      fpsSkipped++;
      continue;
    }

    const afterAreas = corruptedRooms.map(r => {
      const fixedRoom = fixed.data.rooms.find(fr => fr.id === r.id);
      return { id: r.id, name: r.name, area: fixedRoom?.area_sqft ?? '?' };
    });

    const needsReviewRooms = fixed.data.rooms.filter(r => r.needs_review);

    console.log(C.yellow(`  [CORRUPTED] floor_plan ${row.id} (tenant ${row.tenant_id})`));
    for (let i = 0; i < beforeAreas.length; i++) {
      const b = beforeAreas[i], a = afterAreas[i];
      console.log(`    room ${b.id} "${b.name}": ${b.area} sqft → ${a.area} sqft`);
    }
    if (needsReviewRooms.length > 0) {
      console.log(C.yellow(`    needs_review rooms: ${needsReviewRooms.map(r => r.id).join(', ')}`));
    }

    if (WRITE_MODE) {
      const jsonb = JSON.stringify(fixed.data);
      await dbQuery(pat, `
        UPDATE floor_plans
        SET normalized_geometry = $${jsonb}$::jsonb
        WHERE id = '${row.id}'
          AND tenant_id = '${row.tenant_id}'
      `);
      console.log(C.green(`    → written`));
      fpsFixed++;
    }
  }

  console.log('');
  console.log(C.bold('floor_plans:'));
  console.log(`  checked: ${fpsChecked}, corrupted: ${fpsCorrupted}, fixed: ${WRITE_MODE ? fpsFixed : 0} (dry run skips writes), skipped: ${fpsSkipped}`);

  console.log('');
  if (!WRITE_MODE && (scansCorrupted > 0 || fpsCorrupted > 0)) {
    console.log(C.yellow('Re-run with --write to apply fixes.'));
  } else if (!WRITE_MODE) {
    console.log(C.green('No corrupted rings found. No action needed.'));
  }
  console.log('');
})().catch(err => {
  console.error(C.red(`[FATAL] ${err.message}`));
  process.exit(1);
});
