-- CONFIGURATOR_POLISH Phase 4b/4c/4d — plain-language questions, helper definitions, tier framing.
-- 4c adds scope_checklists.helper TEXT (module fields carry a "helper" key inside adds_fields JSONB).
-- Rule: every question a homeowner couldn't answer unaided gets plain phrasing + a one-line helper.

ALTER TABLE scope_checklists ADD COLUMN IF NOT EXISTS helper TEXT;

-- ── 4b/4c base bathroom jargon rewrites + helpers ────────────────────────────
UPDATE scope_checklists SET question='Shower drain — standard center drain or a linear (trough) drain?', helper='Linear drains slope to one plane, allow large-format floor tile, and cost more.' WHERE tenant_id IS NULL AND project_type='bathroom' AND field_key='shower_drain';
UPDATE scope_checklists SET question='Wet-area wall board — moisture-resistant drywall, cement board, or keep existing?', helper='Shower/tub walls need moisture-resistant (MR/"green") board or cement board — never standard drywall.' WHERE tenant_id IS NULL AND project_type='bathroom' AND field_key='drywall_wet_area';
UPDATE scope_checklists SET question='Recessed shampoo niche, a shelf/ledge, corner shelves, or none?', helper='A recessed niche is framed and waterproofed during the build — it cannot be added later without opening the wall.' WHERE tenant_id IS NULL AND project_type='bathroom' AND field_key='niche';
UPDATE scope_checklists SET question='Wall tile height — to the ceiling, standard height, or a wainscot (lower wall)?', helper='Tiling to the ceiling roughly doubles wall-tile quantity and labor vs standard height.' WHERE tenant_id IS NULL AND project_type='bathroom' AND field_key='tile_height';
UPDATE scope_checklists SET question='Exhaust fan — is there one now, and where is it vented?', helper='A fan vented into the attic (not outside) or missing is a code fix + a roof/soffit penetration nobody quoted.' WHERE tenant_id IS NULL AND project_type='bathroom' AND field_key='ventilation';
UPDATE scope_checklists SET question='Access panel for the tub/shower valve?', helper='A removable panel behind the valve so plumbing can be serviced without tearing out tile.' WHERE tenant_id IS NULL AND project_type='bathroom' AND field_key='access_panel';
UPDATE scope_checklists SET question='Is the shower floor tiled (custom pan), or a pre-formed base?', helper='A tiled shower floor needs a waterproofed mortar pan; a pre-formed acrylic/stone base drops in.' WHERE tenant_id IS NULL AND project_type='bathroom' AND field_key='shower_floor_tiled';

-- ── 4b module rewrites — accessibility (the named repros) + helpers, as choices ──
UPDATE scope_modules SET adds_fields='[
  {"field_key":"door_widths","question":"Doorway width for wheelchair access — does the bathroom entry (or hallway) door need widening?","field_type":"choice","options":["fine_as_is","widen_entry","widen_multiple"],"helper":"Wheelchair passage needs ~32-36in clear. This is the room DOORWAY, not the shower opening."},
  {"field_key":"grab_bar_blocking","question":"Add wood backing in the walls now so grab bars can be mounted later?","field_type":"choice","options":["now","future","none"],"helper":"Plywood backing between the studs lets grab bars mount anywhere later — cheap now, a wall tear-out later."},
  {"field_key":"threshold_heights","question":"Any raised door thresholds to level for step-free (roll-in) access?","field_type":"choice","options":["none","level_entry","level_multiple"],"helper":"A raised threshold at the door is a trip/roll hazard; leveling it makes the entry step-free."},
  {"field_key":"future_proofing_level","question":"Aging-in-place prep level — blocking, curbless entry, comfort-height fixtures?","field_type":"choice","options":["full","partial","none"],"helper":"Full = wall blocking + curbless shower + comfort-height fixtures. Partial = some of those. None = standard build."}
]'::jsonb WHERE tenant_id IS NULL AND module_key='accessibility';

-- ── 4d module — waterproofing membrane_type tier framing (good/better/best) + helpers ──
UPDATE scope_modules SET adds_fields='[
  {"field_key":"membrane_type","question":"Shower waterproofing method?","field_type":"choice","options":["hot_mop","schluter_kerdi","other"],"helper":"Good: hot mop — traditional tar-and-felt pan. Better: Kerdi — a modern orange sheet membrane, faster and warrantied. Other: if the tile sub specs something else.","option_labels":{"hot_mop":"Hot mop (traditional)","schluter_kerdi":"Kerdi sheet membrane","other":"Other / sub-specified"}},
  {"field_key":"curb_type","question":"Shower curb — a standard curb or curbless (zero-threshold)?","field_type":"choice","options":["standard_curb","curbless"],"helper":"Curbless is a zero-threshold walk/roll-in; it needs a recessed or sloped subfloor."},
  {"field_key":"steam_shower","question":"Is this a steam shower?","field_type":"bool","helper":"A steam unit needs a vapor-tight sealed enclosure, a sloped ceiling, and a steam generator."}
]'::jsonb WHERE tenant_id IS NULL AND module_key='waterproofing';
