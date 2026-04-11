// @ts-check
const { test, expect } = require("@playwright/test");
const { createClient } = require("@supabase/supabase-js");

const APP_URL = "http://localhost:3737";
const SB_URL = "https://cbfftukmhqvvjlrlnltk.supabase.co";
const SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiZmZ0dWttaHF2dmpscmxubHRrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTYxNDY4OCwiZXhwIjoyMDkxMTkwNjg4fQ.oa4fqY82eLMUmq8egx1IOtBbOi-2Q5ofP1e0NU0ZmNs";

const REP_EMAIL = "test-rep@avenstonekc.com";
const REP_PASSWORD = "TestRep2026!";
const CLIENT_EMAIL = "kalinspratling@gmail.com";
const CLIENT_PASSWORD = "TestClient2026!";
const TEST_JOB_ADDRESS = "14001 Dunham Rd";
const TEST_JOB_ID = "1775938002546";

const adminSB = createClient(SB_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function resetTestJob() {
  await adminSB.from("jobs").update({ contract_signed: false, contract_signed_at: null, status: "lead" }).eq("id", TEST_JOB_ID);
  await adminSB.from("contract_signatures").delete().eq("job_id", TEST_JOB_ID);
  await adminSB.from("job_documents").delete().eq("job_id", TEST_JOB_ID);
}

// Helper: log in as rep
async function loginAsRep(page) {
  await page.goto(APP_URL);
  await page.fill("input[type='email']", REP_EMAIL);
  await page.fill("input[type='password']", REP_PASSWORD);
  await page.click("button:has-text('Sign In')");
  await expect(page.locator("text=Dashboard").first()).toBeVisible({ timeout: 15000 });
}

// Helper: log in as client (uses password instead of magic link)
async function loginAsClient(page) {
  await page.goto(APP_URL);
  await page.fill("input[type='email']", CLIENT_EMAIL);
  await page.fill("input[type='password']", CLIENT_PASSWORD);
  await page.click("button:has-text('Sign In')");
  await expect(page.locator(`text=${TEST_JOB_ADDRESS}`)).toBeVisible({ timeout: 15000 });
}

async function openTestJob(page) {
  // Navigate to Projects list
  await page.click("text=Projects");
  await expect(page.locator(`text=${TEST_JOB_ADDRESS}`)).toBeVisible({ timeout: 10000 });
  await page.locator(`text=${TEST_JOB_ADDRESS}`).first().click();
  // Job detail loads with INFO tab — verify by checking the tab exists
  await expect(page.locator("text=INFO").first()).toBeVisible({ timeout: 8000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: Staff Login
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Staff Login", () => {
  test("login screen renders", async ({ page }) => {
    await page.goto(APP_URL);
    await expect(page.locator("input[type='email']")).toBeVisible({ timeout: 10000 });
  });

  test("wrong password shows error", async ({ page }) => {
    await page.goto(APP_URL);
    await page.fill("input[type='email']", REP_EMAIL);
    await page.fill("input[type='password']", "wrongpassword");
    await page.click("button:has-text('Sign In')");
    await expect(page.locator("text=Invalid login credentials")).toBeVisible({ timeout: 8000 });
  });

  test("correct credentials log in and show Dashboard", async ({ page }) => {
    await loginAsRep(page);
    await expect(page.locator("text=Good")).toBeVisible({ timeout: 8000 }); // "Good afternoon, Test."
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: Jobs List (Projects)
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Jobs List (Rep)", () => {
  test("Dunham Rd job is visible in Projects list", async ({ page }) => {
    await loginAsRep(page);
    await page.click("text=Projects");
    await expect(page.locator(`text=${TEST_JOB_ADDRESS}`)).toBeVisible({ timeout: 10000 });
  });

  test("clicking a job opens job detail with tabs", async ({ page }) => {
    await loginAsRep(page);
    await openTestJob(page);
    // INFO tab is selected by default on the rep job detail
    await expect(page.locator("text=SCHEDULE")).toBeVisible({ timeout: 8000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: Send Contract Modal (Rep side)
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Send Contract (Rep)", () => {
  test("Send Contract button is visible on job detail", async ({ page }) => {
    await loginAsRep(page);
    await openTestJob(page);
    await expect(page.locator("button:has-text('Send Contract')")).toBeVisible({ timeout: 8000 });
  });

  test("Send Contract modal opens with email field", async ({ page }) => {
    await loginAsRep(page);
    await openTestJob(page);
    await page.click("button:has-text('Send Contract')");
    await expect(page.locator("text=Send Contract").last()).toBeVisible({ timeout: 6000 });
    await expect(page.locator("input[type='email'], input[placeholder*='email'], input[placeholder*='Email']").last()).toBeVisible({ timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: Client Portal
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Client Portal", () => {
  test("client logs in and sees their job", async ({ page }) => {
    await loginAsClient(page);
    await expect(page.locator(`text=${TEST_JOB_ADDRESS}`)).toBeVisible({ timeout: 5000 });
  });

  test("client can open job and see Overview tab", async ({ page }) => {
    await loginAsClient(page);
    await page.locator(`text=${TEST_JOB_ADDRESS}`).first().click();
    await expect(page.locator("text=Overview")).toBeVisible({ timeout: 8000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5: Contract Signing (End-to-End)
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Contract Signing (End-to-End)", () => {
  test.beforeAll(async () => {
    await resetTestJob();
  });

  test("client sees Sign Now banner when contract is unsigned", async ({ page }) => {
    await loginAsClient(page);
    await page.locator(`text=${TEST_JOB_ADDRESS}`).first().click();
    await expect(page.locator("button:has-text('Sign Now')")).toBeVisible({ timeout: 10000 });
  });

  test("contract modal shows non-empty contract text", async ({ page }) => {
    await loginAsClient(page);
    await page.locator(`text=${TEST_JOB_ADDRESS}`).first().click();
    await page.click("button:has-text('Sign Now')");
    await expect(page.locator("text=Review Contract")).toBeVisible({ timeout: 8000 });
    const contractText = await page.locator("pre").textContent();
    expect(contractText.trim().length).toBeGreaterThan(100);
  });

  test("client signs and status flips to Active", async ({ page }) => {
    await resetTestJob();
    await loginAsClient(page);
    await page.locator(`text=${TEST_JOB_ADDRESS}`).first().click();

    // Open signing modal
    await page.click("button:has-text('Sign Now')");
    await expect(page.locator("text=Review Contract")).toBeVisible({ timeout: 8000 });

    // Proceed to signature step
    await page.click("button:has-text(\"I've Read It — Sign →\")");
    await expect(page.locator("text=Sign Contract")).toBeVisible({ timeout: 6000 });

    // Draw signature on canvas
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

    // Submit
    await page.click("button:has-text('Sign & Submit')");

    // Wait for save (storage upload + DB writes)
    await page.waitForTimeout(8000);

    // Banner should be gone
    await expect(page.locator("button:has-text('Sign Now')")).not.toBeVisible({ timeout: 10000 });

    // Verify DB
    const { data } = await adminSB.from("jobs").select("contract_signed, status").eq("id", TEST_JOB_ID).single();
    expect(data.contract_signed).toBe(true);
    expect(data.status).toBe("active");
  });

  test("signed PDF saved to job_documents with client_visible=true", async () => {
    const { data: docs } = await adminSB
      .from("job_documents")
      .select("*")
      .eq("job_id", TEST_JOB_ID)
      .eq("file_type", "contract");
    expect(docs.length).toBeGreaterThan(0);
    expect(docs[0].client_visible).toBe(true);
    expect(docs[0].file_url).toBeTruthy();
  });

  test("rep can see signed contract in Documents tab", async ({ page }) => {
    await loginAsRep(page);
    await openTestJob(page);
    await page.locator("text=DOCUMENTS").first().click();
    await page.waitForTimeout(2000);
    await expect(page.locator("text=Signed Contract")).toBeVisible({ timeout: 10000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6: Document Upload (Rep)
// ─────────────────────────────────────────────────────────────────────────────
test.describe("Document Upload (Rep)", () => {
  test("upload a file and it appears in Documents", async ({ page }) => {
    await loginAsRep(page);
    await openTestJob(page);
    await page.locator("text=DOCUMENTS").first().click();
    await page.waitForTimeout(1500);

    const fileInput = page.locator("input[type='file']").first();
    await expect(fileInput).toBeAttached({ timeout: 8000 });
    await fileInput.setInputFiles({
      name: "test-upload.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 test document"),
    });

    await expect(page.locator("text=test-upload.pdf")).toBeVisible({ timeout: 12000 });
  });
});
