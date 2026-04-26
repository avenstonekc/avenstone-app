ALTER TABLE job_phases ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE job_phases ADD COLUMN IF NOT EXISTS started_by_id UUID REFERENCES profiles(id);
ALTER TABLE job_phases ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE job_phases ADD COLUMN IF NOT EXISTS completed_by_id UUID REFERENCES profiles(id);
-- Apply via Supabase Studio SQL editor or curl Management API; see CLAUDE.md.
