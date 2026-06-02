-- One-time backfill: correct stale accrual job_transactions rows for invoices that had
-- partial payments recorded before the accrual drawdown fix was deployed.
-- Corrects accrual amount to invoice_amount − paid_sum; flips status to 'paid' where
-- fully covered. Aguayos invoice 16ab4bc1 (accrual 97205011) is the known stale row:
-- was $27,900 pending after $6,500 payment, will become $21,400 pending.

UPDATE job_transactions jt
SET
  amount    = GREATEST(0, si.amount - COALESCE(p.paid_sum, 0)),
  status    = CASE
                WHEN GREATEST(0, si.amount - COALESCE(p.paid_sum, 0)) = 0 THEN 'paid'
                ELSE 'pending'
              END,
  date_paid = CASE
                WHEN GREATEST(0, si.amount - COALESCE(p.paid_sum, 0)) = 0 THEN NOW()::date
                ELSE NULL
              END
FROM sub_invoices si
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(amount), 0) AS paid_sum
  FROM   sub_invoice_payments
  WHERE  sub_invoice_id = si.id
  AND    voided_at IS NULL
) p ON true
WHERE jt.id = si.accrual_transaction_id
  AND si.voided_at IS NULL
  AND jt.amount <> GREATEST(0, si.amount - COALESCE(p.paid_sum, 0));
