-- Photo curation for daily logs: add client_visible flag.
-- Existing photos default true (no change in visibility). Slice 5 client
-- view filters WHERE client_visible = true for photos on sent logs.

ALTER TABLE photos ADD COLUMN client_visible BOOLEAN NOT NULL DEFAULT true;

-- Verify
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'photos'
  AND column_name  = 'client_visible';

NOTIFY pgrst, 'reload schema';
