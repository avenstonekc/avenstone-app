-- Fix the reimbursable-expense predicate class bug (not the Brentwood instance).
--
-- Root cause: the draw composer identifies a reimbursable expense by
-- reimbursement_status = 'unreimbursed' EXACTLY. That predicate is wrong in two directions:
--   * NULL rows (legacy, created before the column existed) silently HIDE from the composer,
--     so their jobs (Brentwood et al.) show no pending expenses under the next draw.
--   * status='void' rows that are still 'unreimbursed' silently SHOW as reimbursable, risking
--     billing a client for money that was voided.
-- Canonical predicate for a reimbursable expense:
--   direction='out' AND status<>'void' AND billing_treatment<>'client_paid'
--   AND COALESCE(reimbursement_status,'unreimbursed')='unreimbursed'
--
-- This migration fixes the DATA (backfill) and the RPC (compose_draw flip guard).
-- The read-side helpers (sbLoadUnreimbursedExpenses, sbGetBucketBalance) are fixed in
-- src/lib/supabase.js in the same commit.

-- 1. Backfill legacy NULL OUTBOUND expenses not yet in a draw -> 'unreimbursed'.
--    OUTBOUND ONLY on purpose: reimbursement_status is meaningless for inbound client
--    payments; stamping the ~$98,500 of inbound NULL rows would corrupt their meaning.
--    Exclude void and rows already linked to a draw.
UPDATE job_transactions
   SET reimbursement_status = 'unreimbursed'
 WHERE reimbursement_status IS NULL
   AND direction = 'out'
   AND draw_id IS NULL
   AND status <> 'void';

-- 2. Resolve the in_draw / null-draw_id orphans -> 'unreimbursed'.
--    These claim to be in a draw but link to none. Resetting to 'unreimbursed' removes the
--    limbo: non-void orphans become re-drawable; the currently-void ones stay hidden by the
--    composer's void filter (belt: they are void, not payable).
UPDATE job_transactions
   SET reimbursement_status = 'unreimbursed'
 WHERE reimbursement_status = 'in_draw'
   AND draw_id IS NULL;

-- 3. Harden compose_draw: the flip-to-in_draw guard was reimbursement_status='unreimbursed'
--    exactly. Now that the loader treats NULL as unreimbursed, a NULL row could get a
--    draw_line_item but never flip -> double-draw. Guard becomes COALESCE(...) so NULL flips
--    correctly, and status<>'void' so a void row can never be pulled into a draw.
CREATE OR REPLACE FUNCTION public.compose_draw(p_job_id text, p_title text, p_description text, p_target_amount numeric, p_apply_bucket boolean, p_line_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_tenant_id   UUID;
  v_cost_plus   BOOLEAN;
  v_draw_id     UUID;
  v_draw_number INT;
  v_item        JSONB;
  v_tx_ids      UUID[];
  v_role        TEXT;
  v_tx_flipped  INT := 0;
  v_blocked     UUID[];
BEGIN
  -- Auth
  v_role := get_my_role();
  IF v_role NOT IN ('owner', 'project_manager') THEN
    RAISE EXCEPTION 'Only owner or project_manager can compose draws';
  END IF;

  -- Job validation
  SELECT tenant_id, cost_plus INTO v_tenant_id, v_cost_plus
    FROM jobs WHERE id = p_job_id;
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Job not found'; END IF;
  IF v_cost_plus IS NOT TRUE THEN RAISE EXCEPTION 'Job is not cost-plus'; END IF;
  IF v_tenant_id <> get_my_tenant_id() THEN RAISE EXCEPTION 'Cross-tenant access denied'; END IF;

  -- Collect non-null transaction_ids from input up front
  SELECT ARRAY(
    SELECT (elem->>'transaction_id')::UUID
      FROM jsonb_array_elements(p_line_items) elem
     WHERE (elem->>'transaction_id') IS NOT NULL
       AND (elem->>'transaction_id') <> ''
  ) INTO v_tx_ids;

  -- Pre-flight: fail loud if any transaction is already in_draw
  IF cardinality(v_tx_ids) > 0 THEN
    SELECT ARRAY(
      SELECT id FROM job_transactions
       WHERE id = ANY(v_tx_ids)
         AND reimbursement_status = 'in_draw'
    ) INTO v_blocked;
    IF cardinality(v_blocked) > 0 THEN
      RAISE EXCEPTION
        'Cannot compose draw: % transaction(s) already in_draw — void their existing draw first. IDs: %',
        cardinality(v_blocked), v_blocked;
    END IF;
  END IF;

  -- Next draw_number
  SELECT COALESCE(MAX(draw_number), 0) + 1 INTO v_draw_number
    FROM draw_schedules WHERE job_id = p_job_id;

  -- Create draw_schedules row
  INSERT INTO draw_schedules
    (job_id, tenant_id, draw_number, title, description, target_amount, status)
  VALUES
    (p_job_id, v_tenant_id, v_draw_number, p_title, p_description, p_target_amount, 'planned')
  RETURNING id INTO v_draw_id;

  -- Insert draw_line_items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_items)
  LOOP
    INSERT INTO draw_line_items
      (tenant_id, draw_id, transaction_id, description,
       base_amount, markup_pct, markup_amount, total_with_markup,
       is_forward_looking, display_order, notes, created_by_id)
    VALUES
      (v_tenant_id,
       v_draw_id,
       NULLIF((v_item->>'transaction_id')::TEXT, '')::UUID,
       v_item->>'description',
       (v_item->>'base_amount')::NUMERIC,
       COALESCE((v_item->>'markup_pct')::NUMERIC, 0),
       COALESCE((v_item->>'markup_amount')::NUMERIC, 0),
       (v_item->>'total_with_markup')::NUMERIC,
       COALESCE((v_item->>'is_forward_looking')::BOOLEAN, false),
       COALESCE((v_item->>'display_order')::INT, 0),
       v_item->>'notes',
       auth.uid());
  END LOOP;

  -- Flip unreimbursed -> in_draw; capture actual row count.
  -- Guard: COALESCE(reimbursement_status,'unreimbursed') so legacy NULL rows flip correctly
  -- (never stranded, never double-drawn); status<>'void' so void rows can't enter a draw.
  IF cardinality(v_tx_ids) > 0 THEN
    UPDATE job_transactions
       SET reimbursement_status = 'in_draw',
           draw_id              = v_draw_id
     WHERE id = ANY(v_tx_ids)
       AND COALESCE(reimbursement_status, 'unreimbursed') = 'unreimbursed'
       AND status <> 'void';
    GET DIAGNOSTICS v_tx_flipped = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'draw_id',     v_draw_id,
    'draw_number', v_draw_number,
    'line_count',  jsonb_array_length(p_line_items),
    'tx_flipped',  v_tx_flipped
  );
END;
$function$;
