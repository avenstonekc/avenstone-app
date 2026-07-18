-- CONSULTATION_FIELD_FIXES FIX 4 — walk_stage: which scope_checklists fields the WALK coach asks.
-- Framing (Kalin): the WALK gathers information (existing conditions, what's being demoed, scope
-- intent, access, measurements, big observable money forks). The ESTIMATOR/scope-configurator
-- INTERVIEWS for the rest (design selections, finish/fixture choices, niches, permits, detail forks).
-- The walk coach + needs-list + end-gate filter to walk_stage=true; the scope configurator keeps the
-- full set. This is a DATA flag — the owner can flip individual rows later without code. Default false
-- so any newly-seeded field stays estimator-stage until deliberately promoted to the walk.
ALTER TABLE scope_checklists ADD COLUMN IF NOT EXISTS walk_stage BOOLEAN NOT NULL DEFAULT false;

-- Judgment pass over the 119 platform (tenant_id IS NULL) fields → 66 walk-stage.
UPDATE scope_checklists SET walk_stage = true
WHERE tenant_id IS NULL
  AND (project_type || '|' || field_key) IN (
    'addition|purpose_size','addition|foundation','addition|roof_tie_in','addition|hvac','addition|elec_panel','addition|connection','addition|site',
    'basement|existing_finish','basement|existing_flooring','basement|moisture','basement|egress','basement|bathroom','basement|ceiling_height','basement|mechanicals','basement|bar','basement|elec_panel',
    'bathroom|existing_tub_shower','bathroom|existing_wall_finish','bathroom|existing_floor_finish','bathroom|existing_vanity','bathroom|existing_countertop','bathroom|floor_sf','bathroom|wall_height_in','bathroom|shower_width_in','bathroom|shower_length_in','bathroom|shower_wall_height_in','bathroom|tub_shower_config','bathroom|layout_change','bathroom|shower_entry','bathroom|wet_wall_window','bathroom|ventilation','bathroom|age_of_home',
    'deck|size_height','deck|attachment','deck|existing_deck','deck|stairs','deck|overhead','deck|electrical','deck|utilities_below',
    'exterior|scope','exterior|existing_material','exterior|sheathing_condition',
    'fence|length_layout','fence|gates','fence|terrain','fence|tearout',
    'gut|room_list','gut|systems_plumbing','gut|systems_electrical','gut|systems_hvac','gut|systems_panel','gut|age_of_home',
    'kitchen|existing_countertop','kitchen|existing_flooring','kitchen|existing_backsplash','kitchen|layout_change','kitchen|wall_removal_detail','kitchen|island','kitchen|venting','kitchen|flooring_extent','kitchen|elec_panel','kitchen|age_of_home',
    'roof|scope','roof|layers','roof|pitch_access','roof|penetrations'
  );
