-- Clients may only SELECT approved (sent) daily_logs for their own job.
-- AS RESTRICTIVE ensures this gate applies even when permissive policies
-- would otherwise allow access (e.g. can_access_job).

CREATE POLICY "daily_logs: client approved only gate"
  ON daily_logs AS RESTRICTIVE FOR SELECT
  TO authenticated
  USING (
    get_my_role() != 'client'
    OR (
      status = 'approved'
      AND EXISTS (
        SELECT 1 FROM jobs
        WHERE jobs.id = daily_logs.job_id
          AND jobs.client_user_id = auth.uid()
      )
    )
  );

-- Verify
SELECT policyname, cmd, qual, with_check, permissive
FROM pg_policies
WHERE tablename = 'daily_logs'
  AND policyname = 'daily_logs: client approved only gate';
