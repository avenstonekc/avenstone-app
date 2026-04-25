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

## Never in a prompt

- "Clean up while you're in there" — opportunistic refactors. Claude
  Code must stay in scope.
- "Use your judgment" for decisions the user should make — Opus asks
  the user, Claude Code executes.
- Vague success criteria. Every bug has a concrete outcome.
- Hardcoded Avenstone-only values (specific tenant UUIDs, Kalin's email, the 8-phase GC pipeline) treated as global constants. These belong in env config or `ai_knowledge`, never in shared code paths.

## Default closing section for every prompt