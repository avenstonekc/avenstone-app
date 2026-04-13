# Avenstone Test Strategy

## Overview

The test suite covers three roles (rep, PM, sub, client) across three viewport sizes. Full runs take 20–40 minutes due to live AI calls. This document defines when to run what, how to run it fast, and what to mock.

---

## Test Files

| File | What it tests | ~Time |
|------|--------------|-------|
| `avenstone.spec.js` | Smoke: login, dashboard, job list, tab rendering | ~2 min |
| `e2e-bathroom-remodel.spec.js` | Full remodel workflow (18 steps) including AI estimate, contract, CO, payments, signoff | ~15 min |
| `portals-e2e.spec.js` | Sales rep, PM, sub, client portal views at desktop/mobile/iPad | ~25 min |

---

## When to Run What

### Daily development (fastest feedback)
```bash
npx playwright test avenstone.spec.js
```
- Runs in ~2 min
- Catches login regressions, broken tabs, missing UI elements
- No AI calls

### After changing job workflow logic
```bash
npx playwright test e2e-bathroom-remodel.spec.js
```
- Full 18-step remodel flow
- Run this after touching: estimate modal, contract modal, change orders, payments, completion signoff
- AI calls are live — takes 10–15 min

### Before deploying or merging to main
```bash
npx playwright test
```
- Runs all three files
- Always run at desktop viewport first
- Full run: ~40 min

### Pre-release (mobile + iPad)
```bash
npx playwright test --project=mobile --project=ipad
```
- Only run when you're about to publish to App Store / Play Store
- Not needed for web deploys

---

## AI Estimator — Mock vs Live

### The problem
AI estimate calls take 30–90 seconds each. Running 10 tests that each call the AI adds 5–15 minutes to the suite.

### Rule: Mock in repeating steps, live in dedicated steps

**Steps 2-3 of `e2e-bathroom-remodel.spec.js`** run the real AI call. That's the one test that validates AI is wired up and returning valid responses.

**All other tests that need an estimate** should use a seeded job that already has an estimate saved — skip the AI call entirely.

### How to pre-seed test data (future improvement)
Create a `beforeAll` or fixture that inserts a job with `estimate_json` already populated. Then tests that only need the estimate to exist (PDF generation, proposal, contract flow) skip straight to that step.

---

## Viewport Strategy

| Scenario | Viewports to test |
|----------|------------------|
| Daily dev | Desktop only |
| Role-specific UI (sub portal, client portal) | Desktop only |
| Pre-release | Desktop + Mobile + iPad |
| App Store build | Mobile only |

Run mobile/iPad only when you know the viewport-specific UI has changed or you're cutting a release.

---

## Role Testing Strategy

Each role needs its own login state. Currently each role test calls `loginAs*()` which triggers the full login flow.

**Current approach** (slow but simple):
- Each test logs in fresh
- Works but adds ~10s per test

**Faster approach** (implement after Vite consolidation):
- Use Playwright `storageState` to save login cookies per role
- Load saved state at start of each test — no login flow
- Setup once in `globalSetup.js`, reuse across all tests

```js
// globalSetup.js (future)
for (const role of ['rep', 'pm', 'sub', 'client']) {
  await loginAndSave(role); // saves to tests/auth/{role}.json
}

// In test file
test.use({ storageState: 'tests/auth/rep.json' });
```

---

## Parallel Workers

Current config: 1 worker (serial, safe for shared DB).

**Do not increase workers** until you have per-test job isolation. Right now tests share the same test job (`TEST_JOB_ID`). Running parallel workers would cause step conflicts.

**When you can parallelize:**
- Each test creates its own job and cleans up after
- Use a test DB (separate Supabase project) so parallel runs don't collide
- Set `workers: 4` in `playwright.config.js`

---

## Test Run Commands

```bash
# Smoke only (2 min)
npx playwright test avenstone.spec.js

# Full remodel workflow (15 min)
npx playwright test e2e-bathroom-remodel.spec.js

# Portals — all roles, desktop only (10 min)
npx playwright test portals-e2e.spec.js --project=desktop

# Portals — all viewports (25 min)
npx playwright test portals-e2e.spec.js

# Everything (40 min)
npx playwright test

# UI mode (debug failures visually)
npx playwright test --ui

# Single step debug
npx playwright test e2e-bathroom-remodel.spec.js --grep "Step 6"

# Show report after run
npx playwright show-report
```

---

## What Each Test Validates

### `e2e-bathroom-remodel.spec.js` — 18 steps

| Step | What it tests |
|------|--------------|
| 1 | Create new job, verify it appears in list |
| 2-3 | AI estimate generates, PDF opens, estimate saved to DB |
| 4 | Estimate doc saved in job_documents |
| 5 | Proposal doc saved in job_documents |
| 6 | Contract email sends (button disappears = success) |
| 7 | Job status changes (DB + notification created) |
| 8 | Note posted + notification fires |
| 9 | Status change updates badge color |
| 10 | Change order created and approved |
| 11 | Financial summary reflects CO total |
| 12 | CO shows in Change Orders tab |
| 13 | Payment request created |
| 14 | Payment link appears, payment marked paid |
| 15 | Completion signoff modal loads |
| 16 | Completion signoff saves to DB |
| 17 | Documents tab shows all uploaded docs |
| 18 | Final job summary matches expected values |

---

## Speed Improvements to Implement

Priority order:

1. **Shared auth state** — biggest win, saves 10s × N tests
2. **Pre-seeded estimate** — skips 30–90s AI call per test that doesn't need to test AI
3. **Desktop-only for role tests** — cut portal suite from 25 min to 10 min day-to-day
4. **Smoke vs full split** — already done, just follow the "when to run what" table above
5. **Per-test job isolation** — required before you can run parallel workers

---

## Common Failures and Fixes

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Contract sent!" never visible | React 18 batches modal close — text never renders | Wait for button to disappear instead (current fix). Real fix: toast outside modal |
| `span[style*='width:12px']` not found | React renders `{width:12}` as `width: 12px` (space) | Use `span[style*='12px']` |
| Strict mode: multiple elements match | Tab label AND summary heading both match `text=Change Orders` | Add `.first()` |
| AI estimate times out | OpenAI/Claude slow or quota hit | Wrap in `Promise.race` with 120s timeout |
| `loginAsRep` hangs on Step 11 | Already logged in — app shows Dashboard, not login form | Use `page.goto(APP_URL)` instead of calling loginAs* again |
| Notification count = 0 | DB CHECK constraint missing notification type | Add type to constraint via migration |
| Doc save fails silently | `file_type` CHECK constraint missing new type | Add type to constraint via migration |

---

## Notes

- Never test with `kalin@avenstonekc.com` — role detection maps it to client and breaks rep-only flows
- Always verify DB writes independently from UI (use `sb.from(...)` in test) — UI showing something ≠ DB has it
- Keep `TEST_JOB_ADDRESS` unique per run if you ever parallelize (`${Date.now()} Test Job`)
- Portal tests should use a dedicated test client email — never a real client
