# test.md — how Kalin tests Avenstone

When Kalin says "read test.md" or "let's test X," drop into this flow. No clarifying questions — just go.

## The flow

1. **Start the dev server** with `preview_start` (launch config: `avenstone-app`, port 5173, Vite app in `avenstone-vite/`). Reuse the server if already running.
2. **Log in** with a test account unless Kalin specifies otherwise:
   - PM (default): `test-pm@avenstonekc.com` / `TestPM2026!`
   - Rep: `test-salesrep@avenstonekc.com` / `TestSalesRep2026!`
   - Sub: `test-sub@avenstonekc.com` / `TestSub2026!`
   - Client: `kalinspratling@gmail.com` / `TestClient2026!`
   - NEVER use `kalin@avenstonekc.com` — that email auto-sets role to `client` per CLAUDE.md.
3. **Resize to desktop** (`preview_resize` → 1280x900) unless Kalin explicitly wants mobile or iPad. Most real bugs Kalin wants to see need the full layout.
4. **Drive the UI** with `preview_click`, `preview_fill`, `preview_eval` (for complex interactions or React state bypasses). Use `preview_screenshot` at every visible milestone so Kalin can follow along.
5. **Narrate briefly** — one sentence per action ("clicking Projects", "filling client info", "firing the estimator"). Enough for Kalin to follow without reading code.
6. **Never echo what's already on screen.** If the feature rendered an estimate, document, chat reply, or any big chunk of text Kalin is looking at, do NOT paste it back into chat. He will tell you what he saw if it matters. His words: "i dont need u to post the text im looking at on the screen."

## When you hit a bug

**Stop the test immediately.** Do not try to power through. Do not attempt a second reproduction unless Kalin asks.

1. Take a screenshot if the bug is visible.
2. State in one or two sentences what broke (symptom only — not a diagnosis yet).
3. **Wait for Kalin to discuss.** He may have context, a theory, or want to see something specific before you touch the code. He may also say "just fix it."
4. Once aligned, investigate the root cause in the most efficient way possible:
   - Read the relevant component file directly — don't search blindly
   - Use `preview_network` or `preview_console_logs` to see what the API actually returned
   - Use `preview_eval` to reach into React state or call the API directly with the current inputs
   - Use a background subagent only if the investigation genuinely spans many files
5. Fix the bug with the smallest change that solves the class of problem, not just the single failure mode. Add defensive logging on AI/API paths so the NEXT failure surfaces the root cause automatically.
6. **Verify the fix — use the cheapest reliable method.** The goal is to confirm the fix works, not to re-click every button. Pick based on what the bug actually is:
   - **Pure logic, parser, regex, transformation** → call the function directly via `preview_eval` with known inputs, check the output. Seconds.
   - **API / edge function response handling** → fire `fetch()` at the endpoint via `preview_eval` with the same payload the app sends, inspect the raw response in `window.__x`. Skip the full UI loop.
   - **Error branches** (500, empty body, bad JSON) → force-call the error path directly, don't try to recreate it in the UI.
   - **React state, re-renders, stale closures, effect timing** → has to go through React's real render cycle — click through the UI.
   - **CSS, layout, responsive, dark mode, copy in toasts** → screenshot or inspect the real DOM. Only a render shows what the user sees.
   - **Event wiring (button exists but doesn't fire)** → click the actual rendered button.
   Default to the backdoor when the bug is logic or API — full UI loops are slow (60+ seconds for AI generation) and waste time when a 5-second direct call proves the same thing. Save the UI loop for bugs that only show up in the UI.
7. **Log it** to [bug-log.md](bug-log.md) if it meets the "when to add an entry" criteria at the top of that file. Short version: anything that took more than ~30 seconds to understand, touched more than one line, was confusing, could repeat on another feature, or involved an AI/edge-function/API path — log it. Typos and one-character fixes — skip it. When in doubt, log it.
8. Report to Kalin with a short summary: what broke, what was wrong, what changed, where the log entry lives. No dumps of screen content.
9. Resume the test where you left off, or end the session if Kalin says done.

## Never do during a test

- **Don't commit.** Kalin commits manually, or explicitly asks. Bug fixes sit in the worktree until then.
- **Don't create new files** unless the task requires it. Prefer editing existing files.
- **Don't run the Playwright suite** unless Kalin asks. Playwright is for regression, not exploratory testing.
- **Don't send emails, fire notifications, or create real payment links.** All three are in the explicit-permission list. If a test flow reaches one of those actions, stop and confirm before clicking.
- **Don't use `kalin@avenstonekc.com` as any test input.** It will set his role to `client` and break everything.
- **Don't dump long API responses, full estimates, long AI chat text, or copies of what's on screen into the chat.** Summarize.

## File references

- Bug history: [bug-log.md](bug-log.md)
- Project guide: [../CLAUDE.md](../CLAUDE.md)
