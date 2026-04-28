CREATE TABLE takeoff_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trade TEXT NOT NULL,                       -- 'general' for GC; 'tile', 'paint', etc. for trade tenants
  room_type TEXT NOT NULL,                   -- 'bathroom', 'kitchen', 'basement', 'addition', 'paint_floor'
  name TEXT NOT NULL,                        -- 'Standard Bathroom Reno' / 'Powder Room Refresh'
  scope_definition JSONB NOT NULL,           -- structured scope: surfaces, default categories, formulas
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_takeoff_templates_tenant_room ON takeoff_templates(tenant_id, room_type) WHERE active = true;

ALTER TABLE takeoff_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY takeoff_templates_select ON takeoff_templates FOR SELECT
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY takeoff_templates_owner_write ON takeoff_templates FOR ALL
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner')
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');
