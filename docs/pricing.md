# Avenstone Pricing — First Draft

_Last reviewed: 2026-04-15_

**Status: FIRST DRAFT.** These numbers are a starting point, not a commitment. They will change as we learn what contractors actually pay for. Do not treat anything here as final until at least 5 paying tenants have confirmed it works.

For the long-term product vision, see [vision.md](vision.md). For the feature flags / gating system that enforces tiers, see the future `docs/tiers.md` (not yet written).

---

## Core pricing philosophy

1. **Price for value delivered, not cost to serve.** AI features cost Avenstone pennies per call but replace hundreds of dollars of rep and estimator time per bid. Price on the second number, not the first.
2. **Don't scare small contractors.** A 10-person crew shouldn't see "$500/month" as their first quote. See the role-based seats pattern below.
3. **Make upgrade paths obvious in-product.** Every locked feature shows "Upgrade to Pro to unlock" — not an error, a pitch.
4. **Never gate client-facing features.** Clients (homeowners) always get free access to the client portal, contract signing, and progress views. Never charge the end homeowner to see their own project.
5. **AI is a premium layer on solid PM software.** The PM tool works without AI. AI is opt-in value on top. This widens the addressable market to AI-skeptical contractors who just want better job management today.

---

## The three pricing axes

Avenstone has three independent dimensions that affect pricing. Most SaaS companies pick one (usually tier) and ignore the others. We use all three deliberately.

### Axis 1 — Role (free vs paid seats)

**This is the biggest sales unlock.** Not every user in a contracting company should cost the same.

| Role | What they do | Seat type |
|---|---|---|
| **Owner** | Runs the business, approves bids, sees the money | **Paid** (included in tenant subscription) |
| **Sales rep / estimator** | Creates bids, uses AI estimator, talks to clients, runs AI consultation | **Paid** (counts toward seat limit) |
| **Project manager** | Manages active jobs, uses AI companion, sees daily brief, assigns crew | **Paid** (counts toward seat limit) |
| **Crew member** (new role — internal employees) | Takes photos, logs arrival, views schedule, marks phases done, views drawings | **Free** (unlimited, no seat limit) |
| **Sub** (external contractor hired per job) | Responds to bid invitations, submits daily logs, uploads receipts | **Free** (unlimited, no seat limit) |
| **Client** (homeowner) | Signs contracts, pays invoices, views progress, chats with PM | **Free** (always, always, always) |

**Why this works:** A GC with 2 office staff + 3 reps + 8 crew + 30 active clients looks at traditional per-seat pricing and does scary math. With role-based seats, they see "5 paid seats, everything else is free." That's the difference between "can't afford it" and "obvious buy."

### Axis 2 — Tier (feature level)

Tiers bundle features and seat limits into standard packages. First-draft structure below. Subject to change once real contractors react to it.

| Tier | Price/mo | Paid Seats | Free Seats | AI Allowance |
|---|---|---|---|---|
| **Free trial** | $0 | 1 | 3 | 10 companion messages total (14-day limit) |
| **Starter** | $199 | 3 | Unlimited | ~15 bids worth of AI usage |
| **Pro** | $449 | 10 | Unlimited | ~50 bids worth of AI usage |
| **Premium** | $999 | Unlimited | Unlimited | ~200 bids worth of AI usage |
| **Enterprise** | Custom | Unlimited | Unlimited | Uncapped, SLA |

**Extra paid seats** beyond tier allowance: $25/mo (Starter), $35/mo (Pro), $50/mo (Premium). Always optional.

**AI overages** beyond monthly allowance: soft cap alert at 80%, hard cap at 100% with upgrade pitch. No rollover month-to-month. Clean monthly reset.

**Feature map by tier:** TBD until we use the features in real jobs and see what contractors value. Don't pre-commit. The tiers.md file will document this once we know.

### Axis 3 — AI layer (on / off / graduated)

**This axis is more experimental and may or may not ship.** The idea: some contractors want the PM software without any AI (they're AI-skeptical, or they want to keep their estimator in the loop, or their staff isn't ready). Let them buy Avenstone without AI, then upgrade later.

Two options for how to structure this:

**Option A — AI as a tier modifier.** Every base tier has a "no AI" version at ~60% of the price:

| Tier | Base (no AI) | Full (with AI) |
|---|---|---|
| Starter | ~$129 | $199 |
| Pro | ~$279 | $449 |
| Premium | ~$649 | $999 |

**Option B — AI as a per-seat add-on.** The base product is cheaper and AI access is sold per-user:

- Base tier: $129/mo for Starter, $279/mo for Pro
- AI-enabled seats: +$50/mo per user who gets AI access
- Lets a GC buy the base plan for the whole team and enable AI for just the 2 reps who need it

**My recommendation:** don't ship Axis 3 until after the first 5 tenants. The role-based seats (Axis 1) is the bigger unlock. AI tiering adds complexity and confuses the first few sales conversations. Revisit after we have actual pricing feedback.

---

## AI cost per feature (for reference when setting limits)

These are Avenstone's internal costs — what Anthropic bills us per call. Used to set sensible usage allowances per tier.

| Feature | Model | Typical cost per call | Notes |
|---|---|---|---|
| AI Intake Wizard (full conversation + extract) | Sonnet + Haiku | ~$0.25–$0.35 per intake | Runs once per lead |
| AI Estimator (generate full estimate) | Sonnet | ~$0.15–$0.25 per call | Runs when user hits "Generate Estimate" |
| Proposal JSON extract (for PDF) | Sonnet | ~$0.25–$0.35 per call | Runs when user hits "Generate Proposal" |
| AI Consultation (ambient + measure, 30 min session) | Haiku + Sonnet + transcription | ~$0.45–$0.95 per session | Biggest single-event cost; replaces $100–$300 of rep time |
| AI Companion (single chat turn with context) | Sonnet | ~$0.04–$0.05 per turn | Per-message, accumulates with conversation depth |
| ai-home-companion (morning brief) | Haiku | ~$0.01–$0.02 per user per day | Fires on home screen open |
| ai-pm-nightly (daily rule checks) | **No AI** | **$0** | Pure SQL rules, Opus narrative disabled |
| LiDAR room scan | **No AI** | **$0** | Runs on-device via Apple RoomPlan |

**Rough total per full bid with the full AI stack (consultation + estimator + proposal + companion support): ~$1.20**

For a job that might close at $30k–$100k, that's a 0.001%–0.004% AI cost. Unit economics are excellent.

---

## Competitor landscape (snapshot — verify current)

**Caveat:** based on market data from mid-2024 through early 2025. Pricing and feature sets change quickly in this space. Always verify before quoting numbers in a sales conversation.

| Competitor | Base price | Key AI features | AI pricing approach |
|---|---|---|---|
| **Buildertrend** | $499–$799/mo | AI writing assistant (notes, emails), AI estimator helpers | Bundled into standard tiers — no separate AI pricing |
| **CoConstruct** (merged into Buildertrend) | Same | Same | Same |
| **JobTread** | $199–$399/mo | Some automation | Bundled |
| **Procore** | $375–$1000+/mo (per user) | AI analytics, predictive insights, document AI | Enterprise add-on, custom pricing |
| **ServiceTitan** | Custom (field service focus) | AI dispatching, pricing suggestions, sentiment analysis | Bundled in higher tiers |
| **Houzz Pro** | $85–$299/mo | AI design visualization | Bundled in Pro+ |
| **Contractor Foreman** | $49–$249/mo | Minimal AI | N/A |
| **Canvas** (Occipital) | Separate app | LiDAR room scanning only | Standalone scanner, not a PM product |

### Where Avenstone has defensible differentiators (verified)

- **Voice-first AI consultation with ambient listening** — no major construction SaaS has this
- **LiDAR room scanning integrated into estimating** — Canvas is standalone, not integrated
- **AI PM daily briefing (ai-pm-nightly)** — Procore has some predictive analytics but nothing with this level of specificity
- **Per-person per-job AI companion with memory** — nobody else has this
- **Role-based free/paid seats** — nobody in construction SaaS does this cleanly

### Strategic read

Most competitors treat AI as a feature bundled into existing tiers — "a nice-to-have on top of our real product." Avenstone's angle is the opposite: AI and LiDAR are the moat, the PM software is the foundation. This means we CAN charge a premium for the top tiers because we're delivering something the competition can't match. But we should price the base tier competitively with Buildertrend / JobTread so we're not shut out of the AI-skeptical segment.

---

## What we don't know yet

1. **Which features actually drive upgrades** — we'll learn from real tenants which Pro features they won't live without. Until then, the tier feature map is a guess.
2. **The right AI usage allowance per tier** — our estimates are based on Avenstone's own usage patterns. Other contractors may use more or less. We'll calibrate after the first 3 tenants.
3. **Whether Axis 3 (AI layer tiering) is worth building** — requires feedback from actual AI-skeptical contractors about whether they'd pay for a no-AI version.
4. **What contractors actually pay for branding vs features** — the premium tier's branded native app is priced at $999, but we don't know if that's too high, too low, or about right. Real quotes from real contractors will tell us.
5. **Whether per-job overages are worth building** — clean monthly caps are simpler, but heavy-season contractors may prefer pay-as-you-go.

---

## When to update this file

- After every real sales conversation with a prospective tenant (what did they react to, balk at, ask about?)
- After the first tenant signs up — update with their actual tier and any custom pricing negotiated
- Every time a new AI feature ships — add it to the "cost per feature" table
- Every 90 days at minimum — even if nothing changed, a review catches drift
- Before every new tier gets added — write the proposal here first, test it in conversation, then build

## When to NOT update this file

- Don't update with speculative pricing for features that don't exist yet — only price what's shippable
- Don't commit to numbers unless you're ready to quote them
- Don't copy competitor pricing wholesale — use them as signal, not gospel
