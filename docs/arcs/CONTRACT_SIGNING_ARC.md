# Contract Signing Arc — Design Blueprint

> **STATUS (2026-06-19):** Future arc. STOP — Gap 5 (magic links possibly dead, retired 2026-06-01) MUST be verified as its own dispatch before any signing-flow build. Do not build on an unverified send path. Has LEGAL stakes — attorney review required before wiring full signing flow. `ClientSignContractModal.jsx` exists but signs boilerplate with no line items/price.

_Blueprint only — not started. Audit complete 2026-06-15. Has LEGAL stakes — do not rush; design before building._

---

## Why This Matters

The path "send proposal → client reviews the actual numbers → signs a contract containing those numbers → status flows correctly → audit trail holds up legally" is currently broken or disconnected at almost every step. Most urgent finding has legal exposure (see Gap 1).

---

## Audit Findings (2026-06-15) — Current State of Send / Sign

### Three "send" actions, all distinct

- **"Send to Client" (Build tab, `sendEstimateToClient`):** BROKEN. `sbSendEstimateEmail` sends `{ client_email, ... }` but the `send-estimate-email` edge fn destructures `{ to, ... }`. `to` is never populated → guard `if (!to || !pdf_base64)` returns 400 immediately. Email never sends. Also `html` body is never passed from the helper → body would be blank even if `to` were fixed.

- **"Save to Documents" (Proposal tab, `generateProposalPDF`):** saves PDF to `job-documents` bucket. Sends NO email. Client has no portal tab to view it (see Gap 2).

- **"Accept Estimate" (Line Items tab, `handleAcceptEstimate` → `sbSetContractFromEstimate`):** internal only. Sums `total_cost` + per-category markup + `pm_fee` → writes `jobs.contract_value` + `job_estimates.estimate_data.contract_total`. Does NOT change status, notify client, or create a signature record. Rep-side "lock in the number" only.

### Client portal (`ClientPortal.jsx`)

- Client is routed here when `profile.role === 'client'`. Tabs: Overview, Updates, Invoices, Schedule, Photos, Messages (+ Financials for cost_plus). **NO Proposal tab. NO Documents tab** (`docs` tab is explicitly dead code, `ClientPortal.jsx:348`).
- Client **cannot** see the proposal PDF anywhere in the portal.
- Overview shows: ProgressStepper (`Lead → Proposal → Contract → In Progress → Final Touches → Complete`), "contract ready to sign" banner when `contract_signed = false`, contract value / paid / remaining when `contract_value` is set.
- Two access pathways: (1) password login via `create-client-login` (canonical per CLAUDE.md); (2) magic link via `send-client-link` / `send-contract-email` — CLAUDE.md says magic links were **retired 2026-06-01** because they redirect to wrong project/tenant. See Gap 5.

### Signature flow (exists — partially functional)

- Info tab "Send Contract" → `ContractModal` → `sbSendContractEmail` → `send-contract-email` edge fn: creates/updates client auth account, upserts `profiles` with `role = 'client'`, sets `jobs.client_user_id` + `client_email`, generates magic link, emails "Review & Sign →" button, optionally attaches contract PDF.
- Client clicks link → portal → "Sign Now" → `ClientSignContractModal` (steps: review → sign → done). Reads `DEFAULT_CONTRACT_TEXT(job)`: a 10-clause boilerplate agreement with address + client name filled in. **No line items. No price. No payment schedule.**
- Client draws signature on canvas (`SignaturePad.jsx`).
- On submit: `buildGenericPDF({docType:'CONTRACT', bodyText: DEFAULT_CONTRACT_TEXT, signaturePng})` → upload to `job-documents` (client_visible: true) → `sbSaveSignature` inserts `contract_signatures` row `{ job_id, tenant_id, type:'contract', signed_by_name, signed_by_email, signature_data:png, signed_at, document_url }` → `jobs.update({ contract_signed:true, contract_signed_at, status:'in_progress' })` → notify owner.
- `contract_signatures.ip_address` column EXISTS but is **never populated**.
- Change orders reuse `send-contract-email` with `contract_type:'change_order'` from `COTab.jsx`.

---

## Gaps to Fix (Priority Order)

### Gap 1 — LEGAL: Proposal and contract are completely disconnected (HIGHEST PRIORITY)

The client signs a boilerplate text contract with **no dollar amounts, no line items, no payment schedule**. They could sign without ever seeing the $6,524 they're agreeing to pay. The signed contract has no embedded reference to the proposal numbers. This is legal exposure: a signature on a document that doesn't state price or scope.

**Fix direction:** The signed contract must embed or reference the accepted proposal (price, scope, payment schedule), and/or the client must acknowledge the proposal before signing. Decide: does the contract PDF include the proposal line items + grand total + payment schedule, or does it reference an attached proposal the client must view first?

### Gap 2 — Client can't see the proposal in the portal

PDF saves to `job-documents` but the portal Documents tab is dead code. Client has no way to view what they're paying for.

**Fix direction:** Add a client-visible Proposal/Documents view in `ClientPortal` so the client can review the proposal before signing.

### Gap 3 — "Send to Client" email bug (quick fix, deferred to this arc)

Field mismatch `client_email` vs `to` + missing `html` body in `sbSendEstimateEmail` → `send-estimate-email` returns 400. Small fix but folded here to keep the send/sign work together. (Could be pulled out as a standalone slice if a working proposal email is needed sooner.)

### Gap 4 — No IP captured on signatures

`contract_signatures.ip_address` exists, never populated. For ESIGN/UETA e-signature validity the audit trail (IP + timestamp + what-was-signed) matters.

**Fix direction:** Capture client IP at signature submit. Ensure the signed document is locked to exactly what was presented.

### Gap 5 — Magic links may be broken (VERIFY FIRST)

`send-contract-email` + `send-client-link` use magic links CLAUDE.md flags as redirecting to wrong project/tenant (retired 2026-06-01). If broken, the "Review & Sign" email is unusable and the entire sign flow is dead on arrival. **This must be verified before building anything else in this arc** — if the client can't reach the portal, Gaps 1–4 are moot.

**Likely fix:** Route signing through the canonical password-login path (`create-client-login`) instead of magic links, OR fix the magic link redirect.

### Gap 6 — Status flow doesn't match lifecycle

Portal stepper shows `Lead → Proposal → Contract → In Progress`, but signing jumps straight to `in_progress`; `proposal` and `contract` statuses are never set by any code path.

**Fix direction:** Make signing advance status through the correct lifecycle phases. Intersects the Model B lifecycle consolidation work — cross-reference.

---

## Build Order (Rough)

1. **Verify Gap 5 (magic links) first** — determines whether the entire flow is reachable. Fix access path if broken.
2. **Gap 1 (legal)** — make the signed contract contain or reference the actual proposal numbers + scope.
3. **Gap 2** — client can view the proposal in the portal before signing.
4. **Gap 3** — fix the Send to Client email (or pull earlier if needed standalone).
5. **Gap 4** — IP capture + document-locking for audit trail.
6. **Gap 6** — status lifecycle alignment (coordinate with Model B arc).

---

## Cross-References

- **Model B lifecycle consolidation** (status flow) — Gap 6.
- **ESTIMATOR_KNOWLEDGE_ARC** — proposal numbers feeding the contract come from the estimate engine; rate accuracy upstream affects what the client signs.

---

## Not a Lawyer

The legal exposure in Gap 1 and Gap 4 is flagged as a non-lawyer observation. Before relying on this e-signature flow for binding contracts, have the contract template and e-signature audit trail reviewed by an attorney licensed in MO. ESIGN/UETA compliance is a legal question, not just an engineering one.
