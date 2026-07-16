-- SCOPE_PREFILL P3 — persist the scope substring that justified a prefilled answer, so the
-- configurator can show "from your scope: '<phrase>'" on a pre-selected (med) question and as
-- provenance on a skipped (high) pill. Nullable; only source='scope_prefill' rows populate it.
ALTER TABLE job_scope_answers ADD COLUMN evidence_phrase TEXT;
