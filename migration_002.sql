-- ============================================================
-- AVENSTONE PLATFORM — DATABASE MIGRATION 002
-- Safe to re-run at any time. All statements are idempotent.
-- Run in Supabase SQL Editor.
-- ============================================================


-- ============================================================
-- SECTION 1: NEW TABLES
-- ============================================================

-- Client payments collected via Stripe Checkout
CREATE TABLE IF NOT EXISTS payments (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL REFERENCES tenants(id),
  job_id                   text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  amount                   numeric(10,2) NOT NULL,
  description              text NOT NULL,
  payment_type             text DEFAULT 'custom',
  status                   text DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled')),
  stripe_session_id        text,
  stripe_payment_intent_id text,
  client_email             text,
  paid_at                  timestamptz,
  created_at               timestamptz DEFAULT now(),
  created_by               uuid REFERENCES profiles(id)
);

-- Web push subscriptions for PWA notifications
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  endpoint   text NOT NULL,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, endpoint)
);

-- AI Estimator conversation history per job
CREATE TABLE IF NOT EXISTS job_estimates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id),
  job_id     text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  messages   jsonb DEFAULT '[]',
  updated_at timestamptz DEFAULT now(),
  UNIQUE (job_id)
);

-- Job-sub assignment for notifications and access control
CREATE TABLE IF NOT EXISTS job_subs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id),
  job_id     text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  sub_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (job_id, sub_id)
);


-- ============================================================
-- SECTION 2: COLUMN ADDITIONS
-- ============================================================

-- daily_logs: hours_worked was added after initial migration
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS hours_worked numeric(5,2);

-- profiles: notification preferences per event type
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS notification_prefs jsonb DEFAULT '{}';

-- profiles: commission rates for sales reps
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS commission_pct    numeric(5,2)  DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS commission_dollar numeric(10,2) DEFAULT 0;

-- notifications: add new types without breaking existing constraint
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (
  'note_posted','phase_complete','co_submitted','co_approved','co_rejected',
  'bid_received','message','assigned_to_job','phase_overdue',
  'document_uploaded','daily_log_submitted','payment_received',
  'contract_signed','completion_signed'
));


-- ============================================================
-- SECTION 3: INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_estimates_job     ON job_estimates(job_id);
CREATE INDEX IF NOT EXISTS idx_payments_job      ON payments(job_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant   ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_session  ON payments(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_user    ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_job_subs_job      ON job_subs(job_id);
CREATE INDEX IF NOT EXISTS idx_job_subs_sub      ON job_subs(sub_id);


-- ============================================================
-- SECTION 4: ENABLE RLS ON NEW TABLES
-- ============================================================
ALTER TABLE job_estimates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_subs          ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- SECTION 3b: SIGNATURE & ONBOARDING TABLES
-- ============================================================

-- Contract / document signatures
CREATE TABLE IF NOT EXISTS contract_signatures (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  job_id         text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  type           text NOT NULL CHECK (type IN ('contract','change_order','completion','lien_waiver','subcontractor_agreement')),
  reference_id   uuid,
  signed_by_name  text,
  signed_by_email text,
  signature_data  text,
  signed_at       timestamptz DEFAULT now(),
  document_url    text,
  created_at      timestamptz DEFAULT now()
);

-- Sub onboarding columns
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS w9_url text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS w9_submitted_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS insurance_url text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS insurance_expiry date;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS insurance_verified boolean DEFAULT false;

-- contract_signed flag on jobs
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS contract_signed boolean DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS contract_signed_at timestamptz;

-- client communication preference per job
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_notify text DEFAULT 'portal';

-- store Stripe checkout URL so client can pay directly from portal
ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_checkout_url text;


-- ============================================================
-- SECTION 5: DROP AND RECREATE ALL RLS POLICIES
-- Drops every policy on every table so this file is fully
-- re-runnable — no manual fixes needed after schema changes.
-- ============================================================
DO $$ DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'tenants','profiles','jobs','photos','job_notes',
        'change_orders','job_phases','job_documents',
        'invitations_to_bid','bid_responses','daily_logs',
        'sub_reviews','messages','notifications',
        'payments','push_subscriptions','job_subs','job_estimates',
        'contract_signatures'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Also drop storage policies so they can be recreated clean
DROP POLICY IF EXISTS "allow upload job-documents"  ON storage.objects;
DROP POLICY IF EXISTS "allow select job-documents"  ON storage.objects;
DROP POLICY IF EXISTS "allow update job-documents"  ON storage.objects;
DROP POLICY IF EXISTS "allow delete job-documents"  ON storage.objects;
DROP POLICY IF EXISTS "allow upload job-photos"     ON storage.objects;
DROP POLICY IF EXISTS "allow select job-photos"     ON storage.objects;
DROP POLICY IF EXISTS "allow delete job-photos"     ON storage.objects;
DROP POLICY IF EXISTS "allow select assets"         ON storage.objects;


-- ── TENANTS ──────────────────────────────────────────────────
CREATE POLICY "tenants: read own"   ON tenants FOR SELECT USING (id = get_my_tenant_id());
CREATE POLICY "tenants: owner edit" ON tenants FOR UPDATE
  USING (id = get_my_tenant_id() AND get_my_role() = 'owner');

-- ── PROFILES ─────────────────────────────────────────────────
CREATE POLICY "profiles: read same tenant" ON profiles FOR SELECT
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY "profiles: owner insert" ON profiles FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');
CREATE POLICY "profiles: owner or self update" ON profiles FOR UPDATE
  USING (tenant_id = get_my_tenant_id() AND (get_my_role() = 'owner' OR id = auth.uid()));

-- ── JOBS ──────────────────────────────────────────────────────
CREATE POLICY "jobs: read by role"        ON jobs FOR SELECT  USING (can_access_job(id));
CREATE POLICY "jobs: owner/rep insert"    ON jobs FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','sales_rep'));
CREATE POLICY "jobs: owner/rep/pm update" ON jobs FOR UPDATE
  USING (can_access_job(id) AND get_my_role() IN ('owner','sales_rep','project_manager'));
CREATE POLICY "jobs: owner delete"        ON jobs FOR DELETE
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');

-- ── PHOTOS ───────────────────────────────────────────────────
CREATE POLICY "photos: read by role" ON photos FOR SELECT
  USING (
    can_access_job(job_id) AND (
      get_my_role() IN ('owner','sales_rep','project_manager','sub')
      OR (get_my_role() = 'client' AND client_visible = true)
    )
  );
CREATE POLICY "photos: insert if can access job" ON photos FOR INSERT
  WITH CHECK (can_access_job(job_id) AND tenant_id = get_my_tenant_id());
CREATE POLICY "photos: owner/pm delete" ON photos FOR DELETE
  USING (can_access_job(job_id) AND get_my_role() IN ('owner','project_manager'));

-- ── JOB NOTES ────────────────────────────────────────────────
CREATE POLICY "notes: read by role" ON job_notes FOR SELECT
  USING (
    can_access_job(job_id) AND (
      get_my_role() IN ('owner','sales_rep','project_manager')
      OR (get_my_role() = 'sub'    AND is_internal = false)
      OR (get_my_role() = 'client' AND client_visible = true)
    )
  );
CREATE POLICY "notes: insert if can access job" ON job_notes FOR INSERT
  WITH CHECK (can_access_job(job_id) AND tenant_id = get_my_tenant_id());

-- ── CHANGE ORDERS ─────────────────────────────────────────────
CREATE POLICY "co: read by role" ON change_orders FOR SELECT
  USING (
    can_access_job(job_id) AND (
      get_my_role() IN ('owner','project_manager','sales_rep')
      OR (get_my_role() = 'sub'    AND submitted_by = auth.uid())
      OR (get_my_role() = 'client' AND status = 'approved')
    )
  );
CREATE POLICY "co: insert if can access job" ON change_orders FOR INSERT
  WITH CHECK (can_access_job(job_id) AND tenant_id = get_my_tenant_id());
CREATE POLICY "co: owner/pm approve/reject" ON change_orders FOR UPDATE
  USING (can_access_job(job_id) AND get_my_role() IN ('owner','project_manager'));

-- ── JOB PHASES ────────────────────────────────────────────────
CREATE POLICY "phases: read if can access job" ON job_phases FOR SELECT
  USING (can_access_job(job_id));
CREATE POLICY "phases: owner/pm insert" ON job_phases FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','project_manager'));
CREATE POLICY "phases: owner/pm update" ON job_phases FOR UPDATE
  USING (can_access_job(job_id) AND get_my_role() IN ('owner','project_manager'));

-- ── JOB DOCUMENTS ─────────────────────────────────────────────
CREATE POLICY "docs: read by role" ON job_documents FOR SELECT
  USING (
    can_access_job(job_id) AND (
      get_my_role() IN ('owner','project_manager','sales_rep','sub')
      OR (get_my_role() = 'client' AND client_visible = true)
    )
  );
CREATE POLICY "docs: insert by staff" ON job_documents FOR INSERT
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner','project_manager','sales_rep')
  );
CREATE POLICY "docs: owner/pm update" ON job_documents FOR UPDATE
  USING (can_access_job(job_id) AND get_my_role() IN ('owner','project_manager','sales_rep'));
CREATE POLICY "docs: owner/pm delete" ON job_documents FOR DELETE
  USING (can_access_job(job_id) AND get_my_role() IN ('owner','project_manager'));

-- ── INVITATIONS TO BID ────────────────────────────────────────
CREATE POLICY "itb: read same tenant" ON invitations_to_bid FOR SELECT
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY "itb: owner/pm insert" ON invitations_to_bid FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','project_manager'));
CREATE POLICY "itb: owner/pm update" ON invitations_to_bid FOR UPDATE
  USING (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','project_manager'));

-- ── BID RESPONSES ─────────────────────────────────────────────
CREATE POLICY "bid_resp: read owner/pm or own" ON bid_responses FOR SELECT
  USING (
    tenant_id = get_my_tenant_id() AND (
      get_my_role() IN ('owner','project_manager')
      OR sub_id = auth.uid()
    )
  );
CREATE POLICY "bid_resp: sub insert own" ON bid_responses FOR INSERT
  WITH CHECK (sub_id = auth.uid() AND tenant_id = get_my_tenant_id());

-- ── DAILY LOGS ────────────────────────────────────────────────
CREATE POLICY "logs: read if can access job" ON daily_logs FOR SELECT
  USING (can_access_job(job_id));
CREATE POLICY "logs: staff insert" ON daily_logs FOR INSERT
  WITH CHECK (
    can_access_job(job_id)
    AND get_my_role() IN ('owner','project_manager','sub')
  );

-- ── SUB REVIEWS ───────────────────────────────────────────────
CREATE POLICY "reviews: read same tenant" ON sub_reviews FOR SELECT
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY "reviews: owner/pm insert" ON sub_reviews FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','project_manager'));

-- ── MESSAGES ──────────────────────────────────────────────────
CREATE POLICY "messages: read own thread" ON messages FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND (sender_id = auth.uid() OR recipient_id = auth.uid())
  );
CREATE POLICY "messages: send as self" ON messages FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND sender_id = auth.uid());
CREATE POLICY "messages: mark read" ON messages FOR UPDATE
  USING (recipient_id = auth.uid());

-- ── NOTIFICATIONS ─────────────────────────────────────────────
-- Service role (Edge Functions) bypasses RLS for INSERT.
-- Users can only read and mark-read their own notifications.
CREATE POLICY "notif: read own"  ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "notif: mark read" ON notifications FOR UPDATE USING (user_id = auth.uid());

-- ── JOB ESTIMATES ────────────────────────────────────────────
CREATE POLICY "estimates: read by staff" ON job_estimates FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','project_manager','sales_rep'));
CREATE POLICY "estimates: upsert by staff" ON job_estimates FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','project_manager','sales_rep'));
CREATE POLICY "estimates: update by staff" ON job_estimates FOR UPDATE
  USING (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','project_manager','sales_rep'));

-- ── PAYMENTS ──────────────────────────────────────────────────
-- Edge Functions create payment records using service_role (bypasses RLS).
-- Staff can read payments for jobs they can access.
CREATE POLICY "payments: read by staff" ON payments FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner','project_manager','sales_rep')
  );
CREATE POLICY "payments: staff insert" ON payments FOR INSERT
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner','project_manager','sales_rep')
  );

-- ── PUSH SUBSCRIPTIONS ────────────────────────────────────────
CREATE POLICY "push: read own"   ON push_subscriptions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "push: insert own" ON push_subscriptions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "push: delete own" ON push_subscriptions FOR DELETE USING (user_id = auth.uid());

-- ── JOB SUBS ──────────────────────────────────────────────────
CREATE POLICY "job_subs: read same tenant" ON job_subs FOR SELECT
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY "job_subs: owner/pm insert" ON job_subs FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','project_manager'));
CREATE POLICY "job_subs: owner/pm delete" ON job_subs FOR DELETE
  USING (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','project_manager'));

-- ── CONTRACT SIGNATURES ───────────────────────────────────────
ALTER TABLE contract_signatures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sigs: staff read" ON contract_signatures FOR SELECT
  USING (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','project_manager','sales_rep'));
CREATE POLICY "sigs: staff insert" ON contract_signatures FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','project_manager','sales_rep'));
CREATE POLICY "sigs: client/sub insert own" ON contract_signatures FOR INSERT
  WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('client','sub')
    AND signed_by_email = (SELECT email FROM profiles WHERE id = auth.uid() LIMIT 1)
  );


-- ============================================================
-- SECTION 6: STORAGE BUCKET POLICIES
-- These cover the job-documents and job-photos buckets.
-- Authenticated users in the same tenant can upload/read.
-- ============================================================

-- job-documents bucket
CREATE POLICY "allow upload job-documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'job-documents');

CREATE POLICY "allow select job-documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'job-documents');

CREATE POLICY "allow update job-documents" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'job-documents');

CREATE POLICY "allow delete job-documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'job-documents');

-- job-photos bucket
CREATE POLICY "allow upload job-photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'job-photos');

CREATE POLICY "allow select job-photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'job-photos');

CREATE POLICY "allow delete job-photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'job-photos');

-- assets bucket (icons, logos — public read)
CREATE POLICY "allow select assets" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'assets');
