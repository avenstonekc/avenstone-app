-- schedule_items: flexible job schedule events (deliveries, sub starts, inspections, etc.)
--
-- Multi-tenant safe: every row is scoped by tenant_id; get_my_tenant_id() enforces isolation
-- at the RLS layer. Phase derivation is driven by sub_start items via trade_phase_map
-- (see 20260502_trade_phase_map.sql) — the mapping is per-tenant so GC, roofer, and painter
-- tenants can each define their own phase vocabulary without changing this table.
--
-- Note: job_id is TEXT (not UUID) because jobs.id is TEXT in this schema.

CREATE TABLE schedule_items (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID        NOT NULL REFERENCES tenants(id),
  job_id             TEXT        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  type               TEXT        NOT NULL CHECK (type IN (
                                   'material_delivery',
                                   'sub_start',
                                   'site_visit',
                                   'inspection',
                                   'milestone',
                                   'delay'
                                 )),
  title              TEXT        NOT NULL,
  scheduled_date     DATE,
  scheduled_end_date DATE,
  notes              TEXT,
  trade              TEXT,
  assigned_sub_id    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  notify_client      BOOLEAN     NOT NULL DEFAULT TRUE,
  status             TEXT        NOT NULL DEFAULT 'scheduled' CHECK (status IN (
                                   'scheduled', 'in_progress', 'complete', 'cancelled'
                                 )),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_id      UUID        REFERENCES profiles(id),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX schedule_items_job_idx         ON schedule_items(job_id, scheduled_date);
CREATE INDEX schedule_items_tenant_idx      ON schedule_items(tenant_id);
CREATE INDEX schedule_items_assigned_sub_idx ON schedule_items(assigned_sub_id)
  WHERE assigned_sub_id IS NOT NULL;

ALTER TABLE schedule_items ENABLE ROW LEVEL SECURITY;

-- Staff (owner, PM, rep) full access within their tenant
CREATE POLICY schedule_items_staff_all ON schedule_items
  FOR ALL TO authenticated
  USING  (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

-- Subs can read items they're directly assigned to, or any item on a job they're on
CREATE POLICY schedule_items_sub_select ON schedule_items
  FOR SELECT TO authenticated
  USING (
    assigned_sub_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM job_subs js
      WHERE js.job_id = schedule_items.job_id
        AND js.sub_id  = auth.uid()
    )
  );

-- Clients can read notify_client=TRUE items on their jobs
-- Uses same identity check as jobs table: client_user_id FK or matching email in profiles
CREATE POLICY schedule_items_client_select ON schedule_items
  FOR SELECT TO authenticated
  USING (
    notify_client = TRUE
    AND EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.id = schedule_items.job_id
        AND (
          j.client_user_id = auth.uid()
          OR j.client_email = (SELECT email FROM profiles WHERE id = auth.uid())
        )
    )
  );

CREATE TRIGGER schedule_items_updated_at
  BEFORE UPDATE ON schedule_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
