-- SUB_INVOICES_ARC Phase 4b — atomic void reversal
-- Creates: void_sub_invoice_payment_with_ledger() — atomic payment void + job_transactions void
--
-- Audit-confirmed void mechanism on job_transactions:
--   status = 'void'  (no voided_at / voided_by columns — CHECK constraint confirmed)
--   STATUS values in live DB: paid, pending, void — 'void' is the canonical soft-void.
--
-- Linkage: sub_invoice_payments.transaction_id → job_transactions.id (one-way FK).
--   job_transactions.invoice_id is FK to invoices (client billing), NOT sub_invoices.
--   Never set job_transactions.invoice_id here.
--
-- SECURITY INVOKER: sip_modify (ALL) + jt_staff_write (*) cover owner+PM; both use
--   USING/WITH CHECK on tenant_id. auth.uid() works inside INVOKER context.

CREATE OR REPLACE FUNCTION void_sub_invoice_payment_with_ledger(
  p_payment_id  UUID,
  p_void_reason TEXT DEFAULT NULL
)
RETURNS TABLE(payment_id UUID, transaction_id UUID, new_status TEXT)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_pmt        RECORD;
  v_tx_id      UUID;
  v_new_status TEXT;
BEGIN
  -- Fetch the payment row
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

  -- Void the sub_invoice_payments row
  UPDATE sub_invoice_payments
  SET
    voided_at    = NOW(),
    voided_by_id = auth.uid(),
    void_reason  = p_void_reason
  WHERE id = p_payment_id;

  v_tx_id := v_pmt.tx_id;

  -- Void the linked job_transactions row (if one exists)
  -- Audit-confirmed mechanism: status = 'void' (no voided_at/voided_by columns).
  IF v_tx_id IS NOT NULL THEN
    UPDATE job_transactions
    SET status = 'void'
    WHERE id = v_tx_id;
  END IF;

  -- Derive new invoice status (source of truth in DB)
  v_new_status := compute_sub_invoice_status(v_pmt.sub_invoice_id);

  RETURN QUERY SELECT p_payment_id, v_tx_id, v_new_status;
END;
$$;

GRANT EXECUTE ON FUNCTION void_sub_invoice_payment_with_ledger(UUID, TEXT)
  TO authenticated;
