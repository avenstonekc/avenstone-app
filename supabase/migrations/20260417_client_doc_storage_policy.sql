-- Allow clients to upload to job-documents storage bucket
-- Path format is: {job_id}/{timestamp}_{random}.{ext}
DROP POLICY IF EXISTS "job-documents: client upload own job" ON storage.objects;
CREATE POLICY "job-documents: client upload own job"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'job-documents'
  AND (
    -- Staff can upload to any path
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner','project_manager','sales_rep')
    OR
    -- Clients can upload to their own job folder (first path segment = job_id)
    (
      (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'client'
      AND EXISTS (
        SELECT 1 FROM public.jobs j
        WHERE j.id::text = split_part(name, '/', 1)
        AND (
          j.client_user_id = auth.uid()
          OR j.client_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
        )
      )
    )
  )
);

-- Allow clients to insert their own contract signatures
DROP POLICY IF EXISTS "signatures: client insert own" ON contract_signatures;
CREATE POLICY "signatures: client insert own"
ON contract_signatures FOR INSERT
WITH CHECK (
  get_my_role() = 'client'
  AND can_access_job(job_id)
  AND tenant_id = get_my_tenant_id()
);
