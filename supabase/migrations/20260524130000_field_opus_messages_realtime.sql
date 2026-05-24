-- FIELD_OPUS_ARC hotfix: enable realtime for field_opus_messages + field_opus_dispatch_queue.
-- Without this, the panel's INSERT subscription never fires for new assistant/dispatch rows.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'field_opus_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.field_opus_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'field_opus_dispatch_queue'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.field_opus_dispatch_queue;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
