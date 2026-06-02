-- ============================================================
-- ESTIMATE_FLOW_ARC Slice 5 Part 1
-- Per-category markup config — tenant-level override of which
-- rate bucket each estimate category applies.
-- Defaults reproduce the trigger (20260527060000):
--   labor + sub  → labor_rate
--   everything else → material_rate
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS markup_category_config (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  category    TEXT        NOT NULL CHECK (category IN ('labor','sub','materials','equipment','permit','other')),
  markup_mode TEXT        NOT NULL CHECK (markup_mode IN ('labor_rate','material_rate','flat')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, category)
);

CREATE INDEX IF NOT EXISTS idx_markup_category_config_tenant
  ON markup_category_config (tenant_id);

ALTER TABLE markup_category_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mcc_tenant_read   ON markup_category_config;
DROP POLICY IF EXISTS mcc_owner_write   ON markup_category_config;

-- All tenant members can read their own config
CREATE POLICY mcc_tenant_read ON markup_category_config
  FOR SELECT TO authenticated
  USING (tenant_id = get_my_tenant_id());

-- Owner and PM can write (UI in Settings is owner+PM gated)
CREATE POLICY mcc_owner_write ON markup_category_config
  FOR ALL TO authenticated
  USING      (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner', 'project_manager'))
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner', 'project_manager'));

-- Seed Avenstone tenant with trigger-matching defaults
INSERT INTO markup_category_config (tenant_id, category, markup_mode) VALUES
  ('00000000-0000-0000-0000-000000000001', 'labor',     'labor_rate'),
  ('00000000-0000-0000-0000-000000000001', 'sub',        'labor_rate'),
  ('00000000-0000-0000-0000-000000000001', 'materials',  'material_rate'),
  ('00000000-0000-0000-0000-000000000001', 'equipment',  'material_rate'),
  ('00000000-0000-0000-0000-000000000001', 'permit',     'material_rate'),
  ('00000000-0000-0000-0000-000000000001', 'other',      'material_rate')
ON CONFLICT (tenant_id, category) DO NOTHING;

COMMIT;
