---
# Avenstone App — Working Memory
_Two-file split established 2026-05-03. This file = lean working memory. Full LOG history → CLAUDE_ARCHIVE.md (retrieve by slug `##` heading)._

On session start: read this file top-to-bottom. Append a [LOG] at the end when a feature ships, a bug is fixed, or an architecture decision is made. When a LOG is no longer actively relevant, move content to CLAUDE_ARCHIVE.md under a new slug and add pointer to the index below.

---

## Current state (2026-05-03)

- **Repo:** github.com/avenstonekc/avenstone-app
- **Web:** Vercel auto-deploy on push to main
- **iOS:** Codemagic → TestFlight auto-deploy on push to main
- **Stack:** Vite + React 18, Supabase JS v2, Capacitor 8 (iOS)
- **Supabase URL:** https://cbfftukmhqvvjlrlnltk.supabase.co
- **Avenstone tenant ID:** 00000000-0000-0000-0000-000000000001
- **Kalin auth ID:** 8171742a-b586-4f13-be61-744e191a1896
- **Blake auth ID:** 066c8241-accb-490b-9f98-b8b7cb24c33b

**Migration apply method:** inline node `https` script with PAT embedded via shell `${PAT}` expansion.
PAT stored at `C:/Users/Kalin/supabase-token.txt`. Not curl. Not `process.env`.

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

---

## Financial locked decisions

- `job_transactions` is single source of truth for all money movement.
- `cost_plus` is visibility-only — no pricing logic changes.
- Lien waivers are warnings, not hard blocks.
- Commissions are transactions (`type='commission'`, `direction='out'`).

---

## Active open items

*Outstanding decisions or deferred work — do not assume resolved.*

**Sub portal & financial:**
- `submit-bid-response` returns 500 on concurrent double-submit instead of the spec'd 409 JSON `{ ok: false, error: 'Engagement state changed concurrently' }`. Behavior is correct (no double-bid created); response shape is wrong. Surfaced during 2026-05-06 smoke test edge case.
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

**Components:**
- `FloorPlanEditor.jsx` — built, UX decision outstanding before rewiring
- `MaterialSelectionScr.jsx` — built, landing surface decision outstanding

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

---


[LOG — 2026-05-03]
- Action: CLAUDE_MEMORY.md + CLAUDE_ARCHIVE.md two-file split established. All prior LOG content moved to CLAUDE_ARCHIVE.md under slugs.
- Action: ScheduleTab.jsx full rewrite — read-only phase pill bar (auto-derived), schedule items list grouped by week, ScheduleItemModal (6 types), soft-cancel with asymmetry warning dialog, derivePhaseStatus called on every save/cancel.
- Action: `sbNotifyScheduleItemCreated` + `sbNotifyScheduleItemChanged` added to supabase.js.
- Action: SubJobView.jsx schedule section — read-only items filtered to scheduled/in_progress; subs no longer mark phases directly.
- Action: `trade_phase_map.is_primary` column added. `derivePhaseStatus` now filters `.eq('is_primary', true)`. 10 primary trades set for Avenstone tenant.
- Action: Phase pill CSS regression fixed — `align-items: flex-start` on pill container + `inline-flex column` wrapper; empty state icon → 36×36 constrained span.
- Commits: 02958bf, 232b059, c5a7b02, d3dc509, 9bd03d8
- Contradictions found during reorganization (verbatim, not silently fixed):
  - C1: "TOMORROW START HERE" said Prompts B/C "not yet run". Actual: both shipped 2026-04-30.
  - C2: Active modules listed quality meter as active. Actual: removed 2026-04-26.
  - C3: Active modules/Remaining listed exterior AR scan as active. Actual: soft-ripped 2026-04-26.
  - C4: Remaining listed CO submission + sub phase-marking as "spec'd, not built". Actual: CO submission shipped 2026-04-26; sub phase-marking removed 2026-05-03.
  - C5: Open items said "Financial deprecated table drop (grace window expires 2026-05-07)". Actual: dropped 2026-05-02.
  - C6: END OF DAY SUMMARY "What did NOT ship" said Prompts B/C not done. Actual: both shipped 2026-04-30.

[LOG — 2026-05-03]
- Action: Archive build chunks 1-3 of 5 shipped (commits ec8f2c8, 82cc051, 543eb55). Slugs through 2026-04-28 now retrievable from CLAUDE_ARCHIVE.md.
- Action: Three future-architecture ideas captured under "Future architecture" subsection: RAG retrieval, sub management arc, speed/cost audit candidates.
- Open: Chunks 4-5 of archive build pending. Sub management steps 1-2 are quick-win candidates (40 lines total).
- Decision: Stopped at end of session. Resume tomorrow with chunks 4-5, then revisit prioritization.

[LOG — 2026-05-03]
- Action: Archive build chunks 1-3 of 5 shipped (commits ec8f2c8, 82cc051, 543eb55). Archive at 584 lines.
- Action: Five future-architecture ideas captured: RAG retrieval, sub management arc, speed/cost audit candidates, failed-attempts log, symptom index.
- Action: Symptom index seeded with 5 entries from this session's debug history.
- Open: Chunks 4-5 of archive build pending. Sub management steps 1-2 are quick-win candidates. Failed-attempts log + symptom index need ongoing discipline, not a one-time build.
- Decision: Stopped at end of session for sleep. Resume tomorrow with fresh brain on chunks 4-5, then revisit prioritization.

[LOG — 2026-05-03]
- Action: Archive build chunks 1-3 of 5 shipped. Archive at 584 lines.
- Action: Five future-architecture ideas captured: RAG retrieval, sub management arc, speed/cost candidates, failed-attempts log, CLAUDE_INDEX.md categorized lookup.
- Action: Symptom index seeded with 5 entries from this session's debug history.
- Action: OPUS_RULES updated with index discipline (separate commit).
- Open: Chunks 4-5 of archive build pending. CLAUDE_INDEX.md to be built after chunks land.
- Decision: Stopped at end of session for sleep.

[LOG — 2026-05-03]
- Action: Archive build chunks 1-3 of 5 shipped. Archive at 584 lines.
- Action: Five future-architecture ideas captured: RAG retrieval, sub management arc, speed/cost candidates, failed-attempts log, CLAUDE_INDEX.md categorized lookup.
- Action: Symptom index seeded with 5 entries from this session's debug history.
- Action: OPUS_RULES updated with index discipline (separate commit) — applies only when CLAUDE_INDEX.md exists.
- Action: Sales approach MD captured as future doc (commit a2bc82a).
- Open: Chunks 4-5 of archive build pending. CLAUDE_INDEX.md build deferred until friction justifies it.
- Decision: Stopped at end of session for sleep.

[LOG — 2026-05-04]
- Action: Archive build chunks 1-3 of 5 shipped. Archive at 584 lines.
- Action: Five future-architecture ideas captured.
- Action: Symptom index seeded with 5 entries from this session's debug history.
- Action: OPUS_RULES updated with archive + index discipline — applies only when CLAUDE_INDEX.md exists.
- Action: Sales approach MD captured as future doc (commit a2bc82a).
- Action: Sub portal test partially run — invite + onboarding + portal load verified for kalinspratling@gmail.com. Schedule sync + notification delivery test deferred to tomorrow.
- Action: 7 memory contradictions surfaced during sub portal cleanup, queued in new "Memory contradictions" section above.
- Open: Chunks 4-5 of archive build. CLAUDE_INDEX.md build (deferred). Memory contradictions cleanup. Schedule sync E2E test. kalin@avenstonekc.com role fix.
- Decision: Stopped at end of session for sleep.

[LOG — 2026-05-05]
- Action: Archive build complete. All slugs extracted across 8 passes (1, 2, 3, 4a, 4b, 4c, 5a, 5b) plus helper-error-sweep pulled from current memory.
- Final archive line count: 1299
- /tmp/old_claude_memory.md cleanup: deleted, source preserved in git at 7070d65^.
- Open from session: schedule sync E2E test (deferred), memory contradictions cleanup (7+ items), sub management Steps 1-2 quick wins, invoicing arc design + build.

[LOG — 2026-05-05]
- Action: Gated `## Model selection` section (formerly `## Opus finds solutions. Sonnet does coding.`) in CLAUDE.md with explicit audience guard. Sonnet executors were reading the dispatch instructions literally and writing paste-ready prompts for themselves on trigger words; reproduced in MasterAgent fix session.
- Files: CLAUDE.md
- Decision: Gate vs delete — kept all existing dispatch content for Opus-as-executor sessions; only added the Sonnet-skip / Opus-applies guard at top + renamed dispatch headings to clarify Opus subject.
- Open: none

[LOG — 2026-05-05]
- Action: Memory contradictions cleanup. Verified 9 schema/code claims against live DB + repo via prior verification prompt. Replaced the 2026-05-04 contradictions section with the new authoritative Schema reality block above.
- Action: Surfaced two role-guard bugs not previously tracked. `send-invite` profile upsert and `send-client-link` profile upsert both overwrite existing roles with no `isStaff` guard. Queued to Active open items.
- Action: `sub_pricing_changes` table confirmed still present despite prior memory claim of DROP. Added as DROP candidate to Active open items.
- Action: `bids` ghost-table entry expanded with full schema notes. Final consolidation/DROP decision deferred to sub consolidation design pass.
- Action: CLAUDE.md line 26 warning sharpened — only `send-client-link` flips Kalin's role; `send-contract-email` has a staff guard and is safe.
- Open: Sub consolidation design pass (Opus, no code) is next. Two role-guard fixes queued behind the design pass.
- Decision: No code changes this prompt. Memory + doc only.

[LOG — 2026-05-05]
- Action: Sub engagement Phase 1a — schema foundation. Created `job_sub_engagements` and `engagement_bids` tables with full RLS. Added `schedule_items.engagement_id` audit FK. Strictly additive — no legacy tables touched.
- Files: supabase/migrations/20260505_sub_engagement_phase1a.sql, CLAUDE_MEMORY.md
- Decision: Table named `engagement_bids` (not `bid_responses`) — collision with existing ITB/quote `bid_responses` table; IF NOT EXISTS would have silently skipped creation. State machine encoded in CHECK constraint; partial unique index enforces one live engagement per (job, sub, trade).
- Open: Phase 1b helpers (sbCreateEngagement, sbTransitionEngagement, sbAcceptBid, sbDeclineBid, loaders), Phase 1c edge functions (submit-bid-response, view-engagement). Then UI slice. Then migration of legacy data + DROPs.

[LOG — 2026-05-05]
- Action: Sub engagement Phase 1b — 4 helpers added to supabase.js: sbCreateEngagement, sbLoadEngagementsForJob, sbLoadEngagementsForSub, sbLoadEngagementByIds. PM-side only. All return { ok, error, data }. sbCreateEngagement maps Postgres unique-violation 23505 to a user-friendly "already engaged" error.
- Files: avenstone-vite/src/lib/supabase.js, CLAUDE_MEMORY.md
- Decision: tenant_id sourced from AV_TENANT module global (match existing pattern — no getUser() calls in existing helpers), not passed by caller.
- Open: Phase 1c (state machine helpers — sbTransitionEngagement, sbAcceptBid, sbDeclineBid). Phase 1c is where the auto-draft-schedule-items handoff lives.

[LOG — 2026-05-05]
- Action: Sub engagement Phase 1c — state machine validator + 4 simple transition wrappers in supabase.js. sbTransitionEngagement enforces the legal-transitions map (encoded as ENGAGEMENT_TRANSITIONS constant), uses optimistic concurrency on UPDATE, requires reason for terminal off-ramps. Wrappers: sbDeclineBid, sbWithdrawEngagement, sbRemoveEngagement, sbCompleteEngagement.
- Files: avenstone-vite/src/lib/supabase.js, CLAUDE_MEMORY.md
- Decision: sbAcceptBid intentionally split into Phase 1d because it carries schedule-item drafting + notification side effects.
- Open: Phase 1d (sbAcceptBid + auto-draft schedule items from engagement_bids.line_items + PM/sub notifications). Phase 1e (edge functions for sub-side mutations: submit-bid-response, view-engagement).

[LOG — 2026-05-05]
- Action: Sub engagement Phase 1d — sbAcceptBid added to supabase.js. Reads engagement + current bid → transitions engagement to active via sbTransitionEngagement (Phase 1c) → stamps engagement_bids accepted → auto-drafts schedule_items from bid line_items (or one placeholder if line_items empty) → fires sub notification via sbNotifyUser. Partial-failure tolerant: state-machine transition is the gate; downstream failures (bid stamp, schedule items, notify) capture failed_intent and continue rather than rolling back.
- Files: avenstone-vite/src/lib/supabase.js, CLAUDE_MEMORY.md
- Decision: not transactional. Step order ensures the engagement-active state is the load-bearing commit; downstream is recoverable manually if needed. Hardening to a Postgres RPC for atomic acceptance can come later if real failures show up. Spec column-name mismatches corrected against live schema: description→title, sub_id→assigned_sub_id, created_by→created_by_id; no phase column on schedule_items (trade is sufficient for derivePhaseStatus); jobs.address used instead of nonexistent jobs.name.
- Open: Phase 1e (sub-side edge functions: submit-bid-response, view-engagement). Phase 2 (UI: unified Add-to-Job modal, JobDet engagements tab, retire old paths).

[LOG — 2026-05-05]
- Action: Two role-guard fixes shipped.
  - send-invite: now reads existing profile before upsert; if role is owner/project_manager/sales_rep, preserves it instead of overwriting to 'sub'.
  - send-client-link: now hard-errors (JSON 409) if target email already has a staff role. New-user path unchanged.
- Files: supabase/functions/send-invite/index.ts, supabase/functions/send-client-link/index.ts, CLAUDE_MEMORY.md, CLAUDE.md
- Decision: send-invite tolerates staff (keeps role); send-client-link rejects staff (no defensible use case for sending a client link to a staff member).
- Open: Phase 2 of sub engagement consolidation (UI). Legacy bid_responses table column-list query (DROP prep, queued).

[LOG — 2026-05-05]
- Action: send-client-link outer catch now returns JSON (matches send-invite pattern). Last plain-text 500 path in the role-guard cluster eliminated.
- Files: supabase/functions/send-client-link/index.ts, CLAUDE_MEMORY.md

[LOG — 2026-05-05]
- Action: Sub engagement Phase 2a — AddSubToJobModal standalone component built. Wraps sbCreateEngagement (Phase 1b). Context-aware title/button labels based on initialSubId/initialJobId. Trade dropdown filtered to selected sub's approved trades from sub_pricing. Bid origination radio (sub_drafted/gc_drafted). Inline error, finally-clears spinner.
- Files: avenstone-vite/src/components/modals/AddSubToJobModal.jsx, CLAUDE_MEMORY.md
- Decision: 2a builds the component in isolation; no wiring to Subs Directory or JobDet (Phase 2b). "Invite new sub by email" path and file attachments deferred.
- Open: Phase 2b — wire AddSubToJobModal into Subs Directory rows and JobDet engagements tab. Phase 2c — JobDet engagements tab redesign (replaces SubsTab). Phase 2d — SubPortal updates calling the Phase 1e edge functions.

[LOG — 2026-05-05]
- Action: Sub engagement Phase 2b — AddSubToJobModal wired into two PM-side entry points. SubDir adds "Add to Job" button per sub row (opens modal pre-filled with sub). JobDet subs tab adds "Add Sub" button at top (opens modal pre-filled with job). Both fire success toast on engagement creation. Old buttons left in place.
- Files: avenstone-vite/src/components/sub/SubDir.jsx, avenstone-vite/src/components/jobs/tabs/SubsTab.jsx, CLAUDE_MEMORY.md
- Decision: strictly additive in this slice — no retirement of existing buttons. Retirement happens in Phase 2e once new flow is end-to-end exercised.
- Open: Phase 2c (JobDet engagements tab redesign — list rows from job_sub_engagements with state-aware actions). Phase 2d (SubPortal calls view-engagement on open + submit-bid-response on submit). Phase 2e (retire Quote Request page + Assign-to-Project flow + obsolete buttons).

[LOG — 2026-05-05]
- Action: Sub engagement Phase 2c — Engagements section live on JobDet's SubsTab. Reads via extended sbLoadEngagementsForJob (now includes current_bid per row via left join, normalized in JS to single object or null). Four state groups: Awaiting bid, Active, Completed, Off the job. Per-row inline action buttons gated by status; transitions fire existing helpers (sbAcceptBid, sbDeclineBid, sbWithdrawEngagement, sbRemoveEngagement, sbCompleteEngagement). Confirmation via window.confirm / window.prompt — inline modal upgrade is a polish slice later.
- Files: avenstone-vite/src/lib/supabase.js, avenstone-vite/src/components/jobs/tabs/SubsTab.jsx, CLAUDE_MEMORY.md
- Decision: strictly additive — legacy SubsTab content stays. Retirement is Phase 2e.
- Open: Phase 2d (SubPortal — call view-engagement on open, submit-bid-response on submit). Phase 2e (retire Quote Request page + Assign-to-Project flow + obsolete legacy content on SubsTab).

[LOG — 2026-05-05]
- Action: Sub engagement Phase 2d-1 — sub-side engagement list rendered on SubPortal. Reads via extended sbLoadEngagementsForSub (now includes current_bid via left join, normalized in JS). Four state groups: Action needed / Awaiting PM / Active / Past. Read-only — no click-through, no bid form yet.
- Files: avenstone-vite/src/lib/supabase.js, avenstone-vite/src/components/sub/SubPortal.jsx, CLAUDE_MEMORY.md
- Decision: strictly additive — legacy itb:quote_requests selector stays. Retirement is Phase 2e. Section placed at top of content area (above all tabs) since it's always relevant to the sub.
- Open: Phase 2d-2 (engagement detail modal calling view-engagement edge fn). Phase 2d-3 (bid submission form calling submit-bid-response edge fn). Phase 2e (retire legacy SubPortal selector + Quote Request page + Assign-to-Project flow).

[LOG — 2026-05-06]
- Action: Sub engagement Phase 2d-2 — EngagementDetailModal built. Click engagement row in SubPortal → modal opens → calls view-engagement edge fn with sub's real JWT (sb.auth.getSession) → stamps first_viewed_at server-side → renders job, trade, status, scope, budget/dates, bid type, and current bid read-only. Engagement rows have cursor:pointer + onClick.
- Files: avenstone-vite/src/components/modals/EngagementDetailModal.jsx (new), avenstone-vite/src/components/sub/SubPortal.jsx, CLAUDE_MEMORY.md
- Decision: auth pattern sb.auth.getSession() → Bearer ${session.access_token} is the canonical pattern for edge fns that validate real user JWT (vs. anon key). First use in components.
- Open: Phase 2d-3 (bid submission form in EngagementDetailModal calling submit-bid-response). Phase 2e (retire legacy).

[LOG — 2026-05-06]
- Action: Sub engagement Phase 2d-3 — bid submission live in EngagementDetailModal. Edit mode with form (total amount, terms, start/end dates; line items deferred). State-aware action button labels: "Submit your bid" / "Review and submit" / "Modify and resubmit". POSTs submit-bid-response with caller JWT; on success, refetches modal data (now shows bid_submitted state) and fires onSuccess callback to SubPortal for toast + list refetch.
- Files: avenstone-vite/src/components/modals/EngagementDetailModal.jsx, avenstone-vite/src/components/sub/SubPortal.jsx, CLAUDE_MEMORY.md
- Decision: lump-sum bids only in v1 (lineItems: null). Itemized line-item entry is a polish slice.
- Open: end-to-end smoke test of the full pipeline (PM create → sub submit → PM accept → schedule items auto-draft). Phase 2e (retire legacy SubPortal Bids tab + Quote Request page + obsolete buttons).

[LOG — 2026-05-06]
- Action: Engagement pipeline smoke test — 6/6 passing. Steps: seed, sub sees action-needed, sub submits bid, PM accepts, schedule item auto-drafted, double-submit returns 4xx. Three bugs fixed during test runs: (1) EngagementDetailModal was calling view-engagement as GET with query param; fixed to POST with JSON body + correct response destructuring. (2) AddSubToJobModal subId not syncing from props on open (only on close); fixed to always sync on isOpen change. (3) Job row selector was matching outermost container div; fixed to getByRole("row").filter({hasText}).
- Files: tests/engagement-smoke.spec.js (new), avenstone-vite/src/components/modals/EngagementDetailModal.jsx, avenstone-vite/src/components/modals/AddSubToJobModal.jsx
- Commits: 793f9cc, f8ff78d (pushed to main)
- Open: Phase 2e — retire legacy SubPortal Bids tab, Quote Request page, Assign-to-Project flow, obsolete buttons on SubsTab.

[LOG — 2026-05-06]
- Action: Sub engagement Phase 2e-1 — legacy SubPortal "Bid Invitations" tab retired. Tab button, content section (itbs/bidITB/bidForm/bidFile/bidSaving/bidDone/bidErr state, submitBid fn, bid submit modal), and view-bids useEffect removed. Dead supabase.js helpers removed: sbLoadSubITBs, sbSubmitBid, sbLoadITBs alias, bidQuotePath private fn. New "My Engagements" section (Phase 2d-1/2/3) is now the sole sub-side surface for engagements/bids.
- Files: avenstone-vite/src/components/sub/SubPortal.jsx, avenstone-vite/src/lib/supabase.js, CLAUDE_MEMORY.md
- Decision: invitations_to_bid compat view stays alive in DB (Phase 3 schema cleanup). itb_invitees table had 0 rows — clean retirement, no in-flight data lost. Open-item bullet split: selector update marked done, compat view DROP still queued.
- Open: Phase 2e-2 (JobDet SubsTab top buttons "Invite from Directory" + "New Quote Request" retirement). Phase 2e-3 (JobDet legacy "Assigned Subs" section retirement). Phase 2e-4 (standalone Quote Request page if exists). Phase 3 (schema cleanup: DROP bids ghost, sub_pricing_changes, legacy bid_responses, eventually invitations_to_bid view + quote_requests + itb_invitees). Smoke-test follow-up: submit-bid-response 500-vs-409 response shape (behavior correct, shape wrong).

[LOG — 2026-05-06]
- Action: Sub engagement Phase 2e-2 — retired "Invite from Directory" and "New Quote Request" buttons from JobDet SubsTab. Both header buttons removed along with their modals, dead state (showPicker, showNewQR, qrForm, qrSaving, tradeStrings), dead fns (createQR, handleAssignFromDirectory), SubPicker import, and ssty const. Dead helpers removed from supabase.js: sbCreateQuoteRequest, sbCreateITB alias. sbLoadActiveTradeStrings, sbAssignSub, sbLoadSubDirectory all have other callers — kept. Existing QR card list (expand/invite/award/reject) stays for Phase 2e-3/4 cleanup.
- Files: avenstone-vite/src/components/jobs/tabs/SubsTab.jsx, avenstone-vite/src/lib/supabase.js, CLAUDE_MEMORY.md
- Decision: SubPicker.jsx file left in repo — import removed from SubsTab but file not deleted (Phase 2e-3 is the right time to sweep orphaned files). No test references to the removed buttons.
- Open: Phase 2e-3 (retire Assigned Subs + QR sections on SubsTab; SubPicker.jsx orphan). Phase 2e-4 (standalone Quote Request page if any). Phase 3 schema cleanup.

[LOG — 2026-05-06]
- Action: Phase 2e-3-migrate — migrated 6 live job_subs rows into job_sub_engagements (status='active', bid_type='gc_drafted') with placeholder engagement_bids rows (total_amount=0, is_current=true). Verification: legacy_count=6 == migrated_count=6, all active, each has exactly 1 current bid. Original job_subs rows untouched as backup until Phase 3.
- Files: supabase/migrations/20260506074657_migrate_job_subs_to_engagements.sql, CLAUDE_MEMORY.md
- Decision: gc_drafted bid_type because legacy assignments were GC-side decisions, not sub-submitted bids. trade='general' (job_subs has no trade column). invited_by_id=Kalin's auth ID fallback (no created_by_id column). notes column tags each migrated row with source job_subs id for traceability.
- Open: Phase 2e-3-retire — retire QR section + Assigned Subs section + awardBid path now that all 6 assignments live in the new engagement system.

[LOG — 2026-05-06]
- Action: Sub engagement Phase 2e-3-retire — both legacy SubsTab sections (QR + Assigned Subs) and the awardBid path retired. Migration at commit a111972 had already moved 6 live rows into the engagement schema, clearing the data gate.
- Files: avenstone-vite/src/components/jobs/tabs/SubsTab.jsx, avenstone-vite/src/lib/supabase.js, CLAUDE_MEMORY.md
- Decision: sbAssignSub + sbLoadSubsTabData + sbUpdateQuoteRequest + sbUpdateITB alias + sbSendBidInvite + sbUpdateBidStatus removed (orphaned after this slice per fresh grep). sbLoadSubDirectory, sbLoadJobTransactions, sbResolveTodosBySource retained — have callers in SubDir.jsx, FinancialsTab.jsx, takeoff.js, TransactionModal.jsx. job_subs table is now fully orphaned in the codebase — no readers, no writers.
- Open: Phase 2e-4 (standalone Quote Request page if exists). Phase 3 schema cleanup: DROP bids ghost, sub_pricing_changes, legacy bid_responses, invitations_to_bid view, quote_requests, itb_invitees, AND job_subs (fully orphaned — writer + readers removed; migrated rows preserved as backup).

[LOG — 2026-05-06]
- Action: Pre-Phase-3 cleanup — retired sub_pricing_changes workflow (OwnerPortal PricingTab + sbLoadPricingApprovals); migrated ClientPortal, InfoTab to job_sub_engagements; rewrote sbLoadScheduleItemsForSub to use schedule_items.assigned_sub_id directly. Removed sbLoadJobSubs, sbUnassignSub.
- Files: avenstone-vite/src/components/owner/OwnerPortal.jsx, avenstone-vite/src/components/client/ClientPortal.jsx, avenstone-vite/src/components/jobs/tabs/InfoTab.jsx, avenstone-vite/src/lib/supabase.js, CLAUDE_MEMORY.md
- Decision: sbLoadScheduleItemsForSub now filters assigned_sub_id directly — no job_subs join needed. ClientPortal ratings section uses js.sub (engagement sub) and js.trade (engagement trade) instead of legacy js.profile shape. InfoTab "Assigned Subs" shows active engagements, read-only.
- Open: Phase 3 schema cleanup re-run — all gate failures resolved.

[LOG — 2026-05-06]
- Action: Phase 3 schema cleanup — DROPped invitations_to_bid view + 6 legacy tables (bid_responses [legacy], itb_invitees, quote_requests, bids, sub_pricing_changes, job_subs). Also replaced 3 RLS policies (job_messages_read, job_messages_insert, schedule_items_sub_select) that referenced job_subs — rewritten to reference job_sub_engagements with same access intent. All audits clean before apply: 0 src/ references, 0 unexpected FKs, migrated-data parity 6/6. engagement_bids and job_sub_engagements survived intact.
- Files: supabase/migrations/20260506080811_phase3_drop_legacy_sub_tables.sql, CLAUDE_MEMORY.md
- Decision: NO CASCADE on any DROP. BEGIN/COMMIT for atomicity. bid_responses dropped BEFORE quote_requests per FK. Policy replacements run before table DROP in same transaction — atomic. RLS policies use NOT IN ('completed','declined','withdrawn','removed') to cover all live engagement states including invited/bid_submitted (subs need message access during bid clarification).
- Open: Sub engagement consolidation arc is COMPLETE. Polish items queued: 500-vs-409 fix on submit-bid-response, inline modals replacing window.confirm/window.prompt, line-item bid entry, picker enrichment, auto-bid generation for gc_drafted path. Next major arc: invoicing.

[LOG — 2026-05-06]
- Action: Created INVOICING_ARC.md at repo root. Living design doc for the invoicing arc — covers schema foundation (draw_schedules, invoices, invoice_line_items, job_transactions.invoice_id, next_invoice_number fn), state machines, UI map (FinancialsTab Invoices sub-tab + ClientPortal Invoices section), Stripe + email integration, pdf-lib PDF generation, 6-phase rollout plan, out-of-scope (sub-side, lien waiver PDF, retainage, QB API, etc.), and 6 locked decisions (Stripe Checkout over Stripe Invoices, manual tax, phase on line items, hardcoded due date, signed PDF link, edit-after-send rules).
- Files: INVOICING_ARC.md, CLAUDE_MEMORY.md
- Decision: Blueprint-first workflow — design doc lands before any build prompt. Pattern tested here for the invoicing arc.
- Open: Phase 1 (schema foundation) is the next slice — creates the 3 new tables + ALTER + Postgres function. Strictly additive.

[LOG — 2026-05-06]
- Action: Invoicing Phase 1 — schema foundation. Created draw_schedules, invoices, invoice_line_items tables with full RLS (12 policies). Added job_transactions.invoice_id audit FK. Created next_invoice_number(uuid) function for per-tenant year-prefixed numbering (INV-YYYY-NNNN, resets annually). Strictly additive — no legacy tables touched.
- Files: supabase/migrations/20260506090000_invoicing_phase1_schema.sql, CLAUDE_MEMORY.md
- Decision: client RLS allows reading own non-draft invoices + own draws (transparency on billing schedule). Drafts are PM-only. Smoke test confirmed: next_invoice_number returns INV-2026-0001 for Avenstone tenant.
- Open: Invoicing Phase 2 — sb* helpers for draw_schedules CRUD + new "Invoices" sub-tab on FinancialsTab with draw schedule section.

[LOG — 2026-05-06]
- Action: Invoicing Phase 2a — added sbCreateDrawSchedule, sbLoadDrawsForJob, sbUpdateDrawSchedule, sbDeleteDrawSchedule to supabase.js. Standard tenant-stamped pattern, captureFailedIntent fire-and-forget on write failures, Postgres 23505 mapped to friendly "draw number conflict" error.
- Files: avenstone-vite/src/lib/supabase.js, CLAUDE_MEMORY.md
- Decision: helper requires explicit draw_number input — UI (Phase 2b) computes next available number from sbLoadDrawsForJob result. Keeps helper simple, defers auto-numbering policy to UI layer.
- Open: Invoicing Phase 2b — new "Invoices" sub-tab on FinancialsTab with draw schedule section + Add Draw modal.

[LOG — 2026-05-06]
- Action: Invoicing Phase 2b — added "Invoices" 4th sub-tab to FinancialsTab. New InvoicesSubTab.jsx (draw table as mobile cards with status pills, summary totals, Invoices placeholder block) and DrawModal.jsx (create/edit, auto-defaults next draw_number, status dropdown in edit mode only). Wires Phase 2a helpers.
- Files: avenstone-vite/src/components/jobs/tabs/FinancialsTab.jsx, avenstone-vite/src/components/jobs/tabs/InvoicesSubTab.jsx (new), avenstone-vite/src/components/modals/DrawModal.jsx (new), CLAUDE_MEMORY.md
- Decision: Invoices section is an intentional dashed-border placeholder — Phase 3 adds the composer and invoice list together.
- Open: Invoicing Phase 3 — invoice composer modal + Invoices list section + sb* helpers for invoices CRUD + draw amount roll-up logic.

[LOG — 2026-05-06]
- Action: Invoicing Phase 3a — added 8 invoice helpers to supabase.js. sbGenerateInvoiceNumber wraps next_invoice_number RPC (first sb.rpc() call in the file). sbCreateInvoice auto-generates number if omitted, defaults invoice_date to today. sbLoadInvoice joins line items via Supabase relational select. sbDeleteInvoice guards drafts-only. sbSaveInvoiceLineItems uses bulk-replace pattern matching sbSaveEstimateLineItems.
- Files: avenstone-vite/src/lib/supabase.js, CLAUDE_MEMORY.md
- Decision: invoice_number stripped from sbUpdateInvoice patch (immutable post-creation). sbVoidInvoice stamps voided_at + voided_by_id atomically. CO loader: no standalone sbLoadChangeOrders — Phase 3b composer reads COs from job.change_orders (loaded with the job).
- Open: Invoicing Phase 3b — invoice composer modal (lines from estimate / change orders / manual, draft-only save). Phase 3c — Invoices list in InvoicesSubTab + InvoiceDetailModal + draw "Generate Invoice" wiring.

[LOG — 2026-05-06]
- Action: Invoicing Phase 3b+3c — InvoiceComposerModal built + wired; InvoicesSubTab placeholder replaced with live invoices list.
- InvoiceComposerModal: draw dropdown pre-filled via prefillDrawId prop; manual line items (description, qty, unit, price, phase); tax field; totals computed live; save-draft only. Edit mode loads full invoice via sbLoadInvoice; non-draft invoices show warning and block editing.
- InvoicesSubTab: invoices load in parallel with draws (Promise.all). Invoice cards show number, status pill, draw linkage, date/due/total/paid. Staff actions: edit/delete draft, void sent/viewed. Per-draw "Invoice" button pre-fills composer. "+ New Invoice" standalone path.
- Files: avenstone-vite/src/components/modals/InvoiceComposerModal.jsx (new), avenstone-vite/src/components/jobs/tabs/InvoicesSubTab.jsx
- Commit: 976eeec
- Open: Phase 4 — send-invoice edge fn (pdf-lib PDF + Stripe Checkout + email). "Save & Send" button on composer. stripe-webhook reconciliation to invoice. Phase 5 — ClientPortal Invoices section.

[LOG — 2026-05-06]
- Action: Invoicing Phase 4a — send-invoice edge function + sbSendInvoice helper + Save & Send on composer.
- send-invoice: pdf-lib US Letter PDF (header band, bill-to, line items table with right-aligned currency, totals, notes, footer), upload to job-documents/{jobId}/invoices/{invoiceNumber}.pdf (upsert), 30-day signed URL, Stripe Checkout Session with invoice_id/job_id/tenant_id in metadata, update invoice (status→sent, pdf_url, stripe_session_id, stripe_checkout_url, sent_at, sent_by_id), draw roll-up (invoiced_amount += total, planned→in_progress if draw status was planned), Resend email (View Invoice PDF + Pay Now buttons). Email failure does NOT roll back DB — invoice stays sent, returns email_warning field.
- sbSendInvoice: uses sb.functions.invoke('send-invoice') — first functions.invoke call in supabase.js.
- InvoiceComposerModal: Save & Send button (btn-gold) — saves draft first, then calls sbSendInvoice. Email warning: shows error, fires onSaved, auto-closes after 4s. Send failure after draft save: descriptive "Draft saved but send failed" message, keeps modal open for retry from list.
- Files: supabase/functions/send-invoice/index.ts (new), avenstone-vite/src/lib/supabase.js, avenstone-vite/src/components/modals/InvoiceComposerModal.jsx
- Commit: e6a466f (deployed via GitHub Actions on push to main)
- Decision: email failure tolerant (invoice stays sent). PDF v1 hardcodes Avenstone branding per INVOICING_ARC.md out-of-scope list.
- Open: Phase 4b — stripe-webhook update (read invoice_id from metadata, update invoices.amount_paid + status, create job_transactions row with invoice_id, roll up draw.paid_amount, notify client + staff). Phase 5 — ClientPortal Invoices section.

[LOG — 2026-05-06]
- Action: Invoicing Phase 4b — stripe-webhook extended with invoice reconciliation branch.
- invoice flow: idempotency check via stripe_session_id lookup (skips on duplicate Stripe retry), loads invoice, validates status not already paid/void, inserts job_transactions row (direction=in, type=client_payment, status=paid, invoice_id FK, payer_or_payee_name/id from job.client_name/client_user_id), updates invoices.amount_paid + transitions to paid (stamps paid_at) or partially_paid, rolls up draw_schedules.paid_amount + transitions draw to paid when fully invoiced + fully paid, notifies all tenant staff in-app, notifies client in-app (client_user_id) + Resend email (non-fatal failure). Legacy payment-link flow (no invoice_id in metadata) completely unchanged.
- Files: supabase/functions/stripe-webhook/index.ts, CLAUDE_MEMORY.md
- Commit: 68f49a0 (deployed via GitHub Actions)
- Decision: webhook returns 200 even on handleInvoicePayment throw (prevents Stripe retry loops on data-integrity issues; transient infra errors are logged). RESEND_API_KEY added to webhook env reads — already provisioned from Phase 4a.
- Open: Phase 5 — ClientPortal Invoices section (view invoices, PDF link, Pay Now). Phase 4c polish: Resend button on sent invoices, InvoiceDetailModal, revision log on edit-after-send.

[LOG — 2026-05-06]
- Action: Invoicing Phase 5a — regenerate-invoice-payment edge function + sbRegenerateInvoicePaymentUrl helper. Solves Stripe Checkout 24-hour session expiry: clients click Pay Now and we mint a fresh Stripe session at click time. Authorization gated via JWT-scoped read (RLS handles it — no role re-check needed). Updates invoice.stripe_session_id + stripe_checkout_url; does NOT touch status. Identical metadata to send-invoice so the webhook reconciliation path is unchanged.
- Files: supabase/functions/regenerate-invoice-payment/index.ts (new), avenstone-vite/src/lib/supabase.js, CLAUDE_MEMORY.md
- Decision: JWT-scoped RLS read uses SUPABASE_ANON_KEY + caller token as Authorization header (callerClient pattern). Validation rejects draft/paid/void — only sent/viewed/partially_paid/overdue can regenerate. Idempotent: each call overwrites the previous session, webhook reconciles correctly because metadata is constant.
- Open: Phase 5b — ClientInvoicesTab component + ClientPortal Invoices tab integration. Pay Now button calls sbRegenerateInvoicePaymentUrl.

[LOG — 2026-05-06]
- Action: Invoicing Phase 5b — ClientInvoicesTab component + Invoices tab in ClientPortal.
- ClientInvoicesTab: owns its own load (sbLoadInvoicesForJob on mount). Cards match payments-tab visual style (white card, border, padding 16). Status pills use client-friendly labels: sent/viewed both show "Awaiting payment", partially_paid "Partially paid", paid "Paid", overdue "Overdue". Amount grid shows Total / Paid / Balance. View Invoice opens pdf_url in new tab. Pay Now calls sbRegenerateInvoicePaymentUrl for fresh Stripe session, opens in new tab. Loading spinner per-button via payingInvoiceId state. Void invoices dim (opacity 0.6) and hide action buttons.
- ClientPortal: Invoices tab added to BASE_CLIENT_TABS (after Overview, before Schedule). Render branch wired. Payments tab and all other surfaces untouched.
- Files: avenstone-vite/src/components/client/ClientInvoicesTab.jsx (new), avenstone-vite/src/components/client/ClientPortal.jsx
- Decision: Payments tab not removed from BASE_CLIENT_TABS (it wasn't there — data surfaces in Overview's Next Payment Card). Invoices tab goes between overview and schedule as the primary billing surface. PDF 30-day signed URL expiry accepted as v1 limitation per spec.
- Open: Phase 4c (polish — Resend button on sent invoices, InvoiceDetailModal, edit-after-send revision log). Phase 6 (cleanup — migrate Overview/Payments off compat payments view, retire unused legacy helpers).

[LOG — 2026-05-06]
- Action: Invoicing Phase 4c-1 — manual Mark Paid flow for cash/check/wire payments. New helper sbMarkInvoicePaid (creates job_transactions row, updates invoice amount_paid + status, rolls up draw paid_amount + transitions to paid when fully covered — same end state as the Stripe webhook path). New MarkPaidModal with amount / payment method / date / reference / notes fields. Mark Paid button on invoice rows in InvoicesSubTab (gated to sent/viewed/partially_paid/overdue + owner/PM/sales_rep). Validates payment ≤ outstanding balance with 1¢ float tolerance. Supports partial payments — status flips to partially_paid until total reached.
- Files: avenstone-vite/src/lib/supabase.js, avenstone-vite/src/components/modals/MarkPaidModal.jsx (new), avenstone-vite/src/components/jobs/tabs/InvoicesSubTab.jsx, CLAUDE_MEMORY.md
- Decision: no notifications or emails on manual mark-paid — PM has cash in hand, client sees status change next portal load. No Stripe session cancellation on manual mark-paid (known edge case: Stripe link still active ~24hr; webhook idempotency check on invoice.status='paid' prevents double-counting).
- Open: Phase 4c-2 (Resend button on sent invoices), Phase 4c-3 (void flow polish for sent invoices), Phase 6 (compat view migration in Overview/Payments tabs).

[LOG — 2026-05-06]
- Action: Invoicing Phase 4c-2 — Resend button. New resend-invoice edge function generates fresh PDF signed URL (reuses existing PDF in storage, no regen), fresh Stripe Checkout Session, sends email with identical template to send-invoice (resend is invisible to client). Updates pdf_url + stripe_session_id + stripe_checkout_url on the invoice; does NOT touch sent_at, status, or any other field. New sbResendInvoice helper. Resend button (blue-tinted) on InvoicesSubTab rows for sent/viewed/partially_paid/overdue invoices.
- Files: supabase/functions/resend-invoice/index.ts (new), avenstone-vite/src/lib/supabase.js, avenstone-vite/src/components/jobs/tabs/InvoicesSubTab.jsx, CLAUDE_MEMORY.md
- Decision: email failure is fatal in resend (unlike send-invoice where DB state was prioritized) — the whole point of resend is the email, so no email = no purpose. Original PDF must exist in storage; if missing (storage cleanup edge case), helper instructs PM to void and reissue rather than regenerating. No resend audit trail in v1 — sent_at stays canonical, no resend_count column.
- Open: Phase 6 — compat view cleanup (migrate ClientPortal Overview/Payments tabs off the legacy payments view, retire unused legacy helpers, possibly drop the compat view itself once nothing reads it).

[LOG — 2026-05-06]
- Action: Invoicing Phase 6c — sbVoidInvoice rewritten for correctness. Now validates amount_paid=0 before voiding (rejects partially_paid/paid with friendly error suggesting credit memo via QuickBooks until that ships). Reverses draw.invoiced_amount rollup. Transitions draw status in_progress→planned only when this void zeros out invoiced amount (handles multi-invoice-per-draw correctly). Drafts blocked from void with friendly error directing to Delete. Void button visibility tightened in InvoicesSubTab to sent/viewed/overdue only. draw refresh already covered by existing load() which does Promise.all on both.
- Files: avenstone-vite/src/lib/supabase.js, avenstone-vite/src/components/jobs/tabs/InvoicesSubTab.jsx, CLAUDE_MEMORY.md
- Decision: void+reissue is the canonical correction path for sent invoices. Credit memo flow for paid-invoice corrections deferred — PMs handle in QuickBooks. Edit-after-send revision log officially dropped from invoicing arc scope.
- Open: Phase 6b (overdue auto-derivation), Phase 6a (compat view migration), Phase 6d (white-label PDF + email).

[LOG — 2026-05-06]
- Action: Invoicing Phase 6b — overdue auto-derivation. New deriveInvoiceStatus pure helper returns 'overdue' for sent/viewed invoices with due_date < today; otherwise returns raw status. Display-only — DB stays at 'sent', schema unchanged, no scheduled job. Status pill in InvoicesSubTab and ClientInvoicesTab now uses derived value. Action button gates (Mark Paid, Resend, Void, PAYABLE set) continue using raw invoice.status — overdue invoices are still actionable as if they were sent.
- Files: avenstone-vite/src/lib/supabase.js, avenstone-vite/src/components/jobs/tabs/InvoicesSubTab.jsx, avenstone-vite/src/components/client/ClientInvoicesTab.jsx, CLAUDE_MEMORY.md
- Decision: derivation in helper not in component — single source of truth. Both overdue pill maps were already present from Phase 3/5b specs so no new color/label needed.
- Open: Phase 6a (ClientPortal compat view migration), Phase 6d (white-label PDF + email).

[LOG — 2026-05-06]
- Action: Invoicing Phase 6a — ClientPortal compat view migration. Removed dead Payments tab body (tab was already absent from BASE_CLIENT_TABS since Phase 5b). Overview Next Payment Card now reads next unpaid invoice from sbLoadInvoicesForJob (filter sent/viewed/partially_paid/overdue, sorted due_date asc nulls last). Pay Now calls sbRegenerateInvoicePaymentUrl for fresh Stripe session. View Invoice opens pdf_url. Progress Bar / Quick Stats "Paid to Date" reads job_transactions directly via new sbLoadJobTotalPaid helper (Path A — jt_client_select RLS policy confirmed includes client role with direction=in access). Compat view left alive.
- Files: avenstone-vite/src/lib/supabase.js, avenstone-vite/src/components/client/ClientPortal.jsx, CLAUDE_MEMORY.md
- Decision: Path A (direct query) — no RPC needed. status filter on unpaid invoices uses raw DB status; deriveInvoiceStatus used for overdue badge display only. client_refund subtracted from total paid math.
- Open: Phase 6d (white-label PDF + email — audit tenants table, add business_name/email/phone/address columns, update send-invoice + resend-invoice).

[LOG — 2026-05-06]
- Action: Invoicing Phase 6d — white-label tenant business info on PDF and email. Migration 20260506120000_tenant_business_info.sql adds business_email/business_phone/business_address columns to tenants; Avenstone row seeded (email=notifications@avenstonekc.com, address=Kansas City MO). Reuses existing name column as businessName. send-invoice: generatePDF now accepts businessName/businessEmail/businessPhone/businessAddress and renders them dynamically in PDF header; FROM/subject/email header+footer/reply_to all tenant-driven. resend-invoice: same email changes (no PDF regen). stripe-webhook: handleInvoicePayment loads tenant inline before sending client payment confirmation email; same brand tokens applied. FROM display name is dynamic; sending domain stays notifications@avenstonekc.com (Avenstone-verified).
- Files: supabase/migrations/20260506120000_tenant_business_info.sql (new), supabase/functions/send-invoice/index.ts, supabase/functions/resend-invoice/index.ts, supabase/functions/stripe-webhook/index.ts, CLAUDE_MEMORY.md
- Schema reality: tenants now has id/name/slug/logo_url/primary_color/plan/created_at/business_email/business_phone/business_address
- Decision: tenant load after job load on every email path — single extra query per send, no caching needed at this scale. Fallbacks ensure backward compat for any tenant row missing these columns.
- Open: invoicing arc complete. Next: sub portal upgrades (PM-Sub chat, phase confirm, CO submission).

[LOG — 2026-05-06]
- Action: Sub arc polish slice 1 — replaced window.confirm / window.prompt calls in engagement actions with new EngagementActionModal. Single component handles all 5 actions (decline / withdraw / remove / accept / complete) via action-driven config (title, message, button label/color, optional reason textarea, helper to call). Wires existing helpers from Phase 1c/1d — no helper changes. PM-side (JobDet SubsTab Engagements) migrated; sub-side SubPortal window.confirm at line 310 is for deleteTrade (profile trade removal), not an engagement action — left alone.
- Files: avenstone-vite/src/components/modals/EngagementActionModal.jsx (new), avenstone-vite/src/components/jobs/tabs/SubsTab.jsx, CLAUDE_MEMORY.md
- Decision: single multi-action modal vs. five single-purpose modals — single is simpler to maintain, action-driven config keeps per-action quirks tidy. Reason textarea hides cleanly for accept/complete. Destructive actions use red inline styling (matches Void in invoicing arc). Toast messages preserved in onConfirmed callback at call site.
- Decision: sbDeclineBid (not sbDeclineEngagement) is the actual helper name — spec had wrong name, adjusted.
- Open: Sub arc polish slice 2 — 500→409 fix on submit-bid-response concurrent double-submit. Slice 3 — line items entry UI in bid form (sub side currently lump-sum only).
