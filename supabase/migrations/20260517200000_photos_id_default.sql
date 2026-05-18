-- photos.id is TEXT NOT NULL with no default. Every insert that omits id (including
-- sbPhoto) fails with "null value in column id violates not-null constraint".
-- Set a uuid_generate_v4()::text default to match the pattern used by other tables
-- (daily_logs.id uses uuid_generate_v4()). Keep the column as text since the photos
-- table was created that way and changing the type would require FK rewrites.

ALTER TABLE photos ALTER COLUMN id SET DEFAULT uuid_generate_v4()::text;

-- Verify
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'photos' AND column_name = 'id';

NOTIFY pgrst, 'reload schema';
