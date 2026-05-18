-- notifications_type_check blocked INSERT for type='daily_log_sent'.
-- daily_log_submitted was in the allowed set but daily_log_sent was not.
-- Drop and recreate the constraint with daily_log_sent added.

ALTER TABLE notifications
  DROP CONSTRAINT notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (
    type = ANY (ARRAY[
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
      'bid_accepted'
    ])
  );

-- Verify
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid = 'notifications'::regclass AND conname = 'notifications_type_check';

NOTIFY pgrst, 'reload schema';
