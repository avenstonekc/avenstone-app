-- CONFIGURATOR_POLISH Phase 7 — bind the 2 waterproofing membrane_type option images.
-- membrane_type is a MODULE field (scope_modules.adds_fields), not a scope_checklists choice
-- field, so the upload matcher couldn't auto-bind it (uploaded as orphans). Bind here. Images
-- styled to read as tiers for 4d's good/better/best copy: hot_mop = traditional/entry,
-- schluter_kerdi = modern sheet-membrane/premium. "other" is a catch-all with no image.
INSERT INTO scope_option_images (project_type, field_key, option_key, storage_path, active) VALUES
  ('bathroom','membrane_type','schluter_kerdi','bath_membrane_type_schluter_kerdi.png', true),
  ('bathroom','membrane_type','hot_mop',       'bath_membrane_type_hot_mop.png',        true)
ON CONFLICT (project_type, field_key, option_key) DO UPDATE SET storage_path=EXCLUDED.storage_path, active=true;
