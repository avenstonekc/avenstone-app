# floorPlan — normalize module

## What normalize.js does

Takes a raw RoomPlan/ARKit scan JSON object and returns a cleaned, world-space
normalized representation of rooms, walls, doors, and windows.

**Input:** `rawScan` — the shape produced by `lidar.js` and consumed by `pdf.js`:
```js
{
  rooms: [{
    id?, name, type?, worldX, worldZ, height?, floor?,
    wallSegments:   [{x1,z1,x2,z2}],
    doorSegments:   [{x1,z1,x2,z2,nx,nz,width,id?}],
    windowSegments: [{x1,z1,x2,z2,id?}],
    openingSegments?: [{x1,z1,x2,z2}],
  }],
  scanner_version?,
}
```

**Output:** `{ ok: true, data: { rooms, walls, doors, windows, metadata } }` or
`{ ok: false, error: string }`.

All output coordinates are world-space feet, snapped to a 0.1 ft grid.

## Pipeline — FLOOR_PLAN_LAYOUT_ARC layers

```
Phase 1  normalize.js   ← you are here
           ↓ {rooms, walls, doors, windows}
Phase 2  layout.js      (polylabel label placement, layoutCheck rules engine)
           ↓ positioned labels + layout violations
Phase 3  constraints.js (wall collinearity merge, T-junction snapping)
Phase 4  pdf.js         (renderer — consumes Phase 1 output directly for now)
Phase 5  export.js      (CAD export, DXF, SVG)
```

Phases 2-5 are deferred. pdf.js currently consumes raw scan data directly;
once Phase 2 ships it will switch to the normalize.js output.

## Why zero dependencies in Phase 1

normalize.js has no imports. The goal is a pure-function module that can be
unit-tested in isolation, run in Node without a bundler, and embedded in any
future context (edge function, worker, CLI tool) without pulling in React,
Supabase, or any PDF library.

Phase 2 will add `polylabel` (pole-of-inaccessibility for L-shape label
placement). That dependency lives in layout.js, not here.

## Coordinate system

ARKit uses a right-handed coordinate system. For floor plan purposes:
- x = east (right on the plan)
- z = north (up on the plan)
- y = vertical (ignored in 2D)

The spec notation uses `[x, y]` pairs; throughout this module `y` is treated
as `z` (the horizontal axis). This matches the convention in lidar.js and
pdf.js.

## MERGE_DISTANCE_FT constant

`MERGE_DISTANCE_FT = 0.5` (6 inches) controls door deduplication.

Two door entries from adjacent rooms are merged into one when BOTH hold:
1. Their midpoints are within `MERGE_DISTANCE_FT` of each other.
2. Their normal vectors are parallel within 25° (absolute dot product ≥ 0.906).

**Tuning guidance:**
- Increase to 1.0 ft if scanner noise is higher than expected (older hardware,
  large rooms where ARKit drifts more).
- Decrease to 0.25 ft if you have genuinely close but distinct doors on the
  same shared wall.
- Override per-call via `dedupeDoors(doors, walls, { mergeDistanceFt: 0.8 })`.

## Phase 2 additions (planned)

- `polylabel` for L-shape and concave room label placement
- `layoutCheck` rules engine: min corridor width, bedroom egress window check,
  ADA turn radius clearance
- Collinearity merge for wall segments that should be one long wall
