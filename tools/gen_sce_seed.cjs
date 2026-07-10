// Generator for the SCE Phase 1B seed migration. Authoring lives here as structured data
// translated from docs/arcs/SCOPE_SEED_CONTENT_DRAFT.md; emits an idempotent SQL migration
// with auto-sequential money_risk_rank. Re-run after a red-pen of the draft to regenerate.
// Run: node tools/gen_sce_seed.cjs
const fs = require('fs');
const OUT = 'supabase/migrations/20260710180000_scope_seed_p1b.sql';
const q = s => s === null || s === undefined ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`;
const arr = a => !a || !a.length ? 'NULL' : `ARRAY[${a.map(q).join(',')}]::text[]`;
const jopts = a => !a || !a.length ? 'NULL' : `'${JSON.stringify(a).replace(/'/g, "''")}'::jsonb`;
const R = 'rep', RC = 'rep_client';

// ── CHECKLIST FIELDS per project_type (document order = rank). ──
// field: [key, question, type, options|null, audience, risk_note|null, adds_trades|null]
const CH = {
bathroom: [
  ['tub_shower_config','Walk-in shower only, tub/shower combo, freestanding tub plus separate shower, or tub only?','choice',['walkin','combo','freestanding_plus_shower','tub_only'],RC,'Drives plumbing rough-in, glass, waterproofing footprint — the single biggest layout fork',['Plumbing - Rough-in','Tile - Wall / shower','Tile - Floor']],
  ['layout_change','Are fixtures staying where they are, or moving (toilet, vanity, tub/shower)?','choice',['keep_layout','minor_moves','full_reconfigure'],RC,'Every fixture move = drain + supply relocation; slab foundation makes this brutal',['Plumbing - Rough-in']],
  ['shower_entry','Standard curb or curbless/zero-entry shower?','choice',['curb','curbless'],RC,'Curbless = recessed subfloor or topping slab; joist direction can kill it. Huge missed-cost item',null],
  ['wet_wall_window','Is there a window in the shower/tub wet wall? Keep, remove, or replace?','choice',['none','keep_waterproof','remove_infill','replace_smaller'],R,'Window in wet zone = waterproofing detail or framing/siding/exterior patch',null],
  ['tile_height','Wall tile to the ceiling, standard height, or wainscot?','choice',['ceiling','standard','wainscot'],RC,'Can double wall-tile quantity + labor',['Tile - Wall / shower']],
  ['niche','Recessed niche, shelf/ledge, corner shelves, or none?','choice',['recessed','shelf','corner','none'],RC,'Niche = framing + waterproofing detail; retrofit after tile = never',['Tile - Wall / shower']],
  ['wall_tile_layout','Tile pattern on walls?','choice',['subway_offset','stacked','herringbone','large_format','hex'],RC,'Herringbone/hex = labor multiplier; large-format = substrate flatness prep',['Tile - Wall / shower']],
  ['shower_glass','Frameless glass, framed door, or curtain?','choice',['frameless','framed','curtain'],RC,'Frameless = $1.5-3k+ line item people forget until the end',['Tile - Wall / shower']],
  ['shower_drain','Standard center drain or linear drain?','choice',['center','linear'],R,'Linear = slope-to-one-plane, changes pan build and tile sizes possible',['Tile - Floor']],
  ['floor_tile','Floor material?','choice',['porcelain_woodlook','porcelain_stonelook','natural_stone','lvp'],RC,'Natural stone = sealing + thickness transitions; LVP = budget signal',['Tile - Floor','Flooring - LVP']],
  ['heated_floor','Heated floor?','bool',null,RC,'Electric mat + dedicated circuit + thermostat — retrofit impossible after tile',['Electrical - Rough-in']],
  ['vanity_style','Vanity style?','choice',['floating','freestanding','builtin'],RC,'Floating = blocking in wall; size drives plumbing centers',['Cabinets / vanities - Install']],
  ['vanity_count','How many vanities?','number',null,RC,'Double vanity = 2x plumbing centers + cabinetry',['Cabinets / vanities - Install','Plumbing - Finish / fixtures']],
  ['vanity_size_in','Vanity size, roughly, in inches?','number',null,RC,null,['Cabinets / vanities - Install']],
  ['countertop','Vanity top material?','choice',['quartz','granite','cultured_marble'],RC,null,null],
  ['fixture_finish','Fixture finish family?','choice',['brushed_nickel','matte_black','chrome','brushed_gold'],RC,'Locks the whole fixture package; mixed finishes = client callback',['Plumbing - Finish / fixtures']],
  ['ventilation','Existing exhaust fan — present, and vented where?','choice',['exists_vented_out','exists_vented_attic','none'],R,'Attic-vented or missing fan = code fix + roof/soffit penetration nobody quoted',['Electrical - Rough-in','Electrical - Finish']],
  ['toilet','Toilet — reuse, standard replace, comfort-height, wall-hung, or bidet seat circuit?','choice',['reuse','standard','comfort_height','wall_hung','bidet_circuit'],RC,'Wall-hung = in-wall carrier (framing + cost jump); bidet seat = outlet at toilet',['Plumbing - Finish / fixtures']],
  ['age_of_home','Roughly what year was the house built?','choice',['pre_1950','1950_1977','1978_2000','post_2000'],RC,"Pre-'78 = lead paint protocol; old homes = galvanized/cast-iron surprise territory",null],
],
kitchen: [
  ['layout_change','Keeping the layout, or moving things — sink, range, fridge locations?','choice',['keep','reconfigure','wall_removal_open_concept'],RC,'THE kitchen fork. Sink move = drain/vent; range move = gas or 240V; wall = structural',['Plumbing - Rough-in','Electrical - Rough-in']],
  ['wall_removal_detail','If a wall is coming out — which wall, and does anything live in it (ducts, plumbing stacks, wiring)?','text',null,R,'Load-bearing + HVAC/plumbing in wall = beam + reroutes; the classic $15k surprise',['Framing','Demo']],
  ['island','Island — none, dry, with sink/cooktop, or peninsula?','choice',['none','dry','wet','peninsula'],RC,'Wet island = underslab/underfloor drain + vent (island venting = real plumbing)',['Plumbing - Rough-in','Electrical - Rough-in']],
  ['cabinets_supply','Who supplies cabinets — us, client-purchased, or reuse/refinish existing?','choice',['contractor','client_supplied','reface','paint_existing'],R,'Supply model = margin model; client-supplied = delivery/damage/missing-filler risk',['Cabinets / vanities - Install']],
  ['cabinet_style','Door style?','choice',['shaker','slab','raised_panel','inset'],RC,'Inset = precision + cost tier jump',['Cabinets / vanities - Install']],
  ['uppers','Uppers to the ceiling, standard with soffit, open above, or open shelving?','choice',['ceiling','soffit','open_above','open_shelving'],RC,"To-ceiling = taller boxes + crown detail; soffit removal = what's IN the soffit?",['Cabinets / vanities - Install']],
  ['countertop','Countertop material?','choice',['quartz','granite','butcher_block','laminate'],RC,null,null],
  ['counter_edge','Edge/detail — eased, waterfall island end, or ogee?','choice',['eased','waterfall','ogee'],RC,'Waterfall = extra slab + fabrication',null],
  ['sink','Sink style?','choice',['undermount_single','farmhouse','dropin'],RC,'Farmhouse = cabinet modification + weight',['Plumbing - Finish / fixtures']],
  ['backsplash_extent','Backsplash extent?','choice',['standard','full_range','full_all'],RC,null,['Tile - Backsplash']],
  ['backsplash_layout','Backsplash pattern?','choice',['subway','herringbone','stacked','slab'],RC,null,['Tile - Backsplash']],
  ['appliances','Appliances — who supplies, and any changes in size/location/fuel?','choice',['reuse_all','client_supplied_new','contractor_supplied'],RC,'30"→36" range, counter-depth fridge, gas→induction — each is a cabinet/electrical/gas line item',['Electrical - Rough-in']],
  ['venting','Range hood — type, and does it vent outside today?','choice',['undercab','chimney','custom','otr_micro'],R,'Recirculating→vented = new exterior penetration + duct run',null],
  ['flooring_extent','New flooring — kitchen only, or flowing into adjacent rooms?','choice',['kitchen_only','contiguous_areas'],RC,'"Match into the living room" doubles the flooring scope; transition height issues',null],
  ['elec_panel','Panel capacity — known space for new circuits? (photo of panel)','choice',['room_available','full','unknown'],R,'Kitchen remodel adds 3-6 circuits; full panel = upgrade nobody quoted',['Electrical - Service upgrade']],
  ['age_of_home','Year built?','choice',['pre_1950','1950_1977','1978_2000','post_2000'],RC,null,null],
],
deck: [
  ['size_height','Rough size, and how high off grade at the highest point?','choice',['low_under_30in','mid','second_story'],RC,'>30" = guardrail code + footing depth; second-story = beam sizing + stairs become a structure',['Concrete - Footings']],
  ['attachment','Attached with a ledger, or freestanding?','choice',['ledger','freestanding'],R,'Ledger = flashing detail + what’s behind the siding (rot discovery zone); freestanding = more footings',null],
  ['existing_deck','Existing deck — none, full tearoff, or reuse framing?','choice',['none','tearoff','reuse_framing'],R,'"Reuse framing" = inspect joists/footings; composite on old 24" OC framing = fail',['Demo']],
  ['material','Decking material?','choice',['pt','cedar','composite','pvc'],RC,'3-4× material spread; composite = 16" OC or better framing',null],
  ['board_layout','Board pattern?','choice',['standard','diagonal','picture_frame','breaker'],RC,'Diagonal/picture-frame = waste factor + blocking',null],
  ['railing','Railing style?','choice',['wood_baluster','metal_baluster','cable','aluminum','glass'],RC,'Cable/glass = 2-5× rail cost; cable = post engineering for tension',null],
  ['stairs','Stairs — none, straight, landing, or wrap/cascade?','choice',['none','straight','landing','cascade'],RC,'Stairs are per-step money; landing = footings',null],
  ['overhead','Anything overhead — pergola, full covered roof, or louvered?','choice',['none','pergola','roof','louvered'],RC,'Covered roof = tie into house roof + posts sized up + permit becomes structure',['Framing']],
  ['under_deck','Under-deck treatment?','choice',['open','skirting','dry_below'],RC,'Dry-below = drainage system + gutter, real line item',null],
  ['fastening','Face-screw or hidden fasteners?','choice',['face','hidden'],RC,null,null],
  ['electrical','Lighting/outlets/fan on the deck?','choice',['none','lighting','outlets','fan_on_covered'],RC,'Exterior circuit + GFCI; fan needs the covered roof answered',['Electrical - Rough-in']],
  ['utilities_below','Anything where footings go — utilities, septic, irrigation? Locate scheduled?','choice',['clear','unknown_locate_needed','known_conflicts'],R,'Footing hits septic line = bad day',['Concrete - Footings']],
],
addition: [
  ['purpose_size',"What's the addition for, and rough size?",'choice',['bedroom','bath_suite','family_room','kitchen_expansion','sunroom'],RC,'Bath/kitchen purpose = full MEP scope inside the addition',null],
  ['foundation','Foundation type?','choice',['crawl','slab','basement','pier'],RC,'Basement vs slab = 2-3× foundation cost; must reconcile with existing foundation depth',['Foundations - Poured']],
  ['roof_tie_in','How does the new roof meet the old — extend ridge, perpendicular gable, shed, or second story?','choice',['extend_ridge','perp_gable','shed','second_story'],R,'Tie-in defines framing complexity; second story = whole different job (bearing walls, stairs)',['Framing','Roofing']],
  ['hvac','Heat/cool the new space — extend existing, mini-split, or new unit?','choice',['extend_existing','mini_split','new_system'],R,'Existing system rarely has capacity; "just extend it" = undersized everything',['HVAC - Install']],
  ['elec_panel','Panel capacity for a new room’s circuits? (photo)','choice',['room_available','full','unknown'],R,null,['Electrical - Service upgrade']],
  ['connection','How does it connect to the house — open passage, doorway, or hallway?','choice',['open','door','hall'],RC,'Open passage through exterior wall = header/beam + the wall is bearing',['Framing']],
  ['exterior_match','Match existing siding/roofing, or intentional contrast?','choice',['match','contrast'],RC,'Matching discontinued siding = whole-wall reside surprise',null],
  ['site','Setbacks, easements, slope, tree removal, utility lines in the footprint?','text',null,R,'Setback violation = redesign; slope = stepped footings',null],
  ['interior_finish','Interior finish level — match house trim/doors/flooring, or new spec?','choice',['match_existing','new_spec'],RC,null,null],
],
roof: [
  ['scope','Full replacement or repair?','choice',['full_replace','repair_section'],RC,null,['Roofing']],
  ['layers','How many existing layers, and any known decking issues?','choice',['one','two_plus','unknown'],R,'2+ layers = tearoff cost jump; soft decking = per-sheet replacement money',['Roofing']],
  ['material','Material?','choice',['asphalt','standing_seam','rpanel','shake'],RC,null,['Roofing']],
  ['shingle_grade','If asphalt — grade?','choice',['3tab','architectural','designer'],RC,null,['Roofing']],
  ['pitch_access','Pitch and access — steep? Multi-story? Tight lot?','choice',['walkable','steep','very_steep'],R,'Steep/access = labor multiplier + safety setup',['Roofing']],
  ['penetrations','Count/condition — chimneys, skylights, vents, satellite mounts?','text',null,R,"Chimney reflash, skylight replace-while-you're-there, abandoned mounts — each a line item",['Roofing']],
  ['ventilation','Ventilation plan?','choice',['box','ridge_soffit','power'],RC,'Soffit intake blocked = warranty problem; upgrade to ridge = cut the deck',['Roofing']],
  ['gutters','Gutters — keep, new 5", new 6", or add guards?','choice',['keep','5k','6k','guards'],RC,null,null],
  ['insurance','Is this an insurance claim?','choice',['cash','insurance_claim'],R,'Claim = supplement process, adjuster scope, different paper trail entirely',null],
],
fence: [
  ['length_layout','Rough linear feet and layout (photo/sketch of property lines)?','text',null,RC,null,null],
  ['property_line','Property pins located, or building off assumption? Neighbor agreement?','choice',['pins_located','survey_needed','assumed'],R,"Fence on the neighbor's land = tearout. The #1 fence lawsuit",null],
  ['style','Style?','choice',['privacy','shadowbox','board_on_board','picket','horizontal','split_rail','chain_link','aluminum'],RC,'Horizontal = premium lumber grade + tighter posts',null],
  ['material','Material?','choice',['pt','cedar','vinyl','composite'],RC,null,null],
  ['height','Height?','choice',['4ft','6ft','8ft'],RC,'8ft = HOA/permit trigger in most KC metros + deeper posts',null],
  ['top_treatment','Top treatment?','choice',['dogear','cap_trim','lattice'],RC,null,null],
  ['gates','Gates — how many walk, any double drive?','number',null,RC,'Gates are where fences fail; drive gate = posts in concrete sized up',null],
  ['terrain','Slope — rack, step, or flat? Rock/utilities where posts go?','choice',['flat','rack','step'],R,'Stepping = more material + labor; rock = auger time or core drilling',['Concrete - Footings']],
  ['tearout','Existing fence tearout + haul?','choice',['none','tearout_haul'],RC,null,['Demo']],
],
basement: [
  ['moisture','Any history of water — seepage, sump, efflorescence, musty smell? (photos of walls/floor)','choice',['dry_confirmed','past_issues_resolved','active_unknown'],R,'Finishing a wet basement = doing it twice. THE basement fork — nothing proceeds until answered',null],
  ['egress','Will there be a bedroom? Existing egress window or new needed?','choice',['no_bedroom','egress_exists','egress_new'],RC,'New egress = concrete cut + well + drainage — $5-8k people never budget',['Concrete - Slabs']],
  ['bathroom','Bathroom — none, half, or full? Rough-in exist?','choice',['none','half','full'],RC,'No rough-in = breaking slab or sewage ejector pit',['Plumbing - Rough-in']],
  ['ceiling_height','Height under the lowest duct/beam, in inches?','number',null,R,'<7ft under obstructions = code problem or soffit maze; drives ceiling choice',['HVAC - Install']],
  ['ceiling','Ceiling treatment?','choice',['drywall','drop','exposed_painted'],RC,'Drywall = lose access to everything above; drop = lose height',['Drywall - Hang']],
  ['mechanicals','Furnace/WH/panel locations — staying open or getting a room? Clearances?','text',null,R,'Code clearances + combustion air around mechanicals shape the whole layout',['HVAC - Install']],
  ['flooring','Floor?','choice',['lvp','carpet','concrete_polished'],RC,'Any flooring over concrete = moisture test first (ties to moisture field)',['Flooring - LVP']],
  ['bar','Bar — none, dry, wet, or kitchenette?','choice',['none','dry','wet','kitchenette'],RC,'Wet = plumbing run; kitchenette = 20A circuits + venting question',['Plumbing - Rough-in','Electrical - Rough-in']],
  ['elec_panel','Panel space for 4-8 new circuits? (photo)','choice',['room_available','full','unknown'],R,null,['Electrical - Service upgrade']],
],
exterior: [
  ['scope','Whole house or sections?','choice',['whole','sections'],RC,null,null],
  ['existing_material',"What's on the house now, and year built?",'text',null,R,"Pre-'78 painted wood = lead protocol; old fiber siding = possible asbestos = abatement",null],
  ['sheathing_condition','Known soft spots, woodpecker holes, or rot at corners/bottoms?','choice',['unknown','known_spots','clean'],R,'Per-sheet sheathing replacement — set the allowance now or eat it later',null],
  ['new_material','New siding?','choice',['vinyl','fiber_cement','lp','board_batten','stone_accent'],RC,null,null],
  ['profile','Profile?','choice',['lap','dutch','vertical','shake_accent'],RC,null,null],
  ['trim_wrap','Window/door trim — wrap aluminum, new composite trim, or keep?','choice',['wrap','new_trim','keep'],RC,"Trim is 20-30% of a siding job people don't picture",null],
  ['housewrap_insulation','Housewrap/foam layer under new siding?','choice',['wrap_only','wrap_plus_foam','none_existing_ok'],R,null,['Insulation']],
  ['penetrations','Light fixtures, outlets, hose bibs, vents — reuse blocks or new mounts?','text',null,R,'Every penetration = a block + flash detail',null],
],
gut: [
  ['room_list','Which rooms/spaces are in scope? (list them all — each bath/kitchen/basement fires its own checklist)','text',null,RC,null,null],
  ['systems_plumbing','Plumbing systems scope?','choice',['replace','partial','reuse'],R,'The gut-job fork: cosmetic gut vs systems gut is a 2× total swing',['Plumbing - Rough-in']],
  ['systems_electrical','Electrical systems scope?','choice',['replace','partial','reuse'],R,null,['Electrical - Rough-in']],
  ['systems_hvac','HVAC systems scope?','choice',['replace','partial','reuse'],R,null,['HVAC - Install']],
  ['systems_panel','Electrical panel scope?','choice',['replace','partial','reuse'],R,null,['Electrical - Service upgrade']],
  ['occupied','Occupied during work, or vacant?','choice',['vacant','occupied_phased'],R,'Occupied = phasing, dust protection, daily cleanup, timeline stretch',null],
  ['age_of_home','Year built?','choice',['pre_1950','1950_1977','1978_2000','post_2000'],RC,null,null],
],
};

// Bathroom: obsolete live keys to DELETE (renamed to draft keys or superseded).
const BATH_DELETE = ['shower_type','wall_tile_extent','floor_finish','shower_enclosure','shower_niche'];
// Bathroom survivors: draft omits, owner kept — re-ranked after the 18 draft fields, content preserved.
const BATH_SURVIVORS = ['shower_floor_tiled','drywall_wet_area','access_panel','shower_valve','shower_bench'];

// ── MODULES (draft's 14). {key,label,triggers[],trades|null, fields:[[fkey,q,type,opts?]]} ──
const MODS = [
  ['structural','Framing / Structural Change',['load bearing','remove wall','open concept','beam','vaulted','sagging','second story','curbless entry','covered deck roof','wall-hung toilet','foundation cut'],['Framing','Demo','Drywall - Hang'],[
    ['which_wall_or_span','Which wall or span is affected?','text'],['whats_above',"What's above it? (photo)",'text'],['whats_inside_wall',"What's inside the wall — ducts, plumbing, wiring?",'text'],['engineer_needed','Engineer’s stamp needed?','choice',['yes','no','unknown']],['beam_exposure','Beam exposure?','choice',['flush','dropped']]]],
  ['plumbing_relocation','Plumbing Fixture Relocation',['fixture moves','wet island','new bath location','move the sink','basement bath no rough-in','move toilet','move shower','move tub'],['Plumbing - Rough-in','Demo'],[
    ['distance_of_move','How far is the fixture moving?','text'],['drain_and_vent_path','Drain + vent path available?','text'],['floor_system','Floor system?','choice',['slab','joist','truss']],['water_line_material','Water line material?','choice',['copper','pex','galv','unknown']]]],
  ['plumbing_age','Aging Plumbing / Repipe',['pre-1978 home','galvanized','cast iron','low pressure','old pipes'],['Plumbing - Service upgrade','Plumbing - Rough-in'],[
    ['supply_material','Supply line material?','choice',['copper','galv','pex','unknown']],['drain_material','Drain material?','choice',['pvc','cast','unknown']],['water_heater_age','Water heater age?','text'],['main_shutoff_works','Main shutoff works?','choice',['yes','no','unknown']]]],
  ['electrical_service','Electrical Service / Circuits',['panel full','new circuits','induction','hot tub','ev charger','heated floor','kitchen remodel','addition','basement finish'],['Electrical - Service upgrade','Electrical - Rough-in'],[
    ['panel_photo','Photo of the panel','text'],['amperage','Service amperage?','choice',['100','150','200','unknown']],['breaker_space','Open breaker space?','choice',['yes','no','unknown']],['aluminum_wiring','Aluminum wiring?','choice',['yes','no','unknown']],['knob_tube','Knob & tube wiring?','choice',['yes','no','unknown']]]],
  ['gas_line','Gas Line',['gas range','gas fireplace','gas grill line','fuel change','range relocation'],null,[
    ['meter_location','Gas meter location?','text'],['existing_line_size','Existing line size?','text'],['run_distance','Run distance to appliance?','text'],['appliance_btu_total','Total appliance BTU?','text']]],
  ['hvac_mod','HVAC Modification',['wall removal','soffit removal','addition','basement finish','duct reroute','no vent in that room'],['HVAC - Install'],[
    ['whats_in_the_soffit_or_wall',"What's in the soffit/wall? (photo)",'text'],['system_capacity_known','System capacity known?','choice',['yes','no','unknown']],['duct_path_available','Duct path available?','choice',['yes','no','unknown']],['returns_affected','Returns affected?','choice',['yes','no','unknown']]]],
  ['water_mold','Water / Mold Remediation',['water damage','leak','mold','musty','flooded','stains in photos','basement moisture'],['Demo','Drywall - Hang'],[
    ['source_active_or_resolved','Source active or resolved?','choice',['active','resolved','unknown']],['visible_extent','Visible extent? (photos)','text'],['materials_affected','Materials affected?','text'],['remediation_scope','Remediation scope?','choice',['surface','tearout','pro_remediation']]]],
  ['rot_repair','Rot / Structural Repair',['soft decking','ledger boards','siding bottoms','spongy','old deck reuse','roof decking condition'],['Framing','Demo'],[
    ['probe_findings','Probe findings? (photos)','text'],['allowance_or_fixed','Allowance or fixed price on the repair?','choice',['allowance','fixed']],['extent_unknown_flag','Extent unknown?','bool']]],
  ['window_door_change','Window / Door Change',['new window','bigger opening','patio door','wet-wall window','addition connection'],['Framing'],[
    ['opening_size_change','Opening size change?','choice',['same','bigger','smaller','new']],['wall_type','Wall type?','choice',['bearing','non','unknown']],['exterior_patch_material','Exterior patch material?','text'],['header_needed','New header needed?','choice',['yes','no','unknown']]]],
  ['exterior_tie_in','Exterior Envelope Tie-In',['ledger attach','roof tie-in','new penetrations','hood vent','bath vent','addition','window changes'],null,[
    ['siding_material_at_tie_in','Siding material at the tie-in?','text'],['flashing_detail','Flashing detail?','text'],['match_or_patch','Match or patch?','choice',['match','patch']],['discontinued_material_risk','Discontinued material risk?','choice',['yes','no','unknown']]]],
  ['hazmat','Hazardous Materials (Lead / Asbestos)',['pre-1978','popcorn ceiling','old tile','asbestos','old fiber siding','vermiculite'],['Demo'],[
    ['year_built_confirmed','Year built confirmed?','text'],['suspect_materials','Suspect materials? (photos)','text'],['test_or_assume','Test or assume?','choice',['test','assume']],['abatement_budget_flag','Abatement budget flagged?','bool']]],
  ['permit_code','Permit / Code',['structural work','egress','deck over 30','8ft fence','additions','new bath','covered roof','property line'],null,[
    ['jurisdiction','Jurisdiction / AHJ?','text'],['permit_by','Permit pulled by?','choice',['contractor','owner']],['hoa','HOA approval needed?','choice',['yes','no','unknown']],['survey_needed','Survey needed?','choice',['yes','no','unknown']]]],
  ['accessibility','Accessibility / Aging in Place',['aging in place','wheelchair','grab bars','curbless','comfort-height','mom is moving in'],null,[
    ['door_widths','Door widths?','text'],['grab_bar_blocking','Grab-bar blocking now or future?','choice',['now','future','none']],['threshold_heights','Threshold heights?','text'],['future_proofing_level','Future-proofing level?','choice',['full','partial','none']]]],
  ['demolition','Demolition / Disposal',['tearout','tearoff','haul away','existing structure removal'],['Demo'],[
    ['dumpster_count_size','Dumpster count/size?','text'],['salvage_items','Salvage items?','text'],['utility_disconnects_needed','Utility disconnects needed?','choice',['yes','no','unknown']],['haul_access','Haul access?','text']]],
];

// ── CONFLICT RULES: all of §11 + answer-driven FIRES (inert shape-proofs, Phase 3). ──
// [rule_key, sources[], condition, question]
const RULES = [
  // Bathroom §11
  ['bath_config_photo_conflict',['typed','photo'],'answer says tub but photo shows walk-in (or vice versa)','Which is the plan — keeping what’s there or changing the tub/shower config?'],
  ['bath_curbless_floor_unknown',['answer'],'shower_entry=curbless AND floor system unknown','Curbless needs a recessed pan — is the joist direction/subfloor recess feasible? (fires structural)'],
  ['bath_tileheight_no_vent',['answer'],'tile_height=ceiling AND ventilation unanswered','Tile to the ceiling adds moisture load — what’s the exhaust fan situation?'],
  ['bath_wetwall_window_omission',['plan','typed'],'plan/photo shows a window in the wet wall AND wet_wall_window unanswered','The plan shows a window in the wet wall — staying as-is, moved, or closed in?'],
  ['bath_heatedfloor_panel_unknown',['answer'],'heated_floor=yes AND electrical panel unknown','Heated floor needs a dedicated circuit — is there panel space? (fires electrical_service)'],
  ['bath_glass_omission',['answer'],'tub/shower config answered but shower_glass unanswered','Glass is the biggest forgotten line item — frameless, framed, or curtain?'],
  // Kitchen §11
  ['kitch_wet_island_slab',['answer'],'island=wet AND floor_system=slab','Wet island on a slab = cutting concrete — is that cost acknowledged?'],
  ['kitch_layout_keep_move_conflict',['typed'],'layout=keep but client mentions moving the fridge/sink/range','That’s a reconfigure — re-confirm the layout answer.'],
  ['kitch_wall_removal_block',['answer'],'wall_removal AND whats_inside_wall unanswered','What’s inside the wall coming out — ducts, plumbing, wiring? (photo or answer required)'],
  ['kitch_gas_to_induction_elec',['answer'],'appliances change gas→induction AND electrical_service not fired','Induction needs 240V — fire the electrical service check.'],
  ['kitch_venting_omission',['answer'],'any range change AND venting unanswered','Range change touches venting — type, and does it vent outside today?'],
  // Deck §11
  ['deck_height_railing',['answer'],'size_height>30in AND railing none/unanswered','Over 30" requires guardrail by code — which railing?'],
  ['deck_composite_reuse_framing',['answer'],'material=composite AND existing_deck=reuse_framing','Composite needs 16" OC or better — is the joist spacing confirmed? (photo)'],
  ['deck_roof_freestanding_conflict',['answer'],'overhead=roof AND attachment=freestanding','A covered roof needs a house tie-in or a self-supporting structure — clarify.'],
  ['deck_footings_utilities_omission',['answer'],'footings needed AND utilities_below unanswered','Where do the footings land — any utilities/septic/irrigation located?'],
  // Addition §11
  ['addn_bathsuite_plumbing',['answer'],'purpose=bath_suite AND plumbing_relocation not fired','A bath suite = full plumbing scope — fire plumbing relocation.'],
  ['addn_foundation_depth',['answer'],'foundation=basement AND existing house on slab/crawl','Is the foundation depth transition acknowledged? (cost flag)'],
  ['addn_second_story_structural',['answer'],'roof_tie_in=second_story AND structural not fired','Second story = bearing walls + stairs — fire structural (always).'],
  ['addn_hvac_block',['answer'],'hvac unanswered','How is the new space heated/cooled? (the #1 addition miss — required before scope-complete)'],
  // Roof §11
  ['roof_layers_tearoff_flag',['answer'],'layers=two_plus AND estimate lacks a tearoff line','Two-plus layers — confirm the tearoff line is in the estimate.'],
  ['roof_material_change_decking',['answer'],'material changes asphalt→metal AND decking condition unknown','Switching to metal — what’s the decking condition?'],
  ['roof_insurance_flag',['answer'],'insurance_claim=yes','Insurance claim = supplement workflow + adjuster scope + different paper trail.'],
  // Fence §11
  ['fence_property_line_flag',['answer'],'property_line=assumed','Property line assumed — hard flag on the proposal (liability language).'],
  ['fence_height_permit',['answer'],'height=8ft AND permit_code not fired','8ft fence = permit/HOA trigger — fire permit/code.'],
  ['fence_gates_omission',['answer'],'gates unanswered','Every fence has at least one gate — how many walk / any drive gate?'],
  // Basement §11
  ['bsmt_moisture_block',['answer'],'moisture=active_unknown','Active/unknown water — water_mold module is mandatory; nothing proceeds until resolved.'],
  ['bsmt_bath_roughin',['answer'],'bathroom=full AND rough-in unanswered','Full bath — does a rough-in exist, or is it slab-cut vs ejector? ($5k+ fork)'],
  ['bsmt_egress_permit',['answer'],'egress_new AND permit_code not fired','New egress = concrete cut + permit — fire permit/code.'],
  ['bsmt_ceiling_height_soffit',['answer'],'ceiling_height<7ft under ducts AND ceiling=drywall','Low clearance under ducts with a drywall ceiling — soffit maze or duct reroute?'],
  // Exterior §11
  ['ext_year_hazmat',['answer'],'year_built<1978 AND hazmat not fired','Pre-1978 exterior = lead/asbestos protocol — fire hazmat (always).'],
  ['ext_sheathing_allowance',['answer'],'sheathing_condition=unknown','Unknown sheathing — set the rot allowance conversation (allowance line on the proposal).'],
  // Universal §11
  ['univ_water_keyword_firewatermold',['answer'],'any answer mentions water/mold/leak keywords AND water_mold not fired','Water/mold/leak mentioned — fire the water_mold module.'],
  ['univ_pre1978_hazmat',['answer'],'age_of_home=pre_1978 anywhere','Pre-1978 home — hazmat fires, no exceptions.'],
  ['univ_client_supplied_flag',['answer'],'client-supplied materials anywhere','Client-supplied materials — delivery/damage/spec responsibility language on the proposal.'],
  ['univ_residual_unknown',['answer'],'something mentioned matches no field and no module','I don’t have a module for this — tell me more. (never silently dropped)'],
];

// ── EMIT SQL ──
let s = `-- SCE Phase 1B · FULL SEED — 9 project types + 15 modules (14 draft + waterproofing) + conflict rules.
-- Translated verbatim from docs/arcs/SCOPE_SEED_CONTENT_DRAFT.md (owner-locked 2026-07-10).
-- ALL rows tenant_id = NULL (platform defaults). Idempotent + re-runnable: upserts ON CONFLICT
-- per the NULLS-NOT-DISTINCT natural keys. money_risk_rank sequential per type in document order.
-- Generated from tools/gen_sce_seed.cjs — do not hand-edit; regenerate after a draft red-pen.

BEGIN;

`;

// Bathroom deletes (renamed/superseded live keys)
s += `-- Bathroom reconciliation: drop old-key rows superseded by draft keys (answer persistence\n-- does not exist yet, so this is safe). shower_type→tub_shower_config, wall_tile_extent→tile_height,\n-- floor_finish→floor_tile, shower_enclosure→shower_glass, shower_niche→niche.\n-- vanity_count RE-ADDED to the bathroom checklist (owner reversal 2026-07-10) — no longer deleted.\n`;
s += `DELETE FROM scope_checklists WHERE tenant_id IS NULL AND project_type='bathroom' AND field_key IN (${BATH_DELETE.map(q).join(',')});\n\n`;

// Checklist upserts
for (const [pt, fields] of Object.entries(CH)) {
  s += `-- ${pt.toUpperCase()} (${fields.length} fields)\n`;
  s += `INSERT INTO scope_checklists (tenant_id, project_type, field_key, question, field_type, options, money_risk_rank, adds_trades, audience, risk_note, active) VALUES\n`;
  s += fields.map((f, i) => {
    const [key, ques, type, opts, aud, why, trades] = f;
    return `  (NULL, ${q(pt)}, ${q(key)}, ${q(ques)}, ${q(type)}, ${jopts(opts)}, ${i + 1}, ${arr(trades)}, ${q(aud)}, ${q(why)}, true)`;
  }).join(',\n');
  s += `\nON CONFLICT (tenant_id, project_type, field_key) DO UPDATE SET question=EXCLUDED.question, field_type=EXCLUDED.field_type, options=EXCLUDED.options, money_risk_rank=EXCLUDED.money_risk_rank, adds_trades=EXCLUDED.adds_trades, audience=EXCLUDED.audience, risk_note=EXCLUDED.risk_note, active=true;\n\n`;
}

// Bathroom survivors: re-rank after the 18 draft fields; preserve their content.
s += `-- Bathroom survivors (draft omits, owner kept): re-rank after the 18 draft fields; content preserved.\n`;
BATH_SURVIVORS.forEach((k, i) => {
  s += `UPDATE scope_checklists SET money_risk_rank=${19 + i}, audience='rep', active=true WHERE tenant_id IS NULL AND project_type='bathroom' AND field_key=${q(k)};\n`;
});
s += `\n`;

// Modules: drop renamed live modules, upsert draft's 14 (waterproofing untouched).
s += `-- Modules: drop live keys superseded by draft renames; waterproofing (live, absent from draft) survives untouched.\n`;
s += `DELETE FROM scope_modules WHERE tenant_id IS NULL AND module_key IN ('electrical_upgrade','water_mold_remediation');\n\n`;
s += `INSERT INTO scope_modules (tenant_id, module_key, label, trigger_phrases, adds_fields, adds_trades, active) VALUES\n`;
s += MODS.map(([key, label, trigs, trades, fields]) => {
  const af = fields.map(f => {
    const o = { field_key: f[0], question: f[1], field_type: f[2] };
    if (f[2] === 'choice') o.options = f[3];
    return o;
  });
  return `  (NULL, ${q(key)}, ${q(label)}, ${arr(trigs)}, '${JSON.stringify(af).replace(/'/g, "''")}'::jsonb, ${arr(trades)}, true)`;
}).join(',\n');
s += `\nON CONFLICT (tenant_id, module_key) DO UPDATE SET label=EXCLUDED.label, trigger_phrases=EXCLUDED.trigger_phrases, adds_fields=EXCLUDED.adds_fields, adds_trades=EXCLUDED.adds_trades, active=true;\n\n`;

// Conflict rules
s += `-- Conflict + omission rules (§11 + answer-driven FIRES). Inert shape-proofs until Phase 3.\n`;
s += `INSERT INTO scope_conflict_rules (tenant_id, rule_key, sources_compared, conflict_condition, question_when_conflict, active) VALUES\n`;
s += RULES.map(([key, src, cond, ques]) => `  (NULL, ${q(key)}, ${arr(src)}, ${q(cond)}, ${q(ques)}, true)`).join(',\n');
s += `\nON CONFLICT (tenant_id, rule_key) DO UPDATE SET sources_compared=EXCLUDED.sources_compared, conflict_condition=EXCLUDED.conflict_condition, question_when_conflict=EXCLUDED.question_when_conflict, active=true;\n\n`;

s += `COMMIT;\n`;

fs.writeFileSync(OUT, s);
const nFields = Object.values(CH).reduce((a, f) => a + f.length, 0);
console.log(`Wrote ${OUT}`);
console.log(`checklist fields: ${nFields} across ${Object.keys(CH).length} types | modules: ${MODS.length} upserted (+waterproofing live = 15) | conflict rules: ${RULES.length}`);
