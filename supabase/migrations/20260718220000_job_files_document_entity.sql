-- AGENT_DOCS Slice 1 — agent-generated documents (invoice/waiver/form/letter) save to job_files and
-- key to related_entity_type='document' so the recap-style delete-then-insert regenerate dedupe has a
-- stable reference. Additive CHECK widen (mirrors 20260718180000_job_files_engagement_entity.sql).
ALTER TABLE job_files DROP CONSTRAINT IF EXISTS job_files_related_entity_type_check;
ALTER TABLE job_files ADD CONSTRAINT job_files_related_entity_type_check
  CHECK ((related_entity_type IS NULL) OR (related_entity_type = ANY (ARRAY[
    'schedule_item'::text, 'change_order'::text, 'daily_log'::text, 'floor_plan'::text,
    'job_transaction'::text, 'consultation_session'::text, 'draw_package'::text,
    'job_walkthrough_item'::text, 'job_sub_engagement'::text, 'document'::text
  ])));
