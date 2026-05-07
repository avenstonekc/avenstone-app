-- Canonical 6-phase lifecycle for jobs.status (EXECUTION_ARC Phase 4a-ii).
-- White-label driven: these names work for any contractor type, not just GC.
-- 'bid_sent' leaked GC framing (bids = what subs send the GC, not a job state).
-- 'active' was too vague for a multi-tenant platform.
-- Supersedes 20260506190000_jobs_status_lifecycle_lock.sql (bid_sent/active were wrong).

-- Step 1: drop previous constraint if it was applied
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_lifecycle_check;

-- Step 2: backfill legacy values to canonical names
UPDATE jobs SET status = 'proposal'    WHERE status = 'bid_sent';
UPDATE jobs SET status = 'in_progress' WHERE status = 'active';

-- Step 3: enforce the canonical set
ALTER TABLE jobs
  ADD CONSTRAINT jobs_status_canonical_check
  CHECK (status IN (
    'lead',
    'proposal',
    'contract',
    'in_progress',
    'final_touches',
    'complete',
    'on_hold'
  ));

-- Step 4: default to lead on new job creation
ALTER TABLE jobs ALTER COLUMN status SET DEFAULT 'lead';

COMMENT ON COLUMN jobs.status IS
  'Canonical 6-phase lifecycle: lead → proposal → contract → in_progress → final_touches → complete. White-label-driven — terms work for non-GC tenants. Set by sbAdvancePhase (EXECUTION_ARC Phase 4a). Trade phases live separately in job_phases (orthogonal system, do not confuse).';

NOTIFY pgrst, 'reload schema';
