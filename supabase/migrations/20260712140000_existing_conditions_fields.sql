-- CONFIGURATOR_POLISH Phase 3 — existing-conditions checklist fields.
-- The estimator was inventing demo/removal lines ("80 SF existing wall tile") from conditions it
-- never asked. These fields capture WHAT EXISTS TODAY so a removal line can cite an answer.
-- audience='rep' (site-visit facts, not client selections). Negative money_risk_rank so they LEAD
-- the interview ("what's there now" before "what do you want") — no CHECK on the column (verified);
-- existing 'want' fields start at rank 1, so negatives sort first. adds_trades NULL (informational
-- conditions, not selections). Idempotent.

INSERT INTO scope_checklists (tenant_id, project_type, field_key, question, field_type, options, money_risk_rank, adds_trades, audience, risk_note, active) VALUES
  -- BATHROOM
  (NULL,'bathroom','existing_tub_shower',  'Right now, what''s in the space — a tub, a shower, both, or neither?', 'choice', '["tub","shower","combo","none"]'::jsonb, -10, NULL, 'rep', 'Gates tub/shower removal demo; do not assume a fixture to tear out', true),
  (NULL,'bathroom','existing_wall_finish', 'What are the walls finished with today — tile, painted drywall, or something else?', 'choice', '["tile","painted_drywall","other"]'::jsonb, -9, NULL, 'rep', 'Gates wall-tile removal demo (the invented "80 SF existing tile" line)', true),
  (NULL,'bathroom','existing_floor_finish','What''s the floor today — tile, vinyl/LVP, or something else?', 'choice', '["tile","vinyl_lvp","other"]'::jsonb, -8, NULL, 'rep', 'Gates floor removal demo', true),
  (NULL,'bathroom','existing_vanity',      'Is there a vanity now — none, one, or a double?', 'choice', '["none","single","double"]'::jsonb, -7, NULL, 'rep', 'Gates vanity demo', true),
  (NULL,'bathroom','existing_countertop',  'Existing vanity top — none, laminate, or stone?', 'choice', '["none","laminate","stone"]'::jsonb, -6, NULL, 'rep', 'Gates countertop removal demo', true),
  -- KITCHEN
  (NULL,'kitchen','existing_countertop','What''s the countertop today — none, laminate, stone, or butcher block?', 'choice', '["none","laminate","stone","butcher_block"]'::jsonb, -10, NULL, 'rep', 'Gates countertop removal demo', true),
  (NULL,'kitchen','existing_flooring',  'What''s the kitchen floor today — tile, vinyl/LVP, hardwood, or other?', 'choice', '["tile","vinyl_lvp","hardwood","other"]'::jsonb, -9, NULL, 'rep', 'Gates floor removal demo', true),
  (NULL,'kitchen','existing_backsplash','Is there a backsplash now — none, tile, or other?', 'choice', '["none","tile","other"]'::jsonb, -8, NULL, 'rep', 'Gates backsplash removal demo', true),
  -- BASEMENT
  (NULL,'basement','existing_finish',  'Is the basement unfinished, partially finished, or fully finished today?', 'choice', '["unfinished","partially_finished","fully_finished"]'::jsonb, -10, NULL, 'rep', 'Gates demo of existing finishes; unfinished = no tear-out', true),
  (NULL,'basement','existing_flooring','What''s on the basement floor now — bare slab, carpet, tile, or other?', 'choice', '["none_slab","carpet","tile","other"]'::jsonb, -9, NULL, 'rep', 'Gates floor removal demo', true)
ON CONFLICT (tenant_id, project_type, field_key) DO UPDATE SET
  question=EXCLUDED.question, field_type=EXCLUDED.field_type, options=EXCLUDED.options,
  money_risk_rank=EXCLUDED.money_risk_rank, audience=EXCLUDED.audience, risk_note=EXCLUDED.risk_note, active=true;
