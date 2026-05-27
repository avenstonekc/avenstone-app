-- ============================================================
-- Cost-Plus Arc — Phase 1B: compose_draw + void_draw RPCs
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION compose_draw(
  p_job_id          TEXT,
  p_title           TEXT,
  p_description     TEXT,
  p_target_amount   NUMERIC,
  p_apply_bucket    BOOLEAN,
  p_line_items      JSONB
) RETURNS JSONB AS $$
DECLARE
  v_tenant_id      UUID;
  v_cost_plus      BOOLEAN;
  v_draw_id        UUID;
  v_draw_number    INT;
  v_item           JSONB;
  v_tx_ids         UUID[] := ARRAY[]::UUID[];
  v_role           TEXT;
BEGIN
  -- Auth: owner or project_manager only
  v_role := get_my_role();
  IF v_role NOT IN ('owner', 'project_manager') THEN
    RAISE EXCEPTION 'Only owner or project_manager can compose draws';
  END IF;

  -- Load job + verify cost_plus + tenant for RLS-aware insert
  SELECT tenant_id, cost_plus INTO v_tenant_id, v_cost_plus
    FROM jobs WHERE id = p_job_id;
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Job not found'; END IF;
  IF v_cost_plus IS NOT TRUE THEN RAISE EXCEPTION 'Job is not cost-plus'; END IF;
  IF v_tenant_id <> get_my_tenant_id() THEN RAISE EXCEPTION 'Cross-tenant access denied'; END IF;

  -- Next draw_number for the job
  SELECT COALESCE(MAX(draw_number), 0) + 1 INTO v_draw_number
    FROM draw_schedules WHERE job_id = p_job_id;

  -- Create draw_schedules row (status='planned')
  -- Note: draw_schedules has no created_by_id column
  INSERT INTO draw_schedules
    (job_id, tenant_id, draw_number, title, description, target_amount, status)
  VALUES
    (p_job_id, v_tenant_id, v_draw_number, p_title, p_description, p_target_amount, 'planned')
  RETURNING id INTO v_draw_id;

  -- Insert draw_line_items + collect transaction_ids for flip
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

    IF (v_item->>'transaction_id') IS NOT NULL AND (v_item->>'transaction_id') <> '' THEN
      v_tx_ids := array_append(v_tx_ids, (v_item->>'transaction_id')::UUID);
    END IF;
  END LOOP;

  -- Flip linked transactions: unreimbursed → in_draw, populate draw_id
  IF array_length(v_tx_ids, 1) > 0 THEN
    UPDATE job_transactions
       SET reimbursement_status = 'in_draw',
           draw_id              = v_draw_id
     WHERE id = ANY(v_tx_ids)
       AND reimbursement_status = 'unreimbursed';
  END IF;

  RETURN jsonb_build_object(
    'draw_id', v_draw_id,
    'draw_number', v_draw_number,
    'line_count', jsonb_array_length(p_line_items),
    'tx_flipped', COALESCE(array_length(v_tx_ids, 1), 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

GRANT EXECUTE ON FUNCTION compose_draw(TEXT, TEXT, TEXT, NUMERIC, BOOLEAN, JSONB) TO authenticated;

-- -----------------------------------------------

CREATE OR REPLACE FUNCTION void_draw(p_draw_id UUID) RETURNS JSONB AS $$
DECLARE
  v_tenant_id UUID;
  v_role      TEXT;
  v_tx_count  INT := 0;
  v_li_count  INT := 0;
BEGIN
  v_role := get_my_role();
  IF v_role NOT IN ('owner', 'project_manager') THEN
    RAISE EXCEPTION 'Only owner or project_manager can void draws';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM draw_schedules WHERE id = p_draw_id;
  IF v_tenant_id IS NULL THEN RAISE EXCEPTION 'Draw not found'; END IF;
  IF v_tenant_id <> get_my_tenant_id() THEN RAISE EXCEPTION 'Cross-tenant access denied'; END IF;

  -- Block voiding if a paid invoice is linked
  IF EXISTS (SELECT 1 FROM invoices WHERE draw_id = p_draw_id AND status = 'paid') THEN
    RAISE EXCEPTION 'Cannot void a draw with a paid invoice; void the invoice first';
  END IF;

  -- Reverse linked transactions: in_draw → unreimbursed, clear draw_id
  UPDATE job_transactions
     SET reimbursement_status = 'unreimbursed',
         draw_id              = NULL
   WHERE draw_id = p_draw_id
     AND reimbursement_status = 'in_draw';
  GET DIAGNOSTICS v_tx_count = ROW_COUNT;

  -- Delete draw_line_items
  DELETE FROM draw_line_items WHERE draw_id = p_draw_id;
  GET DIAGNOSTICS v_li_count = ROW_COUNT;

  -- Mark draw cancelled
  UPDATE draw_schedules SET status = 'cancelled' WHERE id = p_draw_id;

  RETURN jsonb_build_object(
    'draw_id', p_draw_id,
    'tx_reverted', v_tx_count,
    'line_items_deleted', v_li_count
  );
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

GRANT EXECUTE ON FUNCTION void_draw(UUID) TO authenticated;

COMMIT;
