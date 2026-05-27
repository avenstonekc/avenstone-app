-- UNIFIED_FILES_ARC slice 3: virtual-row backfill + sync trigger for floor_plans + job_transactions.
--
-- Context:
--   floor_plans → bucket 'floor-plans', path: {tenant_id}/{fp_id}/v{version}.pdf
--   current_pdf_url stores a signed URL (not the path) — we reconstruct the path from IDs
--   Trigger fires on UPDATE (not INSERT — floor_plan has no PDF at INSERT time)
--
--   job_transactions → bucket 'job-receipts', receipt_url stores the storage path
--   18 existing rows have receipt_url IS NOT NULL → backfilled as virtual job_files rows
--
-- After this migration, every existing floor plan and receipt shows up in FilesTab.
-- New floor plans are synced automatically via the trigger.
-- New receipts are written directly by the dual-write in the Master Agent and sbUploadJobFile.

BEGIN;

-- =========================================================
-- 1. Backfill existing floor_plans → job_files virtual rows
--    Reconstruct storage path from tenant_id / id / current_pdf_version
-- =========================================================

INSERT INTO public.job_files (
  tenant_id, job_id, name, storage_path, storage_bucket,
  mime_type, category, subcategory, client_visible,
  related_entity_type, related_entity_id, created_at
)
SELECT
  fp.tenant_id,
  fp.job_id,
  COALESCE(fp.name, 'Floor Plan'),
  fp.tenant_id::text || '/' || fp.id::text || '/v' || COALESCE(fp.current_pdf_version, 1)::text || '.pdf',
  'floor-plans',
  'application/pdf',
  'Floor Plans',
  NULL,
  false,
  'floor_plan',
  fp.id,
  fp.created_at
FROM public.floor_plans fp
WHERE fp.tenant_id IS NOT NULL
  AND fp.job_id IS NOT NULL
  AND fp.current_pdf_url IS NOT NULL  -- only rows that already have a PDF
  AND NOT EXISTS (
    SELECT 1 FROM public.job_files jf
    WHERE jf.related_entity_type = 'floor_plan' AND jf.related_entity_id = fp.id
  );

-- =========================================================
-- 2. Trigger: sync floor_plans → job_files on UPDATE
--    Fires when current_pdf_url is updated (both on first PDF and on regenerate).
--    INSERT trigger not useful — no PDF at INSERT time.
-- =========================================================

CREATE OR REPLACE FUNCTION public.sync_floor_plan_to_job_files()
RETURNS TRIGGER AS $$
DECLARE
  v_storage_path TEXT;
BEGIN
  -- Only act when current_pdf_url is being set (non-null)
  IF NEW.current_pdf_url IS NULL THEN
    RETURN NEW;
  END IF;

  -- Reconstruct stable storage path (the signed URL in current_pdf_url expires — don't store it)
  v_storage_path := NEW.tenant_id::text || '/' || NEW.id::text
    || '/v' || COALESCE(NEW.current_pdf_version, 1)::text || '.pdf';

  -- Update existing row if present, insert if not
  UPDATE public.job_files
  SET
    storage_path = v_storage_path,
    name         = COALESCE(NEW.name, 'Floor Plan'),
    updated_at   = NOW()
  WHERE related_entity_type = 'floor_plan' AND related_entity_id = NEW.id;

  IF NOT FOUND THEN
    INSERT INTO public.job_files (
      tenant_id, job_id, name, storage_path, storage_bucket,
      mime_type, category, client_visible,
      related_entity_type, related_entity_id, created_at
    ) VALUES (
      NEW.tenant_id,
      NEW.job_id,
      COALESCE(NEW.name, 'Floor Plan'),
      v_storage_path,
      'floor-plans',
      'application/pdf',
      'Floor Plans',
      false,
      'floor_plan',
      NEW.id,
      NEW.created_at
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS floor_plans_sync_to_job_files ON public.floor_plans;
CREATE TRIGGER floor_plans_sync_to_job_files
  AFTER UPDATE ON public.floor_plans
  FOR EACH ROW
  WHEN (NEW.current_pdf_url IS DISTINCT FROM OLD.current_pdf_url AND NEW.current_pdf_url IS NOT NULL)
  EXECUTE FUNCTION public.sync_floor_plan_to_job_files();

-- =========================================================
-- 3. Backfill existing job_transactions with receipt_url → job_files
--    receipt_url stores the storage path in the 'job-receipts' bucket.
--    18 existing rows as of 2026-05-26.
-- =========================================================

INSERT INTO public.job_files (
  tenant_id, job_id, name, storage_path, storage_bucket,
  mime_type, category, subcategory, client_visible,
  related_entity_type, related_entity_id, created_at
)
SELECT
  jt.tenant_id,
  jt.job_id,
  'Receipt - ' || COALESCE(jt.payer_or_payee_name, 'unknown')
    || ' - ' || COALESCE(jt.date_paid::text, jt.created_at::date::text),
  jt.receipt_url,
  'job-receipts',
  'image/jpeg',
  'Receipts',
  NULL,
  false,
  'job_transaction',
  jt.id,
  jt.created_at
FROM public.job_transactions jt
WHERE jt.tenant_id IS NOT NULL
  AND jt.receipt_url IS NOT NULL
  AND jt.job_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.job_files jf
    WHERE jf.related_entity_type = 'job_transaction' AND jf.related_entity_id = jt.id
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
