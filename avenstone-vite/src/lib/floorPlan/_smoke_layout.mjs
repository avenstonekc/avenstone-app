// Smoke test for layoutCheck.js — Phase 2A rules engine
// Run from repo root: node avenstone-vite/src/lib/floorPlan/_smoke_layout.mjs

import {
  computeLayoutHints,
  computeLabelPosition,
  abbreviateRoomName,
  computeLabelRotation,
  computeSfBadgePosition,
  detectDimensionCollisions,
  detectDoorSwingCollisions,
} from './layoutCheck.js';

let passed = 0;
let failed = 0;

function assert(label, condition) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

function approx(a, b, tol = 0.5) {
  return Math.abs(a - b) <= tol;
}

// ─── Shared geometry helpers ──────────────────────────────────────────────────

function makeRoom(id, name, polygon, area_sqft, type = null) {
  // Compute naive centroid as average of vertices (NOT polylabel)
  const cx = polygon.reduce((s, p) => s + p[0], 0) / polygon.length;
  const cy = polygon.reduce((s, p) => s + p[1], 0) / polygon.length;
  return { id, name, polygon, area_sqft, centroid: [cx, cy], type, floor: 0 };
}

function makeNormalized(rooms) {
  return {
    rooms,
    walls: [],
    doors: [],
    windows: [],
    metadata: { room_count: rooms.length, total_area_sqft: 0, normalize_version: 1 },
  };
}

const squareRoom = makeRoom('r_square', 'Kitchen', [
  [0, 0], [10, 0], [10, 10], [0, 10],
], 100);

const tallNarrowRoom = makeRoom('r_tall', 'Closet', [
  [0, 0], [4, 0], [4, 12], [0, 12],
], 48);

// L-shape: 10×10 minus top-right 5×5 chunk
const lRoom = makeRoom('r_lshape', 'Living Room', [
  [0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10],
], 75);

const smallRoom = makeRoom('r_small', 'Bath', [
  [0, 0], [4, 0], [4, 8], [0, 8],
], 32);

const bigRoom = makeRoom('r_big', 'Master Bedroom', [
  [0, 0], [20, 0], [20, 15], [0, 15],
], 300);

// ─── Rule 1: Label position via polylabel ─────────────────────────────────────
console.log('\nRule 1 — label position via polylabel');
{
  // Square room: polylabel should land near center
  const pos = computeLabelPosition(squareRoom);
  assert('square room label_x ≈ 5', approx(pos.x, 5, 1));
  assert('square room label_y ≈ 5', approx(pos.y, 5, 1));
  assert('square room distance_to_edge > 0', pos.distance_to_edge > 0);

  // L-shape: polylabel must be INSIDE the polygon
  // The L-shape naive centroid is roughly (35/6, 35/6) ≈ (5.83, 5.83)
  // which lands in the missing top-right chunk — outside the polygon.
  // polylabel should return a point inside.
  const lPos = computeLabelPosition(lRoom);
  assert('L-shape label inside polygon (x < 10, y in valid zone)', lPos.x < 10 && lPos.y < 10);
  assert('L-shape label distance_to_edge > 0.5', lPos.distance_to_edge > 0.5);

  // Degenerate: 0 points → fallback to centroid
  const degRoom = makeRoom('r_deg', 'X', [], 0);
  const degPos = computeLabelPosition(degRoom);
  assert('degenerate polygon returns [0,0]', degPos.x === 0 && degPos.y === 0);
}

// ─── Rule 2: Abbreviation table ───────────────────────────────────────────────
console.log('\nRule 2 — abbreviation table');
{
  // Fits without abbreviating
  const { text: t1, was_abbreviated: a1 } = abbreviateRoomName('BR', 10);
  assert('short name fits without abbreviation', t1 === 'BR' && a1 === false);

  // Canonical mappings
  const cases = [
    ['Bedroom', 2, 'BR'],
    ['Bedroom 2', 2, 'BR2'],
    ['Bathroom', 2, 'BA'],
    ['Master Bedroom', 2, 'MBR'],
    ['Master Bathroom', 2, 'MBA'],
    ['Kitchen', 2, 'KIT'],
    ['Living Room', 2, 'LIV'],
    ['Walk-in Closet', 2, 'WIC'],
  ];
  for (const [name, maxChars, expected] of cases) {
    const { text } = abbreviateRoomName(name, maxChars);
    assert(`"${name}" → "${expected}"`, text === expected);
  }

  // Numbered bedroom keeps suffix
  const { text: br3 } = abbreviateRoomName('Bedroom 3', 2);
  assert('"Bedroom 3" → "BR3"', br3 === 'BR3');

  // Unknown name truncated with ellipsis
  const { text: unk, was_abbreviated: unkA } = abbreviateRoomName('Wine Cellar', 4);
  assert('unknown name truncated with ellipsis', unkA === true && unk.endsWith('…'));
  assert('truncated to maxChars', unk.length <= 4);

  // Empty name
  const { text: empty } = abbreviateRoomName('', 5);
  assert('empty name returns empty', empty === '');
}

// ─── Rule 3: Label rotation ───────────────────────────────────────────────────
console.log('\nRule 3 — label rotation');
{
  // 10×10 square → no rotation
  assert('square room rotation = 0', computeLabelRotation(squareRoom) === 0);

  // 4×12 → height/width = 3 > 1.5 threshold → rotate 90
  assert('tall narrow room rotation = 90', computeLabelRotation(tallNarrowRoom) === 90);

  // 20×15 → height/width = 0.75 < 1.5 → no rotation
  assert('wide room rotation = 0', computeLabelRotation(bigRoom) === 0);

  // Custom threshold override
  assert('custom threshold 0.5 rotates wide room', computeLabelRotation(bigRoom, { rotationAspectThreshold: 0.5 }) === 90);

  // Degenerate polygon
  assert('degenerate rotation = 0', computeLabelRotation(makeRoom('x', 'X', [], 0)) === 0);
}

// ─── Rule 4: SF badge position ────────────────────────────────────────────────
console.log('\nRule 4 — SF badge position');
{
  const labelHint = { label_x: 5, label_y: 5, label_text: 'Bath', label_font_size: 14 };

  // Small room → inline
  const sfSmall = computeSfBadgePosition(smallRoom, labelHint);
  assert('small room sf_inline_with_label = true', sfSmall.sf_inline_with_label === true);
  assert('small room sf_text includes area', sfSmall.sf_text.includes('32'));
  assert('small room sf_text includes name', sfSmall.sf_text.includes('Bath'));

  // Large room → separate badge below label
  const labelBig = { label_x: 10, label_y: 7, label_text: 'MBR', label_font_size: 14 };
  const sfBig = computeSfBadgePosition(bigRoom, labelBig);
  assert('large room sf_inline_with_label = false', sfBig.sf_inline_with_label === false);
  assert('large room sf_y > label_y', sfBig.sf_y > labelBig.label_y);
  assert('large room sf_text = "300 SF"', sfBig.sf_text === '300 SF');

  // Rounded SF
  const fracRoom = makeRoom('r_frac', 'Kitchen', [[0,0],[10,0],[10,12.47],[0,12.47]], 124.7);
  const sfFrac = computeSfBadgePosition(fracRoom, labelHint);
  assert('SF rounded: 124.7 → "125 SF"', sfFrac.sf_text === '125 SF' || sfFrac.sf_text.includes('125'));

  // Custom small threshold override
  const sfCustom = computeSfBadgePosition(bigRoom, labelBig, { smallRoomThresholdSqft: 400 });
  assert('custom small threshold forces inline for 300sqft room', sfCustom.sf_inline_with_label === true);
}

// ─── computeLayoutHints — integration ────────────────────────────────────────
console.log('\ncomputeLayoutHints — integration');
{
  // Empty floor plan
  const emptyResult = computeLayoutHints(makeNormalized([]));
  assert('empty plan ok:true', emptyResult.ok === true);
  assert('empty plan layout_hints = {}', Object.keys(emptyResult.data.layout_hints).length === 0);
  assert('empty plan issues = []', emptyResult.data.issues.length === 0);

  // Invalid input
  assert('null input → ok:false', computeLayoutHints(null).ok === false);
  assert('missing rooms → ok:false', computeLayoutHints({ rooms: null }).ok === false);

  // 3-room plan
  const threeRoom = makeNormalized([squareRoom, tallNarrowRoom, lRoom]);
  const result = computeLayoutHints(threeRoom);
  assert('3-room plan ok:true', result.ok === true);
  assert('layout_hints has 3 keys', Object.keys(result.data.layout_hints).length === 3);

  const sq = result.data.layout_hints['r_square'];
  assert('square room hint has all required keys', [
    'label_x','label_y','label_text','label_full_text','label_rotation',
    'label_font_size','label_distance_to_edge','sf_x','sf_y','sf_text','sf_inline_with_label',
  ].every(k => k in sq));

  assert('square room label_full_text = "Kitchen"', sq.label_full_text === 'Kitchen');
  assert('tall narrow room rotation = 90 in hint', result.data.layout_hints['r_tall'].label_rotation === 90);
  assert('square room rotation = 0 in hint', sq.label_rotation === 0);

  // Small room inline SF in full run
  const smallPlan = makeNormalized([smallRoom]);
  const smallResult = computeLayoutHints(smallPlan);
  assert('small room sf_inline_with_label = true in full run', smallResult.data.layout_hints['r_small'].sf_inline_with_label === true);

  // Accepts normalized output envelope (with ok/data wrapper)
  const wrapped = { ok: true, data: makeNormalized([squareRoom]) };
  const wrappedResult = computeLayoutHints(wrapped);
  assert('accepts ok/data envelope from normalizeFloorPlan', wrappedResult.ok === true);

  // labelFontSize option propagates
  const bigFont = computeLayoutHints(makeNormalized([squareRoom]), { labelFontSize: 20 });
  assert('labelFontSize option stored in hint', bigFont.data.layout_hints['r_square'].label_font_size === 20);

  // Doors in plan don't affect layout_hints (Phase 2A ignores doors)
  const withDoors = { ...makeNormalized([squareRoom]), doors: [{ id: 'd1', p1: [5,0], p2: [8,0] }] };
  const doorsResult = computeLayoutHints(withDoors);
  assert('doors present but ignored — still ok', doorsResult.ok === true);
  assert('doors present — same hint for square room', approx(doorsResult.data.layout_hints['r_square'].label_x, 5, 1));
}

// ─── Issue surfacing ──────────────────────────────────────────────────────────
console.log('\nIssue surfacing');
{
  // Narrow room → polylabel distance_to_edge < 0.5 → label_distance_low
  const veryNarrow = makeRoom('r_narrow', 'Hall', [
    [0, 0], [0.8, 0], [0.8, 10], [0, 10],
  ], 8);
  const narrowResult = computeLayoutHints(makeNormalized([veryNarrow]));
  assert('narrow room ok:true', narrowResult.ok === true);
  const distIssue = narrowResult.data.issues.find(i => i.kind === 'label_distance_low' && i.room_id === 'r_narrow');
  assert('narrow room raises label_distance_low issue', !!distIssue);
  assert('label_distance_low severity = warn', distIssue?.severity === 'warn');
}

// ─── Phase 2B: Rule 5 — Dim collision ────────────────────────────────────────
console.log('\nPhase 2B — Rule 5: dimension collision');
{
  // Label bbox at center of a 10x10 room (approx)
  const labelBbox = { x: 4.0, y: 4.3, w: 1.5, h: 0.14 };

  // Chain dim text overlapping the label
  const nearDim = [{ offset_text_at: [4.5, 4.35], text_width: 0.8, text_height: 0.1 }];
  const hits = detectDimensionCollisions(labelBbox, nearDim);
  assert('dim text overlap → 1 hit', hits.length === 1);
  assert('dim hit severity = warn or ambiguous', ['warn','ambiguous'].includes(hits[0].severity));
  assert('dim hit records dim_index 0', hits[0].dim_index === 0);

  // Chain dim far away — no collision
  const farDim = [{ offset_text_at: [15, 15], text_width: 0.8, text_height: 0.1 }];
  assert('far dim → 0 hits', detectDimensionCollisions(labelBbox, farDim).length === 0);

  // Empty chain_dims — no crash, 0 hits
  assert('empty chain_dims → 0 hits', detectDimensionCollisions(labelBbox, []).length === 0);
  assert('null chain_dims → 0 hits', detectDimensionCollisions(labelBbox, null).length === 0);

  // In full computeLayoutHints run — chain_dims absent → rule is no-op, no issues
  const planNoDims = makeNormalized([squareRoom]);
  const noDimResult = computeLayoutHints(planNoDims);
  const dimIssues = noDimResult.data.issues.filter(i => i.kind === 'dim_collision' || i.kind === 'dim_collision_severe');
  assert('no chain_dims in plan → 0 dim issues', dimIssues.length === 0);

  // In full computeLayoutHints run — chain_dims present and overlapping
  const planWithDims = { ...makeNormalized([squareRoom]), chain_dims: nearDim };
  const dimResult = computeLayoutHints(planWithDims);
  const dimIssue = dimResult.data.issues.find(i => i.kind === 'dim_collision' || i.kind === 'dim_collision_severe');
  assert('overlapping chain_dim → dim_collision issue in full run', !!dimIssue);
}

// ─── Phase 2B: Rule 6 — Door swing collision ──────────────────────────────────
console.log('\nPhase 2B — Rule 6: door swing collision');
{
  // 6×6 room — label at centroid ≈ (3,3), door at midpoint (3,0) width 3
  // corners of label at ≈ (1.7,2.9) to (4.3,3.1) — closest corner ~2.7ft from swing center < 3ft radius
  const room6 = makeRoom('r6', 'Room', [[0,0],[6,0],[6,6],[0,6]], 36);
  const swingDoor = [{ id: 'sd1', midpoint: [3,0], width: 3, p1:[1.5,0], p2:[4.5,0], room_ids:['r6'] }];

  // Compute bbox for room6's label from a full run
  const room6Plan = makeNormalized([room6]);
  room6Plan.doors = swingDoor;
  const room6Result = computeLayoutHints(room6Plan);
  assert('6×6 room with close door ok:true', room6Result.ok === true);
  const swingIssue = room6Result.data.issues.find(i => i.kind === 'door_swing_collision');
  assert('label near door midpoint → door_swing_collision issue', !!swingIssue);
  assert('single door collision severity = warn', swingIssue?.severity === 'warn');

  // Large 20×20 room — label at (10,10), door at (10,0) width 3 → 10ft > 3ft radius → clear
  const bigRoom2 = makeRoom('r_big2', 'Kitchen', [[0,0],[20,0],[20,20],[0,20]], 400);
  const farDoor = [{ id: 'fd1', midpoint:[10,0], width:3, p1:[8.5,0], p2:[11.5,0], room_ids:['r_big2'] }];
  const bigPlan = { ...makeNormalized([bigRoom2]), doors: farDoor };
  const bigResult = computeLayoutHints(bigPlan);
  const swingIssues2 = bigResult.data.issues.filter(i => i.kind === 'door_swing_collision');
  assert('label far from door → no door_swing issue', swingIssues2.length === 0);

  // Empty doors array → 0 door issues
  const planNoDoors = makeNormalized([room6]);
  const noDoorsResult = computeLayoutHints(planNoDoors);
  const noSwingIssues = noDoorsResult.data.issues.filter(i => i.kind === 'door_swing_collision');
  assert('empty doors → 0 door_swing issues', noSwingIssues.length === 0);

  // Door not in room_ids → not counted
  const unrelatedDoor = [{ id: 'ud1', midpoint:[3,0], width:3, room_ids:['other_room'] }];
  const unrelatedPlan = { ...makeNormalized([room6]), doors: unrelatedDoor };
  const unrelatedResult = computeLayoutHints(unrelatedPlan);
  const unrelatedIssues = unrelatedResult.data.issues.filter(i => i.kind === 'door_swing_collision');
  assert('door not in room_ids → no collision', unrelatedIssues.length === 0);

  // Severity escalation: 2 doors colliding → single 'ambiguous' issue
  const door2 = { id: 'sd2', midpoint: [3,6], width: 3, p1:[1.5,6], p2:[4.5,6], room_ids:['r6'] };
  const twoDoors = [swingDoor[0], door2];
  const twoDoorsResult = computeLayoutHints({ ...makeNormalized([room6]), doors: twoDoors });
  const swingIssues3 = twoDoorsResult.data.issues.filter(i => i.kind === 'door_swing_collision');
  assert('2 door collisions → single ambiguous issue', swingIssues3.length === 1 && swingIssues3[0].severity === 'ambiguous');
}

// ─── Phase 2B: Rule 7 — Adjacent label collision ─────────────────────────────
console.log('\nPhase 2B — Rule 7: adjacent label collision');
{
  // Two 4×4 rooms side by side — labels at ≈ (2,2) and (6,2), very close
  // Text "Room" at 14px: 4 chars * 14 * 0.55 = 30.8px = 3.08ft wide
  // bbox A: x=0.46..3.54, bbox B: x=4.46..7.54 — do NOT overlap (4.46 > 3.54)
  // Use smaller rooms to force overlap: rooms sharing a wall with labels at (2,2) and (4,2)
  const roomA = makeRoom('rA', 'BR', [[0,0],[4,0],[4,4],[0,4]], 16);
  const roomB = makeRoom('rB', 'BA', [[4,0],[8,0],[8,4],[4,4]], 16);
  // These rooms abut. polylabel puts labels at ~(2,2) and ~(6,2).
  // "BR" and "BA" at 14px: 2 chars → width = 2*14*0.55/10 = 1.54ft
  // bbox A: x=2-0.77=1.23 to 2+0.77=2.77; bbox B: x=6-0.77=5.23 to 6+0.77=6.77
  // 2.77 < 5.23 → no overlap (short abbreviations don't collide here)
  // Use rooms that genuinely share boundary and have overlapping labels:
  // Put them very close: a 2x2 room next to another 2x2 room
  const tinyA = makeRoom('tA', 'Bedroom 1', [[0,0],[2,0],[2,2],[0,2]], 4);
  const tinyB = makeRoom('tB', 'Bedroom 2', [[2,0],[4,0],[4,2],[2,2]], 4);
  // "Bedroom 1" and "Bedroom 2" → abbreviate to "BR1"/"BR2" (3 chars each)
  // width = 3*14*0.55/10 = 2.31ft; label at (1,1) for tinyA and (3,1) for tinyB
  // bboxA: x=1-1.155=-0.155 to 2.155; bboxB: x=3-1.155=1.845 to 4.155
  // 2.155 > 1.845 → OVERLAP ✓
  const adjPlan = makeNormalized([tinyA, tinyB]);
  const adjResult = computeLayoutHints(adjPlan);
  assert('adjacent rooms ok:true', adjResult.ok === true);
  const adjIssue = adjResult.data.issues.find(i => i.kind === 'adjacent_label_collision');
  assert('adjacent label collision detected', !!adjIssue);
  assert('adjacent_label_collision severity = ambiguous', adjIssue?.severity === 'ambiguous');

  // Well-separated rooms — no collision
  const roomC = makeRoom('rC', 'Kitchen', [[0,0],[10,0],[10,10],[0,10]], 100);
  const roomD = makeRoom('rD', 'Bathroom', [[30,0],[40,0],[40,10],[30,10]], 100);
  const sepResult = computeLayoutHints(makeNormalized([roomC, roomD]));
  const sepAdjIssues = sepResult.data.issues.filter(i => i.kind === 'adjacent_label_collision');
  assert('well-separated rooms → 0 adjacent_label_collision', sepAdjIssues.length === 0);
}

// ─── Phase 2B: Rule 8 — Hallway micro SF gate ────────────────────────────────
console.log('\nPhase 2B — Rule 8: hallway micro SF gate');
{
  // Micro hallway (type='Hallway', <30 sqft) → sf_text suppressed
  const microHall = makeRoom('mh1', 'Hall', [[0,0],[2,0],[2,9],[0,9]], 18, 'Hallway');
  const mhResult = computeLayoutHints(makeNormalized([microHall]));
  assert('micro hallway sf_text suppressed', mhResult.data.layout_hints['mh1'].sf_text === '');
  assert('micro hallway sf_inline_with_label = false', mhResult.data.layout_hints['mh1'].sf_inline_with_label === false);
  const suppIssue = mhResult.data.issues.find(i => i.kind === 'hallway_sf_suppressed');
  assert('hallway_sf_suppressed issue present', !!suppIssue);
  assert('hallway_sf_suppressed severity = info', suppIssue?.severity === 'info');

  // Large hallway (type='Hallway', >30 sqft) → SF shown normally
  const bigHall = makeRoom('bh1', 'Hallway', [[0,0],[4,0],[4,20],[0,20]], 80, 'Hallway');
  const bhResult = computeLayoutHints(makeNormalized([bigHall]));
  assert('large hallway sf_text populated', bhResult.data.layout_hints['bh1'].sf_text !== '');
  const noSuppIssue = bhResult.data.issues.find(i => i.kind === 'hallway_sf_suppressed');
  assert('large hallway → no hallway_sf_suppressed issue', !noSuppIssue);

  // Non-hallway micro room (type='Closet', 18 sqft) → SF still shown (inline per rule 4)
  const tinyCloset = makeRoom('tc1', 'Closet', [[0,0],[2,0],[2,9],[0,9]], 18, 'Closet');
  const tcResult = computeLayoutHints(makeNormalized([tinyCloset]));
  assert('tiny closet sf_text NOT suppressed', tcResult.data.layout_hints['tc1'].sf_text !== '');

  // Type variations — Corridor, Stairs, Landing all trigger suppression
  for (const [id, type] of [['mc', 'Corridor'], ['ms', 'Stairs'], ['ml', 'Landing']]) {
    const r = makeRoom(id, type, [[0,0],[1,0],[1,18],[0,18]], 18, type);
    const res = computeLayoutHints(makeNormalized([r]));
    assert(`${type} micro suppressed`, res.data.layout_hints[id].sf_text === '');
  }

  // Override threshold — 18sqft hallway with threshold=10 → NOT suppressed
  const microHall2 = makeRoom('mh2', 'Hallway', [[0,0],[2,0],[2,9],[0,9]], 18, 'Hallway');
  const mhOpt = computeLayoutHints(makeNormalized([microHall2]), { hallwayMicroThresholdSqft: 10 });
  assert('custom threshold=10 → 18sqft hallway not suppressed', mhOpt.data.layout_hints['mh2'].sf_text !== '');

  // Phase 2A regression — square kitchen still works correctly
  const kitResult = computeLayoutHints(makeNormalized([squareRoom]));
  assert('Phase 2A regression — square kitchen ok:true', kitResult.ok === true);
  assert('Phase 2A regression — label_x ≈ 5', approx(kitResult.data.layout_hints['r_square'].label_x, 5, 1));
}

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
