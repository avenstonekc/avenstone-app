-- TIME_CLOCK_ARC Slice 1 — crew role + time_entries + the one-open-entry invariant.
-- Kalin-locked 2026-07-26. Hourly crew clock in/out from their phone; every punch picks a job
-- and captures a GPS point. Multi-job days use switch-job punches. HOURS ONLY this slice —
-- labor dollars/pay rates are Slice 4; distance flagging is Slice 2 (coords stored, unjudged).

-- 1. Add 'crew' to the role CHECK (TEXT column + CHECK constraint; no enum type).
ALTER TABLE profiles DROP CONSTRAINT profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['owner'::text, 'sales_rep'::text, 'project_manager'::text, 'sub'::text, 'client'::text, 'crew'::text]));

-- 2. time_entries — one row per work segment. job_id is TEXT (jobs.id is TEXT).
CREATE TABLE time_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  user_id     UUID NOT NULL REFERENCES profiles(id),
  job_id      TEXT NOT NULL REFERENCES jobs(id),
  clock_in    TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out   TIMESTAMPTZ,
  in_lat      NUMERIC,
  in_lng      NUMERIC,
  out_lat     NUMERIC,
  out_lng     NUMERIC,
  source      TEXT NOT NULL DEFAULT 'punch' CHECK (source = ANY (ARRAY['punch'::text, 'switch'::text, 'manual'::text])),
  edited_by   UUID REFERENCES profiles(id),
  edited_at   TIMESTAMPTZ,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The load-bearing invariant: a person is clocked into AT MOST one job at a time.
CREATE UNIQUE INDEX time_entries_one_open_per_user ON time_entries (user_id) WHERE clock_out IS NULL;
CREATE INDEX idx_time_entries_user ON time_entries (user_id, clock_in DESC);
CREATE INDEX idx_time_entries_tenant_job ON time_entries (tenant_id, job_id);

-- 3. RLS — crew: own rows; UPDATE only while OPEN (no editing closed entries). owner/PM: full tenant.
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY time_entries_select ON time_entries FOR SELECT
  USING (
    user_id = auth.uid()
    OR (tenant_id = get_my_tenant_id() AND get_my_role() = ANY (ARRAY['owner'::text, 'project_manager'::text]))
  );

CREATE POLICY time_entries_insert ON time_entries FOR INSERT
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND (user_id = auth.uid() OR get_my_role() = ANY (ARRAY['owner'::text, 'project_manager'::text]))
  );

-- USING evaluates the OLD row: crew may touch a row only while it is still open (clock_out IS NULL).
-- Closing it (setting clock_out) passes USING (old row was open) but future edits fail (now closed).
-- WITH CHECK guards the NEW row's tenant so a row can't be moved out of the tenant.
CREATE POLICY time_entries_update ON time_entries FOR UPDATE
  USING (
    (user_id = auth.uid() AND clock_out IS NULL)
    OR (tenant_id = get_my_tenant_id() AND get_my_role() = ANY (ARRAY['owner'::text, 'project_manager'::text]))
  )
  WITH CHECK (tenant_id = get_my_tenant_id());

-- 4. Atomic switch-job — close the open entry and open the new one in ONE transaction, so a crash
-- between close and open can never leave a worker silently clocked out. SECURITY DEFINER, but every
-- identity comes from auth.uid()/get_my_tenant_id() — a caller can only switch THEIR OWN open entry.
CREATE OR REPLACE FUNCTION time_clock_switch(p_job_id TEXT, p_lat NUMERIC DEFAULT NULL, p_lng NUMERIC DEFAULT NULL)
RETURNS time_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_tenant UUID := get_my_tenant_id();
  v_new    time_entries;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  -- close the currently-open entry (0 rows is fine — behaves like a first punch)
  UPDATE time_entries
     SET clock_out = now(), out_lat = p_lat, out_lng = p_lng, updated_at = now()
   WHERE user_id = v_uid AND clock_out IS NULL;
  -- open the new segment as a switch
  INSERT INTO time_entries (tenant_id, user_id, job_id, clock_in, in_lat, in_lng, source)
  VALUES (v_tenant, v_uid, p_job_id, now(), p_lat, p_lng, 'switch')
  RETURNING * INTO v_new;
  RETURN v_new;
END;
$$;

GRANT EXECUTE ON FUNCTION time_clock_switch(TEXT, NUMERIC, NUMERIC) TO authenticated;
