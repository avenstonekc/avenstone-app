-- Add status_token to jobs for public magic link access
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS status_token UUID NOT NULL DEFAULT gen_random_uuid();

-- Backfill existing rows that got NULL somehow (shouldn't happen with DEFAULT but safety net)
UPDATE jobs SET status_token = gen_random_uuid() WHERE status_token IS NULL;

-- Fast lookup by token
CREATE INDEX IF NOT EXISTS idx_jobs_status_token ON jobs(status_token);
