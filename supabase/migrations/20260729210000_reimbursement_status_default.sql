-- Close the reimbursement_status NULL hole at the source.
--
-- Root cause of the whole class: the column had NO default, so any insert path that didn't
-- explicitly set it (all of them — every writer relies on the set_cost_plus_defaults_on_jt
-- trigger, which only covers cost_plus + direction='out') landed NULL. NULL then silently
-- dropped out of every reimbursable read that filtered = 'unreimbursed'. Backfilling existing
-- rows (migration 20260729200000) fixed the past; this default fixes the future so no reader
-- has to remember to COALESCE.
--
-- Safe for inbound rows: reimbursement_status is only ever read behind direction='out'
-- (or keyed on 'in_draw'/'reimbursed', which a defaulted inbound row won't match), so an
-- inbound client payment carrying 'unreimbursed' is inert. The BEFORE INSERT trigger still
-- runs and is now a no-op for the status field (NEW already carries the default) while it
-- continues to route markup_pct.
ALTER TABLE job_transactions
  ALTER COLUMN reimbursement_status SET DEFAULT 'unreimbursed';
