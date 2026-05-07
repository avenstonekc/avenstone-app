-- Lock jobs.status to the canonical 6-phase lifecycle (Phase 4a-ii, EXECUTION_ARC).
-- Existing values (lead, bid_sent, active) all satisfy this constraint.
-- Adds contract and final_touches as valid values.
-- on_hold is a valid lateral state (job paused, not a phase advancement).

ALTER TABLE jobs
  ADD CONSTRAINT jobs_status_lifecycle_check
  CHECK (status IN (
    'lead',
    'bid_sent',
    'contract',
    'active',
    'final_touches',
    'complete',
    'on_hold'
  ));

NOTIFY pgrst, 'reload schema';
