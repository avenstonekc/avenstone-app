-- Step 4.5a: per-room scope tagging for takeoff wizard
-- job_room_scopes stores one row per (job, room) with the rep's chosen scope tag.
-- room_id is the constructed key from buildTakeoffDraft: "${scan.id}_${idx}".

CREATE TABLE job_room_scopes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  job_id      TEXT NOT NULL,
  room_id     TEXT NOT NULL,
  room_label  TEXT,
  room_type   TEXT NOT NULL,
  scope_tag   TEXT NOT NULL,
  custom_trades TEXT[],
  notes       TEXT,
  created_by  UUID NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, job_id, room_id)
);

CREATE INDEX idx_jrs_job    ON job_room_scopes(job_id);
CREATE INDEX idx_jrs_tenant ON job_room_scopes(tenant_id);

ALTER TABLE job_room_scopes ENABLE ROW LEVEL SECURITY;

CREATE POLICY jrs_select ON job_room_scopes FOR SELECT
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY jrs_insert ON job_room_scopes FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id());
CREATE POLICY jrs_update ON job_room_scopes FOR UPDATE
  USING  (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());
CREATE POLICY jrs_delete ON job_room_scopes FOR DELETE
  USING (tenant_id = get_my_tenant_id());
