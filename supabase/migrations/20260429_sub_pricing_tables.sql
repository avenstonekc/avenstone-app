-- sub_pricing and sub_pricing_changes
-- Schema matches ai-sub-onboard edge function exactly.
-- The earlier migration file (20260419_sub_pricing.sql) had wrong column names
-- and was never applied. This supersedes it.

CREATE TABLE IF NOT EXISTS sub_pricing (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL,
  trade       TEXT NOT NULL,
  item_key    TEXT NOT NULL,
  item_label  TEXT NOT NULL,
  unit        TEXT NOT NULL,
  price       NUMERIC NOT NULL,
  notes       TEXT,
  is_custom   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(sub_id, item_key)
);
CREATE INDEX IF NOT EXISTS idx_sub_pricing_sub ON sub_pricing(sub_id);
CREATE INDEX IF NOT EXISTS idx_sub_pricing_tenant ON sub_pricing(tenant_id);

ALTER TABLE sub_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY sub_pricing_self ON sub_pricing FOR ALL USING (sub_id = auth.uid());
CREATE POLICY sub_pricing_tenant_read ON sub_pricing FOR SELECT USING (tenant_id = get_my_tenant_id());

CREATE TABLE IF NOT EXISTS sub_pricing_changes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_id        UUID NOT NULL REFERENCES profiles(id),
  tenant_id     UUID NOT NULL,
  item_key      TEXT NOT NULL,
  item_label    TEXT NOT NULL,
  trade         TEXT NOT NULL,
  old_price     NUMERIC,
  new_price     NUMERIC NOT NULL,
  reason        TEXT NOT NULL,
  ai_evaluation TEXT,
  ai_decision   TEXT,
  status        TEXT NOT NULL DEFAULT 'pending_owner',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_spc_sub ON sub_pricing_changes(sub_id);
CREATE INDEX IF NOT EXISTS idx_spc_tenant ON sub_pricing_changes(tenant_id, status);

ALTER TABLE sub_pricing_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY spc_self ON sub_pricing_changes FOR ALL USING (sub_id = auth.uid());
CREATE POLICY spc_tenant_read ON sub_pricing_changes FOR SELECT USING (tenant_id = get_my_tenant_id());
