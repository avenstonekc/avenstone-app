-- Add sub_id to sequence_enrollments for sub-ops sequences.
-- Subs are profiles with role='sub'; no separate subs table exists.
-- Exactly one of contact_id / sub_id must be set per row.

ALTER TABLE sequence_enrollments
  ADD COLUMN IF NOT EXISTS sub_id uuid REFERENCES profiles(id) ON DELETE CASCADE;

-- Enforce exactly one recipient per enrollment
ALTER TABLE sequence_enrollments
  ADD CONSTRAINT sequence_enrollments_recipient_check
  CHECK (
    (contact_id IS NOT NULL AND sub_id IS NULL) OR
    (contact_id IS NULL  AND sub_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_sequence_enrollments_sub_id
  ON sequence_enrollments(sub_id);

-- Allow subs to read their own enrollments (additive with existing tenant policy)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sequence_enrollments'
      AND policyname = 'sequence_enrollments_sub_self'
  ) THEN
    CREATE POLICY "sequence_enrollments_sub_self"
      ON sequence_enrollments FOR SELECT
      USING (sub_id = auth.uid());
  END IF;
END $$;
