---
# Avenstone App — Session Memory Register
_Read this file at the start of every session. Append a new entry at the end of every session._

## How to use
- On session start: read this file top to bottom before doing anything
- Entries are logged automatically — no manual trigger needed
- Auto-consolidation triggers at 15+ entries on session start

---

## Project snapshot (as of 2026-04-15)

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

**Active modules:** Job pipeline, leads screen, AI estimator, AI companion (per-job per-person), AI intake wizard (now a pure LiDAR scanner wrapper — Phase 1), AI field agent, AI home companion, master agent, AI pm-nightly alerts, AI knowledge base, AI setup wizard, LiDAR scanner (React UI + Capacitor bridge + RoomPlanPlugin.swift shipped, real scanning on iPhone 12 Pro+/iPad Pro 2020+), material selection screen, contract gen + signature pad, client portal, owner portal, sub portal + onboarding wizard + rate modal, ITB system, Gantt/list scheduler, PDF gen, consultation tab (ambient + measure mode), materials tab, public pages (completion, review, profile), contact sequences + sequence runner, address autocomplete, push notifications, Stripe payments, GHL webhook, Twilio inbound SMS, multi-tenant arch

**Remaining / incomplete:**
- Lien waiver generation (pdf-lib preferred over jsPDF)
- Automated tenant provisioning (single-button onboarding script)
- LiDAR Phase 2: RoomPlan 2.0 multi-room capture with live floor plan + walking indicator
- LiDAR Phase 3: PDF floor plan export, furniture inventory, material visualization overlay
- LiDAR → job persistence (Phase 1 holds rooms in local state only)
- White-label onboarding wizard (replace 7-question AiSetupWizard)
- AI PM dashboard (owner screen for nightly alert data + job health scores)

**Retired / do not use:** MacInCloud (Codemagic replaced it — VM reset issues made it unusable), the old 3-step AI chat + manual grid AiIntakeWizard flow (replaced by pure LiDAR flow)

**Branding:** Navy #0A1F44 / Gold #C9A84C

---

## Session log

[LOG — 2026-04-14]
- Action: Initialized CLAUDE_MEMORY.md and memory system
- Files: CLAUDE_MEMORY.md created, CLAUDE.md appended
- Decision: Switched from session-end logging to automatic action-triggered logging for reliability

[LOG — 2026-04-14]
- Action: Audited CLAUDE.md and CLAUDE_MEMORY.md against actual project structure and fixed all gaps
- Files: CLAUDE.md, CLAUDE_MEMORY.md
- Decision: Folder structure, edge functions table, AI component map, JobDet tabs, and active modules list were all significantly out of date — updated to reflect current codebase (35 edge functions, full component list, correct tabs)
- Decision: Apple Developer status updated from "waiting on approval" to "active — approved 2026-04-14"
- Next: LiDAR Swift plugin implementation — write RoomPlanPlugin.swift (Capacitor plugin wrapping RoomPlan API), Phase 1: single room scan → real L x W x H replacing simulation mode

[LOG — 2026-04-15]
- Action: Capacitor iOS shell app successfully running on MacInCloud (iPhone 17 Pro simulator). First native iOS launch of Avenstone.
- Files: avenstone-vite/capacitor.config.json, avenstone-vite/ios/** (added), avenstone-vite/package.json (+@capacitor/core, cli, ios), scripts/mac-setup.sh
- Decision: appId = com.avenstonekc.avenstone (matches App Store Connect app record), appName = Avenstone, webDir = dist
- Decision: Built one-line Mac bootstrap script (curl | bash) that handles Xcode CLI tools, Homebrew, Node, CocoaPods, clone, npm install, cap sync, cap open — zero copy-paste from Windows

[LOG — 2026-04-15]
- Action: Abandoned MacInCloud entirely — VM resets wiped Xcode and repo every disconnect. Switched to Codemagic free tier for iOS builds.
- Files: codemagic.yaml
- Decision: Codemagic wired up with App Store Connect API key, distribution cert auto-generated, Unix epoch timestamp used for build numbers (monotonic, collision-proof), CapacitorHttp plugin enabled to route fetch through native URLSession (fixes "load failed" on Supabase edge functions)
- Decision: every `git push origin main` triggers a Codemagic build → uploads to TestFlight → phone gets update automatically. Zero MacInCloud ever again.

[LOG — 2026-04-15]
- Action: Wrote RoomPlanPlugin.swift (Capacitor CAPBridgedPlugin wrapping Apple RoomPlan API), built end-to-end, shipped to TestFlight, first install on real iPhone successful.
- Files: avenstone-vite/ios/App/CapApp-SPM/Sources/CapApp-SPM/RoomPlanPlugin.swift, avenstone-vite/ios/App/App/Info.plist (camera + photo + mic perms + ITSAppUsesNonExemptEncryption=false), avenstone-vite/src/lib/lidar.js
- Decision: Plugin uses `#if canImport(RoomPlan)` guards so it compiles on simulator but only activates on real iPhone 12 Pro+/iPad Pro 2020+. Phase 1 = single-room scan returning length/width/height/sqft/doors/windows in feet. Phase 2 = RoomPlan 2.0 multi-room merged capture (not built yet). Phase 3 = PDF floor plan export (not built yet).

[LOG — 2026-04-15]
- Action: CORRECTION — earlier CLAUDE.md claimed "AiIntakeWizard.jsx Step 2 — toggle between Scan Rooms (LidarScanner) and Enter Manually (original grid)" was built. That was **false**. LidarScanner.jsx existed as a standalone component, but was never imported into AiIntakeWizard. Step 2 only showed a manual grid.
- Action: Completely rewrote AiIntakeWizard as a pure LiDAR scanning flow. Removed AI chat step, removed manual grid, removed review/submit step, removed Supabase lead creation. New wizard is a thin wrapper that renders LidarScanner fullscreen.
- Files: avenstone-vite/src/components/ai/AiIntakeWizard.jsx (full rewrite), avenstone-vite/src/components/ai/LidarScanner.jsx (fixed async isLidarSupported bug)
- Decision: Path A — scanned rooms held in local state only, nothing persisted to DB. Lead creation + save-to-job will return in a later phase alongside RoomPlan 2.0 multi-room capture.
- Next: Phase 1 confirmed working on iPhone 17 Pro. Next = Phase 2 continuous multi-room session + contact persistence.

[LOG — 2026-04-15]
- Action: Phase 1 LiDAR confirmed working on iPhone 17 Pro. Brainstormed and locked LiDAR roadmap Phases 2-4.
- Files: CLAUDE.md (priority order rewritten), CLAUDE_MEMORY.md
- Decision: Scans attach to contacts (not jobs directly). Contact must exist first. Scan carries to job documents when job is created. New table needed: contact_lidar_scans.
- Decision: Phase 2 = continuous multi-room session, one scan walks room to room. ~1,500 sqft limit per session. Larger spaces scan by wing and stitch in Phase 4 editor.
- Decision: Phase 4 = wing editor + GPS-anchored stitching + window/door type editing. Not urgent.
- Next: Build Phase 2 Swift plugin upgrade (continuous RoomCaptureSession) + contact persistence (contact_lidar_scans table + attach-to-contact UI)

[LOG — 2026-04-15]
- Action: Built LiDAR scan persistence — scans attach to jobs via FloorPlan tab and to contacts via ContactsScr
- Files: supabase.js (+sbSaveJobLidarScan, sbGetJobLidarScans, sbSaveLidarScan, sbGetContactLidarScans), AiIntakeWizard.jsx (+jobId prop, job mode skips contact picker), LidarScanner.jsx (accumulated rooms display in ResultPhase), JobDet.jsx (+FloorPlanTab import + tab), components/jobs/tabs/FloorPlanTab.jsx (new), ContactsScr.jsx (+floor plans card in contact detail)
- Decision: LiDAR scans live in both contact_lidar_scans and job_lidar_scans tables. Both use TEXT FK (not uuid) because contacts.id and jobs.id are TEXT type. FK constraint error was the key gotcha.
- Decision: FloorPlanTab is the UX entry point for scanning within a job — opens AiIntakeWizard with jobId prop, reloads on close.
- Next: Build accumulated rooms display (done), contact picker flow (done), FloorPlanTab (done)

[LOG — 2026-04-15]
- Action: Built AI PM Dashboard — owner-only screen showing 30-day nightly alert history with stat cards and alert breakdown
- Files: components/dashboard/AiPmDashboard.jsx (new), App.jsx (+nav item + render, owner-only)
- Decision: Dashboard loads from notifications table filtered to 6 ai-pm-nightly alert types. Nav item in Settings section, owner role only.

[LOG — 2026-04-15]
- Action: Analyzed sub portal for upgrade gaps — phase confirmation and sub CO submission are missing; AI companion removed from sub scope per user request
- Decision: Replace sub AI companion idea with PM-Sub direct chat feature (subs can message project managers directly on a job, separate from the general job messages thread)
- Open: PM-Sub chat feature not yet built. Sub phase confirmation (mark started/complete) not yet built. Sub CO submission not yet built.
- Next: Build PM-Sub chat feature

[LOG — 2026-04-19]
- Action: Capture v2 Phase 2 shipped — Exterior Mode AR capture, full end-to-end from scan to save
- Files: ios/App/CapApp-SPM/Sources/CapApp-SPM/ExteriorScanViewController.swift (new), RoomPlanPlugin.swift (+startExteriorScan method), src/lib/lidar.js (+startExteriorScan export + web mock), src/lib/supabase.js (+outlineData param on both save helpers), src/components/ai/LidarScanner.jsx (mode toggle segmented control, exterior button + scan flow), src/components/ai/AiIntakeWizard.jsx (exterior capture handler, job+contact save paths, exterior summary UI), src/components/jobs/tabs/FloorPlanTab.jsx (exterior scan card with perimeter+corners display)
- Decision: ExteriorScanViewController uses ARKit ARSCNView + ARWorldTrackingConfiguration (not RoomPlan — LiDAR fails outdoors). Tap corners → gold spheres + cylinder lines. Shoelace formula for area (XZ plane). Long press + pan to drag/reposition corners. Undo/Reset/Done buttons.
- Decision: Exterior results stored in outline_data JSONB column (already added in Phase 1 SQL). rooms=[] for exterior scans. capture_mode='exterior' distinguishes them in the UI.
- Decision: Mode toggle (Interior Rooms / Exterior Outline) lives at top of LidarScanner ListPhase — switches the whole UI context. No extra phases added to React state machine.
- Next: Phase 3 = height capture (auto-derive interior from LiDAR mesh, exterior via user-tap raycast)

[LOG — 2026-04-19]
- Action: Capture v2 Phase 1 shipped — CaptureMode enum, expanded data model, GPS stamping module
- Files: src/lib/captureTypes.js (new), src/lib/gps.js (new), src/lib/supabase.js (sbSaveJobLidarScan + sbSaveLidarScan updated), src/components/ai/AiIntakeWizard.jsx (GPS wired into both save paths), ios/App/App/Info.plist (NSLocationWhenInUseUsageDescription added)
- Decision: CaptureMode is JS string constants in Phase 1 (no Swift changes). Swift enum added in Phase 2 when AR config branching is needed.
- Decision: heightMeters at capture level is distinct from per-room height already in room objects. Phase 1 stores null. Phase 3 auto-derives from room heights (interior) or user tap (exterior).
- Decision: LiDAR roadmap in CLAUDE.md (Phase 2 = multi-room, Phase 3 = PDF) is a separate track from Capture v2 phases. Capture v2 = Exterior Mode + height + GPS + quality meter.
- DB: job_lidar_scans and contact_lidar_scans both have 10 new nullable columns: capture_mode (default 'interior'), height_meters, height_source, height_points[], gps_latitude, gps_longitude, gps_accuracy, quality_score, quality_grade, quality_deductions (JSONB)
- Open: Phase 2 = Exterior AR mode + corner placement UI. Phase 3 = height capture (both modes). Phase 4 = quality meter.
- Next: Capture v2 Phase 2 — Exterior mode AR config + corner placement
