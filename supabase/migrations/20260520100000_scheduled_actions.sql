-- scheduled_actions: the agent's own todo list — what it's supposed to do and when.
-- Powers AGENT_OPS arc: reminders (verb 2), self-followups (verb 3), and watchdog
-- gap detection (Phase 5 cron). Distinct from the user-facing todos table.
--
-- Mutation contract: never DELETE — use status='cancelled' for soft-delete so audit
-- trail is preserved. Service-role callers (watchdog_cron) bypass RLS entirely.
-- Authenticated inserts require created_by_id = auth.uid() (enforced by RLS).

CREATE TABLE scheduled_actions (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID        NOT NULL,
  kind                 TEXT        NOT NULL
                         CHECK (kind IN ('reminder', 'followup', 'watchdog')),
  status               TEXT        NOT NULL DEFAULT 'scheduled'
                         CHECK (status IN ('scheduled', 'fired', 'cancelled', 'failed')),
  priority             TEXT        NOT NULL DEFAULT 'normal'
                         CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

  fire_at              TIMESTAMPTZ NOT NULL,
  fired_at             TIMESTAMPTZ,
  cancelled_at         TIMESTAMPTZ,
  retry_count          INTEGER     NOT NULL DEFAULT 0,

  created_by_id        UUID        NOT NULL REFERENCES profiles(id),
  target_user_id       UUID        REFERENCES profiles(id),
  related_job_id       TEXT        REFERENCES jobs(id),
  related_todo_id      UUID        REFERENCES todos(id),
  related_entity_type  TEXT,
  related_entity_id    TEXT,

  payload              JSONB       NOT NULL DEFAULT '{}',
  result               JSONB,
  rule_key             TEXT,
  source               TEXT        NOT NULL DEFAULT 'agent'
                         CHECK (source IN ('agent', 'watchdog_cron', 'system')),

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hot index for firing cron: picks ripe rows efficiently
CREATE INDEX IF NOT EXISTS idx_sched_act_ripe
  ON scheduled_actions (fire_at)
  WHERE status = 'scheduled';

-- User-facing queries: "show me my queued actions"
CREATE INDEX IF NOT EXISTS idx_sched_act_target_status
  ON scheduled_actions (tenant_id, target_user_id, status);

-- Job-scoped queries: "what's queued for this job"
CREATE INDEX IF NOT EXISTS idx_sched_act_job_status
  ON scheduled_actions (related_job_id, status);

-- Watchdog dedup: prevents same rule firing twice for the same job
CREATE INDEX IF NOT EXISTS idx_sched_act_watchdog_dedup
  ON scheduled_actions (rule_key, related_job_id)
  WHERE status = 'scheduled' AND kind = 'watchdog';

ALTER TABLE scheduled_actions ENABLE ROW LEVEL SECURITY;

-- Creator, target user, or any owner/pm within the tenant can read
CREATE POLICY sched_act_select ON scheduled_actions
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND (
      created_by_id = auth.uid()
      OR target_user_id = auth.uid()
      OR get_my_role() IN ('owner', 'project_manager')
    )
  );

-- Tenant boundary + caller identity enforced on insert.
-- Cross-user writes (delegation, cross-target) are enforced at executor level.
-- watchdog_cron inserts via service role and bypasses this policy.
CREATE POLICY sched_act_insert ON scheduled_actions
  FOR INSERT WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND created_by_id = auth.uid()
  );

-- Creator, target, or owner/pm can update (status transitions, result patches)
CREATE POLICY sched_act_update ON scheduled_actions
  FOR UPDATE USING (
    tenant_id = get_my_tenant_id()
    AND (
      created_by_id = auth.uid()
      OR target_user_id = auth.uid()
      OR get_my_role() IN ('owner', 'project_manager')
    )
  );

-- No DELETE policy — use status='cancelled'. Audit trail preserved.

CREATE TRIGGER scheduled_actions_updated_at
  BEFORE UPDATE ON scheduled_actions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

NOTIFY pgrst, 'reload schema';
