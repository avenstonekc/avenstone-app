# Anti-Surprise Engine Arc — Design Blueprint

_Living doc. Update each phase as it ships._

## Purpose

The anti-surprise engine sets a job up for success the moment it sells. When a job moves to sold, the system pre-builds the project skeleton overnight — trade walkthrough checklists, a guideline schedule, prep reports — and surfaces each piece exactly when it's needed (the plumbing walkthrough checklist appears the morning of the plumbing walkthrough, not before). It gets ahead of surprises instead of catching them after.

Three layers:
1. **Knowledge layer** — tenant-defined expertise: trade dependencies, walkthrough shot-lists per trade, consult question-sets per project type, must-document items per scope. This is the contractor's experience encoded once. It is the long-term product moat and the spine of tenant onboarding.
2. **Generation event** — job sells → overnight build of the project skeleton from the knowledge layer. Writes scheduled_actions rows that fire at the right moment.
3. **Surfacing + agent** — pre-built pieces trigger as in-app cards / push / email when relevant; a scoped, role-aware agent is the conversational surface that coaches from and enforces the knowledge layer.

## Code-true starting state (audited 2026-06-03)

- **scheduled_actions table EXISTS, sweeper-ready, 0 live rows.** 21 cols (kind, status, priority, fire_at, target_user_id, related_job_id, payload jsonb, rule_key, source, etc.). Partial ripe index on fire_at WHERE status='scheduled'. Dedup index (rule_key, related_job_id) WHERE status='scheduled' AND kind='watchdog'. ONLY company-files-watchdog reads it, scoped to kind='company_file_expiration'. NO general-purpose dispatcher exists — all other kinds are dead letters until one is built.
- **ai-pm-nightly EXISTS, 14 pure-SQL detection rules, ZERO model calls** (Opus narrative already stripped — comment: "AI narrative disabled — too expensive for automatic firing"). NOT disabled by flag — it simply has no trigger (no pg_cron, no GH Action points at it). Rules write to notifications + todos.
- **Cron infra:** pg_cron runs sequence-runner every 15min. 2 daily GH Actions (company-files-watchdog, credential-check). NO general agent scheduler. A new pg_cron entry → new dispatcher edge fn is the path.
- **Dependency model: DOES NOT EXIST in any enforced form.** Schema foundation present but logic-empty: schedule_items.predecessor_ids UUID[] (never written by app code), lag_days INT, schedule_change_log table (0 rows), trade_material_lead_times (4 Avenstone rows + 7d fallback). trade_phase_map is FLAT trade→phase label, NO ordering column. stage7_schedule.js test-data sketches the intended DAG (Demo→Framing→[Plumbing-R,Electrical-R,HVAC-R]→Insulation→Inspection→[Drywall,Tile]→finishes) but is never wired. derivePhaseStatus advances a phase on ANY single matching sub_start completion with NO cross-phase prerequisite check. scheduleAutoCreate creates isolated items with empty predecessor_ids. NO cascade runner, NO topological sort, NO precedence enforcement anywhere.
- **sbCheckResourceConflicts** (supabase.js ~3000): detects same-sub double-booking + invitee overlap. Soft amber warning, no block. **sbCheckLeadTime** (~629): checks material order_date+lead_days vs scheduled_date. Soft amber warning, no block, no auto-reschedule.
- **Delivery layer:** notifications INSERT fans out to email (on_notification_insert, guarded WHEN email_sent IS NOT TRUE) + push (TWO unconditional triggers: on_notification_insert_push→send-push AND trg_notification_push_fanout→notification-push-fanout — NO idempotency guard, latent double-send, no push_sent column). SMS: notify-sms edge fn DOES NOT EXIST on disk — trigger fires into a 404. SMS IS DEAD.
- **Reactive agents (all Sonnet/Haiku, all user-invoked, ZERO proactive):** ai-master-agent (Sonnet 4.6, 2048 tok, 24 tools, 13 CONFIRM_TOOLS, maxIter 3, 20-msg history, prompt caching ON, has create_schedule_item but no predecessor_ids support), ai-companion (Sonnet, 5 tools, no scheduling tools), ai-field-agent (Sonnet, 3 CONFIRM_TOOLS), ai-home-companion (Haiku, no tools), ai-project-manager (Opus, called indirectly, was the disabled nightly narrative path).
- **AGENT_CARDS layer EXISTS** in MasterAgent.jsx: pendingConfirm (gold confirm card, Confirm→deterministic executor) + pendingCard (<AgentCard> structured form, response re-enters agent loop). This is the in-app surface the engine feeds.
- **site_visit_checklist_items table + SiteVisitChecklist.jsx EXIST** (EXECUTION_ARC Phase 8) — 5 JS templates, walkthrough mode UI, failed-item→todo. Predecessor to the playbook walkthrough checklists — reconcile, do not duplicate.

## Locked decisions

1. **Trade dependencies live in a new tenant-level precedence table** (not a phase_order int on trade_phase_map). Trade-to-trade precedence is finer than phase-to-phase and white-label tenants define their own chains. Seed Avenstone from the stage7_schedule.js DAG.
2. **The knowledge layer is a NEW dedicated structured table family (tenant_playbook), NOT ai_knowledge.** ai_knowledge stays the freeform conversational-memory bag. The playbook is structured (work-type → ordered items with photo_required / must_document flags + identity) because it is the most-queried data in the system, must be enforced (flags as columns), drives tenant onboarding, and the adaptive-intensity system tracks competence per item ID. Parsing prose on every job/walkthrough/generation is a permanent hallucination + perf wound — rejected.
3. **Proactive engine uses NO model for detection.** Detection is deterministic SQL (instant, reliable, never cries wolf). Models belong only in the REACTIVE agents (judgment, language) and optionally a cheap Haiku phrasing pass off the critical path. High-frequency background firing must never touch a model — speed and trust reasons, not just cost.
4. **Generation is overnight/async on job-sold, surfacing is lazy (daily detection, surface on first sign-on).** No 2-hour buzzing. scheduled_actions rows hold pre-built triggers that fire at the relevant moment.
5. **Per-page / per-role agents = ONE master-agent brain given a scoped tool set + role lens + page context. NOT 40 separate agents.** Scoping is what minimizes hallucination (can't call out-of-scope tools) and maximizes competence (whole context is about the thing in front of the user).
6. **Adaptive intensity: only owner/PM can dial coaching intensity (rep cannot self-disable).** Coaching tone can go quiet per-topic on proven competence, but documentation/compliance capture NEVER fully stops — the must-document data protects the company, not just coaches the rep. "Fully OFF" is an OPEN QUESTION, not decided. The resolution direction: coaching can quiet, capture cannot.
7. **Draw-poke is float-based, cost-plus only.** Trigger when remaining client money (received − cost obligations) drops to 10% of job cost. Invoice jobs are NOT poked — they use auto-invoice on trade completion / payment arrangement (auto_invoice_trigger path, already built; gap is only the compose-time UI to set the trigger). This is one detection rule in the engine, independent slice.
8. **Push double-trigger idempotency fix is a prerequisite** before the engine fires notifications at volume (add push_sent guard / dedupe the two push triggers) or every actor gets double-pinged. SMS stays shelved (do not build notify-sms this arc).

## Phase plan (Sonnet-slice estimates)

| Phase | Scope | Slices | Status |
|-------|-------|--------|--------|
| 1 — Knowledge layer + generation event + walkthrough-checklist vertical | tenant_playbook schema + seed; job-sold generation event writes scheduled_actions; general dispatcher reads ripe rows of ALL kinds → surfaces walkthrough checklist as prep card at the right time; adaptive intensity (owner/PM dial, per-topic competence quieting, capture always on); reconcile with site_visit_checklist_items | 5–8 | Planned |
| 2 — Dependency engine | tenant trade_dependencies table + seed from stage7 DAG; populate predecessor_ids on item create; cascade runner (reflow downstream dates when a predecessor moves); lead-time + prerequisite hard-readiness check ("drywall can't start, LVP not bid") | 5–10 | Planned |
| 3 — Guideline schedule generation | job-sold generation extends to auto-populate a guideline schedule from the dependency engine + lead times | 2–4 | Planned |
| 4 — Scheduling agent (scoped) | scoped master-agent context over the dependency engine: "what do I need locked before drywall?" reads the graph + lead-time + bid/order state, answers readiness, can dispatch (send ITB, order material) one-tap | 3–6 | Planned |
| 5 — Vigilance dispatcher generalization + draw-poke | wire ai-pm-nightly's 14 SQL rules + draw-poke float rule into the general dispatcher on a daily pg_cron; surface-on-signon | 3–5 | Planned |
| 0 (prereq) — Push idempotency fix | dedupe the two unconditional push triggers / add push_sent guard | 1 | Planned |

## Open questions (NOT decided — resolve in-phase)

- "Fully OFF" coaching: can coaching ever be fully silenced, or only quieted-with-capture-always-on? Locked direction is capture-never-stops; the tone floor is undecided.
- tenant_playbook exact shape: one table with a type discriminator (walkthrough / consult / must-document) vs a small family of tables. Decide at Phase 1 build against real seed data.
- Competence tracking: what signal proves a rep "aces" a checklist item (all items completed? photo present? PM sign-off?) — defines when adaptive quieting fires.
- site_visit_checklist_items reconciliation: extend it into the playbook, or supersede + migrate. Audit at Phase 1 start.
- Generation trigger mechanism: pg_cron nightly sweep of newly-sold jobs vs. fire-on-status-change hook. Lean nightly sweep (batch, no per-event model risk).
- Dispatcher firing: how a ripe scheduled_actions row of kind='walkthrough_prep' becomes a surfaced card (todo + notification + agent card linkage).

## Cost guardrails

Detection + generation = pure SQL, no model spend. Optional Haiku phrasing pass off critical path only. Reactive scheduling agent = Sonnet (judgment). No Opus on any automatic/background path (CLAUDE.md rule). State call-volume implication when each phase's generation cadence is set.
