-- AGENT_OPS Phase 1.2: per-trade material lead time thresholds.
-- Used by watchdog Rule 3 (materials_not_ordered) to determine how many days
-- before a scheduled sub_start date the PM should be notified about missing
-- material orders. Lookup: tenant override → platform default (tenant_id NULL)
-- → hardcoded fallback 7 days.
--
-- Seed strings are canonical trade_phase_map values (verified against live DB
-- 2026-05-20). AGENT_OPS_ARC.md spec had 3 incorrect strings; corrected here:
--   'Cabinets - Install' + 'Cabinets/vanities - Install' → 'Cabinets / vanities - Install' (1 row)
--   'Tile - Wall/shower'                                 → 'Tile - Wall / shower'
--   'Plumbing - Fixtures'                                → 'Plumbing - Finish / fixtures'
-- Result: 4 seed rows (not 5 — the two Cabinets variants were the same trade).

CREATE TABLE trade_material_lead_times (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID    REFERENCES tenants(id),  -- NULL = platform default
  trade      TEXT    NOT NULL,
  lead_days  INTEGER NOT NULL CHECK (lead_days > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, trade)
);

CREATE INDEX IF NOT EXISTS idx_trade_lead_times_tenant_trade
  ON trade_material_lead_times (tenant_id, trade);

ALTER TABLE trade_material_lead_times ENABLE ROW LEVEL SECURITY;

-- Everyone can read lead times (not sensitive — trade planning reference data)
CREATE POLICY trade_lead_times_select ON trade_material_lead_times
  FOR SELECT USING (true);

-- Only owner/pm of the tenant can modify their tenant's overrides
CREATE POLICY trade_lead_times_insert ON trade_material_lead_times
  FOR INSERT WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager')
  );

CREATE POLICY trade_lead_times_update ON trade_material_lead_times
  FOR UPDATE USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager')
  );

CREATE POLICY trade_lead_times_delete ON trade_material_lead_times
  FOR DELETE USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager')
  );

-- Avenstone tenant overrides (trade strings verified against trade_phase_map 2026-05-20)
INSERT INTO trade_material_lead_times (tenant_id, trade, lead_days) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Cabinets / vanities - Install', 21),
  ('00000000-0000-0000-0000-000000000001', 'Tile - Floor',                  14),
  ('00000000-0000-0000-0000-000000000001', 'Tile - Wall / shower',          14),
  ('00000000-0000-0000-0000-000000000001', 'Plumbing - Finish / fixtures',  14);

NOTIFY pgrst, 'reload schema';
