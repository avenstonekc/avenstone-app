-- FIELD_OPUS_ARC Phase 1: schema + RLS foundation.
-- Single-thread-per-user conversation surface for Kalin's in-app dev console.
-- Hard auth-ID gate at RLS level. Service role unaffected (used by edge fn in Phase 3).

BEGIN;

-- ============================================================
-- Table: field_opus_messages
-- ============================================================
CREATE TABLE IF NOT EXISTS public.field_opus_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID NOT NULL,
  role        TEXT NOT NULL,
  content     TEXT NOT NULL,
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Role check
ALTER TABLE public.field_opus_messages
  DROP CONSTRAINT IF EXISTS field_opus_messages_role_check;
ALTER TABLE public.field_opus_messages
  ADD CONSTRAINT field_opus_messages_role_check
  CHECK (role IN ('user','assistant','system','dispatch_result'));

-- Index: thread retrieval is always by thread_id ordered by created_at.
CREATE INDEX IF NOT EXISTS idx_field_opus_messages_thread
  ON public.field_opus_messages (thread_id, created_at);

-- ============================================================
-- RLS: hard auth-ID gate to Kalin only
-- ============================================================
ALTER TABLE public.field_opus_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS field_opus_messages_kalin_only_select ON public.field_opus_messages;
DROP POLICY IF EXISTS field_opus_messages_kalin_only_insert ON public.field_opus_messages;
DROP POLICY IF EXISTS field_opus_messages_kalin_only_update ON public.field_opus_messages;
DROP POLICY IF EXISTS field_opus_messages_kalin_only_delete ON public.field_opus_messages;

CREATE POLICY field_opus_messages_kalin_only_select ON public.field_opus_messages
  FOR SELECT TO authenticated
  USING (auth.uid() = '8171742a-b586-4f13-be61-744e191a1896'::uuid);

CREATE POLICY field_opus_messages_kalin_only_insert ON public.field_opus_messages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = '8171742a-b586-4f13-be61-744e191a1896'::uuid);

CREATE POLICY field_opus_messages_kalin_only_update ON public.field_opus_messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = '8171742a-b586-4f13-be61-744e191a1896'::uuid)
  WITH CHECK (auth.uid() = '8171742a-b586-4f13-be61-744e191a1896'::uuid);

CREATE POLICY field_opus_messages_kalin_only_delete ON public.field_opus_messages
  FOR DELETE TO authenticated
  USING (auth.uid() = '8171742a-b586-4f13-be61-744e191a1896'::uuid);

COMMIT;

NOTIFY pgrst, 'reload schema';
