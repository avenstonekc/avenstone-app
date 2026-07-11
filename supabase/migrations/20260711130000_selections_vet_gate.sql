-- SCOPE_TO_ESTIMATE Phase C1 — SELECTIONS opens: stamp column + client vet-gate RLS.
-- Blueprint locked 2026-07-11. The client soft-picks into job_scope_answers, forced at the
-- DB to source='client_selected' + status='proposed'; staff (PM) confirm flips status in C2.

-- 1) Stamp column: when set, the client portal surfaces the Selections tab.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS selections_opened_at TIMESTAMPTZ;

-- 2) Role-scope the Phase A staff FOR ALL policies. FOOTGUN (Phase A header): can_access_job
--    ALSO admits the linked client, so without a role check the permissive RLS union would let
--    the client ride the staff policy past the vet-gate. Drop + recreate, same name, now staff-only.
DROP POLICY IF EXISTS job_scope_answers_staff_all ON job_scope_answers;
CREATE POLICY job_scope_answers_staff_all ON job_scope_answers FOR ALL
  USING (can_access_job(job_id) AND tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','project_manager','sales_rep'))
  WITH CHECK (can_access_job(job_id) AND tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','project_manager','sales_rep'));

DROP POLICY IF EXISTS job_rooms_staff_all ON job_rooms;
CREATE POLICY job_rooms_staff_all ON job_rooms FOR ALL
  USING (can_access_job(job_id) AND tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','project_manager','sales_rep'))
  WITH CHECK (can_access_job(job_id) AND tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','project_manager','sales_rep'));

-- 3) Client SELECT on job_scope_answers: confirmed answers (locked selections, any source) +
--    their own proposed client picks. Never proposed staff answers ("nothing renders to clients
--    from proposed except their own picks").
CREATE POLICY job_scope_answers_client_select ON job_scope_answers FOR SELECT
  USING (
    get_my_role() = 'client' AND can_access_job(job_id) AND tenant_id = get_my_tenant_id()
    AND (status = 'confirmed' OR (source = 'client_selected' AND status = 'proposed'))
  );

-- 4) Client INSERT: forced source='client_selected' + status='proposed' at the DB (vet-gate).
CREATE POLICY job_scope_answers_client_insert ON job_scope_answers FOR INSERT
  WITH CHECK (
    get_my_role() = 'client' AND can_access_job(job_id) AND tenant_id = get_my_tenant_id()
    AND source = 'client_selected' AND status = 'proposed'
  );

-- 5) Client UPDATE: re-picks only, on their own proposed client_selected rows. USING excludes
--    confirmed rows; WITH CHECK forbids flipping source/status. No client DELETE (no policy).
CREATE POLICY job_scope_answers_client_update ON job_scope_answers FOR UPDATE
  USING (
    get_my_role() = 'client' AND can_access_job(job_id) AND tenant_id = get_my_tenant_id()
    AND source = 'client_selected' AND status = 'proposed'
  )
  WITH CHECK (
    get_my_role() = 'client' AND can_access_job(job_id) AND tenant_id = get_my_tenant_id()
    AND source = 'client_selected' AND status = 'proposed'
  );

-- 6) Client SELECT on job_rooms (read-only — render picks grouped by room). No client write.
CREATE POLICY job_rooms_client_select ON job_rooms FOR SELECT
  USING (get_my_role() = 'client' AND can_access_job(job_id) AND tenant_id = get_my_tenant_id());
