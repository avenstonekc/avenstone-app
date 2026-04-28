CREATE TABLE material_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  estimate_line_item_id UUID REFERENCES estimate_line_items(id) ON DELETE SET NULL,
  supplier TEXT,                             -- free-text for v1; eventually FK to a suppliers table
  description TEXT NOT NULL,                 -- human description of what was ordered
  quantity NUMERIC(10,2),
  unit TEXT,
  cost NUMERIC(10,2),
  ordered_at TIMESTAMPTZ,                    -- when the order was placed
  expected_at DATE,                          -- expected delivery date (the schedule signal)
  delivered_at TIMESTAMPTZ,                  -- when actually received
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'ordered', 'delivered', 'returned', 'canceled')),
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_material_orders_job_status ON material_orders(job_id, status);
CREATE INDEX idx_material_orders_expected ON material_orders(expected_at) WHERE status IN ('planned', 'ordered');

ALTER TABLE material_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY material_orders_select ON material_orders FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND can_access_job(job_id));

CREATE POLICY material_orders_staff_write ON material_orders FOR ALL
  USING (tenant_id = get_my_tenant_id() AND can_access_job(job_id) AND get_my_role() IN ('owner', 'project_manager'))
  WITH CHECK (tenant_id = get_my_tenant_id() AND can_access_job(job_id) AND get_my_role() IN ('owner', 'project_manager'));
