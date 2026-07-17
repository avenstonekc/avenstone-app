-- PRICE_DETERMINISM: Countertops bathroom rates + template restructure.
-- Closes KALIN_QUEUE j + PRICE_DETERMINISM parked follow-up (ii).
--
-- Rates (locked 2026-07-16, midpoint of two KC vendor estimates:
--   Sarto E79731 + Euroselect 13774):
--   - $85.00/SF installed — material + fabrication + installation, all tiers
--     blended for v1. Single all-in rate, no labor/material split.
--   - $135.00/each — sink cutout (per opening).
--   - $120.00/job — template fee / mobilization (fixed per engagement).
--
-- Template restructure (same transaction):
--   The P2 template had labor_formula + a "Countertop slab" materials entry,
--   both keyed on countertop_sf. Seeding the all-in $85 only on the labor row
--   leaves the slab materials line pending. To avoid a double-pending output, this
--   migration removes "Countertop slab" from materials_formula (the labor rate
--   covers it) and adds the template/mobilization fixed-qty entry.
--   "Countertop sink cutout" stays in materials_formula at $135/each.
--
-- After this migration, Countertops lines for a single-vanity bathroom:
--   countertop_sf = 9.17 SF (36-in vanity) → labor  $85 × 9.17 = ~$779.45
--   sink cutout   = 1 each                  → mats   $135 × 1  = $135.00
--   template fee  = 1 LS (fixed)            → mats   $120 × 1  = $120.00
--   total new priced: ~$1,034.45 (no pending Countertops lines)

-- ── 1. Restructure the template ──────────────────────────────────────────────
-- Remove "Countertop slab" from materials_formula (now covered by labor rate);
-- add Template / mobilization fee as a fixed_qty=1 materials entry.

UPDATE takeoff_templates
SET scope_definition = scope_definition
  -- Remove "Countertop slab" from materials_formula
  || jsonb_build_object('materials_formula', (
       SELECT jsonb_agg(entry)
       FROM jsonb_array_elements(scope_definition->'materials_formula') AS entry
       WHERE entry->>'material_name' <> 'Countertop slab'
     ))
  -- Append Template / mobilization fee entry
  || jsonb_build_object('materials_formula', (
       SELECT jsonb_agg(entry)
       FROM jsonb_array_elements(
         (
           SELECT jsonb_agg(e)
           FROM jsonb_array_elements(scope_definition->'materials_formula') AS e
           WHERE e->>'material_name' <> 'Countertop slab'
         )
         || jsonb_build_array(jsonb_build_object(
              'material_name', 'Template / mobilization fee',
              'qty_basis',     'fixed',
              'fixed_qty',     1,
              'qty_multiplier', 1,
              'qty_divisor',   null
            ))
       ) AS entry
     ))
WHERE tenant_id IS NULL
  AND room_type  = 'bathroom'
  AND trade      = 'Countertops';

-- ── 2. Seed takeoff_unit_costs (idempotent) ──────────────────────────────────

-- 2a. Labor install rate — $85/SF all-in (material + fab + install).
--     category='labor', material_name=NULL → matches laborCostMap['Countertops'].
INSERT INTO takeoff_unit_costs
  (tenant_id, room_type, trade, category, unit, base_rate, material_name,
   waste_pct, coverage_sf, multipliers, notes, active)
SELECT
  NULL, 'bathroom', 'Countertops', 'labor', 'sf', 85.00, NULL,
  0, NULL, '{"basement":1.3,"first_floor":1,"second_floor":1.15}'::jsonb,
  'All-in installed (material+fab+install). Sarto E79731 + Euroselect 13774 midpoint. KALIN_QUEUE j 2026-07-16.',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM takeoff_unit_costs
  WHERE tenant_id IS NULL AND room_type = 'bathroom' AND trade = 'Countertops'
    AND category = 'labor' AND material_name IS NULL
);

-- 2b. Sink cutout — $135/each.
--     category='materials', material_name='Countertop sink cutout'
--     → matches materialRateMap['Countertops::Countertop sink cutout'].
INSERT INTO takeoff_unit_costs
  (tenant_id, room_type, trade, category, unit, base_rate, material_name,
   waste_pct, coverage_sf, multipliers, notes, active)
SELECT
  NULL, 'bathroom', 'Countertops', 'materials', 'each', 135.00, 'Countertop sink cutout',
  0, NULL, '{"basement":1.3,"first_floor":1,"second_floor":1.15}'::jsonb,
  'Per sink cutout / undermount opening. Sarto E79731 midpoint 2026-07-16.',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM takeoff_unit_costs
  WHERE tenant_id IS NULL AND room_type = 'bathroom' AND trade = 'Countertops'
    AND category = 'materials' AND material_name = 'Countertop sink cutout'
);

-- 2c. Template / mobilization fee — $120 fixed per job.
--     category='materials', material_name='Template / mobilization fee', unit='LS'
--     → matches materialRateMap['Countertops::Template / mobilization fee'].
INSERT INTO takeoff_unit_costs
  (tenant_id, room_type, trade, category, unit, base_rate, material_name,
   waste_pct, coverage_sf, multipliers, notes, active)
SELECT
  NULL, 'bathroom', 'Countertops', 'materials', 'lump', 120.00, 'Template / mobilization fee',
  0, NULL, '{"basement":1.3,"first_floor":1,"second_floor":1.15}'::jsonb,
  'Fixed per-engagement template / shop drawing fee. Euroselect 13774 midpoint 2026-07-16.',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM takeoff_unit_costs
  WHERE tenant_id IS NULL AND room_type = 'bathroom' AND trade = 'Countertops'
    AND category = 'materials' AND material_name = 'Template / mobilization fee'
);

NOTIFY pgrst, 'reload schema';
