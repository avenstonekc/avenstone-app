# SCOPE_TO_ESTIMATE — Blueprint (locked 2026-07-11)

## Thesis
One answer store serves four consumers: interview persistence (SCE P2),
photo intake (SCE P3), SELECTIONS (client soft-pick → PM confirm), and
SUB_WORK_PACKET. Ground truth: the 2026-07-11 audit (interview answers
currently discarded at EstimateTab.jsx:389-393; no room dimension; no
selections table; triggers fire on rep text only).

## Locked decisions
1. ONE TABLE (job_scope_answers), audit-proposed shape adopted as-is —
   including UNIQUE (tenant_id, job_id, room_id, field_key) NULLS NOT
   DISTINCT, source vocab + client_selected, status proposed|confirmed
   orthogonal to source (rate-book lesson), trade resolved per-answer,
   job_id TEXT (legacy). The flagged risk (selections needing SKU/qty/
   price) is resolved by boundary, not a second table: the answer
   records WHAT was chosen (option_key); pricing/quantity implications
   live on estimates and change orders. Material-depth catalogs
   (specific quartz SKUs, paint colors) arrive later as a SELECTIONS-arc
   catalog table that option_key references — answer store unchanged.
2. job_rooms ships day one, audit shape, decoupled from scans
   (source typed|scan, scan_room_id nullable bridge to job_room_scopes).
   Interview default: auto-create one room per project_type interview
   (label = project type, e.g. "Bathroom") — multi-room granularity is
   a later refinement, the schema supports it from birth.
3. RE-TRIGGER PASS designed in: after answers upsert, detectTriggers
   runs over stringified answer values + option labels, unioned with
   rep text — closes the audit's Q3 gap (measured/card/extracted
   answers currently can't fire modules).
4. RLS: catalog pattern for reads (tenant OR NULL), job_notes pattern
   for client writes. Client INSERT forced to source='client_selected'
   + status='proposed'; NO client UPDATE on confirmed rows; PM/staff
   confirm flips status + confirmed_by/at. Vet-gate at the database.
5. LIFECYCLE HOOK: selections window opens where Contract→complete
   lands in record-signature-evidence (audit Q7), same failure-
   isolation doctrine.
6. ANSWER↔LINE-ITEM LINK: nullable room_id + scope_field_key on
   estimate_line_items, added in Phase D (packet needs it for change
   propagation); Phases A-C derive via adds_trades only.

## Phases (each audit-first if it touches unaudited surface)
- A. Foundation (~3 prompts): job_rooms + job_scope_answers migrations;
  persist data.answers at EstimateTab:389 (upsert, staff path); default
  room creation; re-trigger pass. Ships value alone: answers stop
  evaporating.
- B. Read-back pre-fill (~2): interview start/resume loads confirmed+
  proposed answers into preAnswered (extends the session-prefill path,
  ai-estimator:281-287); absorbs the resume-cards wrinkle.
- C. SELECTIONS (~4-6): lifecycle event + selections_opened stamp; net-
  new client portal tab (BASE_CLIENT_TABS) rendering choice fields as
  option cards (reuse ScopeOptionCards + scope_option_images); client
  soft-pick writes; PM confirm surface + "N of M locked" gate on Demo.
  Day-one trades: tile, flooring, cabinets/counters, fixtures/finishes,
  paint (owner-locked).
- D. SUB_WORK_PACKET (~4-5): trade_taxonomy expansion (Siding/Deck/
  Fence/Gutter/Window — prereq); per-answer trade derivation; line-item
  link columns; packet assembly (confirmed answers × room × trade ×
  bound image) → pdf-lib per-sub sheet; regenerate-on-change.
- E. CLIENT_VISION_RENDER: per its parked stub; consumes this store +
  SCE P3 photos. Not scheduled here.

## Rules
- SCE and ESTIMATOR arcs must not touch the (job, room, field, option)
  tuple semantics without a note here. The store is the seam contract.
- Nothing renders to clients from status='proposed' except their own
  pending picks.
