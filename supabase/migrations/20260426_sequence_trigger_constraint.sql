-- sequences.trigger is currently free-text with no constraint.
-- Formalize the allowed values now that sub-ops trigger type is added.
-- Existing values in production: manual, new_contact, missed_call
-- New value: manual_sub (PM manually enrolls a sub-contractor)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sequences_trigger_check'
      AND conrelid = 'sequences'::regclass
  ) THEN
    ALTER TABLE sequences ADD CONSTRAINT sequences_trigger_check
      CHECK (trigger IN ('manual', 'new_contact', 'missed_call', 'manual_sub'));
  END IF;
END $$;
