-- Backlog item #8 — progress % re-source (2026-07-16)
-- Header % reads jobs.phase_pct_complete. The old trigger computed it as
-- ROUND(complete_phases / all_phases * 100), which (a) scored in_progress work as 0
-- and (b) depended on job_phases lifecycle rows that never sync with jobs.status —
-- yielding in_progress jobs at 0% and a status=complete job at 10%.
--
-- DECIDED: % derives from jobs.status (canonical lifecycle tracker per phaseGates.js:14)
-- with trade-phase interpolation inside the in_progress band. job_phases lifecycle rows
-- are NOT repaired; they no longer gate the number.
--
-- jobs.phase_pct_complete stays the stored output column — no header/read code changes.

-- ── Compute helper: pure function of (status, job_id) ────────────────────────────
-- Trade phases = job_phases that are NOT lifecycle stages. The lifecycle names mirror
-- the jobs.status enum (Avenstone DEFAULT_PHASES). NOTE (multi-tenant): white-label
-- tenants with a different phase taxonomy would need this lifecycle-name set as
-- per-tenant config — flagged for later; Avenstone is the only live tenant today.
CREATE OR REPLACE FUNCTION public.compute_phase_pct(p_status text, p_job_id text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  total_trade integer;
  done_trade  integer;
  wip_trade   integer;
  band        numeric;
BEGIN
  SELECT
    count(*) FILTER (WHERE phase_name NOT IN ('Lead','Proposal','Contract','Complete')),
    count(*) FILTER (WHERE phase_name NOT IN ('Lead','Proposal','Contract','Complete') AND status = 'complete'),
    count(*) FILTER (WHERE phase_name NOT IN ('Lead','Proposal','Contract','Complete') AND status = 'in_progress')
  INTO total_trade, done_trade, wip_trade
  FROM job_phases
  WHERE job_id = p_job_id;

  -- in_progress band: 20 floor -> 90 when all trade phases complete; wip counts 0.5.
  band := 20 + COALESCE((done_trade + 0.5 * wip_trade)::numeric / NULLIF(total_trade, 0) * 70, 0);

  RETURN CASE p_status
    WHEN 'lead'          THEN 0
    WHEN 'proposal'      THEN 5
    WHEN 'contract'      THEN 15
    WHEN 'in_progress'   THEN ROUND(band)::int
    WHEN 'on_hold'       THEN ROUND(band)::int   -- lateral pause mid-construction: same band
    WHEN 'final_touches' THEN 90
    WHEN 'complete'      THEN 100
    -- legacy/non-canonical (bid_sent, active) or NULL: fall back to the band so an
    -- active job never reads 0 purely from an un-migrated status label.
    ELSE ROUND(band)::int
  END;
END;
$function$;

-- ── job_phases trigger fn (rewired to the new formula) ──────────────────────────
-- Existing trigger on_phase_status_change (AFTER I/U/D OF status ON job_phases)
-- continues to call this. The UPDATE touches only phase_pct_complete, so it does NOT
-- fire the jobs "UPDATE OF status" trigger below (no recursion).
CREATE OR REPLACE FUNCTION public.update_job_phase_pct()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_job    text;
  v_status text;
BEGIN
  v_job := COALESCE(NEW.job_id, OLD.job_id);
  SELECT status INTO v_status FROM jobs WHERE id = v_job;
  IF v_status IS NOT NULL THEN
    UPDATE jobs SET phase_pct_complete = public.compute_phase_pct(v_status, v_job) WHERE id = v_job;
  END IF;
  RETURN NEW;
END;
$function$;

-- ── jobs trigger fn — recompute on lifecycle transitions ────────────────────────
-- BEFORE trigger sets NEW.phase_pct_complete in-place (no cascade UPDATE).
CREATE OR REPLACE FUNCTION public.set_job_phase_pct_from_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  NEW.phase_pct_complete := public.compute_phase_pct(NEW.status, NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS jobs_phase_pct_on_status ON public.jobs;
CREATE TRIGGER jobs_phase_pct_on_status
  BEFORE INSERT OR UPDATE OF status ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_job_phase_pct_from_status();

-- ── One-time backfill: recompute every job under the new formula ────────────────
UPDATE jobs SET phase_pct_complete = public.compute_phase_pct(status, id)
WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
