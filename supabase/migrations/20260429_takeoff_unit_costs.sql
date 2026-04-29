-- Unit-cost lookup table for the takeoff wizard.
-- One row per (tenant_id, room_type, trade). Platform defaults have
-- tenant_id IS NULL and are visible to all tenants via RLS. Tenant rows
-- override platform defaults at wizard query time.
--
-- unit drives wizard math:
--   sf   → quantity = scan room area (auto-populated from LiDAR)
--   lf   → quantity = rep enters linear feet (trim run, cabinet run)
--   each → quantity = rep enters count (fixtures, appliances, doors)
--   lump → quantity = 1, base_rate IS the lump cost for that trade scope
--
-- multipliers JSONB: per-location rate adjustments, e.g.
--   {"first_floor": 1.0, "second_floor": 1.15, "basement": 1.3}
-- Empty {} means rate is flat regardless of location.

CREATE TABLE takeoff_unit_costs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        REFERENCES tenants(id) ON DELETE CASCADE,
  room_type   TEXT        NOT NULL,
  trade       TEXT        NOT NULL,
  unit        TEXT        NOT NULL CHECK (unit IN ('sf', 'lf', 'each', 'lump')),
  base_rate   NUMERIC(10,2),
  multipliers JSONB       NOT NULL DEFAULT '{}'::jsonb,
  notes       TEXT,
  active      BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (tenant_id, room_type, trade)
);

CREATE INDEX idx_takeoff_unit_costs_lookup
  ON takeoff_unit_costs (room_type, trade)
  WHERE active = true;

ALTER TABLE takeoff_unit_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY takeoff_unit_costs_select ON takeoff_unit_costs
  FOR SELECT
  USING (tenant_id = get_my_tenant_id() OR tenant_id IS NULL);

CREATE POLICY takeoff_unit_costs_insert_tenant ON takeoff_unit_costs
  FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY takeoff_unit_costs_update_tenant ON takeoff_unit_costs
  FOR UPDATE
  USING  (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY takeoff_unit_costs_delete_tenant ON takeoff_unit_costs
  FOR DELETE
  USING (tenant_id = get_my_tenant_id());
