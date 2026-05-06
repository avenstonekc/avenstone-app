-- Phase 3 schema cleanup: replace job_subs RLS policy refs + DROP legacy objects
-- Policy replacements preserve all original clauses; only the job_subs EXISTS branch
-- is swapped for job_sub_engagements. DROPs are ordered by FK dependency.
-- No CASCADE anywhere — explicit order means loud failure on any surprise dependency.

BEGIN;

-- ── RLS policy replacements (must precede DROP job_subs) ─────────────────────

DROP POLICY IF EXISTS job_messages_read ON job_messages;
CREATE POLICY job_messages_read ON job_messages
  FOR SELECT USING (
    (tenant_id = get_my_tenant_id()) AND (
      (get_my_role() = ANY (ARRAY['owner'::text, 'sales_rep'::text, 'project_manager'::text]))
      OR (EXISTS (
        SELECT 1 FROM job_sub_engagements jse
        WHERE jse.job_id = job_messages.job_id
          AND jse.sub_id = auth.uid()
          AND jse.status NOT IN ('completed','declined','withdrawn','removed')
      ))
    )
  );

DROP POLICY IF EXISTS job_messages_insert ON job_messages;
CREATE POLICY job_messages_insert ON job_messages
  FOR INSERT WITH CHECK (
    (tenant_id = get_my_tenant_id()) AND (sender_id = auth.uid()) AND (
      (get_my_role() = ANY (ARRAY['owner'::text, 'sales_rep'::text, 'project_manager'::text]))
      OR (EXISTS (
        SELECT 1 FROM job_sub_engagements jse
        WHERE jse.job_id = job_messages.job_id
          AND jse.sub_id = auth.uid()
          AND jse.status NOT IN ('completed','declined','withdrawn','removed')
      ))
    )
  );

DROP POLICY IF EXISTS schedule_items_sub_select ON schedule_items;
CREATE POLICY schedule_items_sub_select ON schedule_items
  FOR SELECT USING (
    (assigned_sub_id = auth.uid())
    OR (EXISTS (
      SELECT 1 FROM job_sub_engagements jse
      WHERE jse.job_id = schedule_items.job_id
        AND jse.sub_id = auth.uid()
        AND jse.status NOT IN ('completed','declined','withdrawn','removed')
    ))
  );

-- ── DROP legacy objects (view first, then FK dependency order) ────────────────

DROP VIEW IF EXISTS invitations_to_bid;

-- bid_responses before quote_requests (bid_responses.invitation_id → quote_requests.id)
DROP TABLE IF EXISTS bid_responses;

-- itb_invitees before quote_requests (itb_invitees.itb_id → quote_requests.id)
DROP TABLE IF EXISTS itb_invitees;

DROP TABLE IF EXISTS quote_requests;

DROP TABLE IF EXISTS bids;
DROP TABLE IF EXISTS sub_pricing_changes;
DROP TABLE IF EXISTS job_subs;

COMMIT;

NOTIFY pgrst, 'reload schema';
