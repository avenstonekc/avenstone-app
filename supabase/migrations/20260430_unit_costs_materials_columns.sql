-- Step 1 of estimate+procurement arc: add material rate columns to takeoff_unit_costs.
-- Drops existing unit CHECK (too narrow) and UNIQUE constraint (replaced by partial indexes).

-- 1. Drop constraints being replaced
ALTER TABLE takeoff_unit_costs DROP CONSTRAINT takeoff_unit_costs_unit_check;
ALTER TABLE takeoff_unit_costs DROP CONSTRAINT takeoff_unit_costs_tenant_id_room_type_trade_key;

-- 2. Add new columns
ALTER TABLE takeoff_unit_costs
  ADD COLUMN category      TEXT    NOT NULL DEFAULT 'labor'
      CHECK (category IN ('labor', 'materials')),
  ADD COLUMN material_name TEXT    NULL,
  ADD COLUMN waste_pct     NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN coverage_sf   NUMERIC NULL;

-- 3. material_name must be set on material rows
ALTER TABLE takeoff_unit_costs
  ADD CONSTRAINT takeoff_unit_costs_mat_name_required
  CHECK (category = 'labor' OR material_name IS NOT NULL);

-- 4. Expanded unit CHECK — includes packaging units used by material rows
ALTER TABLE takeoff_unit_costs
  ADD CONSTRAINT takeoff_unit_costs_unit_check
  CHECK (unit IN (
    'sf','lf','each','lump',
    'sheet','bag','gallon','bottle','set',
    'roll','bucket','quart','tube','box'
  ));

-- 5. Partial unique indexes — correct enforcement per category, NULL-safe via coalesce
CREATE UNIQUE INDEX idx_uc_labor_uniq
  ON takeoff_unit_costs(coalesce(tenant_id::text, '__platform__'), room_type, trade)
  WHERE category = 'labor';

CREATE UNIQUE INDEX idx_uc_mat_uniq
  ON takeoff_unit_costs(coalesce(tenant_id::text, '__platform__'), room_type, trade, material_name)
  WHERE category = 'materials';

-- 6. Query performance index
CREATE INDEX idx_takeoff_unit_costs_category
  ON takeoff_unit_costs(category, room_type, trade);
