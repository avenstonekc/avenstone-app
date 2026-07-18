-- CONSULTATION_MODE Slice 3 — recap generator.
-- (1) consultation_recaps: the rep-editable, scope-only recap doc composed from a session
--     (discussed items, scope basis, open items) — one per session, regenerable (upsert on
--     session_id). status draft|sent; pdf_path holds the private-bucket path once emailed.
-- (2) consultation_measurements.source: 'measure' (measure-mode chat) vs 'inline' (spoken
--     measurements the recap call pulled from the ambient transcript). Inline rows land
--     confirmed_by_rep=false so the rep's confirmation stays honest.
-- (3) consultation_photos.transcript_context: the ~last words spoken at shutter time,
--     captured client-side. The recap call turns each into a speech-derived caption
--     ("this is the north wall in the bathroom") — no vision call (that's Phase 3).
-- Multi-tenant: tenant_id + RLS. Kalin-locked 2026-07-18.

CREATE TABLE IF NOT EXISTS consultation_recaps (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL DEFAULT get_my_tenant_id(),
  session_id      UUID        REFERENCES consultation_sessions(id) ON DELETE CASCADE,
  job_id          TEXT,
  summary         TEXT,
  discussed_items JSONB       NOT NULL DEFAULT '[]'::jsonb,
  scope_basis     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  open_items      JSONB       NOT NULL DEFAULT '[]'::jsonb,
  status          TEXT        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent')),
  pdf_path        TEXT,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_consultation_recaps_session ON consultation_recaps (session_id);
CREATE INDEX IF NOT EXISTS idx_consultation_recaps_job ON consultation_recaps (tenant_id, job_id);

ALTER TABLE consultation_recaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY consultation_recaps_staff_all ON consultation_recaps FOR ALL
  USING (can_access_job(job_id) AND tenant_id = get_my_tenant_id())
  WITH CHECK (can_access_job(job_id) AND tenant_id = get_my_tenant_id());

ALTER TABLE consultation_measurements
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'measure';

ALTER TABLE consultation_photos
  ADD COLUMN IF NOT EXISTS transcript_context TEXT;
