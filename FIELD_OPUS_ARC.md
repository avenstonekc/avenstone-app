# FIELD_OPUS_ARC

Opus-in-the-app. A dev console for Kalin to talk to Opus from the field — describe a bug or change, Opus audits and writes a Sonnet prompt, Kalin taps Go, prompt fires to the AUTO_FIX_ARC VM, VM runs Claude Code, results stream back into the same chat thread.

Same workflow Kalin uses in web Claude today, ported into the app. Repurposes AUTO_FIX_ARC's VM as the executor — different trigger (live conversation vs `bug_reports` row), same downstream pipeline.

Locked 2026-05-23. Build target: tomorrow morning.

---

## Locked decisions

1. **Hard gate to Kalin's auth ID.** Surface visible only when `auth.uid() = '8171742a-b586-4f13-be61-744e191a1896'`. Hardcoded in JSX + RLS-enforced on every backend call. Not a feature flag, not a role check — a direct auth ID match. Blake, subs, clients, staff never see the button. Defense-in-depth: client gate + edge function gate + DB RLS.

2. **Top-right floating button on mobile.** Distinct from MasterAgent's existing surface (which is general-purpose, available to all roles). Field-Opus is its own button, its own panel, its own conversation thread. Visual: small badge labeled "Dev" or a code icon — TBD in build slice.

3. **Confirm-before-dispatch (Option B from scoping).** Opus drafts the Sonnet prompt → renders it in the chat thread inside a card → Kalin taps "Send to VM" or "Edit" or "Cancel." No autonomous dispatch in v1. Trust builds, then maybe a toggle.

4. **VM is the executor, not Kalin's laptop.** AUTO_FIX_ARC VM (already live at autofix.avenstonekc.com) runs the Sonnet slice. Kalin never sees a CMD window. Result (commit hash + status + any audit output) posts back into the chat thread via realtime.

5. **Read access via existing channels — no new infra.** Opus reads CLAUDE_MEMORY/CLAUDE.md/OPUS_RULES from raw.githubusercontent.com (same as web Opus does today). Reads arbitrary source files via a thin `field-opus-fetch-file` edge function that proxies GitHub raw with path validation. Queries live DB via a `field-opus-db-query` edge function with service role + Kalin-auth-ID gate (read-only allowlist of SELECT-only queries). No write access except via Sonnet dispatch.

6. **Persistent thread.** Conversation persists across app sessions, devices, time gaps. Truck → lunch → home → same thread. Stored in `field_opus_messages` table. Auto-resume on panel open.

7. **One thread at a time.** v1 is single-thread. No archive/new-chat UX. If thread context bloats, manual reset button clears it (with a confirmation). Multi-thread deferred.

8. **VM dispatch is serial with queue depth 5.** Matches AUTO_FIX_ARC's current serial pattern. If Kalin fires 6 dispatches back-to-back, the 6th rejects with "VM busy — wait for current to complete." Parallel dispatch deferred until needed.

9. **No real-time audio.** Text only in v1. STT for field input uses the same `@capgo/capacitor-speech-recognition` plugin already wired in MasterAgent — copy the pattern, don't reinvent.

10. **Cost contained by gate.** Single user × normal-sized conversations × Opus = real money but not absurd. No multi-user blast radius. Field-Opus is Kalin's personal tool. Cost-accountable by definition.

---

## Phases

### Phase 1 — Schema + RLS foundation — ✅ SHIPPED 2026-05-24
- New table `field_opus_messages`: id (UUID), thread_id (UUID — v1 always single thread per user, but column ready for multi), role ('user' | 'assistant' | 'system' | 'dispatch_result'), content (TEXT), meta (JSONB — holds dispatch metadata: prompt sent, model used, commit hash returned, status), created_at.
- RLS: all access gated to `auth.uid() = '8171742a-b586-4f13-be61-744e191a1896'`. Service role unaffected.
- Helper: `sbLoadFieldOpusThread()`, `sbAppendFieldOpusMessage()`. Both gated client-side AND DB-side.
- Migration verification: information_schema confirms columns + types, pg_policies confirms RLS gate references the auth ID literal.

### Phase 2 — Read-only edge functions (1 prompt)
- `field-opus-fetch-file`: POST `{ path: string }`. Validates path is within `avenstone-vite/src/` or `supabase/functions/` or repo-root MD files. Fetches from raw.githubusercontent.com. Returns `{ ok, content, error }`. Service-role + Kalin-auth gate.
- `field-opus-db-query`: POST `{ query_kind: string, params: object }`. Whitelist of pre-defined SELECT queries (e.g. `recent_bug_reports`, `recent_auto_fix_attempts`, `failed_intents_last_24h`, `ai_error_logs_summary`, `schema_for_table`, `policy_list_for_table`). No raw SQL passthrough. Each query_kind is a named function in the edge fn. Service-role + Kalin-auth gate.
- Both functions return structured `{ok, data, error}`. Both reject any auth ID other than Kalin's.

### Phase 3 — Field-Opus edge function (the brain) (2 prompts)
- New edge function `field-opus-chat`. Receives `{ message, thread_id }` from client. Loads full thread history from field_opus_messages. Loads CLAUDE_MEMORY/CLAUDE.md/OPUS_RULES at session start (raw.githubusercontent.com — same as web Opus). Calls Anthropic API with `claude-opus-4-7` (or current Opus model string at build time) + tools:
  - `read_source_file(path)` → calls field-opus-fetch-file internally.
  - `query_db(query_kind, params)` → calls field-opus-db-query internally.
  - `draft_sonnet_prompt(scope_line, prompt_text, model)` → does NOT dispatch; returns the prompt to the client for Kalin to review + Send. Renders as a card in chat.
  - `note_decision(text)` → appends to thread as a system message for future-session continuity.
- System prompt = OPUS_RULES.md contents + Field-Opus-specific instructions ("you're talking to Kalin in the field, terse, audit-first, dispatch via draft_sonnet_prompt tool — never claim work is done, only that a prompt is drafted").
- Response shape: `{ assistant_text, draft_prompt?, audit_findings? }`. Client appends to thread + renders draft_prompt as a tappable card if present.
- Anthropic API call uses prompt caching on the system + tool block (per existing pattern in ai-master-agent).
- Split across 2 prompts: Prompt A = scaffolding (edge fn skeleton, message handling, thread load, system prompt assembly). Prompt B = tools (read_source_file, query_db, draft_sonnet_prompt, note_decision) + Anthropic API call + response shape.

### Phase 4 — VM dispatch wiring (1 prompt)
- New edge function `field-opus-dispatch-to-vm`. Receives `{ prompt, thread_id, message_id }` from client (called when Kalin taps "Send to VM" on a draft_sonnet_prompt card).
- Calls AUTO_FIX_ARC VM HTTPS endpoint with the prompt. VM runs Claude Code Sonnet. Same VM as autofix.avenstonekc.com — but a new endpoint `/dispatch-interactive` that:
  - Accepts a raw prompt (vs the bug_reports row path).
  - Runs Sonnet, captures stdout + commit hash.
  - Posts result back via webhook → Supabase `field-opus-result-webhook` edge function → appends `dispatch_result` message to thread.
- Serial enforcement: VM rejects with 429 if already busy. Edge function surfaces this to the chat thread as a system message.
- Queue depth 5: enforced at the edge function level via a `field_opus_dispatch_queue` table. If queue full, reject before even calling VM.

### Phase 5 — Client UI (1 prompt)
- New component `FieldOpusPanel.jsx`. Mounted at App.jsx top-level, gated by `profile?.id === KALIN_AUTH_ID`. Renders a floating top-right button on mobile (and desktop — same surface, but the field use case is mobile).
- Tap button → slides in panel from the right (similar to MasterAgent panel pattern). Chat-style UI: messages list, input box (textarea + mic + send), STT via same Capacitor plugin pattern.
- Renders three message types: user (right-aligned), assistant text (left-aligned), draft_sonnet_prompt card (full-width with "Send to VM" + "Edit" + "Cancel" buttons), dispatch_result (full-width, commit hash + status + collapsible stdout).
- Realtime subscription to `field_opus_messages` for this thread — VM results push into the chat without polling.
- Reset Thread button at bottom — confirms, then clears thread.

### Phase 6 — Polish + on-device verify (1 prompt)
- Mobile UX pass: safe-area-insets, keyboard handling, scroll behavior, prompt-card legibility.
- Auth-gate smoke tests: log in as Blake, log in as a sub, log in as test client — button must NOT appear, RLS must reject any direct API call.
- VM busy state: dispatch while VM is running another job — verify graceful "VM busy" message in chat.
- Realtime: dispatch from phone, walk to desk, verify result appears on desktop session (same thread, same realtime).
- Document gotchas in CLAUDE.md.

---

## Schema reference (post-Phase 1)

```
field_opus_messages
  id          UUID PK
  thread_id   UUID NOT NULL   -- v1 always one thread per user
  role        TEXT NOT NULL CHECK (role IN ('user','assistant','system','dispatch_result'))
  content     TEXT NOT NULL
  meta        JSONB NOT NULL DEFAULT '{}'
  created_at  TIMESTAMPTZ DEFAULT now()

  Indexes:
    idx_field_opus_messages_thread ON (thread_id, created_at)

  RLS:
    All commands gated by auth.uid() = '8171742a-b586-4f13-be61-744e191a1896'

field_opus_dispatch_queue  (Phase 4)
  id              UUID PK
  thread_id       UUID NOT NULL
  message_id      UUID NOT NULL FK → field_opus_messages
  prompt          TEXT NOT NULL
  status          TEXT NOT NULL CHECK (status IN ('queued','dispatched','completed','failed'))
  dispatched_at   TIMESTAMPTZ
  completed_at    TIMESTAMPTZ
  commit_hash     TEXT
  result_text     TEXT
  created_at      TIMESTAMPTZ DEFAULT now()

  Indexes:
    idx_field_opus_queue_status ON (status, created_at) WHERE status IN ('queued','dispatched')

  RLS: same gate as field_opus_messages
```

---

## Cost guardrails

- Opus calls per conversation: estimate 5-15 turns per session. Pricing: ~$0.015 input + $0.075 output per 1K tokens. Average 5K input × 10 turns + 1K output × 10 turns ≈ $1.50 per session.
- 10 sessions per day = ~$15/day worst case. 30/day saturation = ~$45/day. Real-world likely 1-3 sessions/day = ~$2-5/day.
- VM dispatch cost = same as AUTO_FIX_ARC today, already accounted for.
- No cost gate code in v1 — single user, naturally bounded by Kalin's attention. Revisit if multi-user (which currently means: never, given the locked gate).

---

## Open questions for build day

- Should the button hide when MasterAgent panel is open? (Visual conflict on small screens.) Probably yes — defer to Phase 5 UX pass.
- Should dispatch results auto-trigger a Vercel/Codemagic build check? Maybe — AUTO_FIX_ARC Phase D already does this. Could be reused. Decide in Phase 4.
- Should there be a "kill switch" — emergency stop on a running VM dispatch? AUTO_FIX_ARC doesn't have one today. Defer unless first incident proves the need.
- Notification when VM dispatch completes if user has closed the panel? Push notification (PUSH_NOTIFICATIONS_ARC) could fan this out. Decide post-PUSH Phase 5.

---

## Out of scope (v1)

- Multi-user. Locked.
- Multiple concurrent threads.
- Parallel VM dispatch.
- Voice-only conversation (audio in, audio out). Text + STT in v1, audio out deferred.
- Web Claude-style artifact rendering inside the panel (code blocks, diffs). Plain text + monospace blocks only.
- Granular permission controls — no "Kalin can only dispatch slices that touch X files." Trust is total.
- Slice-result attribution back to AUTO_FIX_ARC's auto_fix_attempts table. Field-Opus dispatches are tracked in field_opus_dispatch_queue only — separate ledger.
- Cost dashboard. Cost lives in Anthropic billing dashboard; no in-app surfacing.
