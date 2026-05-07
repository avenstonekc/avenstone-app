-- EXECUTION_ARC Phase 8 — site visit checklists
-- Items linked to schedule_items of type site_visit. Statuses: pending/pass/fail/n_a.
-- Failed items fire engine event → checklist_followup todo via Phase 5a engine.

CREATE TABLE IF NOT EXISTS site_visit_checklist_items (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL,
  schedule_item_id  UUID        NOT NULL REFERENCES schedule_items(id) ON DELETE CASCADE,

  template_name     TEXT        NOT NULL,
  item_name         TEXT        NOT NULL,
  item_order        INT         NOT NULL,

  status            TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'pass', 'fail', 'n_a')),

  notes             TEXT,
  completed_at      TIMESTAMPTZ,
  completed_by_id   UUID        REFERENCES profiles(id),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_svci_schedule_item ON site_visit_checklist_items (schedule_item_id);
CREATE INDEX IF NOT EXISTS idx_svci_tenant_status  ON site_visit_checklist_items (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_svci_failed         ON site_visit_checklist_items (status) WHERE status = 'fail';

ALTER TABLE site_visit_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY svci_select ON site_visit_checklist_items
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager', 'sales_rep')
  );

CREATE POLICY svci_insert ON site_visit_checklist_items
  FOR INSERT WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager', 'sales_rep')
  );

CREATE POLICY svci_update ON site_visit_checklist_items
  FOR UPDATE USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager', 'sales_rep')
  );

CREATE POLICY svci_delete ON site_visit_checklist_items
  FOR DELETE USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() = 'owner'
  );

NOTIFY pgrst, 'reload schema';
