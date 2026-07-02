-- ============================================================
-- Draw-paid cascade for the DIRECT draw-payment path (cost-plus + flip)
-- ------------------------------------------------------------
-- sbMarkDrawPaid pays a draw with NO invoice (invoice_id stays null), so the
-- existing invoice-keyed cascade_draw_paid_to_transactions(p_invoice_id) never
-- fires for direct draw payments. This RPC is keyed on draw_id and flips the
-- draw's source expense rows reimbursement_status in_draw -> reimbursed via the
-- draw_line_items linkage. Idempotent (guards on in_draw). SECURITY DEFINER so
-- the flip is guaranteed regardless of the caller's RLS on job_transactions;
-- scope is inherently bounded to the passed draw_id's line items.
--
-- Does NOT modify the invoice-keyed cascade — the invoice path keeps working.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cascade_draw_paid_by_draw(p_draw_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
BEGIN
  UPDATE job_transactions jt
     SET reimbursement_status = 'reimbursed',
         reimbursed_at        = now()
    FROM draw_line_items dli
   WHERE dli.draw_id             = p_draw_id
     AND dli.transaction_id      = jt.id
     AND jt.reimbursement_status = 'in_draw';   -- idempotent guard

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('draw_id', p_draw_id, 'flipped', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cascade_draw_paid_by_draw(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
