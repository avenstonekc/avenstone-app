# docs/archive — historical documentation

These files are **no longer current** and are kept only for history. Do NOT rely on them as source of truth. For current project state, read [../../CLAUDE.md](../../CLAUDE.md).

## What's in here and why it's archived

### [AVENSTONE_SPEC.md](AVENSTONE_SPEC.md) — archived 2026-04-14
Original build spec from before the Vite migration. Describes the tech stack as "Single HTML file (index.html) — React 18 via CDN, Babel in-browser, no build step." **That is no longer true.** The codebase moved to Vite + React components. See [../../CLAUDE.md](../../CLAUDE.md) for the current architecture. Kept because it documents the original vision and decisions — useful history, dangerous as current reference.

### [CONSOLIDATION_PLAN.md](CONSOLIDATION_PLAN.md) — archived 2026-04-14
Step-by-step plan for the single-HTML → Vite migration. **That migration is complete.** The Vite app is at `avenstone-vite/` and is the only deployed frontend. Kept because it's a useful record of how the migration was staged, in case a similar refactor happens again.

## Rule for archiving

If a doc describes a planned state or architecture that no longer matches the codebase, move it here with a short entry explaining what changed. Never delete outright — history is useful, but stale docs in the root are landmines.
