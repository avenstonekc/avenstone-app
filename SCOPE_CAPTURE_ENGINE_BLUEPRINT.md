# SCOPE_CAPTURE_ENGINE — Architecture Blueprint

**Status:** Blueprint (decisions only — no code shipped). Locked arc 2026-06-25; this doc is the HOW for the WHAT recorded in MASTER_BUILD_PLAN.md (Block 2, row 10.5).
**Doc discipline:** Working arc doc. Folds into AVENSTONE_VISION.md / CLAUDE_ARCHIVE.md once the arc ships; delete from root then (per OPUS_RULES 7-doc cap).
**Author:** Opus, 2026-06-25. Every decision is grounded in a cited file/column read live.

---

## 1. Ground-Truth Audit (what actually exists)

### 1.1 Consultation capture infra (`ConsultationTab.jsx` + `AmbientPanel` + `MeasurePanel`)
Session lifecycle: `idle → ambient → measure → complete`. `consultation_sessions` row created on start (`job_id` TEXT, `tenant_id`, `started_by`, `status`, `raw_transcript`).
- **AmbientPanel** — mic → `process-transcript` edge fn → writes `consultation_extractions`.
- **MeasurePanel** — per-trade chat (voice/text) → `process-transcript` → writes `consultation_measurements`.

**`consultation_extractions`** (confirmed via information_schema): `session_id`, `job_id` TEXT, `tenant_id`, `client_concerns` ARRAY, `scope_hints` ARRAY, `budget_signals` TEXT, `decision_makers` ARRAY, `timeline` TEXT, `risk_flags` ARRAY, `action_items` ARRAY.
**`consultation_measurements`**: `session_id`, `job_id` TEXT, `tenant_id`, `trade` TEXT, `fields` JSONB (free-form per-trade key:value — e.g. tile → {floor_sf, wall_sf}), `confirmed_by_rep` BOOL, `scope_notes` TEXT.
**`consultation_sessions`**: `id`, `job_id` TEXT, `tenant_id`, `status`, `raw_transcript`, `started_at`/`ended_at`.

> Note: `job_id` is TEXT on all three consultation tables (legacy `jobs.id` TEXT pollution — see CLAUDE_MEMORY symptom index). The session↔job join is plain string equality on `job_id`.

### 1.2 Estimate entry (`EstimateTab.jsx`)
Conversational estimator starts from: `estForm {scope, rooms, special}`, `interviewSf`, `interviewTier`, `interviewMarkup`, `interviewPmFee`. `startEstimate()` builds a prompt string from `job.address` + `estForm.scope` + `estForm.rooms` + `interviewSf` + `estForm.special`, then `sendEstimatorMessage()` POSTs to `ai-estimator` with `{messages, tenant_id, project_sf, finish_tier, markup_pct, pm_fee, financial_model}`. The priced result lands in `pricedScope`; `GapBatchAsk` (B2.2) handles rate gaps AFTER the draft; `commitEstimateFromChat()` writes `estimate_line_items`.

### 1.3 THE GAP — two disconnected estimate generators (the central finding)
There is **no connection from a consultation session to `estForm`** — confirmed. Instead there are **two separate estimate generators**:

| | **ai-estimator** (EstimateTab, desk) | **generate-estimate-from-session** (ConsultationTab, on-site) |
|---|---|---|
| Rates | Reads `rate_book_labor`/`rate_book_material` (vetted) | **Invents `unit_cost` in the prompt — no rate book** |
| Markup/PM fee | `bid_model_config` (B1.6 killed hardcodes) | **Hardcodes "PM fee $800-2000, margin 20-35%" in the prompt** (the exact hardcode B1.6 removed — still alive here) |
| Model | Sonnet, rate-book vocab-constrained | Sonnet, free-form, max_tokens 8000 |
| Scope method | Conversational, gap-tracked | One-shot, no checklist, no reconciliation |
| Output | `priced_scope` → `commitEstimateFromChat` | `result.estimate.trades` → `ConsultationTab.saveEstimate` → `sbCommitEstimate` → jumps to estimate tab |

`ConsultationTab.saveEstimate()` (line 307) upserts `job_estimates` and commits line items directly, then `setTab('estimate')`. So today the "session→estimate" flow EXISTS but routes through a **divergent generator that reintroduces invented pricing and a dead cost-plus hardcode**, bypassing the rate-book conversational estimator entirely.

**Implication:** "session→estimate auto-flow" must be re-pointed at the rate-book-backed conversational path. `generate-estimate-from-session` should be retired/absorbed, not fed. (Decision D + Kalin fork 1.)

### 1.4 Existing scope intelligence (the "base checklist" PARTIALLY EXISTS)
- **`template_scope_subsets`** (`tenant_id`, `room_type`, `scope_tag`, `label`, `trades[]`, `sort_order`): the named scope-variant catalog. Bathroom = 6 variants (not_in_scope / full_remodel / tile_only / vanity_swap / paint_and_floor / custom); other room types = 3. `trades[]` holds `trade_taxonomy` full-paths or `['__all__']`. **This is the "which trades are in scope for this room type" fork — half the base checklist.**
- **`takeoff_templates`** (`tenant_id`, `trade`, `room_type`, `scope_definition` JSONB): per (trade, room_type), `scope_definition = {summary, optional, waste_pct, conditional, default_unit}`. **The `conditional` field is a latent, mostly-unused hook for conditional forks.**
- **`job_room_scopes`** (`job_id`, `room_id`, `room_type`, `scope_tag`, `custom_trades[]`, `scope_details` JSONB): the rep's per-room scope choice for a job.
- **`trade_taxonomy`**: canonical parent/sub trade full-path strings (e.g. `Tile - Wall / shower`).

**Verdict: EXTEND, do not parallel.** `template_scope_subsets` already models room-type → trades. What is MISSING and net-new: (a) the **question-checklist layer** (required scope FIELDS per project type — "is the shower floor tiled?"), (b) the **trigger phrase→module map**, (c) the **conflict/omission rules**. These hang off the existing `room_type` strings + `trade_taxonomy` full-paths — the engine must reuse those exact identifiers, never invent a parallel room/trade taxonomy.

### 1.5 Hardcoded scope assumptions in `ai-estimator` `buildScopeSystemPrompt` (the silent-assumption machine the engine replaces)
- **WASTE table** (hardcoded): tile +15%, drywall +10%, LVP/hardwood +12%, trim +10%, insulation +8%, framing +10%.
- **BATHROOM RULES** (hardcoded): "use moisture_resistant drywall for any wet-area"; "if shower has tiled floor → include schluter_membrane (SF) + shower_pan_mudbed (LS)."
- **TRADE ORDER** list (hardcoded 17-trade ordering).

Each of these is a silent assumption: the model applies them invisibly. Under the engine they become **explicit checklist fields / trigger modules / conditional rules** the rep confirms — the schluter+mudbed rule is the canonical "trigger module" (trigger: tiled shower floor → adds waterproofing fields + trades).

---

## 2. Decisions (A–G)

### A. Where the engine lives
**Decision:** The conversational interview lives in **`ai-estimator`** (extend `buildScopeSystemPrompt` → a checklist-driven scope-interview mode), backed by a new shared **`src/lib/scopeEngine.js`** (deterministic checklist assembly + the session→prefill transform). Checklist/module/trigger CONTENT lives in new tenant-scoped tables (Decision B). Multi-source vision reconciliation (Phase 3) adds capability to the same `ai-estimator` function (Haiku vision call), not a new function.

**Why:** The conversational loop, rate-book vocab, pricing, and `commitEstimateFromChat` already live in `ai-estimator` + `EstimateTab`. The interview runs at the DESK (estimate-time); the on-site session's job is to gather evidence that PRE-ANSWERS the checklist, not to run its own interview. One generator, one home.
**Tradeoff considered:** A standalone `scope-engine` edge function would be cleaner in isolation but would fork pricing/commit logic away from `ai-estimator` and create a second thing to keep in sync — the exact two-generator problem we're fixing (1.3). Rejected.

### B. Checklist / module / trigger storage
**Decision:** Three new tables, matching the takeoff platform-default/tenant-override pattern (`tenant_id NULL` = platform default, tenant rows override). All reference existing `room_type` strings + `trade_taxonomy` full-paths.

- **`scope_checklists`** — `(id, tenant_id, project_type TEXT, field_key TEXT, question TEXT, field_type TEXT [choice|number|text|bool], options JSONB, money_risk_rank INT, adds_trades TEXT[], active)`. The base required fields per project type. `money_risk_rank` drives the money/risk-ordered interview (expensive forks first).
- **`scope_modules`** — `(id, tenant_id, module_key TEXT, label TEXT, trigger_phrases TEXT[], adds_fields JSONB [array of field defs same shape as checklist rows], adds_trades TEXT[], active)`. Expansion modules; the trigger map IS `trigger_phrases`. Firing a module bolts `adds_fields` onto the open-questions set and `adds_trades` onto scope.
- **`scope_conflict_rules`** — `(id, tenant_id, rule_key, sources_compared TEXT[], conflict_condition TEXT, question_when_conflict TEXT, active)`. Phase-3 reconciliation rules ("tub vs walk-in", "window in wet wall"). Defined now so Phase 1 schema doesn't preclude it.

**Why tables not `ai_knowledge`:** these are structured, queried by `(tenant_id, project_type)` and `(tenant_id)`, and must be owner-curatable like Rate Book — JSONB-in-ai_knowledge would make curation and trigger-matching painful.
**Reconcile note:** `takeoff_templates.scope_definition.conditional` could have held conditional forks but is unstructured and per-(trade,room_type) only — too narrow for cross-cutting modules. `scope_modules` centralizes it; `takeoff_templates` stays the pricing/quantity source.
**Tradeoff:** new tables = migration + seed cost, but it's the only shape that's tenant-scoped, owner-curatable, and trigger-queryable.

### C. Interview state machine
**Decision:** Scope-interview is a **new phase BEFORE the priced draft**; rate-gaps (B2.2) stay AFTER the draft. Two different concerns, two different times — both correct.

Flow in `EstimateTab` via the existing `estMessages` / `sendEstimatorMessage` loop, in a **"scope mode"**:
1. Engine assembles the checklist for the project type(s) (from `job_room_scopes` room types → `scope_checklists`), pre-answers fields from session evidence (Decision D) + photos (Phase 3).
2. `ai-estimator` scope-mode returns either **batched open questions** (the unanswered + conflicting fields, money/risk-ordered) or **`scope_complete: true`**.
3. On **every rep answer**, the engine re-runs trigger detection across all sources — a new module fires → its fields append to the open-questions set, surfaced next turn ("steam shower → vapor barrier: …?"). This is the AI's bounded job.
4. When `scope_complete`, the EXISTING pricing path runs unchanged → `priced_scope` → `GapBatchAsk` → `commitEstimateFromChat`. Scope mode is strictly upstream; it does not touch pricing or commit.

**Soft gate (Kalin fork 3):** scope-incomplete warns but the rep can force a draft. Honors rep autonomy + "questions earned by input quality" (a fully-pre-filled session = near-zero questions = instant draft).
**Why before-draft (vs B2.2's after-draft):** you cannot price what is not yet scoped — missing scope changes WHICH lines exist; a missing rate only changes a line's number. Scope is structural (before), rate-gap is numeric (after). No contradiction with B2.2.
**Tradeoff:** adds a conversational phase before numbers on a cold estimate. That is the locked intent (uncapped, earned-by-input) — a pre-filled session collapses it to ~zero.

### D. Session→estimate auto-flow (the locked requirement)
**Decision:** A deterministic transform in `src/lib/scopeEngine.js`, fired when `EstimateTab` Build sub-tab opens with a **completed `consultation_session` present AND no estimate started yet** (fire once, never clobber rep edits):

| Session source | → Estimate target | Transform |
|---|---|---|
| `extraction.scope_hints[]` + `job.scope` | `estForm.scope` | Concatenate hints into the description (deterministic; AI-summarize is a later polish, not Phase 2) |
| `consultation_measurements` (per-trade `fields`) | pre-answered checklist fields + `interviewSf` | Map known field keys → checklist `field_key`; sum/derive total SF → `interviewSf` (convention: `fields.total_sf` or summed room SF) |
| `job_room_scopes` (room_type + scope_tag) | `estForm.rooms` + which checklists fire | room_type selects `template_scope_subsets` variant → in-scope trades → which `scope_checklists` load |
| `extraction.client_concerns[]` + `risk_flags[]` | `estForm.special` + Scope Risk flags (B2.4+) | Concatenate to special; seed risk flags for the Scope Risk phase |

**Trigger:** on Build-tab open with a completed session and empty `estForm`. The rep sits down to a pre-drafted entry and a scope interview already 80%+ pre-answered.
**Retire the divergent path (Kalin fork 1):** `generate-estimate-from-session` + `ConsultationTab.saveEstimate`'s direct line-item commit are **superseded** by this pre-fill → conversational path. Recommend retiring them so there is ONE rate-book-backed generator. (Needs Kalin's ok — retiring shipped behavior.)
**Tradeoff:** retiring a working (if flawed) path is a behavior change; but keeping both guarantees drift and the invented-pricing bug persists.

### E. Multi-source reconciliation (Phase 3 — designed now, built later)
**Decision:** Phase 1 stores every checklist answer as a record with **`value`, `source` (typed|measured|photo|plan|assumed), `confidence`**. This is the load-bearing Phase-1 decision that makes Phase 3 possible without rework.
- Phase 3: Haiku vision reads each photo/plan (incl. hand-drawn) → emits checklist-field candidates + fires `scope_modules` triggers. Each candidate is a **confirmable assumption** (`source: photo, confidence: n`) pre-answering a field, badged "from photo — confirm."
- **Conflicts:** when a photo/plan-derived value contradicts a typed/measured value for the same `field_key`, `scope_conflict_rules` emits a forced question ("you said tub, photo shows walk-in — which?").
- **Omissions:** a plan feature with no source answer (window in wet wall) → forced question.
- All surface in the SAME scope interview (Decision C) as high-priority open questions — no separate panel.
**See-not-measure (LOCKED):** vision answers only fields it can SEE (fixture type, surface, layout, visible damage) — never quantities. Real measurements stay with tape / LiDAR / Floor Plan arc. Cited as a hard constraint.

### F. Phase plan
| Phase | Deliverable | Prompts | Depends on |
|---|---|---|---|
| **1** | `scope_checklists` + `scope_modules` + `scope_conflict_rules` tables + seed; scope-interview mode in `ai-estimator` (assemble checklist, batched open questions, trigger-on-every-answer, soft scope-complete gate before pricing); answer records carry source+confidence; deterministic reconciliation of TYPED scope only | 3–4 | Kalin seed content |
| **2** | `scopeEngine.js` session→estimate pre-fill transform; EstimateTab opens pre-drafted from a completed session; **retire/absorb `generate-estimate-from-session`** | 2–3 | Phase 1 + Kalin fork 1 |
| **3** | Vision reconciliation: Haiku reads photos/plans → confirmable-assumption pre-answers + fired modules + conflict/omission forced questions (see-not-measure) | 2–3 | Phase 1 answer-source records |
| **4+** | Role instances: PM execution capture, Sub pre-job brief; **fold Client INTAKE (B5.1–B5.3) as the client role instance** | 3–4 | Phase 1 + Kalin Open Q10 |

**Total: ~10–13 prompts** (revises the plan's ~6–8 UP — the audit found a parallel generator to retire and an answer-source layer to add for Phase 3). Estimate firms after Kalin seed content lands.

### G. Open Question 10 — absorb or feed B5.1–B5.3 (Client INTAKE)
**Recommendation: ABSORB.** Client INTAKE becomes the **client role instance** of SCOPE_CAPTURE_ENGINE (Phase 4) — same `scope_checklists`/`scope_modules` tables, a client-scoped field subset, no pricing, output feeds the same pre-fill transform (Decision D).
**Why:** the entire thesis is "one capture engine rendered per role" (AVENSTONE_VISION spine). Building INTAKE separately = a second checklist/trigger system that drifts from the rep/PM one — the exact two-generator failure we're already fixing in 1.3. One engine, four faces.
**Kalin decides.**

---

## 3. What Kalin Owes (Phase 1 is blocked on this)

### 3.1 Seed content — exact format for direct Phase-1 consumption
Provide keyed to existing `room_type` strings (bathroom, kitchen, basement, exterior, …) and `trade_taxonomy` full-paths (e.g. `Tile - Wall / shower`).

**(a) Base checklist per project type** — the forks that MUST be answered:
```
project_type: bathroom
  - field_key: shower_type        | question: "Tub, walk-in shower, or tub-to-shower conversion?" | type: choice | options: [tub, walk_in, conversion] | money_risk_rank: 1
  - field_key: shower_floor_tiled | question: "Is the shower floor tiled?"                          | type: bool   | money_risk_rank: 2 | (fires waterproofing module)
  - field_key: vanity_count       | question: "How many vanities?"                                 | type: number | money_risk_rank: 4
  ... (the full required-field list per project type)
```

**(b) Expansion modules** — cross-cutting, authored once:
```
module_key: waterproofing
  label: "Tiled wet-area waterproofing"
  trigger_phrases: ["tiled shower floor", "curbless", "steam shower", "wet room"]
  adds_fields: [{field_key: membrane_type, question: "...", type: choice, options:[schluter, hot_mop]}, ...]
  adds_trades: ["Tile - Wall / shower", "Waterproofing"]
module_key: structural
  trigger_phrases: ["remove wall", "vault", "open up", "load bearing", "header"]
  adds_fields: [...]
  adds_trades: ["Framing", "Structural"]
... (framing/structural, plumbing relocation, electrical service upgrade, water/mold remediation, addition, steam shower, …)
```

**(c) Per-trade conflict/omission rules:**
```
rule_key: shower_fixture_conflict
  sources_compared: [typed, photo]
  conflict_condition: "fixture_type differs"
  question_when_conflict: "You said {typed}, the photo shows {photo} — which is correct?"
rule_key: wet_wall_window_omission
  sources_compared: [plan, typed]
  conflict_condition: "plan shows window in a wet wall not in scope"
  question_when_conflict: "The plan shows a window in the shower wall — is that staying, moving, or being closed?"
```
Markdown or JSON both fine — structured lists keyed as above.

### 3.2 Forks only Kalin can call
1. **Retire `generate-estimate-from-session`?** (Decision D) — recommend YES; it reintroduces invented pricing + the dead cost-plus hardcode B1.6 removed. Confirm before Phase 2 deletes/replaces it.
2. **Open Q10 absorb vs feed** (Decision G) — recommend ABSORB.
3. **Scope-complete gate: soft or hard?** (Decision C) — recommend SOFT (warn, allow force-draft).

---

## 4. Summary of load-bearing calls
- Engine home = `ai-estimator` + `src/lib/scopeEngine.js`; one generator, not two (retire `generate-estimate-from-session`).
- Storage = new `scope_checklists` / `scope_modules` / `scope_conflict_rules`, extending (not paralleling) `template_scope_subsets` + `trade_taxonomy`.
- Scope-interview BEFORE draft (structural); rate-gaps AFTER draft (numeric) — no conflict with B2.2.
- Answer records carry `source` + `confidence` from Phase 1 so Phase 3 vision reconciliation drops in without rework.
- Session→estimate = deterministic pre-fill of `estForm`/`interviewSf` on Build-tab open, feeding the conversational rate-book path.
- Absorb Client INTAKE as the client role instance.
