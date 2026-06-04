-- ANTI_SURPRISE_ENGINE_ARC Phase 2.2 Slice 1 — Platform-default trade dependency seed
--
-- SEED DECISION: PLATFORM DEFAULTS (tenant_id = NULL)
-- Rationale: Demo→Framing, roughs→drywall, tile→plumbing-finish are generic GC
-- construction order that applies to any residential GC tenant on the platform.
-- Avenstone-specific overrides (e.g. custom sub routing, KC inspection timelines)
-- would go in tenant-scoped rows. These 20 rows are pure construction logic.
--
-- Canonical trade strings verified against trade_taxonomy (2026-04-29 seed):
--   'Demo', 'Framing', 'Insulation' — parent-only (sub_trade IS NULL)
--   'Plumbing - Rough-in', 'Electrical - Rough-in', 'HVAC - Install'
--   'Drywall - Hang', 'Drywall - Tape / mud / texture', 'Drywall - Patch'
--   'Tile - Floor', 'Tile - Wall / shower'
--   'Paint - Interior', 'Flooring - LVP'
--   'Plumbing - Finish / fixtures', 'Electrical - Finish'
--   'Cabinets / vanities - Install'
--
-- Inspection milestone (type='inspection') is a transient state, not a trade.
-- Insulation directly precedes Drywall-Hang / Tile-Floor / Tile-Wall by transitivity
-- (inspection gate is enforced by the PM scheduling the inspection item;
--  trade_dependencies skips the milestone and models the trade-to-trade reality).
--
-- Finish-trade→Final-Inspection dependency is a milestone note, not seeded here.

INSERT INTO public.trade_dependencies (tenant_id, predecessor_trade, successor_trade, lag_days, notes) VALUES

  -- Foundation: demo before framing
  (NULL, 'Demo',               'Framing',                      0, NULL),

  -- Roughs: all three rough-in trades follow framing
  (NULL, 'Framing',            'Plumbing - Rough-in',          0, NULL),
  (NULL, 'Framing',            'Electrical - Rough-in',        0, NULL),
  (NULL, 'Framing',            'HVAC - Install',               0, NULL),

  -- Insulation: all three roughs must complete before insulation
  -- (inspector must see studs and rough MEP before batts go in)
  (NULL, 'Plumbing - Rough-in',  'Insulation',                 0, 'Rough inspection must clear first'),
  (NULL, 'Electrical - Rough-in','Insulation',                 0, 'Rough inspection must clear first'),
  (NULL, 'HVAC - Install',       'Insulation',                 0, 'Rough inspection must clear first'),

  -- Drywall and tile: follow insulation (inspection-by-transitivity)
  -- The rough-in inspection milestone falls between Insulation and these trades;
  -- trade_deps models the trade-to-trade reality (Insulation → hang/tile).
  (NULL, 'Insulation',           'Drywall - Hang',             0, NULL),
  (NULL, 'Insulation',           'Tile - Floor',               0, NULL),
  (NULL, 'Insulation',           'Tile - Wall / shower',       0, NULL),

  -- Drywall sequence: hang before tape/mud/texture and patch
  (NULL, 'Drywall - Hang',       'Drywall - Tape / mud / texture', 0, NULL),
  (NULL, 'Drywall - Hang',       'Drywall - Patch',            0, NULL),

  -- Finishes: paint and flooring follow drywall completion
  (NULL, 'Drywall - Tape / mud / texture', 'Paint - Interior', 0, NULL),
  (NULL, 'Drywall - Patch',      'Paint - Interior',           0, NULL),
  (NULL, 'Drywall - Tape / mud / texture', 'Flooring - LVP',  0, NULL),
  (NULL, 'Drywall - Patch',      'Flooring - LVP',            0, NULL),

  -- Cabinets after drywall is finished
  (NULL, 'Drywall - Tape / mud / texture', 'Cabinets / vanities - Install', 0, NULL),

  -- Plumbing finish after tile (set toilet/vanity after tile floor cures)
  (NULL, 'Tile - Floor',         'Plumbing - Finish / fixtures', 0, NULL),
  (NULL, 'Tile - Wall / shower', 'Plumbing - Finish / fixtures', 0, NULL),

  -- Electrical finish after paint (protect devices from paint splatter)
  (NULL, 'Paint - Interior',     'Electrical - Finish',        0, NULL)

ON CONFLICT (tenant_id, predecessor_trade, successor_trade) DO NOTHING;
