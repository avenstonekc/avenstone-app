-- daily_logs had no UPDATE policy — sbSendDailyLog and sbSaveDailyLogClientMessage
-- were silently affecting 0 rows and returning ok:true (PostgREST silent-deny behaviour).
-- photos had no UPDATE policy — sbSetPhotoClientVisible was silently failing too.

-- Mirror the existing INSERT policy: owner/pm/sub may update logs they can access.
CREATE POLICY "logs: staff update"
  ON daily_logs AS PERMISSIVE FOR UPDATE
  TO public
  USING  (can_access_job(job_id) AND get_my_role() = ANY (ARRAY['owner','project_manager','sub']))
  WITH CHECK (can_access_job(job_id) AND get_my_role() = ANY (ARRAY['owner','project_manager','sub']));

-- Mirror the existing DELETE policy: owner/pm may update photos on accessible jobs.
CREATE POLICY "photos: owner/pm update"
  ON photos AS PERMISSIVE FOR UPDATE
  TO public
  USING  (can_access_job(job_id) AND get_my_role() = ANY (ARRAY['owner','project_manager']))
  WITH CHECK (can_access_job(job_id) AND get_my_role() = ANY (ARRAY['owner','project_manager']));

-- Verify
SELECT tablename, policyname, permissive, cmd
FROM pg_policies
WHERE (tablename = 'daily_logs' AND policyname = 'logs: staff update')
   OR (tablename = 'photos'     AND policyname = 'photos: owner/pm update')
ORDER BY tablename, policyname;

NOTIFY pgrst, 'reload schema';
