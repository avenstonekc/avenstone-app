# MASTER_BUILD_PLAN.md
**APPROVED — locked 2026-06-19. 6-block order confirmed: Owner Foundation → Engine → Watcher → Seams → Client Front Door → Autopilot.**
**Last full-code audit: 2026-07-16 (all arcs + Confirmed Fuzzy Items re-verified; orphans adopted; duplicates collapsed). Corrected remaining total: ~100-105 Sonnet prompts.**

> **Rule (for Claude and Opus):** Before starting any new phase, arc, or slice, read this file first. Check the build-state inventory for current status. Confirm the requested work is in the correct block given its dependencies. Do not build out of dependency order. If a prompt requests out-of-sequence work, flag it before starting.

---

## 0. Now / Next — open blockers (owner + code)

### KALIN_QUEUE — the owner's open decisions & actions

Owner blockers are tracked here so they are as visible as Code's build map. **Maintenance rule:** any dispatch that creates an owner decision/action MUST add it here; any report that resolves one MUST remove it.

| # | Owner action | Blocks / why it matters | Open since |
|---|--------------|-------------------------|------------|
| ~~a~~ | ~~**Red-pen `SCOPE_SEED_CONTENT_DRAFT.md`** → manifest lock + Blake upload~~ **RESOLVED 2026-07-10** — draft dropped + locked; SCE Phase 1B full seed SHIPPED (`fc65746`); manifest LOCKED. | ~~2026-07-07~~ |
| b | **Answer the SELECTIONS four product questions** — leans recorded inline. **(1) Day-one trades** — _lean:_ tile, flooring, cabinets/counters, fixtures/finishes, paint. **(2) Base photo source for renders** — _lean:_ rep scope photos primary, homeowner fallback. **(3) Render visibility** — _lean:_ rep-mediated first. **(4) Tap-approve** — _lean:_ SOFT until PM confirms batch. | **Blocks:** SELECTIONS versioned-pick-history, CLIENT_VISION_RENDER, SUB_WORK_PACKET | June 2026 |
| c | **Status-picker corrections** (owner-only): `1206 W Lucy Webb Rd` → `lead`; `999 Test Lane` → its true stage | Model B Phase 2 surfaced genuine `jobs.status` lies | 2026-07-10 |
| d | **One browser sign on `456 Test Flow Ave`** (client seat: `kalinspratling@gmail.com`) | Verifies CONTRACT_SIGNING evidence chain end-to-end | 2026-07-10 |
| ~~e~~ | ~~**Enable billing on the Gemini API project**~~ **RESOLVED 2026-07-10** — 195 visual-option assets generated; validator READY 56/56. | ~~2026-07-10~~ |
| ~~f~~ | ~~**Blake confirm paid-status of 6 Houston rows**~~ **RESOLVED 2026-07-15** — 6 rows relabeled + flipped to `paid`. | ~~2026-07-15~~ |
| ~~g~~ | ~~**Aguayo carpet on 8617 Houston?**~~ **RESOLVED 2026-07-15** — No carpet line in Aguayo scope. | ~~2026-07-15~~ |
| h | **Kalin: $100 discrepancy with Aguayo** — books stay at $17,000 paid (correct per checks). | 2026-07-15 |
| i | **Kalin: pay Aguayo remainder $16,563.06** — log via `add_sub_invoice_payment_with_ledger`. | 2026-07-15 |
| ~~j~~ | ~~**Countertops bathroom rates**~~ **RESOLVED 2026-07-16** — $85/SF (all-in, Sarto E79731 + Euroselect 13774 midpoint), $135/ea sink cutout, $120/job template fee. Migration `20260716200000`. N=2 deep-equal $10,046.73. | ~~—~~ |
| ~~k~~ | ~~**Confirm `takeoff_unit_costs` as single rate authority**~~ **RESOLVED 2026-07-16** — P3+P4 shipped; `price_plan` reads `takeoff_unit_costs` exclusively. | ~~—~~ |

### NEXT CODE DISPATCH — locked sequence (Kalin 2026-07-16)

**TIER 1 — Hygiene (in progress or trivially next):**
1. ~~Agent selections-gate source-awareness (audit D3)~~ **DONE** — `8303070` + `582ff3d` (9 unit tests); both agent mirrors now source-aware, divergence-guard comments added. Audit D3 closed.
2. **This plan rewrite** — current task.
3. **ESTIMATE_CONFIGURATOR chat-path retirement (~1-2)** — the tap-through configurator is SHIPPED (S1 = `handleScopePlan` in `ai-estimator`, S2 = `ScopeConfigurator.jsx`; shipped under SCOPE_PREFILL/SCOPE_TO_ESTIMATE names). One open remnant: retire the old free-text scope-interview chat path so reps can't fall back to the LLM interview loop. See ESTIMATE_CONFIGURATOR section below.

**TIER 2 — Estimating spine:**
4. **Untranslated-fields content phase (~2-4)** — `scopeTranslation.js` entries + takeoff lines for the 5 currently-untranslated fields: `heated_floor`, `shower_glass`, `ventilation`, `shower_entry`, `layout_change`. Currently surfaced as "Captured but not yet priced" UI notice.
5. **Clean-job test run (~1)** — 3 configurator scenarios (full remodel / tile-only / vanity swap), partly Kalin driving UI and partly Playwright. Validates the full scope→price→commit pipeline on real data.
6. **SCE reset RLS diagnosis (~1)** — dispatch exists. Fire it. Verify scope answer reset correctly enforces RLS (source-scoped delete, not blanket wipe of human answers).

**TIER 3 — Next major arc (locked):**
7. **SCOPE_RISK B2.4-B2.6 (~7)** — risk knowledge source, estimator integration, "Potential Considerations" in proposal. Gated on SCOPE_CAPTURE_ENGINE Phase 1 (BUILT — gate clear).

**On-deck after SCOPE_RISK (audit D3 evidence: three stale gate copies → agent merge is urgent):**
8. **AVEN_MERGE B6.1 (~5)** — merge `ai-master-agent` + `ai-field-agent` into one edge fn. D3 (three independent gate copies that drifted) is the standing proof that two agent codebases are maintenance debt. AVEN_MERGE promoted ahead of its original Block 6 position; ships after SCOPE_RISK.

**EXPLICITLY PARKED (record as such — do not dispatch):**
- Wizard-path unification (PRICE_DETERMINISM parked v): two separate scope→price pipelines; accepted v1 divergence.
- Block 3 (The Watcher — B3.1-B3.6): follows SCOPE_RISK + AVEN_MERGE.
- Block 6 remainder (B6.2-B6.5): requires 6+ months real data.
- Flow-redesign session (full estimate-tab UX redesign): needs Kalin design time, not a dispatch.
- MODEL_B Phase 3 (jobs.status source-of-truth flip): parked until something actually blocks on it; not blocking SCOPE_RISK.

### HARD DEPENDENCY GATE — Model B Phase 3

**Model B Phase 3 (the `jobs.status` source-of-truth flip) is a hard dependency gate for `JOBDET_MOBILE` and any other arc that renders job lifecycle state.** (Model B Phases 1–2 shipped 2026-07-10; see `docs/arcs/MODEL_B_LIFECYCLE.md`. Phase 3 entry criteria: divergence reduced to semantics-only + soak period.) **Parked until something gates on it — not blocking SCOPE_RISK. ~5-10 prompts when it runs.**

---

## 1. Purpose

Single dependency-ordered source of truth for realizing the Avenstone vision. Every session that starts new work checks this document first. The inventory is verified against live code — never against the docs' self-reported status.

---

## 2. The Spine

Job record is the spine. Information captured once, rendered per actor at their lifecycle moment. Platform's durable advantage: every job teaches the system (rates, risks, schedules) so next job requires less effort.

---

## 3. Part 1 — Per-Arc Build-State Inventory

Last verified: 2026-07-16 (full-code audit, commits verified against git log and information_schema).

---

#### ESTIMATE_CONFIGURATOR — SHIPPED (audit O6 / DUP3 closeout)

**Status: SHIPPED.** The tap-through configurator is live. Delivered incrementally under SCOPE_PREFILL and SCOPE_TO_ESTIMATE names — not under this label in prior plan entries, which caused double-counting.

| Slice | Status | Evidence |
|-------|--------|----------|
| S1 — `scope_plan` deterministic mode | **SHIPPED** | `handleScopePlan` in `ai-estimator/index.ts`; no LLM call; returns ordered field list + `scope_complete` flag |
| S2 — `ScopeConfigurator` component + EstimateTab wiring | **SHIPPED** | `ScopeConfigurator.jsx`; big option cards; progress; persist via Phase-A store; hand-off to `price_plan` pricing path |
| Remnant — chat-path retirement | **OPEN (~1-2)** | Old free-text scope-interview chat path still exists; reps can fall back to LLM interview loop. Retire it so configurator is the only path. |

**Archive slug:** `estimate-configurator-shipped-2026-07-16` → `CLAUDE_ARCHIVE.md`.

---

#### CONFIGURATOR_POLISH — SHIPPED (audit O1 orphan adoption)

**Status: ARC FULLY COMPLETE 2026-07-12.** All phases shipped. Was not in plan at all (orphan).

| Phase | Status |
|-------|--------|
| Phase 1 — PDF fixes (proposal PDF defects from first live bathroom run) | **SHIPPED** |
| Phase 3 — suppression + existing-conditions + orphan handling | **SHIPPED** |
| Vanity addendum | **SHIPPED** |
| Phase 4a — option display labels as data | **SHIPPED** |
| Phase 7 — shower_valve + membrane_type option images | **SHIPPED** |
| Phase 4b/c/d — language + helpers + tier framing | **SHIPPED** |
| Phase 5 — unit↔lump-sum toggle (GapBatchAsk) | **SHIPPED** |
| Phase 6 — polished ending + button collapse | **SHIPPED** |

**Archive slug:** `configurator-polish-arc-complete-2026-07-12` → `CLAUDE_ARCHIVE.md`.

---

#### SCOPE_VISION P1-P2 — SHIPPED (audit O2 orphan adoption)

**Status: P1 + P2 SHIPPED 2026-07-16. P3 (reconciliation) stays open under SCOPE_CAPTURE_ENGINE.**

| Phase | Status | Evidence |
|-------|--------|----------|
| P1 — photos build the scope (`ai-scope-vision` Haiku fn) | **SHIPPED** | `a260e6e` + `87c3aba` — vision fn loads job photos, pre-answers existing-condition fields as `source='photo'` `status='proposed'`; never measures |
| P2 — scan feeds floor_sf + ceiling height as measured answers | **SHIPPED** | `6920542` — `sbLoadScanMeasurements`; SF auto-fills in EstimateTab; `floor_sf` + `wall_height_in` as `source='measured'` `status='confirmed'` |
| P3 — full vision reconciliation (cross-check typed scope vs photo vs plan) | **OPEN** | Tracked under SCOPE_CAPTURE_ENGINE Phase 3 below |

**Archive slug:** `scope-vision-p1-p2-shipped-2026-07-16` → `CLAUDE_ARCHIVE.md`.

---

#### MODEL_B_LIFECYCLE — Phases 1-2 SHIPPED, Phase 3 parked (audit O3 orphan adoption)

**Status: Phases 1-2 SHIPPED 2026-07-10. Phase 3 is the JOBDET_MOBILE hard gate; parked until something blocks on it.**

| Phase | Status | Evidence |
|-------|--------|----------|
| Phase 1 — financial_model enum + jobs.status shadow panel | **SHIPPED** | `7a3a3e6` + audit |
| Phase 2 — jobs.status lies surfaced (shadow-panel divergence visible) | **SHIPPED** | `2c4695d` + MODEL_B_AUDIT.md |
| Phase 3 — jobs.status source-of-truth flip (write path moved server-side) | **OPEN (~5-10)** | Hard gate for JOBDET_MOBILE; entry criteria: shadow panel divergence = semantics-only + soak. Parked. |

See `docs/arcs/MODEL_B_LIFECYCLE.md`.

---

#### SCOPE_OPTION_IMAGES + SCOPE_OPTION_TRADES — SHIPPED (audit O4 visual assets note)

**Status: SHIPPED.** `scope_option_images` bucket + bindings live (CONFIGURATOR_POLISH Phase 7). `scope_option_trades` table seeded (4 bathroom trades mapped, commit `18cfc4e`). `sbBuildSubWorkPacket` helper exists. Both are prerequisites for SUB_WORK_PACKET (B5 — not yet built).

---

#### FLOORPLANEDITORSCR — parked, decision owed (audit O5)

**Status: PARKED. File exists, not dead — decision owed: wire it or delete it.**

`FloorPlanEditorScr.jsx` exists at `src/components/floorPlan/FloorPlanEditorScr.jsx`. Edit button hidden in FloorPlanTab (2026-07-12 — `docs/FLOOR_PLAN_EDITOR_ARC.md` updated). Manual editor confirmed broken on angled scans. Future model: click-to-reference + talk-to-instruct → AI ops → geometryOps (geometryOps Phase 1 = 40 tests, built). **Explicit decision needed before next major UI pass: wire to new model or delete file.**

---

#### ESTIMATOR_KNOWLEDGE_ARC

| Phase | Status | Evidence |
|-------|--------|----------|
| 1 — Rate reconciliation | NOT-BUILT | No reconciliation artifact |
| 1.5 — Rate Book schema | **BUILT** | `rate_book_labor` + `rate_book_material` + `RateBookScr.jsx` |
| 2 — Supabase connection + prompt injection | **BUILT** | `loadRateBook(tenantId)` reads both tables |
| 3 — Cite-or-flag + Range Collapse | **BUILT** | `getTier(projectSf)`; `source_label` to `estimate_line_items` |
| 4 — Guided interview w/ pre-filled defaults | **BUILT** | B1.6 + B2.1: config-driven, hardcoded rates gone |
| 5 — Fallback mode (ASK-with-cited-anchor) | **SHIPPED 2026-07-10** | S5A-S9 commits; rep accept/override; provenance to `rate_book_labor` + `estimate_line_items.rate_provenance` |
| 6 — Batch unknowns | **BUILT** | `GapBatchAsk.jsx` + `applyGapRates` |
| 7 — Learn loop (save gaps to Rate Book) | **BUILT** | `sbInsertRateBookLabor` + `learnCandidates` + save offer panel |

**Net: 6 of 7 phases live.** Phase 1 (rate reconciliation) only remaining.

**DIVERGENCE CORRECTION (2026-07-16 seam audit):** Estimator pricing was NOT quantity-deterministic. LLM chose which lines + quantities freely; spread 33-108% confirmed by harness. PRICE_DETERMINISM arc below resolves this.

---

#### PRICE_DETERMINISM — arc COMPLETE (all P1-P5 shipped 2026-07-16)

**Goal:** same scope of work → same price, every run. LLM demoted from quantity-inventer to perception/narrative.

| Phase | Status | Evidence |
|-------|--------|----------|
| Audit — seam audit | **DONE** | 6-section audit |
| P1 — extract pure pricingCore | **DONE** | `d1123f6`; 24/24 unit tests |
| P2 — translation layer | **DONE** | `scopeTranslation.js`; 40/40 tests; sandbox byte-identical |
| P3 — `price_plan` edge mode | **DONE** | `9b14f26`; shared `_shared/` modules |
| P4 — EstimateTab wiring | **DONE** | `d14304d` + `00401f0`; persistence race closed; `scope_empty` guard |
| P5 — harness re-point + PASS | **DONE** | N=10: spread=$0.00, deep-equal PASS; perturbation PASS |
| Countertops rates | **DONE** | `ba01fdc`; $85/SF + $135/ea + $120/job; N=2 $10,046.73 |

**Parked follow-ups (non-blocking):**
- (i) Untranslated fields — see Tier 2 dispatch above.
- ~~(ii) Countertops rates~~ **CLOSED** — `ba01fdc`.
- (iii) rate_book_labor vs takeoff_unit_costs reconciliation — two rate tables; long-term.
- (iv) Legacy LLM scope-pricing branch removal — deprecated, functional; remove when flip pricing redesigned.
- (v) Wizard path lacks translateAnswers — accepted P2 divergence.

---

#### COST_PLUS_ARC — COMPLETE

| Phase | Status |
|-------|--------|
| 0 — checkDepositPaid fix | **BUILT** |
| 1 — Schema foundation | **BUILT** |
| 2 — Draw composer UI | **BUILT** |
| 3 — Draw paid cascade | **BUILT** |
| 4 — Float visibility | **BUILT** |
| 5 — Master Agent verbs | **BUILT** |
| 6 — Client portal migration | **BUILT** |

**Net: 6 of 6 phases. COMPLETE 2026-06-25.**

---

#### GOD_AGENT_ARC

| Phase | Status |
|-------|--------|
| B0 — Blueprint | Done |
| B1 — Rep-rate review + promote | NOT-BUILT |
| B2 — Conversational bulk pricing | NOT-BUILT |
| B3 — pricing_policy edit | NOT-BUILT |
| B4 — Capacity advisor | PARKED (needs Scheduling Intelligence signal) |

**Net: 0 of 4 phases live.** `pricing_policy` JSONB + deviation gate exist; no God Agent UI.

---

#### TENANT_ONBOARDING_ARC

| Phase | Status | Evidence |
|-------|--------|----------|
| 1 — bid_model_config schema | **BUILT** | `edd13a6`; 1 row CONFIRMED-LIVE in DB (audit D1 corrected) |
| 2 — Estimate engine reads bid model | **BUILT** | `ab50638` (ai-estimator) + `f9afaad` (EstimateTab); hardcoded rates gone |
| 3 — Allowance as first-class | **SHIPPED 2026-07-10** | `41ac4ae` — `supply_model` + allowance consumed; client_supplied badge `60ea24e` |
| 4 — Interview engine + photo-in-interview | NOT-BUILT | Parked after B1.7 |
| 5 — Plan upload ingest | PARTIAL | Floor plan upload exists; not on estimate rail |
| 6 — Wizard writes structured config | **BUILT** | `19cf93e` |
| 7 — Onboarding wizard UI | **BUILT** | `4d33aad` scaffold; `3d88635` retires AiSetupWizard (audit D1 corrected: AiSetupWizard IS retired) |

**Net: 5 of 7 phases live (+ 1 PARTIAL). Phase 3 SHIPPED 2026-07-10 (audit D4 fix). Phase 4-5 parked.**

---

#### SCOPE_RISK_ARC

**Net: 0 of 3 phases live.** Blueprint only. Gate clear (ESTIMATOR Phase 3 BUILT). Next arc on the locked sequence (Tier 3 above).

---

#### ANTI_SURPRISE_ENGINE_ARC

| Phase | Status |
|-------|--------|
| Prereq — Push idempotency | PARTIAL |
| 1 — Knowledge layer + checklists | **BUILT** |
| 2 — Dependency engine | PARTIAL (schema + 20 rows; no cascade runner) |
| 3 — Guideline schedule generation | NOT-BUILT |
| 4 — Scheduling agent | NOT-BUILT |
| 5 — Vigilance runner | **BUILT** (11 SQL rules, daily 11:00 UTC) |

**Net: 1.5 of 5 phases live.**

---

#### SCHEDULING_INTELLIGENCE_ARC

**Net: 0 of 13 phases live.** Zero code. `trade_dependencies` table (from Anti-Surprise Phase 2 schema) is the only foundation.

---

#### CONTRACT_SIGNING_ARC — SHIPPED 2026-07-10

| Gap | Status |
|-----|--------|
| Gap 1 — Proposal in contract | **FIXED** — `dc188fc` + `be66116` + `a3be13c`; attorney-cleared ESIGN/UETA |
| Gap 2 — Client can't see proposal in portal | NOT-FIXED (elective) |
| Gap 3 — Send email bug | **FIXED** |
| Gap 4 — No IP capture | **SHIPPED** — `2f8d932` + `590fea2` + `3e856f5`; IP + user_agent from headers |
| Gap 5 — Magic links unverified | **RESOLVED** — `be303ea`; confirmed dead, canonical path is `create-client-login` (audit D1 corrected) |

**Net: ARC SHIPPED 2026-07-10.** Gap 2 portal-proposal-view is the only elective remaining.

---

#### SELECTIONS_ARC

**Net: client-facing flow SHIPPED via SCOPE_TO_ESTIMATE Phase C (2026-07-11).** Shipped on `job_scope_answers` + `scope_checklists.is_selection` substrate, not the original `selection_templates`/`selection_requests`/`job_selections` tables (those were never built; superseded). **Remains unbuilt:** versioned pick history (~1-2 prompts — see collapsed B5 rows below).

---

#### TODO_NOTIFICATIONS_ARC

**Net: 0.5 of 3 phases live.** Type + routing exist; delivery chain incomplete.

---

#### UNIFIED_FILES_ARC

| Phase | Status |
|-------|--------|
| 1 — Schema + migration | **BUILT** |
| 2 — Unified Files tab UI | **BUILT** |
| 3 — Rewire surfaces | PARTIAL (DocsTab.jsx still exists; `log_photo` verb not implemented) |
| 4 — Portal views | NOT-BUILT |
| 5 — Polish | NOT-BUILT |

**Net: 2 of 5 phases live (plus partial Phase 3).**

---

#### COMPANY_FILES_ARC — ALL PHASES LIVE

All 6 phases confirmed live. Doc Phase Plan table is stale — ignore it.

---

#### PROOF_ARC

| Phase | Status |
|-------|--------|
| 1 — Schema foundation | **BUILT** |
| 2 — CO photo gate | **BUILT** |
| 3 — Blocking-todo primitive | NOT-BUILT |
| 4-6 | NOT-BUILT (blocked on Phase 3) |

**Net: 2 of 6 phases live.**

---

#### AGENT_OPS_ARC

| Phase | Status |
|-------|--------|
| 0 | Done |
| 1.1 — scheduled_actions table | **BUILT** |
| 1.2 — Priority enum + daily_logs extension | **BUILT** |
| 2.1 — add_todo verb | **BUILT** |
| 2.2 — notify_team_member verb | **BUILT** |
| 3-6 | NOT-BUILT |

**Net: 2 of 6 phases live.**

---

#### ROLE_DASHBOARDS_ARC

**Net: 2 of 5 role surfaces live (Owner + generic fallback).** PM, Rep, Sub, Client briefs not built.

---

#### VOICE_AGENT

**Net: 4 of 5 phases live.** Phase 5 (hands-free/continuous) not started.

---

#### FIELD_OPUS_ARC

**Net: 5.5 of 6 phases live.** VM `/dispatch-interactive` endpoint absent (separate service). Blocked on AUTO_FIX_ARC VM setup.

---

#### FLOOR_PLAN_LAYOUT_ARC

**Net: 10 of 11 phases live. Functionally complete.** Phase 3 (Opus tiebreaker) intentionally deferred. Phase 6 (confidence scoring) dropped.

---

#### FLOOR_PLAN_EDITOR_ARC

**Status: PARKED by design.** Click-to-reference + talk-to-instruct model chosen. FloorPlanEditorScr.jsx exists — wire or delete decision owed (see O5 above).

---

#### AGENT_INTELLIGENCE_ARC

**Net: 0 of 5 architectures live.** North-star blueprint. Build in Block 6 after real data exists.

---

#### MATERIAL_SELECTION

**Net: 0 of 5+ versions live.** Different from SELECTIONS_ARC. Parked.

---

#### SCOPE_TO_ESTIMATE — seam arc — **A/B/C SHIPPED, D/E remain**

**Status: A / B / C1 / C2 SHIPPED + live-verified 2026-07-11; D/E not started.**

- **A — Foundation SHIPPED** (`7c6b661` +5 commits): `job_rooms` + `job_scope_answers` migrations; persist answers at EstimateTab; re-trigger pass. Answers stop evaporating.
- **B — Read-back pre-fill SHIPPED** (`0dc164e` +3): interview start/resume loads confirmed+proposed answers; skips already-answered fields.
- **C1 — SELECTIONS opens SHIPPED** (`1fad496` +5): `jobs.selections_opened_at` stamp; client vet-gate RLS; client Selections tab (soft-picks).
- **C2 — PM confirm + gate SHIPPED** (`de65319` +6): `scope_checklists.is_selection` flag + seed; PM confirm/override surface; "N of M locked" Demo gate; realtime.
- **D — SUB_WORK_PACKET** — **NOT STARTED.** Needs `trade_taxonomy` expansion (Siding/Deck/Fence/Gutter/Window). **E — CLIENT_VISION_RENDER** — NOT STARTED (parked §7).

> **Agent-gate divergence (audit D3): FIXED 2026-07-16 — `8303070` + `582ff3d`.** Both `ai-master-agent` and `ai-field-agent` now mirror `checkSelectionsConfirmed` with full source-awareness (scope_prefill + confirmed_by=null answers do NOT satisfy the lock). Divergence-guard comments in all three copies. 9 unit tests green. MASTER_BUILD_PLAN previously listed this as open debt — now CLOSED.

**`job_scope_answers` source CHECK (audit D8 corrected):** `source CHECK(rep_typed | rep_card | measured | extracted | client_selected | scope_prefill | photo)` — `scope_prefill` and `photo` added by migrations `20260716150000` and `20260716170000` respectively.

**SUB_WORK_PACKET (owner-decided 2026-07-11):** per-trade, per-room doc sheet from locked selections → trade taxonomy via `scope_checklists.adds_trades` → room lines = spec + bound option-card image → pdf-lib pipeline. Gated on `job_scope_answers` store + SELECTIONS. Prereq: `trade_taxonomy` expansion.

---

### Confirmed Fuzzy Items

_All entries re-verified against live code 2026-07-16._

| Item | Finding |
|------|---------|
| `bid_model_config` table | **EXISTS. 1 row CONFIRMED-LIVE.** Migration `edd13a6` (B1.1). Markup config-driven since B1.6. (Was incorrectly listed as "NOT EXISTS" before audit D1 correction.) |
| `god_agent_action_log` table | **NOT EXISTS.** No migration. Needed for autopilot track record (B3.3). |
| `pricing_policy` JSONB | **LIVE.** Migration `20260618100000`; read by `deviationGate.js`. |
| `deviationGate.js` | **LIVE.** `avenstone-vite/src/lib/deviationGate.js`; called from `sendEstimateToClient`. |
| `AiSetupWizard` | **RETIRED (B1.7).** `3d88635` retired it; BidModelWizard is the replacement. (Was incorrectly listed as "writes prose ai_knowledge entries only".) |
| Estimator hardcoded markup + pm_fee | **CONFIG-DRIVEN since B1.6.** `ab50638` + `f9afaad` killed hardcoded 30%/$1,200. (Was incorrectly listed as "STILL HARDCODED".) |
| `ai-estimator` reads rate_book | **YES — confirmed live.** `loadRateBook(tenantId)`. |
| UNIFIED_FILES Phase 3 — DocsTab | **DocsTab.jsx STILL EXISTS.** Not deleted; Phase 3 incomplete. |
| Contract send email field | **FIXED.** `sbSendEstimateEmail` uses `to: job.client_email`. |
| Magic links (send-client-link) | **CONFIRMED DEAD.** Retired 2026-06-01. `send-client-link` edge fn removed (`f51b500`); zero callers. Canonical path: `create-client-login`. (Was listed as "UNVERIFIED / POSSIBLY DEAD" — audit D1 correction.) |
| Spine handoff — client intake | **MISSING.** AiIntakeWizard is LiDAR scanner only. No project-type-adaptive intake form. |
| Spine handoff — role-aware brief | **GENERIC ONLY.** HomeScr same todos + schedule + weather for all roles. |
| Spine handoff — PM→Sub brief | **MISSING.** No formal PM-provided pre-job brief. |
| `job_rooms` table | **LIVE (SCOPE_TO_ESTIMATE Phase A, 2026-07-11).** Migration `20260711120000`. |
| `job_scope_answers` table | **LIVE (SCOPE_TO_ESTIMATE Phase A, 2026-07-11).** Migration `20260711120100`. `source CHECK(rep_typed\|rep_card\|measured\|extracted\|client_selected\|scope_prefill\|photo)` — last two added 2026-07-16. |
| `jobs.selections_opened_at` | **LIVE (SCOPE_TO_ESTIMATE Phase C1, 2026-07-11).** Migration `20260711130000`. |
| `scope_checklists.is_selection` | **LIVE (SCOPE_TO_ESTIMATE Phase C2, 2026-07-11).** Migration `20260711140000`. Seeded for 5 day-one trades. |

---

## 4. Part 2 — Dependency-Ordered Build Map

**Organizing principle:** App must HAVE THE INFORMATION before the engine can run. Build the front door for each actor first, then the engine runs.

**Verification model:** Code builds, self-verifies, pushes. Code tells Kalin exactly what to look at. Kalin reviews and confirms or kicks back.

---

### Block 1 — Owner Foundation — COMPLETE 2026-06-25

All 22 prompts shipped. See arc inventory above. **No remaining items in Block 1.**

| Sub-step | Status |
|----------|--------|
| B1.1 — bid_model_config schema | **SHIPPED** — `edd13a6` |
| B1.2 — Draw composer UI | **SHIPPED** — `40922d6` + `6818e62` |
| B1.3 — Draw paid cascade + float visibility | **SHIPPED** — `4a9d29a` |
| B1.4 — Master Agent compose_draw + record_deposit | **SHIPPED** — `cff777b` |
| B1.5 — Cost-plus client portal | **SHIPPED** — `adade6d` + `6f48624` |
| B1.6 — ai-estimator reads bid_model_config | **SHIPPED** — `ab50638` |
| B1.7 — Onboarding wizard | **SHIPPED COMPLETE** — all 4 phases |
| FUZZY_JOB_RESOLVER | **SHIPPED 2026-06-25** |
| DRAW_PDF_POLISH | **SHIPPED 2026-06-25** |
| RECEIPT_MODAL_EXTRACTION | **SHIPPED 2026-07-09** |
| SUB_NAME_RESOLVER | **SHIPPED 2026-06-25** |

---

### Block 2 — The Engine

**Already built (reuses):** ai-estimator Phases 1.5+2+3+4+5+6+7, EstimateTab 5 sub-tabs, GapBatchAsk, deviation gate, bid_model_config.

| Sub-step | What it does | Prompts | Status |
|----------|-------------|---------|--------|
| B2.1 — Guided interview w/ pre-filled defaults | Pre-fill SF, tier, markup, pm_fee from config + job record. | 3 | **SHIPPED 2026-06-25** |
| B2.2 — Batch unknowns | Surface gaps as GapBatchAsk batch (after-draft sequencing). | 2 | **SHIPPED** |
| B2.3 — Learn loop | Save gap rates to rate_book_labor on rep opt-in. | 2 | **SHIPPED 2026-06-25** |
| SCOPE_CAPTURE_ENGINE | Blueprint-approved 2026-06-25; one engine, four role faces. See detail below. | ~10-13 | PARTIAL (P1A/P1B/P2/SCOPE_PREFILL P3-P4 SHIPPED; P3 vision + P4 Client INTAKE open) |
| B2.4 — Scope Risk Phase 1 | Extend `tenant_playbook_items` with `is_scope_risk`; seed KC library. | 2 | NOT-BUILT |
| B2.5 — Scope Risk Phase 2 | ai-estimator suggests risks; rep reviews before draft. | 2 | NOT-BUILT |
| B2.6 — Scope Risk Phase 3 | "Potential Considerations" in estimate/proposal. | 3 | NOT-BUILT |
| FLIP_FINANCIAL_MODEL | 6 phases. | 12 | **SHIPPED COMPLETE 2026-06-25** |

**SCOPE_CAPTURE_ENGINE detail:**
- P1A — one generator, retire gefs: **SHIPPED 2026-06-25**
- P1B — checklist/module tables + scope-interview mode: **SHIPPED + LIVE-TESTED 2026-06-26** (full seed P1B 2026-07-10: 9 project types, 15 modules, 37 conflict rules)
- SCOPE_PREFILL (sub-arc): P2/P3/P4a/P4b all **SHIPPED 2026-07-16** — Haiku fn, configurator consumption, re-parse-on-edit, stale-cleanup, layout_change HIGH phrasing, selections-gate source-awareness
- SCOPE_VISION P1-P2: **SHIPPED 2026-07-16** (see arc above)
- P3 — vision reconciliation (~2-3 prompts): **OPEN**
- P4 — Client INTAKE role-instance absorbed from B5.1-B5.3 (~3-4 prompts): **OPEN** (entry criteria: P3 ships first)

**Block 2 total: ~35-38 prompts** (B2.4-B2.6 = ~7 remaining of the Engine block's unbuilt work; SCE P3+P4 = ~5-7 additional).

> **LOCKED RULE — Unvetted Rep-Rate Approval Gate (2026-06-25):** Auto-reuse stays at pricing layer (rate_book_labor, vetted=false closes gap immediately). Estimate with any unvetted rep rate CANNOT reach approved/signed state until management clears it. Enforced at B3.1/B3.2 (approval review UI + rate promotion) and contract signing (B4). Not a B2.3 patch.

---

### Block 3 — The Watcher

**Already built (reuses):** deviation gate, pricing_policy, rate_book_labor w/ vetted distinction, RateBookScr.jsx, learn loop.

| Sub-step | What it does | Prompts |
|----------|-------------|---------|
| B3.1 — Phase 6.2 approval review UI | Manager sees awaiting_approval estimates; approve/reject. Second trigger: unvetted rate → same queue. | 2 |
| B3.2 — Phase 6.1 rate promotion | Gap rates → "promote to Rate Book?" surface; promoting clears unvetted-rate flag. | 2 |
| B3.3 — god_agent_action_log table | Schema for autopilot track record. | 1 |
| B3.4 — God Agent tab + rate review surface | Owner vetoes/adjusts/promotes unvetted rates; logs decisions. | 3 |
| B3.5 — Conversational bulk pricing | "Raise tile labor 10%" → preview table → confirm → bulk UPDATE. | 3 |
| B3.6 — pricing_policy edit via God Agent | "Change margin tolerance to ±20%" → confirm card. | 2 |

**Block 3 total: 13 prompts. PARKED (see locked sequence Tier 1-3 above — follows SCOPE_RISK + AVEN_MERGE).**

---

### Block 4 — The Seams

**Already built (reuses):** HomeScr, OwnerHomeScr, LogsTab, ScheduleTab, SubPortal, Agent Ops Phases 0-2, Anti-Surprise Phases 1+5, trade_dependencies.

| Sub-step | What it does | Prompts | Status |
|----------|-------------|---------|--------|
| B4.1 — Contract signing: Gap 5 verify | **[SHIPPED 2026-07-09]** Magic links confirmed dead. | 1 | SHIPPED |
| B4.2 — Contract signing: Gap 1 (embed proposal) | **[FIXED 2026-07-10]** buildContractPDF + attorney-cleared. | 2 | SHIPPED |
| B4.3 — Contract signing: Gap 4 (IP capture) | **[SHIPPED 2026-07-10]** ip_address + user_agent server-side. | 1 | SHIPPED |
| B4.4 — PM morning brief | ProjectManagerHomeScr: phases + pending subs + overdue items. | 2 | NOT-BUILT |
| B4.5 — Sales Rep morning brief | SalesRepHomeScr: proposals, follow-ups, pipeline. | 2 | NOT-BUILT |
| B4.6 — Sub home screen brief | Sub: today's scope, other trades on site, unpaid invoices. | 2 | NOT-BUILT |
| B4.7 — Agent Ops Phase 3: scheduler cron | agent-ops-cron edge fn + pg_cron. | 2 | NOT-BUILT |
| B4.8 — Agent Ops Phase 4: reminder + followup verbs | set_reminder + set_followup in Master Agent. | 2 | NOT-BUILT |
| B4.9 — Agent Ops Phase 5: watchdog rules | 4 detection rules → scheduled_actions. | 3 | NOT-BUILT |
| B4.10 — Agent Ops Phase 6: daily-log hook | Post-save trigger: flag deviation from schedule/scope. | 2 | NOT-BUILT |
| B4.11 — TODO_NOTIFICATIONS | `notifications.related_entity_id`, deep-link to todo. | 3 | NOT-BUILT |
| B4.12 — Anti-Surprise Phase 2: dependency cascade | Cascade runner on schedule slip. | 3 | NOT-BUILT |
| B4.13 — Anti-Surprise Phase 3: guideline schedule gen | Auto-populate schedule_items on contract transition. | 2 | NOT-BUILT |
| B4.14 — Anti-Surprise Phase 4: scheduling agent | Scoped edge fn: schedule-risk questions. | 2 | NOT-BUILT |

**Block 4 total: 29 prompts (26 remaining after B4.1-B4.3 shipped).**

---

### Block 5 — The Client Front Door

**Duplicate collapse (audit DUP1-DUP4, 2026-07-16):**
- **B5.1-B5.3 (Client INTAKE) → redirect.** These are SCE Phase 4 role-instances (ABSORB ruling, 2026-06-25). Not separate builds; counted in SCOPE_CAPTURE_ENGINE Phase 4 budget above. Removed from this table to eliminate double-counting.
- **B5.7 DELETED (DUP1).** SELECTIONS Phase 1 schema (`selection_templates`/`selection_requests`/`job_selections`) is superseded by `job_scope_answers` + `scope_checklists.is_selection` substrate. The old 7-phase SELECTIONS arc plan is moot; only versioned pick history and CLIENT_VISION_RENDER remain unbuilt.
- **B5.8-B5.9 collapsed (DUP2/DUP3).** Reduce to one item: versioned pick history (~1-2 prompts). The client soft-pick tab, PM confirm, and Demo gate are SHIPPED via SCOPE_TO_ESTIMATE Phase C.

**Already built (reuses):** ConsultationTab, AiIntakeWizard (LiDAR), EstimateTab, GapBatchAsk, Proof Phases 1-2, Unified Files 1-2, SubPortal, ClientPortal, Floor Plan Layout Arc.

| Sub-step | What it does | Prompts | Status |
|----------|-------------|---------|--------|
| B5.0 — Cross-tenant leak fix | **[SHIPPED 2026-06-25]** ai-consultation-gap-analyzer scoped to session.tenant_id. | 1 | SHIPPED |
| B5.1-B5.3 — Client INTAKE | → **SEE SCOPE_CAPTURE_ENGINE Phase 4 (Block 2 / SCE section).** Not a standalone build; absorbed. | — | ABSORBED |
| B5.4 — UNIFIED_FILES Phase 3 | Delete DocsTab.jsx. Add log_photo Master Agent verb. Rewire remaining surfaces. | 2 | NOT-BUILT |
| B5.5 — PROOF Phase 3: blocking-todo primitive | snooze_count/limit, escalation, sbSnoozeTodo/sbRequestTodoBypass. | 2 | NOT-BUILT |
| B5.6 — Lien waiver generation | pdf-lib template; sign flow in sub portal; blocking-todo on unpaid+no-waiver. | 3 | NOT-BUILT |
| ~~B5.7 — SELECTIONS Phase 1 schema~~ | DELETED — superseded substrate. `selection_templates`/`selection_requests`/`job_selections` were never built and are not being built. | — | DELETED |
| B5.8-B5.9 → Versioned pick history | Upsert/re-pick design lacks a version stack. Add versioned pick history so selection changes are traceable. | ~1-2 | NOT-BUILT |
| B5.10 — CLIENT_VISION_RENDER | Gemini image-edit on client photos + locked selections. Parked (§7). | 2 | PARKED |
| B5.11 — Sub workflow upgrades | PM→Sub direct chat thread; phase start/complete by sub; CO submission. | 4 | NOT-BUILT |
| B5.12 — UNIFIED_FILES Phases 4-5 | Portal folder trees; mobile camera flow; search performance. | 3 | NOT-BUILT |
| B5.13 — GPS/ETA: sub/rep on the way → client portal | `job_location_pings` table; ETA → client portal banner + push. | 3 | NOT-BUILT |

**Block 5 remaining: ~18-19 prompts** (B5.4+B5.5+B5.6+versioned-picks+B5.11+B5.12+B5.13 = 2+2+3+1-2+4+3+3).

---

### Block 6 — Autopilot

**Already built (reuses):** pricing_policy + deviationGate.js, trade_dependencies + Anti-Surprise Phase 2-4 cascade (partial).

| Sub-step | What it does | Prompts | Status |
|----------|-------------|---------|--------|
| B6.1 — AVEN_MERGE_ARC | Merge ai-master-agent + ai-field-agent → one edge fn. D3 evidence (three drifted gate copies) is grounds for promotion: on-deck after SCOPE_RISK. | 5 | NOT-BUILT |
| B6.2 — Scheduling Intelligence MVA (Phases 1-4) | Duration_days, predecessor_ids, resource model, lead-time enforcement. | 11 | NOT-BUILT |
| B6.3 — AGENT_INTELLIGENCE: actor_memory layer | actor_memory table; per-actor pattern detection; sub scorecards. | 3 | NOT-BUILT |
| B6.4 — Trust ladder: eligibility + graduation | ≥20 decisions + ≥85% approval → graduation proposal surface. | 3 | NOT-BUILT |
| B6.5 — Bounded autopilot execution | Within margin rails; logged with decision_by=null; instantly reversible. | 3 | NOT-BUILT |

**Block 6 total: 25 prompts. PARKED except B6.1 (on-deck after SCOPE_RISK).**

---

## 5. Master Sequence Table

_Corrected for 2026-07-16 audit. Shipped rows marked. Duplicate rows removed (B5.1-B5.3 absorbed; B5.7 deleted; B5.8-B5.9 collapsed). Orphan arcs adopted. Running totals reflect corrected remaining total._

| # | Sub-step | Block | Prompts | Status |
|---|----------|-------|---------|--------|
| — | D3 gate fix (agent source-awareness) | Tier 1 | 0 | **DONE** — `8303070` |
| — | Plan rewrite | Tier 1 | 0 | **DONE** |
| — | ESTIMATE_CONFIGURATOR chat-path retirement | Tier 1 | ~1-2 | NEXT |
| — | Untranslated fields content (Tier 2) | Tier 2 | ~2-4 | NEXT |
| — | Clean-job test run (Tier 2) | Tier 2 | ~1 | NEXT |
| — | SCE reset RLS diagnosis (Tier 2) | Tier 2 | ~1 | NEXT |
| 1 | B1.1-B1.7 + extras | B1 | 22 | **ALL SHIPPED** |
| 8 | B2.1 Guided interview | B2 | 3 | **SHIPPED** |
| 9 | B2.2 Batch unknowns | B2 | 2 | **SHIPPED** |
| 10 | B2.3 Learn loop | B2 | 2 | **SHIPPED** |
| 10.5 | SCE P1A/P1B/P2/SCOPE_PREFILL | B2 | ~7 | **SHIPPED** |
| 10.6 | SCE P3 vision reconciliation | B2 | ~2-3 | OPEN |
| 10.7 | SCE P4 Client INTAKE (absorbed from B5.1-B5.3) | B2 | ~3-4 | OPEN (after P3) |
| 11 | B2.4 Scope Risk Phase 1 | B2/Tier 3 | 2 | NOT-BUILT |
| 12 | B2.5 Scope Risk Phase 2 | B2/Tier 3 | 2 | NOT-BUILT |
| 13 | B2.6 Scope Risk Phase 3 | B2/Tier 3 | 3 | NOT-BUILT |
| 13.5 | B6.1 AVEN_MERGE (promoted on-deck) | B6→Tier 3+ | 5 | NOT-BUILT |
| 14 | B3.1 Approval review UI | B3 | 2 | NOT-BUILT |
| 15 | B3.2 Rate promotion | B3 | 2 | NOT-BUILT |
| 16 | B3.3 god_agent_action_log | B3 | 1 | NOT-BUILT |
| 17 | B3.4 God Agent tab | B3 | 3 | NOT-BUILT |
| 18 | B3.5 Conversational bulk pricing | B3 | 3 | NOT-BUILT |
| 19 | B3.6 pricing_policy edit | B3 | 2 | NOT-BUILT |
| 20-22 | B4.1-B4.3 Contract signing | B4 | 4 | **SHIPPED** |
| 23 | B4.4 PM morning brief | B4 | 2 | NOT-BUILT |
| 24 | B4.5 Sales Rep brief | B4 | 2 | NOT-BUILT |
| 25 | B4.6 Sub brief | B4 | 2 | NOT-BUILT |
| 26 | B4.7 Agent Ops cron | B4 | 2 | NOT-BUILT |
| 27 | B4.8 Reminder + followup verbs | B4 | 2 | NOT-BUILT |
| 28 | B4.9 Watchdog rules | B4 | 3 | NOT-BUILT |
| 29 | B4.10 Daily-log hook | B4 | 2 | NOT-BUILT |
| 30 | B4.11 TODO_NOTIFICATIONS | B4 | 3 | NOT-BUILT |
| 31 | B4.12 Dependency cascade | B4 | 3 | NOT-BUILT |
| 32 | B4.13 Guideline schedule gen | B4 | 2 | NOT-BUILT |
| 33 | B4.14 Scheduling agent | B4 | 2 | NOT-BUILT |
| 34 | B5.4 UNIFIED_FILES Phase 3 | B5 | 2 | NOT-BUILT |
| 35 | B5.5 PROOF Phase 3 | B5 | 2 | NOT-BUILT |
| 36 | B5.6 Lien waiver generation | B5 | 3 | NOT-BUILT |
| 37 | Versioned pick history (collapsed B5.8-B5.9) | B5 | ~1-2 | NOT-BUILT |
| 38 | B5.11 Sub workflow upgrades | B5 | 4 | NOT-BUILT |
| 39 | B5.12 UNIFIED_FILES Phases 4-5 | B5 | 3 | NOT-BUILT |
| 40 | B5.13 GPS/ETA | B5 | 3 | NOT-BUILT |
| 41 | B6.2 Scheduling Intelligence MVA | B6 | 11 | NOT-BUILT |
| 42 | B6.3 actor_memory layer | B6 | 3 | NOT-BUILT |
| 43 | B6.4 Trust ladder | B6 | 3 | NOT-BUILT |
| 44 | B6.5 Bounded autopilot | B6 | 3 | NOT-BUILT |

**Corrected remaining total: ~100-105 Sonnet prompts** (pre-collapse audit estimated ~119-139; duplicate collapse accounts for ~15-16 saved: B5.7 deleted −2, B5.8-B5.9 collapsed −6-7, B5.1-B5.3 absorbed eliminates double-count −7).

---

## 6. Open Questions for Kalin

| # | Question | Stakes |
|---|----------|--------|
| 1 | **CLOSED 2026-07-10** — Contract signing attorney review; ESIGN/UETA cleared. | RESOLVED |
| 2 | **RESOLVED 2026-07-09** — ASK with cited KC anchor; rep accept/override both write rate_book. | RESOLVED |
| 3 | **SELECTIONS day-one trades:** tile + interior paint seeded. Cabinets? Countertops? Flooring at v1? | Before versioned-pick-history build |
| 4 | **MATERIAL_SELECTION vs SELECTIONS_ARC:** Different features. Which first? Schema coordination needed. | Before either B5 build |
| 5 | **AUTO_FIX_ARC VM setup session:** 4-6hr block needed. When? | Unblocks FIELD_OPUS Phase 4 + auto-repair |
| 6 | **Block 1 order:** RESOLVED — draw composer shipped first (cost-plus billing immediate need). | RESOLVED |
| 7 | **PROOF Phases 4-6:** Are they wanted? Phase 3 is the load-bearing piece. | Block 5 scope decision |
| 8 | **Intake arc question sets per project type:** Input needed before SCE Phase 4 build. | Defines intake schema |
| 9 | **SCOPE_RISK per-trade risk library (B2.4):** What surprises actually happen? Input needed. | Seeds risk templates |
| 10 | **RESOLVED 2026-06-25 — ABSORB.** Client INTAKE = SCE Phase 4 role-instance. | RESOLVED |

---

## 7. Parked / Not in Path

| Item | Reason | Unblocked by |
|------|---------|----|
| **GOD_AGENT Phase B4 (capacity advisor)** | Needs Scheduling Intelligence backlog-density signal | B6.2 running |
| **Scheduling Intelligence Phases 5-13** | MVA is the value; Gantt + calendar are enhancement layers | B6.2 with real data 30+ days |
| **AGENT_INTELLIGENCE cross-tenant benchmarks** | Requires second tenant + privacy architecture | v4+ |
| **FIELD_OPUS Phase 4 (VM dispatch)** | VM endpoint outside repo; requires AUTO_FIX_ARC VM session | AUTO_FIX_ARC |
| **VOICE_AGENT Phase 5 (hands-free)** | Distinct product decision | Kalin decision |
| **TENANT_ONBOARDING Phases 4-5** | Enhancement layers; load-bearing pieces (B1.1 + B1.6-7) running | Block 1 with real tenants |
| **SELECTIONS Phase 7 (vigilance rules + Aven read tool)** | Operational layer on functioning flow | B5 versioned picks confirmed |
| **MATERIAL_SELECTION arc** | Different feature; requires Kalin Q4 decision | Open question #4 |
| **ANALYTICS_ARC** | Not blocking path | Block 5 complete |
| **AGENT_INTELLIGENCE per-page sub-agents** | Current architecture handles all pages | Block 6 with data |
| **Floor Plan Phase 3 (Opus tiebreaker)** | Intentionally deferred | Not building |
| **DOCUMENT_MANAGEMENT_ARC** | PROOF Phase 3 is the reusable primitive | Block 5 + B5.6 |
| **MOBILE_AUDIT_ARC** | UX pass; doesn't block features | Block 4 complete |
| **SALES_PIPELINE_ARC** | LeadsScr exists; SCE Phase 4 closes gap | Block 5 intake |
| **GOD_MASTER_AGENT (white-label configurator)** | Requires paying customer + 4+ weeks AUTO_FIX data | Stage 2 |
| **PDF_BRANDING** | Logo positioning unsolved; needs design pass | Kalin design decision |
| **DESIGN_LANGUAGE (fetch-header rules doc)** | Cheap insurance; re-raise before JOBDET_MOBILE | Kalin decision |
| **CLIENT_VISION_RENDER** | Gated on SCE Phase 3 (photo intake) + SELECTIONS | SCE P3 + SELECTIONS |
| **Wizard-path unification (PRICE_DETERMINISM parked v)** | Two scope→price pipelines; accepted v1 divergence | Future unification arc |
| **Block 3 (The Watcher)** | Follows SCOPE_RISK + AVEN_MERGE | SCOPE_RISK shipped |
| **Block 6 remainder (B6.2-B6.5)** | Requires 6+ months real operational data | 6 months data |
| **MODEL_B Phase 3** | Not blocking current dispatch path | Something that actually gates on JOBDET_MOBILE |
| **Flow-redesign session** | Needs Kalin design time; not a dispatch | Kalin design time |

---

## 8. Captured Ideas — Unplaced

_GPS/ETA placed as B5.13. No unplaced ideas._

| Idea | Waiting on | Triage date |
|------|-----------|-------------|
| _(empty)_ | — | — |
