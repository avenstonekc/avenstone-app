CREATE TABLE pending_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES profiles(id),
  verb TEXT NOT NULL CHECK (verb IN ('receipt','todo','lead','change_order','bug')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','complete','discarded')),
  quick_label TEXT,
  context JSONB DEFAULT '{}'::jsonb,
  snooze_count INT NOT NULL DEFAULT 0,
  last_opened_at TIMESTAMPTZ,
  resulting_entity_type TEXT,
  resulting_entity_id UUID,
  discard_reason TEXT CHECK (discard_reason IN ('misclick','duplicate','no_longer_needed','completed_outside_app')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  discarded_at TIMESTAMPTZ
);

CREATE INDEX idx_pending_tasks_user_status ON pending_tasks(user_id, status) WHERE status IN ('pending','in_progress');
CREATE INDEX idx_pending_tasks_tenant_status ON pending_tasks(tenant_id, status);
CREATE INDEX idx_pending_tasks_age ON pending_tasks(created_at) WHERE status = 'pending';

ALTER TABLE pending_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY pending_tasks_user_rw ON pending_tasks
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY pending_tasks_owner_read ON pending_tasks
  FOR SELECT USING (
    tenant_id = (SELECT tenant_id FROM profiles WHERE id = auth.uid())
    AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner','project_manager')
  );

NOTIFY pgrst, 'reload schema';
