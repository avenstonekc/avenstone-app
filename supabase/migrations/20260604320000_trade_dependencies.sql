-- ANTI_SURPRISE_ENGINE_ARC Phase 2.2 Slice 1 — trade_dependencies table + RLS
--
-- Tenant-aware trade precedence rules.
-- Platform defaults (tenant_id IS NULL) readable by all tenants.
-- Tenant rows override/extend platform defaults for that tenant only.
-- Pattern mirrors template_scope_subsets / takeoff_unit_costs override model.
--
-- UNIQUE NULLS NOT DISTINCT (tenant_id, predecessor_trade, successor_trade):
-- A tenant row with the same pair as a platform default shadows the platform row
-- client-side (JS de-dup picks tenant row first). Platform rows are immutable via RLS.

BEGIN;

CREATE TABLE IF NOT EXISTS public.trade_dependencies (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        REFERENCES public.tenants(id) ON DELETE CASCADE,
  predecessor_trade TEXT        NOT NULL,
  successor_trade   TEXT        NOT NULL,
  lag_days          INT         NOT NULL DEFAULT 0,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, predecessor_trade, successor_trade)
);

-- Primary lookup: find all rules where trade X is a successor (wiring hook)
CREATE INDEX IF NOT EXISTS idx_trade_deps_successor
  ON public.trade_dependencies (successor_trade);

-- Reverse lookup: find all successors of a predecessor trade (cascade engine)
CREATE INDEX IF NOT EXISTS idx_trade_deps_predecessor
  ON public.trade_dependencies (predecessor_trade);

-- Tenant override rows index
CREATE INDEX IF NOT EXISTS idx_trade_deps_tenant
  ON public.trade_dependencies (tenant_id) WHERE tenant_id IS NOT NULL;

ALTER TABLE public.trade_dependencies ENABLE ROW LEVEL SECURITY;

-- Platform defaults (tenant_id IS NULL) + own-tenant rows readable by all authenticated
DROP POLICY IF EXISTS td_select ON public.trade_dependencies;
CREATE POLICY td_select ON public.trade_dependencies
  FOR SELECT TO authenticated
  USING (tenant_id IS NULL OR tenant_id = get_my_tenant_id());

-- Owner and PM can write their own tenant's override rows.
-- Platform defaults (tenant_id IS NULL) are service-role-only — not writable via client.
DROP POLICY IF EXISTS td_insert ON public.trade_dependencies;
CREATE POLICY td_insert ON public.trade_dependencies
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner', 'project_manager'));

DROP POLICY IF EXISTS td_update ON public.trade_dependencies;
CREATE POLICY td_update ON public.trade_dependencies
  FOR UPDATE TO authenticated
  USING  (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner', 'project_manager'))
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner', 'project_manager'));

DROP POLICY IF EXISTS td_delete ON public.trade_dependencies;
CREATE POLICY td_delete ON public.trade_dependencies
  FOR DELETE TO authenticated
  USING (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner', 'project_manager'));

COMMIT;

NOTIFY pgrst, 'reload schema';
