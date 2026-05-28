-- draw-packages storage bucket + RLS
-- NOTE: Bucket created directly via Management API (INSERT INTO storage.buckets)
-- and storage.objects policy applied via Management API.
-- This file documents what was applied on 2026-05-27.

-- Storage bucket (private, PDF only, 50MB limit):
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES ('draw-packages', 'draw-packages', false, 52428800, ARRAY['application/pdf']::text[])
-- ON CONFLICT (id) DO NOTHING;

-- Storage RLS policy (staff/owner of job can access their draw package files):
-- CREATE POLICY "draw_packages_storage_rls" ON storage.objects
--   FOR ALL
--   USING (bucket_id = 'draw-packages' AND can_access_job(split_part(name, '/', 1)))
--   WITH CHECK (bucket_id = 'draw-packages' AND can_access_job(split_part(name, '/', 1)));
