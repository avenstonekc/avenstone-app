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

## Schema reality (verified 2026-05-05)

*Authoritative DB facts — verified against `information_schema`. Do not contradict without re-verifying.*

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
- **ai-master-agent has 24 tools** (last updated 2026-05-28 — record_deposit + compose_draw added in COST_PLUS_ARC Phase 5): get_jobs, get_team, create_job, update_job, add_contact, send_client_portal, invite_person, add_note, advance_phase, update_phase, submit_change_order, log_payment, log_receipt, notify_team, add_todo, add_knowledge, notify_team_member, create_schedule_item, log_sub_invoice, log_sub_payment, approve_sub_invoice, upload_company_file, record_deposit, compose_draw.
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
- **ai-master-agent had 17 tools at Phase 2.2** (2026-05-20, superseded — see current count above). Added `notify_team_member` (CONFIRM_TOOLS). 4 more verbs added since (create_schedule_item, log_sub_invoice, log_sub_payment, approve_sub_invoice, upload_company_file → now 22 total, 11 CONFIRM_TOOLS).
- **`trg_notification_push_fanout` trigger EXISTS on `notifications`** (PUSH_NOTIFICATIONS_ARC Phase 5, 2026-05-24). AFTER INSERT, calls `fn_notification_push_fanout()` which async-invokes `notification-push-fanout` edge fn via `net.http_post`. Independent from `on_notification_insert` email trigger — both fire on every INSERT. 2 other pre-existing Dashboard-created triggers also on notifications: `on_notification_insert_push`, `on_notification_insert_sms` — not in local migration files.
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
- Drift detector (2026-05-10 first run; all 15 findings now cleared as of 2026-05-12). Final fix arc: contacts 3 cleared 2026-05-13 (full_name→name rename, drop project_type/description); job_notes 2 cleared (drop note_type, rename created_by→author); todos drift closed 2026-05-13 (see LOG below); job_estimates 6 cleared via Shape C migration + ConsultationTab upsert fix. **Drift count: 0 (audit:schema scans JS/TS src only — ai-pm-nightly TS edge fn drift was not scanner-visible; closed manually).** Re-run `npm run audit:schema` from `avenstone-vite/` after any new table or column work. Note: ai-pm-nightly todos insert was never writing rows because function is DISABLED — but the stale payload would have silently dropped rows on any re-enable. Detector Phase 2 shipped 2026-05-13 — skipped now 9 (was 34 at Phase 1 baseline, 15 after Phase 1). Remaining 8 skipped are function parameters (no call-site analysis), 1 is dynamic .from() (opaque). No new drift surfaced by Phase 2 extension. Missing-tables arc 2026-05-19: 4 findings → 1 STOP (see LOG). Scanner missing-tables now: 1 (quote_requests in ai-pm-nightly — DISABLED, deferred until re-enable). Write/read drift 0, write skipped 0. **Detector Phase 3 shipped 2026-05-27** (Bucket A: array-of-ObjectExpression batch-insert resolution; Bucket C: intentional-skips docs block). Write-skipped now 0, read-skipped 1 (field-opus-db-query dynamic table — intentional). **14 open drift findings surfaced** (real code vs. DB drift, not scanner bugs — see block below).

- **Open drift findings (2026-05-27 scan — NOT fixed, queued for a dedicated slice):**
  - **Write drift (0 — fully closed 2026-05-27):** `notifications.priority` both halves fixed: field-opus-result-webhook:106 (dd1a78b) + supabase.js:2406 (62c5d6f). No remaining write drift.
  - **Missing tables (1, was 2 — failed_intents stubbed 2026-05-28):**
    - `quote_requests` — read at `ai-pm-nightly/index.ts:76`. Function DISABLED. Deferred until re-enable.
  - **Read drift — CLOSED 2026-05-28:** All field-opus-db-query stale refs fixed (auto_fix_attempts cols, bug_reports title+classification). `assigned_pm_id` → `assigned_pm` renamed in supabase.js notification fan-out. **Read drift count: 0.**
  - **Priority:** All live-code drift now closed. Only remaining open item is the DISABLED ai-pm-nightly quote_requests ref.

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
- `todo-system · 2026-04-28` — todos table; TodayScr; TodoCard; ai-pm-nightly first writer; Resume flow

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
- `column-drift-fix-2026-05-28 · 2026-05-28` — Fixed all open read-drift findings from 2026-05-27 scan. (1) supabase.js: `assigned_pm_id` → `assigned_pm` at 3 sites in notification fan-out (comment + select projection + 2 recipient collectors). PM was silently excluded from all schedule item notifications. (2) field-opus-db-query/index.ts: fixed `recent_bug_reports` (dropped nonexistent `title`, `classification`; using real cols), fixed `recent_auto_fix_attempts` (replaced all 7 stale col names with real schema: `bug_id, classification, reasoning, fix_prompt, vm_dispatch_status, vm_response, created_at`; order by `created_at`), stubbed `failed_intents_last_24h` (table never existed — returns `{ rows: [], note }` instead of crashing). Open drift after this slice: 1 (quote_requests in disabled ai-pm-nightly — deferred).

---

## Symptom index addition

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
- Open (S4 remaining): P3 (tab deep-link — `?tab=` → pendingTab prop to JobDet), P4 (notification bell opens correct tab).
