-- Add referring realtor fields to jobs table
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS referring_realtor_name  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS referring_realtor_phone TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS referring_realtor_email TEXT NOT NULL DEFAULT '';
