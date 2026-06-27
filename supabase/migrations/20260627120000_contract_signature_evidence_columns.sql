-- CONTRACT_SIGNING Step 1a — frozen-evidence columns on contract_signatures.
--
-- The signed contract must carry, immutably, the price + scope the client agreed to.
-- These two columns are written at sign time (Step 1b) from the transport snapshot in
-- job_estimates.estimate_data.contract_snapshot:
--   contract_total  — the grand total the client signed (matches jobs.contract_value at accept)
--   scope_snapshot  — the priced scope rows + totals JSON, frozen at the moment of signature
--
-- ip_address is a separate slice and is intentionally NOT added here.

ALTER TABLE contract_signatures
  ADD COLUMN IF NOT EXISTS contract_total NUMERIC;

ALTER TABLE contract_signatures
  ADD COLUMN IF NOT EXISTS scope_snapshot JSONB;
