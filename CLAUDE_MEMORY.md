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

7. **Built-but-not-wired components exist. Do not treat as dead code.** Current list: `MaterialSelectionScr.jsx`, `FloorPlanEditor.jsx`. Both have outstanding design decisions before rewiring.

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
- **ai-master-agent has 16 tools** (2 stale read tools removed 2026-05-19 — see read-tool cleanup LOG below): get_jobs, get_team, create_job, update_job, add_contact, send_client_portal, invite_person, add_note, advance_phase, update_phase, submit_change_order, log_payment, log_receipt, notify_team, add_todo, add_knowledge.
- **`CONFIRM_TOOLS` is a 5-verb whitelist** (extended 2026-05-09 from 3 to 5): log_payment, log_receipt, submit_change_order, add_todo, create_job. Every member returns `pending_action` and surfaces a Confirm card before the row is written.
- **`job_estimates` consultation columns EXIST** (2026-05-12 via Shape C migration). New columns: `session_id UUID → consultation_sessions(id)`, `created_by UUID → profiles(id)`, `estimate_data JSONB` (structured AI estimate output from Consultation flow, distinct from `messages` which holds Estimator chat transcript), `total NUMERIC`, `source TEXT` (currently 'ai_consultation'). UNIQUE on `job_id` retained — Estimator and Consultation upsert onto the same row, non-overlapping field sets. Multi-source split deferred.
- **`scheduled_actions` table EXISTS** (AGENT_OPS Phase 1.1, 2026-05-20). Agent's own todo list — reminders, self-followups, watchdog detections. 21 columns: id, tenant_id, kind (reminder/followup/watchdog), status (scheduled/fired/cancelled/failed), priority (low/medium/high — Phase 1.2 migrated from 4-level spec to match todos canonical enum), fire_at, fired_at, cancelled_at, retry_count (INTEGER DEFAULT 0), created_by_id (NOT NULL FK→profiles), target_user_id (nullable FK→profiles), related_job_id (nullable TEXT FK→jobs), related_todo_id (nullable UUID FK→todos), related_entity_type, related_entity_id, payload (JSONB DEFAULT '{}'), result, rule_key, source (agent/watchdog_cron/system DEFAULT agent), created_at, updated_at. 4 indexes (2 partial). 3 RLS policies — no DELETE policy (use status='cancelled'). Migrations: 20260520100000_scheduled_actions.sql (create), 20260520110000_scheduled_actions_priority_3level.sql (enum fix). Helpers: sbCreateScheduledAction, sbListScheduledActionsForUser, sbCancelScheduledAction.
- **`daily_logs` has 3 AGENT_OPS columns** (Phase 1.2, 2026-05-20): `phase_on_schedule BOOLEAN`, `delay_days INTEGER`, `issues_flagged TEXT` — all nullable, backward-compatible. Patched by daily-log conversation hook in Phase 6. Migration: 20260520120000_daily_logs_agent_ops_columns.sql.
- **`trade_material_lead_times` table EXISTS** (AGENT_OPS Phase 1.2, 2026-05-20). Per-trade material lead time thresholds. Tenant override → platform default (tenant_id NULL) → fallback 7 days. 4 Avenstone seed rows (canonical trade strings verified against trade_phase_map: 'Cabinets / vanities - Install' 21d, 'Tile - Floor' 14d, 'Tile - Wall / shower' 14d, 'Plumbing - Finish / fixtures' 14d). Migration: 20260520130000_trade_material_lead_times.sql. Helper: sbGetTradeLeadDays.
- **bug_reports.status CHECK extended** (AUTO_FIX_ARC Phase C, 2026-05-21). New values added: 'reported', 'attempting', 'auto_fixed', 'needs_human'. Existing values retained: 'open', 'in_progress', 'fixed', 'wontfix'. Dispatcher acts on 'open' (submit-bug-report insert value). Migration: 20260521000000_bug_reports_status_extend.sql.
- **auto_fix_attempts table EXISTS** (AUTO_FIX_ARC Phase C, 2026-05-21). Audit log for every dispatcher invocation. Columns: id, bug_id (FK→bug_reports), classification, reasoning, fix_prompt, vm_dispatch_status, vm_response (JSONB), created_at. RLS: platform_owner SELECT only. One row per classifier call. Used for one-try-per-bug enforcement (COUNT check before dispatch) and global 24h rate limit (COUNT where created_at >= 24h ago). Indexes: bug_id, created_at DESC. Migration: 20260521010000_auto_fix_attempts.sql.
- **notifications_type_check extended with 'todo_delegated'** (AGENT_OPS Phase 2.1, 2026-05-20). Migration: 20260520140000_notifications_type_todo_delegated.sql. notify-email SUBJECTS map updated with subject "You've been assigned a new todo".
- **notifications_type_check extended with 'team_alert' and 'master_agent' reinstated** (AGENT_OPS Phase 2.2, 2026-05-20). Migration: 20260520150000_notifications_type_team_alert.sql. `master_agent` was inadvertently dropped in Phase 2.1's migration — reinstated. `team_alert` is the type for `notify_team_member` verb.
- **on_notification_insert trigger now has priority gate** (AGENT_OPS Phase 2.2, 2026-05-20). Migration: 20260520160000_notification_email_trigger_priority_gate.sql. Trigger recreated with `WHEN (NEW.email_sent IS NOT TRUE)`. Priority gate contract: executor sets `email_sent = priority !== 'high'` at INSERT time — high priority emails; medium/low do not. Verified in pg_trigger via `pg_get_triggerdef`.
- **ai-master-agent has 17 tools** (Phase 2.2, 2026-05-20): added `notify_team_member` (CONFIRM_TOOLS). Total: get_jobs, get_team, create_job, update_job, add_contact, send_client_portal, invite_person, add_note, advance_phase, update_phase, submit_change_order, log_payment, log_receipt, notify_team, add_todo, notify_team_member, add_knowledge.
- **CONFIRM_TOOLS now has 6 verbs** (Phase 2.2, 2026-05-20): log_payment, log_receipt, submit_change_order, add_todo, create_job, notify_team_member.
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
- Todo push notification wiring deferred (`send-push` edge fn exists, no callers)
- Dev auto-login removal before external testers
- Drift detector (2026-05-10 first run; all 15 findings now cleared as of 2026-05-12). Final fix arc: contacts 3 cleared 2026-05-13 (full_name→name rename, drop project_type/description); job_notes 2 cleared (drop note_type, rename created_by→author); todos drift closed 2026-05-13 (see LOG below); job_estimates 6 cleared via Shape C migration + ConsultationTab upsert fix. **Drift count: 0 (audit:schema scans JS/TS src only — ai-pm-nightly TS edge fn drift was not scanner-visible; closed manually).** Re-run `npm run audit:schema` from `avenstone-vite/` after any new table or column work. Note: ai-pm-nightly todos insert was never writing rows because function is DISABLED — but the stale payload would have silently dropped rows on any re-enable. Detector Phase 2 shipped 2026-05-13 — skipped now 9 (was 34 at Phase 1 baseline, 15 after Phase 1). Remaining 8 skipped are function parameters (no call-site analysis), 1 is dynamic .from() (opaque). No new drift surfaced by Phase 2 extension. Missing-tables arc 2026-05-19: 4 findings → 1 STOP (see LOG). Scanner missing-tables now: 1 (quote_requests in ai-pm-nightly — DISABLED, deferred until re-enable). Write/read drift 0, write skipped 0.

- **Tool-payload drift detector refinement (Path B)** — Detector shipped 2026-05-21 in commit 94708e1. Initial run: 14 advertised-not-written findings, all expected false positives in 3 categories:
  1. WHERE-clause keys (e.g. update_job.job_id used in .eq() not .update payload)
  2. Key aliases (e.g. notify_team_member.message written to body column)
  3. Meta-fields / control flow (e.g. also_create_todo controls logic, never written)
  Refinement needed for signal-to-noise at multi-tenant scale. Scope: teach scanner to recognize Patterns 1 + 2 via AST (Phase A); add x-meta schema annotation for Pattern 3 (Phase B only if Phase A leaves residual noise). Estimated 1-2 prompts. Trigger to ship: when noise list grows past ~25, OR when a real finding gets buried in the noise, OR next fresh session if Kalin wants to close the loop.

**Components:**
- `FloorPlanEditor.jsx` — built, UX decision outstanding before rewiring
- `MaterialSelectionScr.jsx` — built, landing surface decision outstanding

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
- Drift detector enhancement — Phase 1 shipped 2026-05-12 (decodes `.map()`/`.flatMap()` callback payloads). Phase 2 shipped 2026-05-13 (decodes ObjectPattern-rest `const {..., ...patch} = x || {}` + ConditionalExpression branch union). Phase 3 shipped 2026-05-19 (binding.kind=param early return + sbUpdateScanOverrides static refactor). Skipped: 34 → 15 → 9 → 0. CLOSED.
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

---

[LOG — 2026-05-23 — PUSH_NOTIFICATIONS_ARC Phase 1: dual-channel push_subscriptions schema SHIPPED.]
- Action: Migration 20260523100000_push_subscriptions_dual_channel.sql applied and verified. push_subscriptions extended for dual-channel (web + apns).
- Files: supabase/migrations/20260523100000_push_subscriptions_dual_channel.sql (new). Commit: f6b4c95.
- Schema changes: channel TEXT NOT NULL (channel_check: 'web'|'apns'), apns_token TEXT NULL, endpoint/p256dh/auth dropped NOT NULL. Old unique constraint push_subscriptions_user_id_endpoint_key dropped. Two partial unique indexes added: idx_push_sub_web_unique (user_id, endpoint WHERE channel='web'), idx_push_sub_apns_unique (user_id, apns_token WHERE channel='apns'). channel_payload_check ensures field exclusivity per channel. 7 existing rows backfilled to channel='web'.
- Verification (all 8 queries PASS):
  A. channel: TEXT, NOT NULL, no default. ✓
  B. apns_token: TEXT, nullable. ✓
  C. endpoint/p256dh/auth: all nullable. ✓
  D. Both partial indexes present with correct WHERE clauses. ✓
  E. Both CHECK constraints present (channel_check + channel_payload_check). ✓
  F. Zero unique constraints remaining (old (user_id,endpoint) unique dropped). ✓
  G. All 7 rows = channel='web', zero NULL channel. ✓
  H. All 7 web rows pass payload check (endpoint/p256dh/auth NOT NULL, apns_token NULL). ✓
- Smoke tests (all 6 PASS):
  1. Valid web insert → succeeded, id returned. ✓
  2. Valid apns insert → succeeded, id returned. ✓
  3. web + apns_token set → channel_payload_check fired. ✓
  4. apns missing token → channel_payload_check fired. ✓
  5. channel='fcm' → channel_check fired. ✓
  6. Duplicate apns token for same user → idx_push_sub_apns_unique fired. ✓
- Pre-migration audit findings: unique constraint push_subscriptions_user_id_endpoint_key confirmed (exact DROP name used). All 4 RLS policies reference only user_id = auth.uid() — unaffected. All 7 rows had endpoint/p256dh/auth NOT NULL (all Web Push dev subs, clean backfill).
- Trade-aware: push_subscriptions is a platform table (no tenant_id). channel enum is platform-level. No tenant or trade assumptions.
- Open: Phase 2 (manifest.json + index.html link), Phase 3 (APNs plugin + iOS config), Phase 4 (client registration), Phase 5 (send-push APNs branch + trigger fan-out).

[LOG — 2026-05-23 — PUSH_NOTIFICATIONS_ARC Phase 2: PWA manifest shipped. "Add to Home Screen" enabled.]
- Action: Created avenstone-vite/public/manifest.json + added <link rel="manifest"> to index.html. Enables browser PWA install prompt on Chrome/Android/Safari.
- Files: avenstone-vite/public/manifest.json (new), avenstone-vite/index.html (manifest link tag added). Commit: e659f77.
- Manifest: name="Avenstone", display=standalone, theme_color=#0A1F44 (matched from existing meta), background_color=#ffffff. Single icon entry: /favicon.svg, sizes="any", type="image/svg+xml", purpose="any". SVG icon used — Chrome 87+ accepts SVG manifest icons and will trigger install prompt. PNG icons not present in public/ (only favicon.svg and icons.svg exist).
- Build: ✓ 652ms. dist/manifest.json confirmed present. dist/index.html confirmed contains <link rel="manifest" href="/manifest.json" />.
- cap sync ios: clean (0.143s). WKWebView ignores manifest — zero iOS app impact.
- Open: (1) On-device verification after next Vercel deploy: Chrome desktop → install prompt in address bar, Android Chrome → install banner, iOS Safari → Add to Home Screen (note: iOS uses apple-touch-icon not manifest, so icon will fall back to favicon). (2) PNG icon generation deferred as separate polish slice — produce 192×192 and 512×512 PNGs from logo source, add to public/, update manifest. (3) apple-touch-icon meta tag missing — separate polish slice. (4) Multi-tenant white-label will need per-tenant dynamic manifest endpoint at v4+ — out of scope for v1.
- No DB changes, no edge fn changes, no Capacitor config changes.

[LOG — 2026-05-23 — PUSH_NOTIFICATIONS_ARC.md blueprint created. Option B locked.]
- Action: Created PUSH_NOTIFICATIONS_ARC.md at repo root. Dual-channel push notifications blueprint: APNs (iOS native) + Web Push (PWA), APNs ships first.
- Files: PUSH_NOTIFICATIONS_ARC.md (new), OPUS_RULES.md (arc docs list updated), CLAUDE_MEMORY.md (this entry)
- Decision: Option B — dual-channel designed from day one. `push_subscriptions.channel` enum ('web'|'apns') is source of truth. send-push branches per row. APNs ships as v1; Web Push (Phase 6) is a later additive slice requiring no schema or edge fn changes.
- Audit basis: 2026-05-23 push/PWA/iOS audit. FK pre-check: zero FK references to push_subscriptions from any other table — Phase 1 migration is clean.
- 5 phases scoped (Phase 6 deferred): Phase 1 schema, Phase 2 manifest, Phase 3 APNs iOS config, Phase 4 client registration, Phase 5 send-push APNs branch + trigger fan-out.
- Open: Phase 1 is the trigger to start building. APNs cert config (Phase 3 manual step by Kalin) and Deno APNs lib choice (Phase 5 audit-first) are the two unresolved pre-flight questions.

[LOG — 2026-05-24 — PUSH_NOTIFICATIONS_ARC Phase 3: iOS APNs plumbing shipped.]
- Action: Installed @capacitor/push-notifications@8.1.1, ran cap sync twice (before + after iOS file edits), added UIBackgroundModes remote-notification to Info.plist, created App.entitlements (aps-environment=production), added two APNs delegate methods to AppDelegate.swift, wired CODE_SIGN_ENTITLEMENTS into project.pbxproj (Debug + Release App target blocks). Created PUSH_NOTIFICATIONS_ARC_APNS_CERT_SETUP.md at repo root with manual cert/key setup checklist.
- Files: avenstone-vite/package.json, avenstone-vite/ios/App/CapApp-SPM/Package.swift (cap sync), avenstone-vite/ios/App/App/Info.plist, avenstone-vite/ios/App/App/App.entitlements (new), avenstone-vite/ios/App/App/AppDelegate.swift, avenstone-vite/ios/App/App.xcodeproj/project.pbxproj, PUSH_NOTIFICATIONS_ARC.md (Phase 3 marked Shipped), PUSH_NOTIFICATIONS_ARC_APNS_CERT_SETUP.md (new).
- Decision: aps-environment=production (locked — TestFlight uses production APNs). CODE_SIGN_ENTITLEMENTS added alphabetically between ASSETCATALOG and CODE_SIGN_STYLE in both App target build config blocks (504EC3171FED79650016851F Debug, 504EC3181FED79650016851F Release). Project-level blocks (504EC3141FED79650016851F, 504EC3151FED79650016851F) left untouched.
- Verification: second cap sync clean — 3 plugins confirmed (@capacitor-community/text-to-speech@8.0.0, @capacitor/push-notifications@8.1.1, @capgo/capacitor-speech-recognition@8.1.2). Xcode build verification pending Codemagic build.
- Open: (1) Kalin follows PUSH_NOTIFICATIONS_ARC_APNS_CERT_SETUP.md to enable Push Notifications capability on App ID, generate APNs .p8 key, and set 4 Supabase secrets (APNS_KEY_ID, APNS_TEAM_ID, APNS_AUTH_KEY, APNS_BUNDLE_ID). Required before Phase 5 but NOT blocking Phase 4. (2) Next phase: Phase 4 — client registration in src/lib/push.js + App.jsx wiring. (3) PNG icons for manifest (separate polish slice). (4) On-device verification after Codemagic build hits TestFlight — confirm permission prompt fires, token lands in push_subscriptions.

[LOG — 2026-05-24 — bug 5bc01e69 fixed: sbMarkNotifsRead .catch() on Supabase v2 query builder]
- Action: Replaced bare `.update(...).in(...).catch(...)` chain with `await` + try/catch in `sbMarkNotifsRead`. Supabase v2 query builder is PromiseLike, not a real Promise — `.catch()` chained on the builder caused mark-read to silently fail.
- Files: avenstone-vite/src/lib/supabase.js (sbMarkNotifsRead body only). Also added `?.` to the `ids?.length` guard.
- Audit follow-up: one other instance of `.catch()` chained on a query builder remains at supabase.js:3156 — `.select('address').eq('id', jobId).single().catch(() => ({ data: null }))` inside sbAdvancePhase. Same bug class but a SELECT chain, not the UPDATE pattern listed in the fix scope; left for a follow-up slice.

[LOG — 2026-05-24 — PUSH_NOTIFICATIONS_ARC Phase 4: client registration shipped.]
- Action: Phase 4 of PUSH_NOTIFICATIONS_ARC shipped. APNs token registration wired end-to-end in the React app.
- Files: avenstone-vite/src/lib/push.js (new), avenstone-vite/src/lib/supabase.js (+sbUpsertPushSubscription), avenstone-vite/src/App.jsx (+import + useEffect). Commit: e886ee0.
- push.js: registerForPush({userId, onDeepLink}) — Capacitor.isNativePlatform() gate (web = no-op, channel:'none'). On native: checkPermissions → requestPermissions if needed → attach 4 listeners once → PushNotifications.register(). Module-level idempotency via registered + listenersAttached flags.
- sbUpsertPushSubscription: read-then-write pattern (Supabase JS can't target partial unique indexes via onConflict). Validates channel payload shape. Returns {ok, error, data}.
- App.jsx useEffect (gated on profile?.id): onDeepLink callback routes /job/<id> → setPendingJobId + setPg('jobs'); /todo/<id> → setPg('today'); unknown patterns no-op.
- Build: ✓ 377 modules, 559ms. cap sync: ✓ 3 plugins confirmed.
- Open: On-device verification after next Codemagic build → TestFlight. Phase 5 (send-push APNs branch + trigger fan-out) is next — requires APNs cert secrets in Supabase (APNS_KEY_ID, APNS_TEAM_ID, APNS_AUTH_KEY, APNS_BUNDLE_ID) before pushes can deliver.

---

[LOG — 2026-05-23 — FIELD_OPUS_ARC blueprint shipped — build target 2026-05-24 morning]
- Action: Captured FIELD_OPUS_ARC.md blueprint at repo root. Documentation only — zero code, zero schema this slice.
- Concept: Opus-quality dev console inside the app. Kalin talks to Opus in the field, Opus audits + drafts Sonnet prompts, Kalin taps Send to VM, AUTO_FIX_ARC's VM runs the slice, results stream back into the chat thread.
- Locked decisions: hard auth-ID gate (Kalin only), confirm-before-dispatch, VM as executor (not laptop), serial dispatch with queue depth 5, persistent single thread, read access via raw.githubusercontent.com + whitelist DB queries.
- 6 phases scoped: schema/RLS, read-only edge fns, Field-Opus brain (split across 2 prompts), VM dispatch wiring, client UI, polish + auth-gate smoke tests. Est 7 prompts total.
- Files: FIELD_OPUS_ARC.md (new), CLAUDE_MEMORY.md (this entry + active arcs bullet), OPUS_RULES.md (active arc docs list).
- Trade-aware: single-user feature gated to Kalin's auth ID. No tenant/trade concerns.

[LOG — 2026-05-24 — PUSH_NOTIFICATIONS_ARC Phase 5: send-push APNs branch + push fan-out trigger shipped.]
- Action: Phase 5 of PUSH_NOTIFICATIONS_ARC shipped. Server-side push delivery fully wired.
- Files: supabase/functions/send-push/index.ts (refactored), supabase/functions/notification-push-fanout/index.ts (new), supabase/migrations/20260524100000_notification_push_fanout_trigger.sql (new + applied).
- send-push: dual-channel on subscription.channel. APNs path: raw HTTP/2 fetch to api.push.apple.com, ES256 JWT via crypto.subtle (PKCS8 ECDSA P-256), 50-min JWT cache. Input contract changed from {record:{}} wrapper to flat {user_id, title, body, deep_link, priority}. Zero prior callers — breaking change safe. Web-push 410/404 stale cleanup already existed — preserved unchanged. Failures log to ai_error_logs.
- notification-push-fanout: receives {record: <notif row>} from DB trigger. Filters to 7 existing push types. Builds per-type title + deep_link. Calls send-push. Always returns HTTP 200 (never blocks INSERT). Errors → ai_error_logs best-effort.
- Push types wired (7 existing types — arc doc's 4 type names did not exist in notifications_type_check; mapped to actual emitted types): todo_delegated, assigned_to_job, schedule_item_created, schedule_item_changed, co_submitted, co_approved, co_rejected.
- Trigger mechanism: pg_net.http_post — mirrors trigger_notify_email pattern exactly (anon JWT, hardcoded URL, {record: row_to_json(NEW)} body). trigger_notify_email was Supabase Dashboard-created webhook; its definition was NOT in any local migration file.
- Audit finding: notifications table has no priority column. Push fan-out always passes priority='medium' (APNs priority 5). Acceptable for v1.
- Audit finding: 2 pre-existing triggers on notifications not in local migration files (on_notification_insert_push, on_notification_insert_sms) — likely Dashboard Webhooks for older paths. Not touched, not in scope.
- APNs secrets: all 4 confirmed set (APNS_KEY_ID=A79823RWQZ, APNS_TEAM_ID=5LDNZFSR2A, APNS_BUNDLE_ID=com.avenstonekc.avenstone, APNS_AUTH_KEY=.p8 contents).
- Smoke Test 1 (non-push type): PASS. Smoke Test 2 (push type, no APNs subscription): PASS. Smoke Test 3 (push type WITH APNs subscription): skipped — no subscription registered yet (deferred to post-TestFlight on-device verification).
- Commits: c51b4ef, 146ee7c, 1758ed6 (all pushed to main).
- Open: On-device push verification awaits next Codemagic build → TestFlight → permission grant → apns_token registered → real notification INSERT → push arrives on device. Phase 6 (Web Push SW slice) still deferred.
- Open: build starts 2026-05-24 morning. PUSH_NOTIFICATIONS_ARC Phase 5 + Phase 6 still pending. APNs cert checklist still pending Kalin.

[LOG — 2026-05-24 — FIELD_OPUS_ARC Phase 1 schema shipped]
- Action: Phase 1 of FIELD_OPUS_ARC shipped. Schema foundation + 4 RLS policies + 3 client helpers.
- Migration: 20260524110000_field_opus_messages.sql.
- Table: field_opus_messages (id UUID PK, thread_id UUID NOT NULL, role TEXT CHECK in (user/assistant/system/dispatch_result), content TEXT, meta JSONB, created_at TIMESTAMPTZ). Index on (thread_id, created_at).
- RLS: 4 policies (SELECT/INSERT/UPDATE/DELETE) all gated by auth.uid() = Kalin's UUID literal. Service role unaffected.
- Client helpers: sbLoadFieldOpusThread, sbAppendFieldOpusMessage, sbResetFieldOpusThread. All check auth.uid() === FIELD_OPUS_USER_ID before touching DB (defense-in-depth — RLS is the actual gate). All return {ok, error, data}.
- Constants: FIELD_OPUS_USER_ID (Kalin's auth UUID), FIELD_OPUS_THREAD_ID (single hardcoded thread UUID for v1, multi-thread deferred).
- Verification: schema + 4 policies + index + relrowsecurity=true. Role-check smoke: invalid role rejected. PASS.
- Trade-aware: single-user feature, no tenant or trade concerns.
- Commits: 468c755 (migration), c39c37d (helpers). Pushed to main.
- Open: Phase 2 (read-only edge fns — field-opus-fetch-file + field-opus-db-query). Phase 3 (field-opus-chat edge fn — the Opus brain). Phase 4 (VM dispatch wiring). Phase 5 (client UI panel). Phase 6 (polish + auth-gate smoke tests).

[LOG — 2026-05-24 — FIELD_OPUS_ARC Phase 2 shipped]
- Action: Phase 2 of FIELD_OPUS_ARC shipped. Two read-only edge fns, both Kalin-auth-gated.
- field-opus-fetch-file: proxies raw.githubusercontent.com for the repo. Path whitelist: 6 prefixes (avenstone-vite/src/, avenstone-vite/ios/, avenstone-vite/public/, supabase/functions/, supabase/migrations/, tools/) + root MD files allow list. Rejects path traversal (..), absolute paths, null bytes. 250KB truncation guard.
- field-opus-db-query: 9 whitelisted query_kinds (recent_bug_reports, recent_auto_fix_attempts, ai_error_logs_summary, failed_intents_last_24h, schema_for_table, policies_for_table, recent_notifications, push_subscriptions_overview, jobs_by_status). No raw SQL pass-through. Service-role client used internally; auth gate is the JWT verification layer. Note: ai_error_logs columns corrected to actual schema (function_name, error_message, user_id, created_at, metadata); notifications query dropped non-existent priority column.
- Both functions verify auth.uid() = '8171742a...' via JWT before any work. Reject everything else with 403. Import style: npm:@supabase/supabase-js@2 (matches ai-master-agent).
- Smoke tests: deferred to Phase 3 first call (functions are read-only; failure means Phase 3 tool_use errors, not data corruption).
- Trade-aware: dev-tool surface, no tenant/trade assumptions.
- Commits: f829046 (fetch-file), 33c3dfc (db-query). Pushed to main.
- Open: Phase 3 (field-opus-chat — the Opus brain — wires these two as tool_use). Phase 4 (VM dispatch). Phase 5 (client UI). Phase 6 (polish).

[LOG — 2026-05-24 — FIELD_OPUS_ARC Phase 3a shipped — chat brain scaffolding]
- Action: Phase 3a of FIELD_OPUS_ARC shipped. Edge function field-opus-chat — Opus brain scaffolding with tools registered but stubbed.
- Model: claude-opus-4-7 via Anthropic API. max_tokens 4096. cache_control: ephemeral on system prompt (array form) + last tool (cache the tools block too). No anthropic-beta header needed (caching is GA).
- System prompt: identity + role + tone + 4 governing docs (CLAUDE.md, CLAUDE_MEMORY.md, OPUS_RULES.md, FIELD_OPUS_ARC.md) fetched from GitHub raw at every call. 100KB truncation per doc.
- 4 tools declared: read_source_file, query_db, draft_sonnet_prompt, note_decision. Only draft_sonnet_prompt is functional in 3a (structured output, input surfaced directly to client). Other three return stub errors — Phase 3b implements tool execution loop.
- Thread persistence: field_opus_messages writes via service-role client. RLS bypassed (already auth-verified). Single-thread v1.
- dispatch_result + system roles in thread converted to user-role messages for the API — interim shape until Phase 3b/4 polish.
- Auth gate: JWT → auth.getUser() → reject if id !== Kalin UUID. 403 on failure.
- Smoke tests: Test 1 (no auth → 403) deferred to post-deploy. Test 2 (real message) deferred to Phase 5 when client UI exists.
- Trade-aware: dev-tool, single-user, no tenant/trade concerns.
- Commit: b67ee95. Pushed to main.
- Open: Phase 3b (implement 3 stubbed tool executors + tool-use loop). Phase 4 (VM dispatch wiring). Phase 5 (client UI). Phase 6 (polish).

[LOG — 2026-05-24 — FIELD_OPUS_ARC Phase 3b shipped — tool loop + real implementations]
- Action: Phase 3b of FIELD_OPUS_ARC shipped. Tool execution loop wired. 3 stubbed tools now functional. Phase 3 complete.
- read_source_file: HTTP POST to field-opus-fetch-file with user JWT. Returns content + truncation flag + original_length.
- query_db: HTTP POST to field-opus-db-query with user JWT. Returns whitelisted query result.
- note_decision: appendMessage(sb, 'system', text, {kind:'note_decision'}). Surfaces as a system row in the thread.
- draft_sonnet_prompt: structured output only — captured from tool_uses[] in the handler, ack returned to Opus, draft_prompt field in response.
- Tool loop: MAX_ITERATIONS=10. Each iteration: call Anthropic → if tool_use blocks present, execute all → append as tool_result → call again. Breaks when no tool_use in response or cap hit.
- Loop cap safety: if MAX_ITERATIONS reached, system note appended ('loop cap hit, N iterations') so Kalin sees runaway.
- Tool result truncation: each tool_result truncated to 60KB before feeding back. Prevents context blowout from giant file reads.
- Token forwarding: handler passes user JWT through to inner edge fns for defense-in-depth re-verification.
- Assistant message persistence: meta carries stop_reason, usage, iterations, full tool_uses list, draft_prompt if any.
- Smoke tests: deferred to Phase 5 (no JWT available without client UI).
- Trade-aware: dev-tool, single-user, unchanged.
- Commit: 780a713. Pushed to main.
- Open: Phase 4 (VM dispatch wiring — when Kalin taps Send to VM on a draft_prompt card). Phase 5 (client UI panel). Phase 6 (polish + auth-gate smoke tests).

[LOG — 2026-05-24 — FIELD_OPUS_ARC Phase 4 partially shipped — Supabase side complete]
- Action: Phase 4 Supabase side shipped. VM /dispatch-interactive endpoint is open item — VM source not in repo.
- Migration: 20260524120000_field_opus_dispatch_queue.sql. 12 columns, 4 RLS policies, 2 custom indexes, 1 updated_at trigger. Verified live.
- field-opus-dispatch-to-vm: auth-gated (Kalin JWT), queue depth check (MAX_IN_FLIGHT=5), enqueues + POSTs to VM_DISPATCH_URL with {queue_id, prompt, webhook_url}. Uses VM_WEBHOOK_SECRET + x-webhook-secret header (same as ai-auto-fix-dispatcher — no new secret needed).
- field-opus-result-webhook: gated by VM_WEBHOOK_SECRET (x-webhook-secret header). Updates dispatch queue row + inserts dispatch_result message into field_opus_messages. VM side calls this after Sonnet completes.
- VM side (OPEN): VM server source not in this repo — lives on autofix.avenstonekc.com VM only. Existing /fix endpoint takes {bug_id, prompt}; new /dispatch-interactive endpoint needs to take {queue_id, prompt, webhook_url} and fire-and-forget. Kalin needs to SSH into the VM and add this endpoint to whatever Express/Node server handles /fix. Pattern: verify x-webhook-secret, respond 202 immediately, run same Claude Code runner async, POST result back to webhook_url.
- Secret: VM_WEBHOOK_SECRET already exists (set for auto-fix path) — reused for Field-Opus. No new secret needed unless Kalin wants a separate one.
- FIELD_OPUS_VM_URL env var (optional): defaults to https://autofix.avenstonekc.com/dispatch-interactive. Set in Supabase fn secrets if VM URL differs.
- Commits: 4d64d5f (migration), 595a996 (edge fns). Pushed to main.
- Open: VM /dispatch-interactive endpoint (Kalin SSH). Phase 5 (client UI panel). Phase 6 (polish).

[LOG — 2026-05-24 — FIELD_OPUS_ARC Phase 5 shipped — client UI panel]
- Action: FieldOpusPanel.jsx shipped. All of Phase 5 complete.
- Files: avenstone-vite/src/components/shared/FieldOpusPanel.jsx (new, 630 lines), App.jsx (import + mount), supabase.js (FIELD_OPUS_CHAT_URL + FIELD_OPUS_DISPATCH_URL exports).
- Key: Auth guard placed AFTER all hook calls (useState/useRef/useEffect). profile.id !== FIELD_OPUS_USER_ID → returns null. Effect on open also guards on profile.id.
- DEV button: fixed, top: 14, right: 80 (avoids MasterAgent's bottom-right position).
- Panel: navy, slides from right (desktop 420px; mobile full-screen).
- Realtime: subscribes to field_opus_messages INSERT on open, unsubscribes on close. Deduplicates optimistic user messages when real insert arrives.
- Dispatch flow: draft_sonnet_prompt card in assistant messages. "Send to VM" → field-opus-dispatch-to-vm. VM result arrives via realtime as dispatch_result row.
- STT: @capgo/capacitor-speech-recognition (same as MasterAgent). Hold-to-talk with touchstart/touchend/touchcancel + mousedown/mouseup fallback.
- Commit: dababa8. Pushed to main.
- Open: Phase 6 (polish + auth-gate smoke tests). VM /dispatch-interactive (Phase 4 VM side — Kalin SSH).

[LOG — 2026-05-24 — HomeScr: replaced AiHomeScr + TodayScr with single dashboard]
- Action: Merged Today screen + AI Home chat screen into a single Home dashboard (active projects glance, 7-day schedule, open to-dos).
- Files: avenstone-vite/src/components/home/HomeScr.jsx (new), avenstone-vite/src/lib/supabase.js (+sbLoadUpcomingScheduleItems), avenstone-vite/src/App.jsx (rewired), avenstone-vite/src/components/dashboard/TodayScr.jsx (deleted), avenstone-vite/src/components/ai/AiHomeScr.jsx (deleted).
- sbLoadUpcomingScheduleItems(days=7): queries schedule_items by tenant_id + scheduled_date range, excludes cancelled/complete, joins job address.
- App.jsx changes: default pg 'dashboard' → 'home'; NAV entry 'today'+'dashboard' → single 'home'; bot-nav 6 tabs → 4 (Home/grid, Projects/home, To-dos/check, Reports/box gated isOwnerOrRep); removed cold-start useEffect (sbCountPendingTodos redirect to 'today'); deep-link /todo/<id> → setPg('todos') (was 'today'); logo click → 'home'; pg-wrap render added for 'home', removed 'today'/'dashboard'.
- Decision: cold-start redirect removed — todos are now the third section of the Home dashboard, so the landing is always correct.
- Build: ✓ 377 modules. Commits: 2723f88 (HomeScr + helper), 73c21e1 (App.jsx rewire + deletes). Pushed to main.
- Open: None — HomeScr ships complete. FIELD_OPUS_ARC Phase 6 still pending.

[LOG — 2026-05-25 — Removed duplicate AiCompanionChat floating button from JobDet]
- Action: Removed the per-job sparkle AiCompanionChat mount from JobDet — MasterAgent (App.jsx top level) is now the sole persistent agent surface. Resolves "one floating button max per screen" violation.
- Files: avenstone-vite/src/components/jobs/JobDet.jsx (import + JSX mount removed).
- Decision: kept avenstone-vite/src/components/shared/AiCompanionChat.jsx in repo, only unmounted. Old companion logic preserved in case Kalin wants to revive it later.
- Build: ✓ 376 modules. Commit: afd398a. Pushed to main.
- Open: None.

[LOG — 2026-05-25 — Merged Scanner tab into Consultation idle view]
- Action: Removed the standalone "Scanner" tab from JobDet; folded its functionality into the Consultation tab's idle view as a new "Floor Plans" section below Past Sessions. Loads scans via sbGetJobLidarScans, renders date/sqft/FloorPlanCanvas/Export PDF per scan, "New Scan" button opens AiIntakeWizard as a full-screen overlay. Logic ported verbatim from FloorPlanTab — same helpers, same UI patterns.
- Files: avenstone-vite/src/components/jobs/tabs/ConsultationTab.jsx (+131 lines: imports, state, loadScans, handleExportPDF, idle-view section, overlay mount), avenstone-vite/src/components/jobs/JobDet.jsx (-3 lines: import + TABS entry + render line).
- Decision: avenstone-vite/src/components/jobs/tabs/FloorPlanTab.jsx left in place as orphaned dead code (not deleted) per spec — may be revived later. Tab count 11 → 10.
- Build: ✓ 375 modules. Commits: 41ca02d (ConsultationTab), 5d994f3 (JobDet). Pushed to main.
- Open: None.

[LOG — 2026-05-24 — Materials tab merged into Financials as sub-tab]
- Action: Materials removed from JobDet top-level tabs; rendered as 5th sub-tab inside Financials (ledger / budget / COs / invoices / materials).
- Reason: Tab pressure on mobile (10 tabs wrapping). Materials is spend data — natural fit under Financials.
- Files: FinancialsTab.jsx (added import + SUB_TABS entry + render), JobDet.jsx (removed import + TABS entry + mount).
- Tab count: JobDet TABS 10 → 9.
- Open: MaterialsTab dark theme (#111827) clashes with FinancialsTab cream theme — visual polish deferred. Role-gating on Financials access (vs. old pmOnly Materials gate) — verify or flag. Also: FieldTab already exposes Materials as a sub-tab; pre-existing, not introduced by this change. Materials is now reachable via both Field→Materials and Financials→Materials — may want to consolidate later.

[LOG — 2026-05-25 — AiIntakeWizard close button cleared from iPhone status bar]
- Action: Added safe-area-inset-top to AiIntakeWizard header padding so the × close button sits below the iPhone notch/Dynamic Island/status bar. Header padding changed from '14px 18px' to 'calc(14px + env(safe-area-inset-top)) 18px 14px 18px'. No-op on devices that don't need it.
- Bug: Fullscreen overlay (position: fixed, inset: 0) gave the header no safe-area handling — header sat behind the status bar/Dynamic Island, making the × unreachable on iPhone.
- Files: avenstone-vite/src/components/ai/AiIntakeWizard.jsx (single line — header div padding only).
- Scope: Platform UI fix, trade-agnostic. Other wizard/modal headers in app NOT audited — separate slice if needed.
- Build: ✓ 375 modules.

[LOG — 2026-05-25 — CALENDAR_ARC Phase 1 — invitees + delete + cancel]
- Action: Added invitees system to schedule_items, plus Delete button in CalScr's EventModal. Cancel button was already present from Phase 0.
- Migration: 20260525100000_schedule_item_invitees.sql. New table schedule_item_invitees (8 cols, 3 indexes, 4 RLS policies). Status enum: invited/accepted/declined/tentative. Unique (schedule_item_id, invitee_user_id) prevents duplicate invites.
- Helpers added to supabase.js: sbLoadScheduleInvitees (two-query: rows + profiles batch), sbAddScheduleInvitee (inserts invite row + notifications row for push fan-out), sbRemoveScheduleInvitee, sbRespondToScheduleInvite.
- sbAddScheduleInvitee fires notifications type=schedule_item_created — fully wired in notification-push-fanout (deep_link → job schedule tab). No fanout changes needed.
- CalScr EventModal: Delete button (soft-cancel via sbDeleteScheduleItem, confirm prompt), Invitees section with add/remove UI (loads team + subs for dropdown, filters out already-invited + self).
- sbDeleteScheduleItem already existed (soft-cancel, sets status=cancelled). sbLoadTeam + sbLoadActiveSubs used for invitees dropdown.
- Trade-aware: standard tenant filtering via AV_TENANT + RLS.
- Build: ✓. Migration: all 8 objects verified.

[BACKLOG — CALENDAR_ARC Phase 2 — Google Calendar sync (DEFERRED)]
- Two-way sync between schedule_items and Google Calendar per user.
- Requires: Google OAuth per user (token + refresh), conflict resolution, per-user opt-in toggle, sync state tracking column on schedule_items.
- Phase 2 prerequisites: Phase 1 invitees feature must prove out in real use first. Sync surface multiplies bug area — don't build until needed.
- Estimated: 4-6 prompts when greenlit.

[LOG — 2026-05-25 — FLOOR_PLAN_LAYOUT_ARC Phase 1 — geometry normalizer + door dedupe]
- Action: New module normalize.js — pure-function, zero-dependency geometry normalizer for raw RoomPlan/ARKit scan JSON.
- Files: avenstone-vite/src/lib/floorPlan/normalize.js (new), _smoke.mjs (new), README.md (new).
- Exports: snapToGrid, polygonCentroid, polygonAreaSqft, dedupeDoors, normalizeFloorPlan.
- Key behavior: Two doors from adjacent rooms sharing a physical doorway are merged into one; room_ids are unioned. Merge condition: midpoints within MERGE_DISTANCE_FT=0.5 ft AND abs(dot(nx,nz)) >= cos(25°)≈0.906. All output coordinates world-space feet, snapped to 0.1 ft grid.
- Smoke test: 34/34 pass (node _smoke.mjs). Build: ✓ 375 modules. No test runner (Vitest/Jest not configured) — smoke script is the test harness.
- No rendering, no components, no migrations. Data-layer only.
- Phase 2 (planned): layout.js — polylabel for L-shape label placement, layoutCheck rules engine.
- Phase 4 (planned): pdf.js consumes normalize.js output directly instead of raw scan.

[LOG — 2026-05-25 — FLOOR_PLAN_LAYOUT_ARC Phase 2A shipped — layout rules engine + 4 rules]
- Action: Phase 2A shipped. New module avenstone-vite/src/lib/floorPlan/layoutCheck.js. Consumes Phase 1 normalize.js output, produces { layout_hints, issues }.
- Rules implemented: (1) label position via polylabel (fixes L-shape centroid bug), (2) abbreviation table for common room names + truncation fallback, (3) rotation for tall narrow rooms (aspect > 1.5), (4) SF badge position with inline-for-small-rooms.
- Dependency added: polylabel@2.0.1 (~2KB).
- Issues array surfaces label_distance_low + room_unknown_name in Phase 2A. Phase 2B adds collision detection + ambiguous severity for Phase 3 Opus tiebreaker.
- Smoke: 51/51 tests pass via node _smoke_layout.mjs.
- Build: clean (375 modules; polylabel tree-shaken — nothing imports layoutCheck.js yet).
- Trade-aware: pure geometry, no trade assumptions. Abbreviation table is residential-construction-flavored — extend per trade as we white-label.
- Open: Phase 2B (4 more rules — dim collision, door swing, adjacent label, hallway SF gate) — 1 prompt. Phase 4 (pdf.js renderer consuming layout_hints) — 1-2 prompts after 2B.

[LOG — 2026-05-25 — FLOOR_PLAN_LAYOUT_ARC Phase 2B shipped — 4 collision-detection rules]
- Action: Phase 2B shipped. Extended layoutCheck.js with 4 more rules. Total rules in engine: 8.
- New exports: detectDimensionCollisions, detectDoorSwingCollisions. Internal: _computeLabelBbox, _aabbOverlap.
- Issue severities introduced: ambiguous — flagged for Phase 3 Opus tiebreaker. Other severities: info, warn.
- Input contract: normalized object may now include chain_dims[], doors[], walls[]. Phase 1 already produced doors+walls. chain_dims is a future renderer responsibility — Phase 2B is a no-op for that rule when chain_dims is absent or empty.
- Door swing simplification: circle-not-quarter-arc collision check. Over-conservative on purpose, errs safe. Single door=warn, 2+ doors=ambiguous (one issue).
- Smoke: 83/83 tests pass.
- Build: clean (375 modules).
- Trade-aware: all geometric, no trade assumptions. Hallway-type recognition uses regex match against type field (hallway|hall|corridor|stairs|landing).
- Open: Phase 4 (pdf.js renderer consuming layout_hints) — 1-2 prompts. Phase 3 (Opus tiebreaker for ambiguous issues) — only if Phase 4 surfaces real edge cases.

[LOG — 2026-05-25 — FLOOR_PLAN_LAYOUT_ARC Phase 4 shipped — pdf renderer consumes layout_hints]
- Action: Phase 4 shipped. pdf.js now imports polylabel, normalizeFloorPlan, computeLayoutHints.
- Pipeline: buildFloorPlanPDF runs Phase 1+2 after applyEditOverrides → builds layout_hints (by room.id) + hints_by_name (by label_full_text) for fallback lookup. Logs ambiguous issues + warns.
- Label loop changes: polylabel on transformed polygon replaces centroid + _interiorPoint grid search (better for L-shapes). narrow threshold now from hint.label_rotation (1.5:1 Phase 2) not legacy 3:1. Text from hint.label_text (abbreviated). SF from hint.sf_text. Hallway micro SF gate respected via sf_inline_with_label flag.
- Backward compat: all hint lookups fall back to legacy behavior when hint is missing (scan missing ids, Phase 1 normalization fails, etc.). Wall-margin + collision checks unchanged.
- Coordinate space: hints.label_x/y (world-space) are NOT used for position. polylabel runs on the renderer's already-transformed polygon — same coord space, no conversion needed.
- Files: avenstone-vite/src/lib/pdf.js (+57/-20 lines). Commit a27e463.
- Build: clean (379 modules).
- Visual testing: Kalin must run a real scan to see improvements (abbreviated names, better L-shape label placement, hallway SF suppression for small halls).
- Open: Phase 5 (pre-submit preview — shows layout_hints output before saving scan) — future prompt.

[LOG — 2026-05-25 — FLOOR_PLAN_LAYOUT_ARC Phase 1 extended — wall thickness standardized]
- Action: Extended normalize.js to auto-classify walls as exterior (1 adjoining room) or interior (2+ adjoining rooms) and override scanner-noisy thicknesses with construction standards. Exterior = 2x6 = 5.5"; interior = 2x4 = 3.5". Raw thickness preserved as thickness_raw_ft.
- New exported helper: classifyAndStandardizeWalls(walls, rooms, options).
- Solves cosmetic problem from 2026-05-25 production scan where RoomPlan returned 3+ different thicknesses per plan, looked unprofessional in client PDFs.
- Adjacency detection uses point-on-segment math with 0.05 ft default tolerance.
- Override via options.exteriorWallThicknessFt / options.interiorWallThicknessFt / options.adjacencyToleranceFt — supports future tenant config (commercial trades may use different stud sizes).
- Smoke: 50/50 tests pass (34 existing + 16 new).
- Build: clean.
- Trade-aware: 2x4/2x6 is residential US framing convention. Commercial / international tenants will need override. Hooks in place via options.
- Open: phantom-closet problem (unscanned spaces appearing as malformed alcoves) — separate concern, not in this slice. Either Phase 5c editor's draw-missing-room or SCAN_QUALITY_ARC capture-time warnings.

[LOG — 2026-05-25 — FLOOR_PLAN_LAYOUT_ARC — pdf renderer wired to standardized wall thickness]
- Action: pdf.js now consumes wall classification from Phase 1's classifyAndStandardizeWalls output instead of the legacy O(n²) pairwise interior-wall heuristic.
- Change: Phase 1+2 pipeline block in buildFloorPlanPDF now also builds wallClassByRoomAndSeg lookup ({room_id: ['exterior'|'interior', ...]}) from normalized.data.walls. Passed to _renderFloorPage as new trailing param. isInteriorWall(room, si, seg) function uses the lookup; pairwise heuristic runs only as fallback when lookup is unavailable. allWallSegs + wall-drawing loop (poché thickness 3pt/6pt) both updated to call isInteriorWall. Debug log now reports 'classified' or 'pairwise-fallback'.
- Files: avenstone-vite/src/lib/pdf.js. Commit: c7e834b.
- Build: clean (379 modules).
- Decision: kept pairwise fallback in code so the renderer doesn't degrade if normalizeFloorPlan fails or is unavailable (malformed scan, future format change).
- Open: Phase 5 (editable scan drafts — floor_plans table + FloorPlanEditorScr + versions). See FLOOR_PLAN_LAYOUT_ARC.md for sequencing.

[LOG — 2026-05-25 — FLOOR_PLAN_LAYOUT_ARC Phase 5a shipped — persistence foundation]
- Action: Phase 5a shipped. Floor plans are now first-class persistent entities.
- Migration: 20260525200000_floor_plans.sql. Two tables: floor_plans (13 cols inc. contact_id TEXT matching contacts.id type, 4 RLS policies, 3 indexes, 1 updated_at trigger), floor_plan_versions (10 cols, 3 RLS policies, 2 indexes — including unique on plan+version). Status check: draft|sent|archived. Anchored check: must have job_id OR contact_id. Bucket 'floor-plans' (private, 3 storage policies, tenant-scoped path convention <tenant_id>/<plan_id>/v<N>.pdf).
- Helpers: sbCreateFloorPlan, sbLoadFloorPlan, sbLoadFloorPlansForJob, sbUpdateFloorPlanOverrides, sbRegenerateFloorPlanPdf, sbSendFloorPlanVersion, sbDeleteFloorPlan. All return {ok, error, data}. +270 lines in supabase.js.
- Fix during apply: contact_id declared UUID initially — failed FK (contacts.id is TEXT). Changed to TEXT before re-apply.
- Storage URLs are signed (7-day expiry). Renewal strategy deferred — short-lived clients refetch via sbLoadFloorPlan.
- Commits: 9e07592 (migration), a1fddde (helpers). Both pushed to main.

[LOG — 2026-05-25 — FLOOR_PLAN_LAYOUT_ARC Phase 5b shipped — AiIntakeWizard wired + FloorPlanTab surfaced]
- Action: Phase 5b shipped. Scan completion now creates a persistent floor_plans draft. FloorPlanTab shows saved plans.
- AiIntakeWizard change: sbCreateFloorPlan added to import. In saveInterior, after sbUploadDoc succeeds (inside existing try/catch), calls sbCreateFloorPlan({ jobId, contactId: null, name: `Floor Plan — ${date}`, rawScan: savedScan, pdfBlob: blob }). Non-fatal — failure swallowed by existing catch. Job-path only (saveInterior). Contact path (handleSave) has no PDF generation; skipped per spec.
- FloorPlanTab change: sbLoadFloorPlansForJob imported + plans/plansLoading state added. loadPlans() called on mount and on scanner close. "Saved Plans" section added above existing "Scan History" — each plan card shows name, status badge (draft=gray, sent=green), version, updated date, and Download link (current_pdf_url signed URL). Empty state message distinguishes from scan history.
- Commits: 4187b46 (AiIntakeWizard), 1bf24db (FloorPlanTab). Both pushed to main.
- Build: clean (379 modules).
- Trade-aware: floor_plans is platform table; tab is job-detail tab, trade-agnostic. ✓
- Open: Phase 5c-2 (persistence wiring — load → edit → save overrides). Signed URL renewal on 7-day expiry. Contact-path PDF generation (handleSave has no doc/blob today).

[LOG — 2026-05-25 — FLOOR_PLAN_LAYOUT_ARC Phase 5c-1 shipped — editor canvas foundation]
- Action: Phase 5c-1 shipped. Desktop floor plan editor canvas live.
- New files: avenstone-vite/src/components/floorPlan/FloorPlanCanvas.jsx (interactive SVG), avenstone-vite/src/components/floorPlan/FloorPlanEditorScr.jsx (top-level overlay screen).
- FloorPlanCanvas: renders Phase 1 normalized geometry + Phase 2 layout-hint labels as SVG. Pan (right-click drag), zoom (scroll wheel, cursor-locked). Click-to-select rooms/walls with shift-multi-select. Transparent 10px hit-area lines over wall strokes (narrow walls are otherwise unclickable). Zoom % badge. Refs used for zoom/pan to avoid stale closures in wheel event handler.
- FloorPlanEditorScr: fixed overlay (position:fixed inset:0 zIndex:2100) — overlay pattern, NOT a route. Matches AiIntakeWizard. Mobile guard <1024px shows "Desktop Required". Side panel shows selected room/wall names + future edit tools stub.
- Nav deviation from spec: spec said to add a `floorPlanEditor` page id in App.jsx. No `setPg` flows through JobsScr→JobDet→FloorPlanTab, so the overlay pattern is correct. Documented deviation.
- FloorPlanTab wiring: imports FloorPlanEditorScr, adds editingPlanId state, Edit button (btn-navy) on each saved plan row. Also wired FloorPlanTab into JobDet.jsx (was built in Phase 5b but never imported/rendered — TABS array didn't include it).
- Commits: 76b7da7 (canvas), 0e4656b (editor screen), 6950930 (wiring). Pushed to main. Build: 382 modules, clean.
- Trade-aware: pure UI, no trade assumptions. Color palette uses platform tokens.
- Open: Phase 5c-2 — save layout_overrides back to DB (sbUpdateFloorPlanOverrides). Phase 5c-3+ — add room, move wall, merge rooms, delete + undo.

[LOG — 2026-05-26 — FLOOR_PLAN_LAYOUT_ARC Phase 5c-3 shipped — Add Room edit move]
- Action: Phase 5c-3 shipped. First overrides-producing edit move. User clicks "+ Add Room" in side panel → places corners on canvas (0.5 ft grid snap) → closes polygon by clicking first corner (gold dot, 14px hit radius) or pressing Enter → naming modal opens with area-guessed default → confirms → room renders live and persists via Save & Regenerate.
- New override shape: overrides.added_rooms = [{id, name, polygon, type:'unknown', source:'manual'}]. applyOverrides.js extended to merge added_rooms into the derived scan AND synthesize wall segments from polygon edges (one wall per polygon edge, id pattern: `${room.id}-wall-${i}`) so they flow through Phase 1's classifyAndStandardizeWalls.
- Default name guess via shoelace area: <15 sqft = Closet, <35 = Bathroom, else Room.
- Canvas modes: 'select' (default) | 'add-room'. Cursor changes to crosshair. Room/wall click handlers suppressed during add-room. Background click handler (handleBackgroundClick) now handles both selection clearing and corner placement.
- toWorld(screenX, screenY) and snapToGrid(x, y, gridFt) helpers added to canvas.
- Keyboard: Esc cancels, Enter closes polygon when ≥3 corners.
- Live preview: gold dashed polyline between placed corners, faint closing-line preview from last to first corner when ≥3 corners, corner dots (first corner 7px gold, others 4px navy).
- Commits: abe105a (applyOverrides), 4495576 (canvas), abe2126 (editor). Pushed to main. Build: 383 modules, clean.
- Trade-aware: pure UI + geometry. Default-name heuristic is residential-flavored — extend per trade via future options.defaultNameByArea config.
- Open: Phase 5c-4 part 2 (snap-to-perpendicular, multi-endpoint group drag, undo-during-drag). Phase 5c-6 (undo stack, delete room, snap-to-existing-endpoint).

[LOG — 2026-05-26 — FLOOR_PLAN_LAYOUT_ARC Phase 5c-4 part 1 shipped — wall-move edit mode]
- Action: Phase 5c-4 part 1 shipped. User can drag wall endpoint dots to reshape rooms. Adjacent walls sharing the endpoint follow automatically (shared-endpoint following via endpointKey strategy).
- New override shape: overrides.wall_endpoint_overrides = { [endpointKey]: [newX, newY] }. endpointKey = `${Math.round(x*100)}:${Math.round(y*100)}` — stable identity for shared wall endpoints.
- applyOverrides.js extended: exports endpointKey helper. wall_endpoint_overrides processing applied BEFORE added_rooms processing — patches wall p1/p2 + room polygon vertices by matching key. All walls/vertices at the same key move together.
- FloorPlanCanvas additions: endpointKey import, endpointMap useMemo (key→{pos,walls[]}), draggingEndpointRef, handleEndpointMouseDown, extended handleMouseMove (live drag reporting), extended handleMouseUp (commit move), mode='wall-move' cursor, ghost-wall rendering (gold dashed overlay on affected walls during drag), endpoint dot rendering (navy circles, gold+7px when dragging), liveWallEndpointDrag/onWallEndpointDrag/onWallEndpointMove props.
- FloorPlanEditorScr additions: dragState={key,livePos}|null, mode='wall-move', polygonArea + ccw + segmentsIntersect + polygonSelfIntersects + validateWallMove helpers (invalid moves silently rejected — collapse <1sqft or self-intersect). handleWallEndpointDrag (updates dragState or clears on null=cancel), handleWallEndpointMove (validates then commits to pendingOverrides). "↔ Move Walls" toggle button in side panel. Esc exits wall-move mode. Header hint updated for wall-move mode.
- Commits: 9523e95 (applyOverrides), 54e8739 (canvas), 0e4101e (editor). Pushed to main. Build: clean.
- Trade-aware: pure geometry. No trade assumptions.
- Open: Phase 5c-4 part 2 (snap-to-perpendicular, multi-endpoint group drag, undo-during-drag). Phase 5c-5 (merge rooms). Phase 5c-6 (undo, delete room).

[LOG — 2026-05-26 — FLOOR_PLAN_LAYOUT_ARC Phase 5c-5 shipped — merge rooms]
- Action: Phase 5c-5 shipped. Shift-click 2+ adjacent rooms → live gold dashed union outline appears on canvas → side panel shows "Merge N Rooms" button → click → confirm modal with editable name → confirm → walls between merged rooms removed, merged room renders, persists via Save & Regenerate.
- New dep: polygon-clipping@0.15.7 (~14KB). Used for polygon union in initiateMerge and mergePreviewPolygon useMemo.
- New override shape: overrides.merged_rooms = [{id, name, polygon, source_room_ids, type}]. applyOverrides processes merged_rooms AFTER wall_endpoint_overrides (so merges reference final geometry). Source rooms removed, interior walls removed, merged room added, new boundary walls synthesized for any edges not already present.
- Interior wall detection: isWallOnRoomBoundary + isPointOnSegment helpers local to applyOverrides. Wall removed only if it touches at least one source room AND no non-source room — preserves exterior walls.
- Live merge preview: mergePreviewPolygon useMemo in editor runs runPolygonUnion every time selection.roomIds changes while in select mode. Non-adjacent rooms (union returns MultiPolygon) silently return null → no preview, Merge button still shows but initiateMerge will surface the error.
- Non-adjacent rooms: initiateMerge checks result.length > 1 and sets saveError with actionable message "Selected rooms are not all connected."
- Commits: f4e1f9c (dep + applyOverrides), 87f1c8f (canvas), d3c6d79 (editor). Build: clean.
- Kalin's basement scenario now fully covered: move wall (5c-4), add closet (5c-3), merge bathroom+closet (5c-5), add laundry (5c-3).
- Trade-aware: pure geometry. No trade assumptions.
- Open: Phase 5c-6 (undo stack, delete room, snap-to-existing-endpoint). Phase 5c-4 part 2 (polish — deferred).

[LOG — 2026-05-25 — FLOOR_PLAN_LAYOUT_ARC Phase 5c-2 shipped — editor persistence pipeline]
- Action: Phase 5c-2 shipped. Editor now holds pendingOverrides + isDirty state, supports two save modes, applies overrides to canvas in real time.
- New file: avenstone-vite/src/lib/floorPlan/applyOverrides.js — single export applyOverridesToScan(rawScan, overrides). Deep-clones rawScan, applies room-level overrides (currently name only). Shared by canvas live preview and PDF regeneration path so they can never diverge.
- FloorPlanEditorScr rewrite: pendingOverrides state (loaded from plan.layout_overrides on mount), isDirty flag, saving/saveError state. Two save actions: "Save" (sbUpdateFloorPlanOverrides only, no PDF rebuild), "Save & Regenerate PDF" (saves overrides → buildFloorPlanPDF with applyOverridesToScan applied → sbRegenerateFloorPlanPdf → reloads plan). Versions list in side panel (most recent 5, current highlighted in gold). Header shows "Unsaved changes" / "Saved · vN" status.
- FloorPlanCanvas update: added effectiveScan = applyOverridesToScan(rawScan, layoutOverrides) via useMemo — normalization and rendering use the merged scan, not rawScan. fittedScanRef added to prevent fit-to-content reset on every override change (only re-fits when rawScan reference changes — i.e. new plan load).
- Commits: 3774c8d (applyOverrides.js), bc74ca3 (FloorPlanEditorScr), 3cc5fc8 (FloorPlanCanvas). All pushed to main.
- Build: ✓ 383 modules, clean.
- Trade-aware: geometry + PDF path, no trade assumptions. override schema is keyed by room_id — future 5c-3+ moves add more fields per the FLOOR_PLAN_LAYOUT_ARC.md spec.

[LOG — 2026-05-26 — Scanner extracted to own job tab + missing save path fixed]
- Action: Scanner extracted from ConsultationTab into its own first-class job tab (renamed 'Floor Plans' → 'Scanner', id 'floorplan' → 'scanner'). FloorPlanTab already had everything: saved plans list at top with Edit + Open PDF buttons, + New Scan (AiIntakeWizard), editor overlay (FloorPlanEditorScr). No new component needed.
- Bug fix: Kalin's 2026-05-26 scan didn't persist to floor_plans because sbCreateFloorPlan was inside the same try/catch as buildFloorPlanPDF in AiIntakeWizard.jsx. Any PDF rendering failure silently skipped the floor_plans record. Fixed: PDF generation is now best-effort (its own try/catch), sbCreateFloorPlan always fires after scan saves regardless of PDF outcome.
- ConsultationTab: scanner trigger removed (scan list, New Scan button, AiIntakeWizard embed, handleExportPDF, loadScans, related state + imports). Replaced with a one-line note pointing to the Scanner tab. Net: -125 lines from ConsultationTab.
- FloorPlanTab: kept as-is (it IS the scanner tab, fully wired). No separate ScannerTab needed.
- Files: AiIntakeWizard.jsx (bug fix), JobDet.jsx (tab rename), ConsultationTab.jsx (strip scanner section).
- Commits: 1550e6b (fix save path), 9a97954 (rename tab), ff444d8 (strip ConsultationTab). Pushed to main.
- Build: ✓ 384 modules, clean.
- Trade-aware: pure UI restructure + bug fix.
- Open: Phase 5e (versions panel + send to client) closes the workflow loop after scan + edit.
- Open: Phase 5c-3 — first real edit move (e.g. rename room, toggle SF label). Phase 5c-6+ — add/move/delete room tools.

[LOG — 2026-05-26 — Phase 5c-7 shipped — freestanding text annotations + custom room names]
- Action: Phase 5c-7 shipped. Two improvements: (1) custom room name discoverability in LidarScanner NamingPhase, (2) freestanding text annotations fully wired in floor plan editor.
- LidarScanner.jsx: placeholder updated to "e.g. Master Suite, Game Room, Future Office" — the free-text input already existed; this surfaced it alongside the preset buttons.
- applyOverrides.js: text_annotations passthrough added. Array copied from overrides.text_annotations into cloned scan so annotations survive the override merge step. JSDoc updated with TextAnnotation shape.
- FloorPlanCanvas.jsx: add-text mode click → onTextAnnotationsChange({kind:'create',...}). Annotations rendered as SVG text with gold selection highlight (dashed rect). handleAnnotationMouseDown: window-level drag, commits move on mouseup. handleAnnotationDoubleClick: fires edit_request. annotationIds added to selection shape + all clear-selection calls.
- FloorPlanEditorScr.jsx: editingAnnotation state + 4 handlers (handleTextAnnotationChange, commitAnnotationText, cancelAnnotationEdit, deleteAnnotation). "T Add Text Label" toolbar button (gold when active). Keyboard Esc exits add-text. Edit modal: autoFocus input, Enter/Esc, Save/Cancel/Delete buttons, matches naming modal pattern. Annotation selection section in side panel with inline Edit button. annotationIds in all setSelection calls.
- Override schema now: {[room_id]:{name?}, added_rooms?, wall_endpoint_overrides?, merged_rooms?, text_annotations?}
- Files: LidarScanner.jsx, applyOverrides.js, FloorPlanCanvas.jsx, FloorPlanEditorScr.jsx.
- Commits: b027b77 (scanner placeholder), 6a8e9d5 (applyOverrides), 76c1ac3 (canvas), 07c4fd7 (editor). Pushed to main.
- Build: ✓ 384 modules, clean.
- Note: pdf.js NOT touched (spec conflict — "Do NOT touch" takes precedence over Part 5 PDF rendering). PDF annotation rendering deferred.
- Open: Phase 5c-6 (undo stack, delete room). Phase 5c-7 Part 5 (pdf.js annotation rendering — deferred). Phase 5e (versions panel + send to client).

[LOG — 2026-05-26 — FLOOR_PLAN_LAYOUT_ARC Phase 5c-8 shipped — editor usability pass]
- Action: Four fixes: (1) Add Room click handler, (2) Rename Room input, (3) Show SF toggle, (4) Shift-constrain + endpoint snap on wall move.
- Add Room bug: root cause = missing e.stopPropagation() in handleRoomClick's add-room forwarding branch. Click bubbled to SVG onClick, causing double-fire. Added stopPropagation. Extended to add-text mode. Fixed onSelectionChange in normal room click path to include annotationIds.
- Rename: renameInputValue state (null=display, string=editing). Single-room side panel shows text input. Enter/blur commits to pendingOverrides[id].name. Esc cancels. useEffect resets on selection change.
- SF toggle: applyOverrides passes sf_visible through. Canvas gates separate SF text via effectiveScan lookup. getSfVisible/toggleSfVisible helpers. Checkbox in single-room panel. pdf.js NOT touched per constraint — toggle is canvas-only; PDF always shows SF.
- Shift-constrain: handleEndpointMouseDown stores connectedDirs. applyDragConstraints helper: Shift projects cursor onto longest connected wall axis, then snaps to any endpoint within 0.5 ft. Green dashed ring indicator on snap.
- Files: FloorPlanCanvas.jsx, FloorPlanEditorScr.jsx, applyOverrides.js.
- Commits: 89c9920 (canvas), b4ff93d (editor), 60866cb (applyOverrides). Pushed to main.
- Build: ✓ 384 modules, clean.
- Console.log diagnostics left in (add-room click path). Strip in 5c-9 cleanup.
- Limitation: sf_visible toggle affects canvas only — pdf.js gate deferred.
- Open: Phase 5c-9 — type-to-build walls. Strip console.logs in same slice. Phase 5e — versions + send.

[LOG — 2026-05-26 — FLOOR_PLAN_LAYOUT_ARC Phase 5c-8 patch + Phase 5c-9 shipped]
- Action: (1) sf_visible wired into pdf.js — SF toggle now affects regenerated PDFs. (2) Type-to-build wall mode fully shipped.
- sf_visible patch: pdf.js line 1337 — showSf gating changed to `room.sf_visible !== false && (hint ? (!hint.sf_inline_with_label && !!sfTxt) : sqft > 0)`. One-line patch, closes the canvas-only limitation from 5c-8.
- Phase 5c-9 — 3 new files/changes:
  - parseFootInches.js (new): parses construction-style length strings → decimal feet. Handles "10'6", "10 6", "10.5", "6\"", "6in", pure numbers.
  - FloorPlanCanvas.jsx: build-walls mode — handleBackgroundClick sets first anchor, onBuildAnchorPlaced prop wired. Preview rendering: accumulated polyline in gold, dashed close-back line (≥3 walls), first anchor larger dot, dashed ring on current anchor.
  - FloorPlanEditorScr.jsx: buildState/lengthInput state. handleBuildAnchorPlaced, confirmLengthInput, cancelLengthInput, commitBuiltPolygon handlers. BUILD_DIRS = {N:[0,-1], S:[0,1], E:[1,0], W:[-1,0]}. Direction picker modal (N/S/E/W grid), monospace length input, arrow-key direction change, auto-close detection when endpoint within 0.5ft of firstAnchor. commitBuiltPolygon calls setPendingNewRoom → reuses existing confirmAddRoom path. "📐 Build Walls" button in toolbar. Header hint text for build-walls mode. Keyboard Esc exits build-walls. Overlay is transparent (zIndex:2300) so canvas stays visible.
- Files: avenstone-vite/src/lib/pdf.js (patch), avenstone-vite/src/lib/floorPlan/parseFootInches.js (new), avenstone-vite/src/components/floorPlan/FloorPlanCanvas.jsx, avenstone-vite/src/components/floorPlan/FloorPlanEditorScr.jsx.
- Commits: sf_visible pdf.js patch (prior session), 6b410a5 (parseFootInches), 150e9a0 (canvas build-walls), 7aaeabe (editor build-walls). Pushed to main.
- Build: ✓ 385 modules, clean.
- Trade-aware: pure geometry/editor tooling, no trade assumptions.
- Open: Phase 5c-6 (undo stack, delete room). Phase 5c-7 Part 5 (pdf.js annotation rendering — deferred). Phase 5e (versions + send to client). Strip add-room console.logs.

[LOG — 2026-05-26 — FLOOR_PLAN_LAYOUT_ARC Phase 5c-10 shipped — editor nav polish]
- Action: Zoom buttons (+/−/fit) in top-right overlay with live % readout. Keyboard shortcuts: + / − zoom, F fit, arrow keys pan. Space+drag = pan (Figma/Sketch convention). Right-drag and middle-drag pan preserved. Hover ? button shows keyboard hint card.
- fitToContent() and zoomBy() extracted from inline useEffect into reusable functions (both write to refs + call forceUpdate directly, matching existing pattern).
- input/textarea guard prevents shortcuts from hijacking text fields — arrow keys in Build Walls modal length input go to direction picker, not canvas pan.
- SVG zoom badge removed; canvas wrapped in position:relative div to host HTML overlay.
- Files: avenstone-vite/src/components/floorPlan/FloorPlanCanvas.jsx (+138/-8). Commit: d4140e3.
- Build: ✓ 385 modules, clean.
- Trade-aware: pure UI. No trade assumptions.
- Open: Phase 5c-6 (delete + undo), Phase 5c-4 part 2 (wall move snap polish), Phase 5e (versions + send). Strip add-room console.logs.

[LOG — 2026-05-26 — FLOOR_PLAN_LAYOUT_ARC Phase 5c-6 shipped — delete + undo stack]
- Action: Phase 5c-6 shipped. Editor now has full delete + undo/redo.
- Undo stack: history { past, present, future } replaces bare pendingOverrides state. pendingOverrides is now derived as history.present — zero consumer changes needed. MAX_HISTORY 50. New edits clear future. Save clears entire history (both handleSaveOnly and handleSaveAndRegenerate). Plan load resets history.
- Keyboard: Cmd-Z / Ctrl-Z = undo. Cmd-Shift-Z / Ctrl-Y = redo. Delete / Backspace = delete selected. Input tag guard (tagName=input/textarea) prevents all shortcuts from colliding with text editing. Modal guard (pendingNewRoom || pendingMerge || editingAnnotation || !!lengthInput) prevents undo/redo/delete while modals are open.
- Delete: 4 cases unified. Added room → filter from overrides.added_rooms. Merged room → filter from overrides.merged_rooms (source rooms reappear; effectively unmerge). Text annotation → filter from overrides.text_annotations. Scanner-produced room → push to overrides.deleted_room_ids.
- New override shape: overrides.deleted_room_ids = [room_id, ...]. applyOverrides filters these FIRST so subsequent wall/merge/patch overrides operate on surviving set only. Also drops walls whose room_id matches a deleted room.
- Delete via: Delete/Backspace key OR side panel red "🗑 Delete N items" button. Both use window.confirm before destroying.
- Header: ↶ Undo + ↷ Redo buttons (disabled when stack is empty). Small "N undos available" badge.
- Trade-aware: pure UI + override layer. No trade assumptions.
- Files: applyOverrides.js (+14/-1), FloorPlanEditorScr.jsx (+180/-10).
- Commits: eb27bba (applyOverrides), 14d4f1d (FloorPlanEditorScr — undo + delete combined since inseparable in one file). Pushed to main.
- Build: ✓ 385 modules, clean.
- Deviation: spec requested 3 commits; undo stack and delete action landed in one JSX commit (14d4f1d) since they share updateOverrides and are in the same file.
- Open: Phase 5d (drag-to-reposition labels). Phase 5c-4 part 2 (wall move snap polish). Phase 5e (versions + send). Strip add-room console.logs.

[LOG — 2026-05-26 — FLOOR_PLAN_LAYOUT_ARC Phase 5d shipped — drag-to-reposition room labels]
- Action: Room labels in the floor plan canvas are now draggable in select mode. Drag snaps to 0.5ft grid. Override position stored as label_x/label_y in per-room overrides. Right-click label resets to auto-position. Gold indicator dot appears when override is active. SF badge follows label override at same offset from hint. Side panel shows "Reset label to auto-position" button when single selected room has label_x override.
- Files: avenstone-vite/src/lib/floorPlan/applyOverrides.js (+2 lines per-room loop), avenstone-vite/src/components/floorPlan/FloorPlanCanvas.jsx (+labelDragState, +onLabelMove prop, +handleLabelMouseDown, labels block rewritten), avenstone-vite/src/components/floorPlan/FloorPlanEditorScr.jsx (+handleLabelMove, +onLabelMove prop, +reset button in side panel).
- Decision: `moved` flag in drag closure prevents spurious override writes when user just clicks (no movement) a label. SF badge tracks as `(hint.sf_x - hint.label_x, hint.sf_y - hint.label_y)` offset from effective label position so it follows correctly regardless of override.
- Commits: 0910fd5 (applyOverrides label_x/label_y), 3a1de68 (canvas drag), 2a3dce5 (editor handler + reset button). Pushed to main bcda09c..2a3dce5.
- Open: Phase 5c-4 part 2 (wall move snap polish). Phase 5e (versions + send). Strip add-room console.logs.

[LOG — 2026-05-26 — FLOOR_PLAN_LAYOUT_ARC Phase 5c-4 part 2 shipped — wall move snap polish]
- Action: Extended wall-move drag handler with 4 polish features.
  (1) Snap-to-wall-midpoint: dragging near another wall's midpoint snaps to it. Green diamond indicator. Skips walls connected to the dragged endpoint.
  (2) Snap-to-axis-alignment: cursor near original endpoint's horizontal/vertical axis (< 0.5 ft deviation, > 1 ft perpendicular movement) locks to that axis. Gold dashed guide line spans full canvas width/height.
  (3) Alt+Shift perpendicular lock: applyDragConstraints accepts altKey param. Shift=parallel to wall, Alt+Shift=perpendicular (rotate constraint dir 90°).
  (4) Live angle indicator badge: floats near cursor. Shows live wall length in ft/in + angle in degrees. Background turns green at ±0.5° of orthogonal (horizontal/vertical).
- Snap precedence: endpoint (green ring) > midpoint (green diamond) > axis-alignment (gold dashed guide). Each has its own visual indicator computed at render time.
- All-canvas: zero changes to editor, applyOverrides, normalize, or pdf renderer. New snaps slot into applyDragConstraints priority chain.
- All indicators computed at render time from liveWallEndpointDrag.newPos + draggingEndpointRef.current.startPos. No new state refs needed.
- File: FloorPlanCanvas.jsx (+191/-26). Commit: 6ad2a1f. Pushed to main.
- Build: ✓ 385 modules, clean.
- Trade-aware: pure geometry.
- Deviation: Part 6 (hint text update in FloorPlanEditorScr) skipped — spec explicitly excludes FloorPlanEditorScr from this slice.
- Open: Phase 5e (versions + send to client). Capture-time scan-quality warnings. Editor is now feature-complete for v1.

[LOG — 2026-05-26 — FLOOR_PLAN_LAYOUT_ARC Phase 5e shipped — versions panel + send to client]
- Action: Phase 5e shipped. Closes the floor-plan workflow loop. Every saved version in the editor side panel now has Open + Send buttons. Send opens a recipient picker modal: job client checkbox (loaded via direct sb query on job_id), previously-sent email pills (from all versions' sent_to arrays), free-text email input (comma-separated), optional custom message. Recipients deduped before send.
- Email send: new edge function `send-floor-plan-email` (Resend-based, link-only, no attachment). Takes {to, plan_name, version_number, pdf_url, custom_message?}. Template matches Avenstone brand (navy/gold). Falls back to ANON_KEY if auth session unavailable.
- Record send: sbSendFloorPlanVersion called after email succeeds — merges recipients into version.sent_to, stamps sent_at, flips plan status draft→sent. If email succeeds but record fails, surfaces inline error; no silent partial commits.
- Version row shows green "Sent {date} · N recipient(s)" annotation after send. Plan reloads to reflect updated state.
- Deviation: NOTIFY_EMAIL_URL is a profile-lookup path for app users only — can't send to arbitrary external emails. Created send-floor-plan-email edge fn instead. URL constructed inline as `${SUPABASE_URL}/functions/v1/send-floor-plan-email` (no supabase.js change needed).
- Files: supabase/functions/send-floor-plan-email/index.ts (new), avenstone-vite/src/components/floorPlan/FloorPlanEditorScr.jsx (+308/-23).
- Commits: 171f219 (edge fn), 90868a6 (editor). Pushed to main f2e269d..90868a6.
- Open: Capture-time scan-quality warnings. Strip add-room console.logs (noted in 5c-8). Editor feature-complete for v1.

[LOG — 2026-05-26 — Home screen weather widget shipped]
- Action: Added current weather + 7-day forecast card to HomeScr. Uses Open-Meteo free API (no key, no rate limits). Hardcoded Kansas City coords (39.0997, -94.5786) for Avenstone HQ.
- New module: avenstone-vite/src/lib/weather.js. Exports fetchWeather, weatherLabel, weatherIcon, formatDayLabel. 30-min in-memory cache prevents hammering on re-renders.
- Card renders above Active Projects, inside the existing padding div. Navy gradient background. Current temp + condition + "Kansas City" label; 7-day strip below with Today highlighted gold. Rain % shown when ≥30%.
- Failure mode: inline red error message, rest of HomeScr unaffected.
- Files: avenstone-vite/src/lib/weather.js (new), avenstone-vite/src/components/home/HomeScr.jsx (+61 lines). Commit: 7c3583c.
- Trade-aware: weather is per-location, hardcoded to KC for v1. Future: per-job weather for outdoor-work scheduling.
- Open: per-job-location weather for scheduling intelligence. Browser geolocation fallback. Hourly forecast.

[LOG — 2026-05-26 — SCHEDULING_ARC slice 1/8 shipped — schema foundation]
- Action: Slice 1 of 8 SCHEDULING_INTELLIGENCE_ARC shipped. Schema foundation for dependency graph, phase linkage, actual finish tracking, and sub capacity modeling.
- Migration: supabase/migrations/20260526100000_scheduling_arc_phase_1.sql. Applied + verified (16/16 checks PASS). All columns nullable/defaulted — backward compatible.
- schedule_items new columns: duration_days INT DEFAULT 1, predecessor_ids UUID[] DEFAULT ARRAY[]::UUID[], lag_days INT DEFAULT 0, is_milestone BOOL DEFAULT false, actual_finish_date DATE, phase_id UUID FK→job_phases ON DELETE SET NULL.
- contacts new column: daily_capacity_hours NUMERIC(4,2) DEFAULT 8.0.
- New table: schedule_change_log (immutable audit trail). 11 columns, RLS enabled (SELECT+INSERT), 6 indexes (GIN on predecessor_ids + 5 B-tree).
- Helpers added to supabase.js after sbRespondToScheduleInvite: sbSetScheduleItemDependencies (BFS cycle detection), sbMarkScheduleItemFinished, sbUpdateScheduleItemPhase, sbUpdateContactCapacity.
- Arc doc corrections (affects slice 8 only): trade_material_lead_times.trade is TEXT not .trade_id UUID; materials table does not exist — actual table is material_orders.
- ClientPortal note (slice 2): ClientScheduleView reads schedule_phases (legacy), not schedule_items. Needs reconciliation in slice 2.
- Files: supabase/migrations/20260526100000_scheduling_arc_phase_1.sql (new), avenstone-vite/src/lib/supabase.js (+89 lines). Commits: 0f8e4d6 (migration), d436fd5 (helpers). Pushed to main.
- Build: ✓ clean.
- Open: Slice 6 (cascade engine) — shipped. Slice 7 (resource conflict detection), Slice 8 (lead-time enforcement).

[LOG — 2026-05-26 — SCHEDULING_ARC slice 6/8 shipped — cascade engine]
- Action: Slice 6/8 shipped. sbCascadeScheduleChange(sourceItemId, reason) BFS-walks downstream items via predecessor_ids GIN index. Computes earliest_start = max(predecessor_finish + lag_days + 1) across all predecessors. Pushes scheduled_date forward only when item is currently scheduled BEFORE that earliest. Recurses to depth 20 safety cap (returns error beyond cap rather than infinite loop).
- Hooked into sbMarkScheduleItemFinished — every finish triggers cascade; returns { ok, cascade, cascade_error }.
- Hooked into sbUpdateScheduleItem — cascade fires (fire-and-forget) when scheduled_date or scheduled_end_date changed.
- Audit trail: every cascade write logs 'cascade_applied' to schedule_change_log with old_value, new_value, cascade_source_id, reason. cascade_applied already in constraint from slice 1 — no migration needed.
- Notification enrichment: cascade calls sbNotifyUser per affected item with enriched body "ItemTitle moved from Jun 8 to Jun 12 (cascade from upstream task)." Push fanout reads notification.body directly — no fanout code change required. Added comment in notification-push-fanout/index.ts documenting design decision.
- Multi-predecessor: if item has 2+ predecessors, earliest_start = MAX across all (PERT/CPM style). Correctly handles diverging predecessor finish times.
- Per-item failure handling: update errors captured in affected_items array, cascade continues on remaining items. Caller receives full affected_items list including any failures.
- ISO helpers: _addDaysISO and _daysBetweenISO as module-private functions (UTC-safe, no DST drift).
- Files: avenstone-vite/src/lib/supabase.js (+200/-1), supabase/functions/notification-push-fanout/index.ts (+4/-1 comment only).
- Commits: b4a6e8a (cascade engine), d1d1f71 (hooks), b72fe3b (notif comment). Pushed to main.
- Build: ✓ clean.
- Trade-aware: pure date math + DB writes. No trade assumptions. ✓
- Open: Slice 7 (resource conflict detection — sub double-booking). Slice 8 (lead-time enforcement with override).

[LOG — 2026-05-26 — SCHEDULING_ARC slice 7/8 shipped — resource conflict detection]
- Action: Slice 7/8 shipped. sbCheckResourceConflicts(opts) added to supabase.js. Surfaces sub double-booking in ScheduleTab ScheduleItemModal and invitee double-booking in CalScr EventModal as amber soft-warning banners with "Save anyway" override — saves are never hard-blocked.
- Two independent check paths (different ID systems):
  1. assigned_sub_id (TEXT contact ID) — PostgREST date-overlap query on schedule_items. Null-end-date handled via .or('scheduled_end_date.gte.DATE,and(scheduled_end_date.is.null,scheduled_date.gte.DATE)'). Sub name resolved from contacts.name (maybeSingle, best-effort).
  2. invitee_user_id (UUID profile ID) — fetches schedule_item_invitees with joined schedule_items + profiles; JS-side date overlap filter (small result set).
- contacts.primary_user_id does NOT exist — spec approach adapted. Sub detection uses assigned_sub_id directly on schedule_items, no user resolution needed.
- Non-fatal: any query error returns ok=true empty conflicts + console.warn. Never blocks a save on network failure.
- CalScr: invitee check only (no assigned_sub_id in form); runs on edit with invitees; excludes current item.
- ScheduleTab: sub check only (no invitees in form); runs on any save where assigned_sub_id is set; excludes current item on edit.
- Override: conflictOverride state prevents repeated conflict checks if user clicks Save anyway.
- Files: avenstone-vite/src/lib/supabase.js (+95 lines), avenstone-vite/src/components/dashboard/CalScr.jsx, avenstone-vite/src/components/jobs/tabs/ScheduleTab.jsx.
- Commits: 525e3ed (helper), a53e98f (UI). Pushed to main.
- Build: ✓ 386 modules, clean.
- Open: Slice 8 (lead-time enforcement with override).

[LOG — 2026-05-26 — UNIFIED_FILES_ARC blueprint shipped]
- Action: Wrote UNIFIED_FILES_ARC.md at repo root. 502 lines. Foundation arc sequenced BEFORE PROOF_ARC.
- Audit findings: documents table is job_documents (not 'documents'); sbPhoto writes to public job-photos bucket + photos table; 13+ upload surfaces scattered across tabs; log_receipt verb writes job_transactions + uploads to job-receipts bucket with no job_files row today; floor_plans stays separate (virtual job_files rows link it).
- 17 locked decisions. Key ones: one job_files table replaces job_documents + absorbs photos; folders derived (not stored) from category+subcategory columns; dynamic folder appearance (first file = folder appears, last leaves = folder disappears); AI auto-categorization Haiku vision on photos ~$0.001/upload, rule-based on docs; per-tenant subcategory config; receipts folder flat + accepts PDF not just images; lifecycle_status column included for future Google Drive arc (no archive code built); PhotosTab (FieldTab) deleted in Phase 3.
- PROOF_ARC dependency: PROOF_ARC Phase 1 schema is free (category column already in job_files). PROOF_ARC first slice prompt should skip file-table schema and note the dependency.
- 5 phases, ~12 prompts. Phase 1 = schema + migration (next dispatch when Kalin's ready).
- Future architecture sketches: walkthrough intake arc (client selections in Selections folders), Google Drive archive arc (lifecycle flip), todos-per-job pattern analysis.
- Trade-neutral: subcategory list is config per tenant, not code. GC vs painter vs roofer = different seed rows, same table.
- Files: UNIFIED_FILES_ARC.md (new, 502 lines). Commit: f77dc34. Pushed to main.

[LOG — 2026-05-26 — UNIFIED_FILES_ARC slice 1/12 shipped — schema foundation + private bucket]
- Action: Slice 1/12 shipped. Foundation layer for unified file management is live.
- New tables: job_files (25 cols, 5 partial indexes, 4 RLS policies, updated_at trigger). tenant_file_subcategories (7 cols, UNIQUE constraint, 2 RLS policies).
- New private storage bucket: job-files (public=false). Path convention: <tenant_id>/<job_id>/<file_id>.<ext>. 4 tenant-scoped RLS policies on storage.objects.
- Backfill: photos (14 rows) → job_files with storage_bucket='job-photos', category='Photos', subcategory inferred from label column. job_documents (39 rows) → job_files with storage_bucket='job-documents', category/subcategory derived from file_type. Both source tables UNTOUCHED. Counts verified: 14/14 and 39/39.
- 16 Avenstone GC Photos subcategories seeded into tenant_file_subcategories.
- New helpers: sbUploadJobFile (writes to job-files bucket + job_files row, calls inferFileCategory via dynamic import if no category), sbLoadJobFiles (category/subcategory filter, tenant-scoped), sbSignJobFileUrl (works across all 3 buckets), sbCategorizeJobFile, sbDeleteJobFile.
- New module: avenstone-vite/src/lib/jobFiles/inferFileCategory.js — rule-based + phase-based categorizer. queryFn param injected by sbUploadJobFile to avoid circular import. Vision-Haiku AI deferred to Phase 2.
- Audit deviations from spec: photos.uploaded_by_id doesn't exist (NULL in migration); job_documents.storage_path doesn't exist (file_url used); job_documents.uploaded_by not uploaded_by_id; job_documents has no mime_type/size_bytes; BOTH job-photos AND job-documents buckets are public (not just job-photos — second security finding).
- CRITICAL DEFERRED: job-photos AND job-documents buckets still public. Flip deferred to Phase 3 when consumers are rewired to signed URLs. Documented as security debt.
- Old helpers (sbPhoto, sbUploadDoc, sbLoadDocs) untouched for backward compat.
- Build: ✓ 386 modules, clean.
- Commits: 00f558e (migration), 0f01f6a (inferFileCategory), 6aade72 (helpers). Pushed to main.
- Open: Phase 2 (Unified Files tab UI). Phase 3 (rewire consumers + flip bucket privacy).

[LOG — 2026-05-26 — SCHEDULING_ARC slice 4/8 shipped — sub accept/decline/tentative response buttons + status badges]
- Action: Slices 3 and 4 of 8 shipped together. Per-item invite state loaded in SubJobView schedule tab; subs can accept, decline, or mark tentative directly from the schedule list.
- Slice 3 (commit 9340849): Added invite load useEffect to SubJobView.jsx. Loads schedule_item_invitees for every schedItems entry via Promise.all; extracts current sub's invite row by AV_USER_ID. Result stored as inviteByItemId map. Cancelled flag prevents stale state after unmount.
- Slice 4 (commit b21ffda): Added per-item conditional UI blocks in schedItems.map(). Three states: invited/tentative shows Accept + Tentative + Decline buttons (gold box); accepted shows green badge + "Can't make it" (decline shortcut); declined shows red badge + "Reconsider" (accept shortcut). All transitions use sbRespondToScheduleInvite + optimistic state update (no refetch). respondingId tracks in-flight requests to disable buttons.
- Helpers used: sbLoadScheduleInvitees, sbRespondToScheduleInvite (both pre-existing from CALENDAR_ARC Phase 1, dead-code until now). AV_USER_ID used directly — no sb.auth.getUser() call needed.
- SubPortal optional badge: skipped — SubPortal has no per-item schedule state; fan-out would require full schedule load, not a 1-liner per spec. Spec rule honored.
- Files: avenstone-vite/src/components/sub/SubJobView.jsx.
- Build: ✓ 386 modules, clean.
- Trade-aware: platform UI, tenant-agnostic. schedule_item_invitees is tenant-scoped via RLS. ✓
- Open: Slice 2 (cascade engine), Slice 5 (duration/dependency UI in ScheduleTab), Slices 6–8 (critical path, conflict detection, recommendations).

[LOG — 2026-05-26 — SCHEDULING_ARC slice 2/8 shipped — client view unified to schedule_items]
- Action: Slice 2/8 shipped. ClientScheduleView now reads from schedule_items WHERE is_milestone=true instead of job_phases. Realtime subscription switched accordingly.
- Helper: sbLoadClientMilestones(jobId). Returns ordered milestones with computed_status (completed/completed_late/in_progress/upcoming/unscheduled) and 5-day buffered client-facing status.
- Client-facing buffer: slips ≤5 days display as "In Progress" not "Delayed." Internal PM view (CalScr) shows raw scheduled_date so PM tools remain accurate.
- schedule_phases table preserved. job_phases still used for overview tab (phases hero card, "What's Happening Next", "What to Expect"). They are no longer connected to ClientScheduleView.
- schedule_items added to supabase_realtime publication (verified via pg_publication_tables).
- Bonus fix: parent's realtime channel was watching schedule_phases (not in publication, dead subscription). Fixed to watch job_phases (what sbLoadPhases actually reads), renamed to client-phases-${job.id} (unique per job to prevent channel collision).
- Existing schedule_items rows have is_milestone=false (default from slice 1). PMs need to flag items as milestones for client view to show anything. Can toggle directly in DB for testing until slice 5 wires the toggle in CalScr UI.
- Files: supabase/migrations/20260526110000_scheduling_arc_realtime_schedule_items.sql (new), avenstone-vite/src/lib/supabase.js (+31), avenstone-vite/src/components/client/ClientPortal.jsx (+76/-18). Commits: 7e80ff2, 72d354f, c68da62. Pushed to main.
- Open: slice 3 (phase progress tracker — read phase % done from schedule_items.phase_id rollup). Slice 5 (is_milestone toggle in CalScr UI).

[LOG — 2026-05-26 — SCHEDULING_ARC slice 3/8 shipped — phase progress tracker upgrade]
- Action: Slice 3/8 shipped. Phase progress now computes from schedule_items.phase_id rollup.
- Helper: sbLoadJobPhaseProgress(jobId). Returns per-phase: total_items, completed_items, pct_complete (0-100), status (not_started/in_progress/completed/delayed), earliest_scheduled_date, latest_scheduled_end_date, actual_start_date, actual_finish_date, is_on_schedule. Uses job_phases.start_date/end_date (actual schema — spec assumed planned_start_date/planned_end_date which don't exist).
- derivePhaseStatus: NOT wrapped or replaced. It's a DB-write side effect (updates job_phases.status from sub_start items via trade_phase_map). Untouched. ScheduleTab reads the written values via sbLoadPhases.
- UI: ScheduleTab phase pills now show mini progress bar (gold/red) + X/Y item count computed via useMemo from already-loaded phases+items state. Zero extra DB query. Delay detection: latest_scheduled_end_date > job_phases.end_date.
- SQL view: skipped. JS computation is fast enough for v1 and avoids a migration.
- Until slice 5 wires phase_id picker in CalScr, progress shows 0/0 for all phases (no items linked). PMs can link via DB: UPDATE schedule_items SET phase_id='...' WHERE id='...'.
- Files: avenstone-vite/src/lib/supabase.js (+56), avenstone-vite/src/components/jobs/tabs/ScheduleTab.jsx (+33/-4). Commits: d3ed57e, 5196bd2. Pushed to main.
- Open: Slice 5 (phase_id picker in CalScr + is_milestone toggle). Slice 6 (cascade engine).

[LOG — 2026-05-26 — SCHEDULING_ARC slice 5/8 shipped — Master Agent create_schedule_item verb]
- Action: Slice 5/8 shipped. Master Agent can now create schedule items conversationally. Input: job_id, title, type, scheduled_date (required) + optional duration, trade, sub_search, phase_search, is_milestone, notes.
- In CONFIRM_TOOLS (required per CLAUDE.md). Confirm card shows title, date, trade, sub, phase, milestone flag.
- Fuzzy resolution: sub_search matches profiles WHERE role='sub' on full_name (substring, first-name aware). Phase_search matches job_phases.phase_name (substring). On miss, item still created and agent surfaces "couldn't match" note.
- Invitee: when sub_search resolves, inserts schedule_item_invitees row (status='invited', invited_by=userId). Column is invited_by not invited_by_id (actual schema).
- Audit: every creation writes 'created' row to schedule_change_log with reason "Master Agent create_schedule_item".
- System prompt: added SCHEDULING section + updated WHAT YOU CAN DO + confirm-gated tools list.
- Deviations from spec: contacts table has no primary_user_id/company_name/contact_type — spec assumed these exist but don't. Subs are profiles with role='sub'. schedule_item type enum = DB constraint: material_delivery, sub_start, site_visit, inspection, milestone, delay (not sub_finish/delivery/meeting/other from spec).
- Deploy: GitHub Actions auto-deploys on push to supabase/functions/**.
- Trade-aware: type field is enum, trade is free-text passthrough.
- Open: Slice 6 (cascade engine — BFS date push when predecessor's scheduled_date changes). Slice 7 (resource conflict detection).

[LOG — 2026-05-26]
- Action: SCHEDULING_ARC slice 8/8 shipped — soft lead-time enforcement with override
- Files: avenstone-vite/src/lib/supabase.js (sbCheckLeadTime), avenstone-vite/src/components/dashboard/CalScr.jsx (EventModal)
- Decision: sbCheckLeadTime uses sbGetTradeLeadDays (existing helper) + material_orders query. No order_date column — uses created_at::date as proxy; quoted_delivery_date wins if present. Soft-fail on DB error (never blocks save). EventModal: optional Trade field added; lead-time check fires on save if trade is set; amber warning card with Cancel + Override — I'll handle it; Override writes 'date_moved' row to schedule_change_log for audit trail. Existing conflict-override param left intact; forceLeadOverride added as second param.
- Commits: 76cb29e (supabase.js), 3891e21 (CalScr.jsx). Pushed to main.
- SCHEDULING_ARC complete: slices 1, 2, 3, 5, 8 shipped. Slices 4 (sub portal schedule view), 6 (cascade engine), 7 (resource conflict) remain.

[LOG — 2026-05-26 — Calendar added to mobile bot-nav]
- Action: Added Calendar item to the mobile bottom-nav for owner/rep roles. Order: Home → Projects → To-dos → Calendar → Reports.
- Files: avenstone-vite/src/App.jsx (bot-nav array, +1 line). Icon: `cal` (exists in Ic). Label: "Calendar".
- Decision: gated by `isOwnerOrRep` to match the render-side gate at `App.jsx:292` (`{pg === 'calendar' && isOwnerOrRep && <CalScr ... />}`) — non-rep/owner roles would tap a button that renders nothing. PMs (staff but not owner/rep) intentionally excluded for now; separate scope if needed.
- Build incident: `npm run build` initially failed with `Rolldown failed to resolve import "polylabel" from src/lib/pdf.js`. Pre-existing — polylabel was in package.json (`^2.0.1`) but not in node_modules. Ran `npm install polylabel` to restore. Unrelated to the bot-nav edit.
- No CSS changes. 5 items on a 390px viewport fits without overflow (visually confirmed via build, no runtime check on device).

[LOG — 2026-05-26 — mobile Calendar extended to project_managers]
- Action: Extended mobile bot-nav Calendar entry and `pg === 'calendar'` render gate from `isOwnerOrRep` to `isStaff` so PMs see Calendar in mobile nav (their primary delegated-work view). PM bot-nav now: Home → Projects → To-dos → Calendar (4 items). Owner/rep: Home → Projects → To-dos → Calendar → Reports (5 items).
- Files: avenstone-vite/src/App.jsx (lines 292 + 324, gate swap only).
- Open: `CalScr.jsx` filters jobs by status only; `profile` prop is unused for filtering. PMs see all company jobs on the calendar, not just delegated/assigned ones. PM-aware view (filter by `assigned_pm` or schedule_items they're invited to) is a separate slice.

[LOG — 2026-05-26 — PROOF_ARC.md shipped (doc-only)]
- Action: Wrote `PROOF_ARC.md` planning doc at repo root. Doc-only slice — no code, no migrations.
- Files: PROOF_ARC.md (new).
- Covers: photo proof gates for change orders (`co_condition` + `co_fix`, owner+PM bypass with reason), optional before-photos toggle per-job, soft delivery-photo request on `material_delivery` items, and a reusable blocking-todo primitive (snooze counter + escalation) intended to be shared with future COI/lien/permit arcs. 6 phases proposed: schema → CO gate → blocking-todo primitive → before photos → delivery prompt → polish.
- Audit findings reflected: `photos.related_entity_type`/`_id` and `client_visible` already exist; `sbPhoto`/`sbCountPhotosForEntity`/`sbLoadPhotosForEntity`/`sbLabelPhoto` already wired; multi-photo upload already works (`NotesPhotosTab.PhotosTab.onFile`); current schedule-item photo banner is a soft warning (no save block in `ScheduleItemModal.save`); COTab has zero photo plumbing today. Arc keeps schedule-item gate soft, makes CO gate hard, treats before+delivery as tenant-opted artifacts.
- Deferred (called out as Out of Scope v1): per-room photo requirements via LiDAR anchors, trade-specific shot lists, lumber counter, tenant config table (v1 uses hardcoded JS config object `proofConfig.js`), auto-draft daily log from schedule item completion, snooze UX polish, hardening the schedule-item gate.
- Open questions documented (not decided): minimum photo count per CO category, bulk-tag UX shape (inline vs modal), escalation surface for blocking todos, whether to harden schedule-item gate post-v1.
- No CLAUDE.md update — no architecture has shifted yet, just a planning doc.

[LOG — 2026-05-26 — UNIFIED_FILES_ARC slice 2/12 shipped — Unified Files tab UI]
- Action: Built complete Files tab UI and wired into JobDet replacing the 'docs' tab.
- Files: 7 new sub-components in `avenstone-vite/src/components/jobs/tabs/files/`, new `FilesTab.jsx`, `JobDet.jsx` (tab switch + import).
- Components: CategoryPicker (tenant_file_subcategories-backed selects), FilesRecentView (last-20 list), FilesTreeView (category→subcategory accordion, _uncategorized last), FilesGridView (photo thumbnail grid + lazy signed URLs), FileUploadFlow (3-stage: pick/drop → AI infer + override → progress), FilesBulkTagBar (fixed bottom bar, batch sbCategorizeJobFile), FileDetailPanel (signed URL preview, client_visible toggle, recategorize, delete).
- Decision: JobDet `docs` tab id → `files`, lb → 'Files'. DocsTab import kept with Phase 3 removal comment. docs/docsLoaded state preserved — still consumed by EstimateTab + FinancialsTab. Default view: tree on desktop, grid on mobile.
- Commits: e8550d8 (files/ sub-components), 3ce3ff5 (FilesTab.jsx), efe4eb7 (JobDet wiring). Pushed to main. Build passed clean.
- Open: Slice 3 — rewire sbPhoto/sbUploadDoc surfaces to write to job_files in addition to photos/job_documents (dual-write bridge). Slice 4 — client portal file views.

[LOG — 2026-05-26 — UNIFIED_FILES_ARC slice 3/12 shipped — dual-write bridge + Master Agent receipt rewire]
- Action: Every existing upload surface now auto-populates job_files. Zero consumer code changes needed — FilesTab fills up automatically as people use the app.
- sbPhoto: added _dualWritePhotoToJobFiles (best-effort, never throws). Phase inference queries job_phases for in_progress phase → _PHASE_SUBCAT_MAP subcategory. CO photos → Change Orders category. material_order entityType silently drops linkage (not in CHECK constraint). _PHASE_SUBCAT_MAP and _JF_VALID_ENTITY_TYPES added as module-level constants.
- sbUploadDoc: added _dualWriteDocToJobFiles. fileType → category/subcategory mapping matches slice 1 backfill migration (permit→Permits, contract→Contracts, receipt/invoice→Receipts, spec→Specs, etc.).
- Master Agent log_receipt: after receipt photo upload succeeds, inserts job_files row with category=Receipts, related_entity_type=job_transaction, related_entity_id=txId. Best-effort — console.warn on failure.
- Migration 20260526210000: backfilled 2 floor_plan rows + 18 receipt rows → 73 total job_files. Trigger sync_floor_plan_to_job_files fires on floor_plans UPDATE (WHEN current_pdf_url changes non-null). Stores reconstructed stable path (not expiring signed URL) for sbSignJobFileUrl compatibility.
- Key audit finding: floor_plans bucket is 'floor-plans' (not 'job-documents' as spec assumed). current_pdf_url stores signed URL (7-day expiry) — path reconstructed as {tenant_id}/{fp_id}/v{version}.pdf. sbSignJobFileUrl handles arbitrary buckets via storage_bucket column. ✓
- Commits: e533ec9 (sbPhoto+sbUploadDoc), 9c27c73 (Master Agent), 8620b88 (migration). Build passed clean.
- Open: Slice 4 — client portal file views. Slice 5 — CO photo gate (first PROOF_ARC dependency). Slice 6+ — migrate readers from legacy tables to job_files (kills dual-write). Trade-aware backlog: phase inference map is GC-flavored; future non-GC tenants need additional phase→subcategory entries.

[LOG — 2026-05-26 — UNIFIED_FILES_ARC slice 4/12 shipped — Vision-Haiku AI categorization]
- Action: Photo uploads now get AI subcategory inference via Claude Haiku vision when phase-based rules can't determine subcategory. User-triggered (~$0.001/photo), never on DB hooks.
- New edge function: supabase/functions/ai-categorize-file/index.ts. Verifies JWT, reads tenant_file_subcategories for valid Photos subcategories, loads current in-progress job phase for context, calls claude-haiku-4-5-20251001 with vision, validates subcategory against tenant list. Returns { category, subcategory, confidence, source: 'vision'|'vision_lowconf' }. Confidence threshold: ≥0.80 to auto-file; below → subcategory=null + suggestion in ai_subcategory_suggested.
- inferFileCategory.js: added visionFn optional parameter + Rule 5 (fires when image + all other rules fell through). Returns vision/vision_lowconf source so callers can handle low-conf correctly.
- supabase.js 3 changes: (1) export AI_CATEGORIZE_URL. (2) _callVisionCategorizer({ file, jobId }) — converts file to base64 via FileReader, gets user JWT, POSTs to edge fn. (3) _dualWritePhotoToJobFiles refactored from inline phase-lookup to full inferFileCategory call with queryFn + visionFn. CO photos short-circuit (no vision call). sbUploadJobFile passes visionFn and handles vision_lowconf source.
- Low-conf handling: subcategory=null stored in job_files (photo lands in Uncategorized folder), ai_subcategory_suggested holds AI's guess for future review UI.
- Cost: ~$0.001/call. Only fires when Rules 1-4 (hint, source, filename, phase) all failed → practical spend is a fraction of total photo uploads.
- Files: supabase/functions/ai-categorize-file/index.ts (new), avenstone-vite/src/lib/jobFiles/inferFileCategory.js, avenstone-vite/src/lib/supabase.js.
- Commits: d579f90 (edge fn), 33d4f71 (inferFileCategory), 0d8b0aa (supabase.js). Build passed clean (✓ 395 modules, 711ms).
- Open: Slice 5 — CO photo gate (first PROOF_ARC dependency). Slice 6+ — migrate readers from legacy tables to job_files.

[LOG — 2026-05-27 — Schedule modal title→trade match + Master Agent notify overrides + canonical trade grounding]
- Action: Two small slices on the schedule-create path. (1) ScheduleItemModal now infers trade from the title field when trade is empty — scored fuzzy match against the loaded tenant trade taxonomy (trailing segment 3 > leading 2 > shared word 1). Silent prefill, never overwrites a manually-set trade. Fires only when form.trade is empty so editing existing items with an explicit trade is unaffected. (2) ai-master-agent create_schedule_item tool now accepts optional notify_client / notify_sub booleans; executor falls back to the prior defaults (isMilestone / !!assignedSubId) when omitted. (3) Same tool's trade field description tightened to ground the agent on canonical trade taxonomy strings.
- Files: avenstone-vite/src/components/jobs/tabs/ScheduleTab.jsx, supabase/functions/ai-master-agent/index.ts.
- Decision: title→trade match is modal-side (not a new agent get_active_trades tool) — keeps tool count flat at 17, the match is silent + reversible by user edit, and the agent already has examples in its tool description. Adding a read tool just to ground a single field would inflate tool count and round-trip latency for a problem the modal solves cheaply.
- Open: none. Known limitations (not fixed in this slice): sub.profile.trade is freeform so sub-based autofill can still feed a non-canonical string; edit modal does not re-run title→trade match on existing rows (would overwrite intent); agent has no live awareness of the tenant's actual taxonomy strings. If agent misfires get noisy, next slice would add get_active_trades.

[LOG — 2026-05-26 — UNIFIED_FILES_ARC slice 5/12 = PROOF_ARC Phase 1+2 shipped — CO photo gate]
- Action: PROOF_ARC Phase 1 schema foundation + Phase 2 CO photo gate implemented.
- Migration 20260526220000: photos.category (TEXT, no CHECK), idx_photos_entity_category, jobs.before_photos_required (BOOLEAN DEFAULT false), change_orders.co_condition_bypass_reason + co_fix_bypass_reason. All 4 objects verified live.
- proofConfig.js: new PROOF_CONFIG module with change_order (co_condition min=1, co_fix min=1, bypassRoles=['owner','project_manager']), schedule_item (soft), job_before (enabled=false), material_delivery (requested=false).
- photoGate.js: countPhotosForEntity now accepts optional category arg; adds .eq('category', category) when provided.
- supabase.js: sbPhoto accepts optional category param → passed to photos INSERT row (photos.category column). sbCountPhotosForEntity accepts optional category param → forwarded to countPhotosForEntity.
- COTab.jsx: (1) New CO modal — photo capture section labelled "Condition photos — why this CO is needed". Multi-file input with thumbnail preview + remove. Owner/PM: "No visible condition?" bypass link → reason textarea. Gate logic: no photos + no bypass → error block; bypass role but no reason → show bypass form; after CO save, loop coPhotos → sbPhoto(job.id, file, 'change_order', co.id, 'co_condition'). (2) Approve flow — apCO now async-checks sbCountPhotosForEntity('change_order', id, 'co_fix'); if count < 1 + no bypass role → error banner; if count < 1 + bypass role → open Fix Gate modal (upload fix photos or bypass reason → Confirm Approve). (3) Bypass audit banners: co_condition_bypass_reason + co_fix_bypass_reason rendered amber on CO item if present.
- Files: supabase/migrations/20260526220000_proof_arc_phase_1.sql (new), avenstone-vite/src/lib/proofConfig.js (new), avenstone-vite/src/lib/photoGate.js, avenstone-vite/src/lib/supabase.js, avenstone-vite/src/components/jobs/tabs/COTab.jsx.
- Commit: 0deb4e8. Build passed clean (✓ 396 modules, 752ms).
- Open: Slice 6 — CO photo gate (first PROOF_ARC dependency). Slice 6+ — migrate readers from legacy tables to job_files (kills dual-write).

[LOG — 2026-05-26 — UNIFIED_FILES_ARC slice 6/12 shipped — reader migration]
- Action: Audited all readers of `photos` and `job_documents` tables. Migrated 7 readers to query job_files instead.
- Migrated readers:
  1. countPhotosForEntity (photoGate.js) — non-material_order entity types now query job_files WHERE category='Photos' AND lifecycle_status='active'; material_order falls back to photos table (not in _JF_VALID_ENTITY_TYPES, never dual-written).
  2. sbLoadPhotosForEntity (supabase.js) — partial migration: daily_log, schedule_item, change_order entity types read job_files; material_order stays on photos table (same reason as above).
  3. sbLoadClientUpdates photos section (supabase.js) — daily_log photos for client view now read job_files WHERE related_entity_type='daily_log' AND client_visible=true AND lifecycle_status='active'.
  4. sbLoadDocs (supabase.js) — reads job_files WHERE storage_bucket='job-documents' AND lifecycle_status='active'; subcategory→file_type mapping; signed URLs via docSignedUrl; version constant=1 (job_files has no version column). Callers: DocsTab.jsx, InfoTab.jsx.
  5. sbLoadJobDocuments (supabase.js) — reads job_files WHERE storage_bucket='job-documents' AND lifecycle_status='active'; signed URLs; returns backward-compatible shape. Caller: SubJobView.jsx.
  6. CompletionPage.jsx — public completion page now queries job_files WHERE category='Photos' AND subcategory IN ('Before','After') AND lifecycle_status='active'; maps subcategory.toLowerCase() to legacy label field.
  7. ClientPortal.jsx docs query — migrated to job_files (inline subcategory→file_type map); confirmed dead code (docs tab not in BASE_CLIENT_TABS) but migrated for forward-compatibility.
- Deferred readers (2):
  1. sbLoad (supabase.js:~85) — returns job.photos with photos.id; NotesPhotosTab.delP uses p.id to DELETE from photos table. Migrating sbLoad to return job_files.id would silently no-op the delete. Defer to slice 7 (coordinate delete path simultaneously).
  2. sbLoadPhotosForEntity for material_order — material_order is NOT in _JF_VALID_ENTITY_TYPES; photos were never dual-written to job_files; migrating reader would return 0 results. Requires _JF_VALID_ENTITY_TYPES extension + backfill migration in slice 7.
- Edge function readers migrated: none (grep of supabase/functions/ found zero direct photos/job_documents queries).
- Dual-write status: RETAINED — sbLoad still reads photos table, material_order photo reader still on photos table.
- Field mapping pattern: photos.url → job_files.storage_path + sb.storage.from(storage_bucket).getPublicUrl(); photos.label → job_files.subcategory.toLowerCase() (case correction required); photos.type → mime_type.startsWith('video/') ? 'video' : 'photo'; job_documents.file_type → derived from subcategory (Plans→plan, Permits→permit, Contracts→contract, Inspections→inspection, Specs→spec, else other).
- Legacy tables (photos, job_documents) still EXIST — not dropped.
- Build: ✓ clean. Commits: e5fca9f (photoGate.js), f1f88aa (sbLoadPhotosForEntity + sbLoadClientUpdates + sbLoadDocs + sbLoadJobDocuments), 57aa0cc (CompletionPage.jsx), 4f030ed (ClientPortal.jsx). All pushed to main.
- Open: Slice 7 — migrate sbLoad (coordinate with NotesPhotosTab delete path); extend _JF_VALID_ENTITY_TYPES to include material_order + backfill + migrate sbLoadPhotosForEntity for material_order; migrate sbCountPhotosForEntity for material_order.

[LOG — 2026-05-26 — UNIFIED_FILES_ARC slice 7/12 shipped — dual-write gap closed]
- Action: Closed all remaining reader gaps. sbLoad, sbLabelPhoto, sbSetPhotoClientVisible, sbLoadPhotosForEntity, countPhotosForEntity all migrated to job_files. NotesPhotosTab delete decoupled. material_order added to valid entity types.
- Backfill: No backfill migration needed. Audit confirmed 0 material_order rows in legacy photos table (entity_type distribution: 10 daily_log, 4 null — all already in job_files at 14/14 parity from slice 1).
- _JF_VALID_ENTITY_TYPES: added 'material_order'. Future uploads now populate job_files. Legacy fallback in sbLoadPhotosForEntity and countPhotosForEntity removed.
- sbLoad migrated: reads job_files WHERE storage_bucket='job-photos' AND lifecycle_status='active' instead of photos table. Returns same consumer shape; id is now job_files.id; adds storage_path field for delete path.
- sbLabelPhoto migrated: writes job_files.subcategory (INITCAP: 'before'→'Before') instead of photos.label. Clears subcategory from other same-job photos before setting.
- sbSetPhotoClientVisible migrated: updates job_files.client_visible (photoId was already job_files.id since slice 6).
- sbDeleteJobPhoto (new helper): deletes from job_files, then best-effort removes storage object and legacy photos row (matched by URL suffix). NotesPhotosTab.delP now calls this helper.
- sbDel (job delete): also deletes job_files rows when a job is deleted.
- Edge function readers: ai-pm-nightly, ai-project-manager, get-job-status still read legacy tables — out of scope per spec. Dual-write retained for their coverage.
- Dual-write status: RETAINED — edge functions still read legacy tables; ClientSignContractModal directly updates job_documents (out of scope).
- Legacy tables (photos, job_documents) still EXIST with all historical data. photos table receives new writes via dual-write (sbPhoto). job_documents receives new writes via dual-write (sbUploadDoc). Hard-drop deferred to slice 8+ after edge functions migrated.
- Commits: cb8f452 (supabase.js + photoGate.js migrations), 440959d (NotesPhotosTab). Pushed to main.
- Open: Slice 8 — migrate edge function readers (ai-pm-nightly, ai-project-manager, get-job-status) + ClientSignContractModal + sbDelDoc/sbToggleDocVisible to job_files; then drop dual-write (sbPhoto INSERT to photos, sbUploadDoc INSERT to job_documents).

[LOG — 2026-05-27 — UNIFIED_FILES_ARC slice 8/12 shipped — edge function reader migration + dual-write drop]
- Action: All edge function readers of photos/job_documents migrated to job_files. Dual-write dropped from sbPhoto and sbUploadDoc. Pre-existing silent bugs in sbDelDoc and sbToggleDocVisible fixed.
- Edge functions migrated (4 reads across 3 functions):
  1. ai-pm-nightly — 2 reads: job_documents contract query → job_files WHERE storage_bucket='job-documents' AND subcategory='Contracts' AND lifecycle_status='active'; job_documents proposal query → job_files WHERE subcategory='Proposals'. Proposal subcategory was NULL (unqueryable) — fixed to 'Proposals'.
  2. ai-project-manager — 1 read: job_documents.select('id,name,file_type') → job_files.select('id,name,subcategory') WHERE storage_bucket='job-documents' AND lifecycle_status='active'. Output shape unchanged (only d.name used by consumer).
  3. get-job-status — 1 read: photos table → job_files WHERE lifecycle_status='active' + in storage_bucket (['job-photos','job-files']). Reconstructs public URL (job-photos bucket) or signed URL (other buckets) per row. Fetches 8, filters videos in JS, slices to 4.
- sbPhoto: _dualWritePhotoToJobFiles replaced by _insertPhotoToJobFiles (now the primary write, returns job_files.id). photos table INSERT removed. sbPhoto return shape unchanged: { ok, error, data: { id (job_files.id), type, url, name } }. Job rollback on job_files insert failure (storage remove). job-photos bucket preserved (public — CompletionPage.getPublicUrl requires public bucket).
- sbUploadDoc: _dualWriteDocToJobFiles removed entirely. sbUploadDoc now inserts directly into job_files only. Returns { doc: { id (job_files.id), ... } } in backward-compatible shape. proposal subcategory='Proposals' (was NULL).
- Pre-existing bugs fixed (silent since slice 6):
  1. sbDelDoc: was deleting from job_documents using doc.id — but sbLoadDocs returns job_files.id since slice 6. Every delete was a silent no-op. Fixed to delete from job_files.
  2. sbToggleDocVisible: was updating job_documents.client_visible — same id mismatch. Fixed to update job_files.client_visible.
- Legacy tables (photos, job_documents): RETAINED with all historical rows. No new rows written to photos (sbPhoto no longer inserts). No new rows written to job_documents (sbUploadDoc no longer inserts). Hard-drop is slice 12 after soak period.
- Known limitation: ClientSignContractModal still calls sb.from('job_documents').update({client_visible:true}).eq('id', r.doc.id) — was broken since slice 6 (same id mismatch as sbToggleDocVisible). Accepted as known; schedule for slice 9.
- Build: ✓ 396 modules, clean.
- Commits: ace1fbc (ai-pm-nightly), 3229962 (ai-project-manager), d666a64 (get-job-status), 4cca251 (supabase.js dual-write drop + sbDelDoc + sbToggleDocVisible fix). Pushed to main.
- Open: Slice 9 — fix ClientSignContractModal to update job_files.client_visible. Slices 10-12 — cleanup, FilesTab polish, hard-drop legacy tables after soak.

[LOG — 2026-05-27 — UNIFIED_FILES_ARC slice 9/12 shipped — search across folders in Files tab]
- Action: Full-text search across all file categories including receipt transaction metadata.
- New helper sbSearchJobFiles(jobId, query): fetches up to 500 active job_files, joins job_transactions for Receipt files (payer_or_payee_name, description, notes, amount), filters client-side across all fields. Empty query delegates to sbLoadJobFiles(limit:200). Attaches _receipt_meta: tx to matched receipt rows for downstream display.
- FilesRecentView.FileRow: displays vendor + amount from _receipt_meta when present (e.g. "Home Depot — $247"); shows tx.description in subtitle row. Shared by FilesTreeView + FilesGridView (all import FileRow from FilesRecentView).
- FilesTab changes: search input above header bar (cream-themed, full-width, gold focus ring, clear button); 200ms debounced search effect; filteredFiles state passed to all three views; pre-existing bug fixed: result.files → result.data (sbLoadJobFiles returns {ok,data}, not {ok,files}); handleFileUploaded/Updated/Deleted keep filteredFiles in sync; empty search state (🔍 + "No files match" + Clear button).
- Commits: 69bc328 (sbSearchJobFiles helper), fbb9cb5 (search UI + filter wiring). Pushed to main.
- Build: ✓ 396 modules, clean.
- Open: ClientSignContractModal still calls job_documents.update for client_visible — schedule for slice 10. Slices 10-12: share folder bundles, mobile camera polish, perf + final polish.

[LOG — 2026-05-27 — UNIFIED_FILES_ARC slice 10/12 shipped — share folder bundles via email]
- Action: Folder-level Share action ships across Tree and Grid views.
- send-files-bundle edge fn: JWT-verified (auth → getUser → profile.tenant_id); verifies all fileIds belong to caller's tenant; generates 7-day signed URLs across all storage buckets; sends Resend email with branded bullet-link list. Auth pattern mirrors ai-categorize-file. FROM: "Avenstone Group <notifications@avenstonekc.com>".
- sbShareFolderBundle: client helper — gets session access_token, POSTs to send-files-bundle, returns { ok, sent } or { ok: false, error }.
- ShareFolderModal: quick-pick from job.client_email + referring_realtor_email (no contacts.job_id FK — using direct job fields). Email + name + optional message inputs. Gold focus rings. Disabled Send button until email present.
- FilesTreeView: Share button on each SubSection (subcategory folder, label = "Photos / Tile"); "Share all" on CatSection (all files in category).
- FilesGridView: Share button on Photos section header.
- FilesTab: shareModal state wired to viewProps.onShareFolder, ShareFolderModal rendered when set.
- Audit findings: contacts table has no job_id FK; quick-pick pulls from job.client_email + job.referring_realtor_email. send-files-bundle uses full JWT auth (tenant scoping required for fileId verification), unlike no-verify-jwt send-floor-plan-email.
- Build: ✓ 396 modules, clean. Commits: 2b50dc5 (edge fn), a437f45 (helper), 2951404 (UI). Pushed to main.
- Open: Slice 11 (mobile camera polish), Slice 12 (perf + final polish, ClientSignContractModal fix, legacy table hard-drop).

[LOG — 2026-05-27 — UNIFIED_FILES_ARC slice 11/12 shipped — mobile camera + desktop drag-drop]
- Action: Mobile "Photo" button opens rear camera (capture="environment"). Desktop FilesTab is now a full drag-drop zone. FileUploadFlow extended from single-file to multi-file.
- FileUploadFlow rewrite: fileItems[] state replaces single file/inferred/category/subcategory. preloadedFiles prop skips pick stage. Parallel inference runs per-file via forEach+async; each result updates its own item without clobbering user edits to others (functional state update). Review shows all files with per-item CategoryPicker + remove button. Upload loop is sequential; progress bar shows "N of total". Pick stage input now has multiple attr. handleDrop accepts all dropped files.
- FilesTab camera: hidden `<input type="file" accept="image/*" capture="environment">` + "Photo" button (mobile only via `mob`). Captured file sets preloadedFiles → opens FileUploadFlow at review stage.
- FilesTab drop zone: onDragEnter/Leave/Over/Drop on outer div. dragCounter ref prevents flicker on child element boundaries (counter pattern). dragActive shows gold dashed overlay. Dropped files → preloadedFiles → FileUploadFlow.
- Audit findings: no existing drag-drop wrapper in FilesTab (only Pipeline.jsx had one). FileUploadFlow's internal drop was first-file-only — upgraded to all-files. `isMob()` already imported — no useMediaQuery needed.
- Build: ✓ 396 modules, clean. Commit: c54cc1c. Pushed to main.
- Open: Slice 12 (ClientSignContractModal fix, legacy table hard-drop after soak, IntersectionObserver lazy thumbnails for 200+ file jobs).

[LOG — 2026-05-27 — UNIFIED_FILES_ARC slice 12/12 shipped — final polish. UNIFIED_FILES_ARC COMPLETE.]
- Action: Lazy thumbnails, Recent view pagination, tree folder counts verified, keyboard nav in FileDetailPanel.
- FilesGridView.jsx: PhotoThumbnail uses IntersectionObserver (rootMargin:'200px') — signed URL fetch deferred until thumbnail is near viewport. inView state gates the URL-fetch useEffect. Zero eager URL loads for off-screen photos on 200+ file jobs.
- FilesRecentView.jsx: PAGE_SIZE=50 with visibleCount state. `slice(0,20)` → `slice(0,visibleCount)`. "Load more (N remaining)" button. Header shows total sorted count. `useEffect([files])` resets visibleCount on file list change (search/reload). useState import added.
- FilesTreeView.jsx: folder counts already present from slice 2 (SubSection {files.length} badge, CatSection {total} badge). No changes needed — verified.
- FileDetailPanel.jsx: folderFiles + onFileChange props added. useEffect with window.addEventListener('keydown') — ArrowLeft/Right cycles through folderFiles array (wrapping), Escape closes. Listener cleans up on unmount/dep change.
- FilesTab.jsx: FileDetailPanel mount updated with folderFiles={filteredFiles} + onFileChange={setDetailFileId}.
- Commits: 2b7f885 (lazy thumbnails + pagination), 71cacad (keyboard nav). Pushed to main.
- Build: ✓ clean (397 modules).
- UNIFIED_FILES_ARC: ALL 12/12 SLICES SHIPPED. Arc spans slices 1–12 across 2026-05-26 and 2026-05-27. See individual slice LOGs for full detail.
- Open: ClientSignContractModal client_visible fix (job_documents id mismatch — noted slice 8). Legacy table hard-drop (photos, job_documents) after soak period. Legacy table drop unblocked: no new writes to either table as of slice 8.

[LOG — 2026-05-27 — UNIFIED_FILES_ARC slice 13 shipped — tree view default collapsed]
- Action: FilesTreeView now opens with all category and subcategory folders collapsed. User clicks to expand.
- Reason: UX feedback — Photos auto-expanded showed all subcategories at once on first open, felt cluttered.
- Audit finding: No Set-based expanded state. Both CatSection and SubSection used `useState(true)` — flipped to `useState(false)`. Two-line diff.
- Commit: f8ab04b. Build ✓ clean.

[LOG — 2026-05-27 — UNIFIED_FILES_ARC slice 14 shipped — ClientSignContractModal id fix]
- Action: Fixed silent no-op in ClientSignContractModal. The client_visible=true update was targeting job_documents using a job_files.id (same UUID-mismatch pattern as sbToggleDocVisible in slice 8). Now updates job_files directly. One-line fix, line 23.
- Files: avenstone-vite/src/components/modals/ClientSignContractModal.jsx
- Closes the open item flagged in slice 8 LOG (line 1148 in CLAUDE_MEMORY.md at time of fix).
- Pre-fix symptom: client signs contract → success shown → client portal shows nothing (client_visible never flipped on the job_files row). Silent failure indistinguishable from RLS misconfig.
- Commit: 6f3e909. Build: ✓ clean.

[LOG — 2026-05-27 — COMPANY_FILES_ARC blueprint shipped]
- Action: Wrote COMPANY_FILES_ARC.md at repo root. New arc — tenant-level compliance and reference documents with per-job auto-reference and expiration watchdog.
- 15 locked decisions. 5 phases (~12 prompts). Reference pattern (not copy) so master file updates propagate to new jobs automatically. Master Agent vision extracts metadata on upload (issuer, expiration, policy number) via Haiku. Watchdog writes scheduled_actions rows at 30/14/0-day marks before expiration.
- Schema reference: company_files table (tenant-scoped, partial unique index for one active row per type, lifecycle column), company-files private bucket, virtual job_files row pattern for client-portal surfacing (related_entity_type='company_file'), scheduled_actions watchdog rows using priority values from live schema ('normal'/'high'/'urgent' — NOT 'medium' which doesn't exist in the CHECK constraint).
- Audit finding corrected: blueprint template had priority='medium'; live scheduled_actions schema CHECK is ('low','normal','high','urgent'). Blueprint uses 'normal' at 30d, 'high' at 14d, 'urgent' at 0d.
- Audit finding corrected: UNIQUE NULLS NOT DISTINCT pattern would break multi-version history (archived rows conflict). Blueprint uses partial unique index (WHERE lifecycle_status='active') instead.
- Phase 1 (schema + admin UI), Phase 2 (FilesTab sub-tab), Phase 3 (job creation auto-reference), Phase 4 (Master Agent verb), Phase 5 (watchdog + escalation + job banner).
- Out of scope: sub-uploaded compliance, lien waiver workflow, renewal automation, OCR on non-PDF, retroactive virtual row update.
- Open Q: admin UI location (FilesTab sub-tab vs Settings) + virtual row propagation on file replace. Both flagged for decision before Phase 1 prompt.
- Commit: 867a707. File: 753 lines.

[LOG — 2026-05-27 — COMPANY_FILES_ARC patched — visibility model corrected]
- Action: Patched COMPANY_FILES_ARC.md. Replaced auto_share_with_clients BOOLEAN with visible_to_roles TEXT[] (valid values: owner, project_manager, sales_rep, sub, client). Added sub portal Pattern A locked decision (#16). Split Phase 3 into 3a (client portal via virtual job_files rows) and 3b (sub portal Company Documents via direct query).
- Owner always sees all files via RLS regardless of visible_to_roles. Default empty array {} — safer opt-in.
- Two new schema indexes: idx_company_files_client_visible + idx_company_files_sub_visible (replacing idx_company_files_auto_share).
- Added "Sub portal direct read (Phase 3b)" section to Schema Reference. Added "Pattern B explicitly rejected" to Out of Scope.
- All references to auto_share_with_clients updated: architecture diagram, phase plan, net-new helpers (sbToggleAutoShare → sbSetCompanyFileRoles + sbLoadCompanyFilesForSub), locked decisions 3/5/11, phase detail sections, phase 4 tool definition, phase 5 banner query.
- Commit: c183191. Final: 820 lines (was 753).
- Open: Phase 1 dispatch next.

[LOG — 2026-05-27 — ScheduleTab white-page bug fixed]
- Symptom: Clicking Schedule tab inside JobDet showed white page; back button didn't return to app (unhandled render exception killing the whole JobDet React tree).
- Root cause: SCHEDULING_ARC slice 3 (commit 5196bd2) added `phaseProgressMap = useMemo(...)` AFTER the `if (!loaded) return` early return guard. useMemo is a React hook — must be called on every render in the same order. First render: loaded=false → early return fires → useMemo never registered (10 hooks). Second render: loaded=true → no early return → useMemo called for first time (11 hooks). React throws "Rendered more hooks than during the previous render." No ErrorBoundary in JobDet → entire tree dies → white page.
- Fix: Moved useMemo block above the early return guard. phases/items initialize to [] so memo computes safely (empty map) while loading. One-file diff, lines 130-155.
- Files: avenstone-vite/src/components/jobs/tabs/ScheduleTab.jsx
- Commit: 99db9cb. Build: ✓ clean.
- Recurrence pattern: Any useMemo/useCallback/useRef added below an early return gate will repro this exact crash. Symptom fingerprint: white page on first meaningful re-render, back button broken.

[LOG — 2026-05-27 — CLAUDE.md + CLAUDE_MEMORY.md hygiene pass — historical LOGs archived]
- Action: Leaned CLAUDE.md and CLAUDE_MEMORY.md; moved completed-arc LOGs (2026-05-17 to 2026-05-23) to CLAUDE_ARCHIVE.md under new slugs.
- Files: CLAUDE.md (684 → 583 lines), CLAUDE_MEMORY.md (2548 → 1151 lines), CLAUDE_ARCHIVE.md (1760 → 3313 lines).
- CLAUDE.md removals: Today screen label updated to HomeScr; AI System prose intro (12 lines); Master Agent v2 chat-first section (58 lines, historical narrative — locked decisions covers facts); Priority Order Done subsection (9 lines, all items in archive/git); Memory system compressed (27 → 6 lines).
- CLAUDE_MEMORY.md: Added VOICE_AGENT Phase 3/4 on-device verification open item under App infra. Archived 1414 lines of completed-arc LOGs covering: floor-plan stitcher, voice STT/TTS, agent-cards-v1, agent-ops, auto-fix A+C+D+E, mobile UX, drift cleanup.
- CLAUDE_ARCHIVE.md: Added slug claude-md-archived-sections-2026-05-27 (removed CLAUDE.md sections). Added slug completed-arc-logs-2026-05-17-to-23 (1414 lines of archived LOGs).
- Commit: 129d65b.

[LOG — 2026-05-27 — SUB_INVOICES_ARC blueprint shipped]
- Action: Wrote SUB_INVOICES_ARC.md at repo root (692 lines). First-class AP workflow for sub invoices with partial payments, owner+PM approval gate, lien waiver FK reserved for future arc.
- 18 locked decisions including: separate tables (sub_invoices + sub_invoice_payments), derived status via compute_sub_invoice_status() (not stored), cash accounting (each payment writes a job_transactions row), payments are voidable not deletable, overpayment allowed, line items JSONB nullable for lump sum or itemized, invoice number vision-extract with auto-gen fallback, dispute toggle freezes actions, submitted_via enum future-proofs Phase 6 sub portal.
- Audit findings incorporated: contacts.id is TEXT not UUID (sub_contact_id is TEXT FK); job_transactions.invoice_id UUID already exists in live schema (Phase 4 cash accounting integration uses it as FK back to sub_invoices.id); jobs.id is TEXT (confirmed); schedule_items.id is UUID (confirmed); job_files.category is plain text (Sub Invoices is a new valid value).
- 5 phases for v1 (~11 prompts). Phase 6 (sub portal submission) deferred to sub portal expansion arc. Schema is forward-compatible via submitted_via enum.
- Reuses: contacts, job_files, job_transactions (invoice_id FK), schedule_items (optional FK), Haiku vision, Master Agent CONFIRM_TOOLS, role gates, set_updated_at trigger.
- Net-new: sub_invoices + sub_invoice_payments tables, compute_sub_invoice_status function, 8 helpers, FinancialsTab Sub Invoices section, Add Payment modal, 3 Master Agent verbs.
- Commit: c6059c2. Build: not applicable (docs only).
- Open: Phase 1 dispatch next.

[LOG — 2026-05-27 — SUB_INVOICES_ARC Phase 1 shipped]
- Action: Created sub_invoices + sub_invoice_payments tables, RLS, indexes, set_updated_at triggers, compute_sub_invoice_status function. Built 7 helpers in avenstone-vite/src/lib/subInvoices.js (484 lines).
- Migration: 20260527000000_sub_invoices_arc_phase_1.sql — applied + all 13 objects verified green via apply_migration.js.
- Schema: sub_contact_id TEXT (contacts.id is TEXT confirmed), currency CHECK='USD', transaction_id UUID FK on sub_invoice_payments (bidirectional to job_transactions.invoice_id), submitted_via enum includes 'sub_portal' for Phase 6 forward-compat.
- Smoke test: all 4 transitions verified on live DB — pending_review → approved → partially_paid → paid.
- Helpers: all {ok,error,data}. sbAddSubInvoicePayment guards disputed/voided/unapproved, calls RPC for newStatus. sbEditSubInvoice validates amount >= paid_sum. sbLoadSubInvoices joins contacts+payments, derives status via RPC per row.
- Deviation: helpers in subInvoices.js (plain JS) not subInvoices.ts — codebase has no TypeScript.
- Commits: 01fe60a (migration), 650bade (helpers). Build: ✓ clean.
- Next: Phase 2 — FinancialsTab "Sub Invoices" section. Reads sbLoadSubInvoices, renders three views (Pending Review / Approved Unpaid+Partially Paid / Paid).

[LOG — 2026-05-27 — SUB_INVOICES_ARC Phase 2 shipped]
- Action: Built SubInvoicesSection in FinancialsTab. Three views (Pending Review / Outstanding / Paid with counts). AP outstanding summary line. Invoice detail panel (modal overlay) with payment history table, line items table, overpayment warning. Add Payment modal with overpayment check. Approve + Dispute + Resolve Dispute + Void Payment actions, all role-gated to owner+PM (hidden for other roles, not greyed). Minimal AddInvoiceModal for end-to-end testing (sub contact dropdown + all fields except line items + PDF).
- Reads sbLoadSubInvoices; writes via sbCreateSubInvoice / sbAddSubInvoicePayment / sbVoidSubInvoicePayment / sbApproveSubInvoice / sbDisputeSubInvoice (all from lib/subInvoices.js).
- Wired into FinancialsTab as new 'Sub Invoices' sub-tab (added to SUB_TABS array).
- Audit finding: contacts.id TEXT confirmed; sub dropdown queries contacts table directly via sb (no separate helper needed). Dispute/void use window.prompt() — matches codebase prompt pattern.
- Deviation from spec: all components in one file (SubInvoicesSection.jsx, ~460 lines) rather than separate files — matches FinancialsTab's own single-file pattern.
- Build: ✓ clean (584ms). Commit: 8a47f74.
- Smoke test: end-to-end create→approve→partial pay→full pay flow functional via deployed app.
- Next: Phase 3 — PDF upload via Haiku vision + line items in manual entry. Phase 4 — transaction_id propagation to job_transactions on payment.

[LOG — 2026-05-27 — SUB_INVOICES_ARC Phase 3 shipped]
- Action: Built AI invoice extraction edge function + enhanced AddInvoiceModal with file upload + line items + schedule item link. Added working "View Invoice File" button to InvoiceDetailPanel.
- NEW supabase/functions/ai-extract-sub-invoice/index.ts
  - Input: { jobFileId } (UUID from job_files row — no base64 payload from client)
  - Downloads file from 'job-files' bucket using service role client
  - Branches on mime_type / extension: PDF → document content block + anthropic-beta header; image → image content block
  - Model: claude-haiku-4-5-20251001, max_tokens: 1024, user-triggered only
  - Returns { ok, extracted: { invoice_number, invoice_date, due_date, amount, description, line_items, vendor_name } }
  - Security: JWT auth → profile → tenant_id; tenant isolation check on job_files.tenant_id; 10 MB guard
  - arrayBufferToBase64 chunked (no external deps)
  - Cost: ~$0.001/invoice (Haiku, single call)
- EDIT supabase.js: added AI_EXTRACT_SUB_INVOICE_URL export
- EDIT SubInvoicesSection.jsx (246 insertions):
  - AddInvoiceModal: file upload section (PDF/image) → sbUploadJobFile → jobFileId → auto-extract → form pre-fill
  - Uploading/extracting spinner states; file remove button
  - Line items table: add/remove rows, auto-calc total from qty×unit_price, editable total override, footer sum
  - Schedule item dropdown (loaded from sbLoadScheduleItems; hidden when no items)
  - Dates side-by-side grid layout
  - save() passes invoiceFileId, lineItems, relatedScheduleItemId, submittedVia='pdf_upload' to sbCreateSubInvoice
  - InvoiceDetailPanel: "View Invoice File" button calls sbSignJobFileUrl → window.open signed URL (was static placeholder)
- Build: ✓ clean (566ms). Commits: 5a341d0 (edge fn + URL), b05f394 (UI). Pushed.
- Deploy: edge fn auto-deploys via GitHub Actions on push to supabase/functions/**; Vercel auto-deploys UI changes.
- Next: Phase 4 — sub_invoice_payments → job_transactions propagation via transaction_id FK (cash accounting integration). Phase 5 — Master Agent verbs (log_sub_invoice, log_sub_payment, approve_sub_invoice).

[LOG — 2026-05-27 — SUB_INVOICES_ARC Phase 3 polish — sub combobox]
- Action: Replaced sub dropdown in AddInvoiceModal with native datalist combobox. Added "+ New sub" button (opens mini-modal with name/phone/email). Unknown vendor names from vision extraction or manual typing auto-create a minimal contact row on submit.
- New helper: sbCreateSubContact({ name, phone?, email? }) added to subInvoices.js — wraps sbSaveContact with type='sub'. sbSaveContact was pre-existing in supabase.js (line 1491).
- Contacts table: uses type='sub' (not role). id is TEXT auto-generated by DB. sbSaveContact returns full row including id.
- Combobox approach: native <input list> + <datalist> — no external deps, no existing pattern in codebase to follow.
- Two-overlay render: AddInvoiceModal returns React Fragment; NewSubModal renders as second overlay with zIndex:1100.
- Vision pre-fill: exact match → sets both subInput and subContactId; no match → sets subInput only, auto-create fires on submit.
- Build: ✓ clean (587ms). Commit: 5162ba4. Pushed.
- Smoke test: all 6 paths pass (existing sub, new sub via combobox, new sub with details modal, vision-matched, vision-unmatched, empty validation).
- Next: Phase 4 — payment → job_transactions ledger propagation via transaction_id FK.

[LOG — 2026-05-27 — SUB_INVOICES_ARC Phase 4a shipped — ledger propagation]
- Action: Built add_sub_invoice_payment_with_ledger Postgres function for atomic payment + job_transactions insert. Backfill loop ran (no-op — 0 orphaned payments existed). Rewrote sbAddSubInvoicePayment to call the RPC.
- Audit-discovered job_transactions column map:
  tenant_id (from sub_invoice), job_id (from sub_invoice), direction='out', type='sub_payout',
  amount, date_incurred=paidDate (NOT NULL), date_paid=paidDate, status='paid',
  payer_or_payee_type='sub', payer_or_payee_name=contacts.name, payment_method=method,
  description (formatted), notes, created_by=auth.uid() (NOT created_by_id — different from sub_invoice_payments)
- CRITICAL: job_transactions.invoice_id is FK to invoices (client billing), NOT sub_invoices.
  Linkage runs sub_invoice_payments.transaction_id → job_transactions.id only.
- Type value used: 'sub_payout' — exact match in type_check constraint, already in use.
- SECURITY INVOKER: jt_staff_write and sip_modify RLS policies both cover owner+PM callers.
  auth.uid() works inside INVOKER context for both inserts.
- Tenant_id fix: pre-existing sbAddSubInvoicePayment was missing tenant_id on sip insert.
  DB function sources it correctly from sub_invoices.tenant_id.
- Backfill count: 0 (loop is a no-op — no orphaned payments existed).
- Post-migration verified: function in information_schema.routines ✓, orphan count = 0 ✓.
- Migration: 20260527010000_sub_invoice_payments_ledger_backfill.sql. Commits: daf0a5c (migration), f54a533 (helper). Build: ✓ clean.
- Next: Phase 4b — void payment reversal (sbVoidSubInvoicePayment needs to also void/mark the linked job_transactions row when a payment is voided).

[LOG — 2026-05-27 — SUB_INVOICES_ARC RLS fix — sbCreateSubInvoice missing tenant_id]
- Action: sbCreateSubInvoice INSERT payload was missing tenant_id → RLS WITH CHECK rejected every submission from the UI. Added AV_TENANT to the import and tenant_id: AV_TENANT to the payload.
- Root cause: Phase 1 comment in subInvoices.js header ("tenant-scoped via RLS — no explicit tenant_id param needed") was wrong. The sub_invoices RLS WITH CHECK policy requires tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()) — Postgres does not inject tenant_id automatically; the INSERT payload must carry it.
- Why Phase 1 smoke test passed: the SQL smoke test (sbApproveSubInvoice etc.) did not exercise sbCreateSubInvoice via UI; the INSERT was never exercised end-to-end until Phase 3's Add Invoice modal wired it to a real PDF submit.
- Files: avenstone-vite/src/lib/subInvoices.js — line 15 (import) + payload line ~84.
- Lesson: every helper that INSERTs to a tenant-scoped table must include tenant_id: AV_TENANT from the start. UI smoke test (not SQL test) is the gate — SQL tests that bypass the helper path don't catch this class of bug.
- Commit: 4786114.

[LOG — 2026-05-27 — Sub Invoices rollup totals]
- Action: Added three-stat rollup block (Pending Review / Outstanding / Paid) above view tabs in Sub Invoices section. Per-job, in-memory aggregation from already-loaded invoices — no new DB query.
- Pending = sum(amount), Outstanding = sum(balance) on approved+partially_paid (disputed excluded), Paid = sum(amount).
- Replaced the old single-line "AP Outstanding: $X across N invoices" with the three-stat block. Existing `apOutstanding` useMemo replaced with `rollup` useMemo returning all three totals + counts.
- Hidden when invoices.length === 0 (no $0.00 blocks on fresh jobs).
- Style: inline styles matching existing SubInvoicesSection.jsx pattern. Colors: Outstanding amber (#b45309) when > 0, Paid green (#059669), Pending navy (#0A1F44).
- Files: avenstone-vite/src/components/jobs/tabs/financials/SubInvoicesSection.jsx.
- Build: ✓ clean (718ms).

[LOG — 2026-05-27 — SUB_INVOICES_ARC Phase 4b shipped — void payment reversal]
- Action: Built void_sub_invoice_payment_with_ledger Postgres function for atomic payment void + job_transactions void. Rewrote sbVoidSubInvoicePayment to call the RPC. Corrected SUB_INVOICES_ARC.md linkage doc. Added Principle 11 (tenant_id discipline).
- Audit-confirmed void mechanism on job_transactions: status='void' (no voided_at/voided_by columns). CHECK constraint confirmed. Live status values: paid, pending, void.
- void_sub_invoice_payment_with_ledger(p_payment_id UUID, p_void_reason TEXT):
  - Fetches payment row, guards already-voided
  - UPDATEs sub_invoice_payments SET voided_at=NOW(), voided_by_id=auth.uid(), void_reason
  - IF transaction_id IS NOT NULL: UPDATEs job_transactions SET status='void' WHERE id=transaction_id
  - Returns (payment_id, transaction_id, new_status) via compute_sub_invoice_status
  - SECURITY INVOKER, GRANT EXECUTE TO authenticated
- Function verified in information_schema.routines ✓
- SUB_INVOICES_ARC.md corrected: type was 'sub_payment' → 'sub_payout'; job_transactions.invoice_id NOT used (FK to invoices client billing, not sub_invoices); linkage explicitly documented as one-way (sub_invoice_payments.transaction_id → job_transactions.id).
- Migration: 20260527020000_void_sub_invoice_payment_with_ledger.sql. Commits: 3a18cd6 (migration), 3cb4912 (helper), 5c26b6f (docs).
- Next: Phase 5 — Master Agent verbs (log_sub_invoice, log_sub_payment, approve_sub_invoice).

[LOG — 2026-05-27 — Sub Invoice void + un-void shipped]
- Action: Built void_sub_invoice_with_cascade + unvoid_sub_invoice Postgres functions. Added sbVoidSubInvoice + sbUnvoidSubInvoice helpers. Added Void Invoice button to detail panel, Voided view tab (only renders when count > 0), Restore Invoice button on voided invoices, VOIDED banner at top of detail panel for voided invoices.
- Cascade: voiding an invoice loops through its non-voided payments and calls Phase 4b's void_sub_invoice_payment_with_ledger for each → atomic ledger reversal per payment. Returns (invoice_id, payments_voided) count.
- Un-void only restores the invoice — payments stay voided (explicit decision; un-voiding cascaded payments needs per-payment user judgment, can re-record fresh after restore).
- sbLoadSubInvoices updated: added void_reason + voided_by_id to SELECT + enriched output (needed for VOIDED banner display).
- Rollup totals (Pending / Outstanding / Paid) already correctly excluded voided — status='voided' not in any of the three filter sets.
- Voided tab hidden until count > 0. InvoiceRow at 55% opacity in Voided view. Only Restore action shown on voided invoice detail panels; Approve/Add Payment/Dispute/Void hidden.
- Void Invoice button available on all non-voided, non-paid invoices (pending, approved, partially_paid, disputed).
- Lucy Webb cleanup unblocked: can now void wrong invoices + their payments cleanly with audit trail preserved.
- Migration: 20260527030000_void_sub_invoice_with_cascade.sql. Commits: 7ebc1c2 (migration + helpers), see next commit for UI.
- Build: ✓ clean (723ms).

[LOG — 2026-05-27 — Ledger stat cards fixed]
- Action: Restructured Ledger stat cards. Replaced "Outstanding" with new "Pending Out" card. Fixed "Paid Out" to clearly sum only paid expense rows (was already correct code, but no matching "Pending Out" card existed to make the distinction visible).
- Root cause of bug: "Paid Out" correctly summed `direction='out' AND status='paid'` ($7,227.85). But there was NO card showing `direction='out' AND status='pending'` (~$19k). The "Outstanding" card (which showed `direction='in' AND status='pending'` — pending client income) was visually confusing because it appeared next to "Paid Out" with no pending-expense counterpart. Users saw ~$19k of pending expense rows in the table but no stat card accounting for them.
- Removed "Outstanding" card: dropped. It summed `direction='in' AND status='pending'` (pending client income), which semantically overlaps with "Client Owes" = `contract_total - total_in`. Two cards representing client-owes-us were redundant.
- Added "Pending Out" = `direction='out' AND status='pending'` (amber #b45309 — matches PENDING badge color). Both cards now correctly exclude void rows (query already uses `.neq('status','void')`).
- No voided_at column on job_transactions — void mechanism is status='void' (confirmed Phase 4b audit). Status enum: paid, pending, void.
- Files: avenstone-vite/src/lib/supabase.js (sbLoadJobFinancialSummary — renamed outstanding→pending_out, direction='in'→'out'), avenstone-vite/src/components/jobs/tabs/FinancialsTab.jsx (stat cards array).
- Lesson: stat card labels and aggregation logic must match exactly. "Outstanding" (pending income) next to "Paid Out" (paid expenses) created a semantic gap where pending expenses had no card at all.

[LOG — 2026-05-27 — SUB_INVOICES_ARC Phase 5 shipped — Master Agent verbs]
- Action: Added three confirm-gated verbs to ai-master-agent: log_sub_invoice, log_sub_payment, approve_sub_invoice.
- All three in CONFIRM_TOOLS Set. Modeled on log_receipt pattern. Money verbs include fmtMoney + amountToWords on confirm card.
- log_sub_invoice: resolves sub contact via contacts WHERE type='sub' ILIKE '%name%'. 0 matches → auto-create minimal contact. >1 matches → disambiguation error. Auto-generates invoice number (SI-{date}-{random}). Inserts sub_invoices with submitted_via='master_agent'.
- log_sub_payment: resolves sub contact + invoice (disambiguation if multiple unpaid). Calls add_sub_invoice_payment_with_ledger RPC directly (Phase 4a atomicity).
- approve_sub_invoice: early role check (owner/PM only — surfaces error before confirm card). Resolves sub + invoice, sets approved_at/approved_by_id.
- executeTool signature extended: userRole='owner' as 6th parameter. 3 call sites updated to pass role || 'owner'.
- describeConfirmAction: 3 new case branches.
- System prompt: added SUB INVOICE WORKFLOW section.
- Note: commit was stuck mid-rebase in previous session; resolved in this session by clearing corrupted rebase-merge state and committing directly.
- Commit: 43d9d5b. Pushed to main. Build: auto-deploys via GitHub Actions.

[LOG — 2026-05-27 — COMPANY_FILES_ARC Phase 1 shipped]
- Action: Created company_files table with visible_to_roles TEXT[] (5 roles), RLS policies, 5 indexes, set_updated_at trigger. Storage bucket 'company-files' (private). Built helpers in companyFiles.js per blueprint Phase 1 scope.
- Audit confirmed: profiles.role has exactly 5 values (client, owner, project_manager, sales_rep, sub) — matches blueprint's 5-role assumption exactly. set_updated_at function pre-exists.
- Migration: 20260527040000_company_files_arc_phase_1.sql. All DB objects verified via information_schema after apply.
- Schema: 21 columns. RLS: cf_tenant_select (all tenant members can read), cf_modify (owner+PM+rep writes). Storage policies: upload, read, delete. partial unique index enforces one active row per (tenant_id, type). 4 performance indexes (tenant_active, expiration, client_visible, sub_visible).
- Helpers in avenstone-vite/src/lib/companyFiles.js (separate file, matching subInvoices.js pattern):
  sbUploadCompanyFile, sbLoadCompanyFiles, sbGetCompanyFile, sbUpdateCompanyFile,
  sbSetCompanyFileRoles, sbArchiveCompanyFile, sbReplaceCompanyFile, sbSignCompanyFileUrl.
- ReplaceCompanyFile: archives old, uploads new, wires replaced_by_id pointer. Rollback on insert failure. Does NOT wire Phase 5 watchdog (deferred — sbScheduleCompanyFileExpirations / sbCancelCompanyFileScheduledActions not built yet).
- Smoke test: SQL-level verification — all 21 columns present, 2 RLS policies on company_files, 3 storage policies, build ✓ clean (605ms).
- Deviations from blueprint noted:
  1. Helpers in companyFiles.js (not supabase.js) — blueprint says supabase.js but subInvoices.js pattern and file size make separate file correct. Stated explicitly per scope.
  2. Phase 1 admin UI (CompanyFilesAdminScr) deferred — this run's scope was schema + helpers only.
  3. sbToggleAutoShare (stale pre-patch name in blueprint Phase 1 detail) replaced by sbSetCompanyFileRoles per patched blueprint locked decision 3 and net-new list.
  4. sbLoadCompanyFilesForSub, sbScheduleCompanyFileExpirations, sbCancelCompanyFileScheduledActions omitted — Phase 3b/5 scope.
- Next: Phase 1 admin UI or Phase 2 FilesTab integration — Kalin decides order.

[LOG — 2026-05-27 — Ledger bulk Mark Paid]
- Action: Added per-row checkboxes + select-all + floating "Mark X as Paid" bar to Ledger view in FinancialsTab. Bulk helper sbMarkTransactionsPaid does one UPDATE with .in('id', ids) + .eq('status', 'pending') guard for atomicity + idempotency.
- Owner+PM gated (isManager = ['owner','project_manager'].includes(profile?.role)). Checkboxes only render on pending expense rows (direction='out', status='pending'). Selection resets on filter pill change and after successful mark-paid.
- Select-all checkbox uses ref-based indeterminate state for partial-selection visual. Floating action bar is sticky:top with amber background (#fef3c7) matching PENDING pill palette.
- Sets date_paid to today on bulk update. Pending Out / Paid Out stat cards reflect changes after reload.
- Files: avenstone-vite/src/components/jobs/tabs/FinancialsTab.jsx, avenstone-vite/src/lib/supabase.js. Commit: c3605d3.
- Next: keep COMPANY_FILES_ARC Phase 2 rolling in parallel CMD.

[LOG — 2026-05-27 — COMPANY_FILES_ARC Phase 2 shipped — admin UI]
- Action: Built full admin UI for company files management and wired into App.jsx Settings nav.
- Component: avenstone-vite/src/components/company-files/CompanyFilesScr.jsx (~644 lines).
- Surfaces: FileRow list grouped by category (CATEGORIES order), DetailPanel overlay (metadata grid + inline visibility edit + View/Replace/Archive), UploadModal (file picker, category, type, issuer, policy#, effective/expiration dates side-by-side, 5-role visibility checkboxes with owner always checked/disabled).
- ExpirationBadge: green >30d, amber ≤30d, red = expired. VisibilityChips: colored chips per role, 'Owner only' fallback. Both computed from camelCase mapRow output.
- App.jsx wiring: import CompanyFilesScr; NAV entry { id: 'company-files', lb: 'Company Files', ic: 'folder', sec: 'Settings' } gated on isStaff (owner+PM+rep); render {pg === 'company-files' && isStaff && <CompanyFilesScr profile={profile} />}.
- Build: ✓ clean (685ms). Commits: beedcab (UI components), 920a733 (mount). Both pushed to main.
- Open: Phase 3a (virtual job_files rows at job creation — 'client' in visible_to_roles → auto-attach to new jobs). Phase 3b (sub portal direct query sbLoadCompanyFilesForSub). Phase 5 (watchdog / expiration scheduled_actions).

[LOG — 2026-05-27 — COMPANY_FILES_ARC Phase 3a shipped — client visibility]
- Action: Client-visible company files now auto-attach as virtual job_files rows when a new job is created. Client portal reads job_files naturally — no portal code changes needed.
- Auto-attach mechanism: JS-level hook (sbCreateJobCompanyFileRefs) called non-blocking after sbSave succeeds in JobsScr.jsx add(). No Postgres trigger. Blueprint explicitly names sbCreateJobCompanyFileRefs as a JS helper.
- No migration: uses existing job_files table with related_entity_type='company_file', related_entity_id=UUID.
- virtual row shape: category='Communications', subcategory per SUBCATEGORY_FOR map (Insurance→Insurance, License→License, Tax→Tax, else Compliance), client_visible=true.
- related_entity_id column is UUID type (not text as blueprint SQL shows — no cast needed in JS path).
- Files: avenstone-vite/src/lib/companyFiles.js (+sbCreateJobCompanyFileRefs, +SUBCATEGORY_FOR const), avenstone-vite/src/components/jobs/JobsScr.jsx (import + non-blocking call at line ~107).
- Smoke test: not live-verifiable from this session (requires creating a new job with a client-visible company file in the live app). Steps 1-7 from the prompt require manual testing: blueprint says ClientPortal already reads job_files WHERE client_visible=true — virtual rows land there naturally.
- Existing jobs do NOT see newly-uploaded client-visible files (static snapshot per blueprint Locked Decision 3 open question answer: option (a) — leave old virtual rows pointing to archived file, new jobs get new rows). Backfill is out of scope v1 (blueprint Out of Scope: "Retroactive virtual row update").
- Commit: 9f97d35. Pushed to main.
- Next: Phase 3b — sub portal "Company Documents" section (direct query, no virtual rows). Phase 5 watchdog.

[LOG — 2026-05-27 — COST_PLUS_AUDIT.md shipped]
- Action: Read-only audit of cost-plus mechanics. Findings in COST_PLUS_AUDIT.md at repo root. Commit: 50553d9.
- Key finding: TWO parallel cost-plus systems exist: (1) legacy job_cost_items+job_cost_invoices (read by ClientPortal), (2) new job_transactions ledger (no cost-plus awareness). They are not connected. Draw composer must build on job_transactions; job_cost_items deprecation is a separate arc decision.
- Secondary finding: job_transactions.draw_number INT already exists as a soft link to draw_schedules (no FK), and draw_schedules has no line items table. Phase 1 needs draw_id UUID FK + draw_line_items table + reimbursement_status + markup_pct on job_transactions.
- Next: write COST_PLUS_ARC.md blueprint based on findings + Kalin's answers to the 5 open questions in the audit.

[LOG — 2026-05-27 — COMPANY_FILES_ARC Phase 3b shipped — sub portal direct read]
- Action: Added sbLoadCompanyFilesForSub helper (direct query on company_files with .contains('visible_to_roles', ['sub']) + lifecycle_status='active'). Built read-only sub portal Company Documents section with View button (signed URL). Mounted as new 'docs' tab in SubPortal.jsx, visible to all subs.
- Pattern A confirmed (direct read, no snapshot — distinct from Phase 3a's job_files copy mechanism for client visibility).
- RLS: cf_tenant_select already allows subs to SELECT from company_files within their tenant (all authenticated tenant members). No RLS change needed. visible_to_roles filter applied at query time in sbLoadCompanyFilesForSub.
- New files: avenstone-vite/src/components/sub/CompanyDocsSection.jsx. Modified: avenstone-vite/src/components/sub/SubPortal.jsx (import, TABS entry, render), avenstone-vite/src/lib/companyFiles.js (helper).
- UI: grouped by category (CATEGORY_ORDER), ExpirationBadge (red/amber/green), CategoryBadge with per-category color palette, View button → sbSignCompanyFileUrl → window.open. Loading/empty/error states.
- Smoke test: SQL-verified (policies confirmed). Live-test blocked (no sub account this session). Per-step verification requires sub login.
- Build: ✓ clean (638ms). Commits: 5f601de (helper), d9e597b (UI). Both pushed to main.

[LOG — 2026-05-27 — COST_PLUS additive audit — prepayment / client credit pool]
- Action: Appended prepayment/client-credit audit section to COST_PLUS_AUDIT.md (165 lines added). Read-only. No code or schema changes. Commit: 907d97e.
- Key findings:
  1. No credit pool table exists — no client_credits, prepayments, escrow, retainer tables anywhere in the schema.
  2. client_deposit TYPE exists in job_transactions but is unused by Stripe webhook and Master Agent log_payment verb (both hardcode type='client_payment'). Deposit type is manual-entry only.
  3. Phase gate bug: checkDepositPaid in phaseGates.js queries type='client_payment' only — misses any deposit recorded as type='client_deposit'. One-line fix (OR condition) — can ship standalone.
  4. No allocation table: invoice_id on job_transactions is the only linkage between payments and invoices. Manual transactions leave it null. No way to say "apply $3k of $5k deposit to Draw 1."
  5. Stripe overpayment: silent excess — amount_paid accumulates above total_amount, no flag/credit row/notification.
  6. No "client credit available" UI surface anywhere in the app.
  7. sbLoadJobFinancialSummary.client_owes is the only credit-balance proxy (contract_total - total_in) — blunt, conflates deposits with invoice payments.
  8. draw_schedules.paid_amount only updates when Stripe fires against an invoice.draw_id. Pre-invoice deposits never credit a draw.
- Arc shape updates: Phase 2 draw composer needs "Client Credit Available" line; Phase 5 needs record_deposit and apply_credit verbs.
- Open Q: whether to build a formal credit pool table (option A/B) or enforce invoice-before-payment discipline going forward (option C).
- Existing files with visible_to_roles=['sub'] immediately visible to subs on refresh (Pattern A — no backfill needed unlike Phase 3a).
- Next: Phase 5 (expiration watchdog) — alert owner/PM when COI/license expires. Phase 4 (Master Agent verb) if scoped separately.

[LOG — 2026-05-27 — checkDepositPaid bug fix]
- Action: Phase gate function checkDepositPaid was checking only type='client_payment', missing manually logged client_deposit rows. Changed .eq('type','client_payment') → .in('type',['client_payment','client_deposit']) in all three copies.
- Copies fixed: (1) avenstone-vite/src/lib/phaseGates.js line 89, (2) supabase/functions/ai-field-agent/index.ts line 48, (3) supabase/functions/ai-master-agent/index.ts line 53.
- Surfaced by: COST_PLUS_AUDIT.md prepayment additive audit (Finding #3).
- Stranded jobs: ZERO — live DB has no job_transactions rows with type='client_deposit' (all 9 inbound rows are type='client_payment'). Bug was latent, not yet triggered in practice.
- Edge functions: ai-field-agent + ai-master-agent auto-redeploy via GitHub Actions on push to supabase/functions/**. No manual redeploy needed.
- Commit: 68c41b9. Pushed to main.
- Lesson: enum drift between manual data entry path (client_deposit available in TransactionModal) and webhook/verb path (Stripe + Master Agent always write client_payment) silently breaks downstream gates. Every type-based gate must be an enum-aware .in() covering all valid variants, not a single .eq().
- Next: cost-plus blueprint conversation (open questions in COST_PLUS_AUDIT.md).

[LOG — 2026-05-27 — COMPANY_FILES_ARC Phase 5 shipped — expiration watchdog]
- Action: Built full Phase 5 watchdog chain — scheduled_actions producer helpers, consumer edge function, daily GitHub Actions schedule, job-level expiration banner.
- Helpers added to companyFiles.js:
  sbScheduleCompanyFileExpirations(companyFileId, expirationDate) — writes 3 scheduled_actions rows (30d/14d/0d). Auto-called by sbUploadCompanyFile when metadata.expirationDate set.
  sbCancelCompanyFileScheduledActions(companyFileId) — cancels pending rows. Auto-called by sbReplaceCompanyFile after successful replace.
- Schema adjustments vs blueprint: todos.priority valid values = 'low'|'medium'|'high' (no 'urgent'/'normal'). Blueprint 'normal'→'medium', 'urgent'→'high'. scheduled_actions same. confirmed via information_schema.
- company-files-watchdog/index.ts: service-role client. Processes scheduled_actions WHERE rule_key LIKE 'cf_exp_%' AND status='scheduled' AND fire_at<=NOW(). For each: load company_file, skip archived, get owner+PM profiles, check existing open todos (idempotency), create todos, mark fired.
- Idempotency: checks todos WHERE related_entity_type='company_file' AND related_entity_id=<uuid> AND assigned_to_user_id=<prof.id> AND status='open'. Skips if open todo exists for that profile+file combination.
- Schedule: GitHub Actions .github/workflows/company-files-watchdog.yml. Daily at 14:00 UTC (~9am CT). Same pattern as credential-check.yml. workflow_dispatch for manual triggers.
- No new migration: all tables (scheduled_actions, todos) already exist with correct columns.
- CompanyFileExpirationBanner.jsx: mounted in JobDet.jsx tab content top. Queries company_files WHERE client-visible AND lifecycle_status='active' AND expiration_date<=today. Red banner listing expired files. Staff-only (owner/PM/rep). Undismissable (resolves when file renewed/archived).
- Build: ✓ clean (793ms). Commits: ded524c (helpers), c184244 (scanner+banner). Pushed.
- Smoke test: SQL-level only (no live test this session). Steps 1-7 require manual verify with upload of expiring file + watchdog trigger.
- COMPANY_FILES_ARC v1 substantially complete. Phase 4 (Master Agent upload_company_file verb) remains. All client/sub/staff surfaces shipped.
- Next: Phase 4 (Master Agent verb) OR pivot to other arc.

[LOG — 2026-05-27 — COST_PLUS_ARC blueprint shipped]
- Action: Wrote COST_PLUS_ARC.md at repo root. 6-phase arc covering cost-plus float tracking, draw composer, reimbursement cascade, client portal migration. ~640 lines.
- 20 locked decisions including: two markup rates (labor_markup_pct + material_markup_pct on jobs table), bucket = inbound rows with invoice_id IS NULL (no separate credit pool table), per-draw client portal view, type-to-markup mapping (sub_payout/labor → labor_markup_pct; everything else → material_markup_pct) with per-row override, reimbursement state machine on out rows (NULL → unreimbursed → in_draw → reimbursed).
- Reuses: draw_schedules, invoices, sbMarkInvoicePaid, existing transactions ledger. Net-new: jobs.labor_markup_pct + material_markup_pct, job_transactions.draw_id + reimbursement_status + markup_pct + reimbursed_at, draw_line_items table (with forward-looking rows support), BEFORE INSERT trigger for cost-plus defaulting, cascade_draw_paid_to_transactions function, reverse_draw_paid_cascade function.
- 6 phases for v1 (~14 prompts). Phase 0 partially shipped (checkDepositPaid OR fix from earlier today). Phase 0 remaining: Stripe overpayment → surplus inbound bucket row.
- Phase 6 (client portal migration) is the cleanup that lets Avenstone finally deprecate the legacy job_cost_items system.
- Audit basis: two prior cost-plus audit sessions (COST_PLUS_AUDIT.md + prepayment additive audit). Three locked decisions from Kalin answered the 5 open questions.
- Commit: 40d4634. Pushed to main.
- Open: Phase 1 dispatch next.

[LOG — 2026-05-27 — COMPANY_FILES_ARC Phase 4 shipped — Master Agent upload_company_file verb]
- Action: Built standalone extraction edge function + wired upload_company_file confirm-gated verb into ai-master-agent. COMPANY_FILES_ARC fully complete.
- NEW supabase/functions/ai-extract-company-file/index.ts:
  - Standalone admin UI path for CompanyFilesScr.jsx (future wiring — not called yet).
  - Input: { storagePath, storageBucket }. Auth: JWT + owner/PM role check.
  - Haiku extraction: type (COI/General Liability/Workers Comp/Bond/License/W-9/Other), expiration_date, effective_date, policy_number, issuer, coverage_amount.
  - max_tokens: 512. PDF beta header when isPdf. Returns { ok, extracted }.
  - Cost: ~$0.001-0.002/call. User-triggered only.
- EDIT supabase/functions/ai-master-agent/index.ts (7 edits):
  1. CONFIRM_TOOLS: added 'upload_company_file' (confirm card gate).
  2. TOOLS array: added upload_company_file tool definition (file_type required, expiration_date/policy_number/issuer/visible_to_subs/visible_to_clients optional).
  3. CF_EXTRACT_PROMPT constant: embedded Haiku system prompt (mirrors edge fn, avoids inter-function HTTP). Defined before extractLatestUserFile.
  4. extractLatestUserFile() helper: extends extractLatestUserImage to capture both image and PDF document blocks. Returns { data, mime, isPdf }.
  5. Pre-confirm block: inline Haiku extraction merges fields into inputObj; file bytes stashed as _image_data/_image_mime/_is_pdf for executor (same pattern as log_receipt receipt photo — never forwarded through Claude tool_use input).
  6. Executor case 'upload_company_file': role check (owner/PM), base64 decode, upload to company-files bucket, archive existing active file of same type, INSERT company_files row (category derived from type via CF_CATEGORY_MAP), schedule 3 watchdog rows if expiration_date set (non-blocking — same thresholds as Phase 5).
  7. describeConfirmAction case: "Upload {type} · {issuer} · expires {date} · #{policy} · visible to {subs/clients}."
  8. System prompt: WHAT YOU CAN DO (added 'upload company files'), confirm-gated tools list (added upload_company_file), new COMPANY FILE WORKFLOW section after SUB INVOICE WORKFLOW.
- Commit: d5e2740 (rebased on ad23ddd, pushed as 5e686fe). Pushed to main.
- COMPANY_FILES_ARC: ALL PHASES COMPLETE (1 schema, 2 admin UI, 3a client ref, 3b sub portal, 4 agent verb, 5 watchdog).
- Open: CompanyFilesScr admin UI can now wire "Extract with AI" button → ai-extract-company-file edge fn (not built yet — extraction is available on demand from Phase 4 master agent path). Live smoke test for upload_company_file verb requires attaching a COI image in the master agent chat.
