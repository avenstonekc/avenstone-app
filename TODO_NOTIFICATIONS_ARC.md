# TODO_NOTIFICATIONS_ARC

Goal: Todos assigned to a user by someone/something OTHER than themselves generate a notification. Tapping it lands on the actual todo. This is the Anti-Surprise Engine in the notification tray — the agent surfacing work to you proactively.

## Core rule

Notify on todos the user did NOT create themselves:
- Human assigns a todo to you → notify.
- Master agent (ai-pm-nightly, ai-master-agent, etc.) writes a todo for you → notify. THIS is the on-thesis case — proactive agent surfacing.
- You create your own todo → NO notification (same logic as "don't tell me I assigned a sub — I did that").

High-priority todos → route to push, not just in-app bell. Medium/low → in-app bell only (mirrors existing notification priority gate).

## Existing state (todo_delegated type already exists)

- `todo_delegated` notification type exists in the system (`notifications_type_check`, `notify-email` SUBJECTS).
- `buildDeepLink` emits `/job/<jobId>/todos` for `todo_delegated`.
- Today: todos surface on the HOME screen (MyTodosScreen at `pg='todos'`), not as tappable notifications in real usage.
- `MyTodosScreen` (`src/components/todos/MyTodosScreen.jsx`) has NO `pendingTodoId` / focus-a-todo capability yet.
- Notification INSERT in ai-master-agent (~:1203) drops the new todo's id — does not carry it.

## Phases (audit-first per OPUS_RULES)

### Phase 1 — Audit (1 prompt, read-only)

- Where todos get created: enumerate every creation path (human-assigned, agent-written by which fns, self-created).
- Does the todo row record enough to distinguish creator vs assignee vs agent-source? (`created_by`, `assigned_to`, `source` columns?) — this determines whether trigger logic needs a schema add.
- Does `todo_delegated` currently FIRE on assignment, and to whom? Does it route to push?
- `MyTodosScreen` capability + what notification rows carry.
- OUTPUT: exact remaining prompt count.

### Phase 2 — Trigger logic (1 prompt, maybe +1 if schema add needed)

- Fire `todo_delegated` when `(assigned_to ≠ creator)` OR `(source = agent/agent fn)`. Suppress on self-created.
- High-priority → push via existing priority gate; medium/low → bell only.
- If todo row can't distinguish source today, add the minimal column first (migration + schema verify per OPUS_RULES).

### Phase 3 — Deep-link to the todo (2 prompts, crosses frontend + edge fn deploy)

- **Frontend (no deploy):** `pendingTodoId` prop → `MyTodosScreen` scrolls to / highlights the matching todo. Guard: only if todo id present + exists, else land on list, no crash. Test against manual `?pg=todos&todo=<id>` URLs.
- **Edge fn (deploy):** ai-master-agent adds `related_entity_id` (new todo id) to notification INSERT; `notification-push-fanout` includes it in deep-link (`/job/<jobId>/todos/<todoId>` or `/todos/<todoId>`). Pre-check: confirm `notifications.related_entity_id` column exists (`SELECT information_schema`) — migration if not.

## Estimate: 3–5 prompts (4 likely). Audit (P1) sharpens to exact.

## Related / out of scope

- Broader "which notifications fire and to whom" relevance pass (e.g. "sub assigned" pinging the assigner is noise) — separate future thread, NOT this arc.
- Kalin's idea: surface high-priority items on the HOME screen (todos already there w/ weather) — separate, possibly better than push for some cases. Future.
