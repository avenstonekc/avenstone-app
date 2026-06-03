-- Adds p_min_invoiced_amount parameter to mark_draw_paid_release_retainage.
-- sbMarkInvoicePaid guards on invoiced_amount >= target_amount before setting
-- status='paid'. Without this parameter the RPC would flip to 'paid' on paid_amount
-- alone, ignoring whether the draw was fully invoiced — diverging from existing logic.
-- When p_min_invoiced_amount IS NULL (sbMarkDrawPaid path) the check is skipped.
-- NOTE: must drop the 2-param overload first; CREATE OR REPLACE with a different
-- signature creates a new overload in Postgres rather than replacing the old one.

DROP FUNCTION IF EXISTS public.mark_draw_paid_release_retainage(uuid, numeric);

CREATE OR REPLACE FUNCTION public.mark_draw_paid_release_retainage(
  p_draw_id             uuid,
  p_paid_amount         numeric,
  p_min_invoiced_amount numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_draw         record;
  v_new_paid     numeric;
  v_new_status   text;
  v_zeroed_count int := 0;
BEGIN
  SELECT id, job_id, tenant_id, target_amount, paid_amount,
         invoiced_amount, is_retainage_release
    INTO v_draw
    FROM draw_schedules
   WHERE id = p_draw_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draw not found: %', p_draw_id;
  END IF;

  v_new_paid := v_draw.paid_amount + p_paid_amount;

  -- 'paid' requires both paid_amount >= target AND (if caller passes it)
  -- invoiced_amount >= p_min_invoiced_amount. Mirrors sbMarkInvoicePaid's guard.
  v_new_status := CASE
    WHEN v_new_paid >= v_draw.target_amount - 0.01
      AND (p_min_invoiced_amount IS NULL
           OR v_draw.invoiced_amount >= p_min_invoiced_amount - 0.01)
    THEN 'paid'
    ELSE 'in_progress'
  END;

  UPDATE draw_schedules
     SET paid_amount = v_new_paid,
         status      = v_new_status,
         updated_at  = now()
   WHERE id = p_draw_id;

  IF v_draw.is_retainage_release = true AND v_new_status = 'paid' THEN
    UPDATE draw_schedules
       SET retainage_held = 0,
           updated_at     = now()
     WHERE job_id  = v_draw.job_id
       AND id     != p_draw_id
       AND status != 'voided'
       AND retainage_held > 0;

    GET DIAGNOSTICS v_zeroed_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'draw_id',          p_draw_id,
    'new_status',       v_new_status,
    'new_paid_amount',  v_new_paid,
    'retainage_zeroed', v_zeroed_count > 0,
    'zeroed_draws',     v_zeroed_count
  );
END;
$$;
