-- SUB_INVOICES_ARC Phase 1 — schema foundation
-- Creates: sub_invoices, sub_invoice_payments, RLS, indexes, triggers, compute_sub_invoice_status
-- Locked decisions enforced: contacts.id is TEXT, currency CHECK='USD',
--   transaction_id bidirectional FK on sub_invoice_payments, status is DERIVED not stored.

-- ─── sub_invoices ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sub_invoices (
  id                        UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID    NOT NULL,
  job_id                    TEXT    NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,

  -- contacts.id is TEXT (confirmed via information_schema — not UUID)
  sub_contact_id            TEXT    NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,

  -- Invoice metadata
  invoice_number            TEXT    NOT NULL,
  auto_generated_number     BOOLEAN NOT NULL DEFAULT false,
  invoice_date              DATE    NOT NULL,
  due_date                  DATE,
  amount                    NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency                  TEXT    NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  description               TEXT,
  line_items                JSONB   DEFAULT NULL,  -- NULL = lump sum; array = itemized [{description,qty,unit_price,total}]

  -- Optional linkages
  related_schedule_item_id  UUID    REFERENCES schedule_items(id) ON DELETE SET NULL,
  invoice_file_id           UUID    REFERENCES job_files(id) ON DELETE SET NULL,
  lien_waiver_file_id       UUID    REFERENCES job_files(id) ON DELETE SET NULL,  -- reserved for lien waiver arc

  -- Approval state (single columns v1 — audit trail table deferred)
  approved_at               TIMESTAMPTZ,
  approved_by_id            UUID    REFERENCES profiles(id),

  -- Dispute state (boolean toggle, not a formal workflow)
  disputed                  BOOLEAN NOT NULL DEFAULT false,
  disputed_at               TIMESTAMPTZ,
  disputed_by_id            UUID    REFERENCES profiles(id),
  dispute_reason            TEXT,

  -- Void state (rare — sub double-billed, wrong job, etc.)
  voided_at                 TIMESTAMPTZ,
  voided_by_id              UUID    REFERENCES profiles(id),
  void_reason               TEXT,

  -- Provenance
  submitted_via             TEXT    NOT NULL DEFAULT 'manual_upload'
    CHECK (submitted_via IN ('manual_upload', 'pdf_upload', 'master_agent', 'sub_portal')),
  created_by_id             UUID    REFERENCES profiles(id),

  -- Audit
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Duplicate invoice number guard: same sub can't re-submit same invoice number on same job
  UNIQUE (tenant_id, job_id, sub_contact_id, invoice_number)
);

-- Active invoice lookup (job context — most common query, FinancialsTab load)
CREATE INDEX IF NOT EXISTS idx_sub_invoices_job
  ON sub_invoices(job_id)
  WHERE voided_at IS NULL;

-- Sub-level lookup (portal view, "what does this sub owe" queries)
CREATE INDEX IF NOT EXISTS idx_sub_invoices_sub
  ON sub_invoices(sub_contact_id)
  WHERE voided_at IS NULL;

-- Pending review queue (owner dashboard, Master Agent context load)
CREATE INDEX IF NOT EXISTS idx_sub_invoices_pending
  ON sub_invoices(tenant_id, invoice_date)
  WHERE approved_at IS NULL AND voided_at IS NULL AND disputed = false;

-- AP outstanding view (approved but not fully paid)
CREATE INDEX IF NOT EXISTS idx_sub_invoices_ap_outstanding
  ON sub_invoices(tenant_id, invoice_date)
  WHERE approved_at IS NOT NULL AND voided_at IS NULL;

ALTER TABLE sub_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS si_tenant_select ON sub_invoices;
CREATE POLICY si_tenant_select ON sub_invoices
  FOR SELECT TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS si_create ON sub_invoices;
CREATE POLICY si_create ON sub_invoices
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM profiles
    WHERE id = auth.uid() AND role IN ('owner', 'project_manager', 'sales_rep')
  ));

-- Only owner and PM can update (approve, dispute, void, edit)
DROP POLICY IF EXISTS si_modify ON sub_invoices;
CREATE POLICY si_modify ON sub_invoices
  FOR UPDATE TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM profiles
    WHERE id = auth.uid() AND role IN ('owner', 'project_manager')
  ))
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM profiles
    WHERE id = auth.uid() AND role IN ('owner', 'project_manager')
  ));

CREATE TRIGGER sub_invoices_updated_at
  BEFORE UPDATE ON sub_invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── sub_invoice_payments ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sub_invoice_payments (
  id              UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID    NOT NULL,
  sub_invoice_id  UUID    NOT NULL REFERENCES sub_invoices(id) ON DELETE CASCADE,

  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  paid_date       DATE    NOT NULL,
  method          TEXT    NOT NULL
    CHECK (method IN ('check', 'ach', 'cash', 'card', 'other')),
  reference       TEXT,   -- check number, ACH confirmation, transaction ID, etc.
  notes           TEXT,

  -- Void state (retained for audit trail — excluded from paid_sum computation)
  voided_at       TIMESTAMPTZ,
  voided_by_id    UUID    REFERENCES profiles(id),
  void_reason     TEXT,

  -- Bidirectional FK to job_transactions (populated in Phase 4 cash accounting integration)
  -- job_transactions.invoice_id UUID references back to sub_invoices.id
  transaction_id  UUID    REFERENCES job_transactions(id) ON DELETE SET NULL,

  created_by_id   UUID    REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary lookup: non-voided payments for a given invoice
CREATE INDEX IF NOT EXISTS idx_sip_invoice
  ON sub_invoice_payments(sub_invoice_id)
  WHERE voided_at IS NULL;

-- Cash accounting view: all non-voided payments in a date range per tenant
CREATE INDEX IF NOT EXISTS idx_sip_tenant_date
  ON sub_invoice_payments(tenant_id, paid_date)
  WHERE voided_at IS NULL;

ALTER TABLE sub_invoice_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sip_tenant_select ON sub_invoice_payments;
CREATE POLICY sip_tenant_select ON sub_invoice_payments
  FOR SELECT TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS sip_modify ON sub_invoice_payments;
CREATE POLICY sip_modify ON sub_invoice_payments
  FOR ALL TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM profiles
    WHERE id = auth.uid() AND role IN ('owner', 'project_manager')
  ))
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM profiles
    WHERE id = auth.uid() AND role IN ('owner', 'project_manager')
  ));

CREATE TRIGGER sub_invoice_payments_updated_at
  BEFORE UPDATE ON sub_invoice_payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── compute_sub_invoice_status ───────────────────────────────────────────────
-- Status is DERIVED, not stored. Reads approval state + SUM of non-voided payments.
-- STABLE: reads DB, does not modify state. Re-computes on every call (correct by design).

CREATE OR REPLACE FUNCTION compute_sub_invoice_status(p_invoice_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  inv      RECORD;
  paid_sum NUMERIC;
BEGIN
  SELECT * INTO inv FROM sub_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  -- Voided wins over all other states
  IF inv.voided_at IS NOT NULL THEN RETURN 'voided'; END IF;

  -- Disputed wins over payment state
  IF inv.disputed THEN RETURN 'disputed'; END IF;

  -- Sum all non-voided payments for this invoice
  SELECT COALESCE(SUM(amount), 0)
  INTO   paid_sum
  FROM   sub_invoice_payments
  WHERE  sub_invoice_id = p_invoice_id
  AND    voided_at IS NULL;

  -- Not yet approved: pending_review regardless of paid_sum
  IF inv.approved_at IS NULL THEN
    RETURN 'pending_review';
  END IF;

  -- Approved — check payment coverage
  IF paid_sum = 0 THEN
    RETURN 'approved';
  END IF;
  IF paid_sum < inv.amount THEN
    RETURN 'partially_paid';
  END IF;
  -- paid_sum >= amount covers exact payment and overpayment (Locked Decision 6)
  RETURN 'paid';
END;
$$;
