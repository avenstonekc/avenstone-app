BEGIN;

-- jobs: project management fee (owner-entered per job, only meaningful when cost_plus=true)
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS pm_fee NUMERIC(12,2) DEFAULT 0;

-- sub_invoices: link to the pending job_transactions row created at approval.
-- Nullable because legacy approved invoices won't have it until backfill runs,
-- and non-cost-plus jobs never get one.
ALTER TABLE sub_invoices
  ADD COLUMN IF NOT EXISTS accrual_transaction_id UUID
    REFERENCES job_transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sub_invoices_accrual_tx
  ON sub_invoices(accrual_transaction_id)
  WHERE accrual_transaction_id IS NOT NULL;

COMMIT;
