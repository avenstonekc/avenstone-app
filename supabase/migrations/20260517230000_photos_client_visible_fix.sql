-- photos.client_visible was added previously with DEFAULT false and nullable,
-- but existing photos should default to true (visible). Fix the default,
-- backfill existing rows, and add NOT NULL constraint.

UPDATE photos SET client_visible = true WHERE client_visible IS NULL OR client_visible = false;

ALTER TABLE photos
  ALTER COLUMN client_visible SET DEFAULT true,
  ALTER COLUMN client_visible SET NOT NULL;

-- Verify
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'photos'
  AND column_name  = 'client_visible';

NOTIFY pgrst, 'reload schema';
