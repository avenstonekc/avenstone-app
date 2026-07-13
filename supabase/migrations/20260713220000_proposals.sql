-- PROPOSAL_STATE — a RECORD-ONLY proposal lifecycle so Reset can be honest about sent vs draft.
-- Scope this pass: rows exist, two state moments write them, Reset reads/acts on them. NO management
-- UI, no resend flow, no client exposure. Forward-only: proposal PDFs created before this table are
-- unowned (no backfill). Staff RLS only (client policies deferred). Version = max(version)+1 per job
-- (computed app-side at insert).

CREATE TABLE IF NOT EXISTS proposals (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL,
  job_id        TEXT        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status        TEXT        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','superseded','void')),
  version       INT         NOT NULL,
  superseded_by UUID        REFERENCES proposals(id) ON DELETE SET NULL,
  sent_at       TIMESTAMPTZ,
  pdf_path      TEXT,
  total         NUMERIC,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID
);

CREATE INDEX IF NOT EXISTS idx_proposals_tenant_job ON proposals (tenant_id, job_id);

ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

-- Staff read/write (job_scope_answers pattern). No client policy this pass.
CREATE POLICY proposals_staff_all ON proposals FOR ALL
  USING (can_access_job(job_id) AND tenant_id = get_my_tenant_id())
  WITH CHECK (can_access_job(job_id) AND tenant_id = get_my_tenant_id());
