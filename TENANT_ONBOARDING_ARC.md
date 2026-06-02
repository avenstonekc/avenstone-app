# Tenant Onboarding Arc — Design Blueprint

_Living doc. Update each phase as it ships. Audit source: onboarding/wizard reconnaissance (2026-06-02). Blueprint session: 2026-06-02. This arc is the white-label spine — it makes the app actually tenant-configurable so a real onboarding wizard can configure a second tenant. The wizard UI itself is the LAST phase; everything before it builds the structured config surfaces the wizard will write to._

## Purpose

Avenstone is architected multi-tenant, but onboarding is hollow. The existing AiSetupWizard (7-step form, AiSetupWizard.jsx) captures real config — labor rate, markup %, trade specialization — and writes ALL of it as free-text sentences into `ai_knowledge` ("Our standard material markup is 22%"). That text is injected into AI companion prompts where an LLM may read it. The structured engines that deterministically compute money — `markup_category_config`, `takeoff_unit_costs`, `trade_taxonomy`, `trade_phase_map` — NEVER receive any of it. The wizard and the engines are disconnected. A second tenant who ran onboarding today would get Avenstone's seeded config, not their own, while an AI sentence claimed otherwise.

This arc closes that disconnect AND adds the missing config dimension (bid model) AND builds the interview-driven estimate engine that reads all tenant config. It is the foundation that makes white-label real: trade + input methods + bid model + markup, all per-tenant structured config, all read by one estimate engine that adapts to them.

**Replaces**: the `ai_knowledge`-only wizard write path (wizard becomes a writer of structured config).
**Augments**: AiSetupWizard, the estimate engine (sbCommitEstimate rail, shipped 2026-06-02), markup_category_config (shipped 2026-06-02).
**Powers**: real tenant onboarding, trade-adaptive estimating, allowance/customer-supplied/labor-only bid models, the anti-surprise interview at estimate time.

## Why Now

The estimate-to-financials machine was unified 2026-06-02 (ESTIMATE_FLOW_ARC: one commit helper sbCommitEstimate across all four input paths, one markup source markupRateForCategory, markup applied at proposal time, estimate→contract bridge, oh-shit→CO loop). That machine works for Avenstone as a GC tenant. The next leap is making it work for ANY tenant via configuration, not code. With ~20 mixed-trade testers (painters, deck, plumbers) ready, onboarding must write config the engines actually read, and the engine must adapt to each tenant's trade and bid model. The wizard is built last — only after the app can honor what it configures.

## Core Mental Model

> An estimate is an INTERVIEW. The tenant's onboarding config (trade + enabled input methods + bid model per category + markup per category) seeds and shapes the interview. Inputs (voice/text, photo-in-interview, plan upload, scan) feed it. The AI interrogates to fill gaps — and the gaps it asks about are driven by config: where bid model is settled it produces that line shape silently; where bid model is "ask" it interviews. Output is a FULLY EDITABLE draft (add/remove lines, change prices, adjust). Human refines. Commits on the sbCommitEstimate rail to estimate_line_items → financials.

Four tenant-config dimensions, all per-tenant, all set at onboarding, all read by the estimate engine:
1. **Trade** — what they do (exists: trade_taxonomy, trade_phase_map; wizard doesn't write them yet).
2. **Input methods enabled** — do they scan? bid off plans? (scan exists/partial; plan upload MISSING; photo-in-interview NEW). Determines which input buttons a tenant sees.
3. **Bid model per category** — full_supply / allowance / customer_supplied / labor_only / ask (NET-NEW, no schema today).
4. **Markup per category** — labor_rate / material_rate / flat (SHIPPED 2026-06-02: markup_category_config).

The "ask" state on bid model is the mixed-tenant mechanism: a tenant who "sometimes supplies, sometimes the customer does" is flagged ask, and the AI interview asks per-bid. Settled categories never get asked. This makes the engine flexible without being rigid.

## Locked Decisions

1. **bid_model_config is a NEW table, mirroring markup_category_config's shape** — NOT a column on markup_category_config. "How to mark up" and "who supplies it" are orthogonal concerns. Shape: (id, tenant_id, category CHECK IN labor/sub/materials/equipment/permit/other, supply_model CHECK IN full_supply/allowance/customer_supplied/labor_only/ask, created_at, UNIQUE(tenant_id, category)). Platform defaults seed at migration; tenant rows override. Same pattern proven by markup_category_config.
2. **supply_model includes 'ask'** — the "it varies, AI interviews per bid" state. This is the flexibility mechanism, not a separate system.
3. **Bid model shapes the line structure the AI produces**: full_supply → material+labor lines, marked up; allowance → allowance line (client owns over/under delta, ties to oh-shit/predicted-CO when exceeded); customer_supplied → NO material line, labor only; labor_only → labor lines only. The estimate engine and AI interview both read bid_model_config.
4. **The estimate is interview-driven, not extraction-driven.** Every input (text/voice/photo/plan/scan) SEEDS an interview; the AI interrogates to fill gaps before producing the draft. Photo is CONTEXT attached to the voice/text interview, not a separate estimator path.
5. **All estimator output is fully editable before commit** — add/remove lines, change prices, adjust quantities/markup. AI proposes, human disposes. The AI does not know local quirks, existing conditions, client preferences. Draft → human refine → sbCommitEstimate.
6. **The wizard writes STRUCTURED config, not just ai_knowledge text.** Onboarding must write markup_category_config, bid_model_config, takeoff_unit_costs, trade selection — not just ai_knowledge. The structured engines read structured config, never prose.
7. **Wizard UI is the LAST phase.** Build the config surfaces and the engine that reads them first; the app must honor config before a tenant configures it.
8. **Plan upload is a new input source on the existing sbCommitEstimate rail** — it normalizes to NormalizedEstimateInput like every other source. Supports clean PDFs, photos, and hand sketches (all via vision extraction). "Making plans" is OUT of this arc (handled by FLOOR_PLAN_LAYOUT_ARC / FLOOR_PLAN_EDITOR_ARC — already scoped).

## Phase Plan

| Phase | Scope | Est. Prompts | Status |
|-------|-------|--------------|--------|
| 1 — bid_model_config schema | New table mirroring markup_category_config, platform defaults seeded, RLS scoped, sbLoadBidModelConfig helper. The 'ask' state included. | 2 | Planned |
| 2 — Estimate engine reads bid model | sbCommitEstimate + proposal-time logic + AI interview adapt to supply_model per category: line shape (full_supply/allowance/customer_supplied/labor_only) driven by config; 'ask' categories surface as interview questions. | 3 | Planned |
| 3 — Allowance as first-class concept | Allowance lines get distinct representation (vs description-convention today); over-allowance ties to oh-shit/predicted-CO (anti-surprise loop, ESTIMATE_FLOW_ARC). | 2 | Planned |
| 4 — Interview engine + photo-in-interview | The AI interview layer: input seeds it, AI interrogates gaps per trade + bid model, photo attaches as context to voice/text. Fully editable draft output with add/remove/reprice buttons. | 4 | Planned |
| 5 — Plan upload ingest | PDF/photo/sketch → vision extraction → NormalizedEstimateInput → editable draft. New input source on the sbCommitEstimate rail. Trade profile gates what's extracted (GC reads all, painter reads SF/cabinets/doors). Human review before commit (mandatory — anti-surprise: an estimate on a misread plan is the opposite of the goal). | 3 | Planned |
| 6 — Wizard writes structured config | Rewire AiSetupWizard to write markup_category_config, bid_model_config, takeoff_unit_costs, trade selection — not just ai_knowledge. Close the disconnect. | 3 | Planned |
| 7 — Onboarding wizard UI (LAST) | The tenant-facing wizard that sets all four dimensions. Built last, after the app honors config. Then test onboarding a real client. | 4+ | Planned |

**Total: ~21+ prompts across 7 phases. Multi-session arc.** Phases 1–5 make the engine tenant-adaptive; Phase 6 wires the existing wizard; Phase 7 is the new onboarding UI + first real tenant test.

## Reuse vs Net-New

**Reuse:** markup_category_config (the proven per-category-per-tenant pattern — bid_model_config mirrors it exactly); sbCommitEstimate + NormalizedEstimateInput (the unified write rail — plan upload + all inputs land here); markupRateForCategory (the shared markup mapper); the platform-default + tenant-override pattern (trade_taxonomy, takeoff_templates, takeoff_unit_costs all use it); oh_shit_moments + oh-shit→CO loop (allowance overages tie into it); job_files + Haiku vision pipeline (UNIFIED_FILES — the foundation for plan/photo ingest); AiSetupWizard (the 7-step form to rewire in Phase 6); the Davis-style job_estimates.estimate_data ingest precedent (closest existing PDF→estimate pattern for plan upload).

**Net-New:** bid_model_config table; the AI interview engine (gap-interrogation driven by trade + bid model); allowance as first-class line concept; plan/photo/sketch vision-extraction edge function; input-method-enabled config; the onboarding wizard UI (Phase 7).

## Regression Guards

- Everything shipped 2026-06-02 must not regress: sbCommitEstimate single write path, markupRateForCategory single markup source, Houston byte-identical financials, accrual sync, sub-invoice editing, PM fee in client projected total, contract labeling (original $97,488 / authorized $102,002), oh-shit→CO loop, the four backlog cleanups.
- bid_model_config defaults must produce CURRENT behavior (everything full_supply / today's implicit model) so existing jobs and Avenstone are unaffected until a tenant configures otherwise — same no-op-on-default discipline that made markup_category_config safe.
- The fixed-price vs cost-plus CO asymmetry is a PERMANENT rule (fixed-price COs update co_total NOT contract_value; cost-plus contract_value absorbs marked-up CO) — do not "unify" it.
- Plan upload Phase 5 must require human review before commit — never auto-commit a vision-extracted estimate.

## Open Questions

- Bid model: is it truly per-category, or do some tenants want a single job-level bid model? (Per-category mirrors markup config and is more flexible; confirm against real tenant onboarding.)
- Plan vision extraction: clean-PDF accuracy vs hand-sketch accuracy will differ a lot — Phase 5 may need a confidence/review gate that's stricter for messy inputs.
- Does input-method-enabled config need its own table, or a JSONB column on a tenant settings row? (Lighter than a full table for a handful of booleans.)
- Ai interview: edge-function-hosted (like ai-estimator) or extend an existing agent? Decide at Phase 4.

## Amendments

_Empty — update as phases ship._
