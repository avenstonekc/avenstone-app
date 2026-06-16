-- ============================================================
-- ESTIMATOR_KNOWLEDGE_ARC Phase 1.5 — Rate Book Schema
-- Creates rate_book_labor, rate_book_material, and adds
-- source_label to estimate_line_items.
-- 2026-06-16
-- ============================================================


-- ── rate_book_labor ──────────────────────────────────────────────────────────
-- Per-trade labor rates. Estimator pulls these at inference time or ASKs if
-- missing. Separate from material tiers: labor = private/vetted, material = public/tiered.
-- trade MUST match trade_taxonomy parent_trade strings (canonical vocabulary).

CREATE TABLE rate_book_labor (
  id           UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID           REFERENCES tenants(id),        -- NULL = platform default (future)
  trade        TEXT           NOT NULL,                       -- matches trade_taxonomy parent_trade
  line_item    TEXT           NOT NULL,                       -- e.g. 'hang', 'tape_mud_finish', 'panel_upgrade'
  unit         TEXT           NOT NULL,                       -- 'SF', 'LF', 'EA', 'LS', 'room', 'sq', 'load'
  rate_low     NUMERIC(10,2)  NOT NULL,                       -- low end of range (or exact rate)
  rate_high    NUMERIC(10,2),                                 -- high end; NULL = point rate
  rate_data    JSONB          NOT NULL DEFAULT '{"type":"flat"}',
  -- rate_data shape now:    {"type":"flat"}
  -- rate_data shape future: {"type":"flat","needs_split":true}  (combined L+M, Kalin splits at review)
  -- rate_data shape Phase2: {"type":"tiered","apply":"flat_per_tier","bands":[...]}
  notes        TEXT,
  vetted       BOOLEAN        NOT NULL DEFAULT false,          -- false = seeded, not yet confirmed by Kalin
  active       BOOLEAN        NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CONSTRAINT rate_book_labor_natural_key
    UNIQUE NULLS NOT DISTINCT (tenant_id, trade, line_item, unit)
);

CREATE INDEX idx_rbl_tenant_trade ON rate_book_labor (tenant_id, trade);
CREATE INDEX idx_rbl_active       ON rate_book_labor (tenant_id, active) WHERE active = true;

ALTER TABLE rate_book_labor ENABLE ROW LEVEL SECURITY;

-- Mirror ai_knowledge policy shape: tenant reads own + platform rows; owner writes own
CREATE POLICY "rbl_select" ON rate_book_labor
  FOR SELECT USING (tenant_id = get_my_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "rbl_insert" ON rate_book_labor
  FOR INSERT WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');

CREATE POLICY "rbl_update" ON rate_book_labor
  FOR UPDATE USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');

CREATE POLICY "rbl_delete" ON rate_book_labor
  FOR DELETE USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');


-- ── rate_book_material ───────────────────────────────────────────────────────
-- Three-tier material price matrix per category. AI-drafted from public pricing;
-- Kalin calibrates. Estimator prices to finish tier selected at interview start.

CREATE TABLE rate_book_material (
  id             UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID           REFERENCES tenants(id),       -- NULL = platform default (future)
  category       TEXT           NOT NULL,                     -- e.g. 'lvp', 'carpet', 'shower_tile'
  description    TEXT           NOT NULL,                     -- UI label shown in Rate Book
  unit           TEXT           NOT NULL,                     -- 'SF', 'LF', 'EA', 'sheet', 'gallon'
  tier_low_min   NUMERIC(10,2),
  tier_low_max   NUMERIC(10,2),
  tier_mid_min   NUMERIC(10,2),
  tier_mid_max   NUMERIC(10,2),
  tier_hi_min    NUMERIC(10,2),
  tier_hi_max    NUMERIC(10,2),
  tier_low_label TEXT           NOT NULL DEFAULT 'Budget',
  tier_mid_label TEXT           NOT NULL DEFAULT 'Mid',
  tier_hi_label  TEXT           NOT NULL DEFAULT 'Premium',
  notes          TEXT,
  ai_drafted     BOOLEAN        NOT NULL DEFAULT false,       -- seeded from public pricing data
  kalin_adjusted BOOLEAN        NOT NULL DEFAULT false,       -- Kalin has reviewed and accepted
  active         BOOLEAN        NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CONSTRAINT rate_book_material_natural_key
    UNIQUE NULLS NOT DISTINCT (tenant_id, category, unit)
);

CREATE INDEX idx_rbm_tenant_category ON rate_book_material (tenant_id, category);
CREATE INDEX idx_rbm_active          ON rate_book_material (tenant_id, active) WHERE active = true;

ALTER TABLE rate_book_material ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rbm_select" ON rate_book_material
  FOR SELECT USING (tenant_id = get_my_tenant_id() OR tenant_id IS NULL);

CREATE POLICY "rbm_insert" ON rate_book_material
  FOR INSERT WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');

CREATE POLICY "rbm_update" ON rate_book_material
  FOR UPDATE USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');

CREATE POLICY "rbm_delete" ON rate_book_material
  FOR DELETE USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');


-- ── estimate_line_items.source_label ────────────────────────────────────────
-- Tracks where each line's rate came from. No CHECK constraint — value set
-- grows without migration. NULL = pre-Rate-Book rows (no badge rendered).
-- Intended values: 'labor_rate' | 'material_tier' | 'regional_avg' | 'user_entered'
-- Do NOT reuse the notes column — it carries 'ai:' and 'takeoff:' scoped-delete prefixes.

ALTER TABLE estimate_line_items ADD COLUMN source_label TEXT;


NOTIFY pgrst, 'reload schema';
