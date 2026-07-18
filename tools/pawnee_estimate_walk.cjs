// Playwright walk — estimate tab for 12101 Pawnee Ln — owner session via magic link
const { chromium } = require('@playwright/test');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const APP = 'https://avenstone-app.vercel.app';
const SB  = 'https://cbfftukmhqvvjlrlnltk.supabase.co';
const SVC = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYxNDY4OCwiZXhwIjoyMDkxMTkwNjg4fQ.oa4fqY82eLMUmq8egx1IOtBbOi-2Q5ofP1e0NU0ZmNs';
const KALIN_EMAIL = 'kalinspratling@gmail.com';
const OUT = 'C:/Users/Kalin/OneDrive/Desktop/pawnee-scans';

const admin = createClient(SB, SVC, { auth: { autoRefreshToken: false, persistSession: false } });

(async () => {
  // Generate magic link for Kalin
  console.log('Generating owner magic link...');
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: KALIN_EMAIL,
  });
  if (linkErr) { console.error('Magic link error:', linkErr.message); process.exit(1); }

  // The magic link redirects to APP with the auth token — navigate to it
  const magicLink = linkData?.properties?.action_link;
  if (!magicLink) { console.error('No action_link in response:', JSON.stringify(linkData)); process.exit(1); }
  console.log('Magic link generated. Launching browser...');

  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  // Navigate magic link — this signs us in as Kalin
  await page.goto(magicLink, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, 'est_01_owner_home.png') });
  console.log('Signed in as owner. URL:', page.url());

  // Navigate to Leads to find Pawnee
  console.log('Looking for Pawnee job in Leads...');
  await page.click('text=Leads').catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'est_02_leads.png') });

  // Try to find and click Pawnee
  const found = await page.isVisible('text=Pawnee', { timeout: 3000 }).catch(() => false);
  if (found) {
    await page.click('text=Pawnee');
  } else {
    // Try Pipeline
    await page.click('text=Pipeline').catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, 'est_02b_pipeline.png') });
    await page.click('text=Pawnee').catch(() => console.log('Pawnee not found in Pipeline'));
  }
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, 'est_03_job_detail.png') });
  console.log('Job detail screenshot taken.');

  // Click Estimate tab
  const estSels = [
    'button:has-text("Estimate")',
    'text=Estimate',
    '[data-tab="estimate"]',
    'button:has-text("estimate")',
  ];
  for (const sel of estSels) {
    const hit = await page.click(sel).then(() => true).catch(() => false);
    if (hit) { console.log('Estimate tab clicked via:', sel); break; }
  }
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, 'est_04_estimate_tab.png') });
  console.log('Estimate tab screenshot taken.');

  // Scroll through to capture all line items
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(OUT, 'est_05_top.png') });
  for (let i = 1; i <= 5; i++) {
    await page.evaluate(n => window.scrollTo(0, n * 700), i);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(OUT, `est_06_scroll_${i}.png`) });
  }

  await browser.close();
  console.log('Walk complete.');
  console.log('Screenshots:', fs.readdirSync(OUT).filter(f => f.startsWith('est_')).sort().join(', '));
})().catch(err => { console.error('Walk error:', err.message); process.exit(1); });
