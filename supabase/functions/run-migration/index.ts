import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = { "Content-Type": "application/json" };

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS estimate_line_items (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL,
  job_id          TEXT        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  estimate_id     UUID        REFERENCES job_estimates(id) ON DELETE CASCADE,
  phase           TEXT,
  category        TEXT,
  trade           TEXT,
  description     TEXT        NOT NULL,
  quantity        NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit            TEXT,
  unit_cost       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cost      NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  markup_pct      NUMERIC(5,2) NOT NULL DEFAULT 0,
  client_price    NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_cost * (1 + markup_pct / 100.0)) STORED,
  display_order   INT         NOT NULL DEFAULT 0,
  notes           TEXT,
  created_by      UUID        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS eli_job_id_idx ON estimate_line_items (job_id);
CREATE INDEX IF NOT EXISTS eli_tenant_idx ON estimate_line_items (tenant_id);
CREATE INDEX IF NOT EXISTS eli_phase_idx  ON estimate_line_items (job_id, phase);
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_eli_updated_at') THEN
    CREATE TRIGGER set_eli_updated_at BEFORE UPDATE ON estimate_line_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $do$;
ALTER TABLE estimate_line_items ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='estimate_line_items' AND policyname='eli_staff_all') THEN
    CREATE POLICY eli_staff_all ON estimate_line_items FOR ALL
      USING (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','project_manager','sales_rep'));
  END IF;
END $do$;
DO $do$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='estimate_line_items' AND policyname='eli_client_select') THEN
    CREATE POLICY eli_client_select ON estimate_line_items FOR SELECT
      USING (
        get_my_role() = 'client'
        AND EXISTS (SELECT 1 FROM jobs j WHERE j.id = estimate_line_items.job_id AND j.cost_plus = true AND can_access_job(estimate_line_items.job_id))
      );
  END IF;
END $do$;
`;

Deno.serve(async (req) => {
  const secret = req.headers.get("x-secret");
  if (secret !== "phase4-migrate-2026") {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: CORS });
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const projectRef = supabaseUrl.replace("https://", "").split(".")[0];

  // Try Management API with service role key
  const mgmtRes = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: MIGRATION_SQL }),
    }
  );

  if (mgmtRes.ok) {
    const body = await mgmtRes.json();
    return new Response(JSON.stringify({ ok: true, result: body }), { headers: CORS });
  }

  const errBody = await mgmtRes.text();

  // Try via db URL if available
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  return new Response(JSON.stringify({
    mgmt_status: mgmtRes.status,
    mgmt_error: errBody,
    db_url_available: !!dbUrl,
    service_key_length: serviceKey?.length,
  }), { status: 500, headers: CORS });
});
