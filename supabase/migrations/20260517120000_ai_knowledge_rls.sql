ALTER TABLE ai_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_knowledge_select ON ai_knowledge
  FOR SELECT
  USING (tenant_id = get_my_tenant_id());

CREATE POLICY ai_knowledge_insert ON ai_knowledge
  FOR INSERT
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');

CREATE POLICY ai_knowledge_update ON ai_knowledge
  FOR UPDATE
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner')
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');

CREATE POLICY ai_knowledge_delete ON ai_knowledge
  FOR DELETE
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');
