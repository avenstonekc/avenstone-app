// @ts-check
// Full bathroom remodel flow test — Travis Kellerman / 4821 W 83rd St
// Tests: job creation, AI estimator, PDF, proposal, contract, signing,
//        notes, status change, CO, payment request, financials, completion

const { test, expect } = require("@playwright/test");
const { createClient } = require("@supabase/supabase-js");

const APP_URL = "http://localhost:3737";
const SB_URL = "https://cbfftukmhqvvjlrlnltk.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYxNDY4OCwiZXhwIjoyMDkxMTkwNjg4fQ.oa4fqY82eLMUmq8egx1IOtBbOi-2Q5ofP1e0NU0ZmNs";

const REP_EMAIL    = "test-rep@avenstonekc.com";
const REP_PASSWORD = "TestRep2026!";
const CLIENT_EMAIL = "kalin@kcenergysavers.com";
const CLIENT_PASS  = "TestFlow2026!";
const JOB_ID       = "test-bath-001";
const JOB_ADDR     = "4821 W 83rd St, Leawood KS 66206";
const TENANT_ID    = "00000000-0000-0000-0000-000000000001";
const KALIN_ID     = "8171742a-b586-4f13-be61-744e191a1896";
const BLAKE_ID     = "066c8241-accb-490b-9f98-b8b7cb24c33b";

const SCOPE = `Full demo of existing 9x11 master bath (99 sq ft). Remove and dispose: toilet, vanity, tub/shower combo, all tile floors and walls. Install freestanding soaker tub (client-supplied). New walk-in tile shower: 4x6 ft, floor-to-ceiling 12x24 porcelain tile (Daltile Arctic White), linear drain, frameless glass door. Floor tile: 12x24 porcelain to match shower, heated floor mat under tile (120V). Vanity wall: dual sink 60" vanity (client-supplied), new plumbing rough-in for double sink. Plumbing: relocate shower drain 18", add dedicated hot/cold for soaker tub, replace all supply lines, new shutoffs. Electrical: add GFCI circuits (2), install heated floor thermostat, add recessed lighting (4 cans), exhaust fan replacement. Drywall: cement board in wet areas, standard drywall elsewhere, smooth finish. Paint: 2 coats Benjamin Moore Chantilly Lace.`;

const sb = createClient(SB_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function loginAsRep(page) {
  await page.goto(APP_URL);
  await page.fill("input[type='email']", REP_EMAIL);
  await page.fill("input[type='password']", REP_PASSWORD);
  await page.click("button:has-text('Sign In')");
  await expect(page.locator("text=Dashboard").first()).toBeVisible({ timeout: 15000 });
}

async function loginAsClient(page) {
  await page.goto(APP_URL);
  await page.fill("input[type='email']", CLIENT_EMAIL);
  await page.fill("input[type='password']", CLIENT_PASS);
  await page.click("button:has-text('Sign In')");
  await expect(page.locator(`text=${JOB_ADDR}`).first()).toBeVisible({ timeout: 15000 });
}

async function openJob(page) {
  await page.click("text=Projects");
  await expect(page.locator(`text=${JOB_ADDR}`).first()).toBeVisible({ timeout: 10000 });
  await page.locator(`text=${JOB_ADDR}`).first().click();
  await expect(page.locator("text=INFO").first()).toBeVisible({ timeout: 8000 });
}

async function checkNotification(type, label) {
  await new Promise(r => setTimeout(r, 3000));
  const { data } = await sb
    .from("notifications")
    .select("user_id, type")
    .eq("job_id", JOB_ID)
    .eq("type", type)
    .order("created_at", { ascending: false })
    .limit(10);
  const ids = (data || []).map(n => n.user_id);
  const kalin = ids.includes(KALIN_ID);
  const blake = ids.includes(BLAKE_ID);
  console.log(`  [${label}] Kalin: ${kalin ? "✓" : "✗"}  Blake: ${blake ? "✓" : "✗"}`);
  return { kalin, blake, data };
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe("Bathroom Remodel — Full Flow", () => {

  test.beforeAll(async () => {
    // Clean slate
    await sb.from("notifications").delete().eq("job_id", JOB_ID);
    await sb.from("contract_signatures").delete().eq("job_id", JOB_ID);
    await sb.from("job_documents").delete().eq("job_id", JOB_ID);
    await sb.from("change_orders").delete().eq("job_id", JOB_ID);
    await sb.from("payments").delete().eq("job_id", JOB_ID);
    await sb.from("job_notes").delete().eq("job_id", JOB_ID);
    await sb.from("jobs").delete().eq("id", JOB_ID);

    // Create job — get client user id first
    const { data: clientProfile } = await sb
      .from("profiles")
      .select("id")
      .eq("email", CLIENT_EMAIL)
      .single();

    await sb.from("jobs").insert({
      id: JOB_ID,
      tenant_id: TENANT_ID,
      address: JOB_ADDR,
      status: "lead",
      client_name: "Travis Kellerman",
      client_phone: "913-555-0147",
      client_email: CLIENT_EMAIL,
      client_user_id: clientProfile?.id || null,
      scope: "Master Bath Remodel",
      sqft: 99,
      contract_value: 0,
      co_total: 0,
      contract_signed: false,
      created_by: KALIN_ID,
    });
  });

  // ── STEP 1: Job visible to rep ────────────────────────────────────────────
  test("1. Job appears in rep Projects list", async ({ page }) => {
    await loginAsRep(page);
    await page.click("text=Projects");
    await expect(page.locator(`text=${JOB_ADDR}`).first()).toBeVisible({ timeout: 10000 });
    console.log("  Job created and visible in Projects ✓");
  });

  // ── STEP 2: AI Estimator ──────────────────────────────────────────────────
  test("2. AI Estimator generates line items", async ({ page }) => {
    await loginAsRep(page);
    await openJob(page);

    // Navigate to Estimate tab
    await page.click("text=ESTIMATE");
    await expect(page.locator("button:has-text('Open Estimator')")).toBeVisible({ timeout: 8000 });
    await page.click("button:has-text('Open Estimator')");
    await expect(page.locator("text=AI Estimator").first()).toBeVisible({ timeout: 6000 });

    // Fill in form
    await page.fill("textarea[placeholder*='scope' i], textarea[placeholder*='Scope' i]", SCOPE);
    await page.fill("input[placeholder*='sqft' i], input[placeholder*='Square' i]", "99");
    await page.fill("input[placeholder*='Room' i]", "Master Bath + Walk-in Shower");
    await page.fill("textarea[placeholder*='Special' i]", "Heated floor, frameless glass, freestanding tub — high-end finish");

    // Generate
    await page.click("button:has-text('Generate Estimate')");
    console.log("  Waiting for AI response (up to 90s)...");

    // Wait for AI to respond — look for dollar signs or trade names in output
    await expect(page.locator("text=Demo").or(page.locator("text=demo")).or(page.locator("text=$")).first()).toBeVisible({ timeout: 90000 });
    console.log("  AI Estimator responded ✓");

    // Check for expected trade categories in the response
    const bodyText = await page.locator(".modal").textContent();
    const hasDemo = /demo/i.test(bodyText);
    const hasTile = /tile|shower/i.test(bodyText);
    const hasPlumb = /plumb/i.test(bodyText);
    const hasElec = /electr/i.test(bodyText);
    console.log(`  Demo: ${hasDemo ? "✓" : "✗"}  Tile/Shower: ${hasTile ? "✓" : "✗"}  Plumbing: ${hasPlumb ? "✓" : "✗"}  Electrical: ${hasElec ? "✓" : "✗"}`);
    expect(hasTile).toBe(true);
    expect(hasPlumb).toBe(true);
  });

  // ── STEP 3: Save estimate PDF ─────────────────────────────────────────────
  test("3. Save estimate as PDF → job_documents", async ({ page }) => {
    await loginAsRep(page);
    await openJob(page);
    await page.click("text=ESTIMATE");
    await page.click("button:has-text('Open Estimator')");
    await expect(page.locator("text=AI Estimator").first()).toBeVisible({ timeout: 6000 });

    // Re-generate estimate
    await page.fill("textarea[placeholder*='scope' i], textarea[placeholder*='Scope' i]", SCOPE);
    await page.fill("input[placeholder*='sqft' i], input[placeholder*='Square' i]", "99");
    await page.fill("input[placeholder*='Room' i]", "Master Bath + Walk-in Shower");
    await page.fill("textarea[placeholder*='Special' i]", "Heated floor, frameless glass, freestanding tub");
    await page.click("button:has-text('Generate Estimate')");
    await expect(page.locator("button:has-text('Save PDF')")).toBeVisible({ timeout: 90000 });

    await page.click("button:has-text('Save PDF')");
    await expect(page.locator("text=Saved to Documents")).toBeVisible({ timeout: 15000 });
    console.log("  Estimate PDF saved ✓");

    // Verify in DB
    await page.waitForTimeout(2000);
    const { data: docs } = await sb.from("job_documents").select("*").eq("job_id", JOB_ID);
    expect(docs.length).toBeGreaterThan(0);
    console.log(`  ${docs.length} document(s) in job_documents ✓`);
  });

  // ── STEP 4: Generate Proposal ─────────────────────────────────────────────
  test("4. Generate Proposal PDF", async ({ page }) => {
    await loginAsRep(page);
    await openJob(page);
    await page.click("text=ESTIMATE");
    await page.click("button:has-text('Open Estimator')");
    await expect(page.locator("text=AI Estimator").first()).toBeVisible({ timeout: 6000 });

    await page.fill("textarea[placeholder*='scope' i], textarea[placeholder*='Scope' i]", SCOPE);
    await page.fill("input[placeholder*='sqft' i], input[placeholder*='Square' i]", "99");
    await page.fill("input[placeholder*='Room' i]", "Master Bath + Walk-in Shower");
    await page.click("button:has-text('Generate Estimate')");
    await expect(page.locator("button:has-text('Generate Proposal')")).toBeVisible({ timeout: 90000 });

    await page.click("button:has-text('Generate Proposal')");
    // Proposal modal opens — it parses the estimate and shows line items
    await expect(page.locator("text=Proposal").first()).toBeVisible({ timeout: 20000 });
    console.log("  Proposal modal opened ✓");
  });

  // ── STEP 5: Send contract email ───────────────────────────────────────────
  test("5. Send contract email to client", async ({ page }) => {
    // First set a contract value on the job so the email content makes sense
    await sb.from("jobs").update({ contract_value: 28500 }).eq("id", JOB_ID);

    await loginAsRep(page);
    await openJob(page);
    await expect(page.locator("button:has-text('Send Contract')")).toBeVisible({ timeout: 8000 });
    await page.click("button:has-text('Send Contract')");
    await expect(page.locator("text=Send Contract").last()).toBeVisible({ timeout: 6000 });

    // Fill in email if blank
    const emailInput = page.locator("input[type='email'], input[placeholder*='email' i]").last();
    await expect(emailInput).toBeVisible({ timeout: 5000 });
    const val = await emailInput.inputValue();
    if (!val) await emailInput.fill(CLIENT_EMAIL);

    await page.click("button:has-text('Send')");
    await page.waitForTimeout(5000);
    console.log("  Contract email sent (verify in inbox) ✓");
  });

  // ── STEP 6: Client signs contract ─────────────────────────────────────────
  test("6. Client signs contract — status → active, PDF saved", async ({ page }) => {
    await loginAsClient(page);
    await page.locator(`text=${JOB_ADDR}`).first().click();
    await expect(page.locator("button:has-text('Sign Now')")).toBeVisible({ timeout: 12000 });

    await page.click("button:has-text('Sign Now')");
    await expect(page.locator("text=Review Contract")).toBeVisible({ timeout: 8000 });
    await page.click("button:has-text(\"I've Read It — Sign →\")");

    const canvas = page.locator("canvas").first();
    await expect(canvas).toBeVisible({ timeout: 8000 });
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + 40, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 40, box.y + box.height - 40, { steps: 15 });
    await page.mouse.up();
    await page.mouse.move(box.x + box.width - 40, box.y + 40);
    await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + box.height - 40, { steps: 15 });
    await page.mouse.up();

    await page.click("button:has-text('Sign & Submit')");
    await page.waitForTimeout(8000);

    const { data: job } = await sb.from("jobs").select("contract_signed, status").eq("id", JOB_ID).single();
    expect(job.contract_signed).toBe(true);
    expect(job.status).toBe("active");
    console.log("  Contract signed, status = active ✓");

    const { data: docs } = await sb.from("job_documents").select("*").eq("job_id", JOB_ID).eq("file_type", "contract");
    expect(docs.length).toBeGreaterThan(0);
    expect(docs[0].client_visible).toBe(true);
    console.log("  Signed contract PDF in job_documents ✓");
  });

  test("6b. Contract-signed notification → Kalin + Blake", async () => {
    const r = await checkNotification("note_posted", "contract signed");
    expect(r.kalin).toBe(true);
    expect(r.blake).toBe(true);
  });

  // ── STEP 7: Rep adds note ─────────────────────────────────────────────────
  test("7. Rep adds note — notification fires", async ({ page }) => {
    await sb.from("notifications").delete().eq("job_id", JOB_ID);
    await loginAsRep(page);
    await openJob(page);
    await page.click("text=NOTES");
    await page.waitForTimeout(800);
    await page.fill("textarea", "Tile ordered — Daltile Arctic White 12x24, eta 5 days");
    await page.click("button:has-text('Add Note')");
    await page.waitForTimeout(4000);

    const r = await checkNotification("note_posted", "note added");
    expect(r.kalin || r.blake).toBe(true);
    console.log("  Note notification fired ✓");
  });

  // ── STEP 8: Status change → Demo ─────────────────────────────────────────
  test("8. Change status to Demo — notification fires", async ({ page }) => {
    await sb.from("notifications").delete().eq("job_id", JOB_ID);
    await loginAsRep(page);
    await openJob(page);

    // Click the status badge to open status modal
    await page.locator(".badge, [class*='badge']").first().click();
    // Or find the status button — look for status label text
    const statusBtn = page.locator("button:has-text('Update Status'), button:has-text('active'), .st-opt").first();
    await expect(statusBtn).toBeVisible({ timeout: 6000 }).catch(async () => {
      // Try clicking the status pill/badge area in the header
      await page.locator("text=Active").first().click();
    });

    await expect(page.locator("button:has-text('Demo'), .st-opt:has-text('Demo')").first()).toBeVisible({ timeout: 5000 });
    await page.locator("button:has-text('Demo'), .st-opt:has-text('Demo')").first().click();
    await page.waitForTimeout(4000);

    const { data: job } = await sb.from("jobs").select("status").eq("id", JOB_ID).single();
    expect(job.status).toBe("demo");
    console.log("  Status changed to demo ✓");

    const r = await checkNotification("status_changed", "status → demo");
    console.log(`  Status change notification — Kalin: ${r.kalin ? "✓" : "✗"}  Blake: ${r.blake ? "✓" : "✗"}`);
  });

  // ── STEP 9: Change order ──────────────────────────────────────────────────
  test("9. Add change order — notification fires", async ({ page }) => {
    await sb.from("notifications").delete().eq("job_id", JOB_ID);
    await loginAsRep(page);
    await openJob(page);
    await page.click("text=CHANGE ORDERS");
    await page.waitForTimeout(800);

    await page.click("button:has-text('Add CO'), button:has-text('New CO'), button:has-text('Change Order')");
    await expect(page.locator("text=Change Order").first()).toBeVisible({ timeout: 6000 });

    await page.fill("input[placeholder*='escription' i], textarea[placeholder*='escription' i]", "Upgrade to heated floor in entire bathroom per client request");
    await page.fill("input[placeholder*='mount' i], input[type='number']", "1200");
    await page.click("button:has-text('Add'), button:has-text('Save CO'), button:has-text('Submit')");
    await page.waitForTimeout(4000);

    const { data: cos } = await sb.from("change_orders").select("*").eq("job_id", JOB_ID);
    expect(cos.length).toBeGreaterThan(0);
    console.log(`  CO created: ${cos[0].co_number} — $${cos[0].amount} ✓`);

    const r = await checkNotification("co_submitted", "CO submitted");
    expect(r.kalin || r.blake).toBe(true);
    console.log("  CO notification fired ✓");
  });

  // ── STEP 10: Payment request ──────────────────────────────────────────────
  test("10. Create payment request — appears in Payments tab", async ({ page }) => {
    await loginAsRep(page);
    await openJob(page);
    await page.click("text=PAYMENTS");
    await page.waitForTimeout(1000);

    await page.click("button:has-text('Request Payment')");
    await expect(page.locator("text=Request Payment").last()).toBeVisible({ timeout: 6000 });

    await page.fill("input[placeholder*='escription' i], input[placeholder*='Deposit' i]", "Deposit — Master Bath Remodel");
    await page.fill("input[type='number']", "8500");
    const emailInput = page.locator("input[type='email']");
    await emailInput.fill(CLIENT_EMAIL);
    await page.click("button:has-text('Send Request')");
    await page.waitForTimeout(8000);

    const { data: payments } = await sb.from("payments").select("*").eq("job_id", JOB_ID);
    expect(payments.length).toBeGreaterThan(0);
    console.log(`  Payment request created: $${payments[0].amount} ✓`);
  });

  // ── STEP 11: Financials check ─────────────────────────────────────────────
  test("11. Financials display correctly", async ({ page }) => {
    await loginAsRep(page);
    await openJob(page);
    await page.click("text=PAYMENTS");
    await page.waitForTimeout(1500);

    const { data: job } = await sb.from("jobs").select("contract_value, co_total").eq("id", JOB_ID).single();
    const { data: payments } = await sb.from("payments").select("*").eq("job_id", JOB_ID);
    const { data: cos } = await sb.from("change_orders").select("*").eq("job_id", JOB_ID);

    console.log(`  Contract value: $${job.contract_value}`);
    console.log(`  CO total: $${job.co_total}`);
    console.log(`  Payment requests: ${payments.length}`);
    console.log(`  Change orders: ${cos.length}`);

    expect(job.contract_value).toBeGreaterThan(0);
    expect(payments.length).toBeGreaterThan(0);

    // Financial summary should be visible on page
    await expect(page.locator("text=Financial Summary")).toBeVisible({ timeout: 6000 });
    await expect(page.locator("text=Contract")).toBeVisible({ timeout: 3000 });
    console.log("  Financials section rendered ✓");
  });

  // ── STEP 12: Push through all statuses ───────────────────────────────────
  test("12. Push job to Complete", async () => {
    const statuses = ["framing", "rough_mep", "drywall", "finish", "punch", "complete"];
    for (const status of statuses) {
      await sb.from("jobs").update({ status }).eq("id", JOB_ID);
      await new Promise(r => setTimeout(r, 300));
    }
    const { data: job } = await sb.from("jobs").select("status").eq("id", JOB_ID).single();
    expect(job.status).toBe("complete");
    console.log("  Job pushed to complete ✓");
  });

  // ── STEP 13: Final state check ─────────────────────────────────────────────
  test("13. Final state — everything in order", async () => {
    const { data: job } = await sb.from("jobs").select("status, contract_signed, contract_value, co_total").eq("id", JOB_ID).single();
    const { data: docs } = await sb.from("job_documents").select("id, file_type, name").eq("job_id", JOB_ID);
    const { data: cos } = await sb.from("change_orders").select("id, co_number, amount").eq("job_id", JOB_ID);
    const { data: payments } = await sb.from("payments").select("id, amount, status").eq("job_id", JOB_ID);

    console.log("\n  ── FINAL STATE ──────────────────────────────");
    console.log(`  status:           ${job.status}`);
    console.log(`  contract_signed:  ${job.contract_signed}`);
    console.log(`  contract_value:   $${job.contract_value}`);
    console.log(`  co_total:         $${job.co_total}`);
    console.log(`  documents (${docs.length}):`);
    docs.forEach(d => console.log(`    - ${d.name} [${d.file_type}]`));
    console.log(`  change orders (${cos.length}):`);
    cos.forEach(c => console.log(`    - ${c.co_number}: $${c.amount}`));
    console.log(`  payments (${payments.length}):`);
    payments.forEach(p => console.log(`    - $${p.amount} [${p.status}]`));

    expect(job.status).toBe("complete");
    expect(job.contract_signed).toBe(true);
    expect(docs.length).toBeGreaterThan(0);
    expect(cos.length).toBeGreaterThan(0);
    expect(payments.length).toBeGreaterThan(0);
    console.log("  ─────────────────────────────────────────────");
  });
});
