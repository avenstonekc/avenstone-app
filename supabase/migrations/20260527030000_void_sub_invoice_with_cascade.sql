-- SUB_INVOICES_ARC — void_sub_invoice_with_cascade + unvoid_sub_invoice
--
-- void_sub_invoice_with_cascade:
--   Marks sub_invoice voided, then calls Phase 4b's
--   void_sub_invoice_payment_with_ledger for each non-voided payment
--   (atomic ledger reversal per payment).
--
-- unvoid_sub_invoice:
--   Clears voided_at / voided_by_id / void_reason on the invoice only.
--   Payments stay voided — user re-records fresh payments after restoring.
--
-- Both are SECURITY INVOKER; RLS on sub_invoices + sub_invoice_payments
-- (si_staff_write + sip_modify) covers owner+PM callers.

CREATE OR REPLACE FUNCTION void_sub_invoice_with_cascade(
  p_invoice_id  UUID,
  p_void_reason TEXT
)
RETURNS TABLE(invoice_id UUID, payments_voided INTEGER)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_invoice RECORD;
  v_payment RECORD;
  v_count   INTEGER := 0;
BEGIN
  -- Fetch invoice + verify not already voided
  SELECT id, voided_at INTO v_invoice
  FROM sub_invoices
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sub invoice not found: %', p_invoice_id;
  END IF;

  IF v_invoice.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Invoice already voided';
  END IF;

  -- Mark invoice voided
  UPDATE sub_invoices
  SET voided_at    = NOW(),
      voided_by_id = auth.uid(),
      void_reason  = p_void_reason
  WHERE id = p_invoice_id;

  -- Cascade: void each non-voided payment via Phase 4b atomic function
  FOR v_payment IN
    SELECT id
    FROM sub_invoice_payments
    WHERE sub_invoice_id = p_invoice_id
      AND voided_at IS NULL
  LOOP
    PERFORM void_sub_invoice_payment_with_ledger(
      v_payment.id,
      'Cascaded from invoice void: ' || p_void_reason
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN QUERY SELECT p_invoice_id, v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION void_sub_invoice_with_cascade(UUID, TEXT)
  TO authenticated;

-- ─── Un-void ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION unvoid_sub_invoice(
  p_invoice_id UUID
)
RETURNS TABLE(invoice_id UUID)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_invoice RECORD;
BEGIN
  SELECT id, voided_at INTO v_invoice
  FROM sub_invoices
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sub invoice not found: %', p_invoice_id;
  END IF;

  IF v_invoice.voided_at IS NULL THEN
    RAISE EXCEPTION 'Invoice is not voided';
  END IF;

  UPDATE sub_invoices
  SET voided_at    = NULL,
      voided_by_id = NULL,
      void_reason  = NULL
  WHERE id = p_invoice_id;

  RETURN QUERY SELECT p_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION unvoid_sub_invoice(UUID)
  TO authenticated;
