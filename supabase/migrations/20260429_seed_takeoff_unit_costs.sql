-- 2026-04-29 — Platform-default takeoff_unit_costs seed.
-- 52 rows have base_rate cited from ai_knowledge entries.
-- 7 rows have base_rate=NULL by design — wizard prompts rep to fill
-- in, rep is accountable for the number. Do NOT replace NULL with
-- derived estimates in future migrations. AI never invents rates
-- without ai_knowledge citation.

INSERT INTO takeoff_unit_costs
  (tenant_id, room_type, trade, unit, base_rate, multipliers, notes)
VALUES

-- ============================================================
-- BATHROOM (14 rows)
-- ============================================================
(NULL, 'bathroom', 'Cabinets / vanities - Install', 'lump', 525.00,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.30}'::jsonb,
  'Vanity install labor only — vanity unit allowance separate. ai_knowledge d89dd17e'),

(NULL, 'bathroom', 'Cleanup', 'lump', NULL,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.30}'::jsonb,
  'REP MUST ENTER — no platform default. AI not authorized to invent number without citation.'),

(NULL, 'bathroom', 'Demo', 'sf', 3.50,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.30}'::jsonb,
  'Soft demo $2.50-4.50/sf. ai_knowledge 864e4b80'),

(NULL, 'bathroom', 'Drywall - Hang', 'sf', 0.47,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.30}'::jsonb,
  'Hang only labor+material $0.38-0.55/sf. ai_knowledge 9bd7a2d1'),

(NULL, 'bathroom', 'Drywall - Tape / mud / texture', 'sf', 0.68,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.15}'::jsonb,
  'Tape mud finish L4 $0.55-0.80/sf. ai_knowledge 9bd7a2d1'),

(NULL, 'bathroom', 'Electrical - Finish', 'each', 125.00,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.30}'::jsonb,
  'Per-fixture. Rep enters count. ai_knowledge 186e6296'),

(NULL, 'bathroom', 'Electrical - Rough-in', 'each', 225.00,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.30}'::jsonb,
  'Standard 15/20A circuit $175-275 each. ai_knowledge 186e6296'),

(NULL, 'bathroom', 'Flooring - LVP', 'sf', 5.50,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.15}'::jsonb,
  'Mid-grade LVP $4.50-6.50/sf installed. ai_knowledge cc8b8278'),

(NULL, 'bathroom', 'Paint - Interior', 'sf', 3.50,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.15}'::jsonb,
  'Full room repaint $2.75-4.25/sf floor area. ai_knowledge 672b3e0f'),

(NULL, 'bathroom', 'Plumbing - Finish / fixtures', 'each', 475.00,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.30}'::jsonb,
  'Per-fixture finish. Rep enters fixture count. ai_knowledge 0ecccb81'),

(NULL, 'bathroom', 'Plumbing - Rough-in', 'each', 525.00,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.30}'::jsonb,
  'Single fixture rough $400-650 each. Per-fixture for powder-vs-master flexibility. ai_knowledge 0ecccb81'),

(NULL, 'bathroom', 'Tile - Floor', 'sf', 8.25,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.15}'::jsonb,
  'Ceramic floor tile $6.50-10.00/sf installed. ai_knowledge cc8b8278'),

(NULL, 'bathroom', 'Tile - Wall / shower', 'sf', 20.50,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.15}'::jsonb,
  'Porcelain large format $16-25/sf. ai_knowledge c224fa67'),

(NULL, 'bathroom', 'Trim / carpentry - Base / case', 'lf', 4.50,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.15}'::jsonb,
  'Base trim painted $3.50-5.50/lf. ai_knowledge d89dd17e'),

-- ============================================================
-- KITCHEN (16 rows)
-- ============================================================
(NULL, 'kitchen', 'Appliances', 'each', NULL,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.30}'::jsonb,
  'REP MUST ENTER per appliance type — fridge, stove, microwave, dishwasher each have different install labor. AI not authorized to invent average without citation.'),

(NULL, 'kitchen', 'Cabinets / vanities - Install', 'lf', 145.00,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.30}'::jsonb,
  'Stock cabinets installed $110-180/lf. Rep enters lf of cabinet run. ai_knowledge d89dd17e'),

(NULL, 'kitchen', 'Cleanup', 'lump', NULL,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.30}'::jsonb,
  'REP MUST ENTER — no platform default.'),

(NULL, 'kitchen', 'Demo', 'sf', 3.50,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.30}'::jsonb,
  'Soft demo $2.50-4.50/sf, kitchen-applicable. ai_knowledge 864e4b80'),

(NULL, 'kitchen', 'Drywall - Patch', 'sf', 4.50,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.30}'::jsonb,
  'Large area repair $3.00-6.00/sf, kitchen patching against affected sf. ai_knowledge 9bd7a2d1'),

(NULL, 'kitchen', 'Drywall - Tape / mud / texture', 'sf', 0.68,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.15}'::jsonb,
  'Tape mud finish L4 $0.55-0.80/sf. ai_knowledge 9bd7a2d1'),

(NULL, 'kitchen', 'Electrical - Finish', 'each', 125.00,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.30}'::jsonb,
  'Per-fixture. ai_knowledge 186e6296'),

(NULL, 'kitchen', 'Electrical - Rough-in', 'lump', 2250.00,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.30}'::jsonb,
  'Kitchen circuit package $1500-3000 (5-7 circuits). ai_knowledge 186e6296'),

(NULL, 'kitchen', 'Flooring - Hardwood', 'sf', 9.00,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.15}'::jsonb,
  'Engineered 3/4" $7.00-11.00/sf. ai_knowledge cc8b8278'),

(NULL, 'kitchen', 'Flooring - LVP', 'sf', 5.50,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.15}'::jsonb,
  'Mid-grade LVP $4.50-6.50/sf. ai_knowledge cc8b8278'),

(NULL, 'kitchen', 'Paint - Cabinet refinish', 'lump', 2650.00,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.15}'::jsonb,
  'Full kitchen cabinet spray $1500-3800. ai_knowledge 672b3e0f'),

(NULL, 'kitchen', 'Paint - Interior', 'sf', 3.50,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.15}'::jsonb,
  'Full room repaint $2.75-4.25/sf. ai_knowledge 672b3e0f'),

(NULL, 'kitchen', 'Plumbing - Finish / fixtures', 'lump', 450.00,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.30}'::jsonb,
  'Kitchen sink+faucet $300-600. ai_knowledge 0ecccb81'),

(NULL, 'kitchen', 'Plumbing - Rough-in', 'lump', 1150.00,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.30}'::jsonb,
  'Kitchen rough $800-1500 (sink+DW+ice maker). ai_knowledge 0ecccb81'),

(NULL, 'kitchen', 'Tile - Backsplash', 'sf', 18.00,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.15}'::jsonb,
  'Backsplash standard tile $14-22/sf. ai_knowledge c224fa67'),

(NULL, 'kitchen', 'Trim / carpentry - Base / case', 'lf', 4.50,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.15}'::jsonb,
  'Base trim painted $3.50-5.50/lf. ai_knowledge d89dd17e'),

-- ============================================================
-- BASEMENT (18 rows)
-- ============================================================
(NULL, 'basement', 'Cabinets / vanities - Install', 'lump', 525.00,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.30}'::jsonb,
  'Vanity install — same as bath, conditional on bath/kitchenette in basement scope. ai_knowledge d89dd17e'),

(NULL, 'basement', 'Cleanup', 'lump', NULL,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.30}'::jsonb,
  'REP MUST ENTER — no platform default. Basement haul-up costs vary widely.'),

(NULL, 'basement', 'Drywall - Hang', 'sf', 0.47,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.30}'::jsonb,
  'Hang labor+material $0.38-0.55/sf. ai_knowledge 9bd7a2d1'),

(NULL, 'basement', 'Drywall - Tape / mud / texture', 'sf', 0.68,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.15}'::jsonb,
  'Tape mud finish L4. ai_knowledge 9bd7a2d1'),

(NULL, 'basement', 'Electrical - Finish', 'each', 125.00,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.30}'::jsonb,
  'Per-fixture. ai_knowledge 186e6296'),

(NULL, 'basement', 'Electrical - Low voltage', 'each', 135.00,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.0}'::jsonb,
  'Smoke/CO/LV $90-150 each. LV unaffected by basement difficulty. ai_knowledge 186e6296'),

(NULL, 'basement', 'Electrical - Rough-in', 'sf', 4.75,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.30}'::jsonb,
  'Full house rewire $4.00-7.50/sf — closest match for basement-wide rough. ai_knowledge 186e6296'),

(NULL, 'basement', 'Flooring - Carpet', 'sf', 4.65,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.15}'::jsonb,
  'Mid-grade carpet+pad $3.75-5.50/sf. ai_knowledge cc8b8278'),

(NULL, 'basement', 'Flooring - LVP', 'sf', 5.50,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.15}'::jsonb,
  'Mid-grade LVP $4.50-6.50/sf. ai_knowledge cc8b8278'),

(NULL, 'basement', 'Framing', 'sf', 11.00,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.30}'::jsonb,
  'Wall framing 2x4 $9.00-13.00/sf floor plan. ai_knowledge 3946d8bf'),

(NULL, 'basement', 'HVAC - Install', 'lump', 5500.00,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.30}'::jsonb,
  'Multi-zone mini-split or major ductwork extension. Single-zone basement = $3500. NOT per-sf — system problem, not duct math. ai_knowledge 0db915bd'),

(NULL, 'basement', 'Insulation', 'sf', 1.25,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.30}'::jsonb,
  'R-15 batt 2x4 wall $0.85-1.20/sf, mid-bumped for ceiling+walls combined. ai_knowledge 66bd9757'),

(NULL, 'basement', 'Paint - Interior', 'sf', 3.50,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.15}'::jsonb,
  'Full room repaint $2.75-4.25/sf. ai_knowledge 672b3e0f'),

(NULL, 'basement', 'Plumbing - Finish / fixtures', 'each', 475.00,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.30}'::jsonb,
  'Per-fixture finish, conditional on bath in scope. ai_knowledge 0ecccb81'),

(NULL, 'basement', 'Plumbing - Rough-in', 'each', 525.00,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.30}'::jsonb,
  'Per-fixture rough, conditional. ai_knowledge 0ecccb81'),

(NULL, 'basement', 'Tile - Floor', 'sf', 8.25,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.15}'::jsonb,
  'Ceramic floor tile $6.50-10.00/sf, conditional. ai_knowledge cc8b8278'),

(NULL, 'basement', 'Tile - Wall / shower', 'sf', 20.50,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.15}'::jsonb,
  'Porcelain large format, conditional. ai_knowledge c224fa67'),

(NULL, 'basement', 'Trim / carpentry - Base / case', 'lf', 4.50,
  '{"first_floor":1.0,"second_floor":1.15,"basement":1.15}'::jsonb,
  'Base trim painted $3.50-5.50/lf. ai_knowledge d89dd17e'),

-- ============================================================
-- REFRESH (7 rows)
-- ============================================================
(NULL, 'refresh', 'Cleanup', 'lump', NULL,
  '{}'::jsonb,
  'REP MUST ENTER — no platform default.'),

(NULL, 'refresh', 'Flooring - Carpet', 'sf', 4.65,
  '{}'::jsonb,
  'Mid-grade carpet+pad. ai_knowledge cc8b8278'),

(NULL, 'refresh', 'Flooring - Hardwood', 'sf', 9.00,
  '{}'::jsonb,
  'Engineered 3/4". ai_knowledge cc8b8278'),

(NULL, 'refresh', 'Flooring - Laminate', 'sf', 4.75,
  '{}'::jsonb,
  'Interpolated below LVP, above carpet — no direct ai_knowledge entry for laminate. Verify against real jobs.'),

(NULL, 'refresh', 'Flooring - LVP', 'sf', 5.50,
  '{}'::jsonb,
  'Mid-grade LVP. ai_knowledge cc8b8278'),

(NULL, 'refresh', 'Paint - Interior', 'sf', 3.50,
  '{}'::jsonb,
  'Full room repaint. ai_knowledge 672b3e0f'),

(NULL, 'refresh', 'Trim / carpentry - Base / case', 'lf', 4.50,
  '{}'::jsonb,
  'Base trim painted. ai_knowledge d89dd17e'),

-- ============================================================
-- EXTERIOR (4 rows)
-- ============================================================
(NULL, 'exterior', 'Cleanup', 'lump', NULL,
  '{}'::jsonb,
  'REP MUST ENTER — no platform default.'),

(NULL, 'exterior', 'Garage door', 'each', 1600.00,
  '{}'::jsonb,
  'Garage door 16x7 steel std $1200-2000. ai_knowledge a3b8ca71'),

(NULL, 'exterior', 'Paint - Exterior', 'sf', 4.25,
  '{}'::jsonb,
  'Full exterior siding+trim+soffits $3.00-5.50/sf wall area. ai_knowledge 672b3e0f'),

(NULL, 'exterior', 'Trim / carpentry - Base / case', 'lf', 4.50,
  '{}'::jsonb,
  'Exterior trim repair/replace. ai_knowledge d89dd17e')

;
