-- ============================================================
-- MIGRATION: Missing tables, columns, and storage buckets
-- These are all referenced in index.html but not in 001_initial_schema.sql
-- Safe to re-run (uses IF NOT EXISTS / DO NOTHING throughout)
-- ============================================================


-- ============================================================
-- SECTION 1: MISSING COLUMNS ON profiles
-- ============================================================
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS trade               text,
  ADD COLUMN IF NOT EXISTS commission_pct      numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_dollar   numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS w9_url              text,
  ADD COLUMN IF NOT EXISTS w9_submitted_at     timestamptz,
  ADD COLUMN IF NOT EXISTS insurance_url       text,
  ADD COLUMN IF NOT EXISTS insurance_expiry    date,
  ADD COLUMN IF NOT EXISTS insurance_verified  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notification_prefs  jsonb DEFAULT '{}';


-- ============================================================
-- SECTION 2: MISSING COLUMNS ON bid_responses
-- ============================================================
ALTER TABLE bid_responses
  ADD COLUMN IF NOT EXISTS quote_file_url  text,
  ADD COLUMN IF NOT EXISTS quote_file_name text,
  ADD COLUMN IF NOT EXISTS quote_file_size integer;


-- ============================================================
-- SECTION 3: MISSING COLUMNS ON daily_logs
-- ============================================================
ALTER TABLE daily_logs
  ADD COLUMN IF NOT EXISTS hours_worked numeric(5,2);


-- ============================================================
-- SECTION 4: job_estimates
-- Stores AI estimator chat message history per job.
-- One row per job (upserted by job_id).
-- ============================================================
CREATE TABLE IF NOT EXISTS job_estimates (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id),
  job_id     text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  messages   jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz DEFAULT now(),
  UNIQUE (job_id)
);

CREATE INDEX IF NOT EXISTS idx_job_estimates_job ON job_estimates(job_id);

ALTER TABLE job_estimates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "estimates: read if can access job" ON job_estimates;
DROP POLICY IF EXISTS "estimates: upsert if staff" ON job_estimates;
DROP POLICY IF EXISTS "estimates: update if staff" ON job_estimates;
CREATE POLICY "estimates: read if can access job" ON job_estimates FOR SELECT
  USING (can_access_job(job_id));
CREATE POLICY "estimates: upsert if staff" ON job_estimates FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','project_manager','sales_rep'));
CREATE POLICY "estimates: update if staff" ON job_estimates FOR UPDATE
  USING (can_access_job(job_id) AND get_my_role() IN ('owner','project_manager','sales_rep'));


-- ============================================================
-- SECTION 5: job_subs
-- Many-to-many: which subs are assigned to a job overall.
-- Separate from job_phases.assigned_sub_id (phase-level assignment).
-- ============================================================
CREATE TABLE IF NOT EXISTS job_subs (
  id        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  job_id    text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  sub_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (job_id, sub_id)
);

CREATE INDEX IF NOT EXISTS idx_job_subs_job ON job_subs(job_id);
CREATE INDEX IF NOT EXISTS idx_job_subs_sub ON job_subs(sub_id);

ALTER TABLE job_subs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_subs: read if can access job" ON job_subs;
DROP POLICY IF EXISTS "job_subs: owner/pm insert" ON job_subs;
DROP POLICY IF EXISTS "job_subs: owner/pm delete" ON job_subs;
CREATE POLICY "job_subs: read if can access job" ON job_subs FOR SELECT
  USING (can_access_job(job_id));
CREATE POLICY "job_subs: owner/pm insert" ON job_subs FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','project_manager'));
CREATE POLICY "job_subs: owner/pm delete" ON job_subs FOR DELETE
  USING (can_access_job(job_id) AND get_my_role() IN ('owner','project_manager'));


-- ============================================================
-- SECTION 6: job_messages
-- In-app chat scoped to a job. Named job_messages in the app
-- (different from the messages table in the original schema).
-- ============================================================
CREATE TABLE IF NOT EXISTS job_messages (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id),
  job_id     text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  sender_id  uuid NOT NULL REFERENCES profiles(id),
  content    text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_messages_job ON job_messages(job_id);

ALTER TABLE job_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "job_messages: read if can access job" ON job_messages FOR SELECT
  USING (can_access_job(job_id));
CREATE POLICY "job_messages: send if can access job" ON job_messages FOR INSERT
  WITH CHECK (can_access_job(job_id) AND tenant_id = get_my_tenant_id() AND sender_id = auth.uid());


-- ============================================================
-- SECTION 7: contract_signatures
-- Stores the signature PNG and signed contract PDF URL per job.
-- ============================================================
CREATE TABLE IF NOT EXISTS contract_signatures (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  job_id          text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  signer_name     text,
  signer_email    text,
  signature_png   text,    -- base64 or storage URL
  pdf_url         text,    -- signed contract PDF in job-documents bucket
  signed_at       timestamptz DEFAULT now(),
  ip_address      text
);

CREATE INDEX IF NOT EXISTS idx_contract_signatures_job ON contract_signatures(job_id);

ALTER TABLE contract_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signatures: read if can access job" ON contract_signatures FOR SELECT
  USING (can_access_job(job_id));
CREATE POLICY "signatures: insert if can access job" ON contract_signatures FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id());


-- ============================================================
-- SECTION 8: payments
-- Tracks draw payments per job — amount, status, date, method.
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       uuid NOT NULL REFERENCES tenants(id),
  job_id          text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  draw_number     integer,
  description     text,
  amount          numeric(12,2) NOT NULL,
  status          text DEFAULT 'pending'
                    CHECK (status IN ('pending','paid','overdue','void')),
  due_date        date,
  paid_date       date,
  payment_method  text,
  stripe_link     text,
  created_by      uuid REFERENCES profiles(id),
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_job    ON payments(job_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments: read if can access job" ON payments FOR SELECT
  USING (can_access_job(job_id));
CREATE POLICY "payments: insert if staff" ON payments FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','project_manager','sales_rep'));
CREATE POLICY "payments: update if staff" ON payments FOR UPDATE
  USING (can_access_job(job_id) AND get_my_role() IN ('owner','project_manager','sales_rep'));


-- ============================================================
-- SECTION 9: sub_ratings
-- Star ratings left on subs after a job. App uses sub_ratings
-- (original schema had sub_reviews — both can coexist).
-- ============================================================
CREATE TABLE IF NOT EXISTS sub_ratings (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id),
  sub_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rater_id   uuid NOT NULL REFERENCES profiles(id),
  job_id     text REFERENCES jobs(id) ON DELETE SET NULL,
  stars      integer NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment    text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (tenant_id, sub_id, rater_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_sub_ratings_sub ON sub_ratings(sub_id);

ALTER TABLE sub_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sub_ratings: read same tenant" ON sub_ratings FOR SELECT
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY "sub_ratings: upsert own rating" ON sub_ratings FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND rater_id = auth.uid() AND get_my_role() IN ('owner','project_manager'));
CREATE POLICY "sub_ratings: update own rating" ON sub_ratings FOR UPDATE
  USING (tenant_id = get_my_tenant_id() AND rater_id = auth.uid());


-- ============================================================
-- SECTION 10: itb_invitees
-- Tracks which subs were invited to a specific bid.
-- ============================================================
CREATE TABLE IF NOT EXISTS itb_invitees (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  invitation_id uuid NOT NULL REFERENCES invitations_to_bid(id) ON DELETE CASCADE,
  sub_id        uuid REFERENCES profiles(id) ON DELETE SET NULL,
  email         text NOT NULL,
  invited_at    timestamptz DEFAULT now(),
  UNIQUE (invitation_id, email)
);

-- Only create indexes if the columns exist (table may have been created earlier with different schema)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='itb_invitees' AND column_name='invitation_id') THEN
    CREATE INDEX IF NOT EXISTS idx_itb_invitees_invitation ON itb_invitees(invitation_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='itb_invitees' AND column_name='sub_id') THEN
    CREATE INDEX IF NOT EXISTS idx_itb_invitees_sub ON itb_invitees(sub_id);
  END IF;
END $$;

ALTER TABLE itb_invitees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "itb_invitees: read same tenant" ON itb_invitees FOR SELECT
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY "itb_invitees: insert owner/pm" ON itb_invitees FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','project_manager'));


-- ============================================================
-- SECTION 11: push_subscriptions
-- Web push notification endpoints per user/device.
-- ============================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint   text NOT NULL,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_subs: own only" ON push_subscriptions FOR ALL
  USING (user_id = auth.uid());


-- ============================================================
-- SECTION 12: STORAGE BUCKETS
-- These must exist for photo uploads and document uploads to work.
-- Run this in Supabase SQL Editor (storage schema).
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('job-photos',    'job-photos',    true, 20971520,  -- 20 MB
   ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']),
  ('job-documents', 'job-documents', false, 52428800, -- 50 MB
   ARRAY['application/pdf','image/jpeg','image/png','application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('bid-quotes',    'bid-quotes',    false, 52428800, -- 50 MB
   ARRAY['application/pdf','image/jpeg','image/png'])
ON CONFLICT (id) DO NOTHING;


-- ── Storage RLS ────────────────────────────────────────────────────────────
DO $$
BEGIN
  DROP POLICY IF EXISTS "photos bucket: read public"          ON storage.objects;
  DROP POLICY IF EXISTS "photos bucket: authenticated upload" ON storage.objects;
  DROP POLICY IF EXISTS "photos bucket: owner delete"         ON storage.objects;
  DROP POLICY IF EXISTS "docs bucket: authenticated read"     ON storage.objects;
  DROP POLICY IF EXISTS "docs bucket: authenticated upload"   ON storage.objects;
  DROP POLICY IF EXISTS "docs bucket: authenticated delete"   ON storage.objects;
  DROP POLICY IF EXISTS "bid-quotes bucket: authenticated read"   ON storage.objects;
  DROP POLICY IF EXISTS "bid-quotes bucket: authenticated upload" ON storage.objects;
END $$;

CREATE POLICY "photos bucket: read public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'job-photos');

CREATE POLICY "photos bucket: authenticated upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'job-photos' AND auth.role() = 'authenticated');

CREATE POLICY "photos bucket: owner delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'job-photos' AND auth.role() = 'authenticated');

CREATE POLICY "docs bucket: authenticated read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'job-documents' AND auth.role() = 'authenticated');

CREATE POLICY "docs bucket: authenticated upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'job-documents' AND auth.role() = 'authenticated');

CREATE POLICY "docs bucket: authenticated delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'job-documents' AND auth.role() = 'authenticated');

CREATE POLICY "bid-quotes bucket: authenticated read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'bid-quotes' AND auth.role() = 'authenticated');

CREATE POLICY "bid-quotes bucket: authenticated upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'bid-quotes' AND auth.role() = 'authenticated');
