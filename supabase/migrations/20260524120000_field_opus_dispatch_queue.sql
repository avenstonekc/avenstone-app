-- FIELD_OPUS_ARC Phase 4: dispatch queue.
-- Tracks every Sonnet prompt fired to the VM from Field-Opus.
-- Enforces serial dispatch with queue depth 5 at the edge fn layer.

BEGIN;

CREATE TABLE IF NOT EXISTS public.field_opus_dispatch_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id       UUID NOT NULL,
  message_id      UUID NOT NULL REFERENCES public.field_opus_messages(id) ON DELETE CASCADE,
  prompt          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'queued',
  dispatched_at   TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  commit_hash     TEXT,
  result_text     TEXT,
  error_text      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.field_opus_dispatch_queue
  DROP CONSTRAINT IF EXISTS field_opus_dispatch_queue_status_check;
ALTER TABLE public.field_opus_dispatch_queue
  ADD CONSTRAINT field_opus_dispatch_queue_status_check
  CHECK (status IN ('queued','dispatched','completed','failed','cancelled'));

-- Partial index: fast lookup of in-flight rows for queue-depth checks.
CREATE INDEX IF NOT EXISTS idx_field_opus_queue_in_flight
  ON public.field_opus_dispatch_queue (created_at)
  WHERE status IN ('queued','dispatched');

-- Index for thread lookups (Phase 5 UI may surface dispatch history).
CREATE INDEX IF NOT EXISTS idx_field_opus_queue_thread
  ON public.field_opus_dispatch_queue (thread_id, created_at);

-- RLS — same Kalin-only gate as field_opus_messages
ALTER TABLE public.field_opus_dispatch_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fodq_kalin_only_select ON public.field_opus_dispatch_queue;
DROP POLICY IF EXISTS fodq_kalin_only_insert ON public.field_opus_dispatch_queue;
DROP POLICY IF EXISTS fodq_kalin_only_update ON public.field_opus_dispatch_queue;
DROP POLICY IF EXISTS fodq_kalin_only_delete ON public.field_opus_dispatch_queue;

CREATE POLICY fodq_kalin_only_select ON public.field_opus_dispatch_queue
  FOR SELECT TO authenticated
  USING (auth.uid() = '8171742a-b586-4f13-be61-744e191a1896'::uuid);

CREATE POLICY fodq_kalin_only_insert ON public.field_opus_dispatch_queue
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = '8171742a-b586-4f13-be61-744e191a1896'::uuid);

CREATE POLICY fodq_kalin_only_update ON public.field_opus_dispatch_queue
  FOR UPDATE TO authenticated
  USING (auth.uid() = '8171742a-b586-4f13-be61-744e191a1896'::uuid)
  WITH CHECK (auth.uid() = '8171742a-b586-4f13-be61-744e191a1896'::uuid);

CREATE POLICY fodq_kalin_only_delete ON public.field_opus_dispatch_queue
  FOR DELETE TO authenticated
  USING (auth.uid() = '8171742a-b586-4f13-be61-744e191a1896'::uuid);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.fn_field_opus_queue_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fodq_updated_at ON public.field_opus_dispatch_queue;
CREATE TRIGGER trg_fodq_updated_at
  BEFORE UPDATE ON public.field_opus_dispatch_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_field_opus_queue_touch_updated_at();

COMMIT;

NOTIFY pgrst, 'reload schema';
