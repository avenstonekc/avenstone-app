#!/usr/bin/env node
// Tool-schema-vs-payload drift detector for ai-master-agent.
//
// Checks:
//   1. REQUIRED_FIELDS <-> schema: each field in REQUIRED_FIELDS exists in the
//      corresponding tool's schema.properties
//   2. Schema -> executor: schema properties the executor case never reads (dead params)
//   3. Executor -> schema: input.X reads in executor not declared in schema
//   4. Registry -> TOOLS: CONFIRM_TOOLS + POST_EXECUTE_ELICIT names exist in TOOLS
//
// Usage:  npm run audit:master-agent   (from avenstone-vite/)
//         node tools/audit_master_agent.js
// Exit:   0 = clean (or only informational notes)
//         1 = real drift found
//         2 = parse/file error

const fs   = require('fs');
const path = require('path');
const { createRequire } = require('module');

const REPO_ROOT  = path.resolve(__dirname, '..');
const VITE_DIR   = path.join(REPO_ROOT, 'avenstone-vite');
const INDEX_PATH = path.join(REPO_ROOT, 'supabase', 'functions', 'ai-master-agent', 'index.ts');

// Borrow the already-installed Babel modules from avenstone-vite/
const requireFromVite = createRequire(path.join(VITE_DIR, 'package.json'));
const parser          = requireFromVite('@babel/parser');
const traverseModule  = requireFromVite('@babel/traverse');
const traverse        = traverseModule.default || traverseModule;

const isTTY = process.stdout.isTTY;
const C = {
  red:    s => isTTY ? `\x1b[31m${s}\x1b[0m` : s,
  green:  s => isTTY ? `\x1b[32m${s}\x1b[0m` : s,
  yellow: s => isTTY ? `\x1b[33m${s}\x1b[0m` : s,
  bold:   s => isTTY ? `\x1b[1m${s}\x1b[0m`  : s,
};

// ── Parse ────────────────────────────────────────────────────────────────────

let src;
try { src = fs.readFileSync(INDEX_PATH, 'utf-8'); }
catch (e) { console.error(`Cannot read ${INDEX_PATH}: ${e.message}`); process.exit(2); }

let ast;
try {
  ast = parser.parse(src, {
    sourceType: 'module',
    plugins: ['typescript'],
    errorRecovery: true,
  });
} catch (e) { console.error(`Parse error: ${e.message}`); process.exit(2); }

// ── AST helpers ──────────────────────────────────────────────────────────────

function getPropKey(node) {
  return node?.key?.name ?? node?.key?.value ?? null;
}

function getStringValue(node) {
  if (!node) return null;
  if (node.type === 'StringLiteral') return node.value;
  return null;
}

// Recursively walk an AST node (or array of nodes) and collect all
// MemberExpression accesses of the form  input.X  or  input["X"].
function findInputReads(nodeOrNodes) {
  const reads = new Set();
  const SKIP_KEYS = new Set(['type','start','end','loc','extra',
    'innerComments','leadingComments','trailingComments']);

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'MemberExpression' &&
        node.object?.type === 'Identifier' &&
        node.object.name === 'input') {
      const key = node.computed ? getStringValue(node.property) : node.property?.name;
      if (key) reads.add(key);
    }
    for (const k of Object.keys(node)) {
      if (SKIP_KEYS.has(k)) continue;
      const child = node[k];
      if (Array.isArray(child)) child.forEach(walk);
      else if (child && typeof child === 'object' && child.type) walk(child);
    }
  }

  if (Array.isArray(nodeOrNodes)) nodeOrNodes.forEach(walk);
  else walk(nodeOrNodes);
  return [...reads];
}

// ── Collect top-level registry nodes ─────────────────────────────────────────

let toolsNode      = null;   // ArrayExpression  — const TOOLS = [...]
let rfNode         = null;   // ObjectExpression — const REQUIRED_FIELDS = {...}
let ctNode         = null;   // NewExpression    — const CONFIRM_TOOLS = new Set([...])
let peeNode        = null;   // ObjectExpression — const POST_EXECUTE_ELICIT = {...}
let switchNode     = null;   // SwitchStatement  — switch (toolName) inside executeTool

traverse(ast, {
  VariableDeclarator(nodePath) {
    const name = nodePath.node.id?.name;
    const init = nodePath.node.init;
    if (!init) return;
    if (name === 'TOOLS')              toolsNode = init;
    if (name === 'REQUIRED_FIELDS')    rfNode    = init;
    if (name === 'CONFIRM_TOOLS')      ctNode    = init;
    if (name === 'POST_EXECUTE_ELICIT') peeNode  = init;
  },
  SwitchStatement(nodePath) {
    if (nodePath.node.discriminant?.name === 'toolName') switchNode = nodePath.node;
  },
});

if (!toolsNode || !rfNode || !ctNode || !peeNode || !switchNode) {
  const missing = [
    !toolsNode  && 'TOOLS',
    !rfNode     && 'REQUIRED_FIELDS',
    !ctNode     && 'CONFIRM_TOOLS',
    !peeNode    && 'POST_EXECUTE_ELICIT',
    !switchNode && 'switch(toolName)',
  ].filter(Boolean).join(', ');
  console.error(`Could not locate: ${missing}. Script may need updating.`);
  process.exit(2);
}

// ── Extract: TOOLS ────────────────────────────────────────────────────────────
// toolSchemas: toolName -> { props: Set<string>, required: Set<string> }

const toolSchemas = {};

for (const elem of (toolsNode.elements || [])) {
  if (!elem || elem.type !== 'ObjectExpression') continue;
  let toolName = null;
  const props    = new Set();
  const required = new Set();

  for (const prop of (elem.properties || [])) {
    const key = getPropKey(prop);
    if (key === 'name') toolName = getStringValue(prop.value);
    if (key === 'input_schema') {
      for (const sp of (prop.value?.properties || [])) {
        const sk = getPropKey(sp);
        if (sk === 'properties') {
          for (const p of (sp.value?.properties || [])) {
            const pk = getPropKey(p);
            if (pk) props.add(pk);
          }
        }
        if (sk === 'required') {
          for (const e of (sp.value?.elements || [])) {
            const rv = getStringValue(e);
            if (rv) required.add(rv);
          }
        }
      }
    }
  }

  if (toolName) toolSchemas[toolName] = { props, required };
}

// ── Extract: REQUIRED_FIELDS ─────────────────────────────────────────────────
// requiredFields: toolName -> string[]

const requiredFields = {};

for (const prop of (rfNode.properties || [])) {
  const toolName = getPropKey(prop);
  if (!toolName) continue;
  const fields = [];
  for (const elem of (prop.value?.elements || [])) {
    if (elem.type !== 'ObjectExpression') continue;
    for (const p of (elem.properties || [])) {
      if (getPropKey(p) === 'field') {
        const fv = getStringValue(p.value);
        if (fv) fields.push(fv);
      }
    }
  }
  requiredFields[toolName] = fields;
}

// ── Extract: CONFIRM_TOOLS ───────────────────────────────────────────────────

const confirmTools = new Set();
for (const e of (ctNode.arguments?.[0]?.elements || [])) {
  const v = getStringValue(e);
  if (v) confirmTools.add(v);
}

// ── Extract: POST_EXECUTE_ELICIT keys ────────────────────────────────────────

const peeKeys = [];
for (const prop of (peeNode.properties || [])) {
  const k = getPropKey(prop);
  if (k) peeKeys.push(k);
}

// ── Extract: executor input reads per case ────────────────────────────────────
// executorReads: toolName -> Set<string>

const executorReads = {};
for (const case_ of (switchNode.cases || [])) {
  if (!case_.test) continue; // default:
  const toolName = getStringValue(case_.test);
  if (!toolName) continue;
  executorReads[toolName] = new Set(findInputReads(case_.consequent));
}

// ── Checks ────────────────────────────────────────────────────────────────────

// Fields known to be injected server-side after schema validation — not in schema
// by design (executor reads them from confirmed pending_action, not user input).
const SERVER_INJECTED = new Set(['image_data', 'image_mime']);

let realDrift   = 0;
let infoNotes   = 0;

// ─── Check 1: REQUIRED_FIELDS ↔ schema properties ─────────────────────────

console.log(C.bold('\nCheck 1 — REQUIRED_FIELDS ↔ schema properties'));
let c1clean = true;

for (const [tool, fields] of Object.entries(requiredFields)) {
  const schema = toolSchemas[tool];
  if (!schema) {
    console.log(C.red(`  DRIFT  ${tool}: in REQUIRED_FIELDS but not in TOOLS`));
    realDrift++; c1clean = false;
    continue;
  }
  for (const field of fields) {
    if (!schema.props.has(field)) {
      console.log(C.red(`  DRIFT  ${tool}: REQUIRED_FIELDS field "${field}" not in schema.properties`));
      realDrift++; c1clean = false;
    }
  }
}
if (c1clean) console.log(C.green('  PASS'));

// ─── Check 2: schema properties not read by executor (dead params) ─────────

console.log(C.bold('\nCheck 2 — schema properties not read by executor (dead params)'));
let c2clean = true;

for (const [tool, { props }] of Object.entries(toolSchemas)) {
  const reads = executorReads[tool];
  if (!reads) {
    if (props.size > 0) {
      console.log(C.yellow(`  NOTE   ${tool}: no executor case; schema declares [${[...props].join(', ')}]`));
      infoNotes++;
    }
    continue;
  }
  for (const prop of props) {
    if (!reads.has(prop)) {
      console.log(C.yellow(`  WARN   ${tool}: schema property "${prop}" not read by executor`));
      infoNotes++; c2clean = false;
    }
  }
}
if (c2clean) console.log(C.green('  PASS'));

// ─── Check 3: executor reads not in schema ─────────────────────────────────

console.log(C.bold('\nCheck 3 — executor reads not declared in schema'));
let c3clean = true;

for (const [tool, reads] of Object.entries(executorReads)) {
  const schema = toolSchemas[tool];
  if (!schema) {
    console.log(C.red(`  DRIFT  ${tool}: executor case exists but not in TOOLS`));
    realDrift++; c3clean = false;
    continue;
  }
  for (const read of reads) {
    if (!schema.props.has(read)) {
      if (SERVER_INJECTED.has(read)) {
        console.log(C.yellow(`  NOTE   ${tool}: executor reads input.${read} (not in schema — server-injected, intentional)`));
        infoNotes++;
      } else {
        console.log(C.red(`  DRIFT  ${tool}: executor reads input.${read} not declared in schema`));
        realDrift++; c3clean = false;
      }
    }
  }
}
if (c3clean && realDrift === 0) console.log(C.green('  PASS'));
else if (c3clean) console.log(C.green('  PASS (only informational notes)'));

// ─── Check 4: registry names exist in TOOLS ────────────────────────────────

console.log(C.bold('\nCheck 4 — registry names in TOOLS'));
let c4clean = true;
const toolNames = new Set(Object.keys(toolSchemas));

for (const name of confirmTools) {
  if (!toolNames.has(name)) {
    console.log(C.red(`  DRIFT  CONFIRM_TOOLS entry "${name}" not in TOOLS`));
    realDrift++; c4clean = false;
  }
}
for (const name of peeKeys) {
  if (!toolNames.has(name)) {
    console.log(C.red(`  DRIFT  POST_EXECUTE_ELICIT entry "${name}" not in TOOLS`));
    realDrift++; c4clean = false;
  }
}
if (c4clean) console.log(C.green('  PASS'));

// ── Summary ────────────────────────────────────────────────────────────────

console.log(C.bold('\nSummary'));
console.log(`  TOOLS entries:              ${Object.keys(toolSchemas).length}`);
console.log(`  REQUIRED_FIELDS tools:      ${Object.keys(requiredFields).length}`);
console.log(`  CONFIRM_TOOLS entries:      ${confirmTools.size}`);
console.log(`  POST_EXECUTE_ELICIT entries: ${peeKeys.length}`);
console.log(`  Executor cases:             ${Object.keys(executorReads).length}`);

if (realDrift === 0 && infoNotes === 0) {
  console.log(C.green('\n  ALL CHECKS PASSED — no drift found\n'));
} else {
  if (infoNotes > 0)  console.log(C.yellow(`\n  ${infoNotes} informational note(s) — review but likely intentional`));
  if (realDrift > 0)  console.log(C.red(`  ${realDrift} real drift finding(s) — fix needed`));
  else                console.log(C.green('  0 real drift findings'));
  console.log('');
}

process.exit(realDrift > 0 ? 1 : 0);
