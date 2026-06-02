-- feat: edit_sub_invoice_with_ledger RPC.
-- Allows editing a sub invoice's amount, line items, and metadata fields across
-- all non-voided, non-disputed states. Atomically resyncs the accrual
-- job_transactions row via resync_sub_invoice_accrual (added in 20260602130000).
--
-- When p_line_items is provided, new_amount is derived from SUM(item->>'total').
-- When only p_amount is provided, new_amount = p_amount.
-- Otherwise the existing amount is preserved.
-- Guard: new_amount < non_voided_paid_sum raises EXCEPTION (floor constraint).

CREATE OR REPLACE FUNCTION public.edit_sub_invoice_with_ledger(
  p_invoice_id   uuid,
  p_amount       numeric  DEFAULT NULL,
  p_line_items   jsonb    DEFAULT NULL,
  p_invoice_date date     DEFAULT NULL,
  p_due_date     date     DEFAULT NULL,
  p_description  text     DEFAULT NULL
)
RETURNS TABLE(new_amount numeric, new_status text)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_inv        RECORD;
  v_paid_sum   NUMERIC;
  v_new_amount NUMERIC;
BEGIN
  SELECT
    si.amount,
    si.voided_at,
    si.disputed,
    si.accrual_transaction_id
  INTO v_inv
  FROM sub_invoices si
  WHERE si.id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sub invoice not found: %', p_invoice_id;
  END IF;

  IF v_inv.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot edit a voided invoice';
  END IF;

  IF v_inv.disputed THEN
    RAISE EXCEPTION 'Cannot edit a disputed invoice';
  END IF;

  -- Determine new amount
  IF p_line_items IS NOT NULL THEN
    SELECT COALESCE(SUM((item->>'total')::numeric), 0)
    INTO   v_new_amount
    FROM   jsonb_array_elements(p_line_items) AS item;
  ELSIF p_amount IS NOT NULL THEN
    v_new_amount := p_amount;
  ELSE
    v_new_amount := v_inv.amount;
  END IF;

  -- Floor guard: new amount must not be less than what's already been paid
  SELECT COALESCE(SUM(amount), 0)
  INTO   v_paid_sum
  FROM   sub_invoice_payments
  WHERE  sub_invoice_id = p_invoice_id
  AND    voided_at IS NULL;

  IF v_new_amount < v_paid_sum THEN
    RAISE EXCEPTION 'New amount (%) is less than already-paid sum (%). Void payment(s) first.',
      v_new_amount, v_paid_sum;
  END IF;

  -- Apply updates (only patch columns that were supplied)
  UPDATE sub_invoices
  SET
    amount       = v_new_amount,
    line_items   = COALESCE(p_line_items,   line_items),
    invoice_date = COALESCE(p_invoice_date, invoice_date),
    due_date     = COALESCE(p_due_date,     due_date),
    description  = COALESCE(p_description,  description),
    updated_at   = NOW()
  WHERE id = p_invoice_id;

  -- Resync the accrual row to reflect the new amount
  PERFORM resync_sub_invoice_accrual(p_invoice_id);

  RETURN QUERY SELECT v_new_amount, compute_sub_invoice_status(p_invoice_id);
END;
$function$;
