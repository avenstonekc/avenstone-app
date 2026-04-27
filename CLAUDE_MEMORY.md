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

**Active modules:** Job pipeline, leads screen, AI estimator, AI companion (per-job per-person), AI intake wizard (LiDAR scan → height → quality report → save to job or contact), AI field agent, AI home companion, master agent, AI pm-nightly alerts, AI knowledge base, AI setup wizard, LiDAR scanner (interior multi-room + exterior outline, GPS-stamped, quality meter, saves to job_lidar_scans + contact_lidar_scans, FloorPlanTab on JobDet), floor plan PDF (pdf.js, fixtures rendering), AI PM dashboard (owner-only, 30-day alert history), contract gen + signature pad, client portal, owner portal, sub portal + onboarding wizard + rate modal, ITB system, Gantt/list scheduler, PDF gen, consultation tab (ambient + measure mode), materials tab, public pages (completion, review, profile), contact sequences + sequence runner, address autocomplete, push notifications, Stripe payments, GHL webhook, Twilio inbound SMS, white-label multi-tenant platform (Avenstone = first GC tenant; future tenants run lean trade-specific configs), unified financial ledger (job_transactions), QuickBooks CSV export

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

[LOG — 2026-04-24]
- Action: Professional PDF renderer rewrite — full architectural floor plan, multi-floor support, poché walls, world-mode vs packing-mode layout, polygon centroid labels, graduated scale bar
- Files: src/lib/pdf.js (full rewrite: added _groupByFloor, _dedupFeatures, _segsToPolyPoints, _polyCentroid, _pointInPoly, _interiorPoint, _drawPoché, _eraseGap, _dimLine, _drawScaleBar, _renderFloorPage, _renderSummaryPage; removed FIXTURE_LABELS/_drawFixture), src/lib/captureTypes.js (re-created: FLOOR_LABELS, floorLabel — was deleted 2026-04-22)
- Decision: Fixture rendering deliberately removed. Single-room path requires rotation transform from _processWalls that doesn't exist yet. Deferred to next phase.
- Decision: Landscape orientation (792×612pt) for floor plan pages; summary page stays portrait.
- Decision: World-mode (has worldX/worldZ) → _processAllRooms + spatial layout. Single-room fallback → _processWalls packing layout.
- Open: Fixture rendering pending — Swift already serializes room.objects; PDF needs _drawFixture reinstated with correct rotation transform.

[LOG — 2026-04-24]
- Action: Multi-floor scan flow wired end-to-end — captureTypes.js, floorIndex JS→Swift→rooms, floor picker screen in LidarScanner
- Files: src/lib/captureTypes.js (FLOOR_LABELS, floorLabel), src/lib/lidar.js (scanMultipleRooms(floorIndex), simulation rooms tagged with floor field), RoomPlanPlugin.swift (floorIndex from JS call → vc.floorIndex → "floor" in room dicts), src/components/ai/LidarScanner.jsx (FloorPicker component, FLOOR_OPTIONS, computeNextFloor, pendingFloorIndex state), CLAUDE.md (+commit-and-push Working Preference bullet)
- Decision: Floor picker skipped on first scan (rooms empty) — auto-uses floor 0. Shown before every subsequent scan. Auto-selects next unscanned floor.
- Decision: FLOOR_LABELS: -1=Basement, 0=1st Floor, 1=2nd Floor, 2=3rd Floor, 3=4th Floor. Legacy rooms without floor field default to 0.

[LOG — 2026-04-24]
- Action: 13-bug PDF cleanup sweep (Bugs 1–13) — architectural floor plan renderer polish across pdf.js and RoomPlanPlugin.swift
- Files: src/lib/pdf.js (13 commits), RoomPlanPlugin.swift (Bug 7 — polygon containment name matching)
- Decision: Bug 2 — interior wall classification replaced: 3-condition test (midpoint ≤0.5ft + length ±15% + direction |dot|≥0.9) instead of midpoint-only quantized grid. Eliminates false bathroom interior dim.
- Decision: Bug 7 — Swift name match: wall endpoints sorted by angle from centroid → polygon; pointInPolygon as primary; nearest-centroid fallback with [LIDAR_WARN] log.
- Decision: Overall bounding dims (top + right) at off=62, lw=1.0 — heavier than per-wall dims (off=44, lw=0.75).
- Decision: Title block moved to left-side vertical column (TC_W=108pt). Plan area now 536×476pt inside DL=168/DR=704/DT=82/DB=558.
- Decision: Overall HEIGHT dim on RIGHT side — left side is blocked by title column.

[LOG — 2026-04-24]
- Action: Second PDF + scanner cleanup sweep — Bugs 1–10 (commits 4f46f29 through f517802)
- Files: src/components/ai/LidarScanner.jsx (Bug 1), src/lib/pdf.js (Bugs 2–10)

**Audit findings:**
- Bug 1 (floor picker not firing): ListPhase was calling onStartMultiRoomScan(0) directly when rooms.length===0, bypassing FloorPicker. Also computeNextFloor iterated [-1,0,1,2,3] so empty rooms defaulted to Basement. Fix: always route through onOpenFloorPicker; reordered preference to [0,1,2,3,-1].
- Bug 3 (landscape): jsPDF({ format: [792,612] }) without explicit orientation was being interpreted inconsistently. Fix: orientation:'landscape' + format:'letter'.
- Bug 7 (duplicate dims): Two exterior segs from different rooms with slightly different outward-normal normalizations gave different `dist` values, causing the placedDims dedup to miss them. Resolved by chain-dim rewrite — per-edge grouping dedupes by midpoint proximity (0.3 ft) before rendering.
- Bug 8 (TOTAL row): gTotPerim and gTotWallArea were never declared at global scope (only floor-level fTotPerim/fTotWallArea existed). TOTAL row hardcoded '—' for all three. Fix: added global accumulators, wired roll-up, ceiling total = floor area total.
- Bug 10 (openings): Openings loop already correct — erase only, no swing arc. Walk-through rendered with swing arc = RoomPlan sensor tagged it as CapturedRoom.Door, not Opening. Render-side fix not applicable. Flagged as known limitation; user-editable override deferred.

**Key decisions:**
- Chain dims (Bug 5): MagicPlan style — one dim line per edge (top/bottom/right), single label per segment centered on span, tick marks at each boundary, overall outer tier at +38pt. Left edge skipped (title column).
- Bug 4 (left-edge overlap into title column): Resolved by omitting left chain entirely.
- Bug 2 (orthogonal snap): _snapToOrtho runs on a deep clone before _processAllRooms. Angle snap (5° tolerance) + endpoint merge (2-inch tolerance). Raw data preserved.
- Bug 6 (label collision): _renderChainDims returns label bounding boxes; room labels check dimBoxes + previously placed room label boxes before rendering. Falls back to interior point, then font reduction 10%, then [LIDAR_WARN].
- Bug 9 (garage door): ri preserved on door objects via byRoom() to look up room name. Width ≥6ft + /garage/i room name → overhead-door symbol (two parallel lines + inward arrow). Width 4–6ft non-garage → bi-fold unchanged. <4ft → swing arc unchanged.

**Known remaining limitations:**
- RoomPlan misclassification of walk-through openings as doors (Bug 10 — sensor-side, not render-side)
- Fixture/object rendering still pending rotation transform (_drawFixture not yet reinstated)
- Single-room (non-world-mode) path: chain dims not applied (still uses old per-seg _dimLine calls)

[LOG — 2026-04-24]
- Action: Read-only audit — Material Takeoff Wizard design. Covered 6 areas: scan data shape, pdf.js takeoff math, AI estimate flow, ai_knowledge pricing, estimate_line_items schema, MaterialSelectionScr.
- Files: None changed (read-only audit)
- Decision: MaterialSelectionScr (950 lines) is not a foundation — it writes to jobs.intake_answers only, uses hardcoded formulas, not connected to scan data or estimate_line_items. Start fresh.
- Decision: `generate-estimate-from-session` IS reachable from UI — ConsultationTab calls it from the "Generate Estimate" button. It does NOT write estimate_line_items; caller (ConsultationTab.saveEstimate) handles persistence. [Corrected: prior claim of "orphaned" was wrong.]
- Decision: estimate_line_items schema is well-designed (quantity + unit + unit_cost → generated total_cost + client_price). Zero rows in production — ready to receive takeoff output.
- Decision: ai_knowledge has 21 total entries — 15 pricing/rule, 6 narrative. All active. Content is structured prose with $ ranges, regex-extractable but not machine-readable JSON. [Corrected: prior claim of "8 entries" was wrong.]
- Decision: Recommended build path — (1) extract computeTakeoff(rooms) from pdf.js, (2) generateLineItems(takeoff, selections) → estimate_line_items rows, (3) wizard UI room-by-room material selection, (4) summary + estimate PDF.
- Next: Build Material Takeoff Wizard starting with Phase 1 (data extraction layer)

[LOG — 2026-04-24]
- Action: Read-only audit — Scope-and-allowance engine design. Second audit expanding on first. Covered: consultation_sessions/extractions/measurements schema, session write flow, consultation↔scan join, generate-estimate-from-session full code, ai-estimator full code, their difference, callEstimator existence check, estimate_line_items extension surface, MaterialSelectionScr deep read, ai_knowledge full dump + machine-readability, change_orders schema, upgrade-CO column gap analysis.
- Files: None changed (read-only audit)
- Decision: consultation_sessions + job_lidar_scans share only job_id — NO structural join. Two parallel data pools.
- Decision: generate-estimate-from-session IS reachable from UI (ConsultationTab). Previous session's audit was wrong about it being orphaned. It's called from "Generate Estimate" button.
- Decision: ai-estimator (EstimateTab chat) and generate-estimate-from-session (ConsultationTab measure flow) serve different stages — not redundant.
- Decision: estimate_line_items has NO allowance column, NO scan_id, NO template_id. notes (TEXT) is the only free extension field. Full replace-all write pattern via sbSaveEstimateLineItems.
- Decision: MaterialSelectionScr is hardcoded bathroom-only with picsum photos. APPROX_QTY is static (tile=200sf regardless of scan). buildEstimate() uses fixed per-sqft ratios. Writes to jobs.intake_answers only. Dead code — not imported anywhere.
- Decision: ai_knowledge pricing entries are machine-parseable prose ranges (regex extractable), not JSON. 15 pricing/rule entries, 6 narrative entries. All active. Mid-range formula: (low+high)/2.
- Decision: change_orders has no FK to estimate_line_items. No allowance_original, no estimate_line_item_id, no auto_generated, no client_approved_at, no source_type. All 6 would be needed for auto-CO from client upgrade selection.
- Open: ai_knowledge pricing entries need a parsing pass or a new structured pricing_lookup table before they can be used as machine-readable unit costs in a takeoff engine.
- Next: Design scope-and-allowance engine schema (new tables: scan_takeoff, allowance_line_items or estimate_line_items extension, upgrade_selections) before writing any code.

[LOG — 2026-04-25]
- Action: Read-only audit delivered — scope-and-allowance engine (second audit, full briefing). All 6 areas covered and reported to user.
- Files: None changed (read-only audit)
- Decision: Briefing confirmed — consultation↔scan join is job_id only (no structural link). generate-estimate-from-session IS reachable from UI. estimate_line_items has no allowance/scan/template columns. MaterialSelectionScr writes to jobs.intake_answers only, not imported anywhere. ai_knowledge has 15 pricing entries (regex-parseable prose ranges) + 6 narrative. change_orders needs 6 new columns for auto-CO flow: estimate_line_item_id, allowance_original, allowance_override, source_type, auto_generated, client_approved_at.

[LOG — 2026-04-24]
- Action: PDF generation bug fixed — silent crash on tap "Generate PDF" across commits 4f46f29–f517802
- Files: avenstone-vite/src/lib/pdf.js
- Decision: Root cause — `_renderChainDims` line 551 returned `undefined` instead of `[]` when `kept` (post-dedup segment array) was empty. Callers spread the return value (`..._renderChainDims(...)`); spreading `undefined` threw a TypeError that silently killed the render with no user-visible error. Fix: `return;` → `return [];`.
- Decision: Added try/catch wrapping all of `buildFloorPlanPDF` — `console.error('[LIDAR_PDF_ERROR]', e)` + `alert()` with message on failure. User now sees an error instead of silence.
- Decision: Added `[LIDAR_PDF_STAGE]` breadcrumbs at: start, groupByFloor, doc created, per-floor page (with floor name), snapToOrtho, processAllRooms, chain dims, room labels, summary page, complete. Use Safari Web Inspector / Xcode console to read these on device.
- Open: Awaiting `[LIDAR_PDF_ERROR]` / `[LIDAR_PDF_STAGE]` output from next user scan to confirm fix held or identify any secondary crash path.
- Next: If PDF renders cleanly — proceed to scope-and-allowance engine schema design.

[LOG — 2026-04-25]
- Action: AVENSTONE_VISION.md updated — 11 targeted edits adding multi-owner model, AI-seeded inspection checklists, expanded moat section, and cost guardrail rule.
- Files: AVENSTONE_VISION.md
- Decision: (a) Multi-owner model — all owners equivalent, first-to-approve wins on CO/knowledge/contract actions. No second signature. Each owner gets their own morning brief.
- Decision: (b) Per-user briefings are not consolidated — each user sees a brief based on their own job touches, not a shared owner dashboard.
- Decision: (c) Inspection checklists — AI-seeded baseline (one Sonnet call, 60-80 entries, owner approves before activation). v2 ai_knowledge_learner edge function suggests new entries from completed job patterns; owner approves each addition. inspection_checklist open question closed — decision made.
- Decision: (d) Moat section expanded with three durable advantages: runs the software it builds (uncopyable feedback loop), every job teaches the system (private dataset compounds), single-builder velocity (idea Mon → ship Fri).

[LOG — 2026-04-25]
- Action: AVENSTONE_VISION.md updated — white-label / multi-trade model added (Multi-trade section, v4+ section, fourth durable advantage in moat).
- Files: AVENSTONE_VISION.md
- Decision: Platform is multi-tenant from day one. v1 data model is trade-aware: ai_knowledge gets a trade tag, takeoff_templates include tenant_id + trade, phase definitions are per-tenant config, module visibility is a per-tenant feature flag set (manages_subs, uses_lidar, tracks_permits). Avenstone runs as a GC tenant with everything on — no trade-specific UIs needed in v1.
- Decision: v4+ expansion to other trades (painters, tile, roofers, etc.) is configuration and sales work, not engineering — if v1 data model is right, no rewrite needed.
- Decision: White-label-ready-from-day-one added as durable advantage #4 in moat section.

[LOG — 2026-04-25]
- Action: Multi-tenant / white-label model elevated to top-level architectural principle. Captured across CLAUDE.md (new "Multi-Tenant Architecture Rules" section), AVENSTONE_VISION.md (already done in prior commit), OPUS_PROMPT_RULES.md (new trade-aware-check rule), and FINANCIALS_PLAN.md (acknowledged compliant).
- Decision: Avenstone is the first tenant on a multi-tenant multi-trade platform. Every new schema includes tenant_id + RLS. Trade-specific data (pricing, checklists, templates, catalog) also includes a trade column. Phase definitions and module visibility are per-tenant config, not hardcoded. White-label expansion (v4+) is configuration work, not engineering work — provided v1-v3 hold this line.
- Files: CLAUDE.md, CLAUDE_MEMORY.md, OPUS_PROMPT_RULES.md, FINANCIALS_PLAN.md
- Open: confirm new client onboarding wizard (recently shipped per user) is tenant-aware and trade-aware — audit pending.
- Next: audit new client onboarding wizard, then resume scope-and-allowance v1 spec.

[LOG — 2026-04-25]
- Action: Shipped disclosed change orders in client proposal PDF (first anti-surprise feature from AVENSTONE_VISION.md v1).
- Files: avenstone-vite/src/lib/pdf.js, avenstone-vite/src/lib/supabase.js, avenstone-vite/src/components/jobs/tabs/EstimateTab.jsx
- Decision: Section renders only when ≥1 oh_shit_moments row has included_in_proposal=true. Owner curates via "Disclosed unknowns" collapsible section in EstimateTab proposal modal — instant toggle, optimistic UI, persists to DB via sbToggleOhShitProposal. No schema changes — uses existing oh_shit_moments table as-is.
- Decision: Query by job_id (not session_id), include rows from all sessions. Owner curation is the filter. No deduplication by condition text (v2 concern).
- Decision: ConsultationTab's "Include in proposal" checkbox was in-memory only — it never wrote included_in_proposal=true to the DB. EstimateTab now provides the persistent toggle path.
- Open: change_orders ↔ oh_shit_moments linkage (disclosed_in_oh_shit_moment_id) deferred to v2 — when a real CO fires that matches a disclosed item, surface "as disclosed" to client.
- Next: use on next bid Avenstone sends. Observe client response. Decide v2 priorities from real use.

[LOG — 2026-04-25]
- Action: Fixed ConsultationTab oh_shit_moments toggle — now persists to DB via sbToggleOhShitProposal (was in-memory only).
- Files: avenstone-vite/src/components/jobs/tabs/ConsultationTab.jsx
- Decision: Two intentional curation surfaces: ConsultationTab (in-session, as unknowns surface during consultation) and EstimateTab (pre-send, when building the proposal PDF). Both write to oh_shit_moments.included_in_proposal. State is synchronized because both tabs read/write the same DB column.
- Decision: After generate-estimate-from-session returns, ConsultationTab now fetches the DB rows (with IDs) filtered by session_id, matches to API response rows by condition text, and keys ohShitToggled by DB UUID instead of array index. Toggle onChange does optimistic local update + sbToggleOhShitProposal call.
- Decision: Also fixed ConsultationTab display to use m.condition || m.title || m.issue (DB field name is `condition`, not `title`/`issue`) and m.estimated_cost_low/high (not m.cost_low/high).

[LOG — 2026-04-25]
- Action: Stripped prompt wrapper from AVENSTONE_VISION.md — file now starts with "# Avenstone Vision — The Anti-Surprise Engine" instead of "SCOPE: create a new file...". All prior edits were correctly embedded inside the wrapper and are preserved in the clean file.
- Files: AVENSTONE_VISION.md
- Decision: Also updated "What's already shipped" bullet to reflect that disclosed unknowns in proposals has shipped (was still marked as a gap).

[LOG — 2026-04-25]
- Action: Consultation gap analyzer shipped — full pipeline from session end to gap review modal to estimate generation.
- Files: supabase/functions/ai-consultation-gap-analyzer/index.ts (new edge fn), supabase/migrations/20260425_consultation_gap_analyses.sql (new table), supabase.js (+GAP_ANALYZER_URL, +sbRunGapAnalysis, +sbLoadLatestGapAnalysis), generate-estimate-from-session/index.ts (+unresolved_gaps param), ConsultationTab.jsx (runGapAnalyzer, GapResolutionModal, gapRunning spinner, gaps reviewed badge)
- Decision: Haiku single shot, max_tokens 2048. Reads session + measurements + extraction + job + latest lidar scan + all active ai_knowledge. Returns up to 8 gaps (category, severity, title, description, suggested_action).
- Decision: After doneMeasuring or endSessionFromAmbient, runs gap analyzer before generateEstimate. If ≥1 gap returned → show GapResolutionModal. If 0 gaps → call generateEstimate([]) directly. If gap analyzer errors → fall through silently to generateEstimate([]).
- Decision: GapResolutionModal is full-screen overlay. Each gap has Resolved/Skip/Add note buttons. Generate estimate button disabled if any blocker is unresolved (no action taken). Unresolved gaps (not Resolved or Skip) passed to generate-estimate-from-session as unresolved_gaps.
- Decision: Unresolved gaps → oh_shit_moments: title→condition, description→how_to_present, severity (blocker→high, strong→medium, nice_to_have→low)→likelihood.
- Open: consultation_gap_analyses table must be applied to live DB via Supabase dashboard SQL editor (run 20260425_consultation_gap_analyses.sql). Edge fn auto-deployed via GitHub Actions.

[LOG — 2026-04-25]
- Action: Fixed three bugs surfaced during gap analyzer testing.
- Files: generate-estimate-from-session/index.ts, ai-consultation-gap-analyzer/index.ts, ConsultationTab.jsx
- Decision Bug 1: Removed `!measurements.length` hard guard from generate-estimate. Sessions where Haiku stays in "scoping" trade throughout (common in short sessions) produce zero consultation_measurements rows. Estimate now proceeds with whatever context is available; measureSummary notes when no measurements were recorded.
- Decision Bug 1 (also): Fixed `jobs.description` → `jobs.scope` in generate-estimate jobs query. `description` column does not exist on jobs table — PostgREST returned null for the entire row, making job=null → "Unknown" everywhere.
- Decision Bug 2: Added fire-and-forget ambient transcript flush at start of `startMeasuring()`. The 60-second interval is cleared immediately on mode transition; if ambient ran < 60 seconds, no extraction row was ever written. Now flushes transcript if ≥ 20 chars before clearing the interval.
- Decision Bug 3: Fixed same `description` → `scope` bug in gap analyzer jobs query and prompt.
- Note: PAT still expired — GitHub Actions edge fn deploys may be broken. User needs to regenerate PAT at supabase.com/dashboard/account/tokens (No expiry) and run `gh secret set SUPABASE_ACCESS_TOKEN`.

[LOG — 2026-04-26]
- Action: Floor plan PDF crash fixed — "Can't find variable: dimBoxes" alert on device.
- Files: avenstone-vite/src/lib/pdf.js
- Decision: ROOT — dimBoxes was declared `const` inside the `if (worldMode)` block at line 1010 but referenced at line 1063 outside it. Hoisted to `let dimBoxes = []` at outer scope before the if/else; assignment inside worldMode branch unchanged.
- Open: Verify on iPhone after Vercel + Codemagic deploys. Single-room PDF path still doesn't get chain dims (pre-existing limitation, not regression).
- Next: Multi-room PDF on real scan → confirm fixtures still pending → tackle room-name-backwards UX bug.

[LOG — 2026-04-26]
- Action: Working model + priority order updated. Opus delegates easy tasks to Sonnet via copy-pasteable prompt; user runs Opus directly inside Claude Code (no more `/opus` relay).
- Files: CLAUDE.md (Diagnosis workflow section replaced with "Cost-aware delegation"; Priority Order #1 expanded with sub-bullets — fixtures, room-name-backwards bug, single-room parity)
- Decision: Triage rule — Opus for diagnosis/architecture/multi-system; Sonnet for scoped fixes/refactors/boilerplate. Prompt template documented in CLAUDE.md.
- Decision: LiDAR/PDF outranks website work in priority — if Kalin shows up with a LiDAR screenshot, drop everything. Website work continues in parallel, just behind it.

[LOG — 2026-04-26]
- Action: Notification system audit (read-only)
- Files: none changed (audit only)
- Decision: Staff bell is solid; client experience is nearly silent on financial events — no payment receipt email, no client bell anywhere in ClientPortal, ai-pm-nightly client alerts land in DB but client has no UI to see them, sub assignment notifies nobody.
- Open: Follow-up prompt generated for 6 fixes (stripe-webhook receipt email, sub assignment bell, contract_signed/completion_signed type fixes, notify-email SUBJECTS map, NotifPanel + SettingsModal new types). Client bell (ClientPortal.jsx) deferred as a larger task.

[LOG — 2026-04-26]
- Action: Trimmed CLAUDE.md from 696 lines to 514 lines.
- Files: CLAUDE.md
- Decision: Compressed 7 sections — folder tree (→ one paragraph), Core tables list (→ pointer to supabase.js + migrations/), edge function tables (→ 3 bullet lines), AI system ASCII diagram (→ 6 bullets with file paths), Opus/Sonnet dispatch template (→ pointer to OPUS_PROMPT_RULES.md), Done list (→ kept last 14 days, older items → pointer to CLAUDE_MEMORY.md), memory system (→ ~7 lines). Cross-references: AVENSTONE_VISION.md, OPUS_PROMPT_RULES.md, CLAUDE_MEMORY.md, FINANCIALS_PLAN.md confirmed as canonical homes for excised content.
- Open: Room-name-backwards bug (StructureBuilder returns rooms in spatial order, naming modal doesn't show which room is which). Fix proposed: thumbnail/centroid mini-map per room in naming list. Awaiting user OK to implement.

[LOG — 2026-04-26]
- Action: Floor plan PDF + naming modal — three fixes (early session). (a) Polygon thumbnails added to multi-room naming modal in Swift (52×52pt UIView per row, navy stroke per wallSegment via CAShapeLayer, em-dash fallback). (b) Tier overlapping chain dim labels in PDF — greedy left-to-right tier pass replaces fixed offset; tiered labels get 0.4pt grey extension stub back to chain dim line. (c) [LIDAR_PDF_RIGHT_EDGE] log added to verify vertical chain math.
- Files: ios/App/CapApp-SPM/Sources/CapApp-SPM/RoomPlanPlugin.swift (thumbnails), avenstone-vite/src/lib/pdf.js (tiered labels)
- Commits: 3616b7a, b6e673e
- Decision: Thumbnails address half of the room-name-backwards bug — rep can now see which room they're labeling even when StructureBuilder reorders them spatially. Full fix (centroid mini-map vs full polygon) deferred until field testing shows whether thumbnails alone are enough.

[LOG — 2026-04-26]
- Action: Floor plan editor — built and immediately hidden behind feature gate pending rework. Phase A scaffolded the editor (SVG canvas, tap-to-name modal with type chips, rotate/flip toolbar, edit_overrides JSONB column on both scan tables, applyEditOverrides() in pdf.js with exact-integer 90° rotations to avoid trig drift). Phase B wired it into AiIntakeWizard (interior 'editor' step between report Accept and save) and FloorPlanTab (Edit button per scan card). Then entry points were removed in fa3582f after testing surfaced rework needs; FloorPlanEditor.jsx + applyEditOverrides + sbUpdateScanOverrides + the migration are still in place but unreachable from UI.
- Files: avenstone-vite/src/components/ai/FloorPlanEditor.jsx (new, kept), avenstone-vite/src/components/ai/AiIntakeWizard.jsx, avenstone-vite/src/components/jobs/tabs/FloorPlanTab.jsx, avenstone-vite/src/lib/pdf.js (applyEditOverrides), avenstone-vite/src/lib/supabase.js (+sbUpdateScanOverrides, editOverrides param on save helpers), supabase/migrations/20260426_floor_plan_edit_overrides.sql
- Commits: 19bafbe (scaffolding), 3e694f5 (wire-up), fa3582f (hide entry points)
- Decision: Code retained, just unmounted — when rework lands, re-import and re-render to bring back. Migration column edit_overrides JSONB shape locked as { rotation, mirror, room_names } even though no UI writes it yet.
- Open: Decide what the editor should actually do before rewiring — current naming-by-tap UX may be redundant with Swift naming modal + thumbnails.

[LOG — 2026-04-26]
- Action: Sub portal upgrades — CO + phase audit shipped. Four-commit feature group covering submitter audit fields, sub-side approval/rejection notifications, phase start/complete audit columns, and inline CO edit for pending rows.
- Files: avenstone-vite/src/components/jobs/tabs/COTab.jsx, avenstone-vite/src/components/jobs/tabs/ScheduleTab.jsx, avenstone-vite/src/components/sub/SubJobView.jsx, avenstone-vite/src/lib/supabase.js, supabase/migrations/20260427_co_submitter_audit.sql, supabase/migrations/20260428_phase_audit.sql
- Commits: 1b815c2 (submitter audit + unified field shape), 6ce4482 (notify-sub on approve/reject), 0faa944 (phase audit columns), 53feba2 (inline CO edit)
- Decision: change_orders gains submitted_by_id (UUID FK profiles) + submitted_by_role (TEXT). sbSubSubmitCO renamed param title→description, auto-generates co_number via count query, stamps submitter. COTab renders cream pill "Submitted by ROLE" badge. SubJobView reads co.description with co.title fallback for legacy rows.
- Decision: New sbNotifyUser helper for targeted single-user bell notifications (vs broadcast sbNotify). apCO/rjCO call it with submitted_by_id when it differs from the acting PM — sub gets "CO #X approved/rejected" notification with amount + job address.
- Decision: job_phases gains started_at, started_by_id, completed_at, completed_by_id (all nullable). Stamped on first transition only. ScheduleTab loads profiles for all audit authors in one round-trip on mount, renders "Started [date] by [name]" / "Completed [date] by [name]" under each phase card. SubJobView shows date-only audit lines.
- Decision: COTab inline edit — pending rows get Edit button alongside Approve/Reject, swaps display for textarea + amount input pre-filled with current values. Approved/rejected COs remain read-only.
- Open: Both migrations (20260427, 20260428) need to be applied to live DB if not already auto-applied via GitHub Actions. Columns are nullable so deploy order doesn't matter.

[LOG — 2026-04-26]
- Action: Floor plan PDF — math + branding pass (late session). Five-commit polish covering naming order, branded logo, chain edge math, label rotation, and door swing arc cap.
- Files: ios/App/CapApp-SPM/Sources/CapApp-SPM/RoomPlanPlugin.swift (scan-order sort), avenstone-vite/src/lib/pdf.js (branding + math + label + arc cap), avenstone-vite/src/components/jobs/tabs/FloorPlanTab.jsx (await buildFloorPlanPDF)
- Commits: 0c415e2 (scan-order naming), 6f8fc52 (logo image + portrait summary), f9cd937 (snap chain edges + overlap dedup), cb0a9a7 (rotate label on wall collision), 2282861 (cap swing arcs at 4/room)
- Decision: Scan-order naming — Swift now sorts the multi-room naming modal in scan order (not StructureBuilder spatial order), pairs with thumbnails to fully resolve room-name-backwards bug.
- Decision: Logo image — _loadLogo fetches logo.png and base64-encodes via FileReader, passed once to all renderers. _drawTitleColumn and _renderSummaryPage call addImage instead of typed AVENSTONE/GROUP text. Honors user-memory rule "logo, not text, on Avenstone brand files." Typed-text fallback retained for image load failure. buildFloorPlanPDF is now async; FloorPlanTab awaits it.
- Decision: Summary page now uses addPage('letter', 'portrait') — was inheriting landscape orientation from doc default.
- Decision: Chain edge math — global bbox computed from allWallSegs before exterior classification. Top/bottom/right segs snap to gMinZ/gMaxZ/gMaxX within 1.0ft tolerance to merge wall-thickness twins from adjacent rooms onto the same plane. Midpoint-proximity dedup (0.3ft) replaced with overlap-range dedup (drop seg if ≥80% range overlaps an already-kept seg, sort by start with longer first on ties). [LIDAR_PDF_DEDUP] log added.
- Decision: Label rotation — _ptSegDistFt + _labelFitsInRoom helpers test all four corners of label box are inside polygon AND ≥6pt from every wall segment. After interior point chosen, horizontal box tested first; on fail, retry rotated; if rotated fits, narrow=true triggers existing angle:90 render path. [LIDAR_PDF_LABEL] log only fires when neither orientation fits.
- Decision: Swing arc cap — swingCountByRoom tracks arcs per room index. Skip arc when room has 4 already (panel line still drawn). Stroke lightened from (80,80,80)/0.4lw to (140,140,140)/0.3lw. Stops dense rooms from drowning in arcs.
- Open: All changes are in pdf.js worldMode path; single-room (non-world) path still doesn't get chain dims, label rotation, or arc cap. Pre-existing limitation tracked in priority order #1 sub-bullets.

[LOG — 2026-04-26]
- Action: Naming bug killed at root by removing post-scan matching layer.
- Files: RoomPlanPlugin.swift, pdf.js
- Decision: Trust scan-time names — skip StructureBuilder + showNamingScreen + matchNamesToStructuredRooms. buildStructure() now calls fallbackRooms() directly and fires onComplete(.success). fallbackRooms() expanded to full dict parity with structureToRooms: doors/windows counts, doorSegments (with nx/nz/width), windowSegments, openingSegments, objects (category/dims/position/rotation/confidence), worldX/worldZ from global gMinX/gMinZ across all capturedRooms. Dead helpers left in file with DEAD CODE comments. Door swing arc cap reverted per Kalin's request — all swings drawn, original (80,80,80)/0.4pt stroke.
- Open: Without StructureBuilder, shared walls between rooms won't merge to a midline — adjacent rooms may render as parallel wall pairs separated by wall thickness. Chain dim dedup compensates on dimensions. If thick double-walls are visually unacceptable, re-introduce StructureBuilder behind a flag (but keep inline naming — the matching layer was the bug).
