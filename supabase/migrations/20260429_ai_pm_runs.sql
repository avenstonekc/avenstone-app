CREATE TABLE ai_pm_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id      TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  invoked_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  invoked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  output_summary TEXT
);

CREATE INDEX idx_ai_pm_runs_job_recent ON ai_pm_runs(job_id, invoked_at DESC);
CREATE INDEX idx_ai_pm_runs_tenant ON ai_pm_runs(tenant_id);

ALTER TABLE ai_pm_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_pm_runs_select ON ai_pm_runs FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND can_access_job(job_id));

CREATE POLICY ai_pm_runs_insert ON ai_pm_runs FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND can_access_job(job_id));
