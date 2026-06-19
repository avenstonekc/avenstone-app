# Agent Intelligence Architecture — the Compounding Contracting Brain

## Vision

Avenstone is one big brain that grows every day — with every tenant, every job, every delay. Not a static app with AI features bolted on: a compounding intelligence layer where the system gets smarter for everyone with every interaction. The long game: build a contracting mastermind that knows more about how jobs actually cost, schedule, and go wrong than any individual GC could — because it has seen thousands of real jobs across many tenants.

---

## Two agent axes

### 1. Page agents (specialist sub-agents per surface)

Each page/domain has a specialized sub-agent expert in that surface: estimate agent, subs agent, financials agent, schedule agent, etc. The MASTER AGENT delegates to the right page agent for the task. (Extends the existing ai-master-agent + delegation — generalize so every major page has a trained sub-agent with deep context for that surface.)

| Page / domain | Sub-agent | What it knows |
|---|---|---|
| Estimate | estimate-agent | Line item patterns, trade pricing, markup logic, scope gaps |
| Schedule | schedule-agent | Duration benchmarks, dependency rules, slip patterns, sub availability |
| Subs | subs-agent | Sub history, scorecard, trade fit, bid response patterns |
| Financials | financials-agent | Draw schedule, CO impact, cost-plus vs fixed math, carry cost |
| Field | field-agent | Daily log patterns, inspection dependencies, phase gates |
| Client portal | client-agent | Update cadence, how to phrase delays, what clients react badly to |

Each page agent runs with:
- The master agent as orchestrator (delegates, aggregates, arbitrates)
- Its own system prompt trained on that domain's data + tenant config
- Access only to the tables/context relevant to its surface (least-privilege per agent)

### 2. Actor agents (per role / per sub / per rep / per tenant)

Each PERSON has an agent that's their safety net and force-multiplier:
- They can ignore it (tell it to fuck off), lean on it to improve, or — if they communicate with it — let it nearly automate their job.
- It's on them how much they use it. We provide the net; they choose.
- Per-role baseline + per-individual tuning (adaptive guardrails — see SCHEDULING_INTELLIGENCE_ARC adaptive guardrails section).

| Actor | Agent behavior |
|---|---|
| PM | Proactive pokes, schedule risk, CO flags, PM self-scorecard |
| Sales rep | Estimate confidence, scope gap warnings, past similar jobs |
| Sub | Confirmation reminders, material readiness, scorecard visibility |
| Owner | Cross-job financial summary, anomaly detection, draw schedule health |
| Client | Phase update narrative, delay framing, next-step transparency |

Actor agents accumulate individual history — patterns per person, not just per role. A PM who repeatedly delays countertop orders has that pattern detected and surfaced. A sub with a 90% on-time rate gets that reflected in booking confidence. The agent is a mirror, not a judgment — it shows people what their data says.

---

## The compounding knowledge base (the moat)

Every interaction writes to a growing knowledge base:

- **Living records per actor** — per-role, per-sub, per-rep, per-tenant: each actor's patterns, weaknesses, preferences, performance history. Updated continuously.
- **Aggregated cross-tenant intelligence** — pricing data, trade duration benchmarks, what-goes-wrong patterns, sub performance, regional cost data. Anonymized. Cross-tenant.
- **From data to models** — the aggregated records become graphs, pricing models, benchmarks usable to: (a) make the product smarter for every tenant, and (b) grow Avenstone as a brand and business — the intelligence itself is an owned asset.

### What lives where

| Layer | Storage | Scope | Use |
|---|---|---|---|
| Per-actor memory | `job_ai_companions` + new actor_memory table | Tenant-private | Individual pattern detection, adaptive guardrails |
| Per-tenant config | `ai_knowledge` | Tenant-private | Pricing, trade prefs, communication style |
| Cross-tenant benchmarks | New aggregated tables (anonymized) | Platform-wide | Duration benchmarks, regional pricing, failure patterns |
| Sub scorecards | Per-tenant (see SCHEDULING_INTELLIGENCE_ARC) | Tenant-private | Booking confidence, reliability signals |

---

## Why this is the moat

Competitors copy features; they can't copy accumulated data. Every job run through Avenstone makes estimating sharper, schedule guidelines better, sub scorecards more accurate, pricing more precise — for ALL tenants.

A delay on one job teaches the brain something that helps the next PM at the next company. The flywheel:

```
more jobs → smarter system → better outcomes → more tenants → more jobs
```

No competitor bootstrapping fresh can replicate N years of real-job data across real tenants. This is the compounding advantage that makes Avenstone impossible to displace once it's the incumbent.

---

## Relationship to other arcs

This is the META-layer. Existing and planned features are INSTANCES of it:

| Arc | Instance of agent intelligence |
|---|---|
| SCHEDULING_INTELLIGENCE — pokes, scorecards, adaptive guardrails | Schedule page agent + per-actor pattern detection feeding the knowledge base |
| Estimate intelligence — duration/cost benchmarks improving over time | Estimate page agent + aggregated pricing data |
| Sub scorecards / PM self-scorecard | Actor-agent pattern detection → knowledge base writes |
| TENANT_ONBOARDING — per-tenant config | Per-tenant brain seeding (`ai_knowledge` as initial actor context) |
| ai-master-agent (existing) | The orchestration root this architecture generalizes and extends |

The master agent already exists. Page agents and actor agents are the generalization: every major surface gets a specialist, every major person gets a net. The knowledge base is the layer that makes it compound rather than stay static.

---

## Open questions (for later)

1. **Data architecture** — per-actor/tenant records vs structured tables vs both? How does aggregated cross-tenant learning stay privacy-safe (tenant A's data improving tenant B's experience without exposing tenant A's specifics)?

2. **Shareable vs private** — what crosses tenants (anonymized pricing/duration benchmarks, regional failure patterns) vs what stays strictly tenant-private (clients, margins, specific job details)?

3. **Page agent training/context** — how do page agents get their deep knowledge? Per-tenant config rows + global platform best practices injected at system-prompt build time? Retrieval-augmented from the knowledge base? Both?

4. **Monetization of aggregated intelligence** — benchmarks as a product feature ("your tile labor is 18% above KC average"), or a market report product, or a white-label pricing tool for suppliers. The aggregated data has standalone value beyond making the product smarter.

5. **Agent-to-agent communication** — when the schedule agent detects a slip that affects financials, does it message the financials agent directly, or does everything route through the master agent? Coordination protocol TBD.

6. **Opt-in/opt-out per actor** — what's the minimum an actor must share (for the system to function) vs what they can turn off (individual pattern tracking)?

---

*Blueprint only. This is the north-star architecture — captured 2026-06-02 so the whole vision is preserved as one coherent picture. Do NOT build from this doc without a scoped implementation plan.*

---

## Lead Marketplace / Job-Routing Layer (future business model — PRIVACY-GATED)

### The idea

Jobs flow through Avenstone, so the system has geographic + trade demand signal (where deck jobs, tree work, remodels, etc. are happening). Potential second business model: a lead marketplace where jobs get routed to Avenstone users to bid on — built to be automatic, since the app is already automation-first. Recruit homeowners/clients onto the platform; users bid on projects in their area/trade; bidding can be automated.

### CRITICAL PRIVACY BOUNDARY (the make-or-break)

The line between a legitimate marketplace and a lawsuit is CONSENT + DATA OWNERSHIP:

**FORBIDDEN:** harvesting a tenant's private client/job data (who they served, where, what for) to generate leads, marketing, or route to other tenants WITHOUT that tenant's and/or that client's consent. Tenant A's client data is Tenant A's — using it to advertise or feed competitors behind their back = breach of trust + legal exposure. DO NOT build the harvesting version.

**ALLOWED (consented models):**

1. **HOMEOWNER OPT-IN** — homeowners post jobs INTO the marketplace ("I want a deck"); they consented to be a lead. Tenants bid. (Angi/Thumbtack model, but with Avenstone's estimating/PM tools attached — that's the differentiator.)
2. **TENANT OPT-IN** — a tenant explicitly opts to contribute leads (overflow, declined jobs) into the network for others to bid. Consented contribution.

Per-tenant learning (a business's own data making ITS OWN experience smarter) has NO privacy issue and is the safe core — the marketplace is a SEPARATE opt-in layer on top, never a repurposing of private tenant data.

### Why it's strategically big

- Second revenue model (marketplace/lead fees) on top of SaaS subscriptions.
- The differentiator vs existing lead marketplaces: leads land in a system that already has estimating, scheduling, draws, sub management — a contractor can go from lead → bid → run the job without leaving the app. Auto-bid possible because the tooling's already there.
- Network effect: more contractors + more homeowners → more matches → more value.

### Open questions

- Consent UX: how homeowners post + consent; how tenants opt in to contribute.
- Anonymized market intelligence (demand heatmaps by trade/area) — is aggregated/anonymized demand data shareable as a product feature without exposing any individual job/client? (Likely yes if truly aggregated; needs care.)
- Marketplace economics (lead fees, bid model, take rate).
- Regulatory: lead-gen / contractor referral laws vary by state.

*Blueprint only. Big strategic arc, post-PMF. Captured 2026-06-02. The privacy boundary above is NON-NEGOTIABLE — the per-tenant brain is the safe core; the marketplace is a consented opt-in layer, never built by harvesting private tenant data.*
