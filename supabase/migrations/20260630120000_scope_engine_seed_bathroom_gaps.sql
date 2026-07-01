-- SCOPE_CAPTURE_ENGINE — bathroom checklist gap-fill (Kalin-confirmed 2026-06-30).
-- Adds 4 detail fields the P1B live runs surfaced as commonly-forgotten: glass enclosure,
-- shower valve/fixtures, shower niche, shower bench. Purpose is COMPLETENESS (don't forget
-- planning details), not money-ordering — appended at ranks 10-13 after the existing 9.
-- Platform defaults only (tenant_id NULL). ON CONFLICT DO NOTHING makes this idempotent.
-- adds_trades use live trade_taxonomy strings; glass/enclosure is priced as a material row
-- under 'Tile - Wall / shower' (no separate shower-door trade exists — confirmed 20260430_seed_bathroom_fixtures).

INSERT INTO scope_checklists
  (tenant_id, project_type, field_key, question, field_type, options, money_risk_rank, adds_trades, active)
VALUES
  -- Rank 10: Glass enclosure — big finish fork, previously unasked. Options mirror the live
  -- takeoff_unit_costs shower-door catalog (slider/semi-frameless/frameless/curtain/none/keep).
  (NULL, 'bathroom', 'shower_enclosure',
   'Shower/tub enclosure: frameless glass, semi-frameless glass, sliding glass door, curtain rod, none, or keep existing?',
   'choice',
   '["frameless","semi_frameless","glass_slider","curtain_rod","none","keep_existing"]',
   10,
   ARRAY['Tile - Wall / shower'],
   true),

  -- Rank 11: Shower valve / fixtures — drives plumbing-finish trim + rough-in valve spec.
  (NULL, 'bathroom', 'shower_valve',
   'Shower valve/fixtures: standard single valve, rain head, body sprays, or rain + body?',
   'choice',
   '["standard","rain","body_sprays","rain_and_body"]',
   11,
   ARRAY['Plumbing - Finish / fixtures', 'Plumbing - Rough-in'],
   true),

  -- Rank 12: Shower niche(s) — recessed niche adds tile labor + blocking.
  (NULL, 'bathroom', 'shower_niche',
   'How many recessed niches in the shower/tub wall? (0 if none)',
   'number', NULL, 12,
   ARRAY['Tile - Wall / shower'],
   true),

  -- Rank 13: Built-in shower bench/seat — adds framing/blocking + tile (waterproofing module already fires on tiled wet area).
  (NULL, 'bathroom', 'shower_bench',
   'Is there a built-in shower bench or seat?',
   'bool', NULL, 13,
   ARRAY['Framing', 'Tile - Wall / shower'],
   true)

ON CONFLICT (tenant_id, project_type, field_key) DO NOTHING;
