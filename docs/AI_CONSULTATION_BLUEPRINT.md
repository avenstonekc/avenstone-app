# AI Consultation & Estimating Feature — Full Blueprint

**Status:** Spec complete, ready to build in native app  
**Priority:** High — core differentiator  
**Depends on:** Supabase backend (shared with HTML app), native mobile app scaffolding

---

## The Vision

A field rep walks into a client's home. They hit **Start Session**. The app listens to the entire consultation — capturing client concerns, scope hints, risk flags — silently in the background. When it's time to measure, they say **"Avenstone, measure"** and the app switches to active mode, walking them through trade-by-trade data collection conversationally. When they're done, one tap generates a full estimate with base price + OH SHIT moments priced out. Rep reviews, hits Send Proposal, client signs on the spot.

**The rep never leaves without a decision.**

---

## Three Modes

### Mode 1 — Ambient Listen (passive)
- Runs in background from "Start Session"
- Captures everything said in the room
- AI silently flags: client concerns, scope hints, budget signals, risk factors
- No interaction needed from rep
- Saves full transcript + extracted insights to job record

### Mode 2 — Active Measure (triggered by wake word)
- Wake word: **"Avenstone, measure"**
- App switches to foreground, active mic
- Conversational back-and-forth per trade
- AI asks the right questions, rep answers
- Structured data locked in per trade as they go
- Rep can say "next trade" to move on
- Say "Avenstone, done" to close measure session

### Mode 3 — Generate Estimate (one tap)
- Pulls all structured measurement data from session
- Builds AI prompt automatically from field values
- Returns: base scope by trade + OH SHIT moments with pricing
- Rep reviews, edits if needed, sends proposal

---

## Wake Word

**Provider:** Picovoice Porcupine  
**Wake phrases:**
- `"Avenstone start"` → triggers Mode 1 (ambient listening begins, rep just walked in)
- `"Avenstone note"` → saves a quick spoken note to transcript without interrupting flow
- `"Avenstone measure"` → triggers Mode 2 (active measure, AI begins trade-by-trade questioning)
- `"Avenstone done"` → closes active measure session, moves to estimate generation

**Why Porcupine:**
- Runs fully on-device (no internet needed)
- 97%+ accuracy, <1 false alarm per 10 hours
- Near-zero battery overhead
- React Native SDK available
- Custom wake word trained in their console in seconds

---

## Audio Capture

### Phone mic (quiet homes)
- Adequate for quiet residential environments
- 75-85% STT accuracy
- No extra hardware needed

### Plaud NotePin ($149, recommended for reps)
- Wearable magnetic clip
- 4 MEMS mics, 16-foot effective range
- Works in noisy environments
- Connects via Bluetooth to phone app
- One-time hardware cost per rep

### Architecture
- Audio captured in 5-10 second chunks
- Opus compressed (~10MB/hour)
- Streamed to STT API in real-time
- Partial transcripts returned word-by-word

---

## Speech-to-Text

**Primary:** Deepgram Nova-3 Streaming  
**Fallback:** AssemblyAI Universal-Streaming  

| | Deepgram Nova-3 | AssemblyAI |
|---|---|---|
| Latency | <300ms | ~300ms |
| Cost/hour | $0.46 | $0.15 |
| Accuracy | ~92% | ~90% |
| Diarization | Yes (paid add-on) | Yes (paid add-on) |

**Speaker diarization:** On — know who said what (rep vs. client)

---

## AI Extraction (Ambient Mode)

During passive listening, every 60 seconds send the rolling transcript to Claude with this system prompt:

```
You are an AI assistant listening to a sales consultation between a contractor rep 
and a homeowner. Extract and return JSON with:
{
  "client_concerns": [],        // things the client mentioned worrying about
  "scope_hints": [],            // project details mentioned (rooms, materials, etc.)
  "budget_signals": "",         // any budget mentioned or implied
  "decision_makers": [],        // who is making the decision
  "timeline": "",               // when they want work done
  "risk_flags": [],             // things that could be OH SHIT moments
  "action_items": []            // anything rep should follow up on
}
Only include fields where you have actual evidence from the transcript.
```

This runs silently. Rep sees nothing. Data accumulates on the job record.

---

## Active Measure — Conversational AI

When rep says "Avenstone, measure" the AI takes over as a guided interviewer.

### Opening prompt sent to AI:
```
You are Avenstone, an AI estimating assistant for a construction contractor. 
The rep is about to measure a job on-site. Your job is to collect all measurements 
needed to build an accurate estimate.

Start by asking what trades are involved. Then work through each trade one at a time,
asking only the questions needed for that trade. Be conversational, fast, and professional.
When you have enough data for a trade, summarize what you captured and ask if it's correct
before moving on.

Known job context: {job.address}, {job.description}, {ambient_extraction_summary}

Respond with your first question now.
```

### Trade question sets (AI guided, not hardcoded):
The AI knows what questions to ask per trade. It adapts based on answers. Examples:

**Tile**
- Room dimensions (L × W)
- Ceiling height
- Tile size
- Demo existing tile?
- Heated floor?
- Shower niche / bench?
- Grout color preference

**Framing**
- Linear feet of new walls
- Starting from concrete or existing subfloor?
- Soffits / bulkheads for mechanicals?
- Any load-bearing walls involved?
- Ceiling height

**Electrical**
- Panel upgrade needed?
- Number of new circuits
- Recessed lights (count)
- Outlets (count)
- Any dedicated circuits (appliances, HVAC)
- EV charger?

**Drywall**
- Total square footage
- Ceiling included?
- Level 5 finish needed?
- Any curved walls or specialty work?

**Paint**
- Total square footage (walls + ceiling separate)
- Number of coats
- Trim included (linear feet)
- Cabinet painting? (door/drawer count)
- Prep work needed (patch, sand, prime)

*(AI handles any trade — these are examples. The system prompt gives it the framework.)*

---

## OH SHIT Moments

After all trades are measured, AI reviews the full session and flags potential change orders with pricing:

```
Based on the job description and measurements collected, identify the top 3-5 
"OH SHIT moments" — unexpected conditions that commonly occur in this type of job 
that would result in a change order. For each one provide:
{
  "condition": "description of what might be found",
  "likelihood": "low|medium|high",
  "estimated_cost": "$X,XXX - $X,XXX",
  "how_to_present": "one sentence explaining this to the homeowner"
}
```

These get presented to the homeowner during the proposal review as optional line items. Client feels informed. Rep is protected. Change orders stop being surprises.

---

## Enhancements — Making It Perfect

### 1. Pre-Consult Brief (earpiece whisper on "Avenstone start")
Before ambient mode begins, AI delivers a 10-second briefing in the rep's ear:
```
"You're at 123 Main St — Johnson bathroom remodel.
Client mentioned $15k budget in the inquiry.
Watch for: 1960s home, possible cast iron drain lines.
One other contractor is bidding. Good luck."
```
Data pulled from: job record, GHL deal notes, ambient extraction from any prior sessions, home age from address lookup.
Rep walks in already armed. No prep needed.

### 2. Confidence Scoring Per Trade
After the measure session closes, AI rates each trade on data completeness:
```
Tile:        94% — all fields captured ✓
Electrical:  71% — panel location not confirmed ⚠
Paint:       55% — missing ceiling height ⚠
```
Anything under 80% is flagged. Rep must resolve before leaving or the estimate won't generate. Prevents the "I forgot to measure that" callback.

### 3. Client Sentiment Tracking
AI monitors emotional signals throughout the consultation and builds a sentiment profile:
- Hesitation words: "I don't know", "maybe", "we'll see" → budget anxiety or decision delay
- Excitement signals: "yes definitely", "we love that" → strong buying intent
- Budget anxiety: "that sounds expensive" → price sensitivity flag
- Decision delay: "I want to think about it" → multiple decision makers likely

Post-session summary includes:
```
Client Sentiment: Excited about tile concept, hesitant on budget.
Recommendation: Lead proposal with the shower transformation visual.
Address cost last. Offer a payment plan option.
```

### 4. Competitive Intel Capture
If client mentions another contractor during the consultation — "we had someone else look at it", "the other guy said..." — AI flags it silently with a badge on the session summary.

Rep knows they're in a competitive bid before they leave. Can adjust close strategy accordingly.

### 5. Photo Prompts During Measure
As AI moves through each trade, it prompts the rep to capture evidence:
```
AI: "Framing — take a photo of the existing wall condition before we move on."
AI: "Electrical — snap the panel so we have it for the electrician."
AI: "Tile — photo of the current floor and shower so the client can see the before."
```
Photos are auto-tagged to the correct trade in the job record. No organizing later. The before photos also become marketing assets for the after reveal.

### 6. Post-Session Debrief (30 seconds, on "Avenstone done")
Immediately after closing the measure session, a clean summary screen appears:
```
SESSION COMPLETE
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Trades measured:  Tile ✓  Electrical ✓  Drywall ✓  Paint ✓
Confidence:       All above 80% ✓
Client sentiment: Positive — motivated buyer
Competitive:      Yes — 1 other contractor bidding
OH SHIT moments:  3 flagged ($4,200–$7,800 risk range)
Recommendation:   Send proposal today. Don't let them sleep on it.
━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Generate Estimate]   [Review Notes]   [Send Proposal]
```
Rep makes a go/no-go decision on the spot. One tap to close.

### 7. Learning Over Time (the real moat)
Every completed job feeds back into the system:
- Was an OH SHIT moment flagged → did it actually occur? (rep confirms post-job)
- Estimate was $18k → actual came in at $21k → which trade was off and by how much?
- Which OH SHIT moments happen most often per trade per market?
- Which trades are consistently under-estimated?
- Which reps close higher? What's different about their consultations?

After 50 jobs the AI knows your market better than any estimating book.
After 200 jobs it's a competitive weapon nobody can buy off the shelf.
After 500 jobs it's the product you license to every contractor in the country.

This data layer is the moat. Protect it. Every session that runs makes the next estimate more accurate.

---

## Supabase Schema

### New tables needed:

```sql
-- consultation_sessions
CREATE TABLE consultation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT get_my_tenant_id(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  started_by UUID REFERENCES profiles(id),
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  raw_transcript TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','processing','complete','failed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- consultation_extractions (ambient listening output)
CREATE TABLE consultation_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES consultation_sessions(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL DEFAULT get_my_tenant_id(),
  client_concerns TEXT[],
  scope_hints TEXT[],
  budget_signals TEXT,
  decision_makers TEXT[],
  timeline TEXT,
  risk_flags TEXT[],
  action_items TEXT[],
  extracted_at TIMESTAMPTZ DEFAULT now()
);

-- consultation_measurements (active measure output, per trade)
CREATE TABLE consultation_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES consultation_sessions(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL DEFAULT get_my_tenant_id(),
  trade TEXT NOT NULL,
  fields JSONB NOT NULL DEFAULT '{}',
  confirmed_by_rep BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- oh_shit_moments
CREATE TABLE oh_shit_moments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES consultation_sessions(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL DEFAULT get_my_tenant_id(),
  condition TEXT NOT NULL,
  likelihood TEXT CHECK (likelihood IN ('low','medium','high')),
  estimated_cost_low NUMERIC,
  estimated_cost_high NUMERIC,
  how_to_present TEXT,
  included_in_proposal BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### RLS policies:
- All tables: `tenant_id = get_my_tenant_id()`
- Sub role: no access to consultation tables
- Client role: no access to consultation tables
- Sales rep: SELECT/INSERT/UPDATE own sessions only
- PM/Owner: full access

---

## Edge Functions Needed

### `process-transcript`
- Input: `{ session_id, transcript_chunk, mode: 'ambient'|'measure' }`
- Runs Claude extraction prompt
- Updates `consultation_extractions` or `consultation_measurements`
- Returns structured JSON

### `generate-estimate-from-session`
- Input: `{ session_id, job_id }`
- Pulls all measurements from `consultation_measurements`
- Builds trade-by-trade AI prompt
- Runs OH SHIT moment analysis
- Returns full estimate + oh shit moments
- Saves to `job_estimates` + `oh_shit_moments`

---

## Native App UI Flow

```
Job Detail Screen
└── [Start Session] button

  → Session active indicator (subtle, always visible)
  → Ambient listening running in background
  
  → Rep talks to client normally for 20-30 min

  → Rep says "Avenstone, measure"
  
    → Measure screen slides up
    → AI: "What trades are we looking at today?"
    → Rep: "Framing, electrical, drywall, paint"
    → AI works through each trade conversationally
    → Progress indicator shows trades: ✓ Framing ✓ Electrical ... Drywall ... Paint
    
  → Rep says "Avenstone, done"
  
    → Summary screen: all measurements captured
    → [Generate Estimate] button
    
  → Estimate screen
    → Base scope by trade with line items
    → OH SHIT Moments section (toggle to include in proposal)
    → [Review] → [Send Proposal] → client signs on screen
```

---

## Cost Per Rep Per Month

| Component | Cost |
|---|---|
| Deepgram Nova-3 (6 hrs/day × 22 days) | ~$61 |
| Claude Haiku (extractions + estimate gen) | ~$5 |
| Porcupine wake word (amortized) | ~$10 |
| **Total** | **~$76/rep/month** |

At $149/month subscription per rep → healthy margin.  
Use AssemblyAI instead of Deepgram → drops to ~$35/rep/month.

---

## Build Order

1. **Supabase schema** — create all 4 tables + RLS + edge functions
2. **Wake word** — integrate Porcupine, test "Avenstone measure" detection
3. **Audio capture** — phone mic → Deepgram streaming → rolling transcript
4. **Ambient extraction** — 60s chunk → Claude → save to consultation_extractions
5. **Active measure UI** — conversational screen, trade progress tracker
6. **Measure AI loop** — rep answers → Claude asks next question → repeat
7. **OH SHIT generation** — end of session analysis
8. **Estimate assembly** — pull measurements → build prompt → generate
9. **Proposal flow** — connect to existing contract/signature system
10. **Plaud NotePin integration** — Bluetooth audio source option

---

## Notes for Native Dev (Claude CMD)

- Supabase project ref: `cbfftukmhqvvjlrlnltk`
- All auth/RLS already set up — just add the new tables
- Existing `jobs` table is the anchor — all new tables FK to `job_id`
- Edge functions deploy via Supabase dashboard or CLI
- Wake word runs on-device — never hits the network
- All AI calls go through edge functions — API keys never in client
- The HTML app has the full business logic as reference — read `index.html` to understand job flow, statuses, roles
- Full test suite in `tests/portals-e2e.spec.js` — 123 tests — use as acceptance criteria for native feature parity

---

## LiDAR Room Scanning — Phase 2 (iOS Native Upgrade)

### How it works
iPhone 12 Pro and newer have a LiDAR sensor built in. Apple's RoomPlan API (free, built into iOS) scans a room in 60 seconds and outputs:
- Room dimensions (length, width, height)
- Wall positions and lengths
- Door and window locations and sizes
- Detected objects (cabinets, bathtub, toilet, bed, etc.)
- All as structured JSON data

This replaces the manual measure conversation entirely for LiDAR-capable devices. Confidence score: 99%.

### Why it's not blocking current development
The Vite app CMD is building is a web app. LiDAR is a native iOS hardware feature. Web browsers cannot access LiDAR directly — this is an Apple restriction.

**The fix is Capacitor — not a rebuild.**

### What Capacitor does
Capacitor is a thin native shell that wraps the existing Vite app and turns it into a real iOS/Android app — no code changes to the Vite app required. Once wrapped, the app can access all native hardware: LiDAR, microphone (needed for AI consultation mic feature), camera, push notifications, GPS.

```
Vite app (unchanged)
+ Capacitor shell (thin wrapper, one afternoon to add)
= Real iOS/Android app in the App Store
  with full native hardware access
```

### Build order
1. CMD builds Vite app — correct, keep going, nothing changes
2. When ready for App Store → add Capacitor wrapper (1 afternoon)
3. Write Swift RoomPlan plugin (~300 lines) that exposes scan data to Vite app
4. Vite app receives structured room JSON → auto-populates all measure fields → instant estimate

### The customer self-serve flow (post-LiDAR)
```
Homeowner opens app
→ "Scan your bathroom" 
→ 60 second phone scan
→ All measurements captured automatically
→ Pick tile/fixtures from catalog (AR overlay on their actual floor)
→ See 3D render of finished space before signing
→ Instant quote generated
→ Sign on the spot
→ Contractor shows up to a sold job
```

### For rep on-site (post-LiDAR)
```
Rep says "Avenstone start" → ambient listening begins
Rep scans room → LiDAR populates all measurements automatically
"Avenstone measure" conversation = optional cleanup only
Rep says "Avenstone done" → full estimate ready
Client signs before rep leaves
```

### Android
No LiDAR equivalent yet. Google ARCore is close but not as accurate.
Fallback: manual measure conversation mode (already designed) handles all Android devices.
iOS first — Android LiDAR coming within 12-18 months.

### AR Finish Picker
Apple RealityKit (same SDK as RoomPlan) handles AR overlays.
Customer taps a tile in the catalog → renders on their actual floor in real time.
Emotional buy-in before a dollar is spent. This is the close accelerator.

Partners/APIs for finish catalogs:
- Wayfair API — fixtures, vanities, flooring
- Dal-Tile / MSI / Florida Tile — tile manufacturer APIs
- Sherwin-Williams ColorSnap API — paint colors with AR preview

### Tech stack for LiDAR feature
- RoomPlan API (Apple, free, Swift only)
- Capacitor iOS plugin bridge (Swift → JS)
- RealityKit for AR overlays (Apple, free)
- Existing Supabase backend — scan data saves to `consultation_measurements` table
- Existing estimate engine — consumes the structured scan data identically to manual measure

---

## Client Self-Serve Portal — Full Spec

### The Vision
A homeowner opens the Avenstone client portal, talks to an AI, scans their rooms, picks their finishes in AR, sees the full quote including pre-priced change order risks, and signs — all before a contractor ever sets foot in their home. Rep gets a notification: "New signed job. No visit required."

### What Already Exists (HTML app)
- Client portal login via magic link
- View job status, documents, photos
- Messages thread with rep
- Sign contracts
- View and approve change orders
- View payment requests

### What Gets Added for Self-Serve

#### Step 1 — Project Discovery (AI Voice)
Client opens portal, taps "Get a Quote."
AI voice agent greets them conversationally:

```
"Hi! I'm Avenstone's AI assistant. I'm going to help you 
get an accurate quote for your project in about 10 minutes.

First — tell me a little about what you're looking to do."
```

AI listens, extracts:
- Project type (bathroom, kitchen, basement, etc.)
- Scope hints (full remodel vs. partial)
- Timeline ("we want it done before the holidays")
- Budget signals ("we don't want to go crazy")
- Decision makers ("I need to check with my husband")

All saved to `consultation_extractions` on a new client-initiated session.

#### Step 2 — Room Scanning (LiDAR)
```
AI: "Great — let's get your measurements. 
Open your camera and slowly pan around 
the bathroom. I'll take it from there."
```

RoomPlan scans the room. Structured data returned:
- Dimensions, wall lengths, ceiling height
- Door/window positions
- Detected fixtures (toilet, vanity, tub/shower)

All fields auto-populated. No tape measure. No estimator needed.

Fallback for non-LiDAR devices:
```
AI guides them through manual entry:
"What's the approximate length of the longest wall?"
"About how high are your ceilings?"
```
Conversational, friendly, takes 3-4 minutes.

#### Step 3 — Finish Selection (AR Picker)
For each surface detected, AI presents options:

```
AI: "Let's pick your floor tile. 
Here are some popular options in your style range."
```

Client taps a tile → AR overlay renders it on their actual floor via RealityKit.
They see their finished room before signing anything.

Selections saved per trade:
- Floor tile (style, size, color)
- Wall tile
- Fixtures (toilet, vanity, faucets)
- Paint colors
- Flooring type

Catalog sources:
- Wayfair API — fixtures and vanities
- Dal-Tile / MSI API — tile selections
- Sherwin-Williams ColorSnap API — paint with AR preview

#### Step 4 — Quote Generation
AI assembles all scan data + finish selections into the estimate engine:

```
BASE QUOTE
━━━━━━━━━━━━━━━━━━━━━━━━
Demo & Prep          $1,200
Tile (floor + walls) $4,800
Plumbing             $2,400
Vanity + fixtures    $1,900
Paint                $600
Labor                $3,800
━━━━━━━━━━━━━━━━━━━━━━━━
Total                $14,700
```

Presented cleanly, line by line, with photos of selected finishes.

#### Step 5 — Pre-Authorized Change Orders (THE KEY FEATURE)
Before the client ever signs, AI walks them through the OH SHIT moments:

```
AI: "Before we finalize — I want to be upfront 
about a few things we sometimes find in homes 
like yours. These don't always happen, but I'd 
rather you know the cost upfront than be 
surprised later."

─────────────────────────────────────────
⚠ Old drain lines (cast iron)
  Likelihood: Medium
  If found: We replace with PVC
  Cost if occurs: $800 – $1,400
  
  [ ] I understand — authorize if found

─────────────────────────────────────────
⚠ Mold behind existing tile
  Likelihood: Low  
  If found: Remediation required before tile
  Cost if occurs: $600 – $2,200

  [ ] I understand — authorize if found

─────────────────────────────────────────
⚠ Subfloor damage
  Likelihood: Low
  If found: Repair before new tile
  Cost if occurs: $400 – $900

  [ ] I understand — authorize if found
─────────────────────────────────────────
```

Client checks the boxes they want to pre-authorize.
These become pre-signed change orders — no conversation needed if they occur.
Contractor shows up, finds the issue, takes a photo, marks it as occurred.
Client gets notified automatically. Payment adjusted. Done.

**This eliminates the #1 source of contractor-client conflict.**

#### Step 6 — Contract & Signature
Full proposal generated with:
- Itemized scope
- Selected finishes with photos
- Pre-authorized change order conditions
- Payment schedule
- Timeline estimate

Client signs with finger on screen.
Job auto-created in Avenstone with status `signed`.
Rep and PM notified immediately.

#### Step 7 — Rep Notification
```
🔔 New Signed Job — No Visit Required

Client: Sarah Johnson
Address: 4521 Oak St, Kansas City MO
Project: Master bathroom remodel
Signed contract: $14,700
Pre-authorized COs: up to $4,500
Start date requested: 3 weeks out

[View Job]  [Call Client]  [Schedule Demo]
```

Rep's only job now: schedule the demo day and show up.

---

### New Supabase Tables Needed

```sql
-- client_quote_sessions (self-serve version of consultation_sessions)
CREATE TABLE client_quote_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL DEFAULT get_my_tenant_id(),
  client_user_id UUID REFERENCES auth.users(id),
  client_email TEXT,
  job_id UUID REFERENCES jobs(id),
  status TEXT DEFAULT 'in_progress' 
    CHECK (status IN ('in_progress','quoted','signed','abandoned')),
  project_description TEXT,
  rooms_scanned JSONB DEFAULT '[]',
  finish_selections JSONB DEFAULT '{}',
  budget_signal TEXT,
  timeline TEXT,
  decision_makers TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- pre_authorized_change_orders
CREATE TABLE pre_authorized_change_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL DEFAULT get_my_tenant_id(),
  condition TEXT NOT NULL,
  likelihood TEXT CHECK (likelihood IN ('low','medium','high')),
  cost_low NUMERIC,
  cost_high NUMERIC,
  authorized_by_client BOOLEAN DEFAULT false,
  authorized_at TIMESTAMPTZ,
  occurred BOOLEAN DEFAULT false,
  occurred_confirmed_at TIMESTAMPTZ,
  photo_url TEXT,
  actual_cost NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### RLS Policies
- `client_quote_sessions` — client can SELECT/INSERT/UPDATE their own sessions only
- `pre_authorized_change_orders` — client SELECT own job's COs; PM/owner full access; sub no access

### New Edge Functions
- `generate-client-quote` — takes session_id, runs estimate engine, returns full quote
- `create-job-from-quote` — converts signed client session into a full job record, notifies rep

### UI Flow Summary
```
Client Portal
└── [Get a Quote] ← new button on dashboard

  → AI Voice Discovery (2-3 min)
  → LiDAR Scan or Manual Measure (1-5 min)
  → AR Finish Picker (3-5 min)
  → Quote Review
  → Pre-Authorized COs (checkboxes)
  → Sign Contract
  → Done — job created, rep notified
```

### What This Does to the Business
- Reps close jobs they never visited
- Average sales cycle: days → hours
- No more "I'll think about it" — they're already bought in emotionally from the AR preview
- No surprise change orders — pre-authorized upfront
- Scales without adding headcount
- Every self-serve job trains the AI to get better estimates next time
