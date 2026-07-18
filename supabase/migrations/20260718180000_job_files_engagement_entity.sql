-- WALKTHROUGH_TYPES Slice 4 — allow job_files to link to a sub engagement.
-- The sub-walk recap gets attached to a job_sub_engagement (bid package) as a bid-quotes
-- doc; it is keyed related_entity_type='job_sub_engagement' so it stays distinct from the
-- consultation_session-keyed client/sub recap rows (which would otherwise clobber it on the
-- delete-then-insert re-send path). Widening a CHECK is additive — no existing row is rejected.
alter table public.job_files
  drop constraint if exists job_files_related_entity_type_check;

alter table public.job_files
  add constraint job_files_related_entity_type_check
  check (
    related_entity_type is null
    or related_entity_type = any (array[
      'schedule_item', 'change_order', 'daily_log', 'floor_plan', 'job_transaction',
      'consultation_session', 'draw_package', 'job_walkthrough_item', 'job_sub_engagement'
    ])
  );
