-- Bug 1: Add paid_at column to payments (stripe-webhook was writing to it but column didn't exist)
ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Backfill historical rows: any paid row with no paid_at gets updated_at or created_at as a proxy
UPDATE payments
SET paid_at = COALESCE(updated_at, created_at)
WHERE status = 'paid' AND paid_at IS NULL;

-- Bug 3: SQL function — canonical co_total for a job
CREATE OR REPLACE FUNCTION get_job_co_total(p_job_id TEXT)
RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM change_orders
  WHERE job_id = p_job_id AND status = 'approved';
$$ LANGUAGE SQL STABLE;

-- Bug 3: Trigger function — keeps jobs.co_total in sync on every CO change
CREATE OR REPLACE FUNCTION sync_job_co_total()
RETURNS TRIGGER AS $$
DECLARE
  v_job_id TEXT;
BEGIN
  v_job_id := COALESCE(NEW.job_id, OLD.job_id);
  UPDATE jobs SET co_total = get_job_co_total(v_job_id) WHERE id = v_job_id;
  -- AFTER triggers: return value is ignored; use OLD for DELETE safety
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_co_total ON change_orders;
CREATE TRIGGER trg_sync_co_total
AFTER INSERT OR UPDATE OR DELETE ON change_orders
FOR EACH ROW EXECUTE FUNCTION sync_job_co_total();
