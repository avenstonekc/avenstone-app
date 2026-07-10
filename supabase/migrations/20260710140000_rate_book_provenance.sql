-- ESTIMATOR Phase 5 · S3 — rate-book provenance column (both tables, one migration).
--
-- `source` records where a rate came from, for the owner-vet workflow. NO CHECK constraint —
-- the vocabulary is CONVENTION, not enforced, so S7/S8 can add values without another migration:
--   'seed'                — platform/system default (tenant_id NULL, or AI-drafted defaults)
--   'owner_vetted'        — an owner reviewed/approved this rate
--   'rep_entered'         — a rep/PM fed the book via the B2.3 learn loop (unvetted)
--   'rep_accepted_anchor' — rep accepted the KC regional-average anchor (written by S8, later)
--   'rep_override'        — rep typed their own rate over the anchor (written by S8, later)

ALTER TABLE rate_book_labor    ADD COLUMN IF NOT EXISTS source text NULL;
ALTER TABLE rate_book_material ADD COLUMN IF NOT EXISTS source text NULL;

-- Backfill — labor (has `vetted`): seed / owner_vetted / rep_entered per the locked heuristic.
UPDATE rate_book_labor SET source =
  CASE WHEN tenant_id IS NULL THEN 'seed'
       WHEN vetted        THEN 'owner_vetted'
       ELSE                    'rep_entered' END
WHERE source IS NULL;

-- Backfill — material. NOTE: rate_book_material has NO `vetted` column (it uses
-- `kalin_adjusted` as the owner-vetted signal) and has NEVER been rep-writable — RLS is
-- owner-only and S4 does NOT relax it. So the "remaining tenant rows" bucket cannot be
-- 'rep_entered' here (no rep has ever written a material rate); those rows are AI-drafted
-- system defaults → 'seed'. Deviation from the labor heuristic, by schema necessity.
UPDATE rate_book_material SET source =
  CASE WHEN tenant_id IS NULL THEN 'seed'
       WHEN kalin_adjusted    THEN 'owner_vetted'
       ELSE                        'seed' END
WHERE source IS NULL;

NOTIFY pgrst, 'reload schema';
