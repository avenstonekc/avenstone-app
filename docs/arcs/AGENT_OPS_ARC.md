# AGENT_OPS_ARC.md — agent operates the business with you

Living design doc for the AGENT_OPS arc. Read at session start when
touching ai-master-agent tools, scheduled_actions, watchdog detection,
delegation cards, or the daily-log followup flow.

## Status as of 2026-05-20

- **Phase 0 — shipped 2026-05-20.** Arc doc committed. Commit: 376e4a0.
- **Phase 1 — shipped 2026-05-20.**
  - **Phase 1.1 — shipped 2026-05-20.** `scheduled_actions` table, 4 indexes, 3 RLS policies, `set_updated_at` trigger, 3 sb helpers. Commit: 1523265.
  - **Phase 1.2 — shipped 2026-05-20.** Priority enum reconciled (3-level), `daily_logs` extended, `trade_material_lead_times` seeded. Commits: 3fb6a9f (migrations), b8f7b1a (helper). See "Locked enum reconciliation" in Schema section.
- **Phase 2 — shipped 2026-05-20.**
  - **Phase 2.1 — shipped 2026-05-20.** `add_todo` delegation: role gate (owner/pm → anyone; rep/sub denied), assignee name on Confirm card, `todo_delegated` notification + email. Commit: ae2b781. Open: rep→PM mapping deferred (no `assigned_pm_id` in profiles).
  - **Phase 2.2 — shipped 2026-05-20.** `notify_team_member` new CONFIRM_TOOLS verb. Direct in-app alert to a specific team member. Role gate: owner/pm → anyone; rep → denied; sub → active engagement + target is job PM. Priority-email gate fixed: trigger now has `WHEN (NEW.email_sent IS NOT TRUE)`; executor sets `email_sent = priority !== 'high'`. Also fixes `todo_delegated` email gating from Phase 2.1 (was unconditional). `master_agent` notification type reinstated in constraint (dropped in Phase 2.1 — broke notify_team tool). Commit: a214cdb.
- Phase 3-6 not started.

## What this arc is

The Master Agent today is a one-shot tool-caller. User says something →
agent calls one or more tools → agent reports. Anti-Surprise lives in
*passive* surfaces: phase gates, schedule items, daily log review UI.
The user has to come look at the data to see the gap.

AGENT_OPS flips that. The agent **operates the business with the user**
instead of just responding to them. Three new capabilities:

1. **Delegation** — user assigns a todo to another team member with
   priority. Notification fires to assignee. Hands off — agent does
   not babysit Blake. That's between you and Blake.
2. **Reminders + self-followups** — time-based fires. "Remind me at
   7am Friday." "Check back at 4pm if I haven't logged the inspector
   call." Self-targeted only. No nagging other people through the
   agent.
3. **Watchdog** — cron-driven structural gap detection. Missing daily
   log, no schedule for next phase, materials not ordered for upcoming
   trade, change order pending too long. Fires to the role responsible
   for the work — not to specific designated humans.

Plus a **daily-log conversation hook** that turns the existing daily
log save into the agent's listening post. After submit, agent asks
only what the system doesn't already know.

This is the Anti-Surprise Engine applied to operations. The platform
stops being a place where the data lives and becomes a foreman that
makes sure the right person knows the right thing.

## Locked decisions

1. **Internal-only in v1.** Agent talks to your team. External notify
   (subs/vendors/clients) is a later arc using the same mechanism
   pointed outward.

2. **Agent surfaces, agent doesn't act.** Agent puts things on plates
   with priority. Humans decide. Agent follows up only on
   self-targeted commitments.

3. **Anti-Surprise applied to operations.** Every watchdog rule kills
   a class of surprise. Missing daily log, missing schedule, missing
   materials, stuck CO.

4. **Role-gated delegation.**
   - owner/PM → assign to anyone in tenant
   - rep → assign to self or to their PM
   - sub → assign to self only
   RLS enforces. App-layer checks are belt-and-suspenders.

5. **No new notification channels.** In-app + email via existing
   `notify-email` / Resend path. Push is queued, not blocked on. SMS
   deferred.

6. **No new auth surfaces.** Existing profiles, RLS, sub portal auth.

7. **Cron is the heartbeat.** Two `pg_cron` jobs:
   - Firing cron: every 5 minutes. Picks ripe `scheduled_actions`
     rows, executes, marks fired/failed.
   - Watchdog cron: every 15 minutes. Runs detectors. Detectors
     internally gate on time-of-day for daily-cadence rules. Inserts
     `scheduled_actions` rows on gap detection.

8. **Followups are self-only.** `set_followup` schema constraint:
   `target_user_id` must equal caller's id. No setting a followup on
   Blake. This is the design decision that prevents the agent from
   becoming a babysitter layer over your team.

9. **User stays in control.** Watchdog notifications are snoozable
   per-instance. Daily nag until acknowledged. Once-per-day ceiling
   per rule per recipient per job — even if the gap is still there.

10. **Dogfood gap mandatory before v2.** v1 ships, you use it on
    Test Flow + KCenergy work for at least a week, surface real gaps,
    then revisit. No expanding scope until v1 has been used in anger.

11. **Don't ask what the system already knows.** Every agent-initiated
    question (daily-log hook, future verbs) must pre-flight against
    existing structured data. If the answer is derivable from current
    state, agent states it. Doesn't ask it.

## Schema

### `scheduled_actions` (new)

The agent's own todo list — what it's supposed to do and when.
Distinct from `todos` which is the human-facing checkbox table.

```sql
CREATE TABLE scheduled_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('reminder', 'followup', 'watchdog')),
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'fired', 'cancelled', 'failed')),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high')),

  fire_at TIMESTAMPTZ NOT NULL,
  fired_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  retry_count INTEGER NOT NULL DEFAULT 0,

  created_by_id UUID REFERENCES profiles(id) NOT NULL,
  target_user_id UUID REFERENCES profiles(id),
  related_job_id TEXT REFERENCES jobs(id),
  related_todo_id UUID REFERENCES todos(id),
  related_entity_type TEXT,
  related_entity_id TEXT,

  payload JSONB NOT NULL DEFAULT '{}',
  result JSONB,
  rule_key TEXT,
  source TEXT NOT NULL DEFAULT 'agent'
    CHECK (source IN ('agent', 'watchdog_cron', 'system')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hot index for firing cron
CREATE INDEX idx_sched_act_ripe
  ON scheduled_actions (fire_at)
  WHERE status = 'scheduled';

-- User-facing queries
CREATE INDEX idx_sched_act_target_status
  ON scheduled_actions (tenant_id, target_user_id, status);

-- Job-scoped queries
CREATE INDEX idx_sched_act_job_status
  ON scheduled_actions (related_job_id, status);

-- Watchdog dedup — prevents same rule firing twice for same job
CREATE INDEX idx_sched_act_watchdog_dedup
  ON scheduled_actions (rule_key, related_job_id)
  WHERE status = 'scheduled' AND kind = 'watchdog';
```

**RLS:**
- SELECT: tenant_id matches AND (created_by_id = auth.uid() OR
  target_user_id = auth.uid() OR is_owner_or_pm)
- INSERT: tenant_id matches; cross-user write enforced by agent verb
  role gates and watchdog source='watchdog_cron' service role only
- UPDATE: creator, target, or owner/pm
- DELETE: nobody — use status='cancelled' for audit trail

### `daily_logs` extensions

Three nullable columns to capture daily-log followup answers.
Backward compatible — existing rows = NULL = "not asked."

```sql
ALTER TABLE daily_logs
  ADD COLUMN IF NOT EXISTS phase_on_schedule BOOLEAN,
  ADD COLUMN IF NOT EXISTS delay_days INTEGER,
  ADD COLUMN IF NOT EXISTS issues_flagged TEXT;
```

### `todos` extensions (verify existing state first)

- `assignee_id UUID REFERENCES profiles(id)` — may already exist.
  Verify before adding.
- `priority TEXT` — NOT added. Existing `todos.priority` CHECK is
  `('low', 'medium', 'high')`. Phase 2 executor uses `assigned_to_user_id`
  (the existing assignee column — see Locked enum reconciliation below).

### `trade_material_lead_times` (new)

Tiered watchdog rule 3 needs per-trade overrides on the global 7-day
lead time threshold. Small table.

```sql
CREATE TABLE trade_material_lead_times (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),  -- NULL = platform default
  trade TEXT NOT NULL,
  lead_days INTEGER NOT NULL CHECK (lead_days > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, trade)
);

-- Seed Avenstone-specific overrides — canonical trade_phase_map strings
-- (spec had 3 incorrect strings; corrected 2026-05-20 during Phase 1.2 build)
INSERT INTO trade_material_lead_times (tenant_id, trade, lead_days) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Cabinets / vanities - Install', 21),
  ('00000000-0000-0000-0000-000000000001', 'Tile - Floor',                  14),
  ('00000000-0000-0000-0000-000000000001', 'Tile - Wall / shower',          14),
  ('00000000-0000-0000-0000-000000000001', 'Plumbing - Finish / fixtures',  14);
-- 4 rows (not 5 — 'Cabinets - Install' and 'Cabinets/vanities - Install' merged
-- to canonical 'Cabinets / vanities - Install'; global fallback 7 days for all others)
```

RLS: SELECT for all authenticated users (anyone can read lead times
for any tenant); INSERT/UPDATE/DELETE owner/pm of that tenant only.

### `notifications_type_check` additions

New notification types:
- `todo_delegated` — fires when add_todo with assignee != creator
- `reminder_fired` — fires when set_reminder hits fire_at
- `followup_check_failed` — fires when set_followup check fails
- `team_alert` — fires when notify_team_member runs
- `watchdog_alert` — fires when watchdog rule fires

Migration adds these to the CHECK constraint. Pattern matches the
2026-05-18 daily_log_sent constraint addition.

### Locked enum reconciliation (2026-05-20, Phase 1.2)

`todos.priority` is the canonical 3-level enum: `('low', 'medium', 'high')`.
`scheduled_actions.priority` was spec'd as 4-level ('low','normal','high','urgent');
migrated to 3-level in Phase 1.2 (migration 20260520110000) to match. All verbs
and watchdog rules default to 'medium' where previously 'normal'. Email gate
changed from 'high'+'urgent' to 'high' only. `todos.assignee_id` was NOT added —
the existing column is `assigned_to_user_id`; Phase 2 executor MUST use that column.

## Agent verbs (5 total)

### Verb 1 — `add_todo` (extended)

Already in CONFIRM_TOOLS. Stays there. Two new fields:

```typescript
{
  title: string,           // required
  assignee_id?: string,    // dynamic_options=active_team; defaults to caller
  priority?: 'low'|'medium'|'high',  // defaults to 'medium'
  due_at?: timestamptz,    // optional (verify column exists)
  job_id?: string,         // already supported; optional
  description?: string,    // already supported
}
```

REQUIRED_FIELDS: `title` only stays required. assignee_id and priority
default; no card unless user gave neither and tool was invoked
ambiguously.

Role gate executor logic:
```
if assignee_id != caller_id:
  if caller.role == 'owner' or caller.role == 'pm': allow
  elif caller.role == 'rep':
    allow only if assignee.id == caller's assigned_pm_id
  else: deny → return error → agent surfaces in text turn
```

Confirm card readback: "Add todo for Blake: 'call plumber for Test
Flow', high priority. Confirm?"

Firing behavior: insert `todos` row + insert `notifications` row for
assignee. Email if priority = 'high'.

### Verb 2 — `set_reminder`

New verb. CONFIRM_TOOLS.

```typescript
{
  title: string,                 // required
  fire_at: string,               // required, natural language parsed server-side
  target_user_id?: string,       // defaults to caller; role-gated if other
  priority?: 'low'|'medium'|'high',  // defaults to 'medium'
  related_job_id?: string,
}
```

REQUIRED_FIELDS: title (text), fire_at (text). Server parses
"tomorrow 4pm" / "friday 7am" / ISO timestamps. If parse fails, the
REQUIRED_FIELDS card re-emits with an error label and the user
retries.

Role gate: same as add_todo for cross-user targeting.

Executor: insert `scheduled_actions` row with `kind='reminder'`,
`fire_at`, target, priority, payload={ title, message }.

### Verb 3 — `set_followup`

New verb. CONFIRM_TOOLS. **Self-only enforced.**

```typescript
{
  check_what: 'todo_completed' | 'daily_log_submitted' | 'schedule_item_status',
  related_entity_id: string,     // required
  fire_at: string,               // required, natural language parsed
  priority?: 'low'|'medium'|'high',  // defaults to 'medium'
}
// No target_user_id field — implicit caller
```

Schema-level constraint: tool spec has no `target_user_id`. Executor
sets target_user_id = caller_id. This is the structural enforcement
of locked decision 8.

Cron fire behavior: runs the check query based on `check_what`. If
check passes (todo complete / log submitted / schedule item at
expected status), `status='fired'`, `result={check: 'passed'}`, no
notification. If check fails, notification fires to caller.

### Verb 4 — `notify_team_member`

New verb. CONFIRM_TOOLS. Direct alert, not a queued action — fires
immediately on confirm.

```typescript
{
  message: string,               // required
  target_user_id?: string,       // OR target_role_on_job
  target_role_on_job?: 'pm' | 'owner' | 'assigned_sub',
  related_job_id?: string,       // required if target_role_on_job set
  priority?: 'low'|'medium'|'high',  // defaults to 'high'
  also_create_todo?: boolean,    // defaults to false
}
```

Single recipient per call. Multi-recipient = agent makes multiple
tool calls.

Role gate executor:
- owner/pm → can notify anyone
- rep → can notify their PM or owner only
- sub → can notify the PM on jobs they're engaged on

Firing: insert `notifications` row immediately + email (default
priority is 'high' so email fires by default). If `also_create_todo`,
also insert a `todos` row.

### Verb 5 — `list_my_queued_actions`

New read-only verb. Not in CONFIRM_TOOLS.

```typescript
{
  window?: 'today' | 'this_week' | 'all',  // defaults to 'today'
  include_completed?: boolean,             // defaults to false
}
```

Returns scheduled_actions WHERE target_user_id = caller AND status =
'scheduled' AND fire_at IN window. Agent synthesizes the list as
readable prose, not a raw dump.

## Watchdog rules (4 total)

Each rule is a detector function in `agent-ops-watchdog` edge fn.
Dedup via the `idx_sched_act_watchdog_dedup` partial index — if a row
exists with same `rule_key + related_job_id + status='scheduled'`,
detector skips.

### Rule 1 — `missing_daily_log_after_phase_start`

**Detection:** for each job in `status='in_progress'`, find current
phase (most recent job_phases row with status='in_progress'). Count
daily_logs rows for that job since phase.start_date. If 0 AND >1
working day elapsed → gap.

**Notify:** assigned PM. If null, owner.
**Priority:** normal (in-app only).
**Cadence:** daily, gated to morning (8am tenant timezone).

### Rule 2 — `next_phase_no_schedule`

**Detection:** for each job in_progress, find current phase. Look up
next phase via JOB_PHASE_TO_TMAP order. Count schedule_items where
trade ∈ next phase's tmap trades AND status IN ('scheduled',
'in_progress'). If 0 AND current phase has any complete schedule_item
OR current phase is >5 working days old → gap.

**Notify:** PM, fallback owner.
**Priority:** normal.
**Cadence:** daily.

### Rule 3 — `materials_not_ordered`

**Detection:** for each upcoming `sub_start` schedule_item with
status='scheduled' AND scheduled_date within lead-time threshold:
look up trade's lead_days from `trade_material_lead_times` (tenant
override → platform default → fallback 7). If
`scheduled_date - now() < lead_days` AND no `material_orders` row
exists for that job + trade with status IN ('quoted', 'ordered',
'delivered', 'installed') → gap.

**Notify:** PM, fallback owner.
**Priority:** high (gets email).
**Cadence:** daily.

### Rule 4 — `co_pending_decision`

**Detection:** for each `change_orders` row with status='submitted'
(or whatever the pre-decision state is — verify in build) WHERE
created_at < now() - INTERVAL '5 days' → gap.

**Notify:** owner.
**Priority:** high.
**Cadence:** daily.

### Deferred to next batch (not v1)

- Overdue todos rule — too close to babysitting; revisit after v1
  dogfood
- Stale leads rule — sales-pipeline-arc territory, not AGENT_OPS
- `review_job` verb — manual job audit; revisit after dogfooding

## Daily-log conversation hook

**Trigger:** `sbSubmitDailyLog` save completes successfully.

**Mechanism:** save handler sets `pendingDailyLogReview = { log_id,
job_id, phase }` on MasterAgent state. MasterAgent detects the flag,
runs pre-flight, emits opening pending_card.

**Pre-flight query (one batched read):**
- Current phase + expected_completion_date if present
- schedule_items for current phase (statuses, expected end)
- schedule_items for next phase (any planned? when?)
- material_orders for current + next phase trades
- Issue keywords scan on `work_completed` text

**Decision tree (locked decision 11 — don't ask what we already know):**

```
if schedule_items reveal phase is delayed:
  → STATE delay magnitude, ask "anything I should know?"
elif no expected_completion_date in system:
  → ASK "Is [phase] still on schedule?"
else:
  → skip step 1

if log content has issue keywords:
  → ASK "You mentioned '[matched fragment]' — want me to flag this
    and add a todo?"
  → if yes → chain into add_todo flow with assignee picker

if phase delayed AND next phase has scheduled items soon:
  → ASK "With [phase] [N] days over, [next phase] start [date] might
    conflict. Want a todo to look at the schedule?"
else:
  → skip step 4
```

Issue keywords v1 list: leak, short, delay, problem, behind, stop,
late, missing, broken, damaged, conflict, issue, oh-shit. Case
insensitive substring match. Tune from dogfood.

**Always-on, dismissible per-log.** No opt-out toggle in v1. Locked
decision: most days the hook will fire zero questions because the
system already knows. Boring day = silent.

**Patches to `daily_logs` row:** answers update phase_on_schedule
(boolean), delay_days (int), issues_flagged (text). Existing
client_message generation runs in parallel — unaffected by this hook.

## Build phases

Total: 15-19 prompts to v1 complete plus 2-3 polish prompts. Each
phase ends at a dogfoodable state.

### Phase 0 — this doc (1 prompt, Opus)

Commit `AGENT_OPS_ARC.md`. Add slug pointer to CLAUDE_MEMORY.md.

### Phase 1 — schema foundation (2-3 prompts, Sonnet)

- 1.1: `scheduled_actions` table, RLS, indexes, helpers
- 1.2: daily_logs extensions, todos.assignee_id + priority verification,
  trade_material_lead_times seeded
- 1.3 (only if needed): notifications_type_check additions
  consolidated into 1.1 if possible

**End state:** all schema in place, nothing fires yet.

### Phase 2 — delegation verbs (2-3 prompts, Sonnet)

- 2.1: `add_todo` extension (assignee_id + priority), role gate,
  AGENT_CARDS assignee picker
- 2.2: `notify_team_member` verb, CONFIRM_TOOLS entry, role gate,
  immediate-fire executor
- 2.3 (optional polish): role gate edge cases

**End state:** dogfoodable. "add to Blake's todos" and "tell the PM
on Test Flow" both work end-to-end.

**Dogfood pause: 2-3 days recommended.**

### Phase 3 — scheduler infrastructure (3-4 prompts, Sonnet)

- 3.0: audit prompt — verify pg_cron availability + cadence support
- 3.1: `agent-ops-cron` edge fn (firing cron), pick-ripe-rows logic,
  retry-once-then-fail
- 3.2: action handlers for `reminder` and `followup`, smoke test
- 3.3: pg_cron schedule wiring, verify running

**End state:** infrastructure exists, no user-facing verbs creating
rows yet.

### Phase 4 — reminders + self-followups (2 prompts, Sonnet)

- 4.1: `set_reminder` verb + natural-language date parsing
- 4.2: `set_followup` verb (self-only enforced) + `list_my_queued_actions`

**End state:** time-based fires work. Self-management of reminders
and followups.

**Dogfood pause: 2-3 days recommended.**

### Phase 5 — watchdog (3-4 prompts, Sonnet)

- 5.1: audit — verify schema for all 4 rules (especially Rule 4's
  change_orders status enum)
- 5.2: `agent-ops-watchdog` edge fn with 4 detectors, dedup logic
- 5.3: watchdog action handler in firing cron, daily nag logic
- 5.4 (likely): tuning slice from first real runs

**End state:** v1 AGENT_OPS shipped. Cron is watching.

### Phase 6 — daily-log hook (2 prompts, Sonnet)

- 6.1: post-save trigger, pre-flight state query, decision tree
- 6.2: pending_card rendering, conversation flow, daily_logs patch
  writeback

**End state:** listening post live.

**Final dogfood: 1-2 weeks before declaring v1 complete.**

## Guard rails (non-negotiable)

- `set_followup` cannot target other users — structural enforcement
  via tool spec, not policy
- Watchdog rules can never fire to "blake specifically" — only to
  role-on-job
- All money-spending tools stay in CONFIRM_TOOLS (no changes)
- Role gates enforced in executor AND in RLS — belt and suspenders
- Daily nag has hard once-per-day-per-rule-per-recipient-per-job
  ceiling
- Watchdog detector schema verified BEFORE writing detector code

## Dependencies

- Phase 7 (Contextual Job Context) audit already complete — Phase B
  build sits parked. Reviving when AGENT_OPS dogfood reveals job
  context friction. Audit is not stale; ~100 lines of plumbing.
- AGENT_CARDS infrastructure (Phases 1-5 shipped 2026-05-19) — all
  card rendering, REQUIRED_FIELDS, CONFIRM_TOOLS, POST_EXECUTE_ELICIT
  is the foundation. Zero changes to that surface.
- pg_cron must be available on Supabase project. Verify in Phase 3.0.
- Existing notification stack: `notifications` table + `notify-email`
  edge fn + Resend. Unchanged.

## Out of scope

- External notify (subs, vendors, clients via portal links)
- Recurring reminders / RRULE parsing
- Cancel/snooze dedicated verbs (handled by agent reasoning + update
  path for v1)
- Per-trade lead times beyond Avenstone's initial 5 overrides
- Auto-action verbs that don't require user confirmation
- Push notifications (deferred, not blocked)
- SMS channel (deferred indefinitely)
- Overdue-todos watchdog rule (deferred to next batch)
- Stale-leads watchdog rule (sales-pipeline-arc territory)
- `review_job` manual audit verb (revisit after dogfood)
- Sub portal expansion for delegation (subs are external until later
  arc)
- Cross-tenant delegation (not a v1 concern — single-tenant Avenstone)

## Open questions (revisit during build)

- Date parsing library available in Deno: chrono-node or alternative.
  Decide in Phase 4.1.
- Exact change_orders pre-decision status string — verify in Phase
  5.1 audit.
- Working-day calculation for Rule 1 (exclude weekends? holidays?).
  Probably weekends only for v1.
- Time-of-day gate for daily-cadence detectors — single tenant
  timezone or per-tenant. Single global for v1; per-tenant later if
  needed.
- Whether watchdog notifications should also surface in an "Agent
  Activity" feed or stay in the standard notifications bell. v1: just
  bell. Activity feed is post-v1 UI.

## Rollback plan

AGENT_OPS is additive on top of existing surfaces. If the arc breaks
in production:
1. Disable `pg_cron` schedules (single SQL command) — watchdog and
   firing cron stop running. Reminders queued but never fire. Stale.
2. Hide new agent verbs from tool spec by feature flag or comment-out
   — agent falls back to v1 behavior.
3. `scheduled_actions` table sits dormant — no data loss, no
   cascading damage to other tables.
4. Daily-log hook: remove the `pendingDailyLogReview` set call from
   `sbSubmitDailyLog` — log saves work normally.

No DB migrations require reversal. No deprecated tables. All
shipped infrastructure either runs or doesn't.

## Success criteria (v1 complete = ready to declare)

- All 5 verbs work end-to-end with role gating enforced
- All 4 watchdog rules detect real gaps in production data without
  false-positive flood
- Daily-log hook stays silent on boring days, surfaces real questions
  on logs with issues
- At least one delegated todo has gone Blake → done → followup-check
  passed in a real job
- At least one watchdog notification has surfaced a gap Kalin would
  have otherwise missed
- 1 week dogfood on Test Flow + KCenergy work with no critical bugs
