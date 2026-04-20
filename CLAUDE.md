# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What this app is

**Avenstone** — an AI-powered construction field operations platform for Avenstone Contracting (Kansas City, MO). Manages the full job lifecycle: leads → AI consultation → estimate → proposal → contract → field ops → client portal → payments.

**Competitive advantage:** AI embedded at every step of field operations. Not a CRM. Not a marketing tool. The thing that makes crews smarter, faster, and more profitable on every job.

- Local path: `C:\Users\Kalin\OneDrive\Documents\GitHub\avenstone-app`
- Live app: `https://avenstone-app.vercel.app`
- GitHub: `avenstonekc/avenstone-app`
- Supabase project ref: `cbfftukmhqvvjlrlnltk`
- Supabase URL: `https://cbfftukmhqvvjlrlnltk.supabase.co`
- Avenstone tenant ID: `00000000-0000-0000-0000-000000000001`
- Kalin's auth ID: `8171742a-b586-4f13-be61-744e191a1896`
- **Never send contracts or test emails to `kalin@avenstonekc.com`** — it will set his role to `client`

---

## API Cost Rules (ALWAYS follow — Kalin has been burned twice)

**Before building any AI feature, answer these three questions:**
1. How often does this fire? (per message, per login, per day, per DB event?)
2. Which model? Haiku < Sonnet < Opus — never use Opus for anything automatic
3. Is this user-triggered or automatic? Automatic = must have hard rate limiting

**Rules:**
- **Never fire Opus automatically** — Opus is for on-demand owner actions only, never background jobs
- **Never fire any AI on a DB webhook/trigger** — DB events can cascade into thousands of calls
- **ai-pm-nightly fires Opus narrative** — THIS IS DISABLED. Do not re-enable without explicit approval
- **Agentic loops** — cap at 3 iterations max on Haiku, 3 on Sonnet. Every loop iteration = full API cost
- **Conversation history window** — 10 messages max on Haiku agents, 20 max on Sonnet
- **max_tokens** — Haiku: 1024 for simple responses, 2048 only when tools are active. Sonnet: 2048 default, 4096 only for complex reasoning. Never set higher than needed.
- **Background automatic functions** (ai-pm-nightly, any cron) — must use Haiku only, no agentic loops
- **Always state the cost implication** when proposing a new AI feature — "this fires on every X which means Y calls per day"

**Model cost order (cheapest to most expensive):**
Haiku → Sonnet → Opus. Default to Haiku for anything automatic or high-frequency.

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
- **Flag concerns, don't narrate** — only call out a concern if there's a real one (wrong approach, destructive action, API cost risk). Don't preface every request with an evaluation — that's friction. Just execute. If something is genuinely off, one line is enough before proceeding.
- **Proactive memory** — if there's a non-obvious way to save significant time in future sessions, add it to memory unprompted.

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
│   ├── ai/           — AiKnowledgeScr, AiSetupWizard, AiIntakeWizard, AiFieldAgent,
│   │                   AiHomeScr, LidarScanner, MaterialSelectionScr
│   ├── auth/         — LoginScr, SetPasswordScr, SignaturePad
│   ├── client/       — ClientPortal
│   ├── common/       — UserMgmt, ContactsScr, SequencesScr, TkOf, Pipeline, StatusPage
│   ├── dashboard/    — DashScr, CalScr, Reports
│   ├── forms/        — FormScr
│   ├── jobs/         — JobsScr, JobDet, MeasureScr + tabs/
│   ├── leads/        — LeadsScr
│   ├── modals/       — SettingsModal, ContractModal, ClientSignContractModal,
│   │                   CompletionSignoffModal
│   ├── owner/        — OwnerPortal
│   ├── public/       — CompletionPage, PublicProfile, ReviewPage
│   ├── shared/       — AiCompanionChat, MasterAgent, NotifPanel, StarRating,
│   │                   PhotoLightbox, PushEnableButton
│   └── sub/          — SubPortal, SubDir, SubJobView, SubOnboardingModal,
│                       SubOnboardingWizard, SubRateModal
├── lib/
│   ├── supabase.js   — Supabase client, ALL edge function URLs, ALL sb* helpers
│   ├── utils.jsx     — Icons (Ic), formatters (f$, fD, fDT), isMob(), status helpers
│   ├── utils.js      — localStorage helpers (ls, ll)
│   ├── formData.js   — Intake & bid form structure
│   ├── pdf.js        — PDF generation
│   ├── ai.js         — callEstimator, extractProposalData
│   └── lidar.js      — Capacitor LiDAR bridge (real RoomPlan on native iOS, simulation on web)
├── styles/
│   ├── global.css    — Global overrides
│   └── tokens.css    — CSS design tokens
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

**AI functions:**
| Function | Purpose |
|----------|---------|
| `ai-companion` | Per-person per-job AI with full job context + memory |
| `ai-intake` | 3-step project intake wizard — chat → measurements → submit lead |
| `ai-pm-nightly` | Daily job analysis — 6 rule checks, targeted notifications |
| `ai-field-agent` | Field AI agent |
| `ai-home-companion` | Home screen AI companion |
| `ai-master-agent` | Master orchestration agent |
| `ai-project-manager` | Project manager AI |
| `ai-estimator` | Estimate chat |
| `ai-generate-sequence` | AI-generated contact sequences |
| `ai-sub-onboard` | AI sub onboarding flow |
| `ai-sub-pricing` | AI sub pricing analysis |
| `ai-error-logger` | Silent black box error recorder |
| `process-transcript` | AI consultation — ambient extraction + measure mode |
| `measure-guide` | Guided measurement assistant |
| `generate-estimate-from-session` | Estimate generation from consultation session |

**Email / SMS / Push:**
| Function | Purpose |
|----------|---------|
| `send-contract-email` | Contract email with PDF |
| `send-invite` | Staff/sub invitation |
| `send-client-link` | Client magic link |
| `send-bid-invite` | Sub bid invitation |
| `send-estimate-email` | Estimate email |
| `send-contact-sms` | SMS to contact |
| `notify-email` | General email notification |
| `notify-sms` | General SMS notification |
| `notify-realtor` | Realtor referral notification |
| `send-push` | Push notification |
| `missed-call-textback` | Auto text back on missed call |

**Integrations / Payments / Data:**
| Function | Purpose |
|----------|---------|
| `create-payment-link` | Stripe payment link |
| `stripe-webhook` | Stripe event handler |
| `ghl-webhook` | GHL lead handoff receiver |
| `twilio-inbound` | Inbound Twilio SMS handler |
| `address-autocomplete` | Address search autocomplete |
| `get-contractor-profile` | Public contractor profile data |
| `get-job-status` | Public job status for client |
| `sequence-runner` | Contact sequence execution |

### Edge Function Deploy
**Functions auto-deploy via GitHub Actions on every push to `supabase/functions/**`.** Workflow uses the multipart `POST /v1/projects/{ref}/functions/deploy` Management API endpoint and reports per-function status.

```bash
# Manual fallback (use only if GitHub Actions is broken):
# Token is in the GitHub secret SUPABASE_ACCESS_TOKEN — never paste it here or in any committed file.
export SUPABASE_ACCESS_TOKEN=<paste from secure password manager>
npx supabase functions deploy <name> --no-verify-jwt --project-ref cbfftukmhqvvjlrlnltk
```

**PAT rotation gotchas (learned the hard way):**
- Generate from `https://supabase.com/dashboard/account/tokens` — confirm the account picker shows the org that owns project `cbfftukmhqvvjlrlnltk`
- **No expiry** — short-lived tokens silently break GitHub Actions
- Update the `SUPABASE_ACCESS_TOKEN` GitHub secret via `gh secret set SUPABASE_ACCESS_TOKEN < tokenfile.txt` (avoids paste whitespace issues)
- Never write the token value into CLAUDE.md or any committed file

**GitHub Actions secrets required:**
- `SUPABASE_ACCESS_TOKEN` — the PAT
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

## iOS Build Pipeline (Codemagic → TestFlight)

**Every push to `main` triggers an iOS build automatically.** Codemagic compiles, signs, uploads to TestFlight, and pushes to your phone. **No Mac required, ever. MacInCloud is retired — do not use it.**

**Canonical IDs:**
- **App bundle identifier**: `com.avenstonekc.avenstone` (NOT `.app` — that was the original mistake that caused a failed upload; the App Store Connect record is locked to `.avenstone`)
- **App Store Connect Apple ID** (for the app record): `6762308583`
- **Codemagic app ID**: `69dfe87016fca50ea5f10d7b`
- **Codemagic workflow**: `ios-testflight` (defined in `codemagic.yaml`)

**Build pipeline (`codemagic.yaml` in repo root):**
1. Install web deps → `npm install`
2. Build web assets → `npm run build`
3. `npx cap sync ios` → copies `dist/` into the Xcode project
4. `app-store-connect fetch-signing-files` → auto-fetches/creates Distribution cert + provisioning profile
5. `keychain add-certificates` → loads cert into build keychain
6. `xcode-project use-profiles` → wires profile into Xcode build settings
7. **Set build number**: `NEW_BUILD_NUMBER=$(date +%s)` — Unix epoch timestamp, guaranteed monotonic, never collides. Do NOT switch back to `git rev-list --count HEAD` — Codemagic's shallow clone makes it non-deterministic.
8. `xcode-project build-ipa --project "App.xcodeproj" --scheme "App"` — project-based build (no workspace, Capacitor SPM has no `.xcworkspace`)
9. Publish to TestFlight via Codemagic's `app_store_connect` integration using env-var credentials

**Required env vars (stored in Codemagic `app_store_credentials` group):**
| Var | Purpose |
|-----|---------|
| `APP_STORE_CONNECT_ISSUER_ID` | App Store Connect API issuer UUID |
| `APP_STORE_CONNECT_KEY_IDENTIFIER` | 10-char key ID from App Store Connect |
| `APP_STORE_CONNECT_PRIVATE_KEY` | Raw `.p8` file contents |
| `CERTIFICATE_PRIVATE_KEY` | RSA 2048 private key used when creating the Distribution cert |

All four are marked `secure: true`. Never commit any of these values to the repo. If any get rotated, update via Codemagic REST API:
```bash
curl -X POST -H "x-auth-token: $CODEMAGIC_PAT" \
  -H "Content-Type: application/json" \
  -d '{"key":"NAME","value":"VALUE","secure":true,"group":"app_store_credentials"}' \
  https://api.codemagic.io/apps/69dfe87016fca50ea5f10d7b/variables
```

**Codemagic PAT:** create at Settings → Integrations → Codemagic API → Show. Never commit it. The one used during setup gives full account access.

**Trigger a build manually:**
```bash
curl -X POST -H "x-auth-token: $CODEMAGIC_PAT" \
  -H "Content-Type: application/json" \
  -d '{"appId":"69dfe87016fca50ea5f10d7b","workflowId":"ios-testflight","branch":"main"}' \
  https://api.codemagic.io/builds
```

**Typical timeline:** build ~12-18 min → Apple processing ~10-30 min → TestFlight push to phone → tap Update → relaunch.

### iOS gotchas (learned the hard way)

- **Bundle identifier is `com.avenstonekc.avenstone`** — if you ever see `com.avenstonekc.app` in `capacitor.config.json`, `codemagic.yaml`, or `project.pbxproj`, it's wrong and TestFlight upload will fail with "Cannot determine the Apple ID from Bundle ID."
- **`Info.plist` has `ITSAppUsesNonExemptEncryption = false`** — auto-declares standard-HTTPS-only encryption so every build skips App Store Connect's "Missing Compliance" gate. Don't remove it.
- **`Info.plist` has camera, mic, photo library usage descriptions** — required for RoomPlan (camera + LiDAR), ambient AI consultation (mic), and job photo attachment (photo library). Don't remove.
- **Capacitor uses Swift Package Manager**, not CocoaPods. There is no `Podfile`, no `.xcworkspace`. Build commands must use `--project "App.xcodeproj"`, never `--workspace`.
- **`CapacitorHttp` plugin is enabled in `capacitor.config.json`.** This routes `window.fetch` / `XMLHttpRequest` through native iOS URLSession instead of WKWebView. Without it, Supabase edge function calls silently fail with "Load failed" inside the iOS app even though they work on Vercel. Do NOT disable.
- **Viewport meta is locked**: `user-scalable=no, maximum-scale=1.0, viewport-fit=cover`. iOS webview was rendering the desktop layout until this was tightened.
- **The `ios/` folder is committed to the repo.** Don't `.gitignore` it or Codemagic won't be able to build.
- **Internal TestFlight testers only.** External testers trigger Apple Beta App Review which requires filling out test info. We don't do external testing — `codemagic.yaml` publishing block has NO `beta_groups` key for this reason.
- **Apple Developer team:** active, approved + charged 2026-04-14. Apple ID enrollment uses the same login as App Store Connect.
- **Backup manual Mac path:** if Codemagic ever breaks, MacInCloud can still run Xcode for a manual Archive → upload. It's a last resort — the VM resets every session so you'd reinstall Xcode every time.
- **RoomPlan API — Xcode 26.2 breaking changes:** Two API renames that break the build:
  1. `CapturedRoom.ceilings` was removed — use `room.walls`, `room.floors`, `room.doors`, `room.windows`, `room.openings`, `room.objects` only. Fixed in `CaptureQualityTracker.swift` 2026-04-19.
  2. `RoomBuilder(outputOptions:)` renamed to `RoomBuilder(options:)` — always use `options:` label. Fixed in `RoomPlanPlugin.swift` 2026-04-20.
- **ExteriorScan tap fix (2026-04-20):** `ARWorldTrackingConfiguration.planeDetection` must include `.vertical` (not just `.horizontal`) for outdoor use. Raycast in `handleTap` polygon phase uses a 3-tier fallback: `.existingPlaneGeometry .any` → `.estimatedPlane .any` → camera projection at 3 m. Never use `.horizontal`-only alignment outdoors — ARKit won't detect ground planes reliably and taps silently fail.

---

## The AI System — How It All Connects

This is Avenstone's core competitive advantage. Every piece connects:

```
CLIENT / REP GOES ON-SITE
  └── AI Intake Wizard (components/ai/AiIntakeWizard.jsx)
      ├── Phase 1 (current): pure LiDAR scanner wrapper — opens directly to
      │   LidarScanner, no AI chat, no manual grid, no DB write.
      │   Add Room → name → Start Scan → Apple RoomPlan UI → Done → result.
      │   Rooms held in local state only (Path A — no persistence yet).
      └── Phase 2/3 (later): multi-room RoomPlan 2.0 merge + PDF export +
          job/lead creation on finish.
  (The original 3-step "AI chat → measurements → review" flow is retired.
  ai-intake edge function still exists but is no longer called from the app.)

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
| `AiFieldAgent` | `components/ai/AiFieldAgent.jsx` | Field-facing AI agent. |
| `AiHomeScr` | `components/ai/AiHomeScr.jsx` | AI home screen / dashboard. |
| `MaterialSelectionScr` | `components/ai/MaterialSelectionScr.jsx` | Material visualization / selection screen. |
| `MasterAgent` | `components/shared/MasterAgent.jsx` | Master AI orchestration UI component. |

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
- **JobDet tabs** — Info, Schedule, Notes/Photos, Documents, Change Orders, Messages, Estimate, Daily Logs, Payments, Consultation, Materials, AI Session
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

1. **LiDAR Phase 2 — continuous multi-room session**. One scan session, room by room: scan → pause → name it → move to next room → repeat → finish → compiles into one merged spatially-accurate floor plan. Swift plugin upgrade to iOS 17 continuous `RoomCaptureSession`. React UI shows live floor plan building as you walk. Single session limit ~1,500 sqft — larger homes scan by wing (see Phase 4).

2. **LiDAR → contact persistence**. Scans attach to a **contact** record (not a job). Contact must exist in the system first. Scan saves to their documents. When a job is created for that contact, the scan carries over automatically to the job's documents tab. New Supabase table: `contact_lidar_scans` (contact_id, tenant_id, rooms JSONB, floor_plan_svg, sqft_total, created_at).

3. **LiDAR Phase 3 — PDF floor plan export**. Export the merged floor plan as a PDF, attach to the contact/job documents. List detected furniture. Material visualization overlay (paint this wall blue) is a future add-on to this phase.

4. **LiDAR Phase 4 — wing editor + large-space stitching**. For spaces over ~1,500 sqft, scan in wings. Editor tab in project folder lets you position and connect wing scans into one complete plan. GPS anchoring helps mesh sessions spatially. Window/door type editing also lives here.

5. **White-label onboarding wizard** — trade-specific structured inputs (not freeform), generates ai_knowledge entries for any new tenant. Replaces the 7-question AiSetupWizard. Pricing inputs by trade, markup structure, draw schedule, CO policy, communication style.

6. **Test AI estimator with live data** — ai_knowledge now seeded with KC pricing. Open a job, ask the AI Companion for a rough estimate, verify it produces real dollar figures.

7. **AI PM dashboard** — owner screen surfacing nightly alert data, job health scores, alert history.

8. **Sub portal upgrades** — daily log submission, phase confirmation, AI companion for subs.

**Done:**
- Client portal progress stepper + realtime
- Notification bell
- ai-pm-nightly smart alerts
- GitHub Actions auto-deploy (Supabase edge functions)
- ai_knowledge seeded with KC mid-tier GC pricing (21 entries — all trades, labor rates, markup, draw schedule, CO policy, estimating guidelines)
- **Capacitor iOS native app shipped to TestFlight** (bundle id `com.avenstonekc.avenstone`, Codemagic build pipeline, zero MacInCloud)
- **RoomPlanPlugin.swift written + wired through Capacitor** — Phase 1 single-room scan returning real length/width/height/sqft/doors/windows in feet on iPhone 12 Pro+ / iPad Pro 2020+ hardware
- **AiIntakeWizard rewritten as pure LiDAR scanner** (Phase 1) — no AI chat, no manual grid, just Add Room → Start Scan → Done
- **Phase 1 LiDAR confirmed working on iPhone 17 Pro** — real RoomPlan scans returning live measurements

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

---

## Memory system

### Session start (before touching any code)
1. Read CLAUDE_MEMORY.md fully
2. Count the number of [LOG] entries in the file
3. If there are 15+ entries: consolidate automatically —
   compress all but the most recent 10 into a single "## Consolidated history" block,
   preserve all decisions/blockers/arch notes, rewrite the file in place,
   then append a [LOG] entry: "Auto-consolidated — [date]"
4. Acknowledge what the last session left off on
5. Ask if the goal today is to continue that or something new

### Automatic logging (no prompt needed — fire immediately when triggered)
Append a [LOG] entry to CLAUDE_MEMORY.md the moment any of these happen:
- A feature is built or completed
- A bug is fixed
- A file is created or significantly changed
- An architecture or approach decision is made
- A to-do item is added or marked done
- A blocker is identified

Use this format:

[LOG — YYYY-MM-DD]
- Action: one line describing what happened
- Files: list any files changed
- Decision: any choice made and why (omit if none)
- Open: any blocker or follow-up created (omit if none)
- Next: what logically comes next (omit if obvious)
