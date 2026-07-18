-- CONSULTATION_MODE Slice 1 — capture foundation schema.
-- (1) consultation_photos: in-flow photos snapped during an ambient session. Caption is
--     NULL at capture; matched from the transcript at recap time (slice 3), source
--     'speech' | 'manual'. Private storage (job-documents bucket) — path only stored here.
-- (2) scope_checklists.evidence_type: how a field is best answered — 'answer' (spoken/typed),
--     'measurement' (tape/LiDAR), or 'photo'. Drives the live-coach ask/measure/photo prompts
--     (slice 2). Default 'answer' so the 119 seeded platform rows keep working unchanged.
-- job_id is TEXT (legacy jobs.id pollution) — string equality, no FK, matching the sibling
-- consultation_* tables. session_id FK cascades. Multi-tenant: tenant_id + RLS. Kalin-locked
-- 2026-07-18.

CREATE TABLE IF NOT EXISTS consultation_photos (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL DEFAULT get_my_tenant_id(),
  session_id     UUID        REFERENCES consultation_sessions(id) ON DELETE CASCADE,
  job_id         TEXT,
  storage_path   TEXT        NOT NULL,
  captured_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  caption        TEXT,
  caption_source TEXT        NOT NULL DEFAULT 'speech' CHECK (caption_source IN ('speech','manual')),
  sort           INTEGER     NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consultation_photos_session ON consultation_photos (tenant_id, session_id);
CREATE INDEX IF NOT EXISTS idx_consultation_photos_job ON consultation_photos (tenant_id, job_id);

ALTER TABLE consultation_photos ENABLE ROW LEVEL SECURITY;

-- Staff read/write, job-scoped (same shape as job_rooms / job_notes).
CREATE POLICY consultation_photos_staff_all ON consultation_photos FOR ALL
  USING (can_access_job(job_id) AND tenant_id = get_my_tenant_id())
  WITH CHECK (can_access_job(job_id) AND tenant_id = get_my_tenant_id());

-- evidence_type on the checklist rows — see header note (2).
ALTER TABLE scope_checklists
  ADD COLUMN IF NOT EXISTS evidence_type TEXT NOT NULL DEFAULT 'answer'
  CHECK (evidence_type IN ('answer','measurement','photo'));
