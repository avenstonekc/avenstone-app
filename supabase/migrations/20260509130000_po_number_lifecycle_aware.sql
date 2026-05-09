-- PO numbers belong to contracts and beyond — not leads or proposals.
-- Two bugs were colliding:
--   1. The trigger generated a PO for every status, including leads/proposals.
--   2. It used COUNT(*) + 1 instead of MAX(seq) + 1 — so when rows are deleted
--      the count goes backward and the next insert generates a duplicate.
--   3. The unique index on (tenant_id, po_number) is not NULL-safe out of the
--      box (PG default is "NULLs distinct" so multi-NULL is fine, but switching
--      to a partial index makes the intent explicit and survives any future
--      `NULLS NOT DISTINCT` change).

CREATE OR REPLACE FUNCTION public.set_job_po_number()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  yy TEXT;
  next_num INTEGER;
BEGIN
  -- Pre-contract statuses don't get a PO at all.
  IF NEW.status IN ('lead', 'proposal') THEN
    NEW.po_number := NULL;
    RETURN NEW;
  END IF;

  -- Respect an explicit PO if one was passed in.
  IF NEW.po_number IS NOT NULL THEN
    RETURN NEW;
  END IF;

  yy := to_char(coalesce(NEW.created_at, now()), 'YY');

  -- MAX-based numbering: tolerant of deletes; never re-issues a stale number.
  SELECT COALESCE(MAX(SUBSTRING(po_number FROM 4)::INTEGER), 0) + 1
    INTO next_num
  FROM jobs
  WHERE tenant_id = NEW.tenant_id
    AND po_number ~ ('^' || yy || '-[0-9]{3,}$');

  NEW.po_number := yy || '-' || lpad(next_num::text, 3, '0');
  RETURN NEW;
END;
$function$;

DROP INDEX IF EXISTS jobs_po_number_tenant_unique;
CREATE UNIQUE INDEX jobs_po_number_tenant_unique
  ON public.jobs (tenant_id, po_number)
  WHERE po_number IS NOT NULL;

NOTIFY pgrst, 'reload schema';
