# Estimator Knowledge Arc — Design Blueprint

_Blueprint only — not started. Gated behind nothing; ready to build when prioritized. Decisions locked 2026-06-15 after Crane St forensic audit._

---

## Problem (discovered 2026-06-15)

The ai-estimator does **not** read `ai_knowledge`. It has zero Supabase connection. It prices entirely off a hardcoded rate table baked into the `SYSTEM_PROMPT` ("KC METRO LABOR/MATERIAL RATES 2026"), which contains different, conflicting numbers from the rates in `ai_knowledge`. When a rate is missing from the hardcoded table, the model invents one from training data and presents it with full confidence. The "AI never invents rates without ai_knowledge citation" principle exists in CLAUDE.md but was never implemented in code or prompt.

**Audit evidence (Crane St, 2026-06-15):** Drywall hang $0.75/SF and finish $1.25/SF matched the hardcoded SYSTEM_PROMPT ranges and contradicted ai_knowledge's lower ranges ($0.38–0.55 hang, $0.55–0.80 finish). Texture $0.90/SF, prime labor $0.60/SF, carpet labor $1.50/SF existed in neither source — pure invention. The estimate passed human review because invented numbers looked identical to real rates.

**ai_knowledge current state:** 21 rows, all active. ~15 pricing entries (`labor_rates`, `pricing_demo`, `pricing_drywall`, `pricing_electrical`, `pricing_flooring`, `pricing_framing`, `pricing_hvac`, `pricing_insulation`, `pricing_painting`, `pricing_tile`, `pricing_plumbing`, `pricing_roofing`, `pricing_cabinets_millwork`, `pricing_concrete`, `pricing_windows_doors`) + ~6 narrative/rule entries (`business_structure`, `change_order_policy`, `client_communication`, `company_profile`, `draw_schedule`, `estimating_guidelines`).

---

## Core Design: Per-Tenant Rate-Resolution Ladder

The central insight: two tenant types need opposite behavior, solved by one config knob.

- **Avenstone KC** runs cost-plus — the estimate is a rough number, actual costs flow through at the end, so regional averages are acceptable. Speed matters.
- **White-label tenants** (paint companies, tile, roofers) sell fixed-price bids — the estimate IS the contract, no cost-plus safety net. They want their pricing hard-coded; a guessed average loses money or loses the job.

Resolution ladder, evaluated per line item:

1. Tenant's own rate exists in `ai_knowledge` → use it, label source as **[tenant rate]**.
2. No tenant rate → behavior determined by a per-tenant config setting (**fallback mode**):
   - `regional_average` (Avenstone/cost-plus default): fill the gap with a regional/market default, labeled as **[regional avg]** — not the tenant's rate. Fast, rough, cost-plus covers the variance.
   - `ask` (fixed-price/white-label default): do NOT invent. Collect the unknown as a question for the user to answer.

---

## Non-Negotiable Rule: Every Number Is Labeled by Source

The bug was never that averages got used — it's that averages looked identical to real tenant rates, so they couldn't be told apart. Every committed and displayed line must carry its rate source: `[tenant rate]` | `[regional avg]` | `[you entered]`.

This makes the average-fallback safe because the user can see at a glance which lines are theirs vs. guesses worth pinning down before signing anything.

---

## Locked Interaction Decisions (2026-06-15)

**Ask style: BATCH.** When the estimator hits rates it doesn't have, it collects ALL unknowns and presents them as one list to knock out fast. Not one-at-a-time. Fits a terse, fast-moving job-site workflow.

**Learn loop: ALWAYS OFFER TO SAVE, WITH CONFIRM.** When the user supplies a missing rate, offer to write it back to `ai_knowledge` so it's never asked again. Never auto-save silently. Same never-write-silently / Confirm-card pattern as ai-master-agent.

**Net effect:** First estimate for a new tenant is full of questions; rates accumulate as they work; later estimates are mostly "I've got this." This doubles as white-label onboarding — a new tenant builds their rate book by doing estimates, not filling a spreadsheet.

---

## Open Decision (Deferred — Needs Side-By-Side First)

The authoritative source for **conflicts** between the hardcoded SYSTEM_PROMPT rates and `ai_knowledge` rates is not yet decided.

Prerequisite before declaring ai_knowledge authoritative and deleting the hardcoded table: pull a complete side-by-side comparison of every rate in both sources, annotated as CONFLICT / ONLY-IN-PROMPT / ONLY-IN-KNOWLEDGE. The hardcoded table likely contains gap-filling rates that would need to migrate into `ai_knowledge` (or become regional-average defaults) before deletion, or they'd turn into "ask" prompts on every estimate.

---

## Cleanup Items Folded Into This Arc

- **Delete** the hardcoded SYSTEM_PROMPT rate table once `ai_knowledge` is authoritative and gaps are reconciled.
- **Reconcile** conflicting ranges (e.g., `ai_knowledge` drywall hang $0.38–0.55 vs SYSTEM_PROMPT $0.65–0.85).
- **Add Supabase connection** to ai-estimator (currently has none) to read tenant `ai_knowledge` at request time.

---

## Known-Good From the Same Session (Do Not Re-Litigate)

**Sales tax** — the model applied it correctly when explicitly asked: materials-only base, correct 10.1% MO+Cass+Raymore combined rate, correct exclusions (labor, permits, contingency not taxed). Tax should become a **deterministic calculated field** (tenant-default rate applied to material-category lines at render), not a freeform chat request. Tenant-level rate setting, not per-job.

**Chat must not be trusted to EDIT an existing committed estimate.** Confirmed on Crane St: $585 of silent drift on untouched lines vs. $288 of requested change on one refinement pass. Chat is a first-draft generator only. Edits happen on committed rows (inline editing) or via append-only adds. This is a related concern (estimate edit model) — cross-reference but not part of this rate arc.

---

## Rough Phasing

_Effort estimates in Sonnet prompts; refine at build time._

1. **Rate reconciliation** — Side-by-side comparison of SYSTEM_PROMPT vs `ai_knowledge` rates. Annotate conflicts. Decide authoritative source. Mostly a data task, outputs a decision + a list of rows to add/update in `ai_knowledge`. (Prerequisite for everything else.)

2. **Supabase connection + prompt injection** — Add a Supabase client call to ai-estimator. At request time, load the calling tenant's active `ai_knowledge` rows and inject them into the prompt (replacing or augmenting the hardcoded table).

3. **Cite-or-flag** — Every output line cites a tenant rate or is marked unknown. No silent invention. Source labeling in the narrative and in the committed `estimate_line_items` rows (notes field or a new source_label column).

4. **Per-tenant fallback mode config** — Add `estimator_fallback_mode` to tenant config (`regional_average` | `ask`). Regional-average defaults filled and labeled; `ask` mode batches unknowns into one list at the end of the estimate.

5. **Batch unknowns** — When fallback mode is `ask`, collect all missing-rate lines and surface them as a single numbered list before finalizing the estimate. User answers in one pass.

6. **Learn loop** — When user supplies a missing rate in chat, offer to write it back to `ai_knowledge` with a confirm step. Same confirm-before-write contract as ai-master-agent.
