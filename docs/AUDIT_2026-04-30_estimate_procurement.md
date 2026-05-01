# Audit — Estimate + Procurement Arc
**Date:** 2026-04-30  
**Method:** live DB queries + file reads — no speculation

---

## 1. Takeoff Wizard

### buildTakeoffDraft helper
**SHIPPED**  
- File: `avenstone-vite/src/lib/takeoff.js`  
- Signature: `buildTakeoffDraft({ jobId, roomType, roomIds? }): Promise<TakeoffDraft>`  
- **Labor-only.** No material rows. Template and unit cost tables are labor-only (see §2).  
- Line shape emitted per (room × trade):
  ```
  roomId, trade, templateNotes, optional, conditional,
  unit, unitCostId, unitCostSource,
  baseRate, baseRateMissing, multiplier, wastePct,
  quantity, quantityPreFilled, quantityNotes,
  lineCost, lineCostStatus
  ```
- Also emits `rooms[]` (roomId, roomLabel, floor, floorLabel, captureMode, areaSf, wallAreaSf, perimeterLf) and `summary` (totalRooms, totalLines, linesNeedingRate, linesNeedingQuantity, linesReady, subtotal, subtotalIncomplete).

### Takeoff sub-tab in EstimateTab
**SHIPPED**  
- File: `avenstone-vite/src/components/jobs/tabs/EstimateTab.jsx` — 4 sub-tabs: Build, Takeoff, Line items, Proposal  
- File: `avenstone-vite/src/components/jobs/tabs/TakeoffWizard.jsx`  
- Pills: Bathroom, Kitchen, Basement, Full Refresh, Exterior

### Inline editing of qty + rate
**SHIPPED**  
- `TakeoffWizard.jsx` — both qty and rate are `<input type="number">` controlled by `edits` state map keyed `roomId__trade`. Live subtotal recalculates via `effectiveLine()` on every keystroke.

### Accept & Save button
**PLACEHOLDER — NOT WIRED**  
- `TakeoffWizard.jsx:211` — `onClick={() => alert('Prompt C coming next — will save to Line Items')}`  
- No writes to any table.

### roomMatchesType filter helper
**SHIPPED — case-insensitive**  
- `takeoff.js:80–96` — converts `room.roomLabel` to `.toLowerCase()` before `.includes()`. Exterior uses `captureMode === 'exterior'` (no string lowercasing needed). Refresh returns `true` for all rooms.

---

## 2. Templates + Unit Costs

### takeoff_templates
**SHIPPED — labor-only**  
- Row count: **59**  
- Schema: `room_type, trade, scope_definition (jsonb), active, tenant_id`  
- `scope_definition` keys: `summary, optional, waste_pct, conditional, default_unit` — no material formula fields  
- No `category` column, no material SKU or supplier fields

### takeoff_unit_costs
**SHIPPED — labor-only, no category column**  
- Row count: **59**  
- Columns: `id, tenant_id, room_type, trade, unit, base_rate, multipliers (jsonb), notes, active, created_at, updated_at`  
- No `category` column. No distinction between labor and material rows — table is labor rates only.

### Bathroom template — full row data
14 rows, all labor trades:

| trade | optional | waste_pct | unit | conditional |
|-------|----------|-----------|------|-------------|
| Cabinets / vanities - Install | false | null | ls | null |
| Cleanup | false | null | ls | null |
| Demo | false | null | ls | null |
| Drywall - Hang | false | 10 | sf | null |
| Drywall - Tape / mud / texture | false | 10 | sf | null |
| Electrical - Finish | false | null | ls | null |
| Electrical - Rough-in | false | null | ls | null |
| Flooring - LVP | **true** | 10 | sf | "alternate to Tile - Floor" |
| Paint - Interior | false | null | sf | null |
| Plumbing - Finish / fixtures | false | null | ls | null |
| Plumbing - Rough-in | false | null | ls | null |
| Tile - Floor | false | 15 | sf | null |
| Tile - Wall / shower | false | 15 | sf | null |
| Trim / carpentry - Base / case | false | 10 | lf | null |

No material line items in templates.

---

## 3. estimate_line_items Table

### Schema
**SHIPPED — no material-specific columns**  
Columns (in order):
```
id (uuid), tenant_id (uuid), job_id (text), estimate_id (uuid),
phase (text), category (text), trade (text), description (text),
quantity (numeric), unit (text), unit_cost (numeric),
total_cost (numeric), markup_pct (numeric), client_price (numeric),
display_order (int), notes (text),
created_by (uuid), created_at, updated_at
```
**NOT present:** sku, product_id, supplier_id, material_order_id, unit_cost_id, takeoff_source — none of these columns exist.

### Row count
**5 rows**

### Distinct values in `category`
- `materials`
- `sub`
- `labor`

---

## 4. Material Side

### material_orders table
**SHIPPED — 0 rows, no UI writes to it**  
- Exists: yes  
- Row count: **0**  
- Columns: `id, tenant_id, job_id, estimate_line_item_id (uuid), supplier, description, quantity, unit, cost, ordered_at, expected_at, delivered_at, status, notes, created_by, created_at, updated_at`  
- Has `estimate_line_item_id` FK column  
- No UI component reads or writes this table. `supabase.js:1044–1061` has helpers (`sbLoadMaterialOrders`, `sbSaveMaterialOrder`, `sbUpdMaterialOrder`) but no component uses them.

### job_materials table
**SHIPPED — 1 row, no FK to estimate_line_items enforced**  
- Exists: yes  
- Row count: **1**  
- Columns: `id, job_id, tenant_id, created_by, name, phase, quantity, unit, supplier, unit_cost, order_date, expected_delivery, status, notes, created_at, estimate_line_item_id (uuid)`  
- Has `estimate_line_item_id` column but it is nullable — no enforced FK relationship visible in schema columns query.  
- Written by `MaterialsTab.jsx` (manual entry only).

### MaterialSelectionScr.jsx
**NOT BUILT**  
- No file matching `MaterialSelection*.jsx` exists anywhere in `avenstone-vite/src/`.

### AI material list generator edge function
**NOT BUILT**  
- No dedicated function for generating a material list from a takeoff or estimate.  
- `ai-field-agent/index.ts:204` can update `job_materials.status` via tool call.  
- `ai-estimator/index.ts:116` includes material pricing guidance in the system prompt but does not write structured material rows.

---

## 5. Room Tagging / Labels

### job_lidar_scans schema — all 20 columns
```
id (uuid), tenant_id (uuid), job_id (text), created_by (uuid),
rooms (jsonb), total_sqft (int), room_count (int), created_at,
capture_mode (text), height_meters (float8),
height_source (text), height_points (array),
gps_latitude (float8), gps_longitude (float8), gps_accuracy (float8),
quality_score (int), quality_grade (text),
quality_deductions (jsonb), outline_data (jsonb), edit_overrides (jsonb)
```

### rooms JSONB — sampled row
```json
{
  "name": "Living Room",
  "sqft": 153,
  "doors": 0,
  "width": 14.1,
  "height": 8.8,
  "length": 10.8,
  "windows": 0,
  "simulated": false
}
```
No `wallSegments`, no `worldX`/`worldZ` in this older single-room row (those fields are added by multi-room ContinuousRoomScanViewController).

### room_tags column
**NOT PRESENT** — no column named `room_tags` on `job_lidar_scans`.

### Exterior scan wiring
**WIRED — not dead code**  
- `lidar.js:164` — `startExteriorScan()` exported, launches `RoomPlanPlugin.startExteriorScan`  
- `supabase.js:811,838` — `capture_mode` written as `captureMode ?? 'interior'` on scan save  
- `FloorPlanTab.jsx:75` — reads `scan.capture_mode === 'exterior'`  
- `HeightCaptureStep.jsx:11,15` — comment references `ExteriorScanViewController`  
- `takeoff.js:89–90` — `roomMatchesType` returns true for `captureMode === 'exterior'`

### Manual exterior entry
**NOT BUILT** — no form, table, or column for entering an exterior scan without the iOS native flow.

---

## 6. Procurement / Materials Tab

### JobDet top-level tabs
**NOT PRESENT** — `JobDet.jsx` has no direct import of `MaterialsTab`. No top-level Materials or Procurement tab in `JobDet`.

### Materials tab inside FieldTab
**SHIPPED**  
- `FieldTab.jsx:4,9,36` — imports `MaterialsTab`, exposes it as a sub-tab with id `'materials'`  
- `MaterialsTab.jsx` — CRUD against `job_materials` table. Manual entry (name, phase, qty, unit, supplier, unit_cost, order_date, expected_delivery, status). Status progression: needed → ordered → delivered → installed. Urgency flag for deliveries within 7 days.  
- Reads via `sbLoadMaterials(job.id)` → `job_materials`. Writes via `sbSaveMaterial` / `sbUpdMaterial` / `sbDelMaterial`.

### Dedicated procurement tab
**NOT BUILT** — no component for `material_orders` procurement workflow.

---

## 7. Budget vs Actual

### FinancialsTab Budget sub-tab
**SHIPPED**  
- `FinancialsTab.jsx:11` — Budget is one of 3 sub-tabs (Ledger, Budget, Change Orders)  
- Reads: `sbLoadEstimateLineItems(job.id)` → `estimate_line_items`  
- Actuals: joins `job_transactions` where `direction='out'` and `status='paid'`, matched by `phase` string equality  
- **Does NOT split labor vs material** — all line items shown in one table regardless of `category` value  
- Desktop and mobile layouts both present (grid vs stacked card)

---

## 8. Anti-Surprise CO Linkage

### oh_shit_moments schema
**SHIPPED — no estimate_line_item_id**  
Columns: `id, session_id, job_id, tenant_id, condition, likelihood, estimated_cost_low, estimated_cost_high, how_to_present, included_in_proposal, created_at`  
No link to change_orders. No link to estimate_line_items.

### change_orders schema
**PARTIAL — spec'd columns NOT present**  
Columns actually present:
```
id (text), job_id (text), co_number (text), description (text),
reason (text), amount (numeric), status (text), approved_by (text),
created_at, approved_at, tenant_id (uuid), submitted_by (uuid)
```
**NOT present (were spec'd in AVENSTONE_VISION.md):**
- `estimate_line_item_id` — missing
- `allowance_original` — missing
- `auto_generated` — missing
- `source_type` — missing
- `client_approved_at` — missing
- `submitted_by_id` — missing (column is named `submitted_by`, not `submitted_by_id`)
- `submitted_by_role` — missing

---

## 9. Open Commits / Dirty State

### git status
**CLEAN** — `nothing to commit, working tree clean`. Up to date with `origin/main`.

### git log --oneline -15
```
c3415bd feat: Prompt B — takeoff wizard UI on Estimate tab
5b44ede chore(takeoff): remove debug filter log
289f1eb docs: log takeoff room-filter bug fix
b483a0f fix(takeoff): filter rooms by roomLabel match against roomType
9efbe94 docs: 2026-04-29 end-of-day summary + tomorrow start-here + honest retro
80b2852 docs: log dev auto-login shortcut
b621f48 feat(dev): auto-login as kalinspratling@gmail.com on dev/?devlogin=1
e091f68 docs: log takeoff data layer + debug entry point
6d559c3 feat(takeoff): temp debug button to dump draft to console (remove in Prompt B)
d56d826 feat(takeoff): data layer — buildTakeoffDraft helper joins scan + templates + unit_costs
28b9212 feat(takeoff): seed 59 platform-default unit costs (53 ai_knowledge-cited, 6 NULL by design)
ba48266 docs: log sub_pricing reschema fix + 2026-04-29 rebuild audit findings
7bbddf9 fix(subs): apply sub_pricing reschema migration (was claimed shipped 2026-04-29 but never applied)
2891bc3 docs: log sub onboarding wizard bug fixes
8334dc3 feat(subs): require password creation in onboarding wizard
```
