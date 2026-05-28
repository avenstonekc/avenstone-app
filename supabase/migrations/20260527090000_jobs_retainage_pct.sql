BEGIN;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS retainage_pct NUMERIC(5,2) DEFAULT 0
    CHECK (retainage_pct >= 0 AND retainage_pct <= 50);

COMMENT ON COLUMN jobs.retainage_pct IS 'Per-job retainage percentage (e.g. 10 = 10% held until final walkthrough). Cost-plus jobs only.';

COMMIT;
