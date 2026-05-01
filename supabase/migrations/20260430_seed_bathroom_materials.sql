-- Seed bathroom material rate rows into takeoff_unit_costs.
-- 35 rows, tenant_id=NULL (platform defaults), category='materials'.
-- KC mid-range pricing. Sourced from Step 1 of estimate+procurement arc.
-- Trades without material rows: Demo, Cleanup, Plumbing-Rough-in,
--   Electrical-Rough-in, Electrical-Finish (labor bakes in consumables).

INSERT INTO takeoff_unit_costs
  (tenant_id, room_type, trade, category, material_name, unit, base_rate, coverage_sf, waste_pct, multipliers, active)
VALUES

-- ── Drywall - Hang ────────────────────────────────────────────────────────────
(NULL, 'bathroom', 'Drywall - Hang',   'materials', 'Drywall sheet 1/2 4x8',    'sheet',  14.00, 32,   5, '{}', true),
(NULL, 'bathroom', 'Drywall - Hang',   'materials', 'Drywall screws 1lb box',   'box',     7.00, 200,  0, '{}', true),

-- ── Drywall - Tape / mud / texture ───────────────────────────────────────────
(NULL, 'bathroom', 'Drywall - Tape / mud / texture', 'materials', 'Joint compound 5gal',    'bucket', 18.00, 400, 0, '{}', true),
(NULL, 'bathroom', 'Drywall - Tape / mud / texture', 'materials', 'Drywall tape 500ft roll', 'roll',   6.00, 300, 0, '{}', true),
(NULL, 'bathroom', 'Drywall - Tape / mud / texture', 'materials', 'Corner bead 8ft',         'each',   2.50, NULL,0, '{}', true),

-- ── Tile - Floor ─────────────────────────────────────────────────────────────
(NULL, 'bathroom', 'Tile - Floor', 'materials', 'Floor tile field',        'sf',     4.50,   1, 10, '{}', true),
(NULL, 'bathroom', 'Tile - Floor', 'materials', 'Thinset 50lb',            'bag',   22.00,  95,  0, '{}', true),
(NULL, 'bathroom', 'Tile - Floor', 'materials', 'Grout 25lb',              'bag',   24.00, 200,  0, '{}', true),
(NULL, 'bathroom', 'Tile - Floor', 'materials', 'Tile sealer',             'bottle',28.00, 500,  0, '{}', true),
(NULL, 'bathroom', 'Tile - Floor', 'materials', 'Backer board 3x5 cement', 'sheet', 14.00,  15,  5, '{}', true),

-- ── Tile - Wall / shower ──────────────────────────────────────────────────────
(NULL, 'bathroom', 'Tile - Wall / shower', 'materials', 'Wall tile field',          'sf',   5.50,   1, 12, '{}', true),
(NULL, 'bathroom', 'Tile - Wall / shower', 'materials', 'Thinset 50lb',             'bag', 22.00,  95,  0, '{}', true),
(NULL, 'bathroom', 'Tile - Wall / shower', 'materials', 'Grout 25lb',               'bag', 24.00, 200,  0, '{}', true),
(NULL, 'bathroom', 'Tile - Wall / shower', 'materials', 'Waterproofing membrane',   'sf',   1.80,   1,  8, '{}', true),
(NULL, 'bathroom', 'Tile - Wall / shower', 'materials', 'Niche kit',                'each',45.00, NULL, 0, '{}', true),

-- ── Paint - Interior ─────────────────────────────────────────────────────────
(NULL, 'bathroom', 'Paint - Interior', 'materials', 'Primer 1gal',      'gallon', 32.00, 300, 0, '{}', true),
(NULL, 'bathroom', 'Paint - Interior', 'materials', 'Wall paint 1gal',  'gallon', 48.00, 350, 0, '{}', true),
(NULL, 'bathroom', 'Paint - Interior', 'materials', 'Ceiling paint 1gal','gallon',42.00, 400, 0, '{}', true),
(NULL, 'bathroom', 'Paint - Interior', 'materials', 'Trim paint 1qt',   'quart',  18.00, NULL,0, '{}', true),

-- ── Trim / carpentry - Base / case ───────────────────────────────────────────
(NULL, 'bathroom', 'Trim / carpentry - Base / case', 'materials', 'Baseboard MDF primed',   'lf',  1.40, NULL, 8, '{}', true),
(NULL, 'bathroom', 'Trim / carpentry - Base / case', 'materials', 'Door casing MDF',        'lf',  1.20, NULL, 5, '{}', true),
(NULL, 'bathroom', 'Trim / carpentry - Base / case', 'materials', 'Caulk tube',             'tube',5.50, NULL, 0, '{}', true),
(NULL, 'bathroom', 'Trim / carpentry - Base / case', 'materials', 'Finish nails 2.5in box', 'box', 9.00, NULL, 0, '{}', true),

-- ── Flooring - LVP ───────────────────────────────────────────────────────────
(NULL, 'bathroom', 'Flooring - LVP', 'materials', 'LVP plank',       'sf',   3.80, 1, 8, '{}', true),
(NULL, 'bathroom', 'Flooring - LVP', 'materials', 'LVP underlayment', 'sf',   0.55, 1, 5, '{}', true),
(NULL, 'bathroom', 'Flooring - LVP', 'materials', 'Transition strip', 'each',18.00,NULL,0, '{}', true),

-- ── Cabinets / vanities - Install ────────────────────────────────────────────
(NULL, 'bathroom', 'Cabinets / vanities - Install', 'materials', 'Vanity cabinet 30in', 'each', 385.00, NULL, 0, '{}', true),
(NULL, 'bathroom', 'Cabinets / vanities - Install', 'materials', 'Vanity top',          'each', 220.00, NULL, 0, '{}', true),
(NULL, 'bathroom', 'Cabinets / vanities - Install', 'materials', 'Vanity sink',         'each', 125.00, NULL, 0, '{}', true),
(NULL, 'bathroom', 'Cabinets / vanities - Install', 'materials', 'Mirror',              'each',  85.00, NULL, 0, '{}', true),

-- ── Plumbing - Finish / fixtures ─────────────────────────────────────────────
(NULL, 'bathroom', 'Plumbing - Finish / fixtures', 'materials', 'Toilet',               'each', 185.00, NULL, 0, '{}', true),
(NULL, 'bathroom', 'Plumbing - Finish / fixtures', 'materials', 'Shower valve trim kit', 'each', 145.00, NULL, 0, '{}', true),
(NULL, 'bathroom', 'Plumbing - Finish / fixtures', 'materials', 'Tub spout',            'each',  35.00, NULL, 0, '{}', true),
(NULL, 'bathroom', 'Plumbing - Finish / fixtures', 'materials', 'Bath faucet',          'each',  95.00, NULL, 0, '{}', true),
(NULL, 'bathroom', 'Plumbing - Finish / fixtures', 'materials', 'Shut-off valves pair', 'set',   24.00, NULL, 0, '{}', true);
