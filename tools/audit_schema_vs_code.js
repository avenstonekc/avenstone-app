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

const reads = [];      // { table, columns, hasOpaque, file, line }
const readOpaque = []; // { table, reason, file, line }

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

  // Function parameters have no init node — columns are call-site-determined.
  // Mark partial so the table is covered but no column enumeration is attempted.
  if (binding.kind === 'param') return { keys: [], partial: true, resolved: true };

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

  // Case 5: ObjectPattern rest — const { a, b, ...patch } = source || {}
  // `patch` is a RestElement inside an ObjectPattern declarator. We can't know
  // which keys `source` carries, but we scan the enclosing function for explicit
  // `patch.KEY = value` assignments (e.g. patch.updated_at = new Date().toISOString())
  // and return those as the known-written column set (partial=true since spread remainder
  // is call-site-dependent).
  {
    const idNode = decl?.id;
    if (idNode?.type === 'ObjectPattern') {
      const restEl = idNode.properties.find(
        p => p.type === 'RestElement' && p.argument?.type === 'Identifier' && p.argument.name === name
      );
      if (restEl) {
        const assignedKeys = new Set();
        const funcPath = callPath.getFunctionParent() || callPath.findParent(p => p.isProgram());
        if (funcPath) {
          try {
            funcPath.traverse({
              AssignmentExpression(ap) {
                const left = ap.node.left;
                if (left?.type === 'MemberExpression'
                    && !left.computed
                    && left.object?.type === 'Identifier'
                    && left.object.name === name
                    && left.property?.type === 'Identifier') {
                  assignedKeys.add(left.property.name);
                }
              },
            });
          } catch { /* guard against traverse errors in malformed AST */ }
        }
        // Always partial: the rest of the object content depends on the call site.
        return { keys: [...assignedKeys], partial: true, resolved: true };
      }
    }
  }

  // Case 6: ConditionalExpression — const rows = cond ? consequentExpr : alternateExpr
  // Union column keys from both branches. Both branches stay partial if either does.
  if (init?.type === 'ConditionalExpression') {
    const colSet = new Set();
    let partial = false;
    for (const branch of [init.consequent, init.alternate]) {
      if (!branch) { partial = true; continue; }
      // Branch is an ObjectExpression: { ... }
      if (branch.type === 'ObjectExpression') {
        const r = keysFromObject(branch, callPath, seen);
        r.keys.forEach(k => colSet.add(k));
        if (r.partial) partial = true;
        continue;
      }
      // Branch is an ArrayExpression: [{ ... }, ...]
      if (branch.type === 'ArrayExpression') {
        for (const el of branch.elements) {
          if (!el) { partial = true; continue; }
          if (el.type === 'ObjectExpression') {
            const r = keysFromObject(el, callPath, seen);
            r.keys.forEach(k => colSet.add(k));
            if (r.partial) partial = true;
          } else {
            partial = true;
          }
        }
        continue;
      }
      // Branch is a .map() / .flatMap() call
      if (branch.type === 'CallExpression') {
        const r = keysFromMapCall(branch, callPath, seen);
        if (r.resolved) { r.keys.forEach(k => colSet.add(k)); if (r.partial) partial = true; }
        else partial = true;
        continue;
      }
      // Branch is an Identifier — recurse (depth-guarded by `seen`)
      if (branch.type === 'Identifier') {
        const r = resolveIdentifierColumns(branch.name, callPath, seen);
        if (r.resolved) { r.keys.forEach(k => colSet.add(k)); if (r.partial) partial = true; }
        else partial = true;
        continue;
      }
      partial = true;
    }
    if (colSet.size > 0) {
      return { keys: [...colSet], partial, resolved: true };
    }
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

// ── select-string parsing ───────────────────────────────────────────────────
function splitSelectTerms(str) {
  // Split by comma but NOT inside parentheses (embedded resource args).
  const terms = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === '(') depth++;
    else if (str[i] === ')') depth--;
    else if (str[i] === ',' && depth === 0) {
      terms.push(str.slice(start, i).trim());
      start = i + 1;
    }
  }
  terms.push(str.slice(start).trim());
  return terms;
}

function parseSelectString(str) {
  // Returns { columns: string[], hasOpaque: bool }
  // columns = plain base-table column names to check.
  // hasOpaque = true if any term was skipped (embed, aggregate, etc.)
  const columns = [];
  let hasOpaque = false;
  for (const term of splitSelectTerms(str)) {
    if (!term || term === '*') continue;
    if (term.includes('(')) { hasOpaque = true; continue; } // embed / aggregate call
    if (/^(count|sum|avg|min|max)\b/i.test(term)) { hasOpaque = true; continue; }
    const colonIdx = term.indexOf(':');
    if (colonIdx >= 0) {
      // Supabase rename syntax: alias:column
      const col = term.slice(colonIdx + 1).trim();
      if (col && !col.includes('(')) columns.push(col);
      else hasOpaque = true;
    } else {
      columns.push(term);
    }
  }
  return { columns, hasOpaque };
}

function processSelectCall(filePath, callPath) {
  const node = callPath.node;
  const table = findFromCall(node);
  if (table == null) return;
  const fileRel = relPath(filePath);
  const line = node.loc?.start.line || 0;

  if (typeof table === 'object' && table.dynamic) {
    readOpaque.push({ table: '<dynamic>', reason: 'dynamic .from() arg', file: fileRel, line });
    return;
  }
  if (table.includes('.')) {
    readOpaque.push({ table, reason: 'cross-schema (skipped)', file: fileRel, line });
    return;
  }

  const arg = node.arguments[0];
  if (!arg) return; // .select() with no arg = '*', skip

  let strVal = null;
  if (arg.type === 'StringLiteral') {
    strVal = arg.value;
  } else if (arg.type === 'TemplateLiteral' && !arg.expressions.length) {
    strVal = arg.quasis[0]?.value?.cooked ?? null;
  }

  if (strVal !== null) {
    if (!strVal || strVal === '*') return;
    const { columns, hasOpaque } = parseSelectString(strVal);
    if (columns.length > 0 || hasOpaque) {
      reads.push({ table, columns, hasOpaque, file: fileRel, line });
    }
    return;
  }

  readOpaque.push({ table, reason: `variable/expression arg (${arg.type})`, file: fileRel, line });
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
        if (name === 'insert' || name === 'update' || name === 'upsert') {
          processWriteCall(file, callPath);
        } else if (name === 'select') {
          processSelectCall(file, callPath);
        }
      },
    });
  } catch (e) {
    parseErrors.push({ file: relPath(file), error: `traverse: ${e.message}` });
  }
}

// ── DB query ────────────────────────────────────────────────────────────────
let tablesScanned = [...new Set([...writes.map(w => w.table), ...reads.map(r => r.table)])].sort();
if (TABLE_FILTER) tablesScanned = tablesScanned.filter(t => t === TABLE_FILTER);

async function main() {
  if (!tablesScanned.length) {
    console.log('No write or read projection sites found. Nothing to audit.');
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
  for (const t of tablesScanned) byTable[t] = { dbCols: new Map(), pks: new Set(), writeSites: [], readSites: [] };
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
  for (const r of reads) {
    if (TABLE_FILTER && r.table !== TABLE_FILTER) continue;
    if (byTable[r.table]) byTable[r.table].readSites.push(r);
  }

  const driftFindings = [];     // { table, column, sites: [...] }
  const potentialFindings = []; // { table, column }
  const missingTables = [];     // { table, sites: [...] }

  for (const table of tablesScanned) {
    const tbl = byTable[table];
    if (!tbl.dbCols.size) {
      const sites = [
        ...tbl.writeSites.map(w => ({ file: w.file, line: w.line, op: w.op })),
        ...tbl.readSites.map(r => ({ file: r.file, line: r.line, op: 'select' })),
      ];
      missingTables.push({ table, sites });
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

  // ── read-side diff ────────────────────────────────────────────────────────
  const readDriftFindings = []; // { table, column, sites: [...] }

  for (const table of tablesScanned) {
    const tbl = byTable[table];
    if (!tbl.dbCols.size) continue; // already in missingTables
    for (const r of tbl.readSites) {
      for (const col of r.columns) {
        if (!tbl.dbCols.has(col)) {
          let entry = readDriftFindings.find(d => d.table === table && d.column === col);
          if (!entry) { entry = { table, column: col, sites: [] }; readDriftFindings.push(entry); }
          entry.sites.push({ file: r.file, line: r.line });
        }
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
      readDrift: readDriftFindings,
      skipped: opaque,
      readSkipped: readOpaque,
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

    if (!allTables.size && !missingTables.length && !readDriftFindings.length) {
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
      if (readDriftFindings.length) {
        const rdByTable = {};
        for (const d of readDriftFindings) (rdByTable[d.table] ||= []).push(d);
        console.log(C.bold('Read-side drift (SELECT projections referencing non-existent columns):'));
        for (const t of Object.keys(rdByTable).sort()) {
          console.log(C.bold(`── ${t} ──`));
          console.log(C.red('  ❌ READ DRIFT — column selected in code but not in DB:'));
          for (const d of rdByTable[t]) {
            console.log(C.red(`    • ${d.column}`));
            for (const s of d.sites) console.log(C.gray(`        ${s.file}:${s.line} (select)`));
          }
          console.log('');
        }
      }
    }

    if (opaque.length) {
      console.log(C.gray(`Write-side skipped (${opaque.length} call sites the resolver couldn't decode):`));
      for (const o of opaque.slice(0, 25)) {
        console.log(C.gray(`  • ${o.file}:${o.line}  ${o.table}.${o.op}()  — ${o.reason}`));
      }
      if (opaque.length > 25) console.log(C.gray(`  … ${opaque.length - 25} more`));
      console.log('');
    }
    if (readOpaque.length) {
      console.log(C.gray(`Read-side skipped (${readOpaque.length} .select() sites — variable args, embeds, aggregates, *):`));
      for (const o of readOpaque.slice(0, 25)) {
        console.log(C.gray(`  • ${o.file}:${o.line}  ${o.table}.select()  — ${o.reason}`));
      }
      if (readOpaque.length > 25) console.log(C.gray(`  … ${readOpaque.length - 25} more`));
      console.log('');
    }
    if (parseErrors.length) {
      console.log(C.gray(`Parse errors (${parseErrors.length} files):`));
      for (const p of parseErrors.slice(0, 10)) console.log(C.gray(`  • ${p.file}: ${p.error}`));
      if (parseErrors.length > 10) console.log(C.gray(`  … ${parseErrors.length - 10} more`));
      console.log('');
    }

    const readSelectSites = reads.length;
    const readOpaqueCount = readOpaque.length + reads.filter(r => r.hasOpaque).length;

    console.log(C.bold('Summary:'));
    console.log(`  write drift:     ${driftFindings.length}`);
    console.log(`  read drift:      ${readDriftFindings.length}`);
    console.log(`  potential:       ${potentialFindings.length}`);
    console.log(`  missing tables:  ${missingTables.length}`);
    console.log(`  write skipped:   ${opaque.length}`);
    console.log(`  read skipped:    ${readOpaqueCount} (${readSelectSites} .select() sites, ${readOpaque.length} fully opaque + ${reads.filter(r => r.hasOpaque).length} partial)`);
    console.log(`  parse errors:    ${parseErrors.length}`);
  }

  let exit = 0;
  if (driftFindings.length || missingTables.length || readDriftFindings.length) exit = 1;
  if (STRICT && potentialFindings.length) exit = 1;
  process.exit(exit);
}

main().catch(e => {
  console.error(C.red(`Fatal: ${e.stack || e.message}`));
  process.exit(2);
});
