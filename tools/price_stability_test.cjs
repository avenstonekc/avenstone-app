// PRICE STABILITY harness — same scope, N runs, measure spread and deep-equality.
//
// DEFAULT (price_plan mode — PRICE_DETERMINISM P5):
//   Seeds 34 confirmed bathroom answers to DB, calls mode:'price_plan' N times.
//   Expected: spread = $0.00, all runs deep-equal on full line sets.
//   Usage: node tools/price_stability_test.cjs [N]
//
// LEGACY mode (old LLM messages path — historical reference):
//   Sends a fixed free-text messages payload to the old no-mode branch.
//   Expected: high variance (~30-108% spread, documented root cause).
//   Usage: node tools/price_stability_test.cjs [N] --legacy
//
// PERTURBATION mode (verify determinism ≠ frozen):
//   Changes one persisted answer then runs N=3; all 3 must be identical to each
//   other AND different from the baseline in the expected direction.
//   Usage: node tools/price_stability_test.cjs [N] --perturb field_key=new_value
//          e.g. --perturb niche=recessed  OR  --perturb vanity_config=double

const { createClient } = require('@supabase/supabase-js');

const FN       = 'https://cbfftukmhqvvjlrlnltk.supabase.co/functions/v1/ai-estimator';
const ANON     = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYxNDY4OCwiZXhwIjoyMDkxMTkwNjg4fQ.oa4fqY82eLMUmq8egx1IOtBbOi-2Q5ofP1e0NU0ZmNs';
const SB       = 'https://cbfftukmhqvvjlrlnltk.supabase.co';
const TENANT   = '00000000-0000-0000-0000-000000000001';
const JOB      = '5ebd7c3c-c4a7-450c-b529-479903668010'; // 999 Cost Plus Sandbox
const PRICING_TRIGGER = 'All scope questions answered — generate the full priced estimate now.';

const admin = createClient(SB, ANON, { auth: { autoRefreshToken: false, persistSession: false } });

// ── Baseline 34-field confirmed bathroom scope ────────────────────────────────
const BASELINE_ANSWERS = [
  { field_key: 'tub_shower_config',   value: 'walkin',           option_key: 'walkin',           source: 'rep_card', status: 'confirmed' },
  { field_key: 'existing_tub_shower', value: 'tub',              option_key: 'tub',              source: 'photo',    status: 'confirmed' },
  { field_key: 'existing_floor_finish', value: 'tile',           option_key: 'tile',             source: 'photo',    status: 'confirmed' },
  { field_key: 'existing_wall_finish',  value: 'tile',           option_key: 'tile',             source: 'photo',    status: 'confirmed' },
  { field_key: 'existing_vanity',     value: 'single',           option_key: 'single',           source: 'photo',    status: 'confirmed' },
  { field_key: 'layout_change',       value: 'keep_layout',      option_key: 'keep_layout',      source: 'rep_card', status: 'confirmed' },
  { field_key: 'floor_sf',            value: '49',               source: 'measured', status: 'confirmed' },
  { field_key: 'wall_height_in',      value: '96',               source: 'measured', status: 'confirmed' },
  { field_key: 'existing_countertop', value: 'none',             option_key: 'none',             source: 'rep_card', status: 'confirmed' },
  { field_key: 'shower_width_in',     value: '36',               source: 'rep_card', status: 'confirmed' },
  { field_key: 'shower_length_in',    value: '36',               source: 'rep_card', status: 'confirmed' },
  { field_key: 'shower_wall_height_in', value: '84',             source: 'rep_card', status: 'confirmed' },
  { field_key: 'shower_entry',        value: 'curb',             option_key: 'curb',             source: 'rep_card', status: 'confirmed' },
  { field_key: 'wet_wall_window',     value: 'none',             option_key: 'none',             source: 'rep_card', status: 'confirmed' },
  { field_key: 'tile_height',         value: 'ceiling',          option_key: 'ceiling',          source: 'rep_card', status: 'confirmed' },
  { field_key: 'niche',               value: 'none',             option_key: 'none',             source: 'rep_card', status: 'confirmed' },
  { field_key: 'wall_tile_layout',    value: 'subway_offset',    option_key: 'subway_offset',    source: 'rep_card', status: 'confirmed' },
  { field_key: 'shower_glass',        value: 'frameless',        option_key: 'frameless',        source: 'rep_card', status: 'confirmed' },
  { field_key: 'shower_drain',        value: 'center',           option_key: 'center',           source: 'rep_card', status: 'confirmed' },
  { field_key: 'floor_tile',          value: 'porcelain_stonelook', option_key: 'porcelain_stonelook', source: 'rep_card', status: 'confirmed' },
  { field_key: 'heated_floor',        value: 'false',            source: 'rep_card', status: 'confirmed' },
  { field_key: 'vanity_config',       value: 'single',           option_key: 'single',           source: 'rep_card', status: 'confirmed' },
  { field_key: 'vanity_style',        value: 'floating',         option_key: 'floating',         source: 'rep_card', status: 'confirmed' },
  { field_key: 'vanity_size_in',      value: '36',               option_key: '36',               source: 'rep_card', status: 'confirmed' },
  { field_key: 'countertop',          value: 'quartz',           option_key: 'quartz',           source: 'rep_card', status: 'confirmed' },
  { field_key: 'fixture_finish',      value: 'brushed_nickel',   option_key: 'brushed_nickel',   source: 'rep_card', status: 'confirmed' },
  { field_key: 'ventilation',         value: 'exists_vented_out', option_key: 'exists_vented_out', source: 'rep_card', status: 'confirmed' },
  { field_key: 'toilet',              value: 'standard',         option_key: 'standard',         source: 'rep_card', status: 'confirmed' },
  { field_key: 'age_of_home',         value: 'post_2000',        option_key: 'post_2000',        source: 'rep_card', status: 'confirmed' },
  { field_key: 'shower_floor_tiled',  value: 'true',             source: 'rep_card', status: 'confirmed' },
  { field_key: 'drywall_wet_area',    value: 'cement_board',     option_key: 'cement_board',     source: 'rep_card', status: 'confirmed' },
  { field_key: 'access_panel',        value: 'false',            source: 'rep_card', status: 'confirmed' },
  { field_key: 'shower_valve',        value: 'standard',         option_key: 'standard',         source: 'rep_card', status: 'confirmed' },
  { field_key: 'shower_bench',        value: 'false',            source: 'rep_card', status: 'confirmed' },
];

// ── Legacy LLM payload (historical reference — P3/P4 root-cause data) ─────────
const LEGACY_PROMPT = `Generate a detailed estimate for the following project:\n\nJob Address: 999 Cost Plus Sandbox — DO NOT BILL\nScope of Work: Full bathroom remodel. Tear out the existing walk-in tub and install a new tiled shower in that space. Tile the shower walls floor to ceiling. New tile floor. New single vanity with a stone top. New toilet. Paint the walls and trim.\nRooms: Bathroom\nSquare Footage: 49 sqft\n`;
const LEGACY_SUMMARY = `Scope captured:\n- floor sf: 49\n- wall height in: 96\n- project type: bathroom\n- existing tub shower: tub\n- new fixture: walk in shower\n- shower wall finish: tile\n- shower tile height: to ceiling\n- floor finish: tile\n- vanity: single\n- countertop: stone\n- toilet: replace\n- paint: walls and trim`;
const LEGACY_PAYLOAD = {
  messages: [
    { role: 'user', content: LEGACY_PROMPT },
    { role: 'assistant', content: LEGACY_SUMMARY },
    { role: 'user', content: PRICING_TRIGGER },
  ],
  tenant_id: TENANT,
  project_sf: 49,
  finish_tier: 'mid',
  markup_pct: 30,
  pm_fee: 1200,
  financial_model: 'fixed_bid',
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── DB helpers ────────────────────────────────────────────────────────────────
async function getRoomId() {
  const { data } = await admin.from('job_rooms').select('id').eq('job_id', JOB).limit(1);
  return data?.[0]?.id ?? null;
}

async function seedAnswers(answers) {
  const roomId = await getRoomId();
  if (!roomId) throw new Error('no job_room for JOB — cannot seed');
  const rows = answers.map(a => ({ ...a, job_id: JOB, room_id: roomId, tenant_id: TENANT }));
  const { error } = await admin.from('job_scope_answers').upsert(rows, { onConflict: 'tenant_id,job_id,room_id,field_key' });
  if (error) throw new Error('seed failed: ' + error.message);
}

async function clearAnswers() {
  await admin.from('job_scope_answers').delete().eq('job_id', JOB);
}

// ── Pricing call helpers ──────────────────────────────────────────────────────
function lineKey(l) { return `${l.trade}::${l.line_item}::${l.unit}`; }

function lineFingerprint(l) {
  return {
    trade:        l.trade,
    line_item:    l.line_item,
    unit:         l.unit,
    quantity:     l.quantity,
    unit_price:   l.unit_price,
    amount:       l.amount,
    source_label: l.source_label,
  };
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function callPricePlan(attempt = 1) {
  const res = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}` },
    body: JSON.stringify({ mode: 'price_plan', tenant_id: TENANT, job_id: JOB, project_type: 'bathroom', finish_tier: 'mid', markup_pct: 30, pm_fee: 1200, financial_model: 'cost_plus' }),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = null; }
  if ((res.status === 429 || res.status === 529) && attempt < 4) { await sleep(3000 * attempt); return callPricePlan(attempt + 1); }
  if (!res.ok || !data) return { ok: false, err: `HTTP ${res.status}: ${text.slice(0, 160)}` };
  if (data.error) return { ok: false, err: data.error };
  if (!Array.isArray(data.priced_scope)) return { ok: false, err: 'no priced_scope' };
  const lines = data.priced_scope.filter(l => !l.outside_scope).sort((a, b) => lineKey(a).localeCompare(lineKey(b)));
  const subtotal = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  return { ok: true, subtotal: Math.round(subtotal * 100) / 100, lineCount: lines.length, lines, fingerprints: lines.map(lineFingerprint) };
}

async function callLegacy(attempt = 1) {
  const res = await fetch(FN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON}` },
    body: JSON.stringify(LEGACY_PAYLOAD),
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = null; }
  const overloaded = res.status === 429 || res.status === 529 || /overload|rate.?limit/i.test(text);
  if (overloaded && attempt < 4) { await sleep(3000 * attempt); return callLegacy(attempt + 1); }
  if (!res.ok || !data) return { ok: false, err: `HTTP ${res.status}: ${text.slice(0, 160)}` };
  if (data.error) return { ok: false, err: data.error };
  if (!Array.isArray(data.priced_scope)) return { ok: false, err: `no priced_scope (parse_error=${data.parse_error})` };
  const lines = data.priced_scope.filter(l => !l.outside_scope);
  const subtotal = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  return { ok: true, subtotal: Math.round(subtotal), lineCount: lines.length };
}

// ── Report helpers ────────────────────────────────────────────────────────────
function reportRuns(runs, label) {
  const ok = runs.filter(r => r.ok);
  const subtotals = ok.map(r => r.subtotal);
  const min = Math.min(...subtotals), max = Math.max(...subtotals);
  const mean = subtotals.reduce((a, b) => a + b, 0) / subtotals.length;
  const spread = mean > 0 ? (max - min) / mean * 100 : 0;
  const spreadDollar = max - min;
  const stdev = Math.sqrt(subtotals.reduce((s, v) => s + (v - mean) ** 2, 0) / subtotals.length);
  const lineCounts = [...new Set(ok.map(r => r.lineCount))];
  console.log(`\n── ${label} RESULT (${ok.length}/${runs.length} succeeded) ──`);
  console.log(`subtotals : ${subtotals.map(v => '$' + v.toLocaleString()).join('  ')}`);
  console.log(`mean $${Math.round(mean).toLocaleString()} | min $${min.toLocaleString()} | max $${max.toLocaleString()} | stdev $${Math.round(stdev).toLocaleString()}`);
  console.log(`spread    : ${spreadDollar === 0 ? '$0.00' : '$' + spreadDollar.toFixed(2)} (${spread.toFixed(2)}%)`);
  console.log(`line count: ${lineCounts.join(', ')} ${lineCounts.length > 1 ? '← VARIES' : '(stable)'}`);
  return { subtotals, min, max, spread, spreadDollar, ok, lineCounts };
}

function deepEqualCheck(runs) {
  const ok = runs.filter(r => r.ok && r.fingerprints);
  if (ok.length < 2) { console.log('deep-equal: (insufficient runs)'); return false; }
  const ref = ok[0].fingerprints;
  let allEqual = true;
  for (let i = 1; i < ok.length; i++) {
    if (!deepEqual(ref, ok[i].fingerprints)) {
      allEqual = false;
      // Show first diff
      const a = ref, b = ok[i].fingerprints;
      const diff = [];
      for (let j = 0; j < Math.max(a.length, b.length); j++) {
        if (JSON.stringify(a[j]) !== JSON.stringify(b[j])) diff.push(`  run1[${j}]=${JSON.stringify(a[j]?.line_item)} vs run${i+1}[${j}]=${JSON.stringify(b[j]?.line_item)}`);
      }
      console.log(`deep-equal: FAIL between run 1 and run ${i + 1}`);
      diff.slice(0, 5).forEach(d => console.log(d));
      break;
    }
  }
  if (allEqual) console.log(`deep-equal: PASS — all ${ok.length} runs produced bit-identical line sets`);
  return allEqual;
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  const args = process.argv.slice(2);
  const legacy   = args.includes('--legacy');
  const perturbArg = args.find(a => a.startsWith('--perturb=') || (args[args.indexOf('--perturb') + 1] && a === '--perturb'));
  const perturbVal = perturbArg
    ? (perturbArg.startsWith('--perturb=') ? perturbArg.slice(10) : args[args.indexOf('--perturb') + 1])
    : null;
  const N = Number(args.find(a => /^\d+$/.test(a))) || (perturbVal ? 3 : 10);

  if (legacy) {
    // ── LEGACY: LLM path (historical reference) ────────────────────────────
    console.log(`\nLEGACY (LLM messages path) — ${N} runs. Expect high variance.\n`);
    const runs = [];
    for (let i = 0; i < N; i++) {
      process.stdout.write(`run ${i + 1}/${N} … `);
      const r = await callLegacy();
      runs.push(r);
      if (r.ok) console.log(`subtotal $${r.subtotal.toLocaleString()} | ${r.lineCount} lines`);
      else console.log(`FAILED — ${r.err}`);
      await sleep(1500);
    }
    const { spreadDollar, lineCounts } = reportRuns(runs, 'LEGACY');
    const THRESH = 8;
    const ok2 = runs.filter(r => r.ok);
    const subtotals = ok2.map(r => r.subtotal);
    const mean = subtotals.reduce((a, b) => a + b, 0) / subtotals.length;
    const spread = mean > 0 ? (Math.max(...subtotals) - Math.min(...subtotals)) / mean * 100 : 0;
    console.log(`\n${spread <= THRESH && lineCounts.length === 1 ? `PASS (within ${THRESH}%)` : 'EXPECTED FAIL — LLM variance documented. Use price_plan for determinism.'}`);
    return;
  }

  if (perturbVal) {
    // ── PERTURBATION: one answer changed, N=3 runs, compare to baseline ───
    const [perturbField, perturbNewVal] = perturbVal.split('=');
    if (!perturbField || !perturbNewVal) { console.error('--perturb format: field_key=new_value'); process.exit(1); }
    const baselineAnswer = BASELINE_ANSWERS.find(a => a.field_key === perturbField);
    if (!baselineAnswer) { console.error(`field_key '${perturbField}' not in baseline answers`); process.exit(1); }

    console.log(`\nPERTURBATION — ${perturbField}: ${baselineAnswer.value} → ${perturbNewVal}  (${N} runs each)\n`);

    // Baseline: N runs with original answers
    console.log('── BASELINE ─────────────────────────────────────────');
    await clearAnswers();
    await seedAnswers(BASELINE_ANSWERS);
    const baseRuns = [];
    for (let i = 0; i < N; i++) {
      process.stdout.write(`baseline run ${i + 1}/${N} … `);
      const r = await callPricePlan(); baseRuns.push(r);
      if (r.ok) console.log(`$${r.subtotal.toLocaleString()} | ${r.lineCount} lines`);
      else console.log(`FAILED — ${r.err}`);
      await sleep(400);
    }
    const { subtotals: baseTotals } = reportRuns(baseRuns, 'BASELINE');
    deepEqualCheck(baseRuns);

    // Perturbed: N runs with the one answer changed
    const perturbedAnswers = BASELINE_ANSWERS.map(a =>
      a.field_key === perturbField
        ? { ...a, value: perturbNewVal, option_key: perturbNewVal }
        : a
    );
    console.log('\n── PERTURBED ────────────────────────────────────────');
    await clearAnswers();
    await seedAnswers(perturbedAnswers);
    const pertRuns = [];
    for (let i = 0; i < N; i++) {
      process.stdout.write(`perturbed run ${i + 1}/${N} … `);
      const r = await callPricePlan(); pertRuns.push(r);
      if (r.ok) console.log(`$${r.subtotal.toLocaleString()} | ${r.lineCount} lines`);
      else console.log(`FAILED — ${r.err}`);
      await sleep(400);
    }
    const { subtotals: pertTotals } = reportRuns(pertRuns, 'PERTURBED');
    deepEqualCheck(pertRuns);

    // Cross-comparison
    const baseBase = baseRuns.find(r => r.ok);
    const pertBase = pertRuns.find(r => r.ok);
    console.log('\n── PERTURBATION CROSS-CHECK ──────────────────────────');
    console.log(`baseline subtotal : $${baseTotals[0]?.toLocaleString() ?? '?'} (all ${N} identical)`);
    console.log(`perturbed subtotal: $${pertTotals[0]?.toLocaleString() ?? '?'} (all ${N} identical)`);
    const delta = (pertTotals[0] ?? 0) - (baseTotals[0] ?? 0);
    console.log(`delta             : ${delta >= 0 ? '+' : ''}$${delta.toFixed(2)}`);
    if (baseBase && pertBase) {
      const baseLines = new Map(baseBase.lines.map(l => [lineKey(l), l]));
      const pertLines = new Map(pertBase.lines.map(l => [lineKey(l), l]));
      const allKeys = new Set([...baseLines.keys(), ...pertLines.keys()]);
      const diffs = [];
      for (const k of allKeys) {
        const b = baseLines.get(k), p = pertLines.get(k);
        const bFp = b ? lineFingerprint(b) : null;
        const pFp = p ? lineFingerprint(p) : null;
        if (JSON.stringify(bFp) !== JSON.stringify(pFp)) {
          diffs.push({ key: k, base: b ? `qty=${b.quantity} $${b.amount}` : '(absent)', pert: p ? `qty=${p.quantity} $${p.amount}` : '(absent)' });
        }
      }
      if (diffs.length === 0) console.log('line diff: NONE (answers changed but no new/removed lines — may be a cosmetic-only field)');
      else { console.log(`line diff: ${diffs.length} line(s) changed:`); diffs.slice(0, 10).forEach(d => console.log(`  ${d.key}\n    baseline: ${d.base}\n    perturbed: ${d.pert}`)); }
    }
    const perturbedOk = pertRuns.filter(r => r.ok);
    const pertIdentical = perturbedOk.length > 1 && deepEqual(perturbedOk[0].fingerprints, perturbedOk[1].fingerprints);
    const changed = baseTotals[0] !== pertTotals[0];
    console.log(`\nperturbation verdict: perturbed runs identical=${pertIdentical} | changed from baseline=${changed}`);
    console.log(pertIdentical && changed ? 'PASS — determinism holds, perturbation has expected effect' : (!pertIdentical ? 'FAIL — perturbed runs not identical' : 'NOTE — no subtotal change (field may not affect pricing for this scope_tag)'));

    // Restore baseline
    await clearAnswers();
    await seedAnswers(BASELINE_ANSWERS);
    console.log('\nDB restored to baseline answers');
    return;
  }

  // ── DEFAULT: price_plan stability proof, N=10 ─────────────────────────────
  console.log(`\nprice_plan stability: ${N} runs of one fixed bathroom scope. Expect spread = $0.00 and deep-equal lines.\n`);

  await clearAnswers();
  await seedAnswers(BASELINE_ANSWERS);
  console.log(`seeded ${BASELINE_ANSWERS.length} confirmed answers to DB\n`);

  const runs = [];
  for (let i = 0; i < N; i++) {
    process.stdout.write(`run ${i + 1}/${N} … `);
    const r = await callPricePlan();
    runs.push(r);
    if (r.ok) console.log(`subtotal $${r.subtotal.toLocaleString()} | ${r.lineCount} lines`);
    else console.log(`FAILED — ${r.err}`);
    await sleep(300);
  }

  const { spreadDollar, lineCounts, subtotals } = reportRuns(runs, 'price_plan');
  const eq = deepEqualCheck(runs);
  const PASS = spreadDollar === 0 && eq && lineCounts.length === 1;
  console.log(`\n${PASS ? 'PASS — spread $0.00, all runs deep-equal. PRICE_DETERMINISM arc complete.' : 'FAIL — unexpected variance in price_plan mode.'}`);

  await clearAnswers();
  console.log('DB restored');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
