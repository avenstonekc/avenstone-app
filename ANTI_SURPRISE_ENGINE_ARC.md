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

## Phase 1 shipped (2026-06-03)

**Commits:** bebbb52 (schema+seed), 1a9052e (edge fns), 295bb5b (pg_cron), 8bf9027 (helpers), 87c46a8 (kind constraint), e48104e (notification type open + dispatcher fix)

**What shipped:**
- `tenant_playbook_items` table — 10 Avenstone trade checklists, 89 items, photo_required + must_document flags per item.
- `anti-surprise-generator` edge fn — nightly 3am UTC pg_cron. Sweeps jobs with `status='contract'` updated in last 25h. Resolves trades from `estimate_line_items` (fallback: `job_sub_engagements`). Fuzzy word-prefix match to `tenant_playbook_items.work_type`. Writes one `scheduled_actions` row per matched trade (kind=`walkthrough_prep`, dedup via rule_key). Also accepts `force_job_ids` for testing/re-generation.
- `anti-surprise-dispatcher` edge fn — every 15min pg_cron. Reads all ripe `scheduled_actions` (fire_at <= now, status=scheduled). Dispatches `walkthrough_prep` rows → creates todo + notification for target PM, marks fired. Skips `company_file_expiration` (handled by company-files-watchdog). Processes 50 rows max per run.
- 3 client helpers: `sbLoadPlaybookItemsForWorkType`, `sbLoadPlaybookWorkTypes`, `sbGetWalkthroughPrepActions`.
- Constraint fixes: `scheduled_actions.kind` extended with `walkthrough_prep`; `source` extended with `anti_surprise_engine`; `notifications.type_check` dropped (open type system — enum was stale).

**Verified end-to-end on 999 Test Lane (job 7b44611a):**
- 9 `scheduled_actions` rows generated (Demo, Drywall-Hang, Electrical-Rough-in, Framing, HVAC-Install, Paint-Interior, Plumbing-Rough-in, Tile-Floor, Tile-Wall/shower)
- Backdated fire_at → dispatcher fired all 9 → 9 todos (source=engine, priority=medium, status=open) + 9 notifications created
- Cabinets/vanities missed by SQL LIKE (SQL approximation of JS word-prefix; "VANITY & FIXTURES" doesn't LIKE-match "Cabinets"). The deployed edge function handles this correctly via JS fuzzy match.

**Open issues found:**
- `notifications_type_check` was stale (hadn't tracked ai-pm-nightly types either) — dropped; all future types are free text.
- `todos.source_check` allows `'engine'` but not `'anti_surprise_engine'` — using `'engine'` in dispatcher.
- Cabinets/vanities SQL LIKE gap is only in the verification SQL above; actual edge fn JS matcher handles it.

## Open questions (NOT decided — resolve in-phase)

- "Fully OFF" coaching: can coaching ever be fully silenced, or only quieted-with-capture-always-on? Locked direction is capture-never-stops; the tone floor is undecided.
- tenant_playbook exact shape: one table with a type discriminator (walkthrough / consult / must-document) vs a small family of tables. Decide at Phase 1 build against real seed data.
- Competence tracking: what signal proves a rep "aces" a checklist item (all items completed? photo present? PM sign-off?) — defines when adaptive quieting fires.
- site_visit_checklist_items reconciliation: extend it into the playbook, or supersede + migrate. Audit at Phase 1 start.
- Generation trigger mechanism: pg_cron nightly sweep of newly-sold jobs vs. fire-on-status-change hook. Lean nightly sweep (batch, no per-event model risk).
- Dispatcher firing: how a ripe scheduled_actions row of kind='walkthrough_prep' becomes a surfaced card (todo + notification + agent card linkage).

## Cost guardrails

Detection + generation = pure SQL, no model spend. Optional Haiku phrasing pass off critical path only. Reactive scheduling agent = Sonnet (judgment). No Opus on any automatic/background path (CLAUDE.md rule). State call-volume implication when each phase's generation cadence is set.

---

## Governing principles (added 2026-06-03, post Phase 1.5)

**P1 — Build to the ceiling, dial down. Never build the floor and dial up.** Every feature is built at maximum thoroughness/safeguard as the default. Intensity is a SETTING layered on top, never a constraint baked into the foundation. Rationale: large companies want the big safeguards (liability, turnover, disputes); owner-operators want it dumbed down ("walk the job, check check check, snap snap snap"). Same engine, tunable intensity. You can always hide a safeguard an operator doesn't want; you can't add one a company never built in. No feature may be architected in a way that PREVENTS later toning-down (e.g. don't hardcode the PM as the only walkthrough owner; don't assume all playbook items always show).

**P2 — An incomplete checklist is a live obligation. It never silently dies.** Any walkthrough/checklist left incomplete schedules a follow-up reminder (via scheduled_actions) and chases the responsible actor (sub or PM) until completed or explicitly closed. Losing part of a checklist to incompletion — with no reminder — is the exact failure the engine exists to prevent (a hidden gap with a false sense of "handled").

**P3 — Distinguish in-progress-as-expected from abandoned.** Most incompleteness is legitimate: the work isn't finished yet (e.g. tile waterproofing done today, grout in 3 days — the checklist SHOULD be partial). Reminders must not dumb-nag on a fixed timer. For mid-flight work, the reminder re-fires when the RELATED work is next scheduled (depends on schedule-lock, Phase 2). Must-document items escalate hardest. The nudge→escalation ladder reuses the PROOF_ARC snooze-then-escalate / request-approval primitive (gentle nudge → louder → up to PM/owner).

## Named but deferred slices (build foundation NOT to exclude these)

- **Intensity dial** — per-tenant / per-operator setting controlling how thorough walkthroughs/coaching are (which playbook flags active, how many items surface, coaching tone). Rides on existing must_document / photo_required flags. Build after foundation complete. Foundation must not prevent it.
- **Sub-delegation (request-from-sub vs do-it-yourself)** — when a walkthrough fires, the PM can either send the sub a request to upload the required photos/checklist OR do it themselves on site. Sub does their own walkthrough on their phone, proof comes from who did the work. Own slice; depends on sub portal + request/notification path. Foundation must not assume the walkthrough owner is always the PM.
- **Schedule-lock (→ Phase 2, dependency engine)** — walkthroughs lock to schedule items: "tile started today → fire the tile walkthrough now." Also fixes the trade-as-one-lump flaw (a trade's work spans phases days apart — waterproofing vs grout — so checklists should tie to schedule POINTS, not one flat per-trade lump). Reminders (P3) re-fire off these schedule points.

---

## Future slice — Selection / Decision Deadlines (rides Phase 2.3 lead-time layer)

Client/PM selections (tile, vanities, paint colors, fixtures, LVP) are a major hidden schedule-killer in remodeling — the slow decision is invisible until the install date arrives and nothing's been ordered. This slice surfaces selection deadlines WEEKS early by back-calculating from the dependency chain + material lead times.

Mechanism (rides existing machinery, not a new system):
- The dependency chain (trade_dependencies) knows the install date for a trade.
- The lead-time layer (Phase 2.3) knows material_delivery must precede sub_start by lead_days (e.g. vanities 21d, tile 14d).
- Selection is one link further UPSTREAM: selection → order → delivery → install. So selection_deadline = install_date − lead_days − procurement_buffer.
- The system fires a task at the PM weeks ahead: "Pick tile with client for [job] — needed by [date] to stay on schedule." Slow client decisions get chased before they become delays.

Logging: when a selection is made, log it per job (tile = X, color = Y, vanity = Z, date decided, optional photo). Likely a job_selections table (same "capture the facts about this job" family as walkthroughs/playbook). Aven AI can later reference logged selections.

Scope-driven: which selections a job needs is driven by job scope (a deck build has no tile selection). Same Layer-1 × Layer-2 model as the keystone.

Open questions (resolve at build): procurement buffer size beyond lead time; does the CLIENT get pinged or only the PM; exact job_selections schema; which trades require a selection step.

Dependencies: needs the trade_dependencies table (keystone Slice 1) AND the lead-time layer (Phase 2.3) first. This is ~Phase 2.4. Captured here so the back-calculation machinery is built knowing this consumes it.

---

## Future arc — Visual Selection System (layout-library version)

The interface half of the Selection/Decision Deadline slice (already captured). When a selection is due (tile layout, paint, vanity, etc.), the client or PM picks from a CURATED LIBRARY OF OPTIONS with example images, and the choice is logged against the job. This kills the #1 hidden schedule-killer: slow/wrong client selections — by making the decision easy, visual, and recorded.

SCOPE (v1 — deliberately simple, confirmed with Kalin):
- NOT photo-realistic rendering of the client's actual space. NOT AI image generation per selection. That's explicitly OUT — too much work, not the goal.
- IS: a curated library of layout/option patterns, each with a name, short descriptor, and ONE clean example image (e.g. for tile: Stacked, Vertical Stacked, Horizontal Stacked, Brick Offset 1/3, Brick Offset 1/2, Herringbone, Vertical Herringbone, Chevron — 8 static example images, rendered/curated once).
- Selection screen: pick a pattern + tile size + where it applies (shower walls / floor / etc.).
- "Your Selection" summary logs the choice.
- Save Selection + Request Design Help (escalate to human design team).

DATA MODEL:
- job_selections table — per-job logged selections (selection_type e.g. tile_layout, chosen option, size, applied_to, date_decided, decided_by, optional notes).
- A selection-options / catalog model — the available patterns per selection type (name, descriptor, example_image_url), tenant-customizable (white-label: each tenant curates their own option library).

NEW NAV SURFACES (from the rendering): under PROJECT — "Selections"; under TOOLS — "Catalog" (the option library) and "Templates." Confirm against existing nav at build.

TIES TO: the Selection/Decision Deadline slice (Phase 2.4) — that slice back-calculates WHEN a selection is due (install date − lead time − buffer) and chases it; THIS arc is the interface where the selection actually gets made and logged. Two halves of one system: deadline chases the decision, this screen IS the decision. Also ties to the Client Portal (client makes selections there) and the "Things We Need From You" client to-dos (the render of the client To-Dos shows "Approve color selection / Sign change order" — same family).

BUILD WHEN: after the page-reskin line is complete. Own arc, own blueprint — it has a real data model (job_selections + catalog), not just a reskin. Small now that shower-rendering is OUT of scope.
