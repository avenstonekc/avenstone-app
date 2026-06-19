-- ============================================================
-- DEVIATION_GATE_ARC Slice 6.0 — approval state on job_estimates
-- approval_status: tracks whether the estimate is pending manager review.
-- approval_meta: stores gatedLines + requested_by + at.
-- ============================================================

ALTER TABLE job_estimates
  ADD COLUMN IF NOT EXISTS approval_status TEXT
    DEFAULT 'none'
    CHECK (approval_status IN ('none', 'awaiting_approval', 'approved'));

ALTER TABLE job_estimates
  ADD COLUMN IF NOT EXISTS approval_meta JSONB DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
