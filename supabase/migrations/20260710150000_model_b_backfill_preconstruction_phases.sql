-- Model B Phase 2 — one-time backfill of pre-construction phase rows.
--
-- Nothing ever advanced the Lead/Proposal/Contract job_phases rows, so on every
-- existing job they sit at not_started. This sets them to match each job's REAL
-- history (evidence, not jobs.status):
--   signed contract exists            → Lead, Proposal, Contract = complete
--   accepted estimate (contract_snapshot) → Lead, Proposal = complete, Contract = in_progress
--   status = 'proposal'               → Lead = complete, Proposal = in_progress
--   otherwise (lead / anything else)  → Lead = in_progress
--
-- Deliberately keyed off real signals, NOT jobs.status — a job whose status lies
-- (e.g. 'in_progress' with no signature/snapshot) is backfilled to its true stage,
-- so the shadow panel keeps flagging the lie rather than papering over it.
--
-- Forward-only (rank guard in WHERE — never regresses a complete row) and
-- idempotent (re-running advances nothing). Does NOT touch jobs.status.

WITH sig AS (
  SELECT DISTINCT job_id FROM contract_signatures WHERE type = 'contract'
),
snap AS (
  SELECT job_id FROM job_estimates WHERE estimate_data ? 'contract_snapshot'
),
lvl AS (
  SELECT j.id AS job_id,
    CASE
      WHEN s.job_id  IS NOT NULL THEN 'signed'
      WHEN sn.job_id IS NOT NULL THEN 'accepted'
      WHEN j.status = 'proposal'  THEN 'proposal'
      ELSE 'lead'
    END AS lvl
  FROM jobs j
  LEFT JOIN sig  s  ON s.job_id  = j.id
  LEFT JOIN snap sn ON sn.job_id = j.id
),
tgt AS (
  SELECT l.job_id, ph.phase_name,
    CASE ph.phase_name
      WHEN 'Lead' THEN
        CASE WHEN l.lvl IN ('signed','accepted','proposal') THEN 'complete' ELSE 'in_progress' END
      WHEN 'Proposal' THEN
        CASE WHEN l.lvl IN ('signed','accepted') THEN 'complete'
             WHEN l.lvl = 'proposal' THEN 'in_progress' ELSE 'not_started' END
      WHEN 'Contract' THEN
        CASE WHEN l.lvl = 'signed' THEN 'complete'
             WHEN l.lvl = 'accepted' THEN 'in_progress' ELSE 'not_started' END
    END AS new_status
  FROM lvl l
  CROSS JOIN (VALUES ('Lead'), ('Proposal'), ('Contract')) AS ph(phase_name)
)
UPDATE job_phases p
SET status       = tgt.new_status,
    started_at   = COALESCE(p.started_at, now()),
    completed_at = CASE WHEN tgt.new_status = 'complete' THEN COALESCE(p.completed_at, now()) ELSE p.completed_at END
FROM tgt
WHERE p.job_id = tgt.job_id
  AND p.phase_name = tgt.phase_name
  AND (CASE tgt.new_status WHEN 'complete' THEN 2 WHEN 'in_progress' THEN 1 ELSE 0 END)
    > (CASE p.status        WHEN 'complete' THEN 2 WHEN 'in_progress' THEN 1 ELSE 0 END);
