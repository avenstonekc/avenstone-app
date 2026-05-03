-- trade_phase_map: maps canonical trade strings to job_phases.phase_name values.
--
-- Multi-tenant safe: tenant_id IS NULL = platform default (no rows seeded this way here);
-- tenant rows (tenant_id set) override or extend the mapping for that specific tenant.
-- A GC tenant maps "Framing" → "framing"; a roofer tenant with a different phase vocabulary
-- inserts their own rows without touching anyone else's. Tenants with no rows simply get
-- no automatic phase derivation (phase tracker stays manual for them).
--
-- Avenstone GC seed uses tenant_id = '00000000-0000-0000-0000-000000000001'.
-- Trade strings are canonical full-path values from trade_taxonomy
-- (format: "parent_trade" or "parent_trade - sub_trade").
--
-- Verified against live trade_taxonomy on 2026-05-02. Divergences from spec:
--   "Drywall" (bare)      → actual: three sub-trade rows (Hang, Patch, Tape/mud/texture)
--   "Plumbing" (bare)     → actual: "Plumbing - Rough-in" (rough_mep) + "Plumbing - Finish / fixtures" (finish)
--   "Electrical" (bare)   → actual: "Electrical - Rough-in" (rough_mep) + "Electrical - Finish" (finish)
--   "Cabinets" (bare)     → actual: "Cabinets / vanities - Install"
--   "Trim" (bare)         → actual: three Trim / carpentry sub-trade rows

CREATE TABLE trade_phase_map (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        REFERENCES tenants(id),
  trade       TEXT        NOT NULL,
  phase_name  TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE NULLS NOT DISTINCT (tenant_id, trade)
);

CREATE INDEX trade_phase_map_tenant_idx ON trade_phase_map(tenant_id);

ALTER TABLE trade_phase_map ENABLE ROW LEVEL SECURITY;

-- Staff can read both platform defaults (tenant_id IS NULL) and their tenant's rows;
-- write only scoped to their own tenant
CREATE POLICY trade_phase_map_staff_all ON trade_phase_map
  FOR ALL TO authenticated
  USING  (tenant_id = get_my_tenant_id() OR tenant_id IS NULL)
  WITH CHECK (tenant_id = get_my_tenant_id());

-- ─── Avenstone GC seed ───────────────────────────────────────────────────────
-- Phase names match job_phases.phase_name values: demo, framing, rough_mep,
-- drywall, finish. (punch is manual — no single trade drives it.)

INSERT INTO trade_phase_map (tenant_id, trade, phase_name) VALUES

  -- demo
  ('00000000-0000-0000-0000-000000000001', 'Demo',                           'demo'),

  -- framing
  ('00000000-0000-0000-0000-000000000001', 'Framing',                        'framing'),

  -- rough_mep
  ('00000000-0000-0000-0000-000000000001', 'Plumbing - Rough-in',            'rough_mep'),
  ('00000000-0000-0000-0000-000000000001', 'Electrical - Rough-in',          'rough_mep'),
  ('00000000-0000-0000-0000-000000000001', 'HVAC - Install',                 'rough_mep'),

  -- drywall
  ('00000000-0000-0000-0000-000000000001', 'Drywall - Hang',                 'drywall'),
  ('00000000-0000-0000-0000-000000000001', 'Drywall - Patch',                'drywall'),
  ('00000000-0000-0000-0000-000000000001', 'Drywall - Tape / mud / texture', 'drywall'),

  -- finish
  ('00000000-0000-0000-0000-000000000001', 'Paint - Interior',               'finish'),
  ('00000000-0000-0000-0000-000000000001', 'Tile - Floor',                   'finish'),
  ('00000000-0000-0000-0000-000000000001', 'Tile - Wall / shower',           'finish'),
  ('00000000-0000-0000-0000-000000000001', 'Cabinets / vanities - Install',  'finish'),
  ('00000000-0000-0000-0000-000000000001', 'Trim / carpentry - Base / case', 'finish'),
  ('00000000-0000-0000-0000-000000000001', 'Trim / carpentry - Crown',       'finish'),
  ('00000000-0000-0000-0000-000000000001', 'Trim / carpentry - Stairs / rails', 'finish'),
  ('00000000-0000-0000-0000-000000000001', 'Plumbing - Finish / fixtures',   'finish'),
  ('00000000-0000-0000-0000-000000000001', 'Electrical - Finish',            'finish');
