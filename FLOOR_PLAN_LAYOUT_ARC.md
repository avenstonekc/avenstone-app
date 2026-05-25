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
[5. Pre-submit preview]   ← Kalin sees rendered PDF in-app; approves or sends back
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

### Phase 5 — Pre-submit preview

Kalin sees the PDF before it ships.

- After Phases 1-4, the pipeline produces a PDF. Surface it in the app as a preview screen with two buttons: "Approve & Send" and "Re-scan".
- On Re-scan: bounce back to the LiDAR scanner with the previous scan loaded for diff.
- Approve & Send: existing send path.

Scope: 1 Sonnet prompt.

### Phase 6 — Confidence scoring + auto-flag

For long-term Anti-Surprise: each rendered floor plan gets a layout_confidence score (0-100) based on how many issues Phase 2/3 resolved cleanly vs. how many were forced. Below 80 = auto-flag for Kalin review.

Scope: 1 Sonnet prompt. Ship only if Phase 5 shows real bad outputs slipping through.

## Sequencing

```
Phase 1 (norm + door dedupe)        ← biggest immediate value, isolated
   ↓
Phase 2 (rules engine)              ← second biggest value, builds on Phase 1
   ↓
Phase 4 (renderer rewrite)          ← consumes Phase 1+2 output; first end-to-end test point
   ↓
Phase 5 (preview)                   ← gives Kalin a feedback loop
   ↓
Phase 3 (Opus tiebreaker)           ← only if Phases 4+5 show ambiguous cases
   ↓
Phase 6 (confidence scoring)        ← only if Phase 5 shows bad outputs sneaking through
```

Notice Phase 3 is OUT OF ORDER — it's last not first. The instinct is "have Opus fix it" but the better path is rules first, Opus only where rules fail.

## Trade-aware

Floor plan layout is platform UI, not trade-specific. No tenant or trade columns needed. Rules engine reads room types from RoomPlan's existing taxonomy.

## Estimated effort

- Phase 1: 1 prompt
- Phase 2: 2 prompts
- Phase 4: 1-2 prompts
- Phase 5: 1 prompt
- Total minimum viable arc: 5-6 prompts before any Opus tiebreaker work.
- Phase 3 (Opus): +1 prompt if needed.
- Phase 6 (confidence): +1 prompt if needed.

Worst case: 8 prompts. Best case: 6 and you're done.

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
- Kalin sees a preview before client gets the PDF.
- Confidence score (if Phase 6 ships) above 80 on typical residential scans.
