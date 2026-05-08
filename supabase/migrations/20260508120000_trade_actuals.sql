CREATE TABLE IF NOT EXISTS trade_actuals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  trade TEXT NOT NULL,

  labor_cost NUMERIC,
  material_cost NUMERIC,
  total_cost NUMERIC GENERATED ALWAYS AS (COALESCE(labor_cost, 0) + COALESCE(material_cost, 0)) STORED,

  labor_source TEXT,
  material_source TEXT,
  bid_count INT NOT NULL DEFAULT 0,
  material_order_count INT NOT NULL DEFAULT 0,

  job_completion_date DATE,
  job_phase_durations JSONB,

  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  captured_method TEXT NOT NULL DEFAULT 'auto_on_complete'
    CHECK (captured_method IN ('auto_on_complete', 'manual', 'recapture')),

  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, job_id, trade)
);

CREATE INDEX IF NOT EXISTS idx_trade_actuals_tenant_trade ON trade_actuals (tenant_id, trade);
CREATE INDEX IF NOT EXISTS idx_trade_actuals_job ON trade_actuals (job_id);
CREATE INDEX IF NOT EXISTS idx_trade_actuals_completion_date ON trade_actuals (job_completion_date) WHERE job_completion_date IS NOT NULL;

ALTER TABLE trade_actuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY trade_actuals_select ON trade_actuals
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager', 'sales_rep')
  );

CREATE POLICY trade_actuals_insert ON trade_actuals
  FOR INSERT WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager', 'sales_rep')
  );

CREATE POLICY trade_actuals_update ON trade_actuals
  FOR UPDATE USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager')
  );

CREATE POLICY trade_actuals_delete ON trade_actuals
  FOR DELETE USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() = 'owner'
  );

NOTIFY pgrst, 'reload schema';
