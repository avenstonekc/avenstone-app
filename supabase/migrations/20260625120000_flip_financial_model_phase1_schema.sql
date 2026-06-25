-- ============================================================
-- FLIP_FINANCIAL_MODEL Phase 1 — financial_model enum + arv NUMERIC
--
-- 1. Adds financial_model TEXT NOT NULL with CHECK constraint
--    mirroring the bid_model_config supply_model pattern.
--    Default 'fixed_bid' so ADD COLUMN is backward-compatible.
--
-- 2. Backfills financial_model from cost_plus boolean.
--    cost_plus=true  → 'cost_plus'
--    cost_plus=false → 'fixed_bid'
--    No row becomes 'flip' automatically — flip is a forward choice.
--
-- 3. Converts arv TEXT NULL → NUMERIC NULL.
--    All current values are empty string; NULLIF converts to NULL cleanly.
--    Audit: SELECT arv, count(*) GROUP BY arv → all rows have arv=''.
--    USING clause: NULLIF(regexp_replace(arv, '[$,]', '', 'g'), '')::numeric
--
-- cost_plus BOOLEAN is retained for dual-read transition. Drop later.
-- ============================================================

-- Step 1: Add financial_model column
ALTER TABLE jobs
  ADD COLUMN financial_model TEXT NOT NULL DEFAULT 'fixed_bid'
    CHECK (financial_model IN ('flip', 'cost_plus', 'fixed_bid'));

-- Step 2: Backfill from cost_plus boolean
UPDATE jobs
   SET financial_model = CASE WHEN cost_plus THEN 'cost_plus' ELSE 'fixed_bid' END;

-- Step 3: arv TEXT → NUMERIC
-- Must drop the DEFAULT '' first — empty-string default can't auto-cast to NUMERIC.
-- arv is nullable, so no default needed; NULL is the correct "not set" sentinel.
ALTER TABLE jobs ALTER COLUMN arv DROP DEFAULT;
ALTER TABLE jobs
  ALTER COLUMN arv TYPE NUMERIC
  USING NULLIF(regexp_replace(arv, '[$,]', '', 'g'), '')::numeric;

NOTIFY pgrst, 'reload schema';
