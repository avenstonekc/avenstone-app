-- ============================================================
-- DEVIATION_GATE_ARC Slice 6.0 — pricing_policy on tenants
-- Adds tolerance band used by deviationGate.js.
-- DEFAULT is mandatory: NULL policy must never reach the parser.
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS pricing_policy JSONB
    DEFAULT '{"tolerance":{"up_pct":30,"down_pct":15}}'::jsonb;

UPDATE tenants
SET pricing_policy = '{"tolerance":{"up_pct":30,"down_pct":15}}'::jsonb
WHERE pricing_policy IS NULL;

NOTIFY pgrst, 'reload schema';
