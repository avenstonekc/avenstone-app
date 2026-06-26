-- P1A follow-up: persist the session-sourced estimate mark onto job_estimates.
-- scope_origin tracks HOW the scope was captured, not what generated the estimate.
-- 'manual'  — rep built scope in the desk estimator (default; all existing rows)
-- 'session' — scope was prefilled from a consultation session (P1A flow)
-- 'incomplete' — reserved for 1B: force-drafted past an incomplete scope interview
-- Block 3 approval queue will read this column to surface origin context to the approver.
ALTER TABLE job_estimates
  ADD COLUMN scope_origin TEXT NOT NULL DEFAULT 'manual';
