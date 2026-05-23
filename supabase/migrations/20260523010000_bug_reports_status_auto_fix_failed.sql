-- Adds 'auto_fix_failed' status: VM executor attempted but the fix did not apply cleanly.
-- Distinct from 'needs_human' (classifier-declined) and 'auto_fixed' (VM succeeded).

ALTER TABLE bug_reports DROP CONSTRAINT IF EXISTS bug_reports_status_check;
ALTER TABLE bug_reports ADD CONSTRAINT bug_reports_status_check
  CHECK (status IN (
    'open', 'in_progress', 'fixed', 'wontfix',
    'reported', 'attempting', 'auto_fixed', 'auto_fix_failed', 'needs_human'
  ));

NOTIFY pgrst, 'reload schema';
