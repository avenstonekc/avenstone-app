-- ============================================================
-- Cost-Plus Arc — Phase 1B: BEFORE INSERT trigger on job_transactions
-- Stamps reimbursement_status='unreimbursed' and markup_pct based on
-- job type (sub_payout/labor → labor_markup_pct, else material_markup_pct)
-- for cost-plus jobs only. Non-cost-plus jobs: no-op.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION set_cost_plus_defaults_on_jt() RETURNS TRIGGER AS $$
DECLARE
  v_cost_plus       BOOLEAN;
  v_labor_markup    NUMERIC;
  v_material_markup NUMERIC;
BEGIN
  SELECT cost_plus,
         COALESCE(labor_markup_pct, 0),
         COALESCE(material_markup_pct, 0)
    INTO v_cost_plus, v_labor_markup, v_material_markup
    FROM jobs WHERE id = NEW.job_id;

  IF v_cost_plus = true AND NEW.direction = 'out' THEN
    -- Apply markup rate by expense type (only if caller didn't set one)
    IF (NEW.markup_pct IS NULL OR NEW.markup_pct = 0) THEN
      IF NEW.type IN ('sub_payout', 'labor') THEN
        NEW.markup_pct := v_labor_markup;
      ELSE
        NEW.markup_pct := v_material_markup;
      END IF;
    END IF;
    -- Default reimbursement_status to 'unreimbursed' if not already set
    IF NEW.reimbursement_status IS NULL THEN
      NEW.reimbursement_status := 'unreimbursed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jt_cost_plus_defaults ON job_transactions;
CREATE TRIGGER jt_cost_plus_defaults
  BEFORE INSERT ON job_transactions
  FOR EACH ROW EXECUTE FUNCTION set_cost_plus_defaults_on_jt();

COMMIT;
