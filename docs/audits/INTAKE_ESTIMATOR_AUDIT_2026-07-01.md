# INTAKE + ESTIMATOR INPUT CHAIN AUDIT — 2026-07-01

**Auditor:** Claude Code (Sonnet 4.6), read-only session.
**Scope:** Five areas per the audit brief. Every code claim cites file+line. Every schema claim cites information_schema output.
**Repo root:** `C:\Users\Kalin\GitHub\avenstone-app`

---

## Area 1 — AiIntakeWizard: What Is It Actually?

### What it renders

`AiIntakeWizard` is a **full-screen overlay** (fixed inset, zIndex 2000) that implements a **LiDAR room-scan capture flow only**. Three steps:
- `scan` — renders `<LidarScanner>` for multi-room RoomPlan capture
- `height` — renders `<HeightCaptureStep>` to capture ceiling height
- `save` — if no `jobId` prop, shows a contact-search picker to attach the scan to a contact (via `sbSaveLidarScan`); if `jobId` is present this step is skipped and save fires automatically (via `sbSaveJobLidarScan`)

Source: `avenstone-vite/src/components/ai/AiIntakeWizard.jsx`, lines 13–291.

### Data collected and written

| Data | Written to |
|------|-----------|
| Room polygons, sqft, names (from LiDAR) | `lidar_scans` (via `sbSaveLidarScan`) or `job_lidar_scans` (via `sbSaveJobLidarScan`) |
| Height (meters, source, calibration points) | Same row, height columns |
| GPS coordinates | Same row, `gps_latitude/longitude/accuracy` |
| Floor plan record | `floor_plans` table (via `sbCreateFloorPlan`) |
| PDF | `job-documents` storage bucket (via `sbUploadDoc`) |

No questionnaire fields. No project-type questions. No scope intake. No client-facing data collection of any kind.

### Entry points (where it is mounted)

1. **`JobsScr.jsx` line 184** — lazy-imported, mounted when `showIntake` is true. This is accessed from the Jobs list screen. The button that sets `showIntake` is in the Jobs screen toolbar.
2. **`FloorPlanTab.jsx` line 208** — mounted inline inside the Scanner tab of a job. This is the primary production path (rep scans rooms while inside a job record).

### Role gates

No explicit role gate on the component itself. Both mount points live in the main rep/PM/owner app (not the ClientPortal or SubPortal). Client and sub roles do not see `JobsScr` or `FloorPlanTab`.

### Does any new-client intake questioning exist here or anywhere else?

**No new-client intake questioning exists anywhere in the live codebase.** CLAUDE.md's AI Component Map (line 372) correctly states: "LiDAR capture flow: scan → height → quality report → save to job or contact." The MASTER_BUILD_PLAN (Fuzzy Items table) explicitly confirms: "Spine handoff chain — client intake: **MISSING.** AiIntakeWizard is LiDAR scanner only. No project-type-adaptive intake form exists anywhere."

Searched the entire `avenstone-vite/src/components/` tree for any adaptive questioning component for clients: none found. The client role only sees `ClientPortal.jsx`, which has no intake wizard of any kind.

**Build plan claim:** The SCE blueprint (§ G + Phase 4 row) says Client INTAKE is Phase 4 of the engine, not yet built. This is consistent with live code.

---

## Area 2 — Client Entry Path: How a New Client Gets In

### Full new-client path (in order)

**Step 1 — Lead creation (LeadsScr)**

`avenstone-vite/src/components/leads/LeadsScr.jsx` is a read+filter UI over the `jobs` table records with `lead_status` values (`new`, `contacted`, `qualified`, `customer`, `lost`). Leads are also created by the Master Agent (`create_job` verb, line 574 of `ai-master-agent/index.ts`) and from GHL webhook. The LeadsScr itself is display-only; a lead is converted to a job by the `onConvertToJob` callback (wired in App.jsx). No intake form exists at this stage.

**Step 2 — Job creation / proposal advance**

Once the lead is qualified, the rep opens the job record in `JobDet`. No structured intake occurs at this transition. `jobs.scope` is a free-text field populated by the rep.

**Step 3 — Consultation (on-site, optional)**

Rep can open the **Consultation tab** (`ConsultationTab.jsx`) to run an ambient-listening session (mic → `process-transcript` → `consultation_extractions`) and a measure session (chat/voice → `consultation_measurements`). This is the only structured, field-by-field data capture that exists — but it is rep-driven, not client-driven.

**Step 4 — Client portal provisioning**

PM sets the client password via `ClientLoginButton` in `InfoTab.jsx` (lines 10–68). This calls `sbCreateClientLogin(job.client_email, pwd, job.client_name, job.id)`, which hits the `create-client-login` edge function. That function:
- Finds or creates a Supabase auth user via `get_auth_user_id_by_email` RPC
- Sets the password via `updateUserById`
- Upserts `profiles` with `role=client, tenant_id`
- Links `jobs.client_user_id`

**`create-client-login` is the canonical and live path.** The `ClientLoginButton` component and the `sbCreateClientLogin` helper (`src/lib/supabase.js`) are the only provisioning surface used. Verified: `InfoTab.jsx` line 171 renders `<ClientLoginButton job={job} />` unconditionally below the client info form.

**`send-client-link` status:** The function exists at `supabase/functions/send-client-link/index.ts` and is still deployed. It is called by the Master Agent `send_client_portal` verb (`ai-master-agent/index.ts` line 1293). CLAUDE.md marks magic links "retired 2026-06-01" for the client portal — the canonical first-login path is `create-client-login`. `send-client-link` still exists and fires from the Master Agent verb but it sends a magic link email (not a password set), which CLAUDE.md warns will "redirect to wrong project/tenant." It is not dead (deployed, still callable) but is flagged as problematic for client portal access. Sending the email itself still works; the redirect behavior is the bug.

**Step 5 — First client portal experience**

Client logs in at `https://avenstone-app.vercel.app` → App.jsx sees `role=client` → renders `ClientPortal.jsx`. The portal shows: project progress stepper, messages, schedule, financials (draw breakdown for cost-plus), photos. No welcome wizard. No intake questions. No onboarding flow. The first screen the client sees is the progress view of the job they were linked to.

### Where an intake questionnaire would naturally mount

The natural mount point is **between Step 2 and Step 4** — after a job is created from the lead but before portal provisioning. The client could answer project-type adaptive questions that pre-fill the estimator. Per SCE blueprint Phase 4 and B5.1–B5.3, this is the planned but unbuilt client role-instance. Today that surface does not exist.

---

## Area 3 — Scope Checklist Tables: Exact Shape for Seed Content

### Column definitions (from information_schema, queried 2026-07-01)

**`scope_checklists`**
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| tenant_id | uuid | YES | null (NULL = platform default) |
| project_type | text | NO | — |
| field_key | text | NO | — |
| question | text | NO | — |
| field_type | text | NO | — (`choice|number|text|bool`) |
| options | jsonb | YES | null (string[] for choice, else null) |
| money_risk_rank | integer | NO | 99 |
| adds_trades | text[] | YES | null |
| active | boolean | NO | true |
| created_at | timestamptz | NO | now() |

**`scope_modules`**
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| tenant_id | uuid | YES | null |
| module_key | text | NO | — |
| label | text | NO | — |
| trigger_phrases | text[] | NO | '{}' |
| adds_fields | jsonb | NO | '[]' |
| adds_trades | text[] | YES | null |
| active | boolean | NO | true |
| created_at | timestamptz | NO | now() |

**`scope_conflict_rules`**
| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | uuid | NO | gen_random_uuid() |
| tenant_id | uuid | YES | null |
| rule_key | text | NO | — |
| sources_compared | text[] | NO | '{}' |
| conflict_condition | text | NO | — |
| question_when_conflict | text | NO | — |
| active | boolean | NO | true |
| created_at | timestamptz | NO | now() |

### Row counts (live DB, queried 2026-07-01)

| Table | Rows |
|-------|------|
| scope_checklists | 13 |
| scope_modules | 5 |
| scope_conflict_rules | 2 |

### Bathroom seed content — verbatim (all 13 scope_checklists rows, all for project_type='bathroom')

| money_risk_rank | field_key | field_type | options | question |
|----------------|-----------|-----------|---------|---------|
| 1 | shower_type | choice | ["tub_only","walk_in","tub_to_shower_conversion","tub_and_separate_shower"] | Tub only, walk-in shower, tub-to-shower conversion, or tub + separate shower? |
| 2 | shower_floor_tiled | bool | null | Is the shower floor tiled (vs. solid surface, fiberglass, etc.)? |
| 3 | layout_change | bool | null | Are any plumbing fixtures being moved or relocated (toilet, shower, tub, sink)? |
| 4 | wall_tile_extent | choice | ["floor_to_ceiling","48_inch","36_inch","no_tile_surround"] | How far up do the shower/tub surround tiles go? |
| 5 | vanity_count | number | null | How many vanities? |
| 6 | floor_finish | choice | ["tile","lvp","vinyl_sheet","other"] | What is the floor finish? |
| 7 | ventilation | choice | ["existing_keep","upgrade","new_install","none"] | Is there an exhaust fan? (existing, upgrading to GFCI + new fan, or new install) |
| 8 | drywall_wet_area | choice | ["standard_mr","cement_board","existing_keep"] | Wet-area drywall — standard or cement board / Durock behind tile? |
| 9 | access_panel | bool | null | Is there access behind the shower/tub wall for plumbing (access panel, adjacent closet)? |
| 10 | shower_enclosure | choice | ["frameless","semi_frameless","glass_slider","curtain_rod","none","keep_existing"] | Shower/tub enclosure: frameless glass, semi-frameless glass, sliding glass door, curtain rod, none, or keep existing? |
| 11 | shower_valve | choice | ["standard","rain","body_sprays","rain_and_body"] | Shower valve/fixtures: standard single valve, rain head, body sprays, or rain + body? |
| 12 | shower_niche | number | null | How many recessed niches in the shower/tub wall? (0 if none) |
| 13 | shower_bench | bool | null | Is there a built-in shower bench or seat? |

No rows exist for any other project_type (kitchen, basement, exterior, etc.). Bathroom is the only seeded type.

### scope_modules verbatim (5 rows, all tenant_id=NULL, all active)

| module_key | label | trigger_phrases | adds_trades |
|-----------|-------|----------------|------------|
| electrical_upgrade | Electrical Service / Circuits | ["panel upgrade","service upgrade","new circuits","add circuits","breaker box","200 amp","electrical upgrade"] | ["Electrical - Rough-in","Electrical - Service upgrade"] |
| plumbing_relocation | Plumbing Fixture Relocation | ["move toilet","move shower","move tub","relocate","moving fixtures","rough-in change","new location"] | ["Plumbing - Rough-in","Demo"] |
| structural | Framing / Structural Change | ["remove wall","open up","vault","load bearing","load-bearing","bump out","bump-out","header","open concept","tear out wall"] | ["Framing","Demo","Drywall - Hang"] |
| water_mold_remediation | Water / Mold Remediation | ["water damage","mold","black mold","staining","wet walls","rot","water intrusion","moisture damage","remediation"] | ["Demo","Drywall - Hang","Drywall - Tape / mud / texture"] |
| waterproofing | Tiled Wet-Area Waterproofing | ["tiled shower floor","steam shower","curbless","wet room","shower pan","schluter","membrane"] | ["Tile - Floor","Tile - Wall / shower"] |

**adds_fields for each module:**
- `electrical_upgrade`: `panel_scope` (choice: new_circuits_only/panel_upgrade), `gfci_required` (bool)
- `plumbing_relocation`: `relocation_fixtures` (text), `slab_work` (bool)
- `structural`: `wall_load_bearing` (bool), `opening_width_ft` (number), `ceiling_work` (bool)
- `water_mold_remediation`: `remediation_sf` (number), `source_addressed` (bool)
- `waterproofing`: `membrane_type` (choice: schluter_kerdi/hot_mop/other), `curb_type` (choice: standard_curb/curbless), `steam_shower` (bool)

### scope_conflict_rules (2 rows)

| rule_key | sources_compared | conflict_condition | question_when_conflict |
|---------|-----------------|-------------------|----------------------|
| shower_fixture_conflict | ["typed","photo"] | shower_type field value differs between typed input and photo evidence | You said {typed} but the photo shows {photo} — which is correct? |
| wet_wall_window_omission | ["plan","typed"] | plan shows a window in the shower or tub wet wall not mentioned in typed scope | The plan shows a window in the wet wall — is it staying as-is, being moved, or being closed in? |

### How `ai-estimator` scope-interview mode consumes them

**Which function reads them:** `loadScopeConfig(tenantId, projectType)` in `supabase/functions/ai-estimator/index.ts` (lines 134–156). Queries `scope_checklists` filtered by `project_type` + `active=true` + `tenant_id IS NULL OR tenant_id = tenantId`, and all `scope_modules` with `active=true` + same tenant filter.

**How questions get selected/ordered:** Pure deterministic functions in `supabase/functions/_shared/scopeEngine.ts`:
1. `assembleChecklist(projectType, checklistRows)` (line 81) — filters to matching project_type, merges tenant overrides over platform defaults, sorts by `money_risk_rank` ascending.
2. `detectTriggers(allText, moduleRows)` (line 105) — substring matches ALL rep user messages against every `trigger_phrases` entry; fires matching modules deterministically.
3. `collectRequiredFields(baseFields, firedModules)` (line 118) — base checklist fields + adds_fields from fired modules. Deduplicates by field_key; module fields rank after all base fields.
4. `openQuestions(requiredFields, answeredKeys)` (line 141) — filters out answered keys, re-sorts by `money_risk_rank`.

**How answers are stored:** Answers are NOT persisted to any DB table in Phase 1B. They live in the `estMessages` conversation history array (React state in `EstimateTab.jsx`) which is saved to `job_estimates.messages` JSONB via `sbSaveEstimate`. The answer records carry `{field_key, value, source, confidence}` per the `AnswerRecord` interface (scopeEngine.ts line 56), but they are only passed back in the HTTP response body and folded into the `prefilled_answers` on subsequent calls — they are NOT written to a dedicated answer table. Phase 3 will need answer persistence for photo/plan source tracking.

**How the interview fires:** `EstimateTab.startEstimate()` (line 395) calls `sendEstimatorMessage(prompt, file, 'scope_interview')` when `resolveProjectType()` returns a non-null value. The project_type resolution (lines 385–393): typed Rooms/Areas field matched against `knownProjectTypes` (loaded from DB live) → job_room_scopes derivation (`scopeProjectType`) → null. The `mode: 'scope_interview'` param routes the request to `handleScopeInterview()` in the edge function (line 640).

---

## Area 4 — Estimator Input Chain: Everything That Feeds a Draft

### All inputs, where captured, where stored, whether they reach the estimator

**1. `estForm.scope` (scope description)**
- Where captured: typed by rep in EstimateTab Build sub-tab textarea (`EstimateTab.jsx` line ~41)
- Seeded from: `job.scope` on load (`EstimateTab.jsx` lines 207–215), or from session prefill via `av_estimate_prefill_{jobId}` localStorage key (line 145–149)
- Stored: in React state; included in the prompt sent to `ai-estimator` as part of `startEstimate()` text (line 398)
- Reaches estimator: YES — included verbatim in the opening user message

**2. `estForm.rooms` (room/areas field)**
- Where captured: typed by rep in a second textarea
- Seeded from: consultation context doc names (line 213), or session prefill `rooms` field
- Also used: `resolveProjectType()` (line 390) matches this field against `knownProjectTypes` to trigger scope interview
- Reaches estimator: YES — included in the opening prompt (line 398)

**3. `interviewSf` (square footage)**
- Where captured: typed by rep in the SF field in Build sub-tab (EstimateTab line 769)
- Seeded from (in priority order): `sessionPrefill.sf` (on-site measured, from `sessionToEstimatePrefill.js` line 85) → `deriveProjectSf()` from scoped rooms (lidar area_sqft) → `job.sqft` → empty
- Source tagged as: `interviewSfSource` ('session'|'scope'|'job'|'none') with UI indicators (lines 745–760)
- Reaches estimator: YES — sent as `project_sf` in the POST body (line 295 and line 346)
- **FLAG:** If `project_sf` is 0 or missing, `ai-estimator` returns a 400 fail-loud error (line 684). So an estimate cannot be generated without SF.

**4. `interviewTier` (finish tier: low/mid/high)**
- Where captured: dropdown in Build sub-tab (EstimateTab line ~59)
- Seeded from: 'mid' default
- Reaches estimator: YES — sent as `finish_tier` (line 295/346)

**5. `interviewMarkup` / `interviewPmFee`**
- Where captured: number inputs in Build sub-tab
- Seeded from: `bid_model_config` tenant default via `sbLoadBidModelConfig` (lines 105–123); job-level override fields take precedence
- Reaches estimator: YES — sent as `markup_pct` and `pm_fee` (line 295/346)

**6. `estFile` (floor plan / photo upload)**
- Where captured: file picker in Build sub-tab
- Stored: browser File object in React state; base64-encoded and sent inline as a vision content block (lines 319–328)
- Reaches estimator: YES — sent as an image or PDF content block in the user message. The estimator model (claude-sonnet-4-6) can read it for scope clues.
- **Note:** This is the ONLY photo path that reaches the estimator directly. Job photos from `job-photos` bucket are NOT automatically fed into the estimator. Vision reconciliation (Phase 3) is not yet built.

**7. `sessionPrefill.measuredFields` (on-site consultation measurements)**
- Where captured: `ConsultationTab.jsx` MeasurePanel → `consultation_measurements` table → `sessionToEstimatePrefill.js` flattens `fields` JSONB into a flat key:value map
- Stored: `av_estimate_prefill_{jobId}` localStorage (set in ConsultationTab line 329; read and cleared in EstimateTab lines 145–149, 224)
- Reaches estimator: YES, in scope-interview mode only — forwarded as `prefilled_answers` in the POST body (EstimateTab lines 353–355). The edge function (`handleScopeInterview` lines 241–261) folds matching field_keys into the answered set with `source: 'measured'`, short-circuiting the interview for those fields.
- **CAVEAT (accepted tradeoff per MASTER_BUILD_PLAN):** The channel is "dormant until Phase 3 vision fills it." Measurements are quantities, not scope forks. A `total_sf` key in `measuredFields` will flow to `interviewSf` via the `sf` field of the prefill, but per-trade measurements (e.g. `tile.floor_sf`) are stored in `consultation_measurements.fields` as free-form JSONB and are only forwarded if their key happens to match a `scope_checklists.field_key`. Today's checklist keys are scope forks (shower_type, vanity_count, etc.), not quantity measurements — so most `measuredFields` pass through ignored.

**8. `interviewSf` derived from scoped rooms (LiDAR + room scope)**
- Where captured: `deriveProjectSf(sb, job.id, job)` (imported in EstimateTab, line 12 from `src/lib/deriveProjectSf.js`)
- Reads: `job_lidar_scans` → `normalized_geometry.rooms[].area_sqft` → sums scoped rooms (those in `job_room_scopes` and not `not_in_scope`)
- Reaches estimator: YES via `interviewSf` — but only as SF, not as room-type context

**9. ConsultationTab → EstimateTab auto-flow (P1A)**
- Status: BUILT and live. `ConsultationTab.draftEstimateFromSession()` (line 310) fires on rep click → reads `consultation_extractions` + `consultation_measurements` + `job_room_scopes` → calls `sessionToEstimatePrefill()` → stores result to localStorage `av_estimate_prefill_{jobId}` → switches to Estimate tab.
- EstimateTab reads the prefill on mount (lines 145–149): applies to `estForm.scope/rooms/special` and `sessionPrefill` state; clears localStorage (one-shot). The `sessionPrefill.measuredFields` and `sessionPrefill.sf` are then used in the SF derivation effect and the scope-interview `prefilled_answers` forwarding.
- **Is this the "ConsultationTab → EstimateTab auto-flow from the SCE locked integration requirement"?** YES — the locked integration requirement (SCE blueprint § D) is implemented as the `draftEstimateFromSession` button + localStorage prefill channel. It is NOT a fully automatic trigger (the rep must click "Draft from Session" in the ConsultationTab). The "auto-flow" is a rep-initiated prefill, not a background auto-draft.
- `generate-estimate-from-session` (the old divergent pricing path): the edge function still exists at `supabase/functions/generate-estimate-from-session/index.ts`. It has been surgically modified (P1A) to retain ONLY the `captureSessionRisks` / `oh_shit_moments` logic (line 13: "KEEP half"). The invented-pricing half appears to have been removed/retired in the function but the file still exists and is still deployed. `ConsultationTab.jsx` no longer calls it for estimate generation — `draftEstimateFromSession()` uses `sessionToEstimatePrefill` + localStorage instead.

**10. Scope interview answers (from the conversation)**
- Where stored: `job_estimates.messages` JSONB (the full conversation, saved by `sbSaveEstimate`)
- They reach pricing: YES — when `scopeComplete` becomes true, `runPricing()` appends the `PRICING_TRIGGER` message to the full conversation and POSTs to `ai-estimator` without `mode:'scope_interview'`. The pricing prompt receives the full conversation history including all the answered scope fields as natural language.

**DEAD INPUT FLAG:** `estForm.special` — captured from the special notes textarea, seeded from consultation concerns/risks — is included in the EstimateTab opening prompt (line 398) and in the scope-interview payload indirectly (it becomes part of user messages). However, it is NOT separately forwarded as a structured field. If the rep mentions something in `special` that matches a module trigger phrase, the trigger detection in `handleScopeInterview` will catch it from the user message text. This is working as designed.

**DEAD INPUT FLAG:** `job.sqft` — used only as a fallback SF source via `deriveProjectSf` when no session SF and no LiDAR rooms exist. It never reaches the estimator directly; `interviewSf` is what gets sent.

---

## Area 5 — Trigger Detection: Built or Aspirational?

### What exists

Trigger detection is **fully built and live** as of P1B (shipped 2026-06-26). The implementation is in `supabase/functions/_shared/scopeEngine.ts`, the `detectTriggers()` function (lines 105–113):

```typescript
export function detectTriggers(allText: string, moduleRows: ModuleRow[]): ModuleRow[] {
  const hay = norm(allText);
  if (!hay) return [];
  return mergeModules(moduleRows).filter((m) =>
    (m.trigger_phrases ?? []).some((p) => {
      const needle = norm(p);
      return needle.length > 0 && hay.includes(needle);
    })
  );
}
```

This is a **deterministic substring search** over the concatenated text of ALL rep user messages. It is called on every interview turn in `handleScopeInterview()` (line 234):

```typescript
const repText = messages.filter((m) => m.role === "user").map(...).join("\n");
const fired = detectTriggers(repText, modules);
const requiredFields = collectRequiredFields(baseFields, fired);
```

Meaning: if the rep types "tiled shower floor" or "steam shower" at any point during the interview, the `waterproofing` module fires — its three fields (`membrane_type`, `curb_type`, `steam_shower`) are appended to the required set and surface in the next AI response. This happens on EVERY turn, so a mid-interview answer can bolt on a new module.

### What component 3 of the SCE blueprint requires vs. what's built

The SCE blueprint (§ Component 3 / Decision C) specifies:
> "Trigger detection — AI reads every source on EVERY answer (not just the opening description) for phrases/concepts that map to a module; firing a module bolts its checklist on; a mid-interview answer can spawn new modules."

**This is fully implemented.** `detectTriggers` runs against all rep text on every turn; `collectRequiredFields` merges newly fired module fields into the open-questions set. The AI then phrases the new fields in the next turn.

### How `ai-estimator/index.ts` uses `scopeEngine.ts`

Imports at lines 17–23:
```typescript
import {
  assembleChecklist, detectTriggers, collectRequiredFields,
  openQuestions, makeAnswerRecord,
  type ChecklistRow, type ModuleRow, type ScopeField, type AnswerRecord,
} from "../_shared/scopeEngine.ts";
```

Usage in `handleScopeInterview()` (lines 198–313):
1. `loadScopeConfig()` fetches rows from DB
2. `assembleChecklist()` builds the base ordered field list
3. `detectTriggers()` fires modules from rep text
4. `collectRequiredFields()` merges base + module fields
5. `openQuestions()` filters to unanswered, sorted by rank
6. `buildInterviewSystemPrompt()` injects the full required field set into the AI system prompt
7. AI responds with JSON `{answered, questions_message, all_answered}`
8. Deterministic gate: `openQuestions(requiredFields, answeredKeys).length === 0` decides completion — NOT the AI's `all_answered` claim

### What Phase 1B still owes

**Nothing in the trigger-detection mechanism itself.** The SCE blueprint marks the core trigger engine as Phase 1 deliverable, and it is live.

**What is still owed across remaining phases:**
- Phase 2 (session pre-fill to fully structured form, beyond the current localStorage channel) — the current channel passes `measuredFields` but the transform from measurements → checklist field keys is thin (field_key must exactly match a checklist field_key, which current measurement data rarely satisfies)
- Phase 3 (vision reconciliation): `scope_conflict_rules` table exists with 2 rules, but no Haiku vision call is implemented; photo/plan sources are not yet being read
- Phase 4 (role instances): no client-facing or PM/sub instances built; all answers carry `source: 'typed'` only

**No `src/lib/scopeEngine.js` exists.** The blueprint (Decision A) planned both a Deno `_shared/scopeEngine.ts` (for the edge fn) and a `src/lib/scopeEngine.js` (for the frontend session→prefill transform). Only the Deno version was built. The frontend transform lives in `src/lib/sessionToEstimatePrefill.js` instead. The names diverged but the function coverage is the same — the frontend side does not need Deno APIs.

---

## DIVERGENCES TABLE

| # | Area | Plan / Blueprint Claim | Live Code Reality | Risk |
|---|------|----------------------|-------------------|------|
| D1 | 1 | MASTER_BUILD_PLAN marks AiIntakeWizard as "LiDAR scanner only" | CONFIRMED — no intake questioning in the component. Name is misleading (it is a scanner, not an intake wizard). | None — name is a design debt, not a bug |
| D2 | 2 | CLAUDE.md states "magic link RETIRED 2026-06-01" and `send-client-link` is dead for portal access | `send-client-link` edge fn is live and still called by the Master Agent `send_client_portal` verb (`ai-master-agent/index.ts` line 1293). It sends magic links that redirect to wrong tenant. The fn is not dead — it is actively callable via voice/chat. | Medium — a rep could accidentally invoke `send_client_portal` via Master Agent, client gets a broken link |
| D3 | 4 | SCE blueprint § D (Decision D): "ConsultationTab.saveEstimate's direct line-item commit are superseded" and generate-estimate-from-session should be "retired/absorbed" | `generate-estimate-from-session/index.ts` still exists and is deployed. It has been partially gutted (pricing half replaced by P1A risk-only logic) but is still a live edge function. ConsultationTab no longer calls the old pricing path — the reroute is correct. | Low — the fn is deployed but not called for estimate generation. Risk is confusion about whether it's fully retired. |
| D4 | 4 | SCE blueprint "Locked Integration Requirement (Kalin, 2026-06-25)": consultation session "auto-flows" to estimate — "auto-flow, not a manual bridge" | The flow is rep-initiated (button click in ConsultationTab: "Draft from Session"). It is NOT automatic on tab switch or session complete. The rep must explicitly click to trigger the prefill. | Low — behavior is functional; "auto" is an aspiration, not a regression |
| D5 | 4 | MASTER_BUILD_PLAN starting position note: "P2 added the STRUCTURED channel + measured SF only. Channel is dormant until Phase 3 vision fills it (measurements are quantities, not scope forks) — accepted tradeoff." | CONFIRMED — `prefilled_answers` forwarding is live but the mapping from `consultation_measurements.fields` JSONB keys to `scope_checklists.field_key` values is near-zero in practice. MeasurePanel captures per-trade `fields` like `tile.floor_sf`, not `shower_type` or `vanity_count`. The "measured" source path works mechanically but carries no useful scope-fork answers today. | Low — accepted tradeoff, documented |
| D6 | 3 | SCE blueprint § 3.1 format example for `scope_checklists.adds_trades` uses full `trade_taxonomy` path strings (e.g. "Tile - Wall / shower") | Live seed uses the same full-path convention. However, the column is `adds_trades text[]` and is not FK-constrained to `trade_taxonomy`. The engine uses `adds_trades` for informational context only (displayed to AI in the vocabulary section); it does not gate which rate_book_labor rows are loaded. | Low — informational gap; no breakage |
| D7 | 3 | `scope_conflict_rules` seeded with 2 rules (shower_fixture_conflict, wet_wall_window_omission) | Conflict rules exist but NO code reads them. The `loadScopeConfig()` function does NOT query `scope_conflict_rules`. The `handleScopeInterview` flow has no reconciliation step. Phase 3 (vision reconciliation) is the planned consumer — it is not built. | Low — schema is future-proofed correctly; no false confidence |
| D8 | 5 | Blueprint Decision A: "src/lib/scopeEngine.js (deterministic checklist assembly + the session→prefill transform)" | `src/lib/scopeEngine.js` does NOT exist. The frontend prefill lives in `src/lib/sessionToEstimatePrefill.js` (a different file with a different name). The Deno edge engine is in `_shared/scopeEngine.ts`. The "one scopeEngine.js" plan split into two files. | None — functionally equivalent; naming diverged |
| D9 | 1 | CLAUDE.md AI Component Map: AiSetupWizard "7-question onboarding wizard. Opens via manual button on AiKnowledgeScr." MASTER_BUILD_PLAN B1.7: "retire AiSetupWizard" | `avenstone-vite/src/components/ai/AiSetupWizard.jsx` file exists but has NO live import references anywhere in `src/` (Grep confirmed zero matches for "AiSetupWizard" in .jsx files). It is dead code. MASTER_BUILD_PLAN B1.7 retirement claim is accurate. | None — truly unreferenced dead code |
| D10 | 3 | Only `bathroom` project_type is seeded in `scope_checklists` | Confirmed live: 13 rows, all `project_type='bathroom'`. The interview fires and returns `scope_complete: true` (no questions asked) for ANY non-bathroom project_type because `baseFields.length === 0` triggers the early return (ai-estimator line 217–220). Kitchen, basement, exterior jobs get no scope interview today. | Medium — scope interview is effectively bathroom-only. Opus seed content design must account for this gap explicitly. |
| D11 | 4 | SCE blueprint P1A: "retire gefs pricing, preserve oh_shit_moments risk capture" | `generate-estimate-from-session` main handler (lines 121–182) has been cleanly gutted of pricing. Line 167 comment: "P1A: pricing is intentionally NOT done here." The handler calls only `captureSessionRisks()` and returns `{ok, oh_shit_moments, measurements}`. The old invented-price path is fully removed, not just commented out. | None — correctly retired |

---

*Audit produced 2026-07-01. Read-only. No code changes. No migrations.*
