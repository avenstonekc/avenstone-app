-- Step 4.5a: scope subset catalog per room type.
-- Platform defaults: tenant_id IS NULL. Tenant override rows beat platform defaults
-- for the same (room_type, scope_tag) via JS de-dup in sbLoadScopeSubsets.
-- trades = ['__all__'] means every trade in the template is included.
-- trades = [] means no trades (used for 'not_in_scope' — exclude room from bid).

CREATE TABLE template_scope_subsets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID,
  room_type   TEXT NOT NULL,
  scope_tag   TEXT NOT NULL,
  label       TEXT NOT NULL,
  trades      TEXT[] NOT NULL,
  sort_order  INT DEFAULT 0,
  UNIQUE NULLS NOT DISTINCT (tenant_id, room_type, scope_tag)
);

CREATE INDEX idx_tss_room_type ON template_scope_subsets(room_type);
CREATE INDEX idx_tss_tenant    ON template_scope_subsets(tenant_id);

ALTER TABLE template_scope_subsets ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read subsets (needed in ScopeTab and buildTakeoffDraft).
CREATE POLICY tss_select ON template_scope_subsets FOR SELECT TO authenticated USING (true);
-- Only service-role / owners manage subset rows (no tenant write path yet — seeded only).
CREATE POLICY tss_insert ON template_scope_subsets FOR INSERT WITH CHECK (get_my_role() = 'owner');
CREATE POLICY tss_update ON template_scope_subsets FOR UPDATE USING (get_my_role() = 'owner') WITH CHECK (get_my_role() = 'owner');
CREATE POLICY tss_delete ON template_scope_subsets FOR DELETE USING (get_my_role() = 'owner');

-- ── Bathroom scope subsets ────────────────────────────────────────────────────
INSERT INTO template_scope_subsets (tenant_id, room_type, scope_tag, label, trades, sort_order) VALUES
  (NULL, 'bathroom', 'not_in_scope',   'Not in this bid',    '{}',         0),
  (NULL, 'bathroom', 'full_remodel',   'Full Remodel',       '{"__all__"}', 1),
  (NULL, 'bathroom', 'tile_only',      'Tile + Fixtures Only',
    '{"Demo","Tile - Floor","Tile - Wall / shower","Plumbing - Finish / fixtures","Cleanup"}', 2),
  (NULL, 'bathroom', 'vanity_swap',    'Vanity Swap',
    '{"Plumbing - Finish / fixtures","Cabinets / vanities - Install","Cleanup"}', 3),
  (NULL, 'bathroom', 'paint_and_floor','Paint + Floor Only',
    '{"Demo","Paint - Interior","Flooring - LVP","Trim / carpentry - Base / case","Cleanup"}', 4),
  (NULL, 'bathroom', 'custom',         'Custom',             '{"__all__"}', 5);

-- ── Kitchen — full scope only for now (more variants in subsequent prompts) ───
INSERT INTO template_scope_subsets (tenant_id, room_type, scope_tag, label, trades, sort_order) VALUES
  (NULL, 'kitchen', 'not_in_scope', 'Not in this bid', '{}',         0),
  (NULL, 'kitchen', 'full_scope',   'Full Scope',       '{"__all__"}', 1),
  (NULL, 'kitchen', 'custom',       'Custom',           '{"__all__"}', 2);

-- ── Basement ──────────────────────────────────────────────────────────────────
INSERT INTO template_scope_subsets (tenant_id, room_type, scope_tag, label, trades, sort_order) VALUES
  (NULL, 'basement', 'not_in_scope', 'Not in this bid', '{}',         0),
  (NULL, 'basement', 'full_scope',   'Full Scope',       '{"__all__"}', 1),
  (NULL, 'basement', 'custom',       'Custom',           '{"__all__"}', 2);

-- ── Whole House (refresh) ─────────────────────────────────────────────────────
INSERT INTO template_scope_subsets (tenant_id, room_type, scope_tag, label, trades, sort_order) VALUES
  (NULL, 'refresh', 'not_in_scope', 'Not in this bid', '{}',         0),
  (NULL, 'refresh', 'full_scope',   'Full Scope',       '{"__all__"}', 1),
  (NULL, 'refresh', 'custom',       'Custom',           '{"__all__"}', 2);

-- ── Exterior ──────────────────────────────────────────────────────────────────
INSERT INTO template_scope_subsets (tenant_id, room_type, scope_tag, label, trades, sort_order) VALUES
  (NULL, 'exterior', 'not_in_scope', 'Not in this bid', '{}',         0),
  (NULL, 'exterior', 'full_scope',   'Full Scope',       '{"__all__"}', 1),
  (NULL, 'exterior', 'custom',       'Custom',           '{"__all__"}', 2);
