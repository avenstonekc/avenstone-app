-- SCHEDULING_ARC slice 1: schema foundation for dependency tracking, phase linkage,
-- actual finish tracking, and sub capacity modeling.
-- All NULLable/defaulted for backward compatibility with existing schedule_items rows.

BEGIN;

-- ============================================================
-- schedule_items extensions
-- ============================================================

ALTER TABLE public.schedule_items
  ADD COLUMN IF NOT EXISTS duration_days INTEGER DEFAULT 1;

ALTER TABLE public.schedule_items
  ADD COLUMN IF NOT EXISTS predecessor_ids UUID[] DEFAULT ARRAY[]::UUID[];

ALTER TABLE public.schedule_items
  ADD COLUMN IF NOT EXISTS lag_days INTEGER DEFAULT 0;

ALTER TABLE public.schedule_items
  ADD COLUMN IF NOT EXISTS is_milestone BOOLEAN DEFAULT false;

ALTER TABLE public.schedule_items
  ADD COLUMN IF NOT EXISTS actual_finish_date DATE;

ALTER TABLE public.schedule_items
  ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES public.job_phases(id) ON DELETE SET NULL;

-- Cascade engine: find items by predecessor membership
CREATE INDEX IF NOT EXISTS idx_schedule_items_predecessors
  ON public.schedule_items USING GIN (predecessor_ids);

-- Phase rollup queries
CREATE INDEX IF NOT EXISTS idx_schedule_items_phase
  ON public.schedule_items (phase_id) WHERE phase_id IS NOT NULL;

-- Client portal milestone queries
CREATE INDEX IF NOT EXISTS idx_schedule_items_milestone
  ON public.schedule_items (job_id, is_milestone) WHERE is_milestone = true;

-- ============================================================
-- contacts: sub capacity
-- ============================================================

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS daily_capacity_hours NUMERIC(4,2) DEFAULT 8.0;

COMMENT ON COLUMN public.contacts.daily_capacity_hours IS
  'Default daily working hours capacity for resource conflict detection. NULL = no capacity tracking. Default 8h.';

-- ============================================================
-- schedule_change_log — audit trail for cascade engine (slice 6)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.schedule_change_log (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL,
  schedule_item_id     UUID NOT NULL REFERENCES public.schedule_items(id) ON DELETE CASCADE,
  job_id               TEXT NOT NULL,
  change_kind          TEXT NOT NULL,
  old_value            JSONB,
  new_value            JSONB,
  cascade_source_id    UUID REFERENCES public.schedule_items(id) ON DELETE SET NULL,
  reason               TEXT,
  changed_by_id        UUID REFERENCES public.profiles(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.schedule_change_log
  DROP CONSTRAINT IF EXISTS schedule_change_log_kind_check;
ALTER TABLE public.schedule_change_log
  ADD CONSTRAINT schedule_change_log_kind_check
  CHECK (change_kind IN ('date_moved','duration_changed','finished','cancelled','created','cascade_applied'));

CREATE INDEX IF NOT EXISTS idx_sched_chg_log_item
  ON public.schedule_change_log(schedule_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sched_chg_log_job
  ON public.schedule_change_log(job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sched_chg_log_cascade
  ON public.schedule_change_log(cascade_source_id) WHERE cascade_source_id IS NOT NULL;

ALTER TABLE public.schedule_change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scl_tenant_select ON public.schedule_change_log;
CREATE POLICY scl_tenant_select ON public.schedule_change_log
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS scl_tenant_insert ON public.schedule_change_log;
CREATE POLICY scl_tenant_insert ON public.schedule_change_log
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid()));

COMMIT;

NOTIFY pgrst, 'reload schema';
