-- Add multiplier column to estimate_line_items and update generated cost expressions.
-- Option B fix: unit_cost stays = catalog base rate; floor premium lives in multiplier.
-- total_cost / client_price are rebuilt to include the multiplier factor.
-- Existing rows get multiplier = 1.0 via DEFAULT — no backfill required.

-- 1. Add column (idempotent guard via DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'estimate_line_items' AND column_name = 'multiplier'
  ) THEN
    ALTER TABLE estimate_line_items
      ADD COLUMN multiplier NUMERIC(5,2) NOT NULL DEFAULT 1.0;
  END IF;
END $$;

-- 2. Drop existing generated columns so we can re-add with updated expressions.
--    Postgres does not allow ALTER COLUMN on a STORED GENERATED expression.
ALTER TABLE estimate_line_items DROP COLUMN IF EXISTS total_cost;
ALTER TABLE estimate_line_items DROP COLUMN IF EXISTS client_price;

-- 3. Re-add with multiplier included in both expressions.
ALTER TABLE estimate_line_items
  ADD COLUMN total_cost NUMERIC(12,2)
    GENERATED ALWAYS AS (quantity * unit_cost * multiplier) STORED;

ALTER TABLE estimate_line_items
  ADD COLUMN client_price NUMERIC(12,2)
    GENERATED ALWAYS AS (quantity * unit_cost * multiplier * (1 + markup_pct / 100.0)) STORED;
