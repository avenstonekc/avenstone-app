// ─── Project Intake Questions ─────────────────────────────────────────────────
export const IQ = [
  { id: 'basics', lb: 'Project Basics', ic: 'clip', qs: [
    { id: 'address', lb: 'Property address', t: 'text', ph: '1206 W Lucy Webb Rd, Raymore MO 64083', why: 'Permit research and jurisdiction', req: true },
    { id: 'scope_type', lb: 'Scope type', t: 'sel', opts: ['Full gut (down to studs)', 'Partial gut', 'Cosmetic only', 'Fire/water damage restore'], why: 'Determines demo and rough-in quantities', req: true },
    { id: 'project_type', lb: 'Project type', t: 'sel', opts: ['Flip for resale', 'Long-term rental', 'Pre-listing (seller-funded)', 'Primary residence'], why: 'Calibrates spec level' },
    { id: 'arv', lb: 'Target ARV', t: 'text', ph: '$350,000', why: 'Material grade decisions' },
    { id: 'year_built', lb: 'Year built', t: 'text', ph: 'e.g. 1987', why: 'Pre-2000 triggers hazmat test protocol' },
    { id: 'total_sqft', lb: 'Total sqft', t: 'text', ph: 'e.g. 1879', why: 'Base for all quantity calculations', req: true },
    { id: 'living_sqft', lb: 'Living area sqft', t: 'text', ph: 'e.g. 1744', why: 'Flooring, paint, drywall quantities' },
    { id: 'floors', lb: 'Above-grade floors', t: 'sel', opts: ['1', '2', '3', 'Split level'], why: 'Framing and HVAC zoning' },
  ]},
  { id: 'foundation', lb: 'Foundation', ic: 'home', qs: [
    { id: 'foundation_type', lb: 'Foundation type', t: 'sel', opts: ['Slab on grade', 'Full basement — finished', 'Full basement — unfinished', 'Crawlspace', 'Walkout basement', 'Partial basement + crawl'], why: 'Critical — drives plumbing, insulation, vapor barrier scope', req: true },
    { id: 'basement_sqft', lb: 'Basement sqft (if applicable)', t: 'text', ph: '800 sqft or N/A' },
    { id: 'ceiling_height', lb: 'Standard ceiling height', t: 'sel', opts: ['8 ft', '9 ft', '10 ft', 'Mixed'] },
    { id: 'vaulted', lb: 'Vaulted ceilings — which rooms?', t: 'mc', opts: ['None', 'Living Room', 'Dining Room', 'Master Bedroom', 'Kitchen', 'Other'] },
    { id: 'tray_ceilings', lb: 'Tray ceilings — which rooms?', t: 'mc', opts: ['None', 'Living Room', 'Dining Room', 'Master Bedroom', 'Bedroom 2', 'Other'] },
  ]},
  { id: 'rooms', lb: 'Rooms and Baths', ic: 'grid', qs: [
    { id: 'room_list', lb: 'Room list with sqft', t: 'ta', ph: 'Living Room: 298 sqft\nDining Room: 162 sqft\nKitchen: 222 sqft\nMaster Bedroom: 181 sqft\nBath 1 (master): 56 sqft\nBath 2: 52 sqft\nGarage: 378 sqft', why: 'Combined with floor plan for precise quantities', req: true },
    { id: 'bedroom_count', lb: 'Bedroom count', t: 'sel', opts: ['1', '2', '3', '4', '5', '6+'], req: true },
    { id: 'full_bath_count', lb: 'Full bath count', t: 'sel', opts: ['1', '2', '3', '4', '5+'], req: true },
    { id: 'bath_details', lb: 'Describe each full bath', t: 'ta', ph: 'Bath 1 (master, 56 sqft): walk-in shower, no tub, double vanity, tile floor\nBath 2 (52 sqft): tub/shower combo, single vanity, tile floor' },
    { id: 'garage_type', lb: 'Garage type', t: 'sel', opts: ['Attached — 1 car', 'Attached — 2 car', 'Attached — 3 car', 'Detached — 1 car', 'Detached — 2 car', 'No garage'] },
    { id: 'laundry_location', lb: 'Laundry location', t: 'sel', opts: ['Inside main living area', 'Garage', 'Basement', 'Closet (stackable)', 'None'] },
  ]},
  { id: 'flooring', lb: 'Flooring', ic: 'grid', qs: [
    { id: 'lvp_rooms', lb: 'LVP rooms', t: 'mc', opts: ['Living Room', 'Dining Room', 'Kitchen', 'Master Bedroom', 'Bedroom 2', 'Bedroom 3', 'Hallway', 'Laundry', 'Basement', 'All non-tile areas'], req: true },
    { id: 'lvp_spec', lb: 'LVP spec level', t: 'sel', opts: ['Budget ($1.50-$2.50/sqft)', 'Mid ($2.50-$4.00/sqft)', 'Premium ($4.00+/sqft)'] },
    { id: 'tile_rooms', lb: 'Tile rooms', t: 'mc', opts: ['Bath 1', 'Bath 2', 'Bath 3', 'Kitchen', 'Laundry', 'Entry', 'None'], req: true },
    { id: 'subfloor_condition', lb: 'Subfloor condition', t: 'sel', opts: ['Good', 'Needs patching', 'Significant damage', 'Unknown', 'Full replacement needed'] },
  ]},
  { id: 'mep', lb: 'MEP', ic: 'box', qs: [
    { id: 'electrical_scope', lb: 'Electrical scope', t: 'sel', opts: ['Full rewire', 'Partial', 'No change', 'Unknown'], req: true },
    { id: 'plumbing_scope', lb: 'Plumbing scope', t: 'sel', opts: ['Full PEX repipe', 'Partial', 'No change', 'Unknown'], req: true },
    { id: 'hvac_scope', lb: 'HVAC scope', t: 'sel', opts: ['Full replacement', 'Air handler only', 'Condenser only', 'Furnace only', 'No change'], req: true },
    { id: 'water_heater', lb: 'Water heater', t: 'sel', opts: ['Yes — electric tank', 'Yes — gas tank', 'Yes — tankless gas', 'Yes — tankless electric', 'No change'] },
  ]},
  { id: 'finishes', lb: 'Finishes', ic: 'edit', qs: [
    { id: 'trim_profile', lb: 'Trim profile', t: 'sel', opts: ['Basic colonial 2.5"', 'Craftsman flat 3.5"', 'Craftsman flat 4"', 'Custom'] },
    { id: 'hardware_finish', lb: 'Hardware finish', t: 'sel', opts: ['Satin nickel', 'Matte black', 'Oil-rubbed bronze', 'Polished chrome', 'Brushed gold'] },
    { id: 'ceiling_fans', lb: 'Ceiling fans — which rooms', t: 'mc', opts: ['Living Room', 'Master Bedroom', 'Bedroom 2', 'Bedroom 3', 'Dining Room', 'All Bedrooms'] },
    { id: 'cabinets_scope', lb: 'Cabinets in scope', t: 'sel', opts: ['No — excluded', 'Yes — stock', 'Yes — semi-custom', 'Yes — custom'] },
  ]},
  { id: 'flags', lb: 'Scope Flags', ic: 'warn', qs: [
    { id: 'known_damage', lb: 'Known damage beyond visible scope', t: 'ta', ph: 'e.g. Water damage in master closet, rot at rear base plate' },
    { id: 'exclusions', lb: 'Explicitly excluded', t: 'ta', ph: 'e.g. Cabinets excluded, HVAC by sub' },
    { id: 'notes', lb: 'Anything else I should know', t: 'ta', ph: 'Open field — catch-all before generating material list' },
  ]},
];

// ─── Bid Questions ────────────────────────────────────────────────────────────
export const BQ = [
  { id: 'proj', lb: 'Project Info', ic: 'info', qs: [
    { id: 'linked_job_id', lb: 'Link to existing job', t: 'jp', why: 'Auto-updates contract value when bid is submitted' },
    { id: 'bid_type', lb: 'Bid type', t: 'sel', opts: ['Pre-listing renovation', 'Insurance claim / restoration', 'Water mitigation / drying', 'Full gut rehab / flip', 'General contracting'], req: true },
    { id: 'property_address', lb: 'Property address', t: 'text', ph: '1206 W Lucy Webb Rd, Raymore MO 64083', req: true },
    { id: 'client_name', lb: 'Client name', t: 'text', ph: 'John and Jane Smith' },
    { id: 'client_type', lb: 'Client type', t: 'sel', opts: ['Homeowner / seller', 'Real estate agent', 'Insurance adjuster', 'Property investor / flipper', 'Property manager'] },
    { id: 'bid_date', lb: 'Bid date', t: 'text', ph: 'April 7, 2026' },
    { id: 'bid_sequence', lb: 'Bid number', t: 'text', ph: 'e.g. 047 — becomes AV-2026-047' },
    { id: 'project_description', lb: 'Project description', t: 'ta', ph: 'Fire-damaged single family home, complete gut rehab. 1878 sqft, 3/3, 1-story. Raymore MO.' },
  ]},
  { id: 'scope', lb: 'Scope of Work', ic: 'clip', qs: [
    { id: 'trades', lb: 'Trades in scope', t: 'mc', opts: ['Demo', 'Framing', 'Insulation', 'Drywall', 'Paint', 'LVP Flooring', 'Tile Flooring', 'Trim / Millwork', 'Doors and Hardware', 'Windows', 'Electrical', 'Plumbing', 'HVAC', 'Bathroom Fixtures', 'Kitchen', 'Roofing', 'Siding / Exterior', 'Garage', 'Water Mitigation', 'Mold Remediation'], req: true },
    { id: 'scope_notes', lb: 'Scope notes per trade', t: 'ta', ph: 'Electrical: full rewire, 200A panel\nPlumbing: full PEX repipe\nRoofing: full tear-off, OSB deck replacement', req: true },
    { id: 'exclusions', lb: 'Excluded', t: 'ta', ph: 'Cabinets excluded\nHVAC by sub' },
  ]},
  { id: 'pricing', lb: 'Pricing', ic: 'doc', qs: [
    { id: 'pricing_method', lb: 'Pricing method', t: 'sel', opts: ['Full line item breakdown', 'Trade subtotals only', 'Lump sum per trade', 'Xactimate / insurance', 'T and M'], req: true },
    { id: 'line_items', lb: 'Line items by trade', t: 'ta', ph: 'DEMO\n- Dumpster x3 @ $450 = $1,350\n\nELECTRICAL\n- Full rewire = $8,500\n- Panel upgrade 200A = $1,800', req: true },
    { id: 'contingency', lb: 'Contingency', t: 'sel', opts: ['None', '5%', '10%', '15%'] },
    { id: 'arv', lb: 'ARV / value add', t: 'text', ph: 'ARV: $350,000 / Value add: $80,000 or N/A' },
  ]},
  { id: 'timeline', lb: 'Timeline', ic: 'clip', qs: [
    { id: 'start_date', lb: 'Start date', t: 'text', ph: 'May 1, 2026', req: true },
    { id: 'duration', lb: 'Duration', t: 'text', ph: '10-12 weeks', req: true },
    { id: 'phases', lb: 'Phases and milestones', t: 'ta', ph: 'Week 1-2: Demo\nWeek 2-4: Framing, rough MEP\nWeek 4-6: Drywall\nWeek 6-9: Flooring, trim, paint\nWeek 9-11: Fixtures\nWeek 11-12: Punch list' },
  ]},
  { id: 'terms', lb: 'Terms', ic: 'doc', qs: [
    { id: 'payment_terms', lb: 'Payment terms', t: 'sel', opts: ['Pre-listing — collected at closing', 'Standard — 50% / 40% / 10%', 'Insurance — ACV now, RCV at completion', 'Custom', 'T and M weekly'], req: true },
    { id: 'bid_expiry', lb: 'Bid expiration', t: 'sel', opts: ['30 days', '15 days', '60 days', 'No expiration'] },
    { id: 'rep_notes', lb: 'Rep notes', t: 'ta', ph: 'Client is price-sensitive. Agent is referral. Anything job-specific.' },
  ]},
];

// ─── Validation rules ─────────────────────────────────────────────────────────
export const IR = [
  { f: a => !a.address, m: 'Property address required' },
  { f: a => !a.scope_type, m: 'Scope type required' },
  { f: a => !a.total_sqft, m: 'Total sqft required' },
  { f: a => !a.foundation_type, m: 'Foundation type required' },
];
export const BR = [
  { f: a => !a.bid_type, m: 'Bid type required' },
  { f: a => !a.property_address, m: 'Property address required' },
  { f: a => !a.trades || !a.trades.length, m: 'Select at least one trade' },
  { f: a => !a.line_items, m: 'Line items required' },
];
