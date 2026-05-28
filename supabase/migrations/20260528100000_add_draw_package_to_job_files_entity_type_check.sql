-- Add 'draw_package' to job_files related_entity_type CHECK constraint
-- Existing values preserved: schedule_item, change_order, daily_log, floor_plan, job_transaction, consultation_session

ALTER TABLE job_files DROP CONSTRAINT job_files_related_entity_type_check;
ALTER TABLE job_files ADD CONSTRAINT job_files_related_entity_type_check
  CHECK ((related_entity_type IS NULL) OR (related_entity_type = ANY (ARRAY[
    'schedule_item'::text,
    'change_order'::text,
    'daily_log'::text,
    'floor_plan'::text,
    'job_transaction'::text,
    'consultation_session'::text,
    'draw_package'::text
  ])));
