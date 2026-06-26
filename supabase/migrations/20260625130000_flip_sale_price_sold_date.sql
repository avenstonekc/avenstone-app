-- FLIP_FINANCIAL_MODEL Phase 6 — actual realization columns
-- Supports recording the final sale price and closing date on a flip job
-- so actual profit can be compared against the projected margin.
-- Both nullable: only set when the property closes.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS sale_price NUMERIC NULL,
  ADD COLUMN IF NOT EXISTS sold_date  DATE NULL;
