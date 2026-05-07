-- EXECUTION_ARC Phase 7 — add notify_sub flag to schedule_items.
-- Mirrors existing notify_client flag. Default true preserves prior behavior
-- (sub was included unconditionally in _collectRecipients before this column existed).
-- PM can uncheck in the schedule_item modal to suppress sub notifications.

ALTER TABLE schedule_items
  ADD COLUMN IF NOT EXISTS notify_sub BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN schedule_items.notify_sub IS
  'When true, assigned sub is notified on state changes. Mirrors notify_client. Default true — preserves prior unconditional sub-inclusion behavior. PM-editable in schedule_item modal.';

NOTIFY pgrst, 'reload schema';
