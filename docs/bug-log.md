# Bug Log

Running history of bugs hit during testing + how we fixed them. Add newest at the top. Keeps CLAUDE.md lean and gives future sessions (and the white-labeled fork) a searchable record of mistakes and fixes so we don't re-solve the same problem twice.

## When to add an entry

Log a bug here when ANY of these are true:

- The bug took more than ~30 seconds to understand (you had to read code, inspect network, or test a theory)
- The fix touched more than one line OR added defensive logic
- The symptom was confusing and didn't obviously match the root cause (e.g. "JSON parse error" that's actually a truncated API response)
- Future-you (or a white-label tenant) could hit the same class of bug on a different feature
- It involved an AI path, edge function, or external API — these always get logged because the failure mode usually repeats

**Don't log:**

- Typos in labels, one-character CSS fixes, obvious copy/paste mistakes
- Compile errors that Vite caught and you fixed immediately
- Anything where the fix was "I missed a prop name" and took 10 seconds

**Rule of thumb:** if a future session could learn something from it, log it. When in doubt, log it — a small log is better than a missed lesson.

## Entry format — keep it short

```
## YYYY-MM-DD — Short title
**Symptom:** what the user/tester saw
**Root cause:** the actual bug
**Fix:** what changed — file path + short description
**Lesson:** (optional) one line, only if there's something worth remembering beyond "we fixed it"
```

---

## 2026-04-14 — Proposal generator error: "Could not parse proposal data"

**Symptom:** After an AI estimate successfully generated on a new lead, clicking **Generate Proposal →** in the AI Estimator modal popped the Generate Proposal dialog but showed a red `Could not parse proposal data` banner. No line items. No payment schedule.

**Root cause:** `openProposal()` in [avenstone-vite/src/components/jobs/tabs/EstimateTab.jsx:147](avenstone-vite/src/components/jobs/tabs/EstimateTab.jsx:147) called the `ai-estimator` edge function with the `EXTRACT_JSON_FOR_PROPOSAL` signal, then tried to pull the JSON out of the response with a single greedy regex `/\{[\s\S]*\}/`. Three problems stacked:
1. The AI sometimes wraps the JSON in a ` ```json ... ``` ` markdown fence — the greedy regex usually survives this but the failure mode is not explicit and any edge case (e.g. a `}` inside a string) silently breaks it.
2. On failure it threw a generic `Could not parse proposal data` with no logging — no way to see what the API actually returned.
3. No retry. A single transient hiccup (HTTP error, empty body, partial stream) left the user with a dead modal and no path forward.

Direct API test with the same request succeeded cleanly (54 line items, subtotal $51,677), confirming the extraction path itself works — the bug was brittle client-side parsing.

**Fix:** Extracted the parsing into a new `extractProposalJSON(attempt)` helper that:
- Explicitly strips a ` ```json ... ``` ` code fence before the brace regex runs
- Falls back to greedy brace match
- Catches `JSON.parse` failures separately from missing-brace failures
- `console.error`s the actual raw head/tail on any failure so we can see what the AI returned
- Retries once automatically on any parse failure before surfacing an error to the UI
- Throws specific error messages: `Estimator returned HTTP 500`, `Estimator returned empty response`, `No JSON object in estimator response`, `Invalid JSON from estimator: <parser message>`

`openProposal()` now just `await`s the helper — all the branching lives in one place.

File: [avenstone-vite/src/components/jobs/tabs/EstimateTab.jsx](avenstone-vite/src/components/jobs/tabs/EstimateTab.jsx)

**Lesson:** When parsing AI output client-side, always log the raw response on failure and auto-retry once. A single regex match with a generic error is a debugging black hole — the user sees "it broke" and you see nothing.
