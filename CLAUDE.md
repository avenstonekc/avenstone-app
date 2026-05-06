# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What this app is

**Avenstone** — an AI-powered construction field operations platform for Avenstone Contracting (Kansas City, MO). Manages the full job lifecycle: leads → AI consultation → estimate → proposal → contract → field ops → client portal → payments.

**Today screen** is the morning brief replacement and the unifying interface across roles. On cold-start, the app lands here if the user has pending todos. Features (EstimateTab restructure, Subs tab, Materials tab, Takeoff wizard) emit todos as they ship — Today is the substrate. Todos with `type='failed_intent'` render amber (FEF3C7 background, FCD34D border, amber left accent) with a "↩ Resume" button that fires `setPendingAction` → App.jsx routes to the right screen and pre-fills the original form. Auto-resolves via `sbCompleteTodo` on successful save; remains open if user closes modal without saving.

**Competitive advantage:** AI embedded at every step of field operations. Not a CRM. Not a marketing tool. The thing that makes crews smarter, faster, and more profitable on every job.

**Product philosophy:** see AVENSTONE_VISION.md — the anti-surprise engine.

**Business model:** white-label multi-tenant platform. Avenstone is the first tenant (GC config). Other tenants — painting, tile, roofing, plumbing, electrical, single-trade specialists — run leaner configs on the same codebase.

- Local path: `C:\Users\Kalin\OneDrive\Documents\GitHub\avenstone-app`
- Live app: `https://avenstone-app.vercel.app`
- GitHub: `avenstonekc/avenstone-app`
- Supabase project ref: `cbfftukmhqvvjlrlnltk`
- Supabase URL: `https://cbfftukmhqvvjlrlnltk.supabase.co`
- Avenstone tenant ID: `00000000-0000-0000-0000-000000000001`
- Kalin's auth ID: `8171742a-b586-4f13-be61-744e191a1896`
- **Never send client links to `kalin@avenstonekc.com`** — `send-client-link` has no role guard and will overwrite his profile to `role='client'`. Contracts are safe (`send-contract-email` has an `isStaff` guard). Verified 2026-05-05.

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

## Multi-Tenant Architecture Rules (ALWAYS follow)

Avenstone is a multi-tenant, multi-trade, white-label platform. Every schema decision and feature decision must honor this from day one — retrofitting later is expensive and breaks tenant isolation.

**Hard rules:**
- Every new table includes `tenant_id UUID NOT NULL` with an index. RLS policy filters by `get_my_tenant_id()`.
- Every new query is filtered by `tenant_id` (or via RLS). Never write a `.from('table').select()` without scoping.
- Trade-specific data (pricing, checklists, templates, catalog) gets a `trade TEXT` column or tag in addition to `tenant_id`. Queries filter by both.
- Phase definitions, module visibility, and trade are per-tenant config — never hardcoded in components. Avenstone's 8-phase GC pipeline is the default for the Avenstone tenant; other tenants override.
- Edge functions read `tenant_id` from the calling user's profile, never accept it as untrusted input from the client.
- Hardcoded references to specific Avenstone-only values (Kalin's email, Avenstone tenant UUID, KC-specific pricing assumptions) belong in env config or `ai_knowledge` entries, not in component code.

**Soft rules (judgment calls):**
- When adding a feature, ask: is this *platform* (works for any trade) or *trade-specific* (data only)? Build platform features as code, trade-specific features as data.
- Avoid premature platform abstractions. Don't invent configurability we don't need yet — but don't lock ourselves into GC-only assumptions either.
- Module visibility flags (`uses_lidar`, `manages_subs`, `tracks_permits`) live on the tenant config row. Components check the flag and gracefully hide if off.

**Why this matters:** white-label expansion (v4+ in AVENSTONE_VISION.md) becomes a configuration-and-sales job instead of an engineering rewrite — but only if v1, v2, and v3 hold this line. One hardcoded GC assumption today = weeks of refactoring later.

---

## Working Preferences (READ FIRST — follow every session)

- **Code only by default** — no explanations, no commentary unless explicitly asked
- **Never ask clarifying questions about implementation** — make a reasonable decision and go
- **Ask only when the decision affects real users or is irreversible** — e.g. sending emails, firing notifications, deleting data. One line check saves a rework.
- **Best effort, keep moving** — ambiguous? pick the most logical path and implement it
- **One task at a time** — finish it, then move on
- **Commit and push when done** — every completed task ends with commits pushed to main. Commit logical chunks separately for bisectability. Never leave work uncommitted or unpushed unless explicitly told to wait.
- **Prefer editing existing code** over adding new files when possible
- **Screenshots > descriptions** — if there's a UI bug, look at the screenshot first
- **Think before building** — when an idea is floated, reason honestly: (1) Does existing software already do this better? (2) What's the realistic failure rate? (3) Does it fit Avenstone's actual competitive advantage? Say so if the answer is no.
- **Flag concerns, don't narrate** — only call out a concern if there's a real one (wrong approach, destructive action, API cost risk). Don't preface every request with an evaluation — that's friction. Just execute. If something is genuinely off, one line is enough before proceeding.
- **Proactive memory** — if there's a non-obvious way to save significant time in future sessions, add it to memory unprompted.
- **LiDAR goal is a spatially-accurate floor plan** — every room scan must preserve ARKit world coordinates so rooms are positioned correctly relative to each other. Any fix or approach that breaks spatial alignment (worldX/worldZ) or prevents StructureBuilder from merging rooms is not acceptable, even if it makes individual scans work. If a proposed fix trades floor plan accuracy for scan reliability, STOP and discuss before implementing.

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

`avenstone-vite/src/` contains: `components/` (subdirs: ai, auth, client, common, dashboard, forms, jobs, leads, modals, owner, public, shared, sub — run `ls` for current contents), `lib/` (supabase.js — Supabase client + ALL edge function URLs + ALL sb* helpers; utils.jsx — Ic icons, f$/fD/fDT formatters, isMob(); utils.js — ls/ll localStorage; pdf.js — PDF generation; lidar.js — Capacitor LiDAR bridge), `styles/` (global.css, tokens.css), `App.jsx` (main layout, routing, NAV array), `main.jsx`, `index.css`.

### Adding new code
- New components: `src/components/<feature>/ComponentName.jsx`
- New Supabase helpers: add to `src/lib/supabase.js` with `sb*` prefix
- New edge function URLs: export from `src/lib/supabase.js` alongside existing URLs
- New CSS: global styles in `src/index.css`; prefer existing utility classes
- New icons: add to `Ic` object in `src/lib/utils.jsx` — never inline SVGs in components
- New top-level screens: (1) add to `NAV` array, (2) add render in `pg-wrap`, (3) add to `bot-nav` if needed
- Complex multi-step flows: full-screen overlay, not a modal. Modals are for single-action confirmations only.
- **Multi-tenant + trade scoping is non-negotiable.** Every new table gets `tenant_id` + RLS. Every new query filters by it. Trade-specific data also gets a `trade` column. See "Multi-Tenant Architecture Rules" above.

---

## Supabase

### Tables
**Core tables:** see `src/lib/supabase.js` + `supabase/migrations/` for canonical list. All tables must include `tenant_id UUID NOT NULL` with an index and an RLS policy filtering by `get_my_tenant_id()`. Trade-specific tables also include a `trade TEXT` column.

**AI tables:**
- `job_ai_companions` — one record per (user_id, job_id, role). Stores full `conversation_history` (JSONB array of `{role, content}` messages). The AI companion's persistent memory.
- `ai_knowledge` — tenant-specific learnings injected into every AI companion prompt. Fields: `tenant_id`, `category`, `content`, `active`, `created_by`, `created_at`
- `ai_error_logs` — black box recorder for every AI failure. Fields: `function_name`, `error_type`, `error_message`, `user_input`, `ai_raw_response`, `session_id`, `job_id`, `user_id`, `tenant_id`, `metadata`, `created_at`
- `consultation_sessions` — each on-site AI consultation session
- `consultation_extractions` — ambient listening output (concerns, budget, risks, scope hints)
- `consultation_measurements` — per-trade measurements from measure mode

**Takeoff tables:**
- `takeoff_templates` — one row per (room_type, trade). `scope_definition` JSONB: `summary`, `optional`, `waste_pct` (deprecated/null), `conditional`, `default_unit`, `materials_formula` (array of formula objects — qty_basis, qty_multiplier, qty_divisor, fixed_qty per material). Platform defaults have `tenant_id=NULL`; tenant rows override.
- `takeoff_unit_costs` — both labor and material rate rows, distinguished by `category` column (`labor` | `materials`). Labor rows: `unit`, `base_rate`, `multipliers` JSONB, `waste_pct`. Material rows: same plus `material_name`, `coverage_sf`. Platform defaults `tenant_id=NULL`; tenant override rows beat platform defaults in `buildTakeoffDraft` JS de-dup. **Rep rate edits in the Takeoff wizard write back as tenant override rows (tenant_id set) via `sbSaveTenantUnitCostOverride`. Platform-default rows are immutable.**
- `trade_taxonomy` — canonical parent_trade / sub_trade hierarchy. Full-path strings (e.g. `Tile - Wall / shower`) join templates to unit costs.
- `job_room_scopes` — one row per (tenant_id, job_id, room_id). Stores the rep's chosen scope_tag for each scanned room. `room_id` = `${scan.id}_${idx}`. Special tag `not_in_scope` excludes the room from takeoff entirely; `custom` uses the `custom_trades TEXT[]` column; all others filter to matching `template_scope_subsets.trades`.
- `template_scope_subsets` — catalog of named scope variants per room_type. Platform defaults (`tenant_id=NULL`). `trades=['__all__']` = all trades; `trades=[]` = no trades (not_in_scope sentinel). Bathroom: 6 variants (not_in_scope, full_remodel, tile_only, vanity_swap, paint_and_floor, custom). Other room types: 3 variants (not_in_scope, full_scope, custom). `UNIQUE NULLS NOT DISTINCT (tenant_id, room_type, scope_tag)`.

**Storage buckets:** `job-photos` (public), `job-documents` (private), `bid-quotes` (private)

**RLS helpers:** `get_my_role()`, `get_my_tenant_id()`, `can_access_job(job_id)`

### Edge Functions
All URLs exported from `src/lib/supabase.js`. Function names are self-documenting.

- **AI:** `ai-companion`, `ai-intake`, `ai-pm-nightly`, `ai-field-agent`, `ai-home-companion`, `ai-master-agent`, `ai-project-manager`, `ai-estimator`, `ai-generate-sequence`, `ai-sub-onboard`, `ai-sub-pricing`, `ai-error-logger`, `process-transcript`, `measure-guide`, `generate-estimate-from-session`
- **Email / SMS / Push:** `send-contract-email`, `send-invite`, `send-client-link`, `send-bid-invite`, `send-estimate-email`, `send-contact-sms`, `notify-email`, `notify-sms`, `notify-realtor`, `send-push`, `missed-call-textback`
- **Integrations / Payments / Data:** `create-payment-link`, `stripe-webhook`, `ghl-webhook`, `twilio-inbound`, `address-autocomplete`, `get-contractor-profile`, `get-job-status`, `sequence-runner`

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
- Opus (`claude-opus-4-7`): deep analysis, project manager — `max_tokens: 4096`

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

This is Avenstone's core competitive advantage. Six surfaces:

- **LiDAR intake** (`AiIntakeWizard.jsx` + `LidarScanner.jsx`) — floor picker → scan rooms (ContinuousRoomScanViewController, worldX/worldZ) → height capture → quality report → save to job_lidar_scans / contact_lidar_scans → buildFloorPlanPDF. Supports interior multi-room and exterior ARKit outline. Original ai-intake chat flow retired.
- **Tenant setup** (`AiSetupWizard.jsx`) — opens via manual button on AiKnowledgeScr; no auto-fire. 7 questions → populates ai_knowledge with labor rate, markup, draw structure, CO policy, specialties.
- **AI Consultation** (`process-transcript` edge fn) — ambient mode extracts concerns/budget/scope → consultation_extractions; measure mode guides rep trade-by-trade → consultation_measurements. UI is `ConsultationTab.jsx` (thin composer) + 3 atoms in `components/jobs/consultation/`: `AmbientPanel` (owns mic + transcript + 60s flush interval), `MeasurePanel` (owns chat + TTS + mic), `GapResolutionModal` (gap review before estimate). State: parent-owned, prop callbacks, no Context. sessionIdRef closure pattern: ref set synchronously in `startSession()`, passed as `getSessionId()` callback to atoms. AmbientPanel unmount cleanup is non-negotiable (mic-stuck-on bug). OhShitCurator stays inline in ConsultationTab (no 4th atom).
- **AI Companion** (`AiCompanionChat.jsx`, `ai-companion` edge fn) — per person per job, full job context, ai_knowledge injected, conversation_history in job_ai_companions, sliding 20-message window.
- **Daily PM brief** (`ai-pm-nightly`) — fires once/day on login, 11 rule checks (+ 3 added 2026-04-28: consultation_stale, estimate_no_proposal_24h, proposal_not_sent_48h) per active job, 24h dedup, right person notified. DISABLED — do not re-enable without approval.
- **Scope detail forms** — bathroom scope tags (full_remodel, tile_only, vanity_swap, paint_and_floor) show a per-room detail form in ScopeTab. Schemas stored in `scope_detail_schemas` table (JSONB, keyed by room_type + scope_tag). Rep-filled values stored in `job_room_scopes.scope_details` JSONB. `fixture_select` fields (vanity, door, toilet, countertop) emit fixed line items at takeoff time. Number fields feed material formula evaluation via `scope_detail` qty_basis in `takeoff_templates.scope_definition`. Other room types have no detail forms yet.
- **Bathroom takeoff inputs**: shower dimensions in feet+inches (shower_width_in, shower_length_in, shower_wall_height_in — stored as total inches). Schema fields `shower_wall_sf` and `shower_floor_sf` are `type: computed` — resolved by `runCompute` in `computeFns.js` (shared between takeoff.js + ScopeDetailForm). Override via `shower_wall_sf_override` / `shower_floor_sf_override` in scope_details. `resolveDetails` 3-pass: defaults → computed (override wins) → subtract. `labor_formula` in scope_definition drives labor qty for Tile-Wall/shower (shower_wall_sf), Tile-Floor (floor_tile_sf), Cleanup (floor_sf metric); other trades fall back to `buildQuantity`. Labor never applies waste — materials only (unit cost row waste_pct).
- **Black box** (`ai-error-logger`) — fire-and-forget on every AI error → ai_error_logs.

### AI Component Map
| Component | File | Purpose |
|-----------|------|---------|
| `AiCompanionChat` | `components/shared/AiCompanionChat.jsx` | Floating sparkle button on job detail. Loads history on open. |
| `AiIntakeWizard` | `components/ai/AiIntakeWizard.jsx` | LiDAR capture flow: scan → height → quality report → save to job or contact. |
| `AiKnowledgeScr` | `components/ai/AiKnowledgeScr.jsx` | CRUD for ai_knowledge entries. Owner only. |
| `AiSetupWizard` | `components/ai/AiSetupWizard.jsx` | 7-question onboarding wizard. Opens via manual button on AiKnowledgeScr. |
| `AiFieldAgent` | `components/ai/AiFieldAgent.jsx` | Field-facing AI agent. |
| `AiHomeScr` | `components/ai/AiHomeScr.jsx` | AI home screen / dashboard. |
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

**Phase progression is now derived from schedule items, not edited directly.**
When a `sub_start` schedule item changes status, `derivePhaseStatus(jobId, tenantId)` in `supabase.js` automatically advances the matching `job_phases` row. Derivation is idempotent and never decrements — a phase at `complete` stays there even if its driver item is cancelled. The `trade_phase_map` table (per-tenant) defines which trade maps to which phase_name.

### Information Architecture
- **Top nav** — daily-use screens only. Job-specific features belong in `JobDet` tabs.
- **JobDet tabs** — Info, Estimate, Subs, Financials, Schedule, Field, Messages, Documents, Scanner, Consultation. Tab IDs in TABS array: `info`, `estimate`, `subs`, `financials`, `sched`, `field`, `msgs`, `docs`, `floorplan`, `session`.
- **Subs tab** (`SubsTab.jsx`) — assigned sub list with status badges + payment summary, quote requests (renamed from invitations_to_bid), bid award workflow. Invite from directory via SubPicker. ITB code fully removed from EstimateTab as of 2026-04-29.
- **Estimate tab** (`EstimateTab.jsx`) — 5 sub-tabs in order: **Build** (AI Estimator chat inline), **Scope** (per-room scope tagging — filters which trades the takeoff wizard generates; `ScopeTab.jsx`), **Takeoff** (room-type wizard; `acceptTakeoffDraft` writes labor + material lines to estimate_line_items in one transaction, scoped-deletes existing takeoff rows by `notes LIKE 'takeoff:%'`), **Line items** (CRUD table of estimate_line_items via LineItemModal), **Proposal** (proposal builder inline). Default landing: `items` if line items exist → `scope` if scope rows exist → `build`. No LiDAR scanner card — Scanner tab owns capture. No modal overlays — all content is inline in its sub-tab.
- **Procurement substrate** — `quote_requests` table (renamed from `invitations_to_bid`) has `kind` column (sub_bid | material_rfq), `lead_time_days`, `needed_by_date`. Compat view `invitations_to_bid` still exists for SubPortal until next cleanup migration.
- **Schedule items** (`schedule_items` table) — flexible job schedule events: `material_delivery`, `sub_start`, `site_visit`, `inspection`, `milestone`, `delay`. Fields: `title`, `scheduled_date`, `scheduled_end_date`, `trade`, `assigned_sub_id`, `notify_client` (bool), `status` (scheduled/in_progress/complete/cancelled). `sub_start` items with a matching `trade` in `trade_phase_map` auto-advance the corresponding `job_phases` row via `derivePhaseStatus`. Clients see items where `notify_client=TRUE` (via `schedule_items_client_select` RLS). Subs see items they're assigned to or on jobs they're on. Helpers: `sbLoadScheduleItems`, `sbCreateScheduleItem`, `sbUpdateScheduleItem`, `sbDeleteScheduleItem` (soft-cancel), `sbLoadScheduleItemsForSub`.
- **`trade_phase_map`** — per-tenant mapping of canonical trade strings (full-path from `trade_taxonomy`) to `job_phases.phase_name` values. Has an `is_primary` BOOLEAN column. **Only `is_primary=TRUE` rows drive phase derivation via `derivePhaseStatus`.** Non-primary rows exist for notifications/reporting but do not gate phase progression. Avenstone GC: 17 rows seeded, 10 marked primary — Demo, Framing, Plumbing-Rough-in, Electrical-Rough-in, HVAC-Install, Drywall-Hang, Paint-Interior, Tile-Floor, Tile-Wall/shower, Cabinets/vanities-Install. Drywall-Patch/Tape and all Trim/Plumbing-Finish/Electrical-Finish rows are non-primary. Other tenants insert their own rows; tenant rows override platform-null rows.
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
- **RoomPlan multi-room session lifecycle** — between rooms use `captureSession.stop(pauseARSession: false)` to keep ARKit tracking alive. Final room uses `stop(pauseARSession: true)`. Plain `stop()` defaults to `pauseARSession: true` which kills the ARSession and resets the world origin — rooms will land in random positions when merged. Never change this back.

---

## Model selection — Opus-only section. Sonnet skips this entirely.

> **If the current model is Sonnet:** skip this whole section. Execute Kalin's request directly. Do NOT spawn sub-agents via the Agent tool. Do NOT write paste-ready prompts for yourself. Do NOT dispatch — you ARE the executor. The trigger words below ("easy", "use sonnet", "just write the prompt", etc.) do not apply to you when you are Sonnet. Just do the work.
>
> **If the current model is Opus:** the dispatch rules below apply.

That's the rule. Kalin runs Opus directly inside Claude Code; Opus is ~5× the cost of Sonnet. The retired `/opus` relay is dead — don't reference it.

**Solutions (Opus stays):** diagnose crashes, design schema/architecture, decide tradeoffs, plan multi-step features, write specs, multi-tenant / cost / real-money calls.

**Coding (Opus dispatches to Sonnet):** file edits, component scaffolding, wire-ups, mechanical refactors, boilerplate (`sb*` helper, edge fn URL export, screen scaffold), running commands, applying migrations, deploys, test-fix loops, doc updates.

**When in doubt → dispatch.** The cost ratio is ~5×. Erring toward Sonnet is the cheaper mistake.

**Trigger words from Kalin (Opus-only — dispatch immediately, no debate):**
- "easy" / "easy task" / "easy fix"
- "do it on sonnet" / "use sonnet"
- "save the tokens" / "this is mechanical"
- "just write the prompt" → write a paste-ready prompt instead of dispatching (Kalin runs it in another window)

**Parallel tracks — two things at once.** When two tasks don't conflict, run them in parallel: Opus stays on the harder track, Kalin pastes a paste-ready prompt to CMD/Sonnet for the other. Don't parallel when files overlap or track B depends on track A's output.

**How Opus dispatches:** use the Agent tool with `model: "sonnet"`. Prompt must be self-contained — include exact paths, line numbers, strings to find. See OPUS_PROMPT_RULES.md for the full dispatch template.

---

## Priority Order (what we're building)

**LiDAR & floor plan PDF take precedence over website work.** Both tracks ship in parallel — but if Kalin shows up with a LiDAR/PDF screenshot, drop everything.

1. **Floor plan PDF — match MagicPlan output, pull dimensions cleanly.** This is the visible field deliverable. Sub-tasks:
   - **Fixture/object rendering** — Swift serializes `room.objects` (toilet, bathtub, sink, stove, oven, refrigerator, dishwasher, washerDryer, storage). PDF needs `_drawFixture` reinstated with rotation transform from `_processAllRooms`.
   - **Room-name-backwards UX bug** — StructureBuilder returns rooms in spatial order, not scan order. Naming modal shows them in the rebuilt order so what Kalin types ends up on the wrong room. Fix: render a thumbnail/centroid mini-map per room in the naming list so the rep can see which room they're labeling.
   - **Single-room PDF parity** — chain dims and label collision logic only run in worldMode. Single-room scans use the older per-seg path. Bring to parity once multi-room is solid.

2. **LiDAR Phase 4 — wing editor + large-space stitching.** Spaces over ~1,500 sqft scan in wings. Editor tab lets you position and connect wings into one plan. GPS anchoring helps align sessions spatially. Window/door type editing lives here.

3. **Sub portal upgrades** — PM-Sub direct chat thread (separate from general job messages, spec'd April 15 but not yet built), phase start/complete confirmation, CO submission by sub.

4. **White-label onboarding wizard** — trade-specific structured inputs (not freeform), generates ai_knowledge entries for any new tenant. Replaces the 7-question AiSetupWizard. Pricing inputs by trade, markup structure, draw schedule, CO policy, communication style.

5. **Lien waiver generation** — pdf-lib preferred over jsPDF. Auto-populate from job, sub, and payment data.

6. **Test AI estimator with live data** — ai_knowledge seeded with KC pricing. Open a job, ask AI Companion for a rough estimate, verify real dollar figures come back.

**Done** (pre-2026-04-19 history in CLAUDE_MEMORY.md project snapshot):
- **Capacitor iOS native app + Codemagic pipeline** shipped to TestFlight (bundle id `com.avenstonekc.avenstone`)
- **Full LiDAR capture stack** — single-room, multi-room (ContinuousRoomScanViewController, pauseARSession:false), exterior AR outline, height capture, quality meter (0–100), GPS stamping, floor picker, room-naming modal with polygon thumbnails
- **Floor plan PDF renderer** (`src/lib/pdf.js`) — landscape per-floor + summary page, poché walls, chain dims with collision-tiered labels, room fill tint, left title column, polylabel, scale bar
- **AI PM Dashboard** — owner-only, 30-day nightly alert history + "Failed saves (7 days)" tile (`AiPmDashboard.jsx`). Failure tile: green=0, navy=1-5, amber=6+; "By kind" toggle shows breakdown by todo kind. `captureFailedIntent` is a pure DB write — no AI calls, safe on every save failure.
- **Floor plan PDF crash fixed (2026-04-26)** — `dimBoxes` const hoisted to let at outer scope
- **Sub CO workflow** — sbSubSubmitCO generates co_number, stamps submitted_by_id/role; COTab shows submitter badge + inline edit for pending COs; PM approve/reject triggers targeted sub notification (sbNotifyUser)
- **Phase audit columns** — started_at/started_by_id/completed_at/completed_by_id stamped on status change; ScheduleTab + SubJobView render audit lines

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
- **"write a migration"** — every migration prompt closes with `information_schema` verification + `NOTIFY pgrst, 'reload schema'` + `pg_policies` check. Three incidents on 2026-05-02 established this is non-negotiable. Commit presence ≠ migration applied to live DB.

---

## Memory system

**Two-file split (established 2026-05-03):**

- **CLAUDE_MEMORY.md** — lean working memory. Contains locked principles, active open items, working-mode patterns, and a slug pointer index. Read this at session start. Append new [LOG] entries here. When a LOG is no longer actively relevant, move its content to CLAUDE_ARCHIVE.md under a new slug and add the pointer to the index.
- **CLAUDE_ARCHIVE.md** — full historical LOG content organized by `## slug · date · description` headings. Retrieve by searching for the slug. Fully populated — all chunks committed. Pre-cleanup CLAUDE_MEMORY.md (1220 lines) preserved at `git show 7070d65^:CLAUDE_MEMORY.md`.

**Archive complete.** CLAUDE_ARCHIVE.md fully populated with all historical LOG entries by slug. Search by slug heading or scan the pointer index in CLAUDE_MEMORY.md. Pre-cleanup CLAUDE_MEMORY.md (1220 lines) preserved in git history at commit `7070d65^`.

**Symptom index:** CLAUDE_MEMORY.md contains a "Symptom index" section mapping common error patterns to the archive slugs that solved them. Consult this section first when debugging — it's the triage layer before reading archive entries in full. Add new entries whenever a resolved bug fits a pattern likely to recur.

**Failed-attempts logging:** When an audit produces a wrong hypothesis, or an experiment is reverted, or a "we thought X" moment ends in "it was actually Y" — log it as a slug in CLAUDE_ARCHIVE with the suffix `-failed` (e.g. `structurebuilder-skip-failed · 2026-04-26 · we thought skipping it would fix naming, it broke wall geometry, reversed same day`). These slugs are first-class archive entries. Diagnose faster by surfacing what already didn't work.

**CLAUDE_INDEX.md (planned, not yet built):** Categorized lookup file. Three categories: function (app area), date (chronological), failure pattern. Each line: `YYYY-MM-DD · slug-name`. Future Claude reads this before archive to identify relevant slugs. Build deferred until real friction justifies it. Discipline rules pre-locked in OPUS_RULES so when built, it ships disciplined.

At session start: read CLAUDE_MEMORY.md top-to-bottom. It is now lean enough to read fully every time.

Auto-append a [LOG] entry to CLAUDE_MEMORY.md immediately when: a feature ships, a bug is fixed, a file is significantly changed, an architecture decision is made, a blocker is identified.

Log format:
```
[LOG — YYYY-MM-DD]
- Action: one line
- Files: changed files
- Decision: choice + why (omit if none)
- Open: blocker or follow-up (omit if none)
```
