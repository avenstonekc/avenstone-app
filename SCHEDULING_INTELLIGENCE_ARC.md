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
