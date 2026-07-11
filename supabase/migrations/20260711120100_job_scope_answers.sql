-- SCOPE_TO_ESTIMATE Phase A — job_scope_answers
-- The single answer store: interview persistence (SCE P2), photo intake (SCE P3),
-- SELECTIONS (Phase C), and SUB_WORK_PACKET (Phase D) all read it. Records WHAT was chosen
-- per (job, room, field): option_key for choice fields, value for free text/number. status
-- is orthogonal to source (rate-book lesson) — a client_selected answer is 'proposed' until
-- staff confirm flips it. Vet-gate lands at the DB in Phase C (client INSERT forced to
-- source='client_selected' + status='proposed', no client UPDATE on confirmed). Phase A is
-- staff-only. Blueprint locked 2026-07-11. Platform table: tenant_id + RLS; trade is a
-- per-answer column, values come from data (Phase D derives it) — no trade hardcoding.

CREATE TABLE IF NOT EXISTS job_scope_answers (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL,
  job_id       TEXT        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  room_id      UUID        REFERENCES job_rooms(id) ON DELETE CASCADE,
  field_key    TEXT        NOT NULL,
  option_key   TEXT,
  value        TEXT,
  trade        TEXT,
  source       TEXT        NOT NULL CHECK (source IN ('rep_typed','rep_card','measured','extracted','client_selected')),
  status       TEXT        NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','confirmed')),
  confirmed_by UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, job_id, room_id, field_key)
);

CREATE INDEX IF NOT EXISTS idx_job_scope_answers_tenant_job ON job_scope_answers (tenant_id, job_id);

ALTER TABLE job_scope_answers ENABLE ROW LEVEL SECURITY;

-- Staff read/write (job_notes pattern). Client write policy (forced source/status) lands in
-- Phase C. NOTE for Phase C: can_access_job also admits the linked client — scope this policy
-- to staff roles when the client policy is added, so the permissive RLS union does not let a
-- client write confirmed/arbitrary rows around the vet-gate.
CREATE POLICY job_scope_answers_staff_all ON job_scope_answers FOR ALL
  USING (can_access_job(job_id) AND tenant_id = get_my_tenant_id())
  WITH CHECK (can_access_job(job_id) AND tenant_id = get_my_tenant_id());
