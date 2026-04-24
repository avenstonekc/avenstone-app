-- ═══════════════════════════════════════════════════════════════════════════════
-- UNIFIED FINANCIAL LEDGER — job_transactions
-- Migrates payments + job_cost_invoices into one table.
-- Rollback path: DROP views; ALTER TABLE _deprecated_* RENAME TO <original>;
-- Safe to keep _deprecated_ tables for 2 weeks minimum.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── STEP 1: Create job_transactions ─────────────────────────────────────────

CREATE TABLE job_transactions (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID NOT NULL,
  job_id                    TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

  -- direction + type
  direction                 TEXT NOT NULL CHECK (direction IN ('in','out')),
  type                      TEXT NOT NULL CHECK (type IN (
    'client_payment','client_deposit','client_refund',
    'sub_payout','vendor_payment','material_purchase',
    'equipment_rental','permit','fuel','commission',
    'other_expense','other_income'
  )),

  -- money
  amount                    NUMERIC(12,2) NOT NULL,
  tax_amount                NUMERIC(12,2) DEFAULT 0,
  retainage_pct             NUMERIC(5,2)  DEFAULT 0,
  retainage_held            NUMERIC(12,2) DEFAULT 0,

  -- dates + status
  date_incurred             DATE NOT NULL DEFAULT CURRENT_DATE,
  date_paid                 DATE,
  due_date                  DATE,
  status                    TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'draft','pending','paid','overdue','void','refunded'
  )),

  -- who
  payer_or_payee_id         UUID,
  payer_or_payee_type       TEXT,
  payer_or_payee_name       TEXT,
  client_email              TEXT,  -- populated for direction='in' client payments

  -- linking
  phase_id                  UUID REFERENCES job_phases(id) ON DELETE SET NULL,
  cost_item_id              UUID,
  change_order_id           TEXT,  -- soft ref: change_orders.id is TEXT type

  -- attachments
  receipt_url               TEXT,
  lien_waiver_url           TEXT,
  lien_waiver_required      BOOLEAN DEFAULT FALSE,
  lien_waiver_signed_date   DATE,

  -- Stripe (direction='in' only)
  stripe_link               TEXT,
  stripe_session_id         TEXT,
  stripe_checkout_url       TEXT,
  stripe_payment_intent_id  TEXT,
  payment_method            TEXT,  -- stores draw type ('deposit','progress','final') for client payments

  -- QuickBooks (nullable, populated later)
  qb_account                TEXT,
  qb_customer               TEXT,
  qb_vendor                 TEXT,
  qb_class                  TEXT,
  qb_transaction_id         TEXT,
  qb_synced_at              TIMESTAMPTZ,

  -- meta
  description               TEXT,
  notes                     TEXT,
  draw_number               INT,
  created_by                UUID NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_transactions_job       ON job_transactions(job_id);
CREATE INDEX idx_job_transactions_tenant    ON job_transactions(tenant_id);
CREATE INDEX idx_job_transactions_status    ON job_transactions(status);
CREATE INDEX idx_job_transactions_direction ON job_transactions(direction);
CREATE INDEX idx_job_transactions_type      ON job_transactions(type);
CREATE INDEX idx_job_transactions_due_date  ON job_transactions(due_date);

-- ─── updated_at trigger (no moddatetime extension required) ──────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_job_transactions_updated_at
  BEFORE UPDATE ON job_transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Auto-set lien_waiver_required on sub/vendor payouts ─────────────────────

CREATE OR REPLACE FUNCTION set_lien_waiver_required()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.direction = 'out'
     AND NEW.type IN ('sub_payout','vendor_payment')
     AND NEW.amount > 0 THEN
    NEW.lien_waiver_required := TRUE;
  ELSE
    NEW.lien_waiver_required := FALSE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lien_waiver_required
  BEFORE INSERT OR UPDATE ON job_transactions
  FOR EACH ROW EXECUTE FUNCTION set_lien_waiver_required();

-- ─── STEP 2: Row Level Security ───────────────────────────────────────────────

ALTER TABLE job_transactions ENABLE ROW LEVEL SECURITY;

-- Staff: see all transactions in their tenant
CREATE POLICY jt_staff_select ON job_transactions FOR SELECT
USING (
  tenant_id = get_my_tenant_id()
  AND get_my_role() IN ('owner','project_manager','sales_rep')
);

-- Subs: see only their own payout rows
CREATE POLICY jt_sub_select ON job_transactions FOR SELECT
USING (
  tenant_id = get_my_tenant_id()
  AND get_my_role() = 'sub'
  AND direction = 'out'
  AND type IN ('sub_payout','vendor_payment')
  AND payer_or_payee_type = 'sub'
  AND payer_or_payee_id = auth.uid()
);

-- Clients: all direction='in' on their job; direction='out' only if cost_plus=true
CREATE POLICY jt_client_select ON job_transactions FOR SELECT
USING (
  tenant_id = get_my_tenant_id()
  AND get_my_role() = 'client'
  AND can_access_job(job_id)
  AND (
    direction = 'in'
    OR (
      direction = 'out'
      AND EXISTS (
        SELECT 1 FROM jobs j
        WHERE j.id = job_transactions.job_id AND j.cost_plus = true
      )
    )
  )
);

-- Write: owner / PM / sales_rep only
CREATE POLICY jt_staff_write ON job_transactions
FOR ALL
USING (
  tenant_id = get_my_tenant_id()
  AND get_my_role() IN ('owner','project_manager','sales_rep')
)
WITH CHECK (
  tenant_id = get_my_tenant_id()
);

-- ─── STEP 3: Backfill ────────────────────────────────────────────────────────
-- payments actual columns: id, tenant_id, job_id, amount, description,
--   payment_type, status, stripe_session_id, stripe_payment_intent_id,
--   client_email, paid_at, created_at, created_by, stripe_checkout_url

INSERT INTO job_transactions (
  id, tenant_id, job_id, direction, type, amount,
  date_incurred, date_paid, status,
  stripe_session_id, stripe_checkout_url, stripe_payment_intent_id,
  description, client_email, payment_method,
  created_by, created_at
)
SELECT
  id,
  tenant_id,
  job_id,
  'in',
  'client_payment',
  amount,
  COALESCE(paid_at::DATE, created_at::DATE, CURRENT_DATE),
  paid_at::DATE,
  status,
  stripe_session_id,
  stripe_checkout_url,
  stripe_payment_intent_id,
  description,
  client_email,
  payment_type,
  COALESCE(created_by, '8171742a-b586-4f13-be61-744e191a1896'::UUID),
  created_at
FROM payments
ON CONFLICT (id) DO NOTHING;

-- job_cost_invoices: tenant_id and job_id are on the table directly — no join needed
-- Actual columns: id, job_id, cost_item_id, tenant_id, date, amount, paid,
--   invoice_file_url, invoice_file_name, lien_waiver_file_url,
--   lien_waiver_file_name, lien_waiver_signed_date, created_at

INSERT INTO job_transactions (
  id, tenant_id, job_id, direction, type, amount,
  date_incurred, date_paid, status,
  cost_item_id, receipt_url, lien_waiver_url, lien_waiver_signed_date,
  created_by, created_at
)
SELECT
  id,
  tenant_id,
  job_id,
  'out',
  'vendor_payment',
  amount,
  date,
  CASE WHEN paid THEN date ELSE NULL END,
  CASE WHEN paid THEN 'paid' ELSE 'pending' END,
  cost_item_id,
  invoice_file_url,
  lien_waiver_file_url,
  lien_waiver_signed_date,
  '8171742a-b586-4f13-be61-744e191a1896'::UUID,
  created_at
FROM job_cost_invoices
ON CONFLICT (id) DO NOTHING;

-- ─── STEP 4: Rename originals, create compat views ───────────────────────────

ALTER TABLE payments RENAME TO _deprecated_payments_20260423;
ALTER TABLE job_cost_invoices RENAME TO _deprecated_job_cost_invoices_20260423;

-- payments view: exposes the same columns the UI reads
CREATE VIEW payments AS
SELECT
  id,
  tenant_id,
  job_id,
  description,
  amount,
  status,
  due_date,
  date_paid            AS paid_at,
  date_paid::TIMESTAMPTZ AS paid_date,
  client_email,
  payment_method       AS payment_type,
  stripe_session_id,
  stripe_checkout_url,
  stripe_payment_intent_id,
  created_by,
  created_at
FROM job_transactions
WHERE direction = 'in' AND type IN ('client_payment','client_deposit');

-- job_cost_invoices view: exposes the same columns CostsTab reads
CREATE VIEW job_cost_invoices AS
SELECT
  id,
  job_id,
  cost_item_id,
  tenant_id,
  date_incurred                 AS date,
  amount,
  (status = 'paid')             AS paid,
  receipt_url                   AS invoice_file_url,
  NULL::TEXT                    AS invoice_file_name,
  lien_waiver_url               AS lien_waiver_file_url,
  NULL::TEXT                    AS lien_waiver_file_name,
  lien_waiver_signed_date,
  created_at
FROM job_transactions
WHERE direction = 'out' AND cost_item_id IS NOT NULL;

-- ─── STEP 5: job-receipts bucket RLS ─────────────────────────────────────────
-- Storage bucket 'job-receipts' created via API.
-- Owner/PM/sales_rep: full access. Sub + client: blocked (Phase 2 concern).
-- TODO (Phase 2): Add client read access for cost-plus transactions.

INSERT INTO storage.buckets (id, name, public)
VALUES ('job-receipts', 'job-receipts', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "job_receipts_staff_all" ON storage.objects
FOR ALL
USING (
  bucket_id = 'job-receipts'
  AND get_my_role() IN ('owner','project_manager','sales_rep')
)
WITH CHECK (
  bucket_id = 'job-receipts'
  AND get_my_role() IN ('owner','project_manager','sales_rep')
);
