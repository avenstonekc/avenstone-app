# Daily Log Arc — Design Blueprint

_Living doc. Update each phase as it ships._

---

## Purpose

Replace the current unfiltered client photo gallery with a curated, PM-approved daily log flow. Whoever is on site — a sub or the PM — captures raw field input (a quick note + photos). AI drafts a structured daily log from that input. The PM or owner reviews, edits, curates which photos attach, and approves. The client then sees approved logs and their curated photos. **Photos reach the client only through an approved daily log — no unfiltered client gallery.**

---

## Flow

```
Field capture (sub or PM)
  → raw note + photos uploaded to job
  → AI drafts a daily log (Phase 2)
  → PM/owner reviews, edits, curates photos, approves (Phase 3)
  → Client sees approved log + curated photos only (Phase 4)
```

---

## Phase Plan

| Phase | Scope | Status |
|-------|-------|--------|
| 1 — Schema foundation | `daily_logs` approval columns (`status`, `approved_at`, `approved_by_id`); arc doc | **Shipped** |
| 2 — AI draft generation | `ai-daily-log-draft` edge fn: `{ job_id, raw_note }` → `{ work_completed, materials_used, issues }`; `sbGenerateDailyLogDraft` helper | **Shipped** |
| 3a — AI draft assist UI | Quick-note textarea + "Generate Draft" button at top of both daily-log forms (LogsTab PM form + SubJobView sub form); prefills work_completed, materials_used, issues via `sbGenerateDailyLogDraft` | **Shipped** |
| 3b — PM approval + photo curation | UI in FieldTab → Daily Logs: review/edit draft, pick which photos attach (`related_entity_type='daily_log'`), approve button sets `status='approved'` | Planned |
| 4 — Client-facing view | New tab/section in ClientPortal showing approved logs + their curated photos; replaces unfiltered gallery | Planned |

---

## Reused vs Net-New

### Reused (wire up, don't rebuild)

- `daily_logs` table + full schema — exists, prod-verified
- `sbSubmitDailyLog` / `sbLoadDailyLogs` helpers in `supabase.js`
- `LogsTab.jsx` PM form — becomes the human review/edit surface for AI drafts
- Sub daily log form in `SubJobView.jsx` — already functional, same `sbSubmitDailyLog` call
- `photos.related_entity_type` / `related_entity_id` columns — entity linkage already on the table; Phase 3 uses `related_entity_type='daily_log'`
- `process-transcript` edge function — pattern template for the AI draft function

### Net-New (must build)

- `ai-daily-log-draft` edge function (Phase 2 — **done**): `POST { job_id, raw_note }` → `{ ok, work_completed, materials_used, issues }`; Haiku, max_tokens 1024
- `status` / `approved_at` / `approved_by_id` columns on `daily_logs` (Phase 1 — **done**)
- AI draft assist UI on both log forms (Phase 3a — **done**): quick-note textarea + "Generate Draft" button in LogsTab and SubJobView
- PM photo-curation UI: link/unlink photos to a log entry via `related_entity_id` (Phase 3b)
- Approve button: stamps `status='approved'`, `approved_at`, `approved_by_id` (Phase 3b)
- Client daily log view in `ClientPortal` (Phase 4)
- RLS / query filter: client queries filter `status = 'approved'` only

---

## Locked Decisions

1. **Photos reach the client only via an approved log.** `related_entity_type='daily_log'` + `related_entity_id=<log_id>` + `status='approved'` is the gate. No unfiltered photo tab for clients.

2. **`daily_logs` uses a `draft → approved` status column.** All historical rows default to `'draft'` — they were never curated and must not become client-visible.

3. **The existing `LogsTab` PM form is the review/edit surface for AI drafts.** No new modal. The AI fills the fields; the PM edits and approves inline.

4. **Approval is PM or owner.** The same person who captured the data may approve. No separate approver role required.

5. **No photo schema change.** `photos.related_entity_id` is `UUID`, `daily_logs.id` is `UUID` — they are type-compatible. The link is made by writing `related_entity_type='daily_log'` and `related_entity_id=<log_id>` on the photo row in Phase 3. No migration needed for photos.

---

## Schema Reference

### `daily_logs` (post Phase 1)

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | Compatible with `photos.related_entity_id` |
| tenant_id | UUID NOT NULL | RLS-filtered |
| job_id | text → jobs(id) | |
| log_date | date | |
| author_id | UUID → profiles(id) | Sub or PM |
| weather | text | |
| crew_count | integer | |
| hours_worked | numeric | |
| work_completed | text | |
| materials_used | text | |
| issues | text | |
| **status** | text DEFAULT 'draft' | CHECK ('draft','approved') — **Phase 1 addition** |
| **approved_at** | timestamptz | NULL until approved — **Phase 1 addition** |
| **approved_by_id** | UUID → profiles(id) | NULL until approved — **Phase 1 addition** |
| created_at | timestamptz | |

### Photo → Log link (Phase 3, no migration needed)

```sql
-- Linking a photo to an approved log:
UPDATE photos
  SET related_entity_type = 'daily_log',
      related_entity_id   = '<log_uuid>'
  WHERE id = '<photo_uuid>';
```

---

## Open Items

- Phase 2: **shipped**. Draft fires on explicit "Draft log" button tap (not automatic — per API cost rules).
- Phase 3a: **shipped**. AI draft assist on both PM form (LogsTab) and sub form (SubJobView). User types a quick note, taps "Generate Draft", fields are prefilled. Manual entry path unchanged.
- Phase 3b: decide whether photo curation is a separate modal or inline in the `LogsTab` review surface. Approve button stamps `status='approved'`, `approved_at`, `approved_by_id`.
- Phase 4: decide whether the client view is a new `logs` tab in `ClientPortal` or a section within an existing tab.
