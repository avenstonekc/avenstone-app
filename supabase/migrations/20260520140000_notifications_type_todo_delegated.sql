-- AGENT_OPS Phase 2.1: add 'todo_delegated' to notifications_type_check.
-- Fired when add_todo assignee_id != caller_id (cross-user delegation).
-- Pattern follows 2026-05-18 daily_log_sent constraint addition.

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
    'todo_delegated'
  ]));

NOTIFY pgrst, 'reload schema';
