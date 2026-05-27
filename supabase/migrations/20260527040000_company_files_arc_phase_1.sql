-- COMPANY_FILES_ARC Phase 1 — company_files table + company-files storage bucket
--
-- Locked decisions honored:
--   - visible_to_roles TEXT[] (not auto_share_with_clients BOOLEAN — patched blueprint)
--   - Partial unique index for one active row per (tenant_id, type)
--   - cf_tenant_select: all tenant members can read (visible_to_roles gates portal surfaces, not DB access)
--   - cf_modify: owner / project_manager / sales_rep only for writes
--   - set_updated_at trigger (function pre-exists from existing migrations)
--   - company-files bucket is PRIVATE (Locked Decision 9)
--   - No backfill needed — net-new table
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, ON CONFLICT DO UPDATE,
--   DROP POLICY IF EXISTS before each CREATE POLICY.

-- ─── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.company_files (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID          NOT NULL,
  uploaded_by_id   UUID          REFERENCES profiles(id),

  -- File data
  name             TEXT          NOT NULL,
  storage_path     TEXT          NOT NULL,
  storage_bucket   TEXT          NOT NULL DEFAULT 'company-files',
  mime_type        TEXT,
  size_bytes       BIGINT,

  -- Categorization
  category         TEXT          NOT NULL
                     CHECK (category IN ('Insurance', 'License', 'Tax', 'Legal',
                                         'Compliance', 'Template', 'Other')),
  type             TEXT          NOT NULL,  -- canonical free-text label, e.g. "GL Insurance"

  -- Metadata (extracted by Haiku vision or rep-entered)
  issuer           TEXT,
  policy_number    TEXT,
  effective_date   DATE,
  expiration_date  DATE,
  extracted_fields JSONB         NOT NULL DEFAULT '{}'::jsonb,

  -- Visibility: valid values are owner, project_manager, sales_rep, sub, client
  -- 'client' = ANY(visible_to_roles) → virtual job_files row at job creation (Phase 3a)
  -- 'sub'    = ANY(visible_to_roles) → sub portal Company Documents direct query (Phase 3b)
  -- owner always sees all files via RLS regardless of this column (cf_tenant_select)
  visible_to_roles TEXT[]        NOT NULL DEFAULT '{}',

  -- Lifecycle
  lifecycle_status TEXT          NOT NULL DEFAULT 'active'
                     CHECK (lifecycle_status IN ('active', 'archived')),
  archived_at      TIMESTAMPTZ,
  replaced_by_id   UUID          REFERENCES company_files(id),

  -- Audit
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

-- One active row per (tenant_id, type). Archived history coexists without conflict.
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_files_one_active_per_type
  ON company_files(tenant_id, type)
  WHERE lifecycle_status = 'active';

CREATE INDEX IF NOT EXISTS idx_company_files_tenant_active
  ON company_files(tenant_id, category)
  WHERE lifecycle_status = 'active';

CREATE INDEX IF NOT EXISTS idx_company_files_expiration
  ON company_files(tenant_id, expiration_date)
  WHERE lifecycle_status = 'active' AND expiration_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_company_files_client_visible
  ON company_files(tenant_id)
  WHERE 'client' = ANY(visible_to_roles) AND lifecycle_status = 'active';

CREATE INDEX IF NOT EXISTS idx_company_files_sub_visible
  ON company_files(tenant_id)
  WHERE 'sub' = ANY(visible_to_roles) AND lifecycle_status = 'active';

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.company_files ENABLE ROW LEVEL SECURITY;

-- All tenant members can read (visible_to_roles gates portal surfaces, not DB-level access).
-- Owner is never locked out of their own files.
DROP POLICY IF EXISTS cf_tenant_select ON public.company_files;
CREATE POLICY cf_tenant_select ON public.company_files
  FOR SELECT TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  ));

-- Only owner / project_manager / sales_rep can INSERT / UPDATE / DELETE.
DROP POLICY IF EXISTS cf_modify ON public.company_files;
CREATE POLICY cf_modify ON public.company_files
  FOR ALL TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE id = auth.uid()
        AND role IN ('owner', 'project_manager', 'sales_rep')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE id = auth.uid()
        AND role IN ('owner', 'project_manager', 'sales_rep')
    )
  );

-- ─── Trigger ─────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS company_files_updated_at ON public.company_files;
CREATE TRIGGER company_files_updated_at
  BEFORE UPDATE ON public.company_files
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Storage bucket ──────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('company-files', 'company-files', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Upload: tenant member must match path prefix <tenant_id>/...
DROP POLICY IF EXISTS "company_files_tenant_upload" ON storage.objects;
CREATE POLICY "company_files_tenant_upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-files'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM profiles WHERE id = auth.uid()
    )
  );

-- Read: any authenticated tenant member (signed URL pattern)
DROP POLICY IF EXISTS "company_files_tenant_read" ON storage.objects;
CREATE POLICY "company_files_tenant_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'company-files'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM profiles WHERE id = auth.uid()
    )
  );

-- Delete: owner / project_manager only
DROP POLICY IF EXISTS "company_files_tenant_delete" ON storage.objects;
CREATE POLICY "company_files_tenant_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'company-files'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM profiles
      WHERE id = auth.uid()
        AND role IN ('owner', 'project_manager')
    )
  );
