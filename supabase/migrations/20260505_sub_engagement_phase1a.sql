-- ===========================================================================
-- Sub Engagement Phase 1a: schema foundation
-- New: job_sub_engagements, engagement_bids, schedule_items.engagement_id
-- Strictly additive. No legacy tables touched.
-- Note: named engagement_bids (not bid_responses) to avoid collision with
-- the existing bid_responses table from the ITB/quote system.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- job_sub_engagements
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_sub_engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  sub_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  trade TEXT NOT NULL,

  bid_type TEXT NOT NULL CHECK (bid_type IN ('sub_drafted', 'gc_drafted')),

  status TEXT NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'bid_submitted', 'active', 'completed',
                      'declined', 'withdrawn', 'removed')),

  scope_description TEXT,
  due_date DATE,
  budget_min NUMERIC,
  budget_max NUMERIC,
  shared_doc_ids UUID[] DEFAULT '{}',
  shared_photo_ids UUID[] DEFAULT '{}',
  notes TEXT,

  first_viewed_at TIMESTAMPTZ,

  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  invited_by_id UUID REFERENCES profiles(id),
  bid_submitted_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  activated_by_id UUID REFERENCES profiles(id),
  completed_at TIMESTAMPTZ,
  completed_by_id UUID REFERENCES profiles(id),
  terminated_at TIMESTAMPTZ,
  terminated_by_id UUID REFERENCES profiles(id),
  termination_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_one_live_engagement
  ON job_sub_engagements (job_id, sub_id, trade)
  WHERE status NOT IN ('completed', 'declined', 'withdrawn', 'removed');

CREATE INDEX IF NOT EXISTS idx_eng_tenant_status
  ON job_sub_engagements (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_eng_job ON job_sub_engagements (job_id);
CREATE INDEX IF NOT EXISTS idx_eng_sub ON job_sub_engagements (sub_id);
CREATE INDEX IF NOT EXISTS idx_eng_trade ON job_sub_engagements (trade);

ALTER TABLE job_sub_engagements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "engagements_select" ON job_sub_engagements
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND (
      get_my_role() IN ('owner', 'project_manager', 'sales_rep')
      OR (get_my_role() = 'sub' AND sub_id = auth.uid())
    )
  );

CREATE POLICY "engagements_insert" ON job_sub_engagements
  FOR INSERT WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager', 'sales_rep')
  );

CREATE POLICY "engagements_update" ON job_sub_engagements
  FOR UPDATE USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager', 'sales_rep')
  );

CREATE POLICY "engagements_delete" ON job_sub_engagements
  FOR DELETE USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() = 'owner'
  );

-- ---------------------------------------------------------------------------
-- engagement_bids
-- (Named engagement_bids to avoid collision with existing bid_responses table)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS engagement_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  engagement_id UUID NOT NULL REFERENCES job_sub_engagements(id) ON DELETE CASCADE,

  total_amount NUMERIC NOT NULL,
  terms TEXT,
  start_date DATE,
  end_date DATE,
  line_items JSONB,
  attached_doc_ids UUID[] DEFAULT '{}',

  revision_number INT NOT NULL DEFAULT 1,
  is_current BOOLEAN NOT NULL DEFAULT true,

  drafted_by TEXT NOT NULL CHECK (drafted_by IN ('sub', 'gc')),
  drafted_by_id UUID REFERENCES profiles(id),
  submitted_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  accepted_by_id UUID REFERENCES profiles(id),
  rejected_at TIMESTAMPTZ,
  rejected_by_id UUID REFERENCES profiles(id),
  rejection_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_engbid_engagement ON engagement_bids (engagement_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_engbid_one_current
  ON engagement_bids (engagement_id) WHERE is_current = true;

ALTER TABLE engagement_bids ENABLE ROW LEVEL SECURITY;

CREATE POLICY "engagement_bids_select" ON engagement_bids
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND (
      get_my_role() IN ('owner', 'project_manager', 'sales_rep')
      OR (
        get_my_role() = 'sub'
        AND engagement_id IN (
          SELECT id FROM job_sub_engagements WHERE sub_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "engagement_bids_insert" ON engagement_bids
  FOR INSERT WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager', 'sales_rep')
  );

CREATE POLICY "engagement_bids_update" ON engagement_bids
  FOR UPDATE USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager', 'sales_rep')
  );

-- No DELETE policy = no deletes allowed (revisions stack via is_current toggle)

-- ---------------------------------------------------------------------------
-- schedule_items: engagement_id audit FK
-- ---------------------------------------------------------------------------
ALTER TABLE schedule_items
  ADD COLUMN IF NOT EXISTS engagement_id UUID
  REFERENCES job_sub_engagements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_schedule_engagement
  ON schedule_items (engagement_id);

-- ---------------------------------------------------------------------------
-- Schema reload
-- ---------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
