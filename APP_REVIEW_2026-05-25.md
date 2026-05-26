# App Review — 2026-05-25

Working doc. Findings from a structural audit of the codebase. Not a TODO list, not a frozen roadmap. Kalin reviews each item, marks status, and we attack what survives the debate.

Status legend:
- 🟢 AGREED — action queued
- 🟡 DEBATE — needs discussion, partial agreement
- 🔴 REJECTED — disagreed with the framing
- ⚪ UNREVIEWED — Kalin hasn't decided yet

All items start ⚪ UNREVIEWED. Update by editing this file.

---

## Structural problems

### S1. `supabase.js` is 3558 lines with 262 exports
Status: ⚪ UNREVIEWED

Single god-file holds every db helper for every screen. Loading the file = loading the whole app's data layer mental model. Field-Opus reads it whole every relevant dispatch, burning tokens.

**Proposed fix:** split by domain into `lib/db/jobs.js`, `lib/db/schedule.js`, `lib/db/contacts.js`, etc. Re-export from a barrel `lib/db/index.js` so call sites don't change. ~3 prompts. Pure refactor, zero behavior change.

**Counter-arguments worth considering:**
- Splits add import ceremony for every new helper
- Co-location of related helpers (e.g. jobs + jobs_metadata + jobs_lookups) is sometimes the right call
- Splitting might surface circular deps that the god-file hides

---

### S2. App.jsx imports 20+ screens eagerly
Status: ⚪ UNREVIEWED

Every page load pulls in code for screens user will never visit this session. Mobile users on bad signal pay for this.

**Proposed fix:** lazy-load route components via `React.lazy()`. 1 prompt.

**Counter-arguments:** Adds Suspense boundaries + loading states everywhere. Subtle bug surface (lazy bundle fails to load, screen never renders). May not be worth it until bundle gets noticeably big.

---

### S3. 15 component subfolders with overlapping concerns
Status: ⚪ UNREVIEWED

`shared`, `common`, `modals` are all "stuff used in multiple places." `dashboard`, `home`, `owner` overlap. `client`, `sub`, `public`, `owner` are all user-type-specific portals.

**Proposed fix:** rationalize to `screens/`, `widgets/`, `panels/`, `portals/`. 1-2 prompts.

**Counter-arguments:** Big find-and-replace risk. Touches every import in the app. High blast radius for a cosmetic improvement.

---

### S4. URL state vs React state
Status: ⚪ UNREVIEWED

CLAUDE_MEMORY explicitly flags this: "URL-based routing (`selJ` is React state — no deep-link, refresh loses position)."

**Why this matters:**
- Can't deep-link to a job
- Pull-to-refresh on iOS loses your spot
- Push notifications land on home screen instead of the relevant entity
- Sharing a link to a job/event/todo doesn't work

**Proposed fix:** small home-grown URL→state sync (the LiDAR scanner already does this for ?scan=). React Router is overkill. ~2 prompts.

---

## Built-but-not-wired (Schrödinger's components)

### B1. MaterialSelectionScr.jsx
Status: ⚪ UNREVIEWED

CLAUDE_MEMORY locked principle 7 flags this as built but not wired. Has "outstanding design decisions before rewiring."

**Decision needed:** wire or rip. Half-built code rots and confuses every Sonnet read of the codebase.

---

### B2. FloorPlanEditor.jsx
Status: ⚪ UNREVIEWED

Same as B1 — built, not wired, outstanding design decisions.

**Decision needed:** wire or rip. Note: if rip, it interacts with FLOOR_PLAN_LAYOUT_ARC — that arc may want to consume parts of it.

---

## Get rid of?

### G1. Vestigial nav items
Status: ⚪ UNREVIEWED

Today's nav compression reduced bot-nav from 6→4. Sidebar nav still has items like Agent (field-agent) that aren't in bot-nav. "Available but inconsistently surfaced" is worst case.

**Audit needed:** every nav surface (bot-nav, sidebar, side menu, FAB). Decide: prominent, hidden, or removed.

---

### G2. AI screens — is AiKnowledgeScr still in active use?
Status: ⚪ UNREVIEWED

Already deleted AiHomeScr + TodayScr today. AiKnowledgeScr — when was the last open? If not active, archive it.

**Also:** `ai-home-companion` edge function is officially orphaned per CLAUDE_MEMORY LOG ("no callers"). Delete the edge fn.

---

### G3. Field-Opus thread bloat over time
Status: ⚪ UNREVIEWED

Every dispatch writes an auto-reflection trigger + Opus summary. After 100 dispatches the thread becomes unreadable.

**Proposed fix:** auto-archive thread messages older than N days OR add a "clear old messages" verb. Not blocking yet, but accumulating.

---

### G4. Three triggers on `notifications` table
Status: ⚪ UNREVIEWED

`trg_notification_push_fanout`, `on_notification_insert_push`, `on_notification_insert_sms`. Latter two are Dashboard-created and "not in local migration files." CLAUDE_MEMORY flagged for audit.

**Decision needed:** find out what the Dashboard triggers do. Move to migration files OR kill if stale. Triggers you don't understand are landmines.

---

## Improvements

### I1. Mobile-first audit (MOBILE_AUDIT_ARC)
Status: ⚪ UNREVIEWED

Already in future-arcs list. Walkthrough mode is mobile-first; rest of app is desktop-first per CLAUDE_MEMORY. Today's session fixed safe-area-inset bugs reactively (DEV button, X button on AiIntakeWizard). Doing this systematically once is way cheaper than reactively forever.

**Proposed:** 3-4 prompts.

---

### I2. Deep-link push notifications properly
Status: ⚪ UNREVIEWED

Phase 6c known limitation: dispatch pushes deep-link to todos because they piggyback `todo_delegated` type. Should land users where the notification is actually about.

**Dependency:** S4 (URL routing). 1 prompt once routing exists.

---

### I3. Realtime where there's collaboration
Status: ⚪ UNREVIEWED

You shipped realtime for Field-Opus + dispatch_queue. Jobs, schedule_items, todos, notes — these should push live updates to other open sessions too. Currently only Field-Opus tables are in `supabase_realtime` publication.

**Proposed:** audit which tables benefit from realtime + migration to add them. 1 prompt.

---

### I4. Test runner (Vitest)
Status: ⚪ UNREVIEWED

No test framework in package.json. Ship-by-build-and-smoke is brave for a 3558-line supabase.js. **Don't backfill** — just start adding tests for new modules going forward (FLOOR_PLAN_LAYOUT_ARC Phase 1's normalize.js is a perfect candidate).

**Proposed:** 1 prompt to wire Vitest + a starter test for normalize.js.

---

### I5. Close AUTO_FIX_ARC (Phases D, E, F)
Status: ⚪ UNREVIEWED

Phase D: Vercel build polling + revert logic. Phase E: TodoCard wiring for auto-fix status. Phase F: auto_fix_attempts admin view in BugReportsScr.

**Risk:** auto-fix is shipping bugs into production without these. Half-built feature with live consequences.

**Proposed:** ~4 prompts.

---

### I6. Refine tool-payload drift detector (Path B)
Status: ⚪ UNREVIEWED

Drift detector shipped 2026-05-21 with 14 expected false positives. When a real bug surfaces it'll hide in the noise. CLAUDE_MEMORY says fix before next major schema churn.

**Proposed:** 1-2 prompts.

---

## What's good (don't touch)

- Anti-Surprise Engine framing is consistent — every locked principle traces to it
- Two-file memory split (CLAUDE_MEMORY + CLAUDE_ARCHIVE) is working
- OPUS_RULES enforced and Field-Opus respects it (mostly — see hallucination bug today)
- Push notification stack landed clean today (PUSH_NOTIFICATIONS_ARC v1)
- Master Agent tool architecture is solid — 17 tools, 6 CONFIRM_TOOLS
- Multi-tenant from day one — RLS everywhere. Pays off at v4 white-label

---

## Suggested priority (Claude's recommendation — debatable)

1. Mobile-first audit (I1) — you're always on your phone
2. URL routing (S4) — unblocks several other items
3. Split supabase.js (S1) — permanent productivity unlock
4. Decide on built-but-not-wired (B1, B2)
5. Audit Dashboard triggers + realtime (G4 + I3)
6. Close AUTO_FIX_ARC (I5)
7. Vitest (I4)
8. SCHEDULING_INTELLIGENCE_ARC (separate arc — moat work)

---

## Items Kalin pushed back on or felt were missing

*Use this section to capture disagreement or additions during the debate.*

- (placeholder — fill in during review)

---

## Items intentionally NOT in this review

Things that came up today but were already on the backlog or in flight:
- FLOOR_PLAN_LAYOUT_ARC (Phase 1 shipped today; full arc in its own MD)
- SCHEDULING_INTELLIGENCE_ARC (its own MD, blueprint about to ship)
- CALENDAR_ARC Phase 2 — Google Calendar sync (its own backlog entry)
- SUB_WORKFLOW_ARC, VOICE_AGENT_ARC, SALES_PIPELINE_ARC, CODE_JURISDICTION_ARC — future-arcs already named
- GOD_MASTER_AGENT — framing locked, build deferred

This doc focuses on structural/health issues NOT covered by named arcs.
