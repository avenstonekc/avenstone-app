# MASTER_BUILD_PLAN.md
**APPROVED — locked 2026-06-19. 6-block order confirmed: Owner Foundation → Engine → Watcher → Seams → Client Front Door → Autopilot.**
**Last full-code audit: 2026-06-19 (all 21 docs/arcs/ verified against live code)**

> **Starting position: SCOPE_CAPTURE_ENGINE P1B (live-tested 2026-06-26) + bathroom seed gap-fill (2026-06-30, 13 fields) + P2 "thin channel" (2026-06-30) SHIPPED. Scope-interview fires from typed Rooms field → project_type; asks bathroom checklist before pricing; fires modules on triggers; soft-gate force-draft marks scope_origin='incomplete'. P2: structured session pre-answer channel live end-to-end (measuredFields + measured SF → prefilled_answers → interview folds matching checklist keys into answered set, source 'measured', short-circuits w/ no AI call if session-complete). AUDIT NOTE: P1A already delivered session→estimate prose pre-fill; P2 added the STRUCTURED channel + measured SF only. Channel is dormant until Phase 3 vision fills it (measurements are quantities, not scope forks) — accepted tradeoff. B2.4 (Scope Risk) gate clear. Next action: Kalin's call — SCOPE_CAPTURE P3 (vision reconciliation, fills the channel) / B2.4 Scope Risk (needs risk-library seed) / consultation upsell mode.**

---

> **Rule (for Claude and Opus):** Before starting any new phase, arc, or slice, read this file first. Check the build-state inventory for current status. Confirm the requested work is in the correct block given its dependencies. Do not build out of dependency order. If a prompt requests out-of-sequence work, flag it before starting.

---

## 0. Now / Next — open blockers (owner + code)

### KALIN_QUEUE — the owner's open decisions & actions

Owner blockers are tracked here so they are as visible as Code's build map. **Maintenance rule:** any dispatch that creates an owner decision/action MUST add it here; any report that resolves one MUST remove it.

| # | Owner action | Blocks / why it matters | Open since |
|---|--------------|-------------------------|------------|
| ~~a~~ | ~~**Red-pen `SCOPE_SEED_CONTENT_DRAFT.md`** → manifest lock + Blake upload~~ **RESOLVED 2026-07-10** — draft dropped + locked; SCE Phase 1B full seed SHIPPED (`fc65746`: 9 project types + 15 modules + 37 conflict rules); manifest LOCKED. Remaining Blake image uploads = Phase 4B asset work under THE PICTURE RULE (not a P1 blocker). | ~~2026-07-07~~ |
| b | **Answer the SELECTIONS four product questions** — leans recorded inline (decidable in one word). **(1) Day-one trades** — _lean:_ tile, flooring, cabinets/counters, fixtures/finishes, paint (exterior trades added when a job needs them). **(2) Base photo source for renders** — _lean:_ rep scope photos primary, homeowner upload fallback. **(3) Render visibility** — _lean:_ rep-mediated first, client-facing once trusted. **(4) Tap-approve** — _lean:_ SOFT until PM confirms the batch (PM confirm is the nothing-slips checkpoint; post-confirm changes are change-order territory). | **Blocks THREE deliverables:** SELECTIONS flow (B5.7–B5.9), CLIENT_VISION_RENDER, SUB_WORK_PACKET | June 2026 |
| c | **Status-picker corrections** (owner-only): `1206 W Lucy Webb Rd` → `lead`; `999 Test Lane` → its true stage | Model B Phase 2 surfaced these as genuine `jobs.status` lies (stored ≠ derived); only the owner knows the true stage | 2026-07-10 |
| d | **One browser sign on `456 Test Flow Ave`** (client seat: `kalinspratling@gmail.com`) | Verifies the CONTRACT_SIGNING evidence chain end-to-end (priced PDF → frozen evidence → IP/UA capture → signed-copy email) on real hardware | 2026-07-10 |
| ~~e~~ | ~~**Enable billing on the Gemini API project**~~ **RESOLVED 2026-07-10** — billing enabled; all 195 visual-option assets generated (`gemini-3.1-flash-image`), validator READY 56/56 / exit 0. 139 CLAUDE illustrations pending eyeball review; `--regen <file>` any reject. | ~~2026-07-10~~ |
| ~~f~~ | ~~**Blake to confirm paid-status of 6 pending KC Energy Savers rows on `8617 Houston`**~~ **RESOLVED 2026-07-15** — during the Aguayo scope reconciliation the 6 rows were relabeled to their real payees (Topline Glassworks, Sarto Countertops, Schluter, Raptor Recycle & Transfer, Menards ×2) and flipped to `paid`; `0bf20161` was voided + reattributed as an Aguayo invoice payment. Status-accuracy question closed. | ~~2026-07-15~~ |
| ~~g~~ | ~~**Kalin: did Aguayo's do carpet on `8617 Houston`?**~~ **RESOLVED 2026-07-15** — Aguayo's owner-supplied complete scope sheet (07/14, $33,563.06, "Change Orders Included") has NO carpet line; carpet on this job was Southside ($4,647) + Carlos ($4,500), both raw by Kalin. Aguayo did not do carpet → no missing liability. | ~~2026-07-15~~ |
| h | **Kalin: $100 discrepancy with Aguayo** — their remainder invoice credits $16,900 received vs $17,000 in checks Kalin wrote. Handle with the sub directly; the books stay at $17,000 paid (correct per the checks). | 2026-07-15 |
| i | **Kalin: pay Aguayo remainder $16,563.06 when ready** — then log it as an invoice payment on `16ab4bc1` via `add_sub_invoice_payment_with_ledger` (NOT a raw status flip), so accrual `97205011` draws down atomically. | 2026-07-15 |

### NEXT CODE DISPATCH (priority)

1. ~~**Harden client UPDATE RLS on `jobs` to column-scoped.**~~ **SHIPPED 2026-07-10** — `bca24b4` dropped the column-unscoped client UPDATE policy; `0137df6` removed the client-side `jobs` write from the sign modal; `c808c08` moved the signed-state write server-side into `record-signature-evidence` (service-role). The client session no longer holds any `jobs` UPDATE.

2. **ESTIMATE_CONFIGURATOR — visual tap-through scope builder (LOCKED 2026-07-11, Kalin).** Kills the scope-interview **chat transcript**. Building an estimate becomes a guided configurator: one question per screen, big image cards, instant tap-to-advance, progress bar, and every prior answer tappable to change it (fixes misclicks / mind-changes). The AI comes OUT of the tap loop — that is the "AOL → next-gen" fix. **Architecture (locked):** a new **deterministic `scope_plan` mode** in `ai-estimator` (NO LLM call — reuses `assembleChecklist`/`detectTriggers`/`collectRequiredFields`/`openQuestions`) takes `{project_type, answers[]}` and returns the ordered required-field list (base checklist + fired trigger modules) with `field_key/question/field_type/options/is_selection/money_risk_rank/origin` + `fired_modules` + `scope_complete`. The frontend steps through it and re-fetches after each answer so follow-ups (e.g. `curbless` → waterproofing fields) unlock **instantly**. The LLM is only called for **final pricing** (unchanged path). Answers persist via the Phase-A `job_scope_answers` store; a small "note / not listed?" field replaces the free-text chat. **Reverses** the SCOPE_CAPTURE_ENGINE blueprint's "batched, not death-by-a-thousand-prompts" interview style at the **presentation layer only** — that concern was about slow text Q&A; an instant-tap configurator is one-at-a-time AND snappy, so it satisfies the spirit. **Slices:** **S1** — `scope_plan` deterministic mode (ai-estimator; ~1–2). **S2** — `ScopeConfigurator` component + wire into EstimateTab Build; kill the chat; render non-image field types (choice-with-images → big cards; choice-without → big labeled buttons; number/bool/text → big input); progress + edit-any-answer; persist; hand off to the existing pricing path (~3–4). **~4–6 prompts. Depends on:** SCOPE_CAPTURE_ENGINE P1B (SHIPPED) + `job_scope_answers` store (SHIPPED). No new dependency gate. This is a UX evolution of the SCOPE_CAPTURE_ENGINE interview surface (Block 2 §B2.3 area).

### HARD DEPENDENCY GATE — Model B Phase 3

**Model B Phase 3 (the `jobs.status` source-of-truth flip) is a hard dependency gate for `JOBDET_MOBILE` and any other arc that renders job lifecycle state.** Every pre-flip feature adds status readers Phase 3 must migrate; `JOBDET_MOBILE` is almost entirely lifecycle-rendering surface. Do not dispatch a lifecycle-rendering arc until Phase 3 ships. **Phase 3 entry criteria:** Lifecycle Audit shadow-panel divergence reduced to semantics-only (the two owner-approved signed→`contract` cases) **and** a soak period of normal use. (Model B Phases 1–2 shipped 2026-07-10; see `docs/arcs/MODEL_B_LIFECYCLE.md`.)

---

## 1. Purpose

Single dependency-ordered source of truth for realizing the Avenstone vision. Every session that starts new work checks this document first. The inventory is verified against live code — never against the docs' self-reported status (docs have been wrong in both directions repeatedly).

---

## 2. The Spine

From AVENSTONE_VISION.md: **The job record is the spine. Information captured once, rendered for each actor at their moment in the lifecycle.** Sales captures scope, photos, budget. Rep uses it to win the bid. Client gets a warm welcome. PM gets scope-and-risk for execution. Subs get a pre-job brief. Photos serve installation proof, client progress, and marketing simultaneously. The platform's durable advantage is that every job teaches the system — rates, risks, schedules — so the next job requires less human effort. The end state is guardrailed autonomy: the system acts within rails the owner set, logs everything, and earns the right to act without asking over a proven track record.

---

## 3. Part 1 — Per-Arc Build-State Inventory

Verified 2026-06-19 against component files, edge functions, migrations, and helpers. "Doc claimed" vs "live code" divergences flagged. **Do not trust arc doc self-reported status.**

### SHIPPED (archived — live code confirmed)

| Arc (slug) | What shipped | Key carve-outs |
|------------|-------------|----------------|
| **agent-cards-arc** | All 7 phases: confirm card system, REQUIRED_FIELDS elicitation, 4 card types, contextual job context | Phase 6 (field voice) gated on VOICE_AGENT hands-free |
| **daily-log-arc** | All 5 phases: one-box capture → AI client_message draft → PM review + send → client portal view | — |
| **financials-plan** | Phases 3-6: unified ledger (job_transactions), FinancialsTab, QB CSV export, Field tab consolidation | Phase 7 (Haiku vision receipt extraction) unscheduled |
| **push-notifications-arc** | Phases 1-5: APNs via Capacitor, send-push edge fn, notification-push-fanout trigger | Phase 6 (Web Push) explicitly deferred |
| **sub-invoices-arc** | ALL Phases 1-5: schema, SubInvoicesSection.jsx, cash accounting, Master Agent verbs log_sub_invoice/log_sub_payment/approve_sub_invoice | Phase 6 (sub self-upload via portal) deferred |
| **ai-consultation-blueprint** | ConsultationTab.jsx + AmbientPanel + MeasurePanel + consultation edge fns | — |

---

### ACTIVE ARCS — Live Code Status

#### ESTIMATOR_KNOWLEDGE_ARC — `docs/arcs/`

| Phase | Status | Evidence |
|-------|--------|----------|
| 1 — Rate reconciliation | NOT-BUILT | No reconciliation artifact; hardcoded rates cold-deleted from prompt (not staged as doc intended) |
| 1.5 — Rate Book schema | **BUILT** | `20260616100000_rate_book_schema.sql`; `rate_book_labor` + `rate_book_material` tables live; `RateBookScr.jsx` at `src/components/owner/RateBookScr.jsx` |
| 2 — Supabase connection + prompt injection | **BUILT** | `ai-estimator/index.ts` `loadRateBook(tenantId)` reads both tables; vocabulary injected into SYSTEM_PROMPT |
| 3 — Cite-or-flag + Range Collapse (Job-Size Tier) | **BUILT** | `getTier(projectSf)` from `_shared/rateBook.ts`; tier collapse by unit type active; `source_label` written to `estimate_line_items` |
| 4 — Guided interview w/ pre-filled defaults | **BUILT** | STALE INVENTORY corrected 2026-07-09 — shipped via B1.6 (ab50638 killed hardcoded 30%/$1,200, reads `bid_model_config`) + B2.1 (0bead89 "running your standard X%" preamble in formatEstimate; bd3fb84 configMissing fail-loud). Hardcoded rates gone; pre-fill + override surface live. |
| 5 — Fallback mode (ASK-with-cited-anchor) | **SHIPPED 2026-07-10** | Shipped as behavior, not a config column: missing rate → ASK with a CITED KC anchor (grounded in `ai_knowledge` prose, `anchor_source` cited; uncited → blank ask), rep accept-or-override, both write `rate_book_labor` with provenance. S5A/S6 `b64845c`+`8544bc5` (cited anchor); S3/S4 `1099554`+`b302138` (provenance col + rep-write RLS + vet gate); S7/S8/S9 `81da4eb`+`3dfb900`+`0ee2997` (gap affordances → provenance → `estimate_line_items.rate_provenance` through commit). Doc: `docs/arcs/ESTIMATOR_KNOWLEDGE_ARC.md` shipped section. |
| 6 — Batch unknowns | **BUILT** | GapBatchAsk.jsx + applyGapRates (after-draft sequencing, confirmed live — ESTIMATOR Phase 6, reconciled 2026-06-25) |
| 7 — Learn loop (save gaps to Rate Book) | **BUILT** | sbInsertRateBookLabor + learnCandidates + save offer panel in EstimateTab — ESTIMATOR Phase 7, shipped 2026-06-25 (48aea78 + a84f0fc + 7f95fe5) |

**Net: 6 of 7 phases live** (2, 3, 4, 5, 6, 7 + schema 1.5). **Remaining: Phase 1 only** (rate reconciliation — SYSTEM_PROMPT vs `ai_knowledge` side-by-side; mostly a data task). Phases 4–7 define the guided interview experience.
**~~Critical finding: markup/pm_fee hardcoded in SYSTEM_PROMPT.~~ RESOLVED** — B1.6 (`ab50638`) made the estimator read `bid_model_config`; the hardcoded 30%/$1,200 are gone (see Phase 4 row).

---

#### COST_PLUS_ARC — `docs/arcs/`

| Phase | Status | Evidence |
|-------|--------|----------|
| 0 — checkDepositPaid OR fix | **BUILT** | Fix applied in phaseGates.js + both agent fns 2026-05-27 |
| 1 — Schema foundation | **BUILT** | `20260527050000_cost_plus_phase_1a_schema.sql` + `20260527060000_cost_plus_phase_1b_trigger.sql`; `draw_line_items`, `labor_markup_pct`, `material_markup_pct`, `reimbursement_status` all live |
| 2 — Draw composer UI | **BUILT** | B1.2 shipped (40922d6 sbComposeDraw post-write verify; 6818e62 B1.2.5 double-charge guard) |
| 3 — Draw paid cascade | **BUILT** | B1.3 shipped (4a9d29a unreimbursed stat card on FinancialsTab; 645be45 LOG) |
| 4 — Float visibility (stat cards) | **BUILT** | B1.3 shipped float stat card display to user |
| 5 — Master Agent verbs (compose_draw, record_deposit) | **BUILT** | B1.4 shipped (cff777b compose_draw post-write verify + amountToWords on confirm card; 200ce31 LOG) |
| 6 — Client portal migration | **BUILT** | B1.5 shipped (adade6d draw-based breakdown + seal owner leaks; 6f48624 B1.5.1 payload hardening) |

**Net: 6 of 6 phases live. COMPLETE as of 2026-06-25 via B1.2–B1.5.**

---

#### GOD_AGENT_ARC — `docs/arcs/`

| Phase | Status | Evidence |
|-------|--------|----------|
| B0 — Blueprint | Done | Doc locked |
| B1 — Rep-rate review + promote | NOT-BUILT | No God Agent tab component |
| B2 — Conversational bulk pricing | NOT-BUILT | No conversational pricing UI |
| B3 — pricing_policy edit via conversation | NOT-BUILT | `pricing_policy` JSONB exists (migration `20260618100000_pricing_policy.sql`); no editing surface |
| B4 — Capacity advisor | NOT-BUILT | Gated on Scheduling Intelligence backlog signal |

**Net: 0 of 4 phases live.** Foundation column (`pricing_policy`) + deviation gate (Slice 6.0) exist; no God Agent UI.
**`god_agent_action_log` table: NOT BUILT.** Required for autopilot track record.

---

#### TENANT_ONBOARDING_ARC — `docs/arcs/`

| Phase | Status | Evidence |
|-------|--------|----------|
| 1 — bid_model_config schema | **BUILT** | B1.1 shipped (edd13a6); 1 row confirmed in DB; CONFIRMED-LIVE |
| 2 — Estimate engine reads bid model | **BUILT** | B1.6 shipped (ab50638 ai-estimator, f9afaad EstimateTab; b7db63b LOG) |
| 3 — Allowance as first-class | **SHIPPED 2026-07-10 (estimator S2)** | `41ac4ae` — estimator consumes `bid_model_config` `supply_model` + allowance; `60ea24e` — `client_supplied` badge. `supply_model` is a constrained enum (contractor\|owner); client-supplied wins over allowance; 'Allowance' is a reserved config-driven word in descriptions. |
| 4 — Interview engine + photo-in-interview | NOT-BUILT | Parked in Block 1 after B1.7 (TENANT_ONBOARDING Phase 4-5 explicitly deferred) |
| 5 — Plan upload ingest | PARTIAL | Floor plan upload exists but not on estimate rail |
| 6 — Wizard writes structured config | **BUILT** | B1.7 Phase 3 shipped (19cf93e wizard Save + role-gate migration + round-trip verified) |
| 7 — Onboarding wizard UI | **BUILT** | B1.7 Phases 2–4 shipped (4d33aad BidModelWizard scaffold; 3d88635 retire AiSetupWizard; ai_knowledge.tenant_id NOT NULL CONFIRMED-LIVE) |

**Net: 5 of 7 phases live (+ 1 PARTIAL). Phase 4 not built; Phase 5 PARTIAL. Updated 2026-07-10 (Phase 3 shipped via estimator S2).**

---

#### SCOPE_RISK_ARC — `docs/arcs/`

**Net: 0 of 3 phases live.** Blueprint only. Gated on ESTIMATOR Phase 3 (BUILT — gate is clear).

---

#### ANTI_SURPRISE_ENGINE_ARC — `docs/arcs/`

| Phase | Status | Evidence |
|-------|--------|----------|
| Prereq — Push idempotency fix | PARTIAL | Two push triggers still exist; `push_sent` guard NOT added |
| 1 — Knowledge layer + checklists | **BUILT** | `tenant_playbook_items` (89 items); `anti-surprise-generator` + `anti-surprise-dispatcher` edge fns live; pg_cron active |
| 2 — Dependency engine | PARTIAL | `trade_dependencies` table + 20 seeded rows (migrations `20260604320000/330`); **no cascade runner** |
| 3 — Guideline schedule generation | NOT-BUILT | — |
| 4 — Scheduling agent | NOT-BUILT | — |
| 5 — Vigilance runner | **BUILT** | `vigilance-runner` 11 SQL rules, daily 11:00 UTC; draw-poke float rule outstanding |

**Net: 1.5 of 5 phases live.** Dependency schema exists; execution engine missing.

---

#### SCHEDULING_INTELLIGENCE_ARC — `docs/arcs/`

**Net: 0 of 13 phases live.** Zero code. Trade_dependencies table (from Anti-Surprise Phase 2 schema) is the only relevant foundation.

---

#### CONTRACT_SIGNING_ARC — `docs/arcs/`

| Gap | Status | Evidence |
|-----|--------|----------|
| Gap 1 — LEGAL: no proposal in contract | **FIXED (attorney-cleared 2026-07-10)** | CONTRACT_SIGNING 1b/1c (dc188fc + be66116 + a3be13c): unified `buildContractPDF` renders the accept-time `contract_snapshot` (line items, total, payment schedule) instead of boilerplate; payment schedule frozen into the snapshot at accept, clause-3 fallback when none. **ESIGN/UETA attorney review completed and cleared 2026-07-10 (Open Q1 closed) — legal gate lifted, signing flow cleared for go-live.** |
| Gap 2 — Client can't see proposal in portal | NOT-FIXED | No Documents/Proposal tab in ClientPortal |
| Gap 3 — Send email bug | **FIXED** | `sbSendEstimateEmail` now uses `to: job.client_email` + html body |
| Gap 4 — No IP capture | NOT-FIXED | `contract_signatures.ip_address` column exists but NOT populated by `sbSaveSignature` |
| Gap 5 — Magic links unverified | **RESOLVED 2026-07-09** | send-contract-email migrated off the retired magic link onto the canonical recovery-link pattern (be303ea); existing passwords never reset; sub mis-provisioning bug killed; dead `send-client-link` helpers removed (f51b500, zero callers). No longer blocking. |

**Net: CONTRACT_SIGNING ARC SHIPPED 2026-07-10** (Gap 1 FIXED + attorney-cleared; Gap 3 email fixed; Gap 4 IP capture shipped via 2f8d932/590fea2/3e856f5; Gap 5 magic-link resolved; Gap 6 status lifecycle folded into Model B). **Only elective remains: Gap 2 (portal proposal view).** **STOP LIFTED: ESIGN/UETA attorney review completed and cleared 2026-07-10 (Open Q1 closed) — the signing flow is legally cleared for go-live.** Close-out doc: `docs/arcs/CONTRACT_SIGNING_ARC.md`.

---

#### SELECTIONS_ARC — `docs/arcs/`

**Net: client-facing selections flow SHIPPED via SCOPE_TO_ESTIMATE Phase C (2026-07-11) — on a different substrate than this arc's original 7-phase plan.** Shipped: client soft-pick Selections tab (option cards), PM confirm surface, "N of M locked" Demo gate (enforced at contract→in_progress), realtime. Built on `job_scope_answers` + `scope_checklists.is_selection` (see SCOPE_TO_ESTIMATE below) — NOT the originally-envisioned `selection_templates`/`selection_requests`/`job_selections` tables, which were never built and are superseded by the one-answer-store design. SCOPE_TO_ESTIMATE is the vehicle. **Remains unbuilt vs the old 7-phase row (confirmed against blueprint parked list):** versioned pick history (shipped design is upsert/re-pick — no version stack), SELECTIONS Phase 7 vigilance rules + Aven read tool (parked, §7), visualize render = CLIENT_VISION_RENDER / SCE Phase E (parked stub, §7).

**Product flow (owner-locked 2026-07-11):** Selections open the moment the **Contract phase completes** — the Model B lifecycle event fires the selections window. **Three delivery modes, ONE build:** Zoom walkthrough, homeowner self-serve, or in-person — the *same selections screen*; the mode is a scheduling preference, not a feature. The **PM dashboard gates Demo on selections completion** ("N of M locked"). Four open product questions with recorded leans → see KALIN_QUEUE item (b).

---

#### TODO_NOTIFICATIONS_ARC — `docs/arcs/`

| Phase | Status | Evidence |
|-------|--------|----------|
| 1 — Audit | PARTIAL | `todo_delegated` type exists in schema; routing to `/job/{jobId}/todos` in push-fanout |
| 2 — Trigger logic | PARTIAL | Type exists; no `created_by` vs `assigned_to` suppression logic built |
| 3 — Deep-link to specific todo | NOT-BUILT | `MyTodosScreen.jsx` has no `pendingTodoId`; `notifications` table has no `related_entity_id` for todos |

**Net: 0.5 of 3 phases live.** Type + routing exist; delivery chain incomplete.

---

#### UNIFIED_FILES_ARC — `docs/arcs/`

| Phase | Status | Evidence |
|-------|--------|----------|
| 1 — Schema + migration | **BUILT** | `20260526200000_unified_files_arc_phase_1.sql`; `job_files` table, `tenant_file_subcategories`, `job-files` bucket |
| 2 — Unified Files tab UI | **BUILT** | `FilesTab.jsx` (tree/grid/recent/bulk-tag, 8 sub-components) |
| 3 — Rewire existing surfaces | PARTIAL | Floor plan bridge migration exists; COTab rewired; `DocsTab.jsx` **STILL EXISTS** (not deleted); `log_photo` Master Agent verb **NOT implemented** |
| 4 — Portal views | NOT-BUILT | No `sbLoadFilesForRole` helper |
| 5 — Polish | NOT-BUILT | No Capacitor camera sheet |

**Net: 2 of 5 phases live (plus partial Phase 3).**

---

#### COMPANY_FILES_ARC — `docs/arcs/`

**Net: ALL 6 phases LIVE.** Despite doc Phase Plan table claiming "Planned" for all. Confirmed: `company_files` table + RLS, CompanyFilesScr.jsx admin UI, job-creation hook for client visibility, sub portal CompanyDocsSection, `upload_company_file` Master Agent verb (with Haiku extraction), watchdog scheduled_actions (30d/14d/0d), CompanyFileExpirationBanner. Doc Phase Plan table is stale — ignore it.

---

#### PROOF_ARC — `docs/arcs/`

| Phase | Status | Evidence |
|-------|--------|----------|
| 1 — Schema foundation | **BUILT** | `20260526220000_proof_arc_phase_1.sql`; `photos.category`, `jobs.before_photos_required`, bypass columns on change_orders; `proofConfig.js` with PROOF_CONFIG |
| 2 — CO photo gate | **BUILT** | COTab.jsx uses PROOF_CONFIG; `sbPhoto(..., 'co_condition')` + `sbPhoto(..., 'co_fix')` required; bypass reason stamped |
| 3 — Blocking-todo primitive | NOT-BUILT | No `snooze_count`, `snooze_limit`, escalation columns on `todos`; helpers `sbSnoozeTodo`/`sbRequestTodoBypass` absent |
| 4 — Before photos (optional artifact) | NOT-BUILT | Blocked by Phase 3 |
| 5 — Delivery photo request | NOT-BUILT | Blocked by Phase 3 |
| 6 — Polish + on-device verify | NOT-BUILT | — |

**Net: 2 of 6 phases live.** Blocking-todo primitive (Phase 3) is the reusable piece that unblocks 4-6, lien waivers, COI expiry.

---

#### AGENT_OPS_ARC — `docs/arcs/`

| Phase | Status | Evidence |
|-------|--------|----------|
| 0 — Arc doc | Done | — |
| 1.1 — `scheduled_actions` table + RLS | **BUILT** | `20260520100000_scheduled_actions.sql`; 4 indexes, RLS, trigger |
| 1.2 — Priority enum + `daily_logs` extension | **BUILT** | `20260520110000_scheduled_actions_priority_3level.sql` |
| 2.1 — `add_todo` delegation verb | **BUILT** | In CONFIRM_TOOLS; role-gated; assignee + priority REQUIRED_FIELDS |
| 2.2 — `notify_team_member` verb | **BUILT** | In CONFIRM_TOOLS; role-gated; priority-email gate wired |
| 3 — Scheduler cron infrastructure | NOT-BUILT | No `agent-ops-cron` edge function |
| 4 — set_reminder + set_followup verbs | NOT-BUILT | Neither verb in TOOLS array |
| 5 — Watchdog detectors (4 rules) | NOT-BUILT | No watchdog cron; vigilance-runner is separate (SQL-only, different purpose) |
| 6 — Daily-log hook | NOT-BUILT | — |

**Net: 2 of 6 phases live.**

---

#### ROLE_DASHBOARDS_ARC — `docs/arcs/`

| Surface | Status | Evidence |
|---------|--------|----------|
| Owner dashboard | **BUILT** | `OwnerHomeScr.jsx` with financials KPI tiles (`sbLoadOwnerDashboard`) |
| Generic fallback | **BUILT** | `HomeScr.jsx`: todos + 7-day schedule + weather (same for all non-owner roles) |
| PM-specific brief | NOT-BUILT | No `ProjectManagerHomeScr`; PM gets generic HomeScr |
| Sales Rep brief | NOT-BUILT | No `SalesRepHomeScr` |
| Sub brief | NOT-BUILT | SubPortal exists but not a role-aware brief |
| Client Portal home | NOT-BUILT | Progress stepper exists; no curated brief |
| `sbLoadHomeDashboard` orchestrator | NOT-BUILT | Does not exist in supabase.js |

**Net: 2 of 5 role surfaces live (Owner + generic fallback).**

---

#### VOICE_AGENT — `docs/arcs/`

**Net: 4 of 5 phases live.** STT + TTS + voice confirm all code-shipped (device-verify still pending via TestFlight). Phase 5 (hands-free/continuous) not started.

---

#### FIELD_OPUS_ARC — `docs/arcs/`

**Net: 5.5 of 6 phases live.** All Supabase infra + `FieldOpusPanel.jsx` complete. VM `/dispatch-interactive` endpoint absent — this is a separate service (autofix.avenstonekc.com), not in repo. Blocked on AUTO_FIX_ARC VM setup.

---

#### FLOOR_PLAN_LAYOUT_ARC — `docs/arcs/`

**Net: 10 of 11 phases live.** Phase 5e (send to client) IS BUILT — `send-floor-plan-email` edge fn + `floor_plan_versions` table + `sbSendFloorPlanVersion` + UI in `FloorPlanEditorScr.jsx`. Phase 3 (Opus tiebreaker) intentionally deferred. Phase 6 (confidence scoring) dropped per Kalin. **This arc is functionally complete.**

---

#### FLOOR_PLAN_EDITOR_ARC — `docs/arcs/`

**Status: PARKED by design.** Click-to-reference + talk-to-instruct model chosen; existing manual editor a dead end. Not in the build path.

---

#### AGENT_INTELLIGENCE_ARC — `docs/arcs/`

**Net: 0 of 5 planned architectures live.** North-star blueprint. No `actor_memory` table, no page-specialist sub-agents, no cross-tenant benchmark tables. Correct sequencing: build this in Block 6 after real data exists.

---

#### MATERIAL_SELECTION — `docs/arcs/`

**Net: 0 of 5+ versions live.** No tables, no helpers, no components in production. This is a different feature from SELECTIONS_ARC: MATERIAL_SELECTION = client self-service AI product catalog (chat-driven HD/Lowes browsing). SELECTIONS_ARC = PM-driven trade selections (tile color, paint color, confirm-by workflow). Both are unbuilt; both land in Block 5. Schema coordination needed at build time (both touch `job_selections`-family tables).

#### SCOPE_TO_ESTIMATE — the seam arc — **A/B/C SHIPPED, D/E remain**

**Status: Phases A / B / C1 / C2 SHIPPED + live-verified 2026-07-11; D/E not started. Full spec in `docs/arcs/SCOPE_TO_ESTIMATE_BLUEPRINT.md`.** This arc owns the **handoff seam** the SCE and ESTIMATOR arcs meet at but neither owns end-to-end: scope interview → **persisted** scope answers → `adds_trades` consumption → estimator scope lines → priced draft. One answer store (`job_scope_answers`) serves four consumers — interview persistence (SCE P2), photo intake (SCE P3), SELECTIONS, SUB_WORK_PACKET.

**Phase status (all 2026-07-11, commit hashes git-log-verified):**
- **A — Foundation SHIPPED** (`7c6b661`/`93fea8e`/`a8356b5`/`4a15e2d`/`fdc268b`/`24005fd`): `job_rooms` + `job_scope_answers` migrations; persist `data.answers` at EstimateTab (upsert, staff path) + default-room creation; re-trigger pass over answer values + option labels (closes the measured/card/extracted-can't-fire gap). Answers stop evaporating.
- **B — Read-back pre-fill SHIPPED** (`0dc164e`/`13b045c`/`4aa2e54`/`26fb53d`): interview start/resume loads confirmed+proposed answers into preAnswered; resume skips already-answered fields (cards + AI context).
- **C1 — SELECTIONS opens SHIPPED** (`1fad496`/`2cbe743`/`fd19a67`/`6ae030c`/`93618c1`): `jobs.selections_opened_at` stamp (signing hook + lazy `ensure_selections_open()`); client vet-gate RLS (INSERT forced `source='client_selected'`+`status='proposed'`, no confirmed-row writes) + Phase-A staff policies role-scoped; net-new client Selections tab (reuses ScopeOptionCards) + soft-picks.
- **C2 — PM confirm + gate SHIPPED** (`de65319`/`ddb6ec2`/`1984d64`/`101d9fb`/`0ec19b5`/`8ac5352`/`1a798a2`): `scope_checklists.is_selection` flag + seed (5 day-one trades' choice fields); PM confirm/override surface; selections "N of M locked" gate at contract→in_progress (phaseGates.js — Demo is a schedule-driven trade phase with no interactive gate point); realtime on selections; `client_selected` prefill carrier.
- **D — SUB_WORK_PACKET** (needs `trade_taxonomy` Siding/Deck/Fence/Gutter/Window expansion — prereq) — **NOT STARTED.** **E — CLIENT_VISION_RENDER** — **NOT STARTED** (parked stub, §7).

> **Known debt (agent-gate divergence, logged 2026-07-11):** the selections lock (`checkSelectionsConfirmed`, contract→in_progress) is enforced in `phaseGates.js` (UI path via PhaseAdvanceCard) only. The `advance_phase` copies in `ai-master-agent` + `ai-field-agent` do NOT mirror it — the agent can advance a job past the lock. Real enforcement hole; scoped out of C2 (touched phaseGates.js only). Sync the two edge fns when next touching agent `advance_phase` (rides with Phase D or a standalone 1-prompt slice). Documented in `phaseGates.js` header + CLAUDE_MEMORY.

**Known seams it inherits (audit-proven — do not assume these are wired):** (1) scope answers are **in-memory only** — there is no `job_scope_answers` store; `makeAnswerRecord` produces records that live only in the request/response, so nothing persists an answer's value/source/confidence. (2) `scope_checklists.adds_trades` / `scope_modules.adds_trades` are **seeded but consumed by nothing** — the deterministic engine reads fields, never the trades. (3) the gap protocol (`GapBatchAsk`/`applyGapRates`) assumes scope lines **arrive priced-ready** — it reconciles rates, not scope-to-line translation.

**Rule:** the SCE and ESTIMATOR arcs must NOT make assumptions about this seam (persistence shape, trade-consumption mechanism, scope→line contract) without recording the decision here first. This stub is the coordination point until the blueprint lands.

**Named deliverable — SUB_WORK_PACKET (owner-decided 2026-07-11):** a per-trade, per-room doc sheet auto-assembled from locked selections. Pull the job's confirmed selections → group by trade via `scope_checklists.adds_trades` (**this is `adds_trades`' first consumer**) → group by room → each line = spec + the bound option-card image (`scope_option_images`) → one page per sub, rendered via the existing pdf-lib pipeline. Regenerates on any selection change so subs never work off stale scope. Example shape: *"Paint — Room A: SW Agreeable Gray walls, ceiling flat white"* / *"Tile — Hall bath: white subway herringbone to ceiling, curbless, linear drain, recessed niche, matte black fixtures"* — with pictures. **Gated on:** `job_scope_answers` store (SCE Phase 2/3) + SELECTIONS arc. **Prereq:** `trade_taxonomy` lacks Siding / Deck / Fence / Gutter / Window trades (Phase 1B audit finding) — taxonomy expansion is a prerequisite for packet coverage of those trades.

---

### Confirmed Fuzzy Items

| Item | Finding |
|------|---------|
| `bid_model_config` table | **NOT EXISTS.** No migration. Blocker for TENANT_ONBOARDING. |
| `god_agent_action_log` table | **NOT EXISTS.** No migration. Needed for autopilot track record. |
| `pricing_policy` JSONB | **LIVE.** Migration `20260618100000_pricing_policy.sql`; read by `deviationGate.js`; default `{"tolerance":{"up_pct":30,"down_pct":15}}`. |
| `deviationGate.js` | **LIVE.** `avenstone-vite/src/lib/deviationGate.js`; called from `sendEstimateToClient`. |
| `AiSetupWizard` writes | **PROSE ai_knowledge entries only.** NOT structured config. Must be replaced in TENANT_ONBOARDING Phase 6-7. |
| Estimator hardcoded markup + pm_fee | **STILL HARDCODED in SYSTEM_PROMPT text** (30%, $1,200). Not yet config-driven. Kills Block 1 goal until fixed. |
| `ai-estimator` reads rate_book | **YES — confirmed live.** `loadRateBook(tenantId)` reads both tables at request time. |
| UNIFIED_FILES Phase 3 — DocsTab | **DocsTab.jsx STILL EXISTS.** Not deleted, still importable. Phase 3 incomplete. |
| Contract send email field | **FIXED.** `sbSendEstimateEmail` uses `to: job.client_email`. |
| Magic links (send-client-link) | **UNVERIFIED / POSSIBLY DEAD.** CLAUDE.md: "retired 2026-06-01." Canonical path is `create-client-login`. Must verify before building contract signing. |
| Spine handoff chain — client intake | **MISSING.** AiIntakeWizard is LiDAR scanner only. No project-type-adaptive intake form exists anywhere. |
| Spine handoff chain — role-aware brief | **GENERIC ONLY.** HomeScr shows same todos + schedule + weather for all roles. |
| Spine handoff chain — PM→Sub brief | **MISSING.** SubPortal shows jobs and pricing; no formal PM-provided pre-job brief. |
| `job_rooms` table | **LIVE (SCOPE_TO_ESTIMATE Phase A, 2026-07-11).** Migration `20260711120000`. `id UUID PK, tenant_id, job_id TEXT FK→jobs, label, source CHECK(typed\|scan), scan_room_id, created_at`; idx (tenant_id, job_id). Staff-only RLS at birth; client SELECT added in C1. |
| `job_scope_answers` table | **LIVE (SCOPE_TO_ESTIMATE Phase A, 2026-07-11).** Migration `20260711120100`. The one answer store; `room_id UUID FK→job_rooms, field_key, option_key, value, trade, source CHECK(rep_typed\|rep_card\|measured\|extracted\|client_selected), status DEFAULT 'proposed' CHECK(proposed\|confirmed), confirmed_by/at`; UNIQUE NULLS NOT DISTINCT (tenant_id, job_id, room_id, field_key). Vet-gate client RLS added C1/C2. |
| `jobs.selections_opened_at` | **LIVE (SCOPE_TO_ESTIMATE Phase C1, 2026-07-11).** Migration `20260711130000`. TIMESTAMPTZ; when set, client portal surfaces the Selections tab. Stamped on signing (record-signature-evidence) or lazily via `ensure_selections_open()` on portal load. |
| `scope_checklists.is_selection` | **LIVE (SCOPE_TO_ESTIMATE Phase C2, 2026-07-11).** Migration `20260711140000`. BOOLEAN NOT NULL DEFAULT false; client Selections tab + Demo gate filter on `audience='rep_client' AND is_selection=true`. Seeded for the 5 day-one trades' choice fields. |

---

## 4. Part 2 — Dependency-Ordered Build Map

**Organizing principle (Kalin-confirmed):** The app must HAVE THE INFORMATION before the engine can run. Build the front door for each actor first (gather info), then the engine runs. Start from the OWNER — make the system run start-to-finish beginning with onboarding — then move actor-by-actor outward. End state: AI runs the estimate with no rep required (client self-serves scan + interview).

**Verification model (applies to every block):** Code builds, self-verifies (automated flow-tests prove the plumbing), and pushes. Code then tells Kalin exactly what to look at — the specific live surface, the specific result, and what "right" looks like. Kalin reviews and confirms it's there and correct, or kicks it back. He does not manually execute build or test steps. At role boundaries — when a block ships a surface a real person uses — Code points Kalin to review it from that role's seat. This is a judgment call, not a rote gate on every step: only where a human seat exists and "does this help?" can only be felt from that seat.

---

### Block 1 — Owner Foundation

**What it means:** The owner configures the system. The engine honors that config. Cost-plus is Kalin's billing model — it must work end-to-end. Kill hardcoded fallbacks (30% markup, $1,200 pm_fee).

**Already built (reuses):**
- rate_book_labor + rate_book_material + RateBookScr.jsx (owner edits vetted rates)
- draw_line_items + labor/material_markup_pct + reimbursement_status (schema)
- pricing_policy + deviationGate.js (deviation gate)
- sbComposeDraw / sbGetBucketBalance helpers (exist, no UI)
- Company Files all 6 phases (compliance docs live)
- Proof Arc Phases 1-2 (CO gate + schema)

**What's NOT built (this block builds it):**

**Order rationale:** Draw composer ships before killing hardcoded fallbacks. Reason: draw composer fixes a live double-charge risk on Kalin's own cost-plus billing (real money today). Killing the 30%/$1,200 hardcodes requires `bid_model_config` to read from — so schema goes first, then draw composer clears the immediate billing risk, then the hardcodes die, then the wizard serves future tenants.

| Sub-step | What it does | Prompts | Prereq |
|----------|-------------|---------|--------|
| B1.1 — `bid_model_config` schema | New table: `supply_model` per category, markup per category, allowance flag. Backfill defaults that reproduce current behavior so nothing breaks. **[SHIPPED — edd13a6; 1 row CONFIRMED-LIVE in DB]** | 2 | None |
| B1.2 — Draw composer UI | Expense selector → markup preview → "Generate Invoice" button. Uses existing `sbComposeDraw`. Fixes live double-charge risk on cost-plus billing. **[SHIPPED — 40922d6 composer verify; 6818e62 B1.2.5 double-charge guard]** | 3 | Cost-Plus schema ✓ |
| B1.3 — Draw paid cascade + float visibility | Mark expenses reimbursed on pay. Float stat cards on FinancialsTab (bucket_balance, unreimbursed, client_owes). **[SHIPPED — 4a9d29a unreimbursed stat card; 645be45 LOG]** | 2 | B1.2 |
| B1.4 — Master Agent compose_draw + record_deposit | Confirm-gated verbs for voice/chat draw composition and deposit recording. **[SHIPPED — cff777b post-write verify + amountToWords; 200ce31 LOG]** | 2 | B1.3 |
| B1.5 — Cost-plus client portal | Replace legacy job_cost_items view with draw-based breakdown for cost-plus clients. **[SHIPPED — adade6d draw breakdown; 6f48624 B1.5.1 payload hardening; 9e72860 LOG]** | 2 | B1.4 |
| B1.6 — ai-estimator reads bid_model_config | Replace hardcoded 30% + $1,200 with config read from tenant `bid_model_config`. Add pm_fee read. **[SHIPPED — ab50638 ai-estimator; f9afaad EstimateTab; b7db63b LOG]** | 2 | B1.1 ✓ |
| B1.7 — Onboarding wizard (structured config writer) | New wizard replaces AiSetupWizard prose flow. Writes bid_model_config + markup_category_config + ai_knowledge. Trade-specific Q&A → config rows. **[SHIPPED COMPLETE 2026-06-25 — P1: schema audit (c59056e); P2: 4d33aad BidModelWizard scaffold; P3: 19cf93e wizard Save + role-gate migration; P4: 3d88635 retire AiSetupWizard + ai_knowledge.tenant_id NOT NULL (CONFIRMED-LIVE). All 4 phases done.]** | 4 | B1.1 ✓ |
| FUZZY_JOB_RESOLVER — agent partial job-name matching | Agent resolves partial/fuzzy job references ("log this to 8617") instead of requiring exact name match. Resolver: ILIKE on job name + address fields, scoped to tenant. Exactly-one match → use it; multiple → agent asks which; zero → reports plainly. Touches every job-scoped agent write, not just receipts. [SHIPPED 2026-06-25 — Phase 1 audit + Phase 2 build. Came in under budget: built in 2 prompts not 3 (resolver already existed; fixed broken po_number search + consolidated 3-copy Bug-C divergence into resolveJobByName). Live PO-match bug in receipt-from-photo path fixed as part of this. CONFIRMED-LIVE: resolveJobByName + po_number search at line 879 of ai-master-agent/index.ts.] | 3 | B1.7 |
| DRAW_PDF_POLISH — lender-facing draw-request PDF quality | Three confirmed defects from Draw #1 live flip (1206 W Lucy Webb Rd, Lucy Webb draw). **[SHIPPED 2026-06-25 — (1) Multi-page line items: 49e4cb6 (continuation pages, no truncation cap). (2) Receipt photo quality: 21a8745 (imgproxy resize + parallel fetch + HEIC handling). (3) Logo: REMOVED — logo JPEG embed shipped memory-safe (17a034b) but rendered broken (overlapped city tagline); pulled 23da4ae. Full logo solution PARKED as PDF_BRANDING design-pass arc. Also in scope: WinAnsi safe() crash fix d94fa7c; alpha-PNG OOM guard + batched embed 17a034b. Verified live: 0–70 receipts all ok:true; 37 line items across continuation pages CONFIRMED; no resource ceiling found within available pool. ONE KNOWN CAVEAT: alpha/RGBA receipt PNGs degrade to a labelled placeholder (not crash) — safe but won't display the image. All real-world JEPGs and RGB-PNG receipts embed correctly.]** | 3 | None (draw PDF already ships) |

**Block 1 total: 22 prompts** (17 original + 3 FUZZY_JOB_RESOLVER budgeted + 3 DRAW_PDF_POLISH, locked 2026-06-25; FUZZY came in at 2 vs 3 budgeted, −1 actual) — **BLOCK 1 COMPLETE 2026-06-25.**

**Verify-then-advance:**
- Code verifies: `bid_model_config` rows in DB with correct defaults; estimator reads markup from config (not 30% hardcoded); `job_transactions` updated after compose draw; float balance computed correctly on FinancialsTab.
- Kalin reviews: Code points you to a specific cost-plus job — open FinancialsTab and confirm the float stat cards show bucket_balance + unreimbursed; open EstimateTab and confirm the interview pre-fill shows your actual markup, not 30%.
- Role seat (owner): review the draw composer as the person who composes draws — does the expense selector, markup preview, and resulting invoice reflect how you actually bill?

**Parked in Block 1:** TENANT_ONBOARDING Phases 4-5 (interview engine + plan upload ingest) — after core config is running and Kalin has used it on real jobs

**RECEIPT_MODAL_EXTRACTION — [SHIPPED 2026-07-09 · d167bbd + d35c3dc].** Audit-first (read-only audit corrected the premise: the agent's receipt-from-photo is inline **Sonnet**, NOT a callable Haiku path — do not copy it (Bug C); storage was already unified on the `job-receipts` bucket + `job_files` dual-write; the 3-way paid/pending/draft status toggle already existed). Build: generalized `ai-extract-sub-invoice` (Haiku claude-haiku-4-5) to accept `{bucket,path}` alongside `{jobFileId}` (tenant-isolated via the owning job; bucket allowlist), added `sbExtractReceipt` helper; TransactionModal auto-fills vendor/amount/date/description on upload — pre-fills ONLY untouched fields (user-typed values always win), silent degradation to manual entry on any extraction failure (never gates save). LIVE-VERIFIED 6/6 endpoint tests incl. a real receipt extraction + legacy `{jobFileId}` regression. **LOCKED: status toggle stays UNSCOPED to all roles** (dropped the parked "owner-scoped" idea). CLAUDE.md bucket list corrected (+`job-receipts`, the missing 5th bucket). Original parked note logged 2026-06-25.

**Locked (fast-follow, SHIPPING this dispatch — 2026-06-25):** SUB_NAME_RESOLVER — sub-name matching has the SAME Bug-C divergence the job resolver fixed at 5e2b865: inline `.ilike` copies in `create_schedule_item`, `log_sub_invoice`, `approve_sub_invoice` (and `log_sub_payment` — 4th site found in audit), no shared helper. Fix: two helpers alongside `resolveJobByName` in ai-master-agent/index.ts — `resolveSubContact` (contacts table, for invoice verbs) and `resolveSubProfile` (profiles table, for schedule_item). Prereq: none. Size: ~1 prompt. [SHIPPED 2026-06-25 — see LOG]

---

### Block 2 — The Engine

**What it means:** The estimator uses vetted rates, respects tenant config, guides the rep through a structured interview. Gaps get batch-asked. Confirmed rates get offered back to Rate Book. Scope risks are surfaced in proposals.

**Already built (reuses):**
- ai-estimator Phases 1.5 + 2 + 3 (rate_book connected, range collapse active, source_label)
- EstimateTab 5 sub-tabs
- GapBatchAsk component
- Deviation gate (Slice 6.0)
- bid_model_config (from Block 1)

**What's NOT built (this block builds it):**

| Sub-step | What it does | Prompts | Prereq |
|----------|-------------|---------|--------|
| B2.1 — Guided interview w/ pre-filled defaults | "Running your standard X% — good or different?" pattern. Pre-fill SF, tier, markup, pm_fee from tenant config + job record. Show Keystone Decision 5 UX. **[SHIPPED 2026-06-25 — 0bead89 (backend state-and-proceed preamble in formatEstimate + system prompt update) + bd3fb84 (frontend configMissing fail-loud). AUDIT FINDING: override surface, pre-fill seeding (sbLoadBidModelConfig), and "Running your standard X%" hint were already built in B1.6. Actual gaps: (1) chat preamble stating the rates was absent from formatEstimate output; (2) configMissing=true path showed 0%/$0 with no warning. Both closed. ESTIMATOR Phase 4 now live.]** | 3 | B1.2 |
| B2.2 — Batch unknowns | Collect all missing-rate lines before draft generation. Surface as numbered batch-ask (not one-by-one). **[SHIPPED — already live as GapBatchAsk.jsx + applyGapRates in EstimateTab. Reconciled 2026-06-25. IMPLEMENTATION NOTE: surfaces gaps AFTER the priced draft, not before (rep sees full estimate context + source badges before answering). All 5 acceptance criteria confirmed ✓ except row numbering — numbering + category labels added e2d4cab. After-draft sequencing kept; if before-draft is wanted it's a separate dispatch with a Kalin decision. ESTIMATOR Phase 6 = BUILT.]** | 2 | B2.1 |
| B2.3 — Learn loop | After rep confirms a gap rate, offer "Save to Rate Book?" with confirm. Writes `rate_book_labor` unvetted row. Owner promotes via RateBookScr. **[SHIPPED 2026-06-25 — 48aea78 sbInsertRateBookLabor (upsert, vetted not in payload, post-write verify); a84f0fc save offer UI + learnCandidates state + saveLearnedRates(); 7f95fe5 activate hook in applyGapRates. Labor-only: material gaps excluded (rate_book_material has different tier schema — material save is a follow-up). Unvetted marker: vetted=false (column default). ESTIMATOR Phase 7 = BUILT. **B2.3 read filter (loadRateBook, active=true only, no vetted= filter) CONFIRMED CORRECT by B2.3-VERIFY audit 2026-06-25.** Auto-reuse at the pricing layer is correct and stays. Approval-layer gate for unvetted rep rates lives at B3.1/B3.2 + Block 4 contract signing — see Locked Rule below.]** | 2 | B2.2 |
| SCOPE_CAPTURE_ENGINE — conversational scope capture + multi-source reconciliation | **BLUEPRINT APPROVED 2026-06-25 (commit 1ce3031, doc SCOPE_CAPTURE_ENGINE_BLUEPRINT.md). Forks resolved — Fork 1: retire generate-estimate-from-session = YES (Phase 1A; oh_shit_moments risk capture preserved); Fork 2 / Open Q10: ABSORB Client INTAKE (B5.1-B5.3 become Phase 4 role-instance — NOT separate builds); Fork 3: scope-complete gate = SOFT with visible mark (rep may force-draft; estimate flagged as drafted-from-incomplete-scope).** One role-agnostic capture+reconciliation engine, rendered per role. Replaces silent scope-assumption with checklist-driven, AI-reconciled capture that catches human error before it becomes a change order. Core: the rep's input is a CLAIM, not truth; every channel (typed scope, photos, plans incl. hand-drawn) is evidence; the engine cross-checks evidence against a base checklist + expansion modules and surfaces conflicts + omissions as forced questions before the estimate is real. **Components:** (1) Base checklist per project type — deterministic, anti-hallucination (system knows what a bathroom/kitchen/exterior scope requires; can't silently skip a known fork). (2) Universal expansion modules — cross-cutting, authored once (framing/structural, plumbing relocation, electrical service, water/mold remediation, additions, etc.); each has required fields. (3) Trigger detection — AI reads every source on EVERY answer (not just the opening description) for phrases/concepts that map to a module; firing a module bolts its checklist on; a mid-interview answer can spawn new modules (e.g. "steam shower" → vapor barrier module). (4) Multi-source reconciliation — typed + photo + plan read and extracted; cross-checked; conflicts ("you said tub, photo shows walk-in") and omissions ("plan shows a window in the wet wall you didn't mention") become forced questions; plans/photos can THEMSELVES fire expansion modules (hand-drawn vault on a kitchen sketch → structural module). (5) Residual-unknown pass — anything mentioned but unscopeable by any module → AI flags as explicit "I don't have a module for this, tell me" — never silently assumed or dropped. (6) Interview style — conversational, uncapped (questions earned by input quality: complete scope = near-zero questions; vague = full interview), money/risk-ordered (expensive forks first), batched not death-by-a-thousand-prompts. (7) Vision layer = SEE/CATCH/RECONCILE, never MEASURE — photos auto-answer checklist fields the AI can SEE (fixture type, surface material, layout features, visible damage), each as a confirmable assumption, and surface risk triggers; real quantities stay with tape/LiDAR/Floor Plan arc (LOCKED DESIGN CONSTRAINT). **Role instances (same engine, role-scoped checklists):** Rep = sales capture (scope/finish forks/measurements/bid photos). PM = execution capture (pre-existing conditions, access, staging). Sub = pre-job brief. Client = intake (self-serve) — **RESOLVED 2026-06-25 (Open Q10 → ABSORB): Client INTAKE (B5.1-B5.3) is Phase 4 of this engine. Not a standalone build.** **Reuses (already shipped — connects, does not rebuild):** ConsultationTab + AmbientPanel (mic) + MeasurePanel + consultation_sessions/extractions/measurements; AiIntakeWizard (LiDAR) + Scanner tab; EstimateTab estForm + interviewSf; GapBatchAsk (interaction model). **LOCKED INTEGRATION REQUIREMENT (Kalin, 2026-06-25):** Consultation tab and Estimate tab FLOW TOGETHER. The on-site session must WRITE THE DESCRIPTION and pre-fill/draft the estimate from everything gathered — extraction scope-hints → estForm.scope, measurements → interviewSf + quantities, room scopes → rooms, concerns/risks → special + Scope Risk flags. Capture-once-render-at-desk. Auto-flow, not a manual bridge. The rep sits down to estimate and it's already drafted from the session. This is the spine principle made literal. **Phases (blueprint approved 2026-06-25):** P1A consolidation (~1-2 prompts; SHIPPED 2026-06-25 — one generator, retire gefs pricing, preserve oh_shit_moments risk capture) → P1B checklist/module tables + scope-interview mode (~2-3 prompts; **SHIPPED + LIVE-TESTED 2026-06-26** — bathroom checklist 9 fields money-ordered, 5 modules, interview fires from typed Rooms field, triggers fire on answer, soft-gate force-draft marks scope_origin='incomplete', bathroom seed confirmed live-readable) → P2 session pre-fill (~2-3 prompts; pre-fill FEEDS the interview, does not bypass it — locked) **[+ SCOPE_PREFILL SHIPPED — distinct sub-arc that pre-answers the ScopeConfigurator from jobs.scope TEXT (not session). P2 (`f8557cc`/`2b77dc3`/`967d7a3`): Haiku fn `ai-scope-prefill` (STATEMENT-ANSWERABLE allowlist + server-loaded vocab + verbatim-evidence gate, no writes) + `floor_tile` gains `keep_existing`. P3 SHIPPED 2026-07-16 (`5097e0a`/`fefdb3d`/`cb9b401`): configurator consumption — trigger on zero-answers+non-empty scope; HIGH→confirmed+skipped w/ gold ✦ chip, MED→proposed+pre-selected w/ "from your scope" evidence + one-tap confirm; silent degradation. `job_scope_answers.evidence_phrase` col + source-check widened to allow `scope_prefill`. Live-verified on sandbox: 34→27 open (rep starts ~Q10), suppression cascade holds. **CAVEAT:** high-confirmed `is_selection` prefills (bathroom: `floor_tile`,`toilet`) count toward the phaseGates client-selections lock — flag for owner. **P4a SHIPPED 2026-07-16 (`aacc1b4`/`65c3bf9`):** wired the real Scope-of-Work box to the parser — runScopePrefill now persists estForm.scope→jobs.scope (await) before parsing (the box→estForm→jobs.scope gap was the live bug found by Playwright); re-parses on scope EDIT while never overwriting human-confirmed answers (confirmed_by). Live Playwright acceptance on all 3 fixtures PASS (scope-answered fields pre-filled, none asked blank; suppression cascade holds). **P4b SHIPPED 2026-07-16 (`fc6e852`/`ee9d936`/`28631fa`/`6e7f251` + backfill migration):** stale auto-prefill cleanup on re-parse (never deletes human answers); layout_change=keep_layout reads HIGH on clear stays-put phrasing; selections-gate now source-aware (scope_prefill doesn't lock is_selection fields until a human confirms); Houston void-note mojibake backfilled; Next-Milestone card hidden on complete jobs; Start-fresh button stays visible+disabled after reset. **SCOPE_PREFILL P4 FULLY CLOSED (P4a+P4b).** Open UX note: the re-parse-on-edit path is narrowly reachable (form hidden after Generate) — candidate for an "edit scope after generate" pass. Measurement prefill (floor plan/scan → floor_sf, shower dims) is a separate takeoff-bridge arc, deliberately out of scope-prefill.]** → P3 vision reconciliation, see-not-measure (~2-3 prompts) → P4 role instances + Client INTAKE absorbed (~3-4 prompts). **Role-instance refinement (Kalin, 2026-06-26):** The desk estimator IS the client-faced self-serve path (client answers questions themselves, no rep; AVENSTONE_VISION end-state). CONSULTATION mode is the rep-on-site instance: auto-pulls answers (mic/photos/scan) instead of asking cold, AND surfaces UPSELLS (niche, bench, glass upgrade, heated floor — rep suggestion opportunities). Same engine, different role jobs: client-faced = ask plainly; consultation = capture + upsell. Consultation-mode interview + upsell surfacing = upcoming Phase 2/4 work. **Total: ~10-13 prompts** (revised UP from ~6-8 — audit found parallel generator to retire and answer-source layer to add for Phase 3). **Bathroom gap-list (Kalin to confirm which are real for KC bathrooms before seed tuning):** shower niche, bench/seat, glass enclosure (frameless/framed/curtain — big cost fork currently unasked), shower valve/fixtures (standard/rain/body), subfloor/substrate condition (rotted-subfloor surprise), insulation (exterior wall re-insulate while open). Candidates from two live runs — not yet seeded. Tuning loop: Kalin confirms/cuts/adds → seed edit dispatch. **Phase 1B FULL SEED SHIPPED 2026-07-10 (`fc65746`):** all 9 project types (bathroom 23, kitchen 16, deck 12, addition 9, roof 9, fence 9, basement 9, exterior 8, gut 7) + 15 modules + 37 conflict rules seeded (tenant_id NULL platform defaults) from the owner-locked `docs/arcs/SCOPE_SEED_CONTENT_DRAFT.md`; schema gained `audience`+`risk_note` (`48b55d6`); `VISUAL_ASSET_MANIFEST.md` LOCKED. kitchen scope-interview live-verified money-risk-ordered. Next: P2 session pre-fill / P3 vision. | ~10-13 | B2.3 |
| B2.4 — Scope Risk Phase 1 | Risk knowledge source: extend `tenant_playbook_items` with `is_scope_risk BOOLEAN` + `risk_price_low/high`. Seed Avenstone per-trade library (mold, old plumbing, structural surprises). | 2 | SCOPE_CAPTURE_ENGINE Phase 1 |
| B2.5 — Scope Risk Phase 2 | ai-estimator suggests applicable risks from playbook; rep reviews + includes/excludes before generating. | 2 | B2.4 |
| B2.6 — Scope Risk Phase 3 | "Potential Considerations" section rendered in estimate/proposal. Conditional language, Rate Book ballpark ranges, clearly excluded from quoted total. | 2 | B2.5 |
| FLIP_FINANCIAL_MODEL — job financial-model enum + surface gating | Promote jobs.cost_plus boolean → financial_model enum (flip / cost_plus / fixed_bid). Model gates which financial surfaces render. Flip = draw machinery ON (compose_draw, reimbursement tracking, draw_line_items all reused identically from cost_plus) + bucket/client-deposit accounting OFF (the 4-line bucket island in sbLoadJobFinancialSummary: bucket accumulation + received + bucket_balance + client_float_owed suppressed) + new ARV-vs-cost-basis margin view. Flip is reimbursed against receipts via draws by a lender/partner — NOT a client with a prepaid bucket. Client-portal-billing OFF for flip. Productization: sellable to flippers as non-contractor vertical. Blueprint complete 2026-06-25. 6 phases, ~12 prompts, builds in strict sequence, no cross-phase entanglement. arv converts TEXT→NUMERIC in Phase 1 (locked decision). [SHIPPED COMPLETE 2026-06-25 — all 6 phases. P1: financial_model enum (flip/cost_plus/fixed_bid) + arv NUMERIC. P2: sbLoadJobFinancialSummary flip branch (draws ON, 4-line bucket island OFF). P3: FinancialsTab 3-mode gating, flip stat cards. P4: job-creation picker + create_job agent tool + JobDet header KPI flip mode. P5: client portal gate (no financial surface for flip) + LIVE draw smoke test proven bucket-free on Lucy Webb. P6: Margin sub-tab (ARV input, KPI cards, cost-basis-vs-ARV bar, actual-realization via sale_price/sold_date). Model B dependency confirmed false (was a planning artifact). Came in at 12 prompts as budgeted. 0% markup confirmed correct for flip — profit is the ARV−cost_basis spread, not receipt markup. jobs gained: financial_model TEXT NOT NULL DEFAULT 'fixed_bid' (CHECK flip/cost_plus/fixed_bid), arv NUMERIC, sale_price NUMERIC, sold_date DATE.] | 12 | None (Model B dependency was a planning artifact — confirmed independent by blueprint audit 2026-06-25) |

**Block 2 total: ~35-38 prompts** (13 original + 12 FLIP_FINANCIAL_MODEL + ~10-13 SCOPE_CAPTURE_ENGINE, blueprint approved 2026-06-25; count revised UP from ~6-8 per blueprint audit)

**Verify-then-advance:**
- Code verifies: interview pre-fills with tenant config values (not 30% hardcoded); gap lines surface as numbered batch-ask before draft; offer-to-save appears after a gap rate is confirmed; unvetted row written to `rate_book_labor`; "Potential Considerations" section renders in proposal PDF.
- Kalin reviews: Code points you to a specific estimate — open it and confirm the pre-fill matches your actual markup; walk through a batch-ask and see the save offer appear.
- Role seat (rep): review the interview as the rep running an estimate — does the pre-fill feel natural, does the batch-ask flow cleanly, or does it slow you down?

---

> **LOCKED RULE — Unvetted Rep-Rate Approval Gate (Kalin, 2026-06-25):** Auto-reuse stays at the **pricing layer**: a rep-saved gap rate (\ate_book_labor\, \etted=false\) closes the gap immediately on the next estimate — the rep is NEVER blocked from proceeding. BUT an estimate containing any unvetted rep-entered rate CANNOT reach company-approved/signed state until management clears the rate. The rep moves; the company does not commit its signature to a number the owner has not reviewed. Enforced at the **estimate approval gate (B3.1/B3.2** — reuses \pproval_status\ / \deviationGate.js\ / \sbSetEstimateApproval\; unvetted-rate-present becomes a **second trigger** alongside margin deviation) and the **contract-signing flow (Block 4)**. This is NOT a B2.3 patch — \loadRateBook\ (no \etted=\ filter) is **confirmed correct and unchanged**. The gate lives at the estimate/approval level, not the rate-read level. Rationale: consistent with the anti-surprise/owner-as-rate-gate thesis; expected rare once ~90% of pricing is in the book. (B2.3-VERIFY audit confirmed round-trip MATCH + pricing-layer auto-reuse correct, 2026-06-25.)

---

### Block 3 — The Watcher

**What it means:** AI watches estimates for margin deviation, lets the manager review/promote rep rates, and lets the owner adjust rates conversationally. Foundation for earned autopilot later.

**Already built (reuses):**
- Deviation gate (Slice 6.0): approval_status on job_estimates, deviationGate.js, sbSetEstimateApproval
- pricing_policy JSONB + tolerance bands
- rate_book_labor with vetted/unvetted distinction + RateBookScr.jsx
- Learn loop (Block 2, promotes gaps to Rate Book)

**What's NOT built (this block builds it):**

| Sub-step | What it does | Prompts | Prereq |
|----------|-------------|---------|--------|
| B3.1 — Phase 6.2 approval review UI | Manager sees queue of `awaiting_approval` estimates. Shows which lines triggered gate + why. Approve/reject with reason. **Second trigger (Locked Rule, 2026-06-25): any unvetted rep-entered rate (`rate_book_labor, vetted=false`) present in estimate → flags it `awaiting_approval`, same queue, same `sbSetEstimateApproval` mechanism. Rep never blocked at estimate creation; company signature is blocked until rate is vetted.** | 2 | Slice 6.0 ✓ |
| B3.2 — Phase 6.1 rate promotion | Gap rates rep entered → offered to manager as "promote to Rate Book?" surface (separate from 6.2 approval queue). Promoting a rate (setting `vetted=true`) clears its unvetted-rate approval flag; once all unvetted rates in the estimate are promoted, estimate is unblocked for signing. | 2 | B2.3 + B3.1 |
| B3.3 — `god_agent_action_log` table | Schema: tenant_id, action_type, recommendation JSONB, decision, decision_by, decision_at. Cheap table; needed for autopilot eligibility tracking in Block 6. | 1 | None |
| B3.4 — God Agent tab + Phase B1 (rate review surface) | New "God Agent" tab in owner portal. Shows unvetted rate_book_labor rows. Owner vetoes / adjusts / promotes inline. Logs each decision to action_log. | 3 | B3.3 |
| B3.5 — Phase B2: conversational bulk pricing | Owner types "raise tile labor 10%" → agent parses scope+direction+magnitude → preview table (old→new) → confirm → bulk UPDATE rate_book_labor + log to action_log. | 3 | B3.4 |
| B3.6 — Phase B3: pricing_policy edit via God Agent | "Change my margin tolerance to ±20%" → agent updates tenants.pricing_policy via confirm card. | 2 | B3.5 |

**Block 3 total: 13 prompts**

**Gate:** Phase B4 (capacity advisor) is explicitly parked — needs Scheduling Intelligence backlog-density signal from Block 6.

**Verify-then-advance:**
- Code verifies: estimate submitted by sales_rep lands in `awaiting_approval` state; God Agent tab renders the approval queue with flagged lines; action_log row written after owner decision; `rate_book_labor` updated + logged after a bulk-pricing command.
- Kalin reviews: Code points you to the God Agent tab — confirm the gated estimate appears with the right lines flagged; type a bulk-pricing command and confirm the preview table looks right before confirming.
- Role seat (owner): review the God Agent tab as the person who sets rates — does this feel like real control, or is it still a tech demo?

---

### Block 4 — The Seams

**What it means:** Owner→PM→Sub handoffs. The spine carries the thread. Each role gets a role-aware morning brief. Proactive pokes fire automatically when things slip. Contract signing is fixed before client commitments move through it.

**Already built (reuses):**
- HomeScr.jsx (generic brief), OwnerHomeScr.jsx (owner financial dashboard)
- LogsTab.jsx (daily log, all 5 phases)
- ScheduleTab.jsx (schedule items)
- SubPortal.jsx
- Agent Ops Phases 0-2 (scheduled_actions, add_todo, notify_team_member)
- Anti-Surprise Phase 1 (walkthrough checklists + dispatcher)
- Anti-Surprise Phase 5 (vigilance-runner, 11 SQL rules)
- trade_dependencies table + 20 seeded GC rules (from Phase 2 schema)

**What's NOT built (this block builds it):**

| Sub-step | What it does | Prompts | Prereq |
|----------|-------------|---------|--------|
| B4.1 — Contract signing: Gap 5 verify | **[SHIPPED 2026-07-09 — be303ea + f51b500]** Verified dead: migrated send-contract-email onto the recovery-link pattern (create-client-login canonical), removed dead `send-client-link` helpers (zero callers). Magic links confirmed retired; sub mis-provisioning bug killed as part of the migration. | 1 | Legal review |
| B4.2 — Contract signing: Gap 1 (embed proposal) | **[FIXED 2026-07-10 — CONTRACT_SIGNING 1b/1c: dc188fc + be66116 + a3be13c; attorney-cleared, Open Q1 closed]** Unified `buildContractPDF` renders accept-time `contract_snapshot` (line items, total, payment schedule) + sign-time evidence freeze (fail-loud no-snapshot gate); payment schedule frozen into the snapshot at accept with clause-3 fallback when none. ESIGN/UETA attorney review completed and cleared 2026-07-10 — legal gate lifted. LOCKED: no auto-default payment schedule — optional nudge deferred to future 1d. | 2 | B4.1 |
| B4.3 — Contract signing: Gap 4 (IP capture) | **[SHIPPED 2026-07-10 — 2f8d932 + 590fea2 + 3e856f5]** Migration `20260710120000` adds `ip_address` + `user_agent` (audit correction: the column did NOT pre-exist). `record-signature-evidence` edge fn reads them server-side from request headers; `sbRecordSignatureEvidence` + `ClientSignContractModal` post-save call — enrichment, never blocks/undoes the signature. **CONTRACT_SIGNING arc SHIPPED (see docs/arcs/CONTRACT_SIGNING_ARC.md); remaining Gap 2 portal-proposal-view is elective.** | 1 | B4.2 |
| B4.4 — PM morning brief | `ProjectManagerHomeScr`: active phases + pending subs + overdue schedule items + open COs + draw status. Role-gate in App.jsx. | 2 | None |
| B4.5 — Sales Rep morning brief | `SalesRepHomeScr`: today's active proposals, follow-up todos, pipeline by status (lead/proposal/contract), upcoming consultations. | 2 | None |
| B4.6 — Sub home screen brief | Sub sees: today's scope, other trades on site, EOD log reminder, unpaid invoice status, lien waiver status. | 2 | None |
| B4.7 — Agent Ops Phase 3: scheduler cron | `agent-ops-cron` edge fn + pg_cron wiring. Fires ripe scheduled_actions reminders. Set_reminder / set_followup natural-language date parsing. | 2 | Agent Ops Phases 1-2 ✓ |
| B4.8 — Agent Ops Phase 4: reminder + followup verbs | `set_reminder` + `set_followup` in Master Agent TOOLS. Self-only enforced. Confirm-gated with fire_at readback. | 2 | B4.7 |
| B4.9 — Agent Ops Phase 5: watchdog rules | 4 detection rules: missing daily log (sub or PM), next phase no schedule item, materials not ordered for upcoming trade, CO pending >5 days without decision. Writes scheduled_actions, fires via existing dispatcher. | 3 | B4.7 |
| B4.10 — Agent Ops Phase 6: daily-log hook | Post-save trigger: after PM submits daily log, agent reads note + flags any deviation from schedule or scope. Pre-flight state query before hook fires (don't nag on first log). | 2 | B4.9 |
| B4.11 — TODO_NOTIFICATIONS | Migration: `notifications.related_entity_id UUID` + `related_todo_id UUID`. Suppress self-created todos. `pendingTodoId` prop on MyTodosScreen. Deep-link tap → open job → focus todo. | 3 | None |
| B4.12 — Anti-Surprise Phase 2: dependency cascade engine | Cascade runner: when schedule_item slips, find all successor items via trade_dependencies, reschedule. Cascade preview UI before committing. | 3 | trade_dependencies ✓ |
| B4.13 — Anti-Surprise Phase 3: guideline schedule generation | Auto-populate schedule_items on job status → contract transition. Uses trade_dependencies to set sequence + lag_days. Rep confirms before saving. | 2 | B4.12 |
| B4.14 — Anti-Surprise Phase 4: scheduling agent | Scoped edge fn that answers schedule-risk questions: "will tile start before drywall is done?" Reads trade_dependencies + schedule_items + phase status. | 2 | B4.13 |

**Block 4 total: 29 prompts**

**Prereq note (CLEARED 2026-07-10):** Legal review for contract signing — Kalin consulted a MO-licensed attorney; ESIGN/UETA compliance reviewed and cleared 2026-07-10. Open Q1 closed; the signing flow is legally cleared for go-live.

> **Unvetted rep-rate gate at contract signing (Locked Rule, 2026-06-25):** An estimate containing any \ate_book_labor\ rows with \etted=false\ cannot reach company-approved/signed state. The signing flow (B4.2 + ClientSignContractModal path) must check for unvetted-rate flags and block signing until management promotes them via B3.1/B3.2. Enforced before the contract embeds the estimate total — a contract signed against an unvetted rate is the exact failure the rule prevents.

**Verify-then-advance:**
- Code verifies: PM home screen shows different content than the generic HomeScr; cascade fires on a test schedule slip and produces rescheduled successors; watchdog poke appears in scheduled_actions after the trigger condition; contract PDF includes estimate total + payment schedule before signing.
- Kalin reviews: Code points you to a PM-role login — confirm the brief shows active phase + pending subs (not a generic todo list); open a job with a slipped item and confirm cascade preview; open the contract signing flow and confirm line items are visible.
- Role seat (PM brief): review as PM — does this brief tell you what you need at 7am? Role seat (client contract): review as the client — would you sign this knowing exactly what you're agreeing to?

---

### Block 5 — The Client Front Door

**What it means:** The client's path into the project. Structured intake feeds the estimator (rep gets better data). Eventually client can self-serve: scan + type into estimator, no rep required. Selections close the "what materials?" loop so order proceeds without a phone call.

**Already built (reuses):**
- ConsultationTab.jsx + AmbientPanel + MeasurePanel (on-site AI capture)
- Proof Arc Phases 1-2 (CO gate)
- Unified Files Phases 1-2 (job_files + FilesTab)
- SubPortal.jsx + SubInvoicesSection.jsx
- ClientPortal.jsx (progress stepper, portal exists)
- Floor Plan Layout Arc complete (scan → floor plan → send to client)

**What's NOT built (this block builds it):**

| Sub-step | What it does | Prompts | Prereq |
|----------|-------------|---------|--------|
| B5.0 — Cross-tenant leak fix (gating) | ai-consultation-gap-analyzer reads ai_knowledge via SERVICE_ROLE with no tenant_id filter — cross-tenant leak. Add tenant_id scoping. MUST land before any second tenant onboards. Found in B1.7 Phase 4 audit 2026-06-25. **[SHIPPED 2026-06-25 — 2e98e32. Fix shape (a): consultation_sessions pulled out of Promise.all first to get tenant_id; remaining reads in second Promise.all with ai_knowledge scoped to session.tenant_id. BEFORE: .eq('active',true) / AFTER: .eq('active',true).eq('tenant_id',session.tenant_id). Flagged (not fixed): jobs + job_lidar_scans also read via SERVICE_ROLE with no tenant scope — lower risk (UUID required), follow-up pass.]** | 1 | None (blocks all B5) |
| B5.1 — Client INTAKE arc Phase 1 | **NOTE: B5.1-B5.3 are Phase 4 role-instance dispatches of SCOPE_CAPTURE_ENGINE (Open Q10 RESOLVED 2026-06-25 → ABSORB). Not standalone builds. Client INTAKE extends `scope_checklists`/`scope_modules` with a client-scoped field subset; no pricing. Build occurs as SCOPE_CAPTURE_ENGINE Phase 4, after Phases 1-3 ship.** Schema: `project_types` + `intake_questions` extending scope_checklists for client role. Seed Avenstone-GC project types: kitchen, bathroom, full gut, exterior, fire/water damage, fence, mechanical. | 2 | SCOPE_CAPTURE_ENGINE Phase 3 |
| B5.2 — Client INTAKE arc Phase 2 | Intake UI: project type picker → adaptive question set (from scope_checklists, client role) → answers saved to job. Shows on new-job creation + lead→proposal transition. | 3 | B5.1 |
| B5.3 — Client INTAKE arc Phase 3 | Estimator integration: client intake answers pre-fill the scope-interview (SF, finish tier, scope notes, room list, flagged questions via pre-fill transform in scopeEngine.js). "Form becomes a prompt." | 2 | B5.2 + SCOPE_CAPTURE_ENGINE Phase 2 |
| B5.4 — UNIFIED_FILES Phase 3 | Delete DocsTab.jsx. Add `log_photo` Master Agent verb (writes to job_files). Rewire remaining surfaces (MaterialsTab, LogsTab photo uploads) to unified system. | 2 | Unified Files 1-2 ✓ |
| B5.5 — PROOF Phase 3: blocking-todo primitive | Add snooze_count/limit, escalation_status, escalation_requester/approver to todos. Helpers sbSnoozeTodo, sbRequestTodoBypass, sbApproveTodoBypass. Reusable for lien waivers, COI expiry, permit renewals. | 2 | Proof 1-2 ✓ |
| B5.6 — Lien waiver generation | pdf-lib template from job + sub + payment data. Sign flow in sub portal. Links to `sub_invoices.lien_waiver_file_id`. Blocking-todo fires when paid invoice has no waiver after N days. | 3 | B5.5 + Sub Invoices ✓ |
| B5.7 — SELECTIONS Phase 1: schema | `selection_templates` (what CAN be selected per trade), `selection_requests` (what THIS job needs), `job_selections` (versioned client choices). Seed Avenstone v1: tile + interior paint templates. | 2 | None |
| B5.8 — SELECTIONS Phase 2-3: generator + Selections Session | Auto-generate requests from job trades. Selections Session batch UI: PM + client, grouped by trade, shortlist → confirm. confirm_by date math + base-photo wiring. | 4 | B5.7 |
| B5.9 — SELECTIONS Phases 4-5: PM tab + client confirm | PM Selections sub-tab (track status, send reminders, confirm_by countdown). Client portal confirmation (client reviews + approves, versioned). | 4 | B5.8 |
| B5.10 — SELECTIONS Phase 6: visualize render | Edge fn calling Gemini/image-edit model. "Visualization is an approximation" disclaimer. Approval binds to spec + render version. | 2 | B5.9 |
| B5.11 — Sub workflow upgrades | PM→Sub direct chat thread. Phase start/complete confirmation by sub. CO submission by sub from field. | 4 | SubPortal ✓ |
| B5.12 — UNIFIED_FILES Phases 4-5 | Client + sub filtered folder trees in portals. Mobile camera flow (Capacitor native sheet). Search performance on 200+ file jobs. | 3 | B5.4 |
| B5.13 — GPS/ETA: sub/rep on the way → client portal | Sub taps "I'm on my way" on their job view → captures current location via `navigator.geolocation` (already in `src/lib/gps.js`) → ETA calculated against `jobs.address` via a maps API → client portal shows "Your contractor is X mins away" banner + push notification fires via existing `send-push`. Schema: `job_location_pings(id, job_id, user_id, lat, lng, eta_minutes, triggered_at)`; Realtime subscription in ClientPortal. | 3 | B5.11 (sub job view), ClientPortal ✓, push-notifications ✓ |

**Block 5 total: 37 prompts** _(+3 from GPS/ETA triage 2026-06-19, +1 B5.0 cross-tenant leak fix, locked 2026-06-25)_

**Verify-then-advance:**
- Code verifies: intake questions appear on new-job creation for each project type; estimator pre-fills from intake answers; selections auto-generated for job trades; client portal shows selections with confirm-by date; sub portal shows lien waiver status; GPS ETA appears in client portal when sub triggers "I'm on my way."
- Kalin reviews: Code points you to a new bathroom job — open the intake and confirm the questions match that project type; run the estimate and confirm it pre-filled from intake; open the client portal as the homeowner and walk the selections flow.
- Role seat (client confirming selections): review as the homeowner — is this portal clear enough to use without a rep explaining it? Role seat (rep at intake): did intake save you 10 minutes on the estimate setup?

---

### Block 6 — Autopilot

**What it means:** Earned trust ladder. System proposes, owner confirms. Track record accumulates. After ~6 months of real decisions, system surfaces its own track record and requests bounded opt-in autopilot. Requires all prior blocks running with real data.

**Already built (reuses):**
- pricing_policy JSONB + deviationGate.js
- god_agent_action_log (from Block 3)
- trade_dependencies + Anti-Surprise Phase 2-4 cascade
- All 6 blocks of real operational data

**What's NOT built (this block builds it):**

| Sub-step | What it does | Prompts | Prereq |
|----------|-------------|---------|--------|
| B6.1 — AVEN_MERGE_ARC | Merge ai-master-agent + ai-field-agent into one edge fn with `mode: 'chat'|'voice'`. Role-based tool filtering. Fix log_receipt type divergence (field-agent hardcodes 'material_purchase'). Port create_lead + update_material_status into master. | 5 | All agents stable |
| B6.2 — Scheduling Intelligence MVA (Phases 1-4) | Dependency graph schema additions to schedule_items (duration_days, predecessor_ids, resource_type). Cascade engine. Resource model (sub capacity/double-booking). Lead-time enforcement (material delivery gates trade start). | 11 | B4.12-14 + real schedule data |
| B6.3 — AGENT_INTELLIGENCE: actor_memory layer | `actor_memory` table (user_id, tenant_id, pattern_type, pattern_data JSONB). Per-actor pattern detection. Sub scorecards. | 3 | Block 5 running |
| B6.4 — Trust ladder: eligibility + graduation proposal | Compute eligibility (≥20 decisions + ≥85% approval rate from action_log). Graduation proposal surface in God Agent tab: track record summary + "6% where AI was wrong." | 3 | B3.3 + 6 months data |
| B6.5 — Bounded autopilot execution | Per-action-type autopilot: within margin rails, under max_pct_move, logged with decision_by=null. Fallback to recommend-and-confirm if outside rails. Instantly reversible. | 3 | B6.4 |

**Block 6 total: 25 prompts**

**Gate:** B6.4 requires real data from god_agent_action_log (~6 months of confirm decisions). Do not build graduation UI before the track record exists.

**Verify-then-advance:**
- Code verifies: merged agent handles both chat and voice TOOLS sets; scheduling cascade fires correctly on a test slip; actor_memory rows accumulate; eligibility threshold computed correctly from action_log.
- Kalin reviews: Code points you to the God Agent tab — confirm the graduation proposal surface appears and the track record summary looks accurate.
- No role seat: autopilot is infrastructure + governance, not a human workflow surface.

**Parked — not on the critical path:**
- Scheduling Intelligence Phases 5-13 (weather gating, inspection deps, SLA escalation, Gantt UI, external calendar sync) — after MVA is running with real jobs
- Agent Intelligence cross-tenant benchmarks — after second tenant onboarded
- God Agent Phase B4 (capacity advisor) — gated on Scheduling Intelligence backlog-density signal
- Role Dashboards unified sbLoadHomeDashboard orchestrator — builds naturally as each role screen (B4.4-B4.6) ships

---

## 5. Master Sequence Table

Global build order. Running prompt totals. Every docs/arcs/ arc mapped to where its unbuilt phases land.

| # | Sub-step | Block | Prompts | Running Total | Arc Source |
|---|----------|-------|---------|---------------|-----------|
| 1 | bid_model_config schema ← **START HERE** | B1 | 2 | 2 | TENANT_ONBOARDING Phase 1 |
| 2 | Draw composer UI | B1 | 3 | 5 | COST_PLUS Phase 2 |
| 3 | Draw paid cascade + float visibility | B1 | 2 | 7 | COST_PLUS Phases 3-4 |
| 4 | Master Agent compose_draw + record_deposit | B1 | 2 | 9 | COST_PLUS Phase 5 |
| 5 | Cost-plus client portal | B1 | 2 | 11 | COST_PLUS Phase 6 |
| 6 | ai-estimator kills hardcoded markup/pm_fee | B1 | 2 | 13 | ESTIMATOR Phase 4 (partial) |
| 7 | Onboarding wizard (structured config writer) | B1 | 4 | 17 | TENANT_ONBOARDING Phases 6-7 |
| 8 | Guided interview w/ pre-filled defaults | B2 | 3 | 20 | ESTIMATOR Phase 4 |
| 9 | Batch unknowns | B2 | 2 | 22 | ESTIMATOR Phase 6 |
| 10 | Learn loop (save gaps to Rate Book) | B2 | 2 | 24 | ESTIMATOR Phase 7 |
| 10.5 | SCOPE_CAPTURE_ENGINE — P1A consolidation (one generator, retire gefs); P1B checklist/module + scope-interview; P2 session pre-fill; P3 vision reconciliation; P4 role instances (Client INTAKE absorbed) | B2 | ~10-13 | ~34-37 | SCOPE_CAPTURE_ENGINE (blueprint approved 2026-06-25) |
| 11 | Scope Risk Phase 1: risk source + seed | B2 | 2 | ~36-39 | SCOPE_RISK Phase 1 |
| 12 | Scope Risk Phase 2: estimator integration | B2 | 2 | ~38-41 | SCOPE_RISK Phase 2 |
| 13 | Scope Risk Phase 3: render in proposal | B2 | 2 | ~40-43 | SCOPE_RISK Phase 3 |
| 14 | Phase 6.2 approval review UI | B3 | 2 | ~42-45 | GOD_AGENT B1 (partial) |
| 15 | Phase 6.1 rate promotion UI | B3 | 2 | ~44-47 | GOD_AGENT B1 |
| 16 | god_agent_action_log table | B3 | 1 | ~45-48 | GOD_AGENT B2 prereq |
| 17 | God Agent tab + rate review surface | B3 | 3 | ~48-51 | GOD_AGENT B1-B2 |
| 18 | Conversational bulk pricing | B3 | 3 | ~51-54 | GOD_AGENT B2 |
| 19 | pricing_policy edit via God Agent | B3 | 2 | ~53-56 | GOD_AGENT B3 |
| 20 | Contract signing Gap 5 verify | B4 | 1 | ~54-57 | CONTRACT_SIGNING Gap 5 |
| 21 | Contract signing Gap 1 (embed proposal) | B4 | 2 | ~56-59 | CONTRACT_SIGNING Gap 1 |
| 22 | Contract signing Gap 4 (IP capture) | B4 | 1 | ~57-60 | CONTRACT_SIGNING Gap 4 |
| 23 | PM morning brief | B4 | 2 | ~59-62 | ROLE_DASHBOARDS Phase PM |
| 24 | Sales Rep morning brief | B4 | 2 | ~61-64 | ROLE_DASHBOARDS Phase Rep |
| 25 | Sub home screen brief | B4 | 2 | ~63-66 | ROLE_DASHBOARDS Phase Sub |
| 26 | Agent Ops Phase 3: scheduler cron | B4 | 2 | ~65-68 | AGENT_OPS Phase 3 |
| 27 | Agent Ops Phase 4: reminder + followup verbs | B4 | 2 | ~67-70 | AGENT_OPS Phase 4 |
| 28 | Agent Ops Phase 5: watchdog rules | B4 | 3 | ~70-73 | AGENT_OPS Phase 5 |
| 29 | Agent Ops Phase 6: daily-log hook | B4 | 2 | ~72-75 | AGENT_OPS Phase 6 |
| 30 | TODO_NOTIFICATIONS | B4 | 3 | ~75-78 | TODO_NOTIFICATIONS_ARC |
| 31 | Anti-Surprise Phase 2: dependency cascade | B4 | 3 | ~78-81 | ANTI_SURPRISE Phase 2 |
| 32 | Anti-Surprise Phase 3: guideline schedule gen | B4 | 2 | ~80-83 | ANTI_SURPRISE Phase 3 |
| 33 | Anti-Surprise Phase 4: scheduling agent | B4 | 2 | ~82-85 | ANTI_SURPRISE Phase 4 |
| 34 | Client INTAKE Phase 1: schema (SCE Phase 4 role-instance) | B5 | 2 | ~84-87 | SCOPE_CAPTURE_ENGINE Phase 4 |
| 35 | Client INTAKE Phase 2: UI (adaptive questions) | B5 | 3 | ~87-90 | SCOPE_CAPTURE_ENGINE Phase 4 |
| 36 | Client INTAKE Phase 3: feeds estimator | B5 | 2 | ~89-92 | SCOPE_CAPTURE_ENGINE Phase 4 |
| 37 | UNIFIED_FILES Phase 3: delete DocsTab + log_photo | B5 | 2 | ~91-94 | UNIFIED_FILES Phase 3 |
| 38 | PROOF Phase 3: blocking-todo primitive | B5 | 2 | ~93-96 | PROOF_ARC Phase 3 |
| 39 | Lien waiver generation | B5 | 3 | ~96-99 | New (DOCUMENT_MANAGEMENT_ARC partial) |
| 40 | SELECTIONS Phase 1: schema | B5 | 2 | ~98-101 | SELECTIONS_ARC Phase 1 |
| 41 | SELECTIONS Phases 2-3: generator + Session UI | B5 | 4 | ~102-105 | SELECTIONS_ARC Phases 2-3 |
| 42 | SELECTIONS Phases 4-5: PM tab + client confirm | B5 | 4 | ~106-109 | SELECTIONS_ARC Phases 4-5 |
| 43 | SELECTIONS Phase 6: visualize render | B5 | 2 | ~108-111 | SELECTIONS_ARC Phase 6 |
| 44 | Sub workflow upgrades | B5 | 4 | ~112-115 | SUB_WORKFLOW_ARC (partial) |
| 45 | GPS/ETA: sub/rep on the way → client portal | B5 | 3 | ~115-118 | Idea triage 2026-06-19 |
| 46 | UNIFIED_FILES Phases 4-5: portals + polish | B5 | 3 | ~118-121 | UNIFIED_FILES Phases 4-5 |
| 47 | AVEN_MERGE_ARC | B6 | 5 | ~123-126 | AVEN_MERGE_ARC |
| 48 | Scheduling Intelligence MVA (Phases 1-4) | B6 | 11 | ~134-137 | SCHEDULING_INTELLIGENCE Phases 1-4 |
| 49 | AGENT_INTELLIGENCE: actor_memory layer | B6 | 3 | ~137-140 | AGENT_INTELLIGENCE_ARC (partial) |
| 50 | Trust ladder eligibility + graduation | B6 | 3 | ~140-143 | GOD_AGENT B4 prereq |
| 51 | Bounded autopilot execution | B6 | 3 | ~143-146 | GOD_AGENT autopilot (AVENSTONE_VISION north star) |

**Grand total: ~162-165 Sonnet prompts** across 55 sub-steps in 6 blocks. _(Sequence table base reflects original arc rows only; Block 1 extras FUZZY_JOB_RESOLVER +3, DRAW_PDF_POLISH +3, SUB_NAME_RESOLVER +1 and Block 2 FLIP_FINANCIAL_MODEL +12 are noted in block text but not as sequence rows. Row 10.5 SCOPE_CAPTURE_ENGINE updated to ~10-13 prompts per blueprint approval; all downstream running totals shifted accordingly.)_

> **Annotation (2026-07-11 — no renumber, no total recompute):** Rows 40–43 (SELECTIONS Phases 1–6 = B5.7–B5.10) — the **client-facing portion shipped early** via SCOPE_TO_ESTIMATE Phase C (client soft-pick tab, PM confirm, "N of M locked" Demo gate at contract→in_progress, realtime) on the `job_scope_answers` + `scope_checklists.is_selection` substrate, NOT the `selection_templates`/`selection_requests`/`job_selections` tables these rows assumed. Rows are left in place and unrenumbered per doc-sync scope; what remains of them is versioned pick history (row 42's "versioned" clause) + visualize render (row 43 = CLIENT_VISION_RENDER, parked §7). Prompt counts and running totals unchanged — these rows were never executed as written.

---

## 6. Open Questions for Kalin

| # | Question | Stakes |
|---|----------|--------|
| 1 | **CLOSED 2026-07-10 — Contract signing attorney review.** MO-licensed attorney reviewed the ESIGN/UETA signing flow (priced contract embeds line items + total + payment schedule via 1b/1c) and cleared it. Gap 1 / B4.2 now FIXED; the signing flow is legally cleared for go-live. | RESOLVED — legal gate lifted |
| 2 | **RESOLVED 2026-07-09 — ASK with anchor.** When a rate isn't in Rate Book: ASK the rep, showing the KC regional average as an anchor. Rep accepts the anchor or overrides — BOTH write back to Rate Book with source recorded. No silent regional_avg fallback. This is Phase 5's locked behavior. | RESOLVED — drives ESTIMATOR Phase 5 build |
| 3 | **SELECTIONS day-one trades:** Arc proposes tile + interior paint. Are there others to add at v1? (Cabinets? Countertops? Flooring?) Field judgment needed before B5.7. | Determines template scope for B5.7-B5.9 |
| 4 | **MATERIAL_SELECTION vs SELECTIONS_ARC:** These are different features. MATERIAL_SELECTION = client self-service AI product catalog (chat-driven HD/Lowes). SELECTIONS_ARC = PM-driven trade selections (tile color, paint color, confirm-by). Both write to `job_selections`-family tables. Do you want both? Which first? | Schema coordination at B5.7 if both wanted |
| 5 | **AUTO_FIX_ARC setup session:** Phases A-E require a dedicated 4-6hr VM setup block (DigitalOcean/Hetzner, Claude Code on VM, PM2 listener). This also unblocks FIELD_OPUS Phase 4. When's the right window? Not in the main path — but worth scheduling soon. | Unblocks FIELD_OPUS dispatch + bug auto-repair |
| 6 | **Block 1 order:** Should the draw composer UI (B1.3) come before or after the onboarding wizard (B1.7)? The draw composer is cost-plus (Kalin's current billing); the wizard is for future tenants. If Kalin needs the draw composer NOW for current jobs, it should ship first. Confirm priority. | This week's build order |
| 7 | **PROOF Phases 4-6 (before photos, delivery request):** These sit in Block 5. Are they wanted? Phase 3 (blocking-todo primitive) is the load-bearing piece; 4-6 are additive. Flag if any should be dropped. | Scope decision for Block 5 |
| 8 | **Intake arc: what questions per project type?** B5.1 seeds Avenstone-GC question sets. Kalin knows what a kitchen intake vs bathroom intake vs exterior job actually needs to ask. Input needed before B5.1 schema. | Defines the intake schema |
| 9 | **SCOPE_RISK per-trade risk library (B2.4):** The arc seeds the Avenstone trade-specific risk library (mold, old plumbing, structural surprises, water damage). Kalin knows what surprises actually happen. Input needed before B2.4. | Seeds the risk templates |
| 10 | **RESOLVED 2026-06-25 — ABSORB.** Client INTAKE (B5.1-B5.3) is the **client role instance** of SCOPE_CAPTURE_ENGINE (Phase 4) — same `scope_checklists`/`scope_modules` tables, client-scoped field subset, no pricing. B5.1-B5.3 are NOT standalone builds; they are Phase 4 role-instance dispatches of the engine. Rationale: one capture engine, four role faces (rep/PM/sub/client) — building INTAKE separately creates a second checklist/trigger system that drifts (the two-generator failure this arc is fixing). | RESOLVED — B5.1-B5.3 re-noted as SCOPE_CAPTURE_ENGINE Phase 4 role-instances in Block 5 |

---

## 7. Parked / Not in Path

| Item | Reason not in path | Unblocked by |
|------|--------------------|--------------|
| **GOD_AGENT Phase B4 (capacity advisor)** | Needs Scheduling Intelligence backlog-density signal — meaningless without real schedule data | B6.2 Scheduling Intelligence MVA |
| **Scheduling Intelligence Phases 5-13** (weather, inspection, SLA, Gantt, calendar sync) | MVA (Phases 1-4 = dependency + cascade + resource + lead-time) is the value. Gantt + calendar are enhancement layers | B6.2 running with real data for 30+ days |
| **AGENT_INTELLIGENCE cross-tenant benchmarks** | Requires second tenant onboarded; privacy architecture decisions needed first | v4+ white-label tenant #2 |
| **FIELD_OPUS Phase 4 (VM dispatch)** | VM `/dispatch-interactive` endpoint is outside repo; requires AUTO_FIX_ARC VM setup | AUTO_FIX_ARC infrastructure session |
| **VOICE_AGENT Phase 5 (hands-free/continuous listen)** | Wake word / continuous mode UX is a distinct product decision | Kalin decision when v1 voice is proven on device |
| **TENANT_ONBOARDING Phases 3-5 (allowance, interview engine, plan upload)** | Phase 1 schema + Phase 6-7 wizard are the load-bearing pieces; interview engine + plan upload are enhancement layers | Block 1 running with real tenants |
| **SELECTIONS Phase 7 (vigilance rules + Aven read tool)** | Operational layer on top of a functioning selections flow | B5.9 confirmed working on real jobs |
| **MATERIAL_SELECTION arc (client self-serve AI catalog)** | Different feature from SELECTIONS_ARC; requires schema coordination + a confirmed "which first?" from Kalin | Open question #4 above |
| **ANALYTICS_ARC** (margin by trade, phase duration, sub reliability) | Good but not blocking anything on the path | Block 5 complete — then data exists |
| **AGENT_INTELLIGENCE per-page sub-agents** (estimate-agent, schedule-agent, etc.) | Current master agent architecture handles all pages; page decomposition is optimization not foundation | Block 6 running with data |
| **Floor Plan Phase 3 (Opus tiebreaker)** | Intentionally deferred per Kalin; only worth if real ambiguous edge cases found in Phase 2 testing | Not building; monitor in production |
| **DOCUMENT_MANAGEMENT_ARC** (unified lien/contract/COI/permit surface) | PROOF Phase 3 blocking-todo (B5.5) is the reusable primitive; rest is enhancement | Block 5 + lien waiver (B5.6) |
| **MOBILE_AUDIT_ARC** | UX pass; doesn't block features | Block 4 complete |
| **SALES_PIPELINE_ARC** (leads → qualified → consultations → proposals) | Basic LeadsScr exists; intake arc (B5.1-B5.3) closes the "form becomes a prompt" gap | Block 5 intake complete |
| **GOD_MASTER_AGENT (white-label configurator)** | Requires Avenstone-for-GC shipping to paying customer + 4+ weeks AUTO_FIX data | Stage 2 (first real customer) |
| **PDF_BRANDING (design pass)** | Logo rendering on PDF documents needs a proper visual/layout solution, not piecemeal per-document hacks. History: the draw-package logo took 3 crash-fix rounds (RGBA-PNG alpha → embedPng OOM, resolved 17a034b by JPEG-with-matte) and THEN rendered broken (overlapped the city tagline), so it was removed 2026-06-25. Lesson: the embed is now memory-safe (JPEG, no alpha) but POSITIONING/layout is unsolved. When tackled: solve logo placement ONCE as a shared header pattern, then apply across ALL PDF surfaces that need branding — draw-package, invoices, lien waivers (upcoming), proposals, any send-* PDF. Likely paired with an external design pass for visual polish. Until then, all PDFs use clean text headers (business name + tagline, no logo image). Logged 2026-06-25. | Design pass decision from Kalin |
| **DESIGN_LANGUAGE (fetch-header rules doc)** | A lightweight, agent-fetchable design-language / header-rules doc so every UI-rendering dispatch conforms to one visual language without re-deriving it. Not in path yet. **Standing Opus position: the 1-prompt fetch-header rules doc remains cheap insurance; re-raise before JOBDET_MOBILE dispatches.** | Kalin decision — re-raised before JOBDET_MOBILE |
| **CLIENT_VISION_RENDER (parked arc stub)** | Use the client's OWN job photos (SCE Phase 3 photo intake) + their locked selections as an image-edit prompt to render "your room, renovated" via the Gemini image API. **Rails (owner-locked):** output is watermarked "AI concept — not a rendering of contracted work"; lives in the proposal as a *visualization moment*, NEVER a scope document; the prompt is a mechanical assembly from interview answers (no free generation). **Prompt assembly is mechanical from the answer store: client room photo + locked selections = the edit prompt.** **Sequencing: after SCE Phase 3 + SELECTIONS.** Gated behind the visual-option upload slice (SHIPPED — scope-option-images bucket + bindings) + SCE Phase 3 (photo intake, unbuilt) + SELECTIONS (the locked selections it renders). | SCE Phase 3 (photo intake) + SELECTIONS — the client-photo source + locked selections it renders from |

---

## 8. Captured Ideas — Unplaced

Ideas that have been triaged but don't yet have a clean home in the 6-block sequence. Each is waiting on a named prereq or a Kalin decision before it can be placed.

_First idea → GPS/ETA was triaged and placed as B5.13 (2026-06-19). No unplaced ideas yet._

| Idea | What it's waiting on | Triage date |
|------|---------------------|-------------|
| _(empty — add via triage rule; "Harden client UPDATE RLS on jobs" promoted 2026-07-10 to §0 NEXT CODE DISPATCH)_ | — | — |


