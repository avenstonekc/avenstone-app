-- ============================================================
-- ESTIMATOR_KNOWLEDGE_ARC Phase 1.5 — Rate Book Data Seed
-- Extracts structured rates from 15 ai_knowledge pricing rows
-- into rate_book_labor and rate_book_material.
--
-- RULES:
-- - All rows: tenant_id = Avenstone (00000000-0000-0000-0000-000000000001)
-- - Labor rows: vetted = false (Kalin hasn't confirmed these yet)
-- - Material rows: ai_drafted = true, kalin_adjusted = false
-- - Combined L+M rows: rate_data = '{"type":"flat","needs_split":true}'
--   These surface as amber in Rate Book UI for Kalin to decompose at review.
-- - trade strings MUST match trade_taxonomy parent_trade (canonical vocabulary)
-- - Per-unit rates only (no hourly rows)
--
-- E1 TRADE MISMATCH REPORTED HERE:
--   'Windows / doors' does NOT exist in trade_taxonomy.parent_trade.
--   Rows are seeded with that string and flagged in notes.
--   Action needed: add 'Windows / doors' to trade_taxonomy OR remap these
--   rates to an existing trade before wiring the estimator lookup.
--   The supply+install (all-in) window/door prices go to rate_book_material
--   where trade is not a key — only labor install rows are affected.
--
-- ai_knowledge rows left ACTIVE and UNTOUCHED by this migration.
-- Migration 3 (archive) is a separate step gated on Kalin's review.
-- ============================================================

DO $$
DECLARE
  av UUID := '00000000-0000-0000-0000-000000000001';
BEGIN

-- ═══════════════════════════════════════════════════════════
-- RATE_BOOK_LABOR
-- ═══════════════════════════════════════════════════════════

-- ── DEMO (trade_taxonomy: 'Demo') ───────────────────────────
INSERT INTO rate_book_labor (tenant_id, trade, line_item, unit, rate_low, rate_high, rate_data, notes, vetted) VALUES
  (av, 'Demo', 'soft_demo',              'SF',   2.50,  4.50,  '{"type":"flat"}', 'drywall, flooring, fixtures, cabinets; per SF affected area', false),
  (av, 'Demo', 'full_gut',               'SF',   5.00,  9.00,  '{"type":"flat"}', 'down to studs + subfloor; per SF of home', false),
  (av, 'Demo', 'single_room_gut',        'room', 800,   2500,  '{"type":"flat"}', 'bath or kitchen full gut', false),
  (av, 'Demo', 'wall_remove_nonstructural','EA',  400,   900,   '{"type":"flat"}', 'includes patching ends', false),
  (av, 'Demo', 'wall_remove_structural', 'EA',   2500,  6000,  '{"type":"flat"}', 'with beam; depends on span', false),
  (av, 'Demo', 'deck_demo',              'SF',   3.00,  6.00,  '{"type":"flat"}', null, false),
  (av, 'Demo', 'siding_removal',         'SF',   0.80,  1.50,  '{"type":"flat"}', 'vinyl or wood', false),
  (av, 'Demo', 'roof_tearoff_demo_only', 'sq',   60,    90,    '{"type":"flat"}', '1 sq = 100 SF; demolition context; see Roofing.tearoff_1layer for replacement context', false),
  (av, 'Demo', 'flatwork_breakout',      'SF',   2.50,  4.00,  '{"type":"flat"}', 'concrete driveway/patio', false),
  (av, 'Demo', 'haul_per_load',          'load', 250,   400,   '{"type":"flat"}', 'pickup truck + dump fee', false)
ON CONFLICT ON CONSTRAINT rate_book_labor_natural_key DO NOTHING;

-- ── DRYWALL (trade_taxonomy: 'Drywall') ─────────────────────
-- hang and tape_mud are labor-only. combined/fire-rated are L+M combined (needs_split).
INSERT INTO rate_book_labor (tenant_id, trade, line_item, unit, rate_low, rate_high, rate_data, notes, vetted) VALUES
  (av, 'Drywall', 'hang',                  'SF', 0.38, 0.55, '{"type":"flat"}',              'hang only, no finishing; per SF of drywall', false),
  (av, 'Drywall', 'tape_mud_finish',        'SF', 0.55, 0.80, '{"type":"flat"}',              'tape, mud, Level 4 finish only; no hanging', false),
  (av, 'Drywall', 'combined_hang_finish',   'SF', 1.25, 1.85, '{"type":"flat","needs_split":true}', '1/2" drywall full install hang + L4 finish; L+M combined', false),
  (av, 'Drywall', 'fire_rated_combined',    'SF', 1.50, 2.10, '{"type":"flat","needs_split":true}', '5/8" Type X; L+M combined', false),
  (av, 'Drywall', 'moisture_resistant',     'SF', 1.40, 1.90, '{"type":"flat","needs_split":true}', '1/2" MR; L+M combined', false),
  (av, 'Drywall', 'ceiling_level4',         'SF', 1.40, 2.00, '{"type":"flat"}',              'ceiling only; Level 4 finish, paint-ready', false),
  (av, 'Drywall', 'primer_skim',            'SF', 0.20, 0.35, '{"type":"flat"}',              'primer coat or skim over existing', false),
  (av, 'Drywall', 'patch_small',            'EA', 75,   200,  '{"type":"flat"}',              'small patch (under 2 SF); includes tape, mud, texture', false)
ON CONFLICT ON CONSTRAINT rate_book_labor_natural_key DO NOTHING;

-- ── PAINT (trade_taxonomy: 'Paint') ─────────────────────────
-- Painting rates include mid-grade material (paint gallons) per industry standard.
-- Flagged in notes; NOT tagged needs_split since material component is minor
-- and painters quote this way universally.
INSERT INTO rate_book_labor (tenant_id, trade, line_item, unit, rate_low, rate_high, rate_data, notes, vetted) VALUES
  (av, 'Paint', 'interior_walls_prime_2coat', 'SF',  1.60,  2.60, '{"type":"flat"}', 'per SF wall area; prime + 2 coats; includes mid-grade paint material', false),
  (av, 'Paint', 'full_room_repaint',          'SF',  2.75,  4.25, '{"type":"flat"}', 'per SF floor area; walls + ceiling + trim; includes material', false),
  (av, 'Paint', 'new_construction',           'SF',  2.00,  3.25, '{"type":"flat"}', 'per SF floor area; new build paint package; includes material', false),
  (av, 'Paint', 'ceiling_only',               'SF',  0.90,  1.50, '{"type":"flat"}', 'per SF ceiling; includes material', false),
  (av, 'Paint', 'trim',                       'LF',  1.25,  2.25, '{"type":"flat"}', 'baseboard/trim per LF; includes material', false),
  (av, 'Paint', 'door_per_side',              'EA',  55,    95,   '{"type":"flat"}', 'one face of door; includes material', false),
  (av, 'Paint', 'cabinet_spray',              'LS',  1500,  3800, '{"type":"flat"}', 'kitchen cabinet spray refinish; includes primer/topcoat', false),
  (av, 'Paint', 'exterior_siding',            'SF',  2.00,  3.50, '{"type":"flat"}', 'per SF surface area; includes material', false),
  (av, 'Paint', 'exterior_door',              'EA',  150,   300,  '{"type":"flat"}', 'exterior door + frame; includes material', false)
ON CONFLICT ON CONSTRAINT rate_book_labor_natural_key DO NOTHING;

-- ── ELECTRICAL (trade_taxonomy: 'Electrical') ────────────────
-- All sub-contracted. Rates are fully installed sub costs.
INSERT INTO rate_book_labor (tenant_id, trade, line_item, unit, rate_low, rate_high, rate_data, notes, vetted) VALUES
  (av, 'Electrical', 'panel_upgrade_100_200a',  'LS', 2200, 3800, '{"type":"flat"}', 'service upgrade 100A to 200A; sub cost', false),
  (av, 'Electrical', 'subpanel_100a_new',       'LS', 1200, 2200, '{"type":"flat"}', 'new 100A sub-panel installed; sub cost', false),
  (av, 'Electrical', 'circuit_standard_120v',   'EA', 175,  275,  '{"type":"flat"}', 'standard 120V circuit add; sub cost', false),
  (av, 'Electrical', 'circuit_240v',            'EA', 300,  550,  '{"type":"flat"}', '240V circuit add (range, dryer, etc.); sub cost', false),
  (av, 'Electrical', 'full_rewire',             'SF', 4.00, 7.50, '{"type":"flat"}', 'full rewire per SF living area; sub cost', false),
  (av, 'Electrical', 'outlet_switch',           'EA', 90,   160,  '{"type":"flat"}', 'outlet or switch add/replace; sub cost', false),
  (av, 'Electrical', 'gfci_outlet',             'EA', 110,  200,  '{"type":"flat"}', 'GFCI outlet; sub cost', false),
  (av, 'Electrical', 'recessed_light_new',      'EA', 80,   160,  '{"type":"flat"}', 'new circuit required; sub cost', false),
  (av, 'Electrical', 'recessed_light_retrofit', 'EA', 100,  200,  '{"type":"flat"}', 'existing circuit, new can; sub cost', false),
  (av, 'Electrical', 'ceiling_fan_install',     'EA', 150,  350,  '{"type":"flat"}', 'includes wiring; sub cost', false),
  (av, 'Electrical', 'fixture_standard',        'EA', 100,  250,  '{"type":"flat"}', 'light fixture supply+install; sub cost', false),
  (av, 'Electrical', 'ev_charger_level2',       'EA', 700,  1400, '{"type":"flat"}', 'Level 2 EV charger installed; sub cost', false),
  (av, 'Electrical', 'smoke_co_detector',       'EA', 90,   150,  '{"type":"flat"}', 'hardwired with battery backup; sub cost', false),
  (av, 'Electrical', 'generator_hookup',        'LS', 1500, 4000, '{"type":"flat"}', 'transfer switch + hookup; sub cost', false)
ON CONFLICT ON CONSTRAINT rate_book_labor_natural_key DO NOTHING;

-- ── PLUMBING (trade_taxonomy: 'Plumbing') ────────────────────
-- All sub-contracted. Rates are fully installed sub costs.
INSERT INTO rate_book_labor (tenant_id, trade, line_item, unit, rate_low, rate_high, rate_data, notes, vetted) VALUES
  (av, 'Plumbing', 'fixture_roughin',         'EA', 400,  650,  '{"type":"flat"}', 'single fixture drain+supply+vent rough-in; sub cost', false),
  (av, 'Plumbing', 'bath_roughin_3fixture',   'LS', 2000, 3500, '{"type":"flat"}', 'full new bath rough-in (3 fixtures); sub cost', false),
  (av, 'Plumbing', 'toilet_standard',         'EA', 300,  500,  '{"type":"flat"}', 'standard round; supply+install; sub cost', false),
  (av, 'Plumbing', 'toilet_elongated',        'EA', 350,  600,  '{"type":"flat"}', 'elongated; supply+install; sub cost', false),
  (av, 'Plumbing', 'vanity_sink_install',     'EA', 250,  500,  '{"type":"flat"}', 'vanity sink supply+install; sub cost', false),
  (av, 'Plumbing', 'kitchen_sink_install',    'EA', 300,  600,  '{"type":"flat"}', 'kitchen sink supply+install; sub cost', false),
  (av, 'Plumbing', 'shower_valve_install',    'EA', 400,  700,  '{"type":"flat"}', 'shower valve + trim supply+install; sub cost', false),
  (av, 'Plumbing', 'tub_shower_install',      'EA', 500,  900,  '{"type":"flat"}', 'tub/shower combo supply+install; sub cost', false),
  (av, 'Plumbing', 'freestanding_tub_labor',  'EA', 800,  2000, '{"type":"flat"}', 'freestanding soaker install labor; sub cost', false),
  (av, 'Plumbing', 'water_heater_40gal_gas',  'EA', 900,  1400, '{"type":"flat"}', '40-gal gas WH supply+install; sub cost', false),
  (av, 'Plumbing', 'water_heater_50gal_gas',  'EA', 1100, 1700, '{"type":"flat"}', '50-gal gas WH supply+install; sub cost', false),
  (av, 'Plumbing', 'water_heater_tankless',   'EA', 2200, 3800, '{"type":"flat"}', 'tankless gas WH supply+install; sub cost', false),
  (av, 'Plumbing', 'expansion_tank',          'EA', 200,  350,  '{"type":"flat"}', 'expansion tank; sub cost', false),
  (av, 'Plumbing', 'gas_line',                'LF', 25,   45,   '{"type":"flat"}', 'new gas line per LF; sub cost', false),
  (av, 'Plumbing', 'repipe_pex',              'LF', 20,   40,   '{"type":"flat"}', 'PEX repipe per LF; sub cost', false)
ON CONFLICT ON CONSTRAINT rate_book_labor_natural_key DO NOTHING;

-- ── HVAC (trade_taxonomy: 'HVAC') ────────────────────────────
-- All sub-contracted. Rates are fully installed sub costs.
INSERT INTO rate_book_labor (tenant_id, trade, line_item, unit, rate_low, rate_high, rate_data, notes, vetted) VALUES
  (av, 'HVAC', 'central_split_2ton',    'LS', 5000, 7500,  '{"type":"flat"}', 'furnace + AC 2-ton; sub cost', false),
  (av, 'HVAC', 'central_split_3ton',    'LS', 6000, 9000,  '{"type":"flat"}', 'furnace + AC 3-ton; sub cost', false),
  (av, 'HVAC', 'central_split_4ton',    'LS', 7500, 11000, '{"type":"flat"}', 'furnace + AC 4-ton; sub cost', false),
  (av, 'HVAC', 'furnace_80pct',         'LS', 2200, 3800,  '{"type":"flat"}', '80% AFUE furnace only; sub cost', false),
  (av, 'HVAC', 'ac_condenser_3ton',     'LS', 3500, 5500,  '{"type":"flat"}', '3-ton AC condenser only; sub cost', false),
  (av, 'HVAC', 'coil_replacement',      'LS', 800,  1800,  '{"type":"flat"}', 'evaporator coil; sub cost', false),
  (av, 'HVAC', 'minisplit_1zone',        'LS', 2800, 4500,  '{"type":"flat"}', 'single-zone mini-split supply+install; sub cost', false),
  (av, 'HVAC', 'ductwork_new',          'SF', 3.50, 6.00,  '{"type":"flat"}', 'new ductwork per SF conditioned area; sub cost', false),
  (av, 'HVAC', 'ductwork_replace',      'SF', 4.00, 8.00,  '{"type":"flat"}', 'duct replacement per SF; sub cost', false),
  (av, 'HVAC', 'aeroseal',              'LS', 1200, 2500,  '{"type":"flat"}', 'Aeroseal duct sealing; sub cost', false),
  (av, 'HVAC', 'thermostat',            'EA', 300,  600,   '{"type":"flat"}', 'smart thermostat supply+install; sub cost', false),
  (av, 'HVAC', 'humidifier',            'EA', 500,  1200,  '{"type":"flat"}', 'whole-house humidifier; sub cost', false),
  (av, 'HVAC', 'erv_hrv',              'EA', 2500, 4500,  '{"type":"flat"}', 'energy/heat recovery ventilator; sub cost', false)
ON CONFLICT ON CONSTRAINT rate_book_labor_natural_key DO NOTHING;

-- ── FRAMING (trade_taxonomy: 'Framing') ──────────────────────
-- ALL rates are combined labor + material. Tagged needs_split = true.
-- Kalin decomposes at Rate Book review to extract labor-only numbers.
INSERT INTO rate_book_labor (tenant_id, trade, line_item, unit, rate_low, rate_high, rate_data, notes, vetted) VALUES
  (av, 'Framing', 'wall_framing_2x4',           'SF',  9.00,  13.00, '{"type":"flat","needs_split":true}', '2x4 16"OC per SF floor plan; L+M combined', false),
  (av, 'Framing', 'wall_framing_2x6',           'SF',  11.00, 15.00, '{"type":"flat","needs_split":true}', '2x6 16"OC; L+M combined', false),
  (av, 'Framing', 'floor_system_tji',           'SF',  9.00,  13.00, '{"type":"flat","needs_split":true}', 'TJI engineered joists; L+M combined', false),
  (av, 'Framing', 'floor_system_dimensional',   'SF',  7.00,  11.00, '{"type":"flat","needs_split":true}', 'dimensional lumber floor system; L+M combined', false),
  (av, 'Framing', 'roof_framing_conventional',  'SF',  8.00,  12.00, '{"type":"flat","needs_split":true}', 'per SF roof footprint; L+M combined', false),
  (av, 'Framing', 'roof_framing_trusses',       'SF',  6.00,  9.00,  '{"type":"flat","needs_split":true}', 'engineered trusses; L+M combined', false),
  (av, 'Framing', 'full_addition',              'SF',  18.00, 28.00, '{"type":"flat","needs_split":true}', 'walls + floor + roof per SF of addition; L+M combined', false),
  (av, 'Framing', 'lvl_beam',                   'LF',  35,    65,    '{"type":"flat","needs_split":true}', 'LVL beam installed; L+M combined', false),
  (av, 'Framing', 'load_bearing_header',        'EA',  250,   500,   '{"type":"flat","needs_split":true}', 'doubled 2x10; L+M combined', false),
  (av, 'Framing', 'steel_beam',                 'LF',  55,    90,    '{"type":"flat","needs_split":true}', 'steel beam installed; L+M combined', false),
  (av, 'Framing', 'column_post',                'EA',  150,   300,   '{"type":"flat","needs_split":true}', '4x4-6x6 post; L+M combined', false),
  (av, 'Framing', 'deck_groundlevel_pt',        'SF',  12,    18,    '{"type":"flat","needs_split":true}', 'ground-level PT lumber deck; L+M combined', false),
  (av, 'Framing', 'deck_elevated',              'SF',  18,    28,    '{"type":"flat","needs_split":true}', 'elevated or complex deck; L+M combined', false)
ON CONFLICT ON CONSTRAINT rate_book_labor_natural_key DO NOTHING;

-- ── INSULATION (trade_taxonomy: 'Insulation') ─────────────────
-- ALL rates are installed (labor + material combined). Tagged needs_split = true.
INSERT INTO rate_book_labor (tenant_id, trade, line_item, unit, rate_low, rate_high, rate_data, notes, vetted) VALUES
  (av, 'Insulation', 'batt_r15_2x4_wall',         'SF', 0.85, 1.20, '{"type":"flat","needs_split":true}', 'R-15 fiberglass/mineral wool 2x4 wall; L+M combined', false),
  (av, 'Insulation', 'batt_r21_2x6_fiberglass',   'SF', 1.00, 1.50, '{"type":"flat","needs_split":true}', 'R-21 2x6 fiberglass; L+M combined', false),
  (av, 'Insulation', 'batt_r21_2x6_rockwool',     'SF', 1.30, 1.80, '{"type":"flat","needs_split":true}', 'R-21 2x6 Rockwool; L+M combined', false),
  (av, 'Insulation', 'batt_r38_attic',             'SF', 1.60, 2.30, '{"type":"flat","needs_split":true}', 'R-38 attic batt; L+M combined', false),
  (av, 'Insulation', 'blown_fiberglass_r38',       'SF', 1.40, 2.00, '{"type":"flat","needs_split":true}', 'blown-in fiberglass attic R-38; L+M combined', false),
  (av, 'Insulation', 'blown_fiberglass_r49',       'SF', 1.80, 2.60, '{"type":"flat","needs_split":true}', 'blown-in fiberglass attic R-49; L+M combined', false),
  (av, 'Insulation', 'blown_cellulose_r38',        'SF', 1.20, 1.80, '{"type":"flat","needs_split":true}', 'blown-in cellulose attic R-38; L+M combined', false),
  (av, 'Insulation', 'dense_pack_wall_retrofit',   'SF', 2.50, 4.00, '{"type":"flat","needs_split":true}', 'dense-pack wall retrofit; L+M combined', false),
  (av, 'Insulation', 'spray_foam_opencell_3_5in',  'SF', 1.80, 2.60, '{"type":"flat","needs_split":true}', 'open-cell 3.5" walls/roof deck; L+M combined', false),
  (av, 'Insulation', 'spray_foam_closedcell_2in',  'SF', 2.80, 3.80, '{"type":"flat","needs_split":true}', 'closed-cell 2" R-12 + vapor barrier; L+M combined', false),
  (av, 'Insulation', 'spray_foam_closedcell_3in',  'SF', 3.50, 4.80, '{"type":"flat","needs_split":true}', 'closed-cell 3" crawl/rim joist; L+M combined', false),
  (av, 'Insulation', 'rim_joist_foam',             'LF', 1.50, 2.50, '{"type":"flat","needs_split":true}', 'rim joist spray foam; L+M combined', false),
  (av, 'Insulation', 'crawl_encapsulation',        'SF', 2.50, 5.00, '{"type":"flat","needs_split":true}', 'full crawl space encapsulation; L+M combined', false)
ON CONFLICT ON CONSTRAINT rate_book_labor_natural_key DO NOTHING;

-- ── ROOFING (trade_taxonomy: 'Roofing') ──────────────────────
-- Tearoff, underlayment, gutters = separable labor rates.
-- Shingle all-in and flat roof systems = L+M combined (needs_split).
-- Unit: 'sq' = roofing square = 100 SF roof surface.
INSERT INTO rate_book_labor (tenant_id, trade, line_item, unit, rate_low, rate_high, rate_data, notes, vetted) VALUES
  (av, 'Roofing', 'tearoff_1layer',             'sq',  80,    110,  '{"type":"flat"}',              'tear-off + disposal 1 layer; labor only', false),
  (av, 'Roofing', 'tearoff_add_2nd_layer',      'sq',  40,    60,   '{"type":"flat"}',              'add-on for 2nd shingle layer removal', false),
  (av, 'Roofing', 'underlayment_synthetic',     'sq',  15,    22,   '{"type":"flat","needs_split":true}', 'synthetic underlayment supply+install', false),
  (av, 'Roofing', 'ice_water_shield',           'sq',  30,    45,   '{"type":"flat","needs_split":true}', 'eaves + valleys; supply+install', false),
  (av, 'Roofing', 'drip_edge',                  'LF',  2.50,  3.75, '{"type":"flat","needs_split":true}', 'aluminum drip edge supply+install', false),
  (av, 'Roofing', 'shingle_30yr_all_in',        'sq',  420,   530,  '{"type":"flat","needs_split":true}', 'architectural 30-yr mid-grade ALL-IN; L+M combined', false),
  (av, 'Roofing', 'shingle_50yr_all_in',        'sq',  560,   720,  '{"type":"flat","needs_split":true}', 'premium 50-yr full ice barrier ALL-IN; L+M combined', false),
  (av, 'Roofing', 'tpo_60mil',                  'SF',  7.00,  10.00,'{"type":"flat","needs_split":true}', 'TPO membrane fully adhered; L+M combined', false),
  (av, 'Roofing', 'modified_bitumen',           'SF',  5.50,  8.00, '{"type":"flat","needs_split":true}', '2-ply torch-down; L+M combined', false),
  (av, 'Roofing', 'epdm_rubber',                'SF',  6.00,  9.00, '{"type":"flat","needs_split":true}', 'EPDM fully adhered; L+M combined', false),
  (av, 'Roofing', 'gutter_5in_kstyle',          'LF',  8.00,  12.00,'{"type":"flat","needs_split":true}', '5" K-style aluminum; supply+install', false),
  (av, 'Roofing', 'gutter_6in_kstyle',          'LF',  10.00, 15.00,'{"type":"flat","needs_split":true}', '6" K-style aluminum; supply+install', false),
  (av, 'Roofing', 'downspout',                  'LF',  5.00,  9.00, '{"type":"flat","needs_split":true}', 'downspout supply+install', false),
  (av, 'Roofing', 'leaf_guard',                 'LF',  6.00,  12.00,'{"type":"flat","needs_split":true}', 'gutter leaf guard supply+install', false),
  (av, 'Roofing', 'chimney_reflash',            'EA',  450,   750,  '{"type":"flat"}',              'chimney reflashing; labor only', false)
ON CONFLICT ON CONSTRAINT rate_book_labor_natural_key DO NOTHING;

-- ── TILE — labor/demo/prep rows (trade_taxonomy: 'Tile') ─────
-- Installed tile rates (shower_tile, backsplash, etc.) go to rate_book_material.
INSERT INTO rate_book_labor (tenant_id, trade, line_item, unit, rate_low, rate_high, rate_data, notes, vetted) VALUES
  (av, 'Tile', 'tile_demo_floor',         'SF', 2.50, 4.50, '{"type":"flat"}', 'remove existing floor tile', false),
  (av, 'Tile', 'tile_demo_wall',          'SF', 3.00, 5.50, '{"type":"flat"}', 'remove tile wall / shower', false),
  (av, 'Tile', 'schluter_membrane',       'SF', 1.50, 2.50, '{"type":"flat","needs_split":true}', 'Schluter/Ditra membrane supply+install', false),
  (av, 'Tile', 'regrouting',              'SF', 3.00, 6.00, '{"type":"flat"}', 'regrout existing tile; labor only', false),
  (av, 'Tile', 'shower_pan_mudbed',       'LS', 1200, 2800, '{"type":"flat","needs_split":true}', 'mud bed + waterproof membrane + floor tile; L+M combined', false),
  (av, 'Tile', 'tiled_niche',             'EA', 250,  550,  '{"type":"flat","needs_split":true}', 'shower niche supply+install; L+M combined', false)
ON CONFLICT ON CONSTRAINT rate_book_labor_natural_key DO NOTHING;

-- ── FLOORING — labor/prep rows (trade_taxonomy: 'Flooring') ──
-- Installed flooring (LVP, carpet, hardwood, tile) goes to rate_book_material.
INSERT INTO rate_book_labor (tenant_id, trade, line_item, unit, rate_low, rate_high, rate_data, notes, vetted) VALUES
  (av, 'Flooring', 'remove_existing_flooring',  'SF', 0.85, 2.00, '{"type":"flat"}', 'remove existing flooring; labor only', false),
  (av, 'Flooring', 'self_leveling_underlayment','SF', 2.00, 4.00, '{"type":"flat","needs_split":true}', 'self-leveler supply+install; when needed', false),
  (av, 'Flooring', 'subfloor_repair',           'SF', 4.00, 8.00, '{"type":"flat","needs_split":true}', 'subfloor sheathing replacement; L+M combined', false),
  (av, 'Flooring', 'hardwood_refinish',         'SF', 3.50, 5.50, '{"type":"flat"}', 'sand + 3 finish coats; labor dominant', false),
  (av, 'Flooring', 'transition_threshold',      'EA', 25,   75,   '{"type":"flat","needs_split":true}', 'transition strip supply+install', false)
ON CONFLICT ON CONSTRAINT rate_book_labor_natural_key DO NOTHING;

-- ── CABINETS / VANITIES — labor rows (trade_taxonomy: 'Cabinets / vanities') ─
-- Supply+install all-in rates. Tagged needs_split = true so Kalin can extract
-- labor-only at Rate Book review. Supply prices also go to rate_book_material.
INSERT INTO rate_book_labor (tenant_id, trade, line_item, unit, rate_low, rate_high, rate_data, notes, vetted) VALUES
  (av, 'Cabinets / vanities', 'cabinet_stock_installed',      'LF', 110, 180, '{"type":"flat","needs_split":true}', 'stock cabinets supply+install; L+M combined', false),
  (av, 'Cabinets / vanities', 'cabinet_semi_custom_installed','LF', 190, 360, '{"type":"flat","needs_split":true}', 'semi-custom supply+install; L+M combined', false),
  (av, 'Cabinets / vanities', 'cabinet_custom_installed',     'LF', 380, 700, '{"type":"flat","needs_split":true}', 'custom KC shop supply+install; L+M combined', false)
ON CONFLICT ON CONSTRAINT rate_book_labor_natural_key DO NOTHING;

-- ── TRIM / CARPENTRY — labor rows (trade_taxonomy: 'Trim / carpentry') ────
INSERT INTO rate_book_labor (tenant_id, trade, line_item, unit, rate_low, rate_high, rate_data, notes, vetted) VALUES
  (av, 'Trim / carpentry', 'baseboard_painted',        'LF',  3.50,  5.50,  '{"type":"flat","needs_split":true}', 'base trim supply+install painted; L+M combined', false),
  (av, 'Trim / carpentry', 'crown_molding',            'LF',  6.00,  12.00, '{"type":"flat","needs_split":true}', 'crown supply+install; L+M combined', false),
  (av, 'Trim / carpentry', 'window_door_casing',       'LF',  3.00,  5.50,  '{"type":"flat","needs_split":true}', 'casing supply+install; L+M combined', false),
  (av, 'Trim / carpentry', 'builtin_shelving',         'LF',  150,   400,   '{"type":"flat","needs_split":true}', 'built-in bookcase/entertainment per LF; L+M combined', false),
  (av, 'Trim / carpentry', 'closet_standard',          'EA',  500,   2000,  '{"type":"flat","needs_split":true}', 'standard closet system; L+M combined', false),
  (av, 'Trim / carpentry', 'closet_custom',            'EA',  1500,  6000,  '{"type":"flat","needs_split":true}', 'custom closet system; L+M combined', false)
ON CONFLICT ON CONSTRAINT rate_book_labor_natural_key DO NOTHING;

-- ── WINDOWS / DOORS — labor-only install rows ─────────────────
-- ⚠️ E1 MISMATCH: 'Windows / doors' has NO match in trade_taxonomy.parent_trade.
-- These rows are seeded with this string and flagged. Action needed before
-- wiring the estimator: add 'Windows / doors' to trade_taxonomy or remap.
-- Supply+install all-in prices go to rate_book_material (no trade key there).
-- Garage door opener uses trade='Garage door' which IS in trade_taxonomy.
INSERT INTO rate_book_labor (tenant_id, trade, line_item, unit, rate_low, rate_high, rate_data, notes, vetted) VALUES
  (av, 'Windows / doors', 'window_install_existing_opening', 'EA', 150, 300, '{"type":"flat"}', 'labor only, existing framing; ⚠️ trade not in trade_taxonomy', false),
  (av, 'Windows / doors', 'window_install_new_opening',      'EA', 350, 600, '{"type":"flat","needs_split":true}', 'includes framing new opening; ⚠️ trade not in trade_taxonomy', false),
  (av, 'Garage door',     'garage_door_opener_install',      'EA', 350, 600, '{"type":"flat"}', 'opener supply+install; trade=Garage door per trade_taxonomy', false)
ON CONFLICT ON CONSTRAINT rate_book_labor_natural_key DO NOTHING;

-- ── CONCRETE (trade_taxonomy: 'Concrete') ────────────────────
-- All sub-contracted installed rates. All combined L+M.
INSERT INTO rate_book_labor (tenant_id, trade, line_item, unit, rate_low, rate_high, rate_data, notes, vetted) VALUES
  (av, 'Concrete', 'patio_unreinforced',   'SF', 6.00,  8.50,  '{"type":"flat","needs_split":true}', '4" unreinforced slab; sub cost; L+M combined', false),
  (av, 'Concrete', 'patio_reinforced',     'SF', 7.50,  10.00, '{"type":"flat","needs_split":true}', '4" with rebar; sub cost; L+M combined', false),
  (av, 'Concrete', 'garage_floor',         'SF', 7.00,  10.00, '{"type":"flat","needs_split":true}', '4" reinforced; sub cost; L+M combined', false),
  (av, 'Concrete', 'driveway',             'SF', 8.00,  12.00, '{"type":"flat","needs_split":true}', 'sub cost; L+M combined', false),
  (av, 'Concrete', 'sidewalk',             'SF', 7.00,  10.00, '{"type":"flat","needs_split":true}', 'sub cost; L+M combined', false),
  (av, 'Concrete', 'strip_footing',        'LF', 22,    35,    '{"type":"flat","needs_split":true}', 'sub cost; L+M combined', false),
  (av, 'Concrete', 'foundation_wall_8in',  'LF', 40,    60,    '{"type":"flat","needs_split":true}', '8" poured wall; sub cost; L+M combined', false),
  (av, 'Concrete', 'icf_foundation',       'LF', 65,    95,    '{"type":"flat","needs_split":true}', 'ICF; sub cost; L+M combined', false),
  (av, 'Concrete', 'basement_floor',       'SF', 5.00,  7.00,  '{"type":"flat","needs_split":true}', '4" basement slab; sub cost; L+M combined', false),
  (av, 'Concrete', 'steps',                'EA', 350,   600,   '{"type":"flat","needs_split":true}', 'per concrete step; sub cost; L+M combined', false)
ON CONFLICT ON CONSTRAINT rate_book_labor_natural_key DO NOTHING;


-- ═══════════════════════════════════════════════════════════
-- RATE_BOOK_MATERIAL
-- ai_drafted = true, kalin_adjusted = false for all seeded rows
-- ═══════════════════════════════════════════════════════════

-- ── FLOORING (installed material+labor combined prices) ───────
INSERT INTO rate_book_material (tenant_id, category, description, unit, tier_low_min, tier_low_max, tier_mid_min, tier_mid_max, tier_hi_min, tier_hi_max, tier_low_label, tier_mid_label, tier_hi_label, notes, ai_drafted) VALUES
  (av, 'lvp',           'LVP Flooring (installed)',      'SF', 3.50, 5.00, 4.50, 6.50, 6.00, 9.00,  'Builder-grade', 'Mid 6-8mm', 'Premium 12mm waterproof', 'includes labor + basic prep; all-in installed', true),
  (av, 'hardwood',      'Hardwood Flooring (installed)', 'SF', null, null, 7.00, 11.00,8.50, 14.00, 'Budget', 'Engineered 3/4"', 'Solid 3/4" nail-down', 'includes labor + prep; no budget tier available', true),
  (av, 'carpet',        'Carpet (installed)',             'SF', 2.50, 3.75, 3.75, 5.50, 5.50, 9.00, 'Budget', 'Mid-grade', 'Premium', 'carpet + pad + labor; all-in installed', true),
  (av, 'tile_floor',    'Floor Tile (installed)',         'SF', 6.00, 9.50, 7.50, 12.00,12.00,22.00,'Ceramic', 'Porcelain', 'Natural Stone', 'includes labor + setting materials; all-in installed', true)
ON CONFLICT ON CONSTRAINT rate_book_material_natural_key DO NOTHING;

-- ── TILE — shower and wall tile (installed, material-dominant) ─
INSERT INTO rate_book_material (tenant_id, category, description, unit, tier_low_min, tier_low_max, tier_mid_min, tier_mid_max, tier_hi_min, tier_hi_max, tier_low_label, tier_mid_label, tier_hi_label, notes, ai_drafted) VALUES
  (av, 'shower_tile',   'Shower Tile (installed)',        'SF', 12.00, 18.00, 16.00, 25.00, 22.00, 38.00, 'Ceramic Subway', 'Porcelain 12x24', 'Natural Stone Marble', 'labor + material + waterproofing; all-in installed', true),
  (av, 'bath_floor_tile','Bathroom Floor Tile (installed)','SF', 6.50, 10.00, 8.00,  13.00, null,  null,  'Ceramic', 'Porcelain', 'Premium', 'labor + material; all-in installed', true),
  (av, 'heated_floor',  'Heated Floor Mat under Tile',   'SF', null,  null,  9.00,  14.00, null,  null,  'Budget', 'Standard Electric Mat', 'Premium', 'supply+install mat under tile; single tier', true),
  (av, 'backsplash',    'Backsplash (installed)',         'SF', 14.00, 22.00, null,  null,  20.00, 35.00, 'Standard Tile', 'Mid', 'Glass/Specialty', 'labor + material; all-in installed; no mid tier', true)
ON CONFLICT ON CONSTRAINT rate_book_material_natural_key DO NOTHING;

-- ── CABINETS / COUNTERTOPS / VANITIES (supply+install all-in) ─
INSERT INTO rate_book_material (tenant_id, category, description, unit, tier_low_min, tier_low_max, tier_mid_min, tier_mid_max, tier_hi_min, tier_hi_max, tier_low_label, tier_mid_label, tier_hi_label, notes, ai_drafted) VALUES
  (av, 'cabinet',         'Kitchen Cabinets (installed)',    'LF', 110, 180, 190, 360, 380, 700, 'Stock',     'Semi-Custom', 'Custom KC Shop', 'supply+install; all-in per LF base+upper combined', true),
  (av, 'countertop',      'Countertop (installed)',          'LF', 28,  48,  55,  105, 80,  150, 'Laminate',  'Granite/Quartz','Marble',       'supply+install; laminate/stone/marble tiers', true),
  (av, 'countertop_butcherblock','Butcher Block Countertop (installed)','LF',50, 90, null, null, null, null, 'Standard', 'Mid', 'Premium', 'supply+install; single price band', true),
  (av, 'vanity',          'Bathroom Vanity (installed)',     'EA', 350, 700, 700, 1800,1500, 4500,'Stock 30-36"','Semi 48-60"','Custom',       'supply+install all-in', true)
ON CONFLICT ON CONSTRAINT rate_book_material_natural_key DO NOTHING;

-- ── WINDOWS / DOORS (supply+install all-in prices) ────────────
INSERT INTO rate_book_material (tenant_id, category, description, unit, tier_low_min, tier_low_max, tier_mid_min, tier_mid_max, tier_hi_min, tier_hi_max, tier_low_label, tier_mid_label, tier_hi_label, notes, ai_drafted) VALUES
  (av, 'window',          'Window (supply+install)',         'EA', 400,  700,  600,  950,  1800, 4500, 'Vinyl Double-Hung', 'Casement', 'Bay/Bow',      'all-in installed; egress separate', true),
  (av, 'window_egress',   'Egress Window (new opening)',     'EA', null, null, 2500, 5000, null, null, 'Budget', 'Standard', 'Premium', 'includes new opening + window well; single tier range', true),
  (av, 'door_exterior',   'Exterior Door (supply+install)',  'EA', 700,  1100, 900,  1500, 1500, 3500, 'Steel Entry', 'Fiberglass Std', 'Fiberglass Premium', 'all-in; French/sliding separate', true),
  (av, 'door_exterior_french','French Doors Exterior (pair)','EA',null, null, 1800, 4000, null, null, 'Budget', 'Standard', 'Premium', 'pair; supply+install', true),
  (av, 'door_sliding_glass','Sliding Glass Door (supply+install)','EA',1200,2200,null,null,2500,4500,'6ft Vinyl', 'Mid', '8ft Premium', 'supply+install; no mid tier listed', true),
  (av, 'door_garage',     'Garage Door (supply+install)',    'EA', null, null, 1200, 2000, null, null, 'Budget', '16x7 Steel Standard', 'Premium', 'single tier; opener separate line in rate_book_labor', true),
  (av, 'door_interior',   'Interior Door (supply+install)',  'EA', 250,  400,  350,  550,  600,  1500, 'Hollow Core', 'Solid Core', 'Pocket/Barn', 'prehung supply+install; bifold at low end', true)
ON CONFLICT ON CONSTRAINT rate_book_material_natural_key DO NOTHING;

-- ── DRYWALL BOARD (material only, per sheet) ──────────────────
INSERT INTO rate_book_material (tenant_id, category, description, unit, tier_low_min, tier_low_max, tier_mid_min, tier_mid_max, tier_hi_min, tier_hi_max, tier_low_label, tier_mid_label, tier_hi_label, notes, ai_drafted) VALUES
  (av, 'drywall_board', 'Drywall Board', 'sheet', null, null, 14, 18, null, null, 'Budget', 'Standard 4x8', 'Premium', '1/2" standard sheet; single price band', true)
ON CONFLICT ON CONSTRAINT rate_book_material_natural_key DO NOTHING;

-- ── PAINT (per gallon material reference) ─────────────────────
INSERT INTO rate_book_material (tenant_id, category, description, unit, tier_low_min, tier_low_max, tier_mid_min, tier_mid_max, tier_hi_min, tier_hi_max, tier_low_label, tier_mid_label, tier_hi_label, notes, ai_drafted) VALUES
  (av, 'paint_interior', 'Interior Latex Paint', 'gallon', null, null, 35, 55, null, null, 'Budget', 'Mid-grade Latex', 'Premium', 'per gallon; ~350 SF/gal 1 coat; assume 2 coats', true)
ON CONFLICT ON CONSTRAINT rate_book_material_natural_key DO NOTHING;

-- ── DUMPSTERS / HAULING (material/rental category) ────────────
INSERT INTO rate_book_material (tenant_id, category, description, unit, tier_low_min, tier_low_max, tier_mid_min, tier_mid_max, tier_hi_min, tier_hi_max, tier_low_label, tier_mid_label, tier_hi_label, notes, ai_drafted) VALUES
  (av, 'dumpster_20yd', 'Dumpster 20-yard (7-day + dump)', 'EA', null, null, 475, 650, null, null, 'Budget', 'Standard', 'Premium', '7-day rental + dump fee; single tier', true),
  (av, 'dumpster_30yd', 'Dumpster 30-yard (7-day + dump)', 'EA', null, null, 575, 750, null, null, 'Budget', 'Standard', 'Premium', '7-day rental + dump fee; single tier', true)
ON CONFLICT ON CONSTRAINT rate_book_material_natural_key DO NOTHING;

END $$;

-- Verification counts (printed to output by apply_migration.js)
SELECT 'rate_book_labor' AS tbl, COUNT(*) AS rows FROM rate_book_labor WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'rate_book_material', COUNT(*) FROM rate_book_material WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'needs_split_labor', COUNT(*) FROM rate_book_labor WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND (rate_data->>'needs_split')::boolean = true
UNION ALL
SELECT 'windows_doors_mismatch', COUNT(*) FROM rate_book_labor WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND trade = 'Windows / doors';
