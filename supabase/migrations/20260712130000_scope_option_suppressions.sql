-- CONFIGURATOR_POLISH Phase 3 — scope_option_suppressions: "when gate_field = gate_option, hide
-- suppressed_field". Sibling binding table, keyed like scope_option_trades / scope_option_images.
-- GOVERNING RULE (Kalin): wrongly suppressing loses money silently; a moot question is merely
-- annoying — borderline = KEEP. Seed below is the signed-off conservative set only.
-- Read by ai-estimator scope_plan/scope_interview AND honored by the configurator.

CREATE TABLE scope_option_suppressions (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID        REFERENCES tenants(id) ON DELETE CASCADE, -- NULL = platform
  project_type         TEXT        NOT NULL,
  gate_field_key       TEXT        NOT NULL,
  gate_option_key      TEXT        NOT NULL,   -- the value that triggers suppression (number fields: the digit)
  suppressed_field_key TEXT        NOT NULL,
  active               BOOLEAN     NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, project_type, gate_field_key, gate_option_key, suppressed_field_key)
);

CREATE INDEX idx_scope_option_suppressions_lookup ON scope_option_suppressions (project_type, gate_field_key);

ALTER TABLE scope_option_suppressions ENABLE ROW LEVEL SECURITY;
-- Public read (platform catalog, zero tenant data; edge fn reads service-role anyway), owner write.
CREATE POLICY sos_public_select ON scope_option_suppressions FOR SELECT USING (true);
CREATE POLICY sos_owner_write ON scope_option_suppressions FOR ALL
  USING (get_my_role() = 'owner') WITH CHECK (get_my_role() = 'owner');

-- Vocab addition (sanctioned): add a 'none' option to kitchen backsplash_extent so
-- backsplash_extent=none can suppress backsplash_layout. No scope_option_trades/images row
-- references 'none' (verified), so no binding conflict.
UPDATE scope_checklists
   SET options = '["none","standard","full_range","full_all"]'::jsonb
 WHERE tenant_id IS NULL AND project_type='kitchen' AND field_key='backsplash_extent' AND active;

-- ── Seed (platform rows, tenant_id NULL) — signed-off suppressions only ───────
INSERT INTO scope_option_suppressions (tenant_id, project_type, gate_field_key, gate_option_key, suppressed_field_key) VALUES
  -- bathroom: no shower present (tub only)
  (NULL,'bathroom','tub_shower_config','tub_only','shower_entry'),
  (NULL,'bathroom','tub_shower_config','tub_only','shower_drain'),
  (NULL,'bathroom','tub_shower_config','tub_only','shower_floor_tiled'),
  (NULL,'bathroom','tub_shower_config','tub_only','shower_bench'),
  (NULL,'bathroom','tub_shower_config','tub_only','shower_valve'),
  (NULL,'bathroom','tub_shower_config','tub_only','shower_glass'),
  -- bathroom: tub/shower combo — tub is the floor/curb/drain
  (NULL,'bathroom','tub_shower_config','combo','shower_entry'),
  (NULL,'bathroom','tub_shower_config','combo','shower_drain'),
  (NULL,'bathroom','tub_shower_config','combo','shower_floor_tiled'),
  (NULL,'bathroom','tub_shower_config','combo','shower_bench'),
  -- bathroom: curb decision already captured → suppress the module re-asks (the double-ask)
  (NULL,'bathroom','shower_entry','curbless','curb_type'),
  (NULL,'bathroom','shower_entry','curbless','threshold_heights'),
  (NULL,'bathroom','shower_entry','curb','threshold_heights'),
  -- bathroom: zero vanities
  (NULL,'bathroom','vanity_count','0','vanity_style'),
  (NULL,'bathroom','vanity_count','0','vanity_size_in'),
  (NULL,'bathroom','vanity_count','0','countertop'),
  -- kitchen
  (NULL,'kitchen','cabinets_supply','paint_existing','cabinet_style'),
  (NULL,'kitchen','backsplash_extent','none','backsplash_layout'),
  -- roof: standing seam has no shingle grade
  (NULL,'roof','material','standing_seam','shingle_grade')
ON CONFLICT (tenant_id, project_type, gate_field_key, gate_option_key, suppressed_field_key) DO NOTHING;
