-- Fix bathroom tile formulas to use scope_detail keys instead of whole-room dimensions.
-- Tile - Wall / shower: wall_sf → scope_detail/shower_wall_sf (actual shower area, not full room walls)
-- Tile - Floor:         floor_sf → scope_detail/floor_tile_sf + add shower_floor_sf entry
-- Niche kit:            fixed → scope_detail/niche (boolean, fixed_qty=1 when true)

UPDATE takeoff_templates
SET scope_definition = jsonb_set(
  scope_definition,
  '{materials_formula}',
  '[
    {
      "qty_basis": "scope_detail",
      "scope_detail_key": "shower_wall_sf",
      "qty_multiplier": 1,
      "qty_divisor": null,
      "fixed_qty": null,
      "material_name": "Wall tile field"
    },
    {
      "qty_basis": "scope_detail",
      "scope_detail_key": "shower_wall_sf",
      "qty_multiplier": 1,
      "qty_divisor": "coverage_sf",
      "fixed_qty": null,
      "material_name": "Thinset 50lb"
    },
    {
      "qty_basis": "scope_detail",
      "scope_detail_key": "shower_wall_sf",
      "qty_multiplier": 1,
      "qty_divisor": "coverage_sf",
      "fixed_qty": null,
      "material_name": "Grout 25lb"
    },
    {
      "qty_basis": "scope_detail",
      "scope_detail_key": "shower_wall_sf",
      "qty_multiplier": 1,
      "qty_divisor": null,
      "fixed_qty": null,
      "material_name": "Waterproofing membrane"
    },
    {
      "qty_basis": "scope_detail",
      "scope_detail_key": "niche",
      "qty_multiplier": 1,
      "qty_divisor": null,
      "fixed_qty": 1,
      "material_name": "Niche kit"
    }
  ]'::jsonb
)
WHERE room_type = 'bathroom'
  AND trade = 'Tile - Wall / shower'
  AND tenant_id IS NULL;

UPDATE takeoff_templates
SET scope_definition = jsonb_set(
  scope_definition,
  '{materials_formula}',
  '[
    {
      "qty_basis": "scope_detail",
      "scope_detail_key": "floor_tile_sf",
      "qty_multiplier": 1,
      "qty_divisor": null,
      "fixed_qty": null,
      "material_name": "Floor tile field"
    },
    {
      "qty_basis": "scope_detail",
      "scope_detail_key": "shower_floor_sf",
      "qty_multiplier": 1,
      "qty_divisor": null,
      "fixed_qty": null,
      "material_name": "Floor tile field"
    },
    {
      "qty_basis": "scope_detail",
      "scope_detail_key": "floor_tile_sf",
      "qty_multiplier": 1,
      "qty_divisor": "coverage_sf",
      "fixed_qty": null,
      "material_name": "Thinset 50lb"
    },
    {
      "qty_basis": "scope_detail",
      "scope_detail_key": "floor_tile_sf",
      "qty_multiplier": 1,
      "qty_divisor": "coverage_sf",
      "fixed_qty": null,
      "material_name": "Grout 25lb"
    },
    {
      "qty_basis": "scope_detail",
      "scope_detail_key": "floor_tile_sf",
      "qty_multiplier": 1,
      "qty_divisor": "coverage_sf",
      "fixed_qty": null,
      "material_name": "Tile sealer"
    },
    {
      "qty_basis": "scope_detail",
      "scope_detail_key": "floor_tile_sf",
      "qty_multiplier": 1,
      "qty_divisor": "coverage_sf",
      "fixed_qty": null,
      "material_name": "Backer board 3x5 cement"
    }
  ]'::jsonb
)
WHERE room_type = 'bathroom'
  AND trade = 'Tile - Floor'
  AND tenant_id IS NULL;
