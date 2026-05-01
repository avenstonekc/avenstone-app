-- Add niche install and bench framing as boolean-gated labor line items
-- for the Tile - Wall / shower trade on bathroom takeoffs.
--
-- These are extra labor items emitted when scope_details.niche / .bench are true.
-- Sourced from labor_extras array added to scope_definition — separate from
-- labor_formula (which drives the main sf-based quantity line).

-- 1. Seed unit cost rows (category='labor', material_name set)
INSERT INTO takeoff_unit_costs
  (tenant_id, room_type, trade, category, material_name, unit, base_rate, active)
VALUES
  (NULL, 'bathroom', 'Tile - Wall / shower', 'labor', 'Niche install',                 'each', 200.00, true),
  (NULL, 'bathroom', 'Tile - Wall / shower', 'labor', 'Bench framing + waterproof',    'each', 175.00, true)
ON CONFLICT DO NOTHING;

-- 2. Add labor_extras to scope_definition for (bathroom, Tile - Wall / shower)
UPDATE takeoff_templates
SET scope_definition = jsonb_set(
  scope_definition,
  '{labor_extras}',
  '[
    {
      "material_name": "Niche install",
      "qty_basis": "scope_detail",
      "scope_detail_key": "niche",
      "fixed_qty": 1
    },
    {
      "material_name": "Bench framing + waterproof",
      "qty_basis": "scope_detail",
      "scope_detail_key": "bench",
      "fixed_qty": 1
    }
  ]'::jsonb
)
WHERE room_type = 'bathroom'
  AND trade = 'Tile - Wall / shower'
  AND tenant_id IS NULL;

-- Verify
SELECT
  trade,
  scope_definition->'labor_extras' AS labor_extras,
  scope_definition->'labor_formula' AS labor_formula
FROM takeoff_templates
WHERE room_type = 'bathroom'
  AND trade = 'Tile - Wall / shower'
  AND tenant_id IS NULL;

SELECT trade, material_name, category, unit, base_rate
FROM takeoff_unit_costs
WHERE room_type = 'bathroom'
  AND trade = 'Tile - Wall / shower'
  AND category = 'labor'
  AND tenant_id IS NULL
ORDER BY material_name NULLS FIRST;
