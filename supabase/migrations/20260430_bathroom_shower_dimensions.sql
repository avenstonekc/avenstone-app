-- Replace shower_wall_sf and shower_floor_sf direct-entry fields with dimension
-- inputs (shower_width_in, shower_length_in, shower_wall_height_in) plus optional
-- per-field overrides. Applies to full_remodel and tile_only bathroom schemas.
--
-- New field types:
--   feet_inches    — stored as total inches (e.g. 60 = 5 ft), rendered as ft+in pair
--   number_optional — number input that stores null when blank
--
-- floor_tile_sf retains subtract:["shower_floor_sf"] — resolveDetails in takeoff.js
-- injects shower_floor_sf from dimension math before the subtract pass runs.

DO $$
DECLARE
  v_full_remodel_fields  jsonb;
  v_tile_only_fields     jsonb;
  v_shower_new_fields    jsonb;
BEGIN

-- The 5 new shower fields that replace shower_wall_sf + shower_floor_sf
v_shower_new_fields := '[
  {
    "key": "shower_width_in",
    "label": "Shower width",
    "type": "feet_inches",
    "default": 60,
    "min": 24,
    "max": 144,
    "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
  },
  {
    "key": "shower_length_in",
    "label": "Shower length",
    "type": "feet_inches",
    "default": 36,
    "min": 24,
    "max": 144,
    "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
  },
  {
    "key": "shower_wall_height_in",
    "label": "Shower wall tile height",
    "type": "feet_inches",
    "default": 96,
    "min": 36,
    "max": 144,
    "help": "Default 8ft (full ceiling). Lower for tub surround.",
    "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
  },
  {
    "key": "shower_wall_sf_override",
    "label": "Shower wall tile (sf) — override",
    "type": "number_optional",
    "min": 0,
    "max": 500,
    "help": "Leave blank to use auto-computed value.",
    "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
  },
  {
    "key": "shower_floor_sf_override",
    "label": "Shower floor tile (sf) — override",
    "type": "number_optional",
    "min": 0,
    "max": 100,
    "help": "Leave blank to use auto-computed value.",
    "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
  }
]'::jsonb;

-- full_remodel: 14 fields
-- [shower_type] + 5 new shower fields + [shower_door_type, niche, bench] + [floor_tile_sf] + [vanity_width, vanity_top, sink_count, toilet_type]
v_full_remodel_fields := '[
  {
    "key": "shower_type",
    "type": "select",
    "label": "Shower configuration",
    "default": "shower_only",
    "options": [
      { "label": "Shower only",           "value": "shower_only"      },
      { "label": "Tub only (no shower)",  "value": "tub_only"         },
      { "label": "Tub + separate shower", "value": "tub_plus_shower"  }
    ]
  },
  {
    "key": "shower_width_in",
    "label": "Shower width",
    "type": "feet_inches",
    "default": 60,
    "min": 24,
    "max": 144,
    "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
  },
  {
    "key": "shower_length_in",
    "label": "Shower length",
    "type": "feet_inches",
    "default": 36,
    "min": 24,
    "max": 144,
    "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
  },
  {
    "key": "shower_wall_height_in",
    "label": "Shower wall tile height",
    "type": "feet_inches",
    "default": 96,
    "min": 36,
    "max": 144,
    "help": "Default 8ft (full ceiling). Lower for tub surround.",
    "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
  },
  {
    "key": "shower_wall_sf_override",
    "label": "Shower wall tile (sf) — override",
    "type": "number_optional",
    "min": 0,
    "max": 500,
    "help": "Leave blank to use auto-computed value.",
    "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
  },
  {
    "key": "shower_floor_sf_override",
    "label": "Shower floor tile (sf) — override",
    "type": "number_optional",
    "min": 0,
    "max": 100,
    "help": "Leave blank to use auto-computed value.",
    "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
  },
  {
    "key": "shower_door_type",
    "type": "fixture_select",
    "label": "Shower door",
    "trade": "Tile - Wall / shower",
    "default": "slider",
    "options": [
      { "value": "slider",          "material_name": "Shower door - glass slider"              },
      { "value": "swing_semi",      "material_name": "Shower door - glass swing semi-frameless"},
      { "value": "swing_frameless", "material_name": "Shower door - glass swing frameless"     },
      { "value": "curtain",         "material_name": "Shower door - curtain rod"               },
      { "value": "none",            "material_name": "Shower door - none"                      },
      { "value": "keep_existing",   "material_name": "Shower door - keep existing"             }
    ],
    "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
  },
  {
    "key": "niche",
    "type": "boolean",
    "label": "Niche in shower",
    "default": false,
    "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
  },
  {
    "key": "bench",
    "type": "boolean",
    "label": "Bench in shower",
    "default": false,
    "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
  },
  {
    "key": "floor_tile_sf",
    "type": "number",
    "label": "Bathroom floor tile (sf)",
    "max": 500,
    "min": 0,
    "help": "Defaults to room sf, minus shower floor",
    "subtract": ["shower_floor_sf"],
    "default_from": "room.floorSf"
  },
  {
    "key": "vanity_width",
    "type": "fixture_select",
    "label": "Vanity width",
    "trade": "Cabinets / vanities - Install",
    "default": "30",
    "options": [
      { "value": "24", "material_name": "Vanity cabinet 24in" },
      { "value": "30", "material_name": "Vanity cabinet 30in" },
      { "value": "36", "material_name": "Vanity cabinet 36in" },
      { "value": "48", "material_name": "Vanity cabinet 48in" },
      { "value": "60", "material_name": "Vanity cabinet 60in" },
      { "value": "72", "material_name": "Vanity cabinet 72in" },
      { "value": "custom", "material_name": null }
    ]
  },
  {
    "key": "vanity_top",
    "type": "fixture_select",
    "label": "Vanity top material",
    "trade": "Cabinets / vanities - Install",
    "default": "cultured_marble",
    "options": [
      { "value": "cultured_marble", "material_label": "Cultured marble" },
      { "value": "quartz",          "material_label": "Quartz"          },
      { "value": "granite",         "material_label": "Granite"         },
      { "value": "custom",          "material_label": "Custom"          }
    ],
    "show_when":        { "vanity_width": ["24", "30", "36", "48", "60", "72"] },
    "options_from":     "vanity_width",
    "options_template": "Vanity top - {material} {vanity_width}in"
  },
  {
    "key": "sink_count",
    "type": "number",
    "label": "Sink count",
    "max": 4,
    "min": 0,
    "default": 1
  },
  {
    "key": "toilet_type",
    "type": "fixture_select",
    "label": "Toilet replacement",
    "trade": "Plumbing - Finish / fixtures",
    "default": "standard",
    "options": [
      { "value": "standard", "material_name": "Toilet standard"          },
      { "value": "upgrade",  "material_name": "Toilet upgrade one-piece" },
      { "value": "keep",     "material_name": null                       }
    ]
  }
]'::jsonb;

-- tile_only: 10 fields
-- [shower_type] + 5 new shower fields + [shower_door_type, niche, bench, floor_tile_sf]
v_tile_only_fields := '[
  {
    "key": "shower_type",
    "type": "select",
    "label": "Shower configuration",
    "default": "shower_only",
    "options": [
      { "label": "Shower only",           "value": "shower_only"     },
      { "label": "Tub only (no shower)",  "value": "tub_only"        },
      { "label": "Tub + separate shower", "value": "tub_plus_shower" }
    ]
  },
  {
    "key": "shower_width_in",
    "label": "Shower width",
    "type": "feet_inches",
    "default": 60,
    "min": 24,
    "max": 144,
    "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
  },
  {
    "key": "shower_length_in",
    "label": "Shower length",
    "type": "feet_inches",
    "default": 36,
    "min": 24,
    "max": 144,
    "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
  },
  {
    "key": "shower_wall_height_in",
    "label": "Shower wall tile height",
    "type": "feet_inches",
    "default": 96,
    "min": 36,
    "max": 144,
    "help": "Default 8ft (full ceiling). Lower for tub surround.",
    "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
  },
  {
    "key": "shower_wall_sf_override",
    "label": "Shower wall tile (sf) — override",
    "type": "number_optional",
    "min": 0,
    "max": 500,
    "help": "Leave blank to use auto-computed value.",
    "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
  },
  {
    "key": "shower_floor_sf_override",
    "label": "Shower floor tile (sf) — override",
    "type": "number_optional",
    "min": 0,
    "max": 100,
    "help": "Leave blank to use auto-computed value.",
    "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
  },
  {
    "key": "shower_door_type",
    "type": "fixture_select",
    "label": "Shower door",
    "trade": "Tile - Wall / shower",
    "default": "slider",
    "options": [
      { "value": "slider",          "material_name": "Shower door - glass slider"               },
      { "value": "swing_semi",      "material_name": "Shower door - glass swing semi-frameless" },
      { "value": "swing_frameless", "material_name": "Shower door - glass swing frameless"      },
      { "value": "curtain",         "material_name": "Shower door - curtain rod"                },
      { "value": "none",            "material_name": "Shower door - none"                       },
      { "value": "keep_existing",   "material_name": "Shower door - keep existing"              }
    ],
    "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
  },
  {
    "key": "niche",
    "type": "boolean",
    "label": "Niche in shower",
    "default": false,
    "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
  },
  {
    "key": "bench",
    "type": "boolean",
    "label": "Bench in shower",
    "default": false,
    "show_when": { "shower_type": ["shower_only", "tub_plus_shower"] }
  },
  {
    "key": "floor_tile_sf",
    "type": "number",
    "label": "Bathroom floor tile (sf)",
    "max": 500,
    "min": 0,
    "help": "Defaults to room sf, minus shower floor",
    "subtract": ["shower_floor_sf"],
    "default_from": "room.floorSf"
  }
]'::jsonb;

UPDATE scope_detail_schemas
SET schema = jsonb_set(schema, '{fields}', v_full_remodel_fields)
WHERE room_type = 'bathroom' AND scope_tag = 'full_remodel' AND tenant_id IS NULL;

UPDATE scope_detail_schemas
SET schema = jsonb_set(schema, '{fields}', v_tile_only_fields)
WHERE room_type = 'bathroom' AND scope_tag = 'tile_only' AND tenant_id IS NULL;

END $$;

-- Verify
SELECT scope_tag, jsonb_array_length(schema->'fields') AS fields
FROM scope_detail_schemas
WHERE room_type = 'bathroom'
ORDER BY scope_tag;
