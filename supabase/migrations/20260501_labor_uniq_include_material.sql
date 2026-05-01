-- Widen idx_uc_labor_uniq to include material_name so boolean-gated labor extras
-- (e.g. Niche install, Bench framing) can coexist with the main SF labor row.
-- NULL material_name (main row) coalesces to '' keeping the existing dedup guarantee.

DROP INDEX IF EXISTS idx_uc_labor_uniq;

CREATE UNIQUE INDEX idx_uc_labor_uniq
  ON takeoff_unit_costs
  USING btree (
    COALESCE(tenant_id::text, '__platform__'),
    room_type,
    trade,
    COALESCE(material_name, '')
  )
  WHERE (category = 'labor');

-- Verify
SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_uc_labor_uniq';
