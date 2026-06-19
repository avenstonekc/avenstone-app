# SCHEDULING_INTELLIGENCE_ARC

## North star

Build the construction-scheduling engine that PMs at $20-100M GCs want to switch to. Procore + MS Project + AI, in one app. Every scheduling decision in service of Anti-Surprise: prevent something from going wrong before it does.

Today's calendar is a list of dates with titles. This arc turns it into a system that:
- Knows which tasks depend on which
- Cascades slips automatically
- Refuses to let you book a sub who's already double-booked
- Refuses to schedule tile install before tile is ordered with enough lead time
- Tells the client a delivery range, not a fake-precise date
- Surfaces cost of delay in dollars, in real time
- Auto-escalates unconfirmed sub commitments before they become surprises

## Today's gap (what's broken)

1. schedule_items are flat rows. No dependencies. Slipping framing doesn't move drywall.
2. No duration. Multi-day tasks are either one undated row or N separate rows.
3. No resource model. A sub on three jobs Wednesday looks fine in the data.
4. Lead-time data exists (trade_material_lead_times) but isn't enforced on scheduling.
5. No weather check. No permit gate. No inspection-pass dependency.
6. Sub invitations exist (CALENDAR_ARC Phase 1) but no escalation if unaccepted.
7. No critical path. No Gantt. No drag-to-reschedule with cascade preview.
8. No historical-risk model. Delivery dates are guesses dressed up as commitments.
9. No two-way external calendar sync.
10. Slippage has no dollar cost attached, so tradeoffs are made in the dark.

## Architecture

```
schedule_items (existing — extend with dependencies, duration, resource_id, risk)
        │
        ├─► dependency_graph (new) ── DAG of predecessors/successors per job
        │
        ├─► resource_load (new view) ── who's booked when, capacity tracking
        │
        ├─► lead_time_enforcer (logic) ── trade_material_lead_times + order status
        │
        ├─► weather_gate (logic) ── weather API + task.weather_sensitive flag
        │
        ├─► inspection_dependencies (new) ── inspection_required_for table
        │
        ├─► sub_confirmation_sla (logic) ── escalation timer per invite
        │
        ├─► risk_model (new) ── historical Avenstone data → confidence ranges
        │
        ├─► cost_of_delay (logic) ── per-task and per-job dollar impact
        │
        └─► UI surfaces:
                ├─► Gantt view per job
                ├─► Drag-to-reschedule with cascade preview
                ├─► Calendar (CalScr) — extended with the above signals
                ├─► Client portal — phase-completion updates auto-published
                └─► External sync (Google Calendar / iCal) two-way per user
```

## Phases

### Phase 1 — Dependency graph foundation

Schema + helpers + Gantt-readable output. NO UI changes yet.

- Migration: add columns to schedule_items
  - duration_days (INTEGER, default 1)
  - predecessor_ids UUID[] (FK constraint enforced at app layer; FK array isn't a hard DB constraint but we validate on insert)
  - lag_days INTEGER default 0 (gap between predecessor finish and this start)
  - is_milestone BOOLEAN default false
- Migration: new table dependency_audit_log (every change to predecessors logged for forensics)
- Helpers (supabase.js):
  - sbAddDependency(scheduleItemId, predecessorId, lagDays)
  - sbRemoveDependency(scheduleItemId, predecessorId)
  - sbComputeJobSchedule(jobId) — returns full forward-pass schedule with computed start/end dates per task, critical path flagged, total float per task
- Validation: predecessor must be on same job. No cycles (DFS detection on insert).

Scope: 3 prompts.
Ships: data layer ready for cascade logic. No UI work yet.

### Phase 2 — Cascade engine + slip handling

When a task's actual finish slips, every successor recomputes.

- Edge function: schedule-cascade
  - Triggered by schedule_items UPDATE on actual_finish_date or duration_days
  - Computes new earliest_start for every successor via DAG traversal
  - Updates each successor's scheduled_date
  - Writes a row to schedule_change_log for every slid task
- Helpers: sbAcceptCascade(jobId) and sbPreviewCascade(jobId, changedTaskId, newDate) — preview returns the slid set without committing
- UI: simple "cascade preview" modal — shows count of affected tasks + days slipped, two buttons: Apply or Discard

Scope: 3 prompts.
Ships: real auto-cascade. Slip framing → drywall slides → paint slides → trim slides. All in one transaction.

### Phase 3 — Critical path + float

Compute critical path and float per task.

- sbComputeJobSchedule extended to produce:
  - earliest_start, latest_start, earliest_finish, latest_finish per task
  - total_float (latest_start - earliest_start)
  - is_critical (total_float === 0)
- Materialized view job_schedule_snapshot, refreshed on relevant writes
- UI: in calendar, critical-path tasks render with a distinct color (red outline). In the job detail screen, a "Critical Path" badge appears on the timeline.

Scope: 2 prompts.
Ships: PM can see which tasks have zero slack. Slipping anything red blows the job's end date.

### Phase 4 — Resource model (sub capacity)

Subs and crews have capacity. Double-booking is detected and blocked.

- Migration: contacts gains a daily_capacity_hours column (or new sub_capacity table if more granular)
- Migration: schedule_items gains a resource_assignments table (item_id, contact_id, hours_required)
- Helpers:
  - sbComputeResourceLoad(contactId, dateRange) — returns daily load with conflicts flagged
  - sbCheckScheduleConflict(itemId, contactId, scheduledDate, durationDays) — returns {conflict: bool, conflicting_items: [...]}
- UI: when assigning a sub to a task, show their existing load that week. Conflict triggers a warning before save.

Scope: 3 prompts.
Ships: no more accidentally booking the same plumber on three jobs Wednesday.

### Phase 5 — Lead-time enforcement

Tie schedule_items to material/permit lead times.

- Migration: schedule_items gains a required_materials JSONB column (array of material kinds)
- Logic: at scheduling time, query trade_material_lead_times for each material kind, check whether an order exists in the materials table with order_date such that order_date + lead_time_days <= scheduled_date - 2 days (2-day buffer)
- Helpers: sbCheckLeadTimeReadiness(itemId) — returns {ready: bool, gaps: [{material, ordered: bool, days_short: N}]}
- UI: lead-time gap shows as red flag on the task. Cannot mark task confirmed until either materials ordered with enough lead time OR the gap is acknowledged with a justification note.

Scope: 2 prompts.
Ships: no more "tile install Monday but tile not ordered yet" surprises.

### Phase 6 — Weather gating

Outdoor tasks check weather.

- Migration: schedule_items gains a weather_sensitive BOOLEAN and weather_threshold JSONB (e.g. {rain_pct_max: 30, temp_min_f: 40})
- New table weather_forecasts cached per zip + date
- Edge function: weather-fetch — pulls from a free or cheap weather API (Open-Meteo is free, no key) for relevant zips daily
- Logic: at task display time, check forecast against threshold. If outside threshold → red flag on the task with "rain 75% Thursday" inline
- UI: weather flag visible in calendar + Gantt. Reschedule suggestion: "next clear day for this task is Saturday."

Scope: 3 prompts.
Ships: weather surprises become advance warnings.

### Phase 7 — Inspection dependencies

Inspections are first-class tasks with downstream gating.

- Migration: schedule_items gains task_type enum extension to include 'inspection_request', 'inspection_pass'
- Migration: new table inspection_blocks — many-to-many of which inspection_pass tasks block which downstream tasks
- Logic: a downstream task with a blocking inspection cannot have its scheduled_date < the inspection's scheduled_date. Cascade respects this.
- UI: inspection tasks have a distinct icon. Blocked downstream tasks show "Waiting on framing inspection" inline.

Scope: 2 prompts.
Ships: drywall literally cannot be scheduled before framing inspection in the data.

### Phase 8 — Sub confirmation SLA + auto-escalation

Invitations have deadlines. Silence escalates.

- Migration: schedule_item_invitees gains confirmation_deadline TIMESTAMPTZ (default = scheduled_date - 2 days)
- Edge function: invitee-escalation-cron — runs every hour, finds unconfirmed invites where now() > confirmation_deadline, fires escalation: push + email + SMS to invitee, push to inviter ("Blake hasn't confirmed Friday's job — last ping sent")
- UI: invitee status shows red "no response" badge when past deadline. Inviter sees the same on their dashboard with a "Reassign" button.

Scope: 2 prompts.
Ships: no more day-of "did you confirm with him?" texts.

### Phase 9 — Historical risk model + confidence ranges

Use Avenstone's own historical data to predict.

- New table schedule_completion_history (every completed schedule_item: planned vs actual days)
- ETL: a nightly cron computes average slip per (trade, task_type, room_count_bucket) for the last N jobs
- Helper: sbEstimateCompletionConfidence(itemId) — returns {p50_date, p90_date, p10_date} based on the historical model
- UI:
  - In Gantt: bars render with a confidence smear (lighter shading from p10 to p90)
  - Job summary screen: end date displays as "Aug 12 +/- 4 days" with the basis of the range
  - Client portal: same range, not a fake-precise date

Scope: 3 prompts.
Ships: deliveries become honest. Surprises become statistically expected.

### Phase 10 — Cost of delay

Every slip has a number attached.

- Migration: jobs gains daily_carry_cost (computed from supervision + financing + opportunity cost; can be a profile constant if too complex per job initially)
- Migration: schedule_items gains cost_of_delay_factor (multiplier — milestone tasks have higher impact)
- Logic: when cascade preview runs, compute total $ impact of the slip
- UI: cascade preview modal shows "Moving framing 3 days = $4,200 cost (extended supervision $1,800, holding cost $2,400)". Client portal shows nothing about cost (internal only).

Scope: 2 prompts.
Ships: PM decisions become numbers, not feelings.

### Phase 11 — Gantt UI + drag-to-reschedule

The visual layer that consumes everything above.

- New screen: per-job Gantt view (JobGanttScr.jsx)
- Each task = horizontal bar, length = duration_days, position = scheduled_date
- Critical path = red outline
- Dependencies = arrows between bars
- Weather flags, lead-time gaps, unconfirmed subs all surface as icon badges on each bar
- Drag to reschedule a bar → real-time cascade preview as a ghost overlay → release to confirm with the preview modal from Phase 2
- Library: use a battle-tested Gantt component (frappe-gantt, or custom SVG if existing UI patterns are heavily owned)

Scope: 4 prompts (audit phase first, then build in iterations).
Ships: the visual that makes everything above feel like one product.

### Phase 12 — Client portal integration

What clients see, automated.

- New table client_phase_updates — published phase events with photos + next-up info
- Trigger: when a milestone schedule_item completes, write a row to client_phase_updates
- Edge function: portal-notification-fanout — emails the client + (later) SMS
- UI: client portal screen shows a timeline of phase updates with photos pulled from job_photos for that phase

Scope: 2 prompts.
Ships: client never has to ask "what's the status."

### Phase 13 — External calendar sync

Two-way Google Calendar / iCal sync per user.

- OAuth integration: separate page in Settings for "Connect Google Calendar". Tokens stored encrypted, refresh-aware.
- New table calendar_sync_state — per-user mapping of schedule_item_id to external_event_id with last_synced timestamp
- Edge function: calendar-sync-out — when schedule_items writes, push to user's Google Calendar
- Edge function: calendar-sync-in — webhook from Google → updates schedule_items
- Conflict resolution: last-write-wins per field with audit log
- Per-user opt-in toggle

Scope: 6 prompts. (This is its own arc and could be split out if it gets unwieldy.)
Ships: subs' personal calendars stay current automatically. PM lives in Google Calendar if they want and the app follows.

## Sequencing

```
Phase 1 (dependency schema)       ← foundation, nothing else works without this
   ↓
Phase 2 (cascade engine)          ← biggest immediate value
   ↓
Phase 3 (critical path)           ← cheap addition once 1+2 exist
   ↓
Phase 4 (resource model)          ← second biggest value
   ↓
Phase 5 (lead-time enforcement)   ← uses existing trade_material_lead_times data
   ↓
Phase 6 (weather)                 ← external dep (weather API) — defer if Phase 4+5 enough
   ↓
Phase 7 (inspection deps)         ← extends dependency model
   ↓
Phase 8 (SLA escalation)          ← extends invitee system from CALENDAR_ARC Phase 1
   ↓
Phase 11 (Gantt UI)               ← can ship BEFORE 9/10/12/13 — adds visual layer for everything above
   ↓
Phase 9 (risk model)              ← needs accumulated historical data; can build infra now, model improves over time
   ↓
Phase 10 (cost of delay)          ← parallel-able with 9
   ↓
Phase 12 (client portal)          ← independent — can ship anytime after Phase 2
   ↓
Phase 13 (external sync)          ← its own arc, schedule when needed
```

Minimum viable "Anti-Surprise scheduling" is Phases 1+2+4+5. That's ~11 prompts. Adds dependencies + cascade + resource + lead-time. Already crushes any flat-calendar tool on the market.

## Trade-aware

Most of this is platform UI but several phases interact with trade-specific data:
- Phase 5 uses trade_material_lead_times — must filter by trade
- Phase 9 historical model — segment by trade for accuracy
- Phase 11 Gantt — task icons by trade
- Anything weather-gated (Phase 6) varies by trade — roofers care about rain, framers care less

All trade filtering uses existing trade column patterns. No new trade taxonomy.

## Estimated effort

Phase 1: 3
Phase 2: 3
Phase 3: 2
Phase 4: 3
Phase 5: 2
Phase 6: 3
Phase 7: 2
Phase 8: 2
Phase 9: 3
Phase 10: 2
Phase 11: 4
Phase 12: 2
Phase 13: 6

Total full arc: ~37 prompts. MVA (1+2+4+5): ~11 prompts.

## Risks

- Phase 1 dependency model touches schedule_items schema. Existing rows + ScheduleTab + CalScr must keep working. Migration must be backward-compatible (new columns NULLable).
- Phase 2 cascade engine: bugs here cause silent data corruption. Wrap in transactions, write audit logs, build a "rollback last cascade" admin tool.
- Phase 4 resource model: subs hate over-engineering. The capacity UI must be optional/light — never force a PM to enter hours if they don't want to. Default to "1 task = 1 day capacity" if no data.
- Phase 6 weather: external API dependency. Cache aggressively. Open-Meteo is free + no key but rate-limited; budget calls per zip per day.
- Phase 9 risk model: garbage in, garbage out. Needs maybe 20+ completed jobs in the data before predictions are meaningful. Build infra now, expose confidence ranges only once N >= threshold.
- Phase 11 Gantt: visual perfection rabbit hole. Lock the design language early (use existing app tokens — navy, gold, cream — don't reinvent).
- Phase 13 external sync: token storage + refresh + revocation is a real security surface. Encryption at rest mandatory. Per-user OAuth scopes minimized.

## Definition of done

- A PM at a $50M GC can run an entire $2M project in this app and have fewer surprises than they would with Procore + MS Project + a whiteboard.
- "What's the end date" returns a confidence range, not a fake-precise date.
- "What's blocking us right now" returns a real answer from the system, not an answer the PM has to compute.
- A slip on any task auto-cascades, auto-flags affected subs, auto-recalculates cost of delay, auto-updates the client portal — without the PM doing anything.
- The Gantt looks better than Procore's. Drag-to-reschedule is smoother than MS Project's.
- All of this works on a phone in a truck.

---

## Scheduling Intelligence + Proactive PM Layer (vision captured 2026-06-02)

### Thesis

The phases above make the schedule accurate. This layer makes the schedule *intelligent*. The difference: accuracy means the system reflects reality; intelligence means the system anticipates what will go wrong before the PM notices, and acts.

A PM's most expensive mistakes aren't bad decisions — they're forgotten ones. The countertop that wasn't ordered. The sub who was assumed confirmed. The inspector window that was missed. This layer closes the loop between "what the schedule says" and "what the PM needs to do right now."

Anti-surprise is not just about the client. It starts with the PM.

---

### Capability 1 — AI auto-schedule draft

**What it does:** When a PM creates a new job with a known scope (rooms, trades, rough sqft), the AI generates a first-draft schedule — tasks already dependency-linked, durations pre-filled based on trade/scope/size — ready for the PM to adjust, not invent from scratch.

**Inputs:** job scope (from ConsultationTab or estimate), trade list, rough sqft, job start date.

**AI behavior:** calls the same `sbComputeJobSchedule` path (Phase 1+2) but populates it from a trade-duration knowledge base rather than waiting for manual entry. PM reviews and adjusts — the AI draft is a starting point, never a final decision.

**Trade-duration knowledge base:**
- Platform defaults per trade per size bucket (e.g. "Tile — Wall/shower in a 60 sqft bathroom = 2 days labor, 3 days including delivery window")
- Tenant override rows for actual observed durations on real jobs
- Over time, historical completion data (Phase 9) replaces hardcoded defaults with learned actuals

**Handoff:** PM sees a draft Gantt on first load of the Schedule tab for a new job. One-tap "Accept draft" commits it. Individual tasks editable before or after accept.

**Cost model:** one Sonnet call per job creation (not per tab load). ~$0.003/job. Rate-limited at the job creation step, not automatic on every view.

**Dependencies:** Phase 1 (dependency schema), Phase 11 (Gantt UI) for the visual review step. Can ship a text-list draft before Phase 11.

---

### Capability 2 — Self-adjusting / guideline schedule

**What it does:** As tasks complete (or slip), the schedule cascades automatically and the PM is never staring at a stale plan. But the system treats the schedule as living guidelines, not a legal contract — PM can override any cascade suggestion.

**This is Phase 2 (cascade engine) elevated to a product framing, not new code.** The key shift: the PM experience is "the system kept up with what happened" rather than "I have to manually push dates around." Cascade preview is shown before commit. PM can accept, modify, or discard.

**Guideline framing:** the UI language matters. "Suggested new date: Aug 14 (3-day slip from framing delay)" — not "YOUR SCHEDULE IS WRONG." The system offers, the PM decides.

**Auto-accept option:** PM can opt-in to auto-accept cascades with no resource conflicts (low-risk adjustments). Conflicts always require PM approval. Default is manual approval for every cascade.

---

### Capability 3 — Proactive PM pokes

**What it does:** The system watches the schedule and proactively notifies the PM about risks *before* they become problems. Notifications are specific, actionable, and timed right.

**Trigger examples (not exhaustive):**
- "Tile install is scheduled for Monday. Tile hasn't been ordered yet and lead time is 5 days. Order today or push the date."
- "Blake (tile) hasn't confirmed Friday's start. Last ping was 3 days ago. Confirm or reassign."
- "Framing is 2 days behind. This pushes your projected end date to Sep 3, which is 8 days past the contract deadline."
- "Inspection window opens Thursday. Have you requested the permit yet?"
- "Countertop template measurement is scheduled in 4 days. Is the base cabinet install complete?"

**Delivery:** push notification (in-app + mobile) + HomeScr poke card. Not email-only — PMs are in the field.

**Poke anatomy:** one sentence diagnosis + one sentence action. No walls of text. Tappable to the relevant task.

**Timing model:** pokes fire at configurable lead times per poke type. Default: 48h before deadline for ordering, 72h for unconfirmed subs, immediate for cascades that blow the contract date. Tenant-configurable in settings.

**Rate limiting:** max 3 pokes per PM per day per job. Poke deduplication: same trigger within 12h = suppressed. Don't spam.

**Cost model:** logic runs as a cron job (nightly or every 6h). Pure SQL checks + a light Haiku call only if a narrative is needed (most pokes are template-generated, not AI-generated). Cost = negligible.

**Dependencies:** Phase 5 (lead-time), Phase 8 (sub confirmation SLA), Phase 2 (cascade/slip detection).

---

### Capability 4 — Sub portal automation

**What it does:** The same proactive poke layer that notifies the PM also notifies the sub directly — eliminating the manual coordination PM currently does on every job.

**PM currently does manually:**
- "Hey Blake, still on for Friday?" (confirmation ping)
- "We're pushed to Tuesday now, is that okay?" (cascade notification)
- "We need your material list by Wednesday" (material request)
- "The inspection passed — you're clear to start drywall" (gate clearance)

**System takes over:**
- Unconfirmed sub 72h before start → auto-ping to sub portal + SMS. Sub confirms in-app, one tap.
- Cascade that moves a sub's start date → auto-notification to sub with new date + confirmation request.
- Inspection pass → auto-ungate downstream subs and notify.
- Material list needed → auto-request via sub portal with deadline.

**Delivery:** sub portal (existing) + push + SMS. Sub sees "Your next job" card with confirm/decline.

**PM visibility:** PM dashboard shows sub response status at a glance. "Blake confirmed. Dave hasn't responded (72h)." No dig-into-job required for status check.

**Scope boundary:** sub portal automation is a coordination layer — it routes the right message to the right person at the right time. It does not replace human judgment on schedule decisions. PM still owns the schedule; subs still own their availability. The system just stops PMs from having to manually ping everyone on every job every day.

**Dependencies:** Phase 8 (sub confirmation SLA), push/SMS infrastructure (already exists), sub portal (exists). Capability 3 poke engine is the shared logic layer.

---

### Capability 5 — Sub scorecards

**What it does:** Every sub gets a performance record built from real job history. PMs see sub quality before booking. Subs know their record is being tracked.

**Metrics tracked:**
- On-time start rate (scheduled start vs actual start, per job)
- Completion vs estimate (scheduled duration vs actual duration)
- No-show rate (started late by > 24h with no prior notice)
- Material readiness (arrived with correct materials vs had to leave to get materials)
- Quality callbacks (flagged via PM review or failed inspection)
- Response rate (confirmed within SLA vs ignored/late)

**UI surfaces:**
- Sub picker shows scorecard badges at booking time — "Blake: 92% on-time, 4.8 on quality"
- Sub detail page shows full breakdown with per-job history
- PM dashboard: weekly "sub reliability" widget — who's your most reliable vs. who's slipping

**Data source:** `schedule_completion_history` (Phase 9) + sub confirmation log (Phase 8) + PM review events (new lightweight review step at task close). No survey, no 5-star rating — just observed behavior from data already in the system.

**Tenant-private:** scorecards are per-tenant. Avenstone's data stays in Avenstone. No cross-tenant sub reputation sharing (for now).

**Dependencies:** Phase 8 (sub confirmation data), Phase 9 (completion history). Can ship basic on-time/no-show metrics from Phase 8 alone before Phase 9 is live.

---

### Capability 6 — PM self-scorecard / self-anti-surprise

**What it does:** The system learns the PM's own recurring failure patterns and warns them proactively. The anti-surprise loop turned inward.

**Insight examples:**
- "You've delayed countertop orders on the last 3 projects. Average cost: 11 days total slip, $3,800 in carry. Your countertop lead time is typically 12 days — order date suggested: today."
- "You've missed the framing inspection window on 2 of your last 4 jobs. Reminder set 5 days before permit expiry."
- "Blake has a 68% on-time start rate for you specifically (better with other PMs — may be a scheduling-fit issue, not a reliability issue)."
- "Your last 4 projects ran 8% over the scheduled end date. Your current job is 4% ahead of pace — on track."

**PM receives this as:** a weekly personal briefing card on HomeScr. Not a judgment — a mirror. "Here's what your data shows."

**Personalization engine:** builds per-PM pattern history from completed jobs. Needs ~5 completed jobs before patterns are meaningful. `job_pm_pattern_history` table (new) — per (user_id, pattern_type) running stats.

**Self-anti-surprise framing:** the vision is that a PM using this system for 2 years becomes a better PM — not because of training or manual process, but because the system quietly learned what they forget and started catching it for them.

**Cost model:** weekly cron, Haiku narrative call per PM. ~$0.001/PM/week. Negligible.

**Dependencies:** Phase 9 (historical completion data), Phase 5 (lead-time data for order-timing patterns), Capability 5 (sub-fit detection needs both PM and sub history).

---

### Architecture additions (this layer)

```
poke_engine (new — cron + trigger)
    │
    ├─► schedule_poke_log (new) — deduplication + delivery record
    │        tenant_id, job_id, poke_type, target_user_id, fired_at, acked_at
    │
    ├─► sub_scorecard_stats (materialized view) — refreshed nightly
    │        contact_id, tenant_id, on_time_rate, no_show_rate, avg_slip_days
    │
    ├─► job_pm_pattern_history (new) — per-PM rolling pattern stats
    │        user_id, tenant_id, pattern_type, event_count, impact_sum, last_updated
    │
    └─► ai_schedule_draft (edge fn, new)
             input: job_id, scope_summary, trade_list, start_date
             output: draft schedule_items array → written on PM confirm
```

All new tables include `tenant_id NOT NULL` + RLS. Sub scorecard stats are tenant-private.

---

### Sequencing (this layer, after Phase 8+9)

```
Capability 3 (proactive PM pokes)     ← earliest win; minimal dependencies
   ↓
Capability 4 (sub portal automation)  ← extends poke engine to subs
   ↓
Capability 5 (sub scorecards)         ← needs Phase 8+9 data accumulation
   ↓
Capability 6 (PM self-scorecard)      ← needs 5+ completed jobs per PM
   ↓
Capability 1 (AI auto-schedule draft) ← needs trade-duration KB + Phase 1 schema
   ↓
Capability 2 (self-adjusting)         ← IS Phase 2 — UX framing, no new code
```

Minimum viable intelligence layer: **Capability 3 alone**. Every PM poke that fires correctly is a surprise that didn't happen. Ship Capability 3 as soon as Phase 2+5+8 are live.

---

### Open questions

1. **Poke suppression policy** — who decides which pokes are too noisy? Tenant-level config (PM can mute categories) vs. system-level defaults only. Starting point: system defaults + global mute toggle. Per-category control is Phase 2 of poke settings.

2. **Sub scorecard visibility to subs** — do subs see their own scorecard? Argument for: transparency builds trust and gives subs agency to improve. Argument against: low scorecards create friction at booking time if subs can see them and dispute. Starting position: PM-only visibility. Sub self-view as an explicit opt-in feature later.

3. **PM self-scorecard opt-out** — some PMs may not want a weekly "here's what you do wrong" card. Default: opt-in with nudge on first pattern detection. Hard disable in profile settings.

4. **AI draft confidence signal** — when the AI drafts a schedule, it should surface its confidence: "Based on 12 similar bathroom tile jobs, typical duration is 3 days ± 1 day" vs. "No historical data for this trade/size combination — duration is a rough estimate." Confidence signal prevents PMs from over-trusting the draft.

5. **Multi-PM jobs** — scorecards and pokes are currently per-PM. Jobs with multiple PMs (PM + field super) need a delivery model. Start with primary PM only (assigned rep); extend to team delivery later.
