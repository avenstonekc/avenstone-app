# Avenstone — Product Vision

_Last reviewed: 2026-04-14_

This file is the long-horizon vision for where Avenstone is going beyond the current feature set. **It is not a commitment or a roadmap deadline.** It's a north star so every decision — docs, architecture, onboarding, which features to build next — is pulling in the same direction.

For current priorities and what's actively being built, see [Priority Order](../CLAUDE.md#priority-order-what-were-building) in CLAUDE.md.

---

## The vision in one paragraph

Avenstone starts as the field operations platform for Avenstone Contracting in KC, then becomes a multi-tenant SaaS that any contractor can buy. **LiDAR room scanning is the moat** — the feature that makes Avenstone a category leader instead of another CRM. Because LiDAR requires native Apple APIs (RoomPlan), the primary product is one native iOS app that every tenant uses. When a contractor logs in, the app re-skins to their brand inside — their company name, logo, colors, pricing — while the home-screen icon stays "Avenstone." That's the base tier: one native app, one App Store listing, unlimited tenants, full LiDAR access for everyone. A premium tier unlocks per-tenant branded native apps in the App Store (their logo on the phone's home screen, their company as publisher) via an automated Xcode build pipeline — priced at a significant upcharge because it's real engineering effort per tenant. A prospective contractor visits the marketing site, clicks "Want a demo?", talks to an AI that asks smart questions, uploads their logo, and in minutes has a working branded experience inside the Avenstone app — ready for their crew.

That's the endgame. Everything we build should shorten the distance to it.

---

## Phased path to get there

### Phase 1 — Single-tenant polish (now — Apr/May 2026)
Where we are today. Avenstone Contracting is tenant #1. Features getting shipped:
- Capacitor native app to TestFlight (top priority)
- LiDAR room scanning via Swift RoomPlan plugin
- AI estimator tuning against real KC pricing (already seeded)
- Field Agent voice interface polishing
- Whatever bugs surface during visual testing (logged in [bug-log.md](bug-log.md))

**Goal:** make Avenstone Contracting's own workflow bulletproof on their phones before selling to anyone else.

### Phase 2 — Multi-tenant on one native app (Summer 2026)
The base tier of the SaaS. One Avenstone app in the App Store, one Apple Developer account (yours), unlimited tenants. Every contractor downloads the same app, logs in, and the inside of the app re-skins to their brand. **Full LiDAR access for every tenant because they're all running the same native build.** The home-screen icon stays "Avenstone" — that's reserved for the premium tier.

- `tenant_settings` table: logo URL, brand colors, company name, default margins/markup/draw schedule, contact info
- Branding loader in App.jsx — on login, reads `tenant_settings` for the user's tenant and applies it globally (header logo, primary/accent colors, company name in every heading and email)
- Per-tenant email templates and PDF templates (proposals, contracts, invoices) that pull brand values from `tenant_settings`
- Web fallback at custom subdomain (`boston-plumbing.avenstone.app`) or fully custom domain (`app.bostonplumbing.com`) for anyone who wants to use the browser instead of installing the native app — PWA-enabled so it can "Add to Home Screen" as a lightweight fallback. LiDAR is NOT available on the web fallback (PWAs cannot reach Apple's RoomPlan API).
- First rough signup flow (even if it's manual for a few tenants)

**Goal:** prove a contractor in a different city can download the Avenstone app, log in, see their brand everywhere inside, scan a real room with LiDAR, and run their whole business on it — without any code being forked or rebuilt.

### Phase 3 — AI chat onboarding + automated tenant spin-up (Late 2026)
Replace manual setup with a working AI onboarding flow.

- Text-based AI chat that asks the right questions to populate `tenant_settings` + `ai_knowledge` for a new tenant
- Upload logo, brand colors, company info, trade specialties, pricing tier, draw schedule, CO policy, communication style
- Automated tenant creation: new tenant row, RLS policies verified, default data seeded, first user provisioned as `owner`
- Credentials + deep link sent via email/SMS within minutes — contractor installs the Avenstone app from the App Store, signs in, sees their brand
- Onboarding runbook ([onboard-tenant.md](onboard-tenant.md), to be written) becomes the source of truth for what the AI has to produce

**Goal:** a contractor goes from "never heard of Avenstone" to "has a branded experience inside the Avenstone app on their phone" in under 15 minutes, with zero human involvement from the Avenstone team.

### Phase 4 — Premium tier: per-tenant branded native app in the App Store (2027)
The "their logo IS the app on their home screen" phase. Priced as a major upcharge because it's real engineering effort per tenant.

- Each premium tenant enrolls their own Apple Developer account ($99/year, they pay Apple directly — required because Apple does not allow mass-cloned apps under one developer account)
- Automated Capacitor build pipeline: tenant info → auto-generated `capacitor.config.ts` → auto-generated Xcode project → auto-generated app icons → Xcode Cloud (or scripted MacInCloud) build → upload to tenant's App Store Connect
- Tenant hits "Submit for Review" in App Store Connect with one tap
- Apple reviews it as their app (Boston Plumbing's app, not Avenstone's) because they're the publisher
- **Capacitor Live Updates** (or CodePush) enabled so JS-only changes push instantly to installed apps without going through Apple Review — only native-layer changes (new permissions, new Swift plugins) require re-submission
- Same backend, same database, same AI — only the shell and branding change. Premium and base tenants are data-identical, they just experience the app through different wrappers.

**Goal:** a contractor can search the App Store for their company name, download THEIR app, and it works the same as Avenstone's does — but it's theirs. Priced to reflect the engineering lift and the branding moat it creates.

### Phase 5 — AI avatar onboarding (aspirational, 2027+)
The moment the prospect clicks "Want a demo?" and gets a real-person-feeling AI experience, not a text chat.

- Live video/voice AI avatar on a Zoom-style call
- Avatar listens to the contractor describe their business, asks follow-up questions, handles objections
- Uploads logo during the call ("can you drop your logo in the chat real quick?")
- Shows them their branded app being built in real time on a preview screen
- Ends the call with a download link and a walkthrough of their first job
- Tech stack will probably be a combination of a video-avatar service (Heygen / Synthesia / D-ID), streaming voice transcription (Whisper or similar), and Claude as the reasoning brain

**Goal:** the contractor literally forgets a human was never in the room. The sales experience BECOMES the product.

### Phase 6 — Contractor marketplace layer (far future)
Once enough contractor tenants are on the platform, homeowners can sign up directly, describe a project, and get matched with local contractors. GHL handles marketing today — this phase is when Avenstone itself becomes the lead-generation surface.

---

## Guiding principles for every decision

1. **Every tenant shares the same code.** No forks, no per-tenant branches, no special versions. If a contractor needs something, it becomes a config knob or a feature flag, not a code fork.
2. **Data is scoped by `tenant_id`, not by infrastructure.** One Supabase, one Vercel, one repo. Isolation happens via RLS, not by spinning up new databases.
3. **Brand customization lives in `tenant_settings`, not in code.** Logo, colors, company name, pricing defaults — all database-driven. Never hardcoded.
4. **Runbooks in git, data in Supabase.** Anything that describes how the system works → markdown file in `docs/`. Anything that varies per tenant → database row. Never mix the two.
5. **AI is the default interface in design.** Onboarding, estimating, consultation, PM alerts — every new feature should ask "how would this work if a voice/chat interface was the primary way to use it?" before adding more buttons. This is a DESIGN principle — see #8 for the PRICING principle.
6. **Apple is the hardest bottleneck for native distribution.** Native iOS comes first for LiDAR access; per-tenant branded native apps are a premium tier because each one requires its own Apple Developer account and automated build pipeline. The PWA path is a lightweight fallback, not the primary delivery.
7. **Every future tenant should benefit from every bug we fix today.** That's the entire reason [bug-log.md](bug-log.md) exists. Every documented fix is an insurance policy for the fork.
8. **AI is an optional LAYER on solid PM software, for pricing.** The underlying project management tool (jobs, clients, photos, contracts, payments, schedules, sub portal) works without AI. AI is premium value added on top. This widens the addressable market to contractors who want better PM software today but aren't ready for AI yet. See [pricing.md](pricing.md) for how this maps to tiers.
9. **Role-based free seats.** Crew, subs, and clients are always free. Only office users (owner, reps, PMs) count toward paid seat limits. This is the single biggest sales unlock — a 10-person GC can buy Starter for $199 because 7 of those seats are free. See [pricing.md](pricing.md) for the seat model.

---

## What this file is NOT

- Not a timeline or deadline — "Summer 2026" is directional, not a commitment
- Not a marketing doc — tone is honest and technical, not sales-y
- Not a feature spec — each phase has to be broken down into real tickets before it gets built
- Not immutable — if the vision changes, update this file. Add a `_Last reviewed:_` date when you do.

## When to update this file

- Any time the phased path shifts (you realize Phase 3 needs to come before Phase 2, etc.)
- Any time a new guiding principle emerges
- Any time a phase gets completed (mark it done, move the "now" pointer forward)
- At minimum: review every 90 days to keep it from becoming stale
