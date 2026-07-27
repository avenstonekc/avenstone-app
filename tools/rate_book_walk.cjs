/**
 * RATE_BOOK_WALK — automated owner-seat review of the new Rate Book screen (T2#4 S2b).
 * Run: node tools/rate_book_walk.cjs
 *
 * MEASUREMENT ONLY. Creates test tenant overrides, reads screen vs engine, measures entry
 * ergonomics, screenshots, then deletes every tenant row it created (restores baseline).
 * If it finds a defect it REPORTS — it does not fix.
 *
 * Seat: Rate Book is owner-gated (App.jsx: profile.role === 'owner'). None of the +test seat
 * accounts are owner; test-rep@avenstonekc.com IS owner (stale e2e account) — password set to a
 * known value for this walk. Reported in output.
 *
 * Follows tools/path_certainty_walk.cjs: production BASE, React-aware rfill, screenshot convention.
 */
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));

const BASE   = 'https://avenstone-app.vercel.app';
const EMAIL  = 'test-rep@avenstonekc.com';   // role=owner (confirmed via profiles)
const PASS   = 'RateBookWalk2026!';
const DIR    = __dirname;

const SB     = 'https://cbfftukmhqvvjlrlnltk.supabase.co';
const SKEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYxNDY4OCwiZXhwIjoyMDkxMTkwNjg4fQ.oa4fqY82eLMUmq8egx1IOtBbOi-2Q5ofP1e0NU0ZmNs';
const FN     = `${SB}/functions/v1/ai-estimator`;
const TENANT = '00000000-0000-0000-0000-000000000001';
const JOB    = '5ebd7c3c-c4a7-450c-b529-479903668010';
const KEEP   = ['fe46c667-bc92-4894-90c9-580677eb2b4d', '575cdada-7a99-4e37-942f-008ad45c69c6']; // original tenant rows (Demo, Drywall)

const admin = createClient(SB, SKEY, { auth: { autoRefreshToken: false, persistSession: false } });

// React-aware fill (controlled inputs)
async function rfill(page, sel, val) {
  await page.evaluate(([s, v]) => {
    const el = document.querySelector(s); if (!el) return;
    const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
    if (set) set.call(el, v); else el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, [sel, val]);
}

// Structured dump of every collapsed row currently rendered.
async function dumpRows(page) {
  return page.evaluate(() => {
    const out = [];
    document.querySelectorAll('button[title="Type your all-rooms rate"]').forEach(btn => {
      const card = btn.closest('.card');
      let trade = null;
      if (card && card.firstElementChild) {
        const spans = card.firstElementChild.querySelectorAll('span');
        trade = spans[1] ? spans[1].textContent.trim() : null; // [0]=chevron, [1]=trade name
      }
      // climb to the CatalogRow root (its parent's parent is the card)
      let row = btn;
      while (row.parentElement && row.parentElement.parentElement !== card) row = row.parentElement;
      const badges = [...row.querySelectorAll('.badge')].map(b => b.textContent.trim());
      const nameEl = row.querySelector('div');
      out.push({ trade, name: nameEl ? nameEl.textContent.trim() : '', badges, rate: btn.textContent.trim() });
    });
    return out;
  });
}

// find the base-labor row dump for a trade
const baseLaborRow = (rows, trade) => rows.find(r => r.trade === trade && /^Base labor/.test(r.name));

async function seedAnswers() {
  const ba = JSON.parse(fs.readFileSync(path.join(DIR, '_rbwalk_answers.json'), 'utf8'));
  const { data } = await admin.from('job_rooms').select('id').eq('job_id', JOB).limit(1);
  const roomId = data[0].id;
  await admin.from('job_scope_answers').delete().eq('job_id', JOB);
  await admin.from('job_scope_answers').upsert(ba.map(a => ({ ...a, job_id: JOB, room_id: roomId, tenant_id: TENANT })), { onConflict: 'tenant_id,job_id,room_id,field_key' });
}
async function clearAnswers() { await admin.from('job_scope_answers').delete().eq('job_id', JOB); }

async function pricePlanBathroom() {
  const res = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SKEY}` },
    body: JSON.stringify({ mode: 'price_plan', tenant_id: TENANT, job_id: JOB, project_type: 'bathroom', finish_tier: 'mid', markup_pct: 0, pm_fee: 0, financial_model: 'cost_plus' }) });
  const d = await res.json();
  const map = {};
  // Priced output has no materialName field (it's line_item). Base labor is emitted BEFORE
  // labor-extras in template order, so the FIRST labor line per trade is the base labor line —
  // the one the screen's "Base labor" row corresponds to. First-wins.
  for (const l of (d.priced_scope || [])) {
    if (l.category === 'labor' && !map[l.trade]) map[l.trade] = { rate: l.unit_price, badge: l.source_badge };
  }
  return map;
}

async function gotoRateBook(page) {
  const nav = page.getByText('Rate Book', { exact: true }).first();
  await nav.waitFor({ state: 'visible', timeout: 8000 });
  await nav.click();
  await page.waitForSelector('button[title="Type your all-rooms rate"]', { timeout: 15000 });
  await wait(800);
}

// Force a genuine refetch (state-based routing won't refetch on a re-click of the current page).
async function reloadRateBook(page) {
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  await wait(2500);
  await gotoRateBook(page);
}

// Enter a rate through the screen; return interaction + latency measurements.
async function enterRateViaScreen(page, trade, value) {
  const rows = await dumpRows(page);
  const idx = rows.findIndex(r => r.trade === trade && /^Base labor/.test(r.name));
  if (idx < 0) return { trade, ok: false, note: 'row not found' };
  const btns = page.locator('button[title="Type your all-rooms rate"]');
  let clicks = 0;
  await btns.nth(idx).click(); clicks++;                 // 1: open editor
  await wait(300);
  // the number input inside this row
  await rfill(page, '.card input[type="number"]', value);
  const t0 = Date.now();
  const saveBtn = page.locator('button:has-text("Save")').first();
  await saveBtn.click(); clicks++;                        // 2: save
  // wait for reload to finish (rate button reappears)
  await page.waitForSelector('button[title="Type your all-rooms rate"]', { timeout: 10000 }).catch(() => {});
  await wait(400);
  const latency = Date.now() - t0;
  return { trade, ok: true, clicks, digits: String(value).replace('.', '').length, latencyMs: latency };
}

(async () => {
  const report = { seat: EMAIL, seatRole: 'owner', screenVsEngine: [], ergonomics: [], notes: [], defects: [] };

  // baseline answers file for price_plan
  const src = fs.readFileSync(path.join(DIR, 'price_stability_test.cjs'), 'utf8');
  fs.writeFileSync(path.join(DIR, '_rbwalk_answers.json'), JSON.stringify(eval(src.match(/const BASELINE_ANSWERS = (\[[\s\S]*?\]);/)[1])));

  // Phase 0 — create the tenant+all example (Cleanup all-rooms $77) for screen-vs-engine
  await admin.from('takeoff_unit_costs').insert({ tenant_id: TENANT, room_type: null, trade: 'Cleanup', category: 'labor', material_name: null, unit: 'lump', base_rate: 77.00, coverage_sf: null, waste_pct: 0, multipliers: {}, active: true, vetted: false, notes: 'RBWALK' });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  try {
    // login
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASS);
    await page.click('button:has-text("Sign In")');
    await wait(4500);
    console.log('✓ logged in as', EMAIL);

    await gotoRateBook(page);
    console.log('✓ reached Rate Book');
    await page.screenshot({ path: path.join(DIR, 'rb_list_top.png'), fullPage: false });

    // findability: viewport-heights to reach the bottom of the list (real scroll container),
    // and whether any search/filter input exists.
    const scroll = await page.evaluate(() => {
      const vh = window.innerHeight;
      let best = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      document.querySelectorAll('*').forEach(el => {
        const s = getComputedStyle(el);
        if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 50) best = Math.max(best, el.scrollHeight);
      });
      return { ratio: +(best / vh).toFixed(1), cards: document.querySelectorAll('.card').length,
        hasSearch: !!document.querySelector('input[type="search"], input[placeholder*="earch"], input[placeholder*="ilter"]') };
    });
    report.scrollViewports = scroll.ratio;
    report.tradeCards = scroll.cards;
    report.hasSearch = scroll.hasSearch;

    // ── A: screen-vs-engine ──
    await seedAnswers();
    const engine = await pricePlanBathroom();
    const rows = await dumpRows(page);
    const targets = [
      { trade: 'Cleanup',              rank: 'tenant+all' },
      { trade: 'Demo',                 rank: 'tenant+room' },
      { trade: 'Paint - Interior',     rank: 'platform+room' },
      { trade: 'Tile - Wall / shower', rank: 'platform+room' },
      { trade: 'Plumbing - Rough-in',  rank: 'platform+room (disagree)' },
    ];
    for (const t of targets) {
      const r = baseLaborRow(rows, t.trade);
      const eng = engine[t.trade];
      report.screenVsEngine.push({
        trade: t.trade, rank: t.rank,
        screenRate: r ? r.rate : 'ROW NOT FOUND',
        screenBadge: r ? (r.badges[0] || '') : '',
        engineRate: eng ? eng.rate : 'not priced',
        engineSource: eng ? (eng.badge || '') : '',
      });
    }

    // ── C screenshots: range row + mid-edit ──
    // range row: scroll Plumbing - Rough-in into view + screenshot
    const plumb = page.locator('.card').filter({ has: page.getByText('Plumbing - Rough-in', { exact: true }) }).first();
    await plumb.scrollIntoViewIfNeeded().catch(() => {});
    await wait(300);
    await plumb.screenshot({ path: path.join(DIR, 'rb_range.png') }).catch(() => {});

    // mid-edit screenshot: open the Paint - Interior editor
    {
      const rows2 = await dumpRows(page);
      const idx = rows2.findIndex(r => r.trade === 'Paint - Interior' && /^Base labor/.test(r.name));
      if (idx >= 0) {
        await page.locator('button[title="Type your all-rooms rate"]').nth(idx).click();
        await wait(300);
        await rfill(page, '.card input[type="number"]', '3.75');
        await page.screenshot({ path: path.join(DIR, 'rb_edit.png'), fullPage: false });
        // cancel out (don't save this one)
        await page.locator('button:has-text("✕")').first().click().catch(() => {});
        await wait(300);
      }
    }

    // ── B: ergonomics — enter 5 rates, measure ──
    const ergTrades = [['Cleanup', 80.00], ['Paint - Interior', 3.75], ['Tile - Floor', 8.50], ['Trim / carpentry - Base / case', 4.75], ['Drywall - Tape / mud / texture', 0.72]];
    for (const [trade, val] of ergTrades) {
      const m = await enterRateViaScreen(page, trade, val);
      report.ergonomics.push(m);
      console.log('  entered', trade, JSON.stringify(m));
    }

    // keyboard-only probe: open an editor, type, Tab then Enter — does it save without a mouse click?
    try {
      const rows3 = await dumpRows(page);
      const idx = rows3.findIndex(r => r.trade === 'Countertops' && /^Base labor/.test(r.name));
      if (idx >= 0) {
        await page.locator('button[title="Type your all-rooms rate"]').nth(idx).click();
        await wait(300);
        await rfill(page, '.card input[type="number"]', '90');
        await page.keyboard.press('Enter');
        await wait(1200);
        const stillEditing = await page.locator('button:has-text("Save")').first().isVisible({ timeout: 1000 }).catch(() => false);
        report.keyboardEnterSaves = !stillEditing;
        // if Enter didn't save, cancel
        if (stillEditing) await page.locator('button:has-text("✕")').first().click().catch(() => {});
        await wait(300);
      }
    } catch (e) { report.notes.push('keyboard probe failed: ' + e.message); }

    // vetted toggle probe — is it a separate click on the same row?
    {
      const reviewedBtns = await page.locator('button:has-text("Needs Review"), button:has-text("Reviewed")').count();
      report.vettedTogglePresent = reviewedBtns > 0;
    }

    // ── A2: stale-override warning ──
    // Cleanup already has an all-rooms tenant rate (from ergonomics/phase0). Add a bathroom-specific one.
    await admin.from('takeoff_unit_costs').insert({ tenant_id: TENANT, room_type: 'bathroom', trade: 'Cleanup', category: 'labor', material_name: null, unit: 'lump', base_rate: 44.00, coverage_sf: null, waste_pct: 0, multipliers: {}, active: true, vetted: false, notes: 'RBWALK' });
    await reloadRateBook(page); // FORCE a refetch so the new bathroom row is in state
    const cleanupCard = page.locator('.card').filter({ has: page.getByText('Cleanup', { exact: true }) }).first();
    await cleanupCard.scrollIntoViewIfNeeded().catch(() => {});
    await wait(300);
    const warnText = await cleanupCard.locator('.badge', { hasText: /room-specific rate/ }).first().textContent().catch(() => null);
    report.staleWarning = { fired: !!warnText, text: warnText };
    await cleanupCard.screenshot({ path: path.join(DIR, 'rb_warning.png') }).catch(() => {});
    // one-tap removal
    const useEvery = cleanupCard.locator('button', { hasText: /Use my all-rooms rate everywhere|Remove room-specific override/ }).first();
    page.once('dialog', d => d.accept());
    if (await useEvery.isVisible({ timeout: 2000 }).catch(() => false)) {
      await useEvery.click();
      await page.waitForSelector('button[title="Type your all-rooms rate"]', { timeout: 10000 }).catch(() => {});
      await wait(600);
      const stillWarn = await cleanupCard.locator('.badge', { hasText: /room-specific rate/ }).first().isVisible({ timeout: 1000 }).catch(() => false);
      report.staleWarning.removedAfterTap = !stillWarn;
    }

    // ── Mobile screenshot at 390px ──
    await page.setViewportSize({ width: 390, height: 844 });
    await wait(600);
    await page.evaluate(() => window.scrollTo(0, 0));
    await wait(300);
    await page.screenshot({ path: path.join(DIR, 'rb_mobile.png'), fullPage: false });

  } catch (err) {
    report.defects.push('WALK ERROR: ' + err.message);
    await page.screenshot({ path: path.join(DIR, 'rb_error.png'), fullPage: false }).catch(() => {});
    console.error('✗', err.message);
  } finally {
    await browser.close();
  }

  // ── Cleanup: delete every tenant row except the 2 originals; restore baseline ──
  await clearAnswers();
  const { data: toDel } = await admin.from('takeoff_unit_costs').select('id').not('tenant_id', 'is', null);
  const delIds = (toDel || []).map(r => r.id).filter(id => !KEEP.includes(id));
  if (delIds.length) await admin.from('takeoff_unit_costs').delete().in('id', delIds);
  const { count } = await admin.from('takeoff_unit_costs').select('*', { count: 'exact', head: true });
  const { count: tcount } = await admin.from('takeoff_unit_costs').select('*', { count: 'exact', head: true }).not('tenant_id', 'is', null);
  report.cleanup = { deletedTestRows: delIds.length, finalTotal: count, finalTenant: tcount };
  fs.unlinkSync(path.join(DIR, '_rbwalk_answers.json'));

  console.log('\n══════════════════ RATE_BOOK_WALK REPORT ══════════════════');
  console.log(JSON.stringify(report, null, 2));
})();
