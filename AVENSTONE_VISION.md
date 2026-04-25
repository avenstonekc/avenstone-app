SCOPE: create a new file at the repo root: AVENSTONE_VISION.md

This is a product philosophy + feature roadmap document, not a
technical spec. It captures the guiding principle for every
AI feature in the app, plus the concrete v1/v2/v3 roadmap that
follows from it.

Read this at the start of any future session that touches AI
features, consultation flow, takeoff/estimating, change orders,
project management briefings, or anything that involves
moving information from one stage of the project lifecycle
to another.

Create the file with this exact content:

````
# Avenstone Vision — The Anti-Surprise Engine

## The core philosophy

Avenstone software exists to **move information upstream** —
catching problems, gaps, and decisions earlier in the project
lifecycle than humans naturally would. Every AI feature in this
app is judged by one question:

> Does this catch a problem earlier in the funnel?

If yes, build it. If no, it's polish.

Construction surprises destroy contractor reputations and client
trust. The contractor who predicts the problem looks like a pro.
The contractor who discovers it mid-job looks like a hack — same
problem, same money, opposite outcome. Software cannot eliminate
unknowns. It can systematically surface them earlier.

## The four shifts

Every feature falls into one of four "shift information upstream"
buckets:

1. **Style alignment upstream of consultation** — inspiration
   photos, gallery references, vibe matching before the rep
   walks in.
2. **Technical accuracy upstream of mistakes** — real-time
   measurement coaching, scan gap detection, "LiDAR is bad at
   doors so tape-measure that one."
3. **Unknown discovery upstream of the estimate** — gap analysis
   from the transcript, post-consultation checklist of what the
   rep didn't ask, scope clarifications surfaced before pricing.
4. **Budget surprises upstream of conflict** — disclosed change
   orders in the proposal, probability-weighted unknowns priced
   up front, change orders that match what was predicted.

When a feature idea comes up, classify it by shift. If it doesn't
fit any of the four, it's probably not the highest-value thing
to build right now.

## The role-based briefing system

The unifying interface for all of this is the **morning brief**.
Every Avenstone user, when they open the app or get in their
truck, sees a contextual briefing tailored to what they're
about to do today. Not a generic dashboard — a real briefing,
spoken aloud if they're driving, role-aware, project-aware.

### Sales rep brief (driving to consultation)
- What kind of project this is (rough scope from the lead form)
- What inspiration photos the client sent + style read
- Style allowance ranges that match those photos
- Top 3 questions to ask based on the project type
- Scope items LiDAR can't capture well — measure these by hand
- Known traps for this type of job ("if it's pre-1978, ask about
  paint chips before demo")

### PM brief (driving to a job site)
- What phase this job is in today
- Critical inspections coming up + permit conditions
- Things to verify on demo day before crews start
  ("check header size before opening that wall, verify load path")
- Things subs are likely to forget that you should remind them of
- Pending COs, pending lien waivers, pending sub payouts
- Schedule risk — anything off-track or weather-affected

### Owner brief (start of day)
- AI PM nightly alert summary (already built — surface here)
- Money in / money out yesterday
- Jobs needing your attention with a one-line "why"
- Sales pipeline health — leads that have aged
- Cost overruns vs estimate by job

### Sub brief (driving to a job)
- Today's scope on this job, your specific work
- What other trades are on-site today (don't step on each other)
- Site conditions you should know (is power on? water shut off?)
- What the PM expects done by EOD
- Lien waiver status

The brief is delivered as text on the home screen, optionally
spoken aloud via TTS for hands-free consumption. This is the
voice agent's first real application beyond data entry — it's
the morning briefer. Driving to a job, the truck cabin becomes
the prep room.

One brief per user per day. No multi-owner consolidation —
each owner gets their own brief based on the jobs and leads
they touch.

## Multi-owner model

Avenstone has multiple owners (currently Kalin, with others
expected). All owners are equivalent — same role, same
permissions, same access. No primary/secondary tiers.

- Approval workflows: first-to-approve wins. CO approval,
  ai_knowledge entry approval, contract send — any owner can
  act, no second signature required.
- Each owner gets their own personal morning brief based on
  their actual job touches (not a single shared dashboard).
- Hardcoded references to specific owner emails (e.g. the
  "never send contracts to kalin@avenstonekc.com" rule in
  CLAUDE.md) need to generalize to "never send to any user
  with role=owner" once additional owners are active.

## Why this is the moat

Anyone can build construction CRM. Anyone can build estimating
software. Anyone can stitch AI into a chat box.

What no one in residential GC software has done is build a
system where the software *thinks ahead of every role* — where
the rep arrives prepared, the PM avoids the mistake before it
happens, the owner sees the issue before it costs money, and
the client gets the surprise disclosed before construction
starts. Every other tool is reactive. This one is anticipatory.

The durable advantages:

1. **Avenstone runs the software it builds.** Every feature is
   built from operational pain, not customer interviews. That
   feedback loop is uncopyable.
2. **Every job teaches the system.** ai_knowledge,
   oh_shit_moments, completed COs, and PM observations
   compound into a private dataset that sharpens predictions
   over time.
3. **Single-builder velocity.** Idea on Monday, shipped by
   Friday. No competing software product in this space has
   that loop.

That's the positioning line: **Avenstone software prevents
construction surprises.** Not "AI for contractors." Not
"streamline your business." Prevents surprises.

## What's already shipped (anti-surprise features today)

- ai-pm-nightly — six rule checks per active job, surfaces
  issues to the right person on first login each day
- AI Companion — per-job per-person memory, knows job context
  on every call
- Lien waiver red flags on sub_payout / vendor_payment rows
- Budget vs Actual view (Phase 4 financials)
- Disclosed unknowns in oh_shit_moments table — already
  generated by generate-estimate-from-session, but **not yet
  surfaced in client-facing proposals** (gap)
- AI knowledge base with KC pricing — used at estimate time

## v1 — Anti-surprise foundation (current build)

Goal: ship the core anti-surprise infrastructure. After v1,
every subsequent feature plugs into this foundation.

### Three estimator paths, coexisting
- `ai-estimator` — conversational estimating in EstimateTab
- `generate-estimate-from-session` — consultation-driven
- New takeoff wizard — scan-driven, allowance-aware

All three write to estimate_line_items. Not redundant —
different sales motions for different jobs.

### Schema migrations
- estimate_line_items: + allowance_original, scan_id,
  selected_product_id, source_type
- change_orders: + estimate_line_item_id, allowance_original,
  allowance_override, source_type, auto_generated,
  client_approved_at, disclosed_in_oh_shit_moment_id
- New material_catalog table (tenant-scoped, seeded by hand)
- ai_knowledge: extend with category='inspection_checklist'
  — entries to be AI-seeded initially, owner-curated thereafter

### Inspection checklists — AI-seeded baseline
- One Sonnet call generates 60-80 generic-but-solid entries
  across phases (demo / framing / rough mep / drywall /
  finish / punch) and project types (kitchen / bath / basement
  / addition / paint-and-floor)
- Each entry has: trigger condition, check item, severity
  (blocker / strong / nice-to-have), consequence
- Owner reviews and approves before activation — no bulk
  auto-insert, all entries go through review
- Library grows over time via v2 ai_knowledge_learner

### Takeoff wizard (rep-facing)
- Pulls scan data via job_id
- Pulls consultation extractions for scope hints
- Parses ai_knowledge prose into mid-range unit costs
  (regex pass, no new pricing_lookup table for v1)
- Surface-by-surface, room-by-room confirmation
- Writes line items with allowance_original frozen
- Three source types per line: allowance, fixed, quote

### Gap analyzer
- New edge function: ai-consultation-gap-analyzer
- Inputs: session_id (reads transcript, measurements,
  extractions, scan data, ai_knowledge inspection_checklist)
- Output: structured list of gaps + suggested follow-up questions
- Surfaced in ConsultationTab when rep hits "I'm done"
- Rep resolves gaps before estimate generation

### Disclosed change orders in proposals
- oh_shit_moments already populated — add UI to surface them
  in the client-facing proposal/estimate document
- Section header: "Possible additional work — disclosed
  up front so there are no surprises"
- Each item: condition, likelihood %, price range
- When real CO later matches an oh_shit_moments row, link them
  via change_orders.disclosed_in_oh_shit_moment_id

### Material selection (rebuilt MaterialSelectionScr)
- Strip placeholder catalog, hardcoded quantities, dead-end
  save path
- Wire to new material_catalog table + estimate_line_items
- Quantities from scan via line item lookup
- Auto-CO when client selection exceeds allowance_original

### Bathroom variants (homework, owner-defined)
- 3-5 templates covering 90% of Avenstone bathrooms
- Each template defines: surfaces in scope, default tile
  coverage rule, default fixtures, allowance ranges per tier
- Stored as JSONB in a new takeoff_templates table

## v2 — Pre-consultation alignment + briefings

Builds on v1.

### Inspiration photo intake
- Pre-consultation upload page (link sent to client when
  lead is created)
- Vision pass on uploaded photos (Sonnet vision or similar)
- Extracts: style tags, recurring elements, price tier signal
- Briefs the rep before the visit

### Morning brief — sales rep
- Pre-consultation briefing card
- Inspiration photo summary if available
- Project-type-specific questions to ask
- Allowance ranges grounded in client's photos

### Morning brief — PM
- Today's site visits with phase + critical reminders
- Inspection checklist tied to permit + phase
- Pulls from ai_knowledge inspection_checklist entries

### Real-time measurement coaching
- During consultation measure mode, AI nudges based on
  scope ("client mentioned door replacement — measure rough
  opening with tape, LiDAR is unreliable here")
- Scoped, contextual, non-interrupting

### ai_knowledge_learner
- New edge function — pattern-detection across completed jobs
- Reads oh_shit_moments, completed COs, PM observations
- Suggests new inspection_checklist entries when patterns
  emerge ("subfloor rot was found on 3 of last 5 1960s
  bathrooms — add a check?")
- Owner approves before activation
- Closes the loop: every job makes the system smarter

## v3 — Voice-driven briefings (the truck cabin)

Builds on v2 + voice agent (see VOICE_AGENT.md).

### Spoken morning brief
- "Hey Claude, brief me on today" while driving
- Reads out the role-appropriate brief
- Hands-free, eyes-on-road
- Conversational follow-ups ("what's the address again?",
  "remind me what tile they liked")

### Proactive driving alerts
- "You're 10 minutes from the Smith job — reminder, the
  homeowner said they have a dog and asked you to call
  before arriving"
- Calendar + location-aware

### Post-visit voice debriefs
- After a consultation, rep gets back in truck
- "Brief me on what I just learned" → AI summarizes the
  consultation back, rep confirms accuracy, fills gaps

## Open product questions

- Does the brief deliver as a notification, a dedicated
  home screen, both? (UX pattern not yet decided)
- How aggressive should pre-consultation outreach be? Some
  clients won't engage with homework — graceful degradation
  required.
- Voice agent disambiguation when the user says "the Smith
  job" and there are two Smiths — same problem as the data
  entry agent, same solution probably.
- Multi-owner approval workflows — need to define which actions
  require multiple owner approvals (likely: large COs above
  threshold, irreversible actions like contract send). Most
  actions stay single-owner-approves for v1.

## Cost guardrails

Every feature in this vision must obey CLAUDE.md API Cost Rules.
Briefings are user-triggered (not automatic on a cron) and use
Haiku where possible, Sonnet only for complex synthesis. No
Opus for anything in this vision. Vision passes on inspiration
photos: Sonnet vision, single shot per photo, max 1024 tokens
output, capped at 10 photos per lead.

Back-of-envelope per-user-day cost estimate for v3 fully
realized:
- Morning brief: 1 Sonnet call, ~$0.05
- Gap analyzer per consultation: 1 Sonnet call, ~$0.10
- Inspiration vision: 1 Sonnet vision call per lead, ~$0.05
- Voice agent sessions: see VOICE_AGENT.md
- Total per active user-day: ~$0.50-1.00 worst case

Acceptable. Compares favorably to a single missed CO or a
single client misalignment.

The "as little AI as possible" rule means: AI only where it
earns its keep. Briefings, gap analysis, inspiration vision,
and voice are the AI features. Takeoff math, allowance
tracking, CO drafting, and order list generation are
deterministic — no AI needed.

## Rollback plan per phase

Every shift is additive. v1 doesn't break v0 — three
estimators coexist. v2 doesn't break v1 — briefings are
new surfaces, not replacements. v3 doesn't break v2 — voice
is a layer on top of text briefs.

If any phase causes confusion, hide its UI behind a feature
flag and ship without it. The data layers stay regardless.

---

Last updated: 2026-04-25
````

After creating the file:

1. Append a [LOG] entry to CLAUDE_MEMORY.md noting that
   AVENSTONE_VISION.md was created, summarizing the
   anti-surprise philosophy in one line, and listing v1 / v2 /
   v3 phase headers so future sessions know the roadmap exists.

2. Add a one-line reference to CLAUDE.md at the top of the
   "What this app is" section, after the "Competitive advantage"
   line:
   "**Product philosophy:** see AVENSTONE_VISION.md — the
   anti-surprise engine."

3. Commit and push:
   git add AVENSTONE_VISION.md CLAUDE.md CLAUDE_MEMORY.md
   git commit -m "docs: AVENSTONE_VISION.md — anti-surprise product philosophy + v1/v2/v3 roadmap"
   git push origin main

Do not modify any source code. This is documentation only.