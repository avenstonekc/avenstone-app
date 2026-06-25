# MASTER_BUILD_PLAN.md
**APPROVED — locked 2026-06-19. 6-block order confirmed: Owner Foundation → Engine → Watcher → Seams → Client Front Door → Autopilot.**
**Last full-code audit: 2026-06-19 (all 21 docs/arcs/ verified against live code)**

> **Starting position: B1.1 (bid_model_config schema). Next session begins here.**

---

> **Rule (for Claude and Opus):** Before starting any new phase, arc, or slice, read this file first. Check the build-state inventory for current status. Confirm the requested work is in the correct block given its dependencies. Do not build out of dependency order. If a prompt requests out-of-sequence work, flag it before starting.

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
| 4 — Guided interview w/ pre-filled defaults | NOT-BUILT | Chat exists but no "running your standard X% — good?" pre-fill; markup + pm_fee hardcoded in prompt text (30%, $1,200) |
| 5 — Per-tenant fallback mode config | NOT-BUILT | No `estimator_fallback_mode` column; no tenant config read for fallback |
| 6 — Batch unknowns | NOT-BUILT | No batch labor-ask before draft |
| 7 — Learn loop (save gaps to Rate Book) | NOT-BUILT | No offer-to-save UI |

**Net: 3 of 7 phases live.** Phases 4-7 define the guided interview experience.
**Critical finding:** markup (30%) and pm_fee ($1,200) are **hardcoded in the ai-estimator SYSTEM_PROMPT text** — not read from tenant config. Kills the "honor tenant config" goal of Block 1.

---

#### COST_PLUS_ARC — `docs/arcs/`

| Phase | Status | Evidence |
|-------|--------|----------|
| 0 — checkDepositPaid OR fix | **BUILT** | Fix applied in phaseGates.js + both agent fns 2026-05-27 |
| 1 — Schema foundation | **BUILT** | `20260527050000_cost_plus_phase_1a_schema.sql` + `20260527060000_cost_plus_phase_1b_trigger.sql`; `draw_line_items`, `labor_markup_pct`, `material_markup_pct`, `reimbursement_status` all live |
| 2 — Draw composer UI | NOT-BUILT | Helpers `sbComposeDraw`/`sbGetBucketBalance` exist; no modal UI component |
| 3 — Draw paid cascade | NOT-BUILT | No cascade marking expenses reimbursed |
| 4 — Float visibility (stat cards) | PARTIAL | `float_unreimbursed` calculated in FinancialsTab; **no display to user** |
| 5 — Master Agent verbs (compose_draw, record_deposit) | PARTIAL | `compose_draw` in CONFIRM_TOOLS (not verified wired); `record_deposit` status unclear |
| 6 — Client portal migration | NOT-BUILT | Legacy view still in use |

**Net: 2 of 6 phases live.** Draw composer UI (Phase 2) is the highest-value unbuilt piece — helpers exist, UI missing.

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
| 1 — bid_model_config schema | NOT-BUILT | No migration found; table does not exist |
| 2 — Estimate engine reads bid model | NOT-BUILT | ai-estimator reads rate_book but NOT bid_model_config |
| 3 — Allowance as first-class | NOT-BUILT | Allowances use description convention only |
| 4 — Interview engine + photo-in-interview | NOT-BUILT | — |
| 5 — Plan upload ingest | PARTIAL | Floor plan upload exists but not on estimate rail |
| 6 — Wizard writes structured config | NOT-BUILT | `AiSetupWizard.jsx` writes prose `ai_knowledge` entries — NOT structured config |
| 7 — Onboarding wizard UI | NOT-BUILT | AiSetupWizard is original 7-question prose writer |

**Net: 0 of 7 phases live.** `bid_model_config` absence is load-bearing — blocks all downstream engine phases.

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
| Gap 1 — LEGAL: no proposal in contract | **NOT-FIXED** | `ClientSignContractModal.jsx` renders `DEFAULT_CONTRACT_TEXT(job)` — boilerplate with no line items, price, or payment schedule |
| Gap 2 — Client can't see proposal in portal | NOT-FIXED | No Documents/Proposal tab in ClientPortal |
| Gap 3 — Send email bug | **FIXED** | `sbSendEstimateEmail` now uses `to: job.client_email` + html body |
| Gap 4 — No IP capture | NOT-FIXED | `contract_signatures.ip_address` column exists but NOT populated by `sbSaveSignature` |
| Gap 5 — Magic links unverified | **BLOCKING** | `send-client-link` edge fn exists; CLAUDE.md flags magic links "retired 2026-06-01"; canonical path is `create-client-login` — **must verify before building anything in this arc** |

**Net: 1 of 5 gaps fixed (Gap 3 email).** Legal exposure (Gap 1) is highest priority. **STOP: attorney review required before wiring full signing flow.**

---

#### SELECTIONS_ARC — `docs/arcs/`

**Net: 0 of 7 phases live.** No tables (`selection_templates`, `selection_requests`, `job_selections`), no generator, no UI, no edge functions.

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
| B1.1 — `bid_model_config` schema | New table: `supply_model` per category, markup per category, allowance flag. Backfill defaults that reproduce current behavior so nothing breaks. **Starting gun.** | 2 | None |
| B1.2 — Draw composer UI | Expense selector → markup preview → "Generate Invoice" button. Uses existing `sbComposeDraw`. Fixes live double-charge risk on cost-plus billing. | 3 | Cost-Plus schema ✓ |
| B1.3 — Draw paid cascade + float visibility | Mark expenses reimbursed on pay. Float stat cards on FinancialsTab (bucket_balance, unreimbursed, client_owes). | 2 | B1.2 |
| B1.4 — Master Agent compose_draw + record_deposit | Confirm-gated verbs for voice/chat draw composition and deposit recording. | 2 | B1.3 |
| B1.5 — Cost-plus client portal | Replace legacy job_cost_items view with draw-based breakdown for cost-plus clients. | 2 | B1.4 |
| B1.6 — ai-estimator reads bid_model_config | Replace hardcoded 30% + $1,200 with config read from tenant `bid_model_config`. Add pm_fee read. | 2 | B1.1 ✓ |
| B1.7 — Onboarding wizard (structured config writer) | New wizard replaces AiSetupWizard prose flow. Writes bid_model_config + markup_category_config + ai_knowledge. Trade-specific Q&A → config rows. [Phase 1 schema audit ✓ 2026-06-25 — all 3 tables exist, no blockers. bid_model_config default row confirmed (markup 30 / pm_fee 1200 / contractor). Phase 3 carries a one-line migration adding role-gate (owner/PM) to bid_model_config INSERT/UPDATE RLS — it is the only config table without DB-level write role restriction. Phase 4 carries ALTER TABLE ai_knowledge ALTER COLUMN tenant_id SET NOT NULL.] | 4 | B1.1 ✓ |
| FUZZY_JOB_RESOLVER — agent partial job-name matching | Agent resolves partial/fuzzy job references ("log this to 8617") instead of requiring exact name match. Resolver: ILIKE on job name + address fields, scoped to tenant. Exactly-one match → use it; multiple → agent asks which; zero → reports plainly. Touches every job-scoped agent write, not just receipts. | 3 | B1.7 |

**Block 1 total: 20 prompts** (17 original + 3 FUZZY_JOB_RESOLVER, locked 2026-06-25)

**Verify-then-advance:**
- Code verifies: `bid_model_config` rows in DB with correct defaults; estimator reads markup from config (not 30% hardcoded); `job_transactions` updated after compose draw; float balance computed correctly on FinancialsTab.
- Kalin reviews: Code points you to a specific cost-plus job — open FinancialsTab and confirm the float stat cards show bucket_balance + unreimbursed; open EstimateTab and confirm the interview pre-fill shows your actual markup, not 30%.
- Role seat (owner): review the draw composer as the person who composes draws — does the expense selector, markup preview, and resulting invoice reflect how you actually bill?

**Parked in Block 1:** TENANT_ONBOARDING Phases 4-5 (interview engine + plan upload ingest) — after core config is running and Kalin has used it on real jobs

**Parked (post-Block 1, audit-first):** RECEIPT_MODAL_EXTRACTION — wire existing Haiku receipt-vision path onto the manual Add-Receipt modal (FinancialsTab TransactionModal) so an uploaded receipt auto-fills price/description/vendor/date. Add pending/paid toggle (owner-scoped — explicitly NOT baked into client onboarding flow). Size TBD — opens with an audit confirming whether modal extraction already exists or is agent-chat-only. Logged 2026-06-25.

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
| B2.1 — Guided interview w/ pre-filled defaults | "Running your standard X% — good or different?" pattern. Pre-fill SF, tier, markup, pm_fee from tenant config + job record. Show Keystone Decision 5 UX. | 3 | B1.2 |
| B2.2 — Batch unknowns | Collect all missing-rate lines before draft generation. Surface as numbered batch-ask (not one-by-one). | 2 | B2.1 |
| B2.3 — Learn loop | After rep confirms a gap rate, offer "Save to Rate Book?" with confirm. Writes `rate_book_labor` unvetted row. Owner promotes via RateBookScr. | 2 | B2.2 |
| B2.4 — Scope Risk Phase 1 | Risk knowledge source: extend `tenant_playbook_items` with `is_scope_risk BOOLEAN` + `risk_price_low/high`. Seed Avenstone per-trade library (mold, old plumbing, structural surprises). | 2 | B2.3 |
| B2.5 — Scope Risk Phase 2 | ai-estimator suggests applicable risks from playbook; rep reviews + includes/excludes before generating. | 2 | B2.4 |
| B2.6 — Scope Risk Phase 3 | "Potential Considerations" section rendered in estimate/proposal. Conditional language, Rate Book ballpark ranges, clearly excluded from quoted total. | 2 | B2.5 |

**Block 2 total: 13 prompts**

**Verify-then-advance:**
- Code verifies: interview pre-fills with tenant config values (not 30% hardcoded); gap lines surface as numbered batch-ask before draft; offer-to-save appears after a gap rate is confirmed; unvetted row written to `rate_book_labor`; "Potential Considerations" section renders in proposal PDF.
- Kalin reviews: Code points you to a specific estimate — open it and confirm the pre-fill matches your actual markup; walk through a batch-ask and see the save offer appear.
- Role seat (rep): review the interview as the rep running an estimate — does the pre-fill feel natural, does the batch-ask flow cleanly, or does it slow you down?

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
| B3.1 — Phase 6.2 approval review UI | Manager sees queue of `awaiting_approval` estimates. Shows which lines triggered gate + why. Approve/reject with reason. | 2 | Slice 6.0 ✓ |
| B3.2 — Phase 6.1 rate promotion | Gap rates rep entered → offered to manager as "promote to Rate Book?" surface (separate from 6.2 approval queue). | 2 | B2.3 + B3.1 |
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
| B4.1 — Contract signing: Gap 5 verify | Verify `send-client-link` magic link redirect behavior. One-prompt dispatch: test the send path, confirm working or confirm dead + which alternative to wire. **Legal review is NOT a Sonnet prompt — happens first.** | 1 | Legal review |
| B4.2 — Contract signing: Gap 1 (embed proposal) | Embed the accepted estimate total, payment schedule, and scope summary into the contract before signing. `DEFAULT_CONTRACT_TEXT` reads from estimate + proposal data. | 2 | B4.1 |
| B4.3 — Contract signing: Gap 4 (IP capture) | Populate `contract_signatures.ip_address` from request headers in `ClientSignContractModal.jsx`. | 1 | B4.2 |
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

**Prereq note:** Legal review for contract signing must happen BEFORE B4.1. This is not a Sonnet prompt — it's Kalin consulting a MO-licensed attorney about ESIGN/UETA compliance.

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
| B5.0 — Cross-tenant leak fix (gating) | ai-consultation-gap-analyzer reads ai_knowledge via SERVICE_ROLE with no tenant_id filter — cross-tenant leak. Add tenant_id scoping. MUST land before any second tenant onboards. Found in B1.7 Phase 4 audit 2026-06-25. | 1 | None (blocks all B5) |
| B5.1 — Client INTAKE arc Phase 1 | Schema: `project_types` + `intake_questions` (type-adaptive per project type). Seed Avenstone-GC types: kitchen, bathroom, full gut, exterior, fire/water damage, fence, mechanical. | 2 | None |
| B5.2 — Client INTAKE arc Phase 2 | Intake UI: project type picker → adaptive question set → answers saved to job. Shows on new-job creation + lead→proposal transition. | 3 | B5.1 |
| B5.3 — Client INTAKE arc Phase 3 | Estimator integration: intake answers pre-fill interview fields (SF, finish tier, scope notes, room list, flagged questions). "Form becomes a prompt." | 2 | B5.2 + Block 2 |
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
| 11 | Scope Risk Phase 1: risk source + seed | B2 | 2 | 26 | SCOPE_RISK Phase 1 |
| 12 | Scope Risk Phase 2: estimator integration | B2 | 2 | 28 | SCOPE_RISK Phase 2 |
| 13 | Scope Risk Phase 3: render in proposal | B2 | 2 | 30 | SCOPE_RISK Phase 3 |
| 14 | Phase 6.2 approval review UI | B3 | 2 | 32 | GOD_AGENT B1 (partial) |
| 15 | Phase 6.1 rate promotion UI | B3 | 2 | 34 | GOD_AGENT B1 |
| 16 | god_agent_action_log table | B3 | 1 | 35 | GOD_AGENT B2 prereq |
| 17 | God Agent tab + rate review surface | B3 | 3 | 38 | GOD_AGENT B1-B2 |
| 18 | Conversational bulk pricing | B3 | 3 | 41 | GOD_AGENT B2 |
| 19 | pricing_policy edit via God Agent | B3 | 2 | 43 | GOD_AGENT B3 |
| 20 | Contract signing Gap 5 verify | B4 | 1 | 44 | CONTRACT_SIGNING Gap 5 |
| 21 | Contract signing Gap 1 (embed proposal) | B4 | 2 | 46 | CONTRACT_SIGNING Gap 1 |
| 22 | Contract signing Gap 4 (IP capture) | B4 | 1 | 47 | CONTRACT_SIGNING Gap 4 |
| 23 | PM morning brief | B4 | 2 | 49 | ROLE_DASHBOARDS Phase PM |
| 24 | Sales Rep morning brief | B4 | 2 | 51 | ROLE_DASHBOARDS Phase Rep |
| 25 | Sub home screen brief | B4 | 2 | 53 | ROLE_DASHBOARDS Phase Sub |
| 26 | Agent Ops Phase 3: scheduler cron | B4 | 2 | 55 | AGENT_OPS Phase 3 |
| 27 | Agent Ops Phase 4: reminder + followup verbs | B4 | 2 | 57 | AGENT_OPS Phase 4 |
| 28 | Agent Ops Phase 5: watchdog rules | B4 | 3 | 60 | AGENT_OPS Phase 5 |
| 29 | Agent Ops Phase 6: daily-log hook | B4 | 2 | 62 | AGENT_OPS Phase 6 |
| 30 | TODO_NOTIFICATIONS | B4 | 3 | 65 | TODO_NOTIFICATIONS_ARC |
| 31 | Anti-Surprise Phase 2: dependency cascade | B4 | 3 | 68 | ANTI_SURPRISE Phase 2 |
| 32 | Anti-Surprise Phase 3: guideline schedule gen | B4 | 2 | 70 | ANTI_SURPRISE Phase 3 |
| 33 | Anti-Surprise Phase 4: scheduling agent | B4 | 2 | 72 | ANTI_SURPRISE Phase 4 |
| 34 | Client INTAKE Phase 1: schema | B5 | 2 | 74 | NEW ARC (no existing arc) |
| 35 | Client INTAKE Phase 2: UI (adaptive questions) | B5 | 3 | 77 | NEW ARC |
| 36 | Client INTAKE Phase 3: feeds estimator | B5 | 2 | 79 | NEW ARC |
| 37 | UNIFIED_FILES Phase 3: delete DocsTab + log_photo | B5 | 2 | 81 | UNIFIED_FILES Phase 3 |
| 38 | PROOF Phase 3: blocking-todo primitive | B5 | 2 | 83 | PROOF_ARC Phase 3 |
| 39 | Lien waiver generation | B5 | 3 | 86 | New (DOCUMENT_MANAGEMENT_ARC partial) |
| 40 | SELECTIONS Phase 1: schema | B5 | 2 | 88 | SELECTIONS_ARC Phase 1 |
| 41 | SELECTIONS Phases 2-3: generator + Session UI | B5 | 4 | 92 | SELECTIONS_ARC Phases 2-3 |
| 42 | SELECTIONS Phases 4-5: PM tab + client confirm | B5 | 4 | 96 | SELECTIONS_ARC Phases 4-5 |
| 43 | SELECTIONS Phase 6: visualize render | B5 | 2 | 98 | SELECTIONS_ARC Phase 6 |
| 44 | Sub workflow upgrades | B5 | 4 | 102 | SUB_WORKFLOW_ARC (partial) |
| 45 | GPS/ETA: sub/rep on the way → client portal | B5 | 3 | 105 | Idea triage 2026-06-19 |
| 46 | UNIFIED_FILES Phases 4-5: portals + polish | B5 | 3 | 108 | UNIFIED_FILES Phases 4-5 |
| 47 | AVEN_MERGE_ARC | B6 | 5 | 113 | AVEN_MERGE_ARC |
| 48 | Scheduling Intelligence MVA (Phases 1-4) | B6 | 11 | 124 | SCHEDULING_INTELLIGENCE Phases 1-4 |
| 49 | AGENT_INTELLIGENCE: actor_memory layer | B6 | 3 | 127 | AGENT_INTELLIGENCE_ARC (partial) |
| 50 | Trust ladder eligibility + graduation | B6 | 3 | 130 | GOD_AGENT B4 prereq |
| 51 | Bounded autopilot execution | B6 | 3 | 133 | GOD_AGENT autopilot (AVENSTONE_VISION north star) |

**Grand total: 137 Sonnet prompts** across 53 sub-steps in 6 blocks.

---

## 6. Open Questions for Kalin

| # | Question | Stakes |
|---|----------|--------|
| 1 | **Contract signing: attorney review first?** CONTRACT_SIGNING_ARC explicitly flags ESIGN/UETA compliance exposure (Gap 1: contract signed with no price or line items). Before B4.2, confirm: is a MO-licensed attorney reviewing this? Timeline? | Legal risk — binds clients without seeing what they're paying for |
| 2 | **ESTIMATOR Phase 5 (per-tenant fallback mode):** When a rate isn't in Rate Book, should Avenstone always ask the rep (ask mode) or use regional_avg silently? This is a tenant config value. What's Avenstone's default? | Determines Phase 5 UX and engine behavior |
| 3 | **SELECTIONS day-one trades:** Arc proposes tile + interior paint. Are there others to add at v1? (Cabinets? Countertops? Flooring?) Field judgment needed before B5.7. | Determines template scope for B5.7-B5.9 |
| 4 | **MATERIAL_SELECTION vs SELECTIONS_ARC:** These are different features. MATERIAL_SELECTION = client self-service AI product catalog (chat-driven HD/Lowes). SELECTIONS_ARC = PM-driven trade selections (tile color, paint color, confirm-by). Both write to `job_selections`-family tables. Do you want both? Which first? | Schema coordination at B5.7 if both wanted |
| 5 | **AUTO_FIX_ARC setup session:** Phases A-E require a dedicated 4-6hr VM setup block (DigitalOcean/Hetzner, Claude Code on VM, PM2 listener). This also unblocks FIELD_OPUS Phase 4. When's the right window? Not in the main path — but worth scheduling soon. | Unblocks FIELD_OPUS dispatch + bug auto-repair |
| 6 | **Block 1 order:** Should the draw composer UI (B1.3) come before or after the onboarding wizard (B1.7)? The draw composer is cost-plus (Kalin's current billing); the wizard is for future tenants. If Kalin needs the draw composer NOW for current jobs, it should ship first. Confirm priority. | This week's build order |
| 7 | **PROOF Phases 4-6 (before photos, delivery request):** These sit in Block 5. Are they wanted? Phase 3 (blocking-todo primitive) is the load-bearing piece; 4-6 are additive. Flag if any should be dropped. | Scope decision for Block 5 |
| 8 | **Intake arc: what questions per project type?** B5.1 seeds Avenstone-GC question sets. Kalin knows what a kitchen intake vs bathroom intake vs exterior job actually needs to ask. Input needed before B5.1 schema. | Defines the intake schema |
| 9 | **SCOPE_RISK per-trade risk library (B2.4):** The arc seeds the Avenstone trade-specific risk library (mold, old plumbing, structural surprises, water damage). Kalin knows what surprises actually happen. Input needed before B2.4. | Seeds the risk templates |

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

---

## 8. Captured Ideas — Unplaced

Ideas that have been triaged but don't yet have a clean home in the 6-block sequence. Each is waiting on a named prereq or a Kalin decision before it can be placed.

_First idea → GPS/ETA was triaged and placed as B5.13 (2026-06-19). No unplaced ideas yet._

| Idea | What it's waiting on | Triage date |
|------|---------------------|-------------|
| _(empty — add via triage rule)_ | — | — |
