-- ============================================================
-- MIGRATION: Remaining missing tables (job_messages, contract_signatures,
-- payments, sub_ratings, itb_invitees, push_subscriptions, storage buckets)
-- Previous migration (20260412) stopped early due to existing job_subs policies.
-- ============================================================


-- ============================================================
-- SECTION 1: job_messages
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

DROP POLICY IF EXISTS "job_messages: read if can access job" ON job_messages;
DROP POLICY IF EXISTS "job_messages: send if can access job" ON job_messages;
CREATE POLICY "job_messages: read if can access job" ON job_messages FOR SELECT
  USING (can_access_job(job_id));
CREATE POLICY "job_messages: send if can access job" ON job_messages FOR INSERT
  WITH CHECK (can_access_job(job_id) AND tenant_id = get_my_tenant_id() AND sender_id = auth.uid());


-- ============================================================
-- SECTION 2: contract_signatures
-- ============================================================
CREATE TABLE IF NOT EXISTS contract_signatures (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     uuid NOT NULL REFERENCES tenants(id),
  job_id        text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  signer_name   text,
  signer_email  text,
  signature_png text,
  pdf_url       text,
  signed_at     timestamptz DEFAULT now(),
  ip_address    text
);
CREATE INDEX IF NOT EXISTS idx_contract_signatures_job ON contract_signatures(job_id);
ALTER TABLE contract_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "signatures: read if can access job" ON contract_signatures;
DROP POLICY IF EXISTS "signatures: insert if can access job" ON contract_signatures;
CREATE POLICY "signatures: read if can access job" ON contract_signatures FOR SELECT
  USING (can_access_job(job_id));
CREATE POLICY "signatures: insert if can access job" ON contract_signatures FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id());


-- ============================================================
-- SECTION 3: payments
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      uuid NOT NULL REFERENCES tenants(id),
  job_id         text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  draw_number    integer,
  description    text,
  amount         numeric(12,2) NOT NULL,
  status         text DEFAULT 'pending'
                   CHECK (status IN ('pending','paid','overdue','void')),
  due_date       date,
  paid_date      date,
  payment_method text,
  stripe_link    text,
  created_by     uuid REFERENCES profiles(id),
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_job    ON payments(job_id);
CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id);
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments: read if can access job" ON payments;
DROP POLICY IF EXISTS "payments: insert if staff" ON payments;
DROP POLICY IF EXISTS "payments: update if staff" ON payments;
CREATE POLICY "payments: read if can access job" ON payments FOR SELECT
  USING (can_access_job(job_id));
CREATE POLICY "payments: insert if staff" ON payments FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','project_manager','sales_rep'));
CREATE POLICY "payments: update if staff" ON payments FOR UPDATE
  USING (can_access_job(job_id) AND get_my_role() IN ('owner','project_manager','sales_rep'));


-- ============================================================
-- SECTION 4: sub_ratings
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

DROP POLICY IF EXISTS "sub_ratings: read same tenant" ON sub_ratings;
DROP POLICY IF EXISTS "sub_ratings: upsert own rating" ON sub_ratings;
DROP POLICY IF EXISTS "sub_ratings: update own rating" ON sub_ratings;
CREATE POLICY "sub_ratings: read same tenant" ON sub_ratings FOR SELECT
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY "sub_ratings: upsert own rating" ON sub_ratings FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND rater_id = auth.uid() AND get_my_role() IN ('owner','project_manager'));
CREATE POLICY "sub_ratings: update own rating" ON sub_ratings FOR UPDATE
  USING (tenant_id = get_my_tenant_id() AND rater_id = auth.uid());


-- ============================================================
-- SECTION 5: itb_invitees
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
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='itb_invitees' AND column_name='invitation_id') THEN
    CREATE INDEX IF NOT EXISTS idx_itb_invitees_invitation ON itb_invitees(invitation_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='itb_invitees' AND column_name='sub_id') THEN
    CREATE INDEX IF NOT EXISTS idx_itb_invitees_sub ON itb_invitees(sub_id);
  END IF;
END $$;
ALTER TABLE itb_invitees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "itb_invitees: read same tenant" ON itb_invitees;
DROP POLICY IF EXISTS "itb_invitees: insert owner/pm" ON itb_invitees;
CREATE POLICY "itb_invitees: read same tenant" ON itb_invitees FOR SELECT
  USING (tenant_id = get_my_tenant_id());
CREATE POLICY "itb_invitees: insert owner/pm" ON itb_invitees FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner','project_manager'));


-- ============================================================
-- SECTION 6: push_subscriptions
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

DROP POLICY IF EXISTS "push_subs: own only" ON push_subscriptions;
CREATE POLICY "push_subs: own only" ON push_subscriptions FOR ALL
  USING (user_id = auth.uid());


-- ============================================================
-- SECTION 7: STORAGE BUCKETS
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('job-photos',    'job-photos',    true,  20971520,
   ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']),
  ('job-documents', 'job-documents', false, 52428800,
   ARRAY['application/pdf','image/jpeg','image/png',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('bid-quotes',    'bid-quotes',    false, 52428800,
   ARRAY['application/pdf','image/jpeg','image/png'])
ON CONFLICT (id) DO NOTHING;

-- Storage object policies (DROP IF EXISTS for idempotency)
DO $$
BEGIN
  -- job-photos
  DROP POLICY IF EXISTS "photos bucket: read public" ON storage.objects;
  DROP POLICY IF EXISTS "photos bucket: authenticated upload" ON storage.objects;
  DROP POLICY IF EXISTS "photos bucket: owner delete" ON storage.objects;
  -- job-documents
  DROP POLICY IF EXISTS "docs bucket: authenticated read" ON storage.objects;
  DROP POLICY IF EXISTS "docs bucket: authenticated upload" ON storage.objects;
  DROP POLICY IF EXISTS "docs bucket: authenticated delete" ON storage.objects;
  -- bid-quotes
  DROP POLICY IF EXISTS "bid-quotes bucket: authenticated read" ON storage.objects;
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
