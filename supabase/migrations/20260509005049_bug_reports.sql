CREATE TABLE bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES profiles(id),
  user_role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','fixed','wontfix')),
  description TEXT NOT NULL,
  route TEXT,
  app_version TEXT,
  device_info TEXT,
  breadcrumbs JSONB DEFAULT '[]'::jsonb,
  console_errors JSONB DEFAULT '[]'::jsonb,
  network_errors JSONB DEFAULT '[]'::jsonb,
  screenshot_url TEXT,
  email_sent_at TIMESTAMPTZ,
  fixed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_bug_reports_tenant_status ON bug_reports(tenant_id, status);
CREATE INDEX idx_bug_reports_status_created ON bug_reports(status, created_at DESC);

ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY bug_reports_tenant_read ON bug_reports
  FOR SELECT USING (tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY bug_reports_platform_owner_read ON bug_reports
  FOR SELECT USING ((SELECT is_platform_owner FROM profiles WHERE id = auth.uid()) = TRUE);
CREATE POLICY bug_reports_self_insert ON bug_reports
  FOR INSERT WITH CHECK (user_id = auth.uid() AND tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY bug_reports_platform_owner_update ON bug_reports
  FOR UPDATE USING ((SELECT is_platform_owner FROM profiles WHERE id = auth.uid()) = TRUE);

INSERT INTO storage.buckets (id, name, public) VALUES ('bug-screenshots', 'bug-screenshots', false) ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
