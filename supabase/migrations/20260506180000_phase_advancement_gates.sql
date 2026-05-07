-- Phase advancement gates: PM-driven lifecycle override audit.
-- These columns record when a PM manually advanced jobs.status past a failing gate.
--
-- ARCHITECTURE NOTE (Phase 4a, EXECUTION_ARC):
-- jobs.status IS the lifecycle phase tracker (lead → bid_sent → active → ... → complete).
-- job_phases rows are TRADE phases (Demo, Framing, etc.) driven by derivePhaseStatus
-- via schedule_items — a completely separate system. Override audit belongs on jobs.
--
-- sbAdvancePhase (supabase.js) stamps these columns when gates fail and PM overrides.
-- sbCheckPhaseGates reads jobs.status and evaluates per-transition gate checks
-- from src/lib/phaseGates.js.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS phase_override_used    BOOLEAN    NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phase_override_reason  TEXT,
  ADD COLUMN IF NOT EXISTS phase_override_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS phase_override_by_id   UUID REFERENCES profiles(id);

COMMENT ON COLUMN jobs.phase_override_used IS
  'True when the most recent jobs.status advancement bypassed one or more phase gates (Phase 4a, EXECUTION_ARC).';
COMMENT ON COLUMN jobs.phase_override_reason IS
  'PM-provided reason for the most recent gate override. NULL when override_used is false.';
COMMENT ON COLUMN jobs.phase_override_at IS
  'Timestamp of the most recent gate override.';
COMMENT ON COLUMN jobs.phase_override_by_id IS
  'Profile ID of the PM who invoked the most recent override.';

NOTIFY pgrst, 'reload schema';
