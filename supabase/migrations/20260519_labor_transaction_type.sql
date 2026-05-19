-- Add 'labor' to job_transactions type CHECK constraint.
-- Represents direct hourly-labor expenses, distinct from sub_payout.
-- Lien-waiver trigger (set_lien_waiver_required) is inclusion-based
-- (sub_payout + vendor_payment only) — labor is automatically exempt.

ALTER TABLE job_transactions DROP CONSTRAINT job_transactions_type_check;

ALTER TABLE job_transactions ADD CONSTRAINT job_transactions_type_check
  CHECK (type = ANY (ARRAY[
    'client_payment', 'client_deposit', 'client_refund',
    'sub_payout', 'vendor_payment',
    'material_purchase', 'equipment_rental', 'permit', 'fuel',
    'commission', 'other_expense', 'other_income',
    'labor'
  ]::text[]));

-- qb_category_map: labor maps to Cost of Goods Sold.
-- Scoped to Avenstone tenant (same pattern as all existing rows — no platform-null rows).
-- Kalin tunes the QB account label later in Settings → QuickBooks.
INSERT INTO qb_category_map (id, tenant_id, tx_type, qb_account, qb_class, updated_at)
VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  'labor',
  'Labor',
  'Cost of Goods Sold',
  now()
);
