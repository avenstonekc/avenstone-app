# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Memory

Persistent memory for this project lives at:
`C:\Users\Kalin\.claude\projects\C--WINDOWS-system32\memory\`

**Always read `MEMORY.md` in that folder first.** It indexes all memory files including:
- Active to-do list, bugs, and feature queue (`project_todo.md`)
- Team members, emails, auth IDs, roles (`user_team.md`)
- Testing and workflow preferences (`feedback_test_before_next.md`)

## What this app is

Avenstone — a construction job management platform for Avenstone Contracting (Kansas City, MO). Manages leads, proposals, contracts, client signing, documents, photos, subs, scheduling, change orders, payments, and AI estimating.

Deployed at: `https://avenstone-app.vercel.app`  
GitHub: `avenstonekc/avenstone-app`

## Architecture

Single HTML file (`index.html`) — no build step, no bundler, no npm for the app itself.
- React 18.2 + Babel Standalone (JSX transpiled at runtime)
- Supabase JS v2 via CDN — initialized as `window.SB`
- jsPDF via CDN for PDF generation
- All code lives inside `<script type="text/babel">` starting around line 178

**Do NOT refactor to Vite/components until the app is fully bug-free.** That's a planned future step.

## Supabase

- Project ref: `cbfftukmhqvvjlrlnltk`
- URL: `https://cbfftukmhqvvjlrlnltk.supabase.co`
- Avenstone tenant ID: `00000000-0000-0000-0000-000000000001`
- Kalin's auth ID: `8171742a-b586-4f13-be61-744e191a1896`
- **Never send contracts or test emails to `kalin@avenstonekc.com`** — it will set his role to `client`

**Tables:** `jobs`, `profiles`, `photos`, `job_notes`, `job_documents`, `change_orders`, `contract_signatures`, `job_messages`, `job_subs`, `invitations_to_bid`, `bid_responses`, `payments`, `notifications`, `schedule_phases`, `daily_logs`

**Storage buckets:** `job-photos` (public), `job-documents` (private), `bid-quotes` (private)

**Edge Functions:** `send-contract-email`, `invite-user`, `send-bid-invite`, `notify-realtor`, `send-estimate-email`, `create-payment-link`

**RLS helpers:** `get_my_role()`, `get_my_tenant_id()`, `can_access_job(job_id)`

## Global state / key globals

- `window.SB` — Supabase client
- `window.AV_TENANT` — current user's tenant_id (set on login via `loadProfile`)
- `window.AV_USER_ID` — current user's auth UID
- `window.AV_JOBS` — jobs array kept in sync for cross-component access

## DB helper naming

All Supabase helpers are top-level functions prefixed `sb*`:
`sbLoad`, `sbSave`, `sbUpd`, `sbNote`, `sbPhoto`, `sbCO`, `sbUploadDoc`, `sbLoadDocs`, `sbDelDoc`, `sbToggleDocVisible`, `sbSaveSignature`, `sbSendContractEmail`, `sbNotify`, `sbPostMessage`, `sbCreateITB`, `sbSubmitBid`, `sbCreatePaymentLink`

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

## Auth / roles

Roles: `owner`, `project_manager`, `sales_rep`, `sub`, `client`  
Login: email+password (`signInWithPassword`) or magic link (`signInWithOtp`)  
Clients get magic links from `send-contract-email` edge function; also support password login.

## Job statuses

`lead → bid_sent → active → demo → framing → rough_mep → drywall → finish → punch → complete`  
Also: `on_hold`

## Design tokens

- Navy: `#0A1F44`, Gold: `#C9A84C`, Cream bg: `#F7F5F0`, Border: `#E8E4DC`
- Fonts: `DM Serif Display` (headings), `DM Sans` (body)
- CSS utility classes: `.btn`, `.btn-navy`, `.btn-gold`, `.btn-ghost`, `.finp`, `.fg`, `.flbl`, `.modal`, `.overlay`, `.badge`, `.card`, `.sb-item`

## Testing

Playwright test suite: `tests/avenstone.spec.js` — 15 tests, all passing.

```bash
npx playwright test        # run all tests (~1.5 min)
npx playwright test --grep "Contract Signing"   # run one suite
```

Tests spin up a local server on port 3737 automatically. Tests use:
- `test-rep@avenstonekc.com` / `TestRep2026!` — owner-role test account
- `kalinspratling@gmail.com` / `TestClient2026!` — test client account

**Always run tests before pushing a new feature or after fixing a bug.**

## Migrations

SQL migrations live in `supabase/migrations/` — gitignored but tracked locally.  
Apply via Supabase Management API:
```bash
curl -X POST "https://api.supabase.com/v1/projects/cbfftukmhqvvjlrlnltk/database/query" \
  -H "Authorization: Bearer sbp_24e47bbb7d72a5384a74f288a1355301c8492967" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"<sql>\"}"
```

## Adding new code

- New React components: inside `<script type="text/babel">`, before `ReactDOM.createRoot()`
- New `sb*` helpers: near the other helpers (~lines 193–420)
- New CSS: in the `<style>` block (~lines 27–176)
- New Edge Functions: `supabase/functions/<name>/index.ts` — deploy via Supabase dashboard
