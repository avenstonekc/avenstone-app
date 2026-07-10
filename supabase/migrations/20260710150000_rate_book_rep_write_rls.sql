-- ESTIMATOR Phase 5 · S4 — rep-write path on rate_book_labor via RLS relaxation.
--
-- Locked decision: RELAX RLS (not a service-role edge fn). The non-owner staff roles that
-- reach EstimateTab and run estimates — project_manager + sales_rep — may FEED the book
-- with UNVETTED rates but can NEVER write or flip a vetted rate. Owner-vet promotion stays
-- the guard. rate_book_material is intentionally NOT relaxed (owner-only) this phase.
--
-- These ADD permissive policies. Postgres OR's permissive policies per command, so the
-- existing owner policies (rbl_insert/rbl_update/rbl_select/rbl_delete) are UNTOUCHED and
-- owner writes are unaffected. vetted=false on BOTH the INSERT WITH CHECK and the UPDATE
-- USING+CHECK means staff can neither edit a vetted rate nor flip an unvetted one to vetted.
-- The UPDATE policy is required so the upsert (INSERT ... ON CONFLICT DO UPDATE) path works
-- for staff when they re-submit an existing unvetted natural key.

DROP POLICY IF EXISTS rbl_insert_staff ON rate_book_labor;
CREATE POLICY rbl_insert_staff ON rate_book_labor
  FOR INSERT
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND vetted = false
    AND get_my_role() IN ('project_manager', 'sales_rep')
  );

DROP POLICY IF EXISTS rbl_update_staff ON rate_book_labor;
CREATE POLICY rbl_update_staff ON rate_book_labor
  FOR UPDATE
  USING (
    tenant_id = get_my_tenant_id()
    AND vetted = false
    AND get_my_role() IN ('project_manager', 'sales_rep')
  )
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND vetted = false
    AND get_my_role() IN ('project_manager', 'sales_rep')
  );

NOTIFY pgrst, 'reload schema';
