-- Adds commit SHA and freeform notes written back by auto-fix-callback.js
-- when the VM executor finishes a fix attempt.

ALTER TABLE bug_reports
  ADD COLUMN IF NOT EXISTS auto_fix_commit TEXT,
  ADD COLUMN IF NOT EXISTS auto_fix_notes  TEXT;

NOTIFY pgrst, 'reload schema';
