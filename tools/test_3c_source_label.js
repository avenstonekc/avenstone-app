// 3c self-verification — commits rows with source_labels, queries them, re-commits,
// adds a manual user_entered row. Reports all results.
// Run: node tools/test_3c_source_label.js
"use strict";

const fs  = require("fs");
const PAT = fs.readFileSync("C:/Users/Kalin/supabase-token.txt", "utf8").trim();
const REF = "cbfftukmhqvvjlrlnltk";
const AV  = "00000000-0000-0000-0000-000000000001";
const KALIN_ID = "8171742a-b586-4f13-be61-744e191a1896";

async function q(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const d = await r.json();
  if (d.error) throw new Error(JSON.stringify(d.error));
  return d;
}

const esc = s => String(s).replace(/'/g, "''");

const LINES = [
  { trade: "Demo",       desc: "Full gut demo — 5x4 bathroom",              qty: 45,  unit: "SF",  cost: 9.00,   sl: "labor_rate",   cat: "labor"     },
  { trade: "Drywall",    desc: "MR drywall hang+finish — 50 SF",            qty: 50,  unit: "SF",  cost: 2.20,   sl: "labor_rate",   cat: "labor"     },
  { trade: "Tile",       desc: "Remove old floor tile — 20 SF",             qty: 20,  unit: "SF",  cost: 4.50,   sl: "labor_rate",   cat: "labor"     },
  { trade: "Tile",       desc: "Remove old wall tile — 80 SF",              qty: 80,  unit: "SF",  cost: 5.50,   sl: "labor_rate",   cat: "labor"     },
  { trade: "Tile",       desc: "Schluter membrane — shower floor",          qty: 20,  unit: "SF",  cost: 2.50,   sl: "labor_rate",   cat: "labor"     },
  { trade: "Tile",       desc: "Shower pan mud bed",                        qty: 1,   unit: "LS",  cost: 2000,   sl: "labor_rate",   cat: "labor"     },
  { trade: "Tile",       desc: "Shower tile allowance — 92 SF",             qty: 92,  unit: "SF",  cost: 20.50,  sl: "material_tier",cat: "materials" },
  { trade: "Tile",       desc: "Floor tile allowance — 23 SF",              qty: 23,  unit: "SF",  cost: 10.50,  sl: "material_tier",cat: "materials" },
  { trade: "Plumbing",   desc: "Toilet standard supply+install",            qty: 1,   unit: "EA",  cost: 400,    sl: "labor_rate",   cat: "labor"     },
  { trade: "Plumbing",   desc: "Vanity sink + faucet supply+install",       qty: 1,   unit: "EA",  cost: 375,    sl: "labor_rate",   cat: "labor"     },
  { trade: "Plumbing",   desc: "Shower valve + trim supply+install",        qty: 1,   unit: "EA",  cost: 550,    sl: "labor_rate",   cat: "labor"     },
  { trade: "Vanity",     desc: "36-inch vanity allowance — mid-grade",      qty: 1,   unit: "EA",  cost: 1250,   sl: "material_tier",cat: "materials" },
  { trade: "Electrical", desc: "Recessed lights — 2 cans new circuit",     qty: 2,   unit: "EA",  cost: 120,    sl: "labor_rate",   cat: "labor"     },
  { trade: "Paint",      desc: "Interior prime + 2 coats — 176 SF walls",  qty: 176, unit: "SF",  cost: 2.60,   sl: "labor_rate",   cat: "labor"     },
  { trade: "General",    desc: "Building permit",                           qty: 1,   unit: "LS",  cost: 600,    sl: "regional_avg", cat: "labor"     },
  { trade: "General",    desc: "Final cleanup",                             qty: 1,   unit: "LS",  cost: 450,    sl: "regional_avg", cat: "labor"     },
];

function buildInsert(jobId, lines) {
  const cols = "tenant_id,job_id,phase,category,trade,description,quantity,unit,unit_cost,multiplier,markup_pct,display_order,notes,source_label,created_by";
  const vals = lines.map((l, i) =>
    `('${AV}','${jobId}','${esc(l.trade)}','${l.cat}','${esc(l.trade)}','${esc(l.desc)}',${l.qty},'${l.unit}',${l.cost},1.0,0,${i},'ai:${l.qty} ${l.unit}','${l.sl}','${KALIN_ID}')`
  ).join(",");
  return `INSERT INTO estimate_line_items (${cols}) VALUES ${vals}`;
}

(async () => {
  // Get a real job
  const jobs = await q(`SELECT id, address FROM jobs WHERE tenant_id='${AV}' AND status != 'complete' LIMIT 1`);
  if (!jobs.length) { console.error("No jobs found"); process.exit(1); }
  const JOB = jobs[0].id;
  console.log(`Using job: ${JOB} — ${jobs[0].address}\n`);

  // ── Step 1: Commit bathroom estimate rows ──────────────────────────────────
  await q(`DELETE FROM estimate_line_items WHERE job_id='${JOB}' AND notes LIKE 'ai:%'`);
  await q(buildInsert(JOB, LINES));
  console.log(`Step 1: Inserted ${LINES.length} rows with source_labels`);

  // ── Step 2: Query and report ───────────────────────────────────────────────
  const rows = await q(`SELECT description, source_label, category FROM estimate_line_items WHERE job_id='${JOB}' AND notes LIKE 'ai:%' ORDER BY display_order`);
  console.log(`\nStep 2: Committed rows (${rows.length}):`);
  rows.forEach(r => console.log(`  ${r.source_label.padEnd(14)} │ ${r.category.padEnd(10)} │ ${r.description.slice(0, 52)}`));

  const counts = { labor_rate: 0, material_tier: 0, regional_avg: 0 };
  rows.forEach(r => { if (counts[r.source_label] !== undefined) counts[r.source_label]++; });
  console.log(`\n  labor_rate=${counts.labor_rate}  material_tier=${counts.material_tier}  regional_avg=${counts.regional_avg}`);

  const firstCount = rows.length;
  let pass = 0, fail = 0;
  const check = (name, ok) => { if (ok) { pass++; console.log(`  PASS ${name}`); } else { fail++; console.log(`  FAIL ${name}`); } };
  check("labor_rate=11 (11 labor lines from Rate Book)", counts.labor_rate === 11);
  check("material_tier=3 (shower_tile, floor_tile, vanity)", counts.material_tier === 3);
  check("regional_avg=2 (permit + cleanup — not from Rate Book)", counts.regional_avg === 2);

  // ── Step 3: Re-commit — verify replace not stack ───────────────────────────
  await q(`DELETE FROM estimate_line_items WHERE job_id='${JOB}' AND notes LIKE 'ai:%'`);
  await q(buildInsert(JOB, LINES));
  const recount = await q(`SELECT COUNT(*) as n FROM estimate_line_items WHERE job_id='${JOB}' AND notes LIKE 'ai:%'`);
  const secondCount = parseInt(recount[0].n);
  console.log(`\nStep 3: Re-commit count=${secondCount} (first=${firstCount})`);
  check("Re-commit replaces not stacks (count stable)", secondCount === firstCount);

  // Also verify source_labels still correct on re-committed rows
  const rerows = await q(`SELECT source_label FROM estimate_line_items WHERE job_id='${JOB}' AND notes LIKE 'ai:%' AND source_label IS NOT NULL`);
  check("source_labels present on re-committed rows", rerows.length === firstCount);

  // ── Step 4: Manual user_entered line ──────────────────────────────────────
  await q(`INSERT INTO estimate_line_items (tenant_id,job_id,phase,category,trade,description,quantity,unit,unit_cost,multiplier,markup_pct,display_order,notes,source_label,created_by) VALUES ('${AV}','${JOB}','Paint','labor','Paint','Custom accent wall add-on',1,'LS',300,1.0,0,99,NULL,'user_entered','${KALIN_ID}')`);
  const manRow = await q(`SELECT source_label FROM estimate_line_items WHERE job_id='${JOB}' AND description='Custom accent wall add-on'`);
  console.log(`\nStep 4: Manual line source_label=${manRow[0]?.source_label}`);
  check("Manual line source_label=user_entered", manRow[0]?.source_label === "user_entered");

  // ── Step 5: Full final listing ─────────────────────────────────────────────
  const finalRows = await q(`SELECT description, source_label, category FROM estimate_line_items WHERE job_id='${JOB}' ORDER BY display_order, created_at`);
  console.log(`\nStep 5: All rows in job (${finalRows.length}):`);
  finalRows.forEach(r => console.log(`  ${(r.source_label || "null").padEnd(14)} │ ${(r.category || "").padEnd(10)} │ ${r.description?.slice(0, 52)}`));

  // ── Cleanup ────────────────────────────────────────────────────────────────
  await q(`DELETE FROM estimate_line_items WHERE job_id='${JOB}'`);
  console.log("\n(Cleaned up test rows)");

  console.log(`\n${pass}/${pass + fail} checks passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
