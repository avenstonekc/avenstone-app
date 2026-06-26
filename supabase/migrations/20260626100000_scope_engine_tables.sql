-- SCOPE_CAPTURE_ENGINE P1B — three scope tables.
-- Platform-default/tenant-override pattern mirrors takeoff_templates:
--   tenant_id NULL = platform default, readable by all tenants.
--   tenant rows override platform defaults for that tenant.
-- RLS mirrors takeoff_templates_select + takeoff_templates_owner_write policies.

-- ── scope_checklists ──────────────────────────────────────────────────────────
-- Required fields to gather per project_type. money_risk_rank: lower = gather first.
CREATE TABLE scope_checklists (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID,
  project_type      TEXT        NOT NULL,
  field_key         TEXT        NOT NULL,
  question          TEXT        NOT NULL,
  field_type        TEXT        NOT NULL CHECK (field_type IN ('choice','number','text','bool')),
  options           JSONB,
  money_risk_rank   INT         NOT NULL DEFAULT 99,
  adds_trades       TEXT[],
  active            BOOLEAN     NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, project_type, field_key)
);

CREATE INDEX idx_scope_checklists_tenant_project ON scope_checklists (tenant_id, project_type);

ALTER TABLE scope_checklists ENABLE ROW LEVEL SECURITY;
CREATE POLICY sc_select ON scope_checklists FOR SELECT USING (tenant_id = get_my_tenant_id() OR tenant_id IS NULL);
CREATE POLICY sc_write  ON scope_checklists FOR ALL   USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');

-- ── scope_modules ─────────────────────────────────────────────────────────────
-- Cross-cutting expansion modules. Fired when trigger_phrases appear in any source.
-- adds_fields: array of checklist-field-shape objects bolted onto the open-questions set.
CREATE TABLE scope_modules (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID,
  module_key      TEXT        NOT NULL,
  label           TEXT        NOT NULL,
  trigger_phrases TEXT[]      NOT NULL DEFAULT '{}',
  adds_fields     JSONB       NOT NULL DEFAULT '[]',
  adds_trades     TEXT[],
  active          BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, module_key)
);

CREATE INDEX idx_scope_modules_tenant ON scope_modules (tenant_id);

ALTER TABLE scope_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY sm_select ON scope_modules FOR SELECT USING (tenant_id = get_my_tenant_id() OR tenant_id IS NULL);
CREATE POLICY sm_write  ON scope_modules FOR ALL   USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');

-- ── scope_conflict_rules ──────────────────────────────────────────────────────
-- Phase-3 vision-reconciliation rules. Seeded lightly now as shape proof.
CREATE TABLE scope_conflict_rules (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID,
  rule_key              TEXT        NOT NULL,
  sources_compared      TEXT[]      NOT NULL DEFAULT '{}',
  conflict_condition    TEXT        NOT NULL,
  question_when_conflict TEXT       NOT NULL,
  active                BOOLEAN     NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, rule_key)
);

CREATE INDEX idx_scope_conflict_rules_tenant ON scope_conflict_rules (tenant_id);

ALTER TABLE scope_conflict_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY scr_select ON scope_conflict_rules FOR SELECT USING (tenant_id = get_my_tenant_id() OR tenant_id IS NULL);
CREATE POLICY scr_write  ON scope_conflict_rules FOR ALL   USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');
