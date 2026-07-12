// CONFIGURATOR_POLISH Phase 1b — pre-send price sanity guard. Pure, no I/O.
// Flags client-facing proposal lines that are almost certainly mispriced so a human decides
// BEFORE the PDF reaches a client (a $3 mud-bed float must never ship silently). This is a
// GUARD, not an auto-correct — the human acknowledges or fixes.
//
// Bounds (stated):
//   ABSOLUTE FLOOR — a line whose client price is > $0 but < $10 is flagged. Real client-facing
//     scope lines are effectively never under $10; a sub-$10 line is a unit/float/allowance slip.
//   RATE-BOOK OUTLIER — where a vetted rate_book_labor range exists for the line's (trade, unit),
//     a unit_cost above 5× the book high OR below 0.2× the book low is flagged. Fires ONLY when a
//     book range matches; AI line-item trades that don't map to a canonical rate-book trade are
//     left unflagged by this rule (the absolute floor still applies to them).

export const SANITY = { MIN_LINE_PRICE: 10, OUTLIER_HI: 5, OUTLIER_LO: 0.2 };

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const f$ = (n) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// (trade|unit) → { lo, hi } envelope from rate_book_labor rows (min rate_low, max rate_high).
export function buildRateEnvelope(bookRows) {
  const env = new Map();
  for (const r of (bookRows || [])) {
    if (r.rate_low == null && r.rate_high == null) continue;
    const k = `${norm(r.trade)}|${norm(r.unit)}`;
    const e = env.get(k) || { lo: Infinity, hi: -Infinity };
    if (r.rate_low != null) e.lo = Math.min(e.lo, Number(r.rate_low));
    if (r.rate_high != null) e.hi = Math.max(e.hi, Number(r.rate_high));
    env.set(k, e);
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
      const e = env.get(`${norm(li.trade)}|${norm(li.unit)}`);
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
