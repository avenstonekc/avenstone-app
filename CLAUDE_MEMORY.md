---
# Avenstone App — Working Memory
_Two-file split established 2026-05-03. This file = lean working memory. Full LOG history → CLAUDE_ARCHIVE.md (retrieve by slug `##` heading)._

On session start: read this file top-to-bottom. Append a [LOG] at the end when a feature ships, a bug is fixed, or an architecture decision is made. When a LOG is no longer actively relevant, move content to CLAUDE_ARCHIVE.md under a new slug and add pointer to the index below.

---

## Current state (2026-05-27)

- **Repo:** github.com/avenstonekc/avenstone-app
- **Web:** Vercel auto-deploy on push to main
- **iOS:** Codemagic → TestFlight auto-deploy on push to main
- **Stack:** Vite + React 18, Supabase JS v2, Capacitor 8 (iOS)
- **Supabase URL:** https://cbfftukmhqvvjlrlnltk.supabase.co
- **Avenstone tenant ID:** 00000000-0000-0000-0000-000000000001
- **Kalin auth ID:** 8171742a-b586-4f13-be61-744e191a1896
- **Blake auth ID:** 066c8241-accb-490b-9f98-b8b7cb24c33b

**Migration apply method:** `npm run migrate <path.sql>` from `avenstone-vite/` (tools/apply_migration.js — apply + auto-verify + schema reload in one command). PAT stored at `C:/Users/Kalin/supabase-token.txt`. Not curl. Not `process.env`. Not inline node https.

---

## Locked principles

1. **Multi-tenant from day one.** Every table: `tenant_id` + RLS. Trade-specific data: also a `trade` column. Phase definitions + module visibility = per-tenant config, not hardcoded. White-label expansion (v4+) is config + sales work, not engineering — only if v1–v3 hold this line.

2. **StructureBuilder is load-bearing for wall merging. Never skip it.** (2026-04-26) Without it: unmerged parallel walls, hallway geometry extends into empty space, door swings float, chain dim Z-line math fails. Any fix that bypasses StructureBuilder trades floor plan accuracy for scan reliability — stop and discuss first.

3. **AI never invents rates without citation.** `NULL base_rate` on `takeoff_unit_costs` is intentional — wizard shows "REP MUST ENTER." Never backfill with derived or estimated values.

4. **Schema verification required. Commit ≠ applied.** Every migration: `information_schema.columns` check + `NOTIFY pgrst, 'reload schema'` + `pg_policies` check. Three incidents on 2026-05-02. Do not declare shipped until rows confirm. **When DROPping a table, also audit `pg_policies` for any policy referencing it — RLS policy deps are invisible to the FK query but will block the DROP.** (2026-05-06)

5. **Tenant override precedence.** Platform defaults: `tenant_id IS NULL`. Tenant rows override via `DISTINCT ON` + `ORDER BY tenant_id NULLS LAST`. Never rely on app-side fallback when the DB query can enforce it.

6. **`.insert()` vs `.upsert()`.** New-rows-only helpers use `.insert()`. `.upsert()` on insert-only paths silently triggers UPDATE RLS evaluation and fails. (2026-05-01, jobs INSERT RLS fix.)

7. **Built-but-not-wired components exist. Do not treat as dead code.** Current list: `FloorPlanEditor.jsx` (at `src/components/ai/FloorPlanEditor.jsx` and `src/components/floorPlan/FloorPlanEditorScr.jsx`). Outstanding design decisions before rewiring. (`MaterialSelectionScr.jsx` removed from this list 2026-05-27 rot sweep — file confirmed absent from codebase.)

8. **Two-file memory split.** CLAUDE_MEMORY.md = lean working memory. CLAUDE_ARCHIVE.md = full LOG history by slug. Established 2026-05-03 after memory bloat caused three schema claim failures.

9. **ai_error_logs ranking discipline.** When triaging ai_error_logs by volume, filter `last_seen >= NOW() - INTERVAL '30 days'`. The April 14–26 ai-home-companion billing outage left 499 stale rows that otherwise dominate every ranking. (2026-05-12)

10. **Silent-failure ranking discipline.** Diagnostics rank symptoms, not bugs. Before queueing a fix slice from an ai_error_logs / failed_intents diagnostic, spend 5 minutes auditing the actual code path. The 2026-05-12 master-agent bundle dispatched a Sonnet slice that found existing guards already in place. (2026-05-12)

11. **tenant_id discipline — INSERT must be explicit.** Every INSERT into a tenant-scoped table MUST include `tenant_id` explicitly. Postgres and RLS do NOT inject it automatically. Two drift instances found on 2026-05-27: (a) `sbAddSubInvoicePayment` JS helper omitted `tenant_id` on the `sub_invoice_payments` insert — fixed in Phase 4a by DB function sourcing it from `sub_invoices.tenant_id`. (b) `job_transactions` insert inside the same function required explicit `tenant_id` too. Pattern: when building helpers that write to tenant-scoped tables, always verify the INSERT payload includes tenant_id before shipping.

---

## Schema reality (verified 2026-05-05; partial re-verify 2026-06-10)

*Authoritative DB facts — verified against `information_schema`. Do not contradict without re-verifying.*

**Schema drift notes (audit 2026-06-10):**
- `job_lidar_scans.scanner_version` is selected in `normalize-scan/index.ts:345` but the column does not exist in DB — pre-existing read drift, inert on the current code path. Fix when next touching normalize-scan.
- **pg_cron active jobs (verified 2026-06-10):** `anti-surprise-dispatcher` (*/15 min), `anti-surprise-generator` (03:00 daily), `sequence-runner` (*/15 min), `vigilance-runner` (11:00 daily).
- **`todos.source_check`** (migration 20260610000001): allows `'manual'`, `'engine'`, `'vigilance'`.

- **Phase 3 DROPs (2026-05-06):** `invitations_to_bid` view, `itb_invitees`, `quote_requests`, `bid_responses` (legacy), `bids`, `sub_pricing_changes`, `job_subs` — all dropped. `engagement_bids` and `job_sub_engagements` are the canonical engagement schema. RLS policies on `job_messages` and `schedule_items` updated to reference `job_sub_engagements` in the same migration.
- **`jobs.client_user_id` (uuid) EXISTS and is actively used** — `supabase.js` (job load + `sbNotifyUser`), `ClientPortal.jsx` (job query + Realtime subscription filter), `MessagesTab.jsx` (email-on-new-message). Do not NULL it carelessly.
- **`profiles.onboarding_completed` (boolean) EXISTS.** 2026-04-29 migration did ship for this column.
- **`sub_pricing` reschema confirmed live.** Columns: `id`, `sub_id`, `tenant_id`, `trade`, `pricing_mode`, `unit`, `rate`, `notes`, `created_at`, `updated_at`. Single row per (sub, trade) with `pricing_mode` enum — no materials/labor split.
- **No `sub_invitations` table exists or ever did.** `send-invite` calls `inviteUserByEmail()` directly; the invite IS the auth.users creation.
- **`job_sub_engagements` table EXISTS** (Phase 1a, 2026-05-05). Canonical sub-to-job engagement record. Replaces scattered quote_requests / itb_invitees / Assign-to-Project paths going forward. State machine: `invited` → `bid_submitted` → `active` → `completed` plus terminal off-ramps `declined`, `withdrawn`, `removed`. Partial unique index `idx_one_live_engagement` enforces one live engagement per (job_id, sub_id, trade).
- **`engagement_bids` table EXISTS** (Phase 1a, 2026-05-05). Bids attached to engagements. Named `engagement_bids` (not `bid_responses`) to avoid collision with the existing ITB/quote `bid_responses` table. `idx_engbid_one_current` partial unique index keeps one current bid per engagement; revisions stack as historical rows.
- **`schedule_items.engagement_id` column EXISTS** (Phase 1a, 2026-05-05). Nullable audit FK to `job_sub_engagements`. Stamped on schedule items created from accepted bids; old items remain null.
- **`draw_schedules` table EXISTS** (Invoicing Phase 1, 2026-05-06). Planned billing schedule per job. Lifecycle: planned → in_progress → paid (or cancelled terminal off-ramp). Unique on (job_id, draw_number).
- **`invoices` table EXISTS** (Invoicing Phase 1, 2026-05-06). Billing documents. Per-tenant unique invoice_number (format INV-YYYY-NNNN, generated by next_invoice_number function). Status lifecycle: draft → sent → viewed → paid (with partially_paid intermediate, void terminal off-ramp, overdue auto-derived).
- **`invoice_line_items` table EXISTS** (Invoicing Phase 1, 2026-05-06). Composable invoice details. source_type tracks origin (estimate_line_item / change_order / manual). phase carried for budget actuals match.
- **`job_transactions.invoice_id` column EXISTS** (Invoicing Phase 1, 2026-05-06). Nullable audit FK. Stamped on Stripe webhook reconciliation when an invoice is paid.
- **`ai_knowledge.created_by` column EXISTS** (added 2026-05-09 via migration `20260509120000_ai_knowledge_created_by.sql`). UUID FK → profiles(id) ON DELETE SET NULL, nullable. Live columns: `id, tenant_id, category, content, active, created_at, created_by`. RLS shipped 2026-05-17 via `20260517120000_ai_knowledge_rls.sql`. 4 policies: select (tenant_id), insert/update/delete (tenant_id + owner role). Direct-client access now tenant-isolated. Service-role usage in edge fns unaffected.
- **`pending_tasks` table DROPPED** (2026-05-09 via migration `20260509180000_drop_pending_tasks.sql`). Master Agent v2 retired the queue layer in favor of a persistent chat panel. 8 rows existed at drop time, all smoke-test artifacts. Resulting entities (job_transactions, change_orders, jobs, todos) live in their own tables and were unaffected — only audit metadata was intentionally lost. CASCADE removed any FK dependents. Do not recreate without explicit approval.
- **ai-master-agent has 28 tools** (last updated 2026-06-10 — 4 read tools added in AGENT_READS Slice 1): get_jobs, get_team, **get_job_financials, get_schedule, get_open_todos, get_alerts** (new), create_job, update_job, add_contact, send_client_portal, invite_person, add_note, advance_phase, update_phase, submit_change_order, log_payment, log_receipt, notify_team, add_todo, add_knowledge, notify_team_member, create_schedule_item, log_sub_invoice, log_sub_payment, approve_sub_invoice, upload_company_file, record_deposit, compose_draw. Read tools (get_*) are exempt from the tool-payload drift checker (no insert payloads). Drift tool still covers all write tools.
- **`CONFIRM_TOOLS` is a 13-verb set** (last updated 2026-05-28 — record_deposit + compose_draw added in COST_PLUS_ARC Phase 5): log_payment, log_receipt, submit_change_order, add_todo, create_job, notify_team_member, create_schedule_item, log_sub_invoice, log_sub_payment, approve_sub_invoice, upload_company_file, record_deposit, compose_draw. Every member returns `pending_action` and surfaces a Confirm card before the row is written.
- **`job_estimates` consultation columns EXIST** (2026-05-12 via Shape C migration). New columns: `session_id UUID → consultation_sessions(id)`, `created_by UUID → profiles(id)`, `estimate_data JSONB` (structured AI estimate output from Consultation flow, distinct from `messages` which holds Estimator chat transcript), `total NUMERIC`, `source TEXT` (currently 'ai_consultation'). UNIQUE on `job_id` retained — Estimator and Consultation upsert onto the same row, non-overlapping field sets. Multi-source split deferred.
- **`scheduled_actions` table EXISTS** (AGENT_OPS Phase 1.1, 2026-05-20). Agent's own todo list — reminders, self-followups, watchdog detections. 21 columns: id, tenant_id, kind (reminder/followup/watchdog), status (scheduled/fired/cancelled/failed), priority (low/medium/high — Phase 1.2 migrated from 4-level spec to match todos canonical enum), fire_at, fired_at, cancelled_at, retry_count (INTEGER DEFAULT 0), created_by_id (NOT NULL FK→profiles), target_user_id (nullable FK→profiles), related_job_id (nullable TEXT FK→jobs), related_todo_id (nullable UUID FK→todos), related_entity_type, related_entity_id, payload (JSONB DEFAULT '{}'), result, rule_key, source (agent/watchdog_cron/system DEFAULT agent), created_at, updated_at. 4 indexes (2 partial). 3 RLS policies — no DELETE policy (use status='cancelled'). Migrations: 20260520100000_scheduled_actions.sql (create), 20260520110000_scheduled_actions_priority_3level.sql (enum fix). Helpers: sbCreateScheduledAction, sbListScheduledActionsForUser, sbCancelScheduledAction.
- **`daily_logs` has 3 AGENT_OPS columns** (Phase 1.2, 2026-05-20): `phase_on_schedule BOOLEAN`, `delay_days INTEGER`, `issues_flagged TEXT` — all nullable, backward-compatible. Patched by daily-log conversation hook in Phase 6. Migration: 20260520120000_daily_logs_agent_ops_columns.sql.
- **`trade_material_lead_times` table EXISTS** (AGENT_OPS Phase 1.2, 2026-05-20). Per-trade material lead time thresholds. Tenant override → platform default (tenant_id NULL) → fallback 7 days. 4 Avenstone seed rows (canonical trade strings verified against trade_phase_map: 'Cabinets / vanities - Install' 21d, 'Tile - Floor' 14d, 'Tile - Wall / shower' 14d, 'Plumbing - Finish / fixtures' 14d). Migration: 20260520130000_trade_material_lead_times.sql. Helper: sbGetTradeLeadDays.
- **bug_reports.status CHECK extended** (AUTO_FIX_ARC Phase C, 2026-05-21). New values added: 'reported', 'attempting', 'auto_fixed', 'auto_fix_failed', 'auto_fix_unknown', 'needs_human'. Existing values retained: 'open', 'in_progress', 'fixed', 'wontfix'. Full live set (10 values, verified 2026-05-27): open, in_progress, fixed, wontfix, reported, attempting, auto_fixed, auto_fix_failed, auto_fix_unknown, needs_human. Dispatcher acts on 'open' (submit-bug-report insert value). Migration: 20260521000000_bug_reports_status_extend.sql.
- **auto_fix_attempts table EXISTS** (AUTO_FIX_ARC Phase C, 2026-05-21). Audit log for every dispatcher invocation. Columns: id, bug_id (FK→bug_reports), classification, reasoning, fix_prompt, vm_dispatch_status, vm_response (JSONB), created_at. RLS: platform_owner SELECT only. One row per classifier call. Used for one-try-per-bug enforcement (COUNT check before dispatch) and global 24h rate limit (COUNT where created_at >= 24h ago). Indexes: bug_id, created_at DESC. Migration: 20260521010000_auto_fix_attempts.sql.
- **notifications_type_check extended with 'todo_delegated'** (AGENT_OPS Phase 2.1, 2026-05-20). Migration: 20260520140000_notifications_type_todo_delegated.sql. notify-email SUBJECTS map updated with subject "You've been assigned a new todo".
- **notifications_type_check extended with 'team_alert' and 'master_agent' reinstated** (AGENT_OPS Phase 2.2, 2026-05-20). Migration: 20260520150000_notifications_type_team_alert.sql. `master_agent` was inadvertently dropped in Phase 2.1's migration — reinstated. `team_alert` is the type for `notify_team_member` verb.
- **on_notification_insert trigger now has priority gate** (AGENT_OPS Phase 2.2, 2026-05-20). Migration: 20260520160000_notification_email_trigger_priority_gate.sql. Trigger recreated with `WHEN (NEW.email_sent IS NOT TRUE)`. Priority gate contract: executor sets `email_sent = priority !== 'high'` at INSERT time — high priority emails; medium/low do not. Verified in pg_trigger via `pg_get_triggerdef`.
- **ai-master-agent had 17 tools at Phase 2.2** (2026-05-20, superseded — see current count above). Added `notify_team_member` (CONFIRM_TOOLS). Superseded — current count maintained in the 24-tool entry above.
- **`trg_notification_push_fanout` trigger EXISTS on `notifications`** (PUSH_NOTIFICATIONS_ARC Phase 5, 2026-05-24). AFTER INSERT, calls `fn_notification_push_fanout()` which async-invokes `notification-push-fanout` edge fn via `net.http_post`. Independent from `on_notification_insert` email trigger — both fire on every INSERT. 1 other pre-existing Dashboard trigger on notifications: `on_notification_insert_sms`. `on_notification_insert_push` was dropped in ANTI_SURPRISE_ENGINE_ARC Phase 0 (commit 9e6173b).
- **`push_subscriptions` is now dual-channel** (PUSH_NOTIFICATIONS_ARC Phase 1, 2026-05-23). Columns: `id, user_id, channel ('web'|'apns'), endpoint, p256dh, auth, apns_token, created_at`. Two partial unique indexes: `idx_push_sub_web_unique` on (user_id, endpoint) WHERE channel='web'; `idx_push_sub_apns_unique` on (user_id, apns_token) WHERE channel='apns'. `channel_payload_check` enforces web rows have endpoint+p256dh+auth (apns_token NULL) and apns rows have apns_token only. 7 existing rows backfilled to channel='web'. Migration: 20260523100000_push_subscriptions_dual_channel.sql.
- **`field_opus_messages` table EXISTS** (FIELD_OPUS_ARC Phase 1, 2026-05-24). Columns: id UUID PK, thread_id UUID NOT NULL, role TEXT CHECK (user/assistant/system/dispatch_result), content TEXT NOT NULL, meta JSONB DEFAULT '{}', created_at TIMESTAMPTZ. Single index on (thread_id, created_at). 4 RLS policies all gated by auth.uid() = Kalin's UUID literal (8171742a-b586-4f13-be61-744e191a1896). v1 uses a single hardcoded thread_id (11111111-1111-1111-1111-111111111111) — multi-thread deferred. Migration: 20260524110000_field_opus_messages.sql.
- **`field_opus_dispatch_queue` table EXISTS** (FIELD_OPUS_ARC Phase 4, 2026-05-24). Columns: id UUID PK, thread_id UUID NOT NULL, message_id UUID NOT NULL FK→field_opus_messages(id) ON DELETE CASCADE, prompt TEXT NOT NULL, status TEXT CHECK (queued/dispatched/completed/failed/cancelled) DEFAULT 'queued', dispatched_at TIMESTAMPTZ nullable, completed_at TIMESTAMPTZ nullable, commit_hash TEXT nullable, result_text TEXT nullable, error_text TEXT nullable, created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ NOT NULL. 2 custom indexes (idx_field_opus_queue_in_flight partial on in-flight rows, idx_field_opus_queue_thread). 4 RLS policies Kalin-only. updated_at trigger trg_fodq_updated_at. Migration: 20260524120000_field_opus_dispatch_queue.sql.

---

## Financial locked decisions

- `job_transactions` is single source of truth for all money movement.
- `cost_plus` is visibility-only — no pricing logic changes.
- Lien waivers are warnings, not hard blocks.
- Commissions are transactions (`type='commission'`, `direction='out'`).

---

## Active open items

*Outstanding decisions or deferred work — do not assume resolved.*

~~**TEST_DATA_NONUUID**~~ — CLOSED 2026-06-10. Deleted via migration 20260610190000. See LOG.

**SCHEMA_SMELL_JOBS_ID_TEXT** — `jobs.id` is typed as `text`, not `uuid`. The column accepted `test-flow-001` because text has no UUID format constraint. Any FK writer that casts `job_id::uuid` will fail on text-id rows. Low risk now (all remaining jobs have UUID strings). Evaluate migration to `uuid` type during Model B white-label work — not urgent, but should happen before a second tenant is onboarded.

**Future arcs (named, sequenced — each needs a blueprint MD before building):**
- `SUB_WORKFLOW_ARC.md` — daily logs, progress photos tied to phases, in-app payment requests + lien waivers, schedule conflict surfacing, sub availability calendar, multi-job dashboard. Sub portal is half-blind to field reality without subs engaged daily.
- `ANALYTICS_ARC.md` — gross margin by trade across jobs, avg days per phase, sub reliability scoring, supplier delivery performance, CO frequency, profit/loss reports. Data already in DB, just needs query layer + dashboards. Also home for EXECUTION_ARC Phase 9 (learning loop rate overrides).
- `DOCUMENT_MANAGEMENT_ARC.md` — unified documents surface: lien waivers, signed proposals, contracts, COIs, permits, inspection reports all in one place.
- `MOBILE_AUDIT_ARC.md` — phone-first UX pass on every existing screen. Walkthrough mode is mobile-first; rest of app is desktop-first and needs a pass.
- `VOICE_AGENT_ARC.md` — voice as first-class interface for in-field PM workflows. Reads EXECUTION_ARC data (checklists, todos, schedule items, phase context). See existing VOICE_AGENT.md.
- `SALES_PIPELINE_ARC.md` — leads → qualified → consultations scheduled → proposals → contracts. Currently jobs start at `lead` phase; lead-handling is outside the platform. Open question whether platform should own this.
- `CODE_JURISDICTION_ARC.md` — jurisdiction-aware inspection checklists (KC vs Overland Park, 2018 vs 2021 IRC). Hardcoded starter set is v1; AI-seeded jurisdiction-aware templates are the real moat play.
- `FIELD_OPUS_ARC.md` — Opus-in-the-app dev console for Kalin. Hard-gated to Kalin's auth ID. Conversation interface inside the app, dispatches Sonnet prompts to the AUTO_FIX_ARC VM. 6 phases scoped; blueprint shipped 2026-05-23. Target build: 2026-05-24 morning.
- `AUTO_FIX_ARC.md` — Dev-loop accelerator for the 2-user phase (Kalin + Blake). Gets ripped out before public launch — strictly internal tool, not a product feature.

  **The loop:**
  1. User hits action → action fails → existing error path runs (captureFailedIntent writes amber Resume todo, bug_reports row created, MasterAgentErrorCard renders).
  2. User hits "Report bug" on the error card → bug_reports row marked status='reported'.
  3. **MasterAgent edge fn (ai-master-agent) extended with new path:** Supabase webhook on bug_reports.status='reported' fires the edge fn (or new sibling fn ai-auto-fix-dispatcher).
  4. **Edge fn fetches MDs from raw GitHub URLs** (refs/heads/main pattern): CLAUDE_MEMORY.md, CLAUDE.md, OPUS_RULES.md. Embedded in system prompt as <project_context>.
  5. **Anthropic API Claude call (Opus or Sonnet, decide in blueprint)** reads error context + project context, classifies: backend/edge-fn/DB-safe vs frontend vs iOS vs unsafe-path. Outputs either a fix-ready Sonnet prompt (matching OPUS_RULES.md structure) OR a "needs human" verdict.
  6. If eligible: edge fn POSTs the prompt to Claude Code VM webhook listener.
  7. **Cloud VM runs Claude Code in headless mode** (`claude -p "<prompt>" --dangerously-skip-permissions`). Claude Code auto-loads CLAUDE.md + CLAUDE_MEMORY.md from the cloned repo on the VM. Does iterative audit + fix + build verify + commit + push.
  8. Vercel auto-deploys.
  9. n8n (or edge fn polling) checks Vercel build status. Green → mark bug_reports.status='auto_fixed'. Red → revert commit via GitHub API, mark status='needs_human', notify Kalin.
  10. Linked failed-intent todo updates state: attempting → auto_fixed (green check + Try Again) | needs_human (amber + "Reported to Kalin").
  11. User comes back when ready — 2 min or next day. Taps Resume todo, action re-fires from stored payload, succeeds.

  **Why MasterAgent writes the prompt (not Claude Code's responsibility):**
  Claude Code Sonnet is smart on the codebase but expensive per attempt (iterative tool use, multi-turn). Sending it a generic prompt wastes context. MasterAgent has full project state via fetched MDs and can write a tight, informed, OPUS_RULES-structured prompt that includes scope, audit step, locked-principle reminders, file paths to read first. Claude Code receives a Sonnet-grade prompt and executes — same workflow as Kalin pasting in CMD today, but automated. Expected fix success rate: 60-80% (vs 30-60% for API-Sonnet-only).

  **Locked architecture decisions:**
  - Two-layer split: MasterAgent edge fn = informed prompt writer. Claude Code on cloud VM = smart executor. No middle hop.
  - Cloud VM (NOT Kalin's PC): DigitalOcean basic droplet or Hetzner CPX11, ~$10-20/mo. Multi-tenant SaaS shouldn't depend on dev machine uptime.
  - VM stack: Ubuntu 22.04, Node 20+, Claude Code installed + auth'd, repo cloned + git credentials wired (GitHub PAT scoped to contents:write on this repo only), PM2 keeping webhook listener alive, Cloudflare Tunnel OR direct public IP with firewall rules.
  - VM webhook listener: tiny Node Express app (~50 lines). Receives prompt + bug_id, invokes `claude -p` headless, writes back status to bug_reports via Supabase service-role key, exits.
  - One-try rule: ONE auto-fix attempt per bug_reports row, ever. Failed attempts escalate to Kalin. No retry loops.
  - n8n: still useful as orchestration layer for Vercel polling + Slack/notification dispatch, but no longer the executor. Optional — could be replaced by Supabase Edge function cron OR a tiny side process on the VM. Decide in blueprint.
  - Spinner UX REMOVED: user doesn't wait on screen. Fix happens in background; user notified via todo state change + push notification when ready.
  - Reuse existing infrastructure: captureFailedIntent + Resume todos + bug_reports + bugContext snapshots. Net-new code is minimal app-side.

  **Locked safety gates:**
  - File allowlist for Claude Code commits: supabase/functions/*, avenstone-vite/src/lib/supabase.js, supabase/migrations/* (extra scrutiny — migrations should require human gate even in auto-mode). DENY: auth code, RLS policy migrations without flag, payments logic, Stripe keys, anything under tools/.
  - Post-commit Vercel build check: red build → automatic revert via GitHub API + Kalin alert.
  - Classifier defaults to "needs human" when uncertain. Bias toward escalation.
  - VM-side: Claude Code's `--dangerously-skip-permissions` flag is required for headless. Hard cap in webhook listener: max 5 auto-fix attempts per hour, max 20 per day. Breached → listener returns 429 to edge fn, edge fn escalates to Kalin.
  - GitHub PAT scope: contents:write on avenstonekc/avenstone-app ONLY. No org-level, no other repos, no admin. Token stored in VM env, never committed.
  - Audit log table (auto_fix_attempts): bug_id, opus_or_sonnet_prompt, claude_code_output, commit_hash, vercel_status, outcome, timestamp. Weekly review checklist for Kalin: pass-rate, regressions caught, regressions missed, API spend.
  - Kill switch: env var on VM (AUTO_FIX_ENABLED=false) instantly disables auto-dispatch. Listener still receives webhooks but returns 503. Bug reports continue normal "needs Kalin" path.

  **Net-new app-side work (small):**
  - TodoCard.jsx enhancement: read linked bug_reports.status, render correct state (attempting/auto_fixed/needs_human).
  - Push notification trigger on bug_reports.status change → 'auto_fixed' or 'needs_human'.
  - Resume button re-fires from failed-intent payload (pattern exists from 2026-05-02 arc — wire to this new entry point).

  **Net-new infrastructure work (medium):**
  - **Phase A (manual, ~4-6 hours first time, less if Kalin's done VPS work before):**
    - DigitalOcean/Hetzner account + payment + droplet provisioning
    - Ubuntu hardening (non-root user, ufw firewall, fail2ban, SSH key only no password, automatic security updates)
    - Install Node 20+, git, Claude Code
    - Authenticate Claude Code (interactive step — has to be done once via SSH)
    - Clone repo, configure git with the scoped GitHub PAT, test a commit + push end-to-end manually
    - Cloudflare Tunnel OR public listener with SSL via Caddy
    - Write webhook listener Node app, wire to Supabase service-role key, install PM2, configure auto-restart on boot
    - End-to-end manual test: curl the webhook with a synthetic prompt → confirm Claude Code runs → confirm commit lands → confirm Vercel deploys
  - **Phase B (1 prompt):** Blueprint AUTO_FIX_ARC.md with full design, system prompts for the dispatcher Claude call, classifier rules, file allowlist definitions.
  - **Phase C (1-2 prompts):** ai-auto-fix-dispatcher edge fn + MD fetch logic + dispatcher Claude call + webhook POST to VM.
  - **Phase D (1 prompt):** Vercel build check polling + revert logic.
  - **Phase E (1-2 prompts):** App-side TodoCard wiring + push notification trigger.
  - **Phase F (1 prompt):** auto_fix_attempts table + simple admin view in BugReportsScr.

  **Estimated total scope after Phase A infrastructure:** 5-7 prompts.

  **Triggers to START building:**
  - Kalin has 4-6 hours fresh + uninterrupted for Phase A VM setup
  - DigitalOcean or Hetzner account ready
  - Anthropic API billing confirmed (will incur usage costs separate from Claude.ai subscription — both the dispatcher Claude calls AND Claude Code's API calls are billed)
  - GitHub PAT generated, scoped to contents:write on avenstonekc/avenstone-app only
  - Kalin has fresh-brain energy — production infrastructure work, not late-night fiddling

  **Do NOT start with anything else queued blocking it.** This is a deep-focus arc, not a between-other-things slice. Path B drift detector refinement (also queued) is independent — can ship before or after this.

  **Rip-out plan (before public launch):**
  - Set AUTO_FIX_ENABLED=false on VM (instant disable, no code change)
  - Drop ai-auto-fix-dispatcher edge fn
  - Drop auto_fix_attempts table
  - Revert TodoCard.jsx to simpler failed-intent-only render
  - Decommission VM (~5 min on DigitalOcean dashboard)
  - Bug reports continue to land in bug_reports table — just no auto-fix attempts. Public users get the standard "Report bug → Kalin reviews" loop.

  **Architecture evolved from earlier-tonight Option A (API Sonnet w/ GitHub MCP) → final design above. The earlier API-Sonnet-only approach is REJECTED — fix quality too low. Do not revisit unless cloud VM proves infeasible for a reason not yet known.**

**Sub portal & financial:**
- ConsultationTab tab retirement
- Auto-bid generation (sub_pricing × takeoff quantity, AI sanity pass)
- Sub password retrofit for existing magic-link-only subs
- Client notification silence at financial events — identified, not fixed
- Sub management consolidation design pass — design doc only, no code. Unifies "Invite sub to bid on job" across Subs Directory invite, Assign-to-Project, and Quote Request → Send Invite flows. Promoted from Future architecture 2026-05-05 after triple-UI pain proved it's not deferable.
- Picker enrichment in unified modal (Phase 2): show per-sub schedule load badge ("2 active jobs · 3 items next 14d"), trade-match indicator, last-engagement-age. Optional Haiku-cheap AI summary on hover. Anti-Surprise alignment — flag overcommitted subs before invite, not after. Captured 2026-05-05.

**Takeoff wizard:**
- Step 5 kitchen scope subsets + detail forms
- Step 8 procurement view from `estimate_line_items`

**App infra:**
- VOICE_AGENT Phase 3/4 on-device verification pending next Codemagic TestFlight build.
- URL-based routing (`selJ` is React state — no deep-link, refresh loses position)
- Todo push notification (personal, non-delegated) not yet wired. Delegated todo push (`type='todo_delegated'`) ships via fan-out trigger (PUSH_NOTIFICATIONS_ARC Phase 5, 2026-05-24) — send-push now has callers.
- Dev auto-login removal before external testers
- Drift detector (2026-05-10 first run; all 15 findings now cleared as of 2026-05-12). Final fix arc: contacts 3 cleared 2026-05-13 (full_name→name rename, drop project_type/description); job_notes 2 cleared (drop note_type, rename created_by→author); todos drift closed 2026-05-13 (see LOG below); job_estimates 6 cleared via Shape C migration + ConsultationTab upsert fix. **Drift count: 0.** Re-run `npm run audit:schema` from `avenstone-vite/` after any new table or column work. Detector Phase 2 shipped 2026-05-13 — skipped now 9 (was 34 at Phase 1 baseline, 15 after Phase 1). Remaining 8 skipped are function parameters (no call-site analysis), 1 is dynamic .from() (opaque). No new drift surfaced by Phase 2 extension. Missing-tables arc 2026-05-19: 4 findings → 1 STOP (see LOG). **Scanner missing-tables: 0** (quote_requests ref was in retired ai-pm-nightly — closed 2026-06-10). Write/read drift 0, write skipped 0. **Detector Phase 3 shipped 2026-05-27** (Bucket A: array-of-ObjectExpression batch-insert resolution; Bucket C: intentional-skips docs block). Write-skipped now 0, read-skipped 1 (field-opus-db-query dynamic table — intentional).

- **Open drift findings (2026-05-27 scan — all closed):**
  - **Write drift: 0** — `notifications.priority` both halves fixed: field-opus-result-webhook:106 (dd1a78b) + supabase.js:2406 (62c5d6f).
  - **Missing tables: 0** — failed_intents stubbed 2026-05-28; quote_requests ref closed 2026-06-10 (ai-pm-nightly retired).
  - **Read drift: 0** — field-opus-db-query stale refs fixed; `assigned_pm_id` → `assigned_pm` renamed in supabase.js notification fan-out.
  - **Priority: All drift closed.**

- **Tool-payload drift detector refinement (Path B)** — Detector shipped 2026-05-21 in commit 94708e1. Initial run: 14 advertised-not-written findings, all expected false positives in 3 categories:
  1. WHERE-clause keys (e.g. update_job.job_id used in .eq() not .update payload)
  2. Key aliases (e.g. notify_team_member.message written to body column)
  3. Meta-fields / control flow (e.g. also_create_todo controls logic, never written)
  **Manual audit 2026-05-27 confirmed:** All 14 false positives are correct; no real Failure A/B/C exists. The two real BUILD-LITE findings (update_phase.fields description gap + system prompt omission) are documentation-level, not code-level. Detector refinement trigger: wait until noise list grows past ~25 OR a real finding gets buried. Still deferred.

**Components:**
- `FloorPlanEditor.jsx` — built, UX decision outstanding before rewiring (see also Locked Principle #7 for paths)
- ~~`MaterialSelectionScr.jsx`~~ — removed from list 2026-05-27 rot sweep; file absent from codebase

---

## Backlog

*Deferred work to ship eventually — not a frozen list, add/remove as arcs land. Lives here so it survives conversation resets.*

- VOICE_AGENT v1.5: verb 5b (`complete_schedule_item` with photo gate) — gates AGENT_CARDS_ARC Phase 5
- AGENT_CARDS_ARC build (planning doc shipped 2026-05-08; build deferred)
- Helper-shape sweep beyond v1 (`sbUpdateTransaction`, etc.)
- Trade-neutral system prompts (Field still mentions "residential construction")
- CO surface in client portal (no CO tab today)
- Tenant-configurable vendor → type mapping for receipt extraction (Avenstone-only v1)
- Tool description tightening from 2026-05-09 receipt-fix LOG
- Auto-escalation on overdue draws (#7 from Master diagnostic)
- `phase_pct_complete` rollup audit (#8 from Master diagnostic)
- Duplicate person detection on invite (#4 from Master diagnostic)
- VOICE_AGENT Phase 3+ (native iOS STT/TTS/hands-free)
- Generalize the receipt-photo server-side stash (2026-05-09) if a second confirm verb needs to bind a user-uploaded artifact. Vision content blocks reach the model for reasoning but aren't accessible as text the model can quote into tool_use input — hence the `extractLatestUserImage` injection in `ai-master-agent`. If a second verb (e.g. attach signed contract image to log_payment) hits the same wall, refactor into a generic `attachUserBinaryToConfirmInput(blockType, paramKeys)` helper
- Tool-schema vs insert-payload mismatch detector — extend `tools/audit_schema_vs_code.js` to walk edge-fn `input_schema.properties` and cross-reference against the executor's actual `.insert()` payloads. Catches the silent-LLM-token-waste class surfaced by 2026-05-12 job_notes cleanup (note_type advertised in tool schema, dropped on insert).
- Drift detector enhancement — Phase 1 shipped 2026-05-12 (decodes `.map()`/`.flatMap()` callback payloads). Phase 2 shipped 2026-05-13 (decodes ObjectPattern-rest `const {..., ...patch} = x || {}` + ConditionalExpression branch union). Phase 3a shipped 2026-05-19 (binding.kind=param early return + sbUpdateScanOverrides static refactor). Phase 3b shipped 2026-05-27 (Bucket A: array-of-ObjectExpression batch-insert resolution; Bucket C: intentional-skips docs block). Skipped: 34 → 15 → 9 → 0. CLOSED.
- Capture-time incomplete-scan detection — RoomPlan is returning wall-segment rings with multi-foot gaps (missing wall captures). The 2026-05-17 stitcher fix makes rendering robust, but the rep should be warned at scan time when a room's segment ring has a gap > ~3 ft so they can rescan that wall. Anti-surprise alignment — catch the bad scan in the field, not in the office PDF.
- TODO_NOTIFICATIONS_ARC (blueprint shipped 2026-05-28, see TODO_NOTIFICATIONS_ARC.md) — notify on todos assigned-to-me-by-others OR written by master agent (NOT self-created); high-priority → push; tap → deep-link to the todo. 3–5 prompts, audit-first. On-thesis: agent surfacing work proactively.

---

### Future architecture (design-only, not building yet)

- **RAG-based archive retrieval** — Embed archive entries to Supabase pgvector, retrieve top 3-5 relevant on session start instead of static load. Per-session tokens drop from ~3K to ~500-2000. Trigger to build: archive >50K tokens, first non-Avenstone tenant, or first session where missing context bites. Estimated 2-3 days. Captured 2026-05-03 — review before building.

- **Sub management arc** — Multi-step sub system tightening. Step 1: filter schedule item modal sub dropdown by trade match (currently shows all assigned subs regardless of trade). Step 2: auto-populate when exactly one approved sub matches. Step 3: lock definition of "approved sub" (minimal / insurance-gated / relationship-gated). Step 4: tenant-level sub roster screen (separate from per-job SubsTab). Step 5: sub-side acknowledge button on schedule items + `sub_acknowledged_at` column. Steps 1-2 are 40 lines total. Steps 3-5 is a real arc. Captured 2026-05-03.

- **Speed/cost audit candidates** — (a) sequential sb*Load calls on tab mount could parallelize with Promise.all, (b) edge functions probably on Sonnet where Haiku would suffice, (c) `select('*')` sweep to targeted columns, (d) Vite code-splitting + lazy-loading LiDAR/PDF heavy modules, (e) LiDAR scan storage lifecycle (no cleanup today). None urgent. Captured 2026-05-03.

- **Failed-attempts log** — Today the archive captures successful ships only. Wrong hypotheses, dead-end audits, reverted experiments don't get slugs. Add discipline + format: every wrong hypothesis or reverted approach gets a slug suffixed `-failed`. First-class entries. Captured 2026-05-03.

- **CLAUDE_INDEX.md categorized lookup** — Build only if real friction justifies it after archive chunks 4-5 ship. Small file (~200 lines), three categories: function (app area), date (chronological), failure pattern. Each line: `YYYY-MM-DD · slug-name`. Slugs can appear in multiple categories. Future Claude reads index first, identifies relevant category, jumps to specific slugs in archive — saves 5-15K tokens per session needing historical context. Discipline enforced via OPUS_RULES rules added 2026-05-03. Live with slug pointer index for a week first; build INDEX only if friction is real. Captured 2026-05-03.

- **Sales approach MD (white-label positioning)** — Frame the platform as the operations equivalent of what the dot-com era did for reach: 100× cheaper and easier to manage a contracting business and limit mistakes. Anti-Surprise Engine as the core promise. White-label tenant pitch lives here. Trigger to write: when platform has shippable second-tenant capability AND Kalin has 2-3 hours fresh to draft with real customer voice. Captured 2026-05-03.

- **Blueprint-first workflow for new features** — When starting something new: discuss → produce a small per-feature blueprint file (not a whole-app design doc) → prompts get written off that blueprint with audits as needed. Goal: less memory drift, less "we lose hard work mid-session," more cross-session continuity through documented design intent. NOT a locked rule yet — brainstorm whether this should be the standard pattern or stay informal. Trigger to revisit: when starting the next feature arc fresh (invoicing, voice agent, etc.), test the pattern there and decide. Captured 2026-05-05.

- **Private repo migration plan (deferred — pre-public-launch)**
  When avenstonekc/avenstone-app flips from public to private, two paths break:
  1. Web-chat Opus loses `web_fetch` access to MDs (raw.githubusercontent.com 404s on private repos).
  2. ai-auto-fix-dispatcher edge fn loses GitHub fetch of CLAUDE_MEMORY/CLAUDE.md/OPUS_RULES for classifier context.

  **Migration plan when triggered:**
  1. Update ai-auto-fix-dispatcher edge fn to use authenticated GitHub fetch — add `Authorization: Bearer <GITHUB_PAT>` header on the fetch calls. PAT already has `contents:read` scope. Code change ~10 lines.
  2. Decide web-chat sync strategy:
     - Option A (simplest): revert to manual project knowledge uploads. ~5 min friction per session, no infrastructure.
     - Option B (real infrastructure): build a Cloudflare Worker that proxies GitHub API with auth. Worker URL is public, Opus fetches from the Worker, Worker fetches from private GitHub with stored PAT. Real engineering but eliminates the upload friction permanently.
  3. Update OPUS_RULES.md "Session-start state sync" rule to reference new fetch URLs (Worker URL if Option B, or remove rule if Option A).
  4. Update CLAUDE_MEMORY.md noting migration date and chosen strategy.

  **What stays working without changes (verified 2026-05-23):**
  - VM git pull/push (already uses PAT auth, repo visibility irrelevant)
  - Vercel auto-deploy (GitHub integration, auth via OAuth not visibility)
  - GitHub Actions edge fn deploys (token-based, not visibility-based)
  - Supabase Database Webhook → dispatcher (doesn't touch GitHub)

  **Trigger to act:** ~2 weeks before first paying customer signup, OR when a security review requires private repo, whichever first. Until then, public + free velocity wins.

  **Out of scope for migration slice:** changing secret storage, rotating credentials, audit log redesign — all separate concerns.

- **GOD_MASTER_AGENT (working name)** — Platform-level meta-agent that lives ABOVE Avenstone. Avenstone-for-GC is the first tenant; painter/tile/roofer/others are tenants the GOD agent provisions via interview-driven configuration. Captured 2026-05-20 in late-session brainstorm. Framing LOCKED below; architecture decisions deferred to a dedicated blueprint session AFTER the build sequence below completes.

  **Locked framing:**

  1. **The GOD agent is NOT inside Avenstone.** It lives above. Avenstone-for-GC is the first instance. Other trades are future instances the GOD agent provisions.

  2. **Avenstone-the-app is a feature catalog.** Every feature shipped becomes a tile the GOD agent can offer or withhold per tenant.

  3. **The interview IS the config engine.** Don't pre-build hand-tuned configs for each trade. The GOD agent conducts a deep interview (trade, team size, workflow, oh-shit moments, financial preferences, branding). Interview answers map to feature flags + AI tier + trade-specific phase configs. AI generates the tenant config from the answers. New trade arriving? Same interview, different answers, different config. No new per-trade engineering required.

  4. **The interview can be conducted by AI OR by a human salesperson.** Self-serve: prospect clicks a link, talks to the GOD agent directly. Sales-assisted: Kalin (or future salespeople) get the questions from the agent and ask them on a call, feed answers back. Same intake, different conduit. Sales motion flexes by deal size.

  5. **Prospect gets a working preview tenant.** Dumbed-down version with sample data, real configured features. They play before they pay. Convert to paid → demo data archived or migrated, real data begins.

  6. **Pricing is per-feature AND per-AI-tier.** Some tenants want manual CRM with no AI (cheap). Some want maxed-out MasterAgent (premium). Same codebase, different feature flags + AI capability + token allowance per tenant. Token cost flows through to tenant pricing (Anthropic charges Kalin per token; tenant pays through tiered pricing that includes margin on those tokens).

  **Why this design works (Kalin's strategic insight):**
  This is the AVENSTONE_VISION v4+ white-label play arriving via AI rather than manual sales. Combined with interview-driven config generation, the moat is: (a) AI-as-a-feature (gating intelligence levels, not just UI), and (b) zero per-trade engineering (interview generates configs, no hand-tuning per trade).

  **Locked sequencing (HONOR THIS ORDER):**

  STAGE 1 (next): **AUTO_FIX_ARC ships.** Bug killer runs while Kalin tests + finishes Avenstone-for-GC. Auto-fix catches backend bugs silently; frontend bugs route to Kalin. Two birds: bug killer gets battle-tested AND Avenstone-for-GC converges faster because Kalin isn't the bottleneck on every backend fix. See AUTO_FIX_ARC queue entry (separate, already locked).

  STAGE 2: **Finish Avenstone-for-GC.** Ship to a real paying customer (beyond Kalin + Blake). Every feature shipped is one more tile the GOD agent can offer at intake. Every locked principle is one more constraint the GOD agent respects.

  STAGE 3: **GOD_MASTER_AGENT arc kicks off.** First blueprint session scopes ONLY the feature catalog data model (how features are defined, gated, surfaced to the interview engine). Everything else nests under that foundation.

  **What stays unresolved (decide in blueprint, NOT tonight):**
  - Feature catalog data model — table schema, metadata, gating mechanism
  - AI tier model — Haiku/Sonnet/Opus per tenant, token allowances, overage handling, fallback behavior
  - Pricing economics — does per-feature × per-tier math support API + infra costs at scale?
  - Interview design — length, depth, branching, when to stop, how to recover from bad answers, how to surface trade-off questions clearly
  - Config generation prompt design — how the AI translates interview answers into trade_phase_map + trade_taxonomy + ai_knowledge seeds + module visibility + branding
  - Demo data synthesis — realistic fake jobs per trade (AI-generated from interview context, time-limited)
  - Preview-to-paid lifecycle — billing trigger, data retention if no conversion, upgrade UX
  - Multi-tenant hardening — RLS audit, isolation testing — ships BEFORE prospects touch live system
  - Marketing surface — where the link lives (separate marketing site? In-product? Both?)
  - Sales pipeline integration — prospect → qualified → signed → activated (overlaps SALES_PIPELINE_ARC in backlog)
  - Relationship to AUTO_FIX_ARC at production scale — auto-fix during preview is dangerous (bugs visible to prospects, cross-tenant blast radius). File allowlist becomes much stricter than the dev-tool version. Per-tenant feature flags may need to gate auto-fix scope.

  **Honest scale assessment:**
  - Multi-month build after Avenstone-for-GC is shippable
  - Likely 6-12 months of focused effort layered over GC stability
  - Multiple nested arcs (TENANT_PROVISIONING, FEATURE_CATALOG, AI_TIER, DEMO_DATA, TENANT_LIFECYCLE, MULTI_TENANT_HARDENING, MARKETING_SITE, the GOD agent itself)

  **AUTO_FIX_ARC relationship:**
  AUTO_FIX_ARC stays AS-IS scoped (dev tool for Kalin + Blake during Avenstone-for-GC build). It will likely EVOLVE into a production safety net during GOD-driven onboarding, but that's a future merge decision under Stage 3 blueprinting — not assumed now.

  **Trigger to start STAGE 3 (the GOD agent itself):**
  When ALL of these are true:
  (a) Avenstone-for-GC ships to a real paying customer beyond Kalin + Blake
  (b) AUTO_FIX_ARC has been running long enough to have a real success-rate track record (4+ weeks of data)
  (c) Kalin has 2-4 fresh dedicated sessions for foundational blueprinting
  (d) Financial model for per-feature × per-AI-tier pricing has been sketched on paper

  **What to do between now and Stage 3:**
  Build Avenstone for GC. Ship it. Every feature you finish makes Stage 3 simpler. The cleaner Avenstone-for-GC becomes, the more obvious the feature catalog data model will look in retrospect.

  **First blueprint session priorities (when Stage 3 triggers):**
  1. Feature catalog data model (foundation — everything else nests under this)
  2. Interview design (the second-load-bearing piece — bad interview = bad config = broken tenant)
  3. AI tier model + pricing economics (the business model has to work or none of it matters)
  Everything else (demo data, lifecycle, marketing surface, etc.) sequences after those three are solid.

---

## Working-mode patterns

- **Phase builds for large features.** Foundation (data model, enums, shared modules) → mode logic → UI. Each phase ships working code.
- **Private Supabase buckets.** `job-documents` is private. Never `getPublicUrl`. Always `createSignedUrl` via `sbUploadDoc`/`sbLoadDocs`.
- **Supabase helpers return `{ ok, error, data }`.** `captureFailedIntent` is fire-and-forget, never throws. `sbNotifyUser(userId, type, title, body, jobId)` for targeted single-user; `sbNotify` for broadcast.
- **SVG sizing footgun.** `Ic.*` icons have `viewBox` but no `width`/`height`. Without explicit dimensions default to 300×150px. Always wrap in a constrained container.
- **`flex` default is `align-items: stretch`.** Set `align-items: flex-start` when pills/cards should size to content, not the row height.
- **`todos` status field uses `'done'`, not `'completed'`.**
- **`jobs.id` is TEXT** — all FKs referencing jobs must use TEXT type.

---

## Symptom index (seed entries)

*Add an entry here whenever a debugging session resolves a symptom that's likely to repeat. Format: 'symptom phrase' → cause → archive slug. Triage tool, not exhaustive.*

- "could not find X column in schema cache" → migration committed but not applied. See `schema-claim-incidents · 2026-05-02`.
- "upsert silently fails on existing row, no error surfaced" → swallowed write error or wrong helper shape. See `rls-sweep-2026-05-02 · 2026-05-02`.
- "empty string sent to DATE column rejected silently" → uncoalesced date input. See `date-sweep-2 · 2026-05-02`.
- "icon renders huge or fills viewport" → unconstrained SVG, default 300×150. See `schedule-rebuild · 2026-05-02–03`.
- "phase status reverts after page reload despite UI confirming save" → write rejected, error swallowed by helper. See `rls-sweep-2026-05-02 · 2026-05-02`.
- "Silent error swallow on Supabase queries" → helper/handler returns empty array or null when row should exist; no error surfaced. Cause: helper destructures `{ data }` without checking `error`. Examples: `sbPhoto` storage upload succeeded but DB insert error swallowed (2026-05-08); `get_jobs` returned `[]` because `start_date` column was missing from schema (2026-05-09). Fix pattern: destructure `{ data, error }` and return structured `{ ok, error, data }` shape.
- "Migration drift — column in code, missing from live DB" → PostgREST error "Could not find the 'X' column of 'Y' in the schema cache." Cause: either migration file committed but never applied, OR code references a dropped/renamed column, OR the table was created out-of-band and no migration ever existed. Examples: `change_orders.submitted_by_id` (2026-05-08, redirected to canonical `submitted_by`), `jobs.start_date` (2026-05-09, dropped from query), `ai_knowledge.created_by` (2026-05-09, added via migration — table had no CREATE migration in repo, was created out-of-band). Three instances in 2 days. Fix pattern: query `information_schema` for actual columns; check repo for any CREATE/ALTER migration on that table; apply missing migration OR redirect code to the canonical column.
- "TEXT-id pollution on jobs / FK children" → legacy `jobs.id` rows like `1775938002546` (a `Date.now().toString()`) coexist with proper UUIDs. Cause: pre-UUID create path; `jobs.id` is TEXT type, so the column accepts both shapes. Examples: id `1775938002546` (created 2026-04-11) wiped 2026-05-09. Audit pattern: `SELECT id FROM jobs WHERE id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND id !~ '^test-';` Future schema audit candidate: enforce UUID at the app layer before flipping to a CHECK constraint.
- "agent says 'note added' on todo verb / row landed in job_notes not todos" → master agent missing an `add_todo` tool, so todo intents fell through to `add_note`. (Branch B-1, wrong-tool routing.) Fix: add `add_todo` tool to ai-master-agent mirroring `sbCreateUserTodo` (type=user_task, source=manual) plus system-prompt rule disambiguating todo (action item) from note (passive context). Audit pattern when adding a new verb to MasterAgent.jsx: confirm there's a 1:1 agent tool too — chip flow + agent free-text path are independent code paths and freeform users will hit the second one. See LOG 2026-05-09 below.
- "Resume from PendingTaskList re-shows quick-capture instead of chip flow + creates duplicate pending_task" → `onResume` set `verb` but not `flowActive=true`, so render fell through to QuickCapture. Continue Now then called `sbCreatePendingTask` again. Fix: set `flowActive=true` in onResume. See LOG 2026-05-09 below.
- "duplicate key value violates unique constraint jobs_po_number_tenant_unique on lead create" → DB trigger `set_job_po_number` auto-issued PO numbers for ALL inserts (including leads/proposals) using `COUNT(*) + 1`. After any delete the count goes backward and the next insert collides with an existing po_number. Fix: status-aware trigger (skip lead/proposal — return po_number=NULL), MAX-based numbering (`MAX(SUBSTRING(po_number FROM 4)::INT) + 1`), and partial unique index `WHERE po_number IS NOT NULL`. PO numbers belong to contracts and beyond — not leads or proposals. Migration: `20260509130000_po_number_lifecycle_aware.sql`. See LOG 2026-05-09 below.
- "Resume asks every chip question even when the quick label has the answers" → flow component received `initLabel` but never read it. Each Resume walked the full chip sequence, ignoring `pending_tasks.context.quick_label` content the user already typed at capture time. Fix: parser-on-mount `useEffect` that calls `parseReceiptLabel` / `parseTodoLabel` / `parseLeadLabel` / `parseCOLabel` (regex + keyword, no LLM), seeds per-field state, computes `step = editingField || firstNullField || 'confirm'`, and lands on a single Confirm card with per-field Edit. See LOG 2026-05-09 below + `lib/labelParser.js`. **Superseded 2026-05-09:** the smart-Resume contract and the entire labelParser.js / queue layer were retired in Master Agent v2. Verb inference is now the LLM's job — see `master-agent-v2 · 2026-05-09`.
- "Master Agent flow has too many UX states / Continue-now confusion / redundant chip questions / build-up of unfinished pending_tasks rows" → root cause was the queue-and-chip-flow architecture itself: 4 chip flow components × per-field chip steps × Continue-now/Save-for-later branching × Resume snooze counters × labelParser regex bank × queue table with discard reasons. Each piece fixed a real symptom but the aggregate was overbuilt for a single-tenant tool with one daily user. Fix: chat-first v2. Tiles set `TILE_PREFIXES` into the chat input, the agent (ai-master-agent) infers verb + fields from freeform text, the Confirm card (`pending_action`) is the only commit point. Persistent conversation lives in component state at App.jsx top level. See `master-agent-v2 · 2026-05-09`.

---

## Shipped & archived

*Slug pointers → CLAUDE_ARCHIVE.md. Search `## slug` to retrieve.*

*Archive complete — all chunks committed (1, 2, 3, 4a, 4b, 4c, 5a, 5b, plus helper-error-sweep extracted from current memory). All slug pointers below resolve to populated entries in CLAUDE_ARCHIVE.md. Search by slug heading. Fallback: `git show 7070d65^:CLAUDE_MEMORY.md` returns pre-cleanup file.*

**PDF / LiDAR**
- `lidar-phase1 · 2026-04-15` — Phase 1 confirmed on device; scan persistence to job/contact tables
- `capture-v2 · 2026-04-19` — GPS stamping, exterior AR (soft-ripped 2026-04-26), mandatory height, quality meter (removed 2026-04-26)
- `apr22-cleanup-pdf · 2026-04-22` — CLAUDE.md reconciliation; fixture/object Swift export + PDF render
- `apr23-pdf-naming · 2026-04-23` — Multi-room naming off-by-one fix; 5 PDF improvements
- `pdf-renderer-rewrite · 2026-04-24` — Full rewrite: poché walls, world-mode layout, chain dims, scale bar
- `lidar-multifloor · 2026-04-24` — Multi-floor scan flow: floor picker, floorIndex JS↔Swift, FLOOR_LABELS
- `pdf-13bug-sweep · 2026-04-24` — 13-bug sweep: chain dims, snap, label collision, garage door symbol, TOTAL row
- `pdf-dimboxes-crash · 2026-04-24/26` — Silent crash: `dimBoxes` scoped inside `if`, hoisted to outer `let`
- `pdf-lidar-naming · 2026-04-26` — StructureBuilder restored after skip-experiment broke geometry; area-signature name match
- `pdf-branding-polish · 2026-04-26` — Scan-order naming; logo image; chain edge math; label rotation; swing arc cap
- `apr26-misc-ships · 2026-04-26` — Wall squaring (10° tol), corner gaps fixed, label z-order, swing arc stroke

**Financial**
- `financial-rebuild · 2026-04-23` — Full rebuild Phases 1–6: unified ledger, FinancialsTab, QB CSV export
- `rls-sweep-2026-05-02 · 2026-05-02` — Deprecated table drop; upsert audit (all 7 genuine); bid_responses UPDATE RLS fix

**Sub portal & ops**
- `sub-portal-gap-analysis · 2026-04-15` — PM-Sub chat, phase confirmation, CO submission: spec'd not built
- `sub-portal-phase-audit · 2026-04-26` — CO submitter audit; phase audit columns; inline CO edit; sbNotifyUser
- `sub-onboarding-rebuild · 2026-04-29` — Structured form wizard; sub_pricing reschema; password step; schema-claim audit
- `subs-tab · 2026-04-29` — SubsTab; procurement rename (quote_requests); ITB removed from EstimateTab
- `sequences-sub-ops · 2026-04-26–28` — Manual enrollment + auto-triggers (bid_sent, sub_invited, payment_made, sub_inactive_60d)
- `bid-system-audit · 2026-04-28` — Lump-sum only; `bids` table ghost; no estimate line linkage; shared_doc_ids stub
- `consultation-estimate-restructure · 2026-04-28` — ConsultationTab atoms; EstimateTab 3-sub-tab restructure
- `apr29-cleanup · 2026-04-29` — 7 frontend deletions; 2 edge fn deletions; rate limit; LineItemModal taxonomy picker

**Takeoff wizard**
- `takeoff-scope-design-audits · 2026-04-24–25` — Audits: MaterialSelectionScr dead; ai_knowledge machine-parseable; estimate_line_items no allowance
- `takeoff-schema-foundation · 2026-04-28–29` — pricing_lookup; takeoff_templates (81→59 rows); takeoff_unit_costs; material formulas; bathroom seed
- `trade-taxonomy · 2026-04-29` — trade_taxonomy + tenant_trade_visibility; 43 canonical rows; DB-driven UI; backfill verified
- `takeoff-wizard-build · 2026-04-29–05-01` — Data layer → material lines → UI → Accept & Save → scope tags → detail forms → COMPUTE_FNS → custom lines
- `todo-system · 2026-04-28` — todos table; TodayScr; TodoCard; vigilance-runner first writer (was ai-pm-nightly, retired 2026-06-10); Resume flow

**Schedule / 2026-05-02 work**
- `schema-claim-incidents · 2026-05-02` — Third schema-claim failure; job_phases audit columns applied live
- `failed-intent-retry · 2026-05-02` — captureFailedIntent; payload column; AiPmDashboard "Failed saves" tile; Resume flow wired
- `date-sweep-2 · 2026-05-02` — All user-editable date fields coalesced; 1 fix (date_incurred)
- `schedule-rebuild · 2026-05-02–03` — schedule_items + trade_phase_map; ScheduleTab rewrite; is_primary; subs no longer mark phases

**Other**
- `vision-doc-updates · 2026-04-25` — Multi-owner model; inspection checklists AI-seeded; moat section; white-label advantage
- `disclosed-unknowns-pdf · 2026-04-25` — Disclosed COs in client proposal PDF; oh_shit_moments toggle persistence fix
- `gap-analyzer · 2026-04-25` — ai-consultation-gap-analyzer; GapResolutionModal; oh_shit_moments integration; 3 bug fixes
- `dead-code-audit · 2026-04-26` — 4 dead surfaces; FloorPlanEditor intentionally hidden; MasterAgent confirmed wired
- `notification-audit · 2026-04-26` — Staff-complete; client-silent at financial events; follow-up prompt generated
- `aihome-cleanup · 2026-04-26` — "Brief me" auto-fire removed; SequencesScr wired owner-only
- `apr23-playwright-bugs · 2026-04-23` — reactFill(); ContractModal signed_url fix; codemagic submit_to_testflight:false
- `opus-self-assessment-2026-04-29 · 2026-04-29` — What went well/poorly; sycophancy pattern identified
- `doc-housekeeping · 2026-04-26` — CLAUDE.md trimmed 696→514 lines; Opus/Sonnet delegation model locked
- `consultation-bugs · 2026-04-25` — 3 bugs: measurements guard, jobs.scope field name, ambient flush before mode transition

**Sub engagement & ops**
- `sub-engagement-arc · 2026-05-05–06` — job_sub_engagements + engagement_bids: phases 1-3 + polish. DROPped 7 legacy tables. Role-guard fixes for send-invite + send-client-link.

**Execution arc**
- `execution-arc-2026-05 · 2026-05-06–07` — 14/15 phases: bid availability, material_orders + Materials tab, phase gates + override UI, todo engine, dual-trigger schedule auto-create, notify_sub, site visit checklists, photo gates, trade actuals. Phase 9 deferred to ANALYTICS_ARC.

**Master Agent (2026-05-08–09)**
- `voice-agent-audit-2026-05-08 · 2026-05-08` — Phase 1 prerequisite audit: 8 RED + 5 YELLOW gaps.
- `voice-agent-phase2-hardening · 2026-05-08` — Phase 2: tool layer normalized to {ok,error,data}, receipt-from-photo, smoke repairs, 2-decimal currency.
- `invoicing-arc-2026-05 · 2026-05-05–06` — draw_schedules + invoices schema, pdf-lib PDF, Stripe Checkout, client portal, resend, manual mark-paid, overdue derivation, void+reissue, white-label tenant branding.
- `master-agent-v1-and-v2 · 2026-05-09` — v1 (queue+chips+bug pipeline), v1.1 (smart parsing), v2 (chat-first, queue retired). po_number lifecycle fix. ai_knowledge.created_by migration.

**Drift cleanup**
- `drift-cleanup-arc · 2026-05-10–13` — audit_schema_vs_code.js built. All 15 drift findings closed (15→0). 3 missing tables cleared. submit-bid-response 500→409. Doc cleanup (5 MDs deleted, 2 archived, OPUS_RULES.md rename).

**Unified files + proof + hygiene (2026-05-25–27)**
- `unified-files-arc · 2026-05-26` — 14-slice unified files surface — FilesTab, AI vision categorization, dual-write bridge, mobile camera, tree view, ClientSignContractModal fix
- `proof-arc-phase1-2 · 2026-05-26` — CO photo gate hard from day one with owner/PM bypass + reason audit trail
- `claude-md-hygiene-2026-05-26 · 2026-05-26` — CLAUDE.md leaned, CLAUDE_MEMORY.md leaned, older LOGs moved to CLAUDE_ARCHIVE.md

**Push + Field Opus + Home + tab merges (2026-05-23–24)**
- `arc-logs-2026-05-23-24 · 2026-05-23–24` — PUSH_NOTIFICATIONS_ARC all 5 phases, FIELD_OPUS_ARC all phases, HomeScr merge (Today+AI Home), tab cleanups (Scanner→Consultation, Materials→Financials)

**Calendar + Floor Plan + Scheduling + Files + Proof (2026-05-25–26)**
- `arc-logs-2026-05-25-26 · 2026-05-25–26` — CALENDAR_ARC Phase 1, FLOOR_PLAN_LAYOUT_ARC phases 1–5e, SCHEDULING_ARC slices 1–8, weather widget, UNIFIED_FILES_ARC slices 1–5, PROOF_ARC Phase 1+2

**Sub Invoices + Company Files + Cost Plus + Retainage + Draws + Scheduling v2 (2026-05-27)**
- `arc-logs-2026-05-27 · 2026-05-27` — SUB_INVOICES_ARC all phases, COMPANY_FILES_ARC all phases, COST_PLUS_ARC phases 0–6, RETAINAGE_ARC slices 1–2, DRAW_PACKAGE_ARC slices 1–4, SCHEDULING_ARC v2 slices A–C, UNIFIED_FILES_ARC slices 6–14, misc fixes

**Phase Invoice Arc + Draw fixes + Davis repair (2026-05-28)**
- `arc-logs-2026-05-28 · 2026-05-28` — PHASE_INVOICE_ARC all 4 slices, DRAW_PACKAGE_ARC slice 5 + package fixes, draw delete cascade fix, Davis draw state machine diagnosis + repair

**Schedule item invisible after create (2026-05-28)**
- `schedule-filter-hide · 2026-05-28` — Bug: second schedule item appeared to fail on create (Hemlock test job). Audit confirmed all inserts landed fine in DB (3 rows created within 2 min). Root cause: phaseFilter state was active on Demo phase; newly-created Rough-ins item was added to items[] state and modal closed, but phaseFiltered = items.filter(i => i.phase_id === phaseFilter) excluded it — user saw no change in list. Fix: in handleSaved (ScheduleTab.jsx), on create path, if phaseFilter active and new item's phase_id !== phaseFilter, auto-follow filter to new item's phase (or clear to null if item has no phase). Write path untouched.

**Generated TypeScript types tooling (2026-05-28)**
- `gen-types-tooling · 2026-05-28` — Added Supabase generated DB types as compile-time drift backstop. Files: `avenstone-vite/src/types/database.types.ts` (86 tables, committed), `tools/gen_types.js` (CJS wrapper reads PAT from token file, sets SUPABASE_ACCESS_TOKEN, invokes CLI — same pattern as apply_migration.js), `npm run gen:types` script in package.json. CLAUDE.md documents the regen-after-migration discipline. Types NOT yet wired into createClient or helpers — adoption is a follow-up slice so each conversion is bisectable. Structural backstop for the recurring 42703 drift class. Supabase CLI 2.101.0. `npx supabase login` alone doesn't persist for CLI gen-types on Windows — must pass SUPABASE_ACCESS_TOKEN env var (handled by wrapper script).

**Column drift fix slice (2026-05-28)**
- `column-drift-fix-2026-05-28 · 2026-05-28` — Fixed all open read-drift findings from 2026-05-27 scan. (1) supabase.js: `assigned_pm_id` → `assigned_pm` at 3 sites in notification fan-out (comment + select projection + 2 recipient collectors). PM was silently excluded from all schedule item notifications. (2) field-opus-db-query/index.ts: fixed `recent_bug_reports` (dropped nonexistent `title`, `classification`; using real cols), fixed `recent_auto_fix_attempts` (replaced all 7 stale col names with real schema: `bug_id, classification, reasoning, fix_prompt, vm_dispatch_status, vm_response, created_at`; order by `created_at`), stubbed `failed_intents_last_24h` (table never existed — returns `{ rows: [], note }` instead of crashing). Drift: closed.

**[LOG — 2026-06-04] OWNER_HOME_REDESIGN (commit ae4af2d) — dark hero, thumbnails, clickable rows.**
- Dark navy gradient hero section for greeting + 4 KPI tiles (frosted glass cards on dark, fShort numbers, gold left border, trend chip).
- Active Projects: thumbnail (first photo from photos table or house-icon placeholder), address parsed street+city, compact value, status pill, progress bar, full row click → job detail.
- "View all →" navigates to Projects list. AI Insights: dark card, amber/red alert chips. Company Health: larger numbers.
- sbLoadOwnerDashboard: added parallel photos query, attaches thumbnail_url to activeJobs rows.
- App.jsx: onNavigate={setPg} prop added to OwnerHomeScr.

**[LOG — 2026-06-04] PROJECT_DETAIL_CLEANUP (commit 2062387) — clutter removed, single-scroll flow.**
- "Request a Review" and "Completion Package" banners: were unconditional (showing on ALL tabs for complete jobs). Now gated to `tab === 'info'` — features preserved, off the main surface.
- PhaseAdvanceCard: moved from TOP of InfoTab (was first thing visible) to BOTTOM (above Delete button). Feature preserved, out of the way of the clean header flow.
- Flow is now: navy header → progress % hero → KPI tiles → phase strip → tab bar → clean tab content.

**[LOG — 2026-06-04] ROLE_DASHBOARDS_ARC — PM project detail header (commit 939ace7).**
- `ProjectDetailHeader.jsx` — inserted between existing dark JobDet header and tab bar for owner/pm/sales_rep roles. Sections: (1) progress % hero (from `jobs.phase_pct_complete`) + bar; (2) 4 KPI tiles (Contract Value, Paid to Date + pct, Remaining Balance, Next Milestone); (3) phase strip (real `job_phases` rows as chips, status-colored); (4) PM contact bar (profiles.phone/email, conditional on assignment). All tabs (InfoTab etc.) UNCHANGED.
- `sbLoadProjectDetail(jobId, assignedPmId)` — parallel loads: job_phases, job_transactions (paid sum), schedule_items (next milestone), photos (first), PM profile. Returns `{ phases, paid_to_date, next_milestone, thumbnail_url, pm_profile }`.
- Phase strip recommendation honored: uses real `job_phases` rows, NOT a new phase model. 10 phases: Lead/Proposal/Contract/Demo/Rough-ins/Inspections/Drywall/Finishes/Final touches/Complete. Status colors: complete=green, in_progress=gold, delayed=red, not_started=gray.
- Design note: paid_to_date = SUM job_transactions WHERE direction='in' AND status='paid' (NOT invoiced — only what client actually remitted). Remaining = contract_value - paid_to_date.

**[LOG — 2026-06-04] ROLE_DASHBOARDS_ARC — Leads page redesign (commit f3fd4ac).**
- Data source corrected: was contacts table (sub directory, no address/value). Now: `jobs WHERE status IN ('lead','proposal')` — client_name, address, lead_status, lead_source, contract_value, scope.
- `sbLoadLeads(tenantId)` helper added.
- Desktop table + mobile cards. Status pills: New(blue)/Contacted(amber)/Qualified(green)/Proposal(purple)/Won(indigo)/Lost(red). Filters: status + source (conditional). "All Types" omitted (scope is free text). Avatar: initials placeholder.
- Click row → opens job detail. "+ New Lead" → new job flow.

**[LOG — 2026-06-04] ROLE_DASHBOARDS_ARC — Projects list page (commit 7536e96).**
- `ProjectsListScr.jsx` — owner-only, `pg='projects'`. Desktop: sortable table (thumbnail, address/city, status pill, progress bar, contract value, tasks-due badge, PM). Mobile: stacked cards + load-more. Search + status filter + PM filter (only shown when PMs exist) + sort.
- `sbLoadProjectsList(tenantId)` — 3 parallel queries: jobs, todos (open count per job_id), photos (first per job). PM names joined from profiles. Returns enriched array.
- App.jsx: VALID_PG += 'projects'; owners get `pg='projects'` for Projects nav/bot-nav; `pg='jobs'` stays for detail + non-owner staff; onOpenJob → setPendingJobId + setPg('jobs').
- Data audit: address (real, parsed at comma), status (real enum), contract_value (real), phase_pct_complete (real column on jobs — direct), open_todos (real COUNT via todos.job_id), thumbnail (real public URL from job-photos bucket, placeholder house for jobs without photos), PM filter (real — shown only when PMs exist), Type filter OMITTED (no backing field).

**[LOG — 2026-06-04] OWNER_HOME_MOBILE_FIX — 3 mobile fixes on OwnerHomeScr (commit 701c056).**
- KPI cards: `flexWrap: 'wrap'` always (was 'nowrap' on mobile), `flex: '1 1 calc(50% - 6px)'` on mobile → 2-per-row. Hero font 28px→18px on mobile. Values use `fShort` on mobile ($183k) vs full `f$()` on desktop. Numbers never clip. Desktop 4-across unchanged.
- Mobile header: hardcoded "Field Estimator" → `{NAV.find(n => n.id === pg)?.lb || 'Home'}`. Owner Home now shows "Home".
- Duplicate AI button: MasterAgent floating button wrapped in `{!isMob && ...}`. Mobile uses Aven AI FAB in bot-nav. Desktop floating button unchanged.

**[LOG — 2026-06-04] ANTI_SURPRISE_ENGINE_ARC Phase 2.2 Slice 1 — trade_dependencies table + seed + cascade fix (commits 53bedaf, fe0b1cc, 9929b11).**
- **B1 — table shipped:** `trade_dependencies` (id UUID PK, tenant_id UUID nullable, predecessor_trade TEXT, successor_trade TEXT, lag_days INT DEFAULT 0, notes TEXT, created_at). UNIQUE NULLS NOT DISTINCT (tenant_id, predecessor_trade, successor_trade). 4 policies (select: platform+tenant, insert/update/delete: own-tenant owner/PM only). 3 indexes (successor lookup, predecessor lookup, tenant). Verified via apply_migration.js: all 8 objects PASS.
- **B2 — seed shipped (PLATFORM DEFAULTS, tenant_id=NULL):** 20 generic GC rules. Decision: platform defaults — Demo→Framing / Framing→roughs(3) / roughs→Insulation(3) / Insulation→Drywall+Tile(3) / Drywall-Hang→Tape+Patch(2) / Tape+Patch→Paint+LVP+Cabinets(5) / Tile→Plumbing-Finish(2) / Paint→Electrical-Finish are universal residential GC order, not Avenstone-specific.
- **B3 — cascade bug fixed:** `sbCascadeScheduleChange` downstream BFS query was missing `.eq('job_id', src.job_id)`. UUID collision is negligible today but cross-job contamination was a latent data-integrity bug. Fixed at supabase.js:2924.
- **B4 — no auto-wire hook:** sbCreateScheduleItem unchanged. Hook is Slice 2.
- **Validation Pass (read-only, 20 seed rules vs 17 live items on 7b44611a):** 3 MATCH, 1 PARTIAL, 7 DIVERGE, 6 SKIP (NULL trade).
  - MATCH (3): Electrical-Rough-in, Plumbing-Rough-in, HVAC-Install — Framing→{roughs} rules fire correctly.
  - PARTIAL (1): Framing — computed returns all 3 Demo items (Demo→Framing); hand-wired has only the LAST Demo item (last-of-trade problem; hook must pick last-scheduled item of predecessor trade).
  - DIVERGE root causes (NOT seed bugs — all explained by test-job data gaps):
    1. Insulation item (13) has trade=NULL → Insulation→Drywall-Hang and Insulation→Tile-Floor rules can't resolve (no 'Insulation' trade items on job).
    2. "Drywall tape and mud" (item 14) has trade='Drywall - Hang' instead of canonical 'Drywall - Tape / mud / texture' → Drywall-Tape→Paint rule can't fire.
    3. "LVP flooring install" (item 16) has trade='Tile - Floor' instead of 'Flooring - LVP' → Tile-Floor resolves to Insulation (not LVP chain).
    4. Intra-Demo sequencing (items 4,5) and milestone→trade deps (Permit→Demo) are not modeled by trade_deps by design.
  - **VERDICT: Seed rules are CORRECT. Divergences are test-job trade-string data gaps. Hook (Slice 2) is safe to build. Known hook requirement: pick last-scheduled predecessor-trade item, not all.**

---

## Symptom index addition

- "J.from(...).select(...).single(...).catch is not a function" → supabase query builder has no `.catch()`; use `try { const { data } = await sb..single(); } catch (_) {}` or destructure `{ data, error }`. Antipattern in sbAdvancePhase fixed 2026-06-01.
- "schedule item saves (DB row created) but doesn't appear in the list after modal closes" → **silent-filter-hide** — phaseFilter was active on a different phase; item inserted fine but filtered out of phaseFiltered derived state. Fix: auto-follow filter to new item's phase in handleSaved. See `schedule-filter-hide · 2026-05-28`.

---

**Repo relocation + session cleanup (2026-05-28)**
- `repo-relocation · 2026-05-28` — Repo relocated out of OneDrive to canonical `C:\Users\Kalin\GitHub\avenstone-app`. Both OneDrive duplicate clones (Documents\GitHub\avenstone-app and Desktop\Avenstone) deleted. Divergence/sync-corruption risk resolved. Build verified clean at new location (407 modules, 1.13s). notify-sms function abandoned (Desktop-clone only, needs rewrite). BACKLOG: SMS notifications arc for client + sub comms. 3 stashes present: stash@{2} contains a plaintext PAT — drop after confirming rotated; stash@{0} doc-only (likely stale); stash@{1} interrupted CaptureQualityReport refactor (parked).

**Code-splitting (2026-05-28)**
- `code-splitting · 2026-05-28` — Added manualChunks to vite.config.js: `react-vendor` (react/react-dom/scheduler) and `pdf-vendor` (jspdf). Lazy-loaded 3 conditional heavy modules: `FloorPlanTab` in JobDet (tab==='scanner', default 'info'), `AiIntakeWizard` in JobsScr (behind showIntake state), `TakeoffWizard` in EstimateTab (sub==='takeoff', default 'build'). Each wrapped in `<Suspense>` with inline fallback. Main bundle: 1,714 kB → 919 kB gzip (452 kB → 206 kB). New separate chunks: react-vendor 190 kB, pdf-vendor 401 kB, FloorPlanTab 97 kB, AiIntakeWizard 33 kB, TakeoffWizard 19 kB. heic2any/html2canvas/supabase were already separate chunks before this change. EstimateTab left eager (common tab). All tabs/modals that use pdf.js left eager — handled by pdf-vendor chunk extraction, not lazy-loading.

**[DECISION 2026-05-28] supabase.js god-file split = DEFERRED** until app is feature-complete. Organic extraction only (pull a domain when already editing it for a feature; never schedule a sweep). SUPABASE_SPLIT_PLAN.md kept as reference. Token-cost argument deprioritized per Kalin — functionality first. Do NOT kick off a split sprint.

**[LOG — 2026-05-28] S4 Phase 1 — pg↔URL sync shipped.**
- Action: Synced top-level screen state (`pg`) to URL query param so refresh/back/forward preserve screen position. No router library introduced.
- Files: `avenstone-vite/src/App.jsx` only (+35/-1 lines).
- What shipped: (1) `VALID_PG` set (17 values) at module level; (2) `_initPg` reads `?pg=` on boot — valid value wins, invalid/absent defaults 'home'; (3) `useState(_initPg)` replaces `useState('home')`; (4) `pgInitRef` tracks first render — uses `replaceState` on init (no duplicate history entry), `pushState` on all subsequent pg changes; (5) `popstate` listener syncs URL→pg on browser back/forward. Zero call-site changes — all 13 `setPg` sites work as-is.
- Existing params preserved: `?review=`, `?completion=`, `?st=`, `?pro=` cause early returns before pg sync code runs — no interference. Capacitor push deep-link path (`registerForPush` onDeepLink) untouched.
- Build: green (407 modules, 577ms, no new chunks).
- Open (S4 remaining phases): P2 (job deep-link — `?job=` → open JobDet), P3 (tab deep-link — `?tab=` → open specific JobDet tab), P4 (notification tab auto-open fix). No router introduced across all 4 phases.
- **Bug fix (2026-05-28):** Back always returned to home. Root cause: `[pg]` effect called `pushState` on EVERY pg change including popstate-driven ones — each Back pop was immediately re-pushed, collapsing history. Fix: added `pgFromPopRef`; popstate handler sets it `true` before `setPg`; `[pg]` effect skips `pushState` and clears the flag when set. History now stacks correctly.

**[LOG — 2026-05-28] S4 Phase 2 — job↔URL sync shipped (commit 75bd84f).**
- Action: Synced selected job to URL as `?job=<id>` so refresh and deep-link open the correct JobDet. No router library.
- Files: `avenstone-vite/src/App.jsx` only (+45/-6 lines).
- What shipped: (1) `_initJobId = _params.get('job') || null` at module level; (2) `_initPg` forces 'jobs' when `_initJobId` is set; (3) `useState(_initJobId)` seeds `pendingJobId` from URL on boot — existing `pendingJobId` bridge in JobsScr handles the open; (4) `jobBootRef` (true when booted from URL) — first `viewportJobId` set uses `replaceState` instead of `pushState` to avoid duplicate history entry; (5) `jobFromPopRef` — when popstate opens a job, skips redundant pushState in the `[viewportJobId]` effect; (6) `[viewportJobId]` effect: `pushState ?job=<id>` on open, `replaceState` without `?job=` on close; (7) popstate handler extended: reads `?job=` — if present sets `setPendingJobId` + `jobFromPopRef.current = true`; if absent and on jobs page increments `jobsSelClear` to close current job; (8) pg→URL effect clears `?job=` when navigating away from jobs page; (9) `onJobOpen` in App validates `jobs.some(j => j.id === id)` before setting `viewportJobId` — guards against stale/invalid URL job IDs.
- Patterns reused from P1: pgInitRef/pgFromPopRef pattern mirrored as jobBootRef/jobFromPopRef. No new concepts introduced.
- Build: green (407 modules, 492ms).
- Open (S4 remaining): P4 (wire notification handler to use the parsed-but-discarded tab) — fix for CO/schedule notifications landing on wrong tab.

**[LOG — 2026-05-28] S4 Phase 3 — tab↔URL sync shipped (commit 63c4fd8).**
- Action: Synced JobDet tab to URL as `?tab=<id>` so refresh/deep-link opens the correct tab.
- Files: `App.jsx` (+38/-5), `JobDet.jsx` (+13/-2), `JobsScr.jsx` (+2/-2).
- What shipped: (1) `VALID_TAB` set + `_initTab` at module level in App; (2) `pendingTab` state seeded from `_initTab`; (3) `viewportTab` state + `[viewportTab]` effect — pushState on user clicks, replaceState on first tab after job open; (4) `tabBootRef` set in `[viewportJobId]` when job opens; (5) `tabFromPopRef` prevents double-push on popstate; (6) `pendingTab`/`clearPendingTab`/`onTabChange` threaded App → JobsScr → JobDet; (7) `tabInitRef2` in JobDet skips initial `info` mount-fire to prevent corrupting URL before pendingTab settles; (8) popstate handler reads `?tab=`, sets pendingTab + tabFromPopRef; (9) pg effect and job-close path both clear `?tab=`.
- Invalid `?tab=` → defaults to info via VALID_TAB check in App and TABS.some() in JobDet. No crash.
- Back ordering: tab entries → Back walks tabs → Back from first tab-push closes job.
- Build: green (407 modules, 547ms).

**[LOG — 2026-05-28] S4 Phase 4 — notification tab deep-link shipped (commit 695d184). S4 COMPLETE.**
- Action: Fixed long-standing bug where CO/schedule/todo push notifications and in-app bell clicks all landed on the info tab regardless of notification type.
- Files: `App.jsx` only (+17/-1). No push.js change needed.
- What shipped: (1) `resolveDeepLinkTab(s)` — maps deep-link segment to TABS id: VALID_TAB pass-through, plus alias `schedule→sched`; `todos` not a job tab → null → falls back to info. (2) `TYPE_TAB` — maps notification `type` to tab id for bell clicks (co_*→financials, schedule_item_*→sched, note_posted→msgs, draw_*/payment_received→financials). (3) Push `onDeepLink` handler: `resolveDeepLinkTab(jobMatch[2])` → `setPendingTab(tab)` alongside existing `setPendingJobId`+`setPg`. (4) `onClickNotif` bell handler: `TYPE_TAB[n.type]` → `setPendingTab(tab)`.
- Audit findings: push.js already passes full `action.notification.data.deep_link` string through unchanged — no native path change needed. Notification rows have no `deep_link` column (type+job_id only) — bell uses TYPE_TAB map. Tab-name mismatch: buildDeepLink emits `schedule` but tab id is `sched` — fixed via alias in resolveDeepLinkTab client-side (edge fn untouched).
- S4 arc COMPLETE: P1 (pg↔URL), P2 (job↔URL), P3 (tab↔URL + pendingTab prop), P4 (notification tab-awareness). No router library introduced across all 4 phases.
- Build: green (407 modules, 524ms).
- **Post-ship correction (commit cbe5947):** Real-usage testing found two wrong mappings. `note_posted` was mapped to `'msgs'` (Messages tab) — notes actually render in `FieldTab` as a sub-tab; corrected to `'field'`. `assigned_to_job` (sub assigned to job) was unmapped, falling back to info; now routes to `'subs'`. todo_delegated deep-linking to a specific todo scoped but NOT built (requires (a) todo_id in notification row and (b) pendingTodoId highlight in MyTodosScreen — 2-prompt arc, not just wiring). Flag: "sub assigned" notifications may be noise to the assigner who triggered the assignment — candidate for a future notification-relevance pass.

**[LOG — 2026-05-31] LIDAR_NORMALIZE_STAGE2 — floor_plans gap closed; pdf.js renders from normalized_geometry (commits d974749, 455271c).**
- Action: Closed the gap where `floor_plans.normalized_geometry` was always null. Extended pdf.js to use normalized geometry as primary render source.
- Files: `avenstone-vite/src/lib/supabase.js` (+18/-2), `avenstone-vite/src/lib/pdf.js` (+72/-15), `CLAUDE.md` (architecture documented).
- What shipped: (1) `sbSaveJobLidarScan` now attaches `normalized_geometry` to the in-memory return value (not just the async DB update), so `savedScan.normalized_geometry` is populated when `sbCreateFloorPlan` is called. (2) `sbCreateFloorPlan` copies `rawScan.normalized_geometry` directly into the `floor_plans` insert payload; falls back to inline normalize if absent. (3) `pdf.js buildFloorPlanPDF`: captures `normalizedData` from the existing `normalizeFloorPlan(scan)` call (post-override), groups by floor, passes `normFloor` to `_renderFloorPage` and `normalizedData` to `_renderSummaryPage`. (4) `_renderFloorPage`: when `normFloor` is present, reconstructs world-space pseudo-raw rooms (worldX=0, walls already in world-space) and feeds to `_processAllRooms` — skipping `_snapToOrtho` only. Double-cleaning avoided. (5) Summary page total sqft uses `normData.metadata.total_area_sqft` (Shoelace polygon sum). Per-room sqft uses `normRoom.area_sqft` indexed by global room order. Legacy fallback untouched.
- SF label before/after for non-rectangular room: BEFORE — `_polyAreaFromSegs` on raw wallSegments (Shoelace, correct when segments close) OR `room.sqft` fallback (bounding-box, overestimates). AFTER (normalized) — `normRoom.area_sqft` always Shoelace from `_wallSegsToPolygon`, reliable even when raw segments don't close cleanly. Real win is eliminating the bounding-box fallback path.
- Normalized render shape mismatches: walls arrive as `p1:[x,z]/p2:[x,z]` (arrays, not {x1,z1,x2,z2}). Mapped during pseudo-room reconstruction before passing to `_processAllRooms`. No other shape mismatches.
- CLAUDE.md updated: primary/fallback contract, normalized_geometry schema, consumer migration status, `total_sqft` cutover deferred.
- Open: takeoff wizard + FloorPlanCanvas still on legacy raw reads (next arc). `total_sqft` column cutover deferred. Multi-session capture gate separate. Historical rows hit legacy fallback path (correct).

**[LOG — 2026-05-31] LIDAR_NORMALIZE_STAGE1 — Stage 1 normalize pipeline shipped (commits c10128b, c3bfbf1, 97af298).**
- Action: Wired `normalizeFloorPlan()` (pure Shoelace-area normalizer) into the canonical save path and deployed a callable edge function for explicit normalization.
- Files: `supabase/migrations/20260531100000_add_normalized_geometry.sql`, `supabase/functions/normalize-scan/index.ts`, `supabase/functions/normalize-scan/normalize.js` (vendored verbatim), `avenstone-vite/src/lib/supabase.js` (+18 lines in sbSaveJobLidarScan), `avenstone-vite/src/types/database.types.ts` (regen'd).
- What shipped: (1) `normalized_geometry JSONB` nullable column added to both `job_lidar_scans` and `floor_plans` — verified via `apply_migration.js` both columns PASS. (2) `normalize-scan` edge function: accepts `scan_id`, reads row, runs `normalizeFloorPlan()`, UPDATEs `normalized_geometry` with tenant scoping via service role. normalize.js vendored into function dir — no math forked. NOT wired as DB trigger (API cost rule: never AI on DB event). (3) Inline browser-side fallback in `sbSaveJobLidarScan`: after INSERT, calls `normalizeFloorPlan({ rooms })`, UPDATEs just-saved row with `normalized_geometry`. Fire-and-safe: try-catch around both normalize call and UPDATE, failures warn to console only, never block scan save return value.
- Key field name differences: raw `rooms[i].sqft` = bounding-box area. Normalized `normalized_geometry.data.rooms[i].area_sqft` = Shoelace polygon area. `normalized_geometry.data.metadata.total_area_sqft` = sum of polygon areas. Consumers must not mix these.
- DO NOT TOUCH (not changed): `pdf.js`, `FloorPlanCanvas.jsx`, `RoomPlanPlugin.swift`, takeoff wizard, any consumer read path.
- Build: green (407 modules, 547ms). Types regen'd clean. 3 commits pushed to main.
- Open: Stage 2 = wire `floor_plans.normalized_geometry` write path (AiIntakeWizard calls `sbCreateFloorPlan` — needs same inline normalize on the `floor_plans` row). Stage 3 = consumer migration: pdf.js renderer reads `normalized_geometry` as primary source, falls back to raw `rooms` for legacy rows.

**[LOG — 2026-05-28] Full session summary.**
- **Repo relocated** out of OneDrive to canonical `C:\Users\Kalin\GitHub\avenstone-app`. OneDrive clones deleted. Build verified clean at new location.
- **gen:types tooling shipped** — `tools/gen_types.js` + `npm run gen:types` + `src/types/database.types.ts` (86 tables). Compile-time drift backstop. CLAUDE.md updated with regen discipline.
- **Drift slice closed** — `assigned_pm_id` → `assigned_pm` in supabase.js notification fan-out (PM was silently excluded from schedule notifications). `field-opus-db-query` stale columns fixed (bug_reports, auto_fix_attempts, failed_intents stubbed). Read drift: 0. Missing-tables drift: 0 (final quote_requests ref closed 2026-06-10 with ai-pm-nightly retirement).
- **46% bundle cut** — `vite.config.js` manualChunks + lazy-loaded FloorPlanTab/AiIntakeWizard/TakeoffWizard. Main bundle 452 kB → 206 kB gzip.
- **supabase.js split DEFERRED** — plan written to `avenstone-vite/SUPABASE_SPLIT_PLAN.md`, organic extraction only.
- **S4 URL routing COMPLETE** — 4 phases, App.jsx only, no router library: P1 (pg↔URL + Back/Forward), P2 (job↔URL), P3 (tab↔URL + pendingTab prop through JobsScr→JobDet), P4 (notification type→tab mapping for bell + push deep-links).
- **Known open (not yet fixed):** CO/schedule/draw notifications don't fire in practice per real-usage testing (trigger logic gap, separate arc). "sub assigned" notification goes to assigner — noise, future relevance pass. todo_delegated doesn't deep-link to specific todo — scoped in TODO_NOTIFICATIONS_ARC.

**[LOG — 2026-05-31] normalize-scan edge bundle fix (commit 1d15d67).**
- Action: Fixed HTTP 400 deploy failure for `normalize-scan`. All 51 other functions had deployed clean.
- Root cause: GitHub Actions workflow uploads only `index.ts` per function via `-F "file=@${entry}"`. Supabase bundler receives a single file at `/source/index.ts` and cannot resolve `./normalize.js` — the sibling was never uploaded. File presence in the local directory is irrelevant; the workflow never uploads it.
- Fix: Rewrote `supabase/functions/normalize-scan/index.ts` to be fully self-contained — inlined all of `normalize.js` (constants, helpers, `normalizeFloorPlan`) as typed TypeScript functions, removed the `import { normalizeFloorPlan } from './normalize.js'` line. `normalize.js` remains in the directory (used by the browser-side import in `supabase.js` and as a reference/test target) but is no longer imported by the edge function.
- Verification: Local deploy not possible (no CLI/token in this environment). Verified by push to main → GitHub Actions run pending (commit 1d15d67).
- 51 other functions: unaffected (all upload single-file index.ts with no local siblings).
- normalize-scan status: NOT wired as a DB trigger. Callable via API only. Still not a trigger.

**[LOG — 2026-05-31] pdf.js cosmetic render fixes — 4 changes (commit 4e91a11).**
- Action: Four render-only fixes in `avenstone-vite/src/lib/pdf.js`. No geometry/normalize/data layer touched.
- Files: `avenstone-vite/src/lib/pdf.js` only (+33/-37 lines net).
- Fix 1 — Full room names: `nameTxt` was `hint.label_text` (abbreviated by `computeLayoutHints`/`abbreviateRoomName` in layoutCheck.js — ABBREV_TABLE maps "Bathroom"→"BA" etc). Changed to `room.name || hint.label_text` — always prefer the canonical room name.
- Fix 2 — Horizontal shrink-to-fit labels: `narrow` flag (line 1356) drove 90° rotation when `hint.label_rotation === 90` or `aspect > 3`. Removed the narrow/rotation path entirely. Font size now computes shrink-to-fit: `fs = max(6, min(11, w/8, w*0.85/(name.length*0.55)))`. Wall-margin test simplified to log-only (no rotate). Labels always render left-to-right.
- Fix 3 — Uniform 2x4 wall thickness: `const thick = isInteriorWall(...) ? 3 : 6` → `const thick = 6`. All walls draw at the exterior weight. At typical plan scale, 6 PDF pts ≈ 3.5" actual (2x4 stud wall). Interior/exterior distinction removed from the render layer.
- Fix 4 — Flat uniform room fill: Root cause of hallway diagonal was `_segsToPolyPoints` greedy chain walk bridging a gap in the segment ring (scanner drift or floating-point after rotation), producing a self-intersecting polygon that jsPDF's non-zero winding fill renders with a diagonal partial fill. Fix: replaced the chain-walk fill with angle-sort of unique wall endpoints around their arithmetic centroid. For star-shaped rooms (all real rooms), angle-sort produces a simple polygon. Self-intersection impossible. Rectangular rooms: behavior identical to before. L-shaped hallway: fills correctly edge-to-edge. **This is a polygon-order fix, not a fill-style change.**
- Open: takeoff wizard + FloorPlanCanvas still on legacy raw reads (next arc). `total_sqft` column cutover deferred. Multi-session capture gate separate. Historical rows hit legacy fallback path (correct behavior).

**[LOG — 2026-05-31] FLOOR_PLAN_EDITOR_ARC Phase 1 — geometry op vocabulary + pure mutation layer (commits 9510ce1, 3866e4e).**
- Action: Built `src/lib/geometryOps.js` + `src/lib/geometryOps.test.mjs`. Phase 1 complete: 40/40 tests pass.
- Files: `avenstone-vite/src/lib/geometryOps.js` (pure module, 543 lines), `avenstone-vite/src/lib/geometryOps.test.mjs` (smoke tests, 395 lines, runnable with `node geometryOps.test.mjs` from src/lib/).
- Op vocabulary: `relabel_room`, `move_corner`, `move_wall`, `add_wall`, `delete_wall`, `add_opening`, `move_opening`, `delete_opening`, `split_room`, `merge_rooms`.
- Design contract: `applyOp(geometry, op) → {ok, error, data}` (single op, always fresh copy), `applyOps(geometry, ops[]) → {ok, error, data}` (atomic — all succeed or original unchanged). No mutation of input. No supabase.js import. Zero deps beyond `./floorPlan/normalize.js` helpers (`snapToGrid`, `polygonCentroid`, `polygonAreaSqft`, `classifyAndStandardizeWalls`).
- Key design decisions: `move_corner` propagates shared vertex to adjacent rooms. `move_wall` finds all rooms whose polygon contains either endpoint and updates them all (handles shared interior walls). `split_room` uses polygon-intersection algorithm (2 cut points → two sub-polygons, opening reassignment by centroid proximity). `merge_rooms` uses contiguous shared-vertex walk with forward/backward B-path selection.
- After any shape-changing op: `recomputeRoom` (centroid, area_sqft, wall list from polygon ring), `recomputeGlobal` (classifyAndStandardizeWalls, total_area_sqft, room_count). Wall IDs regenerated from polygon index: `wall_${roomId}_${i}`.
- Open: Phase 2 = draft/commit layer (diff geometry, preview op batch, persist draft to DB). Phase 3 = UI surface (canvas overlay, op picker). Phase 4 = AI op generation (Sonnet produces op structs from natural language).

**[LOG — 2026-06-01] RING_FIX_ARC — segment-adjacency ring fix + backfill (commits 41d64d9, 9af15a5).**
- Action: Replaced greedy nearest-neighbor chain walk in `_wallSegsToPolygon` with segment-adjacency boundary trace. Added self-intersection detector. Wrote dry-run backfill. Synced TypeScript edge function. 67/67 smoke tests pass.
- Root cause: Greedy walk used Infinity nearest-neighbor distance; on concave rooms (L/U-shapes) ambiguous distances caused the walk to bridge interior chords → self-intersecting polygon → wrong Shoelace area baked at storage time → flowed into takeoff bids. Angle-sort (Fix 4 in pdf.js) was a render-only fix — did not affect stored rings.
- Algorithm chosen: segment-adjacency boundary trace. Pre-snap all endpoints to 0.1 ft grid inside the walk. Use exact endpoint match (EPS=0.05 ft, half a grid cell) instead of Infinity nearest. Falls back to greedy only for genuine scanner gaps (sets `needs_review: true` on the room, additive-only, backward-compatible). Correct for all closed connected boundaries regardless of concavity — including U-shapes (not star-shaped from centroid, angle-sort fails there).
- Files: `avenstone-vite/src/lib/floorPlan/normalize.js` (+120/-27), `avenstone-vite/src/lib/floorPlan/_smoke.mjs` (+100), `scripts/backfill-normalize-rings.js` (new, 230 lines), `supabase/functions/normalize-scan/index.ts` (+60/-26).
- Backfill dry-run result: 1 job_lidar_scan row + 1 floor_plan row checked. 0 corrupted rings. Existing stored data was all simple convex rooms — greedy walk happened to get them right. No --write needed.
- normalize-scan edge fn: TypeScript version of the new algorithm synced; return type changed from `[number,number][]` to `{polygon, needs_review}`; call site and room push both updated.
- `needs_review` contract: additive-only. Present (=true) only when ring had a genuine scanner gap. Absent when false. Backward-compatible — existing consumers unaffected.
- Takeoff is now safe from concave-room area corruption: any L/U/hallway scan will store a topologically correct ring and accurate Shoelace area_sqft.
- Open: Backfill script kept at `scripts/backfill-normalize-rings.js` — re-run `node scripts/backfill-normalize-rings.js` after any bulk re-scan import. Use `--write` only after confirming dry-run output.

**[LOG — 2026-06-01] pdf.js render fixes — 3 fixes (commits 587b1f2, 5c030bb, 05e4c6e).**
- Action: Replaced angle-sort fill with segment-adjacency ring walk, reconciled SF total, fixed Hallway SF sub-label.
- Files: `avenstone-vite/src/lib/pdf.js` only.
- Fix 1 — Fill from canonical ring walk: The angle-sort fill (Fix 4 from 2026-05-31 LOG) was rejected for concave rooms — U-shapes are not star-shaped from their centroid, so angle-sort still produces a chord across the interior → partial diagonal fill. Added `_walkRingFromSegs(segs)` helper: segment-adjacency walk on processed segs (same algorithm as normalize.js `_wallSegsToPolygon`, adapted for `{x,z}` objects). Pre-snaps to 0.1 ft grid, exact match within EPS=0.05 ft wins, falls back to nearest. Segs are already in render coordinate space (post-rotation/translation from `_processAllRooms`) so no transform needed. Fill loop now uses `_walkRingFromSegs`. `roomPoly` for label positioning also switched to `_walkRingFromSegs` with `_segsToPolyPoints` as fallback if ring < 3 pts.
- Fix 2 — Reconcile SF total: `_renderSummaryPage` header was `Math.round(normData.metadata.total_area_sqft)` (rounds the sum) vs table `gTotFloor` = Σ `Math.round(r.area_sqft)` (sum of rounded values). Changed header to `normData.rooms.reduce((s, r) => s + Math.round(r.area_sqft), 0)`. Both now agree.
- Fix 3 — Hallway SF sub-label: Root cause: `computeSfBadgePosition` sets `sf_inline_with_label: true` for any room < 50 sqft (Hallway at 49 sqft qualified). `showSf` gated on `!hint.sf_inline_with_label` → always false for Hallway. Fix: bypassed the hint for both `sfTxt` (now always `sqft.toLocaleString() + " sq ft"`) and `showSf` (now `sf_visible !== false && !!sfTxt`). SF sub-label now renders for all rooms including irregular small ones.
- Constraint honored: did not touch normalize.js, geometryOps.js, the data layer, or the bathroom's angled wall (true measurement, not an artifact).
- Note Fix 4 (2026-05-31) is superseded — angle-sort comment removed. All fill now via _walkRingFromSegs.

**[LOG — 2026-06-01] FLOOR_PLAN_EDITOR_PARKED — editor back-burnered; dead-end Edit button gated.**
- Action: Overwrote `docs/FLOOR_PLAN_EDITOR_ARC.md` with parked design (click-to-reference + talk-to-instruct model). Hid the dead-end Edit button in FloorPlanTab.jsx — entry point gated, FloorPlanEditorScr code untouched.
- Files: `docs/FLOOR_PLAN_EDITOR_ARC.md` (created/overwritten), `avenstone-vite/src/components/jobs/tabs/FloorPlanTab.jsx` (Edit button hidden).
- Decision: Editor parked. Existing manual editor (FloorPlanEditorScr) confirmed dead-end — broken N/S/E/W on angled scans, doesn't reliably save, non-corrupting (writes layout_overrides only, never normalized_geometry). Chosen future model: click-to-reference + talk-to-instruct → AI ops → geometryOps → normalized_geometry. Direction always "toward [clicked object]", never compass — kills the angled-scan problem. Image-in/image-out REJECTED (hallucinated dimensions, unfit for permits/bids). Connection/join logic is the hard deferred part. geometryOps Phase 1 (40 tests) stays built as the engine.
- Open: Editor revisit — start tiny: add_wall + add_opening POC on ONE real scan ONLY after takeoff wizard / scan→takeoff→bid pipeline runs smooth.

**[LOG — 2026-06-01] pdf.js unified floor fill (commit d4745ef).**
- Action: Replaced per-room ring fills with a single unified footprint fill via polygon-clipping union. Fixed doorway erase color. Render-only.
- Files: `avenstone-vite/src/lib/pdf.js` only.
- Root cause of white doorways: `_eraseGap` painted a white rectangle over the door opening, erasing the floor fill that had been painted below. Root cause of diagonal shading: per-room ring polygons built from wall segments — adjacent rooms' chord edges at doorways didn't align exactly, producing mismatched fill boundaries.
- Fix — unified fill: `polygonClipping.union(...polys)` where each poly is a room ring from `_walkRingFromSegs`. Fills the result MultiPolygon once with `FLOOR_TINT`. Fallback to per-room fill if union throws (console.warn). `polygon-clipping` was already a dep (v0.15.7, used in FloorPlanEditorScr).
- Fix — doorway erase: `_eraseGap` gained optional `fillRgb` param (default white). Door and opening erases now pass `FLOOR_TINT` so the erasure reveals floor color, not white. Window erases remain white (exterior). Slanted stair wall untouched (real geometry, intentionally uncorrected).
- Draw order unchanged: unified floor fill → walls (poché) → erase openings → symbols → labels.

**[LOG — 2026-06-01] TAKEOFF_NORM_STEP1+2 — takeoff geometry migration COMPLETE (commits dbc9293, 787cb0e).**
- Action: Step 1 (pure helper) + Step 2 (integration) complete.
- Files: `avenstone-vite/src/lib/takeoff.js` (helper + integration), `avenstone-vite/src/lib/takeoff.test.mjs` (10 tests passing), `CLAUDE.md` (consumer migration status updated).
- `computeMetricsFromNormalized(normRoom, walls) → { perimeterLf, wallAreaSf }`: pure helper, filters walls by room_id, sums hypot(p2-p1), rounds to 2dp. Guards: null/empty/unmatched → zeros.
- Integration: `buildTakeoffDraft` scan query now selects `normalized_geometry`. Per room: if `normGeom?.rooms?.[idx]?.area_sqft != null` → use normalized path (area_sqft, height, computeMetricsFromNormalized); else → raw fallback (room.sqft, computePerimeter). **Room matched by index** (same iteration order in normalize.js and takeoff.js — safe; IDs differ between the two so cannot match by ID).
- Before/after on concave L-shape: raw areaSf=80 (bounding-box) → normalized areaSf=65 (Shoelace polygon, -15 delta). Legacy scans (null normGeom) unchanged.
- computePerimeter untouched (raw fallback). acceptTakeoffDraft, multiplier, write path untouched. Multiplier discrepancy ($16k vs $17k gap) still OPEN — orthogonal fix needed separately.
- CLAUDE.md updated: takeoff wizard migrated to normalized_geometry (canonical); raw is fallback only.

**[LOG — 2026-06-01] CLIENT_LINK_COPY — Copy link button + link_only mode (commit 7ba558d).**
- Action: `send-client-link` edge fn gained `link_only: true` mode — generates Supabase magic link, returns `{ ok: true, url }`, skips Resend email. Default (no flag) unchanged. `sbGetClientLink` helper added to supabase.js. `ClientLinkButton` in InfoTab now shows "Copy link" + "Send to client" side by side.
- Token scheme: Supabase `auth.admin.generateLink({ type: "magiclink", email })` → returns `action_link` URL. Supabase processes the auth, creates session, redirects to app. App.jsx sees `role=client` → renders ClientPortal. No URL param; pure Supabase magic link auth.
- Copy link gated on `client_email` — required because `generateLink` needs an email to identify/create the Supabase auth account. Cannot mint a link without it.
- Verification: manually copied URL from link_only response and opened in incognito — Supabase auth page processes the token, session is set, app loads at ClientPortal. End-to-end confirmed.
- Files: `supabase/functions/send-client-link/index.ts`, `avenstone-vite/src/lib/supabase.js`, `avenstone-vite/src/components/jobs/tabs/InfoTab.jsx`.

**[LOG — 2026-06-01] CLIENT_LINK_COPY_FIX — robust clipboard copy (commit 64179fb, patched 1b6f0dc).**
- Root cause v1: `navigator.clipboard.writeText()` called AFTER `await sbGetClientLink()` — gesture context stale → `NotAllowedError`.
- Root cause v2 (actual bug seen): `execCommand` fallback was writing `url` to a `width:1px;height:1px;opacity:0` textarea. Invisible/collapsed elements fail to receive focus+selection in most browsers. `ta.select()` silently failed; `execCommand('copy')` then copied whatever was previously selected on the page (a Claude response block) and returned `true` anyway — false positive. `setCopied(true)` fired, `setFallbackUrl` never ran. User pasted the report text, not the URL.
- Fix (commit 1b6f0dc): removed `execCommand` fallback entirely. `navigator.clipboard.writeText` is the single attempt. `setFallbackUrl(url)` now ALWAYS called after successful link generation, so the URL is always visible inline regardless of clipboard result. Label and border color reflect clipboard success (green) vs failure (gold). User always has the URL to copy manually.
- `execCommand` rule: NEVER use `execCommand('copy')` on a hidden/collapsed element — it copies stale page selection and returns `true`, making it impossible to detect failure.
- `Send to client` button unchanged.
- File: `avenstone-vite/src/components/jobs/tabs/InfoTab.jsx` only.

**[LOG — 2026-06-01] Gate-override .catch crash fix (commit 5ddf969).**
- Action: Fixed runtime crash "J.from(...).select(...).single(...).catch is not a function" in the Override and Advance modal.
- File: `avenstone-vite/src/lib/supabase.js:4624` (inside `sbAdvancePhase`).
- Root cause: `sb.from('jobs').select('address').eq('id', jobId).single().catch(...)` — supabase-js builder is thenable but does NOT expose `.catch()`. Calling `.catch()` on it throws at runtime. The antipattern appeared exactly once in this path (other `.catch()` calls in the same function are on real async function return values — fine).
- Fix: replaced with `let jobRow = null; try { const { data } = await sb..single(); jobRow = data; } catch (_) {}`. Query logic unchanged; behavior preserved (override reason logs, phase advances, errors surface). Min-10-char validation in modal unaffected.
- Symptom index note: add "J.from(...).single(...).catch is not a function" → supabase builder has no .catch; use try/catch or { data, error } destructure.

**[LOG — 2026-06-01] CLIENT_PORTAL_BUTTON_PLACEMENT — ClientLinkButton + StatusLinkButton dead code, now rendered (commit 2c4e8a0).**
- Action: Placed two fully-built-but-never-rendered buttons in InfoTab.jsx JSX so PMs can send clients their portal magic link and copy the realtor status link.
- File: `avenstone-vite/src/components/jobs/tabs/InfoTab.jsx` (7 lines added after the Contract card section, before the Completion Sign-off card).
- Root cause: Both buttons (defined at InfoTab.jsx:10-37 and :39-58) were complete — had click handlers, API calls, state management — but no JSX placement existed in the return tree, so they never appeared in the UI.
- ClientLinkButton: guarded on `job.client_email`; calls `sbSendClientLink(job.client_email, job.client_name, job.address, job.id)` → `send-client-link` edge function → emails magic link to ClientPortal.
- StatusLinkButton: guarded on `job.status_token`; builds `https://avenstone-app.vercel.app/?st=${token}` for clipboard copy.
- Both guarded on role: `['owner', 'sales_rep', 'project_manager']`.
- No logic changes — placement only.

**[LOG — 2026-06-01] MULTIPLIER_FIX — floor-multiplier drop bug defused via Option B (explicit column) (commits 7943c5c, 277f7b2).**
- Action: Defused the dormant floor-multiplier drop bug. Labor floor multiplier (1.30 basement / 1.15 second-floor) was computed in the wizard and shown to the rep but never persisted — acceptTakeoffDraft wrote unit_cost = base rate and total_cost was generated as quantity × unit_cost, silently dropping the premium. Dormant today (floor hardcoded to 0); defused so a future floor-selector UI cannot ship a silent under-bill.
- Option A rejected: baking multiplier into unit_cost would cause double-application when sbLoadCustomTakeoffLines reads unit_cost back as baseRate on re-edit.
- Migration: 20260601120000_add_multiplier_to_estimate_line_items.sql. Added multiplier NUMERIC(5,2) NOT NULL DEFAULT 1.0. Dropped and re-added generated columns: total_cost = quantity × unit_cost × multiplier, client_price = quantity × unit_cost × multiplier × (1 + markup_pct/100). Existing rows get multiplier=1.0 via DEFAULT — no backfill needed (no live row ever had a non-1.0 multiplier). Verified via information_schema: generation_expression confirmed.
- takeoff.js: acceptTakeoffDraft insert payload now includes multiplier: line.multiplier ?? 1. unit_cost stays = catalog base rate.
- supabase.js: sbLoadCustomTakeoffLines reads row.multiplier ?? 1 instead of hardcoded 1 — re-editing a saved takeoff now preserves the floor level.
- EstimateTab.jsx: "Line items" view was manually computing quantity × unit_cost × (1+markup_pct), missing the multiplier. Fixed to use li.client_price (DB-generated, always correct).
- Materials unaffected: material lines always push multiplier: 1; waste is correct and unchanged.
- Confirmed consumers: FinancialsTab reads client_price ?? total_cost (generated, auto-correct). Proposal uses AI-extracted propLineItems amounts (not estimate_line_items). TakeoffWizard display reads line.multiplier (correct). LineItemModal/AddCustomLineModal always multiplier=1.

**[LOG — 2026-06-01] WASTE_AUDIT — material waste audited correct, no fix needed.**
- Traced waste_pct through takeoff.js. Two sources: (A) `trade_taxonomy.default_waste_pct` → `getWastePct()` → stored as metadata on labor lines; NEVER applied to any quantity or cost formula (buildQuantity called with `wastePct: 0`). (B) `takeoff_unit_costs.waste_pct` → `evaluateFormula()` → `wasteFactor = 1 + pct/100` baked into `matQty` → stored as `quantity` in estimate_line_items. DB `total_cost = quantity × unit_cost × multiplier` correctly includes waste. Labor intentionally zero (comment takeoff.js:494-495). Demo uses `areaSf_noWaste` path. No changes made.
- Cosmetic note: waste badge in TakeoffWizard renders on labor lines when `trade_taxonomy.default_waste_pct > 0` — shows "+X% waste" but has zero effect on the cost. Harmless; not a bug.

**[LOG — 2026-06-01] CLIENT_PORTAL_AUTH_FIX — magic link retired; PM-set email+password + tenant isolation fix (commits dc8219f, f81962d, ca85bcf, dcb6ff6).**
- Root cause (wrong-project redirect): `generateLink` magic links redirect to `APP_URL` regardless of project — if the user was created in a different Supabase project or `redirect_to` resolved to a different Vercel deploy, the client landed on the wrong portal. Retired for client portal access.
- Root cause (cross-tenant jobs query): `ClientPortal.jsx` queried `jobs` with `or(client_user_id, client_email)` and NO `tenant_id` filter — a client email appearing on jobs across tenants would see all of them.
- Fix 1 — New `create-client-login` edge function: PM sets email + password for a client. Uses `get_auth_user_id_by_email` RPC (SECURITY DEFINER query on auth.users — reliable lookup bypassing listUsers pagination). If auth user exists: `updateUserById` sets password + `email_confirm: true`. If not: `createUser`. Upserts profile with role=client, tenant_id. Updates jobs.client_user_id + client_email.
- Fix 2 — `ClientLoginButton` replaces `ClientLinkButton` in InfoTab. PM enters password in inline form. On success shows "Login active — email can sign in now." Magic-link Copy/Send buttons removed from InfoTab entirely.
- Fix 3 — ClientPortal job query now includes `.eq('tenant_id', AV_TENANT)` — strict tenant isolation. Client can only ever see jobs in their own tenant.
- Migration: 20260601200000_add_get_auth_user_id_by_email.sql. RPC function `get_auth_user_id_by_email(p_email TEXT)` SECURITY DEFINER, service_role only.
- Seed 8617 Houston: `kalinspratling@gmail.com` / `TestClient2026!`. Auth user `18fde05b-...` confirmed. Profile: role=client, tenant_id=00000000-..., full_name=Clay Davis. Job: client_user_id=18fde05b-..., client_email=kalinspratling@gmail.com.
- Verified: password login returns JWT, profile.role=client, tenant-filtered query returns ONLY 8617 Houston job. No other jobs visible.
- Ghost profile cleanup: `b9d8a965-...` had email=kalinspratling@gmail.com in profiles but auth user is abc@abcelectrical.com. Restored profile to email=abc@abcelectrical.com, role=sub.
- Known: GoTrue `/auth/v1/admin/users?email=X` filter doesn't work as expected; `sb.auth.admin.listUsers()` may return empty in edge function context. ONLY reliable lookup: RPC on auth.users. Always use `get_auth_user_id_by_email` for future auth ID lookups in edge functions.

**[LOG — 2026-06-01] SEND_CLIENT_LINK_FIX — three robustness fixes to send-client-link edge fn.**
- Fix 1 — listUsers() pagination: prior code did a single `admin.listUsers()` call (max 50 users) and searched for matching email — silently missed any user past position 50. Fixed: query `profiles.select('id').eq('email', email).limit(1)` instead.
- Fix 2 — maybeSingle() on duplicate-email profiles: `profiles` can have >1 row per email (duplicate auth accounts). `.maybeSingle()` throws "multiple rows". Fixed: use `.limit(1)` returning array, take index [0].
- Fix 3 — CORS headers on all error paths: early returns (missing email, lookup fail) omitted `Access-Control-Allow-Origin`, making the browser report a CORS error that masked the real error. Fixed: CORS headers added to every `Response` constructor in the function.
- File: `supabase/functions/send-client-link/index.ts`.

---

## 2026-06-01 SESSION SUMMARY

### Shipped this session
1. **Scanner ring fix (RING_FIX_ARC)** — normalize.js: greedy chain walk → segment-adjacency boundary trace. Correct for concave/U-shapes (angle-sort fails on non-star-shaped rooms). Self-intersection detector. Backfill dry-run: 0 corrupted rows. area_sqft trustworthy in DB. See LOG RING_FIX_ARC.
2. **pdf.js render** — unified polygon-union floor fill via polygon-clipping (killed doorway white-gaps + diagonal shading); SF total header reconciled to match table; all-room SF labels including Hallway; full room names; horizontal shrink-to-fit labels; uniform 2x4 wall thickness. Slanted stair wall intentionally untouched. See LOGs pdf.js render fixes + unified floor fill.
3. **Takeoff geometry migration** — `buildTakeoffDraft` reads `area_sqft` + wall metrics from `normalized_geometry` via `computeMetricsFromNormalized`. Room matched by **index** (not id — ids differ between normGeom and scan.rooms). Raw path kept as fallback for legacy scans. Concave L-shape: 80 → 65 sqft verified. See LOG TAKEOFF_NORM_STEP1+2.
4. **Material waste audit** — Traced end-to-end. `takeoff_unit_costs.waste_pct` correctly bakes into stored material `quantity`. Labor intentionally zero. No fix needed. See LOG WASTE_AUDIT.
5. **Floor multiplier fix (MULTIPLIER_FIX)** — Option B: added `estimate_line_items.multiplier` column (DEFAULT 1.0). Generated `total_cost`/`client_price` now include multiplier. `acceptTakeoffDraft` persists `line.multiplier`. `sbLoadCustomTakeoffLines` reads `row.multiplier` on re-edit. `unit_cost` stays catalog base rate. Dormant today (floor=0 default); defused ahead of floor-selector UI. information_schema verified. See LOG MULTIPLIER_FIX.
6. **Editor parked** — FloorPlanEditorScr confirmed dead-end (broken on angled scans, doesn't save). Edit button hidden. Future model: click-to-reference + talk-to-instruct → AI ops → geometryOps. Image-gen rejected (hallucinated dims). geometryOps.js Phase 1 (40 tests) stays as engine. See `docs/FLOOR_PLAN_EDITOR_ARC.md` and LOG FLOOR_PLAN_EDITOR_PARKED.
7. **send-client-link robustness** — listUsers() pagination bug fixed; maybeSingle() duplicate-email throw fixed; CORS headers on all error paths. See LOG SEND_CLIENT_LINK_FIX.
8. **Gate-override .catch crash** — commit 5ddf969 applies try/catch around supabase builder (`.catch()` is not a method on the builder). Kalin has NOT confirmed modal works end-to-end — see Open below.

### Open / Broken (do not mark resolved)
- **CLIENT PORTAL AUTH — SHIPPED (see LOG CLIENT_PORTAL_AUTH_FIX). Replaced magic link with PM-set email+password. 8617 Houston seeded. Verified login → role=client, only one job visible (tenant-filtered). No cross-tenant access possible.**
- **Gate-override modal** — commit 5ddf969 exists (supabase builder `.catch()` → try/catch). Kalin has not confirmed the Override and Advance modal is no longer throwing. Verify in practice before closing.
- **Floor-selector UI** — `multiplier` column and generated expressions are correct; the wizard Prompt B floor override UI is not yet built. When built: use `room.floor` (-1 basement / 0 first / 1 second) to drive `resolveMultiplier`; it will now persist correctly.
- **Split/merge/relabel room tool** — not built. Spec: 3 ops via geometryOps, commit straight to `normalized_geometry` (prior version kept for undo), UI on Scanner/FloorPlan tab before takeoff. Required for open-plan problem: kitchen+living scanned as one room cannot be split without this tool.
- **Cosmetics (low priority):** waste badge shows on labor lines (harmless — trade_taxonomy metadata, no effect on calcs); PDF scale bar overlaps dimension chain.

---

[LOG - 2026-06-02] CLIENT_PORTAL_SPEND_LEDGER
- Action: Replaced estimate_line_items ESTIMATE view in ClientPortal.jsx Financials tab with a live actual-spend ledger sourced from job_transactions.
- Files: avenstone-vite/src/components/client/ClientPortal.jsx, avenstone-vite/src/lib/supabase.js
- Commit: 49d29a2 — feat(client-portal): cost-plus actual-spend ledger replaces estimate view
- Decision: Two markup rates (labor_markup_pct / material_markup_pct) exist on jobs table. Transactions categorized by type (material_purchase → material_markup_pct; sub_payout → labor_markup_pct). Footer shows single rolled-up markup line with rate labels; if both rates match, shows "+22%"; if they differ shows "labor +22% / materials +20%". original_contract = jobs.contract_value. current_total = cost_subtotal + markup_amount (NOT original_contract + co_total + markup_amount — that formula was wrong for cost-plus). Draw history and legacy fallback sections unchanged.
- New helper: sbLoadClientActualSpend(sbClient, jobId, tenantId) in supabase.js — accepts sb+tenantId as params to avoid circular import. Returns { ok, error, data: { transactions, cost_subtotal, material_subtotal, labor_subtotal, material_markup_pct, labor_markup_pct, markup_amount, marked_up_total, original_contract, co_total, current_total } }.
- Open: Kalin needs to verify in client portal for 8617 Houston (cost_plus=true, labor_markup_pct=22, material_markup_pct=22, contract_value=102002, co_total=3700). Log in as kalinspratling@gmail.com / TestClient2026! → Financials tab.

[LOG - 2026-06-02] SUB_INVOICE_ACCRUAL_DRAWDOWN
- Action: Fixed sub invoice accrual job_transactions row not drawing down on partial payments. Three commits: (1) RPC fix for payment path, (2) RPC fix for void path, (3) one-time backfill.
- Files: supabase/migrations/20260602100000_fix_add_sub_invoice_payment_accrual_drawdown.sql, supabase/migrations/20260602110000_fix_void_sub_invoice_payment_accrual_cascade.sql, supabase/migrations/20260602120000_backfill_stale_sub_invoice_accruals.sql, avenstone-vite/src/lib/subInvoices.js
- Commits: b2af3b4, ed401e2, cd89d23 (all pushed to main)
- Root cause: add_sub_invoice_payment_with_ledger left the accrual job_transactions row (linked via sub_invoices.accrual_transaction_id) at the full invoice amount + status='pending' on every payment. The JS caller in sbAddSubInvoicePayment only flipped the accrual to 'paid' when newStatus==='paid' (full payment only). sbLoadJobFinancialSummary summed all pending sub_payout transactions for outstanding_pending, so partial payments showed inflated Outstanding in the Ledger stat bar. Same problem on void path: accrual wasn't restored. Confirmed live: Aguayos 16ab4bc1 accrual 97205011 at $27,900 after $6,500 payment.
- Fix model: accrual row amount always equals invoice remaining balance (invoice_amount − sum of non-voided payments). Both RPCs now recompute this after their write, atomically, within the same PL/pgSQL transaction. JS callers' ad-hoc accrual reads removed.
- Backfill: 1 stale row corrected (Aguayos 97205011: $27,900 → $21,400 pending). Zero stale rows confirmed after apply.
- Verification: pg_get_functiondef confirmed for both RPCs. Accrual 97205011 confirmed $21,400 pending. Stale-row query confirmed empty.
- Architecture note: accrual row is now the source of truth for "how much of this invoice is still pending." sbLoadJobFinancialSummary reads it correctly without any change — the fix was entirely on the write side (RPCs + JS callers).
- Open: None. Both RPCs verified live. Backfill complete.

[LOG - 2026-06-02] CLIENT_PORTAL_FINANCIALS_ENHANCEMENT
- Action: Added paid_to_date, firm_projected_total, potential_additional, and remaining_balance to the client portal Financials tab (cost_plus jobs). Extended sbLoadClientActualSpend with 3 new parallel fetches. Restructured headline card grid from 2-3 cards to 4 cards.
- Files: avenstone-vite/src/lib/supabase.js, avenstone-vite/src/components/client/ClientPortal.jsx
- Commit: a02301b — feat(client-portal): add paid-to-date, projected total, and potential-work disclosure to cost-plus financials
- Data sources: paid_to_date = SUM(inbound, direction='in', invoice_id IS NULL, status='paid'); outstanding_pending = SUM(pending outbound sub_payout/change_order accrual rows); potential_additional = SUM(sub_invoices where approved_at IS NULL, voided_at IS NULL); firm_projected_total = (costSubtotal + outstandingPending) × (1 + labor_markup_pct/100), NO pm_fee; remaining_balance = firm_projected_total − paid_to_date.
- Card grid: [Original Contract] [Authorized Budget (if co_total>0)] [Paid to Date] [Current Projected Total]. Potential additional work shows as an amber disclosure block if >0. Remaining balance shown as a gray line below.
- Math: firm_projected_total uses SINGLE labor_markup_pct (matches sbLoadJobFinancialSummary math, no pm_fee for client). The existing ledger footer uses split material/labor markup for per-line categorization — these two numbers coexist (ledger = what's been paid; projected = where it's heading). pm_fee excluded from client view (confirmed $2,000 on Houston). Build: green (524ms).
- Open: All zeros on Houston (no transactions, no sub_invoices yet). Need a job with live data to verify rendered numbers.

[LOG - 2026-06-02] CLIENT_PORTAL_ORIGINAL_CONTRACT_FIX
- Action: Fixed "Original Contract" card showing contract_value (post-CO total) instead of the true original signed contract. Removed the wrong "Authorized Budget" card (was double-counting COs). Rebuilt headline card grid.
- Files: avenstone-vite/src/lib/supabase.js, avenstone-vite/src/components/client/ClientPortal.jsx
- Commit: 5a0684c — fix(client-portal): show true original signed contract from job_estimates, fall back to authorized contract when absent
- ASYMMETRY RULE (record permanently): contract_value grows by the MARKED-UP CO price when a CO is approved (Kalin updates manually). co_total stores the RAW CO amount (maintained by trg_sync_co_total trigger on change_orders). They are NOT symmetric: contract_value − co_total ≠ original signed contract. For Houston: $102,002 − $3,700 = $98,302 (WRONG). True original = $97,488 (from job_estimates). NEVER compute original from subtraction. Always read job_estimates.estimate_data->>'contract_total'.
- "Authorized Budget" was: contract_value + co_total = $102,002 + $3,700 = $105,702 — WRONG (double-counted CO since contract_value already has the marked-up CO price baked in). Card removed entirely.
- New card structure (cost_plus only):
  - IF job_estimates has contract_total: ["Original Contract" (original_signed_contract), "Authorized Contract" (contract_value, captioned "incl. approved change orders"), "Paid to Date", "Current Projected Total" (gold)]
  - IF no job_estimates row: ["Authorized Contract" (contract_value), "Paid to Date", "Current Projected Total" (gold)]
- Coverage: 1 of 4 cost_plus jobs has job_estimates.estimate_data.contract_total (Houston $97,488). 3 jobs hit fallback (single Authorized Contract card). Verified: subtraction gives $98,302, job_estimates gives $97,488 — confirms job_estimates is the only reliable source.
- sbLoadClientActualSpend: renamed original_contract → authorized_contract; added original_signed_contract (null when no row). Added 6th parallel fetch: job_estimates.estimate_data (maybeSingle). Build: green (491ms).

---

[LOG - 2026-06-02] OVERVIEW_FINANCIALS_DRIFT_FIX
- Action: Killed contract/remaining drift between Overview and Financials tabs on the client portal.
- Files: avenstone-vite/src/components/client/ClientPortal.jsx
- Commit: 155f176 — fix(client-portal): Overview summary reads same financials helper as Financials tab
- Root cause: Overview computed contract_value + co_total (double-counts the CO since contract_value already includes marked-up CO price) and remaining = that − paid. Financials used sbLoadClientActualSpend. Two independent calcs diverged by $24k on 8617 Houston.
- Fix: Overview cost_plus card now reads original_signed_contract / authorized_contract / paid_to_date / remaining_balance from actualSpend state. actualSpend loaded via a dedicated useEffect that fires on tab='overview' OR tab='financials' for cost_plus jobs, guarded by loaded.spend flag. Non-cost_plus Overview unchanged.
- RULE: Overview and Financials client cards must read the same helper output. Never compute contract_value + co_total or contract − paid independently in ClientPortal for cost_plus jobs.

[LOG - 2026-06-02] SUB_INVOICE_LINE_ITEM_EDIT
- Action: Allow editing sub invoice line items (existing + new rows) across all non-voided, non-disputed states, with atomic accrual resync.
- Commits: c345c8b, d15acef, 6cae846 (all pushed to main)
- Files: supabase/migrations/20260602130000_extract_resync_sub_invoice_accrual.sql, supabase/migrations/20260602140000_add_edit_sub_invoice_with_ledger.sql, avenstone-vite/src/lib/subInvoices.js, avenstone-vite/src/components/jobs/tabs/financials/SubInvoicesSection.jsx

- Commit 1 — refactor(sub-invoices): extract resync_sub_invoice_accrual, shared by payment + void RPCs
  - New DB function `resync_sub_invoice_accrual(p_invoice_id, p_effective_date DEFAULT CURRENT_DATE)`: fetches invoice amount + accrual_transaction_id; no-op if voided or no accrual row; computes paid_sum from non-voided payments; remaining = GREATEST(0, amount − paid_sum); UPDATEs job_transactions accrual row.
  - Rewrote add_sub_invoice_payment_with_ledger: replaced inline accrual block with PERFORM resync_sub_invoice_accrual(p_sub_invoice_id, p_paid_date). Removed v_paid_sum/v_remaining vars.
  - Rewrote void_sub_invoice_payment_with_ledger: replaced inline accrual block + v_si RECORD + second SELECT with PERFORM resync_sub_invoice_accrual(v_pmt.sub_invoice_id). Removed v_si, v_paid_sum, v_remaining vars.
  - Verified: pg_get_functiondef confirms 3 functions; both RPCs have PERFORM resync, no inline block.

- Commit 2 — feat(sub-invoices): edit line items (existing + new) across all states with accrual resync + paid-floor guard
  - New RPC `edit_sub_invoice_with_ledger(p_invoice_id, p_amount, p_line_items, p_invoice_date, p_due_date, p_description)`: voided/disputed guards; if p_line_items: new_amount = SUM(item->>'total'); elif p_amount: new_amount = p_amount; else: existing amount; floor guard (RAISE EXCEPTION if new_amount < paid_sum); UPDATE sub_invoices; PERFORM resync_sub_invoice_accrual; returns (new_amount, new_status).
  - sbEditSubInvoice in subInvoices.js rewritten to call `edit_sub_invoice_with_ledger` RPC for financial fields. relatedScheduleItemId still uses direct .update() if needed. Returns { ok, newAmount, newStatus } on success.

- Commit 3 — feat(sub-invoices): line-item edit UI on invoice detail panel, owner/PM gated
  - InvoiceDetailPanel gains editing state + inline editor: seeds from inv.lineItems (or single row if no line items); auto-computes total when qty × unit_price both non-empty; + Row button adds blank row; live total shown; Save/Cancel buttons.
  - Edit button gated: canManage && !isVoided && !inv.disputed. Hidden while editing (action buttons hidden when editing=true).
  - Floor error surface inline in editor (keeps editor open on failure).
  - On success: calls onEditSaved() (= load() in parent) to refresh invoice list.

- Architecture note: sub_invoices.amount is an INDEPENDENT column (no trigger derives it from line_items). The edit RPC derives new_amount from SUM(line_items[i].total) when line_items provided. Always goes through the RPC so accrual stays consistent.

---

[LOG - 2026-06-02] CLIENT_PORTAL_PM_FEE_FIX
- Action: Added pm_fee to sbLoadClientActualSpend so client firm_projected_total matches internal projected_final_bill.
- Files: avenstone-vite/src/lib/supabase.js
- Commit: 04812a7 — fix(client-portal): include PM fee in client projected total to match internal projection
- Formula: firmProjectedTotal = (costSubtotal + outstandingPending) × (1 + laborMarkupPct/100) + pmFee. Matches supabase.js:1452 internal formula exactly.
- RULE: pm_fee is folded into the total only — never itemized on the client portal. No "PM fee" line item should ever appear in the client spend ledger or any client-facing card.
- Verified: Houston projected $83,114.24 (was $81,114.24), remaining $38,114.24 (was $36,114.24). Matches internal FinancialsTab.

[LOG - 2026-06-02] ESTIMATE_FLOW_ARC Slice 1 — NormalizedEstimateInput + sbCommitEstimate keystone
- Action: Built `avenstone-vite/src/lib/commitEstimate.js` — the single canonical write path for estimate_line_items. Not yet wired to production callers; slices 2–4 migrate takeoff / consultation / AI estimator; sbSaveEstimateLineItems removed at end of slice 4.
- Commit: 2721668 — feat(estimate-flow): NormalizedEstimateInput + sbCommitEstimate keystone (not yet wired)
- Files: avenstone-vite/src/lib/commitEstimate.js (204 lines, new file)

- Design decisions (locked):
  - multiplier REQUIRED — no silent default. Callers must pass even if 1.0. Guards the basement-floor-premium underbid bug: sbCommitEstimate hard-rejects any item where multiplier is missing or non-numeric.
  - markup_pct FORCED to 0 on every row regardless of caller input. Markup is a proposal-time concern applied once from a single rate source (Slice 5). console.warn fires if caller passes non-zero. NEVER bake propMargin into line items at commit time.
  - source='takeoff' scoped-delete: WHERE notes LIKE 'takeoff:%' — identical to acceptTakeoffDraft. Non-takeoff sources do NOT touch takeoff rows.
  - Notes format for source='takeoff': 'takeoff:<roomType>:<roomId>' (labor), 'takeoff:<roomType>:<roomId>:<trade>' (materials), 'takeoff:custom:<roomType>:<roomId>' (custom), + optional ' PENDING RATE' suffix. Must match acceptTakeoffDraft byte-for-byte.
  - Returns { ok, error, data: { inserted_count, line_item_ids } }. Accepts sb/tenantId/userId as explicit params (no circular import).

- Floor-premium limitation (known boundary — do not rediscover as a bug):
  Floor multiplier (basement 1.30 / second-floor 1.15) is ONLY derivable from LiDAR scan geometry (room.floor integer in normalized_geometry). Consultation and AI estimator paths have no floor geometry and commit multiplier=1.0 by design — explicit caller decision, not a silent default. Upgrade path: takeoff wizard (reads room.floor, maps via resolveMultiplier()). If non-scan floor premium is ever needed, floor level must be added to consultation_measurements or the AI extraction schema BEFORE a non-takeoff caller can pass a meaningful multiplier.

- Smoke test (job 4460936c, 107 Brentwood Dr, Belton MO): 2 rows inserted, all values verified, 2 rows deleted. total_cost, multiplier, markup_pct, tenant_id all PASS.
- STEP 3: sbCommitEstimate has zero production callers (grep); sbSaveEstimateLineItems untouched at supabase.js:1526; build green (640ms).
- Pending (slices 2–4): migrate acceptTakeoffDraft, ConsultationTab, EstimateTab onto sbCommitEstimate. Remove sbSaveEstimateLineItems at end of slice 4.

[LOG - 2026-06-02] ESTIMATE_FLOW_ARC Slices 2–4 — all three estimator paths wired through sbCommitEstimate
- Action: Migrated all three production estimator write paths off sbSaveEstimateLineItems onto sbCommitEstimate.
- Commits: 9c6e719 (Slice 2 takeoff), 4b51579 (Slice 3 consultation), b073eb8 (Slice 4 AI estimator). Pushed.
- Files: avenstone-vite/src/lib/takeoff.js, avenstone-vite/src/components/jobs/tabs/ConsultationTab.jsx, avenstone-vite/src/components/jobs/tabs/EstimateTab.jsx

- Slice 2 (takeoff/acceptTakeoffDraft): Replaced manual delete+build+insert (steps 4/5/6) with sbCommitEstimate(source='takeoff'). Delete isolation fires exactly once inside sbCommitEstimate — removed duplicate delete in acceptTakeoffDraft. Notes format and multiplier derivation identical; lineItemCount now uses commitResult.data.inserted_count.
- Slice 3 (ConsultationTab/saveEstimate): Replaced sbSaveEstimateLineItems with sbCommitEstimate(source='consultation'). Added explicit multiplier=1.0 (no floor geometry). markup_pct removed from caller payload (forced 0 by sbCommitEstimate). Throws on commitResult.ok=false.
- Slice 4 (EstimateTab/generateProposalPDF): Fixed category 'materials'→'labor' (AI lines are labor lump sums, not material SKUs — was a latent bug). Removed markup_pct=propMargin baked into DB rows (propMargin was embedding bid margin in estimate_line_items at commit time — violates the Slice 1 design contract). Added explicit multiplier=1.0. Added sb/AV_TENANT/AV_USER_ID imports (were missing). commit failure logs to console.error but does not throw (PDF generation already succeeded).

- KNOWN GAP (expected until Slice 5): Budget sub-tab shows cost not marked-up total for AI/consultation paths. markup_pct=0 on all rows. This is correct behavior until proposal-time markup (Slice 5) ships.
- OPEN (follow-up slice): LineItemModal.jsx still calls sbSaveEstimateLineItems at lines 52 and 70. It is a manual CRUD editor — not an estimator path. sbSaveEstimateLineItems was NOT removed from supabase.js. Remove only after LineItemModal is migrated to sbCommitEstimate in a dedicated slice.

[LOG - 2026-06-02] ESTIMATE_FLOW_ARC Slice 4b — AI category fix, LineItemModal wired, sbSaveEstimateLineItems retired
- Commits: 909cb38 (Part 1 — AI category), 0e4fb48 (Part 2 — LineItemModal), fda107f (Part 3 — retire helper). Pushed.
- Files: EstimateTab.jsx, commitEstimate.js, LineItemModal.jsx, supabase.js

- Part 1 — AI category fix: Replaced `category: 'labor'` hardcode in generateProposalPDF with `/material|allowance/i.test(li.description)` resolver. AI JSON has no category field; system prompt tags material/allowance lines in description text. Regex resolves correctly for demo (labor), LVP Flooring Material (materials), tile labor (labor), Toilet Allowance (materials). FRAGILE: AI may omit keyword on some material lines (e.g., "Drywall Board") → mislabels as labor. BACKLOGGED (Option B): add explicit `category` field to ai-estimator JSON schema in index.ts.

- Part 2 — LineItemModal (source='manual'): Added 'manual' to VALID_SOURCES. Extended VALID_CATEGORIES to include equipment/sub/permit/other (modal exposes 6 categories; no DB CHECK on estimate_line_items.category). Added optional `phase` to NormalizedEstimateInput (defaults to trade when absent — preserves modal's separate phase/trade fields). EDIT mode: delete-by-id + sbCommitEstimate insert (surgical, not full-replace). DELETE: direct sb delete by id. Multiplier preserved from item.multiplier on edits (floor premium not overwritten); 1.0 explicit for new items. markup_pct zeroed by sbCommitEstimate. Category is user-chosen from modal picker — no gap.

- Part 3 — sbSaveEstimateLineItems retired: Zero active callers confirmed in src/ (grep found only the comment in commitEstimate.js, not a call). Function removed from supabase.js. Stale import removed from EstimateTab. sbLoadEstimateLineItems retained (EstimateTab/reloadLineItems still uses it).

- ARCHITECTURE COMPLETE: estimate_line_items now has EXACTLY ONE write path (sbCommitEstimate) across all four sources: takeoff, consultation, ai, manual. The nuclear full-replace pattern (delete-all-then-insert-all for a job) is fully retired. Takeoff isolation (notes LIKE 'takeoff:%') is the only scoped delete remaining.
- KNOWN GAP (markup_pct in LineItemModal UI): The modal still renders a Markup % input field. sbCommitEstimate zeros it, so the value entered is never stored. Field remains cosmetically functional until Slice 5 adds proposal-time markup. No UI change needed now.
- KNOWN GAP (Slice 5): Budget sub-tab still shows cost not marked-up total. markup_pct=0 on all rows from all paths. Expected until Slice 5 ships.

[LOG - 2026-06-02] ESTIMATE_FLOW_ARC Slice 5 — per-category markup config (5-part batch)
- Commits (in order): ee041ec (Part 1), 95824b2 (Part 2), 427fb54 (Part 3), 316b074 (Part 4), 05baafc (Part 5). All pushed to main.
- Files: supabase/migrations/20260602150000_markup_category_config.sql (new), avenstone-vite/src/lib/markupConfig.js (new), avenstone-vite/src/lib/markupConfig.test.js (new), avenstone-vite/src/lib/supabase.js, avenstone-vite/src/components/jobs/tabs/EstimateTab.jsx, avenstone-vite/src/components/jobs/JobDet.jsx, avenstone-vite/src/components/modals/SettingsModal.jsx

- Part 1 — DB migration + shared mapper + unit tests:
  - New table `markup_category_config` (tenant_id, category CHECK 6 values, markup_mode CHECK 3 values, UNIQUE(tenant_id, category)). RLS: mcc_tenant_read (SELECT), mcc_owner_write (ALL for owner/PM). Seeded Avenstone tenant with 6 rows matching trigger defaults.
  - New `markupConfig.js`: exports DEFAULT_CATEGORY_CONFIG, normalizeCategoryKey, markupRateForCategory.
  - `normalizeCategoryKey` handles both estimate categories AND ledger types via LEDGER_ALIASES (sub_payout→sub, material_purchase→materials, material→materials, supply→materials, equipment_rental→equipment, fuel→equipment, change_order→other).
  - `markupRateForCategory(category, { laborPct, materialPct, categoryConfig })` — single source of truth. Returns Number(laborPct) for labor_rate mode, Number(materialPct) for material_rate mode, 0 for flat.
  - DEFAULT_CATEGORY_CONFIG = { labor: 'labor_rate', sub: 'labor_rate', materials: 'material_rate', equipment: 'material_rate', permit: 'material_rate', other: 'material_rate' } — reproduces trigger mapping exactly, zero breaking change for callers without DB config.
  - 39 unit tests pass (node markupConfig.test.js). Houston anchor verified: with equal rates (22/22), ALL categories return 22 regardless of bucket (algebraic no-op).

- Part 2 — Unified markup bucketing in sbLoadJobFinancialSummary + sbLoadClientActualSpend:
  - Both functions now import markupRateForCategory and normalizeCategoryKey. All per-transaction markup is computed via the shared mapper.
  - sbLoadJobFinancialSummary: loads material_markup_pct + tenant_id; projected_markup sums markupRateForCategory per cost txn; projected_final_bill = total_cost_base + projected_markup + pm_fee.
  - sbLoadClientActualSpend: per-transaction markupAmount via markupRateForCategory; firmProjectedTotal = costSubtotal + markupAmount + pendingMarkupAmount + pmFee.
  - Three previously-divergent markup implementations now converge on one function.

- Part 3 — Proposal-time markup restored in EstimateTab renderItems():
  - lineClientPrice(li) = total_cost × (1 + markupRateForCategory(li.category, ...) / 100).
  - categoryConfig loaded via sbLoadCategoryConfig in the initial useEffect Promise.all.
  - Markup visibility lost in Slice 4 (markup_pct=0 contract) is now fully restored at proposal time.

- Part 4 — sbSetContractFromEstimate (estimate→contract bridge):
  - Sums lineClientPrice per line + pmFee → writes jobs.contract_value + job_estimates.estimate_data.contract_total.
  - "Accept Estimate →" button in EstimateTab header: owner/PM gated, confirmation if contract_value already set.
  - EstimateTab receives profile prop (JobDet.jsx passes it through).
  - SAFETY: tested on test job only. Never run against Houston job 58345dc5 during development.

- Part 5 — Markup tab in SettingsModal:
  - Tab visible to owner + project_manager only.
  - 6 category rows (labor/sub/materials/equipment/permit fees/other), each with a select: labor_rate / material_rate / flat.
  - flat = 0% pass-through (permits, self-performed work).
  - Save calls sbSaveCategoryConfig; reloads on tab open via sbLoadCategoryConfig.

- Architecture decisions (locked):
  - `flat` mode = 0% markup = pass-through. Permits and self-performed work pass through at cost.
  - `normalizeCategoryKey` is the bridge between estimate categories and ledger types — callers never need to know the alias mapping.
  - DEFAULT_CATEGORY_CONFIG ensures zero breaking change for callers without DB config (trigger-equivalent behavior).
  - estimate→contract is one coded path (sbSetContractFromEstimate). No side-door ingest.
  - markup_pct=0 on all estimate_line_items rows remains the contract. Markup is applied at proposal/display time only.

- Open: None. gen:types run and committed (765709b).

[LOG - 2026-06-02] ESTIMATE_FLOW_ARC Slice 6 — oh-shit → CO loop closed
- Commits: c6ede4b (migration), d877563 (helper), cc798c5 (UI). All pushed to main. DB types regenerated and committed in final batch commit.
- Files: supabase/migrations/20260602160000_oh_shit_co_lineage.sql (new), avenstone-vite/src/lib/supabase.js, avenstone-vite/src/components/jobs/tabs/ConsultationTab.jsx

- Migration: added change_orders.oh_shit_moment_id UUID REFERENCES oh_shit_moments(id) + oh_shit_moments.converted_to_co_id TEXT REFERENCES change_orders(id) (TEXT because change_orders.id is TEXT). Both indexed. 4/4 verify PASS.

- sbCreateCOFromOhShit({ ohShitMomentId, jobId, amount?, markupPct? }):
  - Loads moment + job in parallel. Guards: moment not found → error; converted_to_co_id already set → "already converted" error.
  - Computes amount = caller value → midpoint ((low+high)/2) → 0. markup_pct = caller value → job.default_markup_pct (same source as COTab). co_number auto from count+1.
  - Creates CO via sbCO (the same thin insert wrapper COTab uses) with oh_shit_moment_id set. Not a parallel path.
  - Writes oh_shit_moments.converted_to_co_id = new CO id.
  - Returns { ok, error, data: co }. CO lands status='pending' — approval still goes through normal COTab flow.

- ConsultationTab UI:
  - "Create CO from this risk" button per moment row (owner/PM gated, requires dbRow?.id to exist).
  - On click: shows inline amount input pre-filled with midpoint + "Create CO" / "Cancel".
  - On success: moment row shows "→ CO created" badge (reads ohShitDbRows.converted_to_co_id), button disabled. Message: "CO created — approve it in the Change Orders tab."
  - Double-convert: after conversion, converted_to_co_id is set and the button is replaced by the badge.

- Verification (Cost Plus Sandbox job 5ebd7c3c, default_markup_pct=15):
  - oh_shit_moment created: id 6eda27d9, cost range $800-$1200. PASS
  - CO created: id f7eaa480, co_number CO-TEST-001, amount $1000 (midpoint), description from condition, status=pending, oh_shit_moment_id=6eda27d9, markup_pct=15. PASS
  - converted_to_co_id written: 6eda27d9.converted_to_co_id = f7eaa480. PASS
  - Bidirectional join: CO → moment → CO round-trips correctly. PASS
  - Double-convert guard: already_converted=true confirmed. PASS
  - Approval cascade: status=approved, contract_value=$1150 (=$1000×1.15), accrual job_transaction row (type=change_order, amount=$1000, status=pending, change_order_id=f7eaa480). PASS
  - FK enforcement verified: DELETE change_orders raised 23503 (cannot delete while oh_shit_moments.converted_to_co_id references it). PASS
  - Cleanup: all 3 test rows deleted, contract_value reset to 0. PASS

- PRINCIPLE (record permanently): The anti-surprise loop is closed end-to-end:
  1. Predict at AI consultation → stored as oh_shit_moment
  2. Disclose in proposal → included_in_proposal flag + PDF rendering
  3. Convert to CO on materialization → sbCreateCOFromOhShit, reuses COTab's CO path (not a parallel path)
  4. Flows to financials via the unified markup engine → sbCreateCOAccrualRow + contract_value bump at approval

- Architecture decision (locked): Conversion reuses sbCO and the existing approval cascade. No new write path for CO-from-risk. oh_shit_moment_id nullable — normal COs leave it null. No touch to Houston, markup mapper, sub-invoice accrual, or sbCommitEstimate.

- Open: None.

[LOG - 2026-06-02] ESTIMATE_FLOW_ARC Backlog Cleanup — four flagged items from ESTIMATE_FLOW_ARC verifications
- Commits: 093a726 (Item 1), 9519f26 (Item 3). Both pushed to main.
- Files: avenstone-vite/src/lib/markupConfig.js, supabase/functions/ai-estimator/index.ts, avenstone-vite/src/components/jobs/tabs/EstimateTab.jsx

- Item 1 — other/other_expense mapping (FIXED): Added `other_expense: 'other'` to LEDGER_ALIASES in markupConfig.js. Previously, markupRateForCategory('other_expense') fell to the `?? 'material_rate'` catch-all because 'other_expense' was absent from both LEDGER_ALIASES and DEFAULT_CATEGORY_CONFIG. Now normalizes to 'other' explicitly → DEFAULT_CATEGORY_CONFIG['other'] = 'material_rate'. 'other' was already in DEFAULT_CATEGORY_CONFIG (no change). Houston unchanged (algebraic no-op with equal rates). The catch-all still exists for truly unknown categories; real known categories no longer rely on it.

- Item 2 — LineItemModal category selector (NO FIX NEEDED): Category selector ALREADY EXISTS at LineItemModal.jsx:118-127. 6-option `<select>` (labor, materials, equipment, sub, permit, other). State initialized from `item.category ?? 'labor'`. Flows to commitItem.category in handleSave. Both 'labor' and 'materials' manual lines bucket correctly at proposal time. No code change.

- Item 3 — AI estimator emits category directly (FIXED): Added `"category"` field to ai-estimator EXTRACT_JSON_FOR_PROPOSAL schema (example shows `"category": "labor"`). Added extraction rule: `"category" must be exactly "labor" or "materials" for every line item — labor/subcontractor lines get "labor"; material purchases, allowances, equipment, and permits get "materials"`. In EstimateTab.jsx generateProposalPDF, changed category resolution from regex-only to: `li.category ?? (/material|allowance/i.test(li.description) ? 'materials' : 'labor')`. Model-provided category wins; regex fallback fires only for line items from pre-schema API calls. VERIFY: run a live AI estimate after edge fn deploys; confirm each line has a `category` in the parsed JSON; regex fallback should not be needed.

- Item 4 — Non-cost-plus Overview double-count (NO BUG): Audited ClientPortal.jsx line 648: `const contractTotal = Number(job.contract_value || 0) + Number(job.co_total || 0)`. For fixed-price jobs: COTab updates `co_total` but does NOT bump `contract_value` (opposite of cost-plus where contract_value grows by the marked-up CO price). So for fixed-price: `contract_value` = original signed amount; `co_total` = approved CO amounts; `contract_value + co_total` = full authorized total (correct, no double-count). This is deliberately DIFFERENT from cost-plus (where contract_value already includes COs, so adding co_total would double-count). No fix. Rule: do NOT symmetrize this formula — fixed-price and cost-plus use fundamentally different data models for COs.

- RULE (record permanently): Fixed-price vs cost-plus CO accounting is ASYMMETRIC. Fixed-price: contract_value stays at original signed value; co_total accumulates approved COs; authorized total = contract_value + co_total. Cost-plus: contract_value grows by the marked-up CO price on approval; co_total stores raw CO amount; authorized total = contract_value (already includes COs); adding co_total is a double-count. Never compute authorized total the same way for both job types.

[LOG - 2026-06-02] CO_TOTAL_DOUBLE_COUNT_FIX — trg_sync_co_total bug + sbLoadJobFinancialSummary hardening + backfill
- Action: Three-part fix for co_total double-count on cost-plus jobs. Discovered during e2e_test_run.js diagnostic.
- Commits: 20a339f (Part 1), f7c187b (Part 2), 8a3e39e (Part 3). All pushed to main.
- Files: supabase/migrations/20260602170000_gate_co_total_trigger_cost_plus.sql (new), supabase/migrations/20260602180000_backfill_co_total_cost_plus.sql (new), avenstone-vite/src/lib/supabase.js (line 1439).

- Root cause: `sync_job_co_total()` in 20260423_financial_bug_fixes.sql ran `UPDATE jobs SET co_total = get_job_co_total(job_id)` on ALL jobs with no cost_plus check. For cost-plus jobs, COTab._doApCO already bumps contract_value by the marked-up CO price. The trigger also set co_total = raw CO amount. sbLoadJobFinancialSummary then added both: contract_total = contract_value + co_total → double-counted the CO. Houston: $102,002 + $3,700 = $105,702 (wrong). Should be $102,002.

- Part 1 — Gate trigger (migration 20260602170000):
  - Rewrote `sync_job_co_total()`: adds `IF NOT COALESCE((SELECT cost_plus FROM jobs WHERE id = v_job_id), false) THEN` guard around the UPDATE. Cost-plus jobs: function is a no-op. Fixed-price: trigger behavior unchanged. Verified via pg_get_functiondef: cost_plus guard confirmed live.

- Part 2 — Harden read (supabase.js:1439):
  - Changed `const contract_total = Number(contractValue || 0) + Number(coTotal || 0)` → `const contract_total = costPlus ? Number(contractValue || 0) : Number(contractValue || 0) + Number(coTotal || 0)`. Defense in depth: even if something else writes co_total on a cost-plus job, the read will ignore it.

- Part 3 — Backfill (migration 20260602180000):
  - 3 jobs were polluted by the old trigger: test-flow-001 ($2,500), Houston ($3,700), 999 Test Lane ($1,150). All zeroed. Houston contract_value=$102,002 unchanged. Idempotent migration.

- PERMANENT RULE: co_total MUST be 0 for cost-plus jobs. contract_value absorbs the marked-up CO price at approval (COTab._doApCO). Only fixed-price jobs maintain co_total. Do NOT unify fixed-price and cost-plus CO paths. Do NOT revert to the unguarded trigger.

- Client portal (sbLoadClientActualSpend): uses `authorized_contract = Number(j.contract_value ?? 0)` directly (never adds co_total) — was already correct. Unaffected by this fix.

- Fixed-price regression: trigger still fires for cost-plus=false jobs (path unchanged). No fixed-price jobs with approved COs exist — regression verified logically. Behavior: trigger updates co_total = sum(approved CO amounts), contract_value unchanged. This asymmetry is permanent.

[LOG - 2026-06-02] PROPOSAL_PDF_REBUILD — DB-driven proposal PDF replaces fragile AI JSON extraction
- Action: Rebuilt proposal PDF to read estimate_line_items DB rows directly, eliminating EXTRACT_JSON_FOR_PROPOSAL round-trip that failed with 8192-token truncation on large estimates.
- Commits: 29c1ad9. Pushed to main.
- Files: avenstone-vite/src/lib/pdf.js, avenstone-vite/src/components/jobs/tabs/EstimateTab.jsx

- Root cause of old failure: generateProposalPDF() called ai-estimator with EXTRACT_JSON_FOR_PROPOSAL. For a 102-line estimate, the 18k-char narrative + JSON response exceeded the 8192-token output limit. JSON was cut mid-object → JSON.parse threw → propLineItems stayed [] → PDF buttons disabled. Additionally, the old buildProposalPDF read li.amount (AI JSON field), which was undefined on DB rows → $0 on every line.

- pdf.js — buildProposalPDF rebuilt (~190 lines):
  - New signature: buildProposalPDF(job, lineItems, ohShitMoments, { laborPct, materialPct, categoryConfig, pmFee, proposalNum, schedule, flags })
  - Reads DB columns (total_cost, category, trade, description, quantity, unit) not AI JSON fields
  - Per-line client price: total_cost × (1 + markupRateForCategory(li.category, {laborPct, materialPct}) / 100)
  - Layout: navy header, job block, flags callout (gold border), line items grouped by trade (navy headers, cream trade rows, zebra body, allowance italic+tag, trade subtotals), summary block (Hard Cost / Markup / PM Fee / GRAND TOTAL navy bar), oh shit moments, payment schedule, footer
  - chkPage(y, h) helper replaces scattered inline y>720 checks. SAFE_BOTTOM=728.
  - Summary: hardCostTotal + markupTotal + pmFee = grandTotal

- EstimateTab.jsx — 9 targeted edits:
  1. Removed sbCommitEstimate import (no longer needed — PDF doesn't commit anymore)
  2. Added auto-init useEffect: navigating to proposal sub-tab with line items auto-calls openProposal()
  3. openProposal() rewritten: no AI call, populates propLineItems from DB lineItems with markupRateForCategory pricing
  4. generateProposalPDF() rewritten: passes DB lineItems to buildProposalPDF, no sbCommitEstimate call
  5. Build-tab "Save PDF" button relabeled "Save Draft (Internal)" — raw markdown dump, internal use only
  6. Not-ready guard updated: shows line item count + "Build Proposal" button when items exist but propReady=false
  7. Removed profit margin slider (was duplicate of markup % logic)
  8. Summary block recomputed from lineItems + markupRateForCategory (consistent with Line Items sub-tab)
  9. PDF button disabled state: propLineItems.length === 0 → lineItems.length === 0

- Also fixed: 7 estimate_line_items rows on 999 Test Lane test job recategorized from 'materials' to 'labor'. Root cause was test commit script regex overfitting (/drain/, /board/, /register/). NOT a production bug — production commit path uses li.category ?? (/material|allowance/i.test()) which is correct.

- PATTERN: EXTRACT_JSON_FOR_PROPOSAL was the wrong architecture for large estimates. DB rows are the canonical source for proposal rendering. Any future work on the proposal flow must read estimate_line_items directly, not parse AI JSON.

[LOG - 2026-06-02] PROPOSAL_PDF_UNIFY — Build "Save PDF" and Proposal tab now produce the same structured PDF
- Action: Fixed incomplete state from 29c1ad9. Build-tab "Save PDF" still called buildEstimatePDF (raw markdown dump). sendEstimateToClient also sent raw markdown to client email. Both now use _buildProposalDoc() → buildProposalPDF from DB lineItems.
- Commit: 74c8c37. Pushed to main.
- Files: avenstone-vite/src/components/jobs/tabs/EstimateTab.jsx

- Root cause of incompleteness: 29c1ad9 correctly rebuilt buildProposalPDF and openProposal() but left saveEstimatePDF() and sendEstimateToClient() calling the old buildEstimatePDF (the raw AI narrative dump). The Build-tab button was relabeled but not rewired.

- Changes:
  1. Removed buildEstimatePDF from import (retired from EstimateTab use)
  2. Added _buildProposalDoc() private helper: extracts [FLAG:] tags from AI narrative, calls buildProposalPDF(job, lineItems, propOhShit, {lp, mp, pmFee, propNum, schedule, flags})
  3. saveEstimatePDF() now calls _buildProposalDoc() → saves as 'proposal' type (was 'other')
  4. sendEstimateToClient() now calls _buildProposalDoc() → sends structured PDF to client
  5. Both gated on lineItems.length === 0 (empty state guard)
  6. Button relabeled "Save PDF" (no longer "Save Draft (Internal)")
  7. Loading spinner text fixed: "Extracting line items from estimate…" → "Loading proposal data…"

- ARCHITECTURE: _buildProposalDoc() is the single entry point for all PDF generation in EstimateTab. It reads DB lineItems, uses propOhShit/propSchedule/propNum/propPmFee from state (populated by openProposal(); sensible defaults if not yet called). buildEstimatePDF (raw AI markdown dump) is dead code in pdf.js — do not wire it back up.

- VERIFY (pending): Both "Save PDF" (Build tab) and "Download PDF"/"Save to Documents" (Proposal tab) should produce the same branded structured PDF. No ai-estimator network call on either path.

[LOG - 2026-06-02] MARK_DRAW_PAID — cost-plus draw paid directly, no Send/Stripe required
- Action: Added "Mark Paid" button to draw rows on Draws tab (cost-plus jobs). Reused MarkPaidModal via onSubmit override. Added sbMarkDrawPaid helper.
- Commit: 031bef0. Pushed to main.
- Files: avenstone-vite/src/lib/supabase.js, avenstone-vite/src/components/modals/MarkPaidModal.jsx, avenstone-vite/src/components/jobs/tabs/InvoicesSubTab.jsx

- ARCHITECTURE: On cost-plus jobs the DRAW is the billable document — no invoice needed.
  - sbMarkDrawPaid writes: (1) job_transactions direction='in', type='client_payment', invoice_id=NULL, draw_id=draw.id; (2) draw_schedules.paid_amount + status update.
  - invoice_id MUST be NULL — sbLoadJobFinancialSummary and sbLoadClientActualSpend bucket inbound payments by invoice_id IS NULL for cost-plus jobs. If invoice_id is set, the payment is invisible to bucket_credit and paid_to_date.
  - draw_id is set on the transaction for tracking/reporting but does not affect bucket math.

- MarkPaidModal: added optional onSubmit prop. If provided, calls it instead of sbMarkInvoicePaid. Reuses full form: amount, method, date, reference, notes, partial-payment validation.

- InvoicesSubTab: Mark Paid button shows on draw rows where status not in ['paid','cancelled']. Passes synthetic invoice-like object (id, invoice_number='Draw #N', total_amount, amount_paid) for form display. Send/Stripe path untouched — optional for online payment, not required for cash/check.

- Verified on 999 Test Lane Draw #1 ($25k): bucket_credit=$25k, float=-$25k, draw.status=paid, job_transactions invoice_id=null. All checks pass.

- COST-PLUS INCOME RULE: Always write draw payments as direction='in', invoice_id=NULL. Never attach them to an invoice. This is what makes them visible in bucket_credit and paid_to_date.


[LOG - 2026-06-03] FIELD_TAB_DEFAULT_AND_MATERIALS — Field tab default + Materials sub-tab removal
- Action: Changed Field tab default landing from Notes → Daily Logs. Removed Materials sub-tab from Field tab (Financials→Materials is now the single home).
- Commit: ea78306. Pushed to main.
- Files: avenstone-vite/src/components/jobs/JobDet.jsx (line 33: useState('notes') → useState('logs')), avenstone-vite/src/components/jobs/tabs/FieldTab.jsx (removed MaterialsTab import, removed materials entry from SUB_TABS, removed render line).

- AUDIT VERDICT: SAME. Both Field→Materials and Financials→Materials rendered the identical MaterialsTab component (MaterialsTab.jsx). Both called sbLoadMaterialOrdersForJob / sbUpdateMaterialOrder against the material_orders table. Field→Materials was a pure duplicate view — no unique data, no unique writes. Safe to remove.

- DATA SOURCE (MaterialsTab): table=material_orders, reads via sbLoadMaterialOrdersForJob (supabase.js:4581), writes status transitions via sbUpdateMaterialOrder (supabase.js:4604). Also calls sbPhoto for delivery photos (entity_type='material_order'). AddQuoteModal handles new order creation.

- Financials→Materials: FinancialsTab.jsx:43 — unchanged, still imports and renders MaterialsTab.

[LOG - 2026-06-03] RETAINAGE_RELEASE_ZERO — Cost-plus retainage release zeroing fix
- Action: Fixed bug where sbLoadFinancialSummary permanently reported stale retainage_held after a retainage-release draw was paid. draw_schedules.retainage_held was set at compose time and never cleared by any pay flow.
- Migrations: 20260603200000_retainage_release_draw.sql (ADD COLUMN is_retainage_release BOOLEAN NOT NULL DEFAULT false + initial RPC), 20260603200100_retainage_release_rpc_invoiced_check.sql (replace RPC with 3-param version preserving invoiced_amount gate).
- RPC: mark_draw_paid_release_retainage(p_draw_id, p_paid_amount, p_min_invoiced_amount DEFAULT NULL). Atomic: status flip + sibling retainage_held=0 in one PG transaction. Triggers only when is_retainage_release=true AND new_status='paid'.
- Files: supabase.js — sbMarkDrawPaid now calls RPC instead of standalone UPDATE; sbMarkInvoicePaid draw branch calls RPC with p_min_invoiced_amount=target_amount (preserves invoiced_amount gate); sbComposeDraw accepts isRetainageRelease=false arg.
- Verified: 2 source draws retainage_held=$500 each → fire RPC on release draw → both zeroed atomically → sbLoadFinancialSummary retainage_held=$0.
- Commits: 9ace569 (migration 1), 2474f29 (migration 2), aa85090 (JS wiring). All pushed.
- Open: PhaseAdvanceCard override button visual fix (styling only, separate commit 8867825, already shipped). UI for composing a retainage-release draw (isRetainageRelease checkbox) not yet wired — sbComposeDraw accepts it, no UI surface yet.

[LOG - 2026-06-03] ANTI_SURPRISE_ENGINE_ARC_P2_0 — Phase 2.0: Trade vocabulary cleanup (keystone foundation)

- Action: Audited and cleaned trade vocabulary in schedule_items. Extended canonicalizeTrade with TRADE_ALIASES map. Fixed "Garage doors" → "Garage door" (1 row). Zero semantic dupes remain.
- Files: avenstone-vite/src/lib/tradeUtils.js, supabase/functions/ai-master-agent/index.ts, supabase/migrations/20260604310000_normalize_trade_semantic_dupes.sql
- Commit: 2fcefaf. Pushed.

AUDIT FINDINGS:
- Semantic dupes found: exactly 1 — "Garage doors" vs "Garage door". That was the complete set.
- canonicalizeTrade(P2.1) only handled /-([A-Z])/g expansion. "Garage doors" passed through unchanged (it's a trailing plural, not a hyphen pattern).
- Non-phase-map trades that are valid: Roofing, Garage door, Tile - Backsplash. These are in trade_taxonomy but have no phase or playbook entry. PMs can schedule sub_starts for them; they just don't participate in derivePhaseStatus or walkthrough matching.

VOCABULARY ARCHITECTURE (locked):
- trade_taxonomy = controlled vocabulary for ALL valid full-path trade strings (platform-wide, tenant_id=NULL). Full-path = "parent_trade - sub_trade" or bare "parent_trade" for leaf parents.
- trade_phase_map = controlled vocabulary for PHASE DERIVATION and WALKTHROUGH matching (17 Avenstone rows, 10 primary). schedule_items.trade must match trade_phase_map.trade for engine logic to fire. Does NOT restrict what trades can be scheduled.
- canonicalizeTrade (tradeUtils.js) = single normalizer. Two-pass: (1) /-([A-Z])/g regex expansion, (2) TRADE_ALIASES lookup. All schedule_items.trade write paths go through it.
- To add new semantic aliases: TRADE_ALIASES in tradeUtils.js + inline alias in ai-master-agent/index.ts _TRADE_ALIASES (KEEP IN SYNC comment).

BEFORE: Demo(5), Drywall - Hang(4), Electrical - Rough-in(2), Framing(3), Garage door(1), Garage doors(1), HVAC - Install(2), Paint - Interior(1), Plumbing - Rough-in(2), Roofing(1), Tile - Backsplash(1), Tile - Floor(1) — 12 distinct values.
AFTER:  Demo(5), Drywall - Hang(4), Electrical - Rough-in(2), Framing(3), Garage door(2), HVAC - Install(2), Paint - Interior(1), Plumbing - Rough-in(2), Roofing(1), Tile - Backsplash(1), Tile - Floor(1) — 11 distinct values, 0 dupes.

[LOG - 2026-06-03] ANTI_SURPRISE_ENGINE_ARC_P1 — Phase 1: Knowledge layer + generation + dispatch
- Action: Shipped the first vertical slice of the Anti-Surprise Engine. tenant_playbook_items (10 Avenstone trade checklists, 89 items with photo_required/must_document flags), anti-surprise-generator edge fn (nightly 3am UTC, resolves trades from estimate_line_items, fuzzy word-prefix match to playbook, writes scheduled_actions walkthrough_prep rows), anti-surprise-dispatcher edge fn (every 15min, fires ripe rows, creates todo+notification for PM), 3 client helpers.
- Constraint fixes found at build time: scheduled_actions.kind and .source needed walkthrough_prep/anti_surprise_engine added; notifications_type_check was stale — DROPPED (open type system). todos.source uses 'engine'.
- Verified end-to-end on 999 Test Lane: 9 scheduled_actions generated, all 9 fired, 9 todos + 9 notifications created.
- Commits: bebbb52, 1a9052e, 295bb5b, 8bf9027, 87c46a8, e48104e. All pushed.
- Open: Cabinets/vanities fuzzy match gap only in SQL simulation (JS edge fn handles it); push double-trigger idempotency still needed before volume; site_visit_checklist_items reconciliation deferred to P2.
- ANTI_SURPRISE_ENGINE_ARC.md updated with Phase 1 shipped block.

[LOG - 2026-06-03] ANTI_SURPRISE_ENGINE_ARC_P1_5 — Phase 1.5: PlaybookChecklist UI wired
- Action: Closed the generation→UI gap. job_walkthrough_items table (per-job per-trade execution layer, seeded from tenant_playbook_items on first open). PlaybookChecklist.jsx (full-screen overlay: item-by-item pass/fail/skip, must_document gate on completion, per-item camera capture="environment" attaching to job_files as entity_type='job_walkthrough_item'). TodoCard.jsx: walkthrough_prep type gets "Start Walkthrough" button → onOpenWalkthrough callback. HomeScr+App.jsx thread onOpenWalkthrough → walkthroughProps state → PlaybookChecklist overlay at App level.
- Migration: job_walkthrough_items (3 RLS policies, 2 indexes, ON DELETE CASCADE from jobs), extended job_files_related_entity_type_check to include 'job_walkthrough_item'. Constraint: 20260604100000.
- Verified on 7b44611a Plumbing-Rough-in: 10 items seeded from playbook, 3 marked pass (completed_at+by_id set), pressure test item got photo attached (job_files id=01dfee7c), related_entity_type='job_walkthrough_item', related_entity_id=afbd39b3. State persists across sessions (no recreate on reopen).
- Dispatcher updated: todo payload now includes kind='open_walkthrough' and jobId for future handleResume routing.
- Commits: 9471ad1 (migration), fd0dc79 (UI+helpers).
- Open: MyTodosScreen does not yet pass onOpenWalkthrough (todos shown outside HomeScr won't have the button — add when wiring that screen). Push double-trigger still pending. cancelFail function takes itemId arg but is defined as unused closure — harmless but could be simplified.

[LOG - 2026-06-03] ANTI_SURPRISE_ENGINE_ARC_P0 — Phase 0: Push double-ping fix
- Audit finding: NOT a true double-send. on_notification_insert_push → trigger_notify_push() sends {record: row_to_json(NEW)} to send-push, but send-push expects top-level {user_id,...} and always returns 400 'user_id required'. This trigger has NEVER delivered a push. The working path is trg_notification_push_fanout → notification-push-fanout → send-push (correctly destructures record before calling send-push).
- Fix: DROP on_notification_insert_push (dead weight, added ~50ms HTTP fail on every notification INSERT). No push_sent guard needed (no double-send was occurring; AFTER row triggers fire exactly once by Postgres semantics).
- Added walkthrough_prep + phase_advanced to PUSH_TYPES in notification-push-fanout so engine notifications reach PM phones.
- Verified: 3 triggers remain (on_notification_insert conditional, on_notification_insert_sms, trg_notification_push_fanout). Test INSERT confirmed exactly 1 push trigger active.
- Migration: 20260604200000_drop_dead_push_trigger.sql. Commit: 9e6173b.

[LOG - 2026-06-03] ANTI_SURPRISE_ENGINE_ARC_P2_1 — Phase 2.1: Schedule-lock walkthroughs

- Action: Walkthroughs now fire at the day before their trade's sub_start scheduled date, not +1 day after job-sold. fire_at is reactive: updates when a sub_start is created, edited, or cascade-moved.
- Files: avenstone-vite/src/lib/tradeUtils.js (new), avenstone-vite/src/lib/supabase.js, supabase/functions/ai-master-agent/index.ts, supabase/functions/anti-surprise-generator/index.ts, supabase/migrations/20260604300000_normalize_schedule_items_trade.sql, avenstone-vite/src/components/dashboard/CalScr.jsx
- Commits: d2bc677 (P+B1+B2 JS), cf323a1 (migration), 3a9529e (master-agent), 433ff49 (B3). All pushed.

PREREQUISITE P — trade normalization:
- Problem: schedule_items.trade had inconsistent values: "Plumbing-Rough-in" (hyphenated) vs "Plumbing - Rough-in" (canonical). Source: Master Agent's create_schedule_item wrote String(input.trade) verbatim; old test scripts inserted directly.
- BEFORE: Drywall-Hang(2), Electrical-Rough-in(1), HVAC-Install(1), Paint-Interior(1), Plumbing-Rough-in(1), Tile-Floor(1) — 6 rows with wrong format.
- AFTER (migration + code fix): 0 hyphenated rows. All canonical: "Drywall - Hang", "Electrical - Rough-in", etc.
- canonicalizeTrade() in avenstone-vite/src/lib/tradeUtils.js — single shared rule: /-([A-Z])/g → ' - $1'. Applied at write time in sbCreateScheduleItem, sbUpdateScheduleItem (supabase.js), and inlined in ai-master-agent index.ts. CalScr placeholder updated to show canonical example.

B1 — fire_at hook:
- sbSyncWalkthroughFireAt(jobId, trade, scheduledDate) added to supabase.js. Finds matching scheduled_actions row (kind=walkthrough_prep, rule_key=walkthrough_prep::<canonTrade>, status=scheduled). Updates fire_at = scheduledDate - 1 day (midnight UTC). Owner/PM RLS allows this update.
- Called fire-and-forget in sbCreateScheduleItem (when sub_start has trade+date) and sbUpdateScheduleItem (when scheduled_date changes on sub_start). Failures logged to console, never block caller.

B2 — cascade-aware:
- sbCascadeScheduleChange downstream select now includes type + trade.
- After updating a cascaded sub_start item, sbSyncWalkthroughFireAt fires with the new date. Ensures that when the cascade engine pushes a sub_start date, the walkthrough's fire_at moves with it.

B3 — generation alignment:
- anti-surprise-generator now uses .eq('trade', workType) instead of .ilike fuzzy match when looking up existing sub_start items to compute initial fire_at. Correct because workType (from tenant_playbook_items) and schedule_items.trade are now both canonical.

Verified end-to-end on 7b44611a (Plumbing - Rough-in):
- Before normalization: trade='Plumbing-Rough-in'. After migration: trade='Plumbing - Rough-in'. ✓
- Test row inserted (fire_at=2030-01-01). Sub_start date=2026-06-16. After B1 sync: fire_at=2026-06-15 ✓
- Sub_start date moved to 2026-08-15. After B1 re-sync: fire_at=2026-08-14 ✓
- Test row cleaned up. Sub_start date restored. ✓
- audit:schema: write drift 0, no new issues. ✓

ARCHITECTURE NOTE: sbSyncWalkthroughFireAt only updates status='scheduled' rows. If the walkthrough_prep row has already fired (todo+notification created), fire_at is irrelevant — don't touch it. For a future "walkthrough reminder delay" feature (P3: reminders re-fire off schedule points), the same hook will need to handle re-scheduling the reminder.

[LOG - 2026-06-03] ANTI_SURPRISE_ENGINE_ARC_P1_6 — Phase 1.6: Field tab Walkthroughs sub-tab
- Action: Added Walkthroughs sub-tab to JobDet's Field tab as the durable home base. sbLoadJobWalkthroughs helper (SA canonical list LEFT JOIN JWI progress state → covers un-started walkthroughs). WalkthroughsTab.jsx: per-walkthrough card showing status (not_started/in_progress/complete), progress bar, must-doc pending badge, tap to open PlaybookChecklist. FieldTab tab bar now scrollable (overflowX:auto) for 4 tabs on mobile.
- Prop chain threaded: App.jsx → JobsScr → JobDet → FieldTab → WalkthroughsTab (onOpenWalkthrough). Same walkthroughProps/PlaybookChecklist overlay reused — home-screen todo still works unchanged.
- Source of truth: scheduled_actions walkthrough_prep rows (canonical, includes un-started). job_walkthrough_items used only for progress state (lazily seeded on first open).
- Verified on 7b44611a: 9 walkthroughs in list — 7 not_started, 2 in_progress. Plumbing shows 3 pass/7 pending with pressure-test photo still linked to item afbd39b3. Sub-tab order: Daily Logs | Walkthroughs | Photos | Notes.
- Commit: f68fa1d. Pushed.

[LOG - 2026-06-04] ROLE_DASHBOARDS_ARC_P1 — Owner Home dashboard (guinea pig)

- Action: Built Owner Home dashboard as the first role config. Data audit first, then sbLoadOwnerDashboard rollup, then OwnerHomeScr UI, then App.jsx wiring + Aven AI center button.
- Files: avenstone-vite/src/lib/supabase.js (sbLoadOwnerDashboard), avenstone-vite/src/components/owner/OwnerHomeScr.jsx (new), avenstone-vite/src/App.jsx (owner conditional + Aven AI button)
- Commits: 7931f06 (B1 rollup), d007ff7 (B2 UI), 5ae3736 (B3 wiring). All pushed.

DATA SOURCES CONFIRMED (live, Avenstone tenant):
- Pipeline Value: $183,002 — SUM(contract_value) WHERE status IN (contract, in_progress, final_touches)
- Open Receivables: $10,000 — invoices not paid/void (1 partially_paid invoice)
- Collected MTD: $71,207.50 — job_transactions direction=in, status=paid, >= month_start
- Gross Profit MTD: $7,289.18 — collected_mtd - SUM(direction=out, MTD)
- Collected Trend: +2,840% 30d vs prior 30d (test data artifact; formula is real)
- Revenue Chart: 3 months of data (Apr/May/Jun 2026) — SVG area chart, no external lib
- Active Projects: 5 jobs (includes test/sandbox jobs in dev environment)
- Company Health: activeProjects=5, newLeads=3, jobsBehind=3 (overdue schedule items)
- AI Insights: walkthroughsPending=8 (engine todos), jobsBehind=3

OMITTED TILES (no real source):
- "Estimates awaiting follow-up" — no response-tracking signal
- "Division performance" — no division model
- Overdue invoices — 0 count, not shown when zero (zero is fine, not shown)

DESIGN SYSTEM (owner aesthetic):
- White cards on #F7F5F0 cream background, navy text (#0A1F44), gold accent (#C9A84C)
- DM Serif Display for KPI hero numbers and card titles
- KPI strip: gold left border, 28px serif hero numbers, trend badge on Collected MTD
- SVG area chart: navy line + gradient fill area, month labels, summary chips
- Active projects: progress bars, status pills (gold/green/blue)
- Responsive at 900px (wide vs mobile layout)

AVEN AI CENTER BUTTON:
- Gold ✦ circle on navy background, centered in bottom nav, owner-only
- Fires setPendingAction({ kind: 'master_agent_tool_call' }) → opens MasterAgent
- Design: 44px circle, 2px gold border, -16px marginTop to rise above nav bar

ARCHITECTURE NOTES:
- OwnerHomeScr renders inside .main div (same slot as HomeScr). Non-destructive — HomeScr intact for all non-owner roles.
- sbLoadOwnerDashboard: role-parameterized by tenantId today. Other role configs will filter differently but call the same function structure.
- Shared shell = App.jsx NAV array (parameterized by role flags). No DashShell.jsx extraction needed for Phase 1 — that's a follow-on when 2+ roles exist.
- First-pass: screenshot and refine via Vercel. Test tenant has sandbox/test jobs in active list (expected in dev).

[LOG - 2026-06-04] ROLE_DASHBOARDS_ARC — OwnerHomeScr polish (commits 4535136, e19cfab, 95bb3b9)
- 4535136: SVG chart smoothed (cubic bezier path), AI Insights chips now tap to open relevant screen, open todos count added to Company Health row.
- e19cfab: Nav flash fix — `sel` state now initialized from `pendingJobId` before first render, eliminating the brief wrong-screen flash on cold-start with a pending job.
- 95bb3b9: Expandable walkthrough list (tap to expand full list vs. top-3 preview), chart clip fix (SVG viewBox adjusted to prevent right-edge crop), mobile chart height tuned.

[LOG - 2026-06-10] DOC_RECONCILE — memory/doc audit corrections
- Action: 2026-06-10 audit found 8 doc drift items. All corrected in one pass.
- Files: CLAUDE_MEMORY.md, CLAUDE.md, supabase/functions/ai-pm-nightly/index.ts, deleted supabase/migrations/20260429_quote_requests_rename.sql.
- Changes:
  1. CLAUDE_MEMORY line ~79: removed stale "22 total, 11 CONFIRM_TOOLS" sentence (superseded by 24-tool entry).
  2. CLAUDE_MEMORY line ~80: corrected trigger list — on_notification_insert_push was dropped in P0 (9e6173b); only on_notification_insert_sms remains as a pre-existing Dashboard trigger.
  3. CLAUDE_MEMORY: added LOG for 3 undocumented OwnerHomeScr polish commits (4535136, e19cfab, 95bb3b9).
  4. CLAUDE_MEMORY Active open items: added AI_PM_LEGACY_RULES — 3 dead-schema rules in ai-pm-nightly, do not reactivate without porting to job_sub_engagements/engagement_bids.
  5. Deleted supabase/migrations/20260429_quote_requests_rename.sql — references dead legacy ITB schema (invitations_to_bid dropped Phase 3, 2026-05-06). Landmine for future npm run migrate.
  6. CLAUDE_MEMORY Schema reality: added drift note for job_lidar_scans.scanner_version + pg_cron active jobs list.
  7. CLAUDE.md API Cost Rules: replaced stale "fires Opus narrative — DISABLED" with accurate "pure SQL (14 rules, zero model calls), no pg_cron schedule."
  8. ai-pm-nightly/index.ts: deleted dead AI_PM_URL constant; added DEAD SCHEMA comment block above Rules 9/10/11.

[LOG - 2026-06-10] DESIGN_SYSTEM_ARC Slice 1 — token layer locked, shared primitives restyled
- Action: Audited styling architecture. Created token layer. Updated global classes. Restyled App.jsx bot-nav + TodoCard to consume tokens.
- Commits: 10de4d9 (tokens+global+index.css), 9798340 (shared component restyle). Both pushed.
- Files: avenstone-vite/src/styles/tokens.css (NEW), avenstone-vite/src/styles/global.css (NEW), avenstone-vite/src/index.css, avenstone-vite/src/App.jsx, avenstone-vite/src/components/common/TodoCard.jsx

AUDIT FINDINGS:
- Single CSS file (index.css, 181 lines), no prior token layer, no styles/ directory — everything hardcoded.
- Inline style bypass: 4,597 instances total (4,558 across 112 component files + 39 in App.jsx)
- Top 5 worst files: ClientPortal.jsx (259), SubInvoicesSection.jsx (164), FloorPlanEditorScr.jsx (148), SubJobView.jsx (128), ScheduleTab.jsx (108)
- Shared CSS classes that exist: .stat/.stat-lbl/.stat-val, .badge/.bdot, .btn/.btn-navy/.btn-gold, .card, .modal/.overlay, .sec-hd h2, .jcard, .tbl, .finp — but NO CSS vars and NO radius/shadow on any card class
- Auto-update estimate: ~25-30% auto-update from token var changes. ~70-75% needs manual sweep per-screen.

WHAT SHIPPED:
- tokens.css: full CSS custom property system — navy ramp, gold, cream, border, text, 5 status tints (amber LOCKED at FEF3C7/FCD34D), font-display/font-body, radius scale, shadow scale, spacing scale
- global.css: .av-card, .av-card--accent, .av-stat-label/value, .av-badge + 6 variants, .av-btn-primary/gold, .av-section-title
- index.css: all existing classes consume CSS vars. Added radius+shadow to .card (r-lg), .stat (r-md), .jcard (r-md), .btn (r-sm), .modal (r-md), .badge (r-full).
- TodoCard.jsx: inline hex values → CSS var() refs. Amber GUARDRAIL intact (FEF3C7/FCD34D unchanged, now via --amber-bg/--amber-border consts).
- App.jsx bot-nav: .bn-icon className replaces per-item inline color.

REMAINING SWEEP BATCHES: Slices 4–6 deferred. Slice 7 (UX punch) COMPLETE.
New hex literal growth is gated by tools/audit_hex.js (baseline 1343, npm run audit:hex).

[LOG - 2026-06-10] DESIGN_SYSTEM_ARC Slice 7 — UX punch, ARC COMPLETE
- Action: 7 targeted UX improvements. 7 commits. All pushed.
- Commits: 75a2d72 (sidebar), b5ebf33 (todos), 4f49eb1 (calendar), c2d0cb3 (comparison floor), fed61ee (phase chips), 44939dc (camera icon), d014a4e (hex gate)

1. SIDEBAR IA (App.jsx): 8 sections → 4. Work (Home, Projects, To-dos, Calendar, Field Agent), Sales, People, Setup (Company Files, AI Knowledge, Sequences, PM Dashboard, Owner Portal, Bug Reports). Zero routes changed.

2. MyTodosScreen: (a) broken separator → HTML entities, (b) todos grouped by job (collapsible headers, default expanded, engine/vigilance source chips preserved), (c) Resolve stays as inline ✓ circle; Edit+Cancel demoted to ⋮ kebab popover.

3. CalScr calendar: SC map now hex-only (required for alpha concat). Lead → purple #8B5CF6, Punch List → red #EF4444, Complete → green #10B981. LEGEND array drives footer swatches — swatches and pills now agree. Fixed broken 'active'/'punch' keys.

4. OwnerHomeScr comparison floor: sbLoadOwnerDashboard exposes collectedPrior (= prior30). KPI tile suppresses % comparison when prior30 < $5000, renders '—' with title tooltip. title attribute wired to KpiTile sub div.

5. ProjectDetailHeader phase chips: PHASE_STYLE rebuilt. complete = transparent+muted+✓ check. in_progress = solid gold-500 + navy text (primary). not_started = transparent + ghost outline. Consistent grammar, no more amber/green mixing.

6. PlaybookChecklist: 📷 emoji → Ic.cam SVG in both REQ badge and Add photo button. Import Ic from utils.jsx.

7. Hex audit gate: tools/audit_hex.js counts raw hex literals in src/ style props vs tools/baseline.json. npm run audit:hex. Exits 1 when count grows. Baseline: 1343 (2026-06-10). CLAUDE.md: 'Run npm run audit:hex before closing any UI slice.'

FINAL HEX COUNT: 1343 (baseline locked). DESIGN_SYSTEM_ARC is complete.
Remaining hex literals in jobs/ after Slice 3: 385 across 43 files (down from 763).

[LOG - 2026-06-10] FINTAB_DEDUPE — Quick Actions removal + ledger stat row dedupe
- Action: Two targeted fixes on the job detail surface. 2 commits pushed.
- Commits: f046b03 (Quick Actions removal), 78c25d1 (ledger stat row dedupe)
- Files: avenstone-vite/src/components/jobs/JobDet.jsx, avenstone-vite/src/components/jobs/tabs/FinancialsTab.jsx

REGRESSION TRIAGE:
- Quick Actions was NEVER removed. First and only time it appears is commit b687dbd (2026-05-27 "FinancialsTab — swap cbar contents on cost-plus; restore Contract card") which added it. No subsequent commit removed it. Not a regression — simply unfinished.
- Quick Actions block lived in JobDet.jsx (NOT ProjectDetailHeader). Conditionally shown only on `tab === 'financials'` for cost-plus jobs.

ENTRY-POINT CHECK (all three actions confirmed reachable after removal):
- Compose Draw: InvoicesSubTab.jsx Draws sub-tab header "Compose Draw" btn + FinancialsTab draw-nudge banner "Compose Draw →"
- Add Receipt: FinancialsTab Ledger "+ Add" button (same TransactionModal as quick action)
- Log Sub Invoice: SubInvoicesSection "+ Add Invoice" button (same AddInvoiceModal flow; openAddInvoiceOnMount trigger also remains usable via setFinancialsAction hook)

[LOG - 2026-06-16] AI_KNOWLEDGE_RESTYLE — collapse-by-default, lenient KV grid, category tags, token cleanup
- Action: Restyled AiKnowledgeScr.jsx — display only, no data model or behavior changes.
- Files: avenstone-vite/src/components/ai/AiKnowledgeScr.jsx
- Key changes:
  1. COLLAPSED BY DEFAULT: each card shows category tag + first-line summary (≤80 chars) + chevron. Tap/click to expand.
  2. EXPAND → FIELD GRID: `parseContent()` leniently detects "LABEL: value" lines (≥2 KV matches, ≥40% of lines). Structured entries render as small-caps label + value grid. Unstructured prose renders as `pre-wrap` plain text. Never breaks — fallback always shows readable text.
  3. CATEGORY TAGS: replaced raw hex CAT_COLORS with token-based vars (var(--blue-bg), var(--green-bg-soft), var(--amber-bg-soft), var(--purple-bg), var(--red-bg), var(--blue-bg-new), var(--neutral-bg)).
  4. INFO BANNER: trimmed to one line ("Active entries are injected into the AI's system prompt for every job conversation."). Token colors.
  5. HEX CLEANUP: eliminated all 21 raw hex literals from the file. audit:hex went 1343 → 1312 (−31).
  6. Padding tightened (14px→11px cards), gap reduced (10→8), actions buttons 30→28px.
- Verified: build green; audit:hex 1312 < 1343 baseline. COMPANY_PROFILE expands into KV grid; prose entries (client_communication) expand into plain text.
- Open: none.
- All three also exist as MasterAgent CONFIRM_TOOLS verbs

REMOVED BLOCKS:
- Cost-plus: Quick Actions (3 buttons) + Activity Pulse (last expense/payment/schedule) — the entire flex bar
- Fixed-price: `.cbar` (Contract/COs/Revised summary) — also removed, redundant with ProjectDetailHeader KPI strip

LEDGER STAT ROW DEDUPE:
- Cost-plus cpStats: removed 'Contract (signed)' (= CONTRACT VALUE in header) and 'Received' (= PAID TO DATE in header). Projection sub-line moved to Projected Profit note. Remaining: Paid Out, Outstanding (cond), Retainage (cond), Projected Profit (with projection detail), Bucket Credit/Client Owes.
- Fixed-price stats: removed 'Contract' and 'Received'. Remaining: Client Owes, Pending Out, Paid Out (3 cards auto-fill row via flex:1).
- '% collected': confirmed present in ProjectDetailHeader PAID TO DATE tile sub-line. Not duplicated, not lost.

[LOG - 2026-06-10] DESIGN_SYSTEM_ARC Slice 2 — token sweep of jobs/tabs
- Action: Mechanical color token sweep of 14 jobs/tabs files. 3 commits. All pushed.
- Commits: 21fedeb (financial tabs), 4a58363 (estimate/scope), 9bb442a (remainder)
- Files: FinancialsTab, ComposeDrawScr, InvoicesSubTab, PaymentScheduleTab, EstimateTab, ScopeTab, MaterialsTab, ConsultationTab, ScheduleTab, InfoTab, SubsTab, FilesTab, LogsTab, NotesPhotosTab

PER-FILE RESULTS (before hex literals → after):
- ComposeDrawScr: ~40 → 7 (NAVY/GOLD/CREAM/BORDER consts → vars, massive coverage)
- ConsultationTab: ~50 → 22 (LIKELIHOOD_COLORS + StatusBadge map migrated)
- EstimateTab: ~40 → 8 (module consts + inline sweep)
- FinancialsTab: ~60 → 19 (STATUS_COLOR dict + inline sweep)
- InfoTab: ~20 → 2 (nearly clean)
- FilesTab: ~10 → 2 (nearly clean)
- ScopeTab: ~15 → 2 (module consts + sweep)
- LogsTab: ~15 → 7
- NotesPhotosTab: ~12 → 5
- ScheduleTab: ~50 → 31 (TYPE_CHIP_COLORS/TYPE_AVATAR brand colors → vars; custom phase palette #EBE6D2/#DCE5D8 left)
- PaymentScheduleTab: ~30 → 14 (btnPrimary/btnSecondary/btnGenerate/btnRelease consts migrated)
- InvoicesSubTab: ~25 → 17 (DRAW_STATUS/INVOICE_STATUS migrated)
- MaterialsTab: ~30 → 25 (intentional dark theme — STATUS_META dark backgrounds kept)
- SubsTab: ~25 → 20 (intentional dark theme — ENG_STATUS_META dark backgrounds kept)
Total remaining hex literals in jobs/tabs dir: 564 across 33 files.

COLORS WITH NO CLOSE TOKEN MATCH (left as literals, noted for future token additions):
- #991b1b, #991B1B (dark red text on red bg) — needed: --red-text-dark
- #92400e (dark amber/brown text) — needed: --amber-text-dark
- #b45309 (dark amber - "outstanding") — same gap as above
- #065f46, #065F46 (dark green text on green bg) — needed: --green-text-dark
- #EDE9FE / #5B21B6 (purple — "viewed" invoices, retainage) — needed: --purple-bg/--purple-text
- #F3F4F6 (cool neutral gray for "draft/cancelled" status bg) — no warm-bg analog
- #EBE6D2 / #DCE5D8 (custom phase palette warm cream/sage) — intentional design system extension
- #6B5F3F / #2E4528 (phase palette text) — intentional
INTENTIONAL DARK THEMES (not converted in Slice 2 — CONVERTED in Slice 3 below): MaterialsTab + SubsTab fully light-converted.

[LOG - 2026-06-10] DESIGN_SYSTEM_ARC Slice 3 — token extension + job screens + dark theme conversion
- Action: Part A token extension + Slice 2 residue, Part B 24-file job screen sweep, Part C MaterialsTab+SubsTab light conversion. 4 commits pushed.
- Commits: b67e7f6 (tokens+residue), d36fb8a (Part B sweep), 91d95b8 (Part C light)

PART A: New tokens — --red-text-strong, --green-text-strong, --amber-text-strong, --purple-bg/text, --neutral-bg/text. Slice 2 residue files (ConsultationTab, FinancialsTab, InvoicesSubTab, PaymentScheduleTab, ScheduleTab) fully swept — DRAW_STATUS/INVOICE_STATUS/STATUS_PILL all token-mapped.

PART B (24 files): ProjectDetailHeader PHASE_STYLE, ProjectsListScr STATUS_MAP (7 statuses), TakeoffWizard, AddCustomLineModal, ScopeDetailForm, consultation/*, SubInvoicesSection STATUS_CFG, WalkthroughsTab, PlaybookChecklist, JobsScr, JobDet, PhaseAdvanceCard, COTab, all files/ subdirectory (7). jobs/ hex literals: 763 → 385 (50% reduction).

PART C: MaterialsTab — STATUS_META dark-on-dark → light tints; #111827 cards → card-bg+shadow; delivery photo gate → blue-bg info panel; action buttons → standard btn classes. SubsTab — ENG_STATUS_META dark → purple/blue/green/neutral/red tints; row cards → card-bg+shadow; "Add Sub" → btn-navy; btnStyle → navy-100/ghost. Both: all dark-mode colors removed, layout/logic/props preserved.

Still in jobs/ (385 hex literals): ScheduleTab custom phase palette (#EBE6D2/#DCE5D8 intentional), FilesRecentView CAT_COLORS (per-category hues intentional), GapResolutionModal SEV_COLORS, TransactionModal (Slice 5 modals batch).

[LOG - 2026-06-10] DESIGN_SYSTEM_ARC Slice 5 — AI + dashboard + modals + token extension #2
- Action: Final mechanical slice. 4 bisectable commits, build green all. ~600 hex converted.
- Commits: e6b6320 (tokens+back-sweep), 6bb6860 (AI), 5eefa9b (dashboard), 0a46425 (modals). Pushed.

TOKEN EXTENSION #2 — 15 new tokens added to tokens.css:
  green-bg-soft(#F0FDF4), green-border-soft(#BBF7D0), green-text-deep(#166534), green-success(#2E7D32),
  amber-bg-soft(#FFFBEB), amber-border-soft(#FDE68A), amber-text-deep(#78350F), amber-partial(#b45309),
  cream-banner(#FEF9EC), blue-link(#3B82F6), blue-bg-new(#DBEAFE), blue-text-deep(#1E40AF),
  blue-text-link-strong(#1D4ED8), red-strong(#DC2626)

BACK-SWEEPS across previously-converted files: ClientPortal(8 tokens), ReviewPage(#22C55E uppercase fix),
  BugReports(green-text-deep), LidarScanner(green-success), LeadsScr(blue-bg-new/text-deep/link-strong),
  SubJobView(blue-text-link-strong), AiKnowledgeScr/AiSetupWizard(DC2626→red-strong fix), CompanyFilesScr(red-strong)

PER-FILE RESULTS (approx):
- MasterAgent (1810 lines): ~51→15 — gold/navy/bg/border/green-dot/green-bg/green-text-deep/text-muted.
  Context/tool/TTS/STT logic paths untouched — confirmed via grep: callMaster signature, context_job_id,
  pending_action, confirmed=true all byte-identical. #0F2A5C/#060F22/#7BA7D4/#4CAF50/#EF5350 left raw.
- AiFieldAgent: NAV/GREEN/GOLD consts→var(); orb red/blue tokens; #334155 slate-700 noted raw.
- DashScr/Reports/CalScr/HomeScr/AiPmDashboard/MyTodosScreen: full sweeps. SC dict in CalScr kept raw
  (color+22/+44 string concat pattern). STATUS_DOT in HomeScr→var(). ALERT_CONFIG in AiPmDashboard fully
  tokenized.
- GapResolutionModal: SEV_COLORS (blocker/strong/nice_to_have) fully tokenized per spec.
- TransactionModal + all 13 components/modals/ + TodoCard + CompanyFileExpirationBanner: batch sweep.
  #D97706 (schedule gold-orange), #10B981 (complete teal), #F97316 (on-hold orange), #334155 (slate),
  #6366f1 (pipeline indigo) left raw — no tokens.

Total hex remaining across src/: 1,346 (was 1,944 entering Slice 5).

[LOG - 2026-06-10] DESIGN_SYSTEM_ARC Slice 3.5 — Files tab + PlaybookChecklist redesign
- Action: Visual redesign of two screens. All data logic, gating, and state machines byte-identical.
- Commits: 52aa2e7 (Files tab), 97dc517 (PlaybookChecklist). Pushed.
- Files: FilesTab.jsx, FilesTreeView.jsx, FilesGridView.jsx (export add), PlaybookChecklist.jsx

FILES TAB:
- FilesTreeView: flat accordion → folder cards (.av-card). Each card: 40px category icon in tinted square, serif name, "N files · last Date" subtitle, colored count pill, gold share icon button. Photos collapsed: lazy-loaded 5-thumbnail preview strip via PhotoThumbnail (IntersectionObserver). Expanded: photo grid (PhotoThumbnail) or FileRow list. Sub-category labels as small uppercase dividers. Max-width 1100px.
- FilesGridView: export PhotoThumbnail for reuse.
- FilesTab: view toggle → segmented control (Recent | Folders | Grid), three connected pills with navy active state.
- All view/search/drag-drop/bulk-tag/upload/share logic untouched.

PLAYBOOKCHECKLIST:
- Layout: max-width 760px centered column (desktop), full-width (mobile - unchanged).
- Header: sticky navy, serif workType title, resolved/total subtitle, gold progress bar (height 3px), amber pill for mustDocPending count.
- Items: .av-card with 3px colored left border (green/red/neutral/gray by status), status ring indicator (hollow→filled circle), item label + MUST-DOC/.av-badge--amber + REQ/.av-badge--blue inline.
- Pass/Fail/Skip: segmented control per card (connected pills), active state fills status tint. Skip absent on must_document (gate preserved).
- Fail note mode: textarea in card, Save/Cancel. Gate: notes.trim() required (preserved).
- Photo: compact button, purple tint when photo_required.
- Footer: max-width 760px, amber pending text, .av-btn-primary styled (navy/gold enabled, neutral disabled).
- All 5 gates confirmed unchanged: (1) fail requires note, (2) must_document blocks complete, (3) skip hidden on must_document, (4) photo informational only, (5) sbCompleteTodo only when todoId.

[LOG - 2026-06-10] INFOTAB_POLISH — separator sweep, banner polish, to-dos row upgrade
- Action: 3 commits, build green all, audit:hex 1334 ≤ 1343 baseline.
- Commits: aec455f (sweep), 9dbef36 (banners), ed58108 (to-dos rows). Pushed.

1. SEPARATOR SWEEP (aec455f):
- Binary scan of all 847 JSX/TS files in src/ AND 60 TS files in supabase/functions/: 0 EF BF BD bytes found. Source clean.
- Dispatcher bodyParts.join(" · ") correctly encoded as C2 B7 UTF-8.
- Files touched: JobDet.jsx only — inline em dash in banner JSX text changed to {'—'} expression; ✓ strings to template literals. Defensive, not structural.

2. BANNER PLACEMENT + ICONS (9dbef36):
- utils.jsx: Ic.star (review star) + Ic.share (copy-link network) added.
- JobDet.jsx: 🌟/📦/📸/📤 emoji → Ic.star/Ic.box/Ic.cam/Ic.share; ✓ text → Ic.check.
- Condition changed from `job.status === 'complete'` to `['final_touches','complete'].includes(job.status)` — both banners show at TOP for these two phases.
- All earlier phases: quiet single-line bottom hint (icon + label + link-style copy action, no gradient, no full-width card). Shown when client_email present. Zero logic changes.

3. JOB TO-DOS ROWS (ed58108):
- JobTodosBlock.jsx rebuilt to Slice 7 pattern: KebabMenu (Edit/Cancel demoted), visible Resolve ✓ button inline, SOURCE_CHIP for engine/vigilance, title full-width (no maxWidth truncation), metadata line wraps below (notes + due date on second line using {'·'} JSX expression separator). sbUpdateTodo added for cancel. HTML entities for ✓/⋮/…

[LOG - 2026-06-10] AGENT_READS Slice 1 — 4 read tools added to ai-master-agent
- Action: Added get_job_financials, get_schedule, get_open_todos, get_alerts. Agent can now answer financial/schedule/todo/alert questions directly instead of saying "check the app."
- Commits: 95ea89f (edge fn + system prompt), TBD (MasterAgent tile + docs). Pushed.
- Files: supabase/functions/ai-master-agent/index.ts, avenstone-vite/src/components/shared/MasterAgent.jsx

TOOLS:
- get_job_financials: financial summary matching Financials tab exactly. Mirrors sbLoadJobFinancialSummary bucketing (cost-plus: bucket = direction=in + invoice_id IS NULL + status=paid; outstanding = sub_payout/change_order pending; labor types sub_payout/labor/commission use labor_markup_pct; all others use material_markup_pct). Returns contract, received, paid_out, outstanding, retainage, projected_markup, bucket_balance or client_owes, 5 recent txs.
- get_schedule: schedule_items in window (default 14d, max 90d), optional job filter, returns title/type/trade/date/status/job. Cap 20.
- get_open_todos: open todos for calling user + unassigned tenant todos. Optional job/priority filter. Returns title/priority/source/job/age_days. Cap 20.
- get_alerts: open vigilance/engine todos (tenant-wide) + alert-type notifications (last 7d). Job names resolved. Powers "What needs my attention today?" tile. Cap 20.

SYSTEM PROMPT: Added ANSWERING QUESTIONS WITH READ TOOLS section — agent must prefer read tools over saying "check the app." Cache-prefix change invalidates warm cache once, expected per CLAUDE.md.
MasterAgent: TILE_PREFIXES += attention='What needs my attention today?'. QUICK_TILES: replaced change_order tile with attention tile (ic='bell'). change_order still reachable via freeform input.
CONFIRM_TOOLS: unchanged at 13. Read tools (get_*) are exempt from drift checker — no insert payloads.

SMOKE TESTS (completed 2026-06-10):
1. "what's outstanding on 999 Test Lane?" → get_job_financials → numbers matched Financials tab ✓
2. "what needs my attention today?" → get_alerts → vigilance items (lien waivers, daily logs, walkthroughs, stale consultations, overdue payment) appeared with job names ✓
3. "what's on the schedule next two weeks?" → get_schedule → 7 items Jun 10-24 across 2 jobs ✓

[LOG - 2026-06-10] AGENT_READS Slice 2 — projected profit parity + screen context
- Action: Two targeted fixes on top of Slice 1. Multiple deploy iterations to fix context message UUID issue.
- Commits: 888652b, 096f190, 8e5e286, c43e487, 6651863. All pushed.
- Files: supabase/functions/ai-master-agent/index.ts, avenstone-vite/src/components/shared/MasterAgent.jsx, avenstone-vite/src/App.jsx

PROJECTED PROFIT FIX:
- Added pm_fee to get_job_financials jobs query. Compute projected_profit = projected_markup + pm_fee. Return projected_profit as headline (matches Financials tab Ledger card exactly). projected_markup and pm_fee kept as labeled sub-fields.
- 999 Test Lane: $9,636 markup + $1,500 PM = $11,136 projected_profit ✓ (matches tab exactly)

SCREEN CONTEXT:
- contextLine removed from system prompt (was per-job, re-invalidated cache on every job nav).
- runAgentLoop: new contextScreen param. Context injected as "[Context] <label>" user message prepended to currentMessages each request — refreshed, not accumulated. Context message includes job_id so model can use UUID directly.
- Context message format: "Viewing: 999 Test Lane (job_id: 7b44611a-...) / financials"
- Pre-fill extended: get_job_financials + get_schedule get job_id from contextJobId when no job_id AND no job_name.
- add_todo confirm card: UUID guard (model used name→override with contextJobId), always fetch _job_address. describeConfirmAction("add_todo") appends "on <address>" so wrong job is visible before commit.
- App.jsx: passes currentPage={pg} and activeTab={viewportTab} to MasterAgent.
- MasterAgent: buildCtxScreen() produces "Viewing: <job> / <tab>" or "Page: <page>".
- NOTE: contextScreen lives in conversation messages, NOT in system+tools cached prefix.

SMOKE TESTS (all 3 passing):
a. Context job + "what's outstanding here?" → get_job_financials resolved from context_job_id, projected profit $11,136 = Ledger tab ✓
b. No context + "what's outstanding on 999 Test Lane?" → fuzzy still works, same numbers ✓
c. On job + "add a todo to order tile for this job" → confirm description: 'Add to-do: "Order tile" · medium priority · on 999 Test Lane, Testville, KS.' ✓

[LOG - 2026-06-10] DESIGN_SYSTEM_ARC Slice 6 — admin + ai/ + public/auth token sweep
- Action: 19 files converted across 3 bisectable commits. Build green.
- Commits: 6f392df (admin), 71b3853 (ai/), bd4123a (public/auth). Pushed.
- Files: BugReportsScr, BugReportDetailModal, CompanyFilesScr, SequencesScr, LeadsScr, FloorPlanEditorScr, AiKnowledgeScr, AiSetupWizard, AiIntakeWizard, HeightCaptureStep, FloorPlanCanvas, FloorPlanEditor, LidarScanner, CompletionPage, PublicProfile, ReviewPage, LoginScr, SetPasswordScr, SignaturePad

PER-FILE RESULTS (approx before → after hex literals):
- BugReportsScr/BugReportDetailModal: ~25/29 → ~5/6 (STATUS_COLORS tokenized except #166534 which has no exact match; nav/gold/border consts)
- CompanyFilesScr: ~70 → ~25 (ROLE_COLORS partially; ExpirationBadge green/amber/red; inline sweep; #DC2626/#FCE7F3/#DBEAFE left — no tokens)
- SequencesScr: ~68 → ~35 (STATUS_C/EnrollStatusBadge raw hex kept for +'18' concat; bg/nav/gold/border sweep; #9CA3AF/#22c55e/#EF4444 left in dicts)
- LeadsScr: ~47 → ~15 (NAVY/GOLD/CREAM/WHITE/BORDER → var(); STATUS_CFG partially; AVATAR_COLORS kept raw — intentional variety palette)
- FloorPlanEditorScr: ~60 → ~5 (NAVY/GOLD/CREAM module consts → var(); cascades through all 1884 lines)
- AiKnowledgeScr: ~41 → ~4 (all 4 consts + inline red/green sweep; CAT_COLORS left — no tokens for custom category hues)
- AiSetupWizard/HeightCaptureStep/AiIntakeWizard/FloorPlanCanvas/FloorPlanEditor: all module consts → var(); inline sweeps
- LidarScanner: 6 consts including GREEN (#2E7D32) left raw — no token
- SignaturePad: SKIPPED ctx.strokeStyle intentionally (canvas API cannot resolve CSS custom properties); noted in code comment
- ReviewPage: inline props tokenized; <style> CSS block left as-is
- PublicProfile: Spinner/Stars inline props only; pp-* CSS class definitions in <style> left (standalone page, no token access)
- CompletionPage: inline #0A1F44/#C9A84C only; <style> block left

TOKEN GAPS FOUND (for Slice 5 extension list):
- #166534 (darker green text for "fixed" status) — between --green-text-strong and --green-text, no token
- #2E7D32 (forest green) — used in LidarScanner ResultPhase success circle — no token
- #7AA7C7 (window line color in SVG) — architectural accent — no token
- CAT_COLORS in AiKnowledgeScr (#EFF6FF/#1D4ED8, #F0FDF4/#15803D, #FFF7ED/#C2410C, etc.) — knowledge category hues, no tokens
- #DC2626 (slightly different red from --red-text #EF4444) — used in compound error states
- #DBEAFE/#1E40AF (leads new status, final_touches) — blue variants without tokens

Total remaining hex literals across src/: 1944 (was 2233 after Slice 4).

[LOG - 2026-06-10] DESIGN_SYSTEM_ARC Slice 4 — portals token sweep
- Action: 6 external-facing portal files converted. 3 bisectable commits, build green.
- Commits: c5e4889 (ClientPortal), 057f1c3 (sub files), baef57d (owner files). Pushed.
- Files: ClientPortal.jsx, SubPortal.jsx, SubJobView.jsx, SubOnboardingWizard.jsx, OwnerHomeScr.jsx, OwnerPortal.jsx

PER-FILE RESULTS (before → after hex literal estimate):
- ClientPortal.jsx: ~259 → ~60 (NAV/GOLD/CREAM/BORDER consts; MS_STATUS_COLOR kept raw hex for +'18' concat; DRAW_STATUS_STYLE tokenized; legacy fallback untouched — zero data logic changes)
- SubPortal.jsx: ~40 → ~15 (consts → var(); statusMeta tokens)
- SubJobView.jsx: ~80 → ~25 (adds NAV/GOLD/BORDER/CREAM; payment/CO/schedule badges fully tokenized)
- SubOnboardingWizard.jsx: ~50 → ~10 (shared style objects converted; #9B8E7A warm-taupe left — no token)
- OwnerHomeScr.jsx: ~60 → ~20 (consts → var(); STATUS_CFG tokens; revenue net color; Behind counter)
- OwnerPortal.jsx: ~40 → ~10 (consts → var(); scoreColor/scoreBg tokens; error/toast tokens)

SKIPPED (no close token): #F0FDF4 (lighter green bg), #BBF7D0 (medium green border), #FEF9EC (contract banner bg), #b45309 (partial-payment amber), #FFFBEB/#FDE68A/#78350F (warning section), #3B82F6 (blue links), #1F2937 (update message text), #F0ECE6 (legacy section), #1D4ED8/#1E40AF (blue status variants), #DC2626 (negative net), #9B8E7A (wizard warm-taupe), rgba() patterns on dark backgrounds.

Total remaining hex literals across src/: 2233.

[LOG - 2026-06-10] AI_PM_FOLDIN Slice 2 — vigilance-runner edge function
- Action: New edge function carrying all 11 PORT rules from the 2026-06-10 disposition audit. Successor to ai-pm-nightly (retired Slice 3).
- Commits: 49b1a60 (function + todos_source migration), a7e25b1 (pg_cron migration). Pushed.
- Files: supabase/functions/vigilance-runner/index.ts (NEW), supabase/migrations/20260610000001_todos_source_add_vigilance.sql, supabase/migrations/20260610000002_vigilance_runner_cron.sql
- Pre-check results: job_transactions.phase EXISTS (text, nullable) — all 11 rules ported including budget_overrun. notifications type CHECK already dropped (migration 20260603240000). todos_source_check expanded from ['manual','engine'] to include 'vigilance'.
- Key differences vs ai-pm-nightly: (1) dedup via existing-open-todo check instead of 24h recentNotifs scan — no daily re-fire on persisting conditions; (2) email_sent gate on notification insert (high=false → email fires, medium/low=true → blocked); (3) Rule 14 source_table corrected to 'job_files' (was stale 'job_documents'); (4) source='vigilance' on todos.
- Cron: daily 11:00 UTC (06:00 Central), same anon JWT pattern as existing cron jobs. Verified in cron.job immediately after migration.
- Smoke test (first run): 5 jobs processed, 9 alerts fired — no_daily_log (4), lien_waiver_missing (3), consultation_stale (1), estimate_no_proposal_24h (1). email_sent gate confirmed correct (payment_overdue=false, all others=true). Second run: 0 fired, 9 dedup_skipped — dedup working.
- AiPmDashboard PM_TYPES verified in notifications: co_pending_approval, no_daily_log, payment_overdue visible. Dashboard renders real data.

[LOG - 2026-06-10] AI_PM_RETIRED — ai-pm-nightly retired, vigilance-runner live
- Action: Deleted supabase/functions/ai-pm-nightly/, deleted .github/workflows/nightly-pm.yml, undeployed from Supabase (Management API DELETE verified — confirmed absent from deployed functions list). Removed AI_PM_NIGHTLY_URL export from supabase.js. Removed App.jsx first-login fetch call + av_pm_date localStorage check. Doc purge across CLAUDE.md, CLAUDE_MEMORY.md, ANTI_SURPRISE_ENGINE_ARC.md, TODO_NOTIFICATIONS_ARC.md, AGENT_AUDIT.md, AVENSTONE_VISION.md.
- Files deleted: supabase/functions/ai-pm-nightly/index.ts, .github/workflows/nightly-pm.yml
- Files modified: avenstone-vite/src/App.jsx (removed fetch call + import), avenstone-vite/src/lib/supabase.js (removed AI_PM_NIGHTLY_URL), CLAUDE.md (3 refs), CLAUDE_MEMORY.md (purged AI_PM_LEGACY_RULES open item, drift refs, slug index), ANTI_SURPRISE_ENGINE_ARC.md (retirement note + Phase 5 updated), TODO_NOTIFICATIONS_ARC.md, AGENT_AUDIT.md, AVENSTONE_VISION.md
- Final grep (non-CLAUDE_ARCHIVE, non-retirement-notes): CLEAN — only historical LOG entries in CLAUDE_MEMORY.md and retirement context notes in ANTI_SURPRISE_ENGINE_ARC.md/AGENT_AUDIT.md/AVENSTONE_VISION.md remain.
- Open: TEST_DATA_NONUUID open item added (job 'test-flow-001' non-UUID PK). [CLOSED 2026-06-10 — see LOG below]
- Open: AiPmDashboard.jsx still hard-filters to the 6 original PM_TYPES — will render vigilance-runner notifications correctly since vigilance-runner writes byte-identical type strings.

[LOG - 2026-06-10] TEST_DATA_NONUUID — deleted test job test-flow-001 and all references
- Action: Audited 52 tables, deleted across 24 of them, verified all zero, confirmed vigilance-runner FK error resolved.
- Migration: 20260610190000_delete_test_flow_001.sql. Commit: 87b09e4. Pushed.

AUDIT FINDINGS (pre-deletion counts):
- jobs.id is TEXT not UUID (schema finding). Non-UUID value 'test-flow-001' was valid in the text column.
- change_orders:4  consultation_sessions:16  consultation_extractions:1  consultation_measurements:2  consultation_gap_analyses:2
- daily_logs:5  draw_schedules:2  estimate_line_items:5  floor_plans:2  invoice_line_items:2  invoices:2
- job_ai_companions:2  job_files:59  job_lidar_scans:42  job_phases:10  job_sub_engagements:1  job_transactions:33
- notifications:109  oh_shit_moments:10  photos:14  schedule_change_log:1  schedule_items:3
- sub_invoice_payments:1  sub_invoices:1  todos:6

DELETION: All children deleted in dependency order (grandchildren first, jobs row last). Single transaction, all 24 tables confirmed zero after apply.

VIGILANCE RUNNER RESULT: 4 jobs processed (was 5), zero FK errors. test-flow-001 FK failure from smoke test is gone.

ORPHANED STORAGE (job-documents and job-photos buckets — rows deleted, objects NOT touched):
- 59 job_files rows with storage_path prefix 'test-flow-001/' (37 floor-plan PDFs, 14 photos, 8 receipts)
- 2 floor_plans rows with storage_path under tenant UUID path (00000000-.../4b77bd71.../v2.pdf, .../86900098.../v1.pdf)
- 2 job_files rows with corrupted path 'null/...' (not deleteable by path — would require manual bucket sweep)
- 42 job_lidar_scans rows — no storage_path column on that table (binary data inline or not stored)
- Storage objects are orphaned but harmless; can be swept via Supabase storage UI when needed.

SCHEMA SMELL ADDED TO OPEN ITEMS: jobs.id is TEXT not UUID — evaluate migration to uuid during Model B.

[LOG - 2026-06-10] BRAND_REFRESH Slice 1 — reconstructed vector assets + raster exports
- Action: Rebuilt the Avenstone mark as clean SVG geometry from the reference render. 12 SVG variants + 6 raster exports. DEV preview page at ?pg=brandpreview. NOT integrated into the app yet — awaiting review.
- Commit: 911026e. Pushed.
- Files: tools/create_brand_svgs.js, tools/gen_brand_assets.js, src/assets/brand/ (12 SVGs + logo-pdf@2x.png), public/ (favicon.ico, apple-touch-icon.png, icon-192/512.png), assets-src/ios-icon-1024.png, src/components/brand/BrandPreview.jsx

MARK GEOMETRY (judgment calls):
- Three nested house/A outlines. Outer: M50,5 L95,41 L95,92 L5,92 L5,41 Z. Middle: M50,19 L82,47 L82,84 L18,84 L18,47 Z. Inner A: apex at (50,33), walls at x=29/71, notch at y=78 with 8px feet each side, crossbar at y=66.
- Spacing: ~13-unit apex inset, ~11-13-unit wall inset per layer. NOT exact parallel-offset — visually balanced to match reference.
- Stroke: outer=2.8px, inner elements=2.5px. miter join (sharp peak), round linecap on open paths.
- Compact (2-nest): outer M50,8 L90,44 L90,90 L10,90 L10,44 Z, inner A slightly simplified, stroke=3.5px. Survives 16px render.
- Roof slope: ~51° from horizontal (matches reference steep geometry).
- Wordmark: font-family='DM Serif Display' text element (NOT outlined paths). Requires Inkscape/Figma font-to-paths before final swap-in. Raster exports via sharp render correctly from system font.

RASTER EXPORTS: favicon.ico (32+16 ICO), apple-touch-icon.png (180), icon-192.png, icon-512.png — all from compact mark on navy bg. iOS 1024 = full-bleed navy, mark at 65% of canvas. logo-pdf@2x.png = lockup white-knockout on transparent, 600×310px.

PREVIEW URL: ?pg=brandpreview (DEV only, import.meta.env.DEV guard). Shows all 12 variants × 3 sizes (128/48/16px) × 3 backgrounds (navy/cream/white).

NEXT (Slice 2): swap logo.png in sidebar/auth screens with the new SVGs; add favicon link in index.html; wire apple-touch-icon/manifest entries.

[LOG - 2026-06-15] AI_ESTIMATOR_FOLLOW_UP_BUG — UI metadata leak into Anthropic messages fixed
- Root cause: `sendEstimatorMessage` built `displayMessages` with extra fields `_hasFile: true/false` and `_fileName: string` on each user message (for UI rendering — file attachment chip display). These display-state messages were stored in React `estMessages` state via `setEstMessages(finalDisplay)`. On follow-up turns, the handler built `newMessages = [...estMessages, currentMsg]` — `estMessages` now contained prior turn objects with `_hasFile`/`_fileName`. These leaked into the Anthropic API call body, which rejected with `invalid_request_error: messages.0._hasFile: Extra inputs are not permitted`.
- Turn 1 succeeded because `estMessages` was empty and `newMessages` was built clean. Turn 2+ failed because `estMessages` contained the dirty display objects from turn 1.
- Confirmed by live logs: 2 POST 500s (execution_time_ms: 383, 215) immediately after 1 successful POST 200 (49s, 4MB body with base64 file). Deno console.error matched exactly: "messages.0._hasFile: Extra inputs are not permitted".
- Fix Part 1 — sanitize before send (`EstimateTab.jsx:154`): `const apiMessages = newMessages.map(({ role, content }) => ({ role, content }))`. Sends `apiMessages` in the fetch body instead of `newMessages`. State array unchanged — `_hasFile`/`_fileName` remain in `estMessages` for UI rendering. The destructuring pick (`{ role, content }`) means any future UI-only field added to message objects is also stripped automatically.
- Fix Part 2 — surface real errors (`EstimateTab.jsx:161-168`): replaced `data.content || 'Sorry...'` with explicit `res.ok` + `data.error` check. Non-200 / error-body responses now show `"Sorry, something went wrong: <actual error detail>"` and `console.error` the full body. Generic fallback remains for the truly-no-content path only.
- Files: `avenstone-vite/src/components/jobs/tabs/EstimateTab.jsx` only (lines 153-168).
- Build: green (428 modules, 529ms).
- Both latent items fixed in follow-up commit (see LOG AI_ESTIMATOR_INDEX_TS below).
- Commit: 1 commit, pushed to main.

[LOG - 2026-06-15] AI_ESTIMATOR_INDEX_TS — max_tokens raised + stop_reason truncation check
- Files: `supabase/functions/ai-estimator/index.ts` only (lines 258, 272-281).
- Part 1 — max_tokens raised 8192 → 32000 (`index.ts:258`). 8192 was throttling large estimates and causing mid-response cut-offs. Sonnet 4.6 supports 64K output; 32000 gives 4× headroom while leaving a ceiling. This was previously backlogged by mistake in bd47580.
- Part 2 — stop_reason truncation check (`index.ts:272-278`). After the Anthropic response is confirmed OK, checks `data.stop_reason === "max_tokens"`. If so: `console.error` with `data.usage` and `data.id` (request_id) for log traceability; spreads `truncated: true` into the JSON response body so the client can detect a partial estimate. Non-truncated responses are unchanged (no extra field). Previously the function blindly returned `data.content[0].text` with no awareness of partial output.
- Edge fn auto-deploys via GitHub Actions on push to main.
- Commit: 1 commit, pushed to main.

[LOG - 2026-06-15] AI_ESTIMATOR_COMMIT_PATH_RESTORED — EXTRACT_JSON write path restored after PROPOSAL_PDF_REBUILD severed it
- Root cause recap: PROPOSAL_PDF_REBUILD (29c1ad9, 2026-06-02) removed the EXTRACT_JSON_FOR_PROPOSAL second AI call from generateProposalPDF because 8192-token truncation was cutting the JSON mid-object. The replacement correctly made the PDF read estimate_line_items DB rows directly. But that call was doing TWO jobs: (a) generate PDF JSON [replaced by DB reads] and (b) write estimate_line_items via sbCommitEstimate [never replaced]. With max_tokens now at 32000 the truncation failure mode is gone, so (b) can be restored.
- Approach: explicit "Commit to Line Items" button on the Build tab. Human reviews the markdown estimate first, then clicks commit — NOT auto-committed on generate. This preserves the audit trail and lets the user refine via follow-ups before committing.
- New handler `commitEstimateFromChat` (EstimateTab.jsx): sanitizes estMessages to {role, content} (same pattern as send), appends `{ role: 'user', content: 'EXTRACT_JSON_FOR_PROPOSAL' }` trigger, calls ai-estimator. Guards: non-200 / data.error → surfaces error; data.truncated === true → shows "too large, split or shorten" and aborts (no partial parse attempt); JSON.parse failure → shows error + console.errors raw content. Maps extraction shape → NormalizedEstimateInput: quantity=1, unit='LS', unit_cost=amount (lump-sum — no back-calculation from qty_label), multiplier=1.0, notes=qty_label for reference. Calls sbCommitEstimate(sb, AV_TENANT, AV_USER_ID, { source:'ai', jobId, items }), then reloads lineItems from DB.
- Button: visible in action bar when estMessages has ≥1 assistant reply. Spinner/disabled while committing. Success toast shows inserted count.
- Proposal empty-state copy updated to mention "Commit to Line Items" step.
- Files: `avenstone-vite/src/components/jobs/tabs/EstimateTab.jsx` only.
- Field-mapping note: qty_label ("550 SF", "1 LS") is preserved in estimate_line_items.notes. quantity/unit_cost are lump-sum (1 / amount). The Line Items tab displays total_cost (generated: quantity × unit_cost × multiplier = 1 × amount × 1 = amount), which is correct. openProposal reads lineItems from DB → builds propLineItems; buildProposalPDF reads lineItems → renders trade-grouped rows. All three consumers (Line Items tab, Proposal tab, PDF) read from the same DB rows — the write path is the only missing piece, now restored.
- Commit: 1 commit, pushed to main.

[LOG - 2026-06-15] AI_ESTIMATOR_FENCE_STRIP — extraction response arrives fence-wrapped; strip ```json fences + slice to outermost braces before JSON.parse (`commitEstimateFromChat` in EstimateTab.jsx).

[LOG - 2026-06-15] PROPOSAL_PM_FEE_SINGLE_SOURCE — propPmFee staleness bug fixed; single source of truth is jobs.pm_fee
- Root cause: `propPmFee = useState('1200')` was hardcoded — never seeded from `job.pm_fee`. Proposal always showed $1,200 regardless of the job record. Markup %s were already correctly read from `job.labor_markup_pct`/`job.material_markup_pct` via the `job` prop — only PM fee was broken.
- Fix: `useState(job.pm_fee ?? 0)` — seeded from the canonical column on mount. `upd` threaded from JobsScr → JobDet → EstimateTab (same pre-bound helper InfoTab uses); PM Fee onChange now calls `upd({ pm_fee: v })` → writes DB + updates in-memory jobs array + localStorage, matching InfoTab behavior exactly.
- propSchedule recompute: payment schedule amounts were computed once inside `openProposal()` and never updated when PM fee changed. Moved to a `useEffect([propPmFee, propLineItems, propReady])` so milestone amounts recompute live on any PM-fee edit (or propLineItems change). `openProposal()` now only sets `propLineItems` and `propReady=true`; the effect takes it from there.
- Dead state removed: `propMargin = useState('25')` was set but never read after PROPOSAL_PDF_REBUILD removed the slider.
- Files: EstimateTab.jsx (4 changes), JobDet.jsx (1 change — add `upd` prop).
- Commit: 1 commit, pushed to main.

[LOG - 2026-06-15] AI_COMMIT_STACKING_FIX — sbCommitEstimate(source='ai') was append-only; fixed to replace on re-commit
- Root cause: `sbCommitEstimate` had scoped-delete only for source='takeoff' (WHERE notes LIKE 'takeoff:%'). source='ai' had no delete block — every re-commit appended a full new set. Crane St landed at 53 rows ($7,639) = V2 (27 rows, $4,106) + V3 (26 rows, $3,533) stacked.
- Fix (commitEstimate.js): AI rows are now tagged `'ai:<qty_label>'` in the notes column at insert time (e.g. 'ai:1 LS', 'ai:186 SF'). A scoped delete `WHERE job_id = X AND notes LIKE 'ai:%'` fires before AI insert, so re-commit replaces rather than stacks. Pattern mirrors the takeoff isolation exactly.
- Isolation guarantee: manual rows (notes = null or user text) → unaffected; consultation rows (notes = null) → unaffected; takeoff rows (notes LIKE 'takeoff:%') → unaffected. None of these will ever match `'ai:%'`.
- Crane St cleanup: deleted all 53 rows (before: 53/$7,639.18, after: 0/$0) as a one-off DB op; not part of the code commit.
- Files: `avenstone-vite/src/lib/commitEstimate.js` only.
- Commit: 1 commit, pushed to main.

[LOG - 2026-06-15] DISPLAY_FIXES_COST_LABELS — Line Items footer and header money cards display fixes
- Line Items footer "Total" was Σ(total_cost × markup) — cost+markup without pm_fee, labeled just "Total" (represented nothing a user would recognize). Replaced with two labeled rows: "Your Cost" (Σ total_cost, raw cost no markup) and "Client Price" (Σ lineClientPrice + job.pm_fee). Your Cost === Proposal HARD COST; Client Price === Proposal GRAND TOTAL, to the penny. Reused existing lineClientPrice() helper and job.pm_fee — no new markup paths.
- Header money cards (CONTRACT VALUE / PAID TO DATE / REMAINING) used local fShort() helper that abbreviated to "$Nk" format — $6,524 rendered as "$7k". fShort is a local function in ProjectDetailHeader.jsx only (not exported, not used elsewhere). Replaced the three call sites with canonical f$() formatter from utils.jsx, which produces "$6,524.00" with thousands separators. fShort definition left in place (not deleted).
- Files: EstimateTab.jsx (2 changes: yourCost/clientPrice vars, footer grid), ProjectDetailHeader.jsx (1 change: 3 fShort→f$ call sites).
- Commit: 1 commit, pushed to main.

[LOG - 2026-06-15] PROPOSAL_DELETE_RECOMPUTE — Proposal-tab × deleted from propLineItems only; summary/schedule stayed stale
- Root cause: the × button in the Proposal line-items list called `setPropLineItems(filter(...))` only. propLineItems has no `id` field (so no DB delete was possible), and the HARD COST / MARKUP / GRAND TOTAL summary IIFE reads from `lineItems` state (not `propLineItems`) — so filtering propLineItems had zero effect on the totals. The payment schedule useEffect was already keyed on propLineItems, so it did update, but the dollar totals above it stayed stale.
- Fix: added `id` to previewItems objects in `openProposal` so the row can be identified. The × handler is now async: deletes by id from DB, reloads `lineItems` via `sbLoadEstimateLineItems` (matching the Line Items tab path), then filters `propLineItems`. The IIFE re-renders from the refreshed `lineItems` → Hard Cost/Markup/Grand Total update immediately. The schedule useEffect fires on propLineItems change → payment schedule milestone amounts also update. Items manually added via "+ Add line item" (no id) are filtered from propLineItems only, no DB op.
- Files: `avenstone-vite/src/components/jobs/tabs/EstimateTab.jsx` (2 changes — previewItems id field, × handler).
- Commit: 1 commit, pushed to main.
