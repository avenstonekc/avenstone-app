-- AUTO_FIX_ARC Phase D additions:
-- 1. 'auto_fix_unknown' status: Vercel build poll timed out (5 min), human must check manually.
--    Distinct from 'auto_fix_failed' (revert already executed) and 'auto_fixed' (build confirmed).
-- 2. vercel_deployment_id TEXT: Vercel deployment UID associated with the fix commit.

ALTER TABLE bug_reports DROP CONSTRAINT IF EXISTS bug_reports_status_check;
ALTER TABLE bug_reports ADD CONSTRAINT bug_reports_status_check
  CHECK (status IN (
    'open', 'in_progress', 'fixed', 'wontfix',
    'reported', 'attempting', 'auto_fixed', 'auto_fix_failed', 'auto_fix_unknown', 'needs_human'
  ));

ALTER TABLE bug_reports
  ADD COLUMN IF NOT EXISTS vercel_deployment_id TEXT;

NOTIFY pgrst, 'reload schema';
