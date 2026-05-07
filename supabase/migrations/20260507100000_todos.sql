-- Unified todos table.
-- Supports both:
--   1. Engine-generated job-scoped todos (source='engine', job_id NOT NULL)
--   2. User-created free-floating todos (source='manual', job_id NULLABLE)
-- BD/prospecting work for PMs and sales reps lives here as manual unscoped todos.
--
-- Replaces the prior todo-system arc table (different schema: target_user_id,
-- source_table, source_id, severity, pending/snoozed status values).

DROP TABLE IF EXISTS todos CASCADE;

CREATE TABLE todos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,

  -- NULLABLE: manual personal/BD todos may not tie to a specific job
  job_id TEXT REFERENCES jobs(id) ON DELETE CASCADE,

  title TEXT NOT NULL,
  notes TEXT,

  -- Rule-defined for engine todos. For manual todos, use 'user_task' or rule-free typing.
  type TEXT NOT NULL DEFAULT 'user_task',

  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'resolved', 'cancelled')),

  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'engine')),

  priority TEXT CHECK (priority IN ('low', 'medium', 'high')),
  due_date DATE,

  -- Ownership
  assigned_to_user_id UUID REFERENCES profiles(id),
  created_by_id UUID REFERENCES profiles(id),

  -- Audit FK to engine-source entity (e.g., material_order, engagement)
  related_entity_type TEXT,
  related_entity_id UUID,

  -- JSONB payload kept for failed_intent Resume flow (TodoCard reads todo.payload)
  payload JSONB,

  resolved_at TIMESTAMPTZ,
  resolved_reason TEXT,
  /* resolved_reason values: auto_resolved_by_engine, manually_resolved, cancelled_by_pm */

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_todos_job_status ON todos (job_id, status) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_todos_tenant_status ON todos (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_todos_assigned_open ON todos (assigned_to_user_id, status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_todos_due_open ON todos (due_date, status) WHERE status = 'open' AND due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_todos_related_entity ON todos (related_entity_type, related_entity_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_todos_type_status ON todos (type, status);

ALTER TABLE todos ENABLE ROW LEVEL SECURITY;

-- v1 RLS: PM-side roles in tenant can see/edit all todos.
-- Sub/client visibility and per-user privacy are future slices.
CREATE POLICY todos_select ON todos
  FOR SELECT USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager', 'sales_rep')
  );

CREATE POLICY todos_insert ON todos
  FOR INSERT WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager', 'sales_rep')
  );

CREATE POLICY todos_update ON todos
  FOR UPDATE USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager', 'sales_rep')
  );

CREATE POLICY todos_delete ON todos
  FOR DELETE USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() = 'owner'
  );

NOTIFY pgrst, 'reload schema';
