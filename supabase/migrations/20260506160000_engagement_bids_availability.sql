ALTER TABLE engagement_bids
  ADD COLUMN IF NOT EXISTS earliest_start_date DATE,
  ADD COLUMN IF NOT EXISTS availability_notes TEXT;

COMMENT ON COLUMN engagement_bids.earliest_start_date IS
  'Earliest date sub can begin work. Required on new bid submissions; legacy bids may be NULL.';
COMMENT ON COLUMN engagement_bids.availability_notes IS
  'Optional notes from the sub: scheduling constraints, conditional availability, etc.';

NOTIFY pgrst, 'reload schema';
