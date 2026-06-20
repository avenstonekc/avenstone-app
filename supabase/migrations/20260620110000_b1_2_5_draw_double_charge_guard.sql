-- ============================================================
-- B1.2.5 — draw double-charge guard
-- 1. Partial UNIQUE index: one draw_line_item per transaction_id.
--    NULL transaction_id rows (forward-looking) are unaffected.
-- 2. compose_draw rewrite:
--    a. Pre-flight raises if any passed tx is already in_draw.
--    b. tx_flipped reports actual UPDATE row count (was: array length).
-- ============================================================

BEGIN;

-- ── Part 1: Partial unique index ────────────────────────────────────────────
-- Prevents the same transaction from appearing in two draws' line_items.
-- WHERE clause keeps NULL rows (forward-looking pre-billing) unrestricted.
CREATE UNIQUE INDEX idx_dli_unique_transaction
  ON draw_line_items (transaction_id)
  WHERE transaction_id IS NOT NULL;

-- ── Part 2: compose_draw — pre-flight + real tx_flipped ────────────────────
CREATE OR REPLACE FUNCTION compose_draw(
  p_job_id          TEXT,
  p_title           TEXT,
  p_description     TEXT,
  p_target_amount   NUMERIC,
  p_apply_bucket    BOOLEAN,
  p_line_items      JSONB
) RETURNS JSONB AS $$
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

  -- Flip unreimbursed → in_draw; capture actual row count
  IF cardinality(v_tx_ids) > 0 THEN
    UPDATE job_transactions
       SET reimbursement_status = 'in_draw',
           draw_id              = v_draw_id
     WHERE id = ANY(v_tx_ids)
       AND reimbursement_status = 'unreimbursed';
    GET DIAGNOSTICS v_tx_flipped = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'draw_id',     v_draw_id,
    'draw_number', v_draw_number,
    'line_count',  jsonb_array_length(p_line_items),
    'tx_flipped',  v_tx_flipped
  );
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

GRANT EXECUTE ON FUNCTION compose_draw(TEXT, TEXT, TEXT, NUMERIC, BOOLEAN, JSONB) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
