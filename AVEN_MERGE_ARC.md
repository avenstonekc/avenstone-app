# AVEN_MERGE_ARC — B6.1: merge ai-master-agent + ai-field-agent

**Status:** v1 SHIPPED 2026-07-18 (all 4 slices live + verified). Rollback = revert cutover `aef8709`. Behavior-preserving v1.
**Owner model:** Opus (design) → Sonnet (execute per slice).
**Rollback lever:** old fns stay deployed + untouched; merged fn ships to a NEW slug; cutover = repoint 2 URL exports; rollback = one-line revert.

---

## Phase A — re-audit (2026-07-18, vs the archived 2026-06-16 audit)

### The 6 duplicated blocks — STILL 6, ZERO further drift since June
The divergence guards held (each block carries a "mirror must stay identical" comment). All six are byte-identical logic (only quote-style differs), so extraction is provably behavior-preserving:

| # | Block | master/index.ts | field/index.ts | State |
|---|-------|-----------------|----------------|-------|
| 1 | `PHASE_ORDER` (+ `PHASE_LABELS` master-only) | 32 | 15 | identical |
| 2 | `MANUAL_ONLY_PHASES` / `MANUAL_ONLY` | 37 | 20 | identical |
| 3 | `getNextPhase` | 39 | 22 | identical |
| 4 | `runGatesForTransition` (incl. C3 source-aware selections gate) | 45–119 | 28–102 | identical |
| 5 | `notifyTenantStaff` / `notify` | 122–138 | 105–122 | identical logic (param names differ) |
| 6 | `fmtMoney` | 2384 | 259 | identical |

`canonicalizeTrade` (master:23) is master-only — NOT a 7th duplicate. Both fns already import `../_shared/autoInvoice.ts` + `../_shared/tradeActuals.ts`, so the shared-module pattern is established and proven-safe.

### Tool inventory (verified live from the TOOLS arrays)
- **master = 28 tools** (6 read + 22 write). Read: get_jobs, get_team, get_job_financials, get_schedule, get_open_todos, get_alerts. Write (22): create_job, update_job, add_contact, send_client_portal, invite_person, add_note, advance_phase, update_phase, submit_change_order, log_payment, log_receipt, notify_team, add_todo, notify_team_member, create_schedule_item, add_knowledge, log_sub_invoice, log_sub_payment, approve_sub_invoice, upload_company_file, record_deposit, compose_draw.
- **master CONFIRM_TOOLS = 14:** log_payment, log_receipt, submit_change_order, add_todo, create_job, notify_team_member, create_schedule_item, log_sub_invoice, log_sub_payment, approve_sub_invoice, upload_company_file, record_deposit, compose_draw, send_client_portal.
- **field = 7 tools:** log_payment, log_receipt, add_note, advance_phase, submit_change_order, create_lead, update_material_status.
- **field CONFIRM_TOOLS = 3:** log_payment, log_receipt, submit_change_order.

**Overlap map:**
- **Shared verb, dual executor (5):** log_payment, log_receipt, add_note, advance_phase, submit_change_order — implemented in BOTH `executeTool` (master) and `executeAction` (field). Convergence candidate, but DEFERRED (see v1 scope).
- **master-only (23):** the 6 reads + create_job, update_job, add_contact, send_client_portal, invite_person, update_phase, notify_team, add_todo, notify_team_member, create_schedule_item, add_knowledge, log_sub_invoice, log_sub_payment, approve_sub_invoice, upload_company_file, record_deposit, compose_draw.
- **field-only (2):** create_lead, update_material_status.

### Locked behaviors that MUST survive (and where they live)
- **CONFIRM_TOOLS gating = the only commit point.** Both fns: `confirmed && pending_action` → executor (skips Claude). Preserved per surface.
- **Money read-back (amountToWords).** master's `describeConfirmAction` (2431) uses `amountToWords`. **FIELD's `describeAction` (264) uses `fmtMoney` ONLY — no spoken read-back.** This is a standing divergence vs the locked "money read-back is non-negotiable" rule (field predates it). v1 preserves field as-is; see Risk R5 — recommend restoring it as the FIRST post-merge capability slice.
- **Conversation-history window + model.** Both: `conversation_history.slice(-20)` (Sonnet 20-msg window), `claude-sonnet-4-6`, `max_tokens: 2048`. Compliant with API cost rules. Preserved.
- **Prompt caching breakpoint.** master sets `cache_control: {type:'ephemeral'}` on the tools/system prefix (813). **field has NO caching.** Preserved per surface in v1 (later: cache field too).
- **MasterAgent top-level mount** (persistent chat) — unchanged; only the URL it posts to changes at cutover.

### Callers (cutover surface)
- `AI_MASTER_URL` (supabase.js:56) → `components/shared/MasterAgent.jsx`.
- `AI_FIELD_AGENT_URL` (supabase.js:54) → `components/ai/AiFieldAgent.jsx`.
- Non-caller references to the gate/card contracts (must stay compatible): `lib/phaseGates.js`, `lib/agentCards.js`, `lib/tradeUtils.js`, `lib/selectionsGate.test.mjs`.
- Cutover = repoint those 2 URL exports. Nothing else calls either fn directly.

---

## Phase B — merged design (behavior-preserving v1)

### One fn, surface-selected
New slug **`ai-agent`**. One `Deno.serve` reads `surface: 'master' | 'field'` from the request body and dispatches to `handleMaster(...)` or `handleField(...)` — the two EXISTING handlers, moved verbatim into the merged fn, refactored ONLY to import the shared modules. No handler-flow rewrite, no tool-schema change, no prompt-behavior change beyond dedup. The two surfaces keep their own personas, tool rosters, confirm-describe, caching, and (v1) their own executors.

**Surface selection:** explicit `surface` field in the request body (added to both callers at cutover). Default-deny: if `surface` is absent or unknown → reject with an error (never silently route a voice request through the chat roster or vice-versa).

### Shared modules (kill the 6 drift blocks — single source of truth)
- `_shared/agentPhaseGates.ts` — `PHASE_ORDER`, `PHASE_LABELS`, `MANUAL_ONLY_PHASES`, `getNextPhase`, `runGatesForTransition` (blocks 1–4). The highest-value dedup; the one CLAUDE.md flags.
- `_shared/agentNotify.ts` — `notifyTenantStaff` (block 5). field's `notify` becomes a thin alias / direct call.
- `_shared/agentFormat.ts` — `fmtMoney` (block 6), and `amountToWords` co-located here so it's available to BOTH surfaces (used by v1's master path; available to field in the follow-up).

Both the merged fn AND the two legacy fns import these in Slice 1 (so drift is dead even before cutover).

### Migration path (slices)
1. **Slice 1 — shared modules.** Extract the 6 blocks to `_shared/`. Repoint BOTH legacy fns to import them (byte-identical → zero behavior change). This alone kills the drift risk. Deploys the two legacy fns on shared code. `audit:schema` unaffected.
2. **Slice 2 — merged fn on `ai-agent`.** Co-locate both handlers (surface-dispatched), importing shared. Deploy. NOT wired to any caller yet (legacy URLs unchanged). Flow-test + live sandbox smoke: every read verb + ≥1 CONFIRM write per surface; assert the confirm card / pending_action is **verbatim-identical** to the legacy fn's for the same input.
3. **Slice 3 — CUTOVER (last + alone).** Repoint `AI_MASTER_URL` + `AI_FIELD_AGENT_URL` to `ai-agent` (sending `surface`). One commit, bisectable, instant one-line revert. Run `audit:schema` tool-payload check after.
4. Legacy fns get a `// DEPRECATED — superseded by ai-agent (AVEN_MERGE_ARC). Kept as rollback until field-stable.` comment. NOT deleted; removal is a later cleanup once field-stable.

### Rollback lever
`ai-master-agent` + `ai-field-agent` stay deployed and byte-untouched through Slices 2–3 (Slice 1 only swaps their internal constants for identical shared imports — still trivially revertible). If `ai-agent` misbehaves post-cutover, revert the single supabase.js cutover commit → callers hit the legacy slugs again. No data migration, no schema change anywhere in this arc.

### Explicitly OUT of v1 (later capabilities, on the merged base)
- Converging the 5 dual-executor tools into one executor each (needs per-tool equivalence proof).
- Adding amountToWords money read-back to the field surface (R5 — recommended FIRST follow-up; it restores a locked invariant).
- Caching the field surface.
- Any unified single-flow handler / tool-roster-by-surface-filter.
- Fixing field's log_receipt `material_purchase` fallback default (a data-quality nit, not a merge concern).

---

## Risk list
- **R1 — shared-extraction behavior drift.** The 6 blocks are byte-identical, but param-name differences (notify) or quote style could hide a typo. *Mitigation:* mechanical extraction, diff the pre/post, flow-test a gated advance_phase on both surfaces.
- **R2 — surface mis-routing.** A field request routed through the master roster (or vice-versa) = wrong tools/persona. *Mitigation:* explicit `surface`, default-deny, flow-test both.
- **R3 — confirm-card divergence at cutover.** The pending_action/confirm card must be identical to legacy so the client renders + money read-back unchanged. *Mitigation:* Slice 2 asserts verbatim-identical card JSON before cutover.
- **R4 — deploy/bundle.** New slug + new `_shared` modules must bundle via the CLI GitHub Action. *Mitigation:* both fns already import `_shared`; same mechanism.
- **R5 — field lacks amountToWords (locked-invariant gap).** v1 preserves it, so the voice surface still ships weaker money confirms. *Mitigation:* flag loudly; recommend it as the first post-merge slice (trivial once `describeConfirmAction` is shared).
- **R6 — field uncached.** v1 preserves; no regression, just no new caching. Later slice.
- **R7 — dual executors stay dual in v1.** No convergence = no convergence risk, but the 5 shared tools still have two code paths (now sharing gates/notify/money). Accepted for v1; convergence is a tracked follow-up.
