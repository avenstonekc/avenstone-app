-- SCOPE_PREFILL P3 — allow source='scope_prefill' on job_scope_answers. The source column has a
-- CHECK whitelist; without this, persisting a parsed answer fails the constraint (caught in P3
-- verify). scopeEngine.ts AnswerRecord already lists 'scope_prefill'; this makes the DB agree.
ALTER TABLE job_scope_answers DROP CONSTRAINT job_scope_answers_source_check;
ALTER TABLE job_scope_answers ADD CONSTRAINT job_scope_answers_source_check
  CHECK (source = ANY (ARRAY['rep_typed'::text, 'rep_card'::text, 'measured'::text, 'extracted'::text, 'client_selected'::text, 'scope_prefill'::text]));
