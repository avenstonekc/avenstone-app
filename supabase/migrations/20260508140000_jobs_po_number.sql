-- jobs.po_number — YY-NNN PO format, unique per tenant
-- Used by Master agent receipt-from-photo to map receipt PO → job

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS po_number TEXT;

-- Backfill existing rows: ordered by created_at within (tenant_id, year)
WITH numbered AS (
  SELECT
    id,
    to_char(created_at, 'YY') || '-' || lpad(
      (row_number() OVER (
        PARTITION BY tenant_id, date_trunc('year', created_at)
        ORDER BY created_at
      ))::text,
      3, '0'
    ) AS po
  FROM jobs
  WHERE po_number IS NULL
)
UPDATE jobs SET po_number = numbered.po
FROM numbered
WHERE jobs.id = numbered.id;

-- Unique within tenant
CREATE UNIQUE INDEX IF NOT EXISTS jobs_po_number_tenant_unique
  ON jobs(tenant_id, po_number);

-- Lookup index for agent's get_jobs by PO
CREATE INDEX IF NOT EXISTS jobs_po_number_idx ON jobs(po_number);

-- Auto-generate trigger: BEFORE INSERT, set po_number if NULL
CREATE OR REPLACE FUNCTION set_job_po_number()
RETURNS TRIGGER AS $$
DECLARE
  yy TEXT;
  cnt INTEGER;
BEGIN
  IF NEW.po_number IS NOT NULL THEN
    RETURN NEW;
  END IF;
  yy := to_char(coalesce(NEW.created_at, now()), 'YY');
  SELECT COUNT(*) + 1 INTO cnt
  FROM jobs
  WHERE tenant_id = NEW.tenant_id
    AND to_char(created_at, 'YY') = yy;
  NEW.po_number := yy || '-' || lpad(cnt::text, 3, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jobs_po_number_set ON jobs;
CREATE TRIGGER jobs_po_number_set
  BEFORE INSERT ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION set_job_po_number();

NOTIFY pgrst, 'reload schema';
