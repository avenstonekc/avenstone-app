# Daily Log Arc — Design Blueprint

_Living doc. Update each phase as it ships._

---

## Purpose

Replace the current unfiltered client photo gallery with a curated, PM-approved daily log flow. Whoever is on site — a sub or the PM — captures what happened in one free-text box plus photos. AI drafts a client-facing update message from that note and the job's schedule. The PM reviews the message, curates photos, and sends. The client gets notified and sees the message + curated photos.

**Photos reach the client only through a sent daily log — no unfiltered client gallery.**

---

## Flow

```
Field capture (sub or PM)
  → one "what happened today" box + photos → creates draft daily_log
  → AI drafts client_message from work_completed note + job schedule
  → PM reviews message (editable), curates photos, taps "Send to Client"
  → Send = approval: log marked sent/approved, client notified
  → Client sees sent message + curated photos
```

---

## Phase Plan

| Phase | Scope | Status |
|-------|-------|--------|
| 1 — Schema reset | Add `client_message TEXT` to `daily_logs`; rewrite arc doc | **Shipped** |
| 2 — AI edge-function rework | Rework `ai-daily-log-draft` to generate a client-facing update message from `work_completed` + job schedule instead of filling internal log fields | **Shipped** |
| 3 — Capture rebuild | Replace current 7-field form with one-box capture (`work_completed`) + photos; remove structured fields (weather, crew_count, hours_worked, materials_used, issues) from UI | **Shipped** |
| 4 — PM review + Send screen | One screen: capture note + photos, editable `client_message`, photo curation, "Send to Client" button — sets `status='approved'`, `approved_at`, `approved_by_id`, fires client notification | Planned |
| 5 — Client view + notification | Client sees sent message + curated photos; gets notified on send | Planned |

---

## Reused vs Net-New

### Reused (wire up, don't rebuild)

- `daily_logs` table — exists, prod-verified; `work_completed` reused as raw capture note
- `sbSubmitDailyLog` / `sbLoadDailyLogs` helpers — need simplification in Phase 3, not rebuild
- `photos.related_entity_type` / `related_entity_id` columns — Phase 4 photo curation uses `related_entity_type='daily_log'`
- `status` / `approved_at` / `approved_by_id` columns — already on table from Phase 1 schema; Send action stamps these

### Net-New (must build)

- `client_message TEXT` column on `daily_logs` (Phase 1 — **done**): holds the AI-drafted client-facing update
- `ai-daily-log-draft` rework (Phase 2 — **done**): input `{ job_id, raw_note }` → loads current phase + upcoming schedule_items (next 30 days, limit 5) → outputs `{ ok, client_message }` (warm prose paragraph(s) covering what happened + what's next)
- One-box capture UI (Phase 3 — **done**): replaces the 7-field form in both LogsTab (PM) and SubJobView (sub); just `work_completed` textarea + photo staging; submit creates draft log → attaches photos (`related_entity_type='daily_log'`) → generates `client_message` (soft failure)
- PM review + Send screen (Phase 4): message editor + photo curation + Send button
- Client notification on send (Phase 4): fires `sbNotifyUser` / push to client
- Client daily log view in `ClientPortal` (Phase 5): shows sent message + curated photos; filters `status = 'approved'` only

---

## Locked Decisions

1. **Capture is one box + photos.** No structured form (weather, crew_count, hours_worked, materials_used, issues). Those columns remain in the table schema but are not written to or shown in the UI.

2. **`work_completed` holds the raw capture note.** The sub or PM types what happened; this field carries it. No new column needed for capture.

3. **AI output is the client message.** `client_message` is the AI's output — a client-facing prose update synthesized from `work_completed` + the job's upcoming schedule. It is not an internal log summary.

4. **Send and approve are one action.** Tapping "Send to Client" stamps `status='approved'`, `approved_at`, `approved_by_id`, and fires the client notification. There is no separate approve-then-notify two-step.

5. **Photos reach the client only via a sent log.** `related_entity_type='daily_log'` + `related_entity_id=<log_id>` + `status='approved'` is the gate. No unfiltered photo tab for clients.

6. **`daily_logs` uses a `draft → approved` status column.** Historical rows default to `'draft'` and are not client-visible until explicitly sent.

7. **Structured columns stay in the DB.** `weather`, `crew_count`, `hours_worked`, `materials_used`, `issues` are not dropped — existing rows retain their values. They are simply unused by the new capture and review UI.

---

## Schema Reference

### `daily_logs` (post Phase 1 reset)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Compatible with `photos.related_entity_id` |
| tenant_id | UUID NOT NULL | RLS-filtered |
| job_id | text → jobs(id) | |
| log_date | date | |
| author_id | UUID → profiles(id) | Sub or PM |
| **work_completed** | text | Raw capture note — "what happened today" |
| **client_message** | text | AI-drafted client-facing update — NULL until AI generates it |
| weather | text | Legacy — retained, not used in new UI |
| crew_count | integer | Legacy — retained, not used in new UI |
| hours_worked | numeric | Legacy — retained, not used in new UI |
| materials_used | text | Legacy — retained, not used in new UI |
| issues | text | Legacy — retained, not used in new UI |
| status | text DEFAULT 'draft' | CHECK ('draft','approved') |
| approved_at | timestamptz | Stamped on Send |
| approved_by_id | UUID → profiles(id) | Stamped on Send |
| created_at | timestamptz | |

### Photo → Log link (Phase 4, no migration needed)

```sql
-- Linking a photo to a sent log:
UPDATE photos
  SET related_entity_type = 'daily_log',
      related_entity_id   = '<log_uuid>'
  WHERE id = '<photo_uuid>';
```

---

## Open Items

- Phase 1: **shipped**. `client_message` column added; arc doc rewritten to corrected design.
- Phase 2: **shipped**. `ai-daily-log-draft` reworked — input `{ job_id, raw_note }`, loads current phase + upcoming schedule items, outputs `{ ok, client_message }`. `sbGenerateDailyLogDraft` helper updated to return `data: { client_message }`. Haiku, max_tokens 512.
- Phase 3: **shipped**. One-box capture rebuilt in both LogsTab and SubJobView. 7-field form + AI Draft Assist removed. Submit sequence: create draft → attach photos → generate `client_message`. Legacy columns retained in DB, unused in UI.
- Phase 4: PM review + Send screen design — standalone modal or inline in LogsTab? Decide before building.
- Phase 5: client view in ClientPortal — new `logs` tab or section within existing tab? Decide before building.
