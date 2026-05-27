# Company Files Arc — Design Blueprint

_Living doc. Update each phase as it ships._

---

## Purpose

Tenant-scoped document storage for company-level compliance and reference files: business licenses, certificates of insurance, W-9, surety bonds, lien waiver templates. Replaces the implicit "where do we put this" problem for docs that apply to every job, not just one.

**Replaces**: ad-hoc storage of company docs in email, Google Drive, or paper binders. Files that belong to the company (not a job) had no home in the app.
**Augments**: UNIFIED_FILES_ARC (the per-job file system) by adding a tenant-level peer. Company files surface in job context via virtual `job_files` reference rows — not copies.
**Powers**: future arcs that need compliance state: CO-send-with-COI, sub-onboarding-with-insurance-check, lien waiver workflow, permit renewal tracking.

**Key design**: company files are **tenant-level data** with **per-job visibility via virtual references**. Update the master file once — every active job's client portal automatically reflects the new version. No stale copies.

---

## Why Now

Three real product needs converge:

**1. Reps need company docs in arm's reach when sending contracts and COs.** Today they hunt through email or a shared drive. Files tab › Company Files (rep-visible) puts them one click away on any device, with a signed URL download.

**2. Clients always want to see proof of insurance.** Every new job triggers the same request: "Can you send me your COI?" Auto-share on job creation means it appears in the client portal without any manual upload-per-job. Direct answer to a recurring friction point.

**3. Expirations sneak up.** General liability insurance lapses → mechanic's lien risk on every active job. Watchdog rules turn the expiration into a fire-when-needed todo series (30 days, 14 days, day-of). Anti-Surprise Engine in literal form. The feature that prevents "we couldn't get paid because our insurance lapsed" is cheap to build and expensive to not have.

---

## Today's Gap

```
Company-level documents:
├── GL Insurance cert         → emailed to clients per-request, living in Gmail
├── Workers Comp cert         → scanned PDF somewhere on Kalin's laptop
├── KS Contractor License     → framed on office wall, no digital copy on file
├── W-9                       → sent to every GC that pays Avenstone as a sub
└── Lien waiver templates     → blank forms in a folder, manually filled each draw

Problem:
  - Rep on a job site: "Do you have our insurance cert I can send the client?"
    → "Let me ask Kalin."
  - PM sending a CO: "I need to attach proof of insurance." 
    → opens email, searches, forwards a 3-year-old cert.
  - GL cert expired March 15.
    → Kalin finds out on April 2 when a GC asks why the renewal didn't arrive.
```

---

## Architecture

```
company_files (new table — tenant-scoped)
    │
    ├── category          ── 'Insurance' | 'License' | 'Tax' | 'Legal' |
    │                        'Compliance' | 'Template' | 'Other'
    │
    ├── type              ── free-text canonical label per file
    │                        e.g. "GL Insurance", "KS Contractor License", "W-9"
    │                        One active row per (tenant_id, type)
    │
    ├── expiration_date   ── triggers watchdog scheduled_actions at 30/14/0 days
    │
    ├── auto_share_with_clients BOOLEAN
    │      └── true → virtual job_files row generated on every new job creation
    │           └── client_visible = true, points back to company_files storage_path
    │
    └── lifecycle_status  ── 'active' | 'archived'
           └── Upload new version → old row archived, new row active
               Virtual job_files rows keep pointing to company-files bucket path
               (the path on the new row is different; virtual rows are re-generated on replace)

company-files storage bucket (private)
    └── path convention: <tenant_id>/<type_slug>/<file_id>.<ext>
        Signed URL only — same pattern as job-files bucket

Master Agent upload_company_file verb
    ├── CONFIRM_TOOLS gated (confirm card before any write)
    ├── Haiku vision (PDF + image only) extracts:
    │     issuer, policy_number, type, effective_date, expiration_date
    ├── Confirm card surfaces extracted fields — rep verifies before save
    └── Save: replaces existing active row for that type (archives old, inserts new)
           + cancels old scheduled_actions + schedules new watchdog rows

Watchdog (scheduled_actions rows written by sbScheduleCompanyFileExpirations)
    ├── On company_file insert or expiration_date update:
    │     write 3 scheduled_actions rows: 30d-before, 14d-before, day-of expiration
    ├── On company_file replace: cancel old rows, write new rows from new date
    └── On scheduled_actions row fires (cron):
          write todo to owner + PM: "GL Insurance expires in 30 days"
          14-day todo: "URGENT: GL Insurance expires in 14 days — renew now"
          Day-of: todo stays open + red banner on every active job

Job creation hook (Phase 3)
    └── INSERT INTO job_files SELECT ... FROM company_files
          WHERE auto_share_with_clients = true AND lifecycle_status = 'active'
          → virtual rows, client_visible = true, related_entity_type = 'company_file'
```

---

## Phase Plan

| Phase | Scope | Prompts | Status |
|-------|-------|---------|--------|
| 1 — Schema + admin UI | `company_files` table, `company-files` bucket, helpers, admin UI for upload/manage | 3 | Planned |
| 2 — Files tab integration | Job Files / Company Files sub-tabs in FilesTab, role gate, flat tagged view, file detail panel | 2 | Planned |
| 3 — Job creation auto-reference | New job creation generates virtual `job_files` rows for `auto_share_with_clients=true` company files | 2 | Planned |
| 4 — Master Agent verb | `upload_company_file` with Haiku vision metadata extraction, confirm card, replace-on-type logic | 2 | Planned |
| 5 — Watchdog + escalation + banner | `scheduled_actions` for 30/14/0-day expiration todos, cancellation on update, job-level expired-doc banner | 3 | Planned |

**Total: ~12 prompts.** Same shape as UNIFIED_FILES_ARC.

---

## Reused vs Net-New

### Reused (wire up, don't rebuild)

- `tenants` + `profiles` + `AV_TENANT` + `get_my_tenant_id()` — tenant scoping pattern. Every new table inherits it.
- Private bucket pattern from UNIFIED_FILES_ARC slice 1 — `company-files` bucket creation + RLS mirrors `job-files` bucket exactly.
- `createSignedUrl` pattern — extend to `sbSignCompanyFileUrl`. Same 7-day expiry logic.
- `scheduled_actions` table (AGENT_OPS Phase 1.1) — every watchdog row goes here. Schema already supports `related_entity_type='company_file'` + `related_entity_id TEXT`. Cron fires ripe rows and creates todos.
- `todos` table — watchdog escalation creates rows here with `source='engine'`, `type='company_file_expiration'`. Standard `assigned_to_user_id` + `priority` + `due_date`.
- Master Agent `CONFIRM_TOOLS` chokepoint — `upload_company_file` added to this set. Same confirm card UX as `log_receipt`.
- Haiku vision pattern — same model call pattern as `inferFileCategory` vision path (photo subcategory extraction). Reuse prompt structure for document field extraction.
- Virtual `job_files` row pattern — already used for floor plans (`related_entity_type='floor_plan'`). Company file references use `related_entity_type='company_file'`.
- `sbNotify` / notification infra — expiration todos route through existing notification system.
- Resend email infra — out of scope v1 but wired when rep emails a company file to a client directly.

### Net-New (must build)

- `company_files` table — see Schema Reference.
- `company-files` storage bucket (private, separate from `job-files`).
- Helpers: `sbUploadCompanyFile`, `sbLoadCompanyFiles`, `sbGetCompanyFile`, `sbUpdateCompanyFile`, `sbArchiveCompanyFile`, `sbSignCompanyFileUrl`, `sbToggleAutoShare`, `sbReplaceCompanyFile` (archives old + inserts new + rewires virtual job_files rows).
- `sbScheduleCompanyFileExpirations(companyFileId)` — writes 3 `scheduled_actions` rows for a file with an expiration_date.
- `sbCancelCompanyFileScheduledActions(companyFileId)` — cancels pending watchdog rows when a file is replaced.
- Admin UI — Company Files management tab. See Phase 1 for location decision.
- Job Files / Company Files sub-tab nav inside `FilesTab.jsx` (Phase 2).
- Job creation hook — inserts virtual `job_files` rows for auto-share company files (Phase 3).
- Master Agent verb `upload_company_file` in `ai-master-agent/index.ts` (Phase 4).
- Haiku vision document metadata extraction (inline or edge function) (Phase 4).
- Watchdog cron integration — `scheduled_actions` rows fire → todos created (Phase 5).
- `CompanyFileExpirationBanner.jsx` — red banner shown on active jobs when any auto-share company file is expired (Phase 5).

---

## Locked Decisions

1. **`company_files` is tenant-scoped, not job-scoped.** One row per logical document, regardless of how many jobs reference it. RLS enforced by `tenant_id` and `get_my_tenant_id()`.

2. **Reference pattern, not copy pattern.** Job creation generates virtual `job_files` rows with `related_entity_type='company_file'`, `related_entity_id=<company_file.id>`, `storage_path` pointing to the company file's actual storage path. Update the master file (replace flow) → new virtual rows generated from the new company_file row. Old virtual rows from the archived file remain but are no longer the "current" version — Phase 3 defines the update propagation. No frozen-at-time-of-creation copies.

3. **`auto_share_with_clients` flag per file.** Owner/PM sets at upload. `true` → file appears in every new job's client portal via virtual `job_files` row (`client_visible=true`). `false` → file stays in Company Files tab only. Existing jobs are NOT retroactively updated when you toggle this flag — only new jobs pick up the flag state at creation time. (Retroactive update is a future batch operation, out of scope v1.)

4. **Flat list with category tags v1.** No folder tree inside Company Files. Categories: `Insurance`, `License`, `Tax`, `Legal`, `Compliance`, `Template`, `Other`. Sorted by category then `type` label. Dynamic folders don't apply here — a company typically has fewer than 30 company files total.

5. **Rep-visible for the Company Files tab; client-visible via job virtual rows only.** Roles that see Company Files tab: `owner`, `project_manager`, `sales_rep`. Subs and clients never see the Company Files tab. Individual files flagged `auto_share_with_clients=true` still surface in client portal via per-job virtual references — that is the design. Client sees a file in "their" job without knowing it's a company-level document.

6. **Expiration tracking with watchdog rules using `scheduled_actions`.**
   - 30 days before expiration → todo to owner+PM: "GL Insurance expires in 30 days — start renewal"
   - 14 days before → escalation todo (priority='high'): "URGENT: GL Insurance expires in 14 days"
   - On expiration date → todo stays open AND `CompanyFileExpirationBanner` fires on every active job
   - When expiration_date updated (new file uploaded via replace flow) → old scheduled_actions cancelled, new ones scheduled from new date
   - `scheduled_actions.priority` values: 'normal' at 30d, 'high' at 14d, 'urgent' at day-of.

7. **Master Agent updates via vision.** New verb `upload_company_file`. Haiku vision reads uploaded PDF or image, extracts: issuer/insurer, policy number, type (free-text), expiration date, effective date. Always shows confirm card — rep verifies extracted fields before save. No auto-save. These are legal compliance docs; rep must confirm the expiration date read correctly.

8. **One canonical active row per (tenant_id, type).** Uploading a new GL cert via Master Agent REPLACES the existing active row: old row transitions to `lifecycle_status='archived'`, new row inserted as active. History is preserved and queryable; only the active row is surfaced in the admin UI by default. This mirrors updating a contact — latest is what shows, history is reachable.

9. **Bucket privacy: `company-files` is PRIVATE.** Signed URLs only, 7-day expiry. No exception for dev convenience. These are real compliance documents. Bucket name: `company-files` (distinct from `job-files`).

10. **Files accept any format.** PDF, image, DOC, DOCX. Haiku vision metadata extraction only runs on PDF and image MIME types. Other types skip extraction — rep fills in metadata fields manually on the confirm card.

11. **Job-level banner for expired auto-share docs.** When any company_file with `auto_share_with_clients=true` and `lifecycle_status='active'` has `expiration_date <= today`, every active job shows a red banner: "⚠ GL Insurance expired — renew before sending next CO." Banner derives from a tenant-level query on `company_files` — no per-job column to maintain. Dismisses when expiration_date is updated (new file uploaded).

12. **Multi-tenant: full tenant isolation.** Tenant A's COI never leaks to Tenant B's jobs. RLS on `company_files` enforces tenant boundary. Storage bucket path convention includes `<tenant_id>/` prefix. Partial unique index enforces only one active row per type per tenant.

13. **Lien waiver templates here; signed waivers per-job.** Templates (blank forms) live in `company_files` with `category='Template'`. Signed waivers from specific subs on specific draws live in `job_files`. This arc builds the template storage, not the lien waiver workflow (future financial arc).

14. **No hard delete v1.** Company files can be archived (`lifecycle_status='archived'`) but not hard-deleted from the UI. Compliance audit trail matters. Hard delete is a future admin SQL action with an explicit FKsafe-delete check (virtual `job_files` rows that reference the company_file must be cleaned up first).

15. **No "shared with other tenants" v1.** Each tenant's company files are their own. New tenant onboards with zero company_files and adds their own. No template-tenant seeding, no cross-tenant sharing.

---

## Phase Detail

### Phase 1 — Schema + Admin UI

**New table:** `company_files` — see Schema Reference.

**New storage bucket:** `company-files` (private). Path convention: `<tenant_id>/<type_slug>/<file_id>.<ext>` where `type_slug` is the `type` field lowercased, spaces replaced with hyphens.

**New helpers (add to `supabase.js`):**
- `sbUploadCompanyFile({ tenantId, file, category, type, metadata })` — upload to `company-files` bucket, insert `company_files` row.
- `sbLoadCompanyFiles(tenantId)` — load all active company_files for tenant, ordered by category, type.
- `sbGetCompanyFile(id)` — load one company_file by id.
- `sbReplaceCompanyFile({ existingId, file, metadata })` — archive existing row, insert new row, cancel old scheduled_actions, schedule new ones. Atomic-ish: archive first, then insert. If insert fails, un-archive. Rewire virtual job_files rows (UPDATE job_files SET storage_path=<new_path> WHERE related_entity_type='company_file' AND related_entity_id=<new_cf_id> — actually, since the new row has a new ID, generate new virtual rows for all existing jobs? No — out of scope v1. Existing virtual rows continue pointing to the old (now archived) storage path. New jobs get virtual rows from the new file. See Open Questions.)
- `sbArchiveCompanyFile(id)` — set lifecycle_status='archived'. Does not delete virtual job_files rows.
- `sbSignCompanyFileUrl(storagePath)` — createSignedUrl on `company-files` bucket, 7-day expiry.
- `sbToggleAutoShare(id, value)` — set auto_share_with_clients.
- `sbScheduleCompanyFileExpirations(companyFileId, expirationDate, tenantId, ownerProfileId)` — writes 3 scheduled_actions rows (30d, 14d, 0d before expiration).
- `sbCancelCompanyFileScheduledActions(companyFileId)` — cancel pending scheduled_actions rows for this company_file.

**Admin UI location:** `FilesTab.jsx` — Company Files appears as a sub-tab alongside Job Files (Phase 2 wires the sub-tabs). For Phase 1, build a standalone `CompanyFilesAdminScr.jsx` or add it as a section in `AiKnowledgeScr.jsx` (owner-only). Kalin decides final placement before Phase 2. Either location is wired without code duplication. See Open Questions.

**Admin UI features (Phase 1):**
- File list: name, category badge, type label, expiration date (red if expired, amber if within 30 days), auto-share indicator.
- Upload: file picker → category selector → type text input → metadata fields (issuer, expiration date, policy number) pre-fillable manually, or "Extract with AI" button fires Master Agent verb (Phase 4 wires this).
- Each row: Download (signed URL) + Archive + Edit (expiration date, auto-share toggle).
- Filter by category.
- Empty state: "No company files yet. Upload your certificate of insurance to get started."

**Smoke test:**
1. Upload a file. Confirm `company_files` row inserted with correct `tenant_id`, `category`, `type`, `storage_path`.
2. Download it. Confirm signed URL resolves.
3. Archive it. Confirm `lifecycle_status='archived'` and it disappears from the active list.
4. Upload a second file with the same `type`. Confirm the partial unique index blocks the insert if lifecycle_status='active'. Then use `sbReplaceCompanyFile` — confirm old row archived, new row active.

### Phase 2 — Files Tab Integration

**`FilesTab.jsx` gains a sub-tab nav:** "Job Files" (default) | "Company Files". Tab pill bar at top of FilesTab.

**Company Files sub-tab:**
- Role gate: show only if `profile.role IN ('owner', 'project_manager', 'sales_rep')`. If sub or client navigates directly, render null.
- Renders a flat tagged list of all active company_files for the tenant (not job-scoped — same list regardless of which job you're viewing).
- Sorted by category, then type label.
- Each row: file icon, type label, category badge, expiration date (red/amber/green), auto-share badge ("Shared with clients").
- Actions: Download (signed URL in new tab), Edit (expiration date, auto-share toggle), Archive.
- Expiration badge: red if expired, amber if within 30 days, green otherwise, no badge if no expiration.

**File detail panel:**
- Slide-in panel (desktop) or full-screen sheet (mobile) on row click.
- Shows: name, type, category, issuer, policy number, effective date, expiration date, auto-share status, uploaded by, upload date, signed-URL download.
- Edit fields inline (expiration date, auto-share).

**No duplicate upload UI.** Company file upload routes through the admin UI from Phase 1. The Company Files sub-tab in FilesTab is view + light edit only — no new upload form in Phase 2.

**Smoke test:**
1. Navigate to Files tab on any job as a PM. Confirm "Job Files" and "Company Files" sub-tabs render.
2. Switch to Company Files. Confirm the tenant's company files load.
3. Log in as a sub. Navigate to Files tab. Confirm Company Files sub-tab is not rendered.

### Phase 3 — Job Creation Auto-Reference

**Hook into job creation.** Find the path where a new job row is inserted (likely in `LeadsTab.jsx` or `CreateJobModal.jsx` via a `sbCreateJob` helper or direct insert).

**After job insert**, query `company_files` for all `auto_share_with_clients=true AND lifecycle_status='active'` rows for the tenant. For each, insert a virtual `job_files` row:

```sql
INSERT INTO job_files (
  tenant_id, job_id, name, storage_path, storage_bucket, mime_type,
  category, subcategory, client_visible,
  related_entity_type, related_entity_id, created_at
)
SELECT
  cf.tenant_id,
  <new_job_id>,
  cf.name,
  cf.storage_path,
  cf.storage_bucket,
  cf.mime_type,
  'Communications',
  CASE cf.category
    WHEN 'Insurance'   THEN 'Insurance'
    WHEN 'License'     THEN 'License'
    WHEN 'Tax'         THEN 'Tax'
    ELSE 'Compliance'
  END AS subcategory,
  true AS client_visible,
  'company_file' AS related_entity_type,
  cf.id::text AS related_entity_id,
  NOW()
FROM company_files cf
WHERE cf.tenant_id = <tenant_id>
  AND cf.auto_share_with_clients = true
  AND cf.lifecycle_status = 'active';
```

**Implementation:** add `sbCreateJobCompanyFileRefs(jobId, tenantId)` helper. Call it in the job creation flow after the job row commits. If it fails (unlikely), log error but do not block job creation — non-critical path.

**Client portal verification:** `ClientPortal.jsx` loads `job_files WHERE job_id=? AND client_visible=true AND lifecycle_status='active'`. Virtual company-file rows land here naturally — no portal code changes needed.

**Smoke test:**
1. Ensure at least one company_file has `auto_share_with_clients=true`.
2. Create a new job.
3. Query `job_files WHERE job_id=<new_job_id> AND related_entity_type='company_file'` — confirm rows exist.
4. Open ClientPortal for that job. Confirm the company file appears in the Files section.
5. Click download. Confirm signed URL from `company-files` bucket resolves.

### Phase 4 — Master Agent Verb

**New tool: `upload_company_file`** in `ai-master-agent/index.ts`.

**Tool definition:**
```typescript
{
  name: "upload_company_file",
  description: "Upload or replace a company-level compliance document (insurance cert, license, W-9, bond, etc). Extracts metadata via AI if the file is a PDF or image. Always shows a confirm card before saving.",
  input_schema: {
    type: "object",
    properties: {
      type: { type: "string", description: "Canonical label for this document type, e.g. 'GL Insurance', 'KS Contractor License', 'W-9'" },
      category: { type: "string", enum: ["Insurance", "License", "Tax", "Legal", "Compliance", "Template", "Other"] },
      issuer: { type: "string", description: "Insurance company, licensing body, or issuing entity" },
      policy_number: { type: "string" },
      effective_date: { type: "string", description: "ISO date YYYY-MM-DD" },
      expiration_date: { type: "string", description: "ISO date YYYY-MM-DD" },
      auto_share_with_clients: { type: "boolean", description: "If true, this file appears in every new job's client portal automatically" }
    },
    required: ["type", "category"]
  }
}
```

**Add `upload_company_file` to `CONFIRM_TOOLS`.**

**Vision extraction flow (when rep attaches a file via chat):**
1. Detect file attachment — PDF or image.
2. Send to Haiku with prompt: "Extract from this document: issuer/insurer name, policy number, document type (GL Insurance / WC Insurance / Auto / Umbrella / Contractor License / Bond / W-9 / Other), effective date (YYYY-MM-DD or null), expiration date (YYYY-MM-DD or null). Reply only with JSON: { issuer, policy_number, type, effective_date, expiration_date }. If a field is not present, use null."
3. Parse response. Merge with any rep-provided fields (rep-provided wins on conflict).
4. Return `pending_action` with all extracted fields surfaced on confirm card for rep to verify/correct.

**Confirm card fields:**
- Type label (editable)
- Category (editable dropdown)
- Issuer (editable)
- Policy number (editable)
- Effective date (editable)
- Expiration date (editable, red border if blank for Insurance/License categories)
- Auto-share with clients (checkbox)

**On confirm:**
- If an active `company_files` row exists with the same `type` for this tenant → `sbReplaceCompanyFile`. Cancel old scheduled_actions, schedule new ones if expiration_date set.
- If no existing row → `sbUploadCompanyFile` as new.

**Haiku cost:** ~$0.001/document upload. Expected volume: 5-15 uploads/year per tenant. Lifetime cost per tenant: effectively zero.

**Smoke test:**
1. Attach a COI PDF to MasterAgent chat. Type "Upload this as our GL Insurance cert."
2. Confirm card appears with extracted issuer, policy number, expiration date.
3. Edit one field. Confirm. Verify `company_files` row inserted with correct data.
4. Upload a second GL cert. Verify old row archived, new row active.

### Phase 5 — Watchdog + Escalation + Banner

**`sbScheduleCompanyFileExpirations(companyFileId, expirationDate, tenantId, ownerProfileId)`:**

Writes 3 rows to `scheduled_actions`:
```javascript
const rows = [
  {
    tenant_id: tenantId,
    kind: 'reminder',
    status: 'scheduled',
    priority: 'normal',
    fire_at: new Date(expirationDate.getTime() - 30 * 86400000).toISOString(),
    created_by_id: ownerProfileId,  // system-scheduled on behalf of owner
    target_user_id: ownerProfileId,
    related_entity_type: 'company_file',
    related_entity_id: companyFileId,
    rule_key: `company_file_expiration_30d_${companyFileId}`,
    source: 'system',
    payload: { company_file_id: companyFileId, days_out: 30 }
  },
  {
    // ...same shape, priority: 'high', fire_at: -14 days, rule_key: ...14d...
    payload: { company_file_id: companyFileId, days_out: 14 }
  },
  {
    // ...same shape, priority: 'urgent', fire_at: expirationDate, rule_key: ...0d...
    payload: { company_file_id: companyFileId, days_out: 0 }
  }
];
await sb.from('scheduled_actions').insert(rows);
```

**When scheduled_actions fire (existing cron):**
- Cron picks ripe rows (`status='scheduled' AND fire_at <= NOW()`).
- For `rule_key` matching `company_file_expiration_*`:
  - Load the `company_files` row from `payload.company_file_id`.
  - If `lifecycle_status='archived'` → skip (file was replaced; old scheduled_actions should have been cancelled but belt-and-suspenders check).
  - Insert `todos` row: `{ tenant_id, source: 'engine', type: 'company_file_expiration', title: 'GL Insurance expires in 30 days — renew', priority: 'medium', assigned_to_user_id: ownerProfileId, related_entity_type: 'company_file', related_entity_id: companyFileId, due_date: expirationDate }`.
  - At 14d: also notify PM users via `sbNotify`.
  - At 0d: mark `scheduled_actions.status='fired'`. Todo remains open. Banner activates.

**`sbCancelCompanyFileScheduledActions(companyFileId)`:**
```javascript
await sb
  .from('scheduled_actions')
  .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
  .eq('related_entity_type', 'company_file')
  .eq('related_entity_id', companyFileId)
  .eq('status', 'scheduled');
```
Called in `sbReplaceCompanyFile` before scheduling new rows.

**`CompanyFileExpirationBanner.jsx`:**
- Mounted inside `JobDet.jsx` above the tab bar (or in the job header).
- On mount, queries `company_files WHERE tenant_id=<tenant> AND auto_share_with_clients=true AND lifecycle_status='active' AND expiration_date <= NOW()`.
- If any expired files: renders red banner listing them. "⚠ GL Insurance expired Mar 15 — update before next CO" with a direct link to the Company Files admin UI.
- If empty: renders nothing.
- No per-job dismiss — banner is tenant-wide and undismissable until the underlying doc is updated (see Locked Decisions 11).

**Smoke test:**
1. Upload a company file with expiration_date = today + 29 days. Verify 3 scheduled_actions rows created.
2. Manually set fire_at on the 30d row to NOW() - 1 minute. Run cron (or trigger manually). Verify todo created.
3. Replace the company file with a new one. Verify old scheduled_actions cancelled, new ones created.
4. Set expiration_date = yesterday on any auto-share company file. Open a job detail page. Verify red banner renders.

---

## Open Questions

Real unknowns — not decisions already locked.

**Admin UI location.** Where does company file management live? Options:
  - (a) Company Files sub-tab inside `FilesTab.jsx` — same surface for viewing and managing. Simpler navigation, fewer tabs. Edit affordances show/hide by role.
  - (b) Settings › Company Documents — discoverable for owners doing initial setup. Separate from day-to-day job files context.
  - Recommend (a). Reps who need the COI are in FilesTab already. But Settings (b) is more appropriate for the "onboarding setup" framing. Decision before Phase 1 prompt.

**Virtual row update on company file replace.** When `sbReplaceCompanyFile` creates a new company_files row (new storage_path, new id), existing jobs' virtual `job_files` rows still reference the old company_file.id and old storage_path. Options:
  - (a) Leave old virtual rows pointing at archived file. New jobs get new rows. Existing client portals show the old cert until a new job is created. Acceptable for v1 — cert is still proof of insurance.
  - (b) Batch UPDATE existing virtual job_files rows to point to the new company_file.id and storage_path. Atomic correctness, more complexity.
  - Recommend (a) for v1 with a note that option (b) is Phase 5+ if clients or reps report stale docs.

**What defines a canonical "type."** GL Insurance and Workers Comp are clearly different types. But if a GC has a Kansas contractor license AND a Missouri contractor license, each is different. Recommend: `type` is a free-text label set at upload ("GL Insurance", "WC Insurance", "KS Contractor License", "MO Contractor License"). Partial unique index enforces one active row per exact type label. Two different labels = two canonical rows. Rep controls the taxonomy.

**Subs uploading their own insurance.** Out of scope this arc. Subs' COIs live in their sub profile (future sub-onboarding compliance arc), not in `company_files` (which is the GC's own docs). Note here to prevent scope creep.

**Vision confidence threshold.** Haiku vision reading a scanned/photographed COI — what if the extraction is wrong? The confirm card is the safety net. Rep must see and verify extracted dates before confirm. No auto-save path exists. If vision fails entirely (illegible scan), rep fills fields manually on the confirm card.

**PM notification targets.** When a 30-day todo fires, who gets it — owner only, or owner + all PMs? Recommend: owner + all `role='project_manager'` profiles for the tenant. Same fanout as critical job notifications.

---

## Cost Guardrails

**Vision extraction:** ~$0.001 per Haiku vision call. Expected frequency: 5-15 company file uploads per tenant per year (COI renews annually, license renews annually). Lifetime AI cost per tenant: $0.01-0.05/year. Trivial.

**Storage:** Company files typically 1-5 MB PDFs. 30 files × 3 MB = 90 MB per tenant. Supabase storage: ~$0.02/month per tenant. Trivial.

**Watchdog:** `scheduled_actions` rows + existing cron — zero new infrastructure cost. Already running for AGENT_OPS.

**The real product cost is what this prevents:**
- Insurance lapse caught 30 days early instead of 30 days after → avoids potential project halt or lien filing risk.
- Eliminates per-job "send me your COI" requests — each one costs rep time and client trust.
- Compliance audit trail preserved — if something goes wrong on a job, the insurance history is in the DB, not someone's inbox.

---

## Schema Reference

### `company_files` — new table

```sql
CREATE TABLE IF NOT EXISTS public.company_files (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL,
  uploaded_by_id  UUID        REFERENCES profiles(id),

  -- File data
  name            TEXT        NOT NULL,
  storage_path    TEXT        NOT NULL,
  storage_bucket  TEXT        NOT NULL DEFAULT 'company-files',
  mime_type       TEXT,
  size_bytes      BIGINT,

  -- Categorization
  category        TEXT        NOT NULL
                    CHECK (category IN ('Insurance', 'License', 'Tax', 'Legal',
                                        'Compliance', 'Template', 'Other')),
  type            TEXT        NOT NULL,  -- canonical free-text label, e.g. "GL Insurance"

  -- Metadata (extracted by Haiku vision or rep-entered)
  issuer          TEXT,
  policy_number   TEXT,
  effective_date  DATE,
  expiration_date DATE,
  extracted_fields JSONB      DEFAULT '{}'::jsonb,  -- additional vision-extracted fields

  -- Visibility
  auto_share_with_clients BOOLEAN NOT NULL DEFAULT false,

  -- Lifecycle
  lifecycle_status TEXT       NOT NULL DEFAULT 'active'
                    CHECK (lifecycle_status IN ('active', 'archived')),
  archived_at     TIMESTAMPTZ,
  replaced_by_id  UUID        REFERENCES company_files(id),  -- FK to the replacement row

  -- Audit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active row per (tenant_id, type). Multiple archived rows allowed.
-- Partial unique index — not a table UNIQUE constraint — so archived history coexists.
CREATE UNIQUE INDEX idx_company_files_one_active_per_type
  ON company_files(tenant_id, type)
  WHERE lifecycle_status = 'active';

CREATE INDEX idx_company_files_tenant_active
  ON company_files(tenant_id, category)
  WHERE lifecycle_status = 'active';

CREATE INDEX idx_company_files_expiration
  ON company_files(tenant_id, expiration_date)
  WHERE lifecycle_status = 'active' AND expiration_date IS NOT NULL;

CREATE INDEX idx_company_files_auto_share
  ON company_files(tenant_id)
  WHERE auto_share_with_clients = true AND lifecycle_status = 'active';

ALTER TABLE public.company_files ENABLE ROW LEVEL SECURITY;

-- All tenant members can read (clients/subs see company_files data via their job's virtual rows,
-- but they never directly query this table — RLS here is belt-and-suspenders)
DROP POLICY IF EXISTS cf_tenant_select ON public.company_files;
CREATE POLICY cf_tenant_select ON public.company_files
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

-- Only owner/PM/rep can write
DROP POLICY IF EXISTS cf_modify ON public.company_files;
CREATE POLICY cf_modify ON public.company_files
  FOR ALL TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE id = auth.uid()
        AND role IN ('owner', 'project_manager', 'sales_rep')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles
      WHERE id = auth.uid()
        AND role IN ('owner', 'project_manager', 'sales_rep')
    )
  );

-- updated_at trigger (reuses existing set_updated_at function)
DROP TRIGGER IF EXISTS company_files_updated_at ON public.company_files;
CREATE TRIGGER company_files_updated_at
  BEFORE UPDATE ON public.company_files
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

### Storage bucket

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-files', 'company-files', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Storage RLS: authenticated reads (signed URLs enforce access)
-- Path convention: <tenant_id>/<type_slug>/<file_id>.<ext>
-- INSERT: tenant member must match path prefix
-- SELECT: signed URL fetch is unauthenticated (Supabase signed URL pattern)
CREATE POLICY "company_files_tenant_upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-files'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "company_files_tenant_read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'company-files'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "company_files_tenant_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'company-files'
    AND (storage.foldername(name))[1] IN (
      SELECT tenant_id::text FROM profiles WHERE id = auth.uid()
        AND role IN ('owner', 'project_manager')
    )
  );
```

### Virtual `job_files` row pattern (Phase 3)

Generated at job creation time for every active auto-share company file:

```sql
INSERT INTO job_files (
  tenant_id, job_id, name, storage_path, storage_bucket, mime_type,
  category, subcategory, client_visible,
  related_entity_type, related_entity_id, created_at
)
SELECT
  cf.tenant_id,
  <new_job_id>,
  cf.name,
  cf.storage_path,
  cf.storage_bucket,
  cf.mime_type,
  'Communications',
  CASE cf.category
    WHEN 'Insurance' THEN 'Insurance'
    WHEN 'License'   THEN 'License'
    WHEN 'Tax'       THEN 'Tax'
    ELSE             'Compliance'
  END AS subcategory,
  true AS client_visible,
  'company_file' AS related_entity_type,
  cf.id::text AS related_entity_id,
  NOW()
FROM company_files cf
WHERE cf.tenant_id = <tenant_id>
  AND cf.auto_share_with_clients = true
  AND cf.lifecycle_status = 'active';
```

These rows appear in `sbLoadFiles(jobId)` naturally. Client portal `client_visible=true` filter surfaces them. No portal code changes needed.

### Watchdog `scheduled_actions` rows (Phase 5)

On company_file insert (or expiration_date update), schedule three rows:

```javascript
// priority CHECK constraint: ('low', 'normal', 'high', 'urgent')
// source CHECK constraint: ('agent', 'watchdog_cron', 'system')
const watchdogRows = [
  {
    tenant_id:           tenantId,
    kind:                'reminder',
    priority:            'normal',
    fire_at:             subDays(expirationDate, 30).toISOString(),
    created_by_id:       ownerProfileId,
    target_user_id:      ownerProfileId,
    related_entity_type: 'company_file',
    related_entity_id:   companyFileId,          // TEXT in DB
    rule_key:            `cf_exp_30d_${companyFileId}`,
    source:              'system',
    payload:             { company_file_id: companyFileId, days_out: 30 },
  },
  {
    // ...same shape
    priority:  'high',
    fire_at:   subDays(expirationDate, 14).toISOString(),
    rule_key:  `cf_exp_14d_${companyFileId}`,
    payload:   { company_file_id: companyFileId, days_out: 14 },
  },
  {
    // ...same shape
    priority:  'urgent',
    fire_at:   expirationDate.toISOString(),
    rule_key:  `cf_exp_0d_${companyFileId}`,
    payload:   { company_file_id: companyFileId, days_out: 0 },
  },
];

await sb.from('scheduled_actions').insert(watchdogRows);
```

On company_file replace, cancel old rows before scheduling new ones:

```javascript
await sb
  .from('scheduled_actions')
  .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
  .match({ related_entity_type: 'company_file', related_entity_id: oldCompanyFileId, status: 'scheduled' });
```

---

## Migration Strategy

Single migration file creates the table, bucket (via SQL INSERT into `storage.buckets`), RLS policies, indexes, and trigger. Migration is idempotent: `CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO UPDATE`, `DROP POLICY IF EXISTS` before each `CREATE POLICY`.

No backfill needed. This arc introduces a new table with no existing data — new tenant = empty `company_files`. Owner uploads their files via admin UI (Phase 1) or Master Agent (Phase 4) at their own pace.

Phase 1 migration file name: `20260527_company_files_phase_1.sql` (or sequential after the last UNIFIED_FILES migration).

Apply via: `npm run migrate ../supabase/migrations/<filename>.sql` from `avenstone-vite/`. The apply tool auto-derives expected objects and verifies presence before declaring the migration shipped.

---

## Out of Scope (v1)

- **Sub-uploaded compliance docs.** Subs' own COIs belong in sub profiles (future sub-onboarding compliance arc). `company_files` is the GC's own docs.
- **Lien waiver workflow.** Templates stored here. Signed waivers per-job + per-draw tracking is a future financial arc (requires draws table, sub assignment per draw, e-sign integration).
- **Company file share bundles (email folder).** No "share Company Files with another company" v1. Individual download/email is the action.
- **Renewal automation.** Watchdog alerts. Doesn't renew — some renewals require humans, payments, and third-party forms.
- **Vision on non-PDF / non-image.** DOC, DOCX, XLS skip metadata extraction. Rep fills manually.
- **History UI for archived files.** Admin UI shows active + recently archived. Deep history (grep by type) is SQL-accessible but not surfaced in UI.
- **Auto-prune of archived files.** Archived rows and their storage objects remain indefinitely v1. Storage hygiene is a future arc.
- **Retroactive virtual row update.** When a company file is replaced, existing jobs' virtual `job_files` rows continue pointing to the old (now archived) storage path. Only new jobs get virtual rows from the new file. Retroactive propagation is Phase 5+ if needed.
- **Multi-location / franchise scoping.** One tenant = one set of company files. If a franchisee network needs location-level license scoping, that's its own arc.

---

## Future Architecture

### Retroactive Virtual Row Update (Phase 5+)

When `sbReplaceCompanyFile` runs, batch-update existing jobs' virtual `job_files` rows to point to the new company_file. Pattern:

```sql
UPDATE job_files
SET
  storage_path = <new_cf.storage_path>,
  related_entity_id = <new_cf.id>::text,
  updated_at = NOW()
WHERE
  related_entity_type = 'company_file'
  AND related_entity_id = <old_cf.id>::text
  AND tenant_id = <tenant_id>;
```

Ship when clients or reps report "I just renewed my COI but the old client portals still show the expired cert."

### Sub-Onboarding Compliance Arc (sketch)

Subs upload their own COI + W-9 during onboarding. These live in `sub_profiles.compliance_docs` or a dedicated `sub_files` table — not in `company_files`. Watchdog pattern reused: `scheduled_actions` rows for sub COI expirations, todos to owner when sub's cert lapses. Blocks sub from being assigned to new jobs when cert expired.

### CO-Send-With-COI (sketch)

When a PM sends a CO to a client, auto-attach the current active GL Insurance cert from `company_files`. Uses the signed URL from `sbSignCompanyFileUrl`. No new storage — just thread the company_file into the CO email payload. Blocked on company_files arc shipping.

### Lien Waiver Workflow Arc (sketch)

Uses company_files `category='Template'` blank forms. At each draw:
1. Pull relevant sub assignments for the draw period.
2. Generate per-sub partial waiver from the template (pdf-lib fill).
3. Sub signs via portal.
4. Signed waiver → `job_files`, `category='Communications'`, `subcategory='Lien Waivers'`.
5. Track which subs have signed for each draw.
6. Banner on job until all required waivers collected.

Depends on: company_files (templates), job_files (signed waivers), financials (draw tracking), sub portal (e-sign).

### Tenant Onboarding Seeds (sketch)

New tenant onboards with empty `company_files`. Onboarding wizard could surface placeholder rows ("Upload your GL Insurance cert here") as prompts. On upload, the placeholder converts to a real row. Low priority — the Phase 1 admin UI empty state already handles the cold-start.

---

## Amendments

_Future amendment entries go here as the arc ships._
