#!/usr/bin/env node
// Atomic migration apply + schema verification wrapper.
//
// Usage:
//   node tools/apply_migration.js <path-to-migration.sql> [--verify <objects>]
//   node tools/apply_migration.js --selftest
//   node tools/apply_migration.js --help
//
// Auto-derives expected objects from CREATE TABLE / ALTER TABLE ... ADD COLUMN /
// CREATE INDEX / CREATE POLICY statements. For exotic SQL use --verify explicitly.
//
// Exit: 0 = all objects confirmed, 1 = apply fail or missing object, 2 = usage/PAT error

const fs = require('fs');
const path = require('path');
const https = require('https');

const PAT_PATH = 'C:/Users/Kalin/supabase-token.txt';
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

// Auto-derive expected objects from the migration SQL.
// Returns array of { type, table, name }
function parseExpected(sql) {
  const expected = [];
  let m;

  // CREATE TABLE [IF NOT EXISTS] [public.]table
  const createTableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/gi;
  while ((m = createTableRe.exec(sql)) !== null) {
    expected.push({ type: 'table', table: m[1], name: m[1] });
  }

  // ALTER TABLE [IF EXISTS] [public.]table ... ADD COLUMN [IF NOT EXISTS] col_name
  // Note: SQL may span multiple lines so we strip newlines for this match
  const normalized = sql.replace(/\s+/g, ' ');
  const addColRe = /ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?(\w+)[^;]*?ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi;
  while ((m = addColRe.exec(normalized)) !== null) {
    expected.push({ type: 'column', table: m[1], name: m[2] });
  }

  // CREATE POLICY [IF NOT EXISTS] "name" ON [public.]table
  const createPolicyRe = /CREATE\s+POLICY\s+(?:IF\s+NOT\s+EXISTS\s+)?"?(\w+)"?\s+ON\s+(?:public\.)?(\w+)/gi;
  while ((m = createPolicyRe.exec(sql)) !== null) {
    expected.push({ type: 'policy', table: m[2], name: m[1] });
  }

  // CREATE [UNIQUE] INDEX [IF NOT EXISTS] name ON [public.]table
  const createIndexRe = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+ON\s+(?:public\.)?(\w+)/gi;
  while ((m = createIndexRe.exec(sql)) !== null) {
    expected.push({ type: 'index', table: m[2], name: m[1] });
  }

  return expected;
}

// Parse the --verify flag value.
// Formats:
//   table.column    → column
//   index:name      → index
//   policy:name@table → policy
//   tablename       → table
function parseVerifyFlag(str) {
  return str.split(',').map(s => s.trim()).filter(Boolean).map(s => {
    if (s.startsWith('policy:')) {
      const rest = s.slice(7);
      const atIdx = rest.indexOf('@');
      return atIdx >= 0
        ? { type: 'policy', name: rest.slice(0, atIdx), table: rest.slice(atIdx + 1) }
        : { type: 'policy', name: rest, table: null };
    }
    if (s.startsWith('index:')) {
      return { type: 'index', name: s.slice(6), table: null };
    }
    if (s.includes('.')) {
      const dot = s.indexOf('.');
      return { type: 'column', table: s.slice(0, dot), name: s.slice(dot + 1) };
    }
    return { type: 'table', table: s, name: s };
  });
}

async function verifyObjects(pat, objects) {
  const results = [];
  for (const obj of objects) {
    let sql;
    if (obj.type === 'column') {
      sql = `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='${obj.table}' AND column_name='${obj.name}'`;
    } else if (obj.type === 'table') {
      sql = `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='${obj.name}'`;
    } else if (obj.type === 'policy') {
      sql = `SELECT policyname FROM pg_policies WHERE policyname='${obj.name}'`;
      if (obj.table) sql += ` AND tablename='${obj.table}'`;
    } else if (obj.type === 'index') {
      sql = `SELECT indexname FROM pg_indexes WHERE indexname='${obj.name}'`;
    }
    const rows = await dbQuery(pat, sql);
    results.push({ ...obj, pass: Array.isArray(rows) && rows.length > 0 });
  }
  return results;
}

function objLabel(o) {
  if (o.type === 'column') return `${o.table}.${o.name}`;
  if (o.type === 'policy') return `policy:${o.name}${o.table ? `@${o.table}` : ''}`;
  if (o.type === 'index')  return `index:${o.name}`;
  return o.name;
}

function printHelp() {
  console.log(`
${C.bold('apply_migration.js')} — atomic apply + schema verification

${C.bold('Usage:')}
  node tools/apply_migration.js <path-to-migration.sql> [--verify <objects>]
  node tools/apply_migration.js --selftest
  node tools/apply_migration.js --help

${C.bold('--verify format (comma-separated):')}
  table.column          column exists on table
  index:name            index exists by name
  policy:name@table     RLS policy exists on table
  tablename             table exists

  If --verify is omitted, expected objects are auto-derived from:
    CREATE TABLE / ALTER TABLE ... ADD COLUMN / CREATE INDEX / CREATE POLICY
  Exotic SQL (DO blocks, custom functions, etc.) needs --verify explicitly.

${C.bold('--selftest:')}
  No writes. Verifies one known-present object (invoices.invoice_number) and
  one known-absent object (_nonexistent_verify_probe). Use to confirm PAT + API
  are working before running a real migration.

${C.bold('Exit codes:')}
  0  every expected object confirmed present
  1  apply failed OR any expected object absent after apply
  2  usage error or PAT load failure
`.trim());
}

async function selfTest(pat) {
  console.log(C.bold('\n── Self-test mode (no writes) ──'));
  const cases = [
    { type: 'column', table: 'invoices', name: 'invoice_number', expectPresent: true },
    { type: 'table',  table: '_nonexistent_verify_probe', name: '_nonexistent_verify_probe', expectPresent: false },
  ];

  let allPassed = true;
  for (const c of cases) {
    let sql;
    if (c.type === 'column') {
      sql = `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='${c.table}' AND column_name='${c.name}'`;
    } else {
      sql = `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='${c.name}'`;
    }
    const rows = await dbQuery(pat, sql);
    const found = Array.isArray(rows) && rows.length > 0;
    const pass = found === c.expectPresent;
    const label = c.type === 'column' ? `${c.table}.${c.name}` : c.name;
    const detail = `expected ${c.expectPresent ? 'present' : 'absent'}, got ${found ? 'present' : 'absent'}`;
    console.log(`  ${pass ? C.green('PASS') : C.red('FAIL')}  ${label}  ${C.gray(`(${detail})`)}`);
    if (!pass) allPassed = false;
  }

  console.log('');
  if (allPassed) {
    console.log(C.green('Self-test passed.'));
    process.exit(0);
  } else {
    console.log(C.red('Self-test failed.'));
    process.exit(1);
  }
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv.includes('--help')) {
    printHelp();
    process.exit(argv.length === 0 ? 2 : 0);
  }

  // Load PAT
  let pat;
  try {
    pat = fs.readFileSync(PAT_PATH, 'utf8').trim();
    if (!pat) throw new Error('file is empty');
  } catch (e) {
    console.error(C.red(`Error: could not read PAT from ${PAT_PATH} — ${e.message}`));
    process.exit(2);
  }

  if (argv.includes('--selftest')) {
    await selfTest(pat);
    return;
  }

  // Migration file is first positional arg
  const sqlPath = argv[0];
  if (!sqlPath || sqlPath.startsWith('--')) {
    console.error(C.red('Error: first argument must be a path to a migration SQL file'));
    printHelp();
    process.exit(2);
  }

  let sql;
  try {
    sql = fs.readFileSync(sqlPath, 'utf8');
  } catch (e) {
    console.error(C.red(`Error: could not read ${sqlPath} — ${e.message}`));
    process.exit(2);
  }

  // Determine expected objects
  const verifyIdx = argv.indexOf('--verify');
  let expectedObjects;
  if (verifyIdx >= 0) {
    const verifyStr = argv[verifyIdx + 1];
    if (!verifyStr || verifyStr.startsWith('--')) {
      console.error(C.red('Error: --verify requires a comma-separated list'));
      process.exit(2);
    }
    expectedObjects = parseVerifyFlag(verifyStr);
    console.log(C.gray(`Verify (explicit): ${expectedObjects.map(objLabel).join(', ')}`));
  } else {
    expectedObjects = parseExpected(sql);
    if (expectedObjects.length > 0) {
      console.log(C.gray(`Verify (auto-derived): ${expectedObjects.map(objLabel).join(', ')}`));
    } else {
      console.log(C.yellow('Warning: no verifiable objects auto-derived — use --verify to check specific objects.'));
    }
  }

  const relName = path.relative(process.cwd(), path.resolve(sqlPath)).replace(/\\/g, '/');
  console.log(C.bold(`\n── Step 1: Apply ${relName} ──`));

  // Step 1: apply
  try {
    await dbQuery(pat, sql);
    console.log(C.green('Apply: OK'));
  } catch (e) {
    console.error(C.red(`Apply: FAILED — ${e.message}`));
    process.exit(1);
  }

  // Step 2: verify
  let allPass = true;
  if (expectedObjects.length > 0) {
    console.log(C.bold('\n── Step 2: Verify ──'));
    const results = await verifyObjects(pat, expectedObjects);
    for (const r of results) {
      if (r.pass) {
        console.log(`  ${C.green('PASS')}  ${objLabel(r)}`);
      } else {
        console.log(`  ${C.red('FAIL')}  ${objLabel(r)}  ← not found`);
        allPass = false;
      }
    }
  }

  // Step 3: reload schema
  console.log(C.bold('\n── Step 3: Reload schema ──'));
  try {
    await dbQuery(pat, `NOTIFY pgrst, 'reload schema'`);
    console.log(C.green('Schema reload: OK'));
  } catch (e) {
    console.log(C.yellow(`Schema reload: warning — ${e.message}`));
    // non-fatal
  }

  // Final result
  if (!allPass) {
    console.error(C.red('\nResult: FAILED — one or more expected objects missing after apply'));
    process.exit(1);
  }
  console.log(C.green('\nResult: OK'));
  process.exit(0);
}

main().catch(e => {
  console.error(C.red('Unhandled error:'), e);
  process.exit(1);
});
