# Agent System Audit — 2026-06-02

Read-only audit of the Avenstone agent layer. Every claim is traced to a verified file + line. Items marked **[NEEDS DEEPER CHECK]** could not be fully confirmed in this session.

---

## 1. Architecture

### Agents that exist

| Agent | File | Role |
|-------|------|------|
| `ai-master-agent` | `supabase/functions/ai-master-agent/index.ts` | Primary PM-facing chat agent. 24 tools, 3-iteration max loop. |
| `ai-field-agent` | `supabase/functions/ai-field-agent/index.ts` | Voice-first field agent. 7 tools, 3 CONFIRM_TOOLS. Max 25 words per response. |
| `ai-pm-nightly` | `supabase/functions/ai-pm-nightly/` | **DISABLED.** `CLAUDE.md` explicit: "THIS IS DISABLED. Do not re-enable without explicit approval." |
| `company-files-watchdog` | `supabase/functions/company-files-watchdog/` | **NOT an agent.** Zero AI. Monitors company file expiry via `scheduled_actions` cron. |

Other AI-class edge functions (no tool use, no agentic loops): `ai-companion`, `ai-intake`, `ai-home-companion`, `ai-project-manager`, `ai-estimator`, `ai-generate-sequence`, `ai-sub-onboard`, `ai-sub-pricing`, `ai-error-logger`, `process-transcript`, `measure-guide`, `generate-estimate-from-session`, `ai-auto-fix-dispatcher`.

Total edge functions in repo: 54 (verified via directory listing of `supabase/functions/`).

### Delegation model

`ai-master-agent` has **no sub-agent delegation**. All 24 tools are implemented inside a single `executeTool` function (`index.ts:811`). `runAgentLoop` (`index.ts:2060`) is a flat loop — max 3 iterations, no dispatch to other agents.

`ai-field-agent` is a completely separate function, not a sub-agent of `ai-master-agent`. It shares no state with the master agent.

---

## 2. Verbs / Tools

### ai-master-agent — 24 tools (verified from TOOLS array, lines 448–806)

**Read tools (2) — never enter the Confirm card:**

| Tool | Line | Notes |
|------|------|-------|
| `get_jobs` | 450 | List/search jobs. `search` param triggers disambiguation card via POST_EXECUTE_ELICIT when multiple matches found. |
| `get_team` | 461 | List all staff and subs. |

**Write tools (22):**

| Tool | Line | CONFIRM? | REQUIRED_FIELDS? |
|------|------|----------|-----------------|
| `create_job` | 467 | YES | YES — address |
| `update_job` | 489 | no | no — model gets IDs from prior tool calls |
| `add_contact` | 503 | no | YES — full_name |
| `send_client_portal` | 519 | no | YES — job_id, email |
| `invite_person` | 532 | no | YES — email, full_name, role |
| `add_note` | 548 | no | YES — job_id, content (description says "Auto-applies, no confirmation") |
| `advance_phase` | 559 | no | YES — job_id (gate logic = separate POST_EXECUTE_ELICIT mechanism) |
| `update_phase` | 571 | no | no — skipped; technical-ID payload |
| `submit_change_order` | 583 | YES | no |
| `log_payment` | 596 | YES | YES — amount, job_id |
| `log_receipt` | 610 | YES | YES — amount, job_id, type |
| `notify_team` | 629 | no | YES — title, body |
| `add_todo` | 643 | YES | YES — title |
| `notify_team_member` | 659 | YES | no — skipped; message always present in chat input |
| `create_schedule_item` | 676 | YES | YES — job_id, title, type, scheduled_date |
| `add_knowledge` | 703 | no | YES — category, content |
| `log_sub_invoice` | 716 | YES | no |
| `log_sub_payment` | 733 | YES | no |
| `approve_sub_invoice` | 751 | YES | no |
| `upload_company_file` | 763 | YES | no |
| `record_deposit` | 780 | YES | YES — job_id, amount |
| `compose_draw` | 794 | YES | YES — job_id |

**CONFIRM_TOOLS set** (`index.ts:137–151`): 13 verbs total.

> **CLAUDE.md discrepancy:** `CLAUDE.md` "Locked decisions" section says "currently 5" tools in CONFIRM_TOOLS (`log_payment, log_receipt, submit_change_order, add_todo, create_job`). The actual code has **13**. That section of CLAUDE.md was written at v1 and has not been updated. The code is authoritative.

### Stale tools

None positively identified. All 24 tools have executor branches inside `executeTool` (`index.ts:811–1839`). **[NEEDS DEEPER CHECK]** — executor implementations were spot-checked but not exhaustively line-verified per tool. A full stale-tool audit would require tracing every branch.

### ai-field-agent — 7 tools, 3 CONFIRM_TOOLS

CONFIRM_TOOLS: `log_payment`, `log_receipt`, `submit_change_order` (verified from `index.ts` direct read).
Full tool list for remaining 4: **[NEEDS DEEPER CHECK]** — not fully verified; file was read via Explore agent summary, not a direct full read in this session.

Voice-first: max 25-word responses. Has a `notify()` helper that mirrors `sbNotify`.

---

## 3. Agent Cards — 3 Live Mechanisms

All three mechanisms live in `ai-master-agent/index.ts`. They are not mutually exclusive — a single tool call can hit REQUIRED_FIELDS (pre-execute) then CONFIRM_TOOLS (post-field-collection).

### Mechanism 1: REQUIRED_FIELDS → `pending_card` (pre-execute field elicitation)

**Registry:** `index.ts:194–264` — 15 entries (14 tools with specs + comment-documented skips for `update_job`, `update_phase`, `notify_team_member`).

**Flow:**
1. Claude emits `tool_use` block with missing fields (e.g. `log_payment` with no `amount`).
2. `runAgentLoop` calls `validateRequiredFields(toolBlock)` before `executeTool`.
3. Function inspects each `FieldSpec` for the tool; collects every missing/empty field.
4. If gaps exist: returns `{pending_card}` with one form question per gap. `dynamic_options: 'active_jobs'` expands to the user's active job list at card-emit time.
5. Loop returns early — **no DB write happens.**
6. UI renders card via `AgentCard` component (`MasterAgent.jsx:214–472`). User fills fields.
7. `card_response` arrives; answers merge into original tool input. Loop re-enters; if fields now complete, proceeds to Mechanism 2 or auto-apply.

**Field types supported in v1:** `select` (static options), `text` (free input), `select` with `dynamic_options: 'active_jobs'`.

### Mechanism 2: CONFIRM_TOOLS → `pending_action` (confirm chokepoint)

**Set definition:** `index.ts:137–151`.

**Flow:**
1. After REQUIRED_FIELDS passes, if `toolBlock.name ∈ CONFIRM_TOOLS`: loop returns `{pending_action: {tool, input}}` without calling `executeTool`.
2. UI renders Confirm card with tool name + input summary. Money verbs (`log_payment`, `log_receipt`, `record_deposit`, `compose_draw`) include `amountToWords` output so misheard digits read obviously wrong.
3. User taps Confirm → `callMaster` (`MasterAgent.jsx:598–680`) sends `{confirmed_action: {tool, input}}`.
4. Agent calls `executeTool`. Result returned.

**The Confirm card is the only commit point.** 13 write verbs never write silently.

### Mechanism 3: POST_EXECUTE_ELICIT (post-execution disambiguation)

**Registry:** `index.ts:323–364`. Two active entries:

**Entry 1 — `advance_phase` gate failure (`index.ts:366–444`):**
- `advance_phase` returns failing gates instead of advancing.
- POST_EXECUTE_ELICIT emits Card A: 3 choices (override with reason / do not advance / check what's needed).
- User picks "override" → Card B: override reason + detail. Both required before re-calling `advance_phase` with `override_reason`.

**Entry 2 — `get_jobs` disambiguation:**
- `get_jobs` with `search` returns multiple matches.
- Disambiguation card surfaces with job list for user to pick the exact match.
- This is the same pattern used when `dynamic_options: 'active_jobs'` resolves ambiguously.

---

## 4. Reactive vs Proactive

**Finding: The agent is 100% reactive. No autonomous trigger mechanism is currently active.**

| Question | Answer | Evidence |
|----------|--------|----------|
| Does the agent fire without user input? | **No.** | `ai-master-agent` only runs on POST from `MasterAgent.jsx` (`callMaster`). |
| Any scheduled or cron-triggered agent? | **No (disabled).** | `ai-pm-nightly` is the only proactive mechanism — explicitly disabled in `CLAUDE.md`. |
| Do DB triggers fire the agent? | **No.** | No DB trigger → edge function → agent call chain observed anywhere in `supabase/functions/`. |
| Does the notification system auto-fire? | **No.** | `sbNotify`/`sbNotifyUser` are helpers called only inside `executeTool` (on user-initiated `notify_team`/`notify_team_member` calls). |
| Is the draw-request nudge proactive? | **No.** | `FinancialsTab.jsx` banner is a UI render condition. It does not call the agent or send a notification. |

**What needs to change to add proactive capability:**
- Re-enable `ai-pm-nightly` — Supabase scheduled cron, currently disabled. Cost: Opus per run. Requires explicit approval.
- Add a DB webhook → edge function → agent call chain — currently absent. Would require rate-limit safeguards; DB events can cascade into thousands of calls (see CLAUDE.md API cost rules).

---

## 5. UI / Chat — MasterAgent.jsx

**File:** `avenstone-vite/src/components/shared/MasterAgent.jsx` — 1774 lines.

| Section | Lines | Notes |
|---------|-------|-------|
| `TILE_PREFIXES` | early | 5 starter-prompt tiles. Bug tile is the inline exception — bypasses `ai-master-agent`, fires `html2canvas` + posts to `submit-bug-report` directly. |
| `AgentCard` component | 214–472 | Renders `pending_card` (field elicitation). 3 question types: `select`, `text`, `select` with `dynamic_options`. |
| `callMaster` | 598–680 | Primary POST handler. Sends message + `confirmed_action` (confirming a write) + `card_response` (filling fields). |
| `ttsSpeak` | 994–1008 | TTS via `@capacitor-community/text-to-speech`. Speaker toggle in localStorage `av_tts_enabled`. |
| `startVoiceConfirm` | 1010–1047 | STT via `@capgo/capacitor-speech-recognition`. Hold-to-talk mic. Uses touch events (not pointer events) for iOS WKWebView — `onPointerUp` never fires on iOS, causing `micListening` to stick true. |

### Mounting

`MasterAgent` mounts at `App.jsx` top level — persistent across all `pg` navigation. This preserves conversation history across route changes. Do not unmount or move inside a screen.

### Key state

- `messages` — conversation history (rendered in chat pane)
- `pendingAction` — `{tool, input}` when CONFIRM_TOOLS fires; renders Confirm card
- `pendingCard` — field-elicitation card when REQUIRED_FIELDS fires

---

## 6. Notifications

### Available channels (verified from `src/lib/supabase.js`)

| Helper / Function | Channel | Scope |
|------------------|---------|-------|
| `sbLoadNotifs` | in-app DB | Loads for current user |
| `sbMarkNotifsRead` | in-app DB | Marks read |
| `sbNotify` | in-app | All tenant staff |
| `sbNotifyUser` | in-app | Specific user by `user_id` |
| `notify-email` edge function | Email (Resend) | Called from `notify_team_member` executor when `priority='high'` |
| `notify-sms` edge function | SMS | Exists in repo. **[NEEDS DEEPER CHECK]** — whether any agent tool currently calls it was not confirmed in this session. |
| `send-push` edge function | Push (mobile) | Exists in repo. **[NEEDS DEEPER CHECK]** — whether agent tools call it was not confirmed. |

### Autonomous notification writer

**None.** Notifications are only written when `notify_team` or `notify_team_member` tools execute, which requires a user-initiated chat message. No autonomous writer exists while `ai-pm-nightly` is disabled.

---

## Appendix: Key Constants

| Symbol | Value | File:Line |
|--------|-------|-----------|
| `CONFIRM_TOOLS` | Set of 13 verb strings | `ai-master-agent/index.ts:137` |
| `REQUIRED_FIELDS` | Record — 15 tool entries | `ai-master-agent/index.ts:194` |
| `POST_EXECUTE_ELICIT` | 2 active entries | `ai-master-agent/index.ts:323` |
| Phase gate Card A + Card B | advance_phase override flow | `ai-master-agent/index.ts:366–444` |
| `runAgentLoop` max iterations | 3 | `ai-master-agent/index.ts:2060` |
| `AgentCard` line range | 214–472 | `MasterAgent.jsx` |
| `callMaster` line range | 598–680 | `MasterAgent.jsx` |
| Total tools in master agent | 24 (2 read + 22 write) | `ai-master-agent/index.ts:448–806` |
| Total tools in field agent | 7 (3 confirmed) | `ai-field-agent/index.ts` |
| Draw nudge threshold constant | `DRAW_NUDGE_THRESHOLD = 0.10` | `FinancialsTab.jsx` |
