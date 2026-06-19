# SELECTIONS_ARC — Selections Tracking Spine + AI Visualization

_Blueprint drafted 2026-06-10 (Fable session). Status: BLUEPRINT — not started. Sequenced after DESIGN_SYSTEM_ARC completes and AGENT_READS ships._

---

## Thesis

Selections are anti-surprise infrastructure, not a gallery. Every selection has:
1. **An owner** — client picks, PM tracks, system computes
2. **A deadline derived from the schedule** — need-by = trade's sub_start date minus material lead time (`trade_material_lead_times` already exists and feeds this)
3. **A status with a paper trail** — needed → awaiting client → rendered → approved, with who/when/what-exactly recorded
4. **An alignment moment** — the client approves an AI render of THEIR space with THEIR choices applied, before anyone orders material or cuts tile

The current gap: nothing tracks what selections a job needs, when they're due, or where they stand. PM finds out a selection is missing when the tile sub asks what tile. That is a surprise — the exact kind this platform exists to kill.

**Operating model (Kalin, 2026-06-10): capture is an event, confirmation is the process.** Selections are NOT drip-fed as the project advances. The job sells → a guided **selections session** happens immediately (PM or sales rep with the client, in person or on the spot) → all selections captured in one batch while the calendar is empty. From then on the system's job is re-confirmation: each selection gets confirmed again right before its money commits (material order window). Confirm, confirm, confirm. A change AFTER confirmation is change-order territory, not a quiet swap.

**The render is persuasion. The structured spec is the contract artifact. Store both, bind approval to both.**

---

## Core design decisions (LOCKED)

1. **Client never writes a prompt.** Client makes structured selections (option groups: size, layout, color, finish...). The system compiles the render prompt from a per-template `prompt_template` + the choices + the base photo. No freeform client input to the image model — controlled, repeatable, liability-safe.

2. **Prompt templates are per-tenant config** (platform defaults `tenant_id IS NULL`, tenant rows override — Principle 5 precedence). A painter tenant's templates compile paint prompts; a tile tenant's compile tile prompts. Same engine, zero per-trade engineering. This feeds the GOD_MASTER_AGENT feature catalog directly.

3. **Selection requests are generated, not hand-created.** Same pattern as walkthrough generation: job sold → generator derives which selections this job needs from its trades in scope → creates `selection_requests` rows. PM can add manual requests; the baseline is automatic.

4. **Capture happens in a guided Selections Session at sale.** Batch UI (walkthrough-checklist pattern): rep/PM walks every open request with the client in one sitting, picks choices, generates renders, gets approvals on the spot where possible. The client portal is the **confirmation and review surface**, not the primary capture path — async portal capture is the fallback when a session item was deferred.

4b. **Partial resolution is first-class, and reminders are double-sided.** A session that ends with "one of these three colors, samples first" is the NORMAL outcome, not a failure — the request goes `shortlisted` with the candidate set recorded and optional sample tracking. From there the system nags BOTH sides until the loop closes: client gets the portal item + email nudge ("confirm your paint color"), PM gets the vigilance todo ("paint unconfirmed, order window in N days"). Neither party gets to assume the other has it. Escalation tightens as confirm_by approaches.

5. **Need-by dates are CONFIRMATION checkpoints, not selection deadlines.** `confirm_by = (schedule sub_start for the trade) − (trade_material_lead_times lead_days, tenant override → platform default → 14-day fallback)` — i.e., the material order window. An approved selection must be RE-CONFIRMED before this date. Schedule cascade re-fires confirm_by recompute (reuse ANTI_SURPRISE Phase 2.1 schedule-lock pattern, WITH the job_id filter — see fe0b1cc).

6. **Post-confirmation changes route toward change orders.** When a confirmed selection is reopened, the UI flags it and prompts the CO path if cost/scope shifts. Selections never silently mutate after confirmation.

7. **Render provider is NOT Anthropic.** Claude does not generate images. The render pipeline calls an external image-edit API (Gemini image editing vs OpenAI gpt-image — pin the current best model/pricing at build time, this market moves monthly). API key in Supabase function secrets. User-triggered only — never automatic, never on a DB event (API Cost Rules compliant; per-render cost is cents).

8. **Approval binds to spec + render version together.** `approved_by`, `approved_at`, the choices jsonb, the compiled prompt, the model used, the render file, and the base photo are all on the record. Confirmations stamp the same way (`confirmed_by/confirmed_at`, repeatable). "You approved THIS image with THESE specs on THIS date, and re-confirmed on THAT date" is one query.

9. **Keep the disclaimer.** "Visualization is an approximation. Final results may vary." Rendered under every preview and on the approval screen. Liability posture, non-negotiable.

10. **Versioning, never overwrite.** Changes requested → client adjusts → new `job_selections` version row → new render. History kept.

---

## Data model

All tables: `tenant_id UUID NOT NULL` + index + RLS via `get_my_tenant_id()` (Principle 1). Explicit tenant_id on every INSERT (Principle 11).

### selection_templates
What CAN be selected, per trade/context, and how it renders.
- `id`, `tenant_id` (NULL = platform default), `trade` TEXT, `room_type` TEXT nullable
- `name` (e.g. "Shower wall tile")
- `option_groups` JSONB — array of `{ key, label, type: single|multi|color|text_constrained, options: [{value, label, swatch_url?}] }`
- `prompt_template` TEXT — compile target with `{key}` substitution
- `requires_base_photo` BOOLEAN default true
- `active`, `created_at`
- Tenant override precedence: `DISTINCT ON ... ORDER BY tenant_id NULLS LAST` (Principle 5)

### selection_requests
What THIS JOB needs decided. The tracking spine.
- `id`, `tenant_id`, `job_id`, `template_id` FK
- `trade` TEXT, `area_label` TEXT (e.g. "Master bath shower")
- `status` TEXT CHECK: `needed → selected → rendered → approved → confirmed` + `shortlisted` (parallel capture state) + off-ramps `changes_requested` (loops back to selected), `cancelled`. `shortlisted` = session narrowed to candidates but no final pick (e.g. 3 paint colors pending physical samples) — candidate set stored in choices jsonb as `candidates[]`, final pick promotes to `selected`. `selected` = single choice captured; `approved` = client signed off on spec+render; `confirmed` = re-confirmed inside the order window. Reopening after `confirmed` requires a reason and surfaces the CO prompt.
- `sample_state` TEXT nullable: `requested | ordered | delivered` — lightweight sample tracking for shortlisted items, no separate table
- `confirm_by` DATE (computed = order window; recomputed on schedule cascade)
- `confirmed_by` UUID nullable, `confirmed_at` TIMESTAMPTZ nullable (latest confirmation)
- `session_id` UUID nullable — groups requests captured in the same Selections Session
- `blocking` BOOLEAN — true when the trade cannot start without it
- `base_photo_file_id` FK → job_files nullable
- `source` TEXT: `generator | pm_manual`
- `created_at`, `updated_at`

### job_selections
What the client actually chose — versioned.
- `id`, `tenant_id`, `request_id` FK, `version` INT
- `choices` JSONB — the structured spec (contract artifact)
- `prompt_compiled` TEXT, `render_model` TEXT, `render_file_id` FK → job_files nullable
- `client_note` TEXT nullable
- `approved_by` UUID nullable, `approved_at` TIMESTAMPTZ nullable
- Partial unique: one current (max-version) row per request enforced in helper logic; approval allowed only on latest version

### job_files
New category `Selections` (renders + base photos tagged). No schema change expected — verify category handling in Files tab (FilesTreeView CAT_COLORS gets a Selections entry).

---

## Pipeline

```
job sells
  → generator: trades in scope × active templates → selection_requests (confirm_by computed from schedule + lead times)
  → SELECTIONS SESSION (PM/rep + client, batch UI): pick choices, attach base photos,
    generate renders, approve on the spot where possible
    → fully decided items: selected → rendered → approved
    → undecided items: shortlisted (candidates + sample tracking)
  → open loops: dual-sided reminders (client portal/email + PM todos) until resolved
  → confirm_by window approaches → re-confirmation: client + PM confirm before material order
  → confirmed → order proceeds → reopening after confirmed routes toward CO
schedule cascade → confirm_by recompute → vigilance watches the clock
```

**Base photo synergy:** PlaybookChecklist already captures per-item photos in walkthroughs. A playbook item ("photograph shower area for selections") can feed `base_photo_file_id` directly — the walkthrough collects the selection inputs as a side effect. Wire in Phase 2.

---

## Vigilance rules (added to vigilance-runner — pure SQL, zero model calls)

All selection rules are **dual-target**: PM gets the todo/notification, client gets the portal item + email nudge (via the existing notifications email path; client-facing copy is friendly, not alarm-toned). Open-todo dedup pattern as established — escalation updates the existing todo's priority rather than spawning new ones.

- `selection_unresolved` — status IN (needed, shortlisted) AND `confirm_by - today <= 14` → MEDIUM at T-14, escalates to HIGH at T-7. The shortlist nag: "client needs to pick from candidates."
- `selection_unconfirmed_before_order` — status = approved AND not confirmed AND `confirm_by - today <= 5` → HIGH, both sides. The headline confirm-confirm-confirm rule.
- `selection_blocking_phase` — blocking=true AND trade's schedule item starts ≤ lead window AND status != confirmed → HIGH, PM + flag on the schedule item.
- `selection_session_missing` — job sold ≥ 7 days, has generated requests, zero requests past `needed` → MEDIUM, PM/rep. The "session never happened" alarm.
- `selection_sample_stale` — shortlisted AND sample_state = delivered ≥ 5 days with no promotion to selected → LOW→MEDIUM. Samples on the wall, client gone quiet.

## Surfaces

- **PM / job:** Selections sub-tab (under FIELD tab next to Walkthroughs — keep the field ops together; not a new top-tab). Rows: area, template, status pill, need-by (red when late), blocking badge, render thumbnail, base-photo indicator. Per Kalin: "where is everything" dies here.
- **Home insights:** rollup card — "Selections: N awaiting client, N due this week, N late" → deep-links to filtered view (fits the insights-as-command-center wiring).
- **Client portal:** "Things we need from you" section (already in the approved mockups): open requests → picker flow → render preview (side-by-side with base photo) → Approve / Request changes. Approval = tap-approve with identity + timestamp (not e-sign; selections are spec confirmations, not contract amendments — COs remain the contract instrument).
- **Aven:** read tool `get_selections_status` (post-AGENT_READS pattern) so "what selections are we waiting on?" just answers. Write verb deferred.

---

## visualize-render edge fn (VISUALIZE pipeline)

- Input: `request_id` (server derives latest job_selections version, template, base photo) — never raw prompts from the client
- Compiles prompt server-side from `prompt_template` + choices
- Calls image-edit API (provider/model pinned at build; key in function secrets; tenant_id from caller profile, never client input)
- Stores result → job-documents bucket → job_files (Selections category) → stamps `render_file_id`, `render_model`, status → rendered
- Hard limits: user-triggered only; per-request render cap (e.g. 5 versions before PM override) to bound spend; failures write ai_error_logs and surface a retry — never block the selection record (fire-and-forget prohibition applies to the inverse: render failure must not corrupt selection state)

---

## Phases (prompt estimates, Sonnet unless noted)

| Phase | Scope | Prompts |
|---|---|---|
| 0 | Audit: existing selections-adjacent code, client portal extension points, job_files category handling, walkthrough photo linkage points | 1 |
| 1 | Schema (3 tables + RLS + migrations via npm run migrate) + seed tile & paint templates for Avenstone | 2 |
| 2 | Generator + confirm_by math + schedule-cascade recompute + base-photo wiring | 2 |
| 3 | Selections Session batch UI (walkthrough-checklist pattern: walk all requests, pick/shortlist, renders inline) | 2 |
| 4 | PM Selections sub-tab (status/sample chips, confirm_by, late highlighting) + Home insights rollup | 1–2 |
| 5 | Client portal: confirmation surface — open loops, shortlist final-pick, approve/confirm, disclaimer | 2 |
| 6 | visualize-render edge fn + side-by-side preview + versioning | 2 |
| 7 | Vigilance rules (dual-target + escalation) + Aven read tool | 1–2 |

**Total: ~13 prompts.** v1 scope cut: tile + interior paint templates only; more trades = template rows, not code.

---

## Open questions for Kalin (field decisions — answer before Phase 1)

1. **Which trades need selections at Avenstone day one?** Proposed v1: tile, interior paint. Candidates next: flooring/LVP, plumbing fixtures, cabinets/vanities, countertops, exterior paint.
2. **Who attaches the base photo** — PM during a walkthrough (recommended, via playbook item) or client uploads in portal (fallback when PM hasn't been on site)? Proposed: both allowed, PM-walkthrough primary.
3. **Render visibility:** does the client see renders immediately on generation, or does the PM review/curate before the client sees them? Proposed: immediate (speed > curation), PM can regenerate.
4. **Approval scope:** confirm tap-approve (not e-sign) is acceptable for selections given COs carry the contract weight.

---

## Out of scope (named so nobody scope-creeps)

- Selections → takeoff/estimate feedback (approved tile size adjusts waste % and labor) — real, valuable, LATER (post-Model B; touches money math)
- Freeform "design help" chat with the image model — never; structured only
- Supplier/SKU integration on options — ANALYTICS/CATALOG territory
- E-sign on approvals — COs own contractual change
