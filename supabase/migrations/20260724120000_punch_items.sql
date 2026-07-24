-- PUNCH_LIST reframe (Kalin-locked 2026-07-19) — foundation.
-- The "sub walk" is being repurposed into a PUNCH LIST WALKTHROUGH: instead of capturing SCOPE
-- (that felt like a second consultation), the rep walks the job noting things that need FIXING.
-- Each captured item = description + trade tag + room + optional photo. This table is that store.
--
-- session_type stays 'sub_walk' (aliased at the surface to "Punch List Walkthrough") — no
-- consultation_sessions constraint change. Punch items hang off the same session row.

CREATE TABLE IF NOT EXISTS public.punch_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  job_id      text NOT NULL,
  session_id  uuid REFERENCES public.consultation_sessions(id) ON DELETE SET NULL,
  description text NOT NULL,
  trade       text,                        -- trade_taxonomy full-path (e.g. "Plumbing - Rough-in"); nullable until tagged
  room_label  text,                        -- free-form room the item is in ("Primary Bath")
  photo_id    uuid,                         -- optional consultation photo id (no hard FK — photo may be added/removed independently)
  status      text NOT NULL DEFAULT 'open' CHECK (status = ANY (ARRAY['open'::text, 'resolved'::text])),
  sort        integer NOT NULL DEFAULT 0,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS punch_items_job_idx     ON public.punch_items (job_id);
CREATE INDEX IF NOT EXISTS punch_items_session_idx ON public.punch_items (session_id);
CREATE INDEX IF NOT EXISTS punch_items_tenant_idx  ON public.punch_items (tenant_id);

ALTER TABLE public.punch_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_iso_pi ON public.punch_items;
CREATE POLICY tenant_iso_pi ON public.punch_items
  FOR ALL USING (tenant_id = get_my_tenant_id());
