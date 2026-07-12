-- SCOPE_TO_ESTIMATE Phase D orphan close — Countertops trade + option→trade seed.
-- Kalin (2026-07-12): countertops go to a dedicated countertop shop — a distinct vendor, NOT
-- subbed through cabinets or tile. So Countertops is its own platform trade. Closes the
-- countertop + counter_edge NULL-trade orphans from Phase D.
-- basement.concrete_polished STAYS Unassigned (a separate question, not a countertop — do not guess).

-- 1) New parent-only platform trade. Canonical string 'Countertops' (sub_trade NULL).
--    display_order continues the parent-only block (last was Window=230); sf unit (priced per sf).
INSERT INTO trade_taxonomy (tenant_id, parent_trade, sub_trade, display_order, default_unit, default_waste_pct) VALUES
  (NULL, 'Countertops', NULL, 240, 'sf', NULL)
ON CONFLICT (tenant_id, parent_trade, sub_trade) DO NOTHING;

-- 2) Avenstone tenant visibility — same precedent as the Siding/Deck/Fence/Gutter/Window seed.
INSERT INTO tenant_trade_visibility (tenant_id, trade_id, active)
SELECT '00000000-0000-0000-0000-000000000001', id, TRUE
FROM trade_taxonomy
WHERE tenant_id IS NULL AND sub_trade IS NULL AND parent_trade = 'Countertops'
ON CONFLICT (tenant_id, trade_id) DO NOTHING;

-- 3) option→trade rows: countertop + counter_edge → Countertops for EVERY option key. Both fields
--    are single-trade regardless of the material/edge picked (quartz/granite/butcher-block/laminate
--    all go to the same shop; edge profiles are the same shop's work). project_type set per the
--    field's REAL project types (audited: countertop in bathroom+kitchen; counter_edge in kitchen).
INSERT INTO scope_option_trades (tenant_id, project_type, field_key, option_key, trade) VALUES
  (NULL, 'bathroom', 'countertop',   'quartz',          'Countertops'),
  (NULL, 'bathroom', 'countertop',   'granite',         'Countertops'),
  (NULL, 'bathroom', 'countertop',   'cultured_marble', 'Countertops'),
  (NULL, 'kitchen',  'countertop',   'quartz',          'Countertops'),
  (NULL, 'kitchen',  'countertop',   'granite',         'Countertops'),
  (NULL, 'kitchen',  'countertop',   'butcher_block',   'Countertops'),
  (NULL, 'kitchen',  'countertop',   'laminate',        'Countertops'),
  (NULL, 'kitchen',  'counter_edge', 'eased',           'Countertops'),
  (NULL, 'kitchen',  'counter_edge', 'waterfall',       'Countertops'),
  (NULL, 'kitchen',  'counter_edge', 'ogee',            'Countertops')
ON CONFLICT (tenant_id, project_type, field_key, option_key) DO NOTHING;
