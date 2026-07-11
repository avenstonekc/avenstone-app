#!/usr/bin/env node
// Ad-hoc read-only DB query helper for verification during builds.
// Usage: node tools/dbq.js "SELECT ..."
// Reads the PAT from C:/Users/Kalin/supabase-token.txt (same as apply_migration.js).
const fs = require('fs');
const https = require('https');

const PAT_PATH = 'C:/Users/Kalin/supabase-token.txt';
const PROJECT_REF = 'cbfftukmhqvvjlrlnltk';

function dbQuery(pat, sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const req = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) reject(new Error(`API ${res.statusCode}: ${JSON.stringify(parsed)}`));
          else resolve(parsed);
        } catch { reject(new Error(`JSON parse error — raw: ${data.slice(0, 300)}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  const sql = process.argv[2];
  if (!sql) { console.error('usage: node tools/dbq.js "SELECT ..."'); process.exit(2); }
  const pat = fs.readFileSync(PAT_PATH, 'utf8').trim();
  try {
    const rows = await dbQuery(pat, sql);
    console.log(JSON.stringify(rows, null, 2));
  } catch (e) { console.error(String(e.message || e)); process.exit(1); }
})();
