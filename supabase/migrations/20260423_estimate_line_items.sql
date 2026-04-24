-- estimate_line_items: normalized budget line items for Budget vs Actual (Phase 4)

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

CREATE INDEX IF NOT EXISTS eli_job_id_idx      ON estimate_line_items (job_id);
CREATE INDEX IF NOT EXISTS eli_tenant_idx      ON estimate_line_items (tenant_id);
CREATE INDEX IF NOT EXISTS eli_phase_idx       ON estimate_line_items (job_id, phase);

CREATE TRIGGER set_eli_updated_at
  BEFORE UPDATE ON estimate_line_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE estimate_line_items ENABLE ROW LEVEL SECURITY;

-- Staff (owner/PM/rep): full access to their tenant's items
CREATE POLICY eli_staff_all ON estimate_line_items
  FOR ALL
  USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner','project_manager','sales_rep')
  );

-- Clients: read only, cost_plus jobs only (they see client_price, not unit_cost)
CREATE POLICY eli_client_select ON estimate_line_items
  FOR SELECT
  USING (
    get_my_role() = 'client'
    AND EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.id = estimate_line_items.job_id
        AND j.cost_plus = true
        AND can_access_job(estimate_line_items.job_id)
    )
  );

-- Subs: no access to line items
