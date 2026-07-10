# SCOPE_SEED_CONTENT_DRAFT.md
**SCE Phase 1B seed content — ALL project types. DRAFT for Kalin red-pen.**
**Drafted 2026-07-02. Pairs with VISUAL_ASSET_MANIFEST.md (option keys match image filenames).**

---

## HOW TO EDIT THIS FILE (read first)

1. **Delete anything wrong.** Kill whole fields, kill options — just delete the lines.
2. **Type corrections inline.** Fix wording, reorder options, whatever. Format doesn't need to be perfect — I'll parse it.
3. **Add `KC:` notes** anywhere for field knowledge — "KC: nobody asks for this," "KC: always upsell here," "KC: this blows up $8k when missed." These become interview hints and risk flags.
4. **Add missing fields** — one line is enough (`ADD: ask about ___`), I'll format it.
5. Don't worry about the DB shape. When this locks + you paste the bathroom seed from the audit report, I translate everything into the exact live table format for the dispatch.

**Field format:**
```
FIELD key_name  [$$$]  [ROLE]
Q: the question as the interview asks it
OPT: option1 | option2 | option3
WHY: what it costs when missed
FIRES: module it triggers (if any)
```
- `[$]` = minor cost fork, `[$$]` = real money, `[$$$]` = job-blower / change-order machine
- `[R]` = rep-only, `[RC]` = rep + client intake (client sees it, plain language)
- Fields are **money/risk-ordered** — expensive forks first, per blueprint.

---

# 1. BATHROOM (`bath`)

*(You have 13 fields live. This is my superset — red-pen against what's seeded; anything here that's missing from the live seed gets added in the dispatch.)*

FIELD tub_shower_config  [$$$]  [RC]
Q: Walk-in shower only, tub/shower combo, or freestanding tub plus separate shower?
OPT: walkin | combo | freestanding_plus_shower | tub_only
WHY: Drives plumbing rough-in, glass, waterproofing footprint — the single biggest layout fork
FIRES: plumbing_relocation (if config differs from existing)

FIELD layout_change  [$$$]  [RC]
Q: Are fixtures staying where they are, or moving (toilet, vanity, tub/shower locations)?
OPT: keep_layout | minor_moves | full_reconfigure
WHY: Every fixture move = drain + supply relocation; slab foundation makes this brutal
FIRES: plumbing_relocation, structural (if walls move)

FIELD shower_entry  [$$$]  [RC]
Q: Standard curb or curbless/zero-entry shower?
OPT: curb | curbless
WHY: Curbless = recessed subfloor or topping slab; joist direction can kill it. Huge missed-cost item
FIRES: structural (subfloor recess), accessibility

FIELD wet_wall_window  [$$]  [R]
Q: Is there a window in the shower/tub wet wall? Keep, remove, or replace?
OPT: none | keep_waterproof | remove_infill | replace_smaller
WHY: Window in wet zone = waterproofing detail or framing/siding/exterior patch
FIRES: window_door_change, exterior_tie_in

FIELD tile_height  [$$]  [RC]
Q: Wall tile to the ceiling, standard height, or wainscot?
OPT: ceiling | standard | wainscot
WHY: Can double wall-tile quantity + labor
FIRES: —

FIELD niche  [$]  [RC]
Q: Recessed niche, shelf/ledge, corner shelves, or none?
OPT: recessed | shelf | corner | none
WHY: Niche = framing + waterproofing detail; retrofit after tile = never
FIRES: —

FIELD wall_tile_layout  [$]  [RC]
Q: Tile pattern on walls?
OPT: subway_offset | stacked | herringbone | large_format | hex
WHY: Herringbone/hex = labor multiplier; large-format = substrate flatness prep
FIRES: —

FIELD shower_glass  [$$]  [RC]
Q: Frameless glass, framed door, or curtain?
OPT: frameless | framed | curtain
WHY: Frameless = $1.5-3k+ line item people forget until the end
FIRES: —

FIELD shower_drain  [$]  [R]
Q: Standard center drain or linear drain?
OPT: center | linear
WHY: Linear = slope-to-one-plane, changes pan build and tile sizes possible
FIRES: —

FIELD floor_tile  [$$]  [RC]
Q: Floor material?
OPT: porcelain_woodlook | porcelain_stonelook | natural_stone | lvp
WHY: Natural stone = sealing + thickness transitions; LVP = budget signal
FIRES: —

FIELD heated_floor  [$$]  [RC]
Q: Heated floor?
OPT: yes | no
WHY: Electric mat + dedicated circuit + thermostat — retrofit impossible after tile
FIRES: electrical_service

FIELD vanity  [$$]  [RC]
Q: Vanity style and roughly what size?
OPT: floating | freestanding | builtin  (+ size in inches)
WHY: Floating = blocking in wall; size drives plumbing centers
FIRES: —

FIELD countertop  [$]  [RC]
Q: Vanity top material?
OPT: quartz | granite | cultured_marble
FIRES: —

FIELD fixture_finish  [$]  [RC]
Q: Fixture finish family?
OPT: brushed_nickel | matte_black | chrome | brushed_gold
WHY: Locks the whole fixture package; mixed finishes = client callback
FIRES: —

FIELD ventilation  [$$]  [R]
Q: Existing exhaust fan situation — present, vented where?
OPT: exists_vented_out | exists_vented_attic | none
WHY: Attic-vented or missing fan = code fix + roof/soffit penetration nobody quoted
FIRES: exterior_tie_in (new penetration)

FIELD toilet  [$]  [RC]
Q: Toilet — reuse, standard replace, comfort-height, wall-hung, or bidet seat circuit?
OPT: reuse | standard | comfort_height | wall_hung | bidet_circuit
WHY: Wall-hung = in-wall carrier (framing + cost jump); bidet seat = outlet at toilet
FIRES: electrical_service (bidet), structural (wall_hung carrier)

FIELD age_of_home  [$$$]  [RC]
Q: Roughly what year was the house built?
OPT: pre_1950 | 1950_1977 | 1978_2000 | post_2000
WHY: Pre-'78 = lead paint protocol; old homes = galvanized/cast-iron surprise territory
FIRES: hazmat (pre_1978), plumbing_age

---

# 2. KITCHEN (`kitch`)

FIELD layout_change  [$$$]  [RC]
Q: Keeping the layout, or moving things — sink, range, fridge locations?
OPT: keep | reconfigure | wall_removal_open_concept
WHY: THE kitchen fork. Sink move = drain/vent; range move = gas or 240V; wall = structural
FIRES: plumbing_relocation, electrical_service, gas_line, structural (wall_removal)

FIELD wall_removal_detail  [$$$]  [R]
Q: (If wall coming out) Which wall, and does anything live in it — ducts, plumbing stacks, wiring?
OPT: (free text + photo)
WHY: Load-bearing + HVAC/plumbing in wall = beam + reroutes; the classic $15k surprise
FIRES: structural, hvac_mod, plumbing_relocation

FIELD island  [$$]  [RC]
Q: Island — none, dry, with sink/cooktop, or peninsula?
OPT: none | dry | wet | peninsula
WHY: Wet island = underslab/underfloor drain + vent (island venting = real plumbing)
FIRES: plumbing_relocation (wet), electrical_service (island outlets are code)

FIELD cabinets_supply  [$$$]  [R]
Q: Who supplies cabinets — us, client-purchased, or reuse/refinish existing?
OPT: contractor | client_supplied | reface | paint_existing
WHY: Supply model = margin model; client-supplied = delivery/damage/missing-filler risk
FIRES: —

FIELD cabinet_style  [$$]  [RC]
Q: Door style?
OPT: shaker | slab | raised_panel | inset
WHY: Inset = precision + cost tier jump
FIRES: —

FIELD uppers  [$$]  [RC]
Q: Uppers to the ceiling, standard with soffit, open above, or open shelving?
OPT: ceiling | soffit | open_above | open_shelving
WHY: To-ceiling = taller boxes + crown detail; soffit removal = what's IN the soffit?
FIRES: hvac_mod (soffit removal — ducts hide there), electrical_service (wiring in soffit)

FIELD countertop  [$$]  [RC]
Q: Countertop material?
OPT: quartz | granite | butcher_block | laminate
FIRES: —

FIELD counter_edge  [$]  [RC]
Q: Edge/detail — eased, waterfall island end, ogee?
OPT: eased | waterfall | ogee
WHY: Waterfall = extra slab + fabrication
FIRES: —

FIELD sink  [$]  [RC]
Q: Sink style?
OPT: undermount_single | farmhouse | dropin
WHY: Farmhouse = cabinet modification + weight
FIRES: —

FIELD backsplash  [$]  [RC]
Q: Backsplash extent and pattern?
OPT: standard | full_range | full_all  ×  subway | herringbone | stacked | slab
FIRES: —

FIELD appliances  [$$]  [RC]
Q: Appliances — who supplies, and any changes in size/location/fuel?
OPT: reuse_all | client_supplied_new | contractor_supplied  (+ note size/fuel changes)
WHY: 30"→36" range, counter-depth fridge, gas→induction — each is a cabinet/electrical/gas line item
FIRES: gas_line, electrical_service (induction = 240V)

FIELD venting  [$$]  [R]
Q: Range hood — type, and does it vent outside today?
OPT: undercab | chimney | custom | otr_micro  (+ vented_out yes/no)
WHY: Recirculating→vented = new exterior penetration + duct run
FIRES: exterior_tie_in, hvac_mod

FIELD flooring_extent  [$$]  [RC]
Q: New flooring — kitchen only, or flowing into adjacent rooms?
OPT: kitchen_only | contiguous_areas
WHY: "Match into the living room" doubles the flooring scope; transition height issues
FIRES: subfloor (height transitions)

FIELD elec_panel  [$$]  [R]
Q: Panel capacity — known space for new circuits? (photo of panel)
OPT: photo + (room_available | full | unknown)
WHY: Kitchen remodel adds 3-6 circuits; full panel = upgrade nobody quoted
FIRES: electrical_service

FIELD age_of_home  [$$$]  [RC]
Q: Year built?
OPT: pre_1950 | 1950_1977 | 1978_2000 | post_2000
FIRES: hazmat (pre_1978), plumbing_age

---

# 3. DECK (`deck`)

FIELD size_height  [$$$]  [RC]
Q: Rough size, and how high off grade at the highest point?
OPT: dims + (low_under_30in | mid | second_story)
WHY: >30" = guardrail code + footing depth; second-story = beam sizing + stairs become a structure
FIRES: permit_code

FIELD attachment  [$$$]  [R]
Q: Attached with ledger, or freestanding?
OPT: ledger | freestanding
WHY: Ledger = flashing detail + what's behind the siding (rot discovery zone); freestanding = more footings
FIRES: exterior_tie_in, rot_repair (ledger on old deck)

FIELD existing_deck  [$$]  [R]
Q: Existing deck — full tearoff, or reuse framing?
OPT: none | tearoff | reuse_framing
WHY: "Reuse framing" = inspect joists/footings; composite on old 24" OC framing = fail
FIRES: rot_repair, demolition

FIELD material  [$$]  [RC]
Q: Decking material?
OPT: pt | cedar | composite | pvc
WHY: 3-4× material spread; composite = 16" OC or better framing
FIRES: —

FIELD board_layout  [$]  [RC]
Q: Board pattern?
OPT: standard | diagonal | picture_frame | breaker
WHY: Diagonal/picture-frame = waste factor + blocking
FIRES: —

FIELD railing  [$$]  [RC]
Q: Railing style?
OPT: wood_baluster | metal_baluster | cable | aluminum | glass
WHY: Cable/glass = 2-5× rail cost; cable = post engineering for tension
FIRES: —

FIELD stairs  [$$]  [RC]
Q: Stairs — straight, landing, wrap? To where?
OPT: none | straight | landing | cascade
WHY: Stairs are per-step money; landing = footings
FIRES: —

FIELD overhead  [$$$]  [RC]
Q: Anything overhead — pergola, full covered roof, louvered?
OPT: none | pergola | roof | louvered
WHY: Covered roof = tie into house roof + posts sized up + permit becomes structure
FIRES: structural, exterior_tie_in, permit_code

FIELD under_deck  [$]  [RC]
Q: Under-deck treatment?
OPT: open | skirting | dry_below
WHY: Dry-below = drainage system + gutter, real line item
FIRES: —

FIELD fastening  [$]  [RC]
Q: Face-screw or hidden fasteners?
OPT: face | hidden
FIRES: —

FIELD electrical  [$]  [RC]
Q: Lighting/outlets/fan on the deck?
OPT: none | lighting | outlets | fan_on_covered
WHY: Exterior circuit + GFCI; fan needs the covered roof answered
FIRES: electrical_service

FIELD utilities_below  [$$]  [R]
Q: Anything where footings go — utilities, septic, irrigation? Locate scheduled?
OPT: clear | unknown_locate_needed | known_conflicts
WHY: Footing hits septic line = bad day
FIRES: permit_code

---

# 4. HOUSE ADDITION (`addn`)

FIELD purpose_size  [$$$]  [RC]
Q: What's the addition for, and rough size?
OPT: bedroom | bath_suite | family_room | kitchen_expansion | sunroom  + dims
WHY: Bath/kitchen purpose = full MEP scope inside the addition
FIRES: (per purpose — fires bath or kitchen checklist as nested scope)

FIELD foundation  [$$$]  [RC]
Q: Foundation type?
OPT: crawl | slab | basement | pier
WHY: Basement vs slab = 2-3× foundation cost; must reconcile with existing foundation depth
FIRES: —

FIELD roof_tie_in  [$$$]  [R]
Q: How does the new roof meet the old — extend ridge, perpendicular gable, shed, or second story?
OPT: extend_ridge | perp_gable | shed | second_story
WHY: Tie-in defines framing complexity; second story = whole different job (bearing walls, stairs)
FIRES: structural, exterior_tie_in

FIELD hvac  [$$$]  [R]
Q: Heat/cool the new space how — extend existing system, mini-split, new unit?
OPT: extend_existing | mini_split | new_system
WHY: Existing system rarely has capacity; "just extend it" = undersized everything
FIRES: hvac_mod

FIELD elec_panel  [$$]  [R]
Q: Panel capacity for a new room's circuits? (photo)
OPT: photo + (room_available | full | unknown)
FIRES: electrical_service

FIELD connection  [$$]  [RC]
Q: How does it connect to the house — open passage, doorway, hallway?
OPT: open | door | hall
WHY: Open passage through exterior wall = header/beam + the wall is bearing
FIRES: structural, window_door_change

FIELD exterior_match  [$$]  [RC]
Q: Match existing siding/roofing, or intentional contrast?
OPT: match | contrast
WHY: Matching discontinued siding = whole-wall reside surprise
FIRES: exterior_tie_in

FIELD site  [$$]  [R]
Q: Setbacks, easements, slope, tree removal, utility lines in the footprint?
OPT: (free text + survey/photo)
WHY: Setback violation = redesign; slope = stepped footings
FIRES: permit_code

FIELD interior_finish  [$]  [RC]
Q: Interior finish level — match house trim/doors/flooring?
OPT: match_existing | new_spec  (→ univ_ trim/door/floor fields)
FIRES: —

---

# 5. ROOF (`roof`)

FIELD scope  [$$$]  [RC]
Q: Full replacement or repair?
OPT: full_replace | repair_section
FIRES: —

FIELD layers  [$$]  [R]
Q: How many existing layers, and any known decking issues?
OPT: one | two_plus | unknown  (+ decking condition)
WHY: 2+ layers = tearoff cost jump; soft decking = per-sheet replacement money
FIRES: rot_repair

FIELD material  [$$]  [RC]
Q: Material?
OPT: asphalt | standing_seam | rpanel | shake
FIRES: —

FIELD shingle_grade  [$]  [RC]
Q: (If asphalt) Grade?
OPT: 3tab | architectural | designer
FIRES: —

FIELD pitch_access  [$$]  [R]
Q: Pitch and access — steep? Multi-story? Tight lot?
OPT: walkable | steep | very_steep  + access notes
WHY: Steep/access = labor multiplier + safety setup
FIRES: —

FIELD penetrations  [$$]  [R]
Q: Count/condition — chimneys, skylights, vents, satellite mounts?
OPT: (inventory + photos)
WHY: Chimney reflash, skylight replace-while-you're-there, abandoned mounts — each a line item
FIRES: —

FIELD ventilation  [$]  [RC]
Q: Ventilation plan?
OPT: box | ridge_soffit | power
WHY: Soffit intake blocked = warranty problem; upgrade to ridge = cut the deck
FIRES: —

FIELD gutters  [$]  [RC]
Q: Gutters — keep, new 5", new 6", guards?
OPT: keep | 5k | 6k | guards
FIRES: —

FIELD insurance  [$$]  [R]
Q: Is this an insurance claim?
OPT: cash | insurance_claim
WHY: Claim = supplement process, adjuster scope, different paper trail entirely
FIRES: —

---

# 6. FENCE (`fence`)

FIELD length_layout  [$$]  [RC]
Q: Rough linear feet and layout (photo/sketch of property lines)?
OPT: dims + sketch
FIRES: —

FIELD property_line  [$$$]  [R]
Q: Property pins located, or building off assumption? Neighbor agreement?
OPT: pins_located | survey_needed | assumed
WHY: Fence on the neighbor's land = tearout. The #1 fence lawsuit
FIRES: permit_code

FIELD style  [$$]  [RC]
Q: Style?
OPT: privacy | shadowbox | board_on_board | picket | horizontal | split_rail | chain_link | aluminum
WHY: Horizontal = premium lumber grade + tighter posts
FIRES: —

FIELD material  [$$]  [RC]
Q: Material?
OPT: pt | cedar | vinyl | composite
FIRES: —

FIELD height  [$]  [RC]
Q: Height?
OPT: 4ft | 6ft | 8ft
WHY: 8ft = HOA/permit trigger in most KC metros + deeper posts
FIRES: permit_code (8ft)

FIELD top_treatment  [$]  [RC]
Q: Top treatment?
OPT: dogear | cap_trim | lattice
FIRES: —

FIELD gates  [$]  [RC]
Q: Gates — how many walk, any double drive?
OPT: counts
WHY: Gates are where fences fail; drive gate = posts in concrete sized up
FIRES: —

FIELD terrain  [$$]  [R]
Q: Slope — rack, step, or flat? Rock/utilities where posts go?
OPT: flat | rack | step  + (utilities located?)
WHY: Stepping = more material + labor; rock = auger time or core drilling
FIRES: —

FIELD tearout  [$]  [RC]
Q: Existing fence tearout + haul?
OPT: none | tearout_haul
FIRES: demolition

---

# 7. BASEMENT FINISH (`bsmt`)

FIELD moisture  [$$$]  [R]
Q: Any history of water — seepage, sump, efflorescence, musty smell? (photos of walls/floor)
OPT: dry_confirmed | past_issues_resolved | active_unknown
WHY: Finishing a wet basement = doing it twice. THE basement fork — nothing proceeds until answered
FIRES: water_mold

FIELD egress  [$$$]  [RC]
Q: Will there be a bedroom? Existing egress window or new needed?
OPT: no_bedroom | egress_exists | egress_new
WHY: New egress = concrete cut + well + drainage — $5-8k people never budget
FIRES: permit_code, structural (foundation cut)

FIELD bathroom  [$$$]  [RC]
Q: Bathroom — none, half, full? Rough-in exist?
OPT: none | half | full  + (roughin_exists | slab_cut_needed)
WHY: No rough-in = breaking slab or sewage ejector pit
FIRES: plumbing_relocation

FIELD ceiling_height  [$$]  [R]
Q: Height under the lowest duct/beam?
OPT: measurement
WHY: <7ft under obstructions = code problem or soffit maze; drives ceiling choice
FIRES: hvac_mod (duct reroute)

FIELD ceiling  [$]  [RC]
Q: Ceiling treatment?
OPT: drywall | drop | exposed_painted
WHY: Drywall = lose access to everything above; drop = lose height
FIRES: —

FIELD mechanicals  [$$]  [R]
Q: Furnace/WH/panel locations — staying open or getting a room? Clearances?
OPT: (photo + layout note)
WHY: Code clearances + combustion air around mechanicals shape the whole layout
FIRES: hvac_mod, permit_code

FIELD flooring  [$]  [RC]
Q: Floor?
OPT: lvp | carpet | concrete_polished
WHY: Any flooring over concrete = moisture test first (ties to moisture field)
FIRES: —

FIELD bar  [$$]  [RC]
Q: Bar — none, dry, wet, kitchenette?
OPT: none | dry | wet | kitchenette
WHY: Wet = plumbing run; kitchenette = 20A circuits + venting question
FIRES: plumbing_relocation (wet+), electrical_service

FIELD elec_panel  [$$]  [R]
Q: Panel space for 4-8 new circuits? (photo)
OPT: photo + (room_available | full | unknown)
FIRES: electrical_service

---

# 8. EXTERIOR / SIDING (`ext`)

FIELD scope  [$$]  [RC]
Q: Whole house or sections?
OPT: whole | sections
FIRES: —

FIELD existing_material  [$$$]  [R]
Q: What's on the house now, and year built?
OPT: material + year
WHY: Pre-'78 painted wood = lead protocol; old fiber siding = possible asbestos = abatement
FIRES: hazmat

FIELD sheathing_condition  [$$]  [R]
Q: Known soft spots, woodpecker holes, rot at corners/bottoms?
OPT: unknown | known_spots | clean
WHY: Per-sheet sheathing replacement — set the allowance now or eat it later
FIRES: rot_repair

FIELD new_material  [$$]  [RC]
Q: New siding?
OPT: vinyl | fiber_cement | lp | board_batten | stone_accent
FIRES: —

FIELD profile  [$]  [RC]
Q: Profile?
OPT: lap | dutch | vertical | shake_accent
FIRES: —

FIELD trim_wrap  [$$]  [RC]
Q: Window/door trim — wrap aluminum, new composite trim, or keep?
OPT: wrap | new_trim | keep
WHY: Trim is 20-30% of a siding job people don't picture
FIRES: —

FIELD housewrap_insulation  [$]  [R]
Q: Housewrap/foam layer under new siding?
OPT: wrap_only | wrap_plus_foam | none_existing_ok
FIRES: —

FIELD penetrations  [$]  [R]
Q: Light fixtures, outlets, hose bibs, vents — reuse blocks or new mounts?
OPT: (inventory)
WHY: Every penetration = a block + flash detail
FIRES: —

---

# 9. FULL GUT / WHOLE-HOUSE (`gut`)

*(Composite type: fires bathroom + kitchen + basement checklists per room list, plus these house-level fields.)*

FIELD room_list  [$$$]  [RC]
Q: Which rooms/spaces are in scope? (list them all)
OPT: (list — each bath/kitchen/basement fires its own checklist)
FIRES: nested checklists

FIELD systems  [$$$]  [R]
Q: Systems scope — repipe, rewire, new HVAC, new panel? Or reuse?
OPT: per-system: replace | partial | reuse
WHY: The gut-job fork: cosmetic gut vs systems gut is a 2× total swing
FIRES: plumbing_age, electrical_service, hvac_mod

FIELD occupied  [$$]  [R]
Q: Occupied during work, or vacant?
OPT: vacant | occupied_phased
WHY: Occupied = phasing, dust protection, daily cleanup, timeline stretch
FIRES: —

FIELD age_of_home  [$$$]  [RC]
Q: Year built?
OPT: pre_1950 | 1950_1977 | 1978_2000 | post_2000
FIRES: hazmat, plumbing_age, structural (old framing surprises)

---

# 10. UNIVERSAL EXPANSION MODULES

*(Authored once, fired by trigger phrases from ANY answer/photo/plan on any project type. Each adds its fields when fired.)*

MODULE structural
TRIGGERS: "load bearing", "remove wall", "open concept", "beam", "vaulted", "sagging", "second story", curbless entry, covered deck roof, wall-hung toilet, foundation cut
ADDS: which_wall_or_span | whats_above (photo) | whats_inside_wall | engineer_needed(yes/no/unknown) | beam_exposure(flush/dropped)
WHY: Beam + engineering + temporary support = the classic mid-job change order

MODULE plumbing_relocation
TRIGGERS: fixture moves, wet island, new bath location, "move the sink", basement bath no rough-in
ADDS: distance_of_move | drain_and_vent_path | floor_system(slab/joist/truss) | water_line_material
WHY: Slab = cutting concrete; venting path is the silent killer

MODULE plumbing_age
TRIGGERS: pre-1978 home, "galvanized", "cast iron", "low pressure", "old pipes"
ADDS: supply_material(copper/galv/pex/unknown) | drain_material(pvc/cast/unknown) | water_heater_age | main_shutoff_works(yes/no)
WHY: Tying new work to galvanized = leaks at YOUR joints; scope the repipe conversation now

MODULE electrical_service
TRIGGERS: panel full, new circuits, induction, hot tub, EV charger, heated floor, kitchen remodel, addition, basement finish
ADDS: panel_photo | amperage(100/150/200/unknown) | breaker_space | aluminum_wiring(yes/no/unknown) | knob_tube(yes/no/unknown)
WHY: Panel upgrade = $2.5-4.5k nobody quoted; aluminum/knob-tube = insurance + remediation

MODULE gas_line
TRIGGERS: "gas range", "gas fireplace", "gas grill line", fuel change, range relocation
ADDS: meter_location | existing_line_size | run_distance | appliance_btu_total
WHY: Undersized branch = the whole run gets replaced

MODULE hvac_mod
TRIGGERS: wall removal, soffit removal, addition, basement finish, duct reroute, "no vent in that room"
ADDS: whats_in_the_soffit_or_wall (photo) | system_capacity_known | duct_path_available | returns_affected
WHY: Ducts in the demoed soffit = reroute nobody drew

MODULE water_mold
TRIGGERS: "water damage", "leak", "mold", "musty", "flooded", stains in photos, basement moisture answer
ADDS: source_active_or_resolved | visible_extent (photos) | materials_affected | remediation_scope(surface/tearout/pro_remediation)
WHY: Building over active water = warranty suicide; remediation is its own trade

MODULE rot_repair
TRIGGERS: soft decking, ledger boards, siding bottoms, "spongy", old deck reuse, roof decking condition
ADDS: probe_findings (photos) | allowance_or_fixed(structure) | extent_unknown_flag
WHY: The per-sheet/per-joist allowance conversation happens NOW or as a fight later

MODULE window_door_change
TRIGGERS: "new window", "bigger opening", "patio door", wet-wall window, addition connection
ADDS: opening_size_change(same/bigger/smaller/new) | wall_type(bearing/non/unknown) | exterior_patch_material | header_needed
FIRES: structural (if bigger/new in bearing wall), exterior_tie_in

MODULE exterior_tie_in
TRIGGERS: ledger attach, roof tie-in, new penetrations (hood/bath vents), addition, window changes
ADDS: siding_material_at_tie_in | flashing_detail | match_or_patch | discontinued_material_risk
WHY: Every hole in the envelope = flashing that fails in year 2 if unscoped

MODULE hazmat
TRIGGERS: pre-1978, "popcorn ceiling", "old tile", "asbestos", old fiber siding, vermiculite
ADDS: year_built_confirmed | suspect_materials (photos) | test_or_assume | abatement_budget_flag
WHY: RRP lead rules + asbestos abatement = legal exposure, not just cost

MODULE permit_code
TRIGGERS: structural work, egress, deck >30", 8ft fence, additions, new bath, covered roof, property line
ADDS: jurisdiction | permit_by(contractor/owner) | hoa(yes/no) | survey_needed
WHY: Unpermitted structural = stop-work + resale landmine

MODULE accessibility
TRIGGERS: "aging in place", "wheelchair", "grab bars", curbless, comfort-height, "mom is moving in"
ADDS: door_widths | grab_bar_blocking(now_or_future) | threshold_heights | future_proofing_level
WHY: Blocking costs $50 now, $2k after tile

MODULE demolition
TRIGGERS: tearout, tearoff, "haul away", existing structure removal
ADDS: dumpster_count_size | salvage_items | utility_disconnects_needed | haul_access
WHY: Disposal is real money everyone rounds to zero

---

# 11. CONFLICT + OMISSION RULES (per type — reconciliation engine seeds)

**Format:** `IF (condition) → ASK: forced question`

## Bathroom
- IF answer says tub BUT photo shows walk-in (or vice versa) → ASK: which is the plan — keeping what's there or changing config?
- IF curbless selected AND floor_system unknown → FORCE structural module (joist direction/recess feasibility)
- IF tile_height=ceiling AND no ventilation answer → ASK ventilation (moisture load)
- IF plan/photo shows window in wet wall AND wet_wall_window unanswered → FORCE the field
- IF heated_floor=yes AND elec panel unknown → FORCE electrical_service
- OMISSION: config answered but glass unanswered → ASK (biggest forgotten line item)

## Kitchen
- IF island=wet AND floor_system=slab → ASK: slab cut acknowledged? (cost flag)
- IF layout=keep BUT client mentions "move the fridge over" anywhere → CONFLICT: that's a reconfigure — re-ask layout
- IF wall_removal AND whats_inside_wall unanswered → BLOCK scope-complete until photo or answer
- IF appliances mention gas→induction AND electrical_service not fired → FIRE it
- OMISSION: venting unanswered on any range change → ASK (code + penetration)

## Deck
- IF height >30" AND railing=none/unanswered → FORCE railing (code)
- IF material=composite AND reuse_framing=yes → ASK: joist spacing confirmed 16" OC or better? (photo)
- IF overhead=roof AND attachment=freestanding → CONFLICT: roof needs house tie-in or self-supporting structure — clarify
- OMISSION: footings + utilities_below unanswered → ASK before scope-complete

## Addition
- IF purpose=bath_suite AND plumbing_relocation not fired → FIRE it
- IF foundation=basement AND existing house on slab/crawl → ASK: depth transition acknowledged (cost flag)
- IF roof_tie_in=second_story AND structural not fired → FIRE it (always)
- OMISSION: hvac unanswered → BLOCK scope-complete (the #1 addition miss)

## Roof
- IF layers=two_plus AND estimate lacks tearoff line → FLAG
- IF material changes asphalt→metal AND decking condition unknown → ASK
- IF insurance_claim=yes → FLAG: supplement workflow, different paper trail

## Fence
- IF property_line=assumed → HARD FLAG on proposal (liability language)
- IF height=8ft AND permit_code not fired → FIRE it
- OMISSION: gates unanswered → ASK (every fence has at least one)

## Basement
- IF moisture=active_unknown → BLOCK scope-complete; water_mold module mandatory
- IF bathroom=full AND roughin unanswered → FORCE (slab cut vs ejector is a $5k+ fork)
- IF egress_new AND permit_code not fired → FIRE it
- IF ceiling_height <7ft under ducts AND ceiling=drywall → ASK: soffit maze acknowledged or duct reroute?

## Exterior
- IF year <1978 AND hazmat not fired → FIRE it (always)
- IF sheathing_condition=unknown → FORCE rot allowance conversation (allowance line on proposal)

## Universal (all types)
- IF any answer mentions water/mold/leak keywords AND water_mold not fired → FIRE it
- IF age_of_home=pre_1978 anywhere → hazmat fires, no exceptions
- IF client-supplied materials anywhere → FLAG: delivery/damage/spec responsibility language on proposal
- RESIDUAL: anything mentioned but matching no field and no module → explicit "I don't have a module for this — tell me more" (never silently dropped)

---

# 12. WHAT HAPPENS AFTER YOU RED-PEN

1. Upload this file back edited.
2. I reconcile it against the live bathroom seed format (still need that pasted from the audit report §3).
3. I sync VISUAL_ASSET_MANIFEST.md to match (pruned options lose their image rows).
4. I write the Phase 1B seed dispatch — migrations + seed rows in the exact live table shape, Sonnet-ready.
