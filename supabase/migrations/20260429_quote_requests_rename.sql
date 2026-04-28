-- Rename invitations_to_bid → quote_requests + add procurement-substrate columns.
-- Keeps a compatibility view so SubPortal continues working during deploy.
-- RLS policies survive the rename (attached to table OID, not name).
-- FK in bid_responses.invitation_id updates automatically (Postgres tracks by OID).

ALTER TABLE invitations_to_bid RENAME TO quote_requests;

ALTER TABLE quote_requests
  ADD COLUMN kind            TEXT NOT NULL DEFAULT 'sub_bid'
    CHECK (kind IN ('sub_bid','material_rfq')),
  ADD COLUMN lead_time_days  INTEGER,
  ADD COLUMN needed_by_date  DATE;

CREATE INDEX IF NOT EXISTS idx_quote_requests_job  ON quote_requests(job_id);
CREATE INDEX IF NOT EXISTS idx_quote_requests_kind ON quote_requests(kind);

-- Compatibility view: keep the old name addressable for one release.
-- Drop in a follow-up cleanup migration after confirming no callers reference it.
CREATE OR REPLACE VIEW invitations_to_bid AS
  SELECT * FROM quote_requests;
