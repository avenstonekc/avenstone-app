-- SCE Phase 1B · schema — two channels the seed content needs.
--
-- audience: the draft's [R] / [RC] role tags. 'rep' = rep-only capture; 'rep_client' = the
--   field is also shown in client self-serve intake (plain language). Vocabulary by
--   convention (no CHECK) — Phase 4 client-instance consumes it. Defaults 'rep' so any
--   pre-existing row is rep-only until re-seeded.
-- risk_note: the draft's WHY: lines (+ any KC: notes) — the interview-hint / risk-flag
--   channel. Free text, nullable; inert until the interview + Scope Risk arc consume it.
ALTER TABLE scope_checklists ADD COLUMN IF NOT EXISTS audience  text NULL DEFAULT 'rep';
ALTER TABLE scope_checklists ADD COLUMN IF NOT EXISTS risk_note text NULL;

NOTIFY pgrst, 'reload schema';
