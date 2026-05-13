#!/usr/bin/env node
// Schema-vs-code drift detector.
//
// Parses `avenstone-vite/src/**` and `supabase/functions/**` for Supabase
// .insert/.update/.upsert calls chained off .from(<literal>), extracts the
// columns being written, then queries information_schema for those tables
// and reports columns that the code writes but the live DB doesn't have.
//
// Usage:  npm run audit:schema   (from avenstone-vite/)
//         node tools/audit_schema_vs_code.js [--strict] [--json] [--table <name>]
// Exit:   0 = clean
//         1 = drift found (or potential in --strict)
//         2 = parse error / PAT load failure / API error

const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const REPO_ROOT = path.resolve(__dirname, '..');
const VITE_DIR = path.join(REPO_ROOT, 'avenstone-vite');
const requireFromVite = createRequire(path.join(VITE_DIR, 'package.json'));

const parser = requireFromVite('@babel/parser');
const traverseModule = requireFromVite('@babel/traverse');
const traverse = traverseModule.default || traverseModule;

const PAT_PATH = 'C:/Users/Kalin/supabase-token.txt';
const PROJECT_REF = 'cbfftukmhqvvjlrlnltk';

// ── flags ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const STRICT = argv.includes('--strict');
const JSON_OUT = argv.includes('--json');
const tableIdx = argv.indexOf('--table');
const TABLE_FILTER = tableIdx >= 0 ? argv[tableIdx + 1] : null;

const isTTY = process.stdout.isTTY && !JSON_OUT;
const C = {
  red:    s => isTTY ? `\x1b[31m${s}\x1b[0m` : s,
  yellow: s => isTTY ? `\x1b[33m${s}\x1b[0m` : s,
  green:  s => isTTY ? `\x1b[32m${s}\x1b[0m` : s,
  gray:   s => isTTY ? `\x1b[90m${s}\x1b[0m` : s,
  bold:   s => isTTY ? `\x1b[1m${s}\x1b[0m` : s,
};

// ── file discovery ──────────────────────────────────────────────────────────
const EXCLUDE_DIRS = new Set(['node_modules', 'dist', 'build', '.next', '_archive', '.git', 'ios']);
const SCAN_ROOTS = [
  { dir: path.join(VITE_DIR, 'src'), exts: ['.js', '.jsx', '.ts', '.tsx'] },
  { dir: path.join(REPO_ROOT, 'supabase', 'functions'), exts: ['.js', '.ts'] },
];

function walkSync(dir, exts, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue;
    if (EXCLUDE_DIRS.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkSync(full, exts, out);
    else if (ent.isFile() && exts.includes(path.extname(ent.name))) out.push(full);
  }
}

const files = [];
for (const root of SCAN_ROOTS) walkSync(root.dir, root.exts, files);

const relPath = p => path.relative(REPO_ROOT, p).replace(/\\/g, '/');

// ── AST extraction ──────────────────────────────────────────────────────────
const writes = []; // { table, op, columns, partial, file, line, source }
const opaque = []; // { table, op, reason, file, line }
const parseErrors = [];

function parseFile(code, isTS) {
  return parser.parse(code, {
    sourceType: 'module',
    allowReturnOutsideFunction: true,
    allowImportExportEverywhere: true,
    errorRecovery: false,
    plugins: [
      'jsx',
      isTS ? 'typescript' : null,
      'objectRestSpread',
      'classProperties',
      'optionalChaining',
      'nullishCoalescingOperator',
      'dynamicImport',
      'topLevelAwait',
    ].filter(Boolean),
  });
}

function findFromCall(node) {
  // Walk back the chain to a `.from(<string literal>)` call.
  let cur = node.callee?.object || null;
  while (cur) {
    if (cur.type === 'CallExpression'
        && cur.callee?.type === 'MemberExpression'
        && cur.callee.property?.name === 'from') {
      const arg = cur.arguments[0];
      if (!arg) return null;
      if (arg.type === 'StringLiteral') return arg.value;
      if (arg.type === 'TemplateLiteral' && !arg.expressions.length) {
        return arg.quasis[0]?.value?.cooked ?? null;
      }
      return { dynamic: true };
    }
    if (cur.type === 'CallExpression') cur = cur.callee?.object || null;
    else if (cur.type === 'MemberExpression') cur = cur.object || null;
    else return null;
  }
  return null;
}

function keysFromObject(objExpr, scopePath, seen = new Set()) {
  // Returns { keys: [...], partial: bool }
  const keys = [];
  let partial = false;
  for (const prop of objExpr.properties) {
    if (prop.type === 'SpreadElement') {
      // Try to resolve spread source via scope binding.
      if (prop.argument?.type === 'Identifier' && scopePath) {
        const resolved = resolveIdentifierColumns(prop.argument.name, scopePath, seen);
        if (resolved.resolved) {
          resolved.keys.forEach(k => keys.push(k));
          if (resolved.partial) partial = true;
          continue;
        }
      }
      partial = true;
      continue;
    }
    if (prop.type === 'ObjectMethod') {
      const name = prop.key.name || prop.key.value;
      if (name) keys.push(name);
      continue;
    }
    if (prop.computed) { partial = true; continue; }
    const key = prop.key;
    const name = key.type === 'Identifier' ? key.name
               : key.type === 'StringLiteral' ? key.value
               : null;
    if (name != null) keys.push(name); else partial = true;
  }
  return { keys, partial };
}

function arrayOfStringLiterals(arrayExpr) {
  if (!arrayExpr || arrayExpr.type !== 'ArrayExpression') return null;
  const out = [];
  for (const el of arrayExpr.elements) {
    if (!el) continue; // hole
    if (el.type !== 'StringLiteral') return null;
    out.push(el.value);
  }
  return out;
}

// Handles .map(x => ({ ... })) and .flatMap(x => ({ ... })) patterns.
// Returns { resolved: true, keys, partial } or { resolved: false }.
// Depth guard: `seen` passed from the outer resolver prevents infinite recursion.
function keysFromMapCall(node, scopePath, seen) {
  if (!node || node.type !== 'CallExpression') return { resolved: false };
  const callee = node.callee;
  if (callee?.type !== 'MemberExpression') return { resolved: false };
  const method = callee.property?.name;
  if (method !== 'map' && method !== 'flatMap') return { resolved: false };
  const cb = node.arguments?.[0];
  if (!cb) return { resolved: false };
  // Support arrow functions only (arrow + concise body = ObjectExpression, or arrow + block body)
  if (cb.type !== 'ArrowFunctionExpression' && cb.type !== 'FunctionExpression') return { resolved: false };
  let bodyObj = null;
  if (cb.body?.type === 'ObjectExpression') {
    // Implicit return: x => ({ key: val })
    bodyObj = cb.body;
  } else if (cb.body?.type === 'BlockStatement') {
    // Explicit return: x => { return { key: val }; }
    for (const stmt of cb.body.body || []) {
      if (stmt.type === 'ReturnStatement' && stmt.argument?.type === 'ObjectExpression') {
        bodyObj = stmt.argument;
        break;
      }
    }
  }
  if (!bodyObj) return { resolved: false };
  const { keys, partial } = keysFromObject(bodyObj, scopePath, seen);
  return { resolved: true, keys, partial };
}

function resolveIdentifierColumns(name, callPath, seen) {
  // Returns { keys: [], partial: bool, resolved: bool, reason?: string }
  if (seen.has(name)) return { keys: [], partial: true, resolved: false, reason: 'recursive binding' };
  seen.add(name);

  const binding = callPath.scope.getBinding(name);
  if (!binding) return { keys: [], partial: true, resolved: false, reason: 'no binding (param or external)' };

  const decl = binding.path.node;
  const init = decl?.init;

  // Case 1: const p = { ... }
  if (init?.type === 'ObjectExpression') {
    const { keys, partial } = keysFromObject(init, callPath, seen);
    // If the var is re-assigned later, we may miss keys → still mark partial.
    const moreMutated = binding.constantViolations?.length > 0;
    return { keys, partial: partial || moreMutated, resolved: true };
  }

  // Case 2: const ok = ['col1', 'col2']
  if (init?.type === 'ArrayExpression') {
    const strs = arrayOfStringLiterals(init);
    if (strs) return { keys: strs, partial: true, resolved: true };
  }

  // Case 3: const p = {};  (then mutated via forEach with an allowlist array)
  // Scan the enclosing function/program body for `<arr>.forEach(k => p[k] = ...)` pattern.
  if (init?.type === 'ObjectExpression' && init.properties.length === 0
      || init === null
      || init === undefined) {
    const funcPath = callPath.getFunctionParent() || callPath.findParent(p => p.isProgram());
    if (funcPath) {
      const collected = new Set();
      let anyMatched = false;
      funcPath.traverse({
        CallExpression(p) {
          const c = p.node.callee;
          if (c?.type !== 'MemberExpression') return;
          if (c.property?.name !== 'forEach') return;
          if (c.object?.type !== 'Identifier') return;
          const arrBinding = p.scope.getBinding(c.object.name);
          if (!arrBinding) return;
          const strs = arrayOfStringLiterals(arrBinding.path.node?.init);
          if (!strs) return;
          // Check the callback mutates `name` via MemberExpression assignment.
          const cb = p.node.arguments[0];
          if (!cb) return;
          let mutates = false;
          p.get('arguments.0').traverse({
            AssignmentExpression(a) {
              const left = a.node.left;
              if (left?.type === 'MemberExpression'
                  && left.object?.type === 'Identifier'
                  && left.object.name === name) mutates = true;
            },
          });
          if (mutates) {
            strs.forEach(s => collected.add(s));
            anyMatched = true;
          }
        },
      });
      if (anyMatched) {
        return { keys: [...collected], partial: true, resolved: true };
      }
    }
  }

  // Case 4: const rows = arr.map(x => ({ ... })) or arr.flatMap(...)
  if (init?.type === 'CallExpression') {
    const r = keysFromMapCall(init, callPath, seen);
    if (r.resolved) return { keys: r.keys, partial: r.partial, resolved: true };
  }

  return { keys: [], partial: true, resolved: false, reason: `init type ${init?.type || 'none'}` };
}

function processWriteCall(filePath, callPath) {
  const node = callPath.node;
  const op = node.callee.property.name;
  const table = findFromCall(node);
  if (table == null) return;
  const fileRel = relPath(filePath);
  const line = node.loc?.start.line || 0;

  if (typeof table === 'object' && table.dynamic) {
    opaque.push({ table: '<dynamic>', op, reason: 'dynamic .from() arg', file: fileRel, line });
    return;
  }
  // Skip non-public schema references (e.g. storage.objects).
  if (table.includes('.')) {
    opaque.push({ table, op, reason: 'cross-schema (skipped)', file: fileRel, line });
    return;
  }

  const arg = node.arguments[0];
  if (!arg) return;

  if (arg.type === 'ObjectExpression') {
    const { keys, partial } = keysFromObject(arg, callPath);
    writes.push({ table, op, columns: keys, partial, file: fileRel, line, source: 'object-literal' });
    return;
  }
  if (arg.type === 'ArrayExpression') {
    const colSet = new Set();
    let partial = false;
    for (const el of arg.elements) {
      if (!el) continue;
      if (el.type === 'ObjectExpression') {
        const r = keysFromObject(el, callPath);
        r.keys.forEach(k => colSet.add(k));
        if (r.partial) partial = true;
      } else if (el.type === 'Identifier') {
        const r = resolveIdentifierColumns(el.name, callPath, new Set());
        if (r.resolved) {
          r.keys.forEach(k => colSet.add(k));
          partial = true;
        } else {
          partial = true;
        }
      } else {
        partial = true;
      }
    }
    writes.push({ table, op, columns: [...colSet], partial, file: fileRel, line, source: 'array-literal' });
    return;
  }
  if (arg.type === 'Identifier') {
    const r = resolveIdentifierColumns(arg.name, callPath, new Set());
    if (r.resolved) {
      writes.push({ table, op, columns: r.keys, partial: r.partial, file: fileRel, line, source: 'resolved-binding' });
    } else {
      opaque.push({ table, op, reason: `identifier ${arg.name} → ${r.reason || 'unresolved'}`, file: fileRel, line });
    }
    return;
  }
  // Inline .insert(arr.map(x => ({ ... }))) — most common batch-insert pattern
  if (arg.type === 'CallExpression') {
    const r = keysFromMapCall(arg, callPath, new Set());
    if (r.resolved) {
      writes.push({ table, op, columns: r.keys, partial: r.partial, file: fileRel, line, source: 'map-callback' });
      return;
    }
  }
  opaque.push({ table, op, reason: `non-literal arg (${arg.type})`, file: fileRel, line });
}

for (const file of files) {
  let code;
  try { code = fs.readFileSync(file, 'utf8'); }
  catch (e) { parseErrors.push({ file: relPath(file), error: e.message }); continue; }
  const isTS = /\.tsx?$/.test(file);
  let ast;
  try { ast = parseFile(code, isTS); }
  catch (e) {
    parseErrors.push({ file: relPath(file), error: e.message.split('\n')[0] });
    continue;
  }
  try {
    traverse(ast, {
      CallExpression(callPath) {
        const callee = callPath.node.callee;
        if (callee?.type !== 'MemberExpression') return;
        const name = callee.property?.name;
        if (name !== 'insert' && name !== 'update' && name !== 'upsert') return;
        processWriteCall(file, callPath);
      },
    });
  } catch (e) {
    parseErrors.push({ file: relPath(file), error: `traverse: ${e.message}` });
  }
}

// ── DB query ────────────────────────────────────────────────────────────────
let tablesScanned = [...new Set(writes.map(w => w.table))].sort();
if (TABLE_FILTER) tablesScanned = tablesScanned.filter(t => t === TABLE_FILTER);

async function main() {
  if (!tablesScanned.length) {
    console.log('No write sites found. Nothing to audit.');
    process.exit(0);
  }

  let pat;
  try {
    pat = fs.readFileSync(PAT_PATH, 'utf8').trim();
    if (!pat) throw new Error('empty');
  } catch (e) {
    console.error(C.red(`PAT load failed (${PAT_PATH}): ${e.message}`));
    process.exit(2);
  }

  const tableList = tablesScanned.map(t => `'${t.replace(/'/g, "''")}'`).join(',');

  async function query(q) {
    const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${pat}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q }),
    });
    const text = await r.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
    if (body && body.error) throw new Error(`API error: ${JSON.stringify(body)}`);
    return body;
  }

  let dbColumns, pkColumns;
  try {
    dbColumns = await query(`
      SELECT table_name, column_name, data_type, is_nullable, column_default, is_generated
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN (${tableList})
      ORDER BY table_name, ordinal_position
    `);
    pkColumns = await query(`
      SELECT kcu.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_name IN (${tableList})
    `);
  } catch (e) {
    console.error(C.red(`information_schema query failed: ${e.message}`));
    process.exit(2);
  }

  // ── diff ──────────────────────────────────────────────────────────────────
  const byTable = {};
  for (const t of tablesScanned) byTable[t] = { dbCols: new Map(), pks: new Set(), writeSites: [] };
  for (const row of dbColumns) {
    if (byTable[row.table_name]) byTable[row.table_name].dbCols.set(row.column_name, row);
  }
  for (const row of pkColumns) {
    if (byTable[row.table_name]) byTable[row.table_name].pks.add(row.column_name);
  }
  for (const w of writes) {
    if (TABLE_FILTER && w.table !== TABLE_FILTER) continue;
    if (byTable[w.table]) byTable[w.table].writeSites.push(w);
  }

  const driftFindings = [];     // { table, column, sites: [...] }
  const potentialFindings = []; // { table, column }
  const missingTables = [];     // { table, sites: [...] }

  for (const table of tablesScanned) {
    const tbl = byTable[table];
    if (!tbl.dbCols.size) {
      missingTables.push({ table, sites: tbl.writeSites.map(w => ({ file: w.file, line: w.line, op: w.op })) });
      continue;
    }
    // A — drift
    for (const w of tbl.writeSites) {
      for (const col of w.columns) {
        if (!tbl.dbCols.has(col)) {
          let entry = driftFindings.find(d => d.table === table && d.column === col);
          if (!entry) { entry = { table, column: col, sites: [] }; driftFindings.push(entry); }
          entry.sites.push({ file: w.file, line: w.line, op: w.op });
        }
      }
    }
    // B — potential: skip if any write site is partial (could be in spread / forEach allowlist)
    const anyPartial = tbl.writeSites.some(w => w.partial);
    if (!anyPartial) {
      const codeUnion = new Set();
      for (const w of tbl.writeSites) for (const c of w.columns) codeUnion.add(c);
      for (const [colName, colRow] of tbl.dbCols) {
        if (colRow.is_nullable === 'YES') continue;
        if (colRow.column_default != null) continue;
        if (colRow.is_generated === 'ALWAYS') continue;
        if (tbl.pks.has(colName)) continue;
        if (codeUnion.has(colName)) continue;
        potentialFindings.push({ table, column: colName });
      }
    }
  }

  // ── output ────────────────────────────────────────────────────────────────
  if (JSON_OUT) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      scannedFiles: files.length,
      tablesScanned: tablesScanned.length,
      drift: driftFindings,
      potential: potentialFindings,
      missingTables,
      skipped: opaque,
      parseErrors,
    }, null, 2));
  } else {
    console.log(C.bold('Schema-vs-code drift audit'));
    console.log(`  timestamp:      ${new Date().toISOString()}`);
    console.log(`  scanned files:  ${files.length}`);
    console.log(`  tables scanned: ${tablesScanned.length}`);
    if (TABLE_FILTER) console.log(`  --table filter: ${TABLE_FILTER}`);
    console.log('');

    if (missingTables.length) {
      console.log(C.red(C.bold('Tables referenced in code but NOT in DB (public schema):')));
      for (const m of missingTables) {
        console.log(C.red(`  • ${m.table}`));
        for (const s of m.sites.slice(0, 5)) console.log(C.gray(`      ${s.file}:${s.line} (${s.op})`));
        if (m.sites.length > 5) console.log(C.gray(`      … ${m.sites.length - 5} more`));
      }
      console.log('');
    }

    const driftByTable = {};
    for (const d of driftFindings) (driftByTable[d.table] ||= []).push(d);
    const potByTable = {};
    for (const p of potentialFindings) (potByTable[p.table] ||= []).push(p);
    const allTables = new Set([...Object.keys(driftByTable), ...Object.keys(potByTable)]);

    if (!allTables.size && !missingTables.length) {
      console.log(C.green('✓ No drift or potential issues found.'));
    } else {
      for (const t of [...allTables].sort()) {
        console.log(C.bold(`── ${t} ──`));
        if (driftByTable[t]) {
          console.log(C.red('  ❌ DRIFT — column written in code but not in DB:'));
          for (const d of driftByTable[t]) {
            console.log(C.red(`    • ${d.column}`));
            for (const s of d.sites) console.log(C.gray(`        ${s.file}:${s.line} (${s.op})`));
          }
        }
        if (potByTable[t]) {
          console.log(C.yellow('  ⚠ POTENTIAL — DB has NOT NULL column without default, never written by code:'));
          for (const p of potByTable[t]) console.log(C.yellow(`    • ${p.column}`));
        }
        console.log('');
      }
    }

    if (opaque.length) {
      console.log(C.gray(`Skipped (${opaque.length} call sites the resolver couldn't decode):`));
      for (const o of opaque.slice(0, 25)) {
        console.log(C.gray(`  • ${o.file}:${o.line}  ${o.table}.${o.op}()  — ${o.reason}`));
      }
      if (opaque.length > 25) console.log(C.gray(`  … ${opaque.length - 25} more`));
      console.log('');
    }
    if (parseErrors.length) {
      console.log(C.gray(`Parse errors (${parseErrors.length} files):`));
      for (const p of parseErrors.slice(0, 10)) console.log(C.gray(`  • ${p.file}: ${p.error}`));
      if (parseErrors.length > 10) console.log(C.gray(`  … ${parseErrors.length - 10} more`));
      console.log('');
    }

    console.log(C.bold('Summary:'));
    console.log(`  drift:           ${driftFindings.length}`);
    console.log(`  potential:       ${potentialFindings.length}`);
    console.log(`  missing tables:  ${missingTables.length}`);
    console.log(`  skipped sites:   ${opaque.length}`);
    console.log(`  parse errors:    ${parseErrors.length}`);
  }

  let exit = 0;
  if (driftFindings.length || missingTables.length) exit = 1;
  if (STRICT && potentialFindings.length) exit = 1;
  process.exit(exit);
}

main().catch(e => {
  console.error(C.red(`Fatal: ${e.stack || e.message}`));
  process.exit(2);
});
