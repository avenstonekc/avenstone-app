CREATE TABLE takeoff_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  draft_type TEXT NOT NULL CHECK (draft_type IN ('ai_draft', 'rep_saved')),
  snapshot JSONB NOT NULL,                   -- structured copy of all line items + scope answers + scan refs
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_takeoff_drafts_job ON takeoff_drafts(job_id, created_at DESC);

ALTER TABLE takeoff_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY takeoff_drafts_select ON takeoff_drafts FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND can_access_job(job_id));

CREATE POLICY takeoff_drafts_staff_write ON takeoff_drafts FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND can_access_job(job_id));
