-- AGENT_OPS Phase 2.2: add WHEN (NEW.email_sent IS NOT TRUE) to the
-- on_notification_insert trigger so only high-priority notifications fire email.
--
-- Priority gate contract (enforced in executor at INSERT time, not here):
--   email_sent = priority != 'high'
-- Result:
--   high priority  → email_sent=FALSE → trigger fires  (IS NOT TRUE = true)
--   medium/low     → email_sent=TRUE  → trigger silent (IS NOT TRUE = false)
--
-- The trigger function trigger_notify_email() is unchanged.
-- This migration only adds the WHEN clause to the trigger definition.
-- Fixes Phase 2.1 gap: todo_delegated was always emitting email regardless
-- of priority. Fix is in the add_todo executor (email_sent: priority != 'high').

DROP TRIGGER IF EXISTS on_notification_insert ON notifications;

CREATE TRIGGER on_notification_insert
  AFTER INSERT ON notifications
  FOR EACH ROW
  WHEN (NEW.email_sent IS NOT TRUE)
  EXECUTE FUNCTION trigger_notify_email();

-- Verify the trigger was created with a WHEN clause.
SELECT pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgname = 'on_notification_insert'
  AND tgrelid = 'notifications'::regclass;

NOTIFY pgrst, 'reload schema';
