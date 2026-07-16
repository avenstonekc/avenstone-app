// LIVE UI test — SCOPE_VISION P2: scan → measured scope answers (floor_sf, wall_height_in).
// Verifies (1) SF field auto-fills from the LiDAR scan on mount, (2) an estimate can generate from
// scan+photos alone (no typed SF/scope), (3) floor_sf + wall_height_in persist as source='measured'.
const { chromium } = require('@playwright/test');
const { createClient } = require('@supabase/supabase-js');

const APP = 'http://localhost:3737';
const SB = 'https://cbfftukmhqvvjlrlnltk.supabase.co';
const SVC = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYxNDY4OCwiZXhwIjoyMDkxMTkwNjg4fQ.oa4fqY82eLMUmq8egx1IOtBbOi-2Q5ofP1e0NU0ZmNs';
const JOB = '5ebd7c3c-c4a7-450c-b529-479903668010';
const REP = { email: 'test-rep@avenstonekc.com', pw: 'TestRep2026!' };
const admin = createClient(SB, SVC, { auth: { autoRefreshToken: false, persistSession: false } });

async function rfill(page, sel, val) {
  await page.evaluate(([s, v]) => {
    const el = document.querySelector(s); if (!el) return;
    const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
    set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }, [sel, val]);
}
async function resetJob() {
  await admin.from('job_scope_answers').delete().eq('job_id', JOB);
  await admin.from('job_estimates').update({ messages: [], scope_origin: 'manual' }).eq('job_id', JOB);
}

(async () => {
  const { data: snap } = await admin.from('jobs').select('scope').eq('id', JOB).single();
  const originalScope = snap?.scope ?? '';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await ctx.newPage();
  try {
    await resetJob();
    await page.goto(APP);
    await page.waitForSelector("input[type='email']", { timeout: 15000 });
    await rfill(page, "input[type='email']", REP.email);
    await rfill(page, "input[type='password']", REP.pw);
    await page.locator('button').filter({ hasText: /^Sign In$/ }).click();
    await page.locator('button').filter({ hasText: /^Sign In$/ }).waitFor({ state: 'hidden', timeout: 20000 });
    console.log('logged in as rep');

    await page.locator('.sb-item').filter({ hasText: 'Projects' }).first().click({ timeout: 25000 });
    await page.waitForTimeout(1500);
    await page.locator('text=/999 Cost Plus Sandbox/').first().click({ timeout: 15000 });
    await page.locator('.tabbar').first().waitFor({ timeout: 10000 });
    await page.locator('button.tab').filter({ hasText: 'Estimate' }).first().click();
    await page.waitForTimeout(2500); // let mount effects (scan measurements) run

    const startFresh = page.locator("button:has-text('Start fresh')").first();
    if (await startFresh.isVisible().catch(() => false) && !(await page.locator('textarea.finp.fta').first().isVisible().catch(() => false))) {
      await startFresh.click(); await page.waitForTimeout(700);
      await page.locator("button:has-text('Start fresh')").last().click().catch(() => {}); await page.waitForTimeout(2000);
    }
    await page.locator('textarea.finp.fta').first().waitFor({ timeout: 10000 });
    await page.waitForTimeout(1500);

    // (1) SF field should have auto-filled from the scan (49), no typing.
    const sfVal = await page.evaluate(() => { const el = document.querySelector("input[type='number']"); return el ? el.value : null; });
    console.log('SF field auto-fill from scan =', JSON.stringify(sfVal), '(expect ~49)');

    // (2) Mark room = Bathroom, leave scope + SF as-is (scan drives SF). Confirm Generate enabled.
    await rfill(page, "input[placeholder*='Kitchen, Master']", 'Bathroom');
    await page.waitForTimeout(800);
    const genBtn = page.locator("button:has-text('Generate Estimate')").first();
    const genDisabled = await genBtn.isDisabled().catch(() => true);
    console.log('Generate button disabled (expect false) =', genDisabled);
    await page.screenshot({ path: 'tools/scan_measure_form.png' });

    await genBtn.click({ timeout: 8000 });
    await page.waitForFunction(() => /\d+ of \d+ answered/.test(document.body.innerText), { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'tools/scan_measure_after.png', fullPage: true });

    // (3) Verify persisted measured answers.
    const { data: ans } = await admin.from('job_scope_answers').select('field_key, value, source, status').eq('job_id', JOB).order('field_key');
    console.log('\nPERSISTED ANSWERS:');
    (ans || []).forEach(a => console.log(`   ${a.field_key} = ${a.value} [${a.source}/${a.status}]`));
    const floor = (ans || []).find(a => a.field_key === 'floor_sf');
    const height = (ans || []).find(a => a.field_key === 'wall_height_in');
    console.log('\nRESULT:');
    console.log('  floor_sf measured  =', floor ? `${floor.value} [${floor.source}] ${floor.source === 'measured' && floor.value === '49' ? 'PASS' : 'CHECK'}` : 'MISSING — FAIL');
    console.log('  wall_height_in     =', height ? `${height.value} [${height.source}] ${height.source === 'measured' && height.value === '96' ? 'PASS' : 'CHECK'}` : 'MISSING — FAIL');
  } catch (e) {
    console.log('RUN ERROR:', e.message);
  } finally {
    await browser.close();
    await resetJob();
    await admin.from('jobs').update({ scope: originalScope }).eq('id', JOB);
    console.log('\nrestored + cleared test answers');
  }
})().catch(e => { console.error('FATAL', e); process.exit(1); });
