-- ANTI_SURPRISE_ENGINE_ARC Phase 0 — drop dead push trigger
--
-- on_notification_insert_push fires trigger_notify_push() which sends
-- { record: row_to_json(NEW) } to send-push. send-push expects a top-level
-- { user_id, title, body } payload and returns 400 'user_id required' on
-- every call from this trigger — it has never delivered a push notification.
--
-- The working push path is trg_notification_push_fanout → notification-push-fanout
-- which correctly destructures the record before calling send-push. That trigger
-- stays and is the canonical push delivery path.
--
-- No push_sent guard column needed: no double-send is occurring, and AFTER
-- row-level triggers fire exactly once per row by Postgres semantics.

DROP TRIGGER IF EXISTS on_notification_insert_push ON public.notifications;
