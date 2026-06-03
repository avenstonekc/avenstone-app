-- ANTI_SURPRISE_ENGINE_ARC Phase 1.5
-- job_walkthrough_items: per-job per-trade walkthrough execution layer.
-- Seeded from tenant_playbook_items on first open; persists check state across sessions.
-- Separate from site_visit_checklist_items (which requires schedule_item_id FK).

-- ── job_walkthrough_items ─────────────────────────────────────────────────────

CREATE TABLE job_walkthrough_items (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id),
  job_id           TEXT        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  work_type        TEXT        NOT NULL,
  playbook_item_id UUID        REFERENCES tenant_playbook_items(id) ON DELETE SET NULL,
  label            TEXT        NOT NULL,
  photo_required   BOOLEAN     NOT NULL DEFAULT false,
  must_document    BOOLEAN     NOT NULL DEFAULT false,
  sort_order       INT         NOT NULL DEFAULT 0,
  status           TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'pass', 'fail', 'skip')),
  notes            TEXT,
  completed_at     TIMESTAMPTZ,
  completed_by_id  UUID        REFERENCES profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_jwi_job_work_type ON job_walkthrough_items (job_id, work_type);
CREATE INDEX idx_jwi_pending       ON job_walkthrough_items (job_id) WHERE status = 'pending';

ALTER TABLE job_walkthrough_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY jwi_select ON job_walkthrough_items
  FOR SELECT USING (tenant_id = get_my_tenant_id());

CREATE POLICY jwi_insert ON job_walkthrough_items
  FOR INSERT WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager', 'sales_rep')
  );

CREATE POLICY jwi_update ON job_walkthrough_items
  FOR UPDATE USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager', 'sales_rep')
  );

-- ── Extend job_files to accept job_walkthrough_item as linked entity ──────────

ALTER TABLE job_files DROP CONSTRAINT job_files_related_entity_type_check;

ALTER TABLE job_files ADD CONSTRAINT job_files_related_entity_type_check
  CHECK (related_entity_type IS NULL OR related_entity_type IN (
    'schedule_item',
    'change_order',
    'daily_log',
    'floor_plan',
    'job_transaction',
    'consultation_session',
    'draw_package',
    'job_walkthrough_item'
  ));
