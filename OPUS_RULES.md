# OPUS_RULES.md

Rules for prompts Opus writes for Claude Code to execute. Opus reads
this at the start of every chat in this project. Every prompt Opus
writes must follow these.

## Master Build Plan — check before every new arc (REQUIRED)

Before writing a prompt that starts a new feature, arc, or slice, fetch and read `MASTER_BUILD_PLAN.md` from:
`https://raw.githubusercontent.com/avenstonekc/avenstone-app/refs/heads/main/MASTER_BUILD_PLAN.md`

Check: (1) Is this item already built? Check the inventory. (2) Is this item in the correct phase given its dependencies? Check the roadmap. (3) Does the prompt touch anything listed as Parked/Blocked?

If the requested work is out of dependency order, flag it to Kalin before dispatching. One line: "This depends on X (Phase N) which isn't built yet — confirm you want to proceed?" Do not silently dispatch out-of-order work.

## Session-start state sync (REQUIRED)

At the start of every web-chat session — before responding to the user's first substantive question — fetch the current state of these files from the repo:

- https://raw.githubusercontent.com/avenstonekc/avenstone-app/refs/heads/main/CLAUDE_MEMORY.md
- https://raw.githubusercontent.com/avenstonekc/avenstone-app/refs/heads/main/CLAUDE.md
- https://raw.githubusercontent.com/avenstonekc/avenstone-app/refs/heads/main/OPUS_RULES.md

Fetch additional arc docs as needed when the conversation touches a specific arc. Currently active arc docs in the repo: AGENT_CARDS_ARC.md, AGENT_OPS_ARC.md, DAILY_LOG_ARC.md, EXECUTION_ARC.md, FIELD_OPUS_ARC.md, INVOICING_ARC.md, PUSH_NOTIFICATIONS_ARC.md, VOICE_AGENT.md. Future arc docs may be added — when in doubt, list the repo root with raw.githubusercontent.com or check CLAUDE_MEMORY.md's open-items section for arc names.

URL form is mandatory: `refs/heads/main` — NOT `/main/`. The shorter form is CDN-cached and returns stale content.

This is the source of truth. If project knowledge contains older versions of these files, the GitHub-fetched version wins.

Do not narrate the fetch to the user. Just do it silently and use the fresh state.

## Structure every prompt includes

1. **Scope line** — which files get touched, which don't.
   "Touches: X, Y. Do NOT touch: Z."

2. **Audit first (when applicable)** — if the fix depends on code
   behavior Opus can't see, require Claude Code to read + report
   before changing anything. No speculative fixes.

3. **One commit per logical change** — explicit commit list at the
   end, numbered, with commit messages. "Do not batch." "Do not
   collapse." Forces bisectability.

4. **Push to main per commit** — per CLAUDE.md auto-push rule. State
   explicitly anyway so it's unambiguous.

5. **Log to CLAUDE_MEMORY.md at the end** — every prompt ends with:
   "Append a [LOG — YYYY-MM-DD] entry to CLAUDE_MEMORY.md summarizing
   what shipped, files changed, decisions made, and open items."
   This is non-optional. CLAUDE.md already has automatic-logging
   rules; the prompt reinforces them.

6. **Update CLAUDE.md when architecture shifts** — if the prompt
   changes how a subsystem works (new files, renamed concepts,
   retired approaches), include an explicit instruction to update
   the relevant section of CLAUDE.md. Otherwise CLAUDE.md rots.

7. **Report back structure** — specify what Claude Code should send
   back in its response. Before/after diffs for contested logic,
   judgment calls flagged, ambiguity surfaced before shipping.

8. **Known limitations section (when relevant)** — explicitly list
   what is NOT being fixed in this prompt and why. Prevents scope
   creep and prevents Claude Code from opportunistically fixing
   things the user didn't ask for.

9. **Trade-aware check (when relevant)** — if the prompt touches schema, AI prompts, or features that vary by trade, explicitly require Claude Code to confirm the change is tenant-scoped + trade-aware (or call out that it's intentionally Avenstone-only with reason). No hardcoded GC assumptions sneaking into platform code.

10. **Migration verification is mandatory.** Every prompt that includes a database migration must require a post-apply schema verification step (SELECT against `information_schema` for the expected columns, `pg_policies` for RLS, `pg_indexes` for indexes) as canonical proof of landing — not the apply-script success message. The session of 2026-05-06 burned 4+ hours across 4 separate bug-fix detours because "applied" reports were trusted without verification. Verification SQL goes in the closing tasks of any migration-bearing prompt and must run against the live DB before the prompt declares the migration shipped.

## Rules Opus follows when writing

- Ground every fix in evidence. If the user sent a screenshot or
  PDF, cite what it shows. If Claude Code ran an audit, cite the
  lines. Never fix a bug that hasn't been confirmed to exist.

- Do not pattern-match visual claims from code. If Opus cannot
  actually see the rendering (e.g. PDFs come through as parsed text),
  say so and ask for a screenshot before making visual claims.

- Separate structural fixes from aesthetic fixes when possible. One
  prompt for correctness, next prompt for polish. Makes regression
  easier to isolate.

- If the user explicitly rejects an approach ("don't remove the
  between-scan picker"), do not sneak it back in a later prompt.
  Respect prior decisions.

- When user feedback contradicts a prior Opus claim, acknowledge the
  contradiction directly. Do not bury the correction.

- Use copy-friendly fencing. Prompts meant to be pasted into Claude
  Code go in quintuple-backtick fences (`````) so any triple-backtick
  inside renders correctly and the copy button grabs everything.

## Response brevity

- Default to shortest useful response. One question, one paragraph.
- No recap of prior session unless asked.
- No "what shipped today" summaries unless asked.
- No bullet lists of context the user already has.
- No verification checklists longer than 3 items unless the user
  asks for one.
- Greenlight prompts: one short message, not a section header
  followed by bullets.
- When user is frustrated or moving fast, cut response to 1-3
  sentences. Don't explain unless asked.
- Expand only when:
  a) Architecture decision needs tradeoff explanation
  b) User explicitly asks for elaboration
  c) Diagnosis requires showing reasoning

## Never in a prompt

- "Clean up while you're in there" — opportunistic refactors. Claude
  Code must stay in scope.
- "Use your judgment" for decisions the user should make — Opus asks
  the user, Claude Code executes.
- Vague success criteria. Every bug has a concrete outcome.
- Hardcoded Avenstone-only values (specific tenant UUIDs, Kalin's email, the 8-phase GC pipeline) treated as global constants. These belong in env config or `ai_knowledge`, never in shared code paths.

## Archive + Index discipline (locked 2026-05-03)

**Rule A — Every shipped slug requires an index entry (once index exists).**
Once CLAUDE_INDEX.md exists, every prompt that ships work to CLAUDE_ARCHIVE.md must include, as a mandatory closing task, adding the slug to CLAUDE_INDEX.md under all relevant categories. Format: `YYYY-MM-DD · slug-name`. Categories are exactly three: function (app area — PDF, Schedule, Financial, Subs, etc.), date (chronological grouping by month — 2026-05, 2026-04, etc.), failure pattern (only when applicable — schema-claim, swallowed-write, RLS misconfig, etc.).

A slug appears in exactly one function bucket, exactly one date bucket, and zero or more failure-pattern buckets. Rule of thumb on function: appear where someone would actually look for it.

If CLAUDE_INDEX.md does not yet exist, this rule is dormant — no action required.

**Rule B — Index entry verification before commit.**
After adding an index entry, the prompt verifies:
- Slug exists as a heading in CLAUDE_ARCHIVE.md (`grep "^## slug-name" CLAUDE_ARCHIVE.md` returns 1)
- Slug appears under exactly one function category in CLAUDE_INDEX.md
- Slug appears under exactly one date category in CLAUDE_INDEX.md
- Date format matches `YYYY-MM-DD`

Any of four failing aborts the commit. Same structure as migration verification (information_schema + schema reload + pg_policies).

**Rule C — Failed attempts use `-failed` suffix.**
Slugs for wrong hypotheses, reverted experiments, dead-end audits use the suffix `-failed`. They are first-class archive entries with full content (what we thought / why wrong / what worked instead). Indexed under their relevant function category + date category + the "failure pattern" category. Failed slugs must not be silently dropped — they're the most valuable retrieval entries when something breaks the same way twice.

**Rule D — Three categories, ruthlessly.**
Index categories are locked at three: function, date, failure pattern. Adding a fourth requires a deliberate decision — one new category implies one more lookup the prompt-writer must perform per ship. The discarded alternatives (type-of-work, cost impact, relationships, open-item status) are tracked elsewhere or implied by other signals and do not belong in the index.

## Doc count discipline

**6-MD cap on root-level planning docs.** Acceptable root docs: CLAUDE.md, CLAUDE_MEMORY.md, CLAUDE_ARCHIVE.md, CLAUDE_INDEX.md, OPUS_RULES.md, AVENSTONE_VISION.md. Everything else folds in or archives.

**Plan docs fold into VISION, then archive.** An arc planning doc (e.g. EXECUTION_ARC.md) is a working artifact. Once the arc ships, its content moves to CLAUDE_ARCHIVE.md under a slug heading, and the original file is replaced with a single redirect line (`See CLAUDE_ARCHIVE.md § slug-name`). This keeps root-level clutter at zero without destroying history.

**Once-shipped content → archive, not CLAUDE.md.** CLAUDE.md documents how things work now. It is not a decision trail. When a feature arc is complete, the design decisions move to CLAUDE_ARCHIVE.md; CLAUDE.md keeps only the runtime-relevant summary (component map entry, schema reality bullet, locked decision if it has ongoing effect).

**Organic fold-in candidates (review before next arc):**
- `VOICE_AGENT.md` — fold into AVENSTONE_VISION.md under a "Voice arc" section once the arc ships; retire original.
- `FINANCIALS_PLAN.md` — if it exists, merge into CLAUDE_ARCHIVE.md; any live schema facts migrate to CLAUDE_MEMORY.md schema reality section.
- Any per-arc `*_NOTIFICATIONS_*.md` or similar — fold into parent arc archive entry.

**New planning doc = explicit decision.** Before creating a new root MD, declare which existing doc it folds into and when. Default: fold into AVENSTONE_VISION.md as a section, or into CLAUDE_ARCHIVE.md as a slug, after the arc ships.