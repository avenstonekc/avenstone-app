-- EXECUTION_ARC retainage-release fix
-- Adds is_retainage_release flag to draw_schedules and a PG RPC that atomically
-- flips draw status to paid AND zeros retainage_held on all sibling draws when
-- the flagged draw reaches fully-paid state.
-- Fixes: sbLoadFinancialSummary permanently reporting stale held retainage after
--        a retainage-release draw has been collected.

-- ── 1. Schema ─────────────────────────────────────────────────────────────────

ALTER TABLE draw_schedules
  ADD COLUMN IF NOT EXISTS is_retainage_release BOOLEAN NOT NULL DEFAULT false;

-- ── 2. RPC ────────────────────────────────────────────────────────────────────
-- mark_draw_paid_release_retainage(p_draw_id, p_paid_amount)
--   • Updates paid_amount + status on the draw in one transaction.
--   • When the draw is flagged is_retainage_release=true AND reaches status='paid',
--     zeros retainage_held on every other non-voided draw for the same job.
--   • Returns JSONB: { draw_id, new_status, new_paid_amount,
--                      retainage_zeroed bool, zeroed_draws int }

CREATE OR REPLACE FUNCTION public.mark_draw_paid_release_retainage(
  p_draw_id     uuid,
  p_paid_amount numeric
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
  -- Lock the draw row for the duration of this transaction
  SELECT id, job_id, tenant_id, target_amount, paid_amount,
         is_retainage_release
    INTO v_draw
    FROM draw_schedules
   WHERE id = p_draw_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Draw not found: %', p_draw_id;
  END IF;

  v_new_paid   := v_draw.paid_amount + p_paid_amount;
  v_new_status := CASE
    WHEN v_new_paid >= v_draw.target_amount - 0.01 THEN 'paid'
    ELSE 'in_progress'
  END;

  -- Update paid_amount + status on the draw itself
  UPDATE draw_schedules
     SET paid_amount = v_new_paid,
         status      = v_new_status,
         updated_at  = now()
   WHERE id = p_draw_id;

  -- Full retainage release: zero all sibling draws' retainage_held atomically
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
