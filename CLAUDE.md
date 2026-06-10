# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Primacy:** Web (avenstone-vite) is the primary codebase. Mobile (RN/Expo) parity is best-effort and lags by ~1 arc. Architectural decisions optimize for web first; mobile follows.

---

## What this app is

**Avenstone** — an AI-powered construction field operations platform for Avenstone Contracting (Kansas City, MO). Manages the full job lifecycle: leads → AI consultation → estimate → proposal → contract → field ops → client portal → payments.

**HomeScr** is the morning brief replacement and the unifying interface across roles. On cold-start, the app lands here if the user has pending todos. Features (EstimateTab restructure, Subs tab, Materials tab, Takeoff wizard) emit todos as they ship — Today is the substrate. Todos with `type='failed_intent'` render amber (FEF3C7 background, FCD34D border, amber left accent) with a "↩ Resume" button that fires `setPendingAction` → App.jsx routes to the right screen and pre-fills the original form. Auto-resolves via `sbCompleteTodo` on successful save; remains open if user closes modal without saving.

**Competitive advantage:** AI embedded at every step of field operations. Not a CRM. Not a marketing tool. The thing that makes crews smarter, faster, and more profitable on every job.

**Product philosophy:** see AVENSTONE_VISION.md — the anti-surprise engine.

**Business model:** white-label multi-tenant platform. Avenstone is the first tenant (GC config). Other tenants — painting, tile, roofing, plumbing, electrical, single-trade specialists — run leaner configs on the same codebase.

- Local path: `C:\Users\Kalin\GitHub\avenstone-app`
- Live app: `https://avenstone-app.vercel.app`
- GitHub: `avenstonekc/avenstone-app`
- Supabase project ref: `cbfftukmhqvvjlrlnltk`
- Supabase URL: `https://cbfftukmhqvvjlrlnltk.supabase.co`
- Avenstone tenant ID: `00000000-0000-0000-0000-000000000001`
- Kalin's auth ID: `8171742a-b586-4f13-be61-744e191a1896`

---

## API Cost Rules (ALWAYS follow — Kalin has been burned twice)

**Before building any AI feature, answer these three questions:**
1. How often does this fire? (per message, per login, per day, per DB event?)
2. Which model? Haiku < Sonnet < Opus — never use Opus for anything automatic
3. Is this user-triggered or automatic? Automatic = must have hard rate limiting

**Rules:**
- **Never fire Opus automatically** — Opus is for on-demand owner actions only, never background jobs
- **Never fire any AI on a DB webhook/trigger** — DB events can cascade into thousands of calls
- **ai-pm-nightly is pure SQL** (14 rules, zero model calls) with no pg_cron schedule. Do not add a cron schedule without explicit approval. Three of its rules reference dropped legacy ITB schema — see AI_PM_LEGACY_RULES open item in CLAUDE_MEMORY.md.
- **Agentic loops** — cap at 3 iterations max on Haiku, 3 on Sonnet. Every loop iteration = full API cost
- **Conversation history window** — 10 messages max on Haiku agents, 20 max on Sonnet
- **max_tokens** — Haiku: 1024 for simple responses, 2048 only when tools are active. Sonnet: 2048 default, 4096 only for complex reasoning. Never set higher than needed.
- **Background automatic functions** (ai-pm-nightly, any cron) — must use Haiku only, no agentic loops
- **Always state the cost implication** when proposing a new AI feature — "this fires on every X which means Y calls per day"
- **Prompt caching** — standing practice for agentic/chat AI functions whose system+tools prefix clears the model cache minimum (1024 Sonnet / 2048 Haiku). Breakpoint on the system+tools prefix only, never on the rolling conversation history. 5-minute TTL. This is an optimization, not a rate-limiting safeguard — it does not substitute for any rule above. Do NOT cache one-shot or background functions: the cache-write premium does not amortize.

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

**`estimate_line_items` schema (key columns):** `quantity`, `unit_cost` (= catalog base rate — never multiply floor premium into this), `multiplier NUMERIC(5,2) DEFAULT 1.0` (floor premium — 1.30 basement, 1.15 second-floor, 1.0 first-floor/materials), `markup_pct`. `total_cost` = `quantity × unit_cost × multiplier` (GENERATED STORED). `client_price` = `quantity × unit_cost × multiplier × (1 + markup_pct/100)` (GENERATED STORED). Consumers must read the generated columns, not recompute manually. `multiplier` is written by `acceptTakeoffDraft`; all other insert paths (AI estimator, LineItemModal, ConsultationTab) omit it and get DEFAULT 1.0.

**Storage buckets:** `job-photos` (public), `job-documents` (private), `bid-quotes` (private), `bug-screenshots` (private — 1-year signed URLs via submit-bug-report edge fn)

**v1/v2 additions:** `bug_reports` (tenant read + platform_owner cross-tenant). `profiles.is_platform_owner BOOLEAN` — cross-tenant bug_reports access. `tenants.notification_rules JSONB` — kept for future use (cron alerting deferred). The v1 `pending_tasks` queue table was dropped in migration `20260509180000` when Master Agent v2 retired the queue layer (chat-first architecture). `PendingTaskOwnerScr`, `PendingTaskList`, `lib/pendingTasks.js`, and `lib/labelParser.js` were deleted in the same arc.

**RLS helpers:** `get_my_role()`, `get_my_tenant_id()`, `can_access_job(job_id)`

### Edge Functions
All URLs exported from `src/lib/supabase.js`. Function names are self-documenting.

- **AI:** `ai-companion`, `ai-intake`, `ai-pm-nightly`, `ai-field-agent`, `ai-home-companion`, `ai-master-agent`, `ai-project-manager`, `ai-estimator`, `ai-generate-sequence`, `ai-sub-onboard`, `ai-sub-pricing`, `ai-error-logger`, `process-transcript`, `measure-guide`, `generate-estimate-from-session`
- **Email / SMS / Push:** `send-contract-email`, `send-invite`, `send-client-link`, `send-bid-invite`, `send-estimate-email`, `send-contact-sms`, `notify-email`, `notify-sms`, `notify-realtor`, `send-push`, `missed-call-textback`, `create-client-login`
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
Apply via `npm run migrate` from `avenstone-vite/`:
```bash
npm run migrate ../supabase/migrations/<filename>.sql
```
This is a single atomic command: applies the SQL, auto-derives expected objects
(CREATE TABLE / ADD COLUMN / CREATE INDEX / CREATE POLICY) and verifies each is
present in the live DB, then issues `NOTIFY pgrst, 'reload schema'`. Exits non-zero
if apply fails or any expected object is absent — green exit is proof of landing.

For exotic SQL with no auto-derivable objects, pass `--verify` explicitly:
```bash
npm run migrate path/to/migration.sql --verify "table.column,index:idx_name"
```

Confirm the PAT is accessible first (one-time): `npm run migrate --selftest`

### Generated TypeScript types

After every migration, regenerate the DB types:
```bash
npm run gen:types   # run from avenstone-vite/
```
This calls `tools/gen_types.js`, which reads the PAT from `C:/Users/Kalin/supabase-token.txt` and writes `avenstone-vite/src/types/database.types.ts`. Commit the regenerated file alongside the migration commit.

**Why:** schema drift (wrong column name, missing column) surfaces as a TypeScript compile error at `npm run build` instead of a runtime PostgREST `42703` in production. The generated `Database` interface is the structural backstop for the recurring drift class.

**Discipline:** `gen:types` after every migration is the same rule as `information_schema` verification — commit presence ≠ type accuracy. Regen and commit is proof of alignment.

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
- **`@capgo/capacitor-speech-recognition` (not `@capacitor-community`)** — community plugin has no Cap-8 release. Capgo fork is the Cap-8 successor; major version tracks Capacitor. Installed 8.1.2 (2026-05-17). `NSSpeechRecognitionUsageDescription` added to Info.plist. Plugin registered via SPM. Used in MasterAgent hold-to-talk mic button — `available()` / `requestPermissions()` / `start({ partialResults: true })` / `stop()` / `addListener('partialResults', ...)`.
- **`@capacitor-community/text-to-speech@8.0.0`** — Phase 4 TTS. Installed 2026-05-17. Registered via SPM alongside STT plugin. Used in MasterAgent to speak agent replies + confirmation card descriptions. Speaker toggle persisted to localStorage `av_tts_enabled`.
- **Audio session isolation (STT + TTS coexistence):** The STT plugin (`@capgo/capacitor-speech-recognition`) sets the iOS shared `AVAudioSession` to `.playAndRecord / .duckOthers / .measurement` and never calls `setActive(false)`. The TTS plugin avoids this entirely: `AVSpeechSynthesizer.usesApplicationAudioSession = false` gives it its own independent session. The `category` option in the TTS `speak()` JS API (`"ambient"` | `"playback"`) is accepted but silently ignored in the iOS Swift implementation — the session isolation is the actual mechanism. On-device audio quality must be verified after each Codemagic build: agent voice should be full-volume and clear, not ducked or cut off.
- **Hold-to-talk controls in Capacitor WKWebView must use touch events, NOT pointer events.** On iOS, a touch press on a button often emits `pointercancel` instead of `pointerup`, silently dropping the release. `onPointerUp` and `onPointerLeave` never fire, leaving `micListening` stuck true. Use `onTouchStart`/`onTouchEnd`/`onTouchCancel` (with `e.preventDefault()` to suppress synthetic mouse events) plus `onMouseDown`/`onMouseUp`/`onMouseLeave` as the desktop fallback. This is why the MasterAgent mic button was non-functional on first TestFlight build (fixed 2026-05-17).
- **RoomPlan API — Xcode 26.2 breaking changes:** Two API renames that break the build:
  1. `CapturedRoom.ceilings` was removed — use `room.walls`, `room.floors`, `room.doors`, `room.windows`, `room.openings`, `room.objects` only. Fixed in `CaptureQualityTracker.swift` 2026-04-19.
  2. `RoomBuilder(outputOptions:)` renamed to `RoomBuilder(options:)` — always use `options:` label. Fixed in `RoomPlanPlugin.swift` 2026-04-20.
- **ExteriorScan tap fix (2026-04-20):** `ARWorldTrackingConfiguration.planeDetection` must include `.vertical` (not just `.horizontal`) for outdoor use. Raycast in `handleTap` polygon phase uses a 3-tier fallback: `.existingPlaneGeometry .any` → `.estimatedPlane .any` → camera projection at 3 m. Never use `.horizontal`-only alignment outdoors — ARKit won't detect ground planes reliably and taps silently fail.

---

## The AI System — How It All Connects
### AI Component Map
| Component | File | Purpose |
|-----------|------|---------|
| `AiCompanionChat` | `components/shared/AiCompanionChat.jsx` | Floating sparkle button on job detail. Loads history on open. |
| `AiIntakeWizard` | `components/ai/AiIntakeWizard.jsx` | LiDAR capture flow: scan → height → quality report → save to job or contact. |
| `AiKnowledgeScr` | `components/ai/AiKnowledgeScr.jsx` | CRUD for ai_knowledge entries. Owner only. |
| `AiSetupWizard` | `components/ai/AiSetupWizard.jsx` | 7-question onboarding wizard. Opens via manual button on AiKnowledgeScr. |
| `AiFieldAgent` | `components/ai/AiFieldAgent.jsx` | Field-facing AI agent. |
| `AiHomeScr` | `components/ai/AiHomeScr.jsx` | AI home screen / dashboard. |
| `MasterAgent` | `components/shared/MasterAgent.jsx` | Persistent chat panel mounted at App.jsx top level. 5 tiles act as starter prompts (TILE_PREFIXES); the agent infers verb + fields from freeform input. Confirm card surfaces via `pending_action`. Bug submission is the inline exception — bypasses ai-master-agent and posts to submit-bug-report. |
| `MasterAgentErrorCard` | `components/shared/MasterAgentErrorCard.jsx` | Amber error card rendered in chat when a confirmed tool execution fails. "Try again" re-surfaces the confirm card; "Report bug" calls submitBug. Reuses captureFailedIntent (fires on all tool failures) and submit-bug-report. |
| `BugReportsScr` | `components/admin/BugReportsScr.jsx` | Platform-owner cross-tenant bug report dashboard. |
| `BugReportDetailModal` | `components/admin/BugReportDetailModal.jsx` | Bug detail + Claude prompt copy + mark-fixed. |
| `ai-auto-fix-dispatcher` | `supabase/functions/ai-auto-fix-dispatcher/index.ts` | AUTO_FIX_ARC Phase C+D — receives Supabase DB webhook on bug_reports INSERT, classifies bugs (backend_safe / frontend / ios / unsafe_path / ambiguous) via Sonnet, dispatches fix prompts to VM webhook if eligible. Kill switch: AUTO_FIX_ENABLED env var. |
| `auto-fix-callback` | `scripts/auto-fix-callback.js` | AUTO_FIX_ARC Phase D — VM executor runs this after committing a fix. Patches bug_reports optimistically to auto_fixed, then polls Vercel /v6/deployments every 10s (up to 5min). READY → confirms auto_fixed + records vercel_deployment_id. ERROR → git revert + push + auto_fix_failed. TIMEOUT → auto_fix_unknown. Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + VERCEL_API_TOKEN from ~/avenstone-app/.env on VM. |
| `TodoCard` (Phase E) | `components/common/TodoCard.jsx` | AUTO_FIX_ARC Phase E — failed-intent todos with bug_report_id subscribe to bug_reports realtime changes. Status-aware states: attempting=amber spinner, auto_fixed=green+"Try again" (re-fires handleResume), auto_fix_failed/unknown/needs_human=amber label+Resume. |

---

## Bug pipeline (v1)

- **bugContext.js** — ring buffers: breadcrumbs (20), consoleErrors (10), networkErrors (10). `initBugContext()` wraps `console.error`, registers `unhandledrejection` + `error` listeners. `getSnapshot()` returns full state at any point. `pushBreadcrumb()` called on every `pg` state change + tile taps.
- **html2canvas** — captures `document.body` at 0.5× scale at bug tile-tap. PNG dataURL stored in context.
- **bug_reports table** — tenant-scoped, RLS: tenant members can read+insert own; `is_platform_owner` profiles can read all + update.
- **submit-bug-report edge fn** — JWT auth, uploads screenshot to `bug-screenshots` private bucket (1-year signed URL), INSERTs bug_reports, sends email via Resend to `BUG_NOTIFY_EMAILS` env var (default `kalin@avenstonekc.com`, comma-separated). Email contains a paste-ready Claude Code prompt block.
- **Paste-ready Claude prompt format** — includes: description, route, version, device, numbered breadcrumbs, bulleted errors, screenshot link, 6 explicit tasks (audit first → hypothesis → patch if obvious → one commit → CLAUDE_MEMORY log → mark fixed).
- **BugReportsScr** — platform_owner gated (`is_platform_owner=TRUE`). Filter by status + tenant. Click row → BugReportDetailModal.
- **BugReportDetailModal** — breadcrumb timeline, expandable errors, screenshot img, "Copy as Claude prompt" + "Mark fixed" buttons.

**Env var to set in Supabase function secrets:** `BUG_NOTIFY_EMAILS` — comma-separated email list. Default: `kalin@avenstonekc.com`. Add Blake's email once known.

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

**Client portal auth (2026-06-01 — magic link RETIRED):**
- Client portal uses email + password login. PM sets the password via `ClientLoginButton` in InfoTab → calls `create-client-login` edge function.
- `create-client-login`: finds auth user via `get_auth_user_id_by_email` RPC (SECURITY DEFINER on auth.users). Sets password (`updateUserById` + `email_confirm: true`). Upserts profile with `role=client`, `tenant_id`. Links `jobs.client_user_id`.
- `ClientPortal.jsx` job query includes `.eq('tenant_id', AV_TENANT)` — strict tenant isolation. Client sees ONLY jobs in their own tenant.
- DO NOT use magic links for client portal access — they redirect to wrong project/tenant. Magic link helpers in `supabase.js` (sbSendClientLink/sbGetClientLink) kept for email send flow only.
- `get_auth_user_id_by_email` RPC is the ONLY reliable way to look up a Supabase auth user by email from within an edge function. GoTrue `?email=` filter and `listUsers()` are unreliable in the edge function context.

### Job statuses (in order)
`lead → proposal → contract → in_progress → final_touches → complete`
Also: `on_hold` (lateral pause state — not a phase advancement)

CHECK constraint `jobs_status_canonical_check` enforces this set (Phase 4a-ii, migration 20260506200000). White-label-driven: terms work for any contractor type, not just GC. `bid_sent` and `active` are legacy values; all existing rows backfilled.

**Trade phases are separate from job lifecycle.** `job_phases` rows track construction trade phases (Demo, Framing, etc.) and are auto-advanced by `derivePhaseStatus(jobId, tenantId)` via `schedule_items` completion. This is completely separate from `jobs.status`. The `trade_phase_map` table (per-tenant) defines which trade maps to which `job_phases.phase_name`.

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

## Locked decisions — Master Agent v2

- **Chat is the input surface.** Tiles are starter prompts (`TILE_PREFIXES`), not state-machine triggers. Do not reintroduce per-verb chip flows or a queue table — v1's queue layer was overbuilt for a single-tenant tool and was retired in `20260509180000_drop_pending_tasks.sql`.
- **Confirm card is the only commit point.** Every write verb in `CONFIRM_TOOLS` (currently 13: log_payment, log_receipt, submit_change_order, add_todo, create_job, notify_team_member, create_schedule_item, log_sub_invoice, log_sub_payment, approve_sub_invoice, upload_company_file, record_deposit, compose_draw) returns `pending_action` from ai-master-agent. The agent never writes silently. New write tools must be added to this set unless deliberately excluded with a written reason. Total tools in ai-master-agent: 24 (2 read + 22 write). Verified in `AGENT_AUDIT.md` (2026-06-02) from `ai-master-agent/index.ts:137–151` and `index.ts:448–806`.
- **Money read-back is non-negotiable.** Money verbs include `amountToWords` output on the Confirm card so misheard digits read obviously wrong. The helper lives in ai-master-agent/index.ts (Deno-compatible). Same VOICE_AGENT money-safety pattern applies if more money verbs are added.
- **MasterAgent mounts at App.jsx top level.** This is what makes the conversation persistent across `pg` navigation. Do not unmount it on route change. Do not move it inside a screen.
- **Bug is the inline exception.** Bug submission does not go through ai-master-agent — html2canvas + getSnapshot fire at tile-tap (the screen changes during chat) and the description posts to submit-bug-report directly. Keep this path bypassed; it is intentionally not LLM-mediated.
- **html2canvas screenshot at tile-tap** — not later. The screen changes during follow-up; snap at the moment the user decides something is broken.
- **platform_owner flag not hardcoded UUID** — `is_platform_owner BOOLEAN` on profiles. Set manually via SQL UPDATE. Add Blake once email is known.
- **paste-ready Claude prompt format** — the bug email contains a verbatim paste block. Format is locked; do not simplify into a summary without the 6-task structure.

---

## Known Gotchas

- **Mobile UX rules (confirmed 2026-05-17):**
  - Form inputs must be `≥ 16px` — iOS WKWebView auto-zooms on focus for any input below 16px. Use `font-size: 16px` on `.finp` and any standalone `<input>` or `<textarea>`. Never go below this.
  - Bottom padding must include `env(safe-area-inset-bottom)` — flat pixel values clip content behind the iPhone X+ home indicator. Use `calc(Xpx + env(safe-area-inset-bottom))`.
  - Tap targets must be `≥ ~44px` tall — buttons with `padding: 0` or `font-size: 11` are unreliable on touch. Minimum `minHeight: 36px` + adequate padding. 44px is Apple's guideline.
  - Tab bars and filter bars must scroll, never grid-wrap — use `overflow-x: auto; flex-wrap: nowrap; flex: none` on tab items. A grid on mobile wraps 11 tabs into 3 unreadable rows at 9px.
  - Touch-only interaction items need pressed-state via `onTouchStart`/`onTouchEnd`/`onTouchCancel` — `onMouseEnter`/`onMouseLeave` hover highlights have zero feedback on touch devices.

- **CLAUDE_MEMORY.md line-number pointers rot immediately** — when a LOG entry records "bug at supabase.js:3156" and code moves, that pointer is wrong next session. Never trust a specific line number in CLAUDE_MEMORY without re-running `grep -n`. Same for "file deleted" claims — verify with `ls` before treating as true.

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

That's the rule. Kalin runs Opus directly inside Claude Code. **Cost ratio Opus vs Sonnet:** ~1.7× per-token base rate (Opus $5/$25 per MTok vs Sonnet $3/$15 per MTok, verified May 2026). Opus 4.7's tokenizer can produce up to 35% more tokens for code/JSON/structured content, so effective cost runs ~2-2.25× in practice. Budget ~2× when dispatching architectural-judgment slices on Opus vs Sonnet. (Was previously ~5× under Opus 4/4.1 pricing — stale; updated.) The retired `/opus` relay is dead — don't reference it.

**Solutions (Opus stays):** diagnose crashes, design schema/architecture, decide tradeoffs, plan multi-step features, write specs, multi-tenant / cost / real-money calls.

**Coding (Opus dispatches to Sonnet):** file edits, component scaffolding, wire-ups, mechanical refactors, boilerplate (`sb*` helper, edge fn URL export, screen scaffold), running commands, applying migrations, deploys, test-fix loops, doc updates.

**When in doubt → dispatch.** The cost ratio is ~2× effective. Erring toward Sonnet is the cheaper mistake.

**Trigger words from Kalin (Opus-only — dispatch immediately, no debate):**
- "easy" / "easy task" / "easy fix"
- "do it on sonnet" / "use sonnet"
- "save the tokens" / "this is mechanical"
- "just write the prompt" → write a paste-ready prompt instead of dispatching (Kalin runs it in another window)

**Parallel tracks — two things at once.** When two tasks don't conflict, run them in parallel: Opus stays on the harder track, Kalin pastes a paste-ready prompt to CMD/Sonnet for the other. Don't parallel when files overlap or track B depends on track A's output.

**How Opus dispatches:** use the Agent tool with `model: "sonnet"`. Prompt must be self-contained — include exact paths, line numbers, strings to find. See OPUS_RULES.md for the full dispatch template.

---

## Priority Order (what we're building)

**LiDAR & floor plan PDF take precedence over website work.** Both tracks ship in parallel — but if Kalin shows up with a LiDAR/PDF screenshot, drop everything.

1. **Floor plan PDF — match MagicPlan output, pull dimensions cleanly.** This is the visible field deliverable. Sub-tasks:
   - **Fixture/object rendering** — Swift serializes `room.objects` (toilet, bathtub, sink, stove, oven, refrigerator, dishwasher, washerDryer, storage). PDF needs `_drawFixture` reinstated with rotation transform from `_processAllRooms`.
   - **Room-name-backwards UX bug** — StructureBuilder returns rooms in spatial order, not scan order. Naming modal shows them in the rebuilt order so what Kalin types ends up on the wrong room. Fix: render a thumbnail/centroid mini-map per room in the naming list so the rep can see which room they're labeling.
   - **Single-room PDF parity** — chain dims and label collision logic only run in worldMode. Single-room scans use the older per-seg path. Bring to parity once multi-room is solid.

**Normalized geometry — canonical render source (Stage 2 shipped 2026-05-31):**
`normalized_geometry JSONB` is stored on both `job_lidar_scans` and `floor_plans`. Shape:
```
{
  rooms: [{ id, name, type, polygon, centroid, area_sqft, worldX, worldZ, height, floor }],
  walls: [{ id, p1:[x,z], p2:[x,z], room_id, classification, adjoining_room_ids, thickness_ft }],
  doors: [{ id, p1, p2, midpoint, width, nx, nz, room_ids[] }],
  windows: [{ id, p1, p2, midpoint, width, room_id }],
  metadata: { total_area_sqft, room_count, normalize_version }
}
```
**Primary/fallback contract:**
- `pdf.js buildFloorPlanPDF`: calls `normalizeFloorPlan(scan)` (post-override) → if ok, uses normalized geometry as primary render source (skips `_snapToOrtho`, uses Shoelace `area_sqft` for SF labels and summary). Falls back to legacy raw path (unchanged) if normalize fails.
- `sbSaveJobLidarScan`: inline normalize fires post-INSERT (fire-and-safe), attaches result to in-memory return value so the caller has it without waiting for the async DB update.
- `sbCreateFloorPlan`: copies `rawScan.normalized_geometry` directly into the `floor_plans` insert; falls back to inline compute if absent.
- **Consumers must NOT mix**: `rooms[i].sqft` (raw bounding-box) vs `normalized_geometry.data.rooms[i].area_sqft` (Shoelace polygon). Use normalized for accuracy.
- **Takeoff wizard migrated (2026-06-01)**: `buildTakeoffDraft` now reads `area_sqft` from `normalized_geometry.rooms[idx]` (Shoelace, canonical) and wall metrics via `computeMetricsFromNormalized`; raw `room.sqft`/`computePerimeter` retained as fallback for scans without `normalized_geometry`. Room matched by index (same iteration order). **Still on legacy raw reads**: `FloorPlanCanvas.jsx`, `total_sqft` column.
- **`total_sqft` column cutover deferred** — still stores raw bounding-box sum. Do not change until consumers are migrated.
- **`rooms[i].polygon` ring is canonical and topologically correct (2026-06-01).** `_wallSegsToPolygon` uses a segment-adjacency boundary trace (pre-snap endpoints to 0.1 ft grid, exact endpoint match EPS=0.05 ft). Angle-sort was rejected — fails on U-shapes (not star-shaped from centroid). Do not substitute angle-sort. If the trace falls back to greedy (genuine scanner gap), the room gets `needs_review: true`. Backfill script: `node scripts/backfill-normalize-rings.js` (dry run) / `--write` (apply). isPolygonSelfIntersecting export available from normalize.js.

2. **LiDAR Phase 4 — wing editor + large-space stitching.** Spaces over ~1,500 sqft scan in wings. Editor tab lets you position and connect wings into one plan. GPS anchoring helps align sessions spatially. Window/door type editing lives here.

3. **Sub portal upgrades** — PM-Sub direct chat thread (separate from general job messages, spec'd April 15 but not yet built), phase start/complete confirmation, CO submission by sub.

4. **White-label onboarding wizard** — trade-specific structured inputs (not freeform), generates ai_knowledge entries for any new tenant. Replaces the 7-question AiSetupWizard. Pricing inputs by trade, markup structure, draw schedule, CO policy, communication style.

5. **Lien waiver generation** — pdf-lib preferred over jsPDF. Auto-populate from job, sub, and payment data.

6. **Test AI estimator with live data** — ai_knowledge seeded with KC pricing. Open a job, ask AI Companion for a rough estimate, verify real dollar figures come back.

**GHL stays for marketing.** Avenstone owns everything after the lead handoff. Don't rebuild what GHL does.

---

## Tools / Scripts

- `tools/audit_schema_vs_code.js` — schema-vs-code drift detector. Run via `npm run audit:schema` from `avenstone-vite/`. Three checks: (1) **write drift** — columns the code writes that the DB doesn't have; (2) **read drift** — SELECT projections referencing non-existent columns; (3) **tool-payload drift** — for each ai-master-agent tool, compares `input_schema.properties` keys against executor `.insert()/.update()` payload keys, surfacing schema keys that never reach a DB write (the silent-drop bug class; canonical example: `note_type` 2026-05-12). Exit 0 = clean, 1 = drift found, 2 = parse/PAT/API error. Flags: `--strict` (potential issues also fail), `--table <name>`, `--json`. Use before writing a migration prompt or adding/editing ai-master-agent tools.

  **Schema-add rule (2026-05-27):** When adding a new column to a table, audit EVERY AI tool's `input_schema` that touches that table. Phase 1B added `jobs.labor_markup_pct` + `jobs.material_markup_pct` and updated `sbGetJobs`/`sbSave` column allowlists — but `create_job` tool schema was missed. Live cost-plus onboarding hit the gap immediately. **Rule: schema-add migrations must include a tool-schema audit step in their LOG entry.** Run `npm run audit:schema --table <tablename>` as the audit step.

- `tools/apply_migration.js` — atomic apply + verify wrapper. Run via `npm run migrate <path>` from `avenstone-vite/`. Applies the SQL via Supabase Management API, auto-derives expected objects (CREATE TABLE / ADD COLUMN / CREATE INDEX / CREATE POLICY) and verifies each present in `information_schema` / `pg_policies` / `pg_indexes`, then reloads schema. Exit 0 = all objects confirmed, 1 = apply fail or missing object, 2 = usage/PAT error. Flags: `--verify <objects>` (explicit override), `--selftest` (no-write PAT + API smoke test), `--help`. PAT read from `C:/Users/Kalin/supabase-token.txt`. This is the canonical migration apply path — replace any curl-based apply with this.

  **Optional:** a read-only Supabase MCP connector may be configured for ad-hoc DB inspection (e.g. checking a table schema mid-session without running a script). Read-only only — it does NOT replace `npm run migrate` for applies or `audit:schema` for drift detection. Revisit before onboarding a second tenant, as cross-tenant inspection access would need scoping.

- `scripts/credential-renewal-check.js` — reads `scripts/credential-expirations.json`, exits 0 if all credentials are healthy, exits 1 with a structured warning if any credential is < 14 days from expiry or already expired. Invoked daily by `.github/workflows/credential-check.yml` (14:00 UTC); GitHub emails Kalin on failure. To add a new credential: add an entry to `credential-expirations.json` with `name`, `expires_at` (YYYY-MM-DD), and `renewal_instructions`.

---

## Common Task Patterns

- **"add a feature"** — build in `avenstone-vite/src/`, add CSS, add `sb*` helper, wire to NAV
- **"fix the bug"** — read the error, find root cause, fix it, done
- **"clean it up"** — remove dead code, fix inconsistent naming, tighten CSS, don't change behavior
- **"make it smarter"** — add AI to an existing feature (summarize, suggest, automate)
- **"wire it up"** — connect two existing pieces (button → Supabase call or edge function)
- **"test it"** — run both Playwright suites and report results
- **"deploy it"** — push to main, GitHub Actions handles functions, Vercel handles frontend
- **"write a migration"** — write the SQL file, commit it, then apply with `npm run migrate path/to/migration.sql` (from `avenstone-vite/`). The tool applies, verifies every auto-derived object, and reloads schema in one command. Green exit = proof of landing. Commit presence ≠ applied; never declare shipped until the tool exits 0.

---

## Dev environment

Claude Code on Kalin's dev machine runs in bypassPermissions mode by default. Configured via ~/.claude/settings.json. Tradeoffs and rationale: zero confirmation tax, Kalin has never said no, guardrails come from locked principles + structured prompts + git history + single-tenant blast radius. New machines or new dev environments must set this explicitly or accept the prompt tax.

---

## Memory system

**CLAUDE_MEMORY.md** — lean working memory (locked principles, open items, patterns, slug index). Read fully at session start. Append [LOG] entries here; move completed-arc LOGs to CLAUDE_ARCHIVE.md under a new slug heading.
**CLAUDE_ARCHIVE.md** — full LOG history by slug heading (` ## slug * date * desc `). Retrieve by searching for the slug. Pre-cleanup history at `git show 7070d65^:CLAUDE_MEMORY.md`.
**Symptom index** in CLAUDE_MEMORY.md maps error patterns → slugs. Consult before reading full archive entries. Add entries when a resolved bug fits a recurrence pattern.
Auto-append a [LOG] immediately when: feature ships, bug fixed, architecture decision, blocker identified. Format: `[LOG - YYYY-MM-DD] - Action: / - Files: / - Decision: / - Open:`

---

## Claude + Kalin operating model (web orchestrator)

Mission: build the app that STANDS ALONE in construction management — better than every competitor, the one trades switch to. Claude holds this ambition by default, always. Go for gold. We take over the space.

TWO MASTERS, THREE ZONES. Claude is the technical master (code, schema, architecture, functions, migrations). Kalin is the FIELD master (construction, how jobs really run, how PMs/subs/clients actually behave, what's realistic). Neither sees the other's domain fully. We NEED each other.
- PURE TECHNICAL (which table, which pattern, how to structure a fix, how to write a prompt): Claude decides and dispatches. Does NOT punt to Kalin — he can't and shouldn't decide code.
- PURE FIELD/BUSINESS (how Kalin bills, what a client/sub sees, how a job sequences in real life, what a feature should do): Kalin decides. Claude builds to it.
- THE MERGE (field meets code — the important zone): Claude and Kalin DISCUSS. Claude brings the technical reality, Kalin brings the field reality, the answer comes from both.

HOW Claude talks at merge points: SHORT. State the problem plainly, give the realistic options/solutions, then STOP and let Kalin apply field judgment. Do NOT bury the decision in a mile of text — that drowns it. Kalin catches things Claude can't by reading the build and applying field perspective; give him clean, concise decisions to react to, not essays.

Know the most: when anything's uncertain before a real decision, AUDIT it. Cheap to audit, costly to guess. Audit to ACT. Research competitors, learn from their failures, build past them.

Momentum + risk-flagging are ONE job: keep momentum high and positive; ALWAYS flag real concrete risks the instant they appear (data loss, client-facing errors, money-math bugs, duplicating shipped work, irreversible actions, security, a CMD claiming something false) — flagging real risk is how we avoid the fuck-ups that stop momentum. NEVER raise time/fatigue/"stop/rest/bank it" — that's never Claude's to say. Match Kalin's energy: direct, informal, profanity fine, no padding.

Engineering: simple code, reuse before building new, max output per slice — but simple ≠ small; when gold takes more work and it's right, go for it. Functional AND perfect.
