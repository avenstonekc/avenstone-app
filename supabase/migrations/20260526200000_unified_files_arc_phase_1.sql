-- UNIFIED_FILES_ARC slice 1: schema foundation + private bucket + backfill migration.
--
-- Audit findings (2026-05-26):
--   jobs.id is TEXT
--   photos.url stores full public URL ('https://.../job-photos/<path>') — no uploaded_by_id column
--   job_documents uses file_url (plain path), uploaded_by (uuid) — no mime_type/size_bytes
--   job-photos and job-documents buckets are BOTH public (security finding; flip deferred to Phase 3)
--   photos: 14 rows, job_documents: 39 rows (Avenstone tenant)
--   set_updated_at() function already exists
--
-- BUCKET PRIVACY NOTE: job-photos.public=false flip is DEFERRED to Phase 3.
-- Flipping it now would break every photo-viewing surface before Phase 3 rewires
-- consumers to use signed URLs from job_files. Phase 3 closing task.

BEGIN;

-- =========================================================
-- New private storage bucket for unified files
-- Files stored as: <tenant_id>/<job_id>/<file_id>.<ext>
-- =========================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('job-files', 'job-files', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "job-files tenant select" ON storage.objects;
CREATE POLICY "job-files tenant select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'job-files'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "job-files tenant insert" ON storage.objects;
CREATE POLICY "job-files tenant insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'job-files'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "job-files tenant update" ON storage.objects;
CREATE POLICY "job-files tenant update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'job-files'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "job-files tenant delete" ON storage.objects;
CREATE POLICY "job-files tenant delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'job-files'
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- =========================================================
-- tenant_file_subcategories — per-tenant folder taxonomy
-- =========================================================

CREATE TABLE IF NOT EXISTS public.tenant_file_subcategories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL,
  category      TEXT NOT NULL,
  subcategory   TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (tenant_id, category, subcategory)
);

ALTER TABLE public.tenant_file_subcategories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tfs_tenant_select ON public.tenant_file_subcategories;
CREATE POLICY tfs_tenant_select ON public.tenant_file_subcategories
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS tfs_tenant_modify ON public.tenant_file_subcategories;
CREATE POLICY tfs_tenant_modify ON public.tenant_file_subcategories
  FOR ALL TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('owner', 'project_manager')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('owner', 'project_manager')
    )
  );

-- Seed Avenstone GC defaults (16 Photos subcategories)
INSERT INTO public.tenant_file_subcategories (tenant_id, category, subcategory, display_order) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Photos', 'Before',      1),
  ('00000000-0000-0000-0000-000000000001', 'Photos', 'During',      2),
  ('00000000-0000-0000-0000-000000000001', 'Photos', 'After',       3),
  ('00000000-0000-0000-0000-000000000001', 'Photos', 'Demo',       10),
  ('00000000-0000-0000-0000-000000000001', 'Photos', 'Framing',    11),
  ('00000000-0000-0000-0000-000000000001', 'Photos', 'Plumbing',   12),
  ('00000000-0000-0000-0000-000000000001', 'Photos', 'Electrical', 13),
  ('00000000-0000-0000-0000-000000000001', 'Photos', 'HVAC',       14),
  ('00000000-0000-0000-0000-000000000001', 'Photos', 'Drywall',    15),
  ('00000000-0000-0000-0000-000000000001', 'Photos', 'Tile',       16),
  ('00000000-0000-0000-0000-000000000001', 'Photos', 'Flooring',   17),
  ('00000000-0000-0000-0000-000000000001', 'Photos', 'Cabinets',   18),
  ('00000000-0000-0000-0000-000000000001', 'Photos', 'Paint',      19),
  ('00000000-0000-0000-0000-000000000001', 'Photos', 'Trim/Finish',20),
  ('00000000-0000-0000-0000-000000000001', 'Photos', 'Roofing',    21),
  ('00000000-0000-0000-0000-000000000001', 'Photos', 'Final',      30)
ON CONFLICT (tenant_id, category, subcategory) DO NOTHING;

-- =========================================================
-- job_files — unified file model
-- =========================================================

CREATE TABLE IF NOT EXISTS public.job_files (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL,
  job_id                  TEXT NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  uploaded_by_id          UUID REFERENCES public.profiles(id),

  -- File storage
  name                    TEXT NOT NULL,
  storage_path            TEXT NOT NULL,
  storage_bucket          TEXT NOT NULL DEFAULT 'job-files',
  mime_type               TEXT,
  size_bytes              BIGINT,

  -- Categorization (folders are derived from these two columns — no folders table)
  category                TEXT NOT NULL
    CHECK (category IN ('Photos', 'Documents', 'Receipts', 'Floor Plans', 'Change Orders', 'Communications')),
  subcategory             TEXT,
  ai_confidence           NUMERIC,
  ai_subcategory_suggested TEXT,

  -- Visibility
  client_visible          BOOLEAN NOT NULL DEFAULT false,

  -- Entity linkage (preserves existing sbPhoto/sbUploadDoc patterns)
  related_entity_type     TEXT
    CHECK (related_entity_type IS NULL OR related_entity_type IN (
      'schedule_item', 'change_order', 'daily_log',
      'floor_plan', 'job_transaction', 'consultation_session'
    )),
  related_entity_id       UUID,

  -- Lifecycle (future Google Drive archive arc flips this)
  lifecycle_status        TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle_status IN ('active', 'archived', 'archive_failed')),
  archived_at             TIMESTAMPTZ,
  external_url            TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_files_job_category
  ON public.job_files(job_id, category)
  WHERE lifecycle_status = 'active';

CREATE INDEX IF NOT EXISTS idx_job_files_job_subcat
  ON public.job_files(job_id, category, subcategory)
  WHERE lifecycle_status = 'active';

CREATE INDEX IF NOT EXISTS idx_job_files_uncategorized
  ON public.job_files(job_id)
  WHERE subcategory IS NULL AND lifecycle_status = 'active';

CREATE INDEX IF NOT EXISTS idx_job_files_entity
  ON public.job_files(related_entity_type, related_entity_id)
  WHERE related_entity_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_files_tenant_recent
  ON public.job_files(tenant_id, created_at DESC)
  WHERE lifecycle_status = 'active';

ALTER TABLE public.job_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS jf_tenant_select ON public.job_files;
CREATE POLICY jf_tenant_select ON public.job_files
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS jf_tenant_insert ON public.job_files;
CREATE POLICY jf_tenant_insert ON public.job_files
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS jf_tenant_update ON public.job_files;
CREATE POLICY jf_tenant_update ON public.job_files
  FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS jf_tenant_delete ON public.job_files;
CREATE POLICY jf_tenant_delete ON public.job_files
  FOR DELETE TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('owner', 'project_manager', 'sales_rep')
    )
  );

DROP TRIGGER IF EXISTS job_files_updated_at ON public.job_files;
CREATE TRIGGER job_files_updated_at
  BEFORE UPDATE ON public.job_files
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- Backfill photos → job_files
--
-- photos.url stores the full public URL:
--   'https://.../storage/v1/object/public/job-photos/<path>'
-- We extract the storage path after '/job-photos/' for use
-- with createSignedUrl in sbSignJobFileUrl.
-- photos has no uploaded_by_id column → NULL.
-- Source table UNTOUCHED for backward compatibility.
-- =========================================================

WITH photos_data AS (
  SELECT
    p.tenant_id,
    p.job_id,
    COALESCE(p.name, 'photo') AS file_name,
    CASE
      WHEN p.url LIKE '%/job-photos/%' THEN SPLIT_PART(p.url, '/job-photos/', 2)
      ELSE p.url
    END AS extracted_path,
    p.type AS mime_type,
    CASE
      WHEN lower(p.label) IN ('before', 'after', 'during') THEN INITCAP(p.label)
      ELSE NULL
    END AS inferred_subcategory,
    COALESCE(p.client_visible, false) AS is_client_visible,
    p.related_entity_type,
    p.related_entity_id,
    p.created_at
  FROM public.photos p
  WHERE p.tenant_id IS NOT NULL
    AND p.job_id IS NOT NULL
)
INSERT INTO public.job_files (
  tenant_id, job_id, name, storage_path, storage_bucket,
  mime_type, category, subcategory, client_visible,
  related_entity_type, related_entity_id, created_at
)
SELECT
  pd.tenant_id,
  pd.job_id,
  pd.file_name,
  pd.extracted_path,
  'job-photos',
  pd.mime_type,
  'Photos',
  pd.inferred_subcategory,
  pd.is_client_visible,
  pd.related_entity_type,
  pd.related_entity_id,
  pd.created_at
FROM photos_data pd
WHERE pd.extracted_path IS NOT NULL
  AND pd.extracted_path != ''
  AND NOT EXISTS (
    SELECT 1 FROM public.job_files jf
    WHERE jf.storage_path = pd.extracted_path
      AND jf.storage_bucket = 'job-photos'
  );

-- =========================================================
-- Backfill job_documents → job_files
--
-- job_documents.file_url stores the plain storage path already.
-- job_documents.uploaded_by is the uploader uuid (not uploaded_by_id).
-- No mime_type or size_bytes columns on job_documents.
-- Source table UNTOUCHED for backward compatibility.
-- =========================================================

INSERT INTO public.job_files (
  tenant_id, job_id, uploaded_by_id, name, storage_path, storage_bucket,
  category, subcategory, client_visible, created_at
)
SELECT
  d.tenant_id,
  d.job_id,
  d.uploaded_by,
  d.name,
  d.file_url,
  'job-documents',
  CASE
    WHEN d.file_type IN ('receipt', 'invoice') THEN 'Receipts'
    ELSE 'Documents'
  END,
  CASE
    WHEN d.file_type = 'permit'     THEN 'Permits'
    WHEN d.file_type = 'plan'       THEN 'Plans'
    WHEN d.file_type = 'contract'   THEN 'Contracts'
    WHEN d.file_type = 'spec'       THEN 'Specs'
    WHEN d.file_type = 'inspection' THEN 'Inspections'
    ELSE NULL
  END,
  COALESCE(d.client_visible, false),
  d.created_at
FROM public.job_documents d
WHERE d.tenant_id IS NOT NULL
  AND d.job_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.job_files jf
    WHERE jf.storage_path = d.file_url
      AND jf.storage_bucket = 'job-documents'
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
