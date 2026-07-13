-- TAKEOFF_BRIDGE Phase 3 — dimension capture. The configurator was dimensionless: it held rich
-- finish/selection answers but no areas, so takeoff (and the estimator) had no persisted floor SF,
-- shower dims, or wall height to price from. Add the missing dimension NUMBER fields to the
-- bathroom checklist as data, persisted through the normal answer path (job_scope_answers).
-- audience='rep' for now. money_risk_rank in [-5..-1]: dimensions lead the interview but come AFTER
-- existing-conditions (existing_* are -10..-6) and before the finish 'want' fields (rank 1+).
-- Shower dims are asked ONLY when a shower exists — suppressed on tub_only + combo (below), kept
-- for walkin / freestanding_plus_shower.
--
-- tile_height stays CATEGORICAL (ceiling/standard/wainscot) for the client-facing feel — the
-- categorical→inches mapping is a Phase 4 concern and belongs where takeoff consumes wall tile
-- height (buildTakeoffDraft / scope_detail resolution): ceiling→wall_height_in, standard≈48-60in,
-- wainscot≈36in. Do NOT convert tile_height to a number here.

INSERT INTO scope_checklists (tenant_id, project_type, field_key, question, field_type, options, money_risk_rank, adds_trades, audience, helper, risk_note, active) VALUES
  (NULL,'bathroom','floor_sf',              'Bathroom floor area (square feet)?', 'number', NULL, -5, NULL, 'rep', 'Length × width of the finished floor. Rough guide: a standard 5×8 bath ≈ 40 SF; a large primary bath ≈ 80-120 SF.', 'Drives floor tile + demo quantities; the persisted home for the estimator SF', true),
  (NULL,'bathroom','wall_height_in',        'Ceiling height (inches)?', 'number', NULL, -4, NULL, 'rep', 'Floor to ceiling. 96 in (8 ft) is typical; older homes are often 108 in.', 'Drives wall tile SF + drywall', true),
  (NULL,'bathroom','shower_width_in',       'Shower/tub width (inches)?', 'number', NULL, -3, ARRAY['Tile - Wall / shower']::text[], 'rep', 'Inside dimension of the shower or tub area, left to right.', 'Drives shower wall + floor tile SF', true),
  (NULL,'bathroom','shower_length_in',      'Shower/tub depth (inches)?', 'number', NULL, -2, ARRAY['Tile - Wall / shower']::text[], 'rep', 'Inside dimension front to back.', 'Drives shower wall + floor tile SF', true),
  (NULL,'bathroom','shower_wall_height_in', 'Shower wall-tile height (inches)?', 'number', NULL, -1, ARRAY['Tile - Wall / shower']::text[], 'rep', 'How high the wall tile runs in the shower. 96 in (to the ceiling) is common; a standard stall is often 80-84 in.', 'Drives shower wall tile SF', true)
ON CONFLICT (tenant_id, project_type, field_key) DO UPDATE SET
  question=EXCLUDED.question, field_type=EXCLUDED.field_type, options=EXCLUDED.options,
  money_risk_rank=EXCLUDED.money_risk_rank, adds_trades=EXCLUDED.adds_trades,
  audience=EXCLUDED.audience, helper=EXCLUDED.helper, risk_note=EXCLUDED.risk_note, active=true;

-- Suppress the three shower dims where there is no separate shower (tub_only) or the tub IS the
-- shower footprint (combo). Composes with the existing tub_shower_config suppression rows.
INSERT INTO scope_option_suppressions (tenant_id, project_type, gate_field_key, gate_option_key, suppressed_field_key) VALUES
  (NULL,'bathroom','tub_shower_config','tub_only','shower_width_in'),
  (NULL,'bathroom','tub_shower_config','tub_only','shower_length_in'),
  (NULL,'bathroom','tub_shower_config','tub_only','shower_wall_height_in'),
  (NULL,'bathroom','tub_shower_config','combo','shower_width_in'),
  (NULL,'bathroom','tub_shower_config','combo','shower_length_in'),
  (NULL,'bathroom','tub_shower_config','combo','shower_wall_height_in')
ON CONFLICT (tenant_id, project_type, gate_field_key, gate_option_key, suppressed_field_key) DO NOTHING;
