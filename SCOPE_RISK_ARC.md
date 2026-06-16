# Scope Risk Arc — Design Blueprint

_Blueprint only — not started. Gated on ESTIMATOR_KNOWLEDGE_ARC shipping first. Design captured 2026-06-16._

---

## Purpose (2026-06-16)

When a GC presents an estimate, there is a class of things that are not in scope, are not
being quoted, and will probably never happen — but if they do happen, the client will be
blindsided by a number they never saw coming. That blindside is where trust breaks down,
projects stall, and arguments start.

The fix isn't change orders or mid-job infrastructure. The fix is transparency at the
point of sale: **tell the client what the experienced GC already knows to watch for,
show them a rough dollar range, and send them into the project prepared.**

> "On a bathroom this age, we sometimes open the wall and find mold or old plumbing —
> probably won't, but if we do, it's roughly $X. Wanted you prepared."

The Scope Risk Arc builds an optional **"Potential Considerations"** section (final name
TBD at build time) on the estimate and proposal. It is a professionalism and closing
tool — it signals that Avenstone is experienced, thorough, and not hiding anything. The
client signs with eyes open. If something does come up mid-job, it's a confirmation of
what was discussed, not a shock.

---

## What This Is NOT (do not drift from this)

These are the exact things Kalin was emphatic about during the 2026-06-16 design session.
If any future build decision would cross these lines, stop and re-discuss.

**NOT change orders.** This section has nothing to do with the `change_orders` system,
CO markup, photo gates, or mid-job approval flows. It does not touch any of that
infrastructure. It is estimate content shown at sale time.

**NOT staged transactions.** There is no mid-job triggering, no pending CO queue, no
auto-draft on risk discovery. These items don't get promoted to COs automatically, don't
get invoiced, and don't flow through the financial system. They are informational text on
a document.

**NOT upsells or luxury adds.** A chandelier upgrade, a steam shower option, a heated
floor alternative — these are spec variants, not scope risks. They do not belong in this
section. The section is for conditions the GC might find that weren't knowable during
scope; not for alternatives the client might want.

**NOT required baseline scope.** If a line item genuinely belongs in every estimate of
this type — shower waterproofing membrane, Schluter edge, RedGard, structural blocking
behind fixtures — it belongs in the **core estimate automatically**. The estimator should
always include these; they are baseline correctness, not optional risks. Putting required
scope here would create a loophole to underbid by hiding known-necessary work.

---

## Finalized Design (2026-06-16)

### The section is optional and sometimes absent

Not every job has scope risks worth flagging. Painting a single room has no hidden
surprises worth itemizing. The "Potential Considerations" section should appear only when
there is something genuinely worth surfacing — and it should be absent entirely when
there isn't. It is **never forced**.

The GC controls whether the section appears. For AI-assisted estimates, Aven suggests
risk items based on job type; the GC reviews and keeps or removes them before
presenting to the client.

### Items are informational — excluded from the quoted total

Every item in this section is explicitly labeled as:
- Conditional ("if we find this")
- Not included in the current price
- Approximate only

The section renders separately from the line-item estimate — clearly visually distinct,
with a header that sets the expectation before the client reads a single number. Nothing
in this section is summed into the estimate total, the subtotal, the markup calculation,
or the contract value.

### Rough pricing pulls from the Rate Book

The ballpark figures shown to clients must not be invented by the model. They are
derived from the same Rate Book (`ai_knowledge`) that the core estimator uses. This
ensures:
- The numbers are consistent with the rest of the estimate
- There is an audit trail for where the range came from
- The Rate Book, not training-data guesses, is the single source of truth

This is a hard dependency: SCOPE_RISK_ARC cannot ship until ESTIMATOR_KNOWLEDGE_ARC has
wired the estimator to read from `ai_knowledge`.

### Prints on the client-facing estimate and proposal

The "Potential Considerations" section appears in the same output formats as the main
estimate — the in-app proposal view and any PDF export. It is client-visible, plainly
labeled, and styled to be clearly distinct from the quoted scope so there is no
ambiguity about what is and isn't in the price.

---

## Architecture Notes (flag for blueprint — no decisions made here)

These are open questions that need to be answered at blueprint time, not now.

### Risk knowledge source: reuse or new?

The per-trade risk suggestions ("bathroom remodel → watch for mold, old cast iron,
tile-over-tile, subfloor rot") are trade/scope-keyed knowledge entries. This is the same
shape as existing `tenant_playbook_items` — a per-trade library of GC knowledge that can
vary by tenant. **Investigate at blueprint time:** can `tenant_playbook_items` be reused
or extended (adding a `risk_type` or `category = 'scope_risk'` filter), or does this
need its own lightweight table? Avoid creating a new table if an existing one handles it.

### Who populates the risk library?

Open question — at least three viable models:
1. **Aven suggests, GC edits:** The AI generates risk items from job type at estimate
   time; the GC reviews before sending.
2. **GC picks from tenant library:** The GC has a curated list of per-trade risks they
   maintain in the Rate Book / playbook; they add/remove items per estimate.
3. **Both:** Aven suggests from a platform-default library; tenant can customize.

This is a product decision, not a technical one. Capture it as open.

### Rendering location

These items ride on top of the structured-estimate work from ESTIMATOR_KNOWLEDGE_ARC.
They are likely flagged line items (e.g., a flag on `estimate_line_items` like
`is_risk_item = true` or a separate section type) that the proposal renderer collects
into a distinct section. The exact mechanism depends on how the structured estimate is
built in ESTIMATOR_KNOWLEDGE_ARC — this arc inherits that shape.

### Standalone arc or phase of ESTIMATOR_KNOWLEDGE_ARC?

Given the dependency and the shared rendering surface, this may be more naturally a
late phase of ESTIMATOR_KNOWLEDGE_ARC than a standalone arc. Flag for blueprint.
Decision criteria: if the estimate output format and the Rate Book wiring are both
shipping in ESTIMATOR_KNOWLEDGE_ARC anyway, the delta for SCOPE_RISK is small (risk
knowledge source + optional section rendering). That argues for folding it in. Leave
the decision for when ESTIMATOR_KNOWLEDGE_ARC's scope is finalized.

---

## Dependencies

1. **ESTIMATOR_KNOWLEDGE_ARC must ship first** — the Rate Book wiring (structured estimate
   reading from `ai_knowledge`) is a hard prerequisite. Rough pricing in the
   "Potential Considerations" section must come from Rate Book, not from the model.

2. **Structured estimate output** — the section renders alongside the structured line-item
   estimate that ESTIMATOR_KNOWLEDGE_ARC produces. Cannot render before that exists.

3. **Relates to `tenant_playbook_items`** — investigate overlap at blueprint time before
   designing a new data source.

---

## Open Questions (deferred to blueprint)

1. **Risk knowledge source:** new table, extend tenant_playbook_items, or ai_knowledge
   entries with a scope_risk category?
2. **AI vs GC vs both:** who populates the per-trade risk list and how?
3. **Section name:** "Potential Considerations" is the working name. Confirm with Kalin
   at build time.
4. **Rendering mechanism:** flag on estimate_line_items, separate table, or section
   marker — depends on ESTIMATOR_KNOWLEDGE_ARC's output shape.
5. **Standalone arc or phase:** resolve when ESTIMATOR_KNOWLEDGE_ARC scope is final.

---

## Rough Phasing

_Effort estimates in Sonnet prompts; refine at blueprint time. These phases assume
ESTIMATOR_KNOWLEDGE_ARC has shipped._

1. **Risk knowledge source** — decide data model (reuse tenant_playbook_items or new).
   Seed Avenstone's per-trade risk library (bathroom, kitchen, full-gut, exterior,
   roofing at minimum). May fold into the Rate Book data work.

2. **Estimator integration** — when AI builds an estimate, have Aven suggest applicable
   risk items from the trade/scope library. GC reviews and keeps/removes before sending.

3. **Rendering** — "Potential Considerations" section renders in the estimate view and
   proposal PDF, clearly separated from quoted scope, with conditional language and
   ballpark ranges pulled from Rate Book.
