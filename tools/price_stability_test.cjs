// PRICE STABILITY harness — the same scope of work should price to (near-)identical totals every
// run. Sends ONE fixed confirmed-scope payload to the live ai-estimator N times and measures the
// spread of the priced subtotal (sum of deterministic line amounts). The rates are deterministic
// (rate book × qty); any spread is the LLM drifting on which lines/quantities it emits for identical
// input. Goal: spread stays small. Usage: node tools/price_stability_test.cjs [N]  (default 6)
const FN = 'https://cbfftukmhqvvjlrlnltk.supabase.co/functions/v1/ai-estimator';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQ2ODgsImV4cCI6MjA5MTE5MDY4OH0.isj52drLT3pj7BF94Wa9w_y_f8U1M3W5AcgWsRaTwBQ';
const AV_TENANT = '00000000-0000-0000-0000-000000000001';
const PRICING_TRIGGER = 'All scope questions answered — generate the full priced estimate now.';

// A fixed, fully-confirmed bathroom scope (mirrors the configurator handoff: a free-text prompt +
// a "Scope captured" summary of the confirmed answers). Identical every run — the whole point.
const PROMPT = `Generate a detailed estimate for the following project:

Job Address: 999 Cost Plus Sandbox — DO NOT BILL
Scope of Work: Full bathroom remodel. Tear out the existing walk-in tub and install a new tiled shower in that space. Tile the shower walls floor to ceiling. New tile floor. New single vanity with a stone top. New toilet. Paint the walls and trim.
Rooms: Bathroom
Square Footage: 49 sqft
`;
const SCOPE_SUMMARY = `Scope captured:
- floor sf: 49
- wall height in: 96
- project type: bathroom
- existing tub shower: tub
- new fixture: walk in shower
- shower wall finish: tile
- shower tile height: to ceiling
- floor finish: tile
- vanity: single
- countertop: stone
- toilet: replace
- paint: walls and trim`;

const PAYLOAD = {
  messages: [
    { role: 'user', content: PROMPT },
    { role: 'assistant', content: SCOPE_SUMMARY },
    { role: 'user', content: PRICING_TRIGGER },
  ],
  tenant_id: AV_TENANT,
  project_sf: 49,
  finish_tier: 'mid',
  markup_pct: 30,   // fixed so markup is constant across runs — isolate the LLM line variance
  pm_fee: 1200,
  financial_model: 'fixed_bid',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function priceOnce(attempt = 1) {
  const res = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}` },
    body: JSON.stringify(PAYLOAD),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = null; }
  // Retry transient overload/rate-limit (Anthropic 529 / 429) up to 3x with backoff.
  const overloaded = res.status === 429 || res.status === 529 || /overload|rate.?limit|529|429/i.test(text);
  if ((!res.ok || !data?.priced_scope) && overloaded && attempt < 4) {
    await sleep(3000 * attempt);
    return priceOnce(attempt + 1);
  }
  if (!res.ok || !data) return { ok: false, err: `HTTP ${res.status}: ${text.slice(0, 160)}` };
  if (data.error) return { ok: false, err: data.error };
  if (!Array.isArray(data.priced_scope)) return { ok: false, err: `no priced_scope (parse_error=${data.parse_error})` };
  const lines = data.priced_scope.filter(l => !l.outside_scope);
  const subtotal = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const priced = lines.filter(l => Number(l.amount) > 0).length;
  const gaps = lines.filter(l => l.amount == null).length; // regional-avg/TBD asks
  return { ok: true, subtotal: Math.round(subtotal), lineCount: lines.length, priced, gaps };
}

(async () => {
  const N = Number(process.argv[2]) || 6;
  console.log(`Price-stability: ${N} runs of one fixed bathroom scope against the live estimator.\n`);
  const runs = [];
  for (let i = 0; i < N; i++) {
    process.stdout.write(`run ${i + 1}/${N} … `);
    const r = await priceOnce();
    if (r.ok) { runs.push(r); console.log(`subtotal $${r.subtotal.toLocaleString()} | ${r.lineCount} lines (${r.priced} priced, ${r.gaps} gaps)`); }
    else console.log(`FAILED — ${r.err}`);
    await sleep(1200);
  }
  const ok = runs.map(r => r.subtotal);
  if (ok.length < 2) { console.log(`\nNot enough successful runs (${ok.length}) to measure spread — likely API overload. Re-run later.`); process.exit(ok.length ? 0 : 1); }
  const mean = ok.reduce((a, b) => a + b, 0) / ok.length;
  const min = Math.min(...ok), max = Math.max(...ok);
  const spreadPct = mean > 0 ? (max - min) / mean * 100 : 0;
  const stdev = Math.sqrt(ok.reduce((s, v) => s + (v - mean) ** 2, 0) / ok.length);
  const lineCounts = [...new Set(runs.map(r => r.lineCount))];
  const THRESH = 8;
  console.log(`\n── RESULT (${ok.length}/${N} succeeded) ──`);
  console.log(`subtotals : ${ok.map(v => '$' + v.toLocaleString()).join('  ')}`);
  console.log(`mean $${Math.round(mean).toLocaleString()} | min $${min.toLocaleString()} | max $${max.toLocaleString()} | stdev $${Math.round(stdev).toLocaleString()}`);
  console.log(`spread    : ${spreadPct.toFixed(1)}%  (max−min over mean)`);
  console.log(`line count: ${lineCounts.join(', ')} ${lineCounts.length > 1 ? '← VARIES (LLM added/dropped lines)' : '(stable)'}`);
  console.log(`\n${spreadPct <= THRESH && lineCounts.length === 1 ? `PASS — stable within ${THRESH}%` : `FAIL — drastic variance (>${THRESH}% or line count drift). Same scope, different prices.`}`);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
