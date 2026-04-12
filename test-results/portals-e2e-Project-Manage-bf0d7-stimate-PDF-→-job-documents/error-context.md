# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: portals-e2e.spec.js >> Project Manager — Desktop (1280×800) >> [Project Manager] Step 4 — Save estimate PDF → job_documents
- Location: tests\portals-e2e.spec.js:315:3

# Error details

```
Test timeout of 120000ms exceeded.
```

```
Error: page.click: Test timeout of 120000ms exceeded.
Call log:
  - waiting for locator('button:has-text(\'Generate Estimate\')')
    - locator resolved to <button disabled class="btn btn-ghost">Generate Estimate</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not stable
    - retrying click action
    - waiting 20ms
    2 × waiting for element to be visible, enabled and stable
      - element is not enabled
    - retrying click action
      - waiting 100ms
    213 × waiting for element to be visible, enabled and stable
        - element is not enabled
      - retrying click action
        - waiting 500ms

```

# Test source

```ts
  244 |       testJobId = newJob?.id || null;
  245 |       expect(testJobId).toBeTruthy();
  246 | 
  247 |       // Ensure DB row is complete + set assigned_rep using full_name so sbLoad filter matches
  248 |       await adminSB.from("jobs").upsert({
  249 |         id: testJobId, tenant_id: TENANT_ID, address: jobAddress,
  250 |         status: "lead", client_name: CLIENT_NAME, client_email: CLIENT_EMAIL,
  251 |         client_phone: "913-555-0147", contract_value: 28500, sqft: "99",
  252 |         scope: "", co_total: 0, created_at: new Date().toISOString(),
  253 |         assigned_rep: R.fullName,  // fullName used by sbLoad's assigned_rep filter
  254 |       }, { onConflict: "id" });
  255 | 
  256 |       // Fill client info
  257 |       await page.click("button:has-text('Edit')");
  258 |       await expect(page.locator("input[placeholder='John Smith']")).toBeVisible({ timeout: 5000 });
  259 |       await page.fill("input[placeholder='John Smith']", CLIENT_NAME);
  260 |       await page.fill("input[placeholder='(816) 555-1234']", "913-555-0147");
  261 |       await page.fill("input[placeholder='john@email.com']", CLIENT_EMAIL);
  262 |       await page.fill("input[placeholder='85000']", "28500");
  263 |       await page.fill("input[placeholder='1879']", "99");
  264 |       await page.click("button:has-text('Save Details')");
  265 |       await page.waitForTimeout(1500);
  266 |     } else {
  267 |       // PM verifies they can SEE the pre-created job
  268 |       await waitForJobsLoaded(page);
  269 |       await expect(page.locator(`text=${jobAddress}`).first()).toBeVisible({ timeout: 15000 });
  270 |     }
  271 |   });
  272 | 
  273 |   // ── Steps 2–3 — AI Estimator ────────────────────────────────────────────────
  274 |   test(`[${R.label}] Steps 2–3 — AI Estimator generates estimate`, async ({ page }) => {
  275 |     test.setTimeout(180000); // AI call can be slow — 3 min buffer
  276 |     await login(page, R.email, R.password);
  277 |     await openJob(page, jobAddress);
  278 |     await clickTab(page, "Estimate");
  279 | 
  280 |     await expect(page.locator("button:has-text('Open Estimator')")).toBeVisible({ timeout: 8000 });
  281 |     await page.click("button:has-text('Open Estimator')");
  282 |     await expect(page.locator("text=AI Estimator").first()).toBeVisible({ timeout: 8000 });
  283 | 
  284 |     const resetBtn = page.locator("button:has-text('Reset')");
  285 |     if (await resetBtn.isVisible().catch(() => false)) await resetBtn.click();
  286 | 
  287 |     const scopeTA = page.locator("textarea[placeholder*='Full kitchen remodel']");
  288 |     await expect(scopeTA).toBeVisible({ timeout: 10000 });
  289 |     await scopeTA.click();
  290 |     await scopeTA.type("Full demo of existing master bath (99 sq ft). Walk-in tile shower, heated floor, dual sink vanity, full plumbing and electrical.", { delay: 0 });
  291 | 
  292 |     await page.evaluate(() => {
  293 |       function rs(sel, val) {
  294 |         const el = document.querySelector(sel);
  295 |         if (!el) return;
  296 |         const s = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set;
  297 |         s.call(el, val);
  298 |         el.dispatchEvent(new Event("input",  { bubbles: true }));
  299 |         el.dispatchEvent(new Event("change", { bubbles: true }));
  300 |       }
  301 |       rs("input[placeholder*='Kitchen, Master Bath']", "Master Bath");
  302 |       rs("input[type='number'][placeholder*='1200']", "99");
  303 |     });
  304 | 
  305 |     await expect(page.locator("button:has-text('Generate Estimate')")).toBeEnabled({ timeout: 5000 });
  306 |     await page.click("button:has-text('Generate Estimate')");
  307 |     await expect(page.locator("button:has-text('Save PDF')")).toBeVisible({ timeout: 90000 });
  308 | 
  309 |     const txt = await page.locator(".modal").first().textContent();
  310 |     expect(txt.trim().length).toBeGreaterThan(200);
  311 |     expect(/tile|shower|bath|floor|demo/i.test(txt)).toBe(true);
  312 |   });
  313 | 
  314 |   // ── Step 4 — Save estimate PDF ───────────────────────────────────────────────
  315 |   test(`[${R.label}] Step 4 — Save estimate PDF → job_documents`, async ({ page }) => {
  316 |     test.setTimeout(120000);
  317 |     await login(page, R.email, R.password);
  318 |     await openJob(page, jobAddress);
  319 |     await clickTab(page, "Estimate");
  320 | 
  321 |     await page.click("button:has-text('Open Estimator')");
  322 |     await expect(page.locator("text=AI Estimator").first()).toBeVisible({ timeout: 8000 });
  323 | 
  324 |     const resetBtn = page.locator("button:has-text('Reset')");
  325 |     if (await resetBtn.isVisible().catch(() => false)) await resetBtn.click();
  326 | 
  327 |     const scopeTA = page.locator("textarea[placeholder*='Full kitchen remodel']");
  328 |     await expect(scopeTA).toBeVisible({ timeout: 10000 });
  329 |     await scopeTA.click();
  330 |     await scopeTA.type("Full demo master bath 99 sqft. Shower, heated floor, vanity, plumbing, electrical.", { delay: 0 });
  331 | 
  332 |     await page.evaluate(() => {
  333 |       function rs(sel, val) {
  334 |         const el = document.querySelector(sel); if (!el) return;
  335 |         const s = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set;
  336 |         s.call(el, val);
  337 |         el.dispatchEvent(new Event("input", { bubbles: true }));
  338 |         el.dispatchEvent(new Event("change", { bubbles: true }));
  339 |       }
  340 |       rs("input[placeholder*='Kitchen, Master Bath']", "Master Bath");
  341 |       rs("input[type='number'][placeholder*='1200']", "99");
  342 |     });
  343 | 
> 344 |     await page.click("button:has-text('Generate Estimate')");
      |                ^ Error: page.click: Test timeout of 120000ms exceeded.
  345 |     await expect(page.locator("button:has-text('Save PDF')")).toBeVisible({ timeout: 90000 });
  346 |     await page.click("button:has-text('Save PDF')");
  347 |     await expect(page.locator("text=Saved to Documents")).toBeVisible({ timeout: 15000 });
  348 | 
  349 |     await new Promise(r => setTimeout(r, 2000));
  350 |     const { data: docs } = await adminSB.from("job_documents").select("id,name").eq("job_id", testJobId);
  351 |     expect(docs?.length).toBeGreaterThan(0);
  352 |   });
  353 | 
  354 |   // ── Step 5 — Proposal (best effort) ─────────────────────────────────────────
  355 |   test(`[${R.label}] Step 5 — Proposal generation (best effort)`, async ({ page }) => {
  356 |     test.setTimeout(60000);
  357 |     await login(page, R.email, R.password);
  358 |     await openJob(page, jobAddress);
  359 |     await clickTab(page, "Estimate");
  360 | 
  361 |     // If proposal button exists, try it — don't fail if AI doesn't return valid JSON
  362 |     const proposalBtn = page.locator("button:has-text('Generate Proposal')").first();
  363 |     const hasProposal = await proposalBtn.isVisible({ timeout: 5000 }).catch(() => false);
  364 |     if (hasProposal) {
  365 |       await proposalBtn.click();
  366 |       await page.waitForTimeout(30000);
  367 |       await page.keyboard.press("Escape");
  368 |     }
  369 |     // Step passes regardless — proposal is best-effort
  370 |   });
  371 | 
  372 |   // ── Step 6 — Send contract ───────────────────────────────────────────────────
  373 |   test(`[${R.label}] Step 6 — Send contract to ${CLIENT_EMAIL}`, async ({ page }) => {
  374 |     await login(page, R.email, R.password);
  375 |     await openJob(page, jobAddress);
  376 | 
  377 |     await expect(page.locator("button:has-text('Send Contract')")).toBeVisible({ timeout: 8000 });
  378 |     await page.click("button:has-text('Send Contract')");
  379 |     await expect(page.locator("text=Send Contract").last()).toBeVisible({ timeout: 6000 });
  380 | 
  381 |     const emailVal = await page.inputValue("input[type='email'][placeholder='client@email.com']");
  382 |     expect(emailVal).toBe(CLIENT_EMAIL);
  383 | 
  384 |     await page.click("button:has-text('Send Contract to Client')");
  385 |     await expect(page.locator("button:has-text('Send Contract to Client')")).not.toBeVisible({ timeout: 25000 });
  386 |   });
  387 | 
  388 |   // ── Step 7 — Client signs contract ──────────────────────────────────────────
  389 |   test(`[${R.label}] Step 7 — Client signs → status active + signed PDF in docs`, async ({ page }) => {
  390 |     // Reset contract state
  391 |     await adminSB.from("jobs").update({ contract_signed: false, status: "lead" }).eq("id", testJobId);
  392 |     await adminSB.from("contract_signatures").delete().eq("job_id", testJobId);
  393 |     await adminSB.from("job_documents").delete().eq("job_id", testJobId).eq("file_type", "contract");
  394 | 
  395 |     await page.goto(APP_URL);
  396 |     await expect(page.locator("input[type='email']")).toBeVisible({ timeout: 10000 });
  397 |     await page.evaluate(([e, p]) => {
  398 |       function rs(el, v) {
  399 |         const s = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set;
  400 |         s.call(el, v); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true }));
  401 |       }
  402 |       rs(document.querySelector("input[type='email']"), e);
  403 |       rs(document.querySelector("input[type='password']"), p);
  404 |     }, [CLIENT_EMAIL, CLIENT_PASSWORD]);
  405 |     await page.locator("button").filter({ hasText: /^Sign In$/ }).click();
  406 |     await expect(page.locator(`text=${jobAddress}`).first()).toBeVisible({ timeout: 15000 });
  407 |     await page.locator(`text=${jobAddress}`).first().click();
  408 | 
  409 |     await expect(page.locator("button:has-text('Sign Now')")).toBeVisible({ timeout: 10000 });
  410 |     await page.click("button:has-text('Sign Now')");
  411 |     await expect(page.locator("text=Review Contract")).toBeVisible({ timeout: 8000 });
  412 |     await page.click("button:has-text(\"I've Read It — Sign →\")");
  413 | 
  414 |     await expect(page.locator("text=Sign Contract")).toBeVisible({ timeout: 8000 });
  415 |     const canvas = page.locator("canvas").first();
  416 |     const box = await canvas.boundingBox();
  417 |     await page.mouse.move(box.x + 40, box.y + 40);
  418 |     await page.mouse.down();
  419 |     await page.mouse.move(box.x + box.width - 40, box.y + box.height - 40, { steps: 15 });
  420 |     await page.mouse.up();
  421 | 
  422 |     await page.click("button:has-text('Sign & Submit')");
  423 |     await page.waitForTimeout(8000);
  424 |     await expect(page.locator("button:has-text('Sign Now')")).not.toBeVisible({ timeout: 10000 });
  425 | 
  426 |     const { data: job } = await adminSB.from("jobs").select("contract_signed,status").eq("id", testJobId).single();
  427 |     expect(job.contract_signed).toBe(true);
  428 |     expect(job.status).toBe("active");
  429 |   });
  430 | 
  431 |   // ── Step 8 — Add note + notification ────────────────────────────────────────
  432 |   test(`[${R.label}] Step 8 — Add note → notification in DB`, async ({ page }) => {
  433 |     await login(page, R.email, R.password);
  434 |     await openJob(page, jobAddress);
  435 |     await clickTab(page, "Notes");
  436 | 
  437 |     await page.fill("textarea[placeholder*='Site conditions']", `${R.label} test note — tile ordered, eta 5 days`);
  438 |     await page.click("button:has-text('Add Note')");
  439 |     await page.waitForTimeout(2000);
  440 |     await expect(page.locator("text=test note").first()).toBeVisible({ timeout: 8000 });
  441 | 
  442 |     const { data: notifs } = await adminSB.from("notifications").select("id").eq("job_id", testJobId).eq("type", "note_posted");
  443 |     expect(notifs?.length).toBeGreaterThan(0);
  444 |   });
```