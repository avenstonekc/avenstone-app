# FLOOR_PLAN_LAYOUT_ARC

## Goal

Floor plan PDFs render with rooms labeled correctly, dimensions readable, doors deduped, SF clearly placed. Replace today's "render and hope" with a deterministic layout pass + Opus tiebreaker for edge cases.

Anti-Surprise Engine principle: catch layout problems before the PDF is generated, not after a client gets a confusing floor plan.

## Today's pain (what we're fixing)

1. Room name placement — labels render at room centroid by default. L-shaped rooms get labels in the hallway portion. Narrow rooms get labels half-cut by walls. Small rooms get full names overflowing.
2. Dimension lines + labels overlap — chain dimensions running along walls collide with room labels and door swings.
3. Doors double-count — every shared opening (Hallway ↔ Bedroom) renders twice. Already on the bug list. Same arc fixes it.
4. SF placement — square footage badge collides with the room label sometimes, lands on furniture other times.
5. Multi-room layouts overlap — rooms close to each other can have labels that touch or overlap visually.
6. No "preview before submit" — Kalin doesn't see the rendered PDF until after it's sent. By then it's too late.

## Architecture

Three new layers between RoomPlan/ARKit geometry and pdf.js:

```
RoomPlan/ARKit data
       │
       ▼
[1. Geometry normalizer]  ← cleans raw scan data, dedupes doors, snaps to grid
       │
       ▼
[2. Layout checker]       ← deterministic rules engine; produces layout_hints + issues[]
       │
       ▼
[3. Opus tiebreaker]      ← runs ONLY for issues[] flagged "ambiguous"
       │
       ▼
[4. pdf.js renderer]      ← consumes geometry + layout_hints; renders cleanly
       │
       ▼
[5. Editable scan drafts]  ← floor plans persist; Kalin edits labels/SF without rescanning
```

Layers 1, 2, 4, 5 are deterministic code. Layer 3 is the only LLM call. Most floor plans should pass through 1 → 2 → 4 → 5 with zero Opus involvement.

## Phase plan

### Phase 1 — Geometry normalizer + door dedupe

The data layer. Doesn't render anything. Just produces clean structured input.

- New module `avenstone-vite/src/lib/floorPlan/normalize.js`.
- Input: raw RoomPlan/ARKit JSON.
- Output: normalized `{rooms[], walls[], doors[], windows[]}` with stable IDs, snapped coordinates, and deduped doors (the bug already on the backlog).
- Door dedupe rule: two doors with midpoints within N pixels of each other AND on the same wall segment = one door, attributed to both rooms.
- Unit tests for the dedupe logic. Real geometry samples saved as fixtures.

Scope: 1 Sonnet prompt.
Ships: dedupe bug fix as a bonus, isolated module ready for Phase 2 to consume.

### Phase 2 — Layout checker (deterministic rules)

The brain that doesn't need a brain. Pure geometry + rule lookup.

- New module `avenstone-vite/src/lib/floorPlan/layoutCheck.js`.
- Input: normalized geometry from Phase 1.
- Output: `{layout_hints: {...}, issues: [...]}`.
- Rules to encode (initial set):
  - Room label position: start at largest-inscribed-rectangle center, not polygon centroid. (Fixes L-shape problem.) Use a standard polygon offsetting algo — there are JS libs for this (e.g. polylabel, polygon-clipping).
  - Room label abbreviation: if room_name text width > 60% of label-zone width at current font size, use abbreviation table (Bedroom → BR, Bathroom → BA, Kitchen → KIT, etc.) or truncate.
  - Room label rotation: if room is taller than wide by 1.5x, rotate label 90deg.
  - SF badge position: centered under room label, 4px below baseline. If room is too small (< 50 sqft), inline as "Pantry 12sf" on one line.
  - Dimension line clearance: if a chain dimension overlaps a room label bounding box, flag as issue: 'dim_collision' for Opus.
  - Door swing clearance: door arc must not cross a room label bounding box. If it does, flag.
  - Two rooms with overlapping labels: flag as issue: 'adjacent_label_collision' for Opus.
  - Hallway micro-room SF: if room < 30 sqft AND room_type === 'hallway', don't show SF (saves clutter).
- Each rule contributes either a hint (positioning data the renderer uses) or an issue (something Opus needs to decide).
- Unit tests for each rule on synthetic geometries.

Scope: 2 Sonnet prompts.
- Prompt A: rules engine scaffolding + 4 simplest rules (label position, abbreviation, rotation, SF position).
- Prompt B: 4 more rules (dim collision, door clearance, adjacent label, hallway SF gate).

Ships: the renderer can consume layout_hints from this layer alone. Most floor plans should look right with zero Opus calls.

### Phase 3 — Opus tiebreaker (LLM for edge cases only)

Only fires when Phase 2 raises an issue it can't resolve.

- New edge function `supabase/functions/floor-plan-opus-tiebreaker/index.ts`.
- Input: `{issue, candidates, context}`. Example: `{issue: 'l_shape_label_ambiguous', candidates: [{x:100,y:200,score:0.7}, {x:150,y:180,score:0.65}], context: {room_name, room_polygon, neighboring_labels}}`.
- Opus reasons: which candidate position avoids visual conflict best? Returns `{chosen_candidate_index, reason}`.
- Cost containment: parallel calls for all issues in one floor plan (each Opus call is independent). Cache decisions by floor_plan_hash + issue_id so re-renders don't re-pay.
- Auth: same Kalin/system pattern from Field-Opus.

Scope: 1 Sonnet prompt.
Caveat: This phase is optional. Phases 1+2+4 might be good enough on their own. Build only if Phase 4 testing shows real ambiguous edge cases.

### Phase 4 — pdf.js renderer rewrite

Replace today's "centroid + hope" with "consume layout_hints + render exactly what they say."

- Edit current floor plan rendering location (audit will find — probably `avenstone-vite/src/lib/pdf.js`).
- Remove hardcoded label-positioning math. Read from layout_hints[room_id].
- Apply same change to dimensions, doors, SF badges.
- Bonus: door dedupe consumer (uses Phase 1's normalized doors).

Scope: 1-2 Sonnet prompts depending on how tangled today's pdf.js is.

### Phase 5 — Editable scan drafts (replaces original Phase 5 + 6)

Floor plans become first-class persistent entities. Raw scan + layout overrides + version history persist together so Kalin can open a saved floor plan later and tweak it without rescanning.

Original Phase 5 (pre-submit preview) and Phase 6 (confidence scoring) are absorbed here. Confidence scoring intentionally dropped — Kalin doesn't want it.

#### Phase 5a — Schema + helpers (foundation)

New `floor_plans` table:
- id UUID PK
- job_id UUID FK→jobs (nullable — pre-job scans attach to contact)
- contact_id UUID FK→contacts (nullable — used when job_id null)
- tenant_id UUID NOT NULL
- created_by UUID FK→profiles
- name TEXT (e.g. "First Floor", "Basement")
- raw_scan JSONB (the full Phase 1 input, persisted)
- layout_overrides JSONB (per-room manual overrides: {room_id: {label_x?, label_y?, label_text?, sf_visible?}})
- current_pdf_url TEXT (signed URL or storage path)
- current_pdf_version INTEGER (incremented each regeneration)
- status TEXT CHECK (draft|sent|archived) default 'draft'
- created_at, updated_at

Companion `floor_plan_versions` table for history:
- id UUID PK
- floor_plan_id UUID FK ON DELETE CASCADE
- version_number INTEGER
- pdf_url TEXT
- layout_overrides_snapshot JSONB
- raw_scan_snapshot JSONB
- sent_to TEXT[] (emails / contact IDs this version was sent to)
- sent_at TIMESTAMPTZ
- created_at TIMESTAMPTZ

Migration: create both tables + RLS (tenant_id pattern, plus job_id-scoped read for assigned subs).

Helpers in supabase.js:
- sbCreateFloorPlan({jobId, contactId, name, rawScan})
- sbLoadFloorPlan(id)
- sbLoadFloorPlansForJob(jobId)
- sbUpdateFloorPlanOverrides(id, overrides)
- sbRegenerateFloorPlanPdf(id) — runs normalize → layoutCheck → renderer → uploads PDF to storage → bumps current_pdf_version, writes a row to floor_plan_versions
- sbSendFloorPlanVersion(id, versionNumber, recipientEmails[]) — marks the version as sent + fires existing notify-email path

Scope: 1 prompt.

#### Phase 5b — Save scan path

Wire AiIntakeWizard (and any other scanner caller) to save a draft floor_plans row at the end of the scan instead of (or in addition to) the existing PDF-only path. The PDF is uploaded to storage, URL stored. Raw scan + layout_overrides (initially {}) saved on the row.

Add a new "Floor Plans" section to the job detail screen showing draft + sent plans for that job. Each list item shows: name, status badge, last updated, "Open" button.

Scope: 1 prompt.

#### Phase 5c — Editor screen (list-of-rooms with per-room overrides)

New screen: FloorPlanEditorScr.jsx (or rewire the existing FloorPlanEditor.jsx which was flagged as built-but-not-wired). Two-pane on desktop, stacked on mobile.

Left: PDF preview, regenerated on save.
Right: list of rooms with per-room edit controls:
- Name (editable text)
- Show SF (toggle)
- Label position: "Auto (Phase 2)" or "Custom" with x/y inputs (advanced — most users won't touch)
- "Reset to auto" button per room

Bottom: "Regenerate PDF" button. Calls sbRegenerateFloorPlanPdf. Layout issues from Phase 2 surface inline next to each room with severity tag.

Scope: 1 prompt.

#### Phase 5d — Visual drag-to-reposition

Extend the editor with a canvas overlay on the PDF preview. Drag a label, X/Y override updates, regenerate uses new position. Click a SF badge to toggle visibility. Right-click a label for "Reset to auto."

Scope: 2 prompts. (1 for the canvas + drag mechanics, 1 for the override write path + regeneration trigger.)

#### Phase 5e — Version history + send

Bottom of editor: "Versions" tab showing all floor_plan_versions for this plan. Each version has: PDF preview thumbnail, sent_at + sent_to list, "Open this version's PDF" link, "Send to..." button.

"Send to..." opens a recipient picker (contacts on the job + client email + free-text email). On confirm: fires existing notify-email with the PDF URL, writes a new row to floor_plan_versions OR updates the existing version's sent_to/sent_at, marks status='sent' on floor_plans if first send.

Scope: 1 prompt.

#### Total Phase 5 effort

5a + 5b + 5c + 5d + 5e = 6 prompts (5d is 2). Ships the full editable-draft workflow.

Minimum viable subset if Kalin wants the most value fastest:
- 5a + 5b alone = 2 prompts. Floor plans persist, can re-open later but no editing yet.
- Add 5c = 3 prompts total. Per-room name + SF toggle edits.
- Add 5e = 4 prompts total. Versioning + send.
- 5d (visual drag) can be deferred or skipped if list-based overrides feel sufficient.

### Phase 6 — RESERVED

Original Phase 6 (confidence scoring + auto-flag) DROPPED per Kalin's call 2026-05-25. Confidence scores were going to estimate "this floor plan is N% likely to render cleanly" — Kalin doesn't want it.

If real production use surfaces a need for automated quality flags, revisit.

## Sequencing

```
Phase 1 (norm + door dedupe)        ← shipped
   ↓
Phase 2 (rules engine)              ← shipped (2A + 2B)
   ↓
Phase 4 (renderer rewrite)          ← shipped
   ↓
Phase 5a (schema + helpers)         ← editable drafts foundation
   ↓
Phase 5b (save scan path)           ← scans persist as drafts
   ↓
Phase 5c (editor — list overrides)  ← per-room edits without rescan
   ↓
Phase 5e (versions + send)          ← send specific versions to clients
   ↓
Phase 5d (drag-to-reposition)       ← visual editor polish, can defer
   ↓
Phase 3 (Opus tiebreaker)           ← only if real ambiguity surfaces in production
   ↓
Phase 6 — DROPPED (was confidence scoring)
```

Notice 5d sits AFTER 5e — drag editing is polish on top of the working editor. If 5c list-based overrides feel sufficient in practice, 5d may never ship. That's fine.

Notice Phase 3 sits AFTER all of Phase 5 — same reason as before, rules + overrides should resolve most edge cases without needing an LLM call.

## Trade-aware

Floor plan layout is platform UI, not trade-specific. No tenant or trade columns needed. Rules engine reads room types from RoomPlan's existing taxonomy.

## Estimated effort

- Phase 1: 1 prompt — SHIPPED
- Phase 2: 2 prompts — SHIPPED (2A + 2B)
- Phase 4: 1 prompt — SHIPPED
- Phase 5a (schema): 1 prompt
- Phase 5b (save path): 1 prompt
- Phase 5c (editor list overrides): 1 prompt
- Phase 5e (versions + send): 1 prompt
- Phase 5d (drag editor): 2 prompts (optional polish)
- Phase 3 (Opus tiebreaker): 1 prompt (optional, only if needed)
- Phase 6: DROPPED

Remaining minimum to ship the editable-draft workflow: **4 prompts** (5a+5b+5c+5e).
With visual drag editor: **6 prompts**.
Plus Opus tiebreaker if needed: **+1 prompt**.

## Open questions

1. Where does current floor plan rendering live? Need an audit. CLAUDE_MEMORY references pdf.js and mentions the door-dedupe bug. Probably avenstone-vite/src/lib/pdf.js but unconfirmed — audit will resolve.
2. What's the RoomPlan data shape? Need to inspect raw scan output to design the normalizer.
3. Are there existing fixtures (real scans saved as test data)? If not, Phase 1 should capture some from Kalin's actual scans for regression testing.
4. Does ARKit/RoomPlan output include any layout hints already? (Some versions of RoomPlan return suggested label positions.) Audit before re-inventing.

## Risks

- Rules engine could get bloated. Mitigation: each rule is its own file, each with its own unit tests. No mega-function.
- Polygon math is finicky. Use a battle-tested library (polygon-clipping, polylabel for inscribed-rectangle centers, etc.) — don't write geometry from scratch.
- Opus tiebreaker latency. Each call adds 2-10s. Mitigation: parallel batching + caching. Phase 3 ships only if needed.
- Existing pdf.js may be tangled. Phase 4 risk-of-scope-creep. Mitigation: if the current code is too messy, Phase 4 splits into 4a (read/inventory) and 4b (rewrite with feature flag).

## Definition of done

- Submit a floor plan from the app.
- PDF renders with: room labels properly placed inside each room (not in hallway portions of L-shapes), dimensions readable, doors counted once, SF clear.
- Kalin (or any user) can re-open a saved floor plan later and edit room names, toggle SF visibility, or reposition labels — without rescanning.
- Multiple versions of the same floor plan tracked with version history.
- Clients receive specific versions on demand; Kalin sees which version went to whom and when.
- The visual layout matches or exceeds Procore's floor-plan output.

---

## Amendments

**2026-05-25** — Phase 5 redesigned. Original Phase 5 (pre-submit preview, one-shot gate) replaced by Phase 5 multi-part editable scan drafts. Phase 6 (confidence scoring) dropped entirely per Kalin's call. Rationale: persistent editable drafts are substantially more valuable than a one-time preview gate — Kalin can fix label issues weeks after the original scan without re-scanning. Confidence scoring would have estimated quality but Kalin doesn't want it.
