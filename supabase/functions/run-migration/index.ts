import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

const CORS = { "Content-Type": "application/json" };

Deno.serve(async (req) => {
  const secret = req.headers.get("x-secret");
  if (secret !== "phase-col-2026") {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: CORS });
  }

  const dbUrl = Deno.env.get("SUPABASE_DB_URL")!;
  const sql = postgres(dbUrl, { max: 1, idle_timeout: 20, connect_timeout: 30, ssl: { rejectUnauthorized: false } });

  try {
    await sql`ALTER TABLE job_transactions ADD COLUMN IF NOT EXISTS phase TEXT`;
    await sql`CREATE INDEX IF NOT EXISTS idx_job_transactions_phase ON job_transactions(phase)`;
    await sql`
      UPDATE job_transactions jt
      SET phase = jp.phase_name
      FROM job_phases jp
      WHERE jt.phase_id = jp.id AND jt.phase IS NULL
    `;

    const [verify] = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'job_transactions' AND column_name = 'phase'
    `;
    const [backfill] = await sql`
      SELECT COUNT(*) as backfilled FROM job_transactions WHERE phase IS NOT NULL AND phase_id IS NOT NULL
    `;

    await sql.end();
    return new Response(JSON.stringify({
      ok: true,
      column_exists: !!verify,
      backfilled_rows: backfill.backfilled,
    }), { headers: CORS });
  } catch (e) {
    await sql.end().catch(() => {});
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
});
