-- Sub onboarding rebuild: drop AI-era tables, recreate sub_pricing with
-- form-based schema, add onboarding_completed to profiles.
-- estimate_line_items.trade already exists from 20260423 migration.

-- Drop AI audit log (no longer needed)
DROP TABLE IF EXISTS sub_pricing_changes CASCADE;

-- Drop and recreate sub_pricing with new shape.
-- Old schema had item_key/item_label/is_custom (per-item AI rows).
-- New schema: one row per (sub, trade) with pricing_mode + rate.
DROP TABLE IF EXISTS sub_pricing CASCADE;

CREATE TABLE sub_pricing (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL,
  sub_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  trade        TEXT        NOT NULL,
  pricing_mode TEXT        NOT NULL CHECK (pricing_mode IN ('rate', 'self_bid')),
  unit         TEXT        CHECK (unit IN ('sf', 'lf', 'hour', 'each')),
  rate         NUMERIC(10,2),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (sub_id, trade)
);

CREATE INDEX idx_sub_pricing_sub    ON sub_pricing (sub_id);
CREATE INDEX idx_sub_pricing_tenant ON sub_pricing (tenant_id);

ALTER TABLE sub_pricing ENABLE ROW LEVEL SECURITY;

-- Subs read/write their own rows
CREATE POLICY sp_self ON sub_pricing
  FOR ALL USING (sub_id = auth.uid());

-- Owner + PM can read all pricing in their tenant (for auto-bid generation)
CREATE POLICY sp_staff_read ON sub_pricing
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager')
  );

-- Mark when a sub completes onboarding
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;
