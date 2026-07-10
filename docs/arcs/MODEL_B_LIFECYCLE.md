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
| **2** | Advance phases 1–3 (Lead/Proposal/Contract) on lifecycle events (proposal send, estimate accept, contract sign). The missing link — no rollup can represent pre-construction until these rows move. **Riskiest phase:** unifies the two decoupled advance engines. | 2 | pending |
| **3** | Install the trigger; redirect writers (`sbAdvancePhase`, agent `advance_phase`, sign flow) to write phases → trigger recomputes `jobs.status`. Re-home the gate/override engine to phase transitions. Keep `on_hold` a manual overlay. | 2–3 | pending |
| **4** | Reader cleanup; demote the manual picker to owner-only phase-correction; re-verify realtor-notify + commission math fire on derived transitions. | 1–2 | pending |

**Success meter:** the Lifecycle Audit screen reads **100% AGREE**. Phase 1 baseline:
4 DIVERGE / 9.

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
