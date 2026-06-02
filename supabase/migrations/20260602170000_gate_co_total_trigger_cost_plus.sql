-- Gate trg_sync_co_total to non-cost-plus jobs only.
--
-- BUG: sync_job_co_total() was updating co_total for ALL jobs on every
-- change_order INSERT/UPDATE/DELETE. For cost-plus jobs this is wrong:
-- contract_value already absorbs the marked-up CO price at approval time,
-- so co_total must remain 0. Adding co_total in sbLoadJobFinancialSummary
-- (contract_total = contract_value + co_total) double-counted the CO cost.
--
-- RULE (permanent): co_total MUST be 0 for cost-plus jobs.
--   contract_value absorbs marked-up CO price at approval (COTab._doApCO).
--   Only fixed-price jobs maintain co_total (COTab's else branch).

CREATE OR REPLACE FUNCTION public.sync_job_co_total()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_job_id TEXT;
BEGIN
  v_job_id := COALESCE(NEW.job_id, OLD.job_id);
  -- Only sync co_total for fixed-price jobs.
  -- Cost-plus: contract_value absorbs the marked-up CO price at approval;
  -- adding co_total in financial summaries would double-count.
  IF NOT COALESCE((SELECT cost_plus FROM jobs WHERE id = v_job_id), false) THEN
    UPDATE jobs SET co_total = get_job_co_total(v_job_id) WHERE id = v_job_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

NOTIFY pgrst, 'reload schema';
