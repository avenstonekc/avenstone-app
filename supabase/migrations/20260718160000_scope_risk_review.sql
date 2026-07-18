-- SCOPE_RISK B2.5 — estimator suggests risks; rep reviews before draft.
-- (1) scope_risks.title: a short heading for the risk ("Moisture behind existing tile").
--     The `consideration` stays the client-facing sentence; title renders as the heading
--     on the review card + the reframed proposal section (B2.6).
-- (2) oh_shit_moments.risk_key: tracks a kept risk's library origin so re-assembling
--     candidates dedups (a library risk already kept won't reappear as a fresh candidate).
--     Consultation-origin rows leave it NULL. Session risk-flag keeps use 'flag:<slug>'.
-- Cost line: zero model calls — B2.5 assembly is deterministic (library match + session flags).

ALTER TABLE scope_risks ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE oh_shit_moments ADD COLUMN IF NOT EXISTS risk_key TEXT;

UPDATE scope_risks SET title = CASE risk_key
  WHEN 'bath_moisture_behind_tile'     THEN 'Moisture behind existing tile'
  WHEN 'bath_subfloor_rot'             THEN 'Subfloor condition under the floor'
  WHEN 'bath_old_drain_lines'          THEN 'Aging drain lines'
  WHEN 'bath_venting'                  THEN 'Bathroom exhaust venting'
  WHEN 'kitchen_panel_capacity'        THEN 'Electrical panel capacity'
  WHEN 'kitchen_subfloor'              THEN 'Subfloor condition under the floor'
  WHEN 'kitchen_plumbing_relocation'   THEN 'Plumbing relocation'
  WHEN 'basement_moisture'             THEN 'Basement moisture'
  WHEN 'basement_egress'               THEN 'Egress window for a bedroom'
  WHEN 'basement_panel_capacity'       THEN 'Electrical panel capacity'
  WHEN 'addition_foundation_unknowns'  THEN 'Foundation tie-in conditions'
  WHEN 'addition_panel_capacity'       THEN 'Electrical panel capacity'
  WHEN 'exterior_sheathing_rot'        THEN 'Sheathing condition behind siding'
  WHEN 'roof_deck_rot'                 THEN 'Roof decking condition'
  WHEN 'roof_multiple_layers'          THEN 'Existing roofing layers'
  WHEN 'deck_footings'                 THEN 'Deck footing depth'
  WHEN 'gut_systems_condition'         THEN 'Condition of systems behind walls'
  ELSE title END
WHERE tenant_id IS NULL;
