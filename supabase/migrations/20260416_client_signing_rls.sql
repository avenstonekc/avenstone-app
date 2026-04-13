-- Allow clients to mark their own contract as signed
CREATE POLICY "jobs: client sign" ON jobs FOR UPDATE
  USING (
    get_my_role() = 'client'
    AND (
      client_user_id = auth.uid()
      OR client_email = (SELECT email FROM profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    get_my_role() = 'client'
    AND (
      client_user_id = auth.uid()
      OR client_email = (SELECT email FROM profiles WHERE id = auth.uid())
    )
  );

-- Allow clients to save documents (signed contract PDF) for their own job
DROP POLICY IF EXISTS "docs: insert by staff" ON job_documents;
CREATE POLICY "docs: insert by staff" ON job_documents FOR INSERT
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner','project_manager','sales_rep')
  );

CREATE POLICY "docs: client insert own job" ON job_documents FOR INSERT
  WITH CHECK (
    get_my_role() = 'client'
    AND can_access_job(job_id)
    AND tenant_id = get_my_tenant_id()
  );
