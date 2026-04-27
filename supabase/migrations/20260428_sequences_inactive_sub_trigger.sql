-- Add sub_inactive_60d to the allowed trigger types for sequences.
-- Fires when a sub has no bid_responses.submitted_at in the last 60 days
-- (or has never submitted a bid and their profile is >60 days old).
ALTER TABLE sequences DROP CONSTRAINT IF EXISTS sequences_trigger_check;
ALTER TABLE sequences ADD CONSTRAINT sequences_trigger_check
  CHECK (trigger IN ('manual', 'new_contact', 'missed_call', 'manual_sub', 'bid_sent', 'sub_invited', 'payment_made', 'sub_inactive_60d'));
