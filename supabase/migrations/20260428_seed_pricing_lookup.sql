-- Seed pricing_lookup from ai_knowledge prose entries (Avenstone KC market 2026).
-- Values extracted directly from ai_knowledge content; mid = (low+high)/2 rounded to nearest $0.25.
-- trade='general' because Avenstone is a GC. Tenant ID is the Avenstone default.
-- AI-knowledge prose parsing via edge function was evaluated and deferred; this hardcoded starter
-- set is derived verbatim from the 15 pricing ai_knowledge rows queried on 2026-04-28.

INSERT INTO pricing_lookup (tenant_id, trade, category, unit, unit_cost_low, unit_cost_mid, unit_cost_high, notes)
VALUES
  -- Demo
  ('00000000-0000-0000-0000-000000000001', 'general', 'soft_demo',               'sf',   2.50,  3.50,  4.50,  'Drywall, flooring, fixtures, cabinets — interior demo only'),
  ('00000000-0000-0000-0000-000000000001', 'general', 'full_room_gut',            'each', 800,   1650,  2500,  'Full interior gut per room, bath/kitchen, down to studs'),
  ('00000000-0000-0000-0000-000000000001', 'general', 'structural_wall_removal',  'each', 2500,  4250,  6000,  'Load-bearing wall removal with beam, includes patch'),
  ('00000000-0000-0000-0000-000000000001', 'general', 'dumpster_20yd',            'each', 475,   563,   650,   '20-yard, 7-day rental + dump fee'),
  -- Framing
  ('00000000-0000-0000-0000-000000000001', 'general', 'wall_framing_2x4',         'sf',   9.00,  11.00, 13.00, 'Per sf floor plan, labor + material, 16" OC'),
  ('00000000-0000-0000-0000-000000000001', 'general', 'wall_framing_2x6',         'sf',   11.00, 13.00, 15.00, 'Per sf floor plan, labor + material, 16" OC'),
  ('00000000-0000-0000-0000-000000000001', 'general', 'lvl_beam_install',         'lf',   35.00, 50.00, 65.00, 'LVL beam installed, labor + material'),
  -- Drywall
  ('00000000-0000-0000-0000-000000000001', 'general', 'drywall_half_inch',        'sf',   1.25,  1.55,  1.85,  '1/2" Level 4 paint-ready, supply + hang + finish'),
  ('00000000-0000-0000-0000-000000000001', 'general', 'drywall_patch_small',      'each', 150,   225,   300,   'Patch under 12"'),
  ('00000000-0000-0000-0000-000000000001', 'general', 'drywall_patch_medium',     'each', 250,   375,   500,   'Patch 12–24"'),
  -- Painting
  ('00000000-0000-0000-0000-000000000001', 'general', 'interior_paint_walls',     'sf',   1.60,  2.10,  2.60,  'Walls only, prime + 2 coats, per sf wall area'),
  ('00000000-0000-0000-0000-000000000001', 'general', 'full_room_repaint',        'sf',   2.75,  3.50,  4.25,  'Walls + ceiling + trim, per sf floor area'),
  ('00000000-0000-0000-0000-000000000001', 'general', 'exterior_paint_full',      'sf',   3.00,  4.25,  5.50,  'Siding + trim + soffits, per sf wall area'),
  -- Flooring
  ('00000000-0000-0000-0000-000000000001', 'general', 'lvp_mid_grade',            'sf',   4.50,  5.50,  6.50,  'Mid-grade LVP 6–8mm, supply + install'),
  ('00000000-0000-0000-0000-000000000001', 'general', 'hardwood_engineered',      'sf',   7.00,  9.00,  11.00, 'Engineered hardwood 3/4", supply + install'),
  ('00000000-0000-0000-0000-000000000001', 'general', 'hardwood_refinish',        'sf',   3.50,  4.50,  5.50,  'Sand + 3 coats, existing hardwood'),
  ('00000000-0000-0000-0000-000000000001', 'general', 'carpet_mid_grade',         'sf',   3.75,  4.63,  5.50,  'Mid-grade carpet + pad, supply + install'),
  ('00000000-0000-0000-0000-000000000001', 'general', 'floor_remove',             'sf',   0.85,  1.43,  2.00,  'Remove existing flooring, haul included'),
  -- Tile
  ('00000000-0000-0000-0000-000000000001', 'general', 'shower_tile_ceramic',      'sf',   12.00, 15.00, 18.00, 'Ceramic subway, labor + material, installed'),
  ('00000000-0000-0000-0000-000000000001', 'general', 'shower_tile_porcelain',    'sf',   16.00, 20.50, 25.00, 'Porcelain large format 12x24, labor + material'),
  ('00000000-0000-0000-0000-000000000001', 'general', 'shower_tile_stone',        'sf',   22.00, 30.00, 38.00, 'Natural stone marble, labor + material'),
  ('00000000-0000-0000-0000-000000000001', 'general', 'bathroom_floor_porcelain', 'sf',   8.00,  10.50, 13.00, 'Porcelain bathroom floor tile, labor + material'),
  ('00000000-0000-0000-0000-000000000001', 'general', 'kitchen_backsplash',       'sf',   14.00, 18.00, 22.00, 'Standard tile backsplash, labor + material'),
  -- Cabinets & Millwork
  ('00000000-0000-0000-0000-000000000001', 'general', 'vanity_stock',             'each', 350,   525,   700,   'Stock vanity 30–36", supply + install'),
  ('00000000-0000-0000-0000-000000000001', 'general', 'vanity_semi_custom',       'each', 700,   1250,  1800,  'Semi-custom vanity 48–60", supply + install'),
  ('00000000-0000-0000-0000-000000000001', 'general', 'kitchen_cabinets_stock',   'lf',   110,   145,   180,   'Stock kitchen cabinets installed, per LF base+upper combined'),
  ('00000000-0000-0000-0000-000000000001', 'general', 'countertop_quartz',        'lf',   60.00, 82.50, 105,   'Quartz countertop installed, per LF'),
  ('00000000-0000-0000-0000-000000000001', 'general', 'countertop_laminate',      'lf',   28.00, 38.00, 48.00, 'Laminate Formica countertop installed, per LF'),
  -- Plumbing (sub cost, fully installed)
  ('00000000-0000-0000-0000-000000000001', 'general', 'toilet_install',           'each', 300,   400,   500,   'Standard toilet, fully installed sub cost'),
  ('00000000-0000-0000-0000-000000000001', 'general', 'vanity_sink_faucet',       'each', 250,   375,   500,   'Vanity sink + faucet, fully installed sub cost'),
  ('00000000-0000-0000-0000-000000000001', 'general', 'shower_valve_trim',        'each', 400,   550,   700,   'Shower valve + trim Moen/Delta, fully installed sub cost'),
  ('00000000-0000-0000-0000-000000000001', 'general', 'water_heater_40gal_gas',   'each', 900,   1150,  1400,  '40-gal natural gas water heater, fully installed sub cost')
ON CONFLICT (tenant_id, trade, category) DO NOTHING;
