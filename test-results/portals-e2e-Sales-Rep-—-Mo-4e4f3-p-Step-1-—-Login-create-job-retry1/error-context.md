# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: portals-e2e.spec.js >> Sales Rep — Mobile (390×844) >> [Sales Rep] Step 1 — Login + create job
- Location: tests\portals-e2e.spec.js:224:3

# Error details

```
Error: expect(received).toBeTruthy()

Received: null
```

# Test source

```ts
  145 |   }
  146 |   await adminSB.from("profiles").upsert({
  147 |     id: userId, tenant_id: TENANT_ID, email, full_name: fullName, role,
  148 |     notification_email: false,
  149 |   }, { onConflict: "id" });
  150 |   return userId;
  151 | }
  152 | 
  153 | async function cleanJob(address) {
  154 |   const { data: old } = await adminSB.from("jobs").select("id").eq("address", address).order("created_at", { ascending: false });
  155 |   if (!old?.length) return;
  156 |   for (const j of old) {
  157 |     for (const tbl of ["change_orders","job_documents","job_notes","contract_signatures","payments","notifications","job_phases","job_subs"]) {
  158 |       await adminSB.from(tbl).delete().eq("job_id", j.id);
  159 |     }
  160 |     await adminSB.from("jobs").delete().eq("id", j.id);
  161 |   }
  162 | }
  163 | 
  164 | async function createJobViaAdmin(address, clientUserId) {
  165 |   const id = crypto.randomUUID();
  166 |   await adminSB.from("jobs").insert({
  167 |     id, tenant_id: TENANT_ID, address, status: "lead",
  168 |     client_name: CLIENT_NAME, client_email: CLIENT_EMAIL,
  169 |     client_phone: "913-555-0147", contract_value: 28500, sqft: "99",
  170 |     scope: "Full master bath remodel", co_total: 0,
  171 |     client_user_id: clientUserId, created_at: new Date().toISOString(),
  172 |   });
  173 |   return id;
  174 | }
  175 | 
  176 | // ─────────────────────────────────────────────────────────────────────────────
  177 | // Global beforeAll — create/patch all test users once
  178 | // ─────────────────────────────────────────────────────────────────────────────
  179 | 
  180 | let pmId, repId, subId, clientId;
  181 | 
  182 | test.beforeAll(async () => {
  183 |   // Silence notification emails for entire tenant during test run
  184 |   await adminSB.from("profiles").update({ notification_email: false }).eq("tenant_id", TENANT_ID);
  185 | 
  186 |   const { data: { users } } = await adminSB.auth.admin.listUsers();
  187 |   pmId    = await ensureUser(users, ROLES.pm.email,  ROLES.pm.password,  ROLES.pm.role,  ROLES.pm.fullName);
  188 |   repId   = await ensureUser(users, ROLES.rep.email, ROLES.rep.password, ROLES.rep.role, ROLES.rep.fullName);
  189 |   subId   = await ensureUser(users, ROLES.sub.email, ROLES.sub.password, ROLES.sub.role, ROLES.sub.fullName);
  190 |   clientId = await ensureUser(users, CLIENT_EMAIL, CLIENT_PASSWORD, "client", CLIENT_NAME);
  191 | });
  192 | 
  193 | test.afterAll(async () => {
  194 |   // Always restore email notifications after tests finish
  195 |   await adminSB.from("profiles").update({ notification_email: true }).eq("tenant_id", TENANT_ID);
  196 | });
  197 | 
  198 | // ─────────────────────────────────────────────────────────────────────────────
  199 | // Helper: run the 14-step flow for owner-equivalent roles (PM + Rep)
  200 | // jobAddress must be unique per describe block
  201 | // ─────────────────────────────────────────────────────────────────────────────
  202 | 
  203 | function defineOwnerFlow(roleKey, jobAddress, canCreateJob) {
  204 |   const R = ROLES[roleKey];
  205 |   let testJobId = null;
  206 | 
  207 |   test.beforeAll(async () => {
  208 |     await cleanJob(jobAddress);
  209 |     if (!canCreateJob) {
  210 |       // PM can't create jobs — pre-create via admin
  211 |       testJobId = await createJobViaAdmin(jobAddress, clientId);
  212 |     }
  213 |   });
  214 | 
  215 |   test.afterAll(async () => {
  216 |     if (!testJobId) return;
  217 |     for (const tbl of ["change_orders","job_documents","job_notes","contract_signatures","payments","notifications","job_phases","job_subs"]) {
  218 |       await adminSB.from(tbl).delete().eq("job_id", testJobId);
  219 |     }
  220 |     await adminSB.from("jobs").delete().eq("id", testJobId);
  221 |   });
  222 | 
  223 |   // ── Step 1 ──────────────────────────────────────────────────────────────────
  224 |   test(`[${R.label}] Step 1 — Login + ${canCreateJob ? "create job" : "view pre-created job"}`, async ({ page }) => {
  225 |     await login(page, R.email, R.password);
  226 |     await navToProjects(page);
  227 | 
  228 |     if (canCreateJob) {
  229 |       // Rep can create jobs
  230 |       await page.locator("button").filter({ hasText: "New" }).filter({ hasNotText: "Project" }).first().click();
  231 |       await expect(page.locator(".modal-title:has-text('New Project')")).toBeVisible({ timeout: 5000 });
  232 | 
  233 |       // React-aware fill so newA state is properly updated
  234 |       await reactFill(page, "input[placeholder='123 Main St, Kansas City MO']", jobAddress);
  235 | 
  236 |       await page.click("button:has-text('Add Project')");
  237 |       await expect(page.locator(".tabbar").first()).toBeVisible({ timeout: 10000 });
  238 | 
  239 |       // Wait for Supabase write to land, then read job ID directly from DB
  240 |       await page.waitForTimeout(3000);
  241 |       const { data: newJob } = await adminSB
  242 |         .from("jobs").select("id").eq("address", jobAddress)
  243 |         .order("created_at", { ascending: false }).limit(1).single();
  244 |       testJobId = newJob?.id || null;
> 245 |       expect(testJobId).toBeTruthy();
      |                         ^ Error: expect(received).toBeTruthy()
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
  344 |     await page.click("button:has-text('Generate Estimate')");
  345 |     await expect(page.locator("button:has-text('Save PDF')")).toBeVisible({ timeout: 90000 });
```