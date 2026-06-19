# UNIFIED_FILES_ARC

> **STATUS (2026-06-19):** Phases 1-2 SHIPPED — `job_files` migration (`20260526200000_unified_files_arc_phase_1.sql`) + `FilesTab.jsx` fully live. Phase 3 (deprecate `DocsTab.jsx`, rewire photo/doc surfaces) INCOMPLETE — `DocsTab.jsx` still live. Phases 4-5 not started. Doc Phase Plan table incorrectly shows all phases as "Planned."

_Living doc. Update each phase as it ships._

---

## Purpose

One file management surface per job. Photos, documents, receipts, floor plans, change orders, and communications live in folders that **appear dynamically when the first file lands**. AI auto-categorization handles routing on upload. Trade-neutral foundation — same code, different folder taxonomy per tenant.

**Replaces**: separate `job_documents` table UI (DocsTab) + scattered field-photo surface (PhotosTab in NotesPhotosTab, accessed through FieldTab). **Augments**: `photos` table (absorbed via migration, not dropped), `floor_plans` table (linked, not moved), daily logs (text stays, photos route through unified system).

**Foundation for downstream arcs**: PROOF_ARC (CO photo gate writes to unified system — `category='Change Orders'` folder is already in the taxonomy), WALKTHROUGH_INTAKE_ARC (client selection storage lives in `Selections` folders per room), GOOGLE_DRIVE_ARCHIVE_ARC (lifecycle column is included here so that arc needs zero migration). Done first because every downstream arc that touches files has to pick a table — this decides once.

---

## Why Now (vs PROOF_ARC first)

PROOF_ARC's photo gate would add a `category` column to `photos` or extend `job_documents`. That's a band-aid — two file tables with partial categorization. Every future arc that uploads anything asks "which table?" and builds its own filter logic.

Unified files makes that decision once. After this arc:
- PROOF_ARC Phase 1 schema is free (category column already exists in `job_files`)
- WALKTHROUGH_INTAKE_ARC has a natural home for client selections
- Receipts folder replaces a `job-receipts` bucket with no UI today
- `log_receipt` in Master Agent writes a real file row, not just a transaction

Competitor research (2026-05-26): Buildertrend's "Core Four" treats files as job-folder-organized, mobile-first. Procore's Document Management adds enterprise markup + version control. Both fail on three things Avenstone can own: dynamic folders (no empty template noise), AI auto-categorization on upload, per-tenant taxonomy by trade vertical. A roofer doesn't need a "Tile" subfolder.

---

## Today's Gap

```
Job                   DocsTab (job_documents, private bucket)
├── plan              → one flat list, no subfolders, no photos
├── permit            → PM hunts manually for "permit.pdf"
├── contract          → same table as plans and specs
└── other (catch-all)

Field (FieldTab → NotesPhotosTab → PhotosTab)
├── job-photos bucket (public — anyone with URL can view)
├── no subcategory (Before, During, Tile, Drywall, etc. = label field, rarely used)
├── entity-linked (schedule_item, daily_log, material_order) but no folder view
└── completely separate from DocsTab — PM switches tabs to find files

job-receipts bucket (private)
└── images only — no file-row in any table, only linked from job_transactions.receipt_url
    — no UI to browse receipts; rep has to find the transaction to get the image

floor_plans table (separate tab — FloorPlanTab)
└── linked to LiDAR scans — not surfaced in docs or photos at all
```

The net result: a rep on a job site can't answer "where's the permit?" without knowing which tab it landed in. A PM tracking receipts has to dig through the transaction list. Photos have no folder structure. Nothing is searchable by name.

---

## Architecture

```
job_files (new table)
    │
    ├── category      ── 'Photos' | 'Documents' | 'Receipts' | 'Floor Plans' |
    │                    'Change Orders' | 'Communications' | 'Selections'
    │
    ├── subcategory   ── per-tenant config (Photos: Tile, Framing, Before, After…)
    │                    Receipts: flat (no subcategory). Floor Plans: flat.
    │
    ├── related_entity_type / _id  ── preserves existing entity-linkage patterns
    │                                  (schedule_item, daily_log, change_order, floor_plan)
    │
    ├── lifecycle_status  ── 'active' | 'archived' | 'archive_failed'
    │                         future Google Drive arc flips this; no code yet
    │
    └── receipt_* columns  ── date, label, amount, vendor per receipt file

tenant_file_subcategories (new table)
    └── per-tenant list of subcategories per category
        Avenstone GC seed: Photos → Framing, Drywall, Tile, Paint, Plumbing,
        Electrical, Cabinets, Demo, Roofing, HVAC, Flooring, Trim/Finish,
        Before, During, After, Final

inferFileCategory(file, jobContext)
    ├── Rule path  ── filename patterns, MIME type, upload source → instant classification
    └── Vision path  ── Haiku vision on photos (~$0.001/call) → subcategory suggestion
                         High confidence (≥80%) → auto-filed. Below → Uncategorized + prompt.

Unified Files tab (new)
    ├── Recent view (default) ── last 20 files across all folders
    ├── Tree view (desktop)   ── category → subcategory tree, dynamic (empty = hidden)
    └── Grid view (mobile)    ── photo-heavy grid, category filter bar

Bulk-tag UI
    └── multi-select in grid → bottom-bar category/subcategory picker

Download / Email / Share
    └── signed-URL pattern (existing, 7-day expiry) on job-files bucket
```

---

## Phase Plan

| Phase | Scope | Prompts | Status |
|-------|-------|---------|--------|
| 1 — Schema + migration | `job_files` table, `tenant_file_subcategories`, `inferFileCategory` helper, backfill `photos` + `job_documents` into `job_files` | 3 | Planned |
| 2 — Unified Files tab | Tree/Grid/Recent views, upload flow with AI preview, bulk-tag, download/email/share | 3 | Planned |
| 3 — Rewire existing surfaces | PhotosTab deprecation, schedule item photos, daily log photos, CO photos, Master Agent `log_receipt` + `log_photo` | 2 | Planned |
| 4 — Portal views | Client and sub filtered folder trees | 2 | Planned |
| 5 — Polish | Mobile camera flow, drag-drop, search, perf on 200+ file jobs | 2 | Planned |

**Total: ~12 prompts.**

---

## Reused vs Net-New

### Reused (wire up, don't rebuild)
- `photos` table — absorbed via migration, not dropped. Old `sbPhoto` callers keep working during Phase 3 rewire.
- `job_documents` table — same pattern. Migrated rows, soft-deprecated.
- `floor_plans` / `floor_plan_versions` — NOT merged. Linked from unified tab via virtual `job_files` rows (`related_entity_type='floor_plan'`).
- `sbUploadDoc` / `sbLoadDocs` / `sbDelDoc` — kept working until Phase 3; new `sb*Files*` helpers layered alongside.
- `sbPhoto` / `sbCountPhotosForEntity` / `sbLoadPhotosForEntity` — same pattern; rewired in Phase 3.
- Signed-URL pattern (`createSignedUrl`, `job-documents` private bucket pattern) — used by new `job-files` bucket.
- Resend email infra — Email action bundles signed URLs and fires Resend.
- `sbToggleDocVisible` pattern — replaces with `sbSetFileClientVisible` using `client_visible` column already in schema.
- Master Agent `CONFIRM_TOOLS` confirmation card — receipt and photo verbs use same pattern.
- `AV_TENANT` + RLS — every new table is tenant-scoped.

### Net-New (must build)
- `job_files` table — central, see Schema Reference.
- `tenant_file_subcategories` table — per-tenant subcategory list, seeded by trade at onboarding.
- `job-files` storage bucket (private, replaces `job-photos` public + `job-documents` private).
- `inferFileCategory(file, jobContext)` — rule-based + Haiku vision categorizer.
- Unified Files tab (`FilesTab.jsx`) — Tree / Grid / Recent views.
- Bulk-tag UI — multi-select grid with bottom-bar category/subcategory picker.
- `sbUploadFile` / `sbLoadFiles` / `sbDelFile` / `sbSetFileClientVisible` — new helpers replacing split `sbUploadDoc` / `sbPhoto` paths.
- `sbGetFilesForFolder(jobId, category, subcategory)` — tree node data.
- Master Agent `log_photo` verb — accepts file(s), routes through AI categorizer with rep override on confirm card.
- Folder-level share/email helpers — bundle signed URLs per category or subcategory.
- Phase 1 migration script — backfill `photos` + `job_documents` into `job_files` with best-effort categorization.

---

## Locked Decisions

1. **One `job_files` table** replaces `job_documents` and absorbs `photos`. `floor_plans` stays separate, linked by reference.

2. **Folders are derived, not stored.** Two columns: `category` (fixed enum) and `subcategory` (tenant-configurable string). No `job_folders` table. Folder existence = `COUNT(*) > 0` for that (job_id, category, subcategory) group.

3. **Folders appear dynamically.** First file with `subcategory='Tile'` → Tile subfolder appears. Last file leaves → gone. Zero empty template noise.

4. **AI auto-categorization on photo upload.** Haiku vision on image files (~$0.001/upload) + rule-based on docs + upload-source context + current job phase. Rule path takes priority; vision only fires when upload source is generic (no entity context). Returns confidence + proposed category + subcategory.

5. **Per-tenant subcategory list.** Seeded from trade vertical at tenant onboarding (or AI setup wizard). Avenstone GC default `Photos` subcategories: Framing, Drywall, Tile, Paint, Plumbing, Electrical, Cabinets, Demo, Roofing, HVAC, Flooring, Trim/Finish, Before, During, After, Final. Single-trade tenants (painter, roofer, tile) get shorter lists. Tenant admin edits later.

6. **Receipts folder is flat.** No subcategory. Each receipt row has: `receipt_date` (receipt date, not upload date), `receipt_label`, `receipt_amount`, `receipt_vendor`. Sortable and searchable. The financial record stays in `job_transactions` — `job_files` is the file attachment.

7. **Receipts accept files, not just images.** PDFs and images both valid. Current Master Agent image-only restriction replaced in Phase 3. `log_receipt` verb writes one `job_transactions` row + one `job_files` row atomically (or best-effort if file upload fails).

8. **Daily log text stays in DailyLogTab.** Photos attached to daily logs write to `job_files` with `category='Photos'`, `related_entity_type='daily_log'`, `related_entity_id=<log.id>`. Daily log tab renders them inline via the entity link; unified tab also shows them in the Photos folder.

9. **Notes stay in NotesTab.** Internal context, not files.

10. **PhotosTab (in NotesPhotosTab, accessed via FieldTab) is deprecated in Phase 3.** File uploads route through Unified Files tab upload flow directly. FieldTab keeps Notes sub-tab; Photos sub-tab removed.

11. **Existing files migrated in place.** Full migration at Phase 1 cutover. `photos` rows → `job_files` with `category='Photos'`, subcategory inferred from `label` field (before/after/during keywords matched) and `related_entity_type` (schedule_item type → trade hint). `job_documents` rows → `job_files` with category derived from `file_type` (plan→Documents/Plans, permit→Documents/Permits, contract→Documents/Contracts, etc.). Migration writes `photos.migrated_to_job_files_id` and `job_documents.migrated_to_job_files_id` for rollback safety. Old tables retained 30 days post-validation, then dropped.

12. **Storage bucket consolidation.** Phase 3 new uploads go to `job-files` (private). Old rows linked to `job-photos` (public) and `job-documents` (private) keep their original paths — signed URL logic resolves both. After migration window, `job-photos` public access is restricted to read-only legacy; no new writes. `job-receipts` bucket absorbed into `job-files`.

13. **Lifecycle column included now.** `lifecycle_status TEXT NOT NULL DEFAULT 'active' CHECK (lifecycle_status IN ('active', 'archived', 'archive_failed'))`. The Google Drive archive arc flips this — no archive code in this arc.

14. **Permissions per folder, not per file.** Client sees Photos (client_visible=true rows), Floor Plans, Communications. Sub sees their trade subfolder + relevant daily log photos + Floor Plans. Internal sees everything. Folder-level permission helpers filter based on `profile.role`.

15. **Sharing: download, email, share folder.** Each file → Download (signed URL) + Email (Resend with signed URL). Each folder → "Share folder" bundles all files in that (category, subcategory) group into a single Resend email.

16. **Three views of the same data.** Recent (default landing — last 20 files, any folder). Tree (desktop — category tree with file counts). Grid (mobile — photo grid with category filter pill bar).

17. **Master Agent verbs stay confirm-gated.** `log_receipt` (already in CONFIRM_TOOLS) writes `job_transactions` + `job_files`. New `log_photo` verb added to CONFIRM_TOOLS — confirm card shows proposed folder before commit. No silent file writes.

---

## Phase Detail

### Phase 1 — Schema + Migration

**New tables:**
- `job_files` — see Schema Reference
- `tenant_file_subcategories` — per-tenant list, Avenstone GC seeded at migration time

**New helper `inferFileCategory(file, jobContext)`:**
Rule path (in priority order):
1. `uploadSource='receipt'` → `{ category: 'Receipts', subcategory: null, confidence: 1.0, source: 'rule' }`
2. `uploadSource='schedule_item'`, item type known → `{ category: 'Photos', subcategory: <trade-from-item-type>, confidence: 0.9, source: 'rule' }`
3. `uploadSource='daily_log'` → `{ category: 'Photos', subcategory: <current-phase-trade>, confidence: 0.85, source: 'rule' }`
4. MIME type is `application/pdf` and filename contains `permit` → `{ category: 'Documents', subcategory: 'Permits', confidence: 0.95, source: 'rule' }`
5. MIME type is `application/pdf` and filename contains `contract` → `{ category: 'Documents', subcategory: 'Contracts', confidence: 0.95, source: 'rule' }`
6. MIME type is `application/pdf` → `{ category: 'Documents', subcategory: null, confidence: 0.7, source: 'rule' }`
7. MIME type is `image/*`, no other context → Haiku vision call (see below)
8. Default → `{ category: 'Documents', subcategory: null, confidence: 0.5, source: 'default' }`

Vision path (rule path step 7 only):
```
System: "You are a construction photo classifier."
User: [image] + "Tenant subcategories: [list]. Current job phase: <phase>.
Reply with exactly one item from the list or 'Uncategorized'. No other text."
```
Response → `{ category: 'Photos', subcategory: <response>, confidence: 0.95, source: 'vision' }` if not "Uncategorized", else `{ ..., subcategory: null, confidence: 0.4 }`. Cost: ~$0.001/image.

**Confidence threshold:** ≥0.80 → auto-filed to proposed folder. <0.80 → lands in Photos/Uncategorized with a prompt on next open ("5 uncategorized photos — tag them?").

**Migration backfill:**
- `photos` → `job_files`: category='Photos', subcategory from `label` keyword match (before/after/during/demo/tile/framing/drywall/paint), else null. Preserve all entity links.
- `job_documents` → `job_files`: category='Documents', subcategory derived from `file_type` ('plan'→'Plans', 'permit'→'Permits', 'contract'→'Contracts', 'spec'→'Specs', 'inspection'→'Inspections', 'other'→null). Set `client_visible` from existing `is_client_visible`.
- `floor_plans` → virtual `job_files` row per plan: `category='Floor Plans'`, `related_entity_type='floor_plan'`, `related_entity_id=floor_plan.id`, `storage_path=<pdf_storage_path>`, `client_visible=true`.
- Validation: count `photos` vs migrated rows, count `job_documents` vs migrated rows. All must match. Exit non-zero if mismatch.

**Smoke test:**
1. Query `SELECT category, subcategory, COUNT(*) FROM job_files GROUP BY 1,2 ORDER BY 1,2` — reasonable distribution.
2. Check at least one `Photos/Before` row and one `Documents/Contracts` row exist.
3. Verify `migrated_to_job_files_id` set on all old `photos` rows: `SELECT COUNT(*) FROM photos WHERE migrated_to_job_files_id IS NULL` → 0 (except rows with no job_id, if any).

### Phase 2 — Unified Files Tab UI

**`FilesTab.jsx` added to JobDet TABS array** (after `docs`, before or replacing it). Tab id: `files`. TABS entry: `{ id: 'files', lb: 'Files', ic: 'folder' }`.

**Three views:**
- **Recent** (default on load): last 20 rows ordered by `created_at DESC`, any folder. Card per file: thumbnail if image, file icon if doc, receipt icon if receipt. Tap → open/download. Click category label → switch to Tree view filtered to that category.
- **Tree** (desktop, toggled via view selector): left column = category list + file count badge. Right = subcategory breakdown with file grid. Clicking a subcategory shows its files.
- **Grid** (mobile): horizontal filter pill bar (Photos / Docs / Receipts / Floor Plans / All). Below: masonry or 2-col grid. Long-press → multi-select mode for bulk-tag.

**Upload flow:**
1. Drag/drop desktop or tap upload button → file picker (accepts `image/*,application/pdf,.doc,.docx,.xls,.xlsx`).
2. `inferFileCategory` runs client-side (rule path) or calls edge function for vision path.
3. Preview card shows: thumbnail + proposed folder + confidence indicator. Rep can override folder before confirming.
4. On confirm → `sbUploadFile` writes to `job-files` bucket + inserts `job_files` row. If subcategory is new, `tenant_file_subcategories` gets an ON CONFLICT DO NOTHING insert.

**Bulk-tag UI:**
Multi-select mode (checkbox on grid cells) → bottom-bar appears: "Move to: [category dropdown] / [subcategory dropdown] [Move] [Cancel]". Batch UPDATE on selected ids.

**File actions per row/card:**
- Download → `createSignedUrl` 7-day, open in new tab.
- Email → prompt for recipient → Resend with signed URL.
- Share folder → bundles all signed URLs in that (category, subcategory) and emails as a list.
- Delete → soft-delete (`status='deleted'`) with confirm dialog.

**DocsTab deprecation:** render a one-line redirect notice in DocsTab during Phase 2 period: "Files have moved to the Files tab." Remove DocsTab component entirely in Phase 3.

### Phase 3 — Rewire Existing Surfaces

All existing upload callers migrated to `sbUploadFile` with explicit `category` + `uploadSource`. Old helpers (`sbPhoto`, `sbUploadDoc`) kept as thin shims during migration window, then removed.

**Surface-by-surface:**
| Surface | File | Current | Phase 3 action |
|---------|------|---------|----------------|
| PhotosTab (FieldTab) | `NotesPhotosTab.jsx` | `sbPhoto(jid, file)` | Delete `PhotosTab`. NotesTab stays. FieldTab loses Photos sub-tab. |
| Daily log photos | `LogsTab.jsx` | `sbPhoto(job.id, file, 'daily_log', logId)` | Replace with `sbUploadFile(..., { category:'Photos', uploadSource:'daily_log', relatedEntityType:'daily_log', relatedEntityId:logId })` |
| Schedule item photos | `ScheduleTab.jsx`, `SubJobView.jsx` | `sbPhoto(job.id, file, 'schedule_item', id)` | Same pattern with `uploadSource:'schedule_item'`, entity link preserved. |
| Material photos | `MaterialsTab.jsx` | `sbPhoto(...)` | Same. |
| CO photos | `COTab.jsx` (existing) | varies | `category:'Change Orders'`, entity link to CO id. |
| Contract upload | `ClientSignContractModal.jsx`, `CompletionSignoffModal.jsx` | `sbUploadDoc` | `category:'Documents'`, subcategory:'Contracts'. |
| Floor plan PDF | `AiIntakeWizard.jsx`, `FloorPlanTab.jsx` | `sbUploadDoc`, `sbCreateFloorPlan` | `sbCreateFloorPlan` writes floor_plans row as before + upserts virtual `job_files` row. |
| Sub docs | `SubOnboardingWizard.jsx` | `sbUploadDoc` | `category:'Documents'`. |
| Estimate/proposal | `EstimateTab.jsx` | `sbUploadDoc` | `category:'Documents'`, subcategory:'Proposals'. |
| AI transcript | `AiCompanionChat.jsx` | `sbUploadDoc` | `category:'Communications'`. |

**Master Agent rewire:**
- `log_receipt` verb in `ai-master-agent/index.ts`: in addition to writing `job_transactions` row, write one `job_files` row with `category='Receipts'`, `receipt_date`, `receipt_label`, `receipt_amount`, `receipt_vendor` populated from tool input. Receipt image → `job-files` bucket (replaces `job-receipts` bucket). Both writes best-effort — transaction write always commits; file write failure logged but does not block the confirm card.
- New `log_photo` verb added to `ai-master-agent/index.ts` and CONFIRM_TOOLS: accepts image(s) + optional label. Runs `inferFileCategory` vision path on server. Confirm card shows proposed folder. On confirm → `sbUploadFile` to `job-files`.

**DocsTab removal:** delete `DocsTab.jsx`, remove import from `JobDet.jsx`, remove `docs` tab entry from TABS array.

### Phase 4 — Portal Views

**Client portal (`ClientPortalScr`):** New "Files" tab. Loads `job_files WHERE job_id=? AND client_visible=true AND lifecycle_status='active'`. Groups by category (Photos first, then Documents, then Floor Plans). Download button only — no delete/bulk-tag. Grid view only (mobile-first).

**Sub portal (`SubJobView`):** New "Files" section in sub's schedule tab or as a new tab. Loads `job_files WHERE job_id=? AND (related_entity_type IN ('schedule_item', 'daily_log') OR category='Floor Plans') AND lifecycle_status='active'`. Filtered further to items where `related_entity_id` is an item the sub is assigned to. Download only.

**Permission helper:** `sbLoadFilesForRole(jobId, role, userId)` — single helper that encodes the above visibility rules. Callers don't implement their own filter logic.

### Phase 5 — Polish

- **Mobile camera flow:** on iOS (Capacitor), upload button shows native camera/library sheet. File goes through same upload flow with AI preview.
- **Drag-drop desktop:** `ondragover` + `ondrop` on the FilesTab container. Visual drop zone appears. Multiple files accepted, each runs through `inferFileCategory`.
- **Search:** text input at top of FilesTab. Searches `name`, `receipt_label`, `receipt_vendor` across all folders in the job. Real-time debounce (300ms). Results show with folder breadcrumb.
- **Perf on 200+ file jobs:** `sbGetFilesForFolder` uses indexed query (idx_job_files_job_category partial index). Recent view loads 20 rows. Tree view loads counts only, not file rows, until folder is opened. Virtualized list for large folders.
- **Empty states and error handling:** every folder shows empty state inline (not a full-screen spinner). Upload errors report per-file, not per-batch.

---

## Open Questions

Real unknowns — not decisions already locked above.

1. **AI confidence threshold.** 80% default is a guess. After first 100 production uploads, check the `ai_confidence` column distribution. Too high → everything in Uncategorized. Too low → misfiles. Expect to tune.

2. **Receipt OCR for amount extraction.** Should upload flow auto-extract amount from receipt image via Haiku vision? Adds ~$0.002/receipt. Alternative: rep types amount manually (current pattern via `log_receipt` confirm card). Recommendation: skip OCR v1, rep enters amount. Revisit after first 50 receipt complaints.

3. **Floor plans virtual entry vs read-through.** Two options: (a) write a `job_files` row per floor_plan at creation — unified tab queries everything from `job_files`. (b) unified tab reads `floor_plans` directly for the Floor Plans folder. Decision above locks option (a) as virtual entries. Trade-off: every floor_plan PDF update must also update the virtual `job_files` row. `sbCreateFloorPlan` handles this. Confirm this is still clean when floor_plan versioning is active.

4. **Subcategory editing UX.** When rep moves a file out of a subcategory and the folder becomes empty — folder disappears immediately. If rep mis-clicks and moves back, folder reappears. Is immediate disappear jarring? Recommendation: immediate, it's derived state. No "empty folder" limbo.

5. **Cross-job search.** "Find all tile photos across every job" — single-job scope v1. Cross-job needs tenant-wide query + job metadata join. Deferred to v2, captured here.

6. **Concurrent uploads from multiple users.** Two reps upload to same job simultaneously. `tenant_file_subcategories` insert uses `ON CONFLICT DO NOTHING` — idempotent. `job_files` inserts are independent rows — no race condition.

---

## Cost Guardrails

**New AI cost: Haiku vision on photo uploads.**
- ~$0.001/image (Haiku $0.25/$1.25 per MTok input/output; image = ~760 input tokens + ~10 output tokens)
- 100 photos/job × 100 jobs/year = 10,000 photos/year/tenant → **~$10/year per tenant**
- Acceptable. Rule path fires first — vision only for ambiguous generic uploads, not entity-linked ones.

**Vision fires only when:** upload source is generic (not schedule_item, daily_log, receipt, etc.) AND file is an image. Entity-linked uploads use rule path at confidence 0.85-0.90 — no vision call.

**Storage:**
- `job-photos` (public) is replaced by `job-files` (private). Signed URLs add ~1ms latency; acceptable.
- No new storage cost — consolidating existing buckets.

**No background AI.** `inferFileCategory` fires only on user-triggered upload. Not a webhook, not a DB trigger. Conforms to API cost rules.

---

## Schema Reference

### `job_files` — new table

```sql
CREATE TABLE job_files (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL,
  job_id                TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  uploaded_by_id        UUID REFERENCES profiles(id),

  -- File storage
  name                  TEXT NOT NULL,           -- original filename
  storage_path          TEXT,                    -- Supabase storage path (null = virtual/floor_plan)
  bucket_name           TEXT NOT NULL DEFAULT 'job-files',
  mime_type             TEXT,
  size_bytes            BIGINT,

  -- Categorization (folders are derived from these two columns)
  category              TEXT NOT NULL,
    -- CHECK (category IN ('Photos','Documents','Receipts','Floor Plans',
    --                     'Change Orders','Communications','Selections'))
  subcategory           TEXT,                    -- NULL = top-level of category (no sub-folder)
  ai_confidence         NUMERIC(4,3),            -- 0.000-1.000 from inferFileCategory
  ai_subcategory_suggested TEXT,                 -- what AI proposed if rep overrode

  -- Receipt-specific (NULL for non-receipts)
  receipt_date          DATE,
  receipt_label         TEXT,
  receipt_amount        NUMERIC(10,2),
  receipt_vendor        TEXT,
  receipt_transaction_id UUID,                   -- FK to job_transactions if linked

  -- Visibility
  client_visible        BOOLEAN NOT NULL DEFAULT false,

  -- Entity linkage (preserves existing pattern)
  related_entity_type   TEXT,     -- 'schedule_item' | 'change_order' | 'daily_log'
                                  -- | 'floor_plan' | 'material_order' | NULL
  related_entity_id     UUID,

  -- Lifecycle (future Google Drive archive arc)
  lifecycle_status      TEXT NOT NULL DEFAULT 'active'
    CHECK (lifecycle_status IN ('active', 'archived', 'archive_failed')),
  archived_at           TIMESTAMPTZ,
  external_url          TEXT,            -- populated when archived to Google Drive

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_files_job_category
  ON job_files(job_id, category)
  WHERE lifecycle_status = 'active';

CREATE INDEX idx_job_files_job_subcat
  ON job_files(job_id, category, subcategory)
  WHERE lifecycle_status = 'active';

CREATE INDEX idx_job_files_uncategorized
  ON job_files(job_id)
  WHERE subcategory IS NULL AND category = 'Photos' AND lifecycle_status = 'active';

CREATE INDEX idx_job_files_entity
  ON job_files(related_entity_type, related_entity_id)
  WHERE related_entity_type IS NOT NULL;

CREATE INDEX idx_job_files_receipt_date
  ON job_files(job_id, receipt_date DESC)
  WHERE category = 'Receipts';

CREATE INDEX idx_job_files_recent
  ON job_files(job_id, created_at DESC)
  WHERE lifecycle_status = 'active';

ALTER TABLE job_files ENABLE ROW LEVEL SECURITY;
-- SELECT: tenant_id = get_my_tenant_id() AND (lifecycle_status = 'active' OR profile role = 'owner')
-- INSERT: authenticated, tenant_id = get_my_tenant_id()
-- UPDATE: owner/PM/rep; sub can update files they uploaded
-- DELETE: owner/PM only (soft delete via lifecycle_status, not hard DELETE)
```

### `tenant_file_subcategories` — new table

```sql
CREATE TABLE tenant_file_subcategories (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL,
  category       TEXT NOT NULL,    -- typically 'Photos'; extensible to others
  subcategory    TEXT NOT NULL,
  display_order  INTEGER DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (tenant_id, category, subcategory)
);

-- Avenstone GC seed (run at migration time):
-- INSERT INTO tenant_file_subcategories (tenant_id, category, subcategory, display_order) VALUES
--   ('00000000-0000-0000-0000-000000000001', 'Photos', 'Before', 1),
--   ('00000000-0000-0000-0000-000000000001', 'Photos', 'Demo', 2),
--   ('00000000-0000-0000-0000-000000000001', 'Photos', 'Framing', 3),
--   ... (Drywall, Tile, Paint, Plumbing, Electrical, Cabinets, Roofing, HVAC, Flooring, Trim/Finish, During, After, Final)
```

### Existing tables — migration impact

**`photos` table:** rows backfilled into `job_files`. `photos.migrated_to_job_files_id UUID` column added pointing to the new row. Existing `sbPhoto` calls continue to work during Phase 3; they write to both tables (or `job_files` only after cutover). Table retained 30 days post-Phase 3 go-live, then dropped.

**`job_documents` table:** same pattern. `job_documents.migrated_to_job_files_id UUID` added. `sbLoadDocs` / `sbUploadDoc` shims route to `job_files` post-cutover. Table retained 30 days, then dropped.

**`floor_plans` table:** NOT migrated. `sbCreateFloorPlan` writes one virtual `job_files` row (category='Floor Plans', storage_path=pdf_storage_path, related_entity_type='floor_plan', related_entity_id=floor_plan.id) at plan creation time. When `sbUpdateFloorPlan` updates the PDF, it also UPDATEs the virtual row's storage_path.

---

## Migration Strategy

1. **Phase 1 cutover:** apply schema migration (new tables + backfill + add migrated_* columns to old tables). Validate counts. New writes go to `job_files` only starting here.
2. **Phase 2 + 3 migration window (2-3 weeks):** UI reads from `job_files`. Old callers (`sbPhoto`, `sbUploadDoc`) shim-route to `job_files`. Both old and new helpers work.
3. **Post-Phase 3:** remove shims. Old `sbPhoto` / `sbUploadDoc` deleted.
4. **30 days after Phase 3 go-live:** verify zero new writes to `photos` / `job_documents`. Drop both tables and their storage-bucket write paths.
5. **Rollback path:** if validation fails after Phase 1, `migrated_to_job_files_id` lets us find and delete the backfilled rows cleanly. Old tables untouched until explicit drop.

---

## Out of Scope (v1)

- **Google Drive archive flow** — lifecycle column exists; flip logic doesn't.
- **Walkthrough intake arc** — uses the `Selections` category folder; built in a separate arc.
- **Receipt OCR amount extraction** — rep enters amount manually v1.
- **Folder permissions UI for tenant admins** — defaults locked in code v1.
- **Cross-job search** — single-job scope v1.
- **PDF annotation/markup tools** — view-only v1.
- **File version history** — existing `floor_plan_versions` table tracks versions for floor plans; other file types latest-only v1.
- **Bulk move/delete** — bulk-tag (category change) is in v1; bulk move between jobs is not.
- **Folder-level access logs** — who viewed what, when.

---

## Future Architecture

### PROOF_ARC dependency

PROOF_ARC's change-order photo gate writes to `job_files` with `category='Change Orders'`, `related_entity_type='change_order'`. The `category` CHECK constraint includes 'Change Orders'. PROOF_ARC Phase 1 migration becomes a no-op for schema — the column is already there. PROOF_ARC Phase 2 (CO gate logic) just adds a `COUNT(*) WHERE category='Change Orders' AND related_entity_id=<co_id>` query to the gate helper. PROOF_ARC's first slice prompt should note this dependency and skip any file-table schema work.

### Walkthrough Intake Arc (sketch)

Rep + client walk site at consultation. AI generates per-room folder structure ("Kitchen → Tile Selections, Cabinet Selections, Paint Colors, Fixtures, Appliances, Client Notes"). Client fills folders with selections — photos of showroom samples, product links, saved images. When sub asks "what tile did the client pick?" — folder has the answer. `Selections` category + per-room subcategory. Client portal shows client their own selections without PM involvement.

Trigger to build: after Phase 2 lands. Consultation tab gets new "capture selections" flow.

### Google Drive Archive Arc (sketch)

At job completion + tenant-configurable cooldown (default 60 days), background cron:
1. Walks `job_files WHERE lifecycle_status='active'` for that job.
2. Per-client Google Drive OAuth (one-time setup at job start or close).
3. Uploads to Drive in structured folders (category/subcategory).
4. Updates `lifecycle_status='archived'`, `external_url=<drive URL>`. Optionally clears `storage_path` (Supabase storage freed).
5. Client portal serves from `external_url` if present, falls back to signed URL otherwise.

Sales pitch: "After the job's done, everything lands in your Google Drive automatically. We don't trap your data."

### Todos-Per-Job Pattern Analysis (sketch)

`job_files` has `created_at` + `uploaded_by_id` + `related_entity_type`. Over enough closed jobs: which files types are uploaded late? Which subs never upload photos? Per-rep patterns ("Rep X forgets permit docs until day 30"). AI nudge: "You've started 5 framing jobs. In 4 of them the permit doc landed after framing started. Want me to add a todo: Upload permit before framing starts?" Data is being captured now; analysis arc built later.

---

## Trade-Aware

Foundation is trade-neutral. `tenant_file_subcategories` is config, not code. Avenstone GC default (16 Photo subcategories) and a painting tenant default (Before, During, After, Room/Color Notes) use the same table with different rows. No trade assumption baked into `inferFileCategory` — the tenant subcategory list is passed as context to the Haiku vision prompt, so the model only proposes subcategories that exist for that tenant.

---

## Amendments

_No amendments yet. Append dated entries here as decisions change after this blueprint ships._
