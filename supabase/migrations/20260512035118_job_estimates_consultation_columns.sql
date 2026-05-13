-- Add consultation-flow columns to job_estimates (Shape C).
-- Estimator tab uses: messages (existing)
-- Consultation tab uses: the 5 new columns below
-- Both upsert on job_id — field sets are non-overlapping.
-- oh_shit_moments snapshot NOT added — live oh_shit_moments table with
-- included_in_proposal is the single source of truth.

ALTER TABLE job_estimates
  ADD COLUMN IF NOT EXISTS session_id    UUID REFERENCES consultation_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS estimate_data JSONB,
  ADD COLUMN IF NOT EXISTS total         NUMERIC,
  ADD COLUMN IF NOT EXISTS source        TEXT;

CREATE INDEX IF NOT EXISTS idx_job_estimates_session_id
  ON job_estimates(session_id) WHERE session_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
