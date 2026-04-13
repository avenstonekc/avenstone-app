-- Seed ai_knowledge for Avenstone Contracting (Kansas City mid-tier GC pricing)
-- Run in Supabase SQL Editor: supabase.com → project → SQL Editor

DO $$
BEGIN

-- Clear existing entries first (safe to re-run)
DELETE FROM ai_knowledge WHERE tenant_id = '00000000-0000-0000-0000-000000000001';

-- Insert all entries
INSERT INTO ai_knowledge (id, tenant_id, category, content, active, created_by, created_at) VALUES

(gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'company_profile',
'COMPANY: Avenstone Contracting (Kansas City, MO)
TYPE: General Contractor — full-service residential and light commercial
MARKET: Kansas City metro (MO + KS side)
TIER: Mid-to-premium. We do not compete on price alone — we compete on quality, communication, and reliability.
MINIMUM PROJECT: $5,000
SWEET SPOT: $30,000–$500,000 renovations, additions, and new construction
TARGET CLIENT: Homeowners doing major renovations, real estate investors, small developers
TRADES SELF-PERFORMED: Carpentry, framing, general labor, project management
TRADES SUBCONTRACTED: Electrical, plumbing, HVAC, roofing, concrete (we manage and markup)
LICENSED: General Contractor license, fully insured, bonded
UNIQUE VALUE: AI-assisted project communication, real-time client portal, transparent scheduling',
true, '8171742a-b586-4f13-be61-744e191a1896', now()),

(gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'labor_rates',
'LABOR RATES — Kansas City Mid-Tier Market (2025–2026)

General laborer: $38–48/hr
Skilled carpenter: $55–70/hr
Lead carpenter / foreman: $70–90/hr
Project manager (billed to job): $65–85/hr
Drywall hanger: $45–60/hr
Drywall finisher: $50–65/hr
Painter (interior): $45–58/hr
Painter (exterior/spray): $50–65/hr
Tile setter: $55–75/hr
Flooring installer: $45–60/hr
Roofer (laborer): $45–60/hr
Roofer (lead): $60–78/hr
Concrete finisher: $50–68/hr
Framing carpenter: $55–72/hr
Electrician (journeyman): $75–95/hr
Master electrician: $90–115/hr
Plumber (journeyman): $75–95/hr
Master plumber: $90–115/hr
HVAC technician: $75–95/hr
HVAC master: $90–115/hr

NOTES:
- Rates above are fully burdened (employer taxes, insurance, workers comp included)
- Subcontractor rates may be higher — they include their overhead and profit
- After-hours / weekend work: add 25–35%
- Prevailing wage (public projects): add 30–50% to above rates',
true, '8171742a-b586-4f13-be61-744e191a1896', now()),

(gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'pricing_demo',
'DEMOLITION & HAULING — Kansas City Mid-Tier

INTERIOR DEMO:
- Soft demo (drywall, flooring, fixtures, cabinets): $2.50–4.50/sf of affected area
- Full interior gut (down to studs + subfloor): $5.00–9.00/sf of home
- Single room demo (bathroom/kitchen, full gut): $800–2,500 per room
- Wall removal (non-structural, including patching ends): $400–900 per wall
- Structural wall removal (with beam install): $2,500–6,000 depending on span

EXTERIOR DEMO:
- Deck demolition: $3.00–6.00/sf
- Siding removal (vinyl/wood): $0.80–1.50/sf
- Roof tear-off only: $60–90/sq (100 sf = 1 sq)
- Driveway/flatwork break-out: $2.50–4.00/sf

HAULING:
- 20-yard dumpster (7-day rental + dump fee): $475–650
- 30-yard dumpster: $575–750
- Per-load haul-away (pickup truck + dump fee): $250–400
- Junk removal service (full load, misc): $350–550

ASBESTOS / HAZMAT: Always test before demo on pre-1980 homes. Abatement: $2,500–8,000+ (sub it out, do not estimate without a certified report)',
true, '8171742a-b586-4f13-be61-744e191a1896', now()),

(gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'pricing_concrete',
'CONCRETE & FLATWORK — Kansas City Mid-Tier

FLATWORK (fully installed — form, pour, finish, cure):
- Concrete patio (4" unreinforced): $6.00–8.50/sf
- Concrete patio (4" with rebar): $7.50–10.00/sf
- Garage floor (4" reinforced, new): $7.00–10.00/sf
- Driveway (4", reinforced, standard): $8.00–12.00/sf
- Sidewalk (4"): $7.00–10.00/sf
- Stamped/decorative concrete: add $5–10/sf to above

FOUNDATIONS:
- Strip footing (continuous): $22–35/LF
- Poured concrete foundation wall (8"): $40–60/LF
- ICF foundation: $65–95/LF
- Basement floor (4"): $5.00–7.00/sf

STEPS & MISC:
- Concrete steps (formed, poured): $350–600 per step
- Curb & gutter: $20–35/LF
- Saw-cut existing concrete: $3.00–5.00/LF
- Core drill: $150–300 per hole
- Remove + replace flatwork: demo cost + new cost above

NOTES:
- Minimum pour: $1,500
- Cold weather (below 40°F) premium: +10–15%
- Pump truck required (hard access): +$400–700',
true, '8171742a-b586-4f13-be61-744e191a1896', now()),

(gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'pricing_framing',
'FRAMING — Kansas City Mid-Tier

ROUGH FRAMING (labor + material):
- New wall framing (2x4 stud, 16" OC): $9.00–13.00/sf of floor plan
- New wall framing (2x6, 16" OC): $11.00–15.00/sf
- Floor system (TJI engineered joists): $9.00–13.00/sf
- Floor system (dimensional lumber): $7.00–11.00/sf
- Roof framing (conventional rafter): $8.00–12.00/sf of footprint
- Roof framing (engineered trusses): $6.00–9.00/sf
- Full addition framing (walls + floor + roof): $18–28/sf of addition

STRUCTURAL:
- Engineered LVL beam (installed, per LF): $35–65/LF
- Load-bearing header (doubled 2x10, installed): $250–500 each
- Steel beam (installed, per LF): $55–90/LF
- Column/post install (wood, 4x4/6x6): $150–300 each
- Ridge beam (LVL, installed): $40–70/LF

DECKS & EXTERIOR FRAMING:
- Deck framing (PT lumber, ground-level): $12–18/sf
- Deck framing (elevated, complex): $18–28/sf
- Pergola / covered porch framing: $20–35/sf

NOTES:
- Complex roof geometry (hips, valleys, dormers): +15–25%
- Cathedral/vaulted ceiling framing: +20–30%',
true, '8171742a-b586-4f13-be61-744e191a1896', now()),

(gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'pricing_roofing',
'ROOFING — Kansas City Mid-Tier (1 square = 100 sf of roof surface)

SHINGLE ROOFING:
- Tear-off & disposal (1 layer): $80–110/sq
- Tear-off & disposal (2nd layer): add $40–60/sq
- Synthetic underlayment: $15–22/sq
- Ice & water shield (eaves/valleys): $30–45/sq
- Drip edge (aluminum): $2.50–3.75/LF
- Architectural shingles installed (30-yr, mid-grade): $290–360/sq labor only
- ALL-IN installed price (30-yr architectural, mid-grade): $420–530/sq
- ALL-IN installed price (50-yr premium, full ice barrier): $560–720/sq

FLAT / LOW-SLOPE ROOFING:
- TPO membrane (60-mil, fully adhered): $7.00–10.00/sf
- Modified bitumen (2-ply, torch-down): $5.50–8.00/sf
- EPDM rubber (fully adhered): $6.00–9.00/sf

GUTTERS & DRAINAGE:
- 5" K-style aluminum gutter (installed): $8.00–12.00/LF
- 6" K-style aluminum gutter (installed): $10–15/LF
- Leaf guard / gutter guard (installed): $6–12/LF
- Downspout (installed): $5–9/LF

ADDERS:
- Steep slope (>8:12 pitch): +20–35%
- Chimney counter-flashing (reflash): $450–750 each
- Skylight install (unit not included): $600–1,200 labor

MINIMUM: $2,500 for any roofing work',
true, '8171742a-b586-4f13-be61-744e191a1896', now()),

(gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'pricing_windows_doors',
'WINDOWS & DOORS — Kansas City Mid-Tier

WINDOWS (supply + install):
- Window installation labor only (existing opening): $150–300 each
- Window installation (new opening): $350–600 each
- Standard vinyl double-hung (supply + install, mid-grade): $400–700 each
- Casement window (supply + install): $600–950 each
- Picture / fixed window (supply + install): $400–750 each
- Bay / bow window (supply + install): $1,800–4,500 each
- Egress window (new opening, well, supply + install): $2,500–5,000

EXTERIOR DOORS (supply + install):
- Standard fiberglass entry door (prehung, painted): $900–1,500
- Premium fiberglass (glass lites, decorative): $1,500–3,500
- Steel entry door (prehung, mid-grade): $700–1,100
- French doors (exterior, prehung pair): $1,800–4,000
- Sliding glass door (vinyl, 6-ft): $1,200–2,200
- Sliding glass door (8-ft, premium): $2,500–4,500
- Garage door (16x7, steel, standard, installed): $1,200–2,000
- Garage door opener (add-on): $350–600

INTERIOR DOORS (supply + install):
- Prehung interior door (hollow core, painted): $250–400
- Prehung interior door (solid core): $350–550
- Pocket door (supply + install): $600–1,200
- Barn door (supply + install, hardware included): $700–1,500
- Bifold closet doors (pair, standard): $250–450',
true, '8171742a-b586-4f13-be61-744e191a1896', now()),

(gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'pricing_insulation',
'INSULATION — Kansas City Mid-Tier

BATT INSULATION (fiberglass or mineral wool, installed):
- R-15 (2x4 wall cavity, fiberglass): $0.85–1.20/sf of wall
- R-21 (2x6 wall cavity, fiberglass): $1.00–1.50/sf of wall
- R-21 (2x6, mineral wool / Rockwool): $1.30–1.80/sf of wall
- R-30 (floor / cathedral, fiberglass): $1.50–2.10/sf
- R-38 (attic batt): $1.60–2.30/sf

BLOWN-IN INSULATION:
- Blown-in fiberglass (attic, R-38): $1.40–2.00/sf of attic
- Blown-in fiberglass (attic, R-49): $1.80–2.60/sf
- Blown-in cellulose (attic, R-38): $1.20–1.80/sf
- Dense-pack (wall cavity, retrofit): $2.50–4.00/sf of wall

SPRAY FOAM:
- Open-cell spray foam (walls/roof deck, 3.5"): $1.80–2.60/sf
- Closed-cell spray foam (2" — vapor barrier + R-12): $2.80–3.80/sf
- Closed-cell (3" — R-18, crawl space/rim joist): $3.50–4.80/sf

RIM JOISTS & CRAWL SPACES:
- Rim joist spray foam: $1.50–2.50/LF
- Crawl space encapsulation (vapor barrier + insulation): $2.50–5.00/sf of crawl

KC CLIMATE NOTE: Zone 4–5 — R-49 attic and R-21 wall recommended for new construction',
true, '8171742a-b586-4f13-be61-744e191a1896', now()),

(gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'pricing_drywall',
'DRYWALL — Kansas City Mid-Tier

INSTALLATION (supply + hang + all finishing):
- Standard 1/2" drywall (Level 4 finish, paint-ready): $1.25–1.85/sf
- 5/8" Type X fire-rated drywall: $1.50–2.10/sf
- Moisture-resistant (bathrooms): $1.60–2.20/sf
- Level 5 finish (high-gloss/smooth wall prep): add $0.35–0.55/sf

BREAKDOWN (if bidding separately):
- Hang only (material + labor): $0.38–0.55/sf
- Tape, mud, finish (Level 4): $0.55–0.80/sf
- Primer coat (before paint): $0.20–0.35/sf

CEILINGS:
- Flat drywall ceiling (Level 4): $1.40–2.00/sf
- Coffered / tray ceiling framing + drywall: $18–35/LF of perimeter

REPAIRS & PATCHES:
- Small patch (under 12"): $150–300
- Medium patch (12"–24"): $250–500
- Large area repair (per sf): $3.00–6.00/sf
- Texture match (orange peel / knockdown): $150–400 per area

NOTES:
- Level 4 is standard for painted walls
- Level 5 required for walls receiving semi-gloss or eggshell in high-end spaces
- Garage drywall (5/8" Type X): required by code in attached garages',
true, '8171742a-b586-4f13-be61-744e191a1896', now()),

(gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'pricing_painting',
'PAINTING — Kansas City Mid-Tier

INTERIOR (labor + material, mid-grade paint):
- Walls only, prime + 2 coats (per sf of wall area): $1.60–2.60/sf
- Full room repaint (walls + ceiling + trim, per sf floor area): $2.75–4.25/sf
- New construction interior (prime + 2 coats all surfaces): $2.00–3.25/sf floor area
- Ceiling only (per sf): $0.90–1.50/sf
- Trim / baseboard per LF: $1.25–2.25/LF
- Interior door, per side: $55–95 each
- Cabinet repainting (spray, full kitchen): $1,500–3,800
- Accent wall / specialty finish: $250–600 per wall

EXTERIOR (labor + material):
- Siding only (prime + 2 coats, per sf wall area): $2.00–3.50/sf
- Full exterior (siding + trim + soffits): $3.00–5.50/sf of wall area
- Exterior door: $150–300 each (both sides)
- Deck stain / seal (per sf): $1.25–2.50/sf
- Fence stain (per LF, both sides): $2.50–4.50/LF

SPECIALTY:
- Epoxy garage floor: $3.00–6.00/sf
- Faux finish / venetian plaster: $8–20/sf
- Pressure wash + prep (before exterior): $0.15–0.35/sf

NOTES:
- Premium paint (SW Duration, BM Aura): add $0.20–0.40/sf
- High ceilings (>10 ft): add 15–20%
- Occupied home protection/masking: add 10%',
true, '8171742a-b586-4f13-be61-744e191a1896', now()),

(gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'pricing_flooring',
'FLOORING — Kansas City Mid-Tier (fully installed — material + labor + basic prep)

LUXURY VINYL PLANK (LVP):
- Builder-grade LVP (installed): $3.50–5.00/sf
- Mid-grade LVP (installed, 6–8mm): $4.50–6.50/sf
- Premium LVP (installed, 12mm, waterproof): $6.00–9.00/sf

HARDWOOD:
- Engineered hardwood (3/4", installed): $7.00–11.00/sf
- Solid hardwood (3/4", nail-down, installed): $8.50–14.00/sf
- Hardwood refinish (sand + 3 coats): $3.50–5.50/sf
- Hardwood repair / board replacement: $8–20/sf

CARPET:
- Budget carpet + pad (installed): $2.50–3.75/sf
- Mid-grade carpet + pad (installed): $3.75–5.50/sf
- Premium carpet + pad (installed): $5.50–9.00/sf

TILE (see pricing_tile for detail):
- Ceramic floor tile (installed): $6.00–9.50/sf
- Porcelain floor tile (installed): $7.50–12.00/sf
- Natural stone (marble/travertine, installed): $12.00–22.00/sf

DEMO & PREP:
- Remove existing flooring: $0.85–2.00/sf
- Self-leveling underlayment: $2.00–4.00/sf (when needed)
- Subfloor repair / sheathing replacement: $4.00–8.00/sf

TRANSITIONS & THRESHOLDS: $25–75 each',
true, '8171742a-b586-4f13-be61-744e191a1896', now()),

(gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'pricing_tile',
'TILE WORK — Kansas City Mid-Tier

SHOWER TILE (fully tiled shower, labor + material):
- Ceramic tile shower (standard subway, installed): $12–18/sf
- Porcelain tile shower (large format 12x24, installed): $16–25/sf
- Natural stone shower (marble, installed): $22–38/sf
- Shower pan (mud bed, waterproofing, floor tile): $1,200–2,800 complete
- Full walk-in shower (tiled walls + floor, ~50 sf wall): $4,500–9,000 complete
- Niche (tiled recessed shelf): $250–550 each

BATHROOM FLOOR TILE:
- Ceramic (installed): $6.50–10.00/sf
- Porcelain (installed): $8.00–13.00/sf
- Heated floor mat (electric, under tile): $9.00–14.00/sf
- Schluter/Ditra membrane: $1.50–2.50/sf (add when needed)

KITCHEN & OTHER:
- Backsplash (kitchen, standard tile, installed): $14–22/sf
- Backsplash (glass tile / specialty): $20–35/sf
- Fireplace surround tile: $1,500–4,000 depending on design

DEMO:
- Remove existing tile (floor): $2.50–4.50/sf
- Remove existing tile (wall/shower): $3.00–5.50/sf

GROUT / SEALANT:
- Grout sealing only: $150–350 per area
- Regrouting existing tile: $3.00–6.00/sf',
true, '8171742a-b586-4f13-be61-744e191a1896', now()),

(gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'pricing_cabinets_millwork',
'CABINETS & MILLWORK — Kansas City Mid-Tier

KITCHEN CABINETS (supply + install, per LF of base + upper combined):
- Stock cabinets (Home Depot/Lowe''s grade, installed): $110–180/LF
- Semi-custom cabinets (mid-grade, installed): $190–360/LF
- Custom cabinets (KC cabinet shop, installed): $380–700/LF
- Typical 10x10 kitchen (stock): $3,500–6,000
- Typical 10x10 kitchen (semi-custom): $6,000–12,000

COUNTERTOPS (supply + install, per LF of countertop):
- Laminate (Formica, installed): $28–48/LF
- Butcher block (installed): $50–90/LF
- Quartz (Silestone/Caesarstone, installed): $60–105/LF
- Granite (installed): $55–95/LF
- Marble (installed): $80–150/LF

BATHROOM VANITIES:
- Stock vanity (supply + install, 30–36"): $350–700
- Semi-custom vanity (supply + install, 48–60"): $700–1,800
- Custom vanity: $1,500–4,500

TRIM & MILLWORK (installed):
- Base trim / baseboard (painted, installed): $3.50–5.50/LF
- Crown molding (installed): $6.00–12.00/LF
- Window / door casing (installed): $3.00–5.50/LF
- Built-in bookcase / entertainment center: $150–400/LF
- Closet systems (standard, installed): $500–2,000 per closet
- Closet systems (custom, installed): $1,500–6,000 per closet',
true, '8171742a-b586-4f13-be61-744e191a1896', now()),

(gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'pricing_plumbing',
'PLUMBING — Kansas City Mid-Tier (typically subcontracted; prices are fully installed sub costs)

ROUGH-IN PLUMBING (new work):
- Single fixture rough-in (drain, supply, vent): $400–650 each
- Full new bathroom rough-in (3 fixtures): $2,000–3,500
- Kitchen rough-in (sink + DW + ice maker): $800–1,500
- Laundry rough-in (washer box + drain): $400–700
- Full house plumbing (new construction, per sf): $5.50–9.00/sf

FINISH PLUMBING:
- Toilet set (standard, labor + basic unit): $300–500
- Toilet set (elongated/comfort height): $350–600
- Vanity sink / faucet install: $250–500
- Kitchen sink / faucet install: $300–600
- Shower valve + trim (Moen/Delta): $400–700
- Tub + shower valve: $500–900
- Bathtub set (freestanding, luxury): $800–2,000 labor only

WATER HEATERS:
- 40-gal tank (natural gas, installed): $900–1,400
- 50-gal tank (natural gas, installed): $1,100–1,700
- Tankless (Rinnai/Navien, installed): $2,200–3,800
- Expansion tank (required by KC code): $200–350

REPAIRS & MISC:
- Re-pipe (per LF): $20–40/LF
- Drain / sewer scope: $150–300
- Gas line (per LF, new): $25–45/LF

NOTES: Always get sub bids on plumbing. Use above for ballpark only.',
true, '8171742a-b586-4f13-be61-744e191a1896', now()),

(gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'pricing_electrical',
'ELECTRICAL — Kansas City Mid-Tier (typically subcontracted; prices are fully installed sub costs)

SERVICE & PANELS:
- Panel upgrade (100A → 200A, includes panel + labor): $2,200–3,800
- Sub-panel (100A, new, installed): $1,200–2,200
- Service entrance repair / replace: $800–2,000
- Meter base replacement: $400–800

ROUGH-IN (new circuits):
- Standard 15/20A circuit (materials + labor): $175–275 each
- 240V appliance circuit (range, dryer): $300–550 each
- Full house rewire (per sf): $4.00–7.50/sf
- New construction wiring (per sf): $3.00–5.50/sf
- Kitchen circuit package (5–7 circuits): $1,500–3,000

DEVICES & FIXTURES:
- Standard outlet / switch install: $90–160 each
- GFCI outlet install: $110–200 each
- Recessed can light (new construction): $80–160 each
- Recessed can light (retrofit): $100–200 each
- Ceiling fan (install, includes box): $150–350 each
- Light fixture (standard, install): $100–250 each
- Chandelier (heavy, install): $250–600 each

SPECIALTY:
- EV charger (Level 2, 50A circuit + outlet, installed): $700–1,400
- Smoke / CO detectors (hardwired, installed): $90–150 each
- Whole-house generator hookup: $1,500–4,000

NOTES: Panel upgrades need utility coordination — add 1–3 weeks lead time.',
true, '8171742a-b586-4f13-be61-744e191a1896', now()),

(gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'pricing_hvac',
'HVAC — Kansas City Mid-Tier (typically subcontracted; prices are fully installed sub costs)

CENTRAL AIR (split system — furnace + AC):
- 2-ton system (furnace + AC, installed, standard efficiency): $5,000–7,500
- 3-ton system (furnace + AC, installed): $6,000–9,000
- 4-ton system (furnace + AC, installed): $7,500–11,000
- High-efficiency upgrade (96% AFUE / 18 SEER): add $800–2,000

COMPONENTS ONLY:
- Gas furnace (80% AFUE, installed): $2,200–3,800
- Gas furnace (96% AFUE, installed): $3,200–5,000
- Central AC unit only (3-ton, 14–16 SEER, installed): $3,500–5,500
- Air handler (electric, installed): $1,200–2,500
- Coil replacement only: $800–1,800

MINI-SPLITS (ductless):
- Single zone (1 head, 12K–18K BTU, installed): $2,800–4,500
- Multi-zone (2 heads, installed): $4,500–7,500
- Per additional head (after first): $1,800–3,000

DUCTWORK:
- New ductwork (new construction, per sf): $3.50–6.00/sf
- Duct replacement / renovation (per sf): $4.00–8.00/sf
- Duct sealing (Aeroseal): $1,200–2,500
- ERV / HRV installation: $2,500–4,500

MISC:
- Smart thermostat (Ecobee/Nest, supply + install): $300–600
- Humidifier (whole-house, installed): $500–1,200',
true, '8171742a-b586-4f13-be61-744e191a1896', now()),

(gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'business_structure',
'AVENSTONE BUSINESS STRUCTURE & MARKUP

MATERIAL MARKUP:
- Standard markup on all materials: 20% over our cost
- Subcontractor markup: 15% over their bid
- Equipment rental markup: 20% over cost

OVERHEAD & PROFIT:
- Overhead (insurance, office, vehicles, admin): 12% of direct job costs
- Profit target: 13–15% net
- Combined overhead + profit applied to estimates: 28–30% on top of direct costs
- Simple formula: (Labor + Materials + Subs) × 1.30 = Estimate Base

EXAMPLE:
- Direct costs: $50,000
- Overhead (12%): $6,000
- Profit (15%): $7,500
- Client price: ~$63,500–65,000

PROJECT SIZE GUIDANCE:
- Minimum project: $5,000
- Small renovation (bathroom, small addition): $15,000–60,000
- Mid-size renovation (kitchen, master suite, full floor): $60,000–150,000
- Full gut renovation: $80,000–250,000
- Residential addition: $90,000–300,000 depending on size
- Light commercial TI: $50–150/sf installed

CONTINGENCY:
- Remodel / renovation: always add 10% contingency line item
- New construction: 5% contingency
- Historic / older home (pre-1970): 15% contingency
- Contingency is for the client''s protection — unused contingency is returned',
true, '8171742a-b586-4f13-be61-744e191a1896', now()),

(gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'draw_schedule',
'DRAW SCHEDULE — Avenstone Standard

STANDARD RESIDENTIAL DRAW SCHEDULE:
1. Contract signing: 10% of contract value
2. Demo / mobilization complete: 15%
3. Rough framing complete: 20%
4. Rough MEP (electrical, plumbing, HVAC) complete + inspections passed: 20%
5. Drywall / sheathing complete: 15%
6. Finishes (paint, flooring, cabinets) complete: 15%
7. Substantial completion / punch list issued: 5%

SMALL PROJECT (under $30,000) — SIMPLIFIED:
1. Contract signing: 25%
2. 50% complete: 50%
3. Completion: 25%

LARGE PROJECT (over $200,000):
- Monthly progress billings based on % complete, certified by PM
- Retainage: 10% held until final completion + all inspections passed

PAYMENT TERMS:
- Draw invoices due Net 7 from invoice date
- Late payments (over 14 days): work pauses, 1.5%/month interest accrues
- Returned checks: $50 fee + immediate cash-equivalent required
- Preferred payment: ACH transfer, check, or credit card (3% fee for card)

FINAL PAYMENT:
- Final draw released when: punch list complete + all permits closed + client sign-off',
true, '8171742a-b586-4f13-be61-744e191a1896', now()),

(gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'change_order_policy',
'CHANGE ORDER POLICY — Avenstone

MARKUP ON CHANGE ORDERS:
- Standard CO markup: 15% on all labor and materials
- Minimum CO charge: $300
- Emergency / expedited CO (same-day execution): 20% markup

PROCESS:
1. Client or PM identifies scope change
2. PM prepares written CO within 24–48 hours
3. CO includes: description, reason, itemized cost, schedule impact, new total
4. Client signs CO (digital signature via app) before ANY work begins
5. No verbal approvals — written only, no exceptions

SCHEDULE IMPACT:
- Any CO affecting critical path must state revised completion date
- COs that add more than 5% of contract value trigger a schedule review

WHAT TRIGGERS A CO:
- Client requests any change to approved scope
- Hidden conditions discovered (rot, plumbing issues, asbestos, structural)
- Code upgrade required beyond original scope
- Material substitution at client request
- Access issues causing delay or added cost

CREDITS:
- Scope reductions issued as credits using same 15% markup deduction
- Credits never exceed the original line item value',
true, '8171742a-b586-4f13-be61-744e191a1896', now()),

(gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'estimating_guidelines',
'ESTIMATING GUIDELINES — How Avenstone Builds Estimates

GENERAL APPROACH:
1. Use mid-range pricing from the pricing_* knowledge entries as your base
2. Apply overhead + profit: multiply subtotal by 1.30
3. Add contingency line item (10% remodel, 5% new construction)
4. Round to nearest $500 for clean presentation
5. Always provide a range (±10%) rather than a single number for preliminary estimates

SCOPE CLARITY:
- If scope is unclear: use the HIGHER end of price ranges
- If scope is detailed and confirmed: use mid-range
- Never give a single number without stating assumptions

WHAT TO INCLUDE IN EVERY ESTIMATE:
- Demo and haul-away
- Permits (estimate $400–1,500 if not known)
- Final clean
- Contingency line item (labeled as such)
- Overhead + profit (can be labeled "General Conditions + Margin")

PRELIMINARY vs. FINAL ESTIMATE:
- Preliminary: range estimate from conversation. 10–15% accuracy.
- Detailed estimate: line-item after site visit. 5–8% accuracy.
- Contract price: fixed after drawings or detailed scope agreement.

PRESENTATION:
- Group by phase/trade: Demo → Framing → MEP rough → Insulation → Drywall → Paint → Flooring → Cabinets → Finishes → Exterior → Contingency
- Always show subtotal before and after contingency + margin
- Show projected start date and completion range',
true, '8171742a-b586-4f13-be61-744e191a1896', now()),

(gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'client_communication',
'CLIENT COMMUNICATION GUIDELINES — Avenstone AI

TONE:
- Professional but warm and approachable
- Explain the "why" behind costs and decisions
- Never be dismissive of budget concerns — acknowledge and redirect to value
- Be direct and honest, never oversell or overpromise

WHAT THE AI SHOULD ALWAYS DO:
- Confirm action items in writing after conversations
- Proactively flag timeline risks before they happen
- Translate construction jargon into plain language
- Suggest the best option first, then show alternatives with tradeoffs

WHAT THE AI SHOULD NEVER DO:
- Give a firm price without a PM or owner reviewing it first
- Promise a completion date without PM confirmation
- Say a competitor is better or worse
- Make commitments about warranty beyond 1 year workmanship
- Reveal subcontractor pricing or our markup structure to clients

HANDLING DIFFICULT SITUATIONS:
- Budget pushback: "Let me show you where the cost comes from and what options we have to value-engineer without sacrificing the critical items."
- Delay questions: "I want to give you accurate information — let me get the latest schedule from the PM and follow up with specifics."
- Scope creep: "That sounds like a great idea — let me document that as a change order so we can price it properly and keep the project on track."

AVENSTONE BRAND VOICE:
- We are the expert guide, not a sales pitch
- We make complex projects feel manageable
- We communicate proactively — clients should never have to chase us for updates',
true, '8171742a-b586-4f13-be61-744e191a1896', now());

RAISE NOTICE 'ai_knowledge seeded: % rows inserted', (SELECT COUNT(*) FROM ai_knowledge WHERE tenant_id = ''00000000-0000-0000-0000-000000000001'');

END $$;
