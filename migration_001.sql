-- ============================================================
-- AVENSTONE PLATFORM — DATABASE MIGRATION 001
-- Run in Supabase SQL Editor in order, section by section.
-- Review each section before executing.
-- ============================================================


-- ============================================================
-- SECTION 1: EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- SECTION 2: TENANTS
-- One row per company. Avenstone Group is tenant #1.
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           text NOT NULL,
  slug           text UNIQUE NOT NULL,
  logo_url       text,
  primary_color  text DEFAULT '#0A1F44',
  plan           text DEFAULT 'starter' CHECK (plan IN ('starter', 'pro', 'growth')),
  created_at     timestamptz DEFAULT now()
);


-- ============================================================
-- SECTION 3: PROFILES
-- Extends Supabase auth.users. One profile per authenticated user.
-- Created automatically by trigger on auth.users insert (Section 11).
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id                 uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id          uuid REFERENCES tenants(id) ON DELETE CASCADE,
  full_name          text,
  email              text,
  phone              text,
  role               text DEFAULT 'sales_rep'
                       CHECK (role IN ('owner','sales_rep','project_manager','sub','client')),
  avatar_url         text,
  is_active          boolean DEFAULT true,
  notification_email boolean DEFAULT true,
  notification_sms   boolean DEFAULT false,
  created_at         timestamptz DEFAULT now()
);


-- ============================================================
-- SECTION 4: ALTER EXISTING TABLES
-- Adds tenant_id and new columns without dropping existing data.
-- ============================================================

-- jobs
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS tenant_id             uuid REFERENCES tenants(id),
  ADD COLUMN IF NOT EXISTS lead_source           text,
  ADD COLUMN IF NOT EXISTS lead_status           text DEFAULT 'new'
                             CHECK (lead_status IN ('new','contacted','walked','bid_sent','won','lost')),
  ADD COLUMN IF NOT EXISTS assigned_pm           uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS client_user_id        uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS visibility_financials boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS phase_pct_complete    integer DEFAULT 0;

-- photos
ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS tenant_id      uuid REFERENCES tenants(id),
  ADD COLUMN IF NOT EXISTS client_visible boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS trade_tag      text;

-- job_notes
ALTER TABLE job_notes
  ADD COLUMN IF NOT EXISTS tenant_id      uuid REFERENCES tenants(id),
  ADD COLUMN IF NOT EXISTS is_internal    boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_visible boolean DEFAULT false;

-- change_orders
ALTER TABLE change_orders
  ADD COLUMN IF NOT EXISTS tenant_id    uuid REFERENCES tenants(id),
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES profiles(id);


-- ============================================================
-- SECTION 5: NEW TABLES
-- ============================================================

-- Phase schedule per job. phase_order determines display sequence.
CREATE TABLE IF NOT EXISTS job_phases (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         uuid NOT NULL REFERENCES tenants(id),
  job_id            text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  phase_name        text NOT NULL,
  phase_order       integer NOT NULL,
  status            text DEFAULT 'not_started'
                      CHECK (status IN ('not_started','in_progress','complete','blocked')),
  assigned_sub_id   uuid REFERENCES profiles(id),
  start_date        date,
  end_date          date,
  actual_completion date,
  notes             text,
  created_at        timestamptz DEFAULT now()
);

-- Documents and plans uploaded per job, with version tracking.
CREATE TABLE IF NOT EXISTS job_documents (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  job_id         text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  name           text NOT NULL,
  file_url       text NOT NULL,
  file_type      text DEFAULT 'other'
                   CHECK (file_type IN ('plan','permit','contract','spec','inspection','other')),
  version        integer DEFAULT 1,
  uploaded_by    uuid REFERENCES profiles(id),
  client_visible boolean DEFAULT false,
  created_at     timestamptz DEFAULT now()
);

-- Bid package sent to subs to solicit pricing on a job.
CREATE TABLE IF NOT EXISTS invitations_to_bid (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  job_id       text REFERENCES jobs(id) ON DELETE SET NULL,
  title        text NOT NULL,
  description  text,
  trade        text,
  budget_range text,
  due_date     date,
  status       text DEFAULT 'draft'
                 CHECK (status IN ('draft','sent','closed','awarded')),
  created_by   uuid REFERENCES profiles(id),
  created_at   timestamptz DEFAULT now()
);

-- A sub's response to an invitation to bid.
CREATE TABLE IF NOT EXISTS bid_responses (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  invitation_id uuid NOT NULL REFERENCES invitations_to_bid(id) ON DELETE CASCADE,
  sub_id        uuid NOT NULL REFERENCES profiles(id),
  amount        numeric(12,2),
  notes         text,
  status        text DEFAULT 'submitted'
                  CHECK (status IN ('submitted','reviewed','awarded','rejected')),
  submitted_at  timestamptz DEFAULT now()
);

-- Daily field log submitted by a PM or sub.
CREATE TABLE IF NOT EXISTS daily_logs (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  job_id         text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  log_date       date NOT NULL DEFAULT CURRENT_DATE,
  author_id      uuid REFERENCES profiles(id),
  weather        text,
  crew_count     integer,
  work_completed text,
  issues         text,
  photos         jsonb DEFAULT '[]',
  created_at     timestamptz DEFAULT now()
);

-- Post-job review of a sub contractor. overall_score is auto-calculated.
CREATE TABLE IF NOT EXISTS sub_reviews (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id),
  job_id              text REFERENCES jobs(id) ON DELETE SET NULL,
  sub_id              uuid NOT NULL REFERENCES profiles(id),
  reviewer_id         uuid NOT NULL REFERENCES profiles(id),
  quality_score       integer CHECK (quality_score BETWEEN 1 AND 5),
  timeliness_score    integer CHECK (timeliness_score BETWEEN 1 AND 5),
  communication_score integer CHECK (communication_score BETWEEN 1 AND 5),
  cleanliness_score   integer CHECK (cleanliness_score BETWEEN 1 AND 5),
  overall_score       numeric(3,2) GENERATED ALWAYS AS (
    (quality_score + timeliness_score + communication_score + cleanliness_score)::numeric / 4
  ) STORED,
  notes               text,
  created_at          timestamptz DEFAULT now()
);

-- Direct message thread between a client and their rep, scoped to a job.
CREATE TABLE IF NOT EXISTS messages (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  job_id       text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  sender_id    uuid NOT NULL REFERENCES profiles(id),
  recipient_id uuid NOT NULL REFERENCES profiles(id),
  content      text NOT NULL,
  read         boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

-- In-app and outbound notification log. Edge Functions insert here;
-- the bell icon reads unread rows for the current user.
CREATE TABLE IF NOT EXISTS notifications (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  job_id      text REFERENCES jobs(id) ON DELETE SET NULL,
  type        text NOT NULL CHECK (type IN (
    'note_posted','phase_complete','co_submitted','co_approved','co_rejected',
    'bid_received','message','assigned_to_job','phase_overdue',
    'document_uploaded','daily_log_submitted'
  )),
  title       text NOT NULL,
  body        text,
  read        boolean DEFAULT false,
  email_sent  boolean DEFAULT false,
  sms_sent    boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);


-- ============================================================
-- SECTION 6: INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_profiles_tenant     ON profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_jobs_tenant         ON jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status         ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_photos_job          ON photos(job_id);
CREATE INDEX IF NOT EXISTS idx_photos_tenant       ON photos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_notes_job       ON job_notes(job_id);
CREATE INDEX IF NOT EXISTS idx_job_notes_tenant    ON job_notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_change_orders_job   ON change_orders(job_id);
CREATE INDEX IF NOT EXISTS idx_phases_job          ON job_phases(job_id);
CREATE INDEX IF NOT EXISTS idx_phases_tenant       ON job_phases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_docs_job            ON job_documents(job_id);
CREATE INDEX IF NOT EXISTS idx_daily_logs_job      ON daily_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_notif_user_unread   ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_messages_job        ON messages(job_id);


-- ============================================================
-- SECTION 7: SEED — AVENSTONE TENANT
-- Creates the Avenstone Group tenant record with a fixed UUID
-- so we can reference it when backfilling existing data.
-- ============================================================
INSERT INTO tenants (id, name, slug, plan)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Avenstone Group LLC',
  'avenstone',
  'pro'
)
ON CONFLICT (slug) DO NOTHING;

-- Backfill all existing rows to belong to Avenstone tenant.
-- Safe to re-run — only updates rows with NULL tenant_id.
UPDATE jobs          SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE photos        SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE job_notes     SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE change_orders SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;


-- ============================================================
-- SECTION 8: HELPER FUNCTIONS FOR RLS
-- SECURITY DEFINER so they run with the definer's privileges,
-- not the caller's — avoids recursive RLS checks on profiles.
-- ============================================================

-- Returns the calling user's tenant_id.
CREATE OR REPLACE FUNCTION get_my_tenant_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT tenant_id FROM profiles WHERE id = auth.uid()
$$;

-- Returns the calling user's role.
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

-- Returns true if the current user is allowed to see a given job.
-- Owners/PMs/Reps: any job in their tenant.
-- Subs: only jobs where they are assigned to at least one phase.
-- Clients: only the job where client_user_id matches their auth.uid.
CREATE OR REPLACE FUNCTION can_access_job(p_job_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM jobs j
    WHERE j.id = p_job_id
      AND j.tenant_id = get_my_tenant_id()
      AND (
           get_my_role() IN ('owner', 'sales_rep', 'project_manager')
        OR (get_my_role() = 'sub'    AND EXISTS (
              SELECT 1 FROM job_phases ph
              WHERE ph.job_id = j.id AND ph.assigned_sub_id = auth.uid()
            ))
        OR (get_my_role() = 'client' AND j.client_user_id = auth.uid())
      )
  )
$$;


-- ============================================================
-- SECTION 9: ENABLE ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE tenants            ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_notes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_phases         ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations_to_bid ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_responses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sub_reviews        ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages           ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications      ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- SECTION 10: RLS POLICIES
-- ============================================================

-- Drop existing policies first so this is re-runnable.
DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies
           WHERE schemaname = 'public'
             AND tablename IN (
               'tenants','profiles','jobs','photos','job_notes',
               'change_orders','job_phases','job_documents',
               'invitations_to_bid','bid_responses','daily_logs',
               'sub_reviews','messages','notifications'
             )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- TENANTS --
CREATE POLICY "tenants: read own"   ON tenants FOR SELECT USING (id = get_my_tenant_id());
CREATE POLICY "tenants: owner edit" ON tenants FOR UPDATE
  USING (id = get_my_tenant_id() AND get_my_role() = 'owner');

-- PROFILES --
CREATE POLICY "profiles: read same tenant" ON profiles FOR SELECT
  USING (tenant_id = get_my_tenant_id());

-- Trigger (Section 11) handles INSERT. Owners can also manually invite.
CREATE POLICY "profiles: owner insert" ON profiles FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');

CREATE POLICY "profiles: owner or self update" ON profiles FOR UPDATE
  USING (tenant_id = get_my_tenant_id() AND (get_my_role() = 'owner' OR id = auth.uid()));

-- JOBS --
CREATE POLICY "jobs: read by role"     ON jobs FOR SELECT  USING (can_access_job(id));
CREATE POLICY "jobs: owner/rep insert" ON jobs FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','sales_rep'));
CREATE POLICY "jobs: owner/rep/pm update" ON jobs FOR UPDATE
  USING (can_access_job(id) AND get_my_role() IN ('owner','sales_rep','project_manager'));
CREATE POLICY "jobs: owner delete" ON jobs FOR DELETE
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');

-- PHOTOS --
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

-- JOB NOTES --
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

-- CHANGE ORDERS --
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

-- JOB PHASES --
CREATE POLICY "phases: read if can access job" ON job_phases FOR SELECT
  USING (can_access_job(job_id));
CREATE POLICY "phases: owner/pm insert" ON job_phases FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','project_manager'));
CREATE POLICY "phases: owner/pm update" ON job_phases FOR UPDATE
  USING (can_access_job(job_id) AND get_my_role() IN ('owner','project_manager'));

-- JOB DOCUMENTS --
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

-- INVITATIONS TO BID --
CREATE POLICY "itb: read same tenant" ON invitations_to_bid FOR SELECT
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY "itb: owner/pm insert" ON invitations_to_bid FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','project_manager'));
CREATE POLICY "itb: owner/pm update" ON invitations_to_bid FOR UPDATE
  USING (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','project_manager'));

-- BID RESPONSES --
CREATE POLICY "bid_resp: read owner/pm or own" ON bid_responses FOR SELECT
  USING (
    tenant_id = get_my_tenant_id() AND (
      get_my_role() IN ('owner','project_manager')
      OR sub_id = auth.uid()
    )
  );
CREATE POLICY "bid_resp: sub insert own" ON bid_responses FOR INSERT
  WITH CHECK (sub_id = auth.uid() AND tenant_id = get_my_tenant_id());

-- DAILY LOGS --
CREATE POLICY "logs: read if can access job" ON daily_logs FOR SELECT
  USING (can_access_job(job_id));
CREATE POLICY "logs: staff insert" ON daily_logs FOR INSERT
  WITH CHECK (
    can_access_job(job_id)
    AND get_my_role() IN ('owner','project_manager','sub')
  );

-- SUB REVIEWS --
CREATE POLICY "reviews: read same tenant" ON sub_reviews FOR SELECT
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY "reviews: owner/pm insert" ON sub_reviews FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','project_manager'));

-- MESSAGES --
CREATE POLICY "messages: read own thread" ON messages FOR SELECT
  USING (
    tenant_id = get_my_tenant_id()
    AND (sender_id = auth.uid() OR recipient_id = auth.uid())
  );
CREATE POLICY "messages: send as self" ON messages FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND sender_id = auth.uid());
CREATE POLICY "messages: mark read" ON messages FOR UPDATE
  USING (recipient_id = auth.uid());

-- NOTIFICATIONS --
-- Edge Functions write notifications using the service_role key (bypasses RLS).
-- Reads and mark-read come from the user themselves.
CREATE POLICY "notif: read own" ON notifications FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "notif: mark read" ON notifications FOR UPDATE
  USING (user_id = auth.uid());


-- ============================================================
-- SECTION 11: AUTO-CREATE PROFILE ON SIGNUP TRIGGER
-- When Supabase Auth creates a new user, this trigger fires
-- and creates their profile row. tenant_id and role come from
-- the raw_user_meta_data passed during invite/signup.
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, tenant_id, full_name, email, role)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data->>'tenant_id')::uuid,
    NEW.raw_user_meta_data->>'full_name',
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'sales_rep')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ============================================================
-- SECTION 12: PHASE_PCT_COMPLETE AUTO-UPDATE TRIGGER
-- Recalculates phase_pct_complete on jobs whenever a phase
-- status changes. Keeps the dashboard number in sync.
-- ============================================================
CREATE OR REPLACE FUNCTION update_job_phase_pct()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  total_phases integer;
  done_phases  integer;
BEGIN
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE status = 'complete')
  INTO total_phases, done_phases
  FROM job_phases
  WHERE job_id = COALESCE(NEW.job_id, OLD.job_id);

  IF total_phases > 0 THEN
    UPDATE jobs
    SET phase_pct_complete = ROUND((done_phases::numeric / total_phases) * 100)
    WHERE id = COALESCE(NEW.job_id, OLD.job_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_phase_status_change ON job_phases;
CREATE TRIGGER on_phase_status_change
  AFTER INSERT OR UPDATE OF status OR DELETE ON job_phases
  FOR EACH ROW EXECUTE FUNCTION update_job_phase_pct();
