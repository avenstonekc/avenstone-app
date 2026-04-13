-- Allow any authenticated user to insert notifications for others in their tenant.
-- Without this policy, sbNotify() silently fails and no one gets notified.
CREATE POLICY "notif: insert same tenant"
ON notifications FOR INSERT
WITH CHECK (tenant_id = get_my_tenant_id());
