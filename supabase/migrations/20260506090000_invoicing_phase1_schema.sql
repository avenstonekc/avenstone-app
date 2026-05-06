-- ===========================================================================
-- Invoicing Phase 1: schema foundation
-- New: draw_schedules, invoices, invoice_line_items
-- ALTER: job_transactions adds invoice_id audit FK
-- Function: next_invoice_number(tenant_id) generates per-tenant year-prefixed numbers
-- Strictly additive. No legacy tables touched.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- draw_schedules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS draw_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  draw_number INT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  target_amount NUMERIC NOT NULL,
  target_date DATE,
  phase TEXT,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'in_progress', 'paid', 'cancelled')),
  invoiced_amount NUMERIC NOT NULL DEFAULT 0,
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_draw_per_job
  ON draw_schedules (job_id, draw_number);
CREATE INDEX IF NOT EXISTS idx_draw_tenant_status
  ON draw_schedules (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_draw_job ON draw_schedules (job_id);

ALTER TABLE draw_schedules ENABLE ROW LEVEL SECURITY;

-- Client gets read access to their own job's draws (transparency on billing schedule)
CREATE POLICY draw_schedules_select ON draw_schedules
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND (
      get_my_role() IN ('owner', 'project_manager', 'sales_rep')
      OR (
        get_my_role() = 'client'
        AND job_id IN (SELECT id FROM jobs WHERE client_user_id = auth.uid())
      )
    )
  );

CREATE POLICY draw_schedules_insert ON draw_schedules
  FOR INSERT WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager', 'sales_rep')
  );

CREATE POLICY draw_schedules_update ON draw_schedules
  FOR UPDATE USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager', 'sales_rep')
  );

CREATE POLICY draw_schedules_delete ON draw_schedules
  FOR DELETE USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() = 'owner'
  );

-- ---------------------------------------------------------------------------
-- invoices
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  draw_id UUID REFERENCES draw_schedules(id) ON DELETE SET NULL,

  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,

  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  amount_paid NUMERIC NOT NULL DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'viewed', 'paid', 'partially_paid', 'overdue', 'void')),

  pdf_url TEXT,
  notes TEXT,
  internal_notes TEXT,

  stripe_session_id TEXT,
  stripe_checkout_url TEXT,

  created_by_id UUID REFERENCES profiles(id),
  sent_at TIMESTAMPTZ,
  sent_by_id UUID REFERENCES profiles(id),
  first_viewed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  voided_by_id UUID REFERENCES profiles(id),
  void_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_number_per_tenant
  ON invoices (tenant_id, invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoice_tenant_status
  ON invoices (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_invoice_job ON invoices (job_id);
CREATE INDEX IF NOT EXISTS idx_invoice_draw ON invoices (draw_id);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- Client sees their own invoices, but NOT drafts (gives PM space to compose privately)
CREATE POLICY invoices_select ON invoices
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND (
      get_my_role() IN ('owner', 'project_manager', 'sales_rep')
      OR (
        get_my_role() = 'client'
        AND status != 'draft'
        AND job_id IN (SELECT id FROM jobs WHERE client_user_id = auth.uid())
      )
    )
  );

CREATE POLICY invoices_insert ON invoices
  FOR INSERT WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager', 'sales_rep')
  );

CREATE POLICY invoices_update ON invoices
  FOR UPDATE USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager', 'sales_rep')
  );

CREATE POLICY invoices_delete ON invoices
  FOR DELETE USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() = 'owner'
  );

-- ---------------------------------------------------------------------------
-- invoice_line_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,

  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT,
  unit_price NUMERIC NOT NULL,
  line_total NUMERIC NOT NULL,

  source_type TEXT CHECK (source_type IN ('estimate_line_item', 'change_order', 'manual')),
  source_id UUID,
  phase TEXT,

  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_line_invoice
  ON invoice_line_items (invoice_id);

ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;

-- Mirror parent invoice's visibility — client can read line items of their non-draft invoices
CREATE POLICY invoice_line_items_select ON invoice_line_items
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND (
      get_my_role() IN ('owner', 'project_manager', 'sales_rep')
      OR (
        get_my_role() = 'client'
        AND invoice_id IN (
          SELECT id FROM invoices
          WHERE status != 'draft'
            AND job_id IN (SELECT id FROM jobs WHERE client_user_id = auth.uid())
        )
      )
    )
  );

CREATE POLICY invoice_line_items_insert ON invoice_line_items
  FOR INSERT WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager', 'sales_rep')
  );

CREATE POLICY invoice_line_items_update ON invoice_line_items
  FOR UPDATE USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager', 'sales_rep')
  );

CREATE POLICY invoice_line_items_delete ON invoice_line_items
  FOR DELETE USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager', 'sales_rep')
  );

-- ---------------------------------------------------------------------------
-- job_transactions: invoice_id audit FK
-- ---------------------------------------------------------------------------
ALTER TABLE job_transactions
  ADD COLUMN IF NOT EXISTS invoice_id UUID
  REFERENCES invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jt_invoice ON job_transactions (invoice_id);

-- ---------------------------------------------------------------------------
-- next_invoice_number(tenant_id) → text
-- Per-tenant, year-prefixed, zero-padded sequence: INV-YYYY-NNNN
-- Resets annually
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION next_invoice_number(p_tenant_id UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  current_year INT := EXTRACT(YEAR FROM NOW());
  next_seq INT;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(invoice_number, '-', 3) AS INT)
  ), 0) + 1
  INTO next_seq
  FROM invoices
  WHERE tenant_id = p_tenant_id
    AND invoice_number LIKE 'INV-' || current_year || '-%';
  RETURN 'INV-' || current_year || '-' || LPAD(next_seq::TEXT, 4, '0');
END;
$$;

-- ---------------------------------------------------------------------------
-- Schema reload
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
