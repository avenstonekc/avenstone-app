-- ANTI_SURPRISE_ENGINE_ARC Phase 1 — Knowledge layer
-- tenant_playbook_items: tenant-defined trade walkthrough checklists.
-- This is the DEFINITION layer (what to capture per trade).
-- Separate from site_visit_checklist_items (per-job EXECUTION layer linked to schedule_items).
-- Generation event copies definition rows into site_visit_checklist_items at walkthrough time.

-- ── Schema ────────────────────────────────────────────────────────────────────

CREATE TABLE tenant_playbook_items (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id),
  work_type      TEXT        NOT NULL,  -- canonical trade name; matches estimate_line_items.trade
  label          TEXT        NOT NULL,
  photo_required BOOLEAN     NOT NULL DEFAULT false,
  must_document  BOOLEAN     NOT NULL DEFAULT false,
  sort_order     INT         NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tpi_tenant_work_type ON tenant_playbook_items (tenant_id, work_type);
CREATE INDEX idx_tpi_must_document    ON tenant_playbook_items (tenant_id) WHERE must_document = true;

ALTER TABLE tenant_playbook_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY tpi_select ON tenant_playbook_items
  FOR SELECT USING (tenant_id = get_my_tenant_id());

CREATE POLICY tpi_insert ON tenant_playbook_items
  FOR INSERT WITH CHECK (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager')
  );

CREATE POLICY tpi_update ON tenant_playbook_items
  FOR UPDATE USING (
    tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager')
  );

-- ── Avenstone seed ────────────────────────────────────────────────────────────
-- work_type values mirror the canonical trade strings used in estimate_line_items and
-- trade_phase_map so the generator can match on keyword overlap.
-- photo_required=TRUE: visual evidence expected at this check.
-- must_document=TRUE: captures that protect the company (structural, code, legal).

DO $seed$
DECLARE v_t UUID := '00000000-0000-0000-0000-000000000001';
BEGIN

-- ── Plumbing - Rough-in ───────────────────────────────────────────────────────
INSERT INTO tenant_playbook_items (tenant_id, work_type, label, photo_required, must_document, sort_order) VALUES
  (v_t, 'Plumbing - Rough-in', 'Supply lines run per plan locations',                        false, false, 10),
  (v_t, 'Plumbing - Rough-in', 'DWV stack properly pitched (1/4" per foot minimum)',          false, true,  20),
  (v_t, 'Plumbing - Rough-in', 'All vent stacks penetrate roof or connect to AAV',            false, false, 30),
  (v_t, 'Plumbing - Rough-in', 'Cleanouts accessible and capped',                             false, false, 40),
  (v_t, 'Plumbing - Rough-in', 'Pipe sizing verified per code',                               false, true,  50),
  (v_t, 'Plumbing - Rough-in', 'All hangers and supports installed at correct intervals',      false, false, 60),
  (v_t, 'Plumbing - Rough-in', 'Pressure test complete and holding',                          true,  true,  70),
  (v_t, 'Plumbing - Rough-in', 'Tub/shower drain pan and drain set at correct height',        true,  false, 80),
  (v_t, 'Plumbing - Rough-in', 'Water heater rough connections stubbed and capped',           false, false, 90),
  (v_t, 'Plumbing - Rough-in', 'No pipes through structural members without sleeves',         true,  true,  100);

-- ── Framing ───────────────────────────────────────────────────────────────────
INSERT INTO tenant_playbook_items (tenant_id, work_type, label, photo_required, must_document, sort_order) VALUES
  (v_t, 'Framing', 'All walls plumb and square',                                              false, false, 10),
  (v_t, 'Framing', 'Headers sized correctly per span',                                        false, true,  20),
  (v_t, 'Framing', 'Joist hangers and metal connectors installed per plan',                   true,  true,  30),
  (v_t, 'Framing', 'Stud spacing correct (16" or 24" OC per spec)',                           false, false, 40),
  (v_t, 'Framing', 'Blocking installed at shear walls and mid-height',                        false, true,  50),
  (v_t, 'Framing', 'Sheathing nailed off per spec',                                           false, false, 60),
  (v_t, 'Framing', 'All window and door frames square, level, and braced',                    false, false, 70),
  (v_t, 'Framing', 'Fire blocking installed at penetrations and mid-height walls',             true,  true,  80),
  (v_t, 'Framing', 'Backing blocks installed for fixtures (grab bars, cabinets)',              false, false, 90),
  (v_t, 'Framing', 'Stair stringers secure and nosing locations confirmed',                   false, false, 100);

-- ── Electrical - Rough-in ─────────────────────────────────────────────────────
INSERT INTO tenant_playbook_items (tenant_id, work_type, label, photo_required, must_document, sort_order) VALUES
  (v_t, 'Electrical - Rough-in', 'All electrical boxes installed at correct heights',         false, false, 10),
  (v_t, 'Electrical - Rough-in', 'Romex/MC secured every 4.5 ft and within 12" of boxes',    false, true,  20),
  (v_t, 'Electrical - Rough-in', 'Panel location confirmed, main breaker sized correctly',    true,  true,  30),
  (v_t, 'Electrical - Rough-in', 'GFCI protection circuits identified and routed',            false, true,  40),
  (v_t, 'Electrical - Rough-in', 'Smoke and CO detector locations per code',                  false, true,  50),
  (v_t, 'Electrical - Rough-in', 'Bathroom exhaust fan circuits run and boxes set',           false, false, 60),
  (v_t, 'Electrical - Rough-in', 'Wire sizing matches circuit ampacity',                      false, true,  70),
  (v_t, 'Electrical - Rough-in', 'Bonding conductor on all metal water pipes',                false, true,  80),
  (v_t, 'Electrical - Rough-in', 'All junction boxes accessible (not buried in wall)',        false, true,  90),
  (v_t, 'Electrical - Rough-in', 'Service entry clearances maintained',                      false, true,  100);

-- ── HVAC - Install ────────────────────────────────────────────────────────────
INSERT INTO tenant_playbook_items (tenant_id, work_type, label, photo_required, must_document, sort_order) VALUES
  (v_t, 'HVAC - Install', 'Equipment location confirmed and accessible for service',          true,  false, 10),
  (v_t, 'HVAC - Install', 'Ductwork sized per load calc or design',                           false, false, 20),
  (v_t, 'HVAC - Install', 'All duct joints sealed with mastic or foil tape',                  false, true,  30),
  (v_t, 'HVAC - Install', 'Supply and return registers located per plan',                     false, false, 40),
  (v_t, 'HVAC - Install', 'Refrigerant lines properly supported and insulated',               false, false, 50),
  (v_t, 'HVAC - Install', 'Condensate drain properly pitched and connected',                  false, true,  60),
  (v_t, 'HVAC - Install', 'Equipment electrical disconnect within sight of unit',             false, true,  70),
  (v_t, 'HVAC - Install', 'Filter access location and size confirmed',                        false, false, 80),
  (v_t, 'HVAC - Install', 'Attic/crawl penetrations fire-stopped and weather-sealed',         true,  true,  90),
  (v_t, 'HVAC - Install', 'Test run: system heats and cools to setpoint',                     false, true,  100);

-- ── Drywall - Hang ────────────────────────────────────────────────────────────
INSERT INTO tenant_playbook_items (tenant_id, work_type, label, photo_required, must_document, sort_order) VALUES
  (v_t, 'Drywall - Hang', 'All rough-ins inspected and complete before closing',              true,  true,  10),
  (v_t, 'Drywall - Hang', 'Moisture barrier installed where required',                        false, true,  20),
  (v_t, 'Drywall - Hang', 'Drywall type correct for location (moisture-resistant in wet areas)', false, true, 30),
  (v_t, 'Drywall - Hang', 'All seams backed by framing or blocking',                          false, false, 40),
  (v_t, 'Drywall - Hang', 'Screws/nails dimpled, not through paper face',                     false, false, 50),
  (v_t, 'Drywall - Hang', 'No cracks or fractures in panels',                                 false, false, 60),
  (v_t, 'Drywall - Hang', 'Outlet and switch boxes flush or slightly proud',                  false, false, 70),
  (v_t, 'Drywall - Hang', 'Corner bead installed and secure on all outside corners',          false, false, 80),
  (v_t, 'Drywall - Hang', 'Ceiling panels fully fastened and supported at joints',            false, false, 90),
  (v_t, 'Drywall - Hang', 'Fire-rated assemblies and attic access maintained',                true,  true,  100);

-- ── Demo ──────────────────────────────────────────────────────────────────────
INSERT INTO tenant_playbook_items (tenant_id, work_type, label, photo_required, must_document, sort_order) VALUES
  (v_t, 'Demo', 'All demo per scope — no over-demolition',                                    true,  true,  10),
  (v_t, 'Demo', 'Structural members untouched unless explicitly in scope',                    true,  true,  20),
  (v_t, 'Demo', 'Lead and asbestos abatement complete (certifications on file)',              false, true,  30),
  (v_t, 'Demo', 'All debris hauled from site',                                                true,  false, 40),
  (v_t, 'Demo', 'Existing utilities capped and tagged (plumbing, gas, electric)',              true,  true,  50),
  (v_t, 'Demo', 'Subfloor condition documented for client sign-off',                          true,  true,  60),
  (v_t, 'Demo', 'Hidden conditions (rot, mold, pest damage) photographed and reported',      true,  true,  70);

-- ── Paint - Interior ──────────────────────────────────────────────────────────
INSERT INTO tenant_playbook_items (tenant_id, work_type, label, photo_required, must_document, sort_order) VALUES
  (v_t, 'Paint - Interior', 'All surfaces primed before finish coats',                        false, false, 10),
  (v_t, 'Paint - Interior', 'Correct sheen per room (flat ceiling, eggshell wall, semi-gloss trim)', false, false, 20),
  (v_t, 'Paint - Interior', 'Cut lines clean at ceiling, trim, and cabinetry',                false, false, 30),
  (v_t, 'Paint - Interior', 'No roller marks, brush strokes, or lap lines in raking light',   false, false, 40),
  (v_t, 'Paint - Interior', 'All outlets/switches re-covered and paint-free',                 false, false, 50),
  (v_t, 'Paint - Interior', 'Doors and windows painted both sides and edges',                 false, false, 60),
  (v_t, 'Paint - Interior', 'Touch-ups to baseboards and door frames complete',               false, false, 70),
  (v_t, 'Paint - Interior', 'Floor protection removed — no paint on floors or hardware',      false, true,  80);

-- ── Tile - Floor ──────────────────────────────────────────────────────────────
INSERT INTO tenant_playbook_items (tenant_id, work_type, label, photo_required, must_document, sort_order) VALUES
  (v_t, 'Tile - Floor', 'Substrate flat within 3/16" over 10 ft (straightedge check)',        false, true,  10),
  (v_t, 'Tile - Floor', 'Crack isolation or uncoupling membrane installed',                   true,  true,  20),
  (v_t, 'Tile - Floor', 'Tile layout centered and balanced (no slivers at walls)',             false, false, 30),
  (v_t, 'Tile - Floor', 'All tiles fully adhered — no hollow spots (tap test)',               false, true,  40),
  (v_t, 'Tile - Floor', 'Grout joints consistent and per spec',                               false, false, 50),
  (v_t, 'Tile - Floor', 'Transition strips set at material changes',                          false, false, 60),
  (v_t, 'Tile - Floor', 'Tile cut cleanly at walls (no jagged cuts)',                         false, false, 70),
  (v_t, 'Tile - Floor', 'Perimeter and field expansion joints maintained',                    false, true,  80);

-- ── Tile - Wall / shower ──────────────────────────────────────────────────────
INSERT INTO tenant_playbook_items (tenant_id, work_type, label, photo_required, must_document, sort_order) VALUES
  (v_t, 'Tile - Wall / shower', 'Waterproof membrane complete and cured',                     true,  true,  10),
  (v_t, 'Tile - Wall / shower', 'Niche backing and corners waterproofed',                     true,  true,  20),
  (v_t, 'Tile - Wall / shower', 'Layout level and plumb from datum',                          false, false, 30),
  (v_t, 'Tile - Wall / shower', 'All wall tiles fully adhered — no hollow spots',             false, true,  40),
  (v_t, 'Tile - Wall / shower', 'Grout joints consistent and color per spec',                 false, false, 50),
  (v_t, 'Tile - Wall / shower', 'Shower floor pitch correct toward drain (1/4" per foot)',    false, true,  60),
  (v_t, 'Tile - Wall / shower', 'Drain collar flush with tile surface',                       true,  true,  70),
  (v_t, 'Tile - Wall / shower', 'Caulk at all changes of plane (corners, floor-to-wall, niche edges)', false, true, 80);

-- ── Cabinets / vanities - Install ────────────────────────────────────────────
INSERT INTO tenant_playbook_items (tenant_id, work_type, label, photo_required, must_document, sort_order) VALUES
  (v_t, 'Cabinets / vanities - Install', 'All base cabinets level and plumb',                 false, false, 10),
  (v_t, 'Cabinets / vanities - Install', 'All upper cabinets secured to studs',               false, true,  20),
  (v_t, 'Cabinets / vanities - Install', 'Drawer slides operate smoothly and fully extend',   false, false, 30),
  (v_t, 'Cabinets / vanities - Install', 'All doors hang level with consistent reveal',       false, false, 40),
  (v_t, 'Cabinets / vanities - Install', 'Cabinet interiors clean and free of debris',        false, false, 50),
  (v_t, 'Cabinets / vanities - Install', 'Countertop support blocking or ledger installed',   false, false, 60),
  (v_t, 'Cabinets / vanities - Install', 'Scribe molding or filler strips cover gaps at walls', false, false, 70),
  (v_t, 'Cabinets / vanities - Install', 'Hardware locations confirmed before drilling',       false, false, 80);

END $seed$;
