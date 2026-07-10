# Model B — Job Lifecycle Consolidation

**Goal:** make `job_phases` the single source of truth for a job's lifecycle, with
`jobs.status` derived as a rollup — killing the two-parallel-systems divergence a
read-only audit measured (see "Audit findings" below).

**Status:** Phase 1 SHIPPED (2026-07-10). Phases 2–4 pending.

---

## The two truths (audit, 2026-07-09)

- **`jobs.status`** — the 6-state lifecycle (`lead → proposal → contract →
  in_progress → final_touches → complete`, plus lateral `on_hold`). CHECK-enforced,
  default `lead`. Advanced by a gate engine confusingly named `sbAdvancePhase` /
  `sbCheckPhaseGates` / `getNextPhase` (`src/lib/phaseGates.js`), the manual status
  picker (`JobDet.jsx`), contract signing (`ClientSignContractModal.jsx`), and agent
  verbs. **Drives** Projects chips/filters/badges, Dashboard/Reports/commission,
  Calendar, the client-portal stepper, leads list.
- **`job_phases`** — a 10-row template per job (`DEFAULT_PHASES`, `supabase.js:554`):
  Lead, Proposal, Contract, Demo, Rough-ins, Inspections, Drywall, Finishes, Final
  touches, Complete. `phase_order` 1–10; `status` not_started/in_progress/complete.
  Driven by `derivePhaseStatus` from `schedule_items` completion — **construction
  phases only** (via `trade_phase_map`). Phases 1–3 (Lead/Proposal/Contract) are
  **never advanced by any code** — dead weight today.

These two never talk: `sbAdvancePhase` explicitly leaves `job_phases` untouched
(`supabase.js:4967`). Result: **4 of 9 live jobs disagree** (e.g. `999 Test Lane` =
`complete` with 7 phases `not_started`; `8617 Houston` = `in_progress` with all 10
`not_started`).

---

## Locked calls

1. **Trigger over view.** `jobs.status` stays a physical column; a trigger on
   `job_phases` recomputes it (Phase 3). A Postgres generated column can't do it
   (needs cross-row aggregation); a derived view would force every reader + RLS
   policy to retarget. A trigger is the lowest-blast-radius option — readers and RLS
   are untouched.
2. **The manual status picker does NOT die — it demotes.** In Phase 4 the
   `JobDet.jsx` status modal becomes an **owner-only phase-correction** tool (jump a
   job's phase when reality and the derived rollup disagree), not the everyday driver.

---

## Phase plan

| Phase | Deliverable | Prompts | State |
|---|---|---|---|
| **1** | `deriveStatusFromPhases` pure fn (`src/lib/lifecycle.js`) + unit tests; owner-only shadow-comparison screen (`LifecycleAuditScr`, `pg='lifecycle-audit'`, Setup nav). **Zero behavior change — measures only.** | 2 | **SHIPPED 2026-07-10** |
| **2** | Advance phases 1–3 (Lead/Proposal/Contract) on lifecycle events + backfill existing jobs. **Zero change to jobs.status writes** — only makes job_phases tell the truth. | 2 | **SHIPPED 2026-07-10** |
| **3** | Install the trigger; redirect writers (`sbAdvancePhase`, agent `advance_phase`, sign flow) to write phases → trigger recomputes `jobs.status`. Re-home the gate/override engine to phase transitions. Keep `on_hold` a manual overlay. | 2–3 | pending |
| **4** | Reader cleanup; demote the manual picker to owner-only phase-correction; re-verify realtor-notify + commission math fire on derived transitions. | 1–2 | pending |

**Success meter:** the Lifecycle Audit screen reads **100% AGREE**. Phase 1 baseline:
4 DIVERGE / 9. After Phase 2: still 4/9 — but the divergence is now *correctly characterized* (see below), and every job's Lead phase is at least `in_progress` (the "pre-construction never advances" bug is gone).

---

## Phase 2 — blueprint (locked) + what shipped

**Event map** (`LIFECYCLE_EVENT_TARGETS` in `src/lib/lifecycle.js`) — each event sets the full prefix, so a skipped earlier event self-corrects:
- **job create** → Lead `in_progress`
- **proposal SENT** (`sendEstimateToClient`, real send path only — the gated-approval branch returns early) → Lead `complete` + Proposal `in_progress`
- **estimate ACCEPTED** (`sbSetContractFromEstimate` ok) → Proposal `complete` + Contract `in_progress`
- **contract SIGNED** (`sbSaveSignature` ok) → Contract `complete`

**Semantics change for Phase 3 (owner-approved):** post-flip, a signed job with no demo started derives **`contract`**, not `in_progress`. This is deliberate honesty — a signed contract with zero construction is at Contract, not In Progress. Two live jobs (8617 Houston, 456 Test Flow) show exactly this after backfill: signed → `C/C/C` → derived `contract` vs stored `in_progress`.

**Guarantees:** forward-only (never regresses `complete` → earlier), idempotent (re-firing advances nothing — verified), failures logged loud (`console.error`) but never block the originating mutation (the proposal still sends, the signature still saves).

**Implementation:**
- `markLifecyclePhases(sb, tenantId, jobId, event, actorId)` in `src/lib/lifecycle.js` — pure (caller passes its own `sb`); loads L/P/C rows, advances forward-only with guarded WHERE, `.select()`-verifies, stamps `started_at/completed_at` + `_by_id`.
- Frontend call sites: `sbSeedJobPhases` (fires `created`), `JobsScr` create (seeds at create — closes the old lazy-seed-only gap), `EstimateTab.sendEstimateToClient` (`proposal_sent`), `EstimateTab.handleAcceptEstimate` (`estimate_accepted`). Each calls the idempotent `sbSeedJobPhases` first so events never fire before rows exist.
- **Contract-signed is routed server-side.** `job_phases` RLS forbids the client role from writing, and the sign modal runs as the client. So the `contract_signed` advance is done in the `record-signature-evidence` edge fn (already called post-save, service-role) — NOT by widening client RLS. Its inline advance mirrors `markLifecyclePhases('contract_signed')` with a divergence-guard comment (edge fns can't import `src/lib`). The agent `create_job` seed likewise mirrors `created` inline.
- Backfill: `supabase/migrations/20260710150000_model_b_backfill_preconstruction_phases.sql` — one-time, keyed off real signals (signature / snapshot / status), forward-only, idempotent.

**Why divergence held at 4/9 (honest outcome):** the four originally-diverging jobs were never diverging *because* of unadvanced pre-construction phases — they were genuine `jobs.status` problems. After backfill: 2 are the owner-approved signed→`contract` semantics (8617, 456); 2 are real `jobs.status` lies now correctly surfaced (`1206 W Lucy Webb` labeled `in_progress` but is a lead with no signals → `I/N/N` → `lead`; `999 Test Lane` labeled `complete` but mid-construction → `in_progress`). Phase 2 makes phases truthful; it deliberately does **not** touch `jobs.status`, so these resolve in Phase 3 (flip the source) or via owner phase-correction — exactly what the shadow panel is for.

---

## Phase 1 — what shipped

- `src/lib/lifecycle.js` — `deriveStatusFromPhases(phases, {onHold})` → `{status, reason}`.
  Furthest non-`not_started` phase by `phase_order`, mapped to the status vocab;
  all-not_started → `lead`; `on_hold` passed in (not derivable); malformed input →
  `{status:null, reason}` (never throws). Plus `compareStatus` helper.
- `scripts/test-lifecycle.mjs` — 25 assertions (exhaustive map coverage +
  furthest-wins + all-not_started + on_hold + malformed). Run: `node scripts/test-lifecycle.mjs`
  from `avenstone-vite/`. (No vitest/jest in repo — node runner matches the existing
  `scripts/*.mjs` pattern.)
- `src/components/admin/LifecycleAuditScr.jsx` — owner-only, read-only table:
  address · `jobs.status` · derived · AGREE/DIVERGE, divergence count up top.

Nothing writes `jobs.status` from the rollup yet. No trigger. No reader changes.
