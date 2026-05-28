BEGIN;

ALTER TABLE change_orders
  ADD COLUMN IF NOT EXISTS markup_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS accrual_transaction_id UUID
    REFERENCES job_transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_change_orders_accrual_tx
  ON change_orders(accrual_transaction_id)
  WHERE accrual_transaction_id IS NOT NULL;

-- Add 'change_order' to job_transactions type CHECK
ALTER TABLE job_transactions DROP CONSTRAINT IF EXISTS job_transactions_type_check;
ALTER TABLE job_transactions ADD CONSTRAINT job_transactions_type_check
  CHECK (type = ANY (ARRAY[
    'client_payment','client_deposit','client_refund','sub_payout',
    'vendor_payment','material_purchase','equipment_rental','permit','fuel',
    'commission','other_expense','other_income','labor','change_order'
  ]));

COMMIT;
