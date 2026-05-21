-- AGENT_OPS Phase 2.2: add 'team_alert' to notifications_type_check.
-- Also reinstates 'master_agent' which was inadvertently dropped from the
-- constraint in the Phase 2.1 migration (20260520140000) — the notify_team
-- executor uses this type and would fail constraint on INSERT without it.

ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'note_posted',
    'phase_complete',
    'co_submitted',
    'co_approved',
    'co_rejected',
    'bid_received',
    'message',
    'assigned_to_job',
    'phase_overdue',
    'document_uploaded',
    'daily_log_submitted',
    'daily_log_sent',
    'payment_received',
    'payment_request',
    'contract_signed',
    'contract_sent',
    'completion_signed',
    'status_changed',
    'new_lead',
    'missed_call',
    'job_message',
    'schedule_item_created',
    'schedule_item_changed',
    'bid_accepted',
    'todo_delegated',
    'team_alert',
    'master_agent'
  ]));

NOTIFY pgrst, 'reload schema';
