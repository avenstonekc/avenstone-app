-- Add phase audit columns (started_at/by, completed_at/by)
-- These were referenced in ScheduleTab.jsx and SubJobView.jsx but never actually applied to the DB.
ALTER TABLE job_phases
  ADD COLUMN IF NOT EXISTS started_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_by_id    UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS completed_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_by_id  UUID REFERENCES profiles(id);

NOTIFY pgrst, 'reload schema';
