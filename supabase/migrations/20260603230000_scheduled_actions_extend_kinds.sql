-- ANTI_SURPRISE_ENGINE_ARC Phase 1 — extend scheduled_actions kind + source enums
-- Blueprint stated the table is sweeper-ready for all kinds; the existing CHECK
-- constraints were built for the original three kinds only. Adding walkthrough_prep
-- (and anti_surprise_engine source) to open the table for Phase 1 output.

ALTER TABLE scheduled_actions DROP CONSTRAINT scheduled_actions_kind_check;
ALTER TABLE scheduled_actions ADD CONSTRAINT scheduled_actions_kind_check
  CHECK (kind = ANY (ARRAY[
    'reminder'::text,
    'followup'::text,
    'watchdog'::text,
    'walkthrough_prep'::text
  ]));

ALTER TABLE scheduled_actions DROP CONSTRAINT scheduled_actions_source_check;
ALTER TABLE scheduled_actions ADD CONSTRAINT scheduled_actions_source_check
  CHECK (source = ANY (ARRAY[
    'agent'::text,
    'watchdog_cron'::text,
    'system'::text,
    'anti_surprise_engine'::text
  ]));
