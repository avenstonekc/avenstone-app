# Material Selection Tool — Version Roadmap

The AI-powered material selection feature. Goal: replace in-person sales rep visits with a self-service AI-driven flow that produces a draft estimate and recap email automatically.

> **Status:** v1.0 in progress (April 2026)

---

## Architecture (locked)

**One backend, two front-ends.** Same `materials`, `job_selections`, `job_selection_stars` tables. Different chrome on top.

- **Client Mode** — primary build. Chat-driven, AI-led, self-service. Lives in the client portal.
- **Salesman Mode** — v2.0. Power-user catalog grid view of the same data. For reps doing custom selections or cleaning up after clients.

## Catalog strategy

- **v1:** Curated Home Depot + Lowes products. ~30-50 items across categories. Manual entry by Kalin into the admin screen. (Originally considered boutique showroom partners — DROPPED in favor of HD/Lowes.)
- **v2:** Add boutique / designer tier products
- **v3:** Vendor API integrations (Home Depot + Lowes affiliate links)
- **v4:** Drop-ship from select vendors with revenue share
- **v5:** Full marketplace, white-label SaaS to other contractors

## Voice / behavior rules (apply to all AI in this tool)

- Trusted advisor, never a fearmongering used-car salesman
- Smart-timing change orders only — "since the walls are open" framing, not "you might find disasters"
- Always says "we can't quote what we can't see" in some form
- Knows about home age + labor variance per product attribute (tile size affects labor, paint sheen affects labor, etc.)
- Never mentions Claude or Anthropic — it's the Avenstone material selection assistant

---

## v1.0 — Foundation (April 2026, in progress)

**Goal:** Skeleton chat UI + materials structure + clickable demo.

**In:**
- New screen `MaterialSelectionScr.jsx` (chat UI, message list, option cards, cart bottom sheet)
- Hardcoded scripted "AI" walkthrough — fake responses for testing the UX
- ~15 sample HD/Lowes materials hardcoded inline (tile, vanity, faucet, lighting, hardware, paint)
- Wired into client portal as a launch button
- Selections stored in component state only (no DB persistence yet)

**Out (deferred):**
- Real AI integration
- Materials table in Supabase
- DB persistence
- Renders, stars, allowance pivot, recap email, etc.

## v1.0.1 — Real DB
- SQL migration: `materials`, `job_selections`, `job_selection_stars`, `selection_sessions`
- Admin screen for Kalin to add/edit/photograph catalog items
- v1.0 selections start persisting to the DB

## v1.0.2 — Real AI
- New edge function `ai-selection` (similar to `ai-intake`)
- System prompt with all the voice/behavior rules above
- Reads `ai_knowledge` for company context
- Generates contextual reasoning per recommendation ("good pick because your home is from 1962…")
- Replaces the scripted v1.0 flow

## v1.0.3 — Visualization (still images)
- Edge function `ai-render` calling Replicate FLUX or Gemini Imagen for inpainting
- Takes scan photo + selected materials + room context, returns rendered image
- "Render in my room" button after each selection
- Stores renders in Supabase storage
- Shows in chat inline

## v1.1.0 — Star + allowance pivot
- `job_selection_stars` table active
- Star icon on every option card
- Persistent "Starred (N)" chip in chat
- Side-by-side compare view
- Allowance pivot triggered by:
  - 5+ stars without a final pick
  - 5 minutes in a category
  - 5 rounds of options shown without a pick
  - Explicit client request
- Selections gain `state` field: `placeholder` / `tentative` / `final`
- `labor_lock` JSONB on selections (size class, pattern, material type) so swap-later flows preserve labor estimates accurately
- Proactive labor delta warnings on swaps

## v1.2.0 — Recap email + draft estimate
- Recap email template with embedded renders, scope summary, selection sheet, "uncertain items" list, draft estimate range
- Triggers on session complete OR auto-save after 24h
- Draft estimate generated from `ai_knowledge` pricing rules + selected materials + scan dimensions
- Always a range, never a single number
- "We can't quote what we can't see" disclaimer always present
- Recipient: client (primary) + assigned rep (cc)

## v1.3.0 — Multi-channel finalization
- Auto-nudge logic for placeholders nearing order date
- Email/SMS to client with two paths:
  1. Continue online
  2. Book a video call with their rep (Cal.com — free open-source Calendly alternative, embeddable, white-labels cleanly)
- Cal.com self-hosted or cloud, embedded into Avenstone branding
- (Showroom partner option dropped — HD/Lowes catalog covers this need)

## v1.4.0 — Learning loop
- Feedback layer — every selection chat stored
- Thumbs up/down on AI responses
- Aggregated weekly: "what patterns are emerging?" → write to `ai_knowledge`
- Change order data fed back as training material

## v2.0 — Salesman Mode
- Catalog grid view of `materials` table
- Filter sidebar
- Manual override pricing
- Custom item entry
- View client's chat history
- Edit/override client selections

## v3.0 — Vendor APIs
- Home Depot affiliate links (HD has affiliate program through Impact / CJ)
- Lowes affiliate links (similar)
- Earn 2-5% commission on referred sales
- "Buy direct" buttons in selection cards alongside "Have Avenstone source it"
- No fulfillment, just commission

## v4.0+ — Marketplace
- Direct drop-ship vendor partnerships
- Avenstone takes spread
- Returns / replacements management
- Vendor portal

## v5.0 — SaaS
- White-label the whole stack
- Other contractors subscribe (~$200/mo target)
- Per-contractor catalog, branding, vendor relationships
- This is the exit

---

## Decisions captured (so we don't re-debate them)

- **Audience:** Clients who don't want a sales rep at their house. Self-service is the goal, not the fallback.
- **Outcome:** Client gets a draft estimate + recap email automatically when they finish, before they close the browser.
- **Catalog tier:** Mix of mid-tier mainstream + a designer tier (option C from the catalog vibe question)
- **Timing:** Selection session offered inline right after intake, with email fallback if they bounce
- **Budget anchoring:** Soft anchor — show items above budget with warnings, let them choose
- **Sales rep assignment:** Always Kalin for now
- **"I don't know" loop:** Chat keeps going, AI logs the question, Kalin's reply gets sent to client async
- **Estimate format:** Always a range, never a single number
- **Decision count per project:** Varies by project type (~7 for bath, ~12 for kitchen)
- **Star feature:** Yes, every category, every card
- **Allowance pivot:** Yes, with labor-lock attributes (not just dollar amount)
- **Allowance trigger:** 5 minutes OR 5 rounds (~15 options) OR explicit request, whichever first
