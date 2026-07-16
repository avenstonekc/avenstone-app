-- PRICE_DETERMINISM P3 — add Countertops trade to vanity_swap scope subset.
-- Locked decision (Kalin 2026-07-16): Countertops is a standalone cross-room trade.
-- When a rep selects vanity_swap, countertop replacement is part of the scope.
-- Platform default row (tenant_id IS NULL). Idempotent via jsonb array check.

UPDATE template_scope_subsets
SET trades = array_append(trades, 'Countertops')
WHERE room_type = 'bathroom'
  AND scope_tag  = 'vanity_swap'
  AND tenant_id  IS NULL
  AND NOT ('Countertops' = ANY(trades));

NOTIFY pgrst, 'reload schema';
