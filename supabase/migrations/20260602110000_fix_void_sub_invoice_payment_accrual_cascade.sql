-- fix: inverse accrual cascade when a sub invoice payment is voided.
-- Before this fix, void_sub_invoice_payment_with_ledger only set the payment tx to 'void'
-- but left the accrual row unchanged. After voiding a payment the accrual now reflects
-- the new remaining balance (climbs back up for partial void, stays at full for full void).

CREATE OR REPLACE FUNCTION public.void_sub_invoice_payment_with_ledger(
  p_payment_id  uuid,
  p_void_reason text DEFAULT NULL::text
)
RETURNS TABLE(payment_id uuid, transaction_id uuid, new_status text)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_pmt        RECORD;
  v_si         RECORD;
  v_tx_id      UUID;
  v_new_status TEXT;
  v_paid_sum   NUMERIC;
  v_remaining  NUMERIC;
BEGIN
  -- Fetch the payment row (sub_invoice_id available here)
  SELECT
    sip.id,
    sip.sub_invoice_id,
    sip.voided_at,
    sip.transaction_id AS tx_id
  INTO v_pmt
  FROM sub_invoice_payments sip
  WHERE sip.id = p_payment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment not found: %', p_payment_id;
  END IF;

  IF v_pmt.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Payment is already voided';
  END IF;

  -- Void the sub_invoice_payments row (voided_at now non-null — excluded from future paid_sum)
  UPDATE sub_invoice_payments
  SET
    voided_at    = NOW(),
    voided_by_id = auth.uid(),
    void_reason  = p_void_reason
  WHERE id = p_payment_id;

  v_tx_id := v_pmt.tx_id;

  -- Void the linked job_transactions cash record (if one exists)
  IF v_tx_id IS NOT NULL THEN
    UPDATE job_transactions
    SET status = 'void'
    WHERE id = v_tx_id;
  END IF;

  -- Inverse accrual cascade: recompute remaining balance after the void and update accrual.
  -- paid_sum is computed after the void above, so the now-voided payment is excluded.
  SELECT si.amount, si.accrual_transaction_id
  INTO   v_si
  FROM   sub_invoices si
  WHERE  si.id = v_pmt.sub_invoice_id;

  IF v_si.accrual_transaction_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0)
    INTO   v_paid_sum
    FROM   sub_invoice_payments
    WHERE  sub_invoice_id = v_pmt.sub_invoice_id
    AND    voided_at IS NULL;

    v_remaining := GREATEST(0, v_si.amount - v_paid_sum);

    UPDATE job_transactions
    SET amount    = v_remaining,
        status    = CASE WHEN v_remaining = 0 THEN 'paid'        ELSE 'pending' END,
        date_paid = CASE WHEN v_remaining = 0 THEN NOW()::date   ELSE NULL      END
    WHERE id = v_si.accrual_transaction_id;
  END IF;

  -- Derive new invoice status (source of truth in DB)
  v_new_status := compute_sub_invoice_status(v_pmt.sub_invoice_id);

  RETURN QUERY SELECT p_payment_id, v_tx_id, v_new_status;
END;
$function$;
