-- Trade taxonomy: canonical multi-tenant trade hierarchy
-- Stored trade strings use full-path format: "Tile - Floor", "Plumbing - Rough-in", "Demo"
-- Parent-only trades (no sub-types): store the parent name directly
-- Compound trades: store "Parent - Sub-trade" as the canonical string

-- ── Schema ───────────────────────────────────────────────────────────────────

CREATE TABLE trade_taxonomy (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        REFERENCES tenants(id) ON DELETE CASCADE, -- NULL = canonical
  parent_trade     TEXT        NOT NULL,
  sub_trade        TEXT,       -- NULL = parent-only (no sub-types)
  display_order    INT         NOT NULL DEFAULT 0,
  default_waste_pct NUMERIC(5,2),
  default_unit     TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, parent_trade, sub_trade)
);

CREATE INDEX idx_trade_taxonomy_canonical   ON trade_taxonomy (parent_trade, sub_trade) WHERE tenant_id IS NULL;
CREATE INDEX idx_trade_taxonomy_tenant      ON trade_taxonomy (tenant_id) WHERE tenant_id IS NOT NULL;

ALTER TABLE trade_taxonomy ENABLE ROW LEVEL SECURITY;
CREATE POLICY tt_read ON trade_taxonomy FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = get_my_tenant_id());
CREATE POLICY tt_write ON trade_taxonomy FOR ALL
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE tenant_trade_visibility (
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  trade_id    UUID        NOT NULL REFERENCES trade_taxonomy(id) ON DELETE CASCADE,
  active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, trade_id)
);

CREATE INDEX idx_ttv_tenant_active ON tenant_trade_visibility (tenant_id) WHERE active = TRUE;

ALTER TABLE tenant_trade_visibility ENABLE ROW LEVEL SECURITY;
CREATE POLICY ttv_read  ON tenant_trade_visibility FOR SELECT USING (tenant_id = get_my_tenant_id());
CREATE POLICY ttv_write ON tenant_trade_visibility FOR ALL
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');

-- ── Canonical seed — display_order groups each parent ────────────────────────
-- Compound trades: sub_trade is the specific variant label
-- Parent-only: sub_trade IS NULL

INSERT INTO trade_taxonomy (tenant_id, parent_trade, sub_trade, display_order, default_unit, default_waste_pct) VALUES
  -- Tile (10)
  (NULL, 'Tile', 'Floor',          10, 'sf', 10.00),
  (NULL, 'Tile', 'Wall / shower',  10, 'sf', 10.00),
  (NULL, 'Tile', 'Backsplash',     10, 'sf', 12.00),
  -- Plumbing (20)
  (NULL, 'Plumbing', 'Rough-in',         20, NULL, NULL),
  (NULL, 'Plumbing', 'Finish / fixtures', 20, NULL, NULL),
  (NULL, 'Plumbing', 'Service upgrade',   20, NULL, NULL),
  -- Electrical (30)
  (NULL, 'Electrical', 'Rough-in',        30, NULL, NULL),
  (NULL, 'Electrical', 'Finish',          30, NULL, NULL),
  (NULL, 'Electrical', 'Service upgrade', 30, NULL, NULL),
  (NULL, 'Electrical', 'Low voltage',     30, NULL, NULL),
  -- HVAC (40)
  (NULL, 'HVAC', 'Install',        40, NULL, NULL),
  (NULL, 'HVAC', 'Service / repair',40, NULL, NULL),
  -- Drywall (50)
  (NULL, 'Drywall', 'Hang',              50, 'sf', 8.00),
  (NULL, 'Drywall', 'Tape / mud / texture', 50, 'sf', NULL),
  (NULL, 'Drywall', 'Patch',             50, 'sf', NULL),
  -- Paint (60)
  (NULL, 'Paint', 'Interior',        60, 'sf', NULL),
  (NULL, 'Paint', 'Exterior',        60, 'sf', NULL),
  (NULL, 'Paint', 'Cabinet refinish', 60, NULL, NULL),
  -- Flooring (70)
  (NULL, 'Flooring', 'Carpet',      70, 'sf', 7.00),
  (NULL, 'Flooring', 'LVP',         70, 'sf', 10.00),
  (NULL, 'Flooring', 'Hardwood',    70, 'sf', 10.00),
  (NULL, 'Flooring', 'Vinyl sheet', 70, 'sf', 7.00),
  (NULL, 'Flooring', 'Laminate',    70, 'sf', 10.00),
  -- Trim / carpentry (80)
  (NULL, 'Trim / carpentry', 'Base / case',   80, 'lf', NULL),
  (NULL, 'Trim / carpentry', 'Crown',          80, 'lf', NULL),
  (NULL, 'Trim / carpentry', 'Stairs / rails', 80, NULL, NULL),
  -- Concrete (90)
  (NULL, 'Concrete', 'Slabs',              90, 'sf', NULL),
  (NULL, 'Concrete', 'Footings',           90, 'lf', NULL),
  (NULL, 'Concrete', 'Stamped / decorative',90, 'sf', NULL),
  -- Foundations (100)
  (NULL, 'Foundations', 'Block',  100, NULL, NULL),
  (NULL, 'Foundations', 'Poured', 100, NULL, NULL),
  (NULL, 'Foundations', 'ICF',    100, NULL, NULL),
  (NULL, 'Foundations', 'Repair', 100, NULL, NULL),
  -- Cabinets / vanities (110)
  (NULL, 'Cabinets / vanities', 'Install',      110, NULL, NULL),
  (NULL, 'Cabinets / vanities', 'Build / custom',110, NULL, NULL),
  (NULL, 'Cabinets / vanities', 'Refinish',      110, NULL, NULL),
  -- Parent-only trades
  (NULL, 'Demo',       NULL, 120, NULL, NULL),
  (NULL, 'Framing',    NULL, 130, 'sf', 15.00),
  (NULL, 'Roofing',    NULL, 140, 'sf', 10.00),
  (NULL, 'Insulation', NULL, 150, 'sf', NULL),
  (NULL, 'Garage door',NULL, 160, NULL, NULL),
  (NULL, 'Appliances', NULL, 170, NULL, NULL),
  (NULL, 'Cleanup',    NULL, 180, NULL, NULL);

-- ── Avenstone tenant visibility: all canonical rows active ───────────────────

INSERT INTO tenant_trade_visibility (tenant_id, trade_id, active)
SELECT '00000000-0000-0000-0000-000000000001', id, TRUE
FROM trade_taxonomy
WHERE tenant_id IS NULL;
