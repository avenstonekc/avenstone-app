-- Add onboarding_completed to profiles.
-- Tracks whether a sub has finished the onboarding wizard so the gate
-- no longer depends on sub_pricing rows (which broke mid-flow refreshes).

ALTER TABLE profiles
  ADD COLUMN onboarding_completed BOOLEAN NOT NULL DEFAULT false;

-- Backfill: mark any sub with pricing rows as already onboarded.
-- Non-sub roles are always true so they never see the wizard.
UPDATE profiles p
SET onboarding_completed = true
WHERE p.role != 'sub'
   OR EXISTS (
     SELECT 1 FROM sub_pricing sp WHERE sp.sub_id = p.id
   );
