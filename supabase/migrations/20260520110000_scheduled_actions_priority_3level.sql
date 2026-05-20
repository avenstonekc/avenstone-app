-- AGENT_OPS Phase 1.2: reconcile scheduled_actions.priority to 3-level enum.
-- Phase 1.1 spec used ('low','normal','high','urgent'). Canonical enum from todos
-- is ('low','medium','high'). AGENT_OPS conforms to todos (Option A, 2026-05-20).
-- Table has 0 rows at migration time — no backfill needed.

ALTER TABLE scheduled_actions
  DROP CONSTRAINT scheduled_actions_priority_check;

ALTER TABLE scheduled_actions
  ADD CONSTRAINT scheduled_actions_priority_check
    CHECK (priority IN ('low', 'medium', 'high'));

ALTER TABLE scheduled_actions
  ALTER COLUMN priority SET DEFAULT 'medium';

NOTIFY pgrst, 'reload schema';
