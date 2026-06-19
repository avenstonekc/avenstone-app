# MASTER_BUILD_PLAN.md
**DRAFT — pending Kalin review. Sequence not final until approved.**
**Last audited against live code: 2026-06-19**

---

> **Rule (for Claude and Opus):** Before starting any new phase, arc, or slice, read this file first. Check the build-state inventory for current status. Check the dependency-ordered roadmap for where the requested work sits in sequence. Do not build out of dependency order. If a prompt asks for something out of order, flag it before starting.

---

## 1. PURPOSE

Single ordered source of truth for finishing Avenstone. Every session that starts a new feature checks this document first. Verified against live code, not MD claims.

---

## 2. THE SPINE

From AVENSTONE_VISION.md: **Avenstone is one flowing system where every piece of information is captured once and rendered for each actor in their language.** The handoff chain is: **sales captures a lead → rep sells with an accurate estimate → client welcomes the project → PM scopes and schedules → subs get briefed and tracked → field photos prove the work → client gets the final story**. Every gap in that chain costs money, erodes trust, or creates a surprise. Every arc we build closes one gap. The platform's durable advantage is that every job teaches the system — rates, risks, schedules — so the next job is easier.

---

## 3. BUILD-STATE INVENTORY

Verified against live code on 2026-06-19. "Doc claims" vs "live code" discrepancies flagged.

### ✅ SHIPPED — production-ready

| Feature | Key Evidence |
|---------|-------------|
| AI Estimator (3b-2 engine) | `supabase/functions/ai-estimator/index.ts` + `_shared/rateBook.ts` with resolveRate(), job-size tier collapse |
| Rate Book schema + UI | `20260616100000_rate_book_schema.sql`, `rate_book_labor`, `rate_book_material` tables, `RateBookScr.jsx` (owner-facing) |
| Estimate Tab (5 sub-tabs) | `EstimateTab.jsx` — Build, Scope, Takeoff, Line Items, Proposal fully wired |
| Deviation Gate (Slice 6.0) | `deviationGate.js` + `approval_status/approval_meta` on `job_estimates` + gate in `sendEstimateToClient` |
| Takeoff Wizard | `TakeoffWizard.jsx` + `normalized_geometry`, room-by-room scope tags, labor+material lines |
| Daily Logs | `LogsTab.jsx` — capture, AI draft, client message, send — all 5 phases shipped |
| Schedule Items | `ScheduleTab.jsx` + `sbCheckResourceConflicts` + full lifecycle (material_delivery, sub_start, site_visit, inspection, milestone, delay) |
| Push Notifications | APNs Phases 1-5 shipped — `push_subscriptions`, `send-push`, `notification-push-fanout` trigger |
| Sub Portal | `SubPortal.jsx` (jobs, onboarding, company docs, language toggle), Sub engagement + bid workflow |
| Sub Invoices | `SubInvoicesSection.jsx` — 3-bucket view, approve/dispute/payment/void full workflow |
| Sub Onboarding | `SubOnboardingWizard.jsx` + structured form + `ai-sub-onboard` + `ai-sub-pricing` |
| Unified Files | `FilesTab.jsx` (tree/grid/recent/bulk), `job_files` table, `job-files` bucket |
| Company Files | `CompanyFilesScr.jsx` Phase 2 — upload, category, expiry, role visibility, signed URL (SHIPS as Phase 2 complete; Phases 3-5 watchdog/portal/Master Agent verb remain) |
| Invoicing / Draws | `InvoicesSubTab.jsx` + `draw_schedules` + draw packages + `MarkPaidModal` + retainage |
| Cost-Plus Phase 1A | `jobs.labor_markup_pct/material_markup_pct`, `job_transactions.reimbursement_status`, `draw_line_items` table |
| Home Screen | `HomeScr.jsx` — morning brief, upcoming schedule items, todos, weather |
| Owner Portal | `OwnerPortal.jsx` + `OwnerHomeScr.jsx` — intelligence dashboard, escalations, analytics |
| Anti-Surprise Phase 1 | `tenant_playbook_items` (10 checklists, 89 items), `anti-surprise-generator` (3am UTC cron), `anti-surprise-dispatcher` (*/15min cron) |
| Vigilance Runner | 11 pure-SQL rules, daily 11:00 UTC cron, zero model calls |
| Floor Plan (Phases 1-5c) | Layout checker, normalizer, canvas editor, persistence, wall move, merge rooms — **Phase 5e (versions + send to client) REMAINING** |
| Agent Cards (all phases) | 7 phases complete — select/multi_select/radio_per_item/text card types, REQUIRED_FIELDS elicitation |
| Agent Ops (Phases 1-2) | `scheduled_actions` schema, `add_todo` extension, `notify_team_member` verb |
| Master Agent | 28 tools (6 read + 22 write), `ai-master-agent` edge fn |
| Field Agent | 7 tools, `ai-field-agent` edge fn, voice-first (25-word cap) |
| Bug Pipeline v1 | html2canvas + `submit-bug-report` + `BugReportsScr` + `BugReportDetailModal` |
| Auto-Fix Arc (Phases A-D) | Classifier + VM dispatch + Vercel poll + TodoCard wiring — **VM infrastructure outside repo** |
| Proof Arc Phase 1 | `photos.category` column, `jobs.before_photos_required`, `change_orders.co_*_bypass_reason` |
| Leads Screen | `LeadsScr.jsx` |
| Voice Agent (code) | Phases 1-4.5 code shipped; **device verification pending via TestFlight** |
| Field Opus (Phases 1-5) | `FieldOpusPanel.jsx` (Kalin-only dev console), `field_opus_messages` table, `field-opus-chat` Opus edge fn — **gated on VM `/dispatch-interactive` endpoint** |

### ⚠️ PARTIALLY BUILT

| Feature | What's Done | What's Missing |
|---------|------------|----------------|
| **Contract Signing** | `sbSendContractEmail` helper, `sbSetContractFromEstimate` (sets contract value), estimate PDF send (email field fix already applied) | No proposal embedded in contract body — **LEGAL EXPOSURE** (client signs boilerplate without seeing line items/payment schedule). No client portal Proposal/Documents tab. No IP capture for ESIGN audit trail. |
| **Deviation Gate loop** | Slice 6.0 gate + awaiting_approval state | **6.1 Rate Review** (manager promotes pending rates), **6.2 Approval UI** (manager sees/acts on awaiting_approval estimates) |
| **Proof Arc** | Phase 1 schema only (photos.category column) | Phases 2-6: CO photo gate, blocking-todo primitive, before photos, delivery photo request |
| **Company Files** | Phase 2 admin UI | Phase 3a (client visibility), Phase 3b (sub portal), Phase 4 (Master Agent verb `upload_company_file`), Phase 5 (watchdog + expiry escalation) |
| **Cost-Plus** | Phase 1A schema | Phases 2-6: draw composer UI, float visibility, Master Agent verbs (`compose_draw`, `record_deposit`) |
| **Anti-Surprise Engine** | Phase 1 (checklists) + Phase 5 partial (vigilance-runner) | Phase 0 prereq (push idempotency), Phases 2-4 (dependency engine, guideline schedule, scheduling agent) |
| **Agent Ops** | Phases 1-2 (schema + delegation verbs) | Phases 3-6: reminder verbs, watchdog rules, daily-log hook |
| **Scheduling Intelligence** | `ScheduleTab.jsx` (flat list, resource conflict check), `schedule_items` full schema | Full SCHEDULING_INTELLIGENCE_ARC: dependency graph, cascade engine, resource model, lead-time enforcement, historical risk model |
| **God Agent** | `pricing_policy` JSONB on tenants (Slice 6.0) | All of GOD_AGENT_ARC B1-B4: rate review UI, conversational bulk pricing, capacity advisor |
| **Voice Agent (device)** | Code shipped (Phases 1-4.5) | Device verification on TestFlight; Phase 5+ (hands-free) not started |
| **Roles / Dashboards** | `HomeScr.jsx` morning brief, `OwnerPortal.jsx` intelligence | Full ROLE_DASHBOARDS_ARC: 5 role-specific configs, `sbLoadHomeDashboard` rollup |

### ❌ NOT BUILT — confirmed by live code

| Feature | Doc Status | Arc |
|---------|-----------|-----|
| **Project-type-adaptive intake** | No arc exists yet | **FRONT-OF-FUNNEL GAP — explicit Kalin concern** |
| **Selections** | Blueprint (7 phases, ~13 prompts) | SELECTIONS_ARC |
| **Scope Risk** | Blueprint (3 phases) | SCOPE_RISK_ARC — gated on Rate Book wiring |
| **Lien Waiver generation** | Planned in FINANCIALS_PLAN | No arc, no component, no migration |
| **Tenant Onboarding Wizard** | Blueprint (7 phases, ~21 prompts) | TENANT_ONBOARDING_ARC — white-label spine |
| **Agent Intelligence meta-layer** | Blueprint, north-star | AGENT_INTELLIGENCE_ARC |
| **AVEN_MERGE_ARC** | Scoped (2-3 days) | 6 duplicated code blocks across master/field agents |
| **GOD_AGENT conversational pricing** | Blueprint B0 done | GOD_AGENT_ARC B1-B4 — prereq: 6.1 rate review |
| **Design System DESIGN_SYSTEM_ARC** | Doc no longer exists (completed through Slice 7, 2026-06-10, folded in) | Hex baseline: 1343 literals |

---

## 4. THE FRONT-OF-FUNNEL GAP

**Kalin's observation: we've built mid/back-of-funnel well but the front door is thin.**

Current lifecycle chain status:

| Link | Status | Notes |
|------|--------|-------|
| **Lead capture** | PARTIAL | `LeadsScr.jsx` exists — basic contact + address. No project-type intake questions. |
| **Lead → Job conversion** | EXISTS | `JobsScr.jsx` new job button — address + status. Minimal. |
| **Structured intake (type-adaptive)** | **MISSING** | No arc, no component. Kitchen remodel vs fire-damage rebuild vs fence install should ask different questions. This is the "form becomes a prompt" front door. |
| **Estimate / sell** | STRONG | Full 5-tab EstimateTab, Rate Book, guided interview (Slice 3-6 range) |
| **Proposal to client** | EXISTS | `sbSendEstimateEmail` + Proposal sub-tab |
| **Client signs contract** | BROKEN | No proposal embedded in contract — legal exposure |
| **PM scopes + schedules** | EXISTS | ScopeTab, Takeoff, ScheduleTab |
| **Sub brief + bid** | EXISTS | SubsTab, ITB flow, SubPortal |
| **Field photos + daily log** | EXISTS | LogsTab, FieldTab |
| **Client sees progress** | PARTIAL | Client portal exists; no Proposal/Documents tab |
| **Job close / marketing** | MISSING | No system for turning job photos into portfolio/marketing content |

**The intake gap in detail:** When a rep gets a lead for a bathroom remodel, the current flow is: create job → type free-text scope → run AI estimator. There is no structured intake that:
1. Asks project-type-specific questions (bathroom: how many fixtures, full gut or refresh, tile scope, wet area?)
2. Adapts question set by trade/project type (kitchen vs exterior vs mechanical differs entirely)
3. Flows structured answers directly into the estimator as pre-answered interview fields
4. Captures client budget, style preference, timeline at intake (not during estimate)

This is a new arc. Proposed name: **INTAKE_ARC**.

---

## 5. DEPENDENCY-ORDERED ROADMAP

Items are sequenced by what must exist before what. Size in Sonnet prompts (estimate, never hours).

---

### PHASE 0 — Close in-flight work (before starting anything new)

These are partially-built items where stopping mid-arc creates drag.

| Item | Unblocks | Prompts | Dep |
|------|----------|---------|-----|
| **Floor Plan 5e** — versions + send to client | Closes floor plan workflow loop; client deliverable | 2 | None |
| **Phase 6.2 Approval UI** — manager sees/acts on `awaiting_approval` estimates | Closes deviation gate loop; 6.0+6.1 sitting open without this | 2 | 6.0 done ✅ |
| **Phase 6.1 Rate Review** — manager promotes pending rates from estimate | Unblocks God Agent B2 (adjust mode) | 2 | 6.0 done ✅ |
| **log_receipt type fix (field-agent)** — remove hardcoded `'material_purchase'` | Stops silent data-quality bug; pre-AVEN_MERGE requirement | 1 | None |
| **Contract Signing — embed proposal** | Closes legal exposure gap | 3 | Proposal PDF (done) |

**Phase 0 total:** ~10 prompts

---

### PHASE 1 — Estimator brain completion

Rate Book wiring makes the estimator actually use vetted rates instead of invented ones.

| Item | Unblocks | Prompts | Dep |
|------|----------|---------|-----|
| **ESTIMATOR_KNOWLEDGE_ARC Phase 2** — Supabase connection + prompt injection (ai-estimator reads Labor Rate Book + Material Tier Chart) | Estimator stops inventing rates | 3 | Rate Book schema ✅ |
| **ESTIMATOR_KNOWLEDGE_ARC Phase 3** — Cite-or-flag + source labels in output | Reps see which rates are vetted vs regional avg | 2 | Phase 2 |
| **ESTIMATOR_KNOWLEDGE_ARC Phase 4** — Guided interview with pre-filled defaults, finish tier selection, batch gap-ask | Removes friction at estimate start | 3 | Phase 3 |
| **ESTIMATOR_KNOWLEDGE_ARC Phase 5** — Per-tenant fallback mode config (regional_avg or ask) | White-label estimator behavior | 2 | Phase 4 |
| **ESTIMATOR_KNOWLEDGE_ARC Phase 6** — Batch unknowns (collect missing-labor-rate lines, present as numbered list) | Reps can fill gaps in one shot | 2 | Phase 5 |
| **ESTIMATOR_KNOWLEDGE_ARC Phase 7** — Learn loop (save missing rates to Rate Book after confirm) | Every estimate teaches the system | 2 | Phase 6 |

**Phase 1 total:** ~14 prompts

---

### PHASE 2 — Front-of-funnel intake

New arc. Builds the adaptive intake that feeds the estimator with structured data.

| Item | Unblocks | Prompts | Dep |
|------|----------|---------|-----|
| **INTAKE_ARC Phase 1** — Schema: `project_types`, `intake_questions` (type-adaptive per project type); seed Avenstone-GC types (kitchen, bathroom, full gut, exterior, fire/water damage, fence, mechanical) | Intake form can pull type-specific questions | 2 | None |
| **INTAKE_ARC Phase 2** — Intake UI: project type picker → adaptive question set → answers saved to job | Estimator pre-filled from structured answers | 3 | Phase 1 |
| **INTAKE_ARC Phase 3** — Estimator integration: intake answers pre-fill the estimator interview fields (SF, finish tier, scope notes, room list) | "Form becomes a prompt" front door | 2 | Phase 2 |
| **INTAKE_ARC Phase 4** — Lead-to-intake flow: intake form surfaces at lead creation + new job creation | Intake captured at first contact, not after job created | 2 | Phase 3 |

**Phase 2 total:** ~9 prompts. **OPEN QUESTION: Kalin confirms trade list + question sets before Phase 1.**

---

### PHASE 3 — Scope Risk + Selections

Both depend on a working Rate Book (Phase 1) for pricing.

| Item | Unblocks | Prompts | Dep |
|------|----------|---------|-----|
| **SCOPE_RISK_ARC Phase 1** — Risk knowledge source (`tenant_playbook_items` extension or new table); seed Avenstone per-trade risk library | AI can suggest applicable risks | 2 | Phase 1 (Rate Book) |
| **SCOPE_RISK_ARC Phase 2** — Estimator integration: AI suggests risks; GC reviews before send | Proposal shows risks section | 2 | SCOPE_RISK Phase 1 |
| **SCOPE_RISK_ARC Phase 3** — Render "Potential Considerations" in estimate/proposal (conditional language, ballpark from Rate Book, excluded from quoted total) | Client enters project prepared | 2 | SCOPE_RISK Phase 2 |
| **SELECTIONS_ARC Phase 0** — Audit existing selection-adjacent code | Clean base for build | 1 | None |
| **SELECTIONS_ARC Phase 1** — Schema: `selection_templates`, `selection_requests`, `job_selections`; seed tile + interior paint for Avenstone | Selections can be generated per job | 2 | Phase 0 audit |
| **SELECTIONS_ARC Phase 2** — Generator (auto-derive requests from job trades) + confirm_by math + base-photo wiring | System knows what selections this job needs | 2 | Phase 1 |
| **SELECTIONS_ARC Phase 3** — Selections Session batch UI (PM + client, grouped by trade, shortlist → confirm) | PM and client can work through selections together | 2 | Phase 2 |
| **SELECTIONS_ARC Phase 4** — PM Selections sub-tab (track status, send reminders, confirm_by countdown) | PM never loses track of pending selections | 2 | Phase 3 |
| **SELECTIONS_ARC Phase 5** — Client portal confirmation (client reviews + approves selections, versioned) | Client signs off without a phone call | 2 | Phase 4 |
| **SELECTIONS_ARC Phase 6** — Visualize-render edge fn (Gemini/SDXL image-edit, disclaimer, version binding) | Client sees what the room will look like | 2 | Phase 5 |
| **SELECTIONS_ARC Phase 7** — Vigilance rules + Aven read tool | Selections never silently expire | 2 | Phase 6 |

**Phase 3 total:** ~21 prompts. **OPEN QUESTION: Kalin confirms which trades at Avenstone day one.**

---

### PHASE 4 — Anti-Surprise Engine + Scheduling MVA

Anti-Surprise Phase 2 (dependency table) is the prerequisite for scheduling intelligence.

| Item | Unblocks | Prompts | Dep |
|------|----------|---------|-----|
| **Push double-trigger idempotency fix** | Prerequisite before firing notifications at volume | 1 | None |
| **ANTI_SURPRISE Phase 2** — Dependency engine: trade precedence table, predecessor population, cascade runner | Slipping one trade cascades to dependents | 3 | Push fix |
| **ANTI_SURPRISE Phase 3** — Guideline schedule generation (auto-populate on job-sold) | Every new job gets a baseline schedule | 2 | Phase 2 |
| **ANTI_SURPRISE Phase 4** — Scheduling agent scoped (agent context over dependency engine) | AI can answer "when will X be done?" | 2 | Phase 3 |
| **SCHEDULING_INTELLIGENCE Phase 1** — Dependency graph foundation (schema, predecessor seed) | Downstream schedule phases all require this | 3 | Anti-Surprise Phase 2 |
| **SCHEDULING_INTELLIGENCE Phase 2** — Cascade engine + slip handling | Slippage propagates automatically | 3 | Phase 1 |
| **SCHEDULING_INTELLIGENCE Phase 4** — Resource model: sub capacity (double-booking prevention) | Crew never gets inadvertently double-booked | 3 | Phase 2 |
| **SCHEDULING_INTELLIGENCE Phase 5** — Lead-time enforcement (material delivery gates trade start) | Orders placed before trades need materials | 2 | Phase 4 |

**Phase 4 total (MVA):** ~19 prompts. (Full SCHEDULING_INTELLIGENCE has 13 phases; Gantt UI + external calendar sync deferred to Phase 8)

---

### PHASE 5 — Sub workflow + Proof

| Item | Unblocks | Prompts | Dep |
|------|----------|---------|-----|
| **PROOF_ARC Phase 2** — CO photo gate (co_condition + co_fix required; owner+PM bypass with reason) | COs require evidence | 1 | Proof Phase 1 ✅ |
| **PROOF_ARC Phase 3** — Blocking-todo primitive (snooze counter, escalation, approver workflow) | Reusable for lien waivers, COI expiry, permit renewals | 1 | Phase 2 |
| **PROOF_ARC Phase 4** — Before photos (optional artifact, blocking todo at lead→contract) | Job starts with documented baseline | 1 | Phase 3 |
| **PROOF_ARC Phase 5-6** — Delivery photo request + polish | Workflow complete | 2 | Phase 4 |
| **SUB_WORKFLOW_ARC Phase 1** — PM-Sub direct chat thread (separate from general job messages) | PM and sub can communicate without email | 2 | Sub Portal ✅ |
| **SUB_WORKFLOW_ARC Phase 2** — Phase start/complete confirmation by sub | Sub confirms before phase marked done | 2 | Phase 1 |
| **SUB_WORKFLOW_ARC Phase 3** — CO submission by sub | Subs can submit scope changes from the field | 2 | Phase 2 |
| **Company Files Phase 3a** — Client visibility via job creation | Clients see COI + license automatically | 1 | CompanyFilesScr ✅ |
| **Company Files Phase 3b** — Sub portal access | Subs see what they need to see | 1 | Phase 3a |
| **Company Files Phase 4** — Master Agent verb `upload_company_file` | Voice/chat uploads compliance docs | 2 | Phase 3b |
| **Company Files Phase 5** — Watchdog + escalation + expiry banner on active jobs | Expired COI surfaces before it matters | 3 | Phase 4 |
| **LIEN WAIVER Phase 1** — Generation (pdf-lib, auto-populate from job + sub + payment data) | Lien waiver workflow can close | 3 | Sub Invoices ✅ |
| **LIEN WAIVER Phase 2** — Portal delivery (sub signs, PM verifies, stored in job_files) | Full digital lien waiver chain | 2 | Phase 1 |

**Phase 5 total:** ~23 prompts

---

### PHASE 6 — Financial intelligence + God Agent

| Item | Unblocks | Prompts | Dep |
|------|----------|---------|-----|
| **COST_PLUS Phase 2** — Draw composer UI (multi-expense selector, markup preview, generate invoice) | PMs can compose draws without spreadsheets | 3 | Cost-Plus Phase 1A ✅ |
| **COST_PLUS Phase 3** — Draw paid cascade (marks expenses reimbursed, updates float) | Float balance auto-updates on payment | 1 | Phase 2 |
| **COST_PLUS Phase 4** — Float visibility (stat cards: bucket balance, unreimbursed, client owes) | PM sees cash position at a glance | 2 | Phase 3 |
| **COST_PLUS Phase 5** — Master Agent verbs `compose_draw` + `record_deposit` | Voice/chat can build draws | 2 | Phase 4 |
| **COST_PLUS Phase 6** — Client portal migration (replace legacy cost view) | Clients see current draw status | 3 | Phase 5 |
| **GOD_AGENT Phase B1** — Rate Review mode (manager promotes rates from deviation gate data) | 6.1 closes the deviation gate loop | 2 | 6.0 ✅, 6.1 (Phase 0) |
| **GOD_AGENT Phase B2** — God Agent tab + Capability 1 (conversational bulk pricing: "Raise Electrical 12%") | Owner adjusts rates without hunting config tables | 4 | Phase B1 |
| **GOD_AGENT Phase B3** — Pricing policy edit via God Agent (tolerance bands, fallback mode) | Owner controls deviation thresholds via chat | 2 | Phase B2 |
| **Agent Ops Phase 3** — Scheduler infrastructure (pg_cron firing, reminder handlers) | Time-based agent follow-ups work | 2 | Agent Ops Phase 2 ✅ |
| **Agent Ops Phase 4** — `set_reminder` + `set_followup` verbs (self-only enforced) | Agent can defer tasks reliably | 2 | Phase 3 |
| **Agent Ops Phase 5** — Watchdog rules (4 rules: missing daily log, next phase no schedule, materials not ordered, CO pending decision) | Proactive PM pokes fire automatically | 2 | Phase 4 |
| **Agent Ops Phase 6** — Daily-log conversation hook | AI reads log + asks follow-ups | 2 | Phase 5 |

**Phase 6 total:** ~27 prompts

---

### PHASE 7 — Platform hardening + white-label spine

| Item | Unblocks | Prompts | Dep |
|------|----------|---------|-----|
| **AVEN_MERGE_ARC** — Merge ai-master-agent + ai-field-agent into one fn with `mode: 'voice'|'chat'`; role-based tool filtering; fix log_receipt divergence | One maintained agent codebase; field agent gets full tool set | 6 | log_receipt fix (Phase 0) |
| **TENANT_ONBOARDING_ARC Phase 1** — `bid_model_config` schema | Estimate engine can read per-tenant bid model | 2 | None |
| **TENANT_ONBOARDING_ARC Phase 2** — Estimate engine reads bid model (supply_model per category) | Painting tenant gets different estimate structure than GC | 3 | Phase 1 |
| **TENANT_ONBOARDING_ARC Phase 3** — Allowance as first-class estimate item type | Allowance quote works natively | 2 | Phase 2 |
| **TENANT_ONBOARDING_ARC Phase 4** — Interview engine + photo-in-interview | Estimate interview is dynamic, not scripted | 4 | Phase 3 |
| **TENANT_ONBOARDING_ARC Phase 5** — Plan upload ingest (image/PDF → structured line items) | Any plan type feeds the estimator | 3 | Phase 4 |
| **TENANT_ONBOARDING_ARC Phase 6** — Wizard writes structured config (interview → feature flags + AI tier + trade configs) | Onboarding a new tenant takes one session | 3 | Phase 5 |
| **TENANT_ONBOARDING_ARC Phase 7** — Onboarding wizard UI | Tenant can self-onboard | 4 | Phase 6 |
| **ROLE_DASHBOARDS_ARC** — 5 role-specific dashboards (Owner, PM, Rep, Sub, Client) with `sbLoadHomeDashboard` rollup | Each actor lands on a surface tuned to their day | 5 | Anti-Surprise Phase 2 ✅ |

**Phase 7 total:** ~32 prompts

---

### PHASE 8 — Intelligence meta-layer

These are north-star features that require significant real-world data to be meaningful.

| Item | Unblocks | Prompts | Dep |
|------|----------|---------|-----|
| **SCHEDULING_INTELLIGENCE Phases 8-10** — Sub SLA + escalation, historical risk model, cost of delay | Schedule intelligence gets real predictive power | 7 | Phases 1-5, real data |
| **AGENT_INTELLIGENCE_ARC** — Per-actor memory, per-tenant config, cross-tenant benchmarks (anonymized) | Every job teaches the system; every tenant learns from others | ~8 | All prior phases, real data |
| **GOD_AGENT Phase B4** — Capacity Advisor (pricing guidance based on backlog density) | "Raise prices — you're booked 3 months out" | 3 | Scheduling Intelligence + action_log data |
| **SCHEDULING_INTELLIGENCE Phases 11-13** — Gantt UI, client portal, external calendar sync | Full visual schedule management | 11 | Phases 1-5 |

**Phase 8 total:** ~29 prompts

---

## 6. PARKED / BLOCKED

These items have hard prerequisites outside our control or need a fresh block of time.

| Item | Blocker | What Unblocks It |
|------|---------|-----------------|
| **AUTO_FIX_ARC VM infrastructure (Phases A-E)** | Needs Kalin's fresh 4-6hr block, DigitalOcean/Hetzner account, Anthropic API billing, GitHub PAT (contents:write) | Kalin schedules a dedicated setup session |
| **Field Opus VM dispatch** (`/dispatch-interactive`) | VM infrastructure not in repo; endpoint not wired | Same as AUTO_FIX_ARC VM setup |
| **GOD_AGENT Capacity Advisor (Phase B4)** | Needs SCHEDULING_INTELLIGENCE backlog-density signal + 30+ days of action_log data | Phase 4 scheduling + Phase 6 God Agent B2 running with real data |
| **Voice Agent Phase 5+ (hands-free)** | Phase 3+ deferred; no arch decision on native hands-free model | Kalin decision when voice v1 is proven on device |
| **Agent Cards Phase 6 (field voice rendering)** | Requires VOICE_AGENT Phase 3+ (not started) | Voice Agent Phase 5 |
| **Web Push (Phase 6)** | Deferred until browser/Android is a priority | User demand or Android target date |
| **SCHEDULING_INTELLIGENCE Phase 3 (critical path)** | Requires Phases 1+2 foundation | Phase 4 scheduled items |
| **AGENT_INTELLIGENCE lead marketplace** | Privacy-gated; requires PMF + consent architecture decision | Post-paying-customers milestone |
| **GOD_MASTER_AGENT (white-label configurator)** | Gated on: Avenstone ships to paying customer, AUTO_FIX has 4+ weeks data, financial model sketched | Stage 2 complete (Avenstone-for-GC shipped to real customer) |

---

## 7. OPEN QUESTIONS FOR KALIN

These need your field judgment before sequencing is final.

| # | Question | Stakes |
|---|----------|--------|
| 1 | **INTAKE_ARC priority**: Should structured intake (Phase 2) come before Selections Arc (Phase 3)? Intake feeds selections naturally, but selections is already blueprinted. | Affects Phase 2-3 sequencing |
| 2 | **Floor Plan 5e vs Phase 0 ordering**: CLAUDE.md Priority Order says floor plan is #1. Confirm this outranks the contract signing legal fix and Phase 6.1/6.2 in terms of what ships this week. | This week's build order |
| 3 | **Contract signing — legal review first?** The CONTRACT_SIGNING_ARC flags ESIGN/UETA compliance exposure. Confirm: do we want a lawyer to review before we wire up the full signing flow? | Legal risk |
| 4 | **SELECTIONS day-one trades**: Which trades get selection templates at Avenstone v1? Arc proposes tile + interior paint. Is that right, or add more? | Blocks SELECTIONS Phase 1 |
| 5 | **AVEN_MERGE_ARC timing**: 2-3 day arc to merge ai-master-agent + ai-field-agent. Does it slot after Phase 0 (fix log_receipt first) or is it lower priority? | Field agent data quality vs merge cost |
| 6 | **AUTO_FIX_ARC setup session**: Ready to schedule a focused 4-6hr block? This can't be a between-other-things task. | Unblocks VM dispatch + Field Opus full dispatch |
| 7 | **INTAKE_ARC question sets**: Before Phase 1 ships, need Kalin's field judgment on the question list for each project type. e.g. bathroom intake: fixture count, full gut vs refresh, tile scope, wet area? | Defines the intake schema |
| 8 | **SCOPE_RISK per-trade risks**: SCOPE_RISK_ARC Phase 1 seeds Avenstone's per-trade risk library. Kalin knows what surprises actually happen — input needed before schema design. | Blocks SCOPE_RISK Phase 1 |

---

## 8. TOTAL SCOPE ESTIMATE

| Phase | Focus | Prompts |
|-------|-------|---------|
| 0 | Close in-flight work | ~10 |
| 1 | Estimator brain (Rate Book wiring) | ~14 |
| 2 | Intake Arc (new) | ~9 |
| 3 | Scope Risk + Selections | ~21 |
| 4 | Anti-Surprise + Scheduling MVA | ~19 |
| 5 | Sub workflow + Proof + Company Files + Lien Waivers | ~23 |
| 6 | Financial intelligence + God Agent | ~27 |
| 7 | Platform hardening + White-label spine | ~32 |
| 8 | Intelligence meta-layer | ~29 |
| **TOTAL** | | **~184 Sonnet prompts** |

Phases 0-4 are the core product for Avenstone-GC (first paying customers). Phases 5-8 are growth + platform. This is not a 2-week roadmap — it's the full v1 through GOD_MASTER_AGENT arc. Build in order. Ship in phases.

---

## 9. MD FILES AUDITED

All root-level planning docs read in this audit (2026-06-19):

`AVENSTONE_VISION.md`, `CLAUDE.md`, `CLAUDE_MEMORY.md`, `CLAUDE_ARCHIVE.md` (first 300 lines), `OPUS_RULES.md`, `ESTIMATOR_KNOWLEDGE_ARC.md`, `GOD_AGENT_ARC.md`, `SCOPE_RISK_ARC.md`, `AVEN_MERGE_AUDIT.md`, `CONTRACT_SIGNING_ARC.md`, `SCHEDULING_INTELLIGENCE_ARC.md`, `SELECTIONS_ARC.md`, `COST_PLUS_ARC.md`, `PROOF_ARC.md`, `UNIFIED_FILES_ARC.md`, `SUB_INVOICES_ARC.md`, `FINANCIALS_PLAN.md`, `INVOICING_ARC.md`, `FLOOR_PLAN_LAYOUT_ARC.md`, `AGENT_INTELLIGENCE_ARC.md`, `ROLE_DASHBOARDS_ARC.md`, `ANTI_SURPRISE_ENGINE_ARC.md`, `DAILY_LOG_ARC.md`, `PUSH_NOTIFICATIONS_ARC.md`, `FIELD_OPUS_ARC.md`, `VOICE_AGENT.md`, `AGENT_OPS_ARC.md`, `AGENT_CARDS_ARC.md`, `COMPANY_FILES_ARC.md`, `TENANT_ONBOARDING_ARC.md`, `MODEL_B_AUDIT.md`

**Not found (confirmed absent):** `DESIGN_SYSTEM_ARC.md` (completed through Slice 7, 2026-06-10 — folded into CLAUDE.md), `SCHEDULING_INTELLIGENCE_ARC` phase doc (covered in arc doc above).

**Notable discrepancies (doc claims vs live code):**
- SUB_INVOICES_ARC.md says "nothing built" → `SubInvoicesSection.jsx` IS fully built with 3-bucket view + full workflow
- DAILY_LOG_ARC.md says "all 5 phases shipped" → confirmed: `LogsTab.jsx` is the component (not a separate named DailyLogScr)
- CONTRACT_SIGNING_ARC.md says sbSendEstimateEmail uses wrong field → confirmed ALREADY FIXED in live code (`to: job.client_email`)
- COMPANY_FILES_ARC.md says "not started" → `CompanyFilesScr.jsx` Phase 2 is fully built
- GOD_AGENT_ARC.md references Phase 6 as prerequisite for God Agent → Slice 6.0 deviation gate now SHIPPED
