-- ============================================================
-- Cost-Plus Arc — Phase 1A: schema foundation
-- ALTERs jobs + job_transactions, creates draw_line_items,
-- adds RLS + indexes, backfills existing cost-plus data.
-- Trigger + helper functions ship in Phase 1B.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- jobs: two markup columns
-- ------------------------------------------------------------
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS labor_markup_pct    NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS material_markup_pct NUMERIC DEFAULT 0;

UPDATE jobs
   SET labor_markup_pct    = COALESCE(default_markup_pct, 0),
       material_markup_pct = COALESCE(default_markup_pct, 0)
 WHERE cost_plus = true;

-- ------------------------------------------------------------
-- job_transactions: cost-plus structural columns
-- ------------------------------------------------------------
ALTER TABLE job_transactions
  ADD COLUMN IF NOT EXISTS draw_id UUID
    REFERENCES draw_schedules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reimbursement_status TEXT
    CHECK (reimbursement_status IN ('unreimbursed', 'in_draw', 'reimbursed')),
  ADD COLUMN IF NOT EXISTS markup_pct    NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reimbursed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_jt_draw
  ON job_transactions(draw_id) WHERE draw_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jt_reimb_unreim
  ON job_transactions(job_id, reimbursement_status)
  WHERE reimbursement_status = 'unreimbursed';
CREATE INDEX IF NOT EXISTS idx_jt_bucket
  ON job_transactions(job_id)
  WHERE direction = 'in' AND invoice_id IS NULL;

-- ------------------------------------------------------------
-- draw_line_items: new table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS draw_line_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL,
  draw_id            UUID NOT NULL REFERENCES draw_schedules(id) ON DELETE CASCADE,
  transaction_id     UUID REFERENCES job_transactions(id) ON DELETE RESTRICT,
  description        TEXT NOT NULL,
  base_amount        NUMERIC(12,2) NOT NULL CHECK (base_amount >= 0),
  markup_pct         NUMERIC NOT NULL DEFAULT 0 CHECK (markup_pct >= 0),
  markup_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_with_markup  NUMERIC(12,2) NOT NULL,
  is_forward_looking BOOLEAN NOT NULL DEFAULT false,
  display_order      INT NOT NULL DEFAULT 0,
  notes              TEXT,
  created_by_id      UUID REFERENCES profiles(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_dli_fwd_or_tx CHECK (
    (is_forward_looking = true  AND transaction_id IS NULL) OR
    (is_forward_looking = false AND transaction_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_dli_draw
  ON draw_line_items(draw_id);
CREATE INDEX IF NOT EXISTS idx_dli_transaction
  ON draw_line_items(transaction_id)
  WHERE transaction_id IS NOT NULL;

ALTER TABLE draw_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dli_tenant_select ON draw_line_items;
CREATE POLICY dli_tenant_select ON draw_line_items
  FOR SELECT TO authenticated
  USING (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS dli_modify ON draw_line_items;
CREATE POLICY dli_modify ON draw_line_items
  FOR ALL TO authenticated
  USING      (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner', 'project_manager'))
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner', 'project_manager'));

DROP TRIGGER IF EXISTS draw_line_items_updated_at ON draw_line_items;
CREATE TRIGGER draw_line_items_updated_at
  BEFORE UPDATE ON draw_line_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- Backfill existing cost-plus rows
-- ------------------------------------------------------------

-- Step 1: mark expense rows reimbursed ONLY if they were tied to a
-- draw_number AND that draw is paid AND a paid invoice exists for it.
-- The invoice JOIN is the tightening — prevents stale draw_number values
-- on transactions that were never actually billed from getting flipped
-- to reimbursed.
UPDATE job_transactions jt
   SET reimbursement_status = 'reimbursed',
       reimbursed_at        = NOW()
  FROM jobs j
  JOIN draw_schedules ds
    ON ds.job_id  = j.id
   AND ds.status  = 'paid'
  JOIN invoices inv
    ON inv.draw_id = ds.id
   AND inv.status  = 'paid'
 WHERE jt.job_id              = j.id
   AND j.cost_plus            = true
   AND jt.direction           = 'out'
   AND jt.status              = 'paid'
   AND jt.reimbursement_status IS NULL
   AND jt.draw_number         = ds.draw_number;

-- Step 2: remaining cost-plus expense rows → unreimbursed
UPDATE job_transactions jt
   SET reimbursement_status = 'unreimbursed'
  FROM jobs j
 WHERE jt.job_id              = j.id
   AND j.cost_plus            = true
   AND jt.direction           = 'out'
   AND jt.reimbursement_status IS NULL;

COMMIT;
