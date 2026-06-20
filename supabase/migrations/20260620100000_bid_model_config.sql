-- ============================================================
-- B1.1 — bid_model_config
-- Per-tenant per-category bid model configuration.
-- Replaces hardcoded 30% markup / $1,200 pm_fee in ai-estimator.
-- Consumer contract (ai-estimator/index.ts L400, L442-443):
--   markup_pct → subtotal × (markup_pct/100)
--   pm_fee     → added flat to total
-- Both are single values per estimate call (not per line/trade).
-- ============================================================

CREATE TABLE bid_model_config (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  category     TEXT NOT NULL,
  supply_model TEXT NOT NULL DEFAULT 'contractor'
               CHECK (supply_model IN ('contractor', 'owner')),
  markup_pct   NUMERIC(5,2) NOT NULL DEFAULT 30,
  pm_fee       NUMERIC(10,2) NOT NULL DEFAULT 1200,
  allowance    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, category)
);

CREATE INDEX idx_bid_model_config_tenant_id
  ON bid_model_config (tenant_id);

CREATE INDEX idx_bid_model_config_tenant_category
  ON bid_model_config (tenant_id, category);

ALTER TABLE bid_model_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bid_model_config_select"
  ON bid_model_config FOR SELECT
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY "bid_model_config_insert"
  ON bid_model_config FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY "bid_model_config_update"
  ON bid_model_config FOR UPDATE
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

CREATE POLICY "bid_model_config_delete"
  ON bid_model_config FOR DELETE
  USING (tenant_id = get_my_tenant_id());

-- Backfill: Avenstone tenant default row — reproduces hardcoded 30% / $1,200
-- B1.6 will read this row and pass values to ai-estimator instead of frontend constants.
INSERT INTO bid_model_config (tenant_id, category, supply_model, markup_pct, pm_fee, allowance)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'default',
  'contractor',
  30,
  1200,
  false
);

NOTIFY pgrst, 'reload schema';
