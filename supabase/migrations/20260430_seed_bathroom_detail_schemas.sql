-- Bathroom scope detail schemas — 4 scope tags.
-- Platform defaults (tenant_id NULL).

INSERT INTO scope_detail_schemas (tenant_id, room_type, scope_tag, sort_order, schema) VALUES

-- full_remodel: all fields (11)
(NULL, 'bathroom', 'full_remodel', 1, '{
  "fields": [
    {
      "key": "shower_type",
      "label": "Shower configuration",
      "type": "select",
      "options": [
        { "value": "shower_only",     "label": "Shower only" },
        { "value": "tub_only",        "label": "Tub only (no shower)" },
        { "value": "tub_plus_shower", "label": "Tub + separate shower" }
      ],
      "default": "shower_only"
    },
    {
      "key": "shower_wall_sf",
      "label": "Shower wall tile (sf)",
      "type": "number",
      "default": 60,
      "min": 0,
      "max": 500,
      "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
    },
    {
      "key": "shower_floor_sf",
      "label": "Shower floor tile (sf)",
      "type": "number",
      "default": 12,
      "min": 0,
      "max": 100,
      "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
    },
    {
      "key": "shower_door_type",
      "label": "Shower door",
      "type": "fixture_select",
      "trade": "Tile - Wall / shower",
      "options": [
        { "value": "slider",          "material_name": "Shower door - glass slider" },
        { "value": "swing_semi",      "material_name": "Shower door - glass swing semi-frameless" },
        { "value": "swing_frameless", "material_name": "Shower door - glass swing frameless" },
        { "value": "curtain",         "material_name": "Shower door - curtain rod" },
        { "value": "none",            "material_name": "Shower door - none" },
        { "value": "keep_existing",   "material_name": "Shower door - keep existing" }
      ],
      "default": "slider",
      "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
    },
    {
      "key": "niche",
      "label": "Niche in shower",
      "type": "boolean",
      "default": false,
      "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
    },
    {
      "key": "bench",
      "label": "Bench in shower",
      "type": "boolean",
      "default": false,
      "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
    },
    {
      "key": "floor_tile_sf",
      "label": "Bathroom floor tile (sf)",
      "type": "number",
      "default_from": "room.floorSf",
      "min": 0,
      "max": 500,
      "subtract": ["shower_floor_sf"],
      "help": "Defaults to room sf, minus shower floor"
    },
    {
      "key": "vanity_width",
      "label": "Vanity width",
      "type": "fixture_select",
      "trade": "Cabinets / vanities - Install",
      "options": [
        { "value": "24",     "material_name": "Vanity cabinet 24in" },
        { "value": "30",     "material_name": "Vanity cabinet 30in" },
        { "value": "36",     "material_name": "Vanity cabinet 36in" },
        { "value": "48",     "material_name": "Vanity cabinet 48in" },
        { "value": "60",     "material_name": "Vanity cabinet 60in" },
        { "value": "72",     "material_name": "Vanity cabinet 72in" },
        { "value": "custom", "material_name": null }
      ],
      "default": "30"
    },
    {
      "key": "vanity_top",
      "label": "Vanity top material",
      "type": "fixture_select",
      "trade": "Cabinets / vanities - Install",
      "options_from": "vanity_width",
      "options_template": "Vanity top - {material} {vanity_width}in",
      "options": [
        { "value": "cultured_marble", "material_label": "Cultured marble" },
        { "value": "quartz",          "material_label": "Quartz" },
        { "value": "granite",         "material_label": "Granite" },
        { "value": "custom",          "material_label": "Custom" }
      ],
      "default": "cultured_marble",
      "show_when": { "vanity_width": ["24", "30", "36", "48", "60", "72"] }
    },
    {
      "key": "sink_count",
      "label": "Sink count",
      "type": "number",
      "default": 1,
      "min": 0,
      "max": 4
    },
    {
      "key": "toilet_type",
      "label": "Toilet replacement",
      "type": "fixture_select",
      "trade": "Plumbing - Finish / fixtures",
      "options": [
        { "value": "standard", "material_name": "Toilet standard" },
        { "value": "upgrade",  "material_name": "Toilet upgrade one-piece" },
        { "value": "keep",     "material_name": null }
      ],
      "default": "standard"
    }
  ]
}'::jsonb),

-- tile_only: shower + floor only (7 fields — drop vanity_width, vanity_top, sink_count, toilet_type)
(NULL, 'bathroom', 'tile_only', 2, '{
  "fields": [
    {
      "key": "shower_type",
      "label": "Shower configuration",
      "type": "select",
      "options": [
        { "value": "shower_only",     "label": "Shower only" },
        { "value": "tub_only",        "label": "Tub only (no shower)" },
        { "value": "tub_plus_shower", "label": "Tub + separate shower" }
      ],
      "default": "shower_only"
    },
    {
      "key": "shower_wall_sf",
      "label": "Shower wall tile (sf)",
      "type": "number",
      "default": 60,
      "min": 0,
      "max": 500,
      "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
    },
    {
      "key": "shower_floor_sf",
      "label": "Shower floor tile (sf)",
      "type": "number",
      "default": 12,
      "min": 0,
      "max": 100,
      "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
    },
    {
      "key": "shower_door_type",
      "label": "Shower door",
      "type": "fixture_select",
      "trade": "Tile - Wall / shower",
      "options": [
        { "value": "slider",          "material_name": "Shower door - glass slider" },
        { "value": "swing_semi",      "material_name": "Shower door - glass swing semi-frameless" },
        { "value": "swing_frameless", "material_name": "Shower door - glass swing frameless" },
        { "value": "curtain",         "material_name": "Shower door - curtain rod" },
        { "value": "none",            "material_name": "Shower door - none" },
        { "value": "keep_existing",   "material_name": "Shower door - keep existing" }
      ],
      "default": "slider",
      "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
    },
    {
      "key": "niche",
      "label": "Niche in shower",
      "type": "boolean",
      "default": false,
      "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
    },
    {
      "key": "bench",
      "label": "Bench in shower",
      "type": "boolean",
      "default": false,
      "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
    },
    {
      "key": "floor_tile_sf",
      "label": "Bathroom floor tile (sf)",
      "type": "number",
      "default_from": "room.floorSf",
      "min": 0,
      "max": 500,
      "subtract": ["shower_floor_sf"],
      "help": "Defaults to room sf, minus shower floor"
    }
  ]
}'::jsonb),

-- vanity_swap: vanity + sink + faucet + toilet (5 fields)
(NULL, 'bathroom', 'vanity_swap', 3, '{
  "fields": [
    {
      "key": "vanity_width",
      "label": "Vanity width",
      "type": "fixture_select",
      "trade": "Cabinets / vanities - Install",
      "options": [
        { "value": "24",     "material_name": "Vanity cabinet 24in" },
        { "value": "30",     "material_name": "Vanity cabinet 30in" },
        { "value": "36",     "material_name": "Vanity cabinet 36in" },
        { "value": "48",     "material_name": "Vanity cabinet 48in" },
        { "value": "60",     "material_name": "Vanity cabinet 60in" },
        { "value": "72",     "material_name": "Vanity cabinet 72in" },
        { "value": "custom", "material_name": null }
      ],
      "default": "30"
    },
    {
      "key": "vanity_top",
      "label": "Vanity top material",
      "type": "fixture_select",
      "trade": "Cabinets / vanities - Install",
      "options_from": "vanity_width",
      "options_template": "Vanity top - {material} {vanity_width}in",
      "options": [
        { "value": "cultured_marble", "material_label": "Cultured marble" },
        { "value": "quartz",          "material_label": "Quartz" },
        { "value": "granite",         "material_label": "Granite" },
        { "value": "custom",          "material_label": "Custom" }
      ],
      "default": "cultured_marble",
      "show_when": { "vanity_width": ["24", "30", "36", "48", "60", "72"] }
    },
    {
      "key": "sink_count",
      "label": "Sink count",
      "type": "number",
      "default": 1,
      "min": 0,
      "max": 4
    },
    {
      "key": "faucet_replace",
      "label": "Replace faucet",
      "type": "boolean",
      "default": true
    },
    {
      "key": "toilet_type",
      "label": "Toilet replacement",
      "type": "fixture_select",
      "trade": "Plumbing - Finish / fixtures",
      "options": [
        { "value": "standard", "material_name": "Toilet standard" },
        { "value": "upgrade",  "material_name": "Toilet upgrade one-piece" },
        { "value": "keep",     "material_name": null }
      ],
      "default": "keep"
    }
  ]
}'::jsonb),

-- paint_and_floor: floor type + paint toggles (6 fields)
(NULL, 'bathroom', 'paint_and_floor', 4, '{
  "fields": [
    {
      "key": "floor_type",
      "label": "Floor type",
      "type": "select",
      "options": [
        { "value": "lvp",      "label": "LVP" },
        { "value": "tile",     "label": "Tile" },
        { "value": "carpet",   "label": "Carpet" },
        { "value": "existing", "label": "Keep existing" }
      ],
      "default": "lvp"
    },
    {
      "key": "floor_tile_sf",
      "label": "Floor sf",
      "type": "number",
      "default_from": "room.floorSf",
      "min": 0,
      "max": 500,
      "show_when": { "floor_type": ["lvp", "tile", "carpet"] }
    },
    {
      "key": "paint_walls",
      "label": "Paint walls",
      "type": "boolean",
      "default": true
    },
    {
      "key": "paint_ceiling",
      "label": "Paint ceiling",
      "type": "boolean",
      "default": true
    },
    {
      "key": "paint_trim",
      "label": "Paint trim",
      "type": "boolean",
      "default": true
    },
    {
      "key": "baseboard_replace",
      "label": "Replace baseboard",
      "type": "boolean",
      "default": false
    }
  ]
}'::jsonb);
