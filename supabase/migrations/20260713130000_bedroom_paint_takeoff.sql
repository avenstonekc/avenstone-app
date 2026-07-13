-- TAKEOFF_BRIDGE Phase 4 — bedroom/paint verification vehicle (minimal, data-only). A scanned
-- bedroom had no takeoff path (no 'bedroom' room_type). Seed Paint - Interior for bedroom: the
-- template materials_formula (gallons from wall_sf/floor_sf ÷ coverage_sf) + unit costs (labor +
-- the four paint materials), cloned from bathroom Paint - Interior. Wall/ceiling SF come from ROOM
-- METRICS (scan), so this runs on the SCAN path. Bedroom has only this template, so an unscoped
-- room emits just Paint (no scope subset needed). Idempotent via NOT EXISTS.
-- (The bedroom INTERVIEW-path checklist stays thin — out of scope; reported, not built.)

INSERT INTO takeoff_templates (tenant_id, room_type, name, trade, scope_definition, active)
SELECT NULL, 'bedroom', 'Bedroom - Paint - Interior', 'Paint - Interior',
  '{"summary":"Prime and paint bedroom walls and ceiling","optional":false,"waste_pct":null,"conditional":null,"default_unit":"sf","materials_formula":[{"fixed_qty":null,"qty_basis":"wall_sf","qty_divisor":"coverage_sf","material_name":"Primer 1gal","qty_multiplier":1},{"fixed_qty":null,"qty_basis":"wall_sf","qty_divisor":"coverage_sf","material_name":"Wall paint 1gal","qty_multiplier":2},{"fixed_qty":null,"qty_basis":"floor_sf","qty_divisor":"coverage_sf","material_name":"Ceiling paint 1gal","qty_multiplier":1},{"fixed_qty":1,"qty_basis":"fixed","qty_divisor":null,"material_name":"Trim paint 1qt","qty_multiplier":1}]}'::jsonb,
  true
WHERE NOT EXISTS (SELECT 1 FROM takeoff_templates WHERE tenant_id IS NULL AND room_type='bedroom' AND trade='Paint - Interior');

INSERT INTO takeoff_unit_costs (tenant_id, room_type, trade, category, unit, base_rate, material_name, coverage_sf, waste_pct, multipliers, active)
SELECT NULL, 'bedroom', 'Paint - Interior', v.category, v.unit, v.base_rate, v.material_name, v.coverage_sf, 0, v.multipliers::jsonb, true
FROM (VALUES
  ('labor',     'sf',     3.50, NULL,                 NULL,  '{"basement":1.15,"first_floor":1,"second_floor":1.15}'),
  ('materials', 'gallon', 32.00, 'Primer 1gal',       300::numeric, '{}'),
  ('materials', 'gallon', 48.00, 'Wall paint 1gal',   350::numeric, '{}'),
  ('materials', 'gallon', 42.00, 'Ceiling paint 1gal',400::numeric, '{}'),
  ('materials', 'quart',  18.00, 'Trim paint 1qt',    NULL,  '{}')
) AS v(category, unit, base_rate, material_name, coverage_sf, multipliers)
WHERE NOT EXISTS (
  SELECT 1 FROM takeoff_unit_costs u
  WHERE u.tenant_id IS NULL AND u.room_type='bedroom' AND u.trade='Paint - Interior'
    AND u.category=v.category AND coalesce(u.material_name,'')=coalesce(v.material_name,'')
);
