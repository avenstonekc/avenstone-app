-- Allow NULL tenant_id on takeoff_templates for platform-default rows.
-- Platform rows (tenant_id IS NULL) are visible to all tenants via updated RLS.
-- Tenant sessions cannot insert/update rows with tenant_id IS NULL because
-- WITH CHECK enforces tenant_id = get_my_tenant_id(). Service role bypasses RLS
-- and is used for seeding platform defaults.

-- Step 1: make tenant_id nullable (FK still validates non-NULL values)
ALTER TABLE takeoff_templates ALTER COLUMN tenant_id DROP NOT NULL;

-- Step 2: update SELECT policy to include platform rows
DROP POLICY IF EXISTS takeoff_templates_select ON takeoff_templates;

CREATE POLICY takeoff_templates_select ON takeoff_templates
  FOR SELECT
  USING (tenant_id = get_my_tenant_id() OR tenant_id IS NULL);

-- Step 3: write policy unchanged — WITH CHECK (tenant_id = get_my_tenant_id())
-- already rejects tenant-session inserts of platform rows (tenant_id IS NULL
-- != get_my_tenant_id()). No change needed to takeoff_templates_owner_write.
