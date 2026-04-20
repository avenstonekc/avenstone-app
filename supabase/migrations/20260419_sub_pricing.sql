-- ============================================================
-- MIGRATION: sub_pricing + sub_pricing_changes tables
-- Sub pricing is set via the AI onboarding wizard (ai-sub-onboard edge fn)
-- and managed by owners via OwnerPortal. Both tables were referenced in
-- app code but never created.
-- ============================================================

CREATE TABLE IF NOT EXISTS sub_pricing (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  sub_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tenant_id   uuid NOT NULL,
  trade       text NOT NULL,
  item_label  text NOT NULL,
  unit_price  numeric DEFAULT 0,
  price       numeric DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (sub_id, trade, item_label)
);
CREATE INDEX IF NOT EXISTS idx_sub_pricing_sub ON sub_pricing(sub_id);
ALTER TABLE sub_pricing ENABLE ROW LEVEL SECURITY;

-- Subs read/write their own; owners and PMs read all in tenant
CREATE POLICY "sub_pricing_select" ON sub_pricing FOR SELECT
  USING (sub_id = auth.uid() OR get_my_role() IN ('owner', 'project_manager'));
CREATE POLICY "sub_pricing_insert" ON sub_pricing FOR INSERT
  WITH CHECK (sub_id = auth.uid() OR get_my_role() = 'owner');
CREATE POLICY "sub_pricing_update" ON sub_pricing FOR UPDATE
  USING (sub_id = auth.uid() OR get_my_role() = 'owner');
CREATE POLICY "sub_pricing_delete" ON sub_pricing FOR DELETE
  USING (sub_id = auth.uid() OR get_my_role() = 'owner');

-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sub_pricing_changes (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL,
  pricing_id  uuid REFERENCES sub_pricing(id) ON DELETE CASCADE,
  sub_id      uuid REFERENCES profiles(id) ON DELETE CASCADE,
  new_price   numeric,
  status      text DEFAULT 'pending_owner',
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sub_pricing_changes_tenant ON sub_pricing_changes(tenant_id, status);
ALTER TABLE sub_pricing_changes ENABLE ROW LEVEL SECURITY;

-- Subs read/insert their own change requests; owners can read all + approve/reject
CREATE POLICY "sub_pricing_changes_select" ON sub_pricing_changes FOR SELECT
  USING (sub_id = auth.uid() OR get_my_role() = 'owner');
CREATE POLICY "sub_pricing_changes_insert" ON sub_pricing_changes FOR INSERT
  WITH CHECK (sub_id = auth.uid());
CREATE POLICY "sub_pricing_changes_update" ON sub_pricing_changes FOR UPDATE
  USING (get_my_role() = 'owner');
