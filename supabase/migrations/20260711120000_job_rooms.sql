-- SCOPE_TO_ESTIMATE Phase A — job_rooms
-- Per-job room list; the spatial key for the one answer store. Decoupled from scans:
-- source 'typed' (interview default: one room per project_type interview, label = project
-- type) | 'scan'; scan_room_id soft-bridges job_room_scopes.room_id (legacy "${scan.id}_${idx}"
-- string — no FK). Staff-only in Phase A; client policies land in Phase C. Blueprint locked
-- 2026-07-11. Platform table: tenant_id + RLS, no trade hardcoding.

CREATE TABLE IF NOT EXISTS job_rooms (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL,
  job_id       TEXT        NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  label        TEXT        NOT NULL,
  source       TEXT        NOT NULL CHECK (source IN ('typed','scan')),
  scan_room_id TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_rooms_tenant_job ON job_rooms (tenant_id, job_id);

ALTER TABLE job_rooms ENABLE ROW LEVEL SECURITY;

-- Staff read/write (job_notes pattern: can_access_job + tenant match). No client role in
-- Phase A. NOTE for Phase C: can_access_job also admits the linked client — when Phase C
-- adds a forced-value client INSERT policy, scope this policy to staff roles so the
-- permissive OR-union of RLS policies does not let a client bypass the vet-gate.
CREATE POLICY job_rooms_staff_all ON job_rooms FOR ALL
  USING (can_access_job(job_id) AND tenant_id = get_my_tenant_id())
  WITH CHECK (can_access_job(job_id) AND tenant_id = get_my_tenant_id());
