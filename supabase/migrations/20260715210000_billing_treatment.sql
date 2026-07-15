-- billing_treatment on job_transactions
--
-- Controls how a cost row participates in the cost-plus money engine
-- (sbLoadJobFinancialSummary / sbLoadClientActualSpend / ComposeDrawScr).
-- All existing rows default to 'standard' so live card values are unchanged.
--
--   standard     : cost is reimbursable AND markup applies. (all existing behavior)
--   no_markup    : cost is reimbursable at cost; markup NEVER applies.
--                  Billable contribution = amount (no markup).
--   client_paid  : client purchased directly. Cost is NOT reimbursable and is
--                  NOT a contractor cash-out (excluded from cost_subtotal, spent,
--                  paid_out, settled, pending_out, outstanding, draw-reimbursable
--                  cost). Markup on the amount IS billable to the client.
--                  Billable contribution = amount * applicable markup pct.

ALTER TABLE job_transactions
  ADD COLUMN billing_treatment TEXT NOT NULL DEFAULT 'standard'
  CHECK (billing_treatment IN ('standard', 'no_markup', 'client_paid'));
