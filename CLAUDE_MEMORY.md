---
# Avenstone App — Session Memory Register
_Read this file at the start of every session. Append a new entry at the end of every session._

## How to use
- On session start: read this file top to bottom before doing anything
- Entries are logged automatically — no manual trigger needed
- Auto-consolidation triggers at 15+ entries on session start

---

## Project snapshot (as of 2026-04-22)

**Repo:** github.com/avenstonekc/avenstone-app
**Web deploy:** Vercel (auto on push to main)
**iOS deploy:** Codemagic → TestFlight (auto on push to main, see CLAUDE.md "iOS Build Pipeline")
**Stack:** React (Vite), Supabase, Capacitor 8 (iOS)
**Supabase URL:** https://cbfftukmhqvvjlrlnltk.supabase.co
**iOS bundle:** com.avenstonekc.avenstone · App Store Connect Apple ID 6762308583 · Codemagic app 69dfe87016fca50ea5f10d7b

**Tenants:**
- Tenant ID: 00000000-0000-0000-0000-000000000001
- Kalin auth ID: 8171742a-b586-4f13-be61-744e191a1896
- Blake auth ID: 066c8241-accb-490b-9f98-b8b7cb24c33b

**Active modules:** Job pipeline, leads screen, AI estimator, AI companion (per-job per-person), AI intake wizard (LiDAR scan → height → quality report → save to job or contact), AI field agent, AI home companion, master agent, AI pm-nightly alerts, AI knowledge base, AI setup wizard, LiDAR scanner (interior multi-room + exterior outline, GPS-stamped, quality meter, saves to job_lidar_scans + contact_lidar_scans, FloorPlanTab on JobDet), floor plan PDF (pdf.js, fixtures rendering), AI PM dashboard (owner-only, 30-day alert history), contract gen + signature pad, client portal, owner portal, sub portal + onboarding wizard + rate modal, ITB system, Gantt/list scheduler, PDF gen, consultation tab (ambient + measure mode), materials tab, public pages (completion, review, profile), contact sequences + sequence runner, address autocomplete, push notifications, Stripe payments, GHL webhook, Twilio inbound SMS, multi-tenant arch, unified financial ledger (job_transactions), QuickBooks CSV export

**Remaining / incomplete:**
- Lien waiver generation (pdf-lib preferred over jsPDF)
- Automated tenant provisioning (single-button onboarding script)
- LiDAR Phase 4: wing editor + large-space stitching (>1,500 sqft GPS-anchored multi-session)
- Floor plan PDF: single-room fixture rendering (rotation transform needed — deferred), dimension language overhaul
- Sub portal upgrades: PM-Sub direct chat, phase confirmation, CO submission (spec'd, not built)
- White-label onboarding wizard (replace 7-question AiSetupWizard)
- **Client material selector (MaterialSelectionScr)** — 949-line component exists at `src/components/ai/MaterialSelectionScr.jsx` but is NOT wired into any tab or portal. Client-facing tile/fixture picker. Needs to land on ClientPortal or a new JobDet tab before it ships. Do NOT treat as dead code in future architecture reviews.
- Phase 7 receipt vision extraction (Haiku, deferred — snap photo → auto-fill vendor/amount/date)
- IA cleanup backlog, sub financial visibility, notifications audit (all unscheduled)

**Retired / do not use:** MacInCloud (Codemagic replaced it — VM reset issues made it unusable), the old 3-step AI chat + manual grid AiIntakeWizard flow (replaced by LiDAR capture flow)

**Branding:** Navy #0A1F44 / Gold #C9A84C

---

## Financial System Rebuild (2026-04-23 to 2026-04-25)

Complete rebuild of the financial data model and UI. All phases shipped. Reference FINANCIALS_PLAN.md for full architectural decisions and rollback plan.

### What shipped

**Bug fixes (pre-rebuild):**
- `paid_at` column missing from job_transactions — migration added + backfilled from created_at
- ai-pm-nightly Rule 2 checked `status='due'` (invalid enum) — fixed to `status='overdue' OR (status='pending' AND due_date < today)`
- COTab co_total computed client-side — DB trigger `trg_sync_co_total` now auto-updates jobs.co_total on every CO change
- Migration file: `20260423_financial_bug_fixes.sql`

**Phase 1 — Unified ledger:**
- `job_transactions` is single source of truth. payments + job_cost_invoices migrated in.
- Compat views `payments` and `job_cost_invoices` kept alive (SECURITY INVOKER, RLS enforces through them) — rollback path via `_deprecated_*_20260423` tables, keep until 2026-05-07 minimum
- `change_order_id` on job_transactions is TEXT (not UUID — change_orders.id is TEXT)
- New supabase.js helpers: sbLoadJobTransactions, sbCreateTransaction, sbUpdateTransaction, sbVoidTransaction, sbUploadReceipt (job-receipts bucket), sbUploadLienWaiverTx (job-documents/lien-waivers/)
- Migration file: `20260423_unified_financial_ledger.sql`

**Phase 3 — Financials tab (13→10 JobDet tabs):**
- New FinancialsTab.jsx with 5 sub-tabs: Ledger, Estimate, Budget, Change Orders, Costs
- TransactionModal.jsx — create/edit/view modes; 3-button segmented toggle (Paid/Pending/Draft) default; full status dropdown only for void/overdue/refunded
- Lien waiver badge on sub_payout/vendor_payment rows missing lien_waiver_url
- ai-pm-nightly Rule 7 (lien_waiver_missing), Rule 8 (budget_overrun >110%)
- ai-companion updated to read job_transactions
- Stat bar: Contract / Received / Client Owes / Paid Out / Outstanding

**Phase 4 — Budget vs Actual:**
- `estimate_line_items` table — GENERATED ALWAYS AS STORED columns: `total_cost = quantity * unit_cost`, `client_price = quantity * unit_cost * (1 + markup_pct/100)`. RLS: staff full access, client SELECT only on cost_plus jobs.
- `sbSaveEstimateLineItems` uses delete-then-insert (full replacement per job)
- `job_transactions.phase TEXT` added alongside `phase_id UUID FK` for free-text budget matching
- **job_phases column is `phase_name` (not `name`)** — critical for any query joining job_phases
- Budget matching: `t.phase.trim().toLowerCase() === li.phase.trim().toLowerCase()`
- Migrations: `20260423_estimate_line_items.sql`, `20260424_add_phase_text_to_transactions.sql`
- **Migration deployment method:** temp `run-migration` edge function using postgres.js via `SUPABASE_DB_URL` (auto-injected in hosted edge functions). Management API PAT only works for function deploys, NOT for DB queries.

**Phase 5 — QuickBooks CSV export:**
- `qb_category_map` table — `(tenant_id, tx_type)` UNIQUE. RLS: owner write, staff read. 12 seeded rows.
- `job_transactions.qb_synced_at TIMESTAMPTZ` — optional stamp after export
- `src/lib/qbExport.js` — QB bank CSV: Date MM/DD/YYYY, Amount (+in/-out), Account, Class, Customer (from `tx.job.client_name`), Vendor (from `payer_or_payee_name`, fallback: `"Sub Payout - unnamed"`), Memo, Job. RFC 4180 escaping. void+draft skipped.
- Export modal in Ledger: date range (This Month/Quarter/YTD/All/Custom), all-jobs scope (owner only), mark-synced checkbox; "Hide Synced" toggle in filter bar
- Settings → QuickBooks tab (owner only): editable table of 12 tx types → QB Account/Class, auto-saves on blur
- `sbLoadTransactionsForExport` joins `job:jobs(address,client_name)` for multi-job exports
- Migration: `20260425_qb_category_map.sql`

**Phase 6 — Field tab consolidation (10→8 tabs):**
- New `FieldTab.jsx` — thin wrapper with sub-tabs: Notes & Photos / Daily Logs / Materials
- Notes + Photos combined into one sub-tab (were two separate top-level tabs)
- Consultation tab (id=`session`) was rendering in JobDet but missing from TABS array — surfaced in tab bar
- Final JobDet tab order: Info, Financials, Schedule, Field, Messages, Documents, Scanner, Consultation
- No changes to NotesPhotosTab, LogsTab, or MaterialsTab
- Completion banner "Go to Photos →" updated from `setTab('photos')` → `setTab('field')`

### Locked architectural decisions
- `job_transactions` is the single financial source of truth — no parallel tables
- `cost_plus` is a client-visibility flag only — all jobs track costs internally regardless
- Lien waivers are warnings, not hard blocks — transaction saves without them
- Commissions are transactions (`type='commission'`, `direction='out'`)
- Retainage fields present on job_transactions (`retainage_pct`, `retainage_held`) — no UI yet

---

## Session log

[LOG — 2026-04-15]
- Action: CORRECTION — AiIntakeWizard was claimed to support LiDAR toggle but never did. Completely rewrote as pure LiDAR scanning flow — removed AI chat step, manual grid, review/submit step, lead creation. New wizard is a thin wrapper rendering LidarScanner fullscreen.
- Files: avenstone-vite/src/components/ai/AiIntakeWizard.jsx (full rewrite), src/components/ai/LidarScanner.jsx (fixed async isLidarSupported bug)
- Decision: Path A — scanned rooms held in local state only for now. Lead creation + save-to-job return in a later phase.

[LOG — 2026-04-15]
- Action: Phase 1 LiDAR confirmed on iPhone 17 Pro. Locked LiDAR roadmap Phases 2-4.
- Decision: Scans attach to contacts first (not jobs directly). Phase 2 = continuous multi-room session (~1,500 sqft limit). Phase 4 = wing editor + GPS-anchored stitching.

[LOG — 2026-04-15]
- Action: LiDAR scan persistence shipped — scans attach to jobs (FloorPlanTab) and contacts (ContactsScr)
- Files: supabase.js (+sbSaveJobLidarScan, sbGetJobLidarScans, sbSaveLidarScan, sbGetContactLidarScans), FloorPlanTab.jsx (new), ContactsScr.jsx (+floor plans card), AiIntakeWizard.jsx (+jobId prop)
- Decision: Both tables use TEXT FK (not UUID) — contacts.id and jobs.id are TEXT type. FK constraint on UUID type would fail.

[LOG — 2026-04-15]
- Action: AI PM Dashboard built — owner-only, 30-day nightly alert history with stat cards and alert breakdown
- Files: components/dashboard/AiPmDashboard.jsx (new), App.jsx (+nav item + render, owner-only)

[LOG — 2026-04-15]
- Action: Sub portal upgrade gap analysis — PM-Sub direct chat, phase confirmation, CO submission are all missing
- Decision: Sub AI companion replaced with PM-Sub direct chat concept. Phase confirmation (mark started/complete) and sub CO submission spec'd but not built.
- Open: Sub phase buttons (Mark Started / Mark Complete) may silently fail on device if RLS doesn't allow sub UPDATE on job_phases — one-line migration fix if needed.

[LOG — 2026-04-19]
- Action: Capture v2 Phase 1 shipped — CaptureMode enum, expanded data model, GPS stamping
- Files: src/lib/gps.js (new), supabase.js (sbSaveJobLidarScan + sbSaveLidarScan updated), AiIntakeWizard.jsx (GPS wired in), Info.plist (NSLocationWhenInUseUsageDescription)
- DB: job_lidar_scans + contact_lidar_scans both get 10 new nullable columns: capture_mode (default 'interior'), height_meters, height_source, height_points[], gps_latitude, gps_longitude, gps_accuracy, quality_score, quality_grade, quality_deductions (JSONB)

[LOG — 2026-04-19]
- Action: Capture v2 Phase 2 shipped — Exterior Mode AR capture (ARKit, not RoomPlan — LiDAR fails outdoors)
- Files: ExteriorScanViewController.swift (new), RoomPlanPlugin.swift (+startExteriorScan), src/lib/lidar.js (+startExteriorScan), LidarScanner.jsx (mode toggle), AiIntakeWizard.jsx (exterior save paths), FloorPlanTab.jsx (exterior scan card)
- Decision: Tap corners → gold spheres + cylinder lines. Shoelace formula for area. Long press to drag corners. outline_data JSONB column stores result. capture_mode='exterior' distinguishes in UI.

[LOG — 2026-04-19]
- Action: Capture v2 Phase 3 shipped — mandatory height capture on all captures, both modes
- Files: src/components/ai/HeightCaptureStep.jsx (new — shared confirm/override UI), ExteriorScanViewController.swift (height phase after polygon Done, groundY from corner average, tap-to-raycast), AiIntakeWizard.jsx (added 'height' step, all save paths include height fields), FloorPlanTab.jsx (amber 'Height missing' badge on legacy records)
- Decision: Interior autoHeightFt = max of room.height values. Height is mandatory — Confirm disabled until valid. No skip path.

[LOG — 2026-04-19]
- Action: Capture v2 Phase 4 shipped — quality meter 0-100, live bar in Swift VCs, post-capture report in React
- Files: CaptureQualityTracker.swift (new — shared scoring class), RoomPlanPlugin.swift (live quality bar), ExteriorScanViewController.swift (live bar), src/components/ai/CaptureQualityReport.jsx (new — score/deductions/Re-scan+Accept), AiIntakeWizard.jsx (added 'report' step)
- Decision: Interior live bar = duration-based (20→90 over 60s). Final score from CapturedRoom (wall count, confidence, ceiling, duration, area). Aggregate quality = average of per-room scores. Quality saves regardless of Re-scan or Accept.

[LOG — 2026-04-22]
- Action: Reconciled CLAUDE.md Priority Order and Done list against actual shipped code
- Files: CLAUDE.md (Priority Order + Done section rewritten, model string updated to claude-opus-4-7)
- Decision: Priority Order: fixtures/objects export → PDF dimension overhaul → LiDAR Phase 4 wing editor → sub portal upgrades → white-label wizard → lien waivers

[LOG — 2026-04-22]
- Action: Fixtures/objects export shipped — Swift serialization + JS PDF rendering
- Files: RoomPlanPlugin.swift (+fixtureCategoryString, +objectSegs loop in roomToDict and structureToRooms), src/lib/pdf.js (+FIXTURE_LABELS, +_drawFixture, +render loop)
- Decision: fixtureCategoryString uses if-equality (not switch) — CapturedRoom.Object.Category is a struct, not an enum.
- Decision: Render 9 categories (toilet, bathtub, sink, stove, oven, refrigerator, dishwasher, washerDryer, storage). Skip furniture + unknown. Confidence .low skipped.
- Decision: Single-room path objects exported from Swift but NOT rendered in JS PDF yet — _processWalls rotates rooms for layout but object coords from roomToDict are in unrotated ARKit space. Rotation transform deferred to Phase 2.
- Open: Single-room fixture rendering requires passing rotation angle from _processWalls to _drawFixture.

[LOG — 2026-04-22]
- Action: Track B architecture review + full codebase cleanup + sub portal and PDF features shipped
- Files (cleanup): deleted lib/ai.js, lib/captureTypes.js, App.css, src/styles/, dead assets. Renamed SubOnboardingModal → SubComplianceModal. Centralized hardcoded Supabase URLs across 10 files into supabase.js.
- Files (pdf.js): Proper architectural dimension lines replacing W×D bounding-box text. _drawDimLine helper with extension lines, tick marks, outward-normal offset. W×D label removed from centroid.
- Files (sub portal): supabase.js (+sbSubUpdatePhase, +sbSubSubmitCO), SubJobView.jsx (Mark Started/Complete buttons, CO submission form).
- Decision: AV_JOBS / setGlobalJobs kept — FormScr.jsx uses AV_JOBS for job picker. Not dead.
- Decision: ConsultationTab split and LidarScanner split rejected as premature — only worth doing when a feature forces us back in.

[LOG — 2026-04-23]
- Action: Fixed Playwright Step 8 flaky test + ContractModal iOS "Load failed" + ClientPortal contract banner + codemagic.yaml Beta Review bug
- Files: tests/portals-e2e.spec.js (reactFill() + waitForTimeout(2500) for sbNotify DB write), ContractModal.jsx (signed_url || file_url), ClientPortal.jsx (contract banner), codemagic.yaml (submit_to_testflight: false)
- Decision: page.fill() doesn't reliably trigger React onChange on controlled inputs — always use reactFill() helper in tests.
- Decision: proposalDoc.file_url is raw storage path; inside Capacitor webview resolves to localhost — use signed_url.
- Decision: submit_to_testflight: true with no beta_groups triggers Beta App Review. Internal testers only — set false.

[LOG — 2026-04-23]
- Action: Fixed multi-room LiDAR room-name off-by-one bug + 5 floor plan PDF renderer improvements
- Files: RoomPlanPlugin.swift (removed between-scan room picker, all N names entered at end with sqft hints)
- Files: src/lib/pdf.js (feet-inches format 5'-6", perimeter-only dim lines, door arc cap, 3-tier wall weights, _drawFixture icon rewrite)
- Decision: Root cause of off-by-one — StructureBuilder returns rooms in spatial order (not scan order). Fix: one naming screen at the end, no mid-session picker.
- Decision: Wall weights: exterior 2.5pt, interior/shared 1.5pt, door/window 0.5pt. Uses midCount map to classify.
- Open: Verify perimeter-only dim lines on device — depends on StructureBuilder returning shared walls in both adjacent room lists.

[LOG — 2026-04-25]
- Action: Consolidated on request — financial rebuild (Phases 1-6) compressed into single block. Live backlog: Phase 7 receipt vision (deferred), IA cleanup, sub financial visibility, notifications audit.
