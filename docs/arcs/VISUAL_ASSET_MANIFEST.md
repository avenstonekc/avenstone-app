# VISUAL_ASSET_MANIFEST.md
**SCE Phase 4B — Visual Option Library. Asset split + locked naming convention.**
**Status: LOCKED 2026-07-10 (paired with SCOPE_SEED_CONTENT_DRAFT.md). Drafted 2026-07-01.**

> **THE PICTURE RULE — LOCKED 2026-07-10.** Any field/option added post-lock requires a matching manifest image row in the same change, unless Kalin explicitly waives it.

> **AMENDMENT — 2026-07-10 (owner-waived exception to the picture rule).** Removed `addn_ext_match` + `addn_ext_contrast` (House Addition → Exterior match). Rationale: "match existing / intentional contrast" is a fork about *this house*, not a stockable material — you can't photograph someone's own siding. It renders as a plain choice question (`addition.exterior_match`), no image. KALIN photo count **58 → 56**. This is the picture rule's explicit owner-waiver, recorded here per that rule.

> **LIBRARY GROWTH RULE — LOCKED 2026-07-11.** Scope-fork card sets stay LEAN permanently (a fork is 2–5 cards). Material/style DEPTH (quartz patterns, paint colors, cabinet colors) is **SELECTIONS-arc territory**: unlimited library size, curated per-tenant via `active` flags + `tenant_id` overrides so any single client interaction stays small. Storage/perf is a non-constraint; **decision fatigue is the constraint.**

---

## 1. Naming Convention (LOCKED FORMAT — do not deviate)

```
{type}_{field}_{option}.png
```

**Rules:**
- All lowercase, snake_case, ASCII only. No spaces, no dashes, no dates, no version numbers.
- Replace-in-place forever. A better photo of the same option gets the SAME filename. The DB `option_image_id` never changes; Code never migrates anything.
- One image = one answer option. No collages, no "styles overview" images.
- Format: PNG, square **800×800px** (UI renders as tap cards; square crops clean everywhere).
- Claude-generated illustrations: delivered as SVG master + PNG export, same stem (`bath_niche_recessed.svg` + `.png`). App uses the PNG; SVG archived for re-export.
- Photos you source: crop to square before upload. Center the subject. No people, no branding/watermarks visible, no other trades' work dominating the frame (a tile photo shouldn't be 50% vanity).

**Type prefixes (LOCKED):**

| Prefix | Project type |
|--------|-------------|
| `bath` | Bathroom remodel |
| `kitch` | Kitchen remodel |
| `deck` | Deck build |
| `addn` | House addition |
| `roof` | Roofing |
| `fence` | Fence |
| `bsmt` | Basement finish |
| `ext` | Exterior / siding |
| `univ` | Universal (shared across types — trim, doors, flooring) |

**Universal assets:** trim profiles, interior door styles, and hardwood/LVP layouts appear in multiple project types. They're authored ONCE under `univ_` and referenced by any checklist that needs them. Do not duplicate a casing profile as both `bath_` and `kitch_`.

---

## 2. Asset Split — Who Makes What

**CLAUDE (illustrations — geometric/layout forks):** consistent neutral line-drawing style, same palette across the whole set, so clients compare the FORK, not the photography. Generated once as a batch after seed content locks.

**KALIN (photos — material/finish forks):** anything where the answer IS a texture, color, or real product. Best sources in order: (1) your own completed-job photos, (2) manufacturer/supplier product images for lines you actually sell, (3) stock. Avoid competitor jobsite photos.

---

## 3. Bathroom (`bath_`)

| Field | Option | Who | Filename |
|-------|--------|-----|----------|
| Tile height | To ceiling | CLAUDE | `bath_tile_height_ceiling.png` |
| Tile height | Standard (~tub +3ft) | CLAUDE | `bath_tile_height_standard.png` |
| Tile height | Wainscot/half-wall | CLAUDE | `bath_tile_height_wainscot.png` |
| Shower niche | Recessed niche | CLAUDE | `bath_niche_recessed.png` |
| Shower niche | Shampoo shelf/ledge | CLAUDE | `bath_niche_shelf.png` |
| Shower niche | Corner shelves | CLAUDE | `bath_niche_corner.png` |
| Shower niche | None | CLAUDE | `bath_niche_none.png` |
| Wall tile layout | Subway offset | CLAUDE | `bath_tile_layout_subway_offset.png` |
| Wall tile layout | Stacked (vertical/horizontal) | CLAUDE | `bath_tile_layout_stacked.png` |
| Wall tile layout | Herringbone | CLAUDE | `bath_tile_layout_herringbone.png` |
| Wall tile layout | Large-format | CLAUDE | `bath_tile_layout_large_format.png` |
| Wall tile layout | Hex/mosaic | CLAUDE | `bath_tile_layout_hex.png` |
| Shower glass | Frameless panel | CLAUDE | `bath_glass_frameless.png` |
| Shower glass | Framed door | CLAUDE | `bath_glass_framed.png` |
| Shower glass | Curtain (none) | CLAUDE | `bath_glass_curtain.png` |
| Tub/shower config | Walk-in shower only | CLAUDE | `bath_config_walkin.png` |
| Tub/shower config | Tub/shower combo | CLAUDE | `bath_config_combo.png` |
| Tub/shower config | Freestanding tub + shower | CLAUDE | `bath_config_freestanding_plus_shower.png` |
| Shower floor | Curb | CLAUDE | `bath_entry_curb.png` |
| Shower floor | Curbless/zero-entry | CLAUDE | `bath_entry_curbless.png` |
| Shower drain | Center standard | CLAUDE | `bath_drain_center.png` |
| Shower drain | Linear | CLAUDE | `bath_drain_linear.png` |
| Vanity style | Floating | CLAUDE | `bath_vanity_floating.png` |
| Vanity style | Freestanding furniture | CLAUDE | `bath_vanity_freestanding.png` |
| Vanity style | Built-in banjo/standard | CLAUDE | `bath_vanity_builtin.png` |
| Floor tile material | Porcelain wood-look | KALIN | `bath_floor_porcelain_woodlook.png` |
| Floor tile material | Porcelain stone-look | KALIN | `bath_floor_porcelain_stonelook.png` |
| Floor tile material | Natural stone | KALIN | `bath_floor_natural_stone.png` |
| Floor tile material | LVP (budget) | KALIN | `bath_floor_lvp.png` |
| Countertop | Quartz | KALIN | `bath_counter_quartz.png` |
| Countertop | Granite | KALIN | `bath_counter_granite.png` |
| Countertop | Cultured marble | KALIN | `bath_counter_cultured_marble.png` |
| Fixture finish | Brushed nickel | KALIN | `bath_finish_brushed_nickel.png` |
| Fixture finish | Matte black | KALIN | `bath_finish_matte_black.png` |
| Fixture finish | Chrome | KALIN | `bath_finish_chrome.png` |
| Fixture finish | Brushed gold/brass | KALIN | `bath_finish_brushed_gold.png` |

---

## 4. Kitchen (`kitch_`)

| Field | Option | Who | Filename |
|-------|--------|-----|----------|
| Layout change | Keep layout | CLAUDE | `kitch_layout_keep.png` |
| Layout change | Reconfigure (plumbing/gas moves) | CLAUDE | `kitch_layout_reconfigure.png` |
| Layout change | Wall removal / open concept | CLAUDE | `kitch_layout_wall_removal.png` |
| Island | None | CLAUDE | `kitch_island_none.png` |
| Island | Island (no utilities) | CLAUDE | `kitch_island_dry.png` |
| Island | Island w/ sink or cooktop | CLAUDE | `kitch_island_wet.png` |
| Island | Peninsula | CLAUDE | `kitch_island_peninsula.png` |
| Upper cabinets | To ceiling | CLAUDE | `kitch_uppers_ceiling.png` |
| Upper cabinets | Standard + soffit | CLAUDE | `kitch_uppers_soffit.png` |
| Upper cabinets | Standard + open above | CLAUDE | `kitch_uppers_open_above.png` |
| Upper cabinets | Open shelving | CLAUDE | `kitch_uppers_open_shelving.png` |
| Cabinet door style | Shaker | KALIN | `kitch_cab_shaker.png` |
| Cabinet door style | Flat/slab | KALIN | `kitch_cab_slab.png` |
| Cabinet door style | Raised panel | KALIN | `kitch_cab_raised_panel.png` |
| Cabinet door style | Inset | KALIN | `kitch_cab_inset.png` |
| Backsplash extent | Counter-to-uppers | CLAUDE | `kitch_splash_standard.png` |
| Backsplash extent | Full-height at range | CLAUDE | `kitch_splash_full_range.png` |
| Backsplash extent | Full-height all walls | CLAUDE | `kitch_splash_full_all.png` |
| Backsplash layout | Subway | CLAUDE | `kitch_splash_layout_subway.png` |
| Backsplash layout | Herringbone | CLAUDE | `kitch_splash_layout_herringbone.png` |
| Backsplash layout | Stacked | CLAUDE | `kitch_splash_layout_stacked.png` |
| Backsplash layout | Slab (counter material) | KALIN | `kitch_splash_layout_slab.png` |
| Countertop | Quartz | KALIN | `kitch_counter_quartz.png` |
| Countertop | Granite | KALIN | `kitch_counter_granite.png` |
| Countertop | Butcher block | KALIN | `kitch_counter_butcher_block.png` |
| Countertop | Laminate | KALIN | `kitch_counter_laminate.png` |
| Countertop edge | Eased | CLAUDE | `kitch_edge_eased.png` |
| Countertop edge | Waterfall island end | CLAUDE | `kitch_edge_waterfall.png` |
| Countertop edge | Bullnose/ogee | CLAUDE | `kitch_edge_ogee.png` |
| Sink style | Undermount single | KALIN | `kitch_sink_undermount_single.png` |
| Sink style | Farmhouse/apron | KALIN | `kitch_sink_farmhouse.png` |
| Sink style | Drop-in | KALIN | `kitch_sink_dropin.png` |
| Hood/vent | Under-cabinet | CLAUDE | `kitch_vent_undercab.png` |
| Hood/vent | Wall-mount chimney | CLAUDE | `kitch_vent_chimney.png` |
| Hood/vent | Custom/covered hood | CLAUDE | `kitch_vent_custom.png` |
| Hood/vent | Microwave-over-range | CLAUDE | `kitch_vent_otr_micro.png` |

---

## 5. Deck (`deck_`)

| Field | Option | Who | Filename |
|-------|--------|-----|----------|
| Decking material | Pressure-treated | KALIN | `deck_material_pt.png` |
| Decking material | Cedar | KALIN | `deck_material_cedar.png` |
| Decking material | Composite | KALIN | `deck_material_composite.png` |
| Decking material | PVC | KALIN | `deck_material_pvc.png` |
| Deck board layout | Perpendicular standard | CLAUDE | `deck_layout_standard.png` |
| Deck board layout | Diagonal | CLAUDE | `deck_layout_diagonal.png` |
| Deck board layout | Picture-frame border | CLAUDE | `deck_layout_picture_frame.png` |
| Deck board layout | Breaker-board pattern | CLAUDE | `deck_layout_breaker.png` |
| Railing style | Wood baluster | CLAUDE | `deck_rail_wood_baluster.png` |
| Railing style | Metal baluster in wood frame | CLAUDE | `deck_rail_metal_baluster.png` |
| Railing style | Horizontal cable | CLAUDE | `deck_rail_cable.png` |
| Railing style | Aluminum system | CLAUDE | `deck_rail_aluminum.png` |
| Railing style | Glass panel | CLAUDE | `deck_rail_glass.png` |
| Stairs | Straight run | CLAUDE | `deck_stairs_straight.png` |
| Stairs | L-shape w/ landing | CLAUDE | `deck_stairs_landing.png` |
| Stairs | Wrap/cascade | CLAUDE | `deck_stairs_cascade.png` |
| Overhead | Open (none) | CLAUDE | `deck_cover_none.png` |
| Overhead | Pergola | CLAUDE | `deck_cover_pergola.png` |
| Overhead | Covered roof (shingled, tied-in) | CLAUDE | `deck_cover_roof.png` |
| Overhead | Louvered system | CLAUDE | `deck_cover_louvered.png` |
| Under-deck | Open | CLAUDE | `deck_under_open.png` |
| Under-deck | Skirting | CLAUDE | `deck_under_skirting.png` |
| Under-deck | Dry-below ceiling system | CLAUDE | `deck_under_dry_below.png` |
| Fastening | Face screw | CLAUDE | `deck_fasten_face.png` |
| Fastening | Hidden fastener | CLAUDE | `deck_fasten_hidden.png` |

---

## 6. House Addition (`addn_`)

| Field | Option | Who | Filename |
|-------|--------|-----|----------|
| Foundation | Crawl space | CLAUDE | `addn_found_crawl.png` |
| Foundation | Slab | CLAUDE | `addn_found_slab.png` |
| Foundation | Full basement | CLAUDE | `addn_found_basement.png` |
| Foundation | Pier/post | CLAUDE | `addn_found_pier.png` |
| Roof tie-in | Extend existing ridge | CLAUDE | `addn_roof_extend_ridge.png` |
| Roof tie-in | Perpendicular gable | CLAUDE | `addn_roof_perp_gable.png` |
| Roof tie-in | Shed/lean-to | CLAUDE | `addn_roof_shed.png` |
| Roof tie-in | Second-story (build up) | CLAUDE | `addn_roof_second_story.png` |
| Connection | Open passage | CLAUDE | `addn_connect_open.png` |
| Connection | Doorway | CLAUDE | `addn_connect_door.png` |
| Connection | Hallway/breezeway | CLAUDE | `addn_connect_hall.png` |

*(Interior finish forks for additions reference `univ_` assets — trim, doors, flooring.)*

---

## 7. Roof (`roof_`)

| Field | Option | Who | Filename |
|-------|--------|-----|----------|
| Shingle type | 3-tab | KALIN | `roof_shingle_3tab.png` |
| Shingle type | Architectural | KALIN | `roof_shingle_architectural.png` |
| Shingle type | Designer/premium | KALIN | `roof_shingle_designer.png` |
| Material | Asphalt | KALIN | `roof_material_asphalt.png` |
| Material | Metal standing seam | KALIN | `roof_material_standing_seam.png` |
| Material | Metal R-panel/rib | KALIN | `roof_material_rpanel.png` |
| Material | Cedar shake | KALIN | `roof_material_shake.png` |
| Ridge | Standard ridge cap | CLAUDE | `roof_ridge_standard.png` |
| Ridge | Ridge vent | CLAUDE | `roof_ridge_vent.png` |
| Ventilation | Box vents | CLAUDE | `roof_vent_box.png` |
| Ventilation | Ridge + soffit system | CLAUDE | `roof_vent_ridge_soffit.png` |
| Ventilation | Power/attic fan | CLAUDE | `roof_vent_power.png` |
| Gutters | Keep existing | CLAUDE | `roof_gutter_keep.png` |
| Gutters | New 5" K-style | KALIN | `roof_gutter_5k.png` |
| Gutters | New 6" oversized | KALIN | `roof_gutter_6k.png` |
| Gutters | + Leaf guards | KALIN | `roof_gutter_guards.png` |

---

## 8. Fence (`fence_`)

| Field | Option | Who | Filename |
|-------|--------|-----|----------|
| Style | Privacy solid | CLAUDE | `fence_style_privacy.png` |
| Style | Shadowbox | CLAUDE | `fence_style_shadowbox.png` |
| Style | Board-on-board | CLAUDE | `fence_style_board_on_board.png` |
| Style | Picket | CLAUDE | `fence_style_picket.png` |
| Style | Horizontal | CLAUDE | `fence_style_horizontal.png` |
| Style | Split rail | CLAUDE | `fence_style_split_rail.png` |
| Style | Chain link | CLAUDE | `fence_style_chain_link.png` |
| Style | Aluminum/ornamental | CLAUDE | `fence_style_aluminum.png` |
| Material | Pressure-treated pine | KALIN | `fence_material_pt.png` |
| Material | Cedar | KALIN | `fence_material_cedar.png` |
| Material | Vinyl | KALIN | `fence_material_vinyl.png` |
| Material | Composite | KALIN | `fence_material_composite.png` |
| Top treatment | Flat/dog-ear | CLAUDE | `fence_top_dogear.png` |
| Top treatment | Cap + trim | CLAUDE | `fence_top_cap_trim.png` |
| Top treatment | Lattice top | CLAUDE | `fence_top_lattice.png` |
| Gate | Single walk | CLAUDE | `fence_gate_single.png` |
| Gate | Double drive | CLAUDE | `fence_gate_double.png` |
| Post caps | None | CLAUDE | `fence_cap_none.png` |
| Post caps | Wood/pyramid | KALIN | `fence_cap_wood.png` |
| Post caps | Solar/metal | KALIN | `fence_cap_solar.png` |

---

## 9. Basement Finish (`bsmt_`)

| Field | Option | Who | Filename |
|-------|--------|-----|----------|
| Ceiling | Drywall | CLAUDE | `bsmt_ceiling_drywall.png` |
| Ceiling | Drop/suspended | CLAUDE | `bsmt_ceiling_drop.png` |
| Ceiling | Painted exposed | CLAUDE | `bsmt_ceiling_exposed.png` |
| Flooring | LVP | KALIN | `bsmt_floor_lvp.png` |
| Flooring | Carpet | KALIN | `bsmt_floor_carpet.png` |
| Flooring | Polished/sealed concrete | KALIN | `bsmt_floor_concrete.png` |
| Wet bar | None | CLAUDE | `bsmt_bar_none.png` |
| Wet bar | Dry bar (no plumbing) | CLAUDE | `bsmt_bar_dry.png` |
| Wet bar | Wet bar (sink) | CLAUDE | `bsmt_bar_wet.png` |
| Wet bar | Full kitchenette | CLAUDE | `bsmt_bar_kitchenette.png` |
| Egress | Existing window ok | CLAUDE | `bsmt_egress_existing.png` |
| Egress | New egress window + well | CLAUDE | `bsmt_egress_new.png` |
| Bathroom | None | CLAUDE | `bsmt_bath_none.png` |
| Bathroom | Half bath | CLAUDE | `bsmt_bath_half.png` |
| Bathroom | Full bath | CLAUDE | `bsmt_bath_full.png` |

---

## 10. Exterior / Siding (`ext_`)

| Field | Option | Who | Filename |
|-------|--------|-----|----------|
| Siding type | Vinyl lap | KALIN | `ext_siding_vinyl.png` |
| Siding type | Fiber cement lap | KALIN | `ext_siding_fiber_cement.png` |
| Siding type | LP SmartSide | KALIN | `ext_siding_lp.png` |
| Siding type | Board & batten | KALIN | `ext_siding_board_batten.png` |
| Siding type | Stone/brick accent | KALIN | `ext_siding_stone_accent.png` |
| Profile | Traditional lap | CLAUDE | `ext_profile_lap.png` |
| Profile | Dutch lap | CLAUDE | `ext_profile_dutch.png` |
| Profile | Vertical | CLAUDE | `ext_profile_vertical.png` |
| Profile | Shake/scallop accent | CLAUDE | `ext_profile_shake.png` |
| Corners | Standard corner post | CLAUDE | `ext_corner_post.png` |
| Corners | Mitered | CLAUDE | `ext_corner_mitered.png` |

---

## 11. Universal (`univ_`) — shared by bath, kitchen, addition, basement

| Field | Option | Who | Filename |
|-------|--------|-----|----------|
| Casing profile | Craftsman flat | CLAUDE | `univ_casing_craftsman.png` |
| Casing profile | Colonial | CLAUDE | `univ_casing_colonial.png` |
| Casing profile | Ranch/clamshell | CLAUDE | `univ_casing_ranch.png` |
| Casing profile | Modern square minimal | CLAUDE | `univ_casing_modern.png` |
| Baseboard | Standard 3.25" | CLAUDE | `univ_base_standard.png` |
| Baseboard | Tall 5.25"+ | CLAUDE | `univ_base_tall.png` |
| Baseboard | Modern flat | CLAUDE | `univ_base_flat.png` |
| Interior door | 2-panel shaker | CLAUDE | `univ_door_2panel_shaker.png` |
| Interior door | 6-panel colonial | CLAUDE | `univ_door_6panel.png` |
| Interior door | Flush/slab | CLAUDE | `univ_door_flush.png` |
| Interior door | Barn door | CLAUDE | `univ_door_barn.png` |
| Interior door | Pocket door | CLAUDE | `univ_door_pocket.png` |
| Interior door | Glass French | CLAUDE | `univ_door_french.png` |
| Hardwood/LVP layout | Straight lay | CLAUDE | `univ_floor_layout_straight.png` |
| Hardwood/LVP layout | Diagonal | CLAUDE | `univ_floor_layout_diagonal.png` |
| Hardwood/LVP layout | Herringbone | CLAUDE | `univ_floor_layout_herringbone.png` |
| Hardwood/LVP layout | Chevron | CLAUDE | `univ_floor_layout_chevron.png` |
| Flooring material | Solid hardwood | KALIN | `univ_floor_hardwood.png` |
| Flooring material | Engineered | KALIN | `univ_floor_engineered.png` |
| Flooring material | LVP | KALIN | `univ_floor_lvp.png` |
| Flooring material | Tile | KALIN | `univ_floor_tile.png` |
| Flooring material | Carpet | KALIN | `univ_floor_carpet.png` |
| Crown molding | None | CLAUDE | `univ_crown_none.png` |
| Crown molding | Standard | CLAUDE | `univ_crown_standard.png` |
| Crown molding | Built-up/stacked | CLAUDE | `univ_crown_stacked.png` |

---

## 12. Tally

| Bucket | Count |
|--------|-------|
| CLAUDE illustrations (SVG→PNG, one batch) | ~118 |
| KALIN photos (source over time) | ~55 |
| **Total library v1** | **~173** |

**Kalin sourcing priority order** (sell-impact first): kitchen cabinet doors + countertops → bath floor/counter/finishes → deck + fence materials → roof shingles → siding. Manufacturer product pages for lines you actually carry are the fastest clean source.

---

## 13. Rules of Engagement (so this never becomes a mess)

1. This manifest is the ONLY source of filenames. New option → add a row HERE first, then create the asset. No orphan files in the bucket.
2. Filenames never change after upload. Better image later = same name, replace.
3. Code never parses filenames for logic — `option_image_id` in the DB is the binding. Names are for HUMAN findability only.
4. This file gets red-penned alongside the seed content, then locked together. Options pruned from checklists get their rows deleted here before any assets are made.
