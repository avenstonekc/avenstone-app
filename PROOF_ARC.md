# Proof Arc — Design Blueprint

_Living doc. Update each phase as it ships._

---

## Purpose

Add **proof gates** — photo evidence — to the accountable artifacts that close the loop on field work: schedule items, change orders, and (optionally) before-state job documentation. Every accountable thing that says "this happened" must carry a photo that says "look." Layers on top of the existing `photos` table without rebuilding the upload stack.

**"Nothing done without proof"** is the design principle. The arc generalises the existing schedule-item photo banner into a real gate, extends it to change orders, and introduces a reusable *blocking todo* primitive (snooze N times, then escalate) that future arcs (COI expiration, lien waivers, permit renewals) can reuse.

---

## Flow

```
Field action closes
  → required photo categories present? → save
  → required photo categories missing? →
      ├─ user is owner+PM → bypass card (reason required for COs) → save
      └─ everyone else → save blocked, "Add photos" CTA

Optional artifacts (before photos when tenant-enabled, delivery photos)
  → blocking todo created on the responsible user
  → user uploads + tags → todo auto-closes
  → no upload after N snoozes → "Request approval" → owner+PM approves the bypass
```

---

## Phase Plan

| Phase | Scope | Status |
|-------|-------|--------|
| 1 — Schema foundation | `photos.category` column; `jobs.before_photos_required` flag; central JS config object for snooze/proof rules | **Planned** |
| 2 — CO photo gate | `co_condition` required at CO submission; `co_fix` required at CO close. Owner+PM bypass with reason. UI rework in `COTab` | **Planned** |
| 3 — Blocking-todo primitive | Extend `todos` with snooze counter + limit + escalation status + approver. Generic helpers. Reusable. | **Planned** |
| 4 — Before photos (optional artifact) | Tenant-toggleable. Blocking todo at `lead → in_progress` transition when enabled. Bulk-tag UI for retroactive labelling. | **Planned** |
| 5 — Delivery photo request | Soft prompt on `material_delivery` items at close. Tenant-toggleable. No gate. | **Planned** |
| 6 — Polish + on-device verify | Multi-photo bulk tag UX polish; iOS verification of camera capture for each category | **Planned** |

---

## Reused vs Net-New

### Reused (wire up, don't rebuild)

- **`photos` table** — exists, prod-verified. Already has `tenant_id`, `job_id`, `related_entity_type`, `related_entity_id`, `client_visible`, `label` (currently `before`/`after`), `name`, `type`, `url`.
- **`sbPhoto(jobId, file, entityType, entityId)`** — already accepts entity linkage. New `category` arg layered in non-breakingly.
- **`sbCountPhotosForEntity` / `sbLoadPhotosForEntity`** — already do the right thing per `related_entity_type`. Phase 2 adds an optional `category` filter.
- **`sbLabelPhoto`** — current Before/After label flow stays. Soft-deprecated in favour of `category`; keep working until UI fully migrates.
- **Multi-photo upload** — `NotesPhotosTab.PhotosTab.onFile` (lines 63–78) already loops `Array.from(e.target.files)` and uploads sequentially with a progress bar. **Multi-upload works today.** Confirmed in audit.
- **Schedule-item photo banner** — `ScheduleTab.ScheduleItemModal` (lines 658–690) already renders a banner that turns amber when `status='complete'` and `entityPhotoCount === 0` and prints "1 photo required to mark complete." **This is currently a soft warning, not a hard gate** — `save()` (lines 453–499) does not check the count. Phase 2 doesn't change this; the existing banner stays soft. The arc keeps schedule-item gates *advisory* and reserves the hard gate for COs (where the dollar trail makes proof load-bearing) and for tenant-opted-in before/delivery (where it's a one-time tenant choice).
- **COTab submission flow** — `addCO` in `COTab.jsx` writes a row with no photo plumbing today. Phase 2 wires `co_condition` proof into the submit flow and `co_fix` into the approve-to-close transition.
- **`todos` table** — exists with `status` (`pending`/`snoozed`/`dismissed`/`done`), `snoozed_until`, `target_user_id`, `severity`. Phase 3 *adds* columns without rewriting the table.

### Net-New (must build)

- **`photos.category TEXT`** — new column, NULL by default. Enum (loose, app-level): `before`, `during`, `install`, `after`, `co_condition`, `co_fix`, `delivery`, `null`. Indexed on `(related_entity_type, related_entity_id, category)`.
- **`jobs.before_photos_required BOOLEAN`** — per-job toggle. Defaults to whatever tenant config says for new jobs; backfilled to `false` for existing jobs.
- **`tenant_proof_config` (JS object, not a table v1)** — hardcoded in `src/lib/proofConfig.js`: which artifacts request/require photos, snooze limits, escalation roles. Ready to lift to a tenant config table later but no DB change this arc.
- **CO photo plumbing** — `sbSubmitCO` and `sbCloseCO` accept a `photos[]` arg that pre-attaches as `related_entity_type='change_order'` with the right category. Bypass path stamps `co_condition_bypass_reason TEXT` / `co_fix_bypass_reason TEXT` on the CO row (small additive migration).
- **Blocking-todo primitive (Phase 3)** — adds to `todos`: `snooze_count INTEGER DEFAULT 0`, `snooze_limit INTEGER` (NULL = unlimited self-snooze, today's behaviour), `escalation_status TEXT CHECK (NULL/'requested'/'approved'/'denied')`, `escalation_requester_id UUID`, `escalation_approver_id UUID`, `escalation_reason TEXT`. New helpers: `sbSnoozeTodo`, `sbRequestTodoBypass`, `sbApproveTodoBypass`.
- **Bulk-tag UI** — multi-select grid in `PhotosTab` that lets a user select N existing photos and tag them all `before` (or any category). Inline grid select preferred — modal feels heavy for a 4-tap action.
- **Bypass card UI** — modal that an owner/PM sees when they hit submit/close without required photos. Reason textarea (required for CO bypass, optional for schedule items). Logs to the artifact row.
- **Before-photos blocking todo** — emitted when a job transitions `lead → in_progress` AND `before_photos_required=true`. Title: "Capture before photos." Target: assigned PM or rep.
- **Delivery-photo soft prompt** — when a `material_delivery` schedule item flips to `complete` AND tenant config requests delivery photos, surface a non-blocking "Add delivery photos" CTA (or a low-severity todo). Not a gate.

---

## Locked Decisions

1. **"Nothing done without proof."** Universal design principle. Every accountable artifact closes with photo evidence.

2. **Before photos are optional, not required.** Tenant preference / onboarding toggle. Default off. Kalin will decide Avenstone's default later. NOT a hard gate in v1.

3. **Delivery photos are a request, not a requirement.** Tenant preference toggle. Kalin personally wants them (count verification). Default off for the tenant config; surface as a request prompt on `material_delivery` items.

4. **Change orders require photo proof in v1.** Two photo categories:
   - **`co_condition`** — the "why" (existing condition that triggered the CO)
   - **`co_fix`** — the "fix" (work performed)
   The "why" photo is required at CO submission BUT can be bypassed by owner + PM roles (for scope-add COs with no visible condition). The "fix" photo blocks CO from moving to a closed/complete status, with the same owner+PM bypass.

5. **Blocking todo primitive.** Snoozable todo with snooze counter and escalation. Default: 3 self-serve snoozes, then "Request approval" → owner+PM approve. v1 hardcodes the 3 for Avenstone; tenant-configurable later. Used by: before photos (when enabled), COI expiration (future), lien waivers (future), permit renewals (future). Generic primitive.

6. **Photo category schema.** Add a `category TEXT` column to `photos` table. Values v1: `before`, `during`, `install`, `after`, `co_condition`, `co_fix`, `delivery`, `null` (uncategorized). The existing `label` column (currently `before`/`after`) is preserved but soft-deprecated in favor of `category`. Migration strategy TBD in the arc.

7. **Existing jobs are grandfathered.** Add a `before_photos_required BOOLEAN` flag on jobs, default to whatever the tenant pref says for new jobs, set `false` for all existing jobs at migration time.

8. **Multi-photo upload must work for field flow.** Confirm in the audit; if it doesn't, fix is part of v1. Bulk-tag (select N existing photos, tag them all as `before`) is also v1.

---

## Phase Detail

### Phase 1 — Schema foundation

Lays the columns and config the rest of the arc depends on. Pure plumbing, no UX.

- **Migration:** `photos.category TEXT` + index on `(related_entity_type, related_entity_id, category)` filtered to `category IS NOT NULL`. `jobs.before_photos_required BOOLEAN NOT NULL DEFAULT false`. Backfill all existing jobs to `false`. Backfill `photos.category` from `photos.label` where `label IN ('before','after')`.
- **Config object:** `src/lib/proofConfig.js` exports `PROOF_CONFIG` — keyed by artifact (`schedule_item`, `change_order`, `job_before`, `material_delivery`). Each entry: `requiredCategories: []`, `requestedCategories: []`, `bypassRoles: []`, `snoozeLimit: number | null`, `escalationRoles: []`.
- **Helpers:** `sbPhoto` accepts optional `category` arg. `sbCountPhotosForEntity(entityType, entityId, category?)`. Both backward-compatible.

### Phase 2 — CO photo gate

The first hard gate. Money-adjacent, audit-visible, justifies the friction.

- **Submit flow:** `New CO` modal in `COTab` grows a photo capture/upload section labelled "Why this CO is needed." Min photo count drawn from `PROOF_CONFIG.change_order.co_condition.min` (likely 1). Owner+PM see a "Bypass — no visible condition" link below the camera button. Bypass requires a reason (free-text). On submit: photos pre-attached as `(related_entity_type='change_order', related_entity_id=<co.id>, category='co_condition')`; reason stamped on `co_condition_bypass_reason`.
- **Close flow:** When a pending CO moves to `approved → in_progress → complete` (or whatever the closure state ends up being), the same gate fires for `co_fix`. Same bypass affordance + reason stamp.
- **Files:** `COTab.jsx`, `sbCO`/`sbUpdCO` (or new `sbSubmitCO`/`sbCloseCO` thin wrappers), `proofConfig.js`, one tiny migration for the two `*_bypass_reason` columns on `change_orders`.

### Phase 3 — Blocking-todo primitive

Reusable across the rest of the arc and the next four arcs. Designed once, used many.

- **Migration:** `todos.snooze_count INTEGER NOT NULL DEFAULT 0`, `todos.snooze_limit INTEGER` (NULL = unlimited self-snooze = current behaviour), `todos.escalation_status TEXT CHECK (NULL/'requested'/'approved'/'denied')`, `todos.escalation_requester_id UUID REFERENCES profiles(id)`, `todos.escalation_approver_id UUID REFERENCES profiles(id)`, `todos.escalation_reason TEXT`.
- **Helpers:** `sbSnoozeTodo(todoId, until)` increments `snooze_count`, errors if `snooze_count >= snooze_limit`. `sbRequestTodoBypass(todoId, reason)` sets `escalation_status='requested'` and notifies the configured approver(s). `sbApproveTodoBypass(todoId)` sets `escalation_status='approved'` and marks the todo `done`.
- **UI:** `TodoCard` learns the escalation states. Snooze button is greyed when at limit; replaced by "Request approval" CTA. Approver sees the request as a separate todo on their list (`type='bypass_request'`).
- **Files:** `TodoCard.jsx`, `TodayScr.jsx` (already lists todos), `supabase.js` helpers, the migration.

### Phase 4 — Before photos (optional artifact)

Demonstrates the blocking-todo primitive on a non-money flow.

- **Trigger:** when `jobs.status` flips to `in_progress` AND `jobs.before_photos_required=true`, fire `sbCreateBlockingTodo({ type: 'before_photos', target_user_id: <assigned_pm_or_rep>, snooze_limit: PROOF_CONFIG.job_before.snoozeLimit, ... })`. Todo body: "Capture before photos before work covers them up."
- **Resolution:** any photo on the job tagged `category='before'` auto-closes the todo (helper: `sbResolveBeforePhotosTodo(jobId)` called from `sbPhoto` when `category='before'` AND `related_entity_type IN (null, 'job')`).
- **Bulk-tag UI:** `PhotosTab` grows a "Tag" mode. Tap **Tag** to enter select mode → tap N photos → bottom bar shows "Tag as: [Before] [During] [Install] [After]" — single tap categorizes all selected. Inline grid select, no modal.
- **Tenant toggle:** for v1, sites read `PROOF_CONFIG.job_before.enabled` (hardcoded `false` for Avenstone). When future tenant-config table lands, the value moves there.

### Phase 5 — Delivery photo request

Soft. Doesn't gate anything. Just asks.

- **Trigger:** when a `material_delivery` schedule item flips to `complete` AND `PROOF_CONFIG.material_delivery.requested === true`, show a one-time CTA in the modal: "Add a delivery photo? [Take Photo] [Skip]". Skip is sticky for the session.
- **No todo, no gate.** Just an in-context request. Photos uploaded here pre-attach with `category='delivery'`.
- **Tenant toggle:** `PROOF_CONFIG.material_delivery.requested`. Kalin's call to leave `true` for Avenstone or default `false`.

### Phase 6 — Polish + on-device verify

- iOS device verification of camera capture for each new category (the `capture="environment"` pattern is already proven for schedule items).
- Bulk-tag UX tuning if the inline grid feels heavy in practice.
- Empty-state and error copy review.
- Audit: which categories actually got used across the first 10 production COs and 10 production jobs. Adjust enum or copy based on real usage.

---

## Open Questions

Real unknowns — not the eight decisions already locked above.

- **Minimum photo count per CO category.** 1 each (`co_condition` ≥ 1, `co_fix` ≥ 1) is the natural floor. Worth asking whether some COs (e.g. a multi-room scope add) deserve a higher floor. Default to 1 each in v1, revisit after 10 real COs.
- **Bypass audit trail.** Should owner+PM bypass on a CO require a typed reason? In a single-tenant tool the cost is one extra textarea field; in multi-tenant audit-after-the-fact it's load-bearing. **Lean yes** — write the reason to `co_condition_bypass_reason` / `co_fix_bypass_reason` columns from day one. For schedule items (which stay soft-gated), no reason needed.
- **Bulk-tag UX shape.** Inline grid select with a bottom bar feels right, but a modal might be necessary if `PhotosTab` shows ~50+ photos on a long job. Decide with a real-data screenshot before committing.
- **Silent vs suggestive when before photos are off.** When `jobs.before_photos_required=false`, should the system show a soft "Capture before photos" suggestion at job creation? Or completely silent? Recommend silent — opt-out should mean opt-out.
- **Escalation surface.** When a blocking todo escalates (snooze limit hit, "Request approval" tapped), how does the approver see it? Options: (a) a row in `notifications`; (b) a separate todo on the approver's list; (c) both. Probably (b) + an in-app toast, no email for v1. Email arrives in a later arc.
- **Schedule-item gate: stay soft or harden later?** Today the schedule-item photo banner is advisory. Should it ever harden? Open. Argument for soft: schedule items are high-frequency, the friction tax is high. Argument for hard: completion-without-photo claims are exactly the problem the arc exists to solve. Defer to post-v1 data.

---

## Cost Guardrails

None net-new for this arc. No new AI calls — photos are uploads, gates are SQL row reads, todos are SQL writes. The blocking-todo escalation could eventually trigger an email/SMS notification fanout (`notify-email`, `notify-sms`), but that path is already-existing and rate-limited at the notification layer. **No new model spend introduced.**

---

## Schema Reference

### `photos` — new column

```sql
ALTER TABLE photos
  ADD COLUMN category TEXT;

CREATE INDEX idx_photos_entity_category
  ON photos(related_entity_type, related_entity_id, category)
  WHERE category IS NOT NULL;

-- Backfill from existing label column
UPDATE photos SET category = label
  WHERE label IN ('before', 'after') AND category IS NULL;
```

Values (app-level enum, not DB CHECK so we can iterate): `before`, `during`, `install`, `after`, `co_condition`, `co_fix`, `delivery`, `NULL`.

### `jobs` — new column

```sql
ALTER TABLE jobs
  ADD COLUMN before_photos_required BOOLEAN NOT NULL DEFAULT false;

-- Existing jobs grandfathered to false — no retroactive todo emission
```

### `change_orders` — bypass audit

```sql
ALTER TABLE change_orders
  ADD COLUMN co_condition_bypass_reason TEXT,
  ADD COLUMN co_fix_bypass_reason TEXT;
```

### `todos` — blocking-todo primitive

```sql
ALTER TABLE todos
  ADD COLUMN snooze_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN snooze_limit INTEGER,                       -- NULL = unlimited (today's behaviour)
  ADD COLUMN escalation_status TEXT
    CHECK (escalation_status IN ('requested', 'approved', 'denied')),
  ADD COLUMN escalation_requester_id UUID REFERENCES profiles(id),
  ADD COLUMN escalation_approver_id  UUID REFERENCES profiles(id),
  ADD COLUMN escalation_reason TEXT;
```

### Tenant proof config (JS, not DB, v1)

```js
// src/lib/proofConfig.js
export const PROOF_CONFIG = {
  change_order: {
    co_condition: { min: 1, bypassRoles: ['owner', 'project_manager'], reasonRequired: true },
    co_fix:       { min: 1, bypassRoles: ['owner', 'project_manager'], reasonRequired: true },
  },
  schedule_item: {
    soft: true,    // banner only, no save block — today's behaviour
    types: ['sub_start', 'site_visit', 'inspection'],
  },
  job_before: {
    enabled: false,    // tenant default for Avenstone
    snoozeLimit: 3,
    escalationRoles: ['owner', 'project_manager'],
  },
  material_delivery: {
    requested: false,    // soft prompt only; not a todo
  },
};
```

---

## Out of Scope (v1)

- **Per-room photo requirements** (using LiDAR scan rooms as anchors). v2.
- **Trade-specific shot lists** ("photograph the brand sticker on the opener"). v2.
- **Lumber counter / AI counting features.** Future.
- **Tenant config UI.** v1 hardcodes Avenstone defaults; values live in one place ready to lift to a config table later.
- **Auto-create draft daily log from schedule item completion.** Worth noting as a future cross-arc opportunity (DAILY_LOG_ARC + PROOF_ARC overlap) but not v1.
- **Snooze counter UI polish** (visible counts, snooze reasons). v1 = snooze N times silently then escalate.
- **Hardening the schedule-item gate.** Stays soft in v1. Decision deferred until production usage data.
