-- PUSH_NOTIFICATIONS_ARC Phase 5: notifications INSERT → push fan-out edge fn.
-- Mirrors the existing trigger_notify_email pattern exactly:
--   pg_net.http_post(), hardcoded URL + anon JWT, json_build_object('record', row_to_json(NEW)).
-- Independent from email trigger — both fire on every INSERT, both standalone.
-- Fan-out edge fn filters by type (7 existing types); non-push types are silent no-ops.

BEGIN;

CREATE OR REPLACE FUNCTION fn_notification_push_fanout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://cbfftukmhqvvjlrlnltk.supabase.co/functions/v1/notification-push-fanout',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQ2ODgsImV4cCI6MjA5MTE5MDY4OH0.isj52drLT3pj7BF94Wa9w_y_f8U1M3W5AcgWsRaTwBQ"}'::jsonb,
    body    := json_build_object('record', row_to_json(NEW))::jsonb
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_push_fanout ON notifications;

CREATE TRIGGER trg_notification_push_fanout
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION fn_notification_push_fanout();

COMMIT;

NOTIFY pgrst, 'reload schema';
