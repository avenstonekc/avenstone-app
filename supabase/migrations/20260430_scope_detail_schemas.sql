-- scope_detail_schemas: JSON schema catalog keyed by (room_type, scope_tag).
-- Platform defaults have tenant_id NULL. Tenant overrides are per-tenant rows.
-- scope_details column on job_room_scopes stores the rep's filled-in form values.

CREATE TABLE scope_detail_schemas (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID,                      -- NULL = platform default
  room_type  TEXT NOT NULL,
  scope_tag  TEXT NOT NULL,
  schema     JSONB NOT NULL,            -- field definitions array
  sort_order INT DEFAULT 0,
  active     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, room_type, scope_tag)
);

CREATE INDEX idx_sds_lookup ON scope_detail_schemas (room_type, scope_tag);

ALTER TABLE scope_detail_schemas ENABLE ROW LEVEL SECURITY;

CREATE POLICY sds_select ON scope_detail_schemas FOR SELECT
  USING (tenant_id IS NULL OR tenant_id = get_my_tenant_id());

CREATE POLICY sds_modify ON scope_detail_schemas FOR ALL
  USING (tenant_id = get_my_tenant_id())
  WITH CHECK (tenant_id = get_my_tenant_id());

-- Add scope_details JSONB to job_room_scopes for the rep's filled-in form values.
ALTER TABLE job_room_scopes
  ADD COLUMN IF NOT EXISTS scope_details JSONB DEFAULT '{}'::jsonb;
