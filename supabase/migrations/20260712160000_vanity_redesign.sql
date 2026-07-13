-- CONFIGURATOR_POLISH — vanity addendum (missed in Phase 3). Replace the vanity_count NUMBER with
-- a vanity_config CHOICE, make vanity_size_in a CHOICE of standard widths matching the takeoff
-- consumer, gate the whole vanity block on presence, and label the top clearly.
-- (a) vanity_config single/double/none ("none" = "No vanity work") replaces vanity_count.
-- (b) vanity_size_in → choice 24/30/36/48/60/72/custom (verified vs takeoff scope_detail_schemas
--     vanity_width fixture_select: ["24","30","36","48","60","72","custom"]).
-- (d) countertop is already "Vanity top material?" (the vanity top) — gated by vanity_config.
-- (c) custom → allowance handled in the estimator prompt (description convention), not schema.

-- (a) retire vanity_count, add vanity_config (rank 11 so it LEADS the vanity block: style 12,
--     size 14, top 15).
UPDATE scope_checklists SET active=false WHERE tenant_id IS NULL AND project_type='bathroom' AND field_key='vanity_count';

INSERT INTO scope_checklists (tenant_id, project_type, field_key, question, field_type, options, money_risk_rank, adds_trades, option_labels, audience, risk_note, active) VALUES
  (NULL,'bathroom','vanity_config','Vanity — single, double, or none?', 'choice', '["single","double","none"]'::jsonb, 11, ARRAY['Cabinets / vanities - Install']::text[], '{"single":"Single vanity","double":"Double vanity","none":"No vanity work"}'::jsonb, 'rep_client', 'Double vanity = 2x plumbing centers + cabinetry; none = no vanity scope', true)
ON CONFLICT (tenant_id, project_type, field_key) DO UPDATE SET
  question=EXCLUDED.question, field_type=EXCLUDED.field_type, options=EXCLUDED.options,
  money_risk_rank=EXCLUDED.money_risk_rank, adds_trades=EXCLUDED.adds_trades,
  option_labels=EXCLUDED.option_labels, audience=EXCLUDED.audience, risk_note=EXCLUDED.risk_note, active=true;

-- (b) vanity_size_in → choice of standard widths + custom.
UPDATE scope_checklists SET
  field_type='choice',
  question='Vanity width?',
  options='["24","30","36","48","60","72","custom"]'::jsonb,
  option_labels='{"24":"24 in","30":"30 in","36":"36 in","48":"48 in","60":"60 in","72":"72 in","custom":"Custom size"}'::jsonb
WHERE tenant_id IS NULL AND project_type='bathroom' AND field_key='vanity_size_in';

-- (a) suppression: retire the vanity_count=0 rows; gate the vanity block on vanity_config=none.
DELETE FROM scope_option_suppressions WHERE gate_field_key='vanity_count';
INSERT INTO scope_option_suppressions (tenant_id, project_type, gate_field_key, gate_option_key, suppressed_field_key) VALUES
  (NULL,'bathroom','vanity_config','none','vanity_style'),
  (NULL,'bathroom','vanity_config','none','vanity_size_in'),
  (NULL,'bathroom','vanity_config','none','countertop')
ON CONFLICT (tenant_id, project_type, gate_field_key, gate_option_key, suppressed_field_key) DO NOTHING;
