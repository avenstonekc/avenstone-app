-- Add labor_formula to scope_definition for bathroom trades that need non-default
-- labor quantity sourcing. Trades without labor_formula fall back to quantitySource
-- (regex mapping) in buildTakeoffDraft.
--
-- Tile - Wall / shower: shower_wall_sf from scope_details (computed from dims)
-- Tile - Floor:         floor_tile_sf from scope_details (net bathroom floor after subtract)
-- Cleanup:              floor_sf metric (standard contractor: area-based cleanup pricing)

UPDATE takeoff_templates
SET scope_definition = jsonb_set(
  scope_definition,
  '{labor_formula}',
  '{"qty_basis": "scope_detail", "scope_detail_key": "shower_wall_sf"}'::jsonb
)
WHERE room_type = 'bathroom'
  AND trade = 'Tile - Wall / shower'
  AND tenant_id IS NULL;

UPDATE takeoff_templates
SET scope_definition = jsonb_set(
  scope_definition,
  '{labor_formula}',
  '{"qty_basis": "scope_detail", "scope_detail_key": "floor_tile_sf"}'::jsonb
)
WHERE room_type = 'bathroom'
  AND trade = 'Tile - Floor'
  AND tenant_id IS NULL;

UPDATE takeoff_templates
SET scope_definition = jsonb_set(
  scope_definition,
  '{labor_formula}',
  '{"qty_basis": "metric", "metric_key": "floor_sf"}'::jsonb
)
WHERE room_type = 'bathroom'
  AND trade = 'Cleanup'
  AND tenant_id IS NULL;

-- Verify
SELECT trade, scope_definition->'labor_formula' AS labor_formula
FROM takeoff_templates
WHERE room_type = 'bathroom'
  AND tenant_id IS NULL
  AND scope_definition ? 'labor_formula'
ORDER BY trade;
