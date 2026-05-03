# OPUS_PROMPT_RULES.md

Rules for prompts Opus writes for Claude Code to execute. Opus reads
this at the start of every chat in this project. Every prompt Opus
writes must follow these.

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

**Rule A — Every shipped slug requires an index entry.**
Once CLAUDE_INDEX.md exists, every prompt that ships work to CLAUDE_ARCHIVE.md must include, as a mandatory closing task, adding the slug to CLAUDE_INDEX.md under all relevant categories. Format: `YYYY-MM-DD · slug-name`. Categories: app area (PDF, Financial, Schedule, Subs, etc.), type of work (feature, fix, audit, refactor, schema, doc), failure pattern (only when applicable — schema-claim, swallowed-write, RLS misconfig, etc.).

A slug can appear in multiple lines under app area when it's cross-cutting. Rule of thumb: appear where someone would actually look for it.

**Rule B — Index entry verification before commit.**
After adding an index entry, the prompt verifies:
- Slug exists as a heading in CLAUDE_ARCHIVE.md (`grep "^## slug-name" CLAUDE_ARCHIVE.md` returns 1)
- Slug appears in at least one category in CLAUDE_INDEX.md
- Date format matches `YYYY-MM-DD`

Any of three failing aborts the commit. Same structure as migration verification (information_schema + schema reload + pg_policies).

**Rule C — Failed attempts use `-failed` suffix.**
Slugs for wrong hypotheses, reverted experiments, dead-end audits use the suffix `-failed`. They are first-class archive entries with full content (what we thought / why wrong / what worked instead). Indexed under their relevant app area + the "failure pattern" category. Failed slugs must not be silently dropped — they're the most valuable retrieval entries when something breaks the same way twice.

**Rule D — Three categories, ruthlessly.**
Index categories are locked at three: app area, type of work, failure pattern. Adding a fourth requires a deliberate decision — one new category implies one more lookup the prompt-writer must perform per ship. Six categories was rejected as undisciplined; three survives. Cost, relationships, and open-item status are tracked elsewhere (CLAUDE_MEMORY) and do not belong in the index.

## Default closing section for every prompt