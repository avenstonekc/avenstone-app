# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Memory

Persistent memory for this project lives at:
`C:\Users\Kalin\.claude\projects\C--WINDOWS-system32\memory\`

**Always read `MEMORY.md` in that folder first.** It indexes all memory files including:
- Active to-do list, bugs, and feature queue (`project_todo.md`)
- Team members, emails, auth IDs, roles (`user_team.md`)
- Testing and workflow preferences (`feedback_test_before_next.md`)

---

## What this app is

Avenstone — a construction job management platform for Avenstone Contracting (Kansas City, MO). Manages leads, proposals, contracts, client signing, documents, photos, subs, scheduling, change orders, payments, and AI estimating.

Deployed at: `https://avenstone-app.vercel.app`  
GitHub: `avenstonekc/avenstone-app`

---

## Working Preferences (READ FIRST)

These apply to every session. Follow them without being reminded.

- **Code only by default** — no explanations, no commentary, no "here's what I did" summaries unless explicitly asked
- **Never ask clarifying questions** — make a reasonable decision, implement it, note the assumption in a single line comment if needed
- **Always run tests after any code change** — `npx playwright test tests/portals-e2e.spec.js --reporter=list`
- **Best effort, keep moving** — if something is ambiguous, pick the most logical path and go
- **No refactoring to Vite/components** — stay single-file until explicitly told otherwise
- **One task at a time** — finish and test before moving to the next
- **If context is getting long** — summarize what was done and what's next before the session ends
- **Screenshots > descriptions** — if there's a UI bug, look at the screenshot first
- **Prefer editing existing code** over adding new code when possible
- **Every feature ships on all three viewports** — mobile (390px), tablet (768px), desktop (1280px). No exceptions. When adding a new screen: (1) add it to the sidebar NAV, (2) add it to the bottom nav `bot-nav` for mobile, (3) verify the component uses `isMob()` for layout switching. A feature that doesn't work on mobile is not done.
- **Think before building** — when Kalin floats an idea, stop and reason honestly before running with it: (1) Is there existing software that already does this better? (2) What's the realistic failure rate? (3) Does this fit Avenstone's actual competitive advantage? Say "X already does this better, here's what makes more sense" if that's the truth. Do NOT just start building because he mentioned it. Brainstorming is not a build order.

### Context & Token Management (CRITICAL)

The response text limit is ~32,000 tokens. Tool call outputs do NOT count against it. This means:

- **Never echo file contents in your response** — read with tools, write with tools, don't print to chat
- **Before any large task** — analyze: (1) output size, (2) whether subagents/chunked approach needed, (3) failure mode. Identify this BEFORE starting, not after burning usage
- **Files > 150 lines** — use a background subagent with explicit instruction: "Write using the Write tool only. Do NOT output file content in your response." Subagents that echo content hit the 32k cap instantly
- **Parallel subagents** — when writing multiple files simultaneously, spawn them in parallel (5 files = 5 subagents = 5x faster, no cap risk)
- **Reading large files** — read only the section you need (use offset/limit). Don't re-read files you just edited
- **When stuck or spinning** — stop after 2 attempts, surface the blocker to Kalin, don't retry blindly
- **North star** — one goal: build the best app possible. Right tool, right job, no spinning in circles

---

## Architecture

**Live app:** `avenstone-vite/` — Vite + React 18, built and deployed via Vercel.
- Build: `cd avenstone-vite && npm install && npm run build` → output: `avenstone-vite/dist/`
- Entry: `avenstone-vite/src/main.jsx` → `src/App.jsx` → component tree
- Supabase JS v2 via npm (`@supabase/supabase-js`)
- Components organized under `src/components/` by feature (auth, dashboard, jobs, client, sub, modals, forms, shared)
- `src/lib/` — utilities (ai.js, formData.js, etc.)

**Legacy:** Root-level `index.html` is the original single-file app. No longer deployed. Kept as reference only.

---

## Supabase

- Project ref: `cbfftukmhqvvjlrlnltk`
- URL: `https://cbfftukmhqvvjlrlnltk.supabase.co`
- Avenstone tenant ID: `00000000-0000-0000-0000-000000000001`
- Kalin's auth ID: `8171742a-b586-4f13-be61-744e191a1896`
- **Never send contracts or test emails to `kalin@avenstonekc.com`** — it will set his role to `client`

**Tables:** `jobs`, `profiles`, `photos`, `job_notes`, `job_documents`, `change_orders`, `contract_signatures`, `job_messages`, `job_subs`, `invitations_to_bid`, `bid_responses`, `payments`, `notifications`, `schedule_phases`, `daily_logs`, `job_phases`

**Storage buckets:** `job-photos` (public), `job-documents` (private), `bid-quotes` (private)

**Edge Functions:** `send-contract-email`, `invite-user`, `send-bid-invite`, `notify-realtor`, `send-estimate-email`, `create-payment-link`

**RLS helpers:** `get_my_role()`, `get_my_tenant_id()`, `can_access_job(job_id)`

---

## Global state / key globals

- `window.SB` — Supabase client
- `window.AV_TENANT` — current user's tenant_id (set on login via `loadProfile`)
- `window.AV_USER_ID` — current user's auth UID
- `window.AV_JOBS` — jobs array kept in sync for cross-component access

---

## DB helper naming

All Supabase helpers are top-level functions prefixed `sb*`:
`sbLoad`, `sbSave`, `sbUpd`, `sbNote`, `sbPhoto`, `sbCO`, `sbUploadDoc`, `sbLoadDocs`, `sbDelDoc`, `sbToggleDocVisible`, `sbSaveSignature`, `sbSendContractEmail`, `sbNotify`, `sbPostMessage`, `sbCreateITB`, `sbSubmitBid`, `sbCreatePaymentLink`

---

## Component structure (current)

```
App (screen state: "dashboard"|"jobs"|"intake"|"bid"|"takeoff"|"client"|"sub")
├── DashScr           — dashboard stats + quick-start cards
├── JobsScr           — job list with filters; drills into JobDet
│   └── JobDet        — multi-tab job detail (INFO/SCHEDULE/NOTES/PHOTOS/DOCUMENTS/
│                        CHANGE ORDERS/MESSAGES/ESTIMATE/DAILY LOGS/PAYMENTS)
├── FormScr           — multi-step AI intake & bid forms
├── ClientScr         — client portal (magic link or password login)
│   └── ClientJobScr  — client job detail (Overview/Docs/Payments/Messages/Change Requests)
├── SubScr            — sub portal
├── LoginScr          — email+password or magic link login
└── Modals: ContractModal, ClientSignContractModal, CompletionSignoffModal,
            SignaturePad, PaymentModal, ITBModal, SubPickerModal, etc.
```

---

## Auth / roles

Roles: `owner`, `project_manager`, `sales_rep`, `sub`, `client`  
Login: email+password (`signInWithPassword`) or magic link (`signInWithOtp`)  
Clients get magic links from `send-contract-email` edge function; also support password login.

---

## Job statuses

`lead → bid_sent → active → demo → framing → rough_mep → drywall → finish → punch → complete`  
Also: `on_hold`

---

## Design tokens

- Navy: `#0A1F44`, Gold: `#C9A84C`, Cream bg: `#F7F5F0`, Border: `#E8E4DC`
- Fonts: `DM Serif Display` (headings), `DM Sans` (body)
- CSS utility classes: `.btn`, `.btn-navy`, `.btn-gold`, `.btn-ghost`, `.finp`, `.fg`, `.flbl`, `.modal`, `.overlay`, `.badge`, `.card`, `.sb-item`

---

## Testing

**Primary suite:** `tests/portals-e2e.spec.js` — 123 tests, all passing (as of April 2026)  
**Roles × Viewports:** PM, Sales Rep, Sub × Desktop 1280×800, Mobile 390×844, iPad 768×1024  
**Steps per role:** Login → AI Estimator → Save PDF → Proposal → Contract → Signing → Notes → Status → Change Orders → Payments → Phases → DB Verification

```bash
npx playwright test tests/portals-e2e.spec.js --reporter=list   # full suite (~26 min)
npx playwright test tests/portals-e2e.spec.js --grep "Step 1"   # run one step across all roles
npx playwright test tests/portals-e2e.spec.js --grep "Desktop"  # desktop only
```

Test accounts:
- PM: `test-pm@avenstonekc.com` / `TestPM2026!`
- Rep: `test-rep@avenstonekc.com` / `TestRep2026!`
- Sub: `test-sub@avenstonekc.com` / `TestSub2026!`
- Client: `kalinspratling@gmail.com` / `TestClient2026!`

**Always run tests before pushing a new feature or after fixing a bug.**

---

## Known Gotchas (hard-won, don't repeat these mistakes)

- **Job IDs must be valid UUIDs** — the app's `add()` function uses `Date.now().toString()` which Supabase silently rejects. Always create test jobs via admin client with a real UUID.
- **`sbLoadSubJobs` uses `job_phases`** — subs can SELECT `job_phases` via RLS but may not have SELECT on `job_subs`. Query `job_phases.assigned_sub_id` to find a sub's jobs.
- **`assigned_rep` filter uses `profile.full_name`** — not email. `sbLoad()` filters sales rep jobs by `profile.full_name`. When setting up test data, use the rep's display name (e.g. "Test Rep"), not their email.
- **React-controlled inputs need native setter** — `.type()` / `.fill()` unreliable for Babel+UMD React. Use `page.evaluate()` with `Object.getOwnPropertyDescriptor` to set value and dispatch `input` + `change` events.
- **iPad (768px) uses desktop layout** — `@media(min-width:768px)` shows sidebar, hides bottom nav. Tests must check both `.sb-item` and `.bn-item` when navigating.
- **10-tab tabbar overflows on narrow screens** — use `tab.scrollIntoViewIfNeeded()` before clicking tabs like "Estimate" (tab #8).
- **AI estimator `page.click("Save PDF")` can trigger navigation** — use `{ noWaitAfter: true }` to prevent Playwright hanging on PDF blob navigation.
- **Test-runner timeout is NOT catchable** — `test.setTimeout()` aborts at the runner level. Use `Promise.race()` with a JS `setTimeout` to enforce hard caps that throw real catchable errors.
- **Clean up `job_estimates` in afterAll** — FK constraint blocks job DELETE if estimates exist. Always include `job_estimates` in cleanup loops.
- **Never use `retries > 1`** with `test.describe.serial` — retries restart the whole serial block from Step 1, multiplying runtime.

---

## Adding new code

- New React components: `avenstone-vite/src/components/<feature>/ComponentName.jsx`
- New Supabase helpers: `avenstone-vite/src/lib/` or colocate near the component that owns them
- New CSS: use existing Tailwind/utility classes; global styles in `avenstone-vite/src/index.css`
- New Edge Functions: `supabase/functions/<name>/index.ts` — deploy via Supabase dashboard

---

## Migrations

SQL migrations live in `supabase/migrations/` — gitignored but tracked locally.  
Apply via Supabase Management API:
```bash
curl -X POST "https://api.supabase.com/v1/projects/cbfftukmhqvvjlrlnltk/database/query" \
  -H "Authorization: Bearer sbp_24e47bbb7d72a5384a74f288a1355301c8492967" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"<sql>\"}"
```

---

## Current Focus

**Avenstone's competitive advantage is field operations + AI — not marketing automation.**

- GHL handles marketing. Keep it. The GHL webhook (already built) hands leads to Avenstone automatically.
- Avenstone owns everything after the handoff: estimate → proposal → contract → field ops → LiDAR → AI consultation.
- Do NOT rebuild what GHL already does well. If a feature idea overlaps with GHL, stop and think before building.

**Priority order:**
1. AI Consultation tab — polish end-to-end on mobile (voice → transcript → measurements → estimate)
2. Capacitor native app wrap — once Apple Developer account approved (MacInCloud ready)
3. LiDAR room scanning — after Capacitor, via Swift RoomPlan plugin
4. AI on top of GHL — Claude-powered lead responses through GHL's API (smarter GHL, not a replacement)

**The HTML app is complete and frozen. All new features go in the Vite app.**

---

## Feature Roadmap (native app, priority order)

### Phase 1 — Core (CMD building now)
1. **Vite app** — 1:1 port of HTML app into proper React components. Same Supabase backend. In progress.

### Phase 2 — AI Consultation & Mic
2. **AI Consultation Feature** — ambient listening + wake word + conversational measure + OH SHIT moments + on-site estimate generation. Full spec: `docs/AI_CONSULTATION_BLUEPRINT.md`
3. **GHL webhook receiver** — Edge Function auto-creates job when deal stage changes in GHL. Assigns rep, fires notification. Zero clicks.

### Phase 3 — App Store (Capacitor)
4. **Capacitor wrapper** — wraps Vite app into native iOS/Android shell. One afternoon. Unlocks all native hardware.
5. **LiDAR room scanning** — RoomPlan API via Swift Capacitor plugin. Auto-populates all measure fields in 60 seconds. Full spec at bottom of `docs/AI_CONSULTATION_BLUEPRINT.md`
6. **AR finish picker** — RealityKit overlays tile/paint/fixtures on client's actual room in real time. Closes deals before you leave the house.

### Phase 4 — Intelligence & Scale
7. **Dashboard** — revenue by month, jobs by status funnel, rep leaderboard, cost/SF trends
8. **Sub scheduling** — calendar view, mark phases complete, availability status
9. **Client portal upgrades** — progress timeline, photo gallery, real-time status
10. **AI sales avatar** — AI demo agent that walks prospects through a live demo, provisions their tenant, deploys their app on the call, starts free trial automatically
11. **White-label + Stripe billing** — multi-tenant onboarding, subscription tiers, plan enforcement. After core is stable.

---

## AI Consultation Feature — Quick Reference

Full spec: `docs/AI_CONSULTATION_BLUEPRINT.md`

**New Supabase tables needed:**
- `consultation_sessions` — each on-site consultation
- `consultation_extractions` — ambient listening output (concerns, risks, scope)
- `consultation_measurements` — per-trade measurements from active measure mode
- `oh_shit_moments` — flagged change order risks with pricing

**New edge functions needed:**
- `process-transcript` — runs Claude extraction on transcript chunks
- `generate-estimate-from-session` — assembles full estimate from measurements

**Key tech:**
- Wake word: Picovoice Porcupine ("Avenstone start", "Avenstone note", "Avenstone measure", "Avenstone done")
- STT: Deepgram Nova-3 Streaming or AssemblyAI Universal-Streaming
- AI extraction: Claude Haiku (cost-optimized)
- Hardware option: Plaud NotePin ($149) for noisy environments

---

## GHL Integration Plan (in progress)

GoHighLevel is being built out in parallel. When the webhook is ready:

- GHL deal moves to "Proposal" stage → POST to Supabase Edge Function
- Function creates job row with UUID, sets `status: "lead"`, assigns `assigned_rep` by matching GHL contact owner to `profiles.full_name`
- Fires notification to assigned rep
- Avenstone handles everything from there: estimate → proposal → contract → fulfillment

Webhook payload will include: contact name, address, phone, email, deal value, assigned user name.

---

## Common Task Patterns

When Kalin says one of these, this is what he means:

- **"add a feature"** — build it in `index.html`, add CSS in the style block, add any needed `sb*` helpers, run tests
- **"fix the bug"** — read the error, find root cause, fix it, run tests, done
- **"clean it up"** — remove dead code, fix inconsistent naming, tighten CSS, don't change behavior
- **"make it smarter"** — add AI involvement to an existing feature (summarize, suggest, automate)
- **"wire it up"** — connect two existing pieces that should talk to each other (usually a button to a Supabase call or edge function)
- **"test it"** — run `npx playwright test tests/portals-e2e.spec.js --reporter=list` and report the result
