-- SCHEDULING_ARC slice 2: add schedule_items to realtime publication
-- Enables client portal to receive live updates when PMs move milestone schedule_items.

BEGIN;
ALTER PUBLICATION supabase_realtime ADD TABLE public.schedule_items;
COMMIT;

NOTIFY pgrst, 'reload schema';
