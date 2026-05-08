# VOICE_AGENT_AUDIT.md — Phase 1 Prerequisite Audit

**Date:** 2026-05-08
**Mode:** Read-only. No patches.
**Scope:** Confirm the text-to-tool path is sound for the 5 v1 verbs locked in `VOICE_AGENT.md` before voice I/O is layered on.

The 5 v1 verbs:
1. **Add note** to a job
2. **Attach photo** to a job (or to a phase / schedule item)
3. **Log change order**
4. **Log payment received**
5. **Mark phase complete** — split into 5a (lifecycle phase advance via `sbAdvancePhase`) and 5b (schedule item complete via `sbUpdateScheduleItem`)

Files inspected:
- `supabase/functions/ai-master-agent/index.ts` (649 lines, 17 tools)
- `supabase/functions/ai-field-agent/index.ts` (319 lines, 5 tools)
- `avenstone-vite/src/components/shared/MasterAgent.jsx` (647 lines)
- `avenstone-vite/src/lib/supabase.js` — helper bodies for `sbNote`, `sbPhoto`, `sbCO`, `sbCreateTransaction`, `sbAdvancePhase`, `sbUpdateScheduleItem`
- `VOICE_AGENT.md` (locked decisions)
- `CLAUDE_MEMORY.md` Schema reality block

---

## 1. Edge function host — which agent owns voice?

**Two agents exist. Neither is voice-ready as-is. They have *opposite* gaps.**

| Concern                       | `ai-master-agent`            | `ai-field-agent`                                  |
|-------------------------------|------------------------------|---------------------------------------------------|
| Model                         | `claude-sonnet-4-6` ✓        | `claude-haiku-4-5-20251001` ✗                     |
| max_tokens                    | 4096 ✗ (locked: 2048)        | 512 ✗                                             |
| conversation_history window   | 20 ✓                         | 8 ✗                                               |
| Tool-loop iteration cap       | 6 ✗ (locked: 3)              | n/a (single-pass `pending_action`/`confirmed`)    |
| Confirmation flow             | **Missing**                  | **Present** (`pending_action`/`confirmed`, `executeAction` skips Claude on confirm) |
| `job_id` context param        | No                           | Yes (per VOICE_AGENT decision #6)                 |
| Voice-optimized system prompt | No (long PM-orchestration)   | Yes (~25-word, "speak conversationally")          |
| Tool count                    | 17 (kitchen-sink CRM verbs)  | 5 (lead, note, status, CO, material status)       |
| RLS posture                   | `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS) | Same                                |
| Status enum currency          | **Stale** (uses `bid_sent / active / demo / framing` in `get_jobs` enum) | New canonical enum in `update_job_status` ✓; **describeAction labels are stale** |

**Recommendation: extend `ai-field-agent` into `ai-voice-agent`** (or rename in place once the Master surface migrates).

Reasons:
1. Confirmation flow already exists — the most expensive missing piece on the Master side.
2. Voice-optimized prompt and 25-word target already established.
3. `job_id` context param already plumbed (decision #6).
4. Single-pass execution model fits the locked "3 iterations max" cap better than Master's 6-iteration tool loop.

What needs to be flipped on the Field agent:
- Model → `claude-sonnet-4-6` (lock #1)
- max_tokens → 2048 (lock #2)
- conversation_history window → 20 (lock #3)
- Tool roster → swap toward the 5 v1 verbs (see §2 and §8)

The Master agent stays as-is for the typed PM-chat surface in `MasterAgent.jsx`. Voice does not inherit Master's tool sprawl.

---

## 2. Verb-by-verb trace — does the wired path lead to the canonical helper?

For each verb: **(intent → tool name on edge fn → DB write path → canonical helper).** Anything that doesn't end at a canonical `sb*` helper is a RED gap.

### Verb 1 — Add note
- **Master:** `add_note` (line 128). Writes **directly** to `job_notes` via service-role insert. Does **NOT** go through `sbNote`. RED.
- **Field:** `create_job_note`. Same — direct insert. Uses field name `author` (string), not `author_id`. RED + a column-name mismatch with Master.
- **Canonical helper:** `sbNote(jid, content, author)` — `supabase.js:136`, returns `{ ok, error, data }`. Wires `captureFailedIntent` on failure.
- **Gap:** neither agent uses the helper. Failed intents from voice will not appear on the Today screen amber resume tile.

### Verb 2 — Attach photo
- **Master:** **No tool exists.** The 17-tool roster has zero photo or file-upload verbs.
- **Field:** **No tool exists.**
- **Canonical helper:** `sbPhoto(jid, file, entityType, entityId)` — `supabase.js:150`. Uploads to `job-photos` bucket, inserts `photos` row, returns `{ id, type, url, name }` or `null` on failure.
- **Gap:** entirely missing. Also, voice won't carry a binary file. Phase 1 viable path is "voice initiates → UI captures the photo from camera → fires `sbPhoto`." The agent's role here is *trigger*, not *upload conduit*. Decision needed on whether voice can claim verb 2 in v1 or whether it ships in v1.5.

### Verb 3 — Log change order
- **Master:** `create_change_order` (line 168). Writes **directly** to `change_orders` table. Does **NOT** go through `sbCO`. RED.
- **Field:** `create_change_order` exists. Same — direct insert.
- **Canonical helper:** `sbCO(co)` — `supabase.js:199`, returns `{ ok, error, data }`. Wires `captureFailedIntent` on failure.
- **Gap:** identical to verb 1. Failed intents don't capture; CO numbering convention if any (sub-side has `sbSubSubmitCO` that auto-generates `co_number`) is not applied — voice writes will produce different rows than UI writes.

### Verb 4 — Log payment received
- **Master:** `create_payment` (line 182). Writes **directly** to `job_transactions` with `type='payment'` and hardcoded `direction='in'`. Does **NOT** go through `sbCreateTransaction`. RED.
- **Field:** **No payment tool.**
- **Canonical helper:** `sbCreateTransaction(tx)` — `supabase.js:768`, returns `{ data, error }` (note: not the canonical `{ ok, error, data }` shape — see §3). Wires sub auto-enrollment in payment-made sequences when `type === 'sub_payout'`.
- **Gap:** Master bypasses the helper entirely. The sub-payout enrollment side effect is silently skipped on voice writes. Also, the helper's return shape itself is non-canonical — separate gap (see §3).

### Verb 5a — Mark *lifecycle* phase complete (advance `jobs.status`)
- **Master:** `create_phase` and `update_phase` (lines 140 + 156). Both write to **`job_phases`** (the trade-phase table), not `jobs.status`. **Wrong target table for the lifecycle verb.** RED.
- **Field:** `update_job_status` writes `jobs.status` directly (no helper). RED for helper-bypass; correct target table; **uses the new canonical enum** ✓ (post-migration `20260506200000`).
- **Canonical helper:** `sbAdvancePhase(jobId, opts)` — `supabase.js:2948`. Throws on gate failure unless override reason supplied. Fires `checkAndAutoInvoice` on advance and now `captureTradeActualsForJob` when next phase is `complete` (Phase 9a, this session). Does **not** return `{ ok, error }` — returns `{ previousPhase, advancedTo, overrideUsed, overrideReason }` and **throws** on failure.
- **Gap:** Master targets the wrong table. Field targets the right table but bypasses the helper, which means the auto-invoice hook *and* the new actuals-capture hook **never fire on voice-driven status changes**. RED — silently breaks the EXECUTION_ARC pipeline.

### Verb 5b — Mark *schedule item* complete
- **Master:** No schedule item tool.
- **Field:** No schedule item tool.
- **Canonical helper:** `sbUpdateScheduleItem(id, patch)` — `supabase.js:1659`. Returns `{ ok, error, data, prevRow }`. **Has a photo gate**: `sub_start | site_visit | inspection` items reject `status='complete'` if zero linked photos exist. Fires `derivePhaseStatus`, `fireTodoEvent('schedule_item.completed')`, and `checkAndAutoInvoice('sub_start.status_changed')`.
- **Gap:** entirely missing. The photo gate is the complication — voice cannot satisfy it without an attached photo, so verb 5b for the gated item types necessarily depends on verb 2 (photo) being present, or on a UI fallback that opens camera before issuing the complete.

### Summary table

| Verb        | Tool exists? | Targets right table? | Goes through canonical helper? | Verdict |
|-------------|--------------|----------------------|--------------------------------|---------|
| 1 add_note  | M ✓ / F ✓    | ✓                    | ✗ (both bypass `sbNote`)       | RED — helper bypass |
| 2 photo     | M ✗ / F ✗    | n/a                  | n/a                            | RED — verb missing |
| 3 change_order | M ✓ / F ✓ | ✓                    | ✗ (both bypass `sbCO`)         | RED — helper bypass |
| 4 payment   | M ✓ / F ✗    | ✓                    | ✗ (Master bypasses `sbCreateTransaction`) | RED — helper bypass + Field gap |
| 5a advance phase | M wrong-table / F ✓ | M ✗ / F ✓ | ✗ (Field bypasses `sbAdvancePhase`)  | RED — autoInvoice + tradeActuals hooks dead on voice |
| 5b schedule complete | M ✗ / F ✗ | n/a            | n/a                            | RED — verb missing; photo gate dependency |

---

## 3. Helper-shape compliance — what does the agent get back?

VOICE_AGENT.md and CLAUDE_MEMORY.md both lock the canonical helper return shape: **`{ ok, error, data }`**. Background: 2026-05-07 production repair burn from helpers that returned a Supabase `{ data, error }` and silently swallowed writes.

| Helper                   | Actual return                                                                                | Canonical? |
|--------------------------|----------------------------------------------------------------------------------------------|------------|
| `sbNote`                 | `{ ok, error, data }`                                                                        | ✓          |
| `sbCO`                   | `{ ok, error, data }`                                                                        | ✓          |
| `sbUpdateScheduleItem`   | `{ ok, error, data, prevRow }` (extra `prevRow` for cancel/edit history; no harm)            | ✓          |
| `sbCreateTransaction`    | **`{ data, error }`** — no `ok` field                                                        | ✗ — non-canonical |
| `sbAdvancePhase`         | **Throws** on failure; returns `{ previousPhase, advancedTo, overrideUsed, overrideReason }` on success | ✗ — exception-based contract, no `ok` |
| `sbPhoto`                | `{ id, type, url, name }` on success, **`null`** on failure (no error message surfaced)      | ✗ — null swallow |

**Three of six v1 helpers don't conform.** The agent has to wrap each call in shape-normalizing code, or the helpers themselves get updated to conform before voice calls them. Latter is cleaner — the helpers are called from JSX too and a uniform contract is overdue. Logged as Phase 2 work in §8.

---

## 4. Model config — does live code match VOICE_AGENT.md locked decisions?

| Lock                         | VOICE_AGENT.md value         | ai-master-agent           | ai-field-agent                  |
|------------------------------|------------------------------|---------------------------|---------------------------------|
| Model                        | `claude-sonnet-4-6`          | `claude-sonnet-4-6` ✓     | `claude-haiku-4-5-20251001` ✗   |
| max_tokens                   | 2048                         | 4096 ✗                    | 512 ✗                           |
| conversation_history window  | 20                           | 20 (`slice(-20)`) ✓       | 8 (`slice(-8)`) ✗               |
| Tool-loop iterations         | 3 max                        | 6 (`maxIterations=6`) ✗   | n/a (single-pass model)         |

Master is the closer match on shape but wrong on token cap and iteration cap. Field is the closer match on confirmation/voice-prompt shape but wrong on every model-config dimension.

Whichever host wins the recommendation in §1, **all four model-config dimensions need to land before voice ships.** None of these are architectural — they're literal-value flips in the edge fn body and a redeploy.

---

## 5. Conversation history — does tool-use continuity survive across turns?

`MasterAgent.jsx:215-224` writes assistant turns into history as:

```js
{ role: 'assistant', content: aiText }
```

`aiText` is a flattened *text-only* string. **Tool-use blocks and tool_result blocks are not preserved.**

This matters because Anthropic's tool loop expects `content` to be an array of content blocks (`{ type: 'text' | 'tool_use' | 'tool_result' ... }`) for any turn that contained a tool call. By collapsing to text, the next user turn that references "the change order I just logged" lands in a session where the model can no longer see that the tool was called or what the tool returned. The model will hallucinate the prior step or ask the user to repeat.

For Phase 1 (single-action verbs, voice user unlikely to chain), this is tolerable — but **for any verb that requires confirmation followed by execution, history must preserve content blocks** between the confirmation and the confirm-execution turns. The Field agent's `pending_action`/`confirmed` design sidesteps this by encoding the pending action in JSON state (`pending_action.tool` + `pending_action.input`) rather than relying on Anthropic-side conversation memory. That pattern is what voice wants.

**Recommendation:** keep the Field agent's pending-action JSON state pattern. Do not try to fix MasterAgent.jsx history shape just for voice — the typed-PM surface lives separately and can keep its lossy text-only history without affecting voice.

---

## 6. Confirmation flow status

VOICE_AGENT.md decision: **every write requires confirmation before execution.**

- **Master:** no confirmation flow. Tool calls execute immediately. The 6-iteration loop chains tool calls without user gating.
- **Field:** confirmation flow present and working. `pending_action` is set on first turn, `executeAction` runs on confirmation without re-invoking Claude. `describeAction` produces a human-readable confirmation prompt.

**Open issue on Field side:** `describeAction` for `update_job_status` uses **stale status labels** (e.g. "bid sent", "signed", "demo started") from before the canonical-status migration. The *tool* writes the new enum correctly, but the *spoken confirmation* will use vocabulary the user might not recognize. YELLOW — fix is a label-table swap.

---

## 7. Open architectural questions

These are decisions Kalin needs to make before Phase 2 starts. Logging them so they don't drift.

1. **Single agent or two?** Master keeps typed PM chat; voice extends Field. Confirmed in §1, but worth saying in writing — Voice is not a Master extension, it's a Field reskin + retool.

2. **Photo verb in v1 or v1.5?** Voice cannot transmit a binary. Real "attach photo" is voice → UI opens camera → user captures → app fires `sbPhoto`. That makes verb 2 a *trigger-and-handoff* verb, structurally different from the other four. Decision: ship as v1 with the handoff dance, or defer to v1.5 and start voice with 4 verbs.

3. **Verb 5 split — both 5a and 5b in v1, or pick one?** 5a (lifecycle phase advance) is the high-value verb — fires autoInvoice and tradeActuals hooks. 5b (schedule item complete) has a photo-gate dependency on verb 2. **Recommendation: ship 5a in v1; defer 5b to v1.5 alongside verb 2.** This drops v1 to 4 voice-doable verbs (note, CO, payment, advance phase) and saves the photo+gate complications for one shippable v1.5 increment.

4. **RLS posture for voice.** Both agents use `SUPABASE_SERVICE_ROLE_KEY`. Voice users are authenticated PMs and should write under their own identity so RLS, audit columns (`created_by_id`), and `captureFailedIntent` resumability all work correctly. Decision: switch voice writes to user JWT or keep service-role with manual `created_by_id` stamping.

5. **Tenant scoping enforcement.** Voice agent must read `tenant_id` from the calling user's profile, never accept it as input. Both Master and Field already do this — flag for vigilance, not a current gap.

6. **Failed-intent capture path.** Helper bodies fire `captureFailedIntent` on error → that surfaces on the Today screen amber resume tile. If voice bypasses helpers (current state), failed voice writes never resume. The "use canonical helpers" recommendation in §2 fixes this for free. Confirm this is the intent vs an explicit decision to NOT resume voice failures.

---

## 8. Phase 2 work surface — what has to ship before voice goes live

In rough priority order. Each is a separable Phase 2a/2b/2c slice.

**Critical (block voice ship):**
1. **Pick host agent and lock voice tool roster.** Per §1 + §2: extend `ai-field-agent`. Tool roster v1: `add_note`, `log_change_order`, `log_payment`, `advance_phase`. (Defer photo + schedule_item_complete to v1.5.)
2. **Wire each tool through its canonical helper, not direct table writes.** `sbNote`, `sbCO`, `sbCreateTransaction`, `sbAdvancePhase`. This restores `captureFailedIntent`, sub-payout sequence enrollment, autoInvoice, and tradeActuals hooks.
3. **Normalize helper return shapes.** `sbCreateTransaction`, `sbAdvancePhase`, `sbPhoto` all need to return `{ ok, error, data }`. Helpers are called from JSX too — uniform contract is overdue regardless of voice.
4. **Flip model config to locked values:** Sonnet, max_tokens 2048, conversation history 20, max iterations 3 (or stay single-pass on Field's pending_action model).
5. **Refresh stale status labels in `describeAction`** to match canonical enum (`lead`, `proposal`, `contract`, `in_progress`, `final_touches`, `complete`, `on_hold`).

**Important (ship before v1.5):**
6. Add `sbPhoto` trigger-and-handoff path: voice tool returns a UI directive (`{ open_camera_for: 'job_id|entity' }`) rather than uploading. Camera UI fires actual `sbPhoto`.
7. Add `mark_schedule_item_complete` verb wired to `sbUpdateScheduleItem`. Photo-gate handling: if gate fails, voice agent prompts user to capture photo first (chains into verb 6).
8. Stamp `created_by_id` correctly under whichever auth posture lands per §7.4.

**Nice-to-have (post-voice):**
9. Wire MasterAgent.jsx to fork by surface — typed → Master, voice → Field-extension. Right now MasterAgent.jsx routes only to `AI_MASTER_URL`.
10. Field agent `update_material_status` writes to `job_materials` — verify this table is still alive vs the newer `material_orders` schema (CLAUDE_MEMORY.md schema-reality block, 2026-05-04 entry, says `material_orders` is the new per-order JSONB design with 0 rows migrated from the old per-row design — `job_materials` may be the deprecated one).
11. Field agent `create_job_note` uses `author` field (string); Master uses `author_id`. Reconcile to one column name when verb 1 is migrated to `sbNote`.

---

## RED count

**8 RED gaps:**
1. `add_note` bypasses `sbNote` (both agents)
2. Verb 2 (photo) entirely missing
3. `create_change_order` bypasses `sbCO` (both agents)
4. `create_payment` bypasses `sbCreateTransaction` (Master); missing on Field
5. `create_phase` writes wrong table on Master; `update_job_status` bypasses `sbAdvancePhase` on Field — autoInvoice + tradeActuals hooks dead on voice
6. Verb 5b (schedule item complete) entirely missing
7. Master agent has no confirmation flow — every write executes on first turn
8. Helper return shape inconsistency: `sbCreateTransaction`, `sbAdvancePhase`, `sbPhoto` non-canonical

## YELLOW count

**5 YELLOW gaps:**
1. Master `get_jobs` status enum description is stale (pre-canonical migration)
2. Field `describeAction` status labels are stale
3. Master max_tokens 4096, maxIterations 6 — both above locked caps
4. Field on Haiku, max_tokens 512, history window 8 — all below locked values
5. MasterAgent.jsx conversation_history stores text-only; tool_use blocks lost across turns (only matters for voice if Master hosts voice — recommendation §1 sidesteps)

---

## Recommendations summary

- **Edge fn host:** extend `ai-field-agent` (rename to `ai-voice-agent` when migration starts).
- **Mark-phase verb:** ship **5a only** in v1. Defer 5b to v1.5 alongside photo verb.
- **v1 voice tool roster:** 4 verbs — `add_note`, `log_change_order`, `log_payment`, `advance_phase` — each wired through its canonical `sb*` helper.
- **Pre-voice work:** Phase 2 items #1-5 above. Helper return-shape normalization (#3) is the cleanest win and benefits non-voice code paths too.
- **Watch list:** RLS posture decision (§7.4) and `job_materials` vs `material_orders` reconciliation (#10).
