-- SUB_INVOICES_ARC Phase 4a — ledger propagation
-- Creates: add_sub_invoice_payment_with_ledger() — atomic payment + job_transactions insert
-- Backfills: existing non-voided sub_invoice_payments that have no transaction_id
--
-- Audit-confirmed column map (job_transactions):
--   tenant_id, job_id, direction ('out'), type ('sub_payout'), amount,
--   date_incurred (NOT NULL — used as paid date), date_paid (nullable),
--   status ('paid'), payer_or_payee_type, payer_or_payee_name, payment_method,
--   description, notes, created_by (UUID, NOT NULL — auth.uid())
--
-- invoice_id on job_transactions is a FK to invoices (client billing table) — NOT used here.
-- Linkage runs the other direction: sub_invoice_payments.transaction_id → job_transactions.id.
--
-- SECURITY INVOKER: jt_staff_write policy covers owner+PM; sip_modify covers same.
-- auth.uid() works inside INVOKER context for all inserts.

-- ─── Part 1: atomic payment + ledger function ────────────────────────────────

CREATE OR REPLACE FUNCTION add_sub_invoice_payment_with_ledger(
  p_sub_invoice_id  UUID,
  p_amount          NUMERIC,
  p_paid_date       DATE,
  p_method          TEXT,
  p_reference       TEXT    DEFAULT NULL,
  p_notes           TEXT    DEFAULT NULL
)
RETURNS TABLE(payment_id UUID, transaction_id UUID, new_status TEXT)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_inv        RECORD;
  v_payment_id UUID;
  v_tx_id      UUID;
  v_new_status TEXT;
BEGIN
  -- Fetch invoice state + sub contact name in one join
  SELECT
    si.tenant_id,
    si.job_id,
    si.invoice_number,
    si.voided_at,
    si.disputed,
    si.approved_at,
    c.name AS sub_name
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
  -- tenant_id sourced from sub_invoice row — the JS-layer insert was missing this.
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

  -- Insert matching job_transactions row (expense, direction='out', type='sub_payout')
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

  -- Derive new invoice status (source of truth in DB)
  v_new_status := compute_sub_invoice_status(p_sub_invoice_id);

  RETURN QUERY SELECT v_payment_id, v_tx_id, v_new_status;
END;
$$;

GRANT EXECUTE ON FUNCTION add_sub_invoice_payment_with_ledger(UUID, NUMERIC, DATE, TEXT, TEXT, TEXT)
  TO authenticated;

-- ─── Part 2: backfill existing non-voided payments without a ledger row ───────
-- Runs as a one-time DO block; safe to re-run (WHERE transaction_id IS NULL guard).
-- Uses created_by_id as the created_by value; falls back to NULL (col is NOT NULL
-- on job_transactions so we use '00000000-0000-0000-0000-000000000000'::uuid for any
-- legacy rows where created_by_id IS NULL — shouldn't exist but defensive).

DO $$
DECLARE
  pmt    RECORD;
  v_inv  RECORD;
  v_tx_id UUID;
BEGIN
  FOR pmt IN
    SELECT * FROM sub_invoice_payments
    WHERE voided_at IS NULL AND transaction_id IS NULL
  LOOP
    SELECT
      si.tenant_id,
      si.job_id,
      si.invoice_number,
      c.name AS sub_name
    INTO v_inv
    FROM sub_invoices si
    JOIN contacts c ON c.id = si.sub_contact_id
    WHERE si.id = pmt.sub_invoice_id;

    IF NOT FOUND THEN
      CONTINUE;  -- orphaned payment, skip
    END IF;

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
      pmt.tenant_id,
      v_inv.job_id,
      'out',
      'sub_payout',
      pmt.amount,
      pmt.paid_date,
      pmt.paid_date,
      'paid',
      'sub',
      v_inv.sub_name,
      pmt.method,
      format('Payment to %s for invoice #%s%s — BACKFILLED',
        v_inv.sub_name,
        v_inv.invoice_number,
        CASE WHEN pmt.notes IS NOT NULL THEN ' — ' || pmt.notes ELSE '' END
      ),
      pmt.notes,
      COALESCE(pmt.created_by_id, '00000000-0000-0000-0000-000000000001'::uuid)
    )
    RETURNING id INTO v_tx_id;

    UPDATE sub_invoice_payments
    SET transaction_id = v_tx_id
    WHERE id = pmt.id;
  END LOOP;
END;
$$;
