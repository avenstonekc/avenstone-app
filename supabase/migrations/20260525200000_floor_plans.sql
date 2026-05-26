-- FLOOR_PLAN_LAYOUT_ARC Phase 5a: floor_plans + floor_plan_versions
-- Floor plans become first-class persistent entities. Raw scan + layout overrides + version history
-- persist so users can re-open a saved plan, edit it, regenerate the PDF, send specific versions.

BEGIN;

-- ============================================================
-- floor_plans: one row per named floor plan draft
-- ============================================================

CREATE TABLE IF NOT EXISTS public.floor_plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL,
  job_id                TEXT REFERENCES public.jobs(id) ON DELETE CASCADE,
  contact_id            TEXT REFERENCES public.contacts(id) ON DELETE SET NULL,
  created_by            UUID NOT NULL REFERENCES auth.users(id),
  name                  TEXT NOT NULL,
  raw_scan              JSONB NOT NULL,
  layout_overrides      JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_pdf_url       TEXT,
  current_pdf_version   INTEGER NOT NULL DEFAULT 1,
  status                TEXT NOT NULL DEFAULT 'draft',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.floor_plans
  DROP CONSTRAINT IF EXISTS floor_plans_status_check;
ALTER TABLE public.floor_plans
  ADD CONSTRAINT floor_plans_status_check
  CHECK (status IN ('draft','sent','archived'));

-- Must have either job_id or contact_id (orphan plans not allowed).
ALTER TABLE public.floor_plans
  DROP CONSTRAINT IF EXISTS floor_plans_anchored_check;
ALTER TABLE public.floor_plans
  ADD CONSTRAINT floor_plans_anchored_check
  CHECK (job_id IS NOT NULL OR contact_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_floor_plans_job
  ON public.floor_plans(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_floor_plans_contact
  ON public.floor_plans(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_floor_plans_tenant_status
  ON public.floor_plans(tenant_id, status);

ALTER TABLE public.floor_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fp_tenant_select ON public.floor_plans;
CREATE POLICY fp_tenant_select ON public.floor_plans
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS fp_tenant_insert ON public.floor_plans;
CREATE POLICY fp_tenant_insert ON public.floor_plans
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS fp_tenant_update ON public.floor_plans;
CREATE POLICY fp_tenant_update ON public.floor_plans
  FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS fp_tenant_delete ON public.floor_plans;
CREATE POLICY fp_tenant_delete ON public.floor_plans
  FOR DELETE TO authenticated
  USING (
    tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND created_by = auth.uid()
  );

DROP TRIGGER IF EXISTS trg_floor_plans_updated_at ON public.floor_plans;
CREATE TRIGGER trg_floor_plans_updated_at
  BEFORE UPDATE ON public.floor_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- floor_plan_versions: version history per floor plan
-- ============================================================

CREATE TABLE IF NOT EXISTS public.floor_plan_versions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_plan_id               UUID NOT NULL REFERENCES public.floor_plans(id) ON DELETE CASCADE,
  tenant_id                   UUID NOT NULL,
  version_number              INTEGER NOT NULL,
  pdf_url                     TEXT NOT NULL,
  layout_overrides_snapshot   JSONB NOT NULL,
  raw_scan_snapshot           JSONB NOT NULL,
  sent_to                     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  sent_at                     TIMESTAMPTZ,
  created_by                  UUID NOT NULL REFERENCES auth.users(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fpv_plan_version
  ON public.floor_plan_versions(floor_plan_id, version_number);

CREATE INDEX IF NOT EXISTS idx_fpv_plan_lookup
  ON public.floor_plan_versions(floor_plan_id, created_at DESC);

ALTER TABLE public.floor_plan_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fpv_tenant_select ON public.floor_plan_versions;
CREATE POLICY fpv_tenant_select ON public.floor_plan_versions
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS fpv_tenant_insert ON public.floor_plan_versions;
CREATE POLICY fpv_tenant_insert ON public.floor_plan_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS fpv_tenant_update ON public.floor_plan_versions;
CREATE POLICY fpv_tenant_update ON public.floor_plan_versions
  FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

-- No DELETE policy on versions — history is immutable.

-- ============================================================
-- Storage bucket for floor plan PDFs
-- Path convention: floor-plans/<tenant_id>/<floor_plan_id>/v<N>.pdf
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('floor-plans', 'floor-plans', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "floor-plans tenant read" ON storage.objects;
CREATE POLICY "floor-plans tenant read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'floor-plans'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "floor-plans tenant insert" ON storage.objects;
CREATE POLICY "floor-plans tenant insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'floor-plans'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM public.profiles WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "floor-plans tenant update" ON storage.objects;
CREATE POLICY "floor-plans tenant update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'floor-plans'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM public.profiles WHERE id = auth.uid()
    )
  );

COMMIT;

NOTIFY pgrst, 'reload schema';
