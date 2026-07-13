-- CONFIGURATOR_POLISH Phase 4a — option display labels as data.
-- scope_checklists.options is keys-only, so the UI title-cases the key ("standard_mr" →
-- "Standard Mr"). Add option_labels JSONB (map option_key → human label). Nullable, non-breaking:
-- options stays a string[]; scope_option_trades/images still key on option_key. The configurator
-- renders option_labels[key] when present, else falls back to humanize(key). Only keys that
-- title-case badly are seeded; keys that humanize fine (matte_black → "Matte Black") are left null.

ALTER TABLE scope_checklists ADD COLUMN IF NOT EXISTS option_labels JSONB;

-- BATHROOM
UPDATE scope_checklists SET option_labels='{"standard_mr":"Standard MR (moisture-resistant)","cement_board":"Cement board","existing_keep":"Existing — keep"}'::jsonb WHERE tenant_id IS NULL AND project_type='bathroom' AND field_key='drywall_wet_area';
UPDATE scope_checklists SET option_labels='{"porcelain_woodlook":"Porcelain — wood-look","porcelain_stonelook":"Porcelain — stone-look","natural_stone":"Natural stone","lvp":"LVP"}'::jsonb WHERE tenant_id IS NULL AND project_type='bathroom' AND field_key='floor_tile';
UPDATE scope_checklists SET option_labels='{"builtin":"Built-in"}'::jsonb WHERE tenant_id IS NULL AND project_type='bathroom' AND field_key='vanity_style';
UPDATE scope_checklists SET option_labels='{"comfort_height":"Comfort height","wall_hung":"Wall-hung","bidet_circuit":"Bidet seat (needs circuit)"}'::jsonb WHERE tenant_id IS NULL AND project_type='bathroom' AND field_key='toilet';
UPDATE scope_checklists SET option_labels='{"exists_vented_out":"Exists — vented outside","exists_vented_attic":"Exists — vented to attic"}'::jsonb WHERE tenant_id IS NULL AND project_type='bathroom' AND field_key='ventilation';
UPDATE scope_checklists SET option_labels='{"pre_1950":"Pre-1950","1950_1977":"1950–1977","1978_2000":"1978–2000","post_2000":"Post-2000"}'::jsonb WHERE tenant_id IS NULL AND project_type='bathroom' AND field_key='age_of_home';
UPDATE scope_checklists SET option_labels='{"body_sprays":"Body sprays","rain_and_body":"Rain + body sprays"}'::jsonb WHERE tenant_id IS NULL AND project_type='bathroom' AND field_key='shower_valve';
UPDATE scope_checklists SET option_labels='{"subway_offset":"Subway — offset","large_format":"Large-format"}'::jsonb WHERE tenant_id IS NULL AND project_type='bathroom' AND field_key='wall_tile_layout';

-- KITCHEN
UPDATE scope_checklists SET option_labels='{"raised_panel":"Raised panel"}'::jsonb WHERE tenant_id IS NULL AND project_type='kitchen' AND field_key='cabinet_style';
UPDATE scope_checklists SET option_labels='{"undermount_single":"Undermount (single bowl)","dropin":"Drop-in"}'::jsonb WHERE tenant_id IS NULL AND project_type='kitchen' AND field_key='sink';
UPDATE scope_checklists SET option_labels='{"undercab":"Under-cabinet","otr_micro":"OTR microwave","chimney":"Chimney hood","custom":"Custom hood"}'::jsonb WHERE tenant_id IS NULL AND project_type='kitchen' AND field_key='venting';
UPDATE scope_checklists SET option_labels='{"room_available":"Room available"}'::jsonb WHERE tenant_id IS NULL AND project_type='kitchen' AND field_key='elec_panel';
UPDATE scope_checklists SET option_labels='{"none":"None","full_range":"Full — behind range","full_all":"Full — all walls"}'::jsonb WHERE tenant_id IS NULL AND project_type='kitchen' AND field_key='backsplash_extent';
UPDATE scope_checklists SET option_labels='{"client_supplied":"Client-supplied","paint_existing":"Paint existing"}'::jsonb WHERE tenant_id IS NULL AND project_type='kitchen' AND field_key='cabinets_supply';
UPDATE scope_checklists SET option_labels='{"wall_removal_open_concept":"Wall removal / open concept"}'::jsonb WHERE tenant_id IS NULL AND project_type='kitchen' AND field_key='layout_change';

-- BASEMENT
UPDATE scope_checklists SET option_labels='{"lvp":"LVP","concrete_polished":"Polished concrete"}'::jsonb WHERE tenant_id IS NULL AND project_type='basement' AND field_key='flooring';
UPDATE scope_checklists SET option_labels='{"dry_confirmed":"Dry — confirmed","past_issues_resolved":"Past issues — resolved","active_unknown":"Active / unknown"}'::jsonb WHERE tenant_id IS NULL AND project_type='basement' AND field_key='moisture';
UPDATE scope_checklists SET option_labels='{"drop":"Drop ceiling","exposed_painted":"Exposed — painted"}'::jsonb WHERE tenant_id IS NULL AND project_type='basement' AND field_key='ceiling';

-- DECK / ROOF / EXTERIOR / FENCE — acronyms
UPDATE scope_checklists SET option_labels='{"pt":"PT (pressure-treated)","pvc":"PVC"}'::jsonb WHERE tenant_id IS NULL AND project_type='deck' AND field_key='material';
UPDATE scope_checklists SET option_labels='{"low_under_30in":"Low (under 30 in)"}'::jsonb WHERE tenant_id IS NULL AND project_type='deck' AND field_key='size_height';
UPDATE scope_checklists SET option_labels='{"standing_seam":"Standing seam","rpanel":"R-panel"}'::jsonb WHERE tenant_id IS NULL AND project_type='roof' AND field_key='material';
UPDATE scope_checklists SET option_labels='{"3tab":"3-tab","architectural":"Architectural"}'::jsonb WHERE tenant_id IS NULL AND project_type='roof' AND field_key='shingle_grade';
UPDATE scope_checklists SET option_labels='{"5k":"5-inch K-style","6k":"6-inch K-style","guards":"With guards"}'::jsonb WHERE tenant_id IS NULL AND project_type='roof' AND field_key='gutters';
UPDATE scope_checklists SET option_labels='{"lp":"LP SmartSide","board_batten":"Board & batten","fiber_cement":"Fiber cement"}'::jsonb WHERE tenant_id IS NULL AND project_type='exterior' AND field_key='new_material';
UPDATE scope_checklists SET option_labels='{"pt":"PT (pressure-treated)"}'::jsonb WHERE tenant_id IS NULL AND project_type='fence' AND field_key='material';
UPDATE scope_checklists SET option_labels='{"board_on_board":"Board-on-board","split_rail":"Split rail","chain_link":"Chain-link"}'::jsonb WHERE tenant_id IS NULL AND project_type='fence' AND field_key='style';
UPDATE scope_checklists SET option_labels='{"4ft":"4 ft","6ft":"6 ft","8ft":"8 ft"}'::jsonb WHERE tenant_id IS NULL AND project_type='fence' AND field_key='height';
