-- CALENDAR_ARC Phase 1: invitees on schedule items.
-- Cross-tenant constraint: invitees must share tenant with the schedule_item.
-- Push fan-out: a notifications row is inserted by the app on add, no DB trigger.

BEGIN;

CREATE TABLE IF NOT EXISTS public.schedule_item_invitees (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_item_id    UUID        NOT NULL REFERENCES public.schedule_items(id) ON DELETE CASCADE,
  invitee_user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id           UUID        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'invited',
  invited_by          UUID        NOT NULL REFERENCES auth.users(id),
  invited_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at        TIMESTAMPTZ
);

ALTER TABLE public.schedule_item_invitees
  DROP CONSTRAINT IF EXISTS schedule_item_invitees_status_check;
ALTER TABLE public.schedule_item_invitees
  ADD CONSTRAINT schedule_item_invitees_status_check
  CHECK (status IN ('invited','accepted','declined','tentative'));

-- One invite per (item, user) — no duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_sii_unique_invite
  ON public.schedule_item_invitees (schedule_item_id, invitee_user_id);

CREATE INDEX IF NOT EXISTS idx_sii_invitee_lookup
  ON public.schedule_item_invitees (invitee_user_id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_sii_item_lookup
  ON public.schedule_item_invitees (schedule_item_id);

ALTER TABLE public.schedule_item_invitees ENABLE ROW LEVEL SECURITY;

-- Tenant members can SELECT invitees for items in their tenant
DROP POLICY IF EXISTS sii_tenant_select ON public.schedule_item_invitees;
CREATE POLICY sii_tenant_select ON public.schedule_item_invitees
  FOR SELECT TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid()
  ));

-- Tenant members can INSERT invitees (app ensures invited_by = auth.uid())
DROP POLICY IF EXISTS sii_tenant_insert ON public.schedule_item_invitees;
CREATE POLICY sii_tenant_insert ON public.schedule_item_invitees
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT tenant_id FROM public.profiles WHERE id = auth.uid())
    AND invited_by = auth.uid()
  );

-- Invitee can update their own status; inviter can also correct
DROP POLICY IF EXISTS sii_tenant_update ON public.schedule_item_invitees;
CREATE POLICY sii_tenant_update ON public.schedule_item_invitees
  FOR UPDATE TO authenticated
  USING (
    invitee_user_id = auth.uid() OR invited_by = auth.uid()
  )
  WITH CHECK (
    invitee_user_id = auth.uid() OR invited_by = auth.uid()
  );

-- Only inviter can rescind
DROP POLICY IF EXISTS sii_tenant_delete ON public.schedule_item_invitees;
CREATE POLICY sii_tenant_delete ON public.schedule_item_invitees
  FOR DELETE TO authenticated
  USING (invited_by = auth.uid());

COMMIT;

NOTIFY pgrst, 'reload schema';
