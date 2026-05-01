-- Bathroom fixture catalog additions.
-- Vanity cabinet 30in already seeded — skip.
-- Toilet and Vanity sink rows renamed before adding variant rows.

-- Rename existing generic rows to avoid duplicate constraint issues
UPDATE takeoff_unit_costs
  SET material_name = 'Toilet standard', base_rate = 235.00
  WHERE room_type = 'bathroom' AND category = 'materials' AND material_name = 'Toilet' AND tenant_id IS NULL;

UPDATE takeoff_unit_costs
  SET material_name = 'Vanity sink standard'
  WHERE room_type = 'bathroom' AND category = 'materials' AND material_name = 'Vanity sink' AND tenant_id IS NULL;

-- Vanity cabinets (skip 30in — already seeded)
INSERT INTO takeoff_unit_costs (tenant_id, room_type, trade, category, material_name, unit, base_rate, active)
VALUES
  (NULL, 'bathroom', 'Cabinets / vanities - Install', 'materials', 'Vanity cabinet 24in', 'each', 275.00, true),
  (NULL, 'bathroom', 'Cabinets / vanities - Install', 'materials', 'Vanity cabinet 36in', 'each', 485.00, true),
  (NULL, 'bathroom', 'Cabinets / vanities - Install', 'materials', 'Vanity cabinet 48in', 'each', 725.00, true),
  (NULL, 'bathroom', 'Cabinets / vanities - Install', 'materials', 'Vanity cabinet 60in', 'each', 1150.00, true),
  (NULL, 'bathroom', 'Cabinets / vanities - Install', 'materials', 'Vanity cabinet 72in', 'each', 1500.00, true);

-- Vanity tops — cultured marble by width
INSERT INTO takeoff_unit_costs (tenant_id, room_type, trade, category, material_name, unit, base_rate, active)
VALUES
  (NULL, 'bathroom', 'Cabinets / vanities - Install', 'materials', 'Vanity top - cultured marble 24in', 'each', 185.00, true),
  (NULL, 'bathroom', 'Cabinets / vanities - Install', 'materials', 'Vanity top - cultured marble 30in', 'each', 215.00, true),
  (NULL, 'bathroom', 'Cabinets / vanities - Install', 'materials', 'Vanity top - cultured marble 36in', 'each', 255.00, true),
  (NULL, 'bathroom', 'Cabinets / vanities - Install', 'materials', 'Vanity top - cultured marble 48in', 'each', 340.00, true),
  (NULL, 'bathroom', 'Cabinets / vanities - Install', 'materials', 'Vanity top - cultured marble 60in', 'each', 410.00, true),
  (NULL, 'bathroom', 'Cabinets / vanities - Install', 'materials', 'Vanity top - cultured marble 72in', 'each', 480.00, true);

-- Vanity tops — quartz by width
INSERT INTO takeoff_unit_costs (tenant_id, room_type, trade, category, material_name, unit, base_rate, active)
VALUES
  (NULL, 'bathroom', 'Cabinets / vanities - Install', 'materials', 'Vanity top - quartz 24in', 'each', 385.00, true),
  (NULL, 'bathroom', 'Cabinets / vanities - Install', 'materials', 'Vanity top - quartz 30in', 'each', 465.00, true),
  (NULL, 'bathroom', 'Cabinets / vanities - Install', 'materials', 'Vanity top - quartz 36in', 'each', 555.00, true),
  (NULL, 'bathroom', 'Cabinets / vanities - Install', 'materials', 'Vanity top - quartz 48in', 'each', 745.00, true),
  (NULL, 'bathroom', 'Cabinets / vanities - Install', 'materials', 'Vanity top - quartz 60in', 'each', 945.00, true),
  (NULL, 'bathroom', 'Cabinets / vanities - Install', 'materials', 'Vanity top - quartz 72in', 'each', 1150.00, true);

-- Vanity tops — granite by width
INSERT INTO takeoff_unit_costs (tenant_id, room_type, trade, category, material_name, unit, base_rate, active)
VALUES
  (NULL, 'bathroom', 'Cabinets / vanities - Install', 'materials', 'Vanity top - granite 24in', 'each', 295.00, true),
  (NULL, 'bathroom', 'Cabinets / vanities - Install', 'materials', 'Vanity top - granite 30in', 'each', 355.00, true),
  (NULL, 'bathroom', 'Cabinets / vanities - Install', 'materials', 'Vanity top - granite 36in', 'each', 425.00, true),
  (NULL, 'bathroom', 'Cabinets / vanities - Install', 'materials', 'Vanity top - granite 48in', 'each', 565.00, true),
  (NULL, 'bathroom', 'Cabinets / vanities - Install', 'materials', 'Vanity top - granite 60in', 'each', 720.00, true),
  (NULL, 'bathroom', 'Cabinets / vanities - Install', 'materials', 'Vanity top - granite 72in', 'each', 895.00, true);

-- Vanity sink upgrade (standard already renamed from "Vanity sink" above)
INSERT INTO takeoff_unit_costs (tenant_id, room_type, trade, category, material_name, unit, base_rate, active)
VALUES
  (NULL, 'bathroom', 'Plumbing - Finish / fixtures', 'materials', 'Vanity sink upgrade', 'each', 325.00, true);

-- Shower doors
INSERT INTO takeoff_unit_costs (tenant_id, room_type, trade, category, material_name, unit, base_rate, active)
VALUES
  (NULL, 'bathroom', 'Tile - Wall / shower', 'materials', 'Shower door - glass slider',               'each', 850.00,  true),
  (NULL, 'bathroom', 'Tile - Wall / shower', 'materials', 'Shower door - glass swing semi-frameless', 'each', 1200.00, true),
  (NULL, 'bathroom', 'Tile - Wall / shower', 'materials', 'Shower door - glass swing frameless',      'each', 1650.00, true),
  (NULL, 'bathroom', 'Tile - Wall / shower', 'materials', 'Shower door - curtain rod',                'each', 55.00,   true),
  (NULL, 'bathroom', 'Tile - Wall / shower', 'materials', 'Shower door - none',                       'each', 0.00,    true),
  (NULL, 'bathroom', 'Tile - Wall / shower', 'materials', 'Shower door - keep existing',              'each', 0.00,    true);

-- Toilet upgrade (standard already renamed from "Toilet" above)
INSERT INTO takeoff_unit_costs (tenant_id, room_type, trade, category, material_name, unit, base_rate, active)
VALUES
  (NULL, 'bathroom', 'Plumbing - Finish / fixtures', 'materials', 'Toilet upgrade one-piece', 'each', 485.00, true);
