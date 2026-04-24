-- Add free-text phase column to job_transactions for budget vs actual matching.
-- phase_id (UUID FK) is kept for precise linking; phase (TEXT) is for loose
-- matching against estimate_line_items.phase without requiring a JOIN.

ALTER TABLE job_transactions
  ADD COLUMN IF NOT EXISTS phase TEXT;

CREATE INDEX IF NOT EXISTS idx_job_transactions_phase
  ON job_transactions(phase);

-- Backfill: populate phase from job_phases.name where phase_id is set
UPDATE job_transactions jt
SET phase = jp.name
FROM job_phases jp
WHERE jt.phase_id = jp.id
  AND jt.phase IS NULL;
