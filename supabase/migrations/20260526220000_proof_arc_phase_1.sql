-- PROOF_ARC Phase 1: schema foundation for photo evidence gates.
--
-- Adds:
--   1. photos.category  — app-level enum for proof categories (no DB CHECK; values added in JS)
--   2. idx_photos_entity_category — fast per-entity-per-category count queries
--   3. Backfill photos.category from photos.label for 'before'/'after' rows
--   4. jobs.before_photos_required — per-job flag, DEFAULT false (all existing jobs grandfathered)
--   5. change_orders.co_condition_bypass_reason — audit trail when owner/PM skips condition photo
--   6. change_orders.co_fix_bypass_reason       — audit trail when owner/PM approves without fix photo
--
-- Values in use today: 'co_condition', 'co_fix', 'before', 'after'
-- Future (PROOF_ARC Phase 4+): 'delivery', 'during', 'install'

BEGIN;

ALTER TABLE public.photos
  ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS idx_photos_entity_category
  ON public.photos(related_entity_type, related_entity_id, category)
  WHERE category IS NOT NULL;

-- Backfill: photos that already have label='before' or 'after' get category set
UPDATE public.photos
SET category = label
WHERE label IN ('before', 'after')
  AND category IS NULL;

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS before_photos_required BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.change_orders
  ADD COLUMN IF NOT EXISTS co_condition_bypass_reason TEXT,
  ADD COLUMN IF NOT EXISTS co_fix_bypass_reason TEXT;

COMMIT;

NOTIFY pgrst, 'reload schema';
