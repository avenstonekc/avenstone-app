-- AGENT_OPS Phase 1.2: add daily-log followup capture columns.
-- Three nullable columns. NULL = "not asked yet" (backward compatible — existing rows unaffected).
-- Patched by the daily-log conversation hook in Phase 6.

ALTER TABLE daily_logs
  ADD COLUMN IF NOT EXISTS phase_on_schedule BOOLEAN,
  ADD COLUMN IF NOT EXISTS delay_days        INTEGER,
  ADD COLUMN IF NOT EXISTS issues_flagged    TEXT;

NOTIFY pgrst, 'reload schema';
