# Estimator Knowledge Arc — Design Blueprint

_Original decisions locked 2026-06-15 after Crane St forensic audit. Keystone decisions added 2026-06-16 (1–5) and 2026-06-16 late (6 — Range Collapse / Job-Size Tier) — these supersede several 2026-06-15 entries. Superseded items are struck through and flagged inline._

---

## Problem (discovered 2026-06-15)

The ai-estimator does **not** read `ai_knowledge`. It has zero Supabase connection. It prices entirely off a hardcoded rate table baked into the `SYSTEM_PROMPT` ("KC METRO LABOR/MATERIAL RATES 2026"), which contains different, conflicting numbers from the rates in `ai_knowledge`. When a rate is missing from the hardcoded table, the model invents one from training data and presents it with full confidence. The "AI never invents rates without ai_knowledge citation" principle exists in CLAUDE.md but was never implemented in code or prompt.

**Audit evidence (Crane St, 2026-06-15):** Drywall hang $0.75/SF and finish $1.25/SF matched the hardcoded SYSTEM_PROMPT ranges and contradicted ai_knowledge's lower ranges ($0.38–0.55 hang, $0.55–0.80 finish). Texture $0.90/SF, prime labor $0.60/SF, carpet labor $1.50/SF existed in neither source — pure invention. The estimate passed human review because invented numbers looked identical to real rates.

**ai_knowledge current state:** 21 rows, all active. ~15 pricing entries (`labor_rates`, `pricing_demo`, `pricing_drywall`, `pricing_electrical`, `pricing_flooring`, `pricing_framing`, `pricing_hvac`, `pricing_insulation`, `pricing_painting`, `pricing_tile`, `pricing_plumbing`, `pricing_roofing`, `pricing_cabinets_millwork`, `pricing_concrete`, `pricing_windows_doors`) + ~6 narrative/rule entries (`business_structure`, `change_order_policy`, `client_communication`, `company_profile`, `draw_schedule`, `estimating_guidelines`).

---

## Keystone Decisions (2026-06-16, LOCKED)

These supersede any conflicting 2026-06-15 entries. Each is flagged inline where it touches an older section.

### 1. Rate Book is two parts, not a flat ai_knowledge rename

- **Labor Rate Book:** Kalin's vetted numbers, per trade. Authoritative. Estimator pulls these or ASKS — never invents labor. This is the private-knowledge half (Kalin's edge: his crew, his KC market rates).
- **Material Tier Chart:** low/mid/high price bands per material category (toilet, vanity, faucet, tile, fixtures, etc.). AI-drafted from public pricing, Kalin adjusts to his market. This is the public-knowledge half — material pricing is lookup-able, AI is competent at it, gated by a finish tier Kalin selects per job.

### 2. The labor/material division (core principle)

Labor = private, stored, vetted, ask-if-missing.
Materials = public, AI-priced to selected finish tier.

The **original bug was the AI inventing LABOR rates** with no basis — not estimating materials. This design kills the real bug: labor locked to Rate Book, materials handled by AI competence + Kalin's tier selection. Materials priced to a chosen tier is NOT silent invention (public reference + selected tier). The prior framing ("inject ai_knowledge rates or ASK for everything missing") conflated two fundamentally different knowledge sources.

**Supersedes:** the per-line-rate-resolution popup model from the 2026-06-16 Finalized Design section — that model assumed all rates were the same kind of gap. Labor gaps = ASK popup. Material gaps = AI-priced to selected tier, not a gap.

### 3. Estimate structure: split labor/materials, allowances, always-include baseline

- Labor lines and material lines are **separate** in the estimate output.
- **Allowances are broken out** — Kalin estimates with allowances to cover material overages dollar-for-dollar (e.g., "Tile Allowance — 120 SF @ $4/SF" covers the overage delta, not a bundled installed price).
- **Required baseline scope** (waterproofing membrane / Schluter / RedGard on a shower, backer board, cement board, etc.) is ALWAYS auto-included without asking. Never treat code-required or universally-required scope as optional.

### 4. Markup: single job-level, pre-filled at Kalin's standard (~30%)

Single job-level markup, defaults to ~30%. Only changed per-job when needed. Shown clearly on the estimate.

**Supersedes:** separate `labor_markup_pct` / `material_markup_pct` split. That is a cost-plus financial-tab feature, NOT the estimator default. The estimator uses one markup.

### 5. Interaction design: guided interview with pre-filled defaults (LOCKED)

Aven leads a conversational interview to build the estimate. Kalin stays in control; everything surfaced, nothing auto-built silently. BUT defaults are **pre-filled** and Kalin confirms-or-changes rather than entering from scratch.

- NOT "What's your markup?" (blank box) — YES "Running your standard 30% — good or different?" (confirm/override)
- Constants come pre-answered (tap to confirm); real engagement on what varies per job (finish level, scope questions, trade-specific considerations)
- The interview is the interface; pre-filled defaults make it fast instead of a tedious re-ask

This is the spine of the conversational-Aven estimator rebuild. Guided interview, not blank form, not silent auto-build.

**Supersedes:** the earlier "interaction model: estimator behaves like the master agent" framing (correct directionally but underdetermined). The master-agent parallel holds on confirm-before-write and never-silent-write, but the primary interface is now a guided interview, not a freeform chat with popup gaps.

### 6. Range → Point Collapse (locked 2026-06-16)

Rate Book stores RANGES (`rate_low`–`rate_high`). Ranges never appear in estimate output — they're backstage reference. The estimator collapses each range to a single point via a **JOB-SIZE TIER**.

**JOB-SIZE TIER** — keyed off total project SF, one tier for the whole estimate:

| Total Project SF | Tier Applied |
|---|---|
| ≤ 750 SF | HIGH end of range |
| 751 – 1,999 SF | MID (average of low and high) |
| 2,000+ SF | LOW end of range |

Rationale: small jobs price premium per-unit (mobilization/setup/overhead spread over less work); large jobs get volume pricing.

**Collapse by unit type:**

- **SF and LF** (work-rate units) — tier applies. Small job → high end on both.
- **EA and LS** (fixed items: allowances, permits, fixtures, cleanup) — tier does NOT apply. Always use MID. A permit or toilet costs the same regardless of job size.

**Application:** the estimator sets the tier automatically from project SF and collapses every line's range to its point by unit type. Kalin overrides per-line during the interview when a job breaks the pattern (guided interview confirm/override — same pattern as Keystone Decision 5).

**This resolves the "ranges popping up in estimates" problem.** Ranges stay in the Rate Book as reference; the estimate shows a single tier-collapsed number per line.

**Build requirements (Phase 3):**
- Estimator must receive/compute total project SF before collapsing rates.
- Unit type is already on `rate_book_labor.unit` — no new column needed.
- Collapse logic: `MID = (rate_low + rate_high) / 2` rounded to the same precision as the stored rates.

---

## Finalized Design (2026-06-16 session)

_Items superseded by the Keystone Decisions above are struck through and flagged. Items not flagged remain valid._

### Interaction model _(superseded — see Keystone Decision 5)_

~~The estimator should work like ai-master-agent — conversational, interactive, asks-then-confirms, NEVER silently guesses. Same Confirm-card / popup pattern applied to estimating.~~

**Current:** Guided conversational interview with pre-filled defaults. See Keystone Decision 5. The confirm-before-write and never-silent-write principles still apply.

### Per-line rate resolution _(partially superseded — see Keystone Decisions 1 & 2)_

~~For each line item in a draft estimate: rate EXISTS in Rate Book → use it. NO rate → interactive popup...~~

**Current:** Labor lines and material lines resolve differently:
- **Labor:** Rate EXISTS in Labor Rate Book → use it, cite it, label `[tenant rate]`. NO labor rate → ASK popup (description, flagged average as starting point, editable field, "Save to Rate Book" checkbox).
- **Materials:** AI-priced to the finish tier selected at interview start (low/mid/high from the Material Tier Chart). This is NOT a gap — it's designed behavior. Label `[tier: mid]` / `[tier: high]` / etc.

The "ask for everything missing" popup model applies to **labor only**.

### Behavior decision _(updated)_

Labor: ask-if-missing, anti-surprise (flag the gap, offer the average, let Kalin set it).
Materials: AI-prices to selected tier from Material Tier Chart — the tier IS the answer, not a gap to resolve.

### Rate Book structure _(supersedes "Rename: AI Knowledge → Rate Book")_

Rate Book is two distinct components:

1. **Labor Rate Book** — replaces the labor half of `ai_knowledge` pricing entries. Per-trade labor rates, vetted by Kalin, stored as the private-knowledge authoritative source. `{ type: 'flat', rate: X, unit: '...' }` shape (structured for future tiering, still applies).
2. **Material Tier Chart** — NEW. Low/mid/high price bands per material category. AI-drafted seed, Kalin adjusts. Lives separately from the Labor Rate Book (different schema shape — bands, not single rates).

The existing ai_knowledge narrative/rule entries (`business_structure`, `change_order_policy`, `client_communication`, etc.) remain as business-rules config, separate from both pricing components. The "AI Knowledge" UI becomes "Rate Book" for the pricing components; business rules live elsewhere.

### Manage-pricing UX _(still valid)_

Do NOT put "change pricing" on every line item — that's clutter. The gap-flagging popup IS the primary editing surface for labor gaps. The Rate Book view is the secondary place to review/edit labor defaults. Reps can still freely edit line item numbers directly (existing escape hatch, unchanged).

### Rate data model _(still valid — applies to Labor Rate Book specifically)_

Labor Rate Book rate field must NOT be a bare number. Structured for future tiering:
- Now (build): `{ type: 'flat', rate: X, unit: '...' }`
- Future (Phase 2, white-label): `{ type: 'tiered', apply: 'flat_per_tier' | 'marginal', bands: [{ up_to: 1000, rate: A }, { up_to: 2000, rate: B }, ...] }`

Build ONLY flat now. No tiered UI. Just shape the column/field so tiered drops in later.

### Tiered pricing — PHASE 2, white-label only _(still valid, unchanged)_

Volume-break pricing (painter charges $X/SF up to 1000 SF, $Y/SF 1001–2000, etc.; also material-type variants like siding type). This is mainly a white-label tenant need (SF-based bidders: painters, drywallers, flooring, siding). Avenstone/Kalin (cost-plus) does NOT need it — reps just edit the line. Build later when a real tiered tenant exists. Do not build now.

### Hardcoded rates: staged deletion, not cold delete _(supersedes "delete, don't reconcile")_

~~The ai-estimator SYSTEM_PROMPT hardcoded rate table should be DELETED outright, not migrated or crowned authoritative.~~

**Current:** Do NOT delete cold. Gap inventory shows 7–8 line types on a typical bathroom become ASK prompts if the hardcoded table is deleted immediately. **Staged approach:**

1. Keep hardcoded material numbers **temporarily** as labeled regional-avg fallback, seeding the Material Tier Chart draft. They serve as the mid-tier starting point until Kalin calibrates the tier chart.
2. Once the Labor Rate Book is populated and the Material Tier Chart is live, the hardcoded table is dead weight — delete then.
3. The hardcoded LABOR numbers are the real problem (they contradict Kalin's rates). Those retire as soon as the Labor Rate Book is populated (Phase 2 → Phase 3 transition).

Rationale for staged: "delete cold" was correct for labor (labor gaps become popups). But for materials, the tier chart fills the gap — and the hardcoded numbers are a reasonable mid-tier seed while Kalin hasn't yet set his material tiers.

### source_label column _(confirmed — new column required)_

`estimate_line_items.source_label TEXT nullable` — confirmed as a **new column** (not reusing `notes`). The `notes` column is overloaded with `takeoff:` and `ai:` prefixed scoped-delete conventions; reusing it for source labels would break those selectors. `source_label` is a clean separate column.

Values: `tenant_rate` | `regional_avg` | `user_entered` | `tier_low` | `tier_mid` | `tier_high`

### Note: contract signing used to work _(still valid)_

Kalin confirmed contract signing previously functioned — supports the CONTRACT_SIGNING_ARC Gap 5 hypothesis that the flow REGRESSED when magic links were retired (2026-06-01), rather than never having existed. Reframes that work as "restore access path," likely smaller than a from-scratch build.

---

## Core Design: Per-Tenant Rate-Resolution Ladder _(updated — labor only)_

The central insight: two tenant types need opposite behavior, solved by one config knob. **Applies to the labor resolution path specifically.** Material resolution uses the tier chart, not this ladder.

- **Avenstone KC** runs cost-plus — regional averages are acceptable for labor gaps. Speed matters.
- **White-label tenants** (paint companies, tile, roofers) sell fixed-price bids — the estimate IS the contract. They want their labor hard-coded; a guessed average loses money or loses the job.

Labor rate resolution ladder, evaluated per labor line item:

1. Tenant's own labor rate exists in Labor Rate Book → use it, label source as **[tenant rate]**.
2. No tenant labor rate → behavior determined by per-tenant config (**fallback mode**):
   - `regional_average` (Avenstone/cost-plus default): fill the gap with a regional/market default, labeled as **[regional avg]** — not the tenant's rate. Fast, rough, cost-plus covers the variance.
   - `ask` (fixed-price/white-label default): do NOT invent. Surface the gap as an ASK popup.

Material lines bypass this ladder entirely — priced to the selected finish tier from the Material Tier Chart.

---

## Non-Negotiable Rule: Every Number Is Labeled by Source

The bug was never that averages got used — it's that averages looked identical to real tenant rates, so they couldn't be told apart. Every committed and displayed line must carry its rate source.

**Labor lines:** `[tenant rate]` | `[regional avg]` | `[you entered]`
**Material lines:** `[tier: low]` | `[tier: mid]` | `[tier: high]` | `[you entered]`

This makes the tier/average-fallback safe because the user can see at a glance which lines are their vetted numbers vs. AI-generated estimates worth calibrating.

---

## Locked Interaction Decisions (2026-06-15, updated 2026-06-16)

**Ask style: BATCH (for labor gaps).** When the estimator hits labor rates it doesn't have, it collects ALL unknowns and presents them as one list to knock out fast. Not one-at-a-time. Fits a terse, fast-moving job-site workflow. The batch-ask is one step in the interview flow — after finish tier and scope questions, before generating the draft.

**Interview with pre-filled defaults (2026-06-16 addition).** See Keystone Decision 5. The guided interview is the primary interface. Batch labor-asks surface within it as a natural step.

**Learn loop: ALWAYS OFFER TO SAVE, WITH CONFIRM.** When the user supplies a missing labor rate, offer to write it back to the Labor Rate Book so it's never asked again. Never auto-save silently. Same never-write-silently / Confirm-card pattern as ai-master-agent.

**Net effect:** First estimate for a new tenant is fuller of labor questions; rates accumulate as they work; later estimates are mostly "I've got this." This doubles as white-label onboarding — a new tenant builds their labor rate book by doing estimates, not filling a spreadsheet.

---

## Open Decision (RESOLVED 2026-06-16)

~~The authoritative source for conflicts between the hardcoded SYSTEM_PROMPT rates and `ai_knowledge` rates is not yet decided.~~

**Resolved.** The hardcoded PROMPT rates and the `ai_knowledge` pricing entries are mostly combined "installed" rates — neither is the right shape for the new architecture, which splits labor and materials. The Phase 1 reconciliation task is now:

- Annotate each entry as CONFLICT / ONLY-IN-PROMPT / ONLY-IN-KNOWLEDGE / **LABOR-ONLY / MATERIAL-ONLY / COMBINED-INSTALLED** (third dimension added 2026-06-16).
- Numbers with clean labor-only identification → migrate to Labor Rate Book.
- Material components → seed Material Tier Chart mid-tier.
- Combined-installed rates without clean separation → inform both but aren't directly migrated; flag for Kalin to decompose.

The "side-by-side annotated" exercise is still the right Phase 1 artifact, now with the labor/material annotation layer added.

---

## Cleanup Items Folded Into This Arc _(updated)_

- **Stage the hardcoded table deletion** — not cold delete. Hardcoded material numbers seed the Material Tier Chart draft (mid-tier starting point). Hardcoded labor numbers retire as soon as the Labor Rate Book is populated. Full deletion is cleanup once both components are live.
- **Reconcile labor ranges:** extract labor-only numbers from combined `ai_knowledge` entries (e.g., `ai_knowledge` drywall hang $0.38–0.55 is the labor number; the $0.65–0.85 SYSTEM_PROMPT range is also labor — annotate as CONFLICT, pick one for the Labor Rate Book).
- **Add Supabase connection** to ai-estimator — reads tenant Labor Rate Book + Material Tier Chart at request time. Two separate queries and two separate prompt injections ("Your vetted labor rates:" / "Material reference — [tier] pricing:").
- **Add `source_label` column** to `estimate_line_items` (TEXT nullable, no default) — separate from `notes` which is overloaded with scoped-delete prefixes. Do before Phase 3.

---

## Known-Good From the Same Session (Do Not Re-Litigate)

**Sales tax** — the model applied it correctly when explicitly asked: materials-only base, correct 10.1% MO+Cass+Raymore combined rate, correct exclusions (labor, permits, contingency not taxed). Tax should become a **deterministic calculated field** (tenant-default rate applied to material-category lines at render), not a freeform chat request. Tenant-level rate setting, not per-job.

**Chat must not be trusted to EDIT an existing committed estimate.** Confirmed on Crane St: $585 of silent drift on untouched lines vs. $288 of requested change on one refinement pass. Chat is a first-draft generator only. Edits happen on committed rows (inline editing) or via append-only adds. This is a related concern (estimate edit model) — cross-reference but not part of this rate arc.

---

## Rough Phasing _(updated 2026-06-16 — Phase 1.5 added, subsequent phases renumbered)_

_Effort estimates in Sonnet prompts; refine at build time._

1. **Rate reconciliation** — Side-by-side comparison of SYSTEM_PROMPT vs `ai_knowledge` rates. Annotate as CONFLICT / ONLY-IN-PROMPT / ONLY-IN-KNOWLEDGE / LABOR-ONLY / MATERIAL-ONLY / COMBINED-INSTALLED. Output: a decision list of which numbers go to the Labor Rate Book, which seed the Material Tier Chart mid-tier, and which are retired. Mostly a data task. (Prerequisite for everything else.)

1.5. **Rate Book schema design** — Define the Labor Rate Book table shape (per-trade labor rates, `{ type: 'flat', rate, unit }` structured field, flat now / tiered-ready) and the Material Tier Chart structure (low/mid/high bands per material category). Add `source_label TEXT nullable` column to `estimate_line_items`. **Load-bearing schema decisions — everything downstream depends on this shape. Ship nothing else until this is locked.**

2. **Supabase connection + prompt injection** — Add a Supabase client to ai-estimator. At request time, load the tenant's active Labor Rate Book entries AND Material Tier Chart. Inject both into the prompt as two separate, explicitly-framed sections. Retire the hardcoded labor numbers from SYSTEM_PROMPT at this point; keep hardcoded material numbers temporarily as labeled fallback until tier chart is populated.

3. **Cite-or-flag + Range Collapse** — Every output line carries its source label. Labor lines cite tenant rate or flag as regional avg. Material lines cite the selected tier. No silent invention. Source label written to `estimate_line_items.source_label` on commit. Rate Book ranges are collapsed to a single point via the Job-Size Tier rule (see Keystone Decision 6): project SF → tier (high/mid/low) → collapse by unit type (SF/LF use tier; EA/LS always use MID).

4. **Guided interview flow** — Implement the conversational interview interface: finish tier selection, scope confirmation, pre-filled defaults (markup at 30%, baseline inclusions always-on), labor-gap batch-ask. Replaces the current freeform chat-then-generate flow.

5. **Per-tenant fallback mode config** — Add `estimator_fallback_mode` to tenant config (`regional_average` | `ask`). Determines labor-gap behavior. Regional-average defaults filled and labeled; `ask` mode batches labor unknowns into one list before generating the draft.

6. **Batch unknowns** — When fallback mode is `ask`, collect all missing-labor-rate lines and surface them as a single numbered list before generating the estimate. User answers in one pass.

7. **Learn loop** — When user supplies a missing labor rate, offer to write it back to the Labor Rate Book with a confirm step. Same confirm-before-write contract as ai-master-agent.
