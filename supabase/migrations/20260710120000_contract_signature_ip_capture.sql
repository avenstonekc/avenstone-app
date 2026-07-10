-- CONTRACT_SIGNING final evidence slice — server-captured signer IP + user agent.
--
-- The 2026-07 audit proved contract_signatures had NO ip_address column (the arc doc's
-- claim that it existed — CONTRACT_SIGNING_ARC.md lines 38/62 — was wrong). This slice
-- ADDs it, plus user_agent, for the ESIGN/UETA audit trail.
--
-- Both NULLABLE by design: historical rows stay null, and a failed capture must never
-- block a signature (capture is post-save evidence enrichment, not a state change).
-- ip_address is INET — captured server-side from x-forwarded-for; a client-reported IP
-- is worthless as evidence. user_agent is the signer's browser UA at sign time.
--
-- No RLS change: the capture UPDATE runs via the service role (record-signature-evidence
-- edge fn), which bypasses RLS. The existing read/insert policies are unaffected.

ALTER TABLE contract_signatures
  ADD COLUMN IF NOT EXISTS ip_address inet NULL;

ALTER TABLE contract_signatures
  ADD COLUMN IF NOT EXISTS user_agent text NULL;
