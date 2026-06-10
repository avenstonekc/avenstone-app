-- AI_PM_FOLDIN Slice 2 — add 'vigilance' to todos.source allowed values
-- vigilance-runner writes source='vigilance'; existing constraint only allows 'manual'|'engine'.
-- Drop and recreate to add the new value.

ALTER TABLE todos DROP CONSTRAINT todos_source_check;
ALTER TABLE todos ADD CONSTRAINT todos_source_check
  CHECK (source = ANY (ARRAY['manual'::text, 'engine'::text, 'vigilance'::text]));
