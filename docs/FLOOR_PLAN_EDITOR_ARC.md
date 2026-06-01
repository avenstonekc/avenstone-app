# FLOOR_PLAN_EDITOR_ARC.md

Status: PARKED / BACK-BURNERED. Design captured for later. Do NOT build until the takeoff wizard / scan→takeoff→bid pipeline runs smooth — the editor is a low-frequency cleanup tool, lower priority than the takeoff. Edits the JSON geometry (normalized_geometry), never the PDF.

## Decision (2026-06-01)
The existing manual editor (FloorPlanEditorScr.jsx) is a dead end — do not salvage as the editing model. It's wired to the Edit button but doesn't usably work: edits don't reliably persist, and its core interaction (move walls N/S/E/W) is broken because real scans sit at arbitrary rotation (e.g. NE), so compass-direction nudging fights the data. It does NOT corrupt canonical data (writes layout_overrides on floor_plans, never normalized_geometry) — not dangerous, just not useful. Keep only its click/selection UI; the moving + saving are what's broken.

Chosen future model: CLICK-TO-REFERENCE + TALK-TO-INSTRUCT.
- Click the wall/room you mean → system hands the AI the exact object ID + real coordinates (no "which wall" guessing).
- Describe the change, referencing other clicked objects: "move this wall out 5 ft toward [click] that wall; add a 32x80 door in the middle."
- Direction is ALWAYS "toward [a clicked thing]", never compass — this kills the angled-scan problem (clicks live in the scan's own coordinate space).
- AI interprets click+description → emits structured ops → geometryOps validates+applies → commit to normalized_geometry → PDF re-renders.
- Inputs are stacked/batched: queue several click+describe instructions, apply together.

Why: click resolves the WHAT (no ambiguity), words supply the INTENT, measurements stay honest (ops act on real LiDAR geometry, nothing hallucinated) — permit-grade and customer-grade. Reuses geometryOps.js (Phase 1, already built).

## REJECTED
- Image-in/image-out AI floor plan generation: produces HALLUCINATED dimensions, unfit for permits/bids. The editor must apply structured geometric OPERATIONS to real data, never redraw the picture.
- Manual N/S/E/W nudging: broken for angled scans; replaced by "toward [clicked object]".

## The hard part (why deferred)
"Connect these walls from this point" requires correctly joining segments, resolving rooms on either side, deciding whether the op creates/closes a polygon, keeping topology valid. Geometry-hard, easy to demo, hard to make reliable. Click-to-reference solves AMBIGUITY but not the CONNECTION problem. That connection logic is the real cost and the main reason this is parked.

## When revisited — start tiny
1. Minimal POC: only add_wall + add_opening via click+describe, on ONE real scan. See if connection/join logic holds.
2. If reliable → expand to move_wall, split/merge, relabel.
3. If painful even at that scale → learned cheaply; reconsider scope.
Keep the existing click/selection UI; replace the broken move+save with AI-ops + geometryOps commit.

## Architecture fit
- geometryOps.js (Phase 1, BUILT, 40 tests passing): the pure validated op layer the editor's AI emits into.
- Edits normalized_geometry (canonical since scan-normalization; safe now the ring is trustworthy).
- SUB_AGENT_ARC fit: editor is a page agent calling the geometry domain service; click+describe is one front-end to the op vocabulary.

## Priority
1. Scanner pipeline locked (normalized_geometry canonical, honest areas) — DONE.
2. pdf.js render fixes (fill-from-ring, SF total, hallway label) — shipped 2026-06-01, pending field test.
3. Takeoff wizard / scan→takeoff→bid pipeline — THE PRIORITY. Editor waits behind this.
4. Editor — PARKED. Revisit per "start tiny" only after the system runs smooth.

## LOG
- [PARKED — 2026-06-01] Editor back-burnered. Existing manual editor confirmed dead-end (broken N/S/E/W on angled scans, doesn't save, non-corrupting). Chosen model: click-to-reference + talk-to-instruct → AI ops → geometryOps → normalized_geometry. Direction always "toward [clicked object]". Image-in/image-out REJECTED (hallucinated dimensions). Connection/join logic is the hard part and reason for deferral. Revisit with minimal add_wall+add_opening POC after takeoff wizard is solid. Phase 1 geometryOps stays built as the engine.
