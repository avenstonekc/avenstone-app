-- ============================================================
-- Cost-Plus Arc — Phase 3: cascade RPCs
-- cascade_draw_paid_to_transactions: flip in_draw → reimbursed when invoice paid
-- reverse_draw_paid_cascade:         flip reimbursed → in_draw when invoice voided
-- ============================================================

CREATE OR REPLACE FUNCTION cascade_draw_paid_to_transactions(p_invoice_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_draw_id UUID;
  v_count   INTEGER := 0;
BEGIN
  SELECT draw_id INTO v_draw_id FROM invoices WHERE id = p_invoice_id;
  IF v_draw_id IS NULL THEN RETURN 0; END IF;

  UPDATE job_transactions jt
     SET reimbursement_status = 'reimbursed',
         reimbursed_at        = NOW()
    FROM draw_line_items dli
   WHERE dli.draw_id               = v_draw_id
     AND dli.transaction_id        = jt.id
     AND jt.reimbursement_status   = 'in_draw';  -- guard: idempotent

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

GRANT EXECUTE ON FUNCTION cascade_draw_paid_to_transactions(UUID) TO authenticated;

-- -----------------------------------------------

CREATE OR REPLACE FUNCTION reverse_draw_paid_cascade(p_invoice_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_draw_id UUID;
  v_count   INTEGER := 0;
BEGIN
  SELECT draw_id INTO v_draw_id FROM invoices WHERE id = p_invoice_id;
  IF v_draw_id IS NULL THEN RETURN 0; END IF;

  UPDATE job_transactions jt
     SET reimbursement_status = 'in_draw',
         reimbursed_at        = NULL
    FROM draw_line_items dli
   WHERE dli.draw_id               = v_draw_id
     AND dli.transaction_id        = jt.id
     AND jt.reimbursement_status   = 'reimbursed';  -- only reverse what was reimbursed

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

GRANT EXECUTE ON FUNCTION reverse_draw_paid_cascade(UUID) TO authenticated;
