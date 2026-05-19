# AGENT_CARDS_ARC.md — structured questions before action

Living design doc for the agent-card arc. Read at the start of any
session that touches MasterAgent.jsx, ai-master-agent, ai-field-agent,
or adds a verb that needs structured input from the user.

## Status as of 2026-05-19
- **Phase 1 — Shipped 2026-05-18.** Card schema, MasterAgent renderer, round-trip wiring. Commits: 6067a0d, 48b97d2, 0fcbab8.
- **Phase 2 — Shipped 2026-05-19.** Receipt categorization card. ELICIT_TOOLS registry + log_receipt elicitor + executor hardened. Commit: 133f937.
- **labor type added 2026-05-19.** `labor` joined the job_transactions type set (direct hourly-labor, distinct from sub_payout). Receipt card option list updated to 9 options. Commits: 5c6a064, c42b6a7, e796755.
- Phase 3–5: Planned. See Roadmap below.
- Sibling arcs: VOICE_AGENT (Phase 3+4 shipped), EXECUTION_ARC (complete).
- Hard dependency for Phase 5 of this arc: verb 5b
  (`complete_schedule_item`) must ship from VOICE_AGENT v1.5 first.

## The goal

The agent today is a one-shot tool-caller: parse intent → call tool →
report. When input is incomplete, ambiguous, or a gate fails, the
options are bad:
- Freeform text asking ("what amount?") — slow over voice, error-prone
- Hardcoded defaults (`material_purchase` for every receipt) — silently
  miscategorizes
- Override-with-vague-reason (phase advance gate fail) — turns the audit
  columns into noise

Fix: a structured elicitation card. Same control-flow shape as the
money confirmation card from VOICE_AGENT Phase 2 — agent emits a card
payload, UI renders it, user submits structured answers, agent
receives them back and proceeds. But the card type carries questions,
not just yes/no.

## Core architectural decisions (locked)

1. **Cards are first-class agent payloads.** Same pattern as
   `pending_action / confirmed`. Agent emits `pending_card` with a
   typed question schema; client renders; client returns
   `card_response`. No freeform interpretation needed.

2. **Question types in v1:**
   - `select` — single choice from a list
   - `multi_select` — multiple choices from a list
   - `radio_per_item` — list of items, each with the same option set
     (designed for gate-failing-items resolution)
   - `text` — freeform; only when no structured answer fits
   - Future: `date`, `number`, `file_attach` (photo binding)

3. **Tool definitions declare when elicitation is needed.** Some tools
   always elicit (e.g. `log_receipt` always asks type). Some elicit
   conditionally (e.g. `advance_phase` only when gates fail). Tool
   registry encodes this — the agent doesn't decide.

4. **Override is an option, not the default.** When the card lists
   action choices for a gate failure, override appears LAST. The
   first options are paths that fix the underlying state ("mark
   complete," "cancel," "leave open").

5. **Reasons are structured.** When override IS chosen, the reason is
   selected from a pre-populated list (e.g. "work was done but never
   marked," "schedule changed," "client decision") plus optional free
   text. Audit columns become queryable instead of noise.

6. **No DB changes for v1.** Pure agent + UI work. The audit columns
   from EXECUTION_ARC Phase 4a (`phase_override_used / reason / by_id`)
   already exist. Cards land structured reasons into them.

7. **Both agents support cards; voice rendering deferred.** Master
   text agent renders cards visually. Field gets the same payload
   shape but voice rendering ("say one of: material, fuel, permit")
   waits for VOICE_AGENT Phase 3+ (native iOS STT). Until then, Field
   uses text fallback — voice users can answer naturally ("category
   is material") and the agent maps to the structured value.

8. **Multi-card flows are valid.** A single user prompt can trigger
   disambiguation card → confirmation card → result. Agent emits
   them sequentially as the conversation progresses.

## V1 scope — cards to ship

Pick these 4 first. Each is a concrete win over current behavior.

1. **Receipt categorization card** — `log_receipt` emits a select card
   when `type` is absent: `material_purchase | fuel | permit | sub_payout |
   vendor_payment | commission | equipment_rental | labor | other_expense` (9
   options). Arc originally spec'd 7; `equipment_rental` and `labor` added as
   valid DB values per `job_transactions_type_check` constraint. Removes
   today's hardcoded `material_purchase` workaround. High-confidence vendor
   inference (Home Depot, gas stations, permit offices) still bypasses the
   card — card fires for unrecognised vendors.

2. **Job disambiguation card** — when `get_jobs` returns >1 match
   for an ambiguous reference ("the Smith job"), agent emits a
   select card listing all matches. Resolves the open question
   from VOICE_AGENT decision #6.

3. **Missing field card** — when a tool's required input is missing
   from the user's prompt (amount, job, category), agent emits a
   form-shape card asking for the gaps. Replaces the current
   pattern of asking via text turns.

4. **Phase gate resolution card** — `advance_phase` emits when gates
   fail. First slice: structured override-reason select + optional
   text. Mark-complete actions redirect to JobDet → Schedule for v1
   since verb 5b isn't shipped yet. When verb 5b lands, the card
   extends to support inline mark-complete from the card itself.

Out of scope for v1: photo-attach card, date pickers, multi-page card
flows.

## Roadmap

✓ Phase 1: Card schema + MasterAgent render scaffolding. **Shipped 2026-05-18.**
`pending_card` / `card_response` contract defined in `avenstone-vite/src/lib/agentCards.js`.
React renderers for `select` and `radio_per_item` in `MasterAgent.jsx`.
Edge fn (`ai-master-agent`) wired to emit `pending_card` and receive `card_response`.
Round-trip tested with hardcoded mock (build ✓, mock removed).

✓ Phase 2: Receipt categorization card. **Shipped 2026-05-19.**
ELICIT_TOOLS registry (log_receipt entry), elicitor check in runAgentLoop,
executor hardened (no silent default), tool description + system prompt updated.
Commit: 133f937.

Phase 3: Job disambiguation card. Builds on Phase 2 machinery, adds
the `get_jobs` modification to surface ambiguity.

Phase 4: Missing-field card. Generalized pattern across all tools.
Refactors how tool input validation works.

Phase 5: Phase gate resolution card. Override-only first slice (no
verb-5b dependency). Inline mark-complete arrives when verb 5b ships.

Phase 6 (deferred): Field voice rendering for cards. Likely "say one
of: A, B, C" with grammar matching. Wait until VOICE_AGENT Phase 3
ships first.

## Guard rails (non-negotiable)

- Override is never the first option in a gate-resolution card
- Reasons for override are structured (select + optional text), not
  freeform
- Cards never block the conversation — user can dismiss/cancel and
  the agent reverts to text turns
- Audit trail: every override action stamps the structured reason
  into the relevant column (`phase_override_reason` for phase, etc.)
- Field voice gets text fallback until Phase 6

## Dependencies

- VOICE_AGENT Phase 2's `pending_action / confirmed` card surface in
  MasterAgent.jsx — same control-flow plumbing, extend it
- EXECUTION_ARC Phase 4a audit columns — ready to receive structured
  override data from cards
- Tool registry in both edge fns — extend with `elicitation` declarations
- Verb 5b from VOICE_AGENT v1.5 — required for Phase 5's full slice

## Open questions

- Card UX on mobile vs desktop (different render?). Defer to Phase 1.
- Should cards persist if the user navigates away (resume on return)?
  Probably no — fail-loud beats lost state.
- Voice rendering grammar for select cards — Phase 6 problem.
- Card response timeouts — does the conversation stall if the user
  doesn't answer? Probably no timeout for v1; sending a new prompt
  abandons the card.
- "None of these" escape hatch on disambiguation — resolved in Phase 3: explicit final option (value `__none__`), agent reverts to text-turn clarification on selection.

## Cost ceiling

Per CLAUDE.md API cost rules, no change from VOICE_AGENT — Sonnet,
2048 max_tokens, 20-message conversation window, 3 tool-loop
iterations max. Cards add a single round-trip per elicitation
(emit → answer → tool call) which fits inside the 3-iteration budget
for normal flows.

## Rollback plan

Cards are additive on top of the existing agent surface. If cards break:
1. Hide the card UI (feature flag in profile or tenant settings)
2. Agent reverts to freeform text asking
3. Tool layer unaffected — same canonical helpers fire either way

No DB migrations, no deprecated tables.
