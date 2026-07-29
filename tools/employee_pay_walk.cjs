/**
 * EMPLOYEE_PAY_WALK — measurement walk for TIME_CLOCK_ARC S2 pay (both classifications).
 * Run: node tools/employee_pay_walk.cjs
 *
 * MEASUREMENT ONLY — reports defects, does not fix app code. Two test employees through the
 * REAL flows: add via the Team UI (owner), password set (admin, since email links can't be
 * auto-clicked), 4 backdated LAST-week sessions each via service-role manual inserts, 1 LIVE
 * session today via the punch UI on a 390px viewport (Walt with a switch-job). Nina gets a
 * raise ($35→$40 eff this past Sunday) via the owner UI so her two weeks price differently.
 * Reads what each seat's My Pay shows, screenshots, cross-checks vs the earnings math, RLS,
 * owner views. Cleans up everything.
 */
const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));
const DIR = __dirname;

const BASE = 'https://avenstone-app.vercel.app';
const SB = 'https://cbfftukmhqvvjlrlnltk.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQ2ODgsImV4cCI6MjA5MTE5MDY4OH0.isj52drLT3pj7BF94Wa9w_y_f8U1M3W5AcgWsRaTwBQ';
const SVC = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYxNDY4OCwiZXhwIjoyMDkxMTkwNjg4fQ.oa4fqY82eLMUmq8egx1IOtBbOi-2Q5ofP1e0NU0ZmNs';
const TENANT = '00000000-0000-0000-0000-000000000001';
const OWNER = { email: 'test-rep@avenstonekc.com', pw: 'RateBookWalk2026!' };
const JOB_A = '5ebd7c3c-c4a7-450c-b529-479903668010';
const JOB_B = 'c68495d9-f913-40a7-9204-1b6b34aeb9b0';
const admin = createClient(SB, SVC, { auth: { autoRefreshToken: false, persistSession: false } });

const EMP = {
  walt: { email: 'walt+test@avenstonekc.com', name: 'Walt Testman', cls: 'w2', rate: 28, pw: 'WalkPay2026!' },
  nina: { email: 'nina+test@avenstonekc.com', name: 'Nina Testfield', cls: '1099', rate: 35, pw: 'WalkPay2026!' },
};
// Sessions (last week Sun 07-19..Sat 07-25); rates effective 07-01 so last week is priced.
const WALT_SESS = [['2026-07-20', 11], ['2026-07-21', 11], ['2026-07-22', 11], ['2026-07-23', 11]]; // 44h @ $28
const NINA_SESS = [['2026-07-20', 7], ['2026-07-21', 7], ['2026-07-22', 7], ['2026-07-23', 7]];      // 28h @ $35

async function rfill(page, sel, val) {
  await page.evaluate(([s, v]) => {
    const el = document.querySelector(s); if (!el) return;
    const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
    if (set) set.call(el, v); else el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  }, [sel, val]);
}
// Set an input that follows a <label> containing labelText, inside the topmost modal.
async function fillByLabel(page, labelText, value) {
  await page.evaluate(([lt, v]) => {
    const labels = [...document.querySelectorAll('label')].filter(l => l.textContent.trim().toLowerCase().startsWith(lt.toLowerCase()));
    const label = labels[labels.length - 1]; if (!label) return;
    const inp = label.parentElement.querySelector('input');
    if (!inp) return;
    const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(inp), 'value')?.set;
    set ? set.call(inp, v) : (inp.value = v);
    inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
  }, [labelText, value]);
}
async function login(email, pw, viewport) {
  const ctx = await BROWSER.newContext({ viewport: viewport || { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.fill('input[type="email"]', email); await page.fill('input[type="password"]', pw);
  await page.click('button:has-text("Sign In")'); await wait(4500);
  return page;
}
const uidByEmail = async e => (await admin.from('profiles').select('id').eq('email', e).maybeSingle()).data?.id;
const sess = (d, h) => ({ clock_in: `${d}T13:00:00Z`, clock_out: new Date(Date.parse(`${d}T13:00:00Z`) + h * 3600000).toISOString() });

let BROWSER;
const report = { adds: {}, mypay: {}, handmath: {}, rls: {}, notes: [] };

async function cleanup() {
  for (const k of ['walt', 'nina']) {
    const id = await uidByEmail(EMP[k].email);
    if (!id) continue;
    await admin.from('time_entries').delete().eq('user_id', id);
    await admin.from('employee_pay_rates').delete().eq('user_id', id);
    await admin.from('employee_details').delete().eq('user_id', id);
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
}

(async () => {
  const earnings = await import('../avenstone-vite/src/lib/earnings.js');
  console.log('── cleanup any prior test employees ──');
  await cleanup();

  // De-risk owner login: force the test-owner password to a known value (idempotent).
  const ownerId = await uidByEmail(OWNER.email);
  if (ownerId) await admin.auth.admin.updateUserById(ownerId, { password: OWNER.pw, email_confirm: true });

  BROWSER = await chromium.launch({ headless: true });
  try {
    // ── SETUP: add both employees through the Team UI (owner) ──
    const owner = await login(OWNER.email, OWNER.pw);
    await owner.getByText('Team', { exact: true }).first().click(); await wait(1500);
    for (const k of ['walt', 'nina']) {
      const e = EMP[k];
      await owner.locator('button:has-text("Add Employee")').first().click(); await wait(800);
      await fillByLabel(owner, 'Name', e.name);
      await fillByLabel(owner, 'Email', e.email);
      await owner.locator('button', { hasText: e.cls === 'w2' ? 'W-2' : '1099' }).first().click(); await wait(200);
      await fillByLabel(owner, 'Hourly rate', String(e.rate));
      await fillByLabel(owner, 'Rate effective', '2026-07-01'); // cover last week
      await owner.locator('button:has-text("Add & send invite")').first().click(); await wait(3500);
      // dismiss the modal if it stayed open (already-existing path etc.)
      await owner.locator('button:has-text("✕")').first().click().catch(() => {});
      await wait(500);
      const id = await uidByEmail(e.email);
      report.adds[k] = { created: !!id, id };
      console.log(`  add ${k}:`, id ? 'ok ' + id.slice(0, 8) : 'NOT CREATED');
      if (id) await admin.auth.admin.updateUserById(id, { password: e.pw, email_confirm: true });
    }

    // ── Nina raise via owner UI: $40 eff 2026-07-26 (isolated — a failure here must not skip the rest) ──
    const ninaId = report.adds.nina.id;
    const waltId = report.adds.walt.id;
    try {
      await openDetail(owner, 'Nina Testfield');
      await owner.locator('button:has-text("Change rate")').first().click(); await wait(500);
      await fillByLabel(owner, 'New rate', '40');
      await fillByLabel(owner, 'Effective', '2026-07-26');
      await owner.getByRole('button', { name: 'Add', exact: true }).click(); await wait(1800);
      await owner.getByRole('button', { name: '✕' }).first().click().catch(() => {}); await wait(500);
    } catch (e) { report.notes.push('nina raise UI: ' + e.message); }
    if (ninaId) {
      const rates = (await admin.from('employee_pay_rates').select('rate,effective_date').eq('user_id', ninaId).order('effective_date')).data;
      report.ninaRates = rates; report.raiseApplied = (rates || []).length === 2;
      console.log('  nina rates:', JSON.stringify(rates));
    }

    // ── Backdated last-week sessions (service role, source='manual') ──
    if (waltId) await admin.from('time_entries').insert(WALT_SESS.map(([d, h]) => ({ tenant_id: TENANT, user_id: waltId, job_id: JOB_A, source: 'manual', ...sess(d, h) })));
    if (ninaId) await admin.from('time_entries').insert(NINA_SESS.map(([d, h]) => ({ tenant_id: TENANT, user_id: ninaId, job_id: JOB_A, source: 'manual', ...sess(d, h) })));
    console.log('  backdated sessions inserted');

    // ── LIVE punch today via the punch UI (390px) ──
    // Walt: clock in job A → switch to job B → clock out (5th "payment" = two segments)
    const waltPg = await login(EMP.walt.email, EMP.walt.pw, { width: 390, height: 844 });
    report.mypay.waltLanded = await waltPg.getByText(/Time Clock/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    await livePunch(waltPg, true);
    // Nina: plain in/out
    const ninaPg = await login(EMP.nina.email, EMP.nina.pw, { width: 390, height: 844 });
    report.mypay.ninaLanded = await ninaPg.getByText(/Time Clock/i).first().isVisible({ timeout: 5000 }).catch(() => false);
    await livePunch(ninaPg, false);

    // ── Read My Pay + screenshots (390px) ──
    report.mypay.walt = await readMyPay(waltPg, 'pay_w2_mypay.png', 'pay_w2_week44.png');
    report.mypay.nina = await readMyPay(ninaPg, 'pay_1099_mypay.png', null);

    // ── Expected (earnings math) vs displayed ──
    const nowIso = new Date(Date.parse('2026-07-29T20:00:00Z')).toISOString();
    for (const [k, id] of [['walt', waltId], ['nina', ninaId]]) {
      const rates = (await admin.from('employee_pay_rates').select('*').eq('user_id', id).order('effective_date', { ascending: false })).data;
      const ents = (await admin.from('time_entries').select('id,job_id,clock_in,clock_out').eq('user_id', id)).data;
      report.handmath[k] = { computed: earnings.computeEarnings(ents, rates, nowIso), entries: ents.length,
        rateAt_0720: earnings.effectiveRate(rates, '2026-07-20'), rateAt_0729: earnings.effectiveRate(rates, '2026-07-29') };
    }

    // ── RLS: Walt cannot read Nina's pay, vice versa ──
    const waltSb = createClient(SB, ANON, { auth: { persistSession: false } });
    await waltSb.auth.signInWithPassword({ email: EMP.walt.email, password: EMP.walt.pw });
    report.rls.waltSeesNinaRates = (await waltSb.from('employee_pay_rates').select('rate').eq('user_id', ninaId)).data?.length;
    report.rls.waltSeesNinaDetails = (await waltSb.from('employee_details').select('classification').eq('user_id', ninaId)).data?.length;
    report.rls.waltSeesOwnRates = (await waltSb.from('employee_pay_rates').select('rate').eq('user_id', waltId)).data?.length;

    // ── Owner views: Team + both detail screenshots ──
    try {
      await owner.getByText('Team', { exact: true }).first().click(); await wait(1500);
      await owner.screenshot({ path: path.join(DIR, 'pay_owner_team.png'), fullPage: true });
      for (const [nm, shot] of [['Walt Testman', 'pay_owner_walt.png'], ['Nina Testfield', 'pay_owner_nina.png']]) {
        await openDetail(owner, nm); await wait(400);
        await owner.screenshot({ path: path.join(DIR, shot), fullPage: true });
        await owner.getByRole('button', { name: '✕' }).first().click().catch(() => {}); await wait(400);
      }
    } catch (e) { report.notes.push('owner screenshots: ' + e.message); }
  } catch (e) {
    report.notes.push('WALK ERROR: ' + e.message);
    console.error('✗', e.message);
  } finally {
    await BROWSER.close();
  }

  console.log('\n── CLEANUP ──');
  await cleanup();
  // Test-scoped baseline check: both test accounts + all their rows must be gone.
  const waltGone = !(await uidByEmail(EMP.walt.email));
  const ninaGone = !(await uidByEmail(EMP.nina.email));
  const totalDetails = (await admin.from('employee_details').select('*', { count: 'exact', head: true })).count;
  report.cleanup = { walt_profile_gone: waltGone, nina_profile_gone: ninaGone,
    employee_details_rows_remaining: totalDetails, note: 'remaining rows are pre-existing non-test crew (e.g. crew+test)' };

  console.log('\n══════════ EMPLOYEE_PAY_WALK REPORT ══════════');
  console.log(JSON.stringify(report, null, 2));
})();

// Open a crew member's "Pay & details" modal from the Team screen by their name — the innermost
// card div that contains BOTH the name and the Pay & details button (avoids clicking behind a modal).
async function openDetail(owner, name) {
  const card = owner.locator('div')
    .filter({ has: owner.getByText(name, { exact: false }) })
    .filter({ has: owner.locator('button:has-text("Pay & details")') })
    .last();
  await card.locator('button:has-text("Pay & details")').first().click();
  await wait(1300);
}

async function livePunch(page, withSwitch) {
  try {
    const clockIn = page.locator('button:has-text("Clock In")').first();
    if (!(await clockIn.isVisible({ timeout: 4000 }).catch(() => false))) return;
    await clockIn.click(); await wait(1500);
    // Picker overlay lists every active job; JOB_A = "999 Cost Plus Sandbox".
    await page.locator('button').filter({ hasText: /Cost Plus|Sandbox/ }).first().click(); await wait(2800);
    if (withSwitch) {
      await page.locator('button:has-text("Switch Job")').first().click(); await wait(1400);
      // JOB_B = "1200 IDX47 TEST" — a different job → a switch segment.
      await page.locator('button').filter({ hasText: /IDX47/ }).first().click(); await wait(2800);
    }
    await page.locator('button:has-text("Clock Out")').first().click(); await wait(2500);
  } catch (e) { report.notes.push('livePunch(' + (withSwitch ? 'walt' : 'nina') + '): ' + e.message); }
}

async function readMyPay(page, shot, weekShot) {
  try {
    await page.locator('button:has-text("My Pay")').first().click(); await wait(1500);
    await page.evaluate(() => window.scrollTo(0, 0)); await wait(300);
    // Above-the-fold viewport shot — is the "straight time" label visible WITHOUT scrolling?
    await page.screenshot({ path: path.join(DIR, shot), fullPage: false });
    // Full-panel shot — the 44h week row + label together.
    if (weekShot) await page.screenshot({ path: path.join(DIR, weekShot), fullPage: true });
    const dump = await page.evaluate(() => document.body.innerText);
    const grab = re => (dump.match(re) || [])[1] || null;
    return {
      ytdGross: grab(/YTD gross\s*\$?([\d,]+\.\d{2}|—)/i),
      week: grab(/This week\s*\$?([\d,]+\.\d{2}|—)/i),
      rate: grab(/Your rate\s*\$?([\d,]+\.\d{2}|—)/i),
      classification: grab(/Classification\s*(W-2|1099|—)/i),
      labelVisible: /straight time, before taxes/i.test(dump),
      weeks: (dump.match(/Week of \d+\/\d+[\s\S]{0,40}?\$[\d,]+\.\d{2}/gi) || []).slice(0, 6),
    };
  } catch (e) { report.notes.push('readMyPay ' + shot + ': ' + e.message); return { error: e.message }; }
}
