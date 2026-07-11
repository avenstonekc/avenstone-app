-- SCOPE_TO_ESTIMATE Phase D — scope_option_trades: option→trade routing map.
-- Sibling of scope_option_images, SAME key shape + read/write policy. The seam contract for
-- per-answer trade derivation: some selection fields are option-conditional (the chosen option
-- decides the trade) and some are multi-trade — neither is expressible by the field-level
-- scope_checklists.adds_trades text[]. This table binds (project_type, field_key, option_key)→trade.
--
-- Derivation rule (ai-estimator toScopeAnswerPayload): a field is "map-governed" if it has ANY
-- row here — then the chosen option's row wins and a MISS = NULL (orphan, rendered under the
-- packet's "Unassigned — confirm trade" section, never force-mapped). A field with NO rows here
-- falls back to adds_trades[0] when single-trade, else NULL.
--
-- Platform-wide, tenant-less by default (tenant_id NULL); tenant rows override per multi-tenant
-- precedent. project_type NULL = a universal mapping any project type can fall back to.

CREATE TABLE scope_option_trades (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        REFERENCES tenants(id) ON DELETE CASCADE, -- NULL = platform default
  project_type  TEXT,                                                 -- NULL = universal
  field_key     TEXT        NOT NULL,
  option_key    TEXT        NOT NULL,
  trade         TEXT        NOT NULL,   -- MUST match trade_taxonomy canonical string exactly
  active        BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, project_type, field_key, option_key)
);

CREATE INDEX idx_scope_option_trades_lookup ON scope_option_trades (project_type, field_key);

ALTER TABLE scope_option_trades ENABLE ROW LEVEL SECURITY;

-- Read + write mirror scope_option_images exactly: public read (platform catalog, zero tenant
-- data; the edge fn reads it service-role anyway), owner-only write for platform curation.
CREATE POLICY sot_public_select ON scope_option_trades FOR SELECT USING (true);
CREATE POLICY sot_owner_write ON scope_option_trades FOR ALL
  USING (get_my_role() = 'owner') WITH CHECK (get_my_role() = 'owner');

-- ── Seed (platform rows, tenant_id NULL) — day-one option-conditional selection fields only ──
-- Trade strings verified against trade_taxonomy canonical format before seeding:
--   'Tile - Floor', 'Flooring - LVP', 'Flooring - Carpet' all exist as canonical rows.
-- bathroom.floor_tile: lvp → Flooring-LVP; all other options → Tile-Floor.
-- basement.flooring: lvp → Flooring-LVP; carpet → Flooring-Carpet;
--   concrete_polished INTENTIONALLY OMITTED → orphan (NULL trade, Unassigned section) pending
--   the standing data question (which sub installs polished concrete?).
INSERT INTO scope_option_trades (tenant_id, project_type, field_key, option_key, trade) VALUES
  (NULL, 'bathroom', 'floor_tile', 'porcelain_woodlook',  'Tile - Floor'),
  (NULL, 'bathroom', 'floor_tile', 'porcelain_stonelook', 'Tile - Floor'),
  (NULL, 'bathroom', 'floor_tile', 'natural_stone',       'Tile - Floor'),
  (NULL, 'bathroom', 'floor_tile', 'lvp',                 'Flooring - LVP'),
  (NULL, 'basement', 'flooring',   'lvp',                 'Flooring - LVP'),
  (NULL, 'basement', 'flooring',   'carpet',              'Flooring - Carpet')
ON CONFLICT (tenant_id, project_type, field_key, option_key) DO NOTHING;
