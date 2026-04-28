CREATE TABLE todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'snoozed', 'dismissed', 'done')),
  job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,
  source_table TEXT,
  source_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at TIMESTAMPTZ,
  snoozed_until TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES profiles(id)
);

CREATE INDEX idx_todos_target_user ON todos(target_user_id) WHERE status IN ('pending', 'snoozed');
CREATE INDEX idx_todos_tenant_status ON todos(tenant_id, status);
CREATE INDEX idx_todos_source ON todos(source_table, source_id) WHERE status = 'pending';
CREATE INDEX idx_todos_job ON todos(job_id) WHERE job_id IS NOT NULL;

ALTER TABLE todos ENABLE ROW LEVEL SECURITY;

CREATE POLICY todos_self_select ON todos FOR SELECT
  USING (target_user_id = auth.uid() AND tenant_id = get_my_tenant_id());

CREATE POLICY todos_owner_select ON todos FOR SELECT
  USING (get_my_role() = 'owner' AND tenant_id = get_my_tenant_id());

CREATE POLICY todos_self_update ON todos FOR UPDATE
  USING (target_user_id = auth.uid() AND tenant_id = get_my_tenant_id());
