# Avenstone App — Full Test Protocol

Run this in order. Fix anything broken before moving on. Report findings as a punch list at the end.

---

## 0. Context

Working directory: `C:\Users\Kalin\OneDrive\Documents\GitHub\avenstone-app\avenstone-vite`
App URL for Playwright: `http://localhost:3737` (start with `npm run dev -- --port 3737` if not running)
Playwright specs: `C:\Users\Kalin\OneDrive\Documents\GitHub\avenstone-app\tests\`
Test accounts: PM `test-pm@avenstonekc.com / TestPM2026!` | Rep `test-salesrep@avenstonekc.com / TestSalesRep2026!` | Sub `test-sub@avenstonekc.com / TestSub2026!` | Client `kalinspratling@gmail.com / TestClient2026!`

Read `CLAUDE.md` before touching any code.

---

## 1. Build Integrity

```bash
cd avenstone-vite && npm run build
```

Zero errors required. Warnings about bundle size are expected and ignorable. Fix any real error before continuing.

---

## 2. Code Audit — Known Failure Patterns

Search the codebase for these patterns and report each hit. Fix any that remain after recent sessions.

**2a. Private bucket + public URL (broken downloads)**
```
grep -r "getPublicUrl" src/ --include="*.jsx" --include="*.js"
```
Every hit on `job-documents` or `bid-quotes` bucket is a bug. Only `job-photos` can use `getPublicUrl`. All others must use `createSignedUrl` via the `sbUploadDoc` / `sbLoadDocs` helpers in `supabase.js`. Fix any remaining violations.

**2b. Automatic Opus calls**
```
grep -r "claude-opus" src/ supabase/functions/ --include="*.js" --include="*.ts" --include="*.jsx"
```
Any Opus call in a background function, DB trigger, or loop = violation. Report it. Do not auto-fix — flag to Kalin first.

**2c. Missing error handling on sbUploadDoc**
```
grep -r "sbUploadDoc" src/ --include="*.jsx" --include="*.js"
```
Every call should either check `r.error` or be in a try/catch. Calls that ignore the return value silently fail and show false success to the user. Fix any that don't handle errors.

**2d. Stale docs state**
Check `JobDet.jsx` — confirm the `useEffect` that resets `docsLoaded` on tab change to `'docs'` is present. If missing, re-add it.

**2e. Inline storage uploads outside sbUploadDoc**
```
grep -r "from('job-documents').upload" src/ --include="*.jsx" --include="*.js"
```
Any direct upload to `job-documents` outside of `supabase.js` itself is a violation — it bypasses signed URL logic. Consolidate into `sbUploadDoc`.

---

## 3. Playwright E2E — Full Suite

```bash
cd C:\Users\Kalin\OneDrive\Documents\GitHub\avenstone-app
npx playwright test tests/portals-e2e.spec.js --reporter=list
npx playwright test tests/new-features.spec.js --reporter=list
```

Report: total passed / failed / skipped. For any failure, read the error, find root cause, fix it. Do not skip failures.

---

## 4. Logic Flow Audit — Key User Journeys

Read the code for each flow and trace it end-to-end. Report any broken links in the chain.

**4a. Document upload → DocsTab visible**
Trace: user uploads in `DocsTab` → `sbUploadDoc` → insert to `job_documents` → `setDocs` called → row appears in list → download link uses `signed_url`. Verify the full chain in `DocsTab.jsx` and `supabase.js`.

**4b. Estimate PDF → saved to documents**
Trace: `EstimateTab` "Save PDF" → `sbUploadDoc` → `setDocs(p => [r.doc, ...p])` → visible in DocsTab immediately without re-fetch. Verify `EstimateTab.jsx` lines ~128-132.

**4c. Contract sign → saved to documents + client visible**
Trace: `ClientSignContractModal` submit → `sbUploadDoc` → `update({ client_visible: true })` → signed URL returned → `sbSaveSignature` gets working URL. Verify `ClientSignContractModal.jsx`.

**4d. LiDAR scan → scan saved → floor plan rendered**
Trace: `AiIntakeWizard` → `LidarScanner` → scan result → `sbSaveJobLidarScan` → `FloorPlanTab` loads via `sbGetJobLidarScans` → `FloorPlanCanvas` renders rooms. Confirm the Supabase helper exists and the data shape matches what `FloorPlanCanvas` expects (`rooms[].name`, `rooms[].length`, `rooms[].width`, `rooms[].sqft`).

**4e. Notification bell — fires once per day**
Check `ai-pm-nightly` call site in `App.jsx` or wherever it fires. Confirm there is a localStorage date check preventing it from firing more than once per calendar day. Confirm it is NOT firing on every page load without the date check.

---

## 5. Visual Consistency Audit

Start the dev server if not running:
```bash
cd avenstone-vite && npm run dev -- --port 3737
```

Use Playwright to capture screenshots of these pages at mobile (390px) and desktop (1280px). Look for layout breaks, overflowing text, missing states, or components that look unfinished.

```js
// Run this via: npx playwright test --headed (or write a quick spec)
// Pages to screenshot:
// 1. Login screen
// 2. Dashboard (PM login)
// 3. Jobs list
// 4. Job detail — Info tab
// 5. Job detail — Documents tab (with at least one doc)
// 6. Job detail — Estimate tab
// 7. Job detail — Floor Plans tab
// 8. Client portal
// 9. Sub portal
// 10. Notification bell open
```

For each screenshot, check:
- No text overflow or clipped content
- Buttons are reachable and not hidden behind nav
- Empty states exist (not just blank)
- Loading states exist (not just blank)
- Gold/navy brand colors are correct — navy `#0A1F44`, gold `#C9A84C`
- Mobile bottom nav is visible and all icons render
- No console errors visible in network/console panel

---

## 6. State & Props Audit — Common Mistakes

Quick grep for these common React bugs:

**6a. Missing dependency arrays (stale closures)**
```
grep -r "useEffect(() =>" src/ --include="*.jsx" -A2 | grep -v "\[" | grep -v "^--$"
```
Any `useEffect` with no dependency array `[]` runs on every render. Report suspicious ones.

**6b. UUID vs string IDs**
```
grep -r "Date.now()" src/ --include="*.jsx" --include="*.js"
```
Any place `Date.now()` is used as an ID for a Supabase row insert is a bug — Supabase UUID columns reject it silently. Should use `crypto.randomUUID()` or let Supabase generate the ID.

**6c. AV_TENANT filter missing**
```
grep -r "\.from('" src/lib/supabase.js | grep "\.select(" | grep -v "eq('tenant_id"
```
Any query that fetches rows without a `tenant_id` filter is returning data across all tenants. Report any hits on tables that have `tenant_id`.

---

## 7. Punch List Report

At the end, output a clean punch list:

```
PASSED ✓
- [item]
- [item]

FIXED during this run ✓
- [item + file]
- [item + file]

NEEDS ATTENTION (flag to Kalin before fixing)
- [item + why it needs a decision]

OPEN ISSUES
- [item + file:line]
```

Do not pad the list. Only include real findings.
