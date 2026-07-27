// CONFIGURATOR_POLISH Phase 1b — pre-send price sanity guard. Pure, no I/O.
// Flags client-facing proposal lines that are almost certainly mispriced so a human decides
// BEFORE the PDF reaches a client (a $3 mud-bed float must never ship silently). This is a
// GUARD, not an auto-correct — the human acknowledges or fixes.
//
// Bounds (stated):
//   ABSOLUTE FLOOR — a line whose client price is > $0 but < $10 is flagged. Real client-facing
//     scope lines are effectively never under $10; a sub-$10 line is a unit/float/allowance slip.
//   RATE OUTLIER — where an envelope exists for the line's (category, trade, unit), a unit_cost
//     above 5× the envelope high OR below 0.2× the envelope low is flagged. Fires ONLY when an
//     envelope matches; trades with no envelope are left unflagged (never invent a reference —
//     locked principle #3). The absolute floor still applies to them.
//
// T2#5: the envelope is now built from takeoff_unit_costs (the authority table the engine reads),
// NOT rate_book_labor (retired to the legacy LLM branch in Slice 1). takeoff_unit_costs carries a
// single base_rate per row, not a lo/hi range — see buildRateEnvelope for how lo/hi is derived.

export const SANITY = { MIN_LINE_PRICE: 10, OUTLIER_HI: 5, OUTLIER_LO: 0.2, DRAFT_SHARE: 0.25 };

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const f$ = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Precedence rank — mirrors pricingCore.js buildCostMaps (do not invent a third copy of the rule):
//   tenant+room(3) > tenant+all(2) > platform+room(1) > platform+all(0)
const rankOf = (r) => (r.tenant_id != null ? 2 : 0) + (r.room_type != null ? 1 : 0);

// (category|trade|unit) → { lo, hi } envelope from takeoff_unit_costs rows.
// takeoff_unit_costs has a single base_rate, not a range, so lo/hi come from the DISTRIBUTION of
// effective rates across room contexts: for each room_type present, resolve the winning rate with
// the engine's precedence rank (tenant beats platform; room-specific beats all-rooms), then
// lo = min / hi = max over those room contexts. So a single all-rooms tenant rate collapses the
// band to one point (the engine uses it everywhere); genuinely room-varying platform defaults
// (e.g. Plumbing rough-in $525 bath / $1150 kitchen) widen the band to [525, 1150].
// Category is part of the key so a trade's labor rate and material rate on the same unit never mix.
export function buildRateEnvelope(rows) {
  const byKey = new Map();
  for (const r of (rows || [])) {
    if (r.base_rate == null) continue;
    const k = `${norm(r.category)}|${norm(r.trade)}|${norm(r.unit)}`;
    (byKey.get(k) || byKey.set(k, []).get(k)).push(r);
  }
  const env = new Map();
  for (const [k, group] of byKey) {
    // Best-rank base_rate applicable to a given room context (room-specific rows for rt + all-rooms rows).
    const pick = (rt) => {
      let best = null, bestRank = -1;
      for (const c of group) {
        if (c.room_type != null && c.room_type !== rt) continue; // not applicable to this context
        const rk = rankOf(c);
        if (rk > bestRank) { best = c; bestRank = rk; }
      }
      return best ? Number(best.base_rate) : null;
    };
    const roomTypes = [...new Set(group.filter(r => r.room_type != null).map(r => r.room_type))];
    const rates = (roomTypes.length ? roomTypes.map(pick) : [pick(null)]).filter(v => v != null);
    if (rates.length) env.set(k, { lo: Math.min(...rates), hi: Math.max(...rates) });
  }
  return env;
}

// Returns [{ idx, id, description, price, reasons:[string] }] for every flagged line.
// clientPriceFn(li) → the client-facing price of a line (markup applied), same fn the PDF uses.
// envelope: a Map from buildRateEnvelope, or raw rate_book_labor rows (built internally).
export function computeSanityFlags(lineItems, clientPriceFn, envelope) {
  const env = envelope instanceof Map ? envelope : buildRateEnvelope(envelope);
  const out = [];
  (lineItems || []).forEach((li, idx) => {
    const reasons = [];
    const price = Number(clientPriceFn(li) || 0);
    if (price > 0 && price < SANITY.MIN_LINE_PRICE) {
      reasons.push(`Line total ${f$(price)} is under ${f$(SANITY.MIN_LINE_PRICE)} — likely a mispriced float/unit slip`);
    }
    const uc = Number(li.unit_cost ?? 0);
    if (uc > 0) {
      const e = env.get(`${norm(li.category)}|${norm(li.trade)}|${norm(li.unit)}`);
      if (e && e.lo !== Infinity && e.hi !== -Infinity) {
        if (uc > SANITY.OUTLIER_HI * e.hi) {
          reasons.push(`Unit rate ${f$(uc)}/${li.unit || 'unit'} is over ${SANITY.OUTLIER_HI}× the rate-book high (${f$(e.hi)}) for ${li.trade}`);
        } else if (uc < SANITY.OUTLIER_LO * e.lo) {
          reasons.push(`Unit rate ${f$(uc)}/${li.unit || 'unit'} is under ${SANITY.OUTLIER_LO}× the rate-book low (${f$(e.lo)}) for ${li.trade}`);
        }
      }
    }
    if (reasons.length) out.push({ idx, id: li.id, description: li.description, price, reasons });
  });
  return out;
}
