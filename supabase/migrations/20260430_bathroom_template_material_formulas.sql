-- Add materials_formula array to takeoff_templates.scope_definition for bathroom trades.
-- Existing scope_definition fields (summary, optional, waste_pct, conditional,
-- default_unit) are NOT modified. materials_formula is added as a new key.
-- scope_definition.waste_pct is deprecated (all-null, unused) — will be dropped
-- in a future cleanup migration. Active waste_pct is on takeoff_unit_costs rows.
--
-- Formula object shape per item:
--   material_name  TEXT   — joins to takeoff_unit_costs.material_name
--   qty_basis      TEXT   — wall_sf | floor_sf | ceiling_sf | perimeter_lf |
--                           door_count | window_count | room_count | fixed
--   qty_multiplier NUMERIC — applied before coverage division (e.g. 2.0 for 2 coats)
--   qty_divisor    TEXT|null — "coverage_sf" (read from unit cost row) or null
--   fixed_qty      NUMERIC|null — used when qty_basis = "fixed"
-- Waste applied at draft time using waste_pct from the unit cost row.

-- ── Drywall - Hang ────────────────────────────────────────────────────────────
UPDATE takeoff_templates
SET scope_definition = jsonb_set(scope_definition, '{materials_formula}', '[
  {"material_name":"Drywall sheet 1/2 4x8",  "qty_basis":"wall_sf",     "qty_multiplier":1.0, "qty_divisor":"coverage_sf", "fixed_qty":null},
  {"material_name":"Drywall screws 1lb box",  "qty_basis":"wall_sf",     "qty_multiplier":1.0, "qty_divisor":"coverage_sf", "fixed_qty":null}
]'::jsonb)
WHERE room_type = 'bathroom' AND trade = 'Drywall - Hang';

-- ── Drywall - Tape / mud / texture ───────────────────────────────────────────
UPDATE takeoff_templates
SET scope_definition = jsonb_set(scope_definition, '{materials_formula}', '[
  {"material_name":"Joint compound 5gal",     "qty_basis":"wall_sf",     "qty_multiplier":1.0, "qty_divisor":"coverage_sf", "fixed_qty":null},
  {"material_name":"Drywall tape 500ft roll", "qty_basis":"wall_sf",     "qty_multiplier":1.0, "qty_divisor":"coverage_sf", "fixed_qty":null},
  {"material_name":"Corner bead 8ft",         "qty_basis":"fixed",       "qty_multiplier":1.0, "qty_divisor":null,          "fixed_qty":4}
]'::jsonb)
WHERE room_type = 'bathroom' AND trade = 'Drywall - Tape / mud / texture';

-- ── Tile - Floor ─────────────────────────────────────────────────────────────
UPDATE takeoff_templates
SET scope_definition = jsonb_set(scope_definition, '{materials_formula}', '[
  {"material_name":"Floor tile field",        "qty_basis":"floor_sf",    "qty_multiplier":1.0, "qty_divisor":null,          "fixed_qty":null},
  {"material_name":"Thinset 50lb",            "qty_basis":"floor_sf",    "qty_multiplier":1.0, "qty_divisor":"coverage_sf", "fixed_qty":null},
  {"material_name":"Grout 25lb",              "qty_basis":"floor_sf",    "qty_multiplier":1.0, "qty_divisor":"coverage_sf", "fixed_qty":null},
  {"material_name":"Tile sealer",             "qty_basis":"floor_sf",    "qty_multiplier":1.0, "qty_divisor":"coverage_sf", "fixed_qty":null},
  {"material_name":"Backer board 3x5 cement", "qty_basis":"floor_sf",    "qty_multiplier":1.0, "qty_divisor":"coverage_sf", "fixed_qty":null}
]'::jsonb)
WHERE room_type = 'bathroom' AND trade = 'Tile - Floor';

-- ── Tile - Wall / shower ──────────────────────────────────────────────────────
UPDATE takeoff_templates
SET scope_definition = jsonb_set(scope_definition, '{materials_formula}', '[
  {"material_name":"Wall tile field",         "qty_basis":"wall_sf",     "qty_multiplier":1.0, "qty_divisor":null,          "fixed_qty":null},
  {"material_name":"Thinset 50lb",            "qty_basis":"wall_sf",     "qty_multiplier":1.0, "qty_divisor":"coverage_sf", "fixed_qty":null},
  {"material_name":"Grout 25lb",              "qty_basis":"wall_sf",     "qty_multiplier":1.0, "qty_divisor":"coverage_sf", "fixed_qty":null},
  {"material_name":"Waterproofing membrane",  "qty_basis":"wall_sf",     "qty_multiplier":1.0, "qty_divisor":null,          "fixed_qty":null},
  {"material_name":"Niche kit",               "qty_basis":"fixed",       "qty_multiplier":1.0, "qty_divisor":null,          "fixed_qty":1}
]'::jsonb)
WHERE room_type = 'bathroom' AND trade = 'Tile - Wall / shower';

-- ── Paint - Interior ─────────────────────────────────────────────────────────
-- Wall paint: qty_multiplier=2.0 to account for 2 coats before coverage division.
-- Ceiling uses floor_sf as the closest available basis (RoomPlan gives sqft=floor area).
UPDATE takeoff_templates
SET scope_definition = jsonb_set(scope_definition, '{materials_formula}', '[
  {"material_name":"Primer 1gal",       "qty_basis":"wall_sf",  "qty_multiplier":1.0, "qty_divisor":"coverage_sf", "fixed_qty":null},
  {"material_name":"Wall paint 1gal",   "qty_basis":"wall_sf",  "qty_multiplier":2.0, "qty_divisor":"coverage_sf", "fixed_qty":null},
  {"material_name":"Ceiling paint 1gal","qty_basis":"floor_sf", "qty_multiplier":1.0, "qty_divisor":"coverage_sf", "fixed_qty":null},
  {"material_name":"Trim paint 1qt",    "qty_basis":"fixed",    "qty_multiplier":1.0, "qty_divisor":null,          "fixed_qty":1}
]'::jsonb)
WHERE room_type = 'bathroom' AND trade = 'Paint - Interior';

-- ── Trim / carpentry - Base / case ───────────────────────────────────────────
-- Door casing: 7 lf per door opening (single-side run).
-- Caulk and nails: fixed 1 each as starter; rep adjusts.
UPDATE takeoff_templates
SET scope_definition = jsonb_set(scope_definition, '{materials_formula}', '[
  {"material_name":"Baseboard MDF primed",   "qty_basis":"perimeter_lf", "qty_multiplier":1.0, "qty_divisor":null, "fixed_qty":null},
  {"material_name":"Door casing MDF",        "qty_basis":"door_count",   "qty_multiplier":7.0, "qty_divisor":null, "fixed_qty":null},
  {"material_name":"Caulk tube",             "qty_basis":"fixed",        "qty_multiplier":1.0, "qty_divisor":null, "fixed_qty":1},
  {"material_name":"Finish nails 2.5in box", "qty_basis":"fixed",        "qty_multiplier":1.0, "qty_divisor":null, "fixed_qty":1}
]'::jsonb)
WHERE room_type = 'bathroom' AND trade = 'Trim / carpentry - Base / case';

-- ── Flooring - LVP ───────────────────────────────────────────────────────────
-- Transition strip: 1 per door opening; waste on unit cost row handles overage.
UPDATE takeoff_templates
SET scope_definition = jsonb_set(scope_definition, '{materials_formula}', '[
  {"material_name":"LVP plank",        "qty_basis":"floor_sf",   "qty_multiplier":1.0, "qty_divisor":null, "fixed_qty":null},
  {"material_name":"LVP underlayment", "qty_basis":"floor_sf",   "qty_multiplier":1.0, "qty_divisor":null, "fixed_qty":null},
  {"material_name":"Transition strip", "qty_basis":"door_count", "qty_multiplier":1.0, "qty_divisor":null, "fixed_qty":null}
]'::jsonb)
WHERE room_type = 'bathroom' AND trade = 'Flooring - LVP';

-- ── Cabinets / vanities - Install ────────────────────────────────────────────
UPDATE takeoff_templates
SET scope_definition = jsonb_set(scope_definition, '{materials_formula}', '[
  {"material_name":"Vanity cabinet 30in", "qty_basis":"fixed", "qty_multiplier":1.0, "qty_divisor":null, "fixed_qty":1},
  {"material_name":"Vanity top",          "qty_basis":"fixed", "qty_multiplier":1.0, "qty_divisor":null, "fixed_qty":1},
  {"material_name":"Vanity sink",         "qty_basis":"fixed", "qty_multiplier":1.0, "qty_divisor":null, "fixed_qty":1},
  {"material_name":"Mirror",              "qty_basis":"fixed", "qty_multiplier":1.0, "qty_divisor":null, "fixed_qty":1}
]'::jsonb)
WHERE room_type = 'bathroom' AND trade = 'Cabinets / vanities - Install';

-- ── Plumbing - Finish / fixtures ─────────────────────────────────────────────
-- Shut-off valves: 2 sets (1 per toilet + 1 per sink) as default.
UPDATE takeoff_templates
SET scope_definition = jsonb_set(scope_definition, '{materials_formula}', '[
  {"material_name":"Toilet",               "qty_basis":"fixed", "qty_multiplier":1.0, "qty_divisor":null, "fixed_qty":1},
  {"material_name":"Shower valve trim kit","qty_basis":"fixed", "qty_multiplier":1.0, "qty_divisor":null, "fixed_qty":1},
  {"material_name":"Tub spout",            "qty_basis":"fixed", "qty_multiplier":1.0, "qty_divisor":null, "fixed_qty":1},
  {"material_name":"Bath faucet",          "qty_basis":"fixed", "qty_multiplier":1.0, "qty_divisor":null, "fixed_qty":1},
  {"material_name":"Shut-off valves pair", "qty_basis":"fixed", "qty_multiplier":1.0, "qty_divisor":null, "fixed_qty":2}
]'::jsonb)
WHERE room_type = 'bathroom' AND trade = 'Plumbing - Finish / fixtures';

-- Trades with no material rows (Demo, Cleanup, Plumbing-Rough-in,
-- Electrical-Rough-in, Electrical-Finish) get no materials_formula update.
