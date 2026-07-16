-- SCOPE_PREFILL P2 — add a 'keep_existing' option to the bathroom floor_tile field so a
-- "keeping the existing floor" scope can be represented as an answer.
--
-- Options on this schema live as a jsonb array on the single scope_checklists row (not per-option
-- rows), so this is an idempotent append to that platform-default (tenant_id NULL) row plus a label.
--
-- NO scope_option_trades row is added for keep_existing on purpose: floor_tile is a "mapped" field
-- (its other options have trade-map rows), and deriveTrade returns null for a mapped-field option
-- that has no trade row (miss -> orphan -> adds no work). That null IS the no-trades sentinel here;
-- scope_option_trades.trade is NOT NULL so an empty row is impossible anyway.
UPDATE scope_checklists
SET options       = options || '["keep_existing"]'::jsonb,
    option_labels = COALESCE(option_labels, '{}'::jsonb) || '{"keep_existing":"Keep existing floor"}'::jsonb
WHERE project_type = 'bathroom'
  AND field_key    = 'floor_tile'
  AND tenant_id IS NULL
  AND NOT (options ? 'keep_existing');
