ALTER TABLE todos ADD COLUMN payload JSONB;

CREATE POLICY todos_self_insert ON todos
  FOR INSERT TO authenticated
  WITH CHECK (target_user_id = auth.uid() AND tenant_id = get_my_tenant_id());

CREATE INDEX idx_todos_failed_intent ON todos(target_user_id, status)
  WHERE type = 'failed_intent';
