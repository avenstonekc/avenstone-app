-- SCOPE_TO_ESTIMATE Phase D — trade_taxonomy expansion.
-- SUB_WORK_PACKET needs exterior trades the Phase 1B audit flagged as absent:
-- Siding / Deck / Fence / Gutter / Window. Parent-only rows (no sub-types), canonical
-- format ("Parent" when sub_trade IS NULL — matches takeoff.js:442-445 join string).
-- Precedent (20260429_trade_taxonomy.sql): canonical rows are tenant_id=NULL platform
-- defaults, then Avenstone tenant gets a tenant_trade_visibility row. display_order
-- continues the parent-only block (last was Cleanup=180).
-- Idempotent: ON CONFLICT DO NOTHING on both the UNIQUE tuple and the visibility PK.

INSERT INTO trade_taxonomy (tenant_id, parent_trade, sub_trade, display_order, default_unit, default_waste_pct) VALUES
  (NULL, 'Siding',  NULL, 190, 'sf', 10.00),
  (NULL, 'Deck',    NULL, 200, 'sf', 10.00),
  (NULL, 'Fence',   NULL, 210, 'lf', NULL),
  (NULL, 'Gutter',  NULL, 220, 'lf', NULL),
  (NULL, 'Window',  NULL, 230, 'each', NULL)
ON CONFLICT (tenant_id, parent_trade, sub_trade) DO NOTHING;

-- Avenstone tenant visibility: activate the five new canonical rows only.
-- Scoped to the new parent_trades so existing visibility rows are untouched.
INSERT INTO tenant_trade_visibility (tenant_id, trade_id, active)
SELECT '00000000-0000-0000-0000-000000000001', id, TRUE
FROM trade_taxonomy
WHERE tenant_id IS NULL
  AND sub_trade IS NULL
  AND parent_trade IN ('Siding','Deck','Fence','Gutter','Window')
ON CONFLICT (tenant_id, trade_id) DO NOTHING;
