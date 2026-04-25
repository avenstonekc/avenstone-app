CREATE TABLE consultation_gap_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  job_id text NOT NULL,
  tenant_id uuid NOT NULL,
  gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_gap_analyses_session ON consultation_gap_analyses(session_id);
CREATE INDEX idx_gap_analyses_job ON consultation_gap_analyses(job_id);
CREATE INDEX idx_gap_analyses_tenant ON consultation_gap_analyses(tenant_id);

ALTER TABLE consultation_gap_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY gap_analyses_tenant_isolation
  ON consultation_gap_analyses
  FOR ALL
  USING (tenant_id = get_my_tenant_id());
