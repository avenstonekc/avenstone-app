-- Material orders: per-job, per-trade procurement tracking.
-- Connects estimate_line_items (materials needed) to schedule_items (delivery dates).
-- Replaces the earlier per-row design (0 rows, no code references) with a per-order JSONB design.

DROP TABLE IF EXISTS material_orders CASCADE;

CREATE TABLE material_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  trade TEXT NOT NULL,

  -- Audit FK to estimate_line_items (snapshot, not live join — line items can change post-takeoff)
  line_item_ids UUID[] NOT NULL DEFAULT '{}',
  -- Snapshot of the materials covered by this order at time of creation
  materials JSONB NOT NULL DEFAULT '[]',
  /* materials shape: [{ description, quantity, unit, unit_price?, line_item_id }] */

  supplier_name TEXT,
  quote_total NUMERIC,
  quoted_delivery_date DATE,
  actual_delivery_date DATE,

  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'quoted', 'ordered', 'delivered', 'installed', 'cancelled')),

  notes TEXT,

  created_by_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_material_orders_job ON material_orders (job_id);
CREATE INDEX IF NOT EXISTS idx_material_orders_tenant_status ON material_orders (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_material_orders_trade ON material_orders (job_id, trade);

ALTER TABLE material_orders ENABLE ROW LEVEL SECURITY;

-- PM-side only — clients and subs don't see procurement detail directly.
-- Subs get notified via sequences when their materials are delivered (Phase 7).
CREATE POLICY material_orders_select ON material_orders
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager', 'sales_rep')
  );

CREATE POLICY material_orders_insert ON material_orders
  FOR INSERT WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager', 'sales_rep')
  );

CREATE POLICY material_orders_update ON material_orders
  FOR UPDATE USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager', 'sales_rep')
  );

CREATE POLICY material_orders_delete ON material_orders
  FOR DELETE USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() = 'owner'
  );

NOTIFY pgrst, 'reload schema';
