# DOC CLASSIFICATION REPORT
**Date:** 2026-06-19  
**Method:** Live code verification (component files, migrations, edge functions, supabase.js helpers)  
**Scope:** All root `.md` files except the 6 keepers + 4 docs/ files. Read-only — nothing moved.

---

## Re-verification of 5 Prior Audit Findings

All 5 confirmed against live code:

| Finding | Evidence |
|---------|----------|
| SUB_INVOICES was claimed "not built" by arc doc | `SubInvoicesSection.jsx` EXISTS; migrations `20260527000000_sub_invoices_arc_phase_1.sql`+ variants; Master Agent verbs `log_sub_invoice` / `log_sub_payment` / `approve_sub_invoice` at lines 159-160 of ai-master-agent/index.ts |
| COMPANY_FILES was claimed "not built" by arc doc | `CompanyFilesScr.jsx` EXISTS; `20260527040000_company_files_arc_phase_1.sql`; `upload_company_file` verb at line 162 ai-master-agent/index.ts (Phase 4 shipped too) |
| ESTIMATOR Phase 1.5 (Rate Book schema) | `20260616100000_rate_book_schema.sql` EXISTS; `rate_book_labor` + `rate_book_material` tables live; `RateBookScr.jsx` EXISTS |
| Contract send-field mismatch (sbSendEstimateEmail) | supabase.js:1402 uses `to: job.client_email` — already fixed in live code |
| DAILY_LOG claimed as shipped in arc doc | `LogsTab.jsx` has 5 hits for `sbSubmitDailyLog` / `sbGenerateDailyLogDraft` / `sbSendDailyLog` |

---

## New Finding: UNIFIED_FILES_ARC doc is stale in both directions

The UNIFIED_FILES_ARC Phase Plan table marks all 5 phases as **"Planned"** — but Phases 1-2 are clearly shipped (`job_files` migration + `FilesTab.jsx` fully built). Simultaneously, `DocsTab.jsx` still exists, confirming Phase 3 (surface rewiring) is NOT complete. Doc was never updated after Phase 1-2 shipped.

---

## Classification Table

| Filename | Bucket | Code Evidence | Recommended Destination | Reason |
|----------|--------|---------------|------------------------|--------|
| **AGENT_AUDIT.md** | B | Audit header: "Read-only audit of Avenstone agent layer, 2026-06-02. Every claim traced to verified file+line." | Archive slug `agent-audit-2026-06-02` | Point-in-time audit; findings informed AVEN_MERGE_AUDIT and master-agent hardening — already acted on |
| **AGENT_CARDS_ARC.md** | A | `src/lib/agentCards.js` EXISTS; MasterAgent confirm cards live; doc marks Phases 1-7 shipped 2026-05-18–20 | Archive pointer `agent-cards-arc-2026-05` | v1 arc explicitly complete per doc; all phases confirmed in code |
| | | **Carve-out:** Phase 6 (field voice rendering of cards) explicitly deferred — gated on VOICE_AGENT Phase 3+. Must surface in VOICE_AGENT_ARC or standalone when voice hands-free ships. | | |
| **AGENT_INTELLIGENCE_ARC.md** | C | Absent: no `actor_memory` table in any migration; no sub-agent edge functions beyond master/field; grep for `page_agent` or `actor_agent` returns 0 hits | docs/arcs/ | Entire meta-layer (page agents, actor agents, cross-tenant benchmarks) is genuinely unbuilt north-star architecture |
| **AGENT_OPS_ARC.md** | C | Shipped (phases 0-2): `scheduled_actions` migration `20260520100000_scheduled_actions.sql`; `add_todo` delegation + `notify_team_member` verb in ai-master-agent. Unbuilt (phases 3-6): doc explicitly says "Phase 3-6 not started" | docs/arcs/ | Active future work (scheduler cron, reminder verbs, watchdog rules, daily-log hook) — doc must stay live |
| | | **Carve-out (shipped):** Phases 0-2 complete — scheduled_actions schema, delegation verbs, priority enum reconciliation. | | |
| **ANTI_SURPRISE_ENGINE_ARC.md** | C | Shipped: `anti-surprise-generator` + `anti-surprise-dispatcher` edge functions; `tenant_playbook_items` table; `vigilance-runner` cron (11 rules). Unbuilt: Phases 2-4 (dependency cascade engine, guideline schedule gen, scheduling agent); Phase 5 draw-poke float rule outstanding | docs/arcs/ | Active design doc for 3+ unbuilt phases; Phase 2 (dependency engine) is load-bearing for SCHEDULING_INTELLIGENCE_ARC |
| | | **Carve-out (shipped):** Phase 1 (walkthrough checklists + anti-surprise cron) + Phase 5 vigilance-runner fully live. Push double-trigger idempotency fix still outstanding (Phase 0 prereq). | | |
| **APP_REVIEW_2026-05-25.md** | B | Header: "structural audit of the codebase...Working doc. Findings from..." | Archive slug `app-review-2026-05-25` | Point-in-time review; findings consumed into subsequent arc work |
| **AVEN_MERGE_AUDIT.md** | B | Header: "Generated: 2026-06-16. Read-only audit — no code changed." | Archive slug `aven-merge-audit-2026-06-16` | Audit of master/field agent divergence; findings live in MASTER_BUILD_PLAN and future AVEN_MERGE_ARC — no ongoing design content |
| **COMPANY_FILES_ARC.md** | C | Shipped: `20260527040000_company_files_arc_phase_1.sql`; `CompanyFilesScr.jsx` (Phase 2 admin UI); `upload_company_file` verb in ai-master-agent (Phase 4). Unbuilt: Phase 3a/3b (client/sub portal visibility via job_files virtual rows); Phase 5 (watchdog + expiry banner `CompanyFileExpirationBanner.jsx`) | docs/arcs/ | Phases 3a/3b/5 are active unbuilt work with design decisions required (virtual row propagation, cron watchdog) |
| | | **Carve-out (shipped):** Phases 1 (schema + `company_files` table), 2 (admin UI), 4 (Master Agent verb) confirmed live. | | |
| **CONTRACT_SIGNING_ARC.md** | C | Partially broken: `ClientSignContractModal.jsx` EXISTS; `contract_signed` / `contract_signed_at` on `jobs` table; `contract_signatures` table. But doc describes all 6 gaps as unresolved — Gap 1 (no proposal in contract = LEGAL EXPOSURE) is the most urgent. | docs/arcs/ | Blueprint only per doc header. 6 open gaps, highest has legal stakes. `ClientSignContractModal.jsx` exists but signs a boilerplate with no line items/price — legal exposure is real and unresolved. |
| | | **Carve-out (partial):** Signing UI + `contract_signatures` table + `contract_signed_at` column exist in code. But the arc claims these are the BROKEN state that needs fixing, not the shipped state. | | |
| **COST_PLUS_ARC.md** | C | Shipped: `checkDepositPaid` OR fix (phaseGates.js); `20260527050000_cost_plus_phase_1a_schema.sql` (labor_markup_pct, material_markup_pct, draw_line_items, reimbursement_status). Unbuilt: Phases 2-6 (draw composer UI, paid cascade, float visibility stat cards, Master Agent verbs, client portal migration) | docs/arcs/ | Phases 2-6 are substantial active future work; draw composer UI has been in backlog since Phase 1A shipped |
| | | **Carve-out (shipped):** Phase 0 (checkDepositPaid fix) + Phase 1A schema live. `draw_line_items` table, `reimbursement_status` column, `labor_markup_pct`/`material_markup_pct` on jobs all confirmed. | | |
| **COST_PLUS_AUDIT.md** | B | Header: "Read-only audit conducted 2026-05-27. No code or schema touched. Findings inform the COST_PLUS_ARC.md blueprint session." | Archive slug `cost-plus-audit-2026-05-27` | Pre-build audit; findings absorbed into COST_PLUS_ARC.md design — no active design content |
| **DAILY_LOG_ARC.md** | A | `LogsTab.jsx` imports `sbSubmitDailyLog`, `sbGenerateDailyLogDraft`, `sbSaveDailyLogClientMessage`, `sbSendDailyLog` — 5 confirmed hits. Doc marks all 5 phases shipped. `daily_logs` table live. Client portal shows approved logs. | Archive pointer `daily-log-arc-2026-05` | All 5 phases confirmed shipped; no active design content remaining |
| **ESTIMATOR_KNOWLEDGE_ARC.md** | C | Shipped (Phase 1.5 only): `20260616100000_rate_book_schema.sql`; `rate_book_labor` + `rate_book_material` tables; `RateBookScr.jsx`; `deviationGate.js`. Unbuilt: Phases 1-7 (rate reconciliation, ai-estimator Supabase wiring, cite-or-flag, guided interview, fallback config, batch unknowns, learn loop) | docs/arcs/ | Most of the arc (7 phases) is unbuilt; wiring ai-estimator to Rate Book (Phase 2) is the highest-priority work in MASTER_BUILD_PLAN Phase 1 |
| | | **Carve-out (shipped):** Phase 1.5 (Rate Book schema + UI), Keystone Decisions locked (6 decisions, 2026-06-16), `source_label` column on estimate_line_items, deviation gate (Slice 6.0). | | |
| **EXECUTION_ARC.md** | E | Full content: "See CLAUDE_ARCHIVE.md § execution-arc-2026-05". Slug confirmed at CLAUDE_ARCHIVE.md:1295 | Leave as-is | Already a one-line pointer; slug verified present |
| **FIELD_OPUS_ARC.md** | C | Shipped (Supabase side): `20260524110000_field_opus_messages.sql`; `FieldOpusPanel.jsx`; `field-opus-chat` + `field-opus-fetch-file` + `field-opus-db-query` edge functions. Critical gap: VM `/dispatch-interactive` endpoint NOT built — Phase 4 dispatch is a dead end without it. Phase 6 (polish) deferred. | docs/arcs/ | Core dispatch capability (VM endpoint) is unbuilt; Kalin-only dev console works but agentic dispatch to VM is the arc's main point |
| | | **Carve-out (shipped):** Phases 1-3 fully live (schema, read-only edge fns, `field-opus-chat` brain). Phase 5 client UI live. Phase 4 Supabase side complete — blocked on VM infrastructure. | | |
| **FINANCIALS_PLAN.md** | A | Phases 3-6 all marked shipped in doc + confirmed: `FinancialsTab.jsx`, `job_transactions` table, `qbExport.js`, draw_schedules + invoices tables. Phase 7 (receipt vision extraction) explicitly "unscheduled." | Archive pointer `financials-plan-2026-04` | Design + status doc for Phases 3-6 fully shipped. Phase 7 is the only future item. |
| | | **Carve-out:** Phase 7 (Haiku vision receipt extraction, unscheduled). Must land in a future arc or backlog item — not lost to archive. | | |
| **FLOOR_PLAN_LAYOUT_ARC.md** | C | Shipped (Phases 1-5c): `normalize.js`, `layoutCheck.js`, `FloorPlanCanvas.jsx`, floor plan migrations, `pdf.js` renderer. Unbuilt: Phase 5d (snap polish), Phase 5e (versions + send to client). Doc explicitly: "Phase 5e — closes the workflow loop — highest priority remaining" (3 prompts). | docs/arcs/ | Phase 5e is the highest-priority remaining item per both this doc and MASTER_BUILD_PLAN; sending floor plan to client is the full workflow closure |
| | | **Carve-out (shipped):** Phases 1-5c-5 all confirmed live. Full basement scenario (move wall, add closet, merge rooms, add laundry) covered. Capture-time warnings also remain (1-2 prompts). | | |
| **GOD_AGENT_ARC.md** | C | Partially scaffolded: `pricing_policy` JSONB column on tenants (Slice 6.0, migration `20260618100000_pricing_policy.sql`). Unbuilt: No GodAgentTab component; no conversational bulk pricing; no action_log table; no autopilot machinery | docs/arcs/ | pricing_policy column is the only shipped piece; all capabilities (B1 Rate Review, B2 bulk pricing, B3 policy edit, B4 capacity advisor) are future |
| | | **Carve-out (partial foundation):** `pricing_policy` column live; `approval_status` + `approval_meta` on job_estimates (Slice 6.0) live. These are schema prerequisites for B1. | | |
| **INVOICING_ARC.md** | E | Full content: "See CLAUDE_ARCHIVE.md § invoicing-arc-2026-05". Slug confirmed at CLAUDE_ARCHIVE.md:1637 | Leave as-is | Already a one-line pointer; slug verified present |
| **MASTER_BUILD_PLAN.md** | KEEPER | Added 2026-06-19. Not one of the original 6 keepers but functionally equivalent — the single ordered source of truth for the build. Permanent root fixture. | Keep at root — no action | Permanent keeper; added last session as the 7th root planning doc (6-doc cap should be updated to include this) |
| **MODEL_B_AUDIT.md** | B | Header: "MODEL B AUDIT — Avenstone Job Lifecycle State, Date: 2026-06-16, Auditor: Claude Sonnet 4.6 (read-only, no code changes)." | Archive slug `model-b-audit-2026-06-16` | Lifecycle state audit; findings absorbed into MASTER_BUILD_PLAN — no active design content |
| **PROOF_ARC.md** | C | Shipped (Phase 1 only): `20260526220000_proof_arc_phase_1.sql` adds `photos.category`, `jobs.before_photos_required`, `change_orders.co_condition_bypass_reason` / `co_fix_bypass_reason`. Unbuilt: Phases 2-6 (CO photo gate, blocking-todo primitive, before photos, delivery request, polish) | docs/arcs/ | Phases 2-6 are active future work; Phase 3 (blocking-todo primitive) is explicitly reusable across multiple future arcs — cannot archive |
| | | **Carve-out (shipped):** Phase 1 schema (`photos.category` enum, bypass columns on change_orders) confirmed live. Schedule-item soft banner (advisory) also exists in ScheduleTab. | | |
| **PUSH_NOTIFICATIONS_ARC.md** | A | Phases 1-5 explicitly marked "✅ SHIPPED 2026-05-24" in doc. Confirmed: `push_subscriptions` table, `send-push` edge function, `notification-push-fanout` edge function + DB trigger, `push.js` in src/lib. Phase 6 marked "DEFERRED, blueprint only." | Archive pointer `push-notifications-arc-2026-05` | Phases 1-5 (APNs v1) fully confirmed in code. Phase 6 is an explicitly bounded future slice. |
| | | **Carve-out:** Phase 6 (Web Push / PWA) is explicitly deferred. Must surface in future prompt when browser/Android becomes priority. Blueprint is intact in the doc's Phase 6 section. | | |
| **PUSH_NOTIFICATIONS_ARC_APNS_CERT_SETUP.md** | B | Header: "manual configuration Kalin must complete in Apple Developer Portal and Supabase before Phase 5 can go live." APNs is live, Phase 5 shipped. This was a one-time setup checklist. | Archive slug `apns-cert-setup-2026-05` | Operational checklist for a one-time task that's complete; no active design content |
| **ROLE_DASHBOARDS_ARC.md** | C | Partially scaffolded: `HomeScr.jsx` (morning brief) exists. But 5-role-configurable dashboards + `sbLoadHomeDashboard` rollup are absent: grep finds no `sbLoadHomeDashboard` in supabase.js; no role-config per dashboard structure | docs/arcs/ | HomeScr is a single generic morning brief, not the 5-role configurable system this arc describes. Active future design. |
| | | **Carve-out (partial):** `HomeScr.jsx` (morning brief) and `OwnerPortal.jsx` (intelligence dashboard) are shipped — they partially satisfy the Owner role. PM/Rep/Sub/Client-specific surfaces are unbuilt. | | |
| **SCHEDULING_INTELLIGENCE_ARC.md** | C | Partially scaffolded: `trade_dependencies` table + 20 seed rules (migrations `20260604320000_` + `20260604330000_`). `ScheduleTab.jsx` (flat list) + `sbCheckResourceConflicts` helper live. Absent: no cascade engine, no critical path, no AI scheduling agent, no Gantt | docs/arcs/ | 13-phase arc describing dependency graphs, AI-driven cascade, resource models — almost entirely unbuilt; trade_dependencies and ScheduleTab are foundation only |
| | | **Carve-out (partial):** trade_dependencies table seeded (20 GC rules), sbCheckResourceConflicts in supabase.js, schedule_items full schema live. These are Phase 1 foundations. | | |
| **SCOPE_RISK_ARC.md** | C | Absent: no scope_risk table in any migration; no "Potential Considerations" component; grep for `scope_risk` returns 0 hits | docs/arcs/ | Entirely unbuilt; gated on ESTIMATOR_KNOWLEDGE_ARC (Rate Book wiring) per blueprint |
| **SELECTIONS_ARC.md** | C | Absent: no `selection_templates`, `selection_requests`, `job_selections` tables in any migration; no SelectionsTab component; confirmed via grep | docs/arcs/ | Entirely unbuilt; 7 phases, ~13 Sonnet prompts ahead |
| **SUB_INVOICES_ARC.md** | A | `SubInvoicesSection.jsx` EXISTS (full workflow: pending_review/approved/partially_paid/paid/disputed/voided); `20260527000000_sub_invoices_arc_phase_1.sql` + 4 variant migrations; `subInvoices.js` writes to `job_transactions` (Phase 4 cash accounting live); Master Agent verbs `log_sub_invoice`/`log_sub_payment`/`approve_sub_invoice` at ai-master-agent lines 159-161 (Phase 5 live) | Archive pointer `sub-invoices-arc-2026-05` | All Phases 1-5 confirmed shipped — schema, UI, upload/entry flow, cash accounting, Master Agent verbs. Doc self-describes plan but code is complete. |
| | | **Carve-out:** Phase 6 (sub portal submission — sub uploads their own invoice via portal) is explicitly deferred. Must surface in SUB_WORKFLOW_ARC or sub portal expansion work. | | |
| **TENANT_ONBOARDING_ARC.md** | C | Absent: no `bid_model_config` table in any migration; no TenantOnboardingWizard component; `AiSetupWizard.jsx` (7-question AI knowledge setup) is not the same thing | docs/arcs/ | Entirely unbuilt; white-label spine for second tenant onboarding — 7 phases, ~21 prompts |
| **TODO_NOTIFICATIONS_ARC.md** | C | Partially scaffolded: `todo_delegated` notification type exists in schema (notifications_type_check). But: `MyTodosScreen` has no `pendingTodoId` focus capability; notification INSERT in ai-master-agent drops the new todo's id (no deeplink payload); no trigger logic to distinguish agent-source todos. | docs/arcs/ | Core feature (notify on agent-assigned todos + tap-to-focus) is unbuilt; schema has the type but not the routing |
| | | **Carve-out (partial):** `todo_delegated` notification type + `buildDeepLink('/job/<jobId>/todos')` path already exist. Foundation requires 1-prompt audit (Phase 1) to verify exact gap before building. | | |
| **UNIFIED_FILES_ARC.md** | C | Shipped (Phases 1-2): `20260526200000_unified_files_arc_phase_1.sql`; `FilesTab.jsx` (tree/grid/recent/bulk-tag all live); `inferFileCategory.js`; `job-files` private bucket. Unbuilt: Phase 3 (DocsTab.jsx STILL EXISTS — surface rewiring not done, PhotosTab not deprecated); Phase 4 (portal views); Phase 5 (polish). **Doc self-contradicts: marks all phases "Planned" despite Phases 1-2 clearly shipped.** | docs/arcs/ | Phase 3 (rewiring existing photo/doc surfaces, deprecating DocsTab, rewiring Master Agent log_receipt) is active unbuilt work with real scope |
| | | **Carve-out (shipped):** Phases 1-2 confirmed live despite doc saying "Planned." `job_files` table, `tenant_file_subcategories`, `FilesTab.jsx`, floor-plan bridge migration (`20260526210000_`), draws/invoices category migrations all shipped. Doc status column is stale. | | |
| **VOICE_AGENT.md** | C | Shipped (code, not device-verified): Phases 1-4.5 — `@capgo/capacitor-speech-recognition@8.1.2`, `@capacitor-community/text-to-speech@8.0.0` installed; hold-to-tap mic, TTS readback, voice-confirm wired in MasterAgent. **Device verification pending** (TestFlight) per doc. Phase 5+ (hands-free/continuous) not started. | docs/arcs/ | Living decision log with active Phase 5+ scope; device verification of shipped phases still needed |
| | | **Carve-out (shipped/pending):** Phases 1-4.5 code confirmed. Voice confirm for pending_action cards shipped. Device quality check required on TestFlight before declaring stable. | | |
| **VOICE_AGENT_AUDIT.md** | E | Full content: "See CLAUDE_ARCHIVE.md § voice-agent-audit-2026-05-08". Slug confirmed at CLAUDE_ARCHIVE.md:1647 | Leave as-is | Already a one-line pointer; slug verified present |
| **docs/AI_CONSULTATION_BLUEPRINT.md** | A | `ConsultationTab.jsx` EXISTS; `consultation/AmbientPanel.jsx`, `consultation/MeasurePanel.jsx`, `consultation/GapResolutionModal.jsx` all exist; `consultation_sessions` + `consultation_measurements` tables per CLAUDE.md; `ai-intake` + `process-transcript` + `generate-estimate-from-session` + `measure-guide` edge functions per CLAUDE.md | Archive slug `ai-consultation-blueprint-2026-04` | Pre-build spec written April 2026; feature is shipped. Doc can be retired. |
| **docs/AUDIT_2026-04-30_estimate_procurement.md** | B | Header: "Audit — Estimate + Procurement Arc, Date: 2026-04-30, Method: live DB queries + file reads — no speculation" | Archive slug `audit-estimate-procurement-2026-04-30` | April 2026 point-in-time audit of estimate + procurement; findings long since acted on |
| **docs/FLOOR_PLAN_EDITOR_ARC.md** | C | Doc explicitly parked: "Status: PARKED / BACK-BURNERED." Future model (click-to-reference + talk-to-instruct) not built. `FloorPlanEditorScr.jsx` described as dead end. | docs/arcs/FLOOR_PLAN_EDITOR_ARC.md (already in docs/) | Design decision captured for future model; active design content (chosen approach documented) — keep |
| **docs/MATERIAL_SELECTION.md** | C | Absent: no `job_selections` or `job_selection_stars` tables in any migration (grep 0 hits). `MaterialsTab.jsx` exists but is materials-tracking, not AI-driven selection. Doc says "v1.0 in progress (April 2026)" — **feature was never shipped.** | docs/arcs/MATERIAL_SELECTION.md | Distinct from SELECTIONS_ARC (this is client self-service AI catalog; SELECTIONS_ARC is PM-driven trade selections — tile color, paint color). Both are unbuilt but are different features. |

---

## Duplicate Investigation Results

**Suspected pair 1: AGENT_INTELLIGENCE_ARC + GOD_AGENT_ARC**  
**Verdict: NOT DUPLICATES.** Distinct scope.
- AGENT_INTELLIGENCE_ARC = compounding-brain meta-layer: page agents (per domain), actor agents (per person), cross-tenant anonymized benchmarks, lead marketplace (future). Architecture for how AI compounds across the whole platform.
- GOD_AGENT_ARC = specific owner-facing AI tab for pricing control: bulk rate adjustments via conversation, pricing_policy editing, capacity advisory. A specific capability within the intelligence layer.
- GOD_AGENT references TENANT_ONBOARDING_ARC as a sibling. AGENT_INTELLIGENCE is the north-star. Both stay as separate C-classified docs.

**Suspected pair 2: UNIFIED_FILES_ARC + COMPANY_FILES_ARC**  
**Verdict: NOT DUPLICATES.** Designed as siblings.
- UNIFIED_FILES_ARC = per-job file system (photos, receipts, floor plans, proposals all in one job-level surface per job).
- COMPANY_FILES_ARC = tenant-level compliance docs (COI, licenses, W-9 that apply to ALL jobs — a virtual reference, not a copy).
- Both docs explicitly reference each other as the peer system. COMPANY_FILES "augments" UNIFIED_FILES by adding a tenant-level peer. No merge needed.

---

## Summary Count

| Bucket | Count | Docs |
|--------|-------|------|
| **A — SHIPPED** | 6 | AGENT_CARDS_ARC, DAILY_LOG_ARC, FINANCIALS_PLAN, PUSH_NOTIFICATIONS_ARC, SUB_INVOICES_ARC, docs/AI_CONSULTATION_BLUEPRINT |
| **B — AUDIT/SNAPSHOT** | 7 | AGENT_AUDIT, APP_REVIEW_2026-05-25, AVEN_MERGE_AUDIT, COST_PLUS_AUDIT, MODEL_B_AUDIT, PUSH_NOTIFICATIONS_ARC_APNS_CERT_SETUP, docs/AUDIT_2026-04-30_estimate_procurement |
| **C — FUTURE ARC** | 21 | AGENT_INTELLIGENCE_ARC, AGENT_OPS_ARC, ANTI_SURPRISE_ENGINE_ARC, COMPANY_FILES_ARC, CONTRACT_SIGNING_ARC, COST_PLUS_ARC, ESTIMATOR_KNOWLEDGE_ARC, FIELD_OPUS_ARC, FLOOR_PLAN_LAYOUT_ARC, GOD_AGENT_ARC, PROOF_ARC, ROLE_DASHBOARDS_ARC, SCHEDULING_INTELLIGENCE_ARC, SCOPE_RISK_ARC, SELECTIONS_ARC, TENANT_ONBOARDING_ARC, TODO_NOTIFICATIONS_ARC, UNIFIED_FILES_ARC, VOICE_AGENT, docs/FLOOR_PLAN_EDITOR_ARC, docs/MATERIAL_SELECTION |
| **D — DUPLICATE** | 0 | None — both suspected pairs investigated and confirmed distinct |
| **E — ALREADY-POINTER** | 3 | EXECUTION_ARC, INVOICING_ARC, VOICE_AGENT_AUDIT |
| **KEEPER** | 1 | MASTER_BUILD_PLAN (added 2026-06-19 — 7th root planning doc; OPUS_RULES 6-doc cap should be updated to acknowledge it) |
| **Total classified** | **37** | 33 non-keeper root MDs + 4 docs/ files |

---

## Cannot-Confidently-Classify: None

All 37 docs classified with code evidence. No ambiguous cases remain.

---

## Flags for Kalin's Attention

1. **UNIFIED_FILES_ARC doc is stale in both directions.** It marks all phases "Planned" but Phases 1-2 are shipped. Phase 3 (DocsTab deprecation, surface rewiring) is genuinely not done. When this doc moves to docs/arcs/, update the Phase Plan table to reflect actual state.

2. **SUB_INVOICES_ARC doc never updated to mark phases shipped.** The code is fully built (all Phases 1-5) but the arc doc reads like an unbuilt plan. The archive slug entry should note this divergence.

3. **CONTRACT_SIGNING_ARC: Gap 5 (magic link verification) must be resolved before building anything else.** Doc explicitly flags this. If `send-contract-email` magic links don't work, the signing flow is dead on arrival.

4. **MASTER_BUILD_PLAN.md is now a 7th root planning doc.** The OPUS_RULES 6-doc cap was written before MASTER_BUILD_PLAN existed. Update OPUS_RULES to acknowledge MASTER_BUILD_PLAN as a permanent keeper (7-doc cap, or replace CLAUDE_INDEX slot since CLAUDE_INDEX doesn't exist yet).

5. **docs/MATERIAL_SELECTION.md + SELECTIONS_ARC.md describe overlapping territory but are NOT the same thing.** MATERIAL_SELECTION = client self-service AI product catalog (chat-driven). SELECTIONS_ARC = PM-driven trade selections (tile color, paint color, structured confirm-by workflow). If/when both are built, they'll share `job_selections` table. Coordinate schema at build time.

6. **FIELD_OPUS_ARC Phase 4 dispatch is a dead end without VM infrastructure.** `field-opus-dispatch-to-vm` edge function exists on the Supabase side but the VM `/dispatch-interactive` endpoint is not in the repo. Phase 4 is half-built. Unblocks when AUTO_FIX_ARC VM setup happens (same infrastructure).
