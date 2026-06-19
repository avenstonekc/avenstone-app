/**
 * computeEstimateDeviation
 *
 * Checks each estimate line item against vetted rate_book_labor baselines.
 * Caller reads pricing_policy ONCE and passes { up_pct, down_pct } — no
 * per-line re-reads. ONE batch query, not per-line.
 *
 * Gate logic:
 *   No vetted row match (trade|description|unit)  → GATED  'gap_no_baseline'
 *   unit_cost > baseline * (1 + up_pct/100)        → FREE   (upsell encouraged)
 *   unit_cost < baseline * (1 - down_pct/100)      → GATED  'below_down_band'
 *   else                                            → FREE
 *
 * Manager branch lives in the CALLER (sendEstimateToClient) — if isManager,
 * skip calling this entirely. Helper is pure compute; throws on query error.
 *
 * @param {object} sb         Supabase client
 * @param {string} tenantId
 * @param {Array}  lineItems  estimate_line_items rows (trade, description, unit, unit_cost)
 * @param {{up_pct:number, down_pct:number}} policy
 * @returns {{ gated:boolean, gatedLines:Array, checkedCount:number }}
 */
export async function computeEstimateDeviation(sb, tenantId, lineItems, policy) {
  const { up_pct, down_pct } = policy;

  const { data, error } = await sb
    .from('rate_book_labor')
    .select('trade,line_item,unit,rate_low,rate_high')
    .eq('tenant_id', tenantId)
    .eq('vetted', true)
    .eq('active', true);

  if (error) throw new Error(`rate_book_labor fetch failed: ${error.message}`);

  const vettedMap = new Map();
  for (const row of (data || [])) {
    vettedMap.set(`${row.trade}|${row.line_item}|${row.unit}`, row);
  }

  const gatedLines = [];
  let gated = false;

  for (const line of lineItems) {
    const key = `${line.trade}|${line.description}|${line.unit}`;
    const row = vettedMap.get(key);

    if (!row) {
      gated = true;
      gatedLines.push({
        trade: line.trade,
        line_item: line.description,
        unit: line.unit,
        unit_cost: Number(line.unit_cost),
        baseline: null,
        reason: 'gap_no_baseline',
      });
      continue;
    }

    const baseline = Number(row.rate_high ?? row.rate_low);
    const unit_cost = Number(line.unit_cost);
    const upBound   = baseline * (1 + up_pct / 100);
    const downBound = baseline * (1 - down_pct / 100);

    if (unit_cost < downBound) {
      gated = true;
      gatedLines.push({
        trade: line.trade,
        line_item: line.description,
        unit: line.unit,
        unit_cost,
        baseline,
        reason: 'below_down_band',
      });
    }
    // unit_cost > upBound → FREE (upsell; vetted rate is floor)
    // else → FREE (within band)
  }

  return { gated, gatedLines, checkedCount: lineItems.length };
}
