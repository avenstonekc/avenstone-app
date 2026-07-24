// CONSULTATION_RECAP_QUALITY Item 2 — speech vocabulary biasing.
// Fed to the on-device recognizer as SFSpeechRecognizer.contextualStrings so trade jargon
// transcribes correctly (a walk full of "niche / shower pan / curbless / GFCI / backer board"
// otherwise comes back garbled). Config lives HERE, not inline in the capture controller — the
// owner can extend it without touching capture code. The trade names double as the trade_taxonomy
// parent labels; the tenant hot-word prefix ("Avenstone") is appended by buildContextualStrings.
export const CONSTRUCTION_VOCAB = [
  // Trades (trade_taxonomy parents)
  'Framing', 'Drywall', 'Plumbing', 'Electrical', 'HVAC', 'Tile', 'Flooring', 'Cabinets',
  'Countertops', 'Roofing', 'Siding', 'Concrete', 'Masonry', 'Painting', 'Insulation', 'Trim',
  'Carpentry', 'Demolition', 'Foundations', 'Gutters', 'Waterproofing',
  // Bathroom
  'niche', 'shower niche', 'shower pan', 'curb', 'curbless', 'zero-entry', 'walk-in tub',
  'walk-in shower', 'tub-shower combo', 'freestanding tub', 'vanity', 'double vanity',
  'backer board', 'cement board', 'linear drain', 'shower bench', 'wet wall', 'access panel',
  'comfort height', 'wall-hung toilet', 'exhaust fan', 'shower valve', 'rain head',
  // Kitchen
  'backsplash', 'island', 'peninsula', 'soffit', 'range hood', 'farmhouse sink', 'undermount sink',
  'shaker', 'quartz', 'butcher block',
  // General trade terms
  'subfloor', 'joist', 'stud', 'GFCI', 'egress', 'sump pump', 'vapor barrier', 'LVP',
  'luxury vinyl plank', 'shiplap', 'wainscot', 'laminate', 'load-bearing', 'rough-in',
  'punch list', 'change order', 'ledger', 'flashing', 'soffit vent', 'ridge vent',
];

// Full contextual-strings list for a session: construction vocab + the tenant hot-word(s)
// (so "Avenstone"/"Aven" and their command combos bias correctly for the spoken commands).
// Accepts a single prefix string or an array of accepted wake words (FIX 2 — long + short forms).
export function buildContextualStrings(prefixes) {
  const list = CONSTRUCTION_VOCAB.slice();
  const words = Array.isArray(prefixes) ? prefixes : [prefixes];
  for (const raw of words) {
    const p = String(raw || '').trim();
    if (p) list.push(p, `${p} caption`, `${p} measure`, `${p} what am I missing`);
  }
  return list;
}
