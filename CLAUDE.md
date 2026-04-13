# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What this app is

**Avenstone** — an AI-powered construction field operations platform for Avenstone Contracting (Kansas City, MO). Manages the full job lifecycle: leads → AI consultation → estimate → proposal → contract → field ops → client portal → payments.

**Competitive advantage:** AI embedded at every step of field operations. Not a CRM. Not a marketing tool. The thing that makes crews smarter, faster, and more profitable on every job.

- Live app: `https://avenstone-app.vercel.app`
- GitHub: `avenstonekc/avenstone-app`
- Supabase project ref: `cbfftukmhqvvjlrlnltk`
- Supabase URL: `https://cbfftukmhqvvjlrlnltk.supabase.co`
- Avenstone tenant ID: `00000000-0000-0000-0000-000000000001`
- Kalin's auth ID: `8171742a-b586-4f13-be61-744e191a1896`
- **Never send contracts or test emails to `kalin@avenstonekc.com`** — it will set his role to `client`

---

## Working Preferences (READ FIRST — follow every session)

- **Code only by default** — no explanations, no commentary unless explicitly asked
- **Never ask clarifying questions about implementation** — make a reasonable decision and go
- **Ask only when the decision affects real users or is irreversible** — e.g. sending emails, firing notifications, deleting data. One line check saves a rework.
- **Best effort, keep moving** — ambiguous? pick the most logical path and implement it
- **One task at a time** — finish it, then move on
- **Prefer editing existing code** over adding new files when possible
- **Screenshots > descriptions** — if there's a UI bug, look at the screenshot first
- **Think before building** — when an idea is floated, reason honestly: (1) Does existing software already do this better? (2) What's the realistic failure rate? (3) Does it fit Avenstone's actual competitive advantage? Say so if the answer is no.

### Every feature ships on all three viewports
Mobile (390px), tablet (768px), desktop (1280px). No exceptions.
- Add new screens to both `NAV` array (sidebar) and `bot-nav` (mobile)
- Use `isMob()` from `src/lib/utils.jsx` for layout switching
- iPad (768px) uses desktop layout — sidebar visible, bottom nav hidden

### Context & Token Management
- **Never echo file contents in your response** — read with tools, write with tools
- **New files > 150 lines** — use a background subagent. Tell it: "Write using the Write tool only. Do NOT output file content."
- **Edits to existing large files** — use the Edit tool directly, not a subagent. Targeted edits are faster and more reliable.
- **Parallel subagents** — when writing multiple new files simultaneously, spawn in parallel
- **Reading large files** — use offset/limit. Don't re-read files you just edited
- **When stuck** — stop after 2 attempts, surface the blocker, don't retry blindly

---

## Architecture

**Stack:** Vite + React 18, deployed via Vercel
- Build: `cd avenstone-vite && npm install && npm run build` → output: `avenstone-vite/dist/`
- Entry: `avenstone-vite/src/main.jsx` → `src/App.jsx`
- Routing: state-based (`pg` state in `App.jsx`) — no React Router
- Supabase JS v2 via npm

**Legacy:** Root-level `index.html` = original single-file app. No longer deployed. Frozen. All new features go in the Vite app.

### Folder structure
```
avenstone-vite/src/
├── components/
│   ├── ai/           — AiKnowledgeScr, AiSetupWizard, AiIntakeWizard
│   ├── auth/         — LoginScr, SetPasswordScr
│   ├── client/       — ClientPortal
│   ├── common/       — UserMgmt, ContactsScr, SequencesScr, TkOf, Pipeline, StatusPage
│   ├── dashboard/    — DashScr, CalScr, Reports
│   ├── forms/        — FormScr
│   ├── jobs/         — JobsScr, JobDet + tabs/
│   ├── modals/       — SettingsModal, ContractModal, etc.
│   ├── shared/       — AiCompanionChat, NotifPanel, StarRating, PhotoLightbox, PushEnableButton
│   └── sub/          — SubPortal, SubDir, SubJobView
├── lib/
│   ├── supabase.js   — Supabase client, ALL edge function URLs, ALL sb* helpers
│   ├── utils.jsx     — Icons (Ic), formatters (f$, fD, fDT), isMob(), status helpers
│   ├── utils.js      — localStorage helpers (ls, ll)
│   ├── formData.js   — Intake & bid form structure
│   ├── pdf.js        — PDF generation
│   └── ai.js         — callEstimator, extractProposalData
├── App.jsx           — Main layout, routing, session, NAV array
├── main.jsx          — Entry point
└── index.css         — Global styles, utility classes
```

### Adding new code
- New components: `src/components/<feature>/ComponentName.jsx`
- New Supabase helpers: add to `src/lib/supabase.js` with `sb*` prefix
- New edge function URLs: export from `src/lib/supabase.js` alongside existing URLs
- New CSS: global styles in `src/index.css`; prefer existing utility classes
- New icons: add to `Ic` object in `src/lib/utils.jsx` — never inline SVGs in components
- New top-level screens: (1) add to `NAV` array, (2) add render in `pg-wrap`, (3) add to `bot-nav` if needed
- Complex multi-step flows: full-screen overlay, not a modal. Modals are for single-action confirmations only.

---

## Supabase

### Tables
**Core:** `jobs`, `profiles`, `photos`, `job_notes`, `job_documents`, `change_orders`, `contract_signatures`, `job_messages`, `job_subs`, `invitations_to_bid`, `bid_responses`, `payments`, `notifications`, `schedule_phases`, `daily_logs`, `job_phases`, `job_estimates`, `contacts`, `sequences`, `sequence_enrollments`, `job_reviews`, `sub_ratings`

**AI tables:**
- `job_ai_companions` — one record per (user_id, job_id, role). Stores full `conversation_history` (JSONB array of `{role, content}` messages). The AI companion's persistent memory.
- `ai_knowledge` — tenant-specific learnings injected into every AI companion prompt. Fields: `tenant_id`, `category`, `content`, `active`, `created_by`, `created_at`
- `ai_error_logs` — black box recorder for every AI failure. Fields: `function_name`, `error_type`, `error_message`, `user_input`, `ai_raw_response`, `session_id`, `job_id`, `user_id`, `tenant_id`, `metadata`, `created_at`
- `consultation_sessions` — each on-site AI consultation session
- `consultation_extractions` — ambient listening output (concerns, budget, risks, scope hints)
- `consultation_measurements` — per-trade measurements from measure mode

**Storage buckets:** `job-photos` (public), `job-documents` (private), `bid-quotes` (private)

**RLS helpers:** `get_my_role()`, `get_my_tenant_id()`, `can_access_job(job_id)`

### Edge Functions
All URLs exported from `src/lib/supabase.js`:

| Export | Function | Purpose |
|--------|----------|---------|
| `AI_COMPANION_URL` | `ai-companion` | Per-person per-job AI with full job context + memory |
| `AI_INTAKE_URL` | `ai-intake` | 3-step project intake wizard — chat → measurements → submit lead |
| `AI_PM_NIGHTLY_URL` | `ai-pm-nightly` | Daily job analysis — 6 rule checks, targeted notifications |
| `PROCESS_TRANSCRIPT_URL` | `process-transcript` | AI consultation — ambient extraction + measure mode |
| `AI_ERROR_LOGGER_URL` | `ai-error-logger` | Silent black box error recorder |
| `AI_ESTIMATOR_URL` | `ai-estimator` | Estimate chat |
| `CONTRACT_EMAIL_URL` | `send-contract-email` | Contract email with PDF |
| `INVITE_URL` | `send-invite` | Staff/sub invitation |
| `CLIENT_LINK_URL` | `send-client-link` | Client magic link |
| `BID_INVITE_URL` | `send-bid-invite` | Sub bid invitation |
| `PAYMENT_LINK_URL` | `create-payment-link` | Stripe payment link |
| `NOTIFY_REALTOR_URL` | `notify-realtor` | Realtor referral notification |

### Edge Function Deploy
**Functions auto-deploy via GitHub Actions on every push to `supabase/functions/**`.** Manual deploy is a fallback only.

```bash
# Manual fallback (use only if GitHub Actions is broken):
export SUPABASE_ACCESS_TOKEN=sbp_9fa9e8b5e69d1c615f2540b01ab843498c4b37bc
npx supabase functions deploy <name> --no-verify-jwt --project-ref cbfftukmhqvvjlrlnltk
```
**Current PAT:** `sbp_9fa9e8b5e69d1c615f2540b01ab843498c4b37bc` — No expiry. Set April 13 2026.

**GitHub Actions secrets required:**
- `SUPABASE_ACCESS_TOKEN` — PAT above
- `SUPABASE_PROJECT_REF` — `cbfftukmhqvvjlrlnltk`
- `SUPABASE_URL` — `https://cbfftukmhqvvjlrlnltk.supabase.co`
- `SUPABASE_ANON_KEY` — the anon key from supabase.js

**Anthropic model guidelines:**
- Sonnet (`claude-sonnet-4-6`): complex reasoning, large output — `max_tokens: 4096`
- Haiku (`claude-haiku-4-5-20251001`): fast extraction, small JSON — `max_tokens: 2048`
- Opus (`claude-opus-4-6`): deep analysis, project manager — `max_tokens: 4096`

---

## Vercel Deployment

**Auto-deploys** on every push to `main`. Takes ~60-90 seconds.

**If a deploy fails:**
1. Go to vercel.com → avenstone-app → the red failed deployment
2. Click **"View Build Logs"** tab
3. Scroll to the bottom — the last error line is the cause
4. Paste it to Claude — do NOT try to diagnose without seeing it

**Common Vercel failures:**
- **"Cannot deploy from GitHub"** — Vercel lost GitHub OAuth. Fix: Vercel → Settings → Git → Disconnect → Reconnect GitHub
- **Build error** — always run `cd avenstone-vite && npm run build` locally first. If it passes locally and fails on Vercel, the error is in the Vercel build logs.
- **Missing import / wrong path** — check the exact file path and casing (Linux is case-sensitive, Windows is not)
- **Large bundle warning** — not an error, just a warning. Does not cause deploy failure.

**Manual redeploy:** Vercel dashboard → avenstone-app → Deployments → click the failed one → "Redeploy"

### SQL Migrations
Apply via Supabase Management API:
```bash
curl -X POST "https://api.supabase.com/v1/projects/cbfftukmhqvvjlrlnltk/database/query" \
  -H "Authorization: Bearer <PAT>" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"<sql>\"}"
```

---

## The AI System — How It All Connects

This is Avenstone's core competitive advantage. Every piece connects:

```
CLIENT / REP GOES ON-SITE
  └── AI Intake Wizard (ai-intake edge function)
      ├── 3-step: AI chat → measurements → review + submit
      ├── Sonnet for conversation, Haiku for structured extraction
      ├── Uses ai_knowledge for company context
      ├── Measurement step is LiDAR-ready (slot exists, manual input now)
      └── On submit → creates jobs record (status: lead) → notifies owner/sales

NEW TENANT ONBOARDS
  └── AiSetupWizard fires (0 knowledge entries detected)
      └── 7 questions → ai_knowledge table populated
          └── AI now knows: labor rate, markup, draw structure,
              lead time, client comms, CO policy, specialties

SALES REP GOES ON-SITE
  └── AI Consultation tab (process-transcript edge function)
      ├── AMBIENT MODE — listens to client conversation
      │   └── Extracts: concerns, scope hints, budget signals,
      │       decision makers, timeline, risk flags, action items
      │       → saved to consultation_extractions
      └── MEASURE MODE — guides rep trade-by-trade
          └── Multi-turn conversation with full memory (40 msg window)
              → measurements saved to consultation_measurements

JOB BECOMES ACTIVE
  └── AI Companion available on every job (ai-companion edge function)
      ├── Per person, per job — Sales Rep, PM, Sub, Client each get their own
      ├── Loads full job context on every call:
      │   job details, notes, change orders, payments, phases, subs
      ├── Injects company knowledge from ai_knowledge (active entries only)
      ├── Persistent memory — conversation_history stored in job_ai_companions
      │   Resumable — reopening the companion loads last 10 messages
      └── Sliding window — last 20 messages sent to API (token safety)

DAILY — ON FIRST LOGIN
  └── ai-pm-nightly fires once per calendar day (localStorage date check)
      ├── 6 deterministic rule checks per active job:
      │   contract_unsigned, payment_overdue, phase_starting_soon,
      │   no_daily_log, co_pending_approval, job_stale
      ├── 24h deduplication — same alert never fires twice in a day
      ├── Right person notified: client alerts → client, ops alerts → PM/owner
      └── Jobs with 2+ alerts → Opus narrative (fire-and-forget)
          → all alerts land in notification bell on login

ERRORS ANYWHERE
  └── ai-error-logger edge function (fire-and-forget, never blocks)
      └── Captures: function name, error type, raw AI response, user input
          → ai_error_logs table — query to see what broke and why

COMPANY LEARNS OVER TIME
  └── AI Knowledge screen (owner only, sidebar)
      ├── Add/edit/toggle entries by category
      ├── Active entries injected into every companion + intake conversation
      └── "Retake Setup" button re-runs the AiSetupWizard
```

### AI Component Map
| Component | File | Purpose |
|-----------|------|---------|
| `AiCompanionChat` | `components/shared/AiCompanionChat.jsx` | Floating sparkle button on job detail. Loads history on open. |
| `AiIntakeWizard` | `components/ai/AiIntakeWizard.jsx` | 3-step intake: chat → measurements → submit. Client portal + jobs screen. |
| `AiKnowledgeScr` | `components/ai/AiKnowledgeScr.jsx` | CRUD for ai_knowledge entries. Owner only. |
| `AiSetupWizard` | `components/ai/AiSetupWizard.jsx` | 7-question onboarding wizard. Fires on first login if 0 entries. |

---

## Component Architecture

### Routing
State-based in `App.jsx`. `pg` state drives which screen renders.
```jsx
// Add a new screen:
// 1. NAV array (sidebar):
{ id: 'my-screen', lb: 'Label', ic: 'grid', sec: 'Section' }
// 2. pg-wrap render:
{pg === 'my-screen' && <MyScreen profile={profile} />}
// 3. bot-nav (mobile bottom bar) if needed
```

### Screen component pattern
```jsx
export default function MyScr({ profile }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data } = await sb.from('table').select('*').eq('tenant_id', AV_TENANT);
    setItems(data || []);
    setLoading(false);
  };
  // ...
}
```
Always filter by `AV_TENANT`. Always handle loading, empty, and error states.

### Auth & Roles
- Roles: `owner`, `project_manager`, `sales_rep`, `sub`, `client`
- `profile` object passed as prop throughout — contains `id`, `tenant_id`, `role`, `full_name`
- Session globals: `AV_TENANT`, `AV_USER_ID` — set on login, imported from `supabase.js`

### Job statuses (in order)
`lead → bid_sent → active → demo → framing → rough_mep → drywall → finish → punch → complete`
Also: `on_hold`

### Information Architecture
- **Top nav** — daily-use screens only. Job-specific features belong in `JobDet` tabs.
- **JobDet tabs** — Info, Schedule, Notes, Photos, Documents, Change Orders, Messages, Estimate, Daily Logs, Payments, AI Session
- **Floating elements** — `AiCompanionChat` floats over job detail. One floating button max per screen.
- **Modals** — single-action confirmations or short forms only.
- **Full-screen overlays** — complex multi-step flows (e.g. AiIntakeWizard). Never cram these into a modal.
- **Edge functions** — AI features that analyze a job = edge function + trigger button in the relevant tab, not a new screen.

---

## Design System

### Tokens
- Navy: `#0A1F44` | Gold: `#C9A84C` | Cream: `#F7F5F0` | Border: `#E8E4DC`
- Error: `#EF4444` / `#FEE2E2` | Success: `#22c55e` / `#D1FAE5` | Warning: `#f59e0b` / `#FEF3C7`
- Fonts: `DM Serif Display` (headings) · `DM Sans` (body)

### CSS utility classes (defined in `index.css`)
`.btn` `.btn-navy` `.btn-gold` `.btn-ghost` `.finp` `.fg` `.flbl` `.modal` `.overlay` `.badge` `.card` `.sb-item` `.tbl`

### Spacing
- Card padding: `16-20px` | Section gap: `16px` | Button height: `36-44px`
- Border radius: `8px` small · `10-12px` cards · `20px` pills · `50%` avatars
- Mobile padding: `14px` | Desktop: `20-24px`

### Icons
All in `Ic` object in `src/lib/utils.jsx`. Use as:
```jsx
<span style={{ width: 16, height: 16, display: 'flex' }}>{Ic.trash}</span>
```
Available: `grid, home, clip, doc, box, back, plus, chev, check, edit, info, note, cam, vid, warn, trash, logout, bell, cal, sched, folder, dl, eye`

### States — always handle all four
- **Loading** — spinner or typing dots, never blank
- **Empty** — centered text + muted icon
- **Error** — red banner `#FEE2E2` with dismiss
- **Success** — green pill `#D1FAE5`, auto-dismiss 4s

### Motion
- Slide-up (mobile): `slideUp 0.25s ease` | Slide-in (desktop): `slideIn 0.22s ease`
- Overlay fade: `0.15s` | Progress bars: `width 0.4s` | Button hover: `all 0.15s`

### Floating action button
```jsx
position: 'fixed', bottom: mob ? 74 : 28, right: 18,
width: 52, height: 52, borderRadius: '50%',
background: '#0A1F44', border: '2px solid #C9A84C',
boxShadow: '0 4px 20px rgba(10,31,68,0.35)', zIndex: 1000
```

---

## Testing

**Suites:**
- `tests/portals-e2e.spec.js` — 123 tests. Full role/viewport coverage: PM, rep, sub across desktop/mobile/iPad.
- `tests/new-features.spec.js` — AI intake wizard, notification bell, client portal progress stepper.

**Run:**
```bash
npx playwright test tests/portals-e2e.spec.js --reporter=list         # full suite
npx playwright test tests/new-features.spec.js --reporter=list        # new features
npx playwright test tests/portals-e2e.spec.js --grep "Step 1"        # one step
npx playwright test tests/portals-e2e.spec.js --grep "Desktop"       # desktop only
```

**Test accounts:**
- PM: `test-pm@avenstonekc.com` / `TestPM2026!`
- Rep: `test-salesrep@avenstonekc.com` / `TestSalesRep2026!`
- Sub: `test-sub@avenstonekc.com` / `TestSub2026!`
- Client: `kalinspratling@gmail.com` / `TestClient2026!`

---

## Known Gotchas

- **Job IDs must be valid UUIDs** — `Date.now().toString()` is silently rejected by Supabase
- **`sbLoadSubJobs` uses `job_phases`** — subs can SELECT `job_phases` but not `job_subs`
- **`assigned_rep` filter uses `profile.full_name`** — not email
- **React-controlled inputs** — use `page.evaluate()` with native setter in Playwright, not `.fill()`
- **iPad (768px)** — uses desktop layout, sidebar visible, bottom nav hidden
- **10-tab tabbar** — use `scrollIntoViewIfNeeded()` before clicking deep tabs like "Estimate"
- **AI companion job_id** — must be a real UUID that exists in `jobs` table. FK constraint will reject fake IDs.
- **Never use `retries > 1`** with `test.describe.serial` — restarts the whole block from Step 1
- **Clean up `job_estimates` in afterAll** — FK constraint blocks job DELETE if estimates exist
- **Nav label for Projects screen** — `lb: 'Projects'` in NAV array and bot-nav. Use `"Projects"` in test selectors, not `"jobs"`.
- **Supabase PAT** — generate with **No expiry**. Short-lived tokens break GitHub Actions silently.

---

## Priority Order (what we're building)

1. **Capacitor native app** — iOS wrapper, once Apple Developer account approved (MacInCloud ready)
2. **LiDAR room scanning** — after Capacitor, via Swift RoomPlan plugin. Measurement step in AiIntakeWizard is already slotted.
3. **White-label + Stripe billing** — multi-tenant onboarding after core is stable
4. **AI PM dashboard** — owner screen surfacing nightly report data, job health, alert history
5. **Sub portal upgrades** — daily log submission, phase confirmation, AI companion for subs

**Done:** AI intake wizard, client portal progress stepper + realtime, notification bell, ai-pm-nightly smart alerts, GitHub Actions auto-deploy.

**GHL stays for marketing.** Avenstone owns everything after the lead handoff. Don't rebuild what GHL does.

---

## Common Task Patterns

- **"add a feature"** — build in `avenstone-vite/src/`, add CSS, add `sb*` helper, wire to NAV
- **"fix the bug"** — read the error, find root cause, fix it, done
- **"clean it up"** — remove dead code, fix inconsistent naming, tighten CSS, don't change behavior
- **"make it smarter"** — add AI to an existing feature (summarize, suggest, automate)
- **"wire it up"** — connect two existing pieces (button → Supabase call or edge function)
- **"test it"** — run both Playwright suites and report results
- **"deploy it"** — push to main, GitHub Actions handles functions, Vercel handles frontend
