# Sub Invoices Arc — Design Blueprint

_Living doc. Update each phase as it ships._

---

## Purpose

First-class accounts-payable workflow for sub invoices. Receives invoices (PDF upload or manual entry), runs an approval gate (owner/PM only), tracks partial payments through to fully paid, and links to lien waiver collection downstream. Distinct from `job_transactions` — which records money already paid (expenses, draws, receipts) — sub invoices represent money **owed** until paid in full.

**Replaces**: nothing — net-new workflow. Today subs email PDFs, payments are tracked manually outside the app.

**Augments**: FinancialsTab (new "Sub Invoices" section), job_files (invoice PDFs land there with `category='Sub Invoices'`), job_transactions (each payment writes a transaction row for cash accounting), Master Agent (three new confirm-gated verbs).

**Powers downstream arcs**: lien waiver collection (waivers tied to specific paid invoices via `lien_waiver_file_id`), cash flow forecasting (unpaid AP visible), sub financial visibility (subs see what they're owed), materials-to-financials (supplier invoices follow the same pattern).

---

## Why Now

Real product gap. Kalin runs Avenstone but tracks AP outside the app today. Three concrete problems:

**1. No partial-payment audit trail.** Sub gets $2,000 today, $1,500 next week, $700 final. No record of which check covered which portion. When a sub claims they weren't paid, there's no source of truth inside the app.

**2. No "what do I owe" view.** Owner can't see "approved unpaid invoices total $12,300 across 4 subs" without manually adding it up outside the app.

**3. Lien waiver workflow can't exist without invoice tracking.** Waivers attach to specific paid invoices. No invoice tracking = no waiver workflow = mechanic's lien risk on every closed job. This arc is the foundation.

---

## Flow

Invoice arrives (email/text/handed over) → rep uploads PDF or enters manually → Master Agent / Haiku vision extracts fields → confirm card → invoice lands at `status='pending_review'` → owner or PM clicks Approve → status becomes `'approved'` → owner cuts check → clicks **Add Payment**, fills amount + method + reference + date → if `paid_sum < amount`, status becomes `'partially_paid'` with remaining balance visible → repeat Add Payment until `paid_sum >= amount` → status becomes `'paid'` → triggers lien waiver collection todo (future arc) → waiver lands in job_files when collected → `lien_waiver_file_id` populated → AP chain complete.

---

## Phase Plan

| Phase | Scope | Estimated Prompts | Status |
|-------|-------|-------------------|--------|
| 1 — Schema foundation + helpers | `sub_invoices` + `sub_invoice_payments` tables, `compute_sub_invoice_status` function, `sbCreateSubInvoice`, `sbApproveSubInvoice`, `sbDisputeSubInvoice`, `sbVoidSubInvoice`, `sbAddSubInvoicePayment`, `sbVoidSubInvoicePayment`, `sbLoadSubInvoices` | 3 | Planned |
| 2 — FinancialsTab UI section | Three-bucket layout (Pending Review / Approved Unpaid + Partially Paid / Paid), invoice detail panel with payment history, Add Payment modal, role-gated Approve and Dispute buttons | 3 | Planned |
| 3 — Upload + manual entry flow | PDF upload → Haiku vision extraction → pre-filled form → confirm; manual entry → blank form → confirm; invoice number auto-generation fallback; line item JSONB handling (lump sum vs itemized) | 2 | Planned |
| 4 — Cash accounting integration | Each `sub_invoice_payment` row writes a corresponding `job_transactions` row (`direction='out'`, `type='sub_payment'`, `invoice_id` FK populated); voiding a payment voids the linked transaction | 1 | Planned |
| 5 — Master Agent verbs | `log_sub_invoice` (PDF or manual), `log_sub_payment` (amount + method + reference), `approve_sub_invoice` — all confirm-gated; ambiguity handling for multiple unpaid invoices per sub | 2 | Planned |
| 6 — Sub portal submission | Sub uploads own invoice via portal → lands in `pending_review` with `submitted_via='sub_portal'`; notification to owner+PM | 2 | Future (after sub portal expansion arc) |

**Total v1: ~11 prompts across Phases 1–5. Phase 6 deferred.**

---

## Reused vs Net-New

### Reused (wire up, don't rebuild)

- **`contacts` table** — sub identity (`contacts.id` is TEXT). `sub_invoices.sub_contact_id TEXT REFERENCES contacts(id)`.
- **`job_files` table** — invoice PDFs land here with `category='Sub Invoices'`, `related_entity_type='sub_invoice'`, `related_entity_id=sub_invoices.id`. Signed URL pattern for display.
- **`job_transactions` table** — each payment row writes a transaction (`direction='out'`, `type='sub_payment'`). `job_transactions.invoice_id UUID` already exists in the schema — this FK is the integration point (confirmed in schema audit: column present, UUID type matches `sub_invoices.id`).
- **`schedule_items`** — optional FK via `related_schedule_item_id UUID REFERENCES schedule_items(id)`.
- **Haiku vision pattern** — same as `ai-categorize-file`. Extracts invoice number, date, amount, vendor name, line items from PDF image.
- **Master Agent CONFIRM_TOOLS pattern** — all three new verbs are confirm-gated. Same Set + confirm card flow as `log_receipt` and `log_payment`.
- **Role gate pattern** — `profiles.role IN ('owner', 'project_manager')` checked at helper level and enforced at RLS.
- **`set_updated_at()` trigger** — existing function, applied to both new tables.
- **Notification fanout pattern** — payment event notifies sub via portal (future Phase 6 notif).

### Net-New (must build)

- `sub_invoices` table + RLS + indexes + trigger
- `sub_invoice_payments` table + RLS + indexes + trigger
- `compute_sub_invoice_status(invoice_id UUID)` function
- Helpers: `sbCreateSubInvoice`, `sbApproveSubInvoice`, `sbDisputeSubInvoice`, `sbVoidSubInvoice`, `sbAddSubInvoicePayment`, `sbVoidSubInvoicePayment`, `sbEditSubInvoice`, `sbLoadSubInvoices`
- Invoice number auto-generation (format: `<sub-slug>-<job-short>-<seq>`)
- FinancialsTab "Sub Invoices" section with three-bucket layout
- Invoice detail panel with payment history table
- Add Payment modal
- Approve / Dispute / Void action buttons (role-gated)
- Master Agent verbs: `log_sub_invoice`, `log_sub_payment`, `approve_sub_invoice`
- Haiku vision call for invoice field extraction (on PDF upload)

---

## Locked Decisions

**1. Separate table for invoices, not an extension of `job_transactions`.** Different state machine (pending_review → approved → partially_paid → paid vs the simple expense flow). Different lifecycle, different approval gate. `job_transactions` is for money already recorded; sub invoices are money owed until paid.

**2. Separate table for payments (`sub_invoice_payments`).** Each payment is its own row linked to `sub_invoices` via `sub_invoice_id`. This allows partial payments, per-payment voiding without losing the audit history, and downstream linkage to `job_transactions` for cash accounting. A single `amount_paid` column on `sub_invoices` would lose the per-check audit trail.

**3. Cash accounting only.** Invoice receipt does NOT hit the books. Each `sub_invoice_payments` row writes a corresponding `job_transactions` row at `paid_date`. `job_transactions.invoice_id` (UUID, confirmed in schema) is the FK link. This is cleaner than accrual accounting for a v1 contractor tool — fewer edge cases, matches how GCs actually think about AP.

**4. Status is DERIVED, not stored.** Computed by `compute_sub_invoice_status(invoice_id)` from approval state + `SUM` of non-voided payments vs invoice amount. No `status` column on `sub_invoices` — no stale data, no sync bugs. Statuses:
   - `pending_review` — not yet approved, no voiding
   - `approved` — approved, zero payments
   - `partially_paid` — approved AND `0 < paid_sum < amount`
   - `paid` — `paid_sum >= amount`
   - `disputed` — `disputed = TRUE`, freezes all payment and approval actions
   - `voided` — `voided_at IS NOT NULL`, invoice cancelled entirely

**5. Owner and PM approve. Sales reps upload but cannot approve.** Sales reps can create `pending_review` rows. Only `owner` and `project_manager` roles can call `sbApproveSubInvoice`. Enforced at both RLS (UPDATE policy scoped to those roles) and helper level (role check before query). Subs cannot create invoices v1 — deferred to Phase 6 (sub portal).

**6. Overpayment allowed.** If `paid_sum > amount` (rounding, accidental extra payment), status returns `'paid'`. Discrepancy is flagged in the invoice detail panel UI but does not block the save. Real-world happens — don't make the app fight the user.

**7. Edit-after-approval allowed with one safety check.** If the edited amount would be less than `paid_sum` of non-voided payments, `sbEditSubInvoice` returns an error: "Amount would be less than payments already recorded. Void payment(s) first." Any other edit (description, due date, line items) is unrestricted post-approval.

**8. Payments are voidable, not deletable.** A voided `sub_invoice_payments` row retains `voided_at`, `voided_by_id`, `void_reason`. Sum of payments excludes voided rows. The linked `job_transactions` row is also soft-voided (status='voided' or similar) in Phase 4. Full audit chain preserved.

**9. `related_schedule_item_id` is OPTIONAL and nullable.** Some invoices are for general labor not tied to a specific schedule item. `NULL` is valid and normal. When set, the FK references `schedule_items(id)` which is UUID — type matches.

**10. Multiple invoices per sub per job is normal.** Sub does demo ($1,200) + framing ($4,800) + trim ($900) → three invoices. No unique constraint preventing this. The only unique constraint is on `(tenant_id, job_id, sub_contact_id, invoice_number)` — same invoice number from the same sub on the same job is a duplicate.

**11. Dispute freezes payment and approval actions.** Can't Add Payment or Approve on a `disputed=TRUE` invoice. "Resolve Dispute" is a single-toggle action — no formal workflow v1. Owner or PM can both resolve.

**12. Invoice number: vision-extract first, auto-generate as fallback.** Vision path extracts the printed invoice number from the PDF. Manual path: user enters or leaves blank. If blank on save, auto-generate as `<sub-slug>-<job-short>-<seq>` where `seq` is `COUNT(*) + 1` for that (sub_contact_id, job_id) pair. `auto_generated_number BOOLEAN` flag persists which path was used — shows a visual indicator in the detail panel so the PM knows the number may not match the physical invoice.

**13. Line items: JSONB nullable.** `NULL` = lump sum (the `amount` column is the total, no breakdown). Array = itemized: `[{description: TEXT, qty: NUMERIC, unit_price: NUMERIC, total: NUMERIC}, ...]`. Vision extracts whatever is present. UI renders a simple table when array is present. No structural validation beyond JSONB — line item totals don't have to sum to `amount` (pre-tax, retainage, etc. make rigid math fragile).

**14. PDF and manual entry share the same backend and confirmation flow.** Vision path pre-fills the form fields. Manual path opens the same form blank. User reviews and confirms via the standard Master Agent confirm card or FinancialsTab inline form. One `sbCreateSubInvoice` call, same payload, same insert.

**15. Invoice PDF linked via FK to `job_files`.** `invoice_file_id UUID REFERENCES job_files(id)`. Manual-entry invoices can have `NULL` here — no PDF to attach. PDF uploads create a `job_files` row first (category='Sub Invoices', related_entity_type='sub_invoice'), then the `sub_invoices` row with `invoice_file_id` populated. If the FK file is deleted from job_files, `ON DELETE SET NULL` preserves the invoice record.

**16. Payment method enum.** `check`, `ach`, `cash`, `card`, `other`. `reference TEXT` is free-form (check number, ACH confirmation ID, transaction ref). `notes TEXT` for anything else. Both nullable.

**17. Lien waiver FK reserved but not built v1.** `lien_waiver_file_id UUID REFERENCES job_files(id) ON DELETE SET NULL` exists on `sub_invoices`. Nullable. Future lien waiver arc populates it when a waiver is collected. No additional migration needed when that arc ships.

**18. `submitted_via` enum future-proofs Phase 6.** `submitted_via TEXT NOT NULL DEFAULT 'manual_upload' CHECK (submitted_via IN ('manual_upload', 'pdf_upload', 'master_agent', 'sub_portal'))`. Phase 1 inserts 'manual_upload', 'pdf_upload', or 'master_agent'. Phase 6 adds 'sub_portal' — column already exists, no migration.

---

## Phase Detail

### Phase 1 — Schema Foundation + Helpers

**Migration creates:** `sub_invoices` table, `sub_invoice_payments` table, `compute_sub_invoice_status` function, indexes, RLS policies, `updated_at` triggers.

**Helpers to add to `supabase.js`:**

```
sbLoadSubInvoices(jobId)
  → Returns all invoices for a job, each augmented with computed_status
    and paid_sum. Joins sub_contact for display name. Excludes nothing
    (all statuses visible to owner/PM). Optional filter param: status.

sbCreateSubInvoice(payload)
  → INSERT sub_invoices row. Generates invoice_number if not provided.
  → Returns { ok, data, error }

sbApproveSubInvoice(invoiceId)
  → SET approved_at=NOW(), approved_by_id=AV_USER_ID.
  → Fails if disputed=TRUE or voided_at IS NOT NULL.
  → Role check: owner/PM only. Returns { ok, error }

sbDisputeSubInvoice(invoiceId, reason)
  → SET disputed=TRUE, disputed_at, disputed_by_id, dispute_reason.
  → Returns { ok, error }

sbResolveDispute(invoiceId)
  → SET disputed=FALSE, disputed_at=NULL, disputed_by_id=NULL, dispute_reason=NULL.
  → Returns { ok, error }

sbVoidSubInvoice(invoiceId, reason)
  → SET voided_at=NOW(), voided_by_id, void_reason.
  → Fails if any non-voided payments exist (must void payments first).
  → Returns { ok, error }

sbEditSubInvoice(invoiceId, patch)
  → PATCH sub_invoices. Validates new amount >= paid_sum before allowing.
  → Returns { ok, data, error }

sbAddSubInvoicePayment(invoiceId, { amount, paidDate, method, reference, notes })
  → INSERT sub_invoice_payments row.
  → Fails if invoice is disputed, voided, or not yet approved.
  → Returns { ok, data, error }  (data = new payment row)

sbVoidSubInvoicePayment(paymentId, reason)
  → SET voided_at, voided_by_id, void_reason on the payment row.
  → Returns { ok, error }
```

**Smoke test plan:**
1. Create invoice for a test job + sub contact. Confirm row inserted, computed_status = 'pending_review'.
2. Approve. Confirm approved_at populated, computed_status = 'approved'.
3. Add partial payment ($100 on a $500 invoice). Confirm computed_status = 'partially_paid', paid_sum = $100.
4. Add second payment ($400). Confirm computed_status = 'paid', paid_sum = $500.
5. Void the second payment. Confirm computed_status = 'partially_paid', paid_sum = $100.
6. Dispute the invoice. Confirm computed_status = 'disputed'. Attempt to add payment — should fail.
7. Resolve dispute. Confirm computed_status = 'partially_paid' (approval + $100 still present).
8. Create a manual-entry invoice (no PDF). Confirm invoice_file_id = NULL, auto_generated_number = TRUE.

---

### Phase 2 — FinancialsTab UI Section

**Placement:** New "Sub Invoices" section in FinancialsTab, below the existing transactions section. No new tab — FinancialsTab already handles the AP/AR picture. Single collapsible section header.

**Three-bucket layout (top-down order):**

1. **Pending Review** — all `pending_review` invoices. Yellow/amber badge. "Approve" button visible to owner/PM, hidden to sales reps. Clicking invoice row expands detail panel.

2. **Approved / Partially Paid** — all `approved` and `partially_paid` invoices. Blue badge for approved, amber for partially_paid. "Add Payment" button on each row. Each row shows remaining balance: `amount - paid_sum`. Sorted by `invoice_date` ascending (oldest owed first).

3. **Paid** — all `paid` invoices, collapsed by default (accordion expand). Shows paid_date of final payment, lien waiver status indicator (future — shows checkmark when lien_waiver_file_id is populated).

**Voided and disputed invoices** surface in a fourth accordion "Other" section, open only when there are rows.

**Invoice detail panel** (slide-in on row click, or inline expand on mobile):
- Invoice metadata: number, date, due date, sub name, description
- Line items table if present (JSONB rendered as rows); lump sum amount if NULL
- File link to PDF (signed URL via sbSignJobFileUrl) if invoice_file_id is set
- Approval info: "Approved by [name] on [date]" or "Pending review"
- Payment history table: amount | date | method | reference | voided?
- Running total: Paid / Remaining
- Action buttons: Approve (owner/PM only), Add Payment (owner/PM, invoice must be approved), Void Invoice (owner/PM, only if no non-voided payments), Dispute, flag icon if auto_generated_number=TRUE

**Add Payment modal:**
- Amount (required) — pre-fills `amount - paid_sum` as a convenience
- Date (required) — defaults to today
- Method (required) — select: Check / ACH / Cash / Card / Other
- Reference (optional) — "Check #1234", "ACH conf AV-20240512", etc.
- Notes (optional)
- Save → calls `sbAddSubInvoicePayment`, refreshes invoice row, shows success flash

**Status badges:**
- `pending_review` → amber (`#FEF3C7` / `#92400E`)
- `approved` → blue (`#EFF6FF` / `#1D4ED8`)
- `partially_paid` → gold (`#C9A84C` bg tint / `#78450A`)
- `paid` → green (`#D1FAE5` / `#065F46`)
- `disputed` → red (`#FEE2E2` / `#DC2626`)
- `voided` → gray (`#F3F4F6` / `#6B7280`)

**Role gates enforced in UI:**
- Approve button: renders only for `owner` / `project_manager`
- Add Payment button: renders only for `owner` / `project_manager`
- Dispute/Resolve: renders only for `owner` / `project_manager`
- Void Invoice: renders only for `owner` / `project_manager`
- Sales rep: sees all invoices read-only + can use the upload form to create new pending_review

**Summary bar** (top of section):
```
Sub Invoices   Pending Review: 3   Approved Unpaid: $8,450   This Month Paid: $4,200
```

---

### Phase 3 — Upload + Manual Entry Flow

**Entry points:**
1. Upload PDF button in the Sub Invoices section of FinancialsTab
2. Master Agent: "Log sub invoice from [sub name] for $[amount]" or "Upload this invoice from Mike"
3. (Future) Sub portal upload

**PDF upload path:**
1. User selects file → upload to `job-documents` bucket under `sub-invoices/<job_id>/` path
2. Write `job_files` row: `category='Sub Invoices'`, `related_entity_type='sub_invoice'`, `related_entity_id=null` (populated after invoice row is created), `lifecycle_status='active'`
3. Call Haiku vision on the uploaded file. Prompt: extract invoice number, invoice date, total amount, vendor name, line items if present. Return structured JSON.
4. Pre-fill the invoice form with extracted fields. Show extraction confidence badges on each field.
5. User reviews, corrects any wrong fields, picks which sub contact this is from (sub name match from vision is a hint, not auto-selected — avoids wrong-sub assignment).
6. User confirms → `sbCreateSubInvoice(payload)` → update `job_files.related_entity_id` to the new invoice UUID.

**Manual entry path:**
1. User clicks "Add invoice manually"
2. Same form as PDF path, but blank. No vision pass.
3. Invoice number: user enters OR leaves blank. If blank, `sbCreateSubInvoice` generates.
4. No `job_files` row created — `invoice_file_id = NULL`.

**Invoice number auto-generation:**
```
<sub-slug>-<job-id-last-6>-<seq>
e.g.: "mike-drywall-A3F9C2-3" (third invoice from this sub on this job)
seq = COUNT(*) of existing non-voided invoices for (sub_contact_id, job_id) + 1
```
`auto_generated_number = TRUE` written to flag it.

**Line item handling:**
- Vision output: if line items detected, structured as `[{description, qty, unit_price, total}]`
- Form: lump sum (single amount field, `line_items=NULL`) vs itemized toggle
- Itemized: add/remove row table, each row has description + qty + unit_price with auto-computed total
- Totals from line items auto-fill the amount field (editable override)
- On save: JSONB written as-is. No server-side validation of internal math.

---

### Phase 4 — Cash Accounting Integration

**Each `sub_invoice_payments` row creates a linked `job_transactions` row:**

```
direction = 'out'
type = 'sub_payment'
amount = payment.amount
date_paid = payment.paid_date
payment_method = payment.method
description = "Sub payment: invoice #{invoice_number} — {sub_name}"
payer_or_payee_id = sub_invoices.sub_contact_id (TEXT — matches contacts.id type)
payer_or_payee_type = 'contact'
invoice_id = sub_invoice.id  (UUID — job_transactions.invoice_id already exists, confirmed in schema)
job_id = sub_invoice.job_id
tenant_id = sub_invoice.tenant_id
created_by = AV_USER_ID
```

This write happens inside `sbAddSubInvoicePayment` — single DB round-trip using a transaction (or sequential inserts with rollback on error).

**Voiding a payment:**
- `sbVoidSubInvoicePayment` voids the `sub_invoice_payments` row
- Also sets `status='voided'` on the linked `job_transactions` row (look up by `invoice_id` + `amount` + `date_paid` to find the correct row)

**Why not just use `job_transactions` directly for sub invoices?**
The existing transactions table models completed payments — no approval state, no partial-payment sequence, no invoice-level grouping. Sub invoices need a lifecycle with approval gates. The two-table approach (sub_invoices + sub_invoice_payments → job_transactions) keeps the ledger clean while adding the workflow layer.

---

### Phase 5 — Master Agent Verbs

**Three new confirm-gated verbs added to `CONFIRM_TOOLS`:**

**`log_sub_invoice`**
- Input schema: `sub_name TEXT` (fuzzy-matched to contacts.name), `amount NUMERIC`, `invoice_number TEXT?`, `invoice_date TEXT?`, `job_id TEXT?`, `description TEXT?`, `line_items JSONB?`, `file_attached BOOLEAN?`
- Intent: record a sub invoice as pending review
- Confirm card: "Add invoice from {sub_name} for ${amount}. Invoice #{number}. Job: {address}."
- Ambiguity: if job_id not provided, call `get_jobs` first (same pattern as `log_receipt`). If sub_name matches multiple contacts, list and ask.
- File handling: if the user provided an image/PDF in the conversation, include file in the pending_action payload (server attaches it like log_receipt's receipt photo path).

**`log_sub_payment`**
- Input schema: `invoice_id UUID?`, `sub_name TEXT?`, `amount NUMERIC`, `paid_date TEXT?`, `method TEXT` (check/ach/cash/card/other), `reference TEXT?`, `notes TEXT?`
- If `invoice_id` not provided: look up by sub_name + job context. If multiple unpaid invoices for same sub on same job → list them (show invoice_number + amount + remaining balance) and ask which one.
- Confirm card: "Record {method} payment of ${amount} to {sub_name} against invoice #{number}. {check #ref if check}."
- Calls `sbAddSubInvoicePayment` on confirm.

**`approve_sub_invoice`**
- Input schema: `invoice_id UUID?`, `sub_name TEXT?`, `job_id TEXT?`
- Role gate: only `owner` / `project_manager` can invoke. Agent returns "Only owner or PM can approve invoices" if role check fails — does NOT surface confirm card.
- If ambiguous: list pending_review invoices for the job and ask which.
- Confirm card: "Approve invoice #{number} from {sub_name} for ${amount}?"
- Calls `sbApproveSubInvoice` on confirm.

**System prompt additions:**
```
- Sub invoice verbs: log_sub_invoice (create pending review), log_sub_payment (record payment against existing invoice), approve_sub_invoice (owner/PM only). All three are confirm-gated.
- When user says "pay Mike $X" — determine if this is a sub invoice payment (ask "Is this against a specific invoice?") or a general expense (log_receipt). Don't assume.
- When user says "Mike billed us $X" or "invoice from Mike for $X" → log_sub_invoice.
- Always resolve the sub name to a contacts row before calling log_sub_invoice. If no match in contacts for this tenant, surface error: "I don't see a sub named {name} in your contacts. Add them first, or try a different name."
- For log_sub_payment: call get_sub_invoices (or equivalent) to find the matching invoice before confirming. Do not call log_sub_payment with an invoice_id you haven't verified exists.
```

---

### Phase 6 — Sub Portal Submission (FUTURE)

_Sketch only — deferred to sub portal expansion arc._

Sub portal shows "Submit Invoice" button on jobs where the sub is assigned. Sub fills amount + description + optional line items + optional PDF upload. On submit: `sbCreateSubInvoice` called with `submitted_via='sub_portal'`, `sub_contact_id` auto-filled from the sub's session profile. Row lands in `pending_review`. Owner + PM receive in-app notification: "Mike Drywall submitted invoice #{num} for $X on {job address}."

Sub portal view: "Your invoices" section shows the sub's own invoices per job with status badges. Paid invoices show the payment date and method. No amounts from other subs visible.

`submitted_via='sub_portal'` already exists in the Phase 1 schema CHECK constraint — no migration when this phase ships.

---

## Open Questions

Real unknowns — not decisions already locked.

**Sales rep upload.** Can sales reps upload invoices for jobs they own? Recommended: yes — same access as creating expense transactions in their jobs. They just can't approve or record payment. Confirm before Phase 1.

**Tax handling.** Subs sometimes include tax line items. Sometimes total is tax-inclusive. Recommended: store as a line item in `line_items` JSONB if present (e.g. `{description: 'Sales Tax', qty: 1, unit_price: X, total: X}`). No separate tax column v1. Bookkeeper handles tax classification from the `job_transactions` rows.

**Currency.** Recommended: USD only v1. `currency TEXT NOT NULL DEFAULT 'USD'` column exists on `sub_invoices` (Schema Reference below). Constraint locks it to 'USD' for now — remove the constraint to unlock multi-currency later.

**Approval audit trail.** Single `approved_at + approved_by_id` on `sub_invoices` vs a separate `sub_invoice_approvals` table for re-approval history. Recommended: single columns v1. Re-approval after an edit is rare. If audit trail becomes legally important (high-value jobs, dispute resolution), add the table later.

**Bulk operations.** Approve multiple invoices at once? One check covering multiple invoices? Recommended: defer. v1 = one action per row. Bulk patterns add UI complexity without enough signal on what "one check, three invoices" looks like in practice.

**AP aging reminders.** "You've owed Mike $4,200 for 30 days" watchdog rule. Recommended: scope into Watchdog Phase 2, after company files watchdog (COMPANY_FILES_ARC) ships. Same `scheduled_actions` pattern — no additional architecture needed.

**Reporting / export.** CSV export of sub_invoices for accountant. Recommended: defer — QuickBooks integration is its own arc. The `job_transactions` rows written in Phase 4 give accountants the ledger entries they need from a potential QBO integration.

**Auto-approval rules.** "Auto-approve invoices under $500 from trusted subs." Recommended: defer — not enough signal yet on which rules are safe for different tenant types. Liability risk if auto-approval fires on a wrong amount.

---

## Cost Guardrails

**Vision extraction per invoice.** Haiku pricing ~$0.001–0.003 per invoice PDF (image OCR). Realistic volume: 50–200 invoices per tenant per year. Annual cost per tenant: $0.05–$0.60. Trivial. One-time user-triggered call on PDF upload — not background, not automatic.

**Storage.** Invoice PDFs: 200KB–2MB typical. 200 invoices × 1MB = 200MB/tenant/year. Supabase storage ~$0.004/month. Trivial.

**No automatic AI triggers.** Vision only fires on explicit PDF upload action. Master Agent verbs only fire on user intent. No DB webhooks, no cron calls.

**Real product cost prevented:**
- "Did I pay Mike for the drywall?" lookup time — eliminated, searchable by sub + job.
- Mechanic's lien risk from missed payments — surfaced in Approved Unpaid view.
- Dispute resolution time — full audit trail (who approved, when, with which file) cuts back-and-forth.
- Manual spreadsheet AP tracking — eliminated for the owner.
- Double-payment risk — duplicate invoice number constraint blocks re-entry.

---

## Schema Reference

### `sub_invoices` — new table

```sql
CREATE TABLE sub_invoices (
  id                       UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID    NOT NULL,
  job_id                   TEXT    NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,

  -- Sub identity (contacts.id is TEXT in this schema — confirmed via schema audit)
  sub_contact_id           TEXT    NOT NULL REFERENCES contacts(id) ON DELETE RESTRICT,

  -- Invoice metadata
  invoice_number           TEXT    NOT NULL,
  auto_generated_number    BOOLEAN NOT NULL DEFAULT false,
  invoice_date             DATE    NOT NULL,
  due_date                 DATE,
  amount                   NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency                 TEXT    NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  description              TEXT,
  line_items               JSONB   DEFAULT NULL,

  -- Linkages (all nullable — see Locked Decisions 9, 15, 17)
  related_schedule_item_id UUID    REFERENCES schedule_items(id) ON DELETE SET NULL,
  invoice_file_id          UUID    REFERENCES job_files(id) ON DELETE SET NULL,
  lien_waiver_file_id      UUID    REFERENCES job_files(id) ON DELETE SET NULL,

  -- Approval state
  approved_at              TIMESTAMPTZ,
  approved_by_id           UUID    REFERENCES profiles(id),

  -- Dispute state
  disputed                 BOOLEAN NOT NULL DEFAULT false,
  disputed_at              TIMESTAMPTZ,
  disputed_by_id           UUID    REFERENCES profiles(id),
  dispute_reason           TEXT,

  -- Void state (rare — sub double-billed, wrong job, etc.)
  voided_at                TIMESTAMPTZ,
  voided_by_id             UUID    REFERENCES profiles(id),
  void_reason              TEXT,

  -- Provenance (see Locked Decision 18 for submitted_via values)
  submitted_via            TEXT    NOT NULL DEFAULT 'manual_upload'
    CHECK (submitted_via IN ('manual_upload', 'pdf_upload', 'master_agent', 'sub_portal')),
  created_by_id            UUID    REFERENCES profiles(id),

  -- Audit
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Duplicate invoice number guard: same sub can't submit same inv# twice on same job
  UNIQUE (tenant_id, job_id, sub_contact_id, invoice_number)
);

-- Active invoice lookup (job context, most common query)
CREATE INDEX idx_sub_invoices_job
  ON sub_invoices(job_id)
  WHERE voided_at IS NULL;

-- Sub-level lookup (portal view, "what does Mike owe" queries)
CREATE INDEX idx_sub_invoices_sub
  ON sub_invoices(sub_contact_id)
  WHERE voided_at IS NULL;

-- Pending review queue (owner dashboard, Master Agent context)
CREATE INDEX idx_sub_invoices_pending
  ON sub_invoices(tenant_id, invoice_date)
  WHERE approved_at IS NULL AND voided_at IS NULL AND disputed = false;

-- AP outstanding view (cash flow: approved but not yet fully paid)
CREATE INDEX idx_sub_invoices_ap_outstanding
  ON sub_invoices(tenant_id, invoice_date)
  WHERE approved_at IS NOT NULL AND voided_at IS NULL;

ALTER TABLE sub_invoices ENABLE ROW LEVEL SECURITY;

-- Tenant members can read their own invoices
CREATE POLICY si_tenant_select ON sub_invoices
  FOR SELECT TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  ));

-- Owner, PM, and sales_rep can create (upload) invoices
CREATE POLICY si_create ON sub_invoices
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM profiles
    WHERE id = auth.uid() AND role IN ('owner', 'project_manager', 'sales_rep')
  ));

-- Only owner and PM can update (approve, dispute, void, edit)
CREATE POLICY si_modify ON sub_invoices
  FOR UPDATE TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM profiles
    WHERE id = auth.uid() AND role IN ('owner', 'project_manager')
  ))
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM profiles
    WHERE id = auth.uid() AND role IN ('owner', 'project_manager')
  ));

CREATE TRIGGER sub_invoices_updated_at
  BEFORE UPDATE ON sub_invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

### `sub_invoice_payments` — new table

```sql
CREATE TABLE sub_invoice_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  sub_invoice_id  UUID NOT NULL REFERENCES sub_invoices(id) ON DELETE CASCADE,

  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  paid_date       DATE NOT NULL,
  method          TEXT NOT NULL
    CHECK (method IN ('check', 'ach', 'cash', 'card', 'other')),
  reference       TEXT,      -- check number, ACH conf, transaction ID, etc.
  notes           TEXT,

  -- Void state (voided payments excluded from paid_sum, kept for audit trail)
  voided_at       TIMESTAMPTZ,
  voided_by_id    UUID REFERENCES profiles(id),
  void_reason     TEXT,

  -- Linked job_transactions row (populated in Phase 4)
  transaction_id  UUID REFERENCES job_transactions(id) ON DELETE SET NULL,

  created_by_id   UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary lookup: payments for a given invoice (excluding voided)
CREATE INDEX idx_sip_invoice
  ON sub_invoice_payments(sub_invoice_id)
  WHERE voided_at IS NULL;

-- Cash accounting view: all payments in a date range for a tenant
CREATE INDEX idx_sip_tenant_date
  ON sub_invoice_payments(tenant_id, paid_date)
  WHERE voided_at IS NULL;

ALTER TABLE sub_invoice_payments ENABLE ROW LEVEL SECURITY;

-- Tenant members can read payment records
CREATE POLICY sip_tenant_select ON sub_invoice_payments
  FOR SELECT TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM profiles WHERE id = auth.uid()
  ));

-- Only owner and PM can create or modify payments
CREATE POLICY sip_modify ON sub_invoice_payments
  FOR ALL TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM profiles
    WHERE id = auth.uid() AND role IN ('owner', 'project_manager')
  ))
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM profiles
    WHERE id = auth.uid() AND role IN ('owner', 'project_manager')
  ));

CREATE TRIGGER sub_invoice_payments_updated_at
  BEFORE UPDATE ON sub_invoice_payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

### `compute_sub_invoice_status` — derived status function

```sql
CREATE OR REPLACE FUNCTION compute_sub_invoice_status(p_invoice_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE  -- reads DB, doesn't modify state; can be called per-row in a query
AS $$
DECLARE
  inv      RECORD;
  paid_sum NUMERIC;
BEGIN
  SELECT * INTO inv FROM sub_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  -- Voided state wins over all others
  IF inv.voided_at IS NOT NULL THEN RETURN 'voided'; END IF;

  -- Disputed state wins over payment state
  IF inv.disputed THEN RETURN 'disputed'; END IF;

  -- Sum all non-voided payments
  SELECT COALESCE(SUM(amount), 0)
  INTO   paid_sum
  FROM   sub_invoice_payments
  WHERE  sub_invoice_id = p_invoice_id
  AND    voided_at IS NULL;

  -- Not yet approved: pending_review regardless of paid_sum
  -- (payment-before-approval is an anomaly handled by the helper, not the function)
  IF inv.approved_at IS NULL THEN
    RETURN 'pending_review';
  END IF;

  -- Approved — now check payment coverage
  IF paid_sum = 0 THEN
    RETURN 'approved';
  END IF;
  IF paid_sum < inv.amount THEN
    RETURN 'partially_paid';
  END IF;
  RETURN 'paid';   -- covers exact payment and overpayment (Locked Decision 6)
END;
$$;
```

---

## Migration Strategy

Single migration file creates both tables, all indexes, RLS policies, triggers, and the status function. No backfill — this is net-new workflow with no existing rows to migrate. Migration follows the standard `npm run migrate` path from `avenstone-vite/` which applies + auto-verifies + reloads schema in one command.

**Expected objects auto-derived by `apply_migration.js`:**
- TABLE `sub_invoices`
- TABLE `sub_invoice_payments`
- INDEX `idx_sub_invoices_job`
- INDEX `idx_sub_invoices_sub`
- INDEX `idx_sub_invoices_pending`
- INDEX `idx_sub_invoices_ap_outstanding`
- INDEX `idx_sip_invoice`
- INDEX `idx_sip_tenant_date`
- POLICY `si_tenant_select`
- POLICY `si_create`
- POLICY `si_modify`
- POLICY `sip_tenant_select`
- POLICY `sip_modify`

---

## Out of Scope (v1)

- Sub portal upload (Phase 6 — deferred to sub portal expansion arc; schema is forward-compatible via `submitted_via` enum)
- Lien waiver collection workflow (separate future arc; `lien_waiver_file_id` FK reserved and nullable — no migration needed when that arc ships)
- Bulk approve / bulk pay
- AP aging reminders / watchdog (Watchdog Phase 2 after COMPANY_FILES_ARC watchdog ships)
- CSV export / QuickBooks integration
- Auto-approval rules
- Multi-currency (`currency` column exists with 'USD' CHECK; drop constraint to unlock)
- Tax classification as a separate column (use `line_items` JSONB)
- Formal dispute resolution workflow (just a boolean toggle v1)
- Invoice editing audit trail table (single `approved_at + approved_by_id` v1)
- Retainage tracking on individual invoices (can use `description` field for now)
- Supplier invoices / materials AP (same pattern, separate arc — swap `sub_contact_id` for `supplier_contact_id`)

---

## Future Architecture

### Lien Waiver Collection Arc (sketch)
When `compute_sub_invoice_status` returns `'paid'` (paid_sum >= amount), write a `scheduled_actions` row: "Collect lien waiver from {sub} for invoice #{num} on {job}." When waiver PDF is uploaded via job_files, update `sub_invoices.lien_waiver_file_id`. Banner on job header if any `paid` invoice has `lien_waiver_file_id = NULL` after N days. No additional schema changes needed — `lien_waiver_file_id` column exists in Phase 1.

### Cash Flow Forecasting Arc (sketch)
View for owner: "AP outstanding: $X across N invoices. Expected client draws: $Y. Net position: $Z." Reads `sub_invoices.amount - SUM(paid)` for outstanding per job, `change_orders` + estimate phases for projected income. No new tables — pure query layer on existing data.

### Sub Financial Visibility Arc (sketch)
Sub portal "Your invoices" shows `sub_contact_id` filtered view: total owed, paid breakdown per job, pending payment dates. Reads `sub_invoices` + `sub_invoice_payments` directly. RLS already handles data isolation when sub portal uses the sub's session. Phase 6 of this arc or a separate portal expansion prompt.

### Materials-to-Financials Arc (sketch)
Supplier invoices follow the same two-table pattern with `supplier_contact_id TEXT REFERENCES contacts(id)` instead of `sub_contact_id`. Either extend `sub_invoices` with a `payee_type` discriminator column, or create a parallel `supplier_invoices` table. Decision deferred — depends on whether supplier and sub invoice UX needs are similar enough to justify merging.

### AP Aging Watchdog Arc (sketch)
`approved` invoices with no payments for 30+ days → owner todo. 60+ days → escalated todo. Matches COMPANY_FILES_ARC expiration watchdog pattern exactly: `scheduled_actions` rows created at approval time (30d / 60d marks), cleared when payment is recorded. Zero new architecture needed beyond Watchdog Phase 2 shipping.

---

## Audit Notes (from schema read, 2026-05-27)

- `contacts.id` is **TEXT** (not UUID) — sub_contact_id uses TEXT FK accordingly.
- `job_transactions.invoice_id UUID` already exists in the live schema — Phase 4 cash accounting integration uses this column as the FK back to `sub_invoices.id`. No migration needed for that column.
- `jobs.id` is TEXT — `sub_invoices.job_id TEXT REFERENCES jobs(id)` confirmed correct.
- `schedule_items.id` is UUID — `related_schedule_item_id UUID REFERENCES schedule_items(id)` confirmed correct.
- `job_files.category` is plain TEXT (no DB-level CHECK constraint) — `'Sub Invoices'` is a new valid value, consistent with existing categories ('Photos', 'Documents', 'Receipts', etc.).

---

## Amendments

_Empty — update as phases ship._
