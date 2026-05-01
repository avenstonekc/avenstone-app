ALTER TABLE jobs ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

-- Verify
SELECT column_default FROM information_schema.columns
WHERE table_name = 'jobs' AND column_name = 'id';
