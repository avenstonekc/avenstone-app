CREATE TABLE pricing_lookup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trade TEXT NOT NULL,                       -- e.g. 'general', 'tile', 'plumbing', 'electrical'
  category TEXT NOT NULL,                    -- e.g. 'floor_tile_install', 'vanity_replacement'
  unit TEXT NOT NULL,                        -- 'sf', 'lf', 'each', 'hour'
  unit_cost_low NUMERIC(10,2) NOT NULL,
  unit_cost_mid NUMERIC(10,2) NOT NULL,
  unit_cost_high NUMERIC(10,2) NOT NULL,
  notes TEXT,                                -- human context: "KC market 2026, install only, materials separate"
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, trade, category)
);

CREATE INDEX idx_pricing_lookup_tenant_trade ON pricing_lookup(tenant_id, trade) WHERE active = true;

ALTER TABLE pricing_lookup ENABLE ROW LEVEL SECURITY;

CREATE POLICY pricing_lookup_select ON pricing_lookup FOR SELECT
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY pricing_lookup_owner_write ON pricing_lookup FOR ALL
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner')
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');
