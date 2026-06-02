-- Backfill co_total = 0 on all existing cost-plus jobs.
--
-- BUG: sync_job_co_total() (fixed in 20260602170000) was updating co_total
-- on ALL jobs including cost-plus. Three jobs were polluted:
--   test-flow-001        co_total=$2,500
--   Houston (58345dc5)   co_total=$3,700
--   999 Test Lane        co_total=$1,150
--
-- RULE (permanent): co_total MUST be 0 for cost-plus jobs.
--   contract_value absorbs marked-up CO price at approval (COTab._doApCO).
--   Only fixed-price jobs maintain co_total.

UPDATE jobs SET co_total = 0 WHERE cost_plus = true AND co_total <> 0;

NOTIFY pgrst, 'reload schema';
