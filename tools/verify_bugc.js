#!/usr/bin/env node
// verify_bugc.js — Bug C regression verification.
//
// Proves that advancing a phase via the AI edge-fn path (ai-field-agent,
// confirmed+pending_action shortcut) now fires the same three side effects
// as the user path (sbAdvancePhase): notification, auto-invoice, trade actuals.
//
// Uses the confirmed+pending_action path in ai-field-agent which calls
// executeAction() directly, bypassing Claude model invocation entirely.
// This tests the advance_phase handler code, not the conversational agent.
//
// TWO jobs are created:
//   JobA — USER PATH: effects fired directly via Management API SQL
//           (same operations sbAdvancePhase runs; reference baseline)
//   JobB — AI PATH: effects fired by posting to ai-field-agent edge fn
//           with { confirmed: true, pending_action: { tool: 'advance_phase' } }
//
// Both jobs go through two advances:
//   1. in_progress → final_touches  (tests notification + auto-invoice)
//   2. final_touches → complete      (tests notification + trade actuals)
//      (MANUAL_ONLY transition: override_reason required on both paths)
//
// CLEANUP runs in a finally block even if assertions fail.
// All test rows are flagged with ZZ_BUGC_TEST_ prefix on address.
// Do NOT touch job 7b44611a.

'use strict';
const fs   = require('fs');
const https = require('https');
const { randomUUID } = require('crypto');

// ── Config ────────────────────────────────────────────────────────────────────
const PAT_PATH    = 'C:/Users/Kalin/supabase-token.txt';
const PROJECT_REF = 'cbfftukmhqvvjlrlnltk';
const API_BASE    = `https://api.supabase.com/v1/projects/${PROJECT_REF}`;
const SB_URL      = 'https://cbfftukmhqvvjlrlnltk.supabase.co';
const ANON_KEY    = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQ2ODgsImV4cCI6MjA5MTE5MDY4OH0.isj52drLT3pj7BF94Wa9w_y_f8U1M3W5AcgWsRaTwBQ';
const TENANT_ID   = '00000000-0000-0000-0000-000000000001';
const USER_ID     = '8171742a-b586-4f13-be61-744e191a1896'; // Kalin — acts as both user and actor
const TEST_TRADE  = 'Framing';
const TEST_MARKER = 'ZZ_BUGC_TEST_';
const OVERRIDE_REASON = 'ZZ_BUGC_TEST override — automated verification';

const PHASE_LABELS = {
  lead: 'Lead', proposal: 'Proposal', contract: 'Contract',
  in_progress: 'In Progress', final_touches: 'Final Touches', complete: 'Complete',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const isTTY = process.stdout.isTTY;
const C = {
  green:  s => isTTY ? `\x1b[32m${s}\x1b[0m` : s,
  red:    s => isTTY ? `\x1b[31m${s}\x1b[0m` : s,
  yellow: s => isTTY ? `\x1b[33m${s}\x1b[0m` : s,
  gray:   s => isTTY ? `\x1b[90m${s}\x1b[0m` : s,
  bold:   s => isTTY ? `\x1b[1m${s}\x1b[0m`  : s,
};

function log(msg) { console.log(msg); }

// Management API SQL runner — returns array of rows.
function sql(pat, query) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const opts = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) reject(new Error(`API ${res.statusCode}: ${JSON.stringify(parsed).slice(0, 300)}`));
          else resolve(Array.isArray(parsed) ? parsed : []);
        } catch { reject(new Error(`JSON parse error: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// HTTP POST to Supabase edge function.
function callEdgeFn(path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const opts = {
      hostname: `${PROJECT_REF}.supabase.co`,
      path: `/functions/v1/${path}`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };
    const req = https.request(opts, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) reject(new Error(`Edge fn ${res.statusCode}: ${JSON.stringify(parsed).slice(0, 300)}`));
          else resolve(parsed);
        } catch { reject(new Error(`JSON parse error: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// ── Assertion collector ───────────────────────────────────────────────────────
const failures = [];
function assert(label, condition, extra = '') {
  if (condition) {
    log(`  ${C.green('✓')} ${label}${extra ? C.gray(' — ' + extra) : ''}`);
  } else {
    const msg = `${label}${extra ? ' — ' + extra : ''}`;
    log(`  ${C.red('✗')} ${msg}`);
    failures.push(msg);
  }
}

// ── Seed ──────────────────────────────────────────────────────────────────────
async function seedJob(pat, jobId, label) {
  // Minimal jobs INSERT — all fields sbSave writes, defaults for test.
  await sql(pat, `
    INSERT INTO jobs (
      id, tenant_id, address, status,
      scope, sqft, created_at, intake_answers,
      client_name, client_phone, client_email, assigned_rep, assigned_subs
    ) VALUES (
      '${jobId}',
      '${TENANT_ID}'::uuid,
      '${TEST_MARKER}${label}',
      'in_progress',
      '', '', NOW(), '{}',
      '', '', '', '', ''
    )
  `);

  // draw_schedule: phase_advanced trigger fires when job reaches 'final_touches'
  const drawId = randomUUID();
  await sql(pat, `
    INSERT INTO draw_schedules (id, tenant_id, job_id, draw_number, title, target_amount, auto_invoice_trigger)
    VALUES (
      '${drawId}'::uuid, '${TENANT_ID}'::uuid, '${jobId}',
      1, 'Test Draw', 500,
      '{"type":"phase_advanced","phase":"final_touches"}'::jsonb
    )
  `);

  // job_sub_engagement + accepted bid — required for captureTradeActualsForJob
  const engId = randomUUID();
  await sql(pat, `
    INSERT INTO job_sub_engagements (id, tenant_id, job_id, sub_id, trade, bid_type)
    VALUES (
      '${engId}'::uuid, '${TENANT_ID}'::uuid, '${jobId}',
      '${USER_ID}'::uuid, '${TEST_TRADE}', 'gc_drafted'
    )
  `);
  await sql(pat, `
    INSERT INTO engagement_bids (id, tenant_id, engagement_id, total_amount, drafted_by, is_current, accepted_at, revision_number)
    VALUES (
      '${randomUUID()}'::uuid, '${TENANT_ID}'::uuid, '${engId}'::uuid,
      1000, 'gc', true, NOW(), 1
    )
  `);

  return { drawId, engId };
}

// ── State snapshot ────────────────────────────────────────────────────────────
async function captureState(pat, jobId) {
  const [notifs, invoices, actuals] = await Promise.all([
    sql(pat, `SELECT COUNT(*) AS n FROM notifications WHERE job_id = '${jobId}'`),
    sql(pat, `SELECT COUNT(*) AS n FROM invoices WHERE job_id = '${jobId}'`),
    sql(pat, `SELECT COUNT(*) AS n FROM trade_actuals WHERE job_id = '${jobId}'`),
  ]);
  return {
    notifCount:   Number(notifs[0]?.n   ?? 0),
    invoiceCount: Number(invoices[0]?.n  ?? 0),
    actualsCount: Number(actuals[0]?.n   ?? 0),
  };
}

// ── USER PATH: simulate sbAdvancePhase via direct SQL ─────────────────────────
// Mirrors sbAdvancePhase exactly: same status write, same three effect calls.
// Uses Management API (postgres superuser) to bypass RLS — same net outcome
// as the anon/authed browser client running against a RLS-filtered table.
async function userPathAdvance(pat, jobId, nextPhase, overrideReason) {
  const nowIso = new Date().toISOString();
  const useOverride = !!overrideReason;
  const phaseLabel = PHASE_LABELS[nextPhase] || nextPhase;

  // 1. Status write — matches sbAdvancePhase's patch object exactly.
  await sql(pat, `
    UPDATE jobs SET
      status                = '${nextPhase}',
      phase_override_used   = ${useOverride},
      phase_override_reason = ${useOverride ? `'${overrideReason.replace(/'/g, "''")}'` : 'NULL'},
      phase_override_at     = ${useOverride ? `'${nowIso}'::timestamptz` : 'NULL'},
      phase_override_by_id  = ${useOverride ? `'${USER_ID}'::uuid` : 'NULL'}
    WHERE id = '${jobId}'
  `);

  // 2. sbNotify('phase_advanced') — queries tenant staff, excludes acting user.
  //    Matches getTenantStaffIds() + the exclusion filter in sbNotify.
  const staffRows = await sql(pat, `
    SELECT id FROM profiles
    WHERE tenant_id = '${TENANT_ID}'::uuid
      AND role IN ('owner','project_manager','sales_rep')
      AND id != '${USER_ID}'::uuid
  `);
  if (staffRows.length > 0) {
    const values = staffRows.map(s =>
      `('${TENANT_ID}'::uuid, '${s.id}'::uuid, '${jobId}', 'phase_advanced',` +
      ` 'Phase advanced — test job', 'Moved to ${phaseLabel}${useOverride ? ' (override)' : ''}',` +
      ` false, false, false)`
    ).join(',\n');
    await sql(pat, `
      INSERT INTO notifications (tenant_id, user_id, job_id, type, title, body, read, email_sent, sms_sent)
      VALUES ${values}
    `);
  }

  // 3. checkAndAutoInvoice('phase.advanced', { jobId, newPhase: nextPhase })
  //    Reads draw_schedules, creates invoice + line item, stamps idempotency.
  const draws = await sql(pat, `
    SELECT id, target_amount, title, draw_number
    FROM draw_schedules
    WHERE job_id = '${jobId}'
      AND auto_invoiced_at IS NULL
      AND auto_invoice_trigger IS NOT NULL
      AND auto_invoice_trigger->>'type' = 'phase_advanced'
      AND auto_invoice_trigger->>'phase' = '${nextPhase}'
  `);
  for (const draw of draws) {
    const invNums = await sql(pat, `SELECT next_invoice_number('${TENANT_ID}'::uuid) AS n`);
    const invoiceNumber = invNums[0]?.n;
    const today = nowIso.slice(0, 10);
    const amount = Number(draw.target_amount) || 0;
    const invRows = await sql(pat, `
      INSERT INTO invoices (tenant_id, job_id, draw_id, invoice_number, invoice_date, subtotal, total_amount, notes, created_by_id)
      VALUES (
        '${TENANT_ID}'::uuid, '${jobId}', '${draw.id}'::uuid,
        '${invoiceNumber}', '${today}'::date, ${amount}, ${amount},
        'Auto-drafted from milestone trigger: Job advanced to ${nextPhase}. Review actual progress and adjust before sending.',
        '${USER_ID}'::uuid
      )
      RETURNING id
    `);
    const invoiceId = invRows[0]?.id;
    if (invoiceId) {
      const drawTitle = (draw.title || `Draw ${draw.draw_number}`).replace(/'/g, "''");
      await sql(pat, `
        INSERT INTO invoice_line_items (tenant_id, invoice_id, description, quantity, unit_price, line_total, source_type, display_order)
        VALUES ('${TENANT_ID}'::uuid, '${invoiceId}'::uuid, 'Progress payment — ${drawTitle}', 1, ${amount}, ${amount}, 'manual', 0)
      `);
      await sql(pat, `
        UPDATE draw_schedules SET auto_invoiced_at = NOW()
        WHERE id = '${draw.id}'::uuid AND auto_invoiced_at IS NULL
      `);
    }
  }

  // 4. captureTradeActualsForJob(sb, AV_TENANT, jobId) — only fires for 'complete'.
  //    Discovers trades from job_sub_engagements + bids, upserts trade_actuals.
  if (nextPhase === 'complete') {
    const tradeRows = await sql(pat, `
      SELECT DISTINCT TRIM(trade) AS trade FROM job_sub_engagements
      WHERE job_id = '${jobId}' AND trade IS NOT NULL
    `);
    for (const { trade } of tradeRows) {
      const t = trade.replace(/'/g, "''");
      const engIds = await sql(pat, `
        SELECT id FROM job_sub_engagements
        WHERE job_id = '${jobId}' AND LOWER(trade) = LOWER('${t}')
      `);
      if (!engIds.length) continue;
      const idList = engIds.map(e => `'${e.id}'::uuid`).join(',');
      const bids = await sql(pat, `
        SELECT total_amount FROM engagement_bids
        WHERE engagement_id IN (${idList}) AND is_current = true AND accepted_at IS NOT NULL
      `);
      const laborCost = bids.reduce((s, b) => s + Number(b.total_amount || 0), 0);
      const bidCount  = bids.length;
      if (laborCost === 0 && bidCount === 0) continue;
      const today = nowIso.slice(0, 10);
      await sql(pat, `
        INSERT INTO trade_actuals
          (tenant_id, job_id, trade, labor_cost, labor_source, bid_count, job_completion_date, captured_method)
        VALUES
          ('${TENANT_ID}'::uuid, '${jobId}', '${t}', ${laborCost}, 'accepted_bids', ${bidCount}, '${today}'::date, 'auto_on_complete')
        ON CONFLICT (tenant_id, job_id, trade) DO UPDATE SET
          labor_cost = EXCLUDED.labor_cost,
          bid_count  = EXCLUDED.bid_count
      `);
    }
  }
}

// ── AI PATH: call deployed ai-field-agent via confirmed+pending_action ─────────
// Uses the model-bypass path in ai-field-agent (line 443-448 in index.ts):
//   if (confirmed && pending_action) → executeAction(sb, pending_action, ...)
// This invokes the advance_phase case directly without any Claude API call.
async function aiPathAdvance(jobId, overrideReason) {
  const input = { job_id: jobId };
  if (overrideReason) input.override_reason = overrideReason;
  return callEdgeFn('ai-field-agent', {
    user_id:        USER_ID,
    tenant_id:      TENANT_ID,
    role:           'owner',
    confirmed:      true,
    pending_action: { tool: 'advance_phase', input },
  });
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
async function cleanup(pat, jobIds) {
  log('\n' + C.bold('── CLEANUP ─────────────────────────────────────────────'));
  const idList = jobIds.map(id => `'${id}'`).join(',');

  // Order matters: delete children before parents (FK constraints).
  // invoice_line_items → invoices → draw_schedules
  // engagement_bids → job_sub_engagements
  // notifications, trade_actuals have ON DELETE SET NULL / CASCADE on job_id

  const invRows = await sql(pat, `SELECT id FROM invoices WHERE job_id IN (${idList})`);
  const engRows = await sql(pat, `SELECT id FROM job_sub_engagements WHERE job_id IN (${idList})`);

  const steps = [
    { table: 'invoice_line_items', col: 'invoice_id',    vals: invRows.map(r => `'${r.id}'::uuid`) },
    { table: 'invoices',           col: 'job_id',        vals: jobIds.map(id => `'${id}'`) },
    { table: 'draw_schedules',     col: 'job_id',        vals: jobIds.map(id => `'${id}'`) },
    { table: 'engagement_bids',    col: 'engagement_id', vals: engRows.map(r => `'${r.id}'::uuid`) },
    { table: 'job_sub_engagements',col: 'job_id',        vals: jobIds.map(id => `'${id}'`) },
    { table: 'trade_actuals',      col: 'job_id',        vals: jobIds.map(id => `'${id}'`) },
    { table: 'notifications',      col: 'job_id',        vals: jobIds.map(id => `'${id}'`) },
    { table: 'jobs',               col: 'id',            vals: jobIds.map(id => `'${id}'`) },
  ];

  for (const { table, col, vals } of steps) {
    if (!vals.length) { log(`  ${table}: skipped (no rows to delete)`); continue; }
    const res = await sql(pat, `DELETE FROM ${table} WHERE ${col} IN (${vals.join(',')}) RETURNING 1`);
    log(`  ${table}: deleted ${res.length} row(s)`);
  }

  // Post-cleanup verification — assert no orphaned rows remain.
  log('\n  Post-cleanup verification:');
  for (const jobId of jobIds) {
    const checks = await Promise.all([
      sql(pat, `SELECT COUNT(*) AS n FROM jobs WHERE id = '${jobId}'`),
      sql(pat, `SELECT COUNT(*) AS n FROM notifications WHERE job_id = '${jobId}'`),
      sql(pat, `SELECT COUNT(*) AS n FROM invoices WHERE job_id = '${jobId}'`),
      sql(pat, `SELECT COUNT(*) AS n FROM trade_actuals WHERE job_id = '${jobId}'`),
      sql(pat, `SELECT COUNT(*) AS n FROM draw_schedules WHERE job_id = '${jobId}'`),
      sql(pat, `SELECT COUNT(*) AS n FROM job_sub_engagements WHERE job_id = '${jobId}'`),
    ]);
    const counts = checks.map(r => Number(r[0]?.n ?? 0));
    const labels = ['jobs','notifications','invoices','trade_actuals','draw_schedules','job_sub_engagements'];
    const dirty = labels.filter((_, i) => counts[i] > 0);
    if (dirty.length === 0) {
      log(`  ${C.green('✓')} ${jobId}: clean (all tables 0)`);
    } else {
      log(`  ${C.red('✗')} ${jobId}: DIRTY — ${dirty.map((l, _) => `${l}:${counts[labels.indexOf(l)]}`).join(', ')}`);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const pat = fs.readFileSync(PAT_PATH, 'utf8').trim();

  const jobA = randomUUID();  // USER PATH
  const jobB = randomUUID();  // AI PATH

  log(C.bold('\n══════════════════════════════════════════════════════════'));
  log(C.bold('  BUG C VERIFICATION — advance_phase side-effects parity'));
  log(C.bold('══════════════════════════════════════════════════════════'));
  log(`  JobA (user path):  ${jobA}`);
  log(`  JobB (AI path):    ${jobB}`);

  try {
    // ── SEED ──────────────────────────────────────────────────────────────────
    log('\n' + C.bold('── SEED ────────────────────────────────────────────────'));
    await seedJob(pat, jobA, 'UserPath');
    await seedJob(pat, jobB, 'AiPath');
    log('  JobA + JobB seeded: jobs, draw_schedules, job_sub_engagements, engagement_bids');

    // How many secondary staff will receive notifications (excluding acting user)?
    const staffRows = await sql(pat, `
      SELECT id FROM profiles
      WHERE tenant_id = '${TENANT_ID}'::uuid
        AND role IN ('owner','project_manager','sales_rep')
        AND id != '${USER_ID}'::uuid
    `);
    const staffCount = staffRows.length;
    log(`  Secondary staff for notifications: ${staffCount} (excludes acting user ${USER_ID})`);

    // ── USER PATH ─────────────────────────────────────────────────────────────
    log('\n' + C.bold('── USER PATH (JobA) ────────────────────────────────────'));

    const beforeA1 = await captureState(pat, jobA);
    await userPathAdvance(pat, jobA, 'final_touches', null);
    const afterA1  = await captureState(pat, jobA);
    log(`  Advance 1 (in_progress → final_touches):`);
    log(`    notifications: ${beforeA1.notifCount} → ${afterA1.notifCount}  (+${afterA1.notifCount - beforeA1.notifCount})`);
    log(`    invoices:      ${beforeA1.invoiceCount} → ${afterA1.invoiceCount}  (+${afterA1.invoiceCount - beforeA1.invoiceCount})`);

    const beforeA2 = await captureState(pat, jobA);
    await userPathAdvance(pat, jobA, 'complete', OVERRIDE_REASON);
    const afterA2  = await captureState(pat, jobA);
    log(`  Advance 2 (final_touches → complete, override):`);
    log(`    notifications: ${beforeA2.notifCount} → ${afterA2.notifCount}  (+${afterA2.notifCount - beforeA2.notifCount})`);
    log(`    trade_actuals: ${beforeA2.actualsCount} → ${afterA2.actualsCount}  (+${afterA2.actualsCount - beforeA2.actualsCount})`);

    const finalA = afterA2;

    // ── AI PATH ───────────────────────────────────────────────────────────────
    log('\n' + C.bold('── AI PATH (JobB via ai-field-agent confirmed+pending_action) ─'));

    const beforeB1 = await captureState(pat, jobB);
    const r1 = await aiPathAdvance(jobB, null);
    const afterB1  = await captureState(pat, jobB);
    log(`  Advance 1 (in_progress → final_touches):`);
    log(`    edge fn reply: ${JSON.stringify(r1).slice(0, 120)}`);
    log(`    notifications: ${beforeB1.notifCount} → ${afterB1.notifCount}  (+${afterB1.notifCount - beforeB1.notifCount})`);
    log(`    invoices:      ${beforeB1.invoiceCount} → ${afterB1.invoiceCount}  (+${afterB1.invoiceCount - beforeB1.invoiceCount})`);

    const beforeB2 = await captureState(pat, jobB);
    const r2 = await aiPathAdvance(jobB, OVERRIDE_REASON);
    const afterB2  = await captureState(pat, jobB);
    log(`  Advance 2 (final_touches → complete, override):`);
    log(`    edge fn reply: ${JSON.stringify(r2).slice(0, 120)}`);
    log(`    notifications: ${beforeB2.notifCount} → ${afterB2.notifCount}  (+${afterB2.notifCount - beforeB2.notifCount})`);
    log(`    trade_actuals: ${beforeB2.actualsCount} → ${afterB2.actualsCount}  (+${afterB2.actualsCount - beforeB2.actualsCount})`);

    const finalB = afterB2;

    // ── ASSERTIONS ────────────────────────────────────────────────────────────
    log('\n' + C.bold('── ASSERTIONS ──────────────────────────────────────────'));

    // A. Edge fn advances succeeded (non-error reply)
    assert('AI advance 1 returned executed:true', r1?.executed === true,
      `got ${JSON.stringify(r1)?.slice(0, 80)}`);
    assert('AI advance 2 returned executed:true', r2?.executed === true,
      `got ${JSON.stringify(r2)?.slice(0, 80)}`);

    // B. AI path fired notification (proves the effect ran, not just the write)
    if (staffCount > 0) {
      assert('AI path: notifications created (> 0)',
        finalB.notifCount > 0,
        `count=${finalB.notifCount}, staffCount=${staffCount}`);
    } else {
      log(`  ${C.yellow('!')} Notification assertion skipped — no secondary staff exist ` +
          `(Kalin is only staff member; both paths produce 0 rows — this is correct behavior)`);
    }

    // C. AI path fired auto-invoice (proves checkAndAutoInvoice ran)
    assert('AI path: invoice created on phase advance',
      finalB.invoiceCount > 0,
      `invoiceCount=${finalB.invoiceCount}`);

    // D. AI path captured trade actuals on complete (proves captureTradeActualsForJob ran)
    assert('AI path: trade actuals captured on complete',
      finalB.actualsCount > 0,
      `actualsCount=${finalB.actualsCount}`);

    // E. PRE-FIX FAILURE MODE GONE — before the fix, AI path produced 0 for all three.
    //    These duplicate B/C/D as explicit "was-broken" markers.
    assert('PRE-FIX regression: AI invoice count > 0 (was 0 before Bug C fix)',
      finalB.invoiceCount > 0);
    assert('PRE-FIX regression: AI actuals count > 0 (was 0 before Bug C fix)',
      finalB.actualsCount > 0);

    // F. EQUIVALENCE — AI path produced the same kinds of effects as user path.
    //    Counts should match: same seed data, same logic (from _shared/ modules).
    assert('EQUIV: invoice counts match (AI == user path)',
      finalB.invoiceCount === finalA.invoiceCount,
      `AI=${finalB.invoiceCount}, user=${finalA.invoiceCount}`);
    assert('EQUIV: trade actuals counts match (AI == user path)',
      finalB.actualsCount === finalA.actualsCount,
      `AI=${finalB.actualsCount}, user=${finalA.actualsCount}`);
    if (staffCount > 0) {
      assert('EQUIV: notification counts match (AI == user path)',
        finalB.notifCount === finalA.notifCount,
        `AI=${finalB.notifCount}, user=${finalA.notifCount}`);
    }

    // G. Data shape — verify rows are correctly scoped to job + tenant.
    if (finalB.invoiceCount > 0) {
      const invCheck = await sql(pat, `
        SELECT tenant_id::text, job_id FROM invoices WHERE job_id = '${jobB}' LIMIT 1
      `);
      assert('AI invoice: tenant_id = TENANT_ID',
        invCheck[0]?.tenant_id === TENANT_ID,
        `got ${invCheck[0]?.tenant_id}`);
      assert('AI invoice: job_id = jobB',
        invCheck[0]?.job_id === jobB);
    }
    if (finalB.actualsCount > 0) {
      const actCheck = await sql(pat, `
        SELECT tenant_id::text, job_id, trade FROM trade_actuals WHERE job_id = '${jobB}' LIMIT 1
      `);
      assert('AI actuals: tenant_id = TENANT_ID',
        actCheck[0]?.tenant_id === TENANT_ID,
        `got ${actCheck[0]?.tenant_id}`);
      assert('AI actuals: trade = TEST_TRADE',
        actCheck[0]?.trade === TEST_TRADE,
        `got ${actCheck[0]?.trade}`);
    }

  } finally {
    await cleanup(pat, [jobA, jobB]);
  }

  // ── RESULTS ───────────────────────────────────────────────────────────────
  log('\n' + C.bold('══════════════════════════════════════════════════════════'));
  if (failures.length === 0) {
    log(C.green(C.bold('  ✅  ALL ASSERTIONS PASSED')));
  } else {
    log(C.red(C.bold(`  ❌  ${failures.length} ASSERTION(S) FAILED:`)));
    failures.forEach(f => log(`     • ${f}`));
    process.exit(1);
  }
  log(C.bold('══════════════════════════════════════════════════════════\n'));
}

main().catch(err => {
  console.error(C.red('FATAL:'), err.message || err);
  process.exit(2);
});
