-- SCE Phase 4B — public storage bucket for the visual option library.
--
-- Platform-wide, tenant-less: these are generic material/layout diagram cards with
-- ZERO tenant data. PUBLIC read (interview tap-cards render straight from the public
-- URL — signed URLs would be pointless overhead). Write is owner-only via RLS; the
-- upload script runs service-role (bypasses RLS) for the batch.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('scope-option-images', 'scope-option-images', true, 5242880, ARRAY['image/png'])
ON CONFLICT (id) DO NOTHING;

-- Public read (anon + authenticated list/download). The public flag already serves the
-- public URL; this makes the storage API SELECT consistent.
DROP POLICY IF EXISTS "scope_option_images_public_read" ON storage.objects;
CREATE POLICY "scope_option_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'scope-option-images');

-- Owner-only write (insert/update/delete). Service-role bypasses RLS for the batch upload.
DROP POLICY IF EXISTS "scope_option_images_owner_write" ON storage.objects;
CREATE POLICY "scope_option_images_owner_write" ON storage.objects
  FOR ALL
  USING (bucket_id = 'scope-option-images' AND get_my_role() = 'owner')
  WITH CHECK (bucket_id = 'scope-option-images' AND get_my_role() = 'owner');
