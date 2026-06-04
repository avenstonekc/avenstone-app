# Role Dashboards Arc — Design Blueprint

_Future arc. Not yet approved for build. Captured 2026-06-03._

## Purpose

Five role-based home-screen dashboards on one platform — Owner, Project Manager, Sales Rep, Subcontractor, Client Portal — each showing that role exactly what they need, scoped to what they're allowed to see. "One Platform. Five Experiences." The dashboards are the visible proof that the whole system runs in unison: pipeline, schedule, financials, photos, walkthroughs, AI insights — all flowing through one source of truth, rendered per role. This is the most demoable, most sellable surface in the product (the whole vision in one screen) and the daily-use home base for every actor.

The user-facing AI assistant is branded **Aven AI** (the center FAB / sparkle button on every dashboard). Internally this is the master-agent engine; user-facing it is always "Aven AI". Same scoped-per-role brain: full master agent for Owner/PM/Sales, read-only label-scoped for Client.

## Architecture (the key move)

**ONE role-parameterized rollup, ONE shared shell, FIVE role configs.** Not five separate dashboards.

- **`sbLoadHomeDashboard(role, userId, tenantId)`** — a single rollup that computes the full home payload server-side, role-scoped, in one round trip (home is the most-opened screen, every actor, every morning — it must be ONE fast read, not 8 scattered queries). Includes a master job-financials rollup feeding the KPI money tiles. Role decides which modules compute and at what data scope. Lean: JS helper first for fast iteration; convert heavy aggregates to a Postgres view/RPC later if speed needs it.
- **Shared shell** — header (logo, notification bell, role badge, avatar), card-based navy/gold layout, bottom nav with center Aven AI FAB. Built once.
- **Five role configs** — each role = a config of which modules render + the data scope. The five mocks (below) ARE the spec for these configs.

## The role-scope contract (CRITICAL — central, enforced at data layer)

The five dashboards collectively DEFINE the platform's role-scope boundary — what each role can see. This SAME contract is consumed by the Client chatbot (per ANTI_SURPRISE_ENGINE_ARC). Design it ONCE, central, enforced at the data layer — the out-of-scope data (e.g. company profit for a client/sub) must be OUT OF REACH, not hidden by UI or prompt. What each role sees:

- **Owner — "Run the Business":** full financials — pipeline value, open receivables, gross profit, collected MTD, revenue/profit charts, company health, AI business insights (over-budget jobs, estimates awaiting follow-up, division performance). FULL MONEY.
- **Project Manager — "Execute Projects":** active projects, tasks due today, inspections, customer issues, priority items (delays/permits/inspections w/ severity), active project cards with progress %/phase/next task. EXECUTION — no company-level money.
- **Sales Rep — "Close More Deals":** appointments, estimates sent, pending revenue, commission forecast, pipeline (lead→appt→estimate→negotiate→won w/ counts+values), AI sales insights, hot leads w/ close probability. SALES MONEY ONLY (their commission/pipeline, not company profit).
- **Subcontractor — "Get the Work Done":** today's jobs w/ time + scope + materials status, foreman/duration, large glove-friendly action tiles (Check In, Upload Photos, Request Change Order, Mark Complete, Submit Invoice). THEIR WORK ONLY — zero money beyond their own invoice. Jobsite-optimized, minimal nav.
- **Client Portal — "See Your Progress":** their project progress %, project timeline (contract signed→materials→installation→inspection→complete w/ dates), financial summary (THEIR contract amount / paid to date / remaining balance — the "labels"), PM contact card, photo gallery (before/current/completed), upcoming schedule. THEIR JOB, THEIR NUMBERS, NONE OF THE JUICE (no margin/cost/markup/sub payouts).

## Design direction

Aesthetic base: the "One Platform. Five Experiences." mock (calmer, cleaner whitespace, KPI numbers as heroes, subtle per-role accent tint — owner gold, PM blue, sales green, sub orange, client purple — without drowning the screen). PULL FROM the denser mock: the subcontractor's large glove-friendly action-tile treatment (Check In / Upload Photos / Request CO with foreman+materials+duration block) and the sales hot-lead energy (flame/hot framing, close-probability). Navy/gold/white, modern, high-contrast, card-based, rounded corners, built for speed + daily mobile use.

## Build sequencing

- **Owner dashboard first** — densest (most tiles, most data sources). If the rollup handles owner cleanly, the other four roles are subsets/configs of the same machine.
- Then PM, Sales, Sub, Client as role configs of the same rollup + shell.
- Most tiles bind to data that is SOLID TODAY (jobs, transactions, todos, draws, schedule). The "AI Insights / AI Lead Insights" cards bind to the proactive engine (ANTI_SURPRISE_ENGINE_ARC, mid-build) and ENRICH over time — dashboards render real data day one, AI cards deepen as the engine grows. NOT blocked by the keystone.
- Independent of the trade-dependency keystone (reads existing data). Can be built before or after it — momentum call.

## Downstream future arc — Marketing Intelligence (the flywheel payoff)

Once every role's data flows through one platform, the unified truth becomes fuel for a marketing-intelligence layer that ACTS on it: which job types / neighborhoods / price points are most profitable → advertise for more of those; where the best leads originate → concentrate ad spend there; which campaigns convert → double down. The dashboards DISPLAY the system running in unison; the marketing layer USES that aggregated data to decide where and how to advertise and grow the business. This is the full "run the business for you" model — not just showing the business, but directing its growth. Future arc, fueled by the data unification the dashboards prove. Captured here so the dashboard/rollup is built knowing this consumes its aggregated output downstream.

## Open questions (resolve at build time)

- Rollup as JS helper vs Postgres view/RPC — start JS, optimize later.
- Pipeline stage modeling — do lead/estimate/won states map cleanly to the pipeline visualization, or is a stage model needed first? Audit at build start.
- Where each tile's number actually comes from — opening audit must confirm a real, role-scoped source for every tile before binding (no assumed fields).
- "AI Insights" cards — which fire from the existing engine now vs. which wait for later proactive-layer phases.
