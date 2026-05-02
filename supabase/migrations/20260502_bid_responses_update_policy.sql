CREATE POLICY bid_responses_sub_update ON bid_responses FOR UPDATE TO authenticated
  USING (sub_id = auth.uid() AND tenant_id = get_my_tenant_id())
  WITH CHECK (sub_id = auth.uid() AND tenant_id = get_my_tenant_id());
