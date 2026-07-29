-- TIME_CLOCK_ARC S2b — fillable W-4 / W-9 paperwork, owner-sent + e-signed.
-- SECURITY NON-NEGOTIABLE: the TIN (SSN/EIN) never becomes DB data — it exists ONLY inside the
-- signed PDF in PRIVATE storage. The DB stores request status, storage path, timestamps, and
-- signing evidence (IP/UA). Access: owner + the person themselves.

-- 1. paperwork_requests — one request per (user, doc_type); re-send updates in place.
CREATE TABLE paperwork_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  doc_type        TEXT NOT NULL CHECK (doc_type = ANY (ARRAY['w4'::text, 'w9'::text])),
  status          TEXT NOT NULL DEFAULT 'sent' CHECK (status = ANY (ARRAY['sent'::text, 'completed'::text, 'cancelled'::text])),
  sent_by         UUID REFERENCES profiles(id),
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  storage_path    TEXT,
  sign_ip         TEXT,
  sign_user_agent TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_paperwork_requests_user ON paperwork_requests (user_id, doc_type);

ALTER TABLE paperwork_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY paperwork_requests_select ON paperwork_requests FOR SELECT
  USING (user_id = auth.uid() OR (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner'));
CREATE POLICY paperwork_requests_insert ON paperwork_requests FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');
CREATE POLICY paperwork_requests_update_owner ON paperwork_requests FOR UPDATE
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner')
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');
-- Self may complete ONLY their own still-'sent' row (USING gates on status='sent' so a completed
-- row can't be re-edited from the recipient seat). IP/UA are stamped server-side by the evidence fn.
CREATE POLICY paperwork_requests_update_self ON paperwork_requests FOR UPDATE
  USING (user_id = auth.uid() AND status = 'sent')
  WITH CHECK (user_id = auth.uid());

-- 2. Employee doc pointers (owner+self RLS already correct on employee_details).
ALTER TABLE employee_details
  ADD COLUMN w4_path TEXT,
  ADD COLUMN w4_submitted_at TIMESTAMPTZ,
  ADD COLUMN w9_path TEXT,
  ADD COLUMN w9_submitted_at TIMESTAMPTZ;

-- 3a. SECURITY FIX (audit #1): job-documents was PUBLIC (public=true) — existing sub W-9 uploads
-- (w9/...), which contain SSNs/EINs, were reachable via UNAUTHENTICATED public URLs. Make it
-- private. The app already reads it exclusively via createSignedUrl, so nothing breaks.
UPDATE storage.buckets SET public = false WHERE id = 'job-documents';

-- 3b. New PRIVATE bucket for the fillable paperwork PDFs (employee W-4/W-9 + sub fillable W-9).
-- Path convention: {user_id}/{doc}_{ts}.pdf. Access: the person themselves (by folder) OR the
-- owner (for any user in their tenant). Nothing tenant-wide, nothing public.
INSERT INTO storage.buckets (id, name, public) VALUES ('employee-docs', 'employee-docs', false)
  ON CONFLICT (id) DO UPDATE SET public = false;

CREATE POLICY employee_docs_owner_self ON storage.objects FOR ALL
  USING (
    bucket_id = 'employee-docs' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (get_my_role() = 'owner' AND ((storage.foldername(name))[1])::uuid IN (SELECT id FROM profiles WHERE tenant_id = get_my_tenant_id()))
    )
  )
  WITH CHECK (
    bucket_id = 'employee-docs' AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (get_my_role() = 'owner' AND ((storage.foldername(name))[1])::uuid IN (SELECT id FROM profiles WHERE tenant_id = get_my_tenant_id()))
    )
  );
