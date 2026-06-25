-- B1.7 Phase 3 carry-along: add owner/PM role gate to bid_model_config INSERT + UPDATE.
-- bid_model_config was the only config table without DB-level write role restriction.
-- mirrors mcc_owner_write policy syntax from markup_category_config exactly.
-- SELECT and DELETE policies are intentionally untouched.

DROP POLICY IF EXISTS bid_model_config_insert ON bid_model_config;
CREATE POLICY bid_model_config_insert ON bid_model_config
  FOR INSERT
  WITH CHECK (
    (tenant_id = get_my_tenant_id())
    AND (get_my_role() = ANY (ARRAY['owner'::text, 'project_manager'::text]))
  );

DROP POLICY IF EXISTS bid_model_config_update ON bid_model_config;
CREATE POLICY bid_model_config_update ON bid_model_config
  FOR UPDATE
  USING (
    (tenant_id = get_my_tenant_id())
    AND (get_my_role() = ANY (ARRAY['owner'::text, 'project_manager'::text]))
  )
  WITH CHECK (
    (tenant_id = get_my_tenant_id())
    AND (get_my_role() = ANY (ARRAY['owner'::text, 'project_manager'::text]))
  );
