-- Widen sequences_trigger_check to include auto-trigger types.
-- bid_sent fires when send-bid-invite succeeds.
-- sub_invited fires when send-invite succeeds.
-- payment_made fires when a sub_payout transaction is created with a known sub_id.
ALTER TABLE sequences DROP CONSTRAINT IF EXISTS sequences_trigger_check;
ALTER TABLE sequences ADD CONSTRAINT sequences_trigger_check
  CHECK (trigger IN ('manual', 'new_contact', 'missed_call', 'manual_sub', 'bid_sent', 'sub_invited', 'payment_made'));
