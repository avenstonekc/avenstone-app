---
# Avenstone App — Working Memory
_Two-file split established 2026-05-03. This file = lean working memory. Full LOG history → CLAUDE_ARCHIVE.md (retrieve by slug `##` heading)._

On session start: read this file top-to-bottom. Append a [LOG] at the end when a feature ships, a bug is fixed, or an architecture decision is made. When a LOG is no longer actively relevant, move content to CLAUDE_ARCHIVE.md under a new slug and add pointer to the index below.

---

## Current state (2026-05-09)

- **Repo:** github.com/avenstonekc/avenstone-app
- **Web:** Vercel auto-deploy on push to main
- **iOS:** Codemagic → TestFlight auto-deploy on push to main
- **Stack:** Vite + React 18, Supabase JS v2, Capacitor 8 (iOS)
- **Supabase URL:** https://cbfftukmhqvvjlrlnltk.supabase.co
- **Avenstone tenant ID:** 00000000-0000-0000-0000-000000000001
- **Kalin auth ID:** 8171742a-b586-4f13-be61-744e191a1896
- **Blake auth ID:** 066c8241-accb-490b-9f98-b8b7cb24c33b

**Migration apply method:** `npm run migrate <path.sql>` from `avenstone-vite/` (tools/apply_migration.js — apply + auto-verify + schema reload in one command). PAT stored at `C:/Users/Kalin/supabase-token.txt`. Not curl. Not `process.env`. Not inline node https.

---

## Locked principles

1. **Multi-tenant from day one.** Every table: `tenant_id` + RLS. Trade-specific data: also a `trade` column. Phase definitions + module visibility = per-tenant config, not hardcoded. White-label expansion (v4+) is config + sales work, not engineering — only if v1–v3 hold this line.

2. **StructureBuilder is load-bearing for wall merging. Never skip it.** (2026-04-26) Without it: unmerged parallel walls, hallway geometry extends into empty space, door swings float, chain dim Z-line math fails. Any fix that bypasses StructureBuilder trades floor plan accuracy for scan reliability — stop and discuss first.

3. **AI never invents rates without citation.** `NULL base_rate` on `takeoff_unit_costs` is intentional — wizard shows "REP MUST ENTER." Never backfill with derived or estimated values.

4. **Schema verification required. Commit ≠ applied.** Every migration: `information_schema.columns` check + `NOTIFY pgrst, 'reload schema'` + `pg_policies` check. Three incidents on 2026-05-02. Do not declare shipped until rows confirm. **When DROPping a table, also audit `pg_policies` for any policy referencing it — RLS policy deps are invisible to the FK query but will block the DROP.** (2026-05-06)

5. **Tenant override precedence.** Platform defaults: `tenant_id IS NULL`. Tenant rows override via `DISTINCT ON` + `ORDER BY tenant_id NULLS LAST`. Never rely on app-side fallback when the DB query can enforce it.

6. **`.insert()` vs `.upsert()`.** New-rows-only helpers use `.insert()`. `.upsert()` on insert-only paths silently triggers UPDATE RLS evaluation and fails. (2026-05-01, jobs INSERT RLS fix.)

7. **Built-but-not-wired components exist. Do not treat as dead code.** Current list: `MaterialSelectionScr.jsx`, `FloorPlanEditor.jsx`. Both have outstanding design decisions before rewiring.

8. **Two-file memory split.** CLAUDE_MEMORY.md = lean working memory. CLAUDE_ARCHIVE.md = full LOG history by slug. Established 2026-05-03 after memory bloat caused three schema claim failures.

9. **ai_error_logs ranking discipline.** When triaging ai_error_logs by volume, filter `last_seen >= NOW() - INTERVAL '30 days'`. The April 14–26 ai-home-companion billing outage left 499 stale rows that otherwise dominate every ranking. (2026-05-12)

10. **Silent-failure ranking discipline.** Diagnostics rank symptoms, not bugs. Before queueing a fix slice from an ai_error_logs / failed_intents diagnostic, spend 5 minutes auditing the actual code path. The 2026-05-12 master-agent bundle dispatched a Sonnet slice that found existing guards already in place. (2026-05-12)

---

## Schema reality (verified 2026-05-05)

*Authoritative DB facts — verified against `information_schema`. Do not contradict without re-verifying.*

- **Phase 3 DROPs (2026-05-06):** `invitations_to_bid` view, `itb_invitees`, `quote_requests`, `bid_responses` (legacy), `bids`, `sub_pricing_changes`, `job_subs` — all dropped. `engagement_bids` and `job_sub_engagements` are the canonical engagement schema. RLS policies on `job_messages` and `schedule_items` updated to reference `job_sub_engagements` in the same migration.
- **`jobs.client_user_id` (uuid) EXISTS and is actively used** — `supabase.js` (job load + `sbNotifyUser`), `ClientPortal.jsx` (job query + Realtime subscription filter), `MessagesTab.jsx` (email-on-new-message). Do not NULL it carelessly.
- **`profiles.onboarding_completed` (boolean) EXISTS.** 2026-04-29 migration did ship for this column.
- **`sub_pricing` reschema confirmed live.** Columns: `id`, `sub_id`, `tenant_id`, `trade`, `pricing_mode`, `unit`, `rate`, `notes`, `created_at`, `updated_at`. Single row per (sub, trade) with `pricing_mode` enum — no materials/labor split.
- **No `sub_invitations` table exists or ever did.** `send-invite` calls `inviteUserByEmail()` directly; the invite IS the auth.users creation.
- **`job_sub_engagements` table EXISTS** (Phase 1a, 2026-05-05). Canonical sub-to-job engagement record. Replaces scattered quote_requests / itb_invitees / Assign-to-Project paths going forward. State machine: `invited` → `bid_submitted` → `active` → `completed` plus terminal off-ramps `declined`, `withdrawn`, `removed`. Partial unique index `idx_one_live_engagement` enforces one live engagement per (job_id, sub_id, trade).
- **`engagement_bids` table EXISTS** (Phase 1a, 2026-05-05). Bids attached to engagements. Named `engagement_bids` (not `bid_responses`) to avoid collision with the existing ITB/quote `bid_responses` table. `idx_engbid_one_current` partial unique index keeps one current bid per engagement; revisions stack as historical rows.
- **`schedule_items.engagement_id` column EXISTS** (Phase 1a, 2026-05-05). Nullable audit FK to `job_sub_engagements`. Stamped on schedule items created from accepted bids; old items remain null.
- **`draw_schedules` table EXISTS** (Invoicing Phase 1, 2026-05-06). Planned billing schedule per job. Lifecycle: planned → in_progress → paid (or cancelled terminal off-ramp). Unique on (job_id, draw_number).
- **`invoices` table EXISTS** (Invoicing Phase 1, 2026-05-06). Billing documents. Per-tenant unique invoice_number (format INV-YYYY-NNNN, generated by next_invoice_number function). Status lifecycle: draft → sent → viewed → paid (with partially_paid intermediate, void terminal off-ramp, overdue auto-derived).
- **`invoice_line_items` table EXISTS** (Invoicing Phase 1, 2026-05-06). Composable invoice details. source_type tracks origin (estimate_line_item / change_order / manual). phase carried for budget actuals match.
- **`job_transactions.invoice_id` column EXISTS** (Invoicing Phase 1, 2026-05-06). Nullable audit FK. Stamped on Stripe webhook reconciliation when an invoice is paid.
- **`ai_knowledge.created_by` column EXISTS** (added 2026-05-09 via migration `20260509120000_ai_knowledge_created_by.sql`). UUID FK → profiles(id) ON DELETE SET NULL, nullable. Live columns: `id, tenant_id, category, content, active, created_at, created_by`. RLS shipped 2026-05-17 via `20260517120000_ai_knowledge_rls.sql`. 4 policies: select (tenant_id), insert/update/delete (tenant_id + owner role). Direct-client access now tenant-isolated. Service-role usage in edge fns unaffected.
- **`pending_tasks` table DROPPED** (2026-05-09 via migration `20260509180000_drop_pending_tasks.sql`). Master Agent v2 retired the queue layer in favor of a persistent chat panel. 8 rows existed at drop time, all smoke-test artifacts. Resulting entities (job_transactions, change_orders, jobs, todos) live in their own tables and were unaffected — only audit metadata was intentionally lost. CASCADE removed any FK dependents. Do not recreate without explicit approval.
- **ai-master-agent has 16 tools** (2 stale read tools removed 2026-05-19 — see read-tool cleanup LOG below): get_jobs, get_team, create_job, update_job, add_contact, send_client_portal, invite_person, add_note, advance_phase, update_phase, submit_change_order, log_payment, log_receipt, notify_team, add_todo, add_knowledge.
- **`CONFIRM_TOOLS` is a 5-verb whitelist** (extended 2026-05-09 from 3 to 5): log_payment, log_receipt, submit_change_order, add_todo, create_job. Every member returns `pending_action` and surfaces a Confirm card before the row is written.
- **`job_estimates` consultation columns EXIST** (2026-05-12 via Shape C migration). New columns: `session_id UUID → consultation_sessions(id)`, `created_by UUID → profiles(id)`, `estimate_data JSONB` (structured AI estimate output from Consultation flow, distinct from `messages` which holds Estimator chat transcript), `total NUMERIC`, `source TEXT` (currently 'ai_consultation'). UNIQUE on `job_id` retained — Estimator and Consultation upsert onto the same row, non-overlapping field sets. Multi-source split deferred.

---

## Financial locked decisions

- `job_transactions` is single source of truth for all money movement.
- `cost_plus` is visibility-only — no pricing logic changes.
- Lien waivers are warnings, not hard blocks.
- Commissions are transactions (`type='commission'`, `direction='out'`).

---

## Active open items

*Outstanding decisions or deferred work — do not assume resolved.*

**Future arcs (named, sequenced — each needs a blueprint MD before building):**
- `SUB_WORKFLOW_ARC.md` — daily logs, progress photos tied to phases, in-app payment requests + lien waivers, schedule conflict surfacing, sub availability calendar, multi-job dashboard. Sub portal is half-blind to field reality without subs engaged daily.
- `ANALYTICS_ARC.md` — gross margin by trade across jobs, avg days per phase, sub reliability scoring, supplier delivery performance, CO frequency, profit/loss reports. Data already in DB, just needs query layer + dashboards. Also home for EXECUTION_ARC Phase 9 (learning loop rate overrides).
- `DOCUMENT_MANAGEMENT_ARC.md` — unified documents surface: lien waivers, signed proposals, contracts, COIs, permits, inspection reports all in one place.
- `MOBILE_AUDIT_ARC.md` — phone-first UX pass on every existing screen. Walkthrough mode is mobile-first; rest of app is desktop-first and needs a pass.
- `VOICE_AGENT_ARC.md` — voice as first-class interface for in-field PM workflows. Reads EXECUTION_ARC data (checklists, todos, schedule items, phase context). See existing VOICE_AGENT.md.
- `SALES_PIPELINE_ARC.md` — leads → qualified → consultations scheduled → proposals → contracts. Currently jobs start at `lead` phase; lead-handling is outside the platform. Open question whether platform should own this.
- `CODE_JURISDICTION_ARC.md` — jurisdiction-aware inspection checklists (KC vs Overland Park, 2018 vs 2021 IRC). Hardcoded starter set is v1; AI-seeded jurisdiction-aware templates are the real moat play.

**Sub portal & financial:**
- ConsultationTab tab retirement
- Auto-bid generation (sub_pricing × takeoff quantity, AI sanity pass)
- Sub password retrofit for existing magic-link-only subs
- Client notification silence at financial events — identified, not fixed
- Sub management consolidation design pass — design doc only, no code. Unifies "Invite sub to bid on job" across Subs Directory invite, Assign-to-Project, and Quote Request → Send Invite flows. Promoted from Future architecture 2026-05-05 after triple-UI pain proved it's not deferable.
- Picker enrichment in unified modal (Phase 2): show per-sub schedule load badge ("2 active jobs · 3 items next 14d"), trade-match indicator, last-engagement-age. Optional Haiku-cheap AI summary on hover. Anti-Surprise alignment — flag overcommitted subs before invite, not after. Captured 2026-05-05.

**Takeoff wizard:**
- Step 5 kitchen scope subsets + detail forms
- Step 8 procurement view from `estimate_line_items`

**App infra:**
- URL-based routing (`selJ` is React state — no deep-link, refresh loses position)
- Todo push notification wiring deferred (`send-push` edge fn exists, no callers)
- Dev auto-login removal before external testers
- Drift detector (2026-05-10 first run; all 15 findings now cleared as of 2026-05-12). Final fix arc: contacts 3 cleared 2026-05-13 (full_name→name rename, drop project_type/description); job_notes 2 cleared (drop note_type, rename created_by→author); todos drift closed 2026-05-13 (see LOG below); job_estimates 6 cleared via Shape C migration + ConsultationTab upsert fix. **Drift count: 0 (audit:schema scans JS/TS src only — ai-pm-nightly TS edge fn drift was not scanner-visible; closed manually).** Re-run `npm run audit:schema` from `avenstone-vite/` after any new table or column work. Note: ai-pm-nightly todos insert was never writing rows because function is DISABLED — but the stale payload would have silently dropped rows on any re-enable. Detector Phase 2 shipped 2026-05-13 — skipped now 9 (was 34 at Phase 1 baseline, 15 after Phase 1). Remaining 8 skipped are function parameters (no call-site analysis), 1 is dynamic .from() (opaque). No new drift surfaced by Phase 2 extension. Missing-tables arc 2026-05-19: 4 findings → 1 STOP (see LOG). Scanner missing-tables now: 1 (quote_requests in ai-pm-nightly — DISABLED, deferred until re-enable). Write/read drift 0, write skipped 0.

**Components:**
- `FloorPlanEditor.jsx` — built, UX decision outstanding before rewiring
- `MaterialSelectionScr.jsx` — built, landing surface decision outstanding

---

## Backlog

*Deferred work to ship eventually — not a frozen list, add/remove as arcs land. Lives here so it survives conversation resets.*

- VOICE_AGENT v1.5: verb 5b (`complete_schedule_item` with photo gate) — gates AGENT_CARDS_ARC Phase 5
- AGENT_CARDS_ARC build (planning doc shipped 2026-05-08; build deferred)
- Helper-shape sweep beyond v1 (`sbUpdateTransaction`, etc.)
- Trade-neutral system prompts (Field still mentions "residential construction")
- CO surface in client portal (no CO tab today)
- Tenant-configurable vendor → type mapping for receipt extraction (Avenstone-only v1)
- Tool description tightening from 2026-05-09 receipt-fix LOG
- Auto-escalation on overdue draws (#7 from Master diagnostic)
- `phase_pct_complete` rollup audit (#8 from Master diagnostic)
- Duplicate person detection on invite (#4 from Master diagnostic)
- VOICE_AGENT Phase 3+ (native iOS STT/TTS/hands-free)
- Generalize the receipt-photo server-side stash (2026-05-09) if a second confirm verb needs to bind a user-uploaded artifact. Vision content blocks reach the model for reasoning but aren't accessible as text the model can quote into tool_use input — hence the `extractLatestUserImage` injection in `ai-master-agent`. If a second verb (e.g. attach signed contract image to log_payment) hits the same wall, refactor into a generic `attachUserBinaryToConfirmInput(blockType, paramKeys)` helper
- Tool-schema vs insert-payload mismatch detector — extend `tools/audit_schema_vs_code.js` to walk edge-fn `input_schema.properties` and cross-reference against the executor's actual `.insert()` payloads. Catches the silent-LLM-token-waste class surfaced by 2026-05-12 job_notes cleanup (note_type advertised in tool schema, dropped on insert).
- Drift detector enhancement — Phase 1 shipped 2026-05-12 (decodes `.map()`/`.flatMap()` callback payloads). Phase 2 shipped 2026-05-13 (decodes ObjectPattern-rest `const {..., ...patch} = x || {}` + ConditionalExpression branch union). Phase 3 shipped 2026-05-19 (binding.kind=param early return + sbUpdateScanOverrides static refactor). Skipped: 34 → 15 → 9 → 0. CLOSED.
- Capture-time incomplete-scan detection — RoomPlan is returning wall-segment rings with multi-foot gaps (missing wall captures). The 2026-05-17 stitcher fix makes rendering robust, but the rep should be warned at scan time when a room's segment ring has a gap > ~3 ft so they can rescan that wall. Anti-surprise alignment — catch the bad scan in the field, not in the office PDF.

---

### Future architecture (design-only, not building yet)

- **RAG-based archive retrieval** — Embed archive entries to Supabase pgvector, retrieve top 3-5 relevant on session start instead of static load. Per-session tokens drop from ~3K to ~500-2000. Trigger to build: archive >50K tokens, first non-Avenstone tenant, or first session where missing context bites. Estimated 2-3 days. Captured 2026-05-03 — review before building.

- **Sub management arc** — Multi-step sub system tightening. Step 1: filter schedule item modal sub dropdown by trade match (currently shows all assigned subs regardless of trade). Step 2: auto-populate when exactly one approved sub matches. Step 3: lock definition of "approved sub" (minimal / insurance-gated / relationship-gated). Step 4: tenant-level sub roster screen (separate from per-job SubsTab). Step 5: sub-side acknowledge button on schedule items + `sub_acknowledged_at` column. Steps 1-2 are 40 lines total. Steps 3-5 is a real arc. Captured 2026-05-03.

- **Speed/cost audit candidates** — (a) sequential sb*Load calls on tab mount could parallelize with Promise.all, (b) edge functions probably on Sonnet where Haiku would suffice, (c) `select('*')` sweep to targeted columns, (d) Vite code-splitting + lazy-loading LiDAR/PDF heavy modules, (e) LiDAR scan storage lifecycle (no cleanup today). None urgent. Captured 2026-05-03.

- **Failed-attempts log** — Today the archive captures successful ships only. Wrong hypotheses, dead-end audits, reverted experiments don't get slugs. Add discipline + format: every wrong hypothesis or reverted approach gets a slug suffixed `-failed`. First-class entries. Captured 2026-05-03.

- **CLAUDE_INDEX.md categorized lookup** — Build only if real friction justifies it after archive chunks 4-5 ship. Small file (~200 lines), three categories: function (app area), date (chronological), failure pattern. Each line: `YYYY-MM-DD · slug-name`. Slugs can appear in multiple categories. Future Claude reads index first, identifies relevant category, jumps to specific slugs in archive — saves 5-15K tokens per session needing historical context. Discipline enforced via OPUS_RULES rules added 2026-05-03. Live with slug pointer index for a week first; build INDEX only if friction is real. Captured 2026-05-03.

- **Sales approach MD (white-label positioning)** — Frame the platform as the operations equivalent of what the dot-com era did for reach: 100× cheaper and easier to manage a contracting business and limit mistakes. Anti-Surprise Engine as the core promise. White-label tenant pitch lives here. Trigger to write: when platform has shippable second-tenant capability AND Kalin has 2-3 hours fresh to draft with real customer voice. Captured 2026-05-03.

- **Blueprint-first workflow for new features** — When starting something new: discuss → produce a small per-feature blueprint file (not a whole-app design doc) → prompts get written off that blueprint with audits as needed. Goal: less memory drift, less "we lose hard work mid-session," more cross-session continuity through documented design intent. NOT a locked rule yet — brainstorm whether this should be the standard pattern or stay informal. Trigger to revisit: when starting the next feature arc fresh (invoicing, voice agent, etc.), test the pattern there and decide. Captured 2026-05-05.

---

## Working-mode patterns

- **Phase builds for large features.** Foundation (data model, enums, shared modules) → mode logic → UI. Each phase ships working code.
- **Private Supabase buckets.** `job-documents` is private. Never `getPublicUrl`. Always `createSignedUrl` via `sbUploadDoc`/`sbLoadDocs`.
- **Supabase helpers return `{ ok, error, data }`.** `captureFailedIntent` is fire-and-forget, never throws. `sbNotifyUser(userId, type, title, body, jobId)` for targeted single-user; `sbNotify` for broadcast.
- **SVG sizing footgun.** `Ic.*` icons have `viewBox` but no `width`/`height`. Without explicit dimensions default to 300×150px. Always wrap in a constrained container.
- **`flex` default is `align-items: stretch`.** Set `align-items: flex-start` when pills/cards should size to content, not the row height.
- **`todos` status field uses `'done'`, not `'completed'`.**
- **`jobs.id` is TEXT** — all FKs referencing jobs must use TEXT type.

---

## Symptom index (seed entries)

*Add an entry here whenever a debugging session resolves a symptom that's likely to repeat. Format: 'symptom phrase' → cause → archive slug. Triage tool, not exhaustive.*

- "could not find X column in schema cache" → migration committed but not applied. See `schema-claim-incidents · 2026-05-02`.
- "upsert silently fails on existing row, no error surfaced" → swallowed write error or wrong helper shape. See `rls-sweep-2026-05-02 · 2026-05-02`.
- "empty string sent to DATE column rejected silently" → uncoalesced date input. See `date-sweep-2 · 2026-05-02`.
- "icon renders huge or fills viewport" → unconstrained SVG, default 300×150. See `schedule-rebuild · 2026-05-02–03`.
- "phase status reverts after page reload despite UI confirming save" → write rejected, error swallowed by helper. See `rls-sweep-2026-05-02 · 2026-05-02`.
- "Silent error swallow on Supabase queries" → helper/handler returns empty array or null when row should exist; no error surfaced. Cause: helper destructures `{ data }` without checking `error`. Examples: `sbPhoto` storage upload succeeded but DB insert error swallowed (2026-05-08); `get_jobs` returned `[]` because `start_date` column was missing from schema (2026-05-09). Fix pattern: destructure `{ data, error }` and return structured `{ ok, error, data }` shape.
- "Migration drift — column in code, missing from live DB" → PostgREST error "Could not find the 'X' column of 'Y' in the schema cache." Cause: either migration file committed but never applied, OR code references a dropped/renamed column, OR the table was created out-of-band and no migration ever existed. Examples: `change_orders.submitted_by_id` (2026-05-08, redirected to canonical `submitted_by`), `jobs.start_date` (2026-05-09, dropped from query), `ai_knowledge.created_by` (2026-05-09, added via migration — table had no CREATE migration in repo, was created out-of-band). Three instances in 2 days. Fix pattern: query `information_schema` for actual columns; check repo for any CREATE/ALTER migration on that table; apply missing migration OR redirect code to the canonical column.
- "TEXT-id pollution on jobs / FK children" → legacy `jobs.id` rows like `1775938002546` (a `Date.now().toString()`) coexist with proper UUIDs. Cause: pre-UUID create path; `jobs.id` is TEXT type, so the column accepts both shapes. Examples: id `1775938002546` (created 2026-04-11) wiped 2026-05-09. Audit pattern: `SELECT id FROM jobs WHERE id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND id !~ '^test-';` Future schema audit candidate: enforce UUID at the app layer before flipping to a CHECK constraint.
- "agent says 'note added' on todo verb / row landed in job_notes not todos" → master agent missing an `add_todo` tool, so todo intents fell through to `add_note`. (Branch B-1, wrong-tool routing.) Fix: add `add_todo` tool to ai-master-agent mirroring `sbCreateUserTodo` (type=user_task, source=manual) plus system-prompt rule disambiguating todo (action item) from note (passive context). Audit pattern when adding a new verb to MasterAgent.jsx: confirm there's a 1:1 agent tool too — chip flow + agent free-text path are independent code paths and freeform users will hit the second one. See LOG 2026-05-09 below.
- "Resume from PendingTaskList re-shows quick-capture instead of chip flow + creates duplicate pending_task" → `onResume` set `verb` but not `flowActive=true`, so render fell through to QuickCapture. Continue Now then called `sbCreatePendingTask` again. Fix: set `flowActive=true` in onResume. See LOG 2026-05-09 below.
- "duplicate key value violates unique constraint jobs_po_number_tenant_unique on lead create" → DB trigger `set_job_po_number` auto-issued PO numbers for ALL inserts (including leads/proposals) using `COUNT(*) + 1`. After any delete the count goes backward and the next insert collides with an existing po_number. Fix: status-aware trigger (skip lead/proposal — return po_number=NULL), MAX-based numbering (`MAX(SUBSTRING(po_number FROM 4)::INT) + 1`), and partial unique index `WHERE po_number IS NOT NULL`. PO numbers belong to contracts and beyond — not leads or proposals. Migration: `20260509130000_po_number_lifecycle_aware.sql`. See LOG 2026-05-09 below.
- "Resume asks every chip question even when the quick label has the answers" → flow component received `initLabel` but never read it. Each Resume walked the full chip sequence, ignoring `pending_tasks.context.quick_label` content the user already typed at capture time. Fix: parser-on-mount `useEffect` that calls `parseReceiptLabel` / `parseTodoLabel` / `parseLeadLabel` / `parseCOLabel` (regex + keyword, no LLM), seeds per-field state, computes `step = editingField || firstNullField || 'confirm'`, and lands on a single Confirm card with per-field Edit. See LOG 2026-05-09 below + `lib/labelParser.js`. **Superseded 2026-05-09:** the smart-Resume contract and the entire labelParser.js / queue layer were retired in Master Agent v2. Verb inference is now the LLM's job — see `master-agent-v2 · 2026-05-09`.
- "Master Agent flow has too many UX states / Continue-now confusion / redundant chip questions / build-up of unfinished pending_tasks rows" → root cause was the queue-and-chip-flow architecture itself: 4 chip flow components × per-field chip steps × Continue-now/Save-for-later branching × Resume snooze counters × labelParser regex bank × queue table with discard reasons. Each piece fixed a real symptom but the aggregate was overbuilt for a single-tenant tool with one daily user. Fix: chat-first v2. Tiles set `TILE_PREFIXES` into the chat input, the agent (ai-master-agent) infers verb + fields from freeform text, the Confirm card (`pending_action`) is the only commit point. Persistent conversation lives in component state at App.jsx top level. See `master-agent-v2 · 2026-05-09`.

---

## Shipped & archived

*Slug pointers → CLAUDE_ARCHIVE.md. Search `## slug` to retrieve.*

*Archive complete — all chunks committed (1, 2, 3, 4a, 4b, 4c, 5a, 5b, plus helper-error-sweep extracted from current memory). All slug pointers below resolve to populated entries in CLAUDE_ARCHIVE.md. Search by slug heading. Fallback: `git show 7070d65^:CLAUDE_MEMORY.md` returns pre-cleanup file.*

**PDF / LiDAR**
- `lidar-phase1 · 2026-04-15` — Phase 1 confirmed on device; scan persistence to job/contact tables
- `capture-v2 · 2026-04-19` — GPS stamping, exterior AR (soft-ripped 2026-04-26), mandatory height, quality meter (removed 2026-04-26)
- `apr22-cleanup-pdf · 2026-04-22` — CLAUDE.md reconciliation; fixture/object Swift export + PDF render
- `apr23-pdf-naming · 2026-04-23` — Multi-room naming off-by-one fix; 5 PDF improvements
- `pdf-renderer-rewrite · 2026-04-24` — Full rewrite: poché walls, world-mode layout, chain dims, scale bar
- `lidar-multifloor · 2026-04-24` — Multi-floor scan flow: floor picker, floorIndex JS↔Swift, FLOOR_LABELS
- `pdf-13bug-sweep · 2026-04-24` — 13-bug sweep: chain dims, snap, label collision, garage door symbol, TOTAL row
- `pdf-dimboxes-crash · 2026-04-24/26` — Silent crash: `dimBoxes` scoped inside `if`, hoisted to outer `let`
- `pdf-lidar-naming · 2026-04-26` — StructureBuilder restored after skip-experiment broke geometry; area-signature name match
- `pdf-branding-polish · 2026-04-26` — Scan-order naming; logo image; chain edge math; label rotation; swing arc cap
- `apr26-misc-ships · 2026-04-26` — Wall squaring (10° tol), corner gaps fixed, label z-order, swing arc stroke

**Financial**
- `financial-rebuild · 2026-04-23` — Full rebuild Phases 1–6: unified ledger, FinancialsTab, QB CSV export
- `rls-sweep-2026-05-02 · 2026-05-02` — Deprecated table drop; upsert audit (all 7 genuine); bid_responses UPDATE RLS fix

**Sub portal & ops**
- `sub-portal-gap-analysis · 2026-04-15` — PM-Sub chat, phase confirmation, CO submission: spec'd not built
- `sub-portal-phase-audit · 2026-04-26` — CO submitter audit; phase audit columns; inline CO edit; sbNotifyUser
- `sub-onboarding-rebuild · 2026-04-29` — Structured form wizard; sub_pricing reschema; password step; schema-claim audit
- `subs-tab · 2026-04-29` — SubsTab; procurement rename (quote_requests); ITB removed from EstimateTab
- `sequences-sub-ops · 2026-04-26–28` — Manual enrollment + auto-triggers (bid_sent, sub_invited, payment_made, sub_inactive_60d)
- `bid-system-audit · 2026-04-28` — Lump-sum only; `bids` table ghost; no estimate line linkage; shared_doc_ids stub
- `consultation-estimate-restructure · 2026-04-28` — ConsultationTab atoms; EstimateTab 3-sub-tab restructure
- `apr29-cleanup · 2026-04-29` — 7 frontend deletions; 2 edge fn deletions; rate limit; LineItemModal taxonomy picker

**Takeoff wizard**
- `takeoff-scope-design-audits · 2026-04-24–25` — Audits: MaterialSelectionScr dead; ai_knowledge machine-parseable; estimate_line_items no allowance
- `takeoff-schema-foundation · 2026-04-28–29` — pricing_lookup; takeoff_templates (81→59 rows); takeoff_unit_costs; material formulas; bathroom seed
- `trade-taxonomy · 2026-04-29` — trade_taxonomy + tenant_trade_visibility; 43 canonical rows; DB-driven UI; backfill verified
- `takeoff-wizard-build · 2026-04-29–05-01` — Data layer → material lines → UI → Accept & Save → scope tags → detail forms → COMPUTE_FNS → custom lines
- `todo-system · 2026-04-28` — todos table; TodayScr; TodoCard; ai-pm-nightly first writer; Resume flow

**Schedule / 2026-05-02 work**
- `schema-claim-incidents · 2026-05-02` — Third schema-claim failure; job_phases audit columns applied live
- `failed-intent-retry · 2026-05-02` — captureFailedIntent; payload column; AiPmDashboard "Failed saves" tile; Resume flow wired
- `date-sweep-2 · 2026-05-02` — All user-editable date fields coalesced; 1 fix (date_incurred)
- `schedule-rebuild · 2026-05-02–03` — schedule_items + trade_phase_map; ScheduleTab rewrite; is_primary; subs no longer mark phases

**Other**
- `vision-doc-updates · 2026-04-25` — Multi-owner model; inspection checklists AI-seeded; moat section; white-label advantage
- `disclosed-unknowns-pdf · 2026-04-25` — Disclosed COs in client proposal PDF; oh_shit_moments toggle persistence fix
- `gap-analyzer · 2026-04-25` — ai-consultation-gap-analyzer; GapResolutionModal; oh_shit_moments integration; 3 bug fixes
- `dead-code-audit · 2026-04-26` — 4 dead surfaces; FloorPlanEditor intentionally hidden; MasterAgent confirmed wired
- `notification-audit · 2026-04-26` — Staff-complete; client-silent at financial events; follow-up prompt generated
- `aihome-cleanup · 2026-04-26` — "Brief me" auto-fire removed; SequencesScr wired owner-only
- `apr23-playwright-bugs · 2026-04-23` — reactFill(); ContractModal signed_url fix; codemagic submit_to_testflight:false
- `opus-self-assessment-2026-04-29 · 2026-04-29` — What went well/poorly; sycophancy pattern identified
- `doc-housekeeping · 2026-04-26` — CLAUDE.md trimmed 696→514 lines; Opus/Sonnet delegation model locked
- `consultation-bugs · 2026-04-25` — 3 bugs: measurements guard, jobs.scope field name, ambient flush before mode transition

**Sub engagement & ops**
- `sub-engagement-arc · 2026-05-05–06` — job_sub_engagements + engagement_bids: phases 1-3 + polish. DROPped 7 legacy tables. Role-guard fixes for send-invite + send-client-link.

**Execution arc**
- `execution-arc-2026-05 · 2026-05-06–07` — 14/15 phases: bid availability, material_orders + Materials tab, phase gates + override UI, todo engine, dual-trigger schedule auto-create, notify_sub, site visit checklists, photo gates, trade actuals. Phase 9 deferred to ANALYTICS_ARC.

**Master Agent (2026-05-08–09)**
- `voice-agent-audit-2026-05-08 · 2026-05-08` — Phase 1 prerequisite audit: 8 RED + 5 YELLOW gaps.
- `voice-agent-phase2-hardening · 2026-05-08` — Phase 2: tool layer normalized to {ok,error,data}, receipt-from-photo, smoke repairs, 2-decimal currency.
- `invoicing-arc-2026-05 · 2026-05-05–06` — draw_schedules + invoices schema, pdf-lib PDF, Stripe Checkout, client portal, resend, manual mark-paid, overdue derivation, void+reissue, white-label tenant branding.
- `master-agent-v1-and-v2 · 2026-05-09` — v1 (queue+chips+bug pipeline), v1.1 (smart parsing), v2 (chat-first, queue retired). po_number lifecycle fix. ai_knowledge.created_by migration.

**Drift cleanup**
- `drift-cleanup-arc · 2026-05-10–13` — audit_schema_vs_code.js built. All 15 drift findings closed (15→0). 3 missing tables cleared. submit-bid-response 500→409. Doc cleanup (5 MDs deleted, 2 archived, OPUS_RULES.md rename).

---


[LOG — 2026-05-17 — Floor plan stitcher: gap recovery in _segsToPolyPoints]
- Action: _segsToPolyPoints now bridges segment-ring gaps instead of returning degenerate partial polygons. Added bounding-box fallback when the stitched polygon is still degenerate (<4 verts or <50% of stored sqft). sqft label now derived from the drawn polygon.
- Root cause: greedy chain with a 2.0 ft break threshold stopped on incomplete scan rings (Garage 15.14 ft gap, Living Room 16.57 ft gap) and emitted 3-vertex triangles. Two-renderer hypothesis was refuted — single worldMode path; the legacy per-seg path is dead code for all production scans (worldX=0 always trips worldMode).
- Files: avenstone-vite/src/lib/pdf.js
- Verification: numeric re-stitch of scans 52b617b1 / b6050e54 / da8a4c93 — broken scans now produce closed sane polygons, Apr 27's clean 3-room scan unchanged. Visual PDF check pending Kalin.
- Open: root cause of incomplete scans is RoomPlan missing wall captures — render-side is now robust to it, but capture-time incomplete-ring detection (warn rep to rescan a wall) is the real fix. Separate slice — see backlog.

---

[LOG — 2026-05-17 — ai_knowledge RLS shipped]
- Action: Added 4 tenant-scoped RLS policies on ai_knowledge (select/insert/update/delete). Closes 0-policies cross-tenant leak surface noted 2026-05-09 backlog.
- Files: supabase/migrations/20260517120000_ai_knowledge_rls.sql
- Policies: select gated by tenant_id; write (insert/update/delete) gated by tenant_id + owner role.
- Verification: 4 policies confirmed in pg_policies + relrowsecurity=true + NOTIFY pgrst sent.
- Trade-aware: ai_knowledge is a platform table; policies use get_my_tenant_id() / get_my_role() helpers — no Avenstone-specific assumptions.
- Client callers: AiKnowledgeScr.jsx (CRUD) + AiSetupWizard.jsx (insert) — both are owner-only screens. No non-owner write callers found.
- Edge fn callers: ai-companion, ai-master-agent, ai-home-companion, ai-consultation-gap-analyzer, get-contractor-profile, process-transcript — all service-role, unaffected by RLS.
- Open: none related to ai_knowledge security.

[LOG — 2026-05-17 — Master-agent out-of-v1 tools cleanup]
- Action: Confirmed the cleanup already shipped — backlog was stale. No removals performed.
- Files: supabase/functions/ai-master-agent/index.ts (read-only audit), CLAUDE_MEMORY.md
- Audit: Phase 1 audit (voice-agent-audit-2026-05-08) did not enumerate 13 specific tool names — the count ("12-13 out-of-v1 tools") was a rough estimate from the Phase 2 LOG describing tools beyond the 5 v1 verbs. The one confirmed dead tool (assign_sub — wrote to dropped job_subs table) was already removed on 2026-05-11. Current roster: 18 tools (get_jobs, get_job_details, get_team, get_dashboard, create_job, update_job, add_contact, send_client_portal, invite_person, add_note, advance_phase, update_phase, submit_change_order, log_payment, log_receipt, notify_team, add_todo, add_knowledge). All 18 have matching TOOLS array definitions and executor switch cases — no orphan defs or orphan cases. Tool count: was 19 → 18 (assign_sub already removed 2026-05-11). Today: 18 → 18.
- Verification: grep for each tool name across index.ts confirms no dangling refs. One real bug found in get_dashboard: queries `schedule_phases` table (line 398) which doesn't exist in any migration (schema has job_phases + schedule_items). Silently returns empty overdue_phases due to `|| []` fallback — not a tool removal candidate; it's a query fix. Captured to backlog as a distinct item.
- Trade-aware: master-agent is platform-shared; all 18 tools use tenant_id scoping. No Avenstone-specific tool was found.
- Open: get_dashboard overdue_phases query targets `schedule_phases` (phantom table) — should query `schedule_items` with `scheduled_end_date < today AND status != 'complete'`. Fix is a targeted query update, not a tool removal. Not done in this scope.

---

[LOG — 2026-05-17 — Read-side drift detection shipped]
- Action: Extended tools/audit_schema_vs_code.js with a read-side pass — flags .select() projections referencing non-existent columns. v1 scope: plain + aliased base-table columns; embeds/aggregates/variables/* skipped as opaque.
- Files: tools/audit_schema_vs_code.js
- Read-side findings (TRIAGE-ONLY this slice): change_orders.title (ai-home-companion:184, ai-master-agent:402), company_profiles.slug (get-contractor-profile:52), jobs.start_date (ai-home-companion:149).
- Write-side drift unchanged (0). Read-side opaque/skipped: 35 partial (229 .select() sites total, 0 fully opaque).
- Open: triage read-side findings in their own slices; embedded-resource (join) column checking deferred to a v2 read-side pass.

[LOG — 2026-05-17 — get_dashboard phantom-table fix]
- Action: get_dashboard overdue query repointed from schedule_phases (phantom table, never existed) to schedule_items. Overdue = scheduled_end_date < today AND status NOT IN (complete, cancelled).
- Field naming: kept overdue_phases — system prompt references "overdue phases" in the tool description but does not reference the response JSON key by name; the name is semantically accurate for schedule items too.
- Files: supabase/functions/ai-master-agent/index.ts
- Root cause: handler queried a non-existent table; the || [] fallback swallowed the 42P01 silently, so overdue work never surfaced on the dashboard. Caught by 2026-05-17 master-agent tools audit.
- Verification: test data has no overdue items (all existing schedule_items have status='scheduled' and no past scheduled_end_date). Query confirmed clean with no 42P01 — the phantom-table error was always silent; real query now runs against actual table.
- Trade-aware: master-agent is platform-shared; fix is tenant-agnostic, existing tenant/job scoping preserved (added .eq("tenant_id", tenantId) to overdue query — previously unscoped).
- Open: none.

---

[LOG — 2026-05-17 — read-side drift cleanup: 3 findings fixed]
- Action: change_orders.title → description in select + prompt string (ai-home-companion, ai-master-agent); jobs.start_date dropped from select (ai-home-companion, was selected but never used downstream); company_profiles.slug dropped from projection (get-contractor-profile — column never existed, projection fix clears detector but slug URL routing remains broken; migration needed, surfaced to backlog).
- Files: supabase/functions/ai-home-companion/index.ts, supabase/functions/ai-master-agent/index.ts, supabase/functions/get-contractor-profile/index.ts
- Verification: audit:schema read-side drift 0; write-side 0; parse errors 0.
- Open: none (slug routing removed rather than fixed — belongs to future homeowner-marketplace arc).

---

[LOG — 2026-05-17 — removed dead ?slug= path from get-contractor-profile]
- Action: Deleted the ?slug= routing branch — it filtered on company_profiles.slug, a column that never existed. Subs have no public profile; homeowner-facing marketplace not built. Function now resolves profiles by ID only (?tenant= param). Step comments renumbered 1–6.
- Files: supabase/functions/get-contractor-profile/index.ts
- Verification: audit:schema clean (write drift 0, read drift 0, parse errors 0); grep for "slug" in function returns zero hits.
- Decision: removed rather than added the column — slug routing belongs to the future homeowner-marketplace arc, scoped to the tenant/GC entity, not bolted onto sub profiles now.
- Open: none.

---

[LOG — 2026-05-17 — PDF summary table door double-count fixed]
- Action: The summary table was reading raw room.doorSegments.length per room; doors on shared walls appeared in both rooms and were counted twice in floor/grand totals. Fix: flat-map all rooms' doorSegments (with worldX/worldZ offset to world space), run identical isDupDoor dedup logic (0.5 ft midpoint, 10% width ratio, 0.9 normal dot — same thresholds as _dedupFeatures), derive per-room counts and fTotDoors from the deduped set.
- Files: avenstone-vite/src/lib/pdf.js
- Attribution decision: lower-index room keeps the shared door — matches _dedupFeatures sequential first-wins rule. Shared door shows in one row only; floor total = unique door count.
- Trade-aware: pure geometry, no trade or tenant assumptions introduced.
- Verification: build passes. Visual confirmation pending — Kalin needs to run a multi-room scan with at least one shared interior wall and check the summary door count matches the floor plan rendering.
- Open: same fix likely needed for windowSegments (same shared-wall double-count pattern), but out of scope this slice.

[LOG — 2026-05-17 — Voice Agent Phase 3: native iOS STT in MasterAgent (hold-to-talk mic button)]
- Action: Phase 3 shipped. Mic button added to MasterAgent chat input — hold-to-talk via @capgo/capacitor-speech-recognition@8.1.2. Transcript injected into setInput; user reviews and presses Send. No auto-send. No TTS.
- Files: avenstone-vite/package.json (+@capgo/capacitor-speech-recognition@8.1.2), avenstone-vite/ios/App/App/Info.plist (+NSSpeechRecognitionUsageDescription), avenstone-vite/ios/App/CapApp-SPM/Package.swift (updated by cap sync), avenstone-vite/src/components/shared/MasterAgent.jsx (+import, +5 state vars, +availability useEffect, +startMic/stopMic functions, +mic button JSX, +micError display), VOICE_AGENT.md (Phase 3 status updated), CLAUDE.md (iOS gotchas section).
- Commits: f045752 (chore(ios): plugin + plist + cap sync), 28bb0e4 (feat(master-agent): hold-to-talk mic button)
- Plugin decision: @capgo/capacitor-speech-recognition (NOT @capacitor-community/speech-recognition). Community plugin has no Cap-8 release; Capgo fork is the maintained Cap-8 successor with major version tracking Capacitor's. v8.1.2 is latest 8.x. SPM-only project — cap sync registered the plugin cleanly with no Podfile changes.
- Plugin API used (from installed TS defs): available() → hide button on web; checkPermissions()/requestPermissions() → speechRecognition PermissionState; start({ language:'en-US', partialResults:true }); stop(); addListener('partialResults', evt→evt.matches?.[0]); addListener('error', evt→micError); removeAllListeners().
- First-press behavior: if permission not yet granted, requestPermissions() fires (blocks on iOS native dialog). If denied, micError set inline. If newly granted, returns — user re-holds to record. Subsequent presses start immediately.
- Append-vs-set: micBaseTextRef saves pre-recording input text. Partial results set input to (base + ' ' + transcript) or transcript alone when empty.
- Listening indicator: red border + red mic icon while micListening=true. Normal state: gold border + mic outline.
- Button gating: {micAvailable && ...} — web users see no button. Loading-disabled while agent is processing.
- Platform-neutral: no trade/tenant assumptions. mic button is trade-agnostic text input — same as typing.
- Verification: npm run build passes. npx cap sync ios succeeded (SPM, 1 plugin registered). On-device STT test is Kalin's after Codemagic build hits TestFlight — flag for manual test.
- Open: on-device verification pending TestFlight build. Phase 4 shipped (see LOG below). windowSegments double-count (separate from this slice).

[LOG — 2026-05-17 — Voice Agent Phase 4: native iOS TTS — agent speaks replies]
- Action: Phase 4 shipped. Agent replies are now spoken aloud via @capacitor-community/text-to-speech@8.0.0. Speaks response text first (Flush), then confirmation card description immediately after (Add) — card description carries amountToWords money read-back. Speaker toggle button (on/off) persisted to localStorage. TTS interrupted on sendMessage and on startMic so STT and TTS never overlap.
- Files: avenstone-vite/package.json (+@capacitor-community/text-to-speech@8.0.0), avenstone-vite/ios/App/CapApp-SPM/Package.swift (cap sync, 2 plugins now registered), avenstone-vite/src/components/shared/MasterAgent.jsx (+import TextToSpeech+QueueStrategy, +normalizeTtsText helper, +ttsEnabled state+localStorage, +ttsSpeak/toggleTts functions, +TTS stop in sendMessage+startMic, +ttsSpeak call in callMaster, +speaker toggle button JSX), VOICE_AGENT.md (Phase 4 status updated), CLAUDE.md (iOS plugin gotcha + audio session note).
- Commits: 3b15050 (chore(ios): TTS plugin + cap sync), 2a93d2e (feat(master-agent): TTS integration)
- Plugin decision: @capacitor-community/text-to-speech@8.0.0 — only Cap-8 TTS release on npm (peerDependency: @capacitor/core>=8.0.0). No Capgo TTS fork exists.
- Plugin API used (from installed TS defs): speak({ text, lang:'en-US', rate:1.0, category:'playback', queueStrategy:Flush|Add }); stop().
- Audio session finding (from Swift source): AVSpeechSynthesizer.usesApplicationAudioSession = false — TTS uses its own isolated session, NOT the shared app session. The STT plugin's lingering .playAndRecord category does NOT affect TTS speech. The 'category' option in the JS API is accepted by the plugin but silently ignored in the iOS Swift implementation — session isolation is the actual mechanism. category:'playback' passed anyway per spec.
- System prompt markdown finding: No explicit **bold** / # headers / _italic_ instructions. Line 863 uses ✓ checkmarks and · middle dots in action reports. normalizeTtsText strips both (✓→removed, ·→comma). Also strips URLs (→'link'), ** __ backticks, leading # headers.
- Text normalization: applied to both response text and card description before speak(). Defensive even though system prompt discourages markdown (DIAGNOSTIC section line 905 says no formatting).
- Confirmation card: renders completely unchanged. TTS voices the card's description field — which is where amountToWords lives — for the money-safety read-back per VOICE_AGENT.md spec.
- Toggle: speaker button between mic and send buttons. Gold border when on, dim when off. localStorage key: av_tts_enabled. Default: on.
- Verification: npm run build passes (372 modules). npx cap sync ios succeeded (SPM, 2 plugins: TTS 8.0.0 + STT 8.1.2). On-device audio test is Kalin's after Codemagic build hits TestFlight.
- CRITICAL on-device check: verify agent voice is full-volume and clear — NOT quiet, ducked, or cut off. The audio session isolation via usesApplicationAudioSession=false should prevent ducking from the STT plugin's lingering .playAndRecord category, but this must be verified empirically on device.
- Open: on-device Phase 3 + Phase 4 verification pending TestFlight. Phase 5 (hands-free/continuous) not started. windowSegments double-count (separate).

[LOG — 2026-05-17 — Voice Agent Phase 3 fix: mic button non-functional on iOS (pointer events → touch events)]
- Action: Hold-to-talk mic button was completely non-functional on first TestFlight build. Root cause confirmed: iOS WKWebView emits pointercancel on touch press instead of pointerup, silently dropping the release. stopMic never ran → micListening stuck true → every subsequent press hit the `if (micListening || loading) return` guard and silently exited. Exactly the reported symptom (button appears, nothing happens, no error).
- Fix (commit 1 — 8321199): Replaced onPointerDown/onPointerUp/onPointerLeave on the mic button with touch event handlers (onTouchStart→startMic, onTouchEnd→stopMic, onTouchCancel→stopMic — all with e.preventDefault() to suppress synthetic mouse events) plus mouse fallbacks (onMouseDown/Up/Leave) for desktop. Made startMic self-healing: idempotent cleanup at top (remove any lingering listeners, call SpeechRecognition.stop()) before any new session. Removed micListening from the bail guard — only `loading` still blocks. A stuck micListening can no longer permanently lock the button.
- Fix (commit 2 — db33865): partialResults event payload confirmed from installed TS defs: SpeechRecognitionPartialResultEvent uses `matches?: string[]` — evt.matches?.[0] extraction is correct, no change needed. Added micHint state + "Press and hold to speak." hint (neutral color, not red) shown after the permission-just-granted silent return, so first-time users aren't met with silence after tapping through the iOS permission dialog.
- Files: avenstone-vite/src/components/shared/MasterAgent.jsx, CLAUDE.md (iOS gotcha added), CLAUDE_MEMORY.md (this entry).
- partialResults finding: plugin's SpeechRecognitionPartialResultEvent (definitions.d.ts:75-98) confirms matches?: string[] — extraction unchanged. errorEvent uses code/message/sessionId — evt.message correct.
- CLAUDE.md gotcha added: hold-to-talk controls in Capacitor WKWebView must use touch events with e.preventDefault(), NOT pointer events — pointer events emit pointercancel on touch and silently drop the release.
- Build: npm run build passed both commits (571–630ms, 372–373 modules).
- Verification: on-device retest is Kalin's after Codemagic build hits TestFlight. Test: press and hold mic → speak → release → transcript appears in input → button not stuck on subsequent presses.
- Open: on-device verification pending. TTS audio quality check (Phase 4) still pending same build.

[LOG — 2026-05-17 — Phone-first UX slice 1: 7 mobile layout fixes]
- Action: Completed a full phone-first UX audit of TodayScr, JobsScr, JobDet, ScheduleTab, FinancialsTab, index.css. Delivered ranked punch list, then shipped all mechanical fixes in 7 commits.
- Fix 1 (commit 612a3db): .finp font-size 14px → 16px. Stops iOS WKWebView auto-zoom on every form input app-wide.
- Fix 2 (commit 94a6eca): JobDet tab bar (11 tabs) was grid-wrapping to 3 rows at 9px on mobile. Replaced with single-row overflow-x:auto flex at 11px. ScrollIntoView added to JobDet.jsx (tabbarRef + useEffect on tab change) so active tab always scrolls into view.
- Fix 3 (commit c8ab553): JobDet header crammed back/address/badge/AI-button on one flex row — address truncated to 1-2 words. Mobile now renders 2 rows (actions row first, full-width address row below). Desktop unchanged. .cc/.cc-v tightened slightly on mobile.
- Fix 4 (commit 4f41a24): FinancialsTab budget desktop table had inline display:none permanently hiding it on ALL viewports. Audited — code is complete and functional (identical data logic to mobile cards). Removed hide, now renders desktop table on desktop via isMob(), mobile cards on mobile. Sub-tab "Change Orders" → "COs" on mobile + overflowX:auto on sub-tab row to prevent overflow.
- Fix 5 (commit 9ac3ec0): TodayScr bottom padding was flat 40px — content clips behind home indicator on iPhone X+. Changed to calc(40px + env(safe-area-inset-bottom)). Refresh button had padding:0 (~16px target) — now padding:'10px 0' for usable tap area.
- Fix 6 (commit c54e6fb): ScheduleTab Edit/Cancel buttons were padding 3px/font 11 (~22px tall). Now 6px/12px/minHeight 36px.
- Fix 7 (commit b2d26f3): JobsScr address suggestion dropdown had hover-only highlight (onMouseEnter/Leave). Added onTouchStart/End/Cancel for pressed-state feedback on iOS.
- Files: index.css, JobDet.jsx, FinancialsTab.jsx, TodayScr.jsx, ScheduleTab.jsx, JobsScr.jsx, CLAUDE.md, CLAUDE_MEMORY.md
- Budget table decision: desktop table was fully functional — NOT stale. display:none was a development oversight. Restored with isMob() guard.
- scrollIntoView: YES added to JobDet.jsx — tabbarRef + useEffect fires on every tab change.
- Build: npm run build passed after each commit.
- Open: on-device verification (all 7 fixes) after next Codemagic build → TestFlight.

[LOG — 2026-05-17 — Test-feedback fixes: MasterAgent, schedule time, financials sort]
- Action: 4 commits from post-test-pass audit. All pushed to main. Build passed each commit.
- Commit 1 (e014263): fix(master-agent) — Desktop web panel was top:0/height:100vh, jamming close button against browser chrome/top-bar. Changed desktop branch to top:60/height:calc(100vh-60px) so panel sits below the 60px .top-bar. Close button padding enlarged from '2px 4px' to '10px 12px' + minWidth/minHeight 44px for reliable hit area on all platforms.
- Commit 2 (851b3fb): migration — ALTER TABLE schedule_items ADD COLUMN IF NOT EXISTS scheduled_time TIME. Applied to live DB and verified: information_schema confirms column_name=scheduled_time, data_type=time without time zone.
- Commit 3 (da3eea1): feat(schedule) — scheduled_time wired end-to-end: form state init, type="time" input alongside date, sbCreateScheduleItem writes scheduled_time||null, sbUpdateScheduleItem clean-patch coalesces it, sbLoadScheduleItems adds secondary .order('scheduled_time',{nullsFirst:true}), display shows HH:MM after date when set.
- Commit 4 (a223ec7): fix(financials) — sbLoadJobTransactions changed from order('date_incurred',{ascending:false}) to order('created_at',{ascending:false}) so newly added transactions always land at the top.
- Files: MasterAgent.jsx, ScheduleTab.jsx, supabase.js, supabase/migrations/20260517130000_schedule_items_add_time.sql
- Trade-aware: schedule_items and job_transactions are platform tables — changes are tenant- and trade-agnostic.
- Open: on-device verification (all 4 fixes) after next Codemagic build → TestFlight.

[LOG — 2026-05-17 — Receipt photo upload: 3 fixes]
- Action: Audited and fixed the receipt/expense photo upload flow in TransactionModal. Three commits, all pushed to main. Build passed each.
- Root cause: In uploadReceipt, DB write was guarded by `if (!isNew && tx.id)`. For new transactions, file uploaded to job-receipts storage, UI showed ✓ Attached, but receipt_url column was NULL — association lost on modal close. Edit mode worked correctly.
- Commit 1 (cd1ed31): fix(transaction): added receipt_url: receiptUrl || null to the sbCreateTransaction payload. receipt_url TEXT column confirmed live in job_transactions (20260423_unified_financial_ledger.sql:50).
- Commit 2 (e8644ae): fix(transaction): upload feedback — receipt box now shows "Uploading…" text while in-flight. Upload failures (previously fully silent) now call setErr with the error message.
- Commit 3 (e4b8b05): feat(transaction): added sbGetReceiptUrl(path) helper to supabase.js (createSignedUrl on job-receipts, standard { ok, error, data } shape). View mode dead "📎 Receipt attached" text replaced with clickable "📎 View receipt" button (fetches fresh signed URL on click). Edit/create mode shows "View" link alongside "✓ Attached". FinancialsTab ledger rows show 📎 indicator on any row with receipt_url.
- Orphan note: receipt files already in job-receipts bucket from past new-transaction uploads cannot be re-associated — receipt_url is NULL on those rows. Fix is forward-only.
- Files: TransactionModal.jsx, supabase.js, FinancialsTab.jsx
- Trade-aware: job_transactions and job-receipts bucket are platform-level, tenant- and trade-agnostic.
- Open: on-device verification — attach receipt to NEW expense, save, reopen — receipt present and openable via View link.

[LOG — 2026-05-17 — Web test pass fixes: tab wrap, mobile close button, receipt link]
- Action: 3 commits from web testing. All pushed to main. Build passed each.
- Slice-2 mobile UX fixes (fix(modals) input 16px, fix(invoice-composer) layout, etc.) NOT present in git log — not yet shipped.
- Commit 1 (aa7e34f): fix(css) — Job Detail tab bar was horizontal-scroll (slice 1). User wants all tabs visible. Mobile .tabbar override changed from overflow-x:auto/flex-wrap:nowrap to flex-wrap:wrap. .tab font-size 11px → 12px, flex:none → flex:1 so each wrapped row fills width. JobDet.jsx: removed tabbarRef, scrollIntoView useEffect, and useRef import — all dead code once scroll is gone.
- Commit 2 (5cf9efc): fix(master-agent) — Mobile panel (position:fixed inset:0) had flat 18px top padding. On mobile-web (no Capacitor status-bar offset), close button jams against browser chrome. Header top padding now uses max(18px, calc(env(safe-area-inset-top) + 8px)) for mobile branch only. Desktop branch unchanged. On Capacitor env(safe-area-inset-top)=0 so no change there either.
- Commit 3 (2d4adb4): fix(transaction) — View receipt did nothing on iOS Safari: window.open after an await loses the tap gesture context and gets popup-blocked. Fixed by pre-fetching the signed URL in a useEffect on receiptUrl change (modal open + after upload). Both view-mode and edit-mode links are now plain <a href> anchors — no async in tap handler.
- Files: index.css, JobDet.jsx, MasterAgent.jsx, TransactionModal.jsx
- Trade-aware: all platform UI, tenant- and trade-agnostic.
- Open: on-device verification of all 3 fixes after next Codemagic build → TestFlight.

[LOG — 2026-05-17 — Phone-first UX slice 2: 4 commits, 8 files]
- Action: Raised inp fontSize to 16px across all financial modals (kills iOS auto-zoom), added mobile-stacked layout to InvoiceComposerModal, added safe-area-inset-bottom to ClientPortal messages compose, bumped consultation panel tap targets.
- Commit 1 (9acc32c): fix(modals) — inp const fontSize 13→16 in TransactionModal.jsx, InvoiceComposerModal.jsx, DrawModal.jsx; inp const fontSize 14→16 in LineItemModal.jsx.
- Commit 2 (1d34b64): fix(invoice-composer) — isMob() import added. Metadata row (invoice#/date/due): desktop stays 3-col grid, mobile becomes invoice# full-width + dates 2-col. Line items: desktop keeps 8-col fixed-width grid, mobile renders per-item card blocks (description+delete row, 3-col qty/unit/price row, 2-col total/phase row). Modal maxHeight 92vh→90vh.
- Commit 3 (f9a1315): fix(client-portal) — messages compose div paddingBottom: 'calc(8px + env(safe-area-inset-bottom))' so iOS home indicator doesn't clip the send row.
- Commit 4 (d46c6b1): fix(consultation) — MeasurePanel mic button 40×40→44×44. AmbientPanel Pause/Resume button style gains minHeight:44 + fontSize:14.
- Files: TransactionModal.jsx, InvoiceComposerModal.jsx, DrawModal.jsx, LineItemModal.jsx, ClientPortal.jsx, MeasurePanel.jsx, AmbientPanel.jsx
- Trade-aware: all platform UI, tenant- and trade-agnostic.
- Open: on-device verification of all 4 commits after next Codemagic build → TestFlight. Slice 2 unaudited items (GapResolutionModal.jsx, ClientInvoicesTab.jsx) still out of scope.

[LOG — 2026-05-17 — FieldTab: split Notes & Photos into separate sub-tabs]
- Action: Split "Notes & Photos" sub-tab into two discrete sub-tabs. FieldTab now has 4 sub-tabs: Notes, Photos, Daily Logs, Materials.
- Files: FieldTab.jsx (SUB_TABS array + render switch)
- Decision: NotesTab and PhotosTab already existed as separate named exports from NotesPhotosTab.jsx — zero new component work. Render switch replaced the shared <> fragment with one line per sub-tab.
- Trade-aware: platform UI, tenant- and trade-agnostic.
- Build: passed (✓ built in 744ms).

[LOG — 2026-05-17 — Daily Log Arc: Phase 1 kickoff — schema foundation]
- Action: Created DAILY_LOG_ARC.md blueprint + applied migration for daily_logs approval columns.
- Commit 1 (cc31a2e): docs: DAILY_LOG_ARC.md — 4-phase arc blueprint, locked decisions, reused vs net-new.
- Commit 2 (af022f4): migration 20260517100000_daily_logs_approval.sql — adds status/approved_at/approved_by_id to daily_logs. Applied and verified live.
- 4-phase plan: Phase 1 (done) schema; Phase 2 AI draft edge function; Phase 3 PM approval + photo curation UI; Phase 4 client-facing log view + photo gating.
- Photo compatibility confirmed: daily_logs.id is UUID, photos.related_entity_id is UUID — type-compatible for Phase 3 linkage via related_entity_type='daily_log'.
- Existing rows default to status='draft' — historical logs never curated, correctly invisible to client.
- Build: passed (✓ built in 623ms).
- Files: DAILY_LOG_ARC.md, supabase/migrations/20260517100000_daily_logs_approval.sql
- Trade-aware: platform table, tenant- and trade-agnostic.
- Open: Phase 2 (AI draft edge function), Phase 3 (PM approval UI), Phase 4 (client view).

[LOG — 2026-05-17 — Daily Log Arc: Phase 2 — AI draft edge function]
- Action: Created ai-daily-log-draft edge function + sbGenerateDailyLogDraft helper. Phase 2 of 4 shipped.
- CHECK constraint finding: daily_logs_status_check already present (CHECK status IN ('draft','approved')) — no migration needed.
- Edge function contract: POST { job_id, raw_note } → { ok, work_completed, materials_used, issues }. Loads current job phase for grounding. Haiku only, max_tokens: 1024. User-triggered, never automatic.
- Smoke test: STATUS 200, clean output for a sample framing note — work_completed client-readable prose, materials_used "2x6 lumber", issues "short by 20 boards, causing early work stoppage."
- Commit 1 (2c89c5c): feat(daily-log): ai-daily-log-draft edge function.
- Commit 2 (9da444e): feat(daily-log): sbGenerateDailyLogDraft helper + AI_DAILY_LOG_DRAFT_URL export.
- Build: passed (✓ built in 649ms).
- Files: supabase/functions/ai-daily-log-draft/index.ts, avenstone-vite/src/lib/supabase.js, DAILY_LOG_ARC.md
- Trade-aware: platform-level, tenant- and trade-agnostic.
- Open: Phase 3 (PM approval + photo curation UI in LogsTab), Phase 4 (client-facing log view).

[LOG — 2026-05-17 — Prompt caching: 3 edge functions updated]
- Action: Audited 9 AI edge functions for cacheability; added cache_control: ephemeral to 3 qualifying functions.
- QUALIFIED (cache added): ai-companion (last tool: escalate_to_owner), ai-master-agent (last tool: add_knowledge), ai-estimator (system string → single-block array with cache_control).
- SKIPPED: ai-field-agent (one-shot — FAIL c); ai-home-companion (Haiku, stable prefix ~557 tok < 2048 — FAIL b); ai-project-manager (one-shot + system ~329 tok < 1024 — FAIL b+c); ai-consultation-gap-analyzer (no system field, one-shot — FAIL b+c); process-transcript (Haiku, both modes' stable portions < 2048 — FAIL b); ai-intake (file doesn't exist).
- Breakpoint rule: cache_control on the LAST tool definition (tools array present) or the single system block (no tools). Breakpoint sits after system+tools, before conversation/message history. History window deliberately uncached — slides every turn.
- Commits: 1f807c9 (ai-companion), 6fb4e87 (ai-master-agent), d7d407e (ai-estimator), 7e751ac (CLAUDE.md).
- Trade-aware: cache_control is transport-layer config, not tenant/trade-specific. Breakpoints on tools, which are platform-level. ✓
- Open: real savings only materialize at multi-tenant scale with many concurrent users hitting the same cached prefixes. Single-tenant today = agentic-loop benefits (3-5 reads per write) + estimating chat session hits.

[LOG — 2026-05-17 — daily_logs profiles embed disambiguation]
- Root cause: Phase 1 migration added approved_by_id UUID REFERENCES profiles(id) as a second FK on daily_logs. PostgREST now sees two relationships between daily_logs and profiles (author_id and approved_by_id) and throws "could not embed because more than one relationship found."
- Fix: Added !author_id FK hint to both queries — profiles!author_id(full_name,role). PostgREST column-name hint syntax unambiguously targets the author FK. No field selection changes.
- Queries fixed: supabase.js:753 (sbLoadDailyLogs) and supabase.js:757 (sbSubmitDailyLog).
- Build: ✓ built in 673ms. Commit: 53f39fd.
- Pattern to remember: whenever a table gains a second FK to the same target table, ALL relational selects embedding that target become ambiguous and must use !column_name hint syntax.

[LOG — 2026-05-17 — tools/apply_migration.js: atomic apply + verify wrapper]
- Action: Built apply_migration.js + npm run migrate script + updated CLAUDE.md.
- Tool contract: node tools/apply_migration.js <path.sql> [--verify <objects>] | --selftest | --help.
- Auto-derives expected objects from CREATE TABLE / ALTER TABLE ... ADD COLUMN / CREATE INDEX / CREATE POLICY. Explicit --verify override for exotic SQL.
- Verification: information_schema.columns (columns/tables), pg_policies (policies), pg_indexes (indexes). NOTIFY pgrst 'reload schema' after apply.
- Exit 0 = all objects confirmed. Exit 1 = apply fail or any missing object. Exit 2 = usage/PAT error.
- Selftest passed: invoices.invoice_number (PASS present), _nonexistent_verify_probe (PASS absent).
- CLAUDE.md changes: SQL Migrations section (curl → npm run migrate), "write a migration" task pattern (npm run migrate is canonical apply), Tools/Scripts section (apply_migration.js entry + MCP connector note).
- package.json: added "migrate": "node ../tools/apply_migration.js" alongside audit:schema.
- Commits: 45a1ab6 (tool), da935c0 (npm script), 02028cd (CLAUDE.md docs).
- Migration apply method in CLAUDE_MEMORY line 20 is now superseded — npm run migrate is the canonical path.

[LOG — 2026-05-17 — photos.id missing default]
- Root cause: photos.id is TEXT NOT NULL with no default. Every sbPhoto insert that omits id (which is all of them) failed with "null value in column id violates not-null constraint". The column was created out-of-band without a default and no migration ever set one.
- Fix: migration 20260517200000_photos_id_default.sql — ALTER TABLE photos ALTER COLUMN id SET DEFAULT uuid_generate_v4()::text. Kept TEXT type to avoid FK rewrites. Matches daily_logs.id pattern (which uses uuid_generate_v4()).
- Other-tables scan: profiles.id is also uuid NOT NULL with no default — intentional, it's the Supabase auth FK (id comes from auth.users, not app-generated). photos was the only broken one.
- Verification: information_schema confirms column_default = '(uuid_generate_v4())::text'. Smoke test insert without id returned auto-generated UUID 8161a9b9-54d7-46ea-9cc0-dac88b81429a, test row deleted. Commit: 754aaba. Trade-aware: platform table, tenant- and trade-agnostic. ✓

[LOG — 2026-05-17 — photo upload bug: sub-tab state reset + silent failures]
- Cause 1 (split regression): FieldTab held `const [sub, setSub] = useState('notes')` locally. FieldTab unmounts whenever the user switches away from the Field main tab (JobDet renders it with `{tab === 'field' && <FieldTab .../>}`). On return, FieldTab remounts, sub resets to 'notes', and Photos sub-tab is no longer active — photos appeared gone even though they were in job.photos.
- Fix 1: Lifted fieldSub/setFieldSub into JobDet (stays mounted across all main-tab switches). FieldTab now receives sub/setSub as props. Sub-tab persists for the lifetime of the job detail view.
- Cause 2 (silent failure): In `onFile`, failed sbPhoto calls (ok: false) were ignored — the progress bar still completed to 100%, so a failed upload looked successful with no feedback.
- Fix 2: Track failed count per batch. After batch completes, show dismissable red error banner with count ("N photo(s) failed to save — check your connection and try again."). uplErr state clears on dismiss or next upload.
- Files: JobDet.jsx (fieldSub state + prop pass), FieldTab.jsx (props replace local state, removed useState import), NotesPhotosTab.jsx (uplErr state, failed counter in onFile, error banner in JSX).
- Builds: both ✓. Commits: 3d384f9 (sub-tab lift), 8f6f148 (upload error surfacing). Trade-aware: platform UI, tenant- and trade-agnostic. ✓

[LOG — 2026-05-17 — Daily-log arc Phase 3a: AI draft assist on both forms]
- Action: Added AI draft assist section to both daily-log forms. Quick-note textarea + "Generate Draft" button at top of each form prefills work_completed, materials_used, issues via sbGenerateDailyLogDraft. Manual entry and submit path unchanged. rawNote/draftLoading/draftErr state per form. Clears on submit success and Cancel.
- Files: avenstone-vite/src/components/jobs/tabs/LogsTab.jsx (PM form), avenstone-vite/src/components/sub/SubJobView.jsx (sub form), DAILY_LOG_ARC.md (3a/3b split).
- DAILY_LOG_ARC.md: Phase 3 split into 3a (AI draft assist — Shipped) and 3b (PM approval + photo curation — Planned). Open Items updated accordingly.
- Commits: f7ee227 (LogsTab), 8251022 (SubJobView).
- Cost: Haiku only, user-triggered, max_tokens 1024. Zero automatic calls. ✓
- Open: Phase 3b (PM approval UI: review/edit, photo curation, approve button → status='approved'). Phase 4 (client log view in ClientPortal).
- NOTE: Phase 3a (AI draft assist) is superseded by the arc re-scope below. The UI shipped but will be replaced in Phase 3 rebuild.

[LOG — 2026-05-17 — Daily-log arc re-scope: corrected design + client_message column]
- Re-scope: the entire daily-log arc was redesigned. Old design: structured 7-field form (weather, crew_count, hours_worked, materials_used, issues) + AI draft assist that prefilled internal fields. New design: one capture box (work_completed) + photos; AI generates a client-facing update message (client_message); PM reviews/edits the message, curates photos, taps Send — one action approves + notifies client.
- Key decisions locked: capture = one box, no form; AI output = client message, not internal log; Send = approve + notify in one action; work_completed holds raw capture note; client_message holds AI message; structured columns retained in DB (not dropped), just unused in new UI.
- New column: daily_logs.client_message TEXT (nullable, no default). Migration 20260517210000_daily_logs_client_message.sql applied and verified — information_schema confirms column present. Commit: b69e281.
- Arc doc: DAILY_LOG_ARC.md fully rewritten — corrected flow, 5-phase plan, locked decisions, updated schema ref. Commit: 3a92648.
- Build: ✓ built in 588ms.
- Trade-aware: daily_logs is a platform table, tenant- and trade-agnostic. ✓
- Open: Phase 2 (rework ai-daily-log-draft to output client_message using work_completed + schedule context). Phase 3 (one-box capture UI, remove 7-field form + AI draft assist from LogsTab and SubJobView). Phase 4 (PM review + Send screen). Phase 5 (client view + notification).

[LOG — 2026-05-17 — Daily-log arc Slice 2: ai-daily-log-draft rework]
- Action: Reworked ai-daily-log-draft edge function to generate a client-facing update message instead of internal log fields.
- New contract: POST { job_id, raw_note } → { ok, client_message }. Loads current phase + upcoming schedule_items (next 30 days, status scheduled/in_progress, limit 5). Haiku, max_tokens 512 (plain prose — no JSON parsing needed).
- Prompt: warm, professional, plain-language client update — what happened today + what's coming next. No jargon. Short paragraph(s).
- Previous output shape { work_completed, materials_used, issues } fully replaced.
- sbGenerateDailyLogDraft helper: return shape updated to { ok, error, data: { client_message } }.
- Smoke test (job test-flow-001, framing note + schedule items): STATUS 200, coherent client_message covering what happened + schedule context ("Our subs are scheduled to start next Sunday..."). Clean output.
- Build: ✓ 627ms. Deploy: GitHub Actions confirmed success.
- Files: supabase/functions/ai-daily-log-draft/index.ts, avenstone-vite/src/lib/supabase.js, DAILY_LOG_ARC.md.
- Commits: 94c171e (edge fn), adb2349 (helper).
- Trade-aware: platform-level edge function, tenant- and trade-agnostic. ✓
- Open: Slice 3 (rebuild capture UI — one box + photos, remove 7-field form + AI draft assist from LogsTab and SubJobView). Slice 4 (PM review + Send screen). Slice 5 (client view + notification).

[LOG — 2026-05-17 — Daily-log arc Slice 3: capture modal rebuilt — one-box + photos]
- Action: Replaced 7-field form + AI Draft Assist box in both PM (LogsTab) and sub (SubJobView) capture modals with a single "What happened today" textarea + photo staging section.
- Submit sequence (one user action): (1) sbSubmitDailyLog with work_completed = capture note, all legacy columns null → get logId. (2) sbPhoto for each staged file with related_entity_type='daily_log', related_entity_id=logId. (3) sbGenerateDailyLogDraft → sbSaveDailyLogClientMessage to patch client_message back — failure is soft, log stays valid with client_message null.
- New helper: sbSaveDailyLogClientMessage(logId, clientMessage) — single UPDATE on daily_logs.
- Log list updated in both components: shows capture note (work_completed) + client_message in a "Client Update" block (cream background). Draft/Sent badge from status field.
- WEATHER_OPTS_KEYS constant removed from SubJobView. logForm state removed from both. logErr state added to SubJobView (was missing). capturePhotoRef added alongside existing completePhotoRef in SubJobView.
- Files: LogsTab.jsx, SubJobView.jsx, supabase.js (sbSaveDailyLogClientMessage), DAILY_LOG_ARC.md.
- Builds: both ✓ (580ms, 576ms). Commits: da8edd6 (LogsTab + helper), 8bf70c5 (SubJobView).
- Trade-aware: platform UI, tenant- and trade-agnostic. ✓
- Open: Slice 4 (PM review + Send screen — shows capture note + photos + editable client_message, Send stamps approved/sent + notifies client). Slice 5 (client view in ClientPortal).

[LOG — 2026-05-17 — Daily-log arc Slice 4: PM review + Send screen]
- Action: Built PM review + Send modal in LogsTab and supporting schema/helpers.
- Schema: photos.client_visible BOOLEAN NOT NULL DEFAULT true. Column pre-existed with DEFAULT false (wrong); corrective migration backfilled existing rows to true, set DEFAULT true, NOT NULL. Verified: information_schema confirms is_nullable=NO, column_default=true. Migrations: 20260517220000 (add) + 20260517230000 (fix).
- Helpers added to supabase.js: sbSendDailyLog(logId, clientMessage, job) — saves final message, stamps status='approved'/approved_at/approved_by_id, calls sbNotifyUser on job.client_user_id if set. sbSetPhotoClientVisible(photoId, visible) — toggles photos.client_visible. sbLoadPhotosForEntity: client_visible added to select.
- Review modal (LogsTab): draft logs show amber border + "Review & Send" button. Modal shows field note (read-only), photo curation grid (tap to toggle ✓/✕, writes DB immediately), editable client message textarea + Generate/Regenerate button, "Send to Client" button (disabled when message empty). On send: log updates to Sent in list, modal closes.
- Sent logs: plain border, green "Sent" badge, read-only (no Review & Send button).
- Build: ✓ 606ms. Commits: 1db188f (migrations), 1084ff4 (helpers), f83661b (LogsTab).
- Trade-aware: platform-level, tenant- and trade-agnostic. ✓
- Open: Slice 5 (client view in ClientPortal — shows sent logs WHERE status='approved' with curated photos WHERE client_visible=true).

[LOG — 2026-05-17 — Daily-log arc Slice 5: client view + RLS gate — ARC COMPLETE]
- Action: Built full client-facing daily log view in ClientPortal and added RESTRICTIVE RLS policy gating clients to approved logs only.
- RLS: CREATE POLICY "daily_logs: client approved only gate" AS RESTRICTIVE FOR SELECT — clients must have status='approved' AND jobs.client_user_id = auth.uid(). Non-clients pass through unaffected. Verified via pg_policies: permissive=RESTRICTIVE, cmd=SELECT. Migration: 20260517240000.
- Helper: sbLoadClientUpdates(jobId) — loads approved daily_logs newest-first, each entry includes photos array filtered to related_entity_type='daily_log' AND client_visible=true. Two queries: logs then photos IN (logIds).
- ClientPortal: new "Updates" tab (second after Overview) renders each sent update — date, client_message, curated photo grid. Photos tab now sources from same sbLoadClientUpdates call (no longer queries photos directly by job_id). Both tabs share one load (loaded.updates). Photos tab empty state copy updated.
- Client notification: fires on Send in sbSendDailyLog → sbNotifyUser(job.client_user_id, ...) already shipped in Slice 4.
- Build: ✓ 582ms. Commits: 4866955 (RLS), 81e2795 (helpers + ClientPortal).
- Trade-aware: platform-level. ✓
- DAILY_LOG_ARC.md: Phase 5 marked Shipped. All 5 phases complete.

[LOG — 2026-05-18 — Bug fix: daily-log client delivery broken — missing UPDATE RLS policies]
- Root cause: daily_logs had no UPDATE RLS policy and photos had no UPDATE RLS policy. PostgREST silent-deny behaviour: when RLS blocks an UPDATE, Supabase returns success with 0 rows affected and no error. sbSendDailyLog and sbSaveDailyLogClientMessage both returned ok:true on every call even though nothing was written. Status never reached 'approved', client_message stayed null, Photos tab was silently failing the same way (sbSetPhotoClientVisible). All 4 test daily_log rows were permanently stuck at status='draft'.
- Fix — migration 20260518100000: added "logs: staff update" PERMISSIVE UPDATE on daily_logs (mirrors INSERT policy: can_access_job + owner/pm/sub). Added "photos: owner/pm update" PERMISSIVE UPDATE on photos (mirrors DELETE policy: can_access_job + owner/pm). Both verified via pg_policies.
- Fix — helper hardening: sbSendDailyLog and sbSaveDailyLogClientMessage both now add .select('id').single() after the UPDATE. If data is null (0 rows affected), they return ok:false with explicit error instead of false success. This makes RLS failures visible in the UI error banner.
- Lesson — PostgREST silent-deny: any UPDATE/DELETE helper that only checks the error field can falsely return ok:true when RLS blocks it. Always add .select('id').single() (or check count) after writes that must affect a known row. A 0-row UPDATE is almost always a bug.
- Build: ✓ 589ms. Commits: 25647fb (migration), 0159543 (helper hardening).
- Files: supabase/migrations/20260518100000_daily_logs_photos_update_rls.sql, avenstone-vite/src/lib/supabase.js.
- Trade-aware: platform tables, tenant- and trade-agnostic. ✓

[LOG — 2026-05-18 — fix(notify-email): add daily_log_sent subject]
- Action: Added daily_log_sent to SUBJECTS map in notify-email/index.ts.
- Subject: "Project update from your contractor"
- Context: The notification → DB trigger → notify-email → Resend pipeline was already fully wired. daily_log_sent was the only missing entry, causing client-update emails to fall through to the generic "Avenstone notification" subject fallback.
- Files: supabase/functions/notify-email/index.ts.
- Commit: a905680. Deploy: GitHub Actions auto-deploy on push.

[LOG — 2026-05-18 — fix: notifications_type_check missing daily_log_sent]
- Root cause: notifications.type has a CHECK constraint (notifications_type_check) listing all allowed values. daily_log_submitted was in the list but daily_log_sent was not — also missing: schedule_item_created, schedule_item_changed, bid_accepted (all emitted by supabase.js sbNotifyUser calls but silently rejected). Every sbNotifyUser call for these types was returning HTTP 400, which sbNotifyUser swallowed via catch(() => {}).
- Fix: migration 20260518110000 — dropped and recreated notifications_type_check with all current type values including daily_log_sent and the three others.
- Lesson: whenever adding a new notification type to supabase.js, also add it to notifications_type_check. The constraint is in supabase/migrations/20260518110000_notifications_type_daily_log_sent.sql — update this file or write a new migration.
- Smoke test: INSERT with type='daily_log_sent' succeeds, row created.
- Commit: 57ccaab. No app code changed.

[LOG — 2026-05-18 — fix(daily-log): list daily logs newest-first]
- Action: Added created_at DESC as secondary sort to sbLoadDailyLogs and sbLoadClientUpdates. Primary sort log_date DESC was already correct; same-day logs had no tiebreaker so defaulted to insertion order (oldest-first within a day).
- Neither LogsTab nor SubJobView re-sorts the result — display order comes entirely from the query.
- Build: ✓ 588ms. Commit: f29e1a5.

[LOG — 2026-05-18 — test data: seeded Financials tab data for test-flow-001]
- Inserted into live DB (test-flow-001 only, tenant 00000000-0000-0000-0000-000000000001):
  - estimate_line_items: 5 rows (Framing $4,830, Electrical $4,370, Drywall $6,210, Paint $3,680, Trim $2,990 — generated total_cost and client_price from quantity*unit_cost and markup_pct=15)
  - job_cost_items: 4 rows (KC Framing Co, Metro Electric LLC, Midwest Drywall, ProPaint KC — all client_visible=true)
  - job_transactions: 3 rows (direction='out', cost_item_id set — 2 paid, 1 pending) → surfaced by job_cost_invoices view
- Note: estimate_line_items.total_cost and client_price are GENERATED ALWAYS columns — never include them in INSERT statements.
- Financials tab Estimate + Project Costs sections now render for test-flow-001.

---

[LOG — 2026-05-18 — AGENT_CARDS Phase 1 — schema + MasterAgent scaffolding + round-trip]
- Action: AGENT_CARDS_ARC Phase 1 shipped. Plumbing only — no card-emitting tool yet.
- Commits: 6067a0d (agentCards.js contract), 48b97d2 (edge fn wiring), 0fcbab8 (MasterAgent renderer)
- Build status: ✓ built in 538ms (clean after mock removal)

Contract — pending_card shape:
  { id: string, prompt: string, questions: Array<{ id, type: 'select'|'radio_per_item', label, options: [{value,label}], items?: [{id,label}] }> }
Contract — card_response shape:
  { card_id: string, answers: { [questionId]: string | { [itemId]: string } } }

Round-trip wiring (critical invariant for Phase 2):
  1. Edge fn returns { pending_card } + assistant text response.
  2. callMaster appends { role:'assistant', content: aiText } to conversationHistory (same as any normal turn — ensures model sees question context).
  3. submitCard calls formatCardAnswers(card, answers) → appends { role:'user', content: answersText } to conversationHistory.
  4. POSTs { card_response, conversation_history } — history ends with [assistant: question] → [user: answers].
  5. Edge fn card_response path: passes history directly to runAgentLoop, no extra user message appended.
  6. Model sees full context and calls the intended tool.

Files:
  - avenstone-vite/src/lib/agentCards.js (new — contract + validator, formatCardAnswers, validatePendingCard, validateCardResponse)
  - supabase/functions/ai-master-agent/index.ts (PendingCard TS interfaces, runAgentLoop return type extended, card_response handler, pending_card threaded through responses)
  - avenstone-vite/src/components/shared/MasterAgent.jsx (AgentCard component, pendingCard state, submitCard, cancelCard, clearCard on sendMessage+clearChat)

Renderers: select (pill buttons) and radio_per_item (scrollable table, custom radio circles). Both confirmed compiling via mock smoke test.
Trade-aware: platform-level agent surface, tenant/trade-agnostic. No DB changes.

---

[LOG — 2026-05-19 — AGENT_CARDS Phase 2 — receipt categorization card]
- Action: AGENT_CARDS_ARC Phase 2 shipped. log_receipt emits a category select card when type is absent.
- Commit: 133f937

What changed in ai-master-agent/index.ts:
  - CardOption/CardItem/CardQuestion/PendingCard interfaces moved before CONFIRM_TOOLS (forward-ref cleanup)
  - ELICIT_TOOLS registry added after CONFIRM_TOOLS: log_receipt entry emits 8-option select card; returns null (loop guard) when input.type already present
  - runAgentLoop: elicitation check fires BEFORE confirmBlock check; on card emit returns { response, actions, pending_card }
  - log_receipt executor: removed silent material_purchase fallback; now errors on missing/invalid type
  - log_receipt tool description: "Omit when unknown — the system will prompt the user to select."
  - System prompt RECEIPT FROM PHOTO: "Otherwise → omit type; the category card will prompt the user"

Category options — 8 (arc spec said 7, but equipment_rental is a valid DB value per job_transactions_type_check constraint):
  material_purchase, fuel, permit, sub_payout, vendor_payment, commission, equipment_rental, other_expense
  DB constraint also has: client_payment, client_deposit, client_refund, other_income — outbound expenses only; those 4 are excluded from card options correctly.

Full flow: "log a $50 receipt" → Claude calls log_receipt(type absent) → ELICIT_TOOLS fires → pending_card returned → AgentCard renders select → user picks fuel → card_response → runAgentLoop → Claude re-calls log_receipt(type:"fuel") → elicitor returns null → confirmBlock fires → pending_action confirm card → user confirms → row written with type=fuel.

Vendor-inference still in effect for RECEIPT FROM PHOTO path: Home Depot → material_purchase, gas → fuel, permit office → permit (high-confidence only). Unknown vendor → agent omits type → card fires.

Smoke test verified 2026-05-19 (edge fn called directly):
  Row written: id=7cd60f10-7bd7-48ba-9b70-af7b3d8a2eb0, job_id=test-flow-001, amount=50.00, type=fuel, direction=out

Loop guard: elicitor returns null when input.type present — prevents infinite card loop on post-card re-call.
No DB changes, no renderer changes (reuses Phase 1 AgentCard). Build: ✓ 728ms.

---

[LOG — 2026-05-19 — labor transaction type]
- Action: Added 'labor' as a new job_transactions type (direct hourly-labor expenses, distinct from sub_payout).
- Commits: 5c6a064 (migration), c42b6a7 (agent card), e796755 (frontend)

Touch points:
  - DB: job_transactions_type_check constraint extended (drop+recreate), qb_category_map row inserted (Labor / Cost of Goods Sold)
  - Edge fn (ai-master-agent): labor added to ELICIT_TOOLS card options ("Labor (hourly)"), log_receipt tool schema enum, ALLOWED_OUT set in executor
  - Frontend: TransactionModal TX_TYPES_OUT + TYPE_LABELS, FinancialsTab TYPE_LABELS, SettingsModal QB_TYPES, qbExport TX_LABELS

Lien-waiver: NO change needed — trigger is inclusion-based (sub_payout + vendor_payment only). labor auto-exempt.
qb_category_map scoping: all rows are per-tenant (tenant_id=Avenstone), NOT platform-null. New row follows same pattern.
TransactionModal direction: determined by which array (TX_TYPES_IN / TX_TYPES_OUT) the type falls in. labor → TX_TYPES_OUT → direction=out.

Smoke test verified 2026-05-19:
  Receipt card path: card fired with labor option visible → picked labor → confirmed
    Row: id=c4ca5d18-24f3-46f0-8339-15fb09d720b4, job_id=test-flow-001, amount=175.00, type=labor, direction=out, lien_waiver_required=false
  Direct path (agent inferred from "labor expense"): confirmed
    Row: id=9b5b5a88-6695-4138-8f8f-2b4efbccfd38, job_id=test-flow-001, amount=400.00, type=labor, direction=out, lien_waiver_required=false

Trade-aware: platform-level addition, not tenant-specific. Every contractor type has direct hourly-labor cost. Build: ✓ 563ms.

---

[LOG — 2026-05-19 — AGENT_CARDS Phase 3 — job disambiguation card]
- Action: AGENT_CARDS_ARC Phase 3 shipped. post-execution elicitor fires when get_jobs returns >1 match for a named search.
- Commits: fb02917 (Phase 3 implementation), + agentCards.js formatCardAnswers fix (this session)

What changed in ai-master-agent/index.ts:
  - POST_EXECUTE_ELICIT registry added: get_jobs entry fires when search param present AND result.jobs.length > 1.
    Returns select card listing address — client_name — status for each match + "None of these" (value: __none__) as final option.
    Loop guard: returns null when no search param (browsing) or 0-1 matches.
  - get_jobs tool schema: added search param (ILIKE on address + client_name via .or()). Executor applies filter when search present.
  - Tool execution loop: post-execution check added after executeTool returns, before toolResults.push. If POST_EXECUTE_ELICIT fires → return early with pending_card (does NOT push tool_result, no orphaned tool_use blocks in history).
  - System prompt HOW TO BEHAVE: "If you need a job ID and the user named a specific job, call get_jobs with search=<the name or address fragment>. A disambiguation card surfaces automatically when multiple matches are found — don't ask in text."

What changed in avenstone-vite/src/lib/agentCards.js:
  - formatCardAnswers: select answers now include (value: X) when label ≠ value.
    Example: "456 Test Flow Ave... (value: ebe370cf-...)" — gives Claude the UUID directly in conversation history.
    Without this fix: Claude couldn't extract job_id UUID from the label text and either invented a UUID or called get_jobs again.
    Also applies to receipt type: "Fuel (value: fuel)" — unambiguous even if Claude can't infer the enum key from label alone.
    Same fix applied to radio_per_item items.

Disambiguation flow:
  "Log receipt on Test Flow job" → get_jobs(search="Test Flow") → 2 results → POST_EXECUTE_ELICIT fires → select card with 2 options + None of these.
  User picks → formatCardAnswers produces "[label] (value: [UUID])" → card_response → runAgentLoop sees UUID → calls log_receipt(job_id=ebe370cf-...) → ELICIT_TOOLS fires receipt card (type absent) → user selects fuel → confirm card → row written.

Smoke tests verified 2026-05-19:
  Chained flow: disambiguation card → receipt card → confirm → DB row confirmed:
    id=f5276673-1315-4804-84de-9a2804445d96, job_id=ebe370cf-76cc-4912-aaf1-d2d2d0eee413, type=fuel, amount=120.00, direction=out
  None of these: → text clarification "Could you give me a bit more detail about the job?", no write, no crash.
  Single match ("123 Test Flow"): → no disambiguation card, receipt type card fired directly. PASS.

Trade-aware: platform-level agent surface, tenant/trade-agnostic. No DB changes. Build: ✓ 583ms.

---

[LOG — 2026-05-19 — AGENT_CARDS Phase 4 — generic missing-field validator]
- Action: AGENT_CARDS_ARC Phase 4 shipped. Generalized pre-execution elicitation. Phase 2's bespoke ELICIT_TOOLS absorbed into a single registry-driven mechanism. Every write tool now declares its required fields; one async validator emits ONE form-shape card per call collecting all gaps. text question type added.
- Commits: af2c9ba (text question type), 697cbed (Phase 4 validator).

What changed in ai-master-agent/index.ts:
  - REQUIRED_FIELDS registry (12 write tools): log_payment, log_receipt, submit_change_order, add_todo, create_job, add_contact, send_client_portal, invite_person, add_note, advance_phase, notify_team, add_knowledge.
    Skipped: update_job, update_phase (technical-ID + object-payload only — model gets these from prior tool calls).
  - FieldSpec type: { field, type: 'select'|'text', label, options? | dynamic_options }.
  - dynamic_options='active_jobs' marker: validator runs ONE jobs query (status NOT IN complete/on_hold, limit 50) and populates options with { value: id, label: 'address — client — status' } — same shape as Phase 3 disambiguation.
  - validateRequiredFields(sb, tenantId, toolName, input): filters missing fields via isMissing (undefined/null/empty-trim), bails to null if none. Emits PendingCard with one question per gap.
  - Tool execution loop: ELICIT_TOOLS lookup replaced with REQUIRED_FIELDS in REQUIRED_FIELDS + validateRequiredFields call. Same pre-confirm slot (before CONFIRM_TOOLS, before executor).
  - Loop guard: REQUIRED_FIELDS filter returns null when every required field present → falls through to CONFIRM_TOOLS normally.

What changed in agentCards.js + MasterAgent.jsx (commit af2c9ba):
  - CARD_QUESTION_TYPES: added 'text'.
  - formatCardAnswers: text emits "label: value" line.
  - validatePendingCard: text questions skip the options-required check.
  - AgentCard renderer: single-line input for text (16px to suppress iOS auto-zoom). isComplete requires non-empty trimmed string.

System prompt changes:
  - HOW TO BEHAVE: removed "If the user's freeform message lacks fields the tool requires, ask one clarifying question" — replaced with "call the tool with whatever fields you have; the system surfaces a missing-field card automatically".
  - RECEIPT FROM PHOTO + log_receipt.type description: updated to reference "missing-field card" generically (was "category card").

Ordering — three elicitation mechanisms confirmed in order:
  1. PRE-execute (this phase): REQUIRED_FIELDS via validateRequiredFields. Fires when any required field missing/empty.
  2. CONFIRM_TOOLS: pending_action surface for the 5 confirm-gated write verbs.
  3. POST-execute (Phase 3): POST_EXECUTE_ELICIT runs after executor; currently only get_jobs disambiguation. UNTOUCHED by Phase 4.

Smoke tests verified 2026-05-19:
  T1 "log a receipt" → 3-question card (amount text, job_id select [4 active jobs], type select [9]) → fill amount=85, job=test-flow-001, type=fuel → confirm card → DB row: id=175b8cda-048a-4ba7-a9e8-079c734281b4, job_id=test-flow-001, type=fuel, amount=85.00, direction=out. PASS.
  T2 "add a todo" → 1-question card (title text only). PASS.
  T3 "Log a $45 fuel receipt from QuikTrip on the 123 Test Flow job" → no card, straight to confirm with all fields including model-inferred description. PASS — regression: no false-card-fires when fields present.
  T4 "Log a $30 receipt from XYZ Supply on the 123 Test Flow job" → card asks ONLY for type (only partial gap fires only that question). PASS.
  T5 "Log a $25 fuel receipt from Casey's on the Test Flow job" → Phase 3 disambiguation card still fires (3 options + __none__). PASS — Phase 3 post-execution path untouched.

Trade-aware: platform-level agent surface; REQUIRED_FIELDS registry is tenant- and trade-agnostic. The active-jobs query scopes by tenant_id via the service-role client. Role-based options (invite_person.role) are platform-defined values, not tenant config. No DB changes. Build: ✓ 583ms.

---

[LOG — 2026-05-19 — AGENT_CARDS Phase 5 — gate resolution card. v1 arc COMPLETE.]
- Action: AGENT_CARDS_ARC Phase 5 shipped. advance_phase gate failures now surface a card flow instead of relayed-in-text errors. Override is structured (select + optional detail), never the default. Two-card flow (Card A: action; Card B: override reason) plumbed through a new pending_card.meta echo channel that avoids round-tripping through Claude on deterministic steps.
- Commits: fd92fbc (meta channel), 93dc605 (Phase 5 flow), 9bf8ad4 (move hook to POST_EXECUTE_ELICIT).

Audit findings worth keeping:
  - advance_phase override columns live on `jobs` (NOT job_phases). Per 20260506180000 migration ARCHITECTURE NOTE: jobs.status IS the lifecycle phase tracker; job_phases rows are TRADE phases (separate system). The arc prompt mentioned "(on job_phases?)" — answered: jobs.
  - advance_phase is NOT in CONFIRM_TOOLS. Initial Phase 5 attempt put the hook in the confirmed:true branch (dead code — that branch never reached for advance_phase). Moved to POST_EXECUTE_ELICIT, matches the Phase 3 disambiguation pattern exactly.
  - ELICIT_TOOLS dead-code: confirmed only comment references remain (lines 141, 279). The object was cleanly removed in Phase 4. No cleanup needed.

What changed in ai-master-agent/index.ts:
  - PendingCard: added optional `meta?: Record<string, unknown>` field. Server stamps context; client echoes back in card_response.
  - CardQuestion: added optional `optional?: boolean` flag. AgentCard isComplete skips optional questions.
  - GATE_OVERRIDE_REASONS: 4 select options (work_done_not_marked, schedule_changed, client_decision, other).
  - buildGateResolutionCardA(jobId, currentPhase, nextPhase, failing_gates): Card A with 3 actions — redirect_schedule, leave_open, override (LAST). Prompt lists failing gates. meta.kind='gate_resolution'.
  - buildGateOverrideCardB(jobId, currentPhase, nextPhase): Card B with reason select + optional detail text. meta.kind='gate_override'.
  - POST_EXECUTE_ELICIT.advance_phase: fires when result.requires_override===true. Reverse-looks PHASE_LABELS to recover raw phase keys for meta. Returns Card A.
  - card_response handler: dispatches BEFORE runAgentLoop on meta.kind:
      - 'gate_resolution' → text turn (redirect_schedule / leave_open) OR Card B (override). No Claude round-trip.
      - 'gate_override' → combines reason label + (optional) detail into "Label — Detail" string, calls executeTool('advance_phase', { job_id, override_reason }) directly. No Claude round-trip.
  - System prompt: "For advance_phase: if gates fail and the user did not give an override reason, do NOT pass override_reason. The tool result will list failing gates; relay them and ask if the user wants to override." → updated to "the card IS the prompt" — model no longer asks in text.

Client changes:
  - agentCards.js: JSDoc documents meta + optional flag. validatePendingCard accepts meta when present.
  - MasterAgent.jsx submitCard: echoes pending card's meta in card_response. AgentCard.isComplete skips q.optional.

Three elicitation mechanisms now in place:
  1. PRE-execute (Phase 4): REQUIRED_FIELDS missing-field card.
  2. CONFIRM_TOOLS: pending_action confirm card (money verbs).
  3. POST-execute (Phase 3 + 5): POST_EXECUTE_ELICIT — get_jobs disambiguation + advance_phase gate resolution.

Smoke tests verified 2026-05-19 (test-flow-001, two scheduled sub_starts as blocking items):
  T1 override path: gates fail → Card A (3 opts, override LAST) → pick Override → Card B (reason+optional detail) → pick "schedule_changed" + type "Client moved final touches up two weeks" → executor runs.
    Row: status=final_touches, phase_override_used=true, phase_override_reason="Schedule changed — Client moved final touches up two weeks", phase_override_by_id=53dc982e-93a5-4220-9c52-422f0151e4ad, phase_override_at=2026-05-19T21:07:39Z. PASS.
  T2 leave_open: Card A → pick "Leave the phase open" → text turn, status still in_progress, no stamp. PASS.
  T3 redirect_schedule: Card A → pick "Open the Schedule tab" → text turn mentioning Schedule, status still in_progress. PASS.
  T4 gates pass (both sub_starts marked complete): no Card A, direct advance to final_touches, phase_override_used=false. PASS.
  T5 regressions: Phase 4 missing-field card still fires for "log a receipt"; Phase 3 disambiguation still fires for ambiguous "Test Flow" with __none__ option. PASS.

v1 arc complete. Phase 6 (field voice rendering of cards — "say one of: A, B, C" grammar matching) deferred until VOICE_AGENT Phase 3 (native iOS STT hands-free) ships.

Trade-aware: platform-level — Card A actions, Card B reasons, and the override stamp are all tenant/trade-agnostic. The card text references phase labels from PHASE_LABELS (lifecycle), not trade phases. No DB changes. Build: ✓ pass after each commit.

---

[LOG — 2026-05-19 — ai-master-agent stale read-tool cleanup]
- Action: Removed get_job_details and get_dashboard from the ai-master-agent tool registry after re-verification. Tool count: 18 → 16. Reads: 4 → 2.
- Commit: 0360f88

Prior label resolved: voice-agent-audit-2026-05-08's "~13 out-of-v1 tools" was a rough count of everything beyond CONFIRM_TOOLS (5), not a curated remove-list. The 2026-05-17 follow-up audit found no actual removals (and fixed a phantom-table bug in get_dashboard). This slice re-verified post-AGENT_CARDS and found 2 read tools genuinely unmoored from the v1 surface.

Read-tool audit:
  - get_jobs — KEEP. POST_EXECUTE_ELICIT (Phase 3 disambiguation). System prompt references for job-ID lookup + log_receipt PO match.
  - get_team — KEEP. System prompt: "If you need a sub ID, call get_team first." Implicit consumer of add_todo.assigned_to_user_id and notify_team.user_id.
  - get_job_details — REMOVED. No card-flow reference (REQUIRED_FIELDS / CONFIRM_TOOLS / POST_EXECUTE_ELICIT). No system-prompt reference. Comprehensive job snapshot is a general-query feature; v1 chat is verb-focused, and job-detail screens already serve this in the UI.
  - get_dashboard — REMOVED. No card-flow reference. No system-prompt reference. Morning-brief snapshot is already served by TodayScr UI directly. The phantom-table bug fixed 2026-05-17 was cosmetic — tool was active code path but unmoored from any v1 verb.

Write-tool audit (sanity): all 14 write tools appear in REQUIRED_FIELDS or CONFIRM_TOOLS (Phase 4 registry) — none stale. No write removals.

What changed in ai-master-agent/index.ts:
  - TOOLS array: get_job_details, get_dashboard entries removed.
  - Executor switch: get_job_details + get_dashboard cases removed.
  - System prompt WHAT YOU CAN DO line: "Read: jobs, team, dashboard snapshot, job details" → "Read: jobs, team". Drift-free.

External references check: only mentions outside the registry/executor were in CLAUDE_MEMORY.md + CLAUDE_ARCHIVE.md historical LOGs. No code path elsewhere invokes these tools. (ai-master-agent uses its own inline SB queries — no shared helpers in supabase.js were orphaned by this change.)

Orphan helpers: NONE. ai-master-agent writes its own SB queries per-case; no shared helper file was consumed by the removed tools. No helper sweep needed.

Smoke tests verified 2026-05-19 (post-deploy):
  T1 receipt card flow: "Log a $42 fuel receipt from QuikTrip on the 123 Test Flow job" → pending_action confirm → confirmed → row id=dea6dbc6 (log_receipt). PASS.
  T2 get_jobs lookup: "Log a $10 fuel receipt from Casey's on the Test Flow job" → Phase 3 disambiguation card fires with 3 opts incl __none__. PASS.
  T3 add_note write: "add a note on the 123 Test Flow job" → auto-applies (not in CONFIRM_TOOLS), row written id=97780bff. PASS.
  T4 graceful degradation: "what needs my attention today?" — model previously would have called get_dashboard; now calls get_jobs + get_team and synthesizes the answer from there. No error, response composed normally. PASS.

Build: ✓ 611ms. Tool count confirmed 16 via grep of name: pattern. Trade-aware: platform-level cleanup, tenant- and trade-agnostic. No DB changes.

---

[LOG — 2026-05-19 — Write-side drift scanner: skipped 9 → 0]
- Action: Resolved all 9 write-side skipped call sites in tools/audit_schema_vs_code.js.
- Fix 1 (8 sites): Added `binding.kind === 'param'` early return in resolveIdentifierColumns — function parameters have no init node; marked partial:true, resolved:true instead of falling through to "init type none". Commit: 23753a0.
- Fix 2 (1 site): Refactored sbUpdateScanOverrides from dynamic .from(table) to explicit if/else branches with static string literals (job_lidar_scans / contact_lidar_scans). Runtime behavior identical. Commit: 48b09dc.
- Files: tools/audit_schema_vs_code.js, avenstone-vite/src/lib/supabase.js
- Result: write skipped 9 → 0. Write drift unchanged at 0.

[LOG — 2026-05-19 — Edge fn missing-tables: 4 findings → 1 STOP]
- Action: Investigated 4 phantom-table findings from read-side scanner's edge-function bucket. Fixed 3, STOP on 1.
- bid_responses (sequence-runner): NEVER-CREATED. Renamed to job_sub_engagements + bid_submitted_at. Commit: 2651fea.
- job_subs (ai-companion, ai-project-manager): DROPPED. Renamed to job_sub_engagements with !sub_id FK hint (table has 5 FKs to profiles). Commits: 821b02d (job_subs rename), 93cd697 (schedule_phases across 4 edge fns).
- schedule_phases (ai-companion, ai-project-manager, ai-home-companion, ai-pm-nightly): NEVER-CREATED. Real table is job_phases. Renamed + order_index → phase_order + p.name → p.phase_name in templates.
- quote_requests in ai-pm-nightly: STOP. Used in rules 9/10/11 with embedded bid_responses. Substantive remapping to job_sub_engagements + engagement_bids. ai-pm-nightly is DISABLED — deferred to re-enable slice.
- Files: supabase/functions/sequence-runner/index.ts, supabase/functions/ai-companion/index.ts, supabase/functions/ai-project-manager/index.ts, supabase/functions/ai-home-companion/index.ts, supabase/functions/ai-pm-nightly/index.ts
- Scanner missing-tables: 4 → 1 (quote_requests in disabled ai-pm-nightly only).

[LOG — 2026-05-19 — phase name canonical alignment: title-case 10-phase model]
- Action: Aligned code-side phase constants and lookups to canonical DB model (title case, 10 phases). Restored derivePhaseStatus and ScheduleTab phase progress bar to functional state.
- Commits: 7a34350 (supabase.js), 211341c (ScheduleTab.jsx). Pushed to main.
- Build: ✓ 808ms.

Consumer audit (2 files, 1 non-trivial — within scope fence):
  ScheduleTab.jsx:8-9 — PHASE_ORDER was ['demo','framing','rough_mep','drywall','finish','punch'] (6 lowercase). Updated to ['Demo','Framing','Rough MEP','Insulation','Drywall','Paint','Flooring','Trim','Fixtures','Punch List'] (10 title-case). Removed PHASE_LABELS (redundant — title-case names are display-ready). Display line updated to ph.phase_name directly.
  supabase.js:2022 — phaseToTrades keyed by trade_phase_map.phase_name (lowercase: demo, framing, rough_mep, drywall, finish). Added JOB_PHASE_TO_TMAP constant bridging title-case job_phases.phase_name → lowercase tmap key. Lookup changed from phaseToTrades[phase.phase_name] to phaseToTrades[JOB_PHASE_TO_TMAP[phase.phase_name]].

JOB_PHASE_TO_TMAP design decisions:
  - Demo→demo, Framing→framing, Rough MEP→rough_mep, Drywall→drywall: 1:1 mappings
  - Paint/Flooring/Trim/Fixtures→finish: all 4 map to 'finish' tmap key. Any finish trade completing (Paint - Interior, Tile - Floor, Tile - Wall/shower, Cabinets/vanities - Install) advances all 4 job_phases rows simultaneously. Limitation of current trade_phase_map schema — no DB changes.
  - Insulation, Punch List: no tmap entry → null → never auto-advance. Manually advanced only.

Out-of-scope findings flagged (separate bugs, NOT fixed):
  - Reports.jsx:68 — ['signed','demo','framing','rough_mep','drywall','finish','punch'].includes(j.status): uses legacy jobs.status values (old lifecycle names). Canonical statuses are now: lead, proposal, contract, in_progress, final_touches, complete. This filter always returns 0 jobs for pending commissions.
  - ClientPortal.jsx:505,552 and InfoTab.jsx:141 — ['complete','punch'].includes(job.status): 'punch' is a legacy jobs.status value. Should be ['complete','final_touches'].

Smoke test — derivePhaseStatus end-to-end (test-flow-001):
  Before: Demo=not_started, Drywall=not_started (all 10 phases)
  Inserted schedule_item: type='sub_start', trade='Demo', status='complete'
  Existing item: trade='Drywall - Hang', status='scheduled', scheduled_date='2026-05-06' (overdue)
  After derivePhaseStatus: Demo=complete, Drywall=in_progress — CORRECT
  Cleanup: test item deleted, phases reset to not_started.

ScheduleTab verification:
  orderedPhases.length: 10 (was 0 before fix). Phase progress bar now renders all 10 phases.
  PILL_COLOR unchanged — not_started/in_progress/complete/blocked colors apply correctly.

jobs.phase_pct_complete note: dead stored column — trigger maintains it, nothing reads it. Out of scope per prior audit. Separate cleanup when and if the column is ever wired to a consumer.

[LOG — 2026-05-19 — phase_pct_complete rollup audit — STOP findings, no fixes]
- Action: Audited phase_pct_complete rollup for data correctness. All findings are STOP — no commits made.
- Sample: test-flow-001 (only job with job_phases rows). All 10 phases = not_started. 0 sub_start schedule items.
  Stored pct: 0% = Recomputed: 0% — CLEAN numerically but structurally broken.

Rollup mechanisms identified:
  1. DB trigger update_job_phase_pct (AFTER INSERT/UPDATE/DELETE on job_phases): maintains jobs.phase_pct_complete. Formula: ROUND((done/total)*100). ORPHANED — no frontend or edge fn ever reads jobs.phase_pct_complete.
  2. derivePhaseStatus (supabase.js:1975): JS function updates job_phases.status from sub_start schedule items. Called from sbCreate/Update/DeleteScheduleItem. COMPLETELY NON-FUNCTIONAL — see naming mismatch below.
  3. ScheduleTab phase progress bar: colored pills derived from orderedPhases. ALWAYS HIDDEN — see naming mismatch below.
  4. StatusPage (client portal): inline done/total*100 from get-job-status edge fn response (remaps phase_name→name). Not gated on naming convention — still functional but shows 0 phases because nothing can advance.

CRITICAL FINDING — Naming convention mismatch (STOP):
  - trade_phase_map.phase_name (DB): lowercase snake_case — demo, framing, rough_mep, drywall, finish, punch (6 condensed)
  - ScheduleTab PHASE_ORDER (code): lowercase snake_case — ['demo', 'framing', 'rough_mep', 'drywall', 'finish', 'punch'] (matches trade_phase_map)
  - job_phases.phase_name (DB, test-flow-001): title case, 10 granular — Demo, Framing, Rough MEP, Insulation, Drywall, Paint, Flooring, Trim, Fixtures, Punch List (matches DEFAULT_PHASES)
  - DEFAULT_PHASES in supabase.js (line 277): title case, 10 phases — DEFINED BUT NEVER IMPORTED ANYWHERE

Consequences:
  - ScheduleTab: phaseMap['demo'] = undefined (DB has 'Demo') → orderedPhases = [] → section guarded by {orderedPhases.length > 0} never renders
  - derivePhaseStatus: phaseToTrades['Demo'] = undefined (trade_phase_map has 'demo') → all if (!trades?.length) continue → phases never advance

Decision needed: which naming convention is canonical?
  Option A (6 lowercase — RECOMMENDED): migrate job_phases.phase_name values (Demo→demo etc.), delete DEFAULT_PHASES dead export. Code already correct for this side.
  Option B (10 title case): update PHASE_ORDER/PHASE_LABELS/trade_phase_map to title-case + expand to 10. More DB changes.
- Files: (read-only audit) supabase.js, ScheduleTab.jsx, StatusPage.jsx, get-job-status/index.ts, phaseGates.js
- No commits. Open: schema decision required before any fix.

---

[LOG — 2026-05-19 — ai-master-agent drift detector: tools/audit_master_agent.js]
- Action: Built and ran a standalone tool-schema-vs-payload drift detector for ai-master-agent. 4 checks. npm run audit:master-agent. Exit 0 = clean; exit 1 = real drift; exit 2 = parse error.
- Commits: pending (tools/audit_master_agent.js + package.json).
- Detector checks:
  1. REQUIRED_FIELDS ↔ schema: each field in REQUIRED_FIELDS exists in tool's schema.properties → PASS
  2. Schema → executor (dead params): all schema properties read by executor case → PASS
  3. Executor → schema (undeclared reads): executor reads not in schema → 2 informational notes (image_data, image_mime on log_receipt — server-injected after schema validation, intentional)
  4. Registry → TOOLS: CONFIRM_TOOLS + POST_EXECUTE_ELICIT names exist in TOOLS → PASS
- Run output: 0 real drift findings. 2 informational notes (not real drift). Tool counts confirmed: 16 TOOLS, 12 REQUIRED_FIELDS tools, 5 CONFIRM_TOOLS, 2 POST_EXECUTE_ELICIT, 16 executor cases.
- Implementation: Babel AST parse (plugins: ['typescript']) — same @babel/parser + @babel/traverse already in avenstone-vite devDependencies. requireFromVite pattern borrowed from audit_schema_vs_code.js. MemberExpression walk extracts input.X reads per switch case. Tools: tools/audit_master_agent.js. npm script: "audit:master-agent": "node ../tools/audit_master_agent.js".
- Trade-aware: detector is dev tooling — no tenant/trade assumptions.

---

[LOG — 2026-05-19 — write-side drift scanner: 9 skipped call sites reduced to 0]
- Action: Extended tools/audit_schema_vs_code.js to handle function-parameter bindings; refactored sbUpdateScanOverrides to use static table names. Write skipped: 9 → 0.
- Commits: 23753a0 (scanner param fix), 48b09dc (supabase.js refactor).
- Root causes of all 9 skipped sites:
  - Sites 1-5, 7-9 (8 sites): Babel binding.kind==='param' — function parameters have no init node so the resolver fell through to "init type none". One-line early return: `if (binding.kind === 'param') return { keys: [], partial: true, resolved: true };`. Marks each as partial (column-check suppressed, no false potential findings) rather than opaque.
  - Site 6 (sbUpdateScanOverrides): dynamic `.from(table)` where table=ternary variable. Refactored to explicit if/else branches with static string literals 'job_lidar_scans' / 'contact_lidar_scans'.
- Scanner change: resolveIdentifierColumns in audit_schema_vs_code.js — 4-line insertion after the !binding check.
- Supabase change: sbUpdateScanOverrides in avenstone-vite/src/lib/supabase.js — runtime behavior identical, just static table names.
- Final scan output: write drift 0, read drift 0, potential 13, missing tables 4, write skipped 0, read skipped 34, parse errors 0. Exit 1 from missing-tables (pre-existing, not this slice).
- All 9 sites confirmed safe — no actual drift hidden. The 8 param sites write call-site-determined objects (pass-through update helpers); the 1 dynamic-table site had a known-good inline payload { edit_overrides: editOverrides }.

---

[LOG — 2026-05-19 — edge function missing-tables resolution: 4 findings → 1 STOP]
- Action: Investigated and fixed 3 of 4 missing-table findings from the read-side scanner. One finding STOPped and surfaced.
- Commits: 2651fea (sequence-runner), 821b02d (ai-companion + ai-project-manager), 93cd697 (schedule_phases × 4 fns). All 3 deployed successfully (GitHub Actions confirmed success).

Classifications:
  1. bid_responses (sequence-runner:50) — NEVER-CREATED. Sub engagement system landed as job_sub_engagements (has sub_id + bid_submitted_at, not a bid_responses table). The sub_inactive_60d logic was silently treating every sub as having no bid history (phantom table → always null). Fix: job_sub_engagements, bid_submitted_at.
  2. job_subs (ai-companion:296, ai-project-manager:94) — DROPPED in sub-engagement arc 2026-05-05. Replaced by job_sub_engagements. Both functions silently showed "None assigned" for subs. Fix: job_sub_engagements + profiles!sub_id FK hint (disambiguates among 5 FKs: sub_id, invited_by_id, activated_by_id, completed_by_id, terminated_by_id — constraint job_sub_engagements_sub_id_fkey confirmed).
  3. schedule_phases (ai-home-companion:171, ai-companion:295, ai-project-manager:92, ai-pm-nightly:70) — NEVER-CREATED. job_phases is the real table (schedule-rebuild arc, 2026-05-02). All 4 functions returned empty phases. Fixes: table rename, order_index→phase_order, p.name→p.phase_name in templates (ai-home-companion + ai-companion + ai-project-manager; ai-pm-nightly already used ph.phase_name correctly).
  4. quote_requests (ai-pm-nightly:76, also embeds bid_responses relational select) — DROPPED in sub-engagement arc. STOP — 3 alert rules (9: bid_award_no_contract, 10: itb_no_responses_due_soon, 11: itb_award_pending) depend on it with substantive logic; remapping to job_sub_engagements + engagement_bids requires understanding the new engagement status machine. ai-pm-nightly is currently DISABLED so this is non-urgent — no production impact. Separate slice required when ai-pm-nightly is re-enabled.

Scanner final state: missing tables 4 → 1 (quote_requests only, ai-pm-nightly disabled). Write drift 0, read drift 0, write skipped 0.
Smoke verification: all 3 deploy runs = success. FK constraint verified via information_schema. User-auth smoke test not possible from this session (no JWT); functions were already broken (returning null) before fix — net change is improvement, not regression.

---

[LOG — 2026-05-19 — legacy jobs.status value cleanup: 5 sites across 4 files]
- Action: Replaced all legacy jobs.status lifecycle values in frontend code with canonical values from jobs_status_canonical_check (migration 20260506200000). All DIRECT-RENAME. Build ✓ 641ms.
- Commits: 75606ab, 987dc6a, 3f28f9d. All pushed to main.

Sites fixed (all DIRECT-RENAME):
  1. ClientPortal.jsx:505 — `['complete', 'punch']` → `['complete', 'final_touches']`
     Context: gates client review panel (show existing review or review form). Was invisible for any job in final_touches status.
  2. ClientPortal.jsx:552 — `['complete', 'punch']` → `['complete', 'final_touches']`
     Context: gates "Rate Our Team" sub-rating panel. Same silent failure.
  3. InfoTab.jsx:141 — `['complete', 'punch']` → `['complete', 'final_touches']`
     Context: gates "Completion Sign-off" button for owner/pm/rep. Was invisible on final_touches jobs.
  4. Reports.jsx:68 — `['signed','demo','framing','rough_mep','drywall','finish','punch']` → `['contract','in_progress','final_touches']`
     Context: myCommPending filter for dollar-based commission reps. Old array was 7 construction-phase values that replaced jobs.status in v1 lifecycle. Filter returned 0 for all current-lifecycle jobs → pending commission always showed $0.
  5. DashScr.jsx:11 (additional grep find) — `j.status === 'signed'` → `j.status === 'contract'`
     Context: "Signed This Month" dashboard stat. `signed` was the old name for `contract`. Stat showed 0 for all current jobs.

No SEMANTIC-DRIFT findings. No VESTIGIAL findings (all 5 are actively rendered UI logic that should work).

Grep sweep findings (NOT jobs.status — confirmed safe):
  - `active` in SequencesScr/ConsultationTab/SubPortal/SubsTab/InfoTab/scheduleAutoCreate: all are job_sub_engagements.status, sequences.status, or consultation_sessions.status — separate tables, unaffected by jobs_status_canonical_check.
  - `active` boolean column in supabase.js/takeoff.js/ScopeTab: DB boolean column, not jobs.status.
  - `demo/framing/finish` in supabase.js:1984-1992: JOB_PHASE_TO_TMAP values — trade_phase_map.phase_name keys, not jobs.status.

Smoke code-trace:
  - ClientPortal: `final_touches` is a valid canonical status → gate will open for jobs approaching completion. Review/rate-team panels now visible on final_touches jobs.
  - InfoTab: Same — sign-off button now visible on final_touches jobs (staff side).
  - Reports: `['contract','in_progress','final_touches']` correctly captures all contracted-but-not-complete jobs. Dollar commission pending now reflects actual in-flight work.
  - DashScr: `contract` status count matches jobs that have a signed contract and haven't started work yet. "Signed This Month" stat now non-zero for current-lifecycle jobs.

---

[LOG — 2026-05-19 — TTS repetition fix + voice picker]
- Action: Fixed double-amount readback on pending_action confirms. Added voice selection in Settings (Voice tab). Wire voice_id into all ttsSpeak calls.
- Commits: 9ae58d8 (MasterAgent repetition fix + voice selection logic), 7327fb2 (Settings voice picker). Both pushed to main.
- Build: ✓ 560ms, ✓ 576ms.

Repetition root cause:
  `ttsSpeak(aiText, pendingAction.description)` queued two speak() calls when pendingAction was present:
  1. `aiText` — agent's conversational response, e.g. "I'll log a payment of $2,500 from the client…"
  2. `pendingAction.description` — canonical card readback with amountToWords, e.g. "Payment from client: $2,500 (two thousand five hundred dollars)"
  Amount spoken twice in a row.

Repetition fix (MasterAgent.jsx call site):
  `ttsSpeak(null, pendingAction.description)` — null primary → `normalizeTtsText(null)` → '' → falsy → skipped.
  Only the card description (secondary) is spoken. Agent response text still visible on screen.

Voice selection (MasterAgent.jsx):
  - Module-level `getStoredVoiceUri()` — reads `av_tts_voice_uri` from localStorage (fresh on every speak).
  - Module-level `pickVoiceIndex(voices, storedUri)` — finds index in full getSupportedVoices() array:
    1. Match by voiceURI if stored (user preference)
    2. Fallback: Enhanced/Premium en-US (/(enhanced|premium)/i test on name)
    3. Fallback: any en-US
    4. Fallback: any en-*
    5. Returns undefined if no English voice → plugin picks device default
  - `voicesCacheRef` — lazy-loads full voices array on first ttsSpeak call, cached for session.
  - `ttsSpeak`: loads cache, calls pickVoiceIndex, spreads `{ voice: voiceIdx }` into each speak() call.

Voice persistence key: `av_tts_voice_uri` (voiceURI string — stable across iOS updates, unlike index which can shift).
Voice param in speak(): `voice` is the INDEX into the full getSupportedVoices() array (number). Must use originalIndex from full array, not filtered-English index.

Settings Voice tab (SettingsModal.jsx):
  - New 'voice' tab visible to all roles, placed after Security before owner tabs.
  - Loads `getSupportedVoices()` when tab activates (fresh load each open — catches newly downloaded voices).
  - Displays: English voices only (lang.startsWith('en')), each row shows name + lang tag.
  - Test button: speaks "Logging twenty five hundred dollars, confirm?" in that voice. Disables during playback (testingVoice state).
  - Selection: click row → sets selectedVoiceUri state + writes voiceURI to localStorage immediately.
  - Empty state: iOS Settings → Accessibility → Spoken Content → Voices guidance.

On-device verification required (Codemagic build → TestFlight):
  - Money confirm: amount spoken ONCE (card readback only), not twice.
  - Settings → Voice: English voices list loads. Test button speaks in each voice.
  - Pick a voice → agent uses it on next confirm.
  - Kill/reopen → voice persists.
  - Fresh install → fallback Enhanced en-US plays (no silent failure).

---

[LOG — 2026-05-19 — Voice-confirm for pending_action cards (VOICE_AGENT decision #7)]
- Action: Implemented auto voice-confirm on pending_action confirm cards. After TTS reads the money readback, mic auto-opens for a 5s listen window. Strict grammar match → confirm or cancel. Timeout/no-match closes silently. Tap still works.
- Commit: 932a0c2. VOICE_AGENT.md updated (decision #7 marked implemented + Phase 4.5 status line).
- Build: ✓ 592ms.

What changed in MasterAgent.jsx:
  - Grammar constants at module level: VC_AFFIRMATIVE (yes/yeah/yep/confirm/do it/go ahead/sure/ok/okay), VC_NEGATIVE (no/nope/cancel/don't/stop).
  - 4 new state/refs: vcListening (boolean — drives listening pill), vcTimerRef (5s timeout), vcListenersRef (STT listener handles), vcPendingRef (holds action for STT callback — bypasses closure staleness).
  - stopVoiceConfirm(): clears timer, removes listeners, nulls vcPendingRef, sets vcListening=false, stops STT.
  - ttsSpeak refactored async: was fire-and-forget; now awaits each speak() call sequentially so the returned Promise resolves only after all speech completes.
  - startVoiceConfirm(action): 500ms cooldown → if vcPendingRef still set → setVcListening(true) → addListener('partialResults', ...) → SpeechRecognition.start() → 5s timeout. STT callback: strict grammar match → stopVoiceConfirm() + direct state calls (setPendingConfirm null + setMessages + callMaster/setMessages).
  - Call site (post-callMaster): if pendingAction + ttsEnabled → vcPendingRef set + ttsSpeak().then(() => startVoiceConfirm(pendingAction)) — fire-and-forget chain (loading=false doesn't wait on TTS). Non-confirm path: ttsSpeak(aiText, null) as before.
  - sendMessage: added stopVoiceConfirm() alongside existing TextToSpeech.stop().
  - Confirm/Cancel buttons: onClick now calls stopVoiceConfirm() before confirmPending/cancelPending so tap during voice-listen stops the mic cleanly.
  - Listening pill: "Listening… say yes or no" with bouncing dot shown on pendingConfirm card when vcListening.
  - Cleanup effect: vcListenersRef + vcTimerRef added to unmount cleanup.

Design notes:
  - vcPendingRef avoids React closure staleness: STT callback reads from ref, not closure. confirmPending/cancelPending replaced by direct state calls from the callback.
  - Activation gate: pendingAction present + ttsEnabled + micAvailable. All three must be true.
  - Guard: vcPendingRef checked after 500ms cooldown (user may have tapped during cooldown — guard clears cleanly).
  - Scope fence: voice-confirm only for CONFIRM_TOOLS (pending_action). Not for pending_card (AgentCard form cards).

Verification: device test required after Codemagic build → TestFlight.
  Test: trigger a money confirm card → TTS reads → mic opens → say "yes" → confirmed. Also: say "no" → cancelled. Also: timeout (say nothing) → closes, tap still works.
