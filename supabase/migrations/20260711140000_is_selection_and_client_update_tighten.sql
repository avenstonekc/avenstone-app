-- SCOPE_TO_ESTIMATE Phase C2 — is_selection flag + seed + client UPDATE tightening.
-- Blueprint locked 2026-07-11.

-- 1) is_selection: the client Selections tab + Demo gate filter on
--    audience='rep_client' AND is_selection=true. Pure finish/material/style/pattern picks in
--    the five day-one trades (tile, flooring, cabinets/counters, fixtures/finishes, paint).
ALTER TABLE scope_checklists ADD COLUMN IF NOT EXISTS is_selection BOOLEAN NOT NULL DEFAULT false;

-- Seed. Scope-config/extent/info fields (layout_change, tub_shower_config, tile_height, niche,
-- backsplash_extent, uppers, island, appliances, *_extent, age_of_home) intentionally stay false.
-- Platform-null + tenant rows both flip (match on project_type+field_key). No paint choice field
-- exists in the current checklist seed, so the paint trade has nothing to flag.
UPDATE scope_checklists SET is_selection = true
WHERE audience = 'rep_client' AND field_type = 'choice' AND active
  AND (project_type, field_key) IN (
    ('bathroom','wall_tile_layout'), ('bathroom','shower_glass'), ('bathroom','floor_tile'),
    ('bathroom','vanity_style'),     ('bathroom','countertop'),  ('bathroom','fixture_finish'),
    ('bathroom','toilet'),
    ('kitchen','cabinet_style'),     ('kitchen','countertop'),   ('kitchen','counter_edge'),
    ('kitchen','sink'),              ('kitchen','backsplash_layout'),
    ('basement','flooring')
  );

-- 2) Tighten the C1 client UPDATE policy: additionally forbid setting confirmed_by/confirmed_at
--    (closes C1's cosmetic flag — a client may re-pick but can NEVER stamp the confirmation
--    fields). Drop + recreate.
DROP POLICY IF EXISTS job_scope_answers_client_update ON job_scope_answers;
CREATE POLICY job_scope_answers_client_update ON job_scope_answers FOR UPDATE
  USING (
    get_my_role() = 'client' AND can_access_job(job_id) AND tenant_id = get_my_tenant_id()
    AND source = 'client_selected' AND status = 'proposed'
  )
  WITH CHECK (
    get_my_role() = 'client' AND can_access_job(job_id) AND tenant_id = get_my_tenant_id()
    AND source = 'client_selected' AND status = 'proposed'
    AND confirmed_by IS NULL AND confirmed_at IS NULL
  );
