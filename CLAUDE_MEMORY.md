---
# Avenstone App — Session Memory Register
_Read this file at the start of every session. Append a new entry at the end of every session._

## How to use
- On session start: read this file top to bottom before doing anything
- Entries are logged automatically — no manual trigger needed
- Auto-consolidation triggers at 15+ entries on session start

---

## Project snapshot (as of 2026-04-14)

**Repo:** github.com/avenstonekc/avenstone-app  
**Deploy:** Vercel  
**Stack:** React, Supabase  
**Supabase URL:** https://cbfftukmhqvvjlrlnltk.supabase.co  

**Tenants:**
- Tenant ID: 00000000-0000-0000-0000-000000000001
- Kalin auth ID: 8171742a-b586-4f13-be61-744e191a1896
- Blake auth ID: 066c8241-accb-490b-9f98-b8b7cb24c33b

**Active modules:** Job pipeline, leads screen, AI estimator, AI companion (per-job per-person), AI intake wizard, AI field agent, AI home companion, master agent, AI pm-nightly alerts, AI knowledge base, AI setup wizard, LiDAR scanner (React UI + Capacitor bridge, simulation mode), material selection screen, contract gen + signature pad, client portal, owner portal, sub portal + onboarding wizard + rate modal, ITB system, Gantt/list scheduler, PDF gen, consultation tab (ambient + measure mode), materials tab, public pages (completion, review, profile), contact sequences + sequence runner, address autocomplete, push notifications, Stripe payments, GHL webhook, Twilio inbound SMS, multi-tenant arch

**Remaining / incomplete:**
- Lien waiver generation (pdf-lib preferred over jsPDF)
- Automated tenant provisioning (single-button onboarding script)
- Capacitor iOS build (Apple Developer approved 2026-04-14, MacInCloud ready)
- LiDAR Swift plugin (RoomPlan API) — React side done, plugin not written yet
- White-label onboarding wizard (replace 7-question AiSetupWizard)
- AI PM dashboard (owner screen for nightly alert data + job health scores)

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
