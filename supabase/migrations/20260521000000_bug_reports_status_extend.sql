-- Extend bug_reports.status CHECK to support AUTO_FIX_ARC lifecycle states.
-- New values: 'reported' (user triggered dispatch), 'attempting' (VM working on it),
-- 'auto_fixed' (VM committed fix + Vercel green), 'needs_human' (escalated to Kalin).
-- Existing values retained: 'open', 'in_progress', 'fixed', 'wontfix'.

ALTER TABLE bug_reports DROP CONSTRAINT IF EXISTS bug_reports_status_check;
ALTER TABLE bug_reports ADD CONSTRAINT bug_reports_status_check
  CHECK (status IN (
    'open', 'in_progress', 'fixed', 'wontfix',
    'reported', 'attempting', 'auto_fixed', 'needs_human'
  ));

NOTIFY pgrst, 'reload schema';
