-- SCOPE_RISK B2.4 — scope-risk knowledge library.
-- The curated "here's what commonly comes up once we open the wall" source. Keyed to the
-- EXISTING taxonomy (project_type + optional scope_checklists.field_key + optional
-- trade_taxonomy full-path) — never a parallel taxonomy. Platform defaults tenant_id NULL,
-- tenant overrides per the scope_checklists pattern (sc_select / owner-write).
--
-- AUDIT NOTE (2026-07-18): the plan row said "extend tenant_playbook_items with
-- is_scope_risk" — but that table is a photo/documentation checklist with no risk fields,
-- and scope_checklists.risk_note is internal estimator metadata (not client-facing). So this
-- is a NEW library, per Kalin's confirmation. Reuses oh_shit_moments as the job-scoped kept
-- store (B2.5); the proposal "Potential Considerations" section (B2.6) is a reframe.
--
-- trigger_type:
--   'project' — applies to any job of this project_type (field_key/trade NULL)
--   'answer'  — fires when the job's answer for field_key is IN trigger_values
--   'trade'   — fires when `trade` is in the job's in-scope trades
-- consideration = CLIENT-facing plain-language heads-up (trust-building, not alarm/legal).
-- cost_low/high = optional "if encountered" range; whether it shows on the client proposal
-- is decided at the B2.6 wording review, not here. ALL seed rows is_draft=true — Kalin
-- corrects CONTENT, not schema. Cost line: zero model calls (seed + deterministic match).

CREATE TABLE IF NOT EXISTS scope_risks (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID,                       -- NULL = platform default
  project_type   TEXT        NOT NULL,
  field_key      TEXT,                       -- optional; for trigger_type='answer'
  trade          TEXT,                       -- optional; trade_taxonomy full-path
  risk_key       TEXT        NOT NULL,
  trigger_type   TEXT        NOT NULL DEFAULT 'project' CHECK (trigger_type IN ('project','answer','trade')),
  trigger_values TEXT[]      NOT NULL DEFAULT '{}',
  consideration  TEXT        NOT NULL,
  likelihood     TEXT        NOT NULL DEFAULT 'medium' CHECK (likelihood IN ('low','medium','high')),
  cost_low       NUMERIC,
  cost_high      NUMERIC,
  internal_note  TEXT,
  is_draft       BOOLEAN     NOT NULL DEFAULT true,
  active         BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_scope_risks_key ON scope_risks (tenant_id, risk_key) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS idx_scope_risks_lookup ON scope_risks (project_type, active);

ALTER TABLE scope_risks ENABLE ROW LEVEL SECURITY;

CREATE POLICY sr_select ON scope_risks FOR SELECT
  USING (tenant_id = get_my_tenant_id() OR tenant_id IS NULL);
CREATE POLICY sr_write ON scope_risks FOR ALL
  USING (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner')
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() = 'owner');

-- ── Draft platform seed (tenant_id NULL, is_draft=true) ──────────────────────────────────
INSERT INTO scope_risks (project_type, field_key, trade, risk_key, trigger_type, trigger_values, consideration, likelihood, cost_low, cost_high, internal_note) VALUES
-- bathroom
('bathroom','existing_wall_finish',NULL,'bath_moisture_behind_tile','answer','{tile}',
 'Once the existing wall tile comes down, we occasionally find moisture damage or mold on the backer board or studs behind it — most common around tubs and showers. If we do, repairing it keeps your new tile from failing early.','medium',400,1500,'Water damage behind tile is common on older wet walls.'),
('bathroom','existing_floor_finish',NULL,'bath_subfloor_rot','answer','{tile,vinyl_lvp,other}',
 'When we pull up the existing bathroom floor we sometimes find a soft or water-damaged subfloor, usually near the toilet or tub. If it needs replacing, we address it so the new floor sits solid.','medium',300,1200,'Toilet-flange leaks rot the subfloor.'),
('bathroom',NULL,NULL,'bath_old_drain_lines','project','{}',
 'In older homes we sometimes find aging cast-iron or galvanized drain lines behind the wall. If they''re corroded, replacing the affected section now avoids a leak down the road.','low',350,1200,'Common pre-1970 homes.'),
('bathroom',NULL,NULL,'bath_venting','project','{}',
 'If the bathroom doesn''t currently vent to the outside, we''ll add proper exhaust venting to protect your new finishes from moisture — it''s good practice and often required by code.','low',150,500,'Missing/into-attic fan venting.'),
-- kitchen
('kitchen','elec_panel',NULL,'kitchen_panel_capacity','answer','{full,unknown}',
 'Kitchens add a lot of electrical load — appliances, lighting, and dedicated small-appliance circuits. If the existing panel is full or near capacity, we may need to add a subpanel or free up space to bring things up to code.','medium',500,2000,'Full/unknown panel on a kitchen remodel.'),
('kitchen','existing_flooring',NULL,'kitchen_subfloor','answer','{tile,vinyl_lvp,other}',
 'Removing the existing kitchen floor occasionally reveals an uneven or damaged subfloor, especially near the sink and dishwasher. Leveling or repairing it gives the new floor a solid, lasting base.','medium',300,1200,'Slow leaks under sink/DW.'),
('kitchen',NULL,NULL,'kitchen_plumbing_relocation','project','{}',
 'If the new layout moves the sink or appliances, the existing supply and drain lines may need to be relocated — sometimes what''s behind the wall or under the floor makes that more involved than it looks.','medium',400,1800,'Layout change → plumbing moves.'),
-- basement
('basement',NULL,NULL,'basement_moisture','project','{}',
 'Before finishing a basement we look closely for any signs of moisture or seepage. If the space shows water intrusion, we''ll flag it and address it before framing — it protects everything we build on top.','medium',500,3000,'Seepage/efflorescence check pre-frame.'),
('basement',NULL,NULL,'basement_egress','project','{}',
 'If the plan includes a bedroom, code requires an egress window and well for safe exit. If one isn''t already there, adding it is a meaningful part of the work.','medium',2000,5000,'Egress for a conforming bedroom.'),
('basement','elec_panel',NULL,'basement_panel_capacity','answer','{full,unknown}',
 'Finishing a basement adds circuits for lighting, outlets, and possibly a bathroom. If the panel is full, we may need to add capacity.','medium',400,1500,'Full/unknown panel.'),
-- addition
('addition','foundation',NULL,'addition_foundation_unknowns','answer','{crawl,pier}',
 'Tying a new addition into an existing crawl or pier foundation can uncover grade, drainage, or footing conditions we can''t fully see until we dig. We''ll keep you posted if the site calls for extra footing work.','medium',1000,4000,'Below-grade unknowns at tie-in.'),
('addition','elec_panel',NULL,'addition_panel_capacity','answer','{full,unknown}',
 'An addition adds electrical load; if the existing panel is full, a subpanel or a service upgrade may be needed to carry it.','medium',600,2500,'Full/unknown panel.'),
-- exterior / roof
('exterior','sheathing_condition',NULL,'exterior_sheathing_rot','answer','{unknown,known_spots}',
 'Once the siding is off, we sometimes find rotted sheathing or moisture damage underneath — most often at corners and around windows. Replacing the affected areas keeps the new siding sound.','medium',400,2000,'Hidden sheathing rot.'),
('roof',NULL,NULL,'roof_deck_rot','project','{}',
 'After tear-off we inspect the roof decking. Occasionally we find soft or rotted decking that isn''t visible from the surface; replacing those sheets gives the new roof a solid base.','medium',300,1500,'Decking rot found at tear-off.'),
('roof','layers',NULL,'roof_multiple_layers','answer','{two_plus,unknown}',
 'If there''s more than one existing layer of roofing, a full tear-off adds disposal and labor. We confirm the number of layers before finalizing.','medium',300,1200,'2+/unknown layers.'),
-- deck / gut
('deck',NULL,NULL,'deck_footings','project','{}',
 'Deck footings need to reach below the frost line for stability. Soil and buried conditions can occasionally call for deeper or additional footings than planned.','low',200,900,'Frost-depth / buried obstructions.'),
('gut',NULL,NULL,'gut_systems_condition','project','{}',
 'A full gut usually exposes the true condition of the wiring, plumbing, and framing behind the walls. We''ll document what we find and talk through anything worth updating while everything is open.','high',NULL,NULL,'Broad systems-condition disclosure.')
ON CONFLICT (tenant_id, risk_key) DO NOTHING;
