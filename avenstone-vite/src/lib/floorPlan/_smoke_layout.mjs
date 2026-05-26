// Smoke test for layoutCheck.js — Phase 2A rules engine
// Run from repo root: node avenstone-vite/src/lib/floorPlan/_smoke_layout.mjs

import {
  computeLayoutHints,
  computeLabelPosition,
  abbreviateRoomName,
  computeLabelRotation,
  computeSfBadgePosition,
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

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
