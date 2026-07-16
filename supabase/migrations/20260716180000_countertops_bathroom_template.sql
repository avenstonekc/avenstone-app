-- PRICE_DETERMINISM P2 — Countertops bathroom takeoff_template.
-- Locked decision (Kalin 2026-07-16): standalone cross-room trade, SF + per-sink
-- pricing, NOT bundled under Cabinets/vanities-Install.
--
-- Quantity derivation (pure geometry from scope_details, no LLM):
--   countertop_sf  = vanity_width_in × 22in depth / 144 = SF of slab
--                    (scopeTranslation.translateAnswers computes this from vanity_size_in)
--   sink_count     = from scope_details.sink_count (1 for single, 2 for double, 0 for none)
--
-- No rate rows are seeded (KALIN_QUEUE item j: Kalin to supply $/SF installed + $/sink
-- cutout). Lines resolve through the PENDING RATE path until rates land.
--
-- labor_formula.skip_when_missing = true: when countertop_sf is absent/zero, the engine
-- skips the Countertops trade entirely (no spurious lump-sum line). Materials also guard
-- via the existing raw=0 skip on scope_detail basis.
--
-- trade_taxonomy already has parent_trade='Countertops' (verified pre-apply).

-- Verify taxonomy exists (advisory — does not block apply)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM trade_taxonomy WHERE parent_trade = 'Countertops' AND sub_trade IS NULL) THEN
    INSERT INTO trade_taxonomy (tenant_id, parent_trade, sub_trade, display_order, default_waste_pct, default_unit)
    VALUES (NULL, 'Countertops', NULL, 245, NULL, 'sf');
    RAISE NOTICE 'trade_taxonomy: inserted Countertops row';
  ELSE
    RAISE NOTICE 'trade_taxonomy: Countertops already present';
  END IF;
END $$;

-- Template (idempotent)
INSERT INTO takeoff_templates (tenant_id, room_type, name, trade, scope_definition, active)
SELECT
  NULL,
  'bathroom',
  'Bathroom remodel - Countertops',
  'Countertops',
  '{
    "summary": "Install countertop slab, edge profile, and sink cutout(s)",
    "optional": false,
    "waste_pct": null,
    "conditional": null,
    "default_unit": "sf",
    "labor_formula": {
      "qty_basis": "scope_detail",
      "scope_detail_key": "countertop_sf",
      "skip_when_missing": true
    },
    "materials_formula": [
      {
        "qty_basis": "scope_detail",
        "material_name": "Countertop slab",
        "qty_multiplier": 1,
        "qty_divisor": null,
        "fixed_qty": null,
        "scope_detail_key": "countertop_sf"
      },
      {
        "qty_basis": "scope_detail",
        "material_name": "Countertop sink cutout",
        "qty_multiplier": 1,
        "qty_divisor": null,
        "fixed_qty": null,
        "scope_detail_key": "sink_count"
      }
    ]
  }'::jsonb,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM takeoff_templates
  WHERE tenant_id IS NULL AND room_type = 'bathroom' AND trade = 'Countertops'
);

-- No takeoff_unit_costs rows yet (KALIN_QUEUE item j: rates pending Kalin input).
-- Until rates land, Countertops lines carry lineCostStatus='pending_rate'.

NOTIFY pgrst, 'reload schema';
