-- PHASE_INVOICE_ARC slice 1 — payment_schedules + payment_milestones
-- One schedule per job, milestones phase-linked with pct/amount/retainage

BEGIN;

CREATE TABLE IF NOT EXISTS payment_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  contract_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by_id UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id)
);

CREATE TABLE IF NOT EXISTS payment_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  schedule_id UUID NOT NULL REFERENCES payment_schedules(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES job_phases(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  pct NUMERIC(5,2),
  amount NUMERIC(12,2),
  is_retainage BOOLEAN NOT NULL DEFAULT false,
  milestone_order INTEGER NOT NULL DEFAULT 0,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'invoiced', 'paid', 'released')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_milestones_schedule ON payment_milestones(schedule_id);
CREATE INDEX IF NOT EXISTS idx_payment_milestones_job ON payment_milestones(job_id);
CREATE INDEX IF NOT EXISTS idx_payment_milestones_phase ON payment_milestones(phase_id) WHERE phase_id IS NOT NULL;

-- set_updated_at trigger (function already exists)
CREATE TRIGGER set_payment_schedules_updated_at
  BEFORE UPDATE ON payment_schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_payment_milestones_updated_at
  BEFORE UPDATE ON payment_milestones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE payment_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_milestones ENABLE ROW LEVEL SECURITY;

-- payment_schedules policies (mirrors draw_schedules pattern)
CREATE POLICY ps_select ON payment_schedules FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND (
    get_my_role() = ANY(ARRAY['owner','project_manager','sales_rep'])
    OR (get_my_role() = 'client' AND job_id IN (
      SELECT id FROM jobs WHERE client_user_id = auth.uid()
    ))
  ));

CREATE POLICY ps_insert ON payment_schedules FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND
    get_my_role() = ANY(ARRAY['owner','project_manager','sales_rep']));

CREATE POLICY ps_update ON payment_schedules FOR UPDATE
  USING (tenant_id = get_my_tenant_id() AND
    get_my_role() = ANY(ARRAY['owner','project_manager','sales_rep']));

CREATE POLICY ps_delete ON payment_schedules FOR DELETE
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');

-- payment_milestones policies
CREATE POLICY pm_select ON payment_milestones FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND (
    get_my_role() = ANY(ARRAY['owner','project_manager','sales_rep'])
    OR (get_my_role() = 'client' AND job_id IN (
      SELECT id FROM jobs WHERE client_user_id = auth.uid()
    ))
  ));

CREATE POLICY pm_insert ON payment_milestones FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND
    get_my_role() = ANY(ARRAY['owner','project_manager','sales_rep']));

CREATE POLICY pm_update ON payment_milestones FOR UPDATE
  USING (tenant_id = get_my_tenant_id() AND
    get_my_role() = ANY(ARRAY['owner','project_manager','sales_rep']));

CREATE POLICY pm_delete ON payment_milestones FOR DELETE
  USING (tenant_id = get_my_tenant_id() AND
    get_my_role() = ANY(ARRAY['owner','project_manager']));

COMMIT;
