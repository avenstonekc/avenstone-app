# God Agent Arc — Design Blueprint

_Created 2026-06-18. Home for the God Agent as a persistent conversational owner-control
surface. TENANT_ONBOARDING_ARC.md owns the setup/wizard path; this doc owns post-setup
owner control: bulk pricing, policy editing, capacity advisory. The two arcs are siblings —
wizard writes initial config, God Agent edits it forever after._

---

## What the God Agent Is

Not a setup script. Not a dashboard. A **persistent owner-facing AI tab** where the owner
talks to the app to change how it prices, what it recommends, and what it flags — without
hunting through Rate Book rows or config tables.

Two capabilities initially. A third on the horizon.

---

## Capability 1 — Conversational Bulk Pricing (NEAR-TERM, owner-only)

### The problem it solves

The owner is booked 10 weeks out and needs to raise pricing. Or one trade is swamped and
needs to throttle. Or margins are shrinking and they want to selectively bump labor rates.
Today: they'd have to find every row in the Rate Book, update them one by one. Nobody does
that. The rates stay stale.

The God Agent is the fast lane: "raise all my pricing 10%", "bump fence labor 15%",
"drop tile demo 5%". The agent parses intent → scope → preview → owner confirms → writes.

### Interaction model

Owner opens God Agent tab, types or speaks:
> "Raise all pricing 10%"
> "Bump everything in Electrical 12%"
> "Lower tile demo by 5%, it's too high and we're losing bids"

Agent parses:
- **Scope**: all services / one trade / one line_item
- **Direction**: raise / lower / set
- **Magnitude**: % or flat $ delta
- Produces a **preview** of affected rate_book_labor rows, old→new, before ANY write

Owner sees preview, confirms (or edits the preview inline). On confirm: bulk UPDATE.

### Guardrails (non-negotiable)

- **Preview-then-confirm ALWAYS.** Bulk writes against many vetted rates = highest-risk
  write in the system. Never apply a parsed intent without showing affected rows first.
  Even if the scope is "all services" — show the list, count, and new values.
- **Owner-only.** RLS: role='owner'. Same RLS gate as Phase 6 rate_book_labor writes.
- **Tenant-scoped.** Never write tenant_id=NULL. NULL = platform-default slot for ALL
  tenants. A NULL write would price every other tenant's estimates. Assert this every time.
- **Reuses Phase 6 owner-write helper.** Phase 6 (6.1) builds the single-row owner
  promote helper. Bulk pricing reuses it via a loop or batch UPDATE — it does not fork a
  second write path. One owner write helper, two callers.

### Merge with Phase 6.1

Phase 6.1 (owner Rate Book review surface — see ESTIMATOR_KNOWLEDGE_ARC.md Phase 6) is
"owner sees rep-entered rates and promotes them." The God Agent conversational bulk-adjust
is "owner changes rates intentionally." BOTH are "owner controls the Rate Book." They
belong on the SAME surface — the God Agent pricing tab — not two separate screens.

Proposed merge:
- The God Agent tab has two modes: **Review** (see flagged rep entries, promote one) and
  **Adjust** (bulk pricing via conversation).
- 6.1 builds the Review mode. God Agent Capability 1 builds the Adjust mode.
- Ship Review first (depends on Phase 6.0's deviation gate surfacing rep entries);
  ship Adjust second once Phase 6.1 confirms the write helper is solid.

---

## Capability 2 — Capacity-Aware Pricing Advisor (BLUEPRINT NOW, build after signal assessed)

### The idea

The God Agent watches schedule/backlog signal and proactively surfaces the classic
contractor inflection point:

> "Your backlog is 3 months out and your schedule is full through September. If you keep
> pricing where it is, you'll take on more work than your crew can handle without a hire.
> Consider raising pricing 10–15%, or it's time to think about adding capacity."

The agent turns schedule data into a business prompt the owner would otherwise only realize
retroactively — when they're already overbooked and stressed.

### What it needs (pre-conditions)

This requires real schedule signal:
- **Job pipeline**: leads in proposal/contract stages + their estimated start dates
- **Schedule items**: upcoming subs and phases across all active jobs
- **Crew capacity**: not directly modeled today — proxy via "active jobs with open phases"
- **Historical close rate**: to estimate how many current proposals will convert

Without this signal being rich enough to reason about, the capacity advisory triggers
vacuously or not at all. Build this AFTER the scheduling intelligence layer (SCHEDULING_
INTELLIGENCE_ARC.md) has enough data to make the trigger meaningful. If the arc doesn't
have a backlog-density signal by the time Arc B Capability 1 ships, Capability 2 waits.

### Notification model

Same as Phase 6 approval gate — **STATE, not push**. Surfaced as an insight card on the
God Agent tab (or Owner Home), not a push notification the owner can't dismiss. Owner-only.
Dismiss = card gone until the next scheduling cycle recomputes.

### Trigger cadence

Daily recompute (align with vigilance-runner timing, 11:00 UTC). No model calls in the
recompute — pure SQL schedule/job-count signal → trigger threshold → surface the card.
The advisory TEXT (the recommendation) is AI-generated on first-view, not on every recompute.
Never fire Opus automatically; Haiku for text generation on first view if needed.

---

## Tenant Config Store (shared with TENANT_ONBOARDING_ARC.md)

The God Agent is the EDITOR of per-tenant config. The onboarding wizard (TENANT_ONBOARDING_
ARC.md Phase 7) is the CREATOR. Both read and write the same store.

### What "tenant config store" means

A persistent, queryable, owner-editable store of every policy decision the tenant made at
onboarding — and can change later. Today there is no such store; config is scattered across
`ai_knowledge` free text, `markup_category_config` rows, `tenants.notification_rules` JSONB,
and hardcoded fallbacks. The store consolidates the owner-configurable policy layer.

### Storage decision

Two tiers:

1. **Structured tables** for config the engines read deterministically:
   - `markup_category_config` (exists, shipped 2026-06-02)
   - `bid_model_config` (planned, TENANT_ONBOARDING_ARC Phase 1)
   - `rate_book_labor` / `rate_book_material` (exist, ESTIMATOR_KNOWLEDGE_ARC)
   These are per-row, tenant-scoped, RLS-gated. Engines do direct queries.

2. **JSONB policy column** on the `tenants` table for scalar policy values that don't
   warrant a full table:
   - `pricing_policy JSONB` — first use: deviation tolerance pair (see below)
   - Future: capacity thresholds, notification rules (today in `notification_rules JSONB`)
   Reads as `tenants.pricing_policy->>'deviation_up_pct'` with a hardcoded fallback.

### The deviation tolerance pair — first pricing-policy entry

Phase 6 (Phase 6.0) needs to compare each rep-entered rate to the vetted rate_book_labor
rate and apply an asymmetric tolerance band:

```json
{
  "deviation_up_pct": 30,
  "deviation_down_pct": 15
}
```

Stored in `tenants.pricing_policy`. Phase 6 reads it with a hardcoded fallback of +30/−15
so it ships independent of the wizard. The God Agent tab (Capability 1) will eventually
let the owner edit this: "What's my margin floor on discounts?" → confirm → update the pair.

**Business semantics (LOCKED with Kalin):**
- **Up-band (+30%)**: marking a line price ABOVE the vetted rate by up to 30% is FREE.
  Upselling is encouraged; the vetted rate is the cost floor, not a cap.
- **Down-band (−15%)**: discounting BELOW the vetted rate by more than 15% trips the gate.
  Protects margin on the discount-to-sell move.
- **Gap fills** (no vetted baseline at all): always gate. A rep-entered rate with no vetted
  number is unvalidated — manager approval before send.
- **Manager path**: owner or PM entering any rate → immediately sendable. No gate.
- **Gate effect**: estimate.status='awaiting_approval'. Send To Client button disabled.
  No push. Surfaces as state (like pending sub-invoices).
- **Per-line, not per-estimate**: a single out-of-band line gates the whole estimate.
  The manager sees which line(s) tripped the gate on the approval surface.

Migration: `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pricing_policy JSONB DEFAULT '{}'::jsonb;`
Phase 6.0 reads: `pricing_policy->>'deviation_up_pct'` with JS fallback to 30 if null.

---

## Overlap with TENANT_ONBOARDING_ARC.md

| Concern | Home Doc | Who writes | Who reads |
|---------|----------|-----------|-----------|
| Onboarding wizard UI | TENANT_ONBOARDING_ARC | Wizard | — |
| bid_model_config (new table) | TENANT_ONBOARDING_ARC | Wizard, engine | Engine |
| markup_category_config | TENANT_ONBOARDING_ARC | Wizard | Proposal engine |
| Rate Book (labor/material) | ESTIMATOR_KNOWLEDGE_ARC | Owner (promote), Wizard (initial) | ai-estimator |
| pricing_policy JSONB (tolerance) | GOD_AGENT_ARC (here) | God Agent, Wizard (initial value) | Phase 6 gate |
| Conversational bulk pricing | GOD_AGENT_ARC (here) | God Agent | rate_book_labor |
| Capacity advisor | GOD_AGENT_ARC (here) | Daily SQL | Owner view |

The wizard is the ONE-TIME writer of initial values. The God Agent is the ONGOING editor.
Both write to the same tables; the God Agent always preview-then-confirms before any bulk
write.

---

## Phase Plan

| Phase | Scope | Prereq | Status |
|-------|-------|--------|--------|
| B0 | This doc + slice sequence | — | DONE |
| B1 | Phase 6.1 Review mode (rep-entry promotion) | Phase 6.0 deviation gate | Planned |
| B2 | God Agent tab + Capability 1 (conversational bulk pricing) | Phase 6.1 write helper | Planned |
| B3 | pricing_policy JSONB edit via God Agent ("what's my discount floor?") | B2 | Planned |
| B4 | Capacity advisor (schedule signal assessment first) | SCHEDULING_INTELLIGENCE_ARC | Gated |

---

## Slice Sequence (Phase 6 + Arc B combined)

```
S0  — Fix send-to-client (PREREQUISITE, 1 prompt)
        sbSendEstimateEmail: rename client_email→to, add HTML body.
        Broken for any rep today. Fix before any send-gating matters.

6.0 — Deviation gate + awaiting-approval state (2 prompts)
        Migration: tenants.pricing_policy JSONB (with deviation_up/down_pct defaults).
        Migration: job_estimates.status extends to 'awaiting_approval'.
        Deviation check at commit time. Manager path → no gate. Rep path → gate.
        Reads from tenants.pricing_policy, fallback +30/−15.

6.1/B1 — God Agent pricing surface Phase 1: rep-rate review + promote (2 prompts)
        Owner sees flagged estimates (rep-entered/gap-filled lines). Promotes a rate to
        rate_book_labor (owner-only RLS). The God Agent Rate Book tab, Review mode.

6.2 — Manager approval surface + send unlock (2 prompts)
        Sits on fixed send path (S0 prereq). Manager approves → status='sent' → send.
        Surfaces which lines tripped the gate.

6.3 — Loop closure verification (1 prompt)
        Smoke-test that promoted rate resolves on next estimate run.

B2  — God Agent Capability 1: conversational bulk pricing (3 prompts)
        God Agent tab Adjust mode. parse intent → preview → confirm → bulk UPDATE.
        Reuses Phase 6.1 owner write helper.

B3  — pricing_policy edit via God Agent (1 prompt)
        "What's my margin floor on discounts?" → edit tolerance pair via God Agent.

B4  — Capacity advisor (blocked on schedule signal — assess when SCHEDULING_INTELLIGENCE
      has sufficient backlog-density data)
```

---

## Open Questions

1. **God Agent tab location**: standalone top-nav screen (owner-only gated) or a sub-tab
   on Owner Home? Sub-tab is lighter but buries it. Standalone screen is cleaner for a
   conversational surface. Decide at B2 build time based on what's already on Owner Home.

2. **Bulk pricing preview UX**: show affected rows as a table (description, old rate, new
   rate) with an editable override per row before confirming? Or just show count + % and
   let the owner drill in? Propose at B2; don't overbuild up front.

3. **Does pricing_policy need a version/history?** If the owner bulk-adjusts and regrets
   it, can they revert? Not a Phase 6 or B2 concern, but worth noting for B3+.

4. **Capacity advisor trigger threshold**: what backlog depth triggers the advisory?
   "3 months booked" is a reasonable starting threshold but depends on crew size. This
   is config, not hardcoded — add to pricing_policy or a separate capacity_policy JSONB.

---

## Amendments

_Empty — update as phases ship._
