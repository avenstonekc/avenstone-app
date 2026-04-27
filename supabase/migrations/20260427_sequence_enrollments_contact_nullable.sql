-- sequence_enrollments.contact_id must be nullable to support sub-only enrollments.
-- The recipient CHECK constraint already enforces exactly one of (contact_id, sub_id) is set.
ALTER TABLE sequence_enrollments ALTER COLUMN contact_id DROP NOT NULL;
