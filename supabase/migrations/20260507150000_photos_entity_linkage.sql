-- Phase 11a — per-entity photo linkage for photo gates
-- Allows photos to be associated with a specific schedule_item or material_order
-- in addition to (or instead of) the job-level job_id association.
-- Nullable: all existing job-level photos are unaffected.

ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS related_entity_type TEXT,
  ADD COLUMN IF NOT EXISTS related_entity_id   UUID;

CREATE INDEX IF NOT EXISTS idx_photos_entity
  ON photos(related_entity_type, related_entity_id)
  WHERE related_entity_type IS NOT NULL;

-- Verify
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'photos' AND column_name IN ('related_entity_type', 'related_entity_id');

NOTIFY pgrst, 'reload schema';
