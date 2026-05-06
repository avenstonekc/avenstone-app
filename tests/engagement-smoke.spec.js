// @ts-check
/**
 * Engagement pipeline smoke test — Phase 2d-3 verification
 * PM create → sub submit → PM accept → schedule items auto-drafted
 *
 * Uses test-sub (Flooring - LVP trades on file) and 1206 Lucy Webb Rd job.
 * Cleans up all created rows in afterAll.
 */

const { test, expect } = require("@playwright/test");
const { createClient } = require("@supabase/supabase-js");

const APP_URL    = "http://localhost:3737";
const SB_URL     = "https://cbfftukmhqvvjlrlnltk.supabase.co";
const SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYxNDY4OCwiZXhwIjoyMDkxMTkwNjg4fQ.oa4fqY82eLMUmq8egx1IOtBbOi-2Q5ofP1e0NU0ZmNs";
const ANON_KEY    = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTQ2ODgsImV4cCI6MjA5MTE5MDY4OH0.isj52drLT3pj7BF94Wa9w_y_f8U1M3W5AcgWsRaTwBQ";
const FN_BASE     = `${SB_URL}/functions/v1`;
const TENANT_ID   = "00000000-0000-0000-0000-000000000001";
const JOB_ID      = "8d3463da-6b0f-4a9c-9878-37e012a7f5a1"; // 1206 Lucy Webb Rd
const JOB_ADDR    = "1206 Lucy Webb Rd, Raymore, MO";
const SUB_ID      = "b464f266-afdf-445d-bf7a-9d9c0cd0baae"; // test-sub
const TRADE       = "Flooring - LVP";
const SCOPE       = "LVP flooring in living room and hallway";
const PM          = { email: "test-pm@avenstonekc.com",  password: "TestPM2026!" };
const SUB         = { email: "test-sub@avenstonekc.com", password: "TestSub2026!" };

const admin = createClient(SB_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// shared across test steps
const ctx = { engagementId: null, scheduleItemIds: [] };

// ── helpers ──────────────────────────────────────────────────────────────────

async function login(page, email, password) {
  await page.goto(APP_URL);
  await expect(page.locator("input[type='email']")).toBeVisible({ timeout: 12000 });
  await page.evaluate(([e, p]) => {
    function rs(el, v) {
      const s = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set;
      s.call(el, v);
      el.dispatchEvent(new Event("input",  { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    rs(document.querySelector("input[type='email']"), e);
    rs(document.querySelector("input[type='password']"), p);
  }, [email, password]);
  await page.locator("button").filter({ hasText: /^Sign In$/ }).click();
  await expect(page.locator("button").filter({ hasText: /^Sign In$/ })).not.toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(800);
}

async function reactFill(page, selector, value) {
  await page.evaluate(([sel, val]) => {
    const el = document.querySelector(sel);
    const s = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set;
    s.call(el, val);
    el.dispatchEvent(new Event("input",  { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, [selector, value]);
}

async function navTo(page, label) {
  // Desktop: sidebar is always visible; click the matching sb-item
  const sbBtn = page.locator(".sb-item").filter({ hasText: label }).first();
  await expect(sbBtn).toBeVisible({ timeout: 8000 });
  await sbBtn.click();
  await page.waitForTimeout(600);
}

// ── cleanup ───────────────────────────────────────────────────────────────────

async function cleanupTestEngagements() {
  // Delete schedule items tied to test engagements
  const { data: engs } = await admin
    .from("job_sub_engagements")
    .select("id")
    .eq("job_id", JOB_ID)
    .eq("sub_id", SUB_ID);
  if (engs?.length) {
    const ids = engs.map(e => e.id);
    await admin.from("schedule_items").delete().in("engagement_id", ids);
    await admin.from("engagement_bids").delete().in("engagement_id", ids);
    await admin.from("job_sub_engagements").delete().in("id", ids);
  }
}

// ── test suite ────────────────────────────────────────────────────────────────

test.describe.serial("Engagement pipeline smoke test", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeAll(async () => {
    await cleanupTestEngagements();
  });

  test.afterAll(async () => {
    await cleanupTestEngagements();
  });

  // ── Step 1: Create engagement via DB (Phase 2a already tested; focus on 2d-3 flows) ──

  test("Step 1: Seed engagement via DB (invited)", async () => {
    const { data: eng, error } = await admin
      .from("job_sub_engagements")
      .insert({
        tenant_id: TENANT_ID,
        job_id: JOB_ID,
        sub_id: SUB_ID,
        trade: TRADE,
        bid_type: "sub_drafted",
        scope_description: SCOPE,
        status: "invited",
        invited_at: new Date().toISOString(),
      })
      .select("id, status, trade")
      .single();

    expect(error).toBeNull();
    expect(eng.status).toBe("invited");
    expect(eng.trade).toBe(TRADE);
    ctx.engagementId = eng.id;
    console.log(`✓ Engagement seeded: ${eng.id} status=${eng.status} trade=${eng.trade}`);
  });

  // ── Step 3-5: Sub sees engagement and submits bid ──────────────────────────

  test("Step 2: Sub sees engagement in 'Action needed'", async ({ page }) => {
    expect(ctx.engagementId).toBeTruthy();
    await login(page, SUB.email, SUB.password);

    // My Engagements section is always visible (above tabs)
    await expect(page.getByText("My Engagements")).toBeVisible({ timeout: 8000 });
    await expect(page.getByText("ACTION NEEDED")).toBeVisible({ timeout: 6000 });

    // Row should appear with trade and status pill
    await expect(page.getByText(TRADE)).toBeVisible({ timeout: 6000 });
    await expect(page.getByText("Invited", { exact: false }).first()).toBeVisible();

    // "Submit your bid" badge visible on the row
    await expect(page.getByText("Submit your bid")).toBeVisible();
    console.log("✓ Sub sees engagement in 'Action needed' — trade visible, status=Invited");
  });

  test("Step 3: Sub opens detail modal and submits bid", async ({ page }) => {
    expect(ctx.engagementId).toBeTruthy();
    await login(page, SUB.email, SUB.password);
    await page.waitForTimeout(1000); // let engagements load

    // Click engagement row (cursor:pointer divs in the engagements section)
    const row = page.locator("div[style*='cursor: pointer']").filter({ hasText: TRADE }).first();
    await expect(row).toBeVisible({ timeout: 8000 });
    await row.click();

    // Modal opens and loads — trade and status visible
    await expect(page.locator(".modal").filter({ hasText: TRADE })).toBeVisible({ timeout: 8000 });
    await expect(page.locator(".modal").getByText("Invited", { exact: false }).first()).toBeVisible();

    // Click "Submit your bid" → edit mode
    await page.locator("button.btn-navy").filter({ hasText: "Submit your bid" }).click();

    // Edit mode: breadcrumb visible
    await expect(page.getByText(/Submitting bid for/)).toBeVisible({ timeout: 3000 });

    // Fill total amount
    const amountInput = page.locator("input[type='number']").first();
    await reactFill(page, "input[type='number']", "5000");
    await expect(amountInput).toHaveValue("5000");

    // Fill terms
    await page.locator("textarea").fill("2-week completion, materials included");

    // Submit
    await page.locator("button.btn-navy").filter({ hasText: "Submit Bid" }).click();

    // Modal should refetch and show "Bid Submitted" status pill
    await expect(page.locator("span").filter({ hasText: "Bid Submitted" }).first()).toBeVisible({ timeout: 10000 });

    // Verify DB: engagement → bid_submitted
    const { data: eng } = await admin
      .from("job_sub_engagements")
      .select("id, status")
      .eq("id", ctx.engagementId)
      .single();
    expect(eng.status).toBe("bid_submitted");

    // Verify DB: engagement_bid created with is_current=true
    const { data: bid } = await admin
      .from("engagement_bids")
      .select("id, total_amount, is_current, drafted_by")
      .eq("engagement_id", ctx.engagementId)
      .single();
    expect(bid).not.toBeNull();
    expect(bid.is_current).toBe(true);
    expect(bid.total_amount).toBe(5000);

    console.log(`✓ Bid submitted: amount=${bid.total_amount} status=bid_submitted`);
  });

  // ── Step 6-7: PM accepts bid ───────────────────────────────────────────────

  test("Step 4: PM sees bid_submitted in SubsTab and accepts", async ({ page }) => {
    expect(ctx.engagementId).toBeTruthy();
    await login(page, PM.email, PM.password);

    // Navigate to Projects → find the job row in the desktop table
    await navTo(page, "Projects");
    // Desktop renders jobs in a <table> — each row has a .cell-a div with the address.
    // Use the table row so we don't accidentally grab a parent container div.
    const jobRow = page.getByRole("row").filter({ hasText: "1206 Lucy Webb Rd" }).filter({ hasText: "Raymore" });
    await expect(jobRow).toBeVisible({ timeout: 8000 });
    await jobRow.click();

    // Navigate to Subs tab within job detail
    await page.waitForTimeout(800);
    const subsTab = page.locator("button").filter({ hasText: /^Subs$/ }).first();
    await subsTab.scrollIntoViewIfNeeded();
    await subsTab.click();
    await page.waitForTimeout(600);

    // Engagements section: find row with bid amount $5,000
    await expect(page.getByText(/5,000|5000/).first()).toBeVisible({ timeout: 8000 });

    // Accept button on the bid_submitted row
    const acceptBtn = page.locator("button").filter({ hasText: "Accept" }).first();
    await expect(acceptBtn).toBeVisible({ timeout: 6000 });

    // Handle window.confirm
    page.once("dialog", dialog => dialog.accept());
    await acceptBtn.click();

    // Wait for UI update — row should move to Active group
    await page.waitForTimeout(2000);

    // Verify DB: engagement → active
    const { data: eng } = await admin
      .from("job_sub_engagements")
      .select("id, status")
      .eq("id", ctx.engagementId)
      .single();
    expect(eng.status).toBe("active");
    console.log("✓ Bid accepted → engagement status=active");
  });

  // ── Step 8: Schedule items auto-drafted ───────────────────────────────────

  test("Step 5: Schedule items auto-drafted with engagement_id stamped", async () => {
    expect(ctx.engagementId).toBeTruthy();

    const { data: items, error } = await admin
      .from("schedule_items")
      .select("id, title, engagement_id, assigned_sub_id, trade, notes, status")
      .eq("engagement_id", ctx.engagementId);

    expect(error).toBeNull();
    expect(items).not.toBeNull();
    expect(items.length).toBeGreaterThan(0);

    const item = items[0];
    expect(item.engagement_id).toBe(ctx.engagementId);
    expect(item.assigned_sub_id).toBe(SUB_ID);
    expect(item.trade).toBe(TRADE);
    expect(item.status).toBe("scheduled");
    // lump-sum bid → placeholder note
    expect(item.notes).toContain("Auto-drafted from bid acceptance");

    ctx.scheduleItemIds = items.map(i => i.id);
    console.log(`✓ ${items.length} schedule item(s) auto-drafted: "${item.title}" engagement_id=${item.engagement_id}`);
    console.log(`  notes: "${item.notes}"`);
  });

  // ── Edge case: double-submit rejected ─────────────────────────────────────

  test("Edge case: double-submit returns 409 on second attempt", async () => {
    // Create a fresh engagement in invited state for this test
    // Use a unique trade to avoid the one_live_engagement unique constraint
    // (the main engagement is now active on TRADE; this needs a different trade)
    const DOUBLE_TRADE = "Flooring - LVP - DoubleSubmitTest";
    const { data: eng2, error: engErr } = await admin
      .from("job_sub_engagements")
      .insert({
        tenant_id: TENANT_ID,
        job_id: JOB_ID,
        sub_id: SUB_ID,
        trade: DOUBLE_TRADE,
        bid_type: "sub_drafted",
        scope_description: "Double-submit test engagement",
        status: "invited",
        invited_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    expect(engErr).toBeNull();
    expect(eng2).not.toBeNull();
    const doubleEngId = eng2.id;

    // Sign in as test-sub to get a real access token
    const subClient = createClient(SB_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authErr } = await subClient.auth.signInWithPassword({
      email: SUB.email,
      password: SUB.password,
    });
    expect(authErr).toBeNull();
    const token = authData.session.access_token;

    const payload = {
      engagementId: doubleEngId,
      totalAmount: 2500,
      terms: null,
      startDate: null,
      endDate: null,
      lineItems: null,
      attachedDocIds: [],
    };
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    // Fire both simultaneously
    const [r1, r2] = await Promise.all([
      fetch(`${FN_BASE}/submit-bid-response`, { method: "POST", headers, body: JSON.stringify(payload) }),
      fetch(`${FN_BASE}/submit-bid-response`, { method: "POST", headers, body: JSON.stringify(payload) }),
    ]);

    const [j1, j2] = await Promise.all([r1.json(), r2.json()]);
    const statuses = [r1.status, r2.status].sort();
    console.log(`  req1: ${r1.status} ok=${j1.ok}  req2: ${r2.status} ok=${j2.ok}`);

    // Exactly one must succeed (200) and one must fail (409 or 400)
    expect(statuses[0]).toBeLessThan(300); // one success
    expect(statuses[1]).toBeGreaterThanOrEqual(400); // one rejection

    // Cleanup: delete the double-test engagement
    await admin.from("engagement_bids").delete().eq("engagement_id", doubleEngId);
    await admin.from("job_sub_engagements").delete().eq("id", doubleEngId);
    console.log(`✓ Double-submit: one 2xx + one 4xx (statuses: ${r1.status}, ${r2.status})`);
  });

});
