-- refactor: extract resync_sub_invoice_accrual as a shared function.
-- Previously both add_sub_invoice_payment_with_ledger and
-- void_sub_invoice_payment_with_ledger contained identical inline blocks
-- that recomputed and updated the accrual job_transactions row.
-- Centralizing removes the duplication and gives edit_sub_invoice_with_ledger
-- (next migration) a single call-point for accrual resync.

-- ─── Step 1: Shared resync function ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.resync_sub_invoice_accrual(
  p_invoice_id     uuid,
  p_effective_date date DEFAULT CURRENT_DATE
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_inv       RECORD;
  v_paid_sum  NUMERIC;
  v_remaining NUMERIC;
BEGIN
  SELECT si.amount, si.accrual_transaction_id, si.voided_at
  INTO   v_inv
  FROM   sub_invoices si
  WHERE  si.id = p_invoice_id;

  -- No accrual row or invoice is voided: nothing to do
  IF NOT FOUND OR v_inv.accrual_transaction_id IS NULL OR v_inv.voided_at IS NOT NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount), 0)
  INTO   v_paid_sum
  FROM   sub_invoice_payments
  WHERE  sub_invoice_id = p_invoice_id
  AND    voided_at IS NULL;

  v_remaining := GREATEST(0, v_inv.amount - v_paid_sum);

  UPDATE job_transactions
  SET amount    = v_remaining,
      status    = CASE WHEN v_remaining = 0 THEN 'paid'           ELSE 'pending' END,
      date_paid = CASE WHEN v_remaining = 0 THEN p_effective_date ELSE NULL      END
  WHERE id = v_inv.accrual_transaction_id;
END;
$function$;


-- ─── Step 2: Rewrite add_sub_invoice_payment_with_ledger ─────────────────────

CREATE OR REPLACE FUNCTION public.add_sub_invoice_payment_with_ledger(
  p_sub_invoice_id uuid,
  p_amount         numeric,
  p_paid_date      date,
  p_method         text,
  p_reference      text DEFAULT NULL::text,
  p_notes          text DEFAULT NULL::text
)
RETURNS TABLE(payment_id uuid, transaction_id uuid, new_status text)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_inv        RECORD;
  v_payment_id UUID;
  v_tx_id      UUID;
  v_new_status TEXT;
BEGIN
  -- Fetch invoice state + sub contact name + accrual linkage in one join
  SELECT
    si.tenant_id,
    si.job_id,
    si.invoice_number,
    si.voided_at,
    si.disputed,
    si.approved_at,
    si.amount                 AS invoice_amount,
    si.accrual_transaction_id,
    c.name                    AS sub_name
  INTO v_inv
  FROM sub_invoices si
  JOIN contacts c ON c.id = si.sub_contact_id
  WHERE si.id = p_sub_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sub invoice not found: %', p_sub_invoice_id;
  END IF;

  -- Guards (mirrors JS-layer guards — enforced at DB level for atomicity)
  IF v_inv.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot add payment to voided invoice';
  END IF;
  IF v_inv.disputed THEN
    RAISE EXCEPTION 'Cannot add payment to disputed invoice';
  END IF;
  IF v_inv.approved_at IS NULL THEN
    RAISE EXCEPTION 'Invoice must be approved before recording payment';
  END IF;

  -- Insert sub_invoice_payments row
  INSERT INTO sub_invoice_payments (
    tenant_id,
    sub_invoice_id,
    amount,
    paid_date,
    method,
    reference,
    notes,
    created_by_id
  ) VALUES (
    v_inv.tenant_id,
    p_sub_invoice_id,
    p_amount,
    p_paid_date,
    p_method,
    p_reference,
    p_notes,
    auth.uid()
  )
  RETURNING id INTO v_payment_id;

  -- Insert matching job_transactions row (cash record, always status='paid')
  INSERT INTO job_transactions (
    tenant_id,
    job_id,
    direction,
    type,
    amount,
    date_incurred,
    date_paid,
    status,
    payer_or_payee_type,
    payer_or_payee_name,
    payment_method,
    description,
    notes,
    created_by
  ) VALUES (
    v_inv.tenant_id,
    v_inv.job_id,
    'out',
    'sub_payout',
    p_amount,
    p_paid_date,
    p_paid_date,
    'paid',
    'sub',
    v_inv.sub_name,
    p_method,
    format('Payment to %s for invoice #%s%s',
      v_inv.sub_name,
      v_inv.invoice_number,
      CASE WHEN p_notes IS NOT NULL THEN ' — ' || p_notes ELSE '' END
    ),
    p_notes,
    auth.uid()
  )
  RETURNING id INTO v_tx_id;

  -- Link payment row back to transaction row
  UPDATE sub_invoice_payments
  SET transaction_id = v_tx_id
  WHERE id = v_payment_id;

  -- Draw down the accrual row to the current remaining balance.
  -- paid_sum is recomputed inside the shared function (after the INSERT above)
  -- so the new payment is included.
  PERFORM resync_sub_invoice_accrual(p_sub_invoice_id, p_paid_date);

  -- Derive new invoice status (source of truth in DB)
  v_new_status := compute_sub_invoice_status(p_sub_invoice_id);

  RETURN QUERY SELECT v_payment_id, v_tx_id, v_new_status;
END;
$function$;


-- ─── Step 3: Rewrite void_sub_invoice_payment_with_ledger ────────────────────

CREATE OR REPLACE FUNCTION public.void_sub_invoice_payment_with_ledger(
  p_payment_id  uuid,
  p_void_reason text DEFAULT NULL::text
)
RETURNS TABLE(payment_id uuid, transaction_id uuid, new_status text)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_pmt        RECORD;
  v_tx_id      UUID;
  v_new_status TEXT;
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
  -- paid_sum is recomputed inside the shared function so the now-voided payment is excluded.
  PERFORM resync_sub_invoice_accrual(v_pmt.sub_invoice_id);

  -- Derive new invoice status (source of truth in DB)
  v_new_status := compute_sub_invoice_status(v_pmt.sub_invoice_id);

  RETURN QUERY SELECT p_payment_id, v_tx_id, v_new_status;
END;
$function$;
