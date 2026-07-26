-- TIER 2 #4 Slice 2a — room-agnostic labor rates + vetted flag.
-- Kalin's locked call (2026-07-26): labor rates do NOT vary by room type. One rate per trade,
-- entered once. room_type NULL = "applies to all room types". Adds the vetted flag the
-- Unvetted Rep-Rate Approval Gate (B3.1/B3.2) needs — rep-entered tenant rows start unvetted.
--
-- SUBSTRATE ONLY. No existing room-specific rows are collapsed or migrated (Kalin re-enters clean).

-- 1. room_type nullable. NULL means "applies to all room types".
ALTER TABLE takeoff_unit_costs ALTER COLUMN room_type DROP NOT NULL;

-- 2. Rebuild the unique indexes so a NULL room_type is a distinguishable value. Follows the
--    table's established COALESCE(tenant_id,'__platform__') pattern — NOT NULLS NOT DISTINCT —
--    so two all-rooms rows for the same (tenant, trade, material) still collide as intended.
DROP INDEX IF EXISTS idx_uc_labor_uniq;
CREATE UNIQUE INDEX idx_uc_labor_uniq ON public.takeoff_unit_costs
  USING btree (
    COALESCE((tenant_id)::text, '__platform__'::text),
    COALESCE(room_type, '__all__'::text),
    trade,
    COALESCE(material_name, ''::text)
  )
  WHERE (category = 'labor'::text);

DROP INDEX IF EXISTS idx_uc_mat_uniq;
CREATE UNIQUE INDEX idx_uc_mat_uniq ON public.takeoff_unit_costs
  USING btree (
    COALESCE((tenant_id)::text, '__platform__'::text),
    COALESCE(room_type, '__all__'::text),
    trade,
    material_name
  )
  WHERE (category = 'materials'::text);

-- 3. vetted flag. Platform defaults (tenant_id IS NULL) are curated → vetted = true.
--    Tenant rows are rep-entered → stay false until an owner clears them (B3.1/B3.2).
ALTER TABLE takeoff_unit_costs ADD COLUMN vetted BOOLEAN NOT NULL DEFAULT false;
UPDATE takeoff_unit_costs SET vetted = true WHERE tenant_id IS NULL;
