# EXECUTION_ARC.md

*Living design doc. Update as decisions are made. Built 2026-05-06.*

## 1. Why

The platform now has invoicing (financial flow), sub engagement (relationships, bids with line items, availability), and takeoff (materials and labor enumerated per trade). What's missing is the EXECUTION layer — how a project actually moves from "estimate accepted" to "complete" without surprises.

Today the PM is the integration layer. They mentally track which trades need bids, which materials are quoted, when subs can start, what materials need to arrive before each sub starts, who needs to be notified about what, what to check on each walkthrough, whether codes are being followed.

Surprises happen because the PM is the only system holding all that context. Lumber arrives the day framing was supposed to start. Inspectors fail rough-ins because no one measured the toilet flange. Subs show up without materials. Clients are blindsided by delays.

This arc builds the **Anti-Surprise Engine** explicitly: phases drive todos, todos drive PM actions, actions trigger schedule items and notifications, sequences notify the right people, walkthroughs run off code-aware checklists, and actuals feed back into the catalog so estimates get more accurate over time.

## 2. Current state

- **Takeoff wizard**: bathroom scope detail forms; labor + material lines written to `estimate_line_items` per trade per room. Custom lines, per-line exclude, PENDING-rate flagging.
- **Sub engagement state machine**: invited → bid_submitted → active → completed plus terminal off-ramps. Bids include line items as of today.
- **Schedule items**: `material_delivery`, `sub_start`, `site_visit`, `inspection`, `milestone`, `delay` types. `notify_client` already on the row.
- **Sequences engine**: manual + auto-trigger enrollment, SMS + email to subs/contacts/clients. Triggers wired today: `bid_sent`, `sub_invited`, `payment_made`, `sub_inactive_60d`, manual variants.
- **Phase system**: `job_phases` tracks phases per job. `derivePhaseStatus` advances off `schedule_items` completion via `trade_phase_map`. Idempotent, never decrements.
- **Todos**: `todos` table; TodayScr; ai-pm-nightly first writer; Resume flow.
- **Invoicing**: full arc shipped end-to-end.
- **Tenant override pattern on rates**: rep-entered rates beat platform defaults on `takeoff_unit_costs`. Foundation for the learning loop.

## 3. The model — Anti-Surprise Engine

The PM does the human work (sourcing quotes, picking subs, negotiating dates, doing walkthroughs). The system does the mechanical work (creating schedule items from data already entered, firing notifications on state changes, surfacing todos for the next required action, running checklists on walkthroughs).

```
JOB CREATED
   │
   ▼
PHASE: REVIEW ──── todos: schedule consultation, capture scan
   │
   ▼ (consultation logged + scope tagged)
PHASE: PROPOSAL ─── todos per trade: send bid invitation, get material quote
                  └─ todos: build proposal, send to client
   │
   ▼ (proposal accepted)
PHASE: CONTRACT ──── todos: send contract, collect signed contract, send deposit invoice
   │
   ▼ (deposit paid)
PHASE: IN PROGRESS ── per trade where bid accepted + material quoted:
                    ├─ AUTO-CREATE: material_delivery (quoted_delivery_date)
                    ├─ AUTO-CREATE: sub_start (sub's earliest_start_date)
                    └─ Sequences fire on state changes
   │             walkthroughs scheduled per trade run off code-aware checklists
   │
   ▼ (last sub off site)
PHASE: FINAL TOUCHES ──── todos: schedule walkthrough w/ client, build punch list, send final invoice
   │
   ▼ (final invoice paid)
PHASE: COMPLETE ──── archive
```

## 4. Schema additions

### `engagement_bids` (Phase 1)

```sql
ALTER TABLE engagement_bids
  ADD COLUMN IF NOT EXISTS earliest_start_date DATE,
  ADD COLUMN IF NOT EXISTS availability_notes TEXT;
```

### `material_orders` (Phase 2)

```sql
CREATE TABLE material_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  trade TEXT NOT NULL,
  line_item_ids UUID[] NOT NULL,
  materials JSONB NOT NULL DEFAULT '[]',
  supplier_name TEXT,
  quote_total NUMERIC,
  quoted_delivery_date DATE,
  actual_delivery_date DATE,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'quoted', 'ordered', 'delivered', 'installed', 'cancelled')),
  notes TEXT,
  created_by_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_material_orders_job ON material_orders (job_id);
CREATE INDEX idx_material_orders_tenant_status ON material_orders (tenant_id, status);
```

Lifecycle: planned → quoted → ordered → delivered → installed. Cancelled is terminal off-ramp.

### `schedule_items` extension (Phase 7)

```sql
ALTER TABLE schedule_items
  ADD COLUMN IF NOT EXISTS notify_sub BOOLEAN NOT NULL DEFAULT false;
```

(`notify_client` already exists. Adding the parallel sub flag.)

### Phase-driven todo rules (Phase 5, JS config)

Hardcoded in `src/lib/phaseTodoRules.js`:

- `review`: schedule_consultation, capture_scan
- `proposal`: per-trade bid_invitation + material_quote, build_proposal, send_proposal
- `contract`: send_contract, collect_signed, send_deposit_invoice, collect_deposit
- `in_progress`: per-trade confirm_delivery, confirm_start
- `final_touches`: schedule_walkthrough, build_punch_list, send_final_invoice
- `complete`: none (archived)

Each rule has `resolveOn` field tied to a state event. Auto-resolution wired in helpers.

### `inspection_checklist_templates` + `job_inspection_checklists` (Phase 8)

```sql
CREATE TABLE inspection_checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  trade TEXT NOT NULL,
  phase TEXT NOT NULL,
  title TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE job_inspection_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  schedule_item_id UUID REFERENCES schedule_items(id) ON DELETE SET NULL,
  template_id UUID REFERENCES inspection_checklist_templates(id),
  trade TEXT NOT NULL,
  phase TEXT NOT NULL,
  items JSONB NOT NULL,
  completed_at TIMESTAMPTZ,
  completed_by_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Template item shape: `{ id, label, code_reference?, severity ('must'|'should'), measurement_required (bool), photo_required (bool) }`

Job checklist item shape: `{ id, status ('pass'|'fail'|'skip'), measurement_value?, photo_url?, notes? }`

## 5. State machines

### Material order lifecycle

```
planned → quoted → ordered → delivered → installed (terminal)
                                       └─ cancelled (terminal off-ramp from any non-installed state)
```

### Phase advancement (mechanical with manual override)

| From | To | Required data | Manual override |
|---|---|---|---|
| review | proposal | scope tagged on at least one room AND consultation logged | yes |
| proposal | contract | proposal status = 'accepted' | yes |
| contract | in_progress | contract signed AND deposit invoice paid | yes (rare) |
| in_progress | final_touches | all `sub_start` items have status='complete' | yes |
| final_touches | complete | final invoice paid AND no open todos | yes |

Manual override logs reason on the phase advance audit trail.

### Inspection item status

```
pending → pass | fail | skip
fail → creates follow-up todo
```

## 6. UI map

- **Materials sub-tab on JobDet** — lists material orders per trade. Add Quote modal creates `material_orders` row. Status pill, Mark Delivered action.
- **Bid form (sub-side EngagementDetailModal)** — `earliest_start_date` + `availability_notes` fields.
- **Bid display (PM-side SubsTab Engagements)** — shows price + start date + availability alongside line items.
- **Today screen** — phase-driven todos grouped by job, ordered by phase.
- **Walkthrough mode (mobile-first)** — opens from a `site_visit` schedule item. Runs the inspection checklist with pass/fail/skip + measurements + photos.
- **Schedule item creation modal** — `notify_sub` and `notify_client` checkboxes; defaults vary by item type per audience config.

## 7. 3-sided trigger audience defaults

| Trigger | Sub default | Client default | Toggleable |
|---|---|---|---|
| `bid_sent` | the sub: ON | OFF | no |
| `bid_received` | (PM only) | OFF | no |
| `engagement_active` | the sub: ON | OFF | no |
| `material_quoted` | OFF | OFF | no (PM internal) |
| `material_ordered` | OFF | OFF | no (PM internal) |
| `material_delivered` | assigned sub: ON | ON | yes |
| `sub_start_3_days` | the sub: ON | ON | yes |
| `sub_start_today` | the sub: ON | ON | yes |
| `site_visit_scheduled` | sub if assigned: ON | OFF | yes |
| `walkthrough_today` | sub if assigned: ON | per `notify_client` | yes |
| `delay_risk_no_materials` | OFF | OFF | yes (PM alert) |
| `phase_advanced` | OFF | per phase | yes |
| `invoice_sent` | OFF | ON | no |
| `payment_received` | OFF | ON | no |

PM is always notified in-app; SMS/email only when PM opts in.

## 8. Site visit checklist starter set

Hardcoded templates seeded for v1:

- **Plumbing rough-in**: toilet flange measurement (12" min from wall), shower drain location, P-traps installed, water lines pressure tested, pipe slope on drains, vent stack height
- **Framing**: joist spacing 16" OC, wall studs 16" OC, headers above openings, fire blocking, double top plates, hurricane straps
- **Electrical rough-in**: breaker count matches plan, GFCI in wet locations, AFCI in living areas, junction boxes accessible, wire gauge correct for amperage
- **Drywall**: no gaps at corners, screw spacing 16" max, mud joints smooth, taped seams, sanding even
- **Finals (final_touches phase)**: all fixtures installed, paint touch-ups complete, hardware secure, GFCI tests pass, walk-through punch list

Stored as JSONB rows in `inspection_checklist_templates` with `tenant_id IS NULL` (platform defaults). Tenants copy + edit, or add their own.

## 9. Phased rollout

**Phase 1 — Bid availability fields.** ALTER `engagement_bids`. Sub-side bid form gets the two fields. PM-side bid display shows them.

**Phase 2 — Material orders schema.** New table + RLS + helpers. Strictly additive.

**Phase 3 — Materials sub-tab.** New JobDet tab. Add Quote modal creates rows.

**Phase 4 — Phase advancement gates.** Helpers + UI for advancing phases. Required-data validation per transition with friendly errors. Manual override button with reason logging.

**Phase 5 — Phase-driven todo engine.** Rules config + fan-out helpers + auto-resolution wiring throughout existing helpers (sbCreateEngagement, sbCreateMaterialOrder, sbCreateInvoice, etc.).

**Phase 6 — Auto-create schedule items on dual-trigger.** When `material_orders.status` becomes `quoted` AND engagement has accepted bid with `earliest_start_date` for same trade → system creates `material_delivery` + `sub_start`. PM confirms via Schedule with date conflict warnings.

**Phase 7 — Sequence triggers (3-sided).** New triggers respecting `notify_sub` + `notify_client` flags. Per-trigger audience defaults from section 7. Adds `notify_sub` column on `schedule_items`.

**Phase 8 — Site visit checklists.** Schemas + hardcoded starter set + walkthrough mode UI (mobile) + failed-item-to-todo wiring.

**Phase 9 — Learning loop.** Optional toggle on financial entry: "Save this rate as my default" → updates `takeoff_unit_costs` tenant override.

Each phase ~one evening's slice. Total arc 7-10 days at the invoicing-arc cadence.

## 10. Out of scope

- Voice agent integration (separate arc; will read this arc's data)
- AI-seeded checklist templates (hardcoded for v1)
- Supplier as first-class entity (free text for v1)
- Code reference database links
- Multi-tenant phase customization (6 phases hardcoded)
- Subs submitting their own walkthrough results (PM-only for v1)
- Photo annotation in walkthroughs (basic upload only)

## 11. Decisions locked (2026-05-06)

1. Auto-creation only after PM data entry — no surprise auto-creation
2. Phase advancement is mechanical-with-override; required data per transition
3. Audience per trigger defaults; PM toggles via `notify_sub` / `notify_client`
4. Site visit checklists are data, not voice-only — visual UI now, voice agent reads later
5. Hardcoded checklist starter set for v1; tenants override per template
6. Free-text supplier name; no supplier entity yet
7. Material cost actuals optionally update catalog (PM toggle, not auto)
8. Failed checklist items create follow-up todos
9. Phase-driven todos auto-resolve on state changes; PM-created custom todos still have manual checkboxes
10. 6 phases hardcoded — Review / Proposal / Contract / In Progress / Final Touches / Complete

## 12. Open questions

- Exact items in each phase's todo rules (refine per phase as we ship)
- Walkthrough UI specifics (camera integration, photo storage, offline support) — Phase 8 scope
- Sequence message templates per trigger × per role — Phase 7 scope
- Whether Schedule tab gets a "Review pending auto-creations" badge — Phase 6 scope
