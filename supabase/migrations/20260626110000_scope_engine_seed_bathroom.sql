-- SCOPE_CAPTURE_ENGINE P1B — seed bathroom checklist + cross-cutting modules + sample conflict rules.
-- Platform defaults only (tenant_id NULL). ON CONFLICT DO NOTHING makes this idempotent.
-- project_type 'bathroom' matches live template_scope_subsets room_type exactly.
-- adds_trades use live trade_taxonomy "Parent - Sub_trade" strings confirmed from takeoff_templates.

-- ── BATHROOM CHECKLIST (money_risk_rank: lower = gather first / most expensive) ────────────────

INSERT INTO scope_checklists
  (tenant_id, project_type, field_key, question, field_type, options, money_risk_rank, adds_trades, active)
VALUES
  -- Rank 1: The fixture fork — most expensive; drives every downstream trade.
  (NULL, 'bathroom', 'shower_type',
   'Tub only, walk-in shower, tub-to-shower conversion, or tub + separate shower?',
   'choice',
   '["tub_only","walk_in","tub_to_shower_conversion","tub_and_separate_shower"]',
   1,
   ARRAY['Plumbing - Rough-in', 'Tile - Wall / shower', 'Tile - Floor'],
   true),

  -- Rank 2: Tiled shower floor fires waterproofing module (the BATHROOM RULES hardcode this engine replaces).
  (NULL, 'bathroom', 'shower_floor_tiled',
   'Is the shower floor tiled (vs. solid surface, fiberglass, etc.)?',
   'bool', NULL, 2,
   ARRAY['Tile - Floor'],
   true),

  -- Rank 3: Fixture relocation — fires plumbing_relocation module; most expensive plumbing work.
  (NULL, 'bathroom', 'layout_change',
   'Are any plumbing fixtures being moved or relocated (toilet, shower, tub, sink)?',
   'bool', NULL, 3,
   ARRAY['Plumbing - Rough-in'],
   true),

  -- Rank 4: Wall tile extent — drives tile quantity significantly.
  (NULL, 'bathroom', 'wall_tile_extent',
   'How far up do the shower/tub surround tiles go?',
   'choice',
   '["floor_to_ceiling","48_inch","36_inch","no_tile_surround"]',
   4,
   ARRAY['Tile - Wall / shower'],
   true),

  -- Rank 5: Vanity count — drives cab/plumbing/electric scope.
  (NULL, 'bathroom', 'vanity_count',
   'How many vanities?',
   'number', NULL, 5,
   ARRAY['Cabinets / vanities - Install', 'Plumbing - Finish / fixtures'],
   true),

  -- Rank 6: Floor finish — tile vs LVP vs sheet.
  (NULL, 'bathroom', 'floor_finish',
   'What is the floor finish?',
   'choice',
   '["tile","lvp","vinyl_sheet","other"]',
   6,
   ARRAY['Tile - Floor', 'Flooring - LVP'],
   true),

  -- Rank 7: Ventilation — fan code requirement; catch early.
  (NULL, 'bathroom', 'ventilation',
   'Is there an exhaust fan? (existing, upgrading to GFCI + new fan, or new install)',
   'choice',
   '["existing_keep","upgrade","new_install","none"]',
   7,
   ARRAY['Electrical - Rough-in', 'Electrical - Finish'],
   true),

  -- Rank 8: Drywall / wet-area material — moisture-resistant spec.
  (NULL, 'bathroom', 'drywall_wet_area',
   'Wet-area drywall — standard or cement board / Durock behind tile?',
   'choice',
   '["standard_mr","cement_board","existing_keep"]',
   8,
   ARRAY['Drywall - Hang'],
   true),

  -- Rank 9: Access behind shower — impacts demo scope.
  (NULL, 'bathroom', 'access_panel',
   'Is there access behind the shower/tub wall for plumbing (access panel, adjacent closet)?',
   'bool', NULL, 9, NULL, true)

ON CONFLICT (tenant_id, project_type, field_key) DO NOTHING;


-- ── CROSS-CUTTING MODULES (project-type-agnostic, fire on any scope) ────────────────────────────

INSERT INTO scope_modules
  (tenant_id, module_key, label, trigger_phrases, adds_fields, adds_trades, active)
VALUES
  -- waterproofing — replaces the silent BATHROOM RULES hardcode in buildScopeSystemPrompt.
  -- Fires: tiled shower floor, steam shower, curbless, wet room.
  (NULL, 'waterproofing', 'Tiled Wet-Area Waterproofing',
   ARRAY['tiled shower floor','steam shower','curbless','wet room','shower pan','schluter','membrane'],
   '[
     {"field_key":"membrane_type","question":"Shower waterproofing membrane: Schluter Kerdi, hot-mop, or other?","field_type":"choice","options":["schluter_kerdi","hot_mop","other"]},
     {"field_key":"curb_type","question":"Standard curb or curbless (zero-threshold) entry?","field_type":"choice","options":["standard_curb","curbless"]},
     {"field_key":"steam_shower","question":"Steam shower? (adds vapor barrier + steam unit rough-in)","field_type":"bool"}
   ]',
   ARRAY['Tile - Floor', 'Tile - Wall / shower'],
   true),

  -- structural — fires: wall removal, vault, bump-out, load-bearing.
  (NULL, 'structural', 'Framing / Structural Change',
   ARRAY['remove wall','open up','vault','load bearing','load-bearing','bump out','bump-out','header','open concept','tear out wall'],
   '[
     {"field_key":"wall_load_bearing","question":"Is the wall being removed load-bearing?","field_type":"bool"},
     {"field_key":"opening_width_ft","question":"Approximate opening width (ft)?","field_type":"number"},
     {"field_key":"ceiling_work","question":"Any ceiling modification (vault, drop, drywall repair)?","field_type":"bool"}
   ]',
   ARRAY['Framing', 'Demo', 'Drywall - Hang'],
   true),

  -- plumbing_relocation — fires: moving fixtures, relocate, rough-in changes.
  (NULL, 'plumbing_relocation', 'Plumbing Fixture Relocation',
   ARRAY['move toilet','move shower','move tub','relocate','moving fixtures','rough-in change','new location'],
   '[
     {"field_key":"relocation_fixtures","question":"Which fixtures are being relocated (toilet, shower, tub, sink)?","field_type":"text"},
     {"field_key":"slab_work","question":"Does the relocation require cutting the slab?","field_type":"bool"}
   ]',
   ARRAY['Plumbing - Rough-in', 'Demo'],
   true),

  -- electrical_upgrade — fires: panel work, new circuits, service upgrade.
  (NULL, 'electrical_upgrade', 'Electrical Service / Circuits',
   ARRAY['panel upgrade','service upgrade','new circuits','add circuits','breaker box','200 amp','electrical upgrade'],
   '[
     {"field_key":"panel_scope","question":"Panel upgrade or add circuits only?","field_type":"choice","options":["new_circuits_only","panel_upgrade"]},
     {"field_key":"gfci_required","question":"GFCI outlets required in wet area? (usually yes — code)","field_type":"bool"}
   ]',
   ARRAY['Electrical - Rough-in', 'Electrical - Service upgrade'],
   true),

  -- water_mold_remediation — fires: water damage, mold, staining, rot.
  (NULL, 'water_mold_remediation', 'Water / Mold Remediation',
   ARRAY['water damage','mold','black mold','staining','wet walls','rot','water intrusion','moisture damage','remediation'],
   '[
     {"field_key":"remediation_sf","question":"Approximately how many SF of affected area need remediation?","field_type":"number"},
     {"field_key":"source_addressed","question":"Has the water source been identified and fixed?","field_type":"bool"}
   ]',
   ARRAY['Demo', 'Drywall - Hang', 'Drywall - Tape / mud / texture'],
   true)

ON CONFLICT (tenant_id, module_key) DO NOTHING;


-- ── CONFLICT RULES (Phase-3 shape proof — two canonical examples) ─────────────────────────────

INSERT INTO scope_conflict_rules
  (tenant_id, rule_key, sources_compared, conflict_condition, question_when_conflict, active)
VALUES
  -- Classic fixture mismatch between what rep typed and what photo shows.
  (NULL, 'shower_fixture_conflict',
   ARRAY['typed','photo'],
   'shower_type field value differs between typed input and photo evidence',
   'You said {typed} but the photo shows {photo} — which is correct?',
   true),

  -- Window in wet wall — plan shows it, typed scope doesn''t mention it.
  (NULL, 'wet_wall_window_omission',
   ARRAY['plan','typed'],
   'plan shows a window in the shower or tub wet wall not mentioned in typed scope',
   'The plan shows a window in the wet wall — is it staying as-is, being moved, or being closed in?',
   true)

ON CONFLICT (tenant_id, rule_key) DO NOTHING;
