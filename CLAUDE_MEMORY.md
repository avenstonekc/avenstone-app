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
- Next: Test single-room LiDAR scan on real device via TestFlight. If Phase 1 works, next session = Swift plugin upgrade to RoomPlan 2.0 (live floor plan building + walking indicator, Magic Plan style) and PDF export.
