-- SCOPE_VISION Phase 1 — allow source='photo' on job_scope_answers (answers the AI inferred by
-- LOOKING at the job's photos, distinct from 'scope_prefill' which reads the text scope). Vision
-- answers are always status='proposed' (interpretive; the rep confirms). scopeEngine.ts AnswerRecord
-- already lists 'photo'; this makes the DB agree.
ALTER TABLE job_scope_answers DROP CONSTRAINT job_scope_answers_source_check;
ALTER TABLE job_scope_answers ADD CONSTRAINT job_scope_answers_source_check
  CHECK (source = ANY (ARRAY['rep_typed'::text, 'rep_card'::text, 'measured'::text, 'extracted'::text, 'client_selected'::text, 'scope_prefill'::text, 'photo'::text]));
