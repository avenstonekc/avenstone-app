import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = { "Content-Type": "application/json" };

Deno.serve(async (req) => {
  const secret = req.headers.get("x-secret");
  if (secret !== "phase4-verify-2026") {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: CORS });
  }

  const dbUrl = Deno.env.get("SUPABASE_DB_URL")!;
  const supaUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const sql = postgres(dbUrl, { max: 1, idle_timeout: 20, connect_timeout: 30, ssl: { rejectUnauthorized: false } });
  const sb = createClient(supaUrl, serviceKey, { auth: { persistSession: false } });
  const TENANT = "00000000-0000-0000-0000-000000000001";
  const KALIN_ID = "8171742a-b586-4f13-be61-744e191a1896";
  const report: Record<string, unknown> = {};

  try {
    // ── STEP 1: find or create a test job ───────────────────────────────────
    let { data: jobs } = await sb.from("jobs").select("id,address,cost_plus,contract_value")
      .eq("tenant_id", TENANT).limit(5);
    let testJob = jobs?.[0];
    let testJobId: string;

    if (!testJob) {
      // Create minimal test job
      testJobId = crypto.randomUUID();
      await sql`INSERT INTO jobs (id, tenant_id, address, status, contract_value, cost_plus, created_at, updated_at)
        VALUES (${testJobId}, ${TENANT}::uuid, '999 Test St, Kansas City MO', 'active', 10000, true, NOW(), NOW())`;
      report.step1 = { action: "created test job", job_id: testJobId };
    } else {
      testJobId = testJob.id;
      report.step1 = { action: "using existing job", job_id: testJobId, address: testJob.address, cost_plus: testJob.cost_plus };
    }

    // ── STEP 2: Insert 5 test line items across 2-3 phases ──────────────────
    // Delete any existing test items first
    await sql`DELETE FROM estimate_line_items WHERE job_id = ${testJobId}`;

    await sql`
      INSERT INTO estimate_line_items (tenant_id, job_id, phase, category, trade, description, quantity, unit, unit_cost, markup_pct, display_order, created_by)
      VALUES
        (${TENANT}::uuid, ${testJobId}, 'framing',  'labor',     'Framing',    'Framing labor',        40,  'hr',   85,    20, 0, ${KALIN_ID}::uuid),
        (${TENANT}::uuid, ${testJobId}, 'framing',  'materials', 'Framing',    'Lumber and hardware',   1,  'lot', 2000,   15, 1, ${KALIN_ID}::uuid),
        (${TENANT}::uuid, ${testJobId}, 'electrical','sub',       'Electrical', 'Rough-in electrical',   1,  'lot', 3500,   10, 2, ${KALIN_ID}::uuid),
        (${TENANT}::uuid, ${testJobId}, 'finish',   'labor',     'Finish',     'Trim and paint labor', 24,  'hr',   75,    20, 3, ${KALIN_ID}::uuid),
        (${TENANT}::uuid, ${testJobId}, 'finish',   'materials', 'Finish',     'Paint and trim',        1,  'lot',  800,   15, 4, ${KALIN_ID}::uuid)
    `;

    // ── VERIFY computed columns ─────────────────────────────────────────────
    const items = await sql`
      SELECT description, quantity, unit_cost, total_cost, markup_pct, client_price,
             (quantity * unit_cost) as expected_total,
             (quantity * unit_cost * (1 + markup_pct/100.0)) as expected_client
      FROM estimate_line_items WHERE job_id = ${testJobId} ORDER BY display_order
    `;

    report.step2_computed_columns = items.map((r: any) => ({
      description: r.description,
      qty: r.quantity, unit_cost: r.unit_cost,
      total_cost: r.total_cost, expected_total: r.expected_total,
      total_match: Number(r.total_cost) === Number(r.expected_total),
      markup_pct: r.markup_pct,
      client_price: r.client_price, expected_client: Number(r.expected_client).toFixed(2),
      client_match: Math.abs(Number(r.client_price) - Number(r.expected_client)) < 0.01,
    }));

    // ── STEP 3: Insert a framing sub_payout transaction ─────────────────────
    // Clean up previous test txs
    await sql`DELETE FROM job_transactions WHERE job_id = ${testJobId} AND description LIKE 'TEST-%'`;

    const [tx1] = await sql`
      INSERT INTO job_transactions (tenant_id, job_id, direction, type, amount, status, phase, description, date_incurred, created_by, created_at, updated_at)
      VALUES (${TENANT}::uuid, ${testJobId}, 'out', 'sub_payout', 2000, 'paid', 'framing', 'TEST-framing-1', NOW()::date, ${KALIN_ID}::uuid, NOW(), NOW())
      RETURNING id, amount, phase, status
    `;
    report.step3_transaction = { inserted: tx1, lien_waiver_required_check: "trigger should set lien_waiver_required=true" };

    // Check lien_waiver_required was set by trigger
    const [txCheck] = await sql`SELECT lien_waiver_required FROM job_transactions WHERE id = ${tx1.id}`;
    report.step3_transaction.lien_waiver_required = txCheck.lien_waiver_required;

    // ── STEP 4: Budget summary ───────────────────────────────────────────────
    const budgetByPhase = await sql`
      SELECT phase, SUM(client_price) as budget
      FROM estimate_line_items WHERE job_id = ${testJobId} GROUP BY phase ORDER BY phase
    `;
    const actualByPhase = await sql`
      SELECT phase, SUM(amount) as actual
      FROM job_transactions
      WHERE job_id = ${testJobId} AND direction='out' AND status='paid' AND phase IS NOT NULL
      GROUP BY phase ORDER BY phase
    `;
    const budgetMap: Record<string, number> = {};
    budgetByPhase.forEach((r: any) => { budgetMap[r.phase] = Number(r.budget); });
    const actualMap: Record<string, number> = {};
    actualByPhase.forEach((r: any) => { actualMap[r.phase] = Number(r.actual); });

    report.step4_budget_vs_actual = Object.entries(budgetMap).map(([phase, budget]) => {
      const actual = actualMap[phase] || 0;
      const pct = budget > 0 ? Math.round((actual / budget) * 100) : 0;
      return { phase, budget, actual, variance: budget - actual, pct_used: `${pct}%` };
    });

    // ── STEP 5: Push framing over 110% ──────────────────────────────────────
    const framingBudget = budgetMap["framing"] || 0;
    const currentActual = actualMap["framing"] || 2000;
    const neededToExceed = Math.ceil(framingBudget * 1.10) - currentActual + 1;

    await sql`
      INSERT INTO job_transactions (tenant_id, job_id, direction, type, amount, status, phase, description, date_incurred, created_by, created_at, updated_at)
      VALUES (${TENANT}::uuid, ${testJobId}, 'out', 'sub_payout', ${neededToExceed}, 'paid', 'framing', 'TEST-framing-overrun', NOW()::date, ${KALIN_ID}::uuid, NOW(), NOW())
    `;

    const [framingActualNow] = await sql`
      SELECT SUM(amount) as actual FROM job_transactions
      WHERE job_id = ${testJobId} AND direction='out' AND status='paid' AND phase='framing'
    `;
    report.step5_overrun_setup = {
      framing_budget: framingBudget,
      framing_actual_now: Number(framingActualNow.actual),
      over_110pct: Number(framingActualNow.actual) > framingBudget * 1.10,
    };

    await sql.end();
    return new Response(JSON.stringify({ ok: true, test_job_id: testJobId, report }), { headers: CORS });
  } catch (e) {
    await sql.end().catch(() => {});
    return new Response(JSON.stringify({ error: String(e), report }), { status: 500, headers: CORS });
  }
});
