# Cost-Plus Draw Composer — Audit Findings

_Read-only audit conducted 2026-05-27. No code or schema touched. Findings inform the COST_PLUS_ARC.md blueprint session._

---

## Cost-plus identification

- **Column:** `jobs.cost_plus` — `BOOLEAN DEFAULT false`
- **Set via:** InfoTab.jsx — checkbox labeled "Cost-Plus Job" (line 157). When checked, a second field appears for `default_markup_pct`.
- **Propagated:** JobDet.jsx passes `job.cost_plus` through `inf` state (line 92). `sbGetJobs` maps it (supabase.js line 108). ClientPortal checks it to show/hide the Financials tab.
- **Not in job creation form** — only settable after job exists via InfoTab.

## Markup storage

- **Per-job default:** `jobs.default_markup_pct` — `NUMERIC DEFAULT 0`. Shown/editable in InfoTab only when `cost_plus = true`.
- **Per-line-item:** `estimate_line_items.markup_pct` — `NUMERIC`. Set in EstimateTab proposal builder and LineItemModal. Defaults to 0 or to `propMargin` on new items.
- **Per-cost-item (legacy):** `job_cost_items.markup_pct` — `NUMERIC DEFAULT 0`. Part of the legacy cost-plus track (see "Two parallel systems" below).
- **No tenant-level markup default.** There is no tenant config table row for default markup; per-job `default_markup_pct` is the only mechanism.
- **Per-job, not tenant-inherited.** Each cost-plus job has its own markup%. If Avenstone runs all cost-plus jobs at 15%, that has to be typed on each job individually. **Needs human decision: add tenant-default markup in Phase 1?**

---

## Draw schema

Only `draw_schedules` exists. Tables `draws` and `draw_line_items` do **not exist** in the live DB.

```
draw_schedules columns:
  id                  UUID  PK  gen_random_uuid()
  tenant_id           UUID
  job_id              TEXT  FK→jobs.id
  draw_number         INT   (sequential 1, 2, 3…)
  title               TEXT
  description         TEXT
  target_amount       NUMERIC   (manually entered flat amount)
  target_date         DATE
  phase               TEXT      (free-text annotation)
  status              TEXT      DEFAULT 'planned'
  invoiced_amount     NUMERIC   DEFAULT 0  (rolled up when invoice sent)
  paid_amount         NUMERIC   DEFAULT 0  (rolled up when invoice paid)
  display_order       INT       DEFAULT 0
  auto_invoice_trigger JSONB    (trigger conditions — phase_advanced type)
  auto_invoiced_at    TIMESTAMPTZ
  created_at / updated_at
```

**Status enum** (CHECK constraint): `planned`, `in_progress`, `paid`, `cancelled`

**Critical:** `draw_schedules` has a `target_amount` (flat number) but **no line items**. There is no `draw_line_items` table. A draw today is a single dollar target, not a breakdown of expenses.

---

## Draw → invoice linkage

- `invoices.draw_id UUID` — FK pointing back to `draw_schedules.id`. This is the link.
- When an invoice is created against a draw (via InvoiceComposerModal with `prefillDrawId`), the invoice carries `draw_id`.
- When the invoice is sent, `draw_schedules.invoiced_amount` is incremented (in `send-invoice` edge fn, supabase.js line 301–311).
- When the invoice is paid (Stripe webhook OR manual `sbMarkInvoicePaid`), `draw_schedules.paid_amount` is incremented. If `paid_amount >= target_amount`, draw flips to `status = 'paid'`.
- When an invoice is voided, `sbVoidInvoice` rolls back `draw_schedules.invoiced_amount`.
- **Invoices do not have line items tied to specific job_transactions.** The invoice `subtotal`/`total_amount` is a flat figure — there is no `invoice_line_items` table referenced by the draw flow.

---

## Job transactions → draws linkage

**No FK.** There is no draw_id UUID column on `job_transactions`.

There IS: `job_transactions.draw_number INTEGER` (line 37 in Q4 output). This is a loose integer annotation — it references `draw_schedules.draw_number` (the sequential number) by convention, but there is **no FK constraint** enforcing this. It's writable via TransactionModal but nothing validates it against live draws.

- No `reimbursement_status` column on job_transactions.
- No `reimbursed` or similar concept on job_transactions.
- The current status enum is: `draft, pending, paid, overdue, void, refunded`.
- **Confirmed: no current structural linkage between expenses and draws. `draw_number` on transactions is a soft annotation only.**

---

## Cascade on draw paid

When a draw invoice is paid (via Stripe webhook OR manual `sbMarkInvoicePaid`):

1. `invoices.status` flips to `paid`, `amount_paid` updated, `paid_at` stamped.
2. If `invoice.draw_id` is set: `draw_schedules.paid_amount` incremented. If `paid_amount >= target_amount`, `draw_schedules.status = 'paid'`.
3. A `job_transactions` row is created for the incoming client payment (direction=in, type=client_payment) via `sbMarkInvoicePaid`.
4. **No cascade to expense rows.** No `job_transactions` expense rows are marked "reimbursed" anywhere. The client paying a draw has zero effect on the status of the underlying outbound expense rows.

Code locations: `supabase.js:3731–3826`, `supabase/functions/stripe-webhook/index.ts:104–120`.

---

## Two parallel cost-plus systems (most important finding)

This is the biggest structural finding. Cost-plus tracking exists in **two separate, unconnected systems**:

### System A — Legacy (pre-ledger-rebuild): `job_cost_items` + `job_cost_invoices`

```
job_cost_items:
  id, job_id, tenant_id, trade, vendor, estimate(NUMERIC),
  markup_pct(NUMERIC DEFAULT 0), client_visible(BOOLEAN DEFAULT true),
  proposal_file_url, proposal_file_name, created_at

job_cost_invoices (compat view per code comment):
  id, job_id, cost_item_id, tenant_id, date, amount, paid(BOOLEAN),
  invoice_file_url, lien_waiver_file_url, lien_waiver_signed_date, created_at
```

- `job_cost_items`: per-trade line (e.g. "Tile — ABC Tile Co — $12,000 — 15% markup")
- `job_cost_invoices`: per-payment against a cost item, with `paid BOOLEAN` (no status enum — legacy)
- **Still read by ClientPortal.jsx** for the cost-plus Financials tab. Client sees per-trade breakdown, markup%, "your price", and paid invoices.
- `job_cost_invoices` comment in supabase.js: "Write directly to job_transactions; job_cost_invoices is now a compat view" — but the comment says compat view, yet it IS a real table in the DB (not a SQL view). This may be aspirational; writes still go directly to job_cost_invoices in some paths.

### System B — New ledger: `job_transactions`

- All ledger entries are here: sub payouts, vendor payments, client payments, materials, etc.
- Has `draw_number INT` (soft link to draw) but no markup_pct, no reimbursement concept.
- Drives the FinancialsTab Ledger view, stat cards (Paid Out, Pending Out), QB Export.
- **No cost-plus awareness at all.**

### Gap: The two systems are not connected
- Paying a sub via the Sub Invoices section writes to `job_transactions` (via Phase 4a RPC).
- That same payment does NOT create a `job_cost_invoices` row.
- The client portal Financials tab reads `job_cost_items`/`job_cost_invoices` — it would show nothing for payments recorded through the new ledger.
- The new Ledger tab reads `job_transactions` — it shows sub payouts but with no markup, no "client's share" view.

**The arc must decide: converge on job_transactions OR build a bridge. See Open Questions.**

---

## Cost-plus-aware logic in codebase (summary)

Present and scattered across both systems:

| Location | What it does |
|---|---|
| `InfoTab.jsx:157` | Toggle `jobs.cost_plus` checkbox; show `default_markup_pct` input |
| `ClientPortal.jsx:166` | Conditionally adds Financials tab for cost-plus jobs |
| `ClientPortal.jsx:772–839` | Renders `job_cost_items` + `job_cost_invoices` for clients; applies markup |
| `ConsultationTab.jsx:308` | Sets `markup_pct: 0` on new cost items created from consultation |
| `EstimateTab.jsx:237, 324` | `markup_pct` in line items; total computed with `(1 + markup/100)` factor |
| `LineItemModal.jsx:17, 42` | `markup_pct` field on estimate line items |
| `supabase.js:108–127` | Maps/allowlists `cost_plus` + `default_markup_pct` on job read/write |
| `supabase.js:761–814` | `sbLoadCostItems`, `sbLoadCostInvoices` — legacy helpers |

**No cost-plus logic in any edge function.** `ai-home-companion` mentions "UNPAID DRAWS" in its system prompt context (line 288) — draws surface in the AI context, but cost-plus draw composition is not an agent verb today.

---

## Job financial summary cost-plus awareness

`sbLoadJobFinancialSummary` (supabase.js line 1303–1313):

- Reads only `job_transactions` (direction, amount, status, lien fields).
- Computes: `total_in` (paid income), `total_out` (paid expense), `pending_out` (pending expense), `lien_waivers_missing`, `contract_total`, `client_owes`.
- **No draw awareness.** No draw balance, no draw count, no % drawn.
- **No cost-plus float.** There is no "expenses incurred but not yet invoiced to client" number anywhere in the app.
- `client_owes = contract_total - total_in` — this is fixed-price logic. For cost-plus, `contract_total` (`job.contract_value`) may be zero or a rough estimate; the real amount owed is `sum(expenses * (1 + markup_pct)) - total_in`.

**Where a cost-plus float would need to live:** Either as a new derived stat in `sbLoadJobFinancialSummary`, or as a separate `sbLoadCostPlusFloat(jobId)` helper. Computing it requires knowing which outbound transactions are reimbursable and what markup applies to each.

---

## Draw UI surfaces

Managed entirely within **InvoicesSubTab.jsx** (Financials → Invoices sub-tab):

- **Draw list**: shows all `draw_schedules` for the job with status badges, draw number, title, target/invoiced/paid amounts. Edit + Delete buttons. "+ New Draw" opens `DrawModal`.
- **DrawModal fields**: draw_number (auto-increment), title, target_amount (manual $), target_date, phase (free text), description, optional auto_invoice_trigger (type: `immediately` or `phase_advanced` with phase picker).
- **Invoice against draw**: each draw row has a "Create Invoice" button that opens `InvoiceComposerModal` with `prefillDrawId` set. The composer creates a flat invoice linked to the draw — no line-item breakdown from expenses.

**There is NO cost-plus draw composer today.** Draws are entirely manual (PM types a flat dollar amount). The system has no UI that:
- Pulls pending expense rows for the job
- Sums them with markup
- Presents them as proposed draw line items
- Lets the PM select which expenses to include in this draw

---

## Forward-looking expense tracking

None. No `forecast`, `projected`, `float`, or upcoming-expense concepts in `src/lib/` or `src/components/jobs/tabs/financials/`.

`upcoming` appears once in schedule-item status derivation — unrelated.

**Draws compose from a manually entered target amount only, OR via auto-invoice-trigger when a phase advances.** There is no mechanism to pull actual incurred expenses into a draw amount suggestion.

---

## Open architectural questions

1. **Converge or bridge?** Two systems exist: `job_cost_items`/`job_cost_invoices` (legacy, client-visible) and `job_transactions` (new ledger, internal). Should the cost-plus draw composer build on `job_transactions` (leaving legacy as read-only for ClientPortal until deprecated), or build a bridge that syncs both? **Recommended: build on `job_transactions`; schedule `job_cost_items` deprecation as a separate arc.**

2. **Reimbursement status — separate column or status value?** `job_transactions.status` today = `draft, pending, paid, overdue, void, refunded`. Options:
   - Add `status = 'reimbursed'` to the enum (breaking: changes existing status semantics — "paid to vendor" vs "reimbursed by client" means different things)
   - Add `reimbursement_status TEXT` column (nullable, only populated for reimbursable outbound rows: `unreimbursed → in_draw → reimbursed`)
   - Add `draw_id UUID FK→draw_schedules.id` column (stronger than current `draw_number INT`) with the draw assignment being the reimbursement marker
   - **Recommended: add both `draw_id UUID` (FK) and `reimbursement_status` column. `draw_number INT` stays as a soft label but `draw_id` becomes the structural link.**

3. **Markup per-transaction or job-level?** When composing a draw, should each expense row carry its own markup_pct, or does the job-level `default_markup_pct` apply uniformly? Options:
   - Job-level only: simpler, one number, but can't express "sub labor at 10%, materials at 20%"
   - Per-transaction: more granular, but requires adding `markup_pct NUMERIC DEFAULT 0` to `job_transactions`
   - **Recommendation: add `markup_pct` to `job_transactions` (defaulting to `job.default_markup_pct` on insert), allow per-row override. Gives flexibility without requiring it.**

4. **Draw line items table vs snapshot?** Should the draw composer create a `draw_line_items` table that permanently links specific `job_transactions.id` rows to a draw, OR should the draw be a snapshot (sum computed at compose time, no persistent per-row linkage)? Trade-offs:
   - Line items table: true audit trail, "which expenses went into this draw" is queryable, cascade on draw-paid marks each transaction as reimbursed
   - Snapshot: simpler schema, but can't tell retrospectively which rows were reimbursed
   - **Recommended: line items table. Enables cascade and client-visible breakdown.**

5. **What does the client see?** Today, `ClientPortal.jsx` renders `job_cost_items` for cost-plus jobs. After the arc, should the client Financials tab render draw-based expense breakdowns from `job_transactions`? This would require: (a) marking transactions as `client_visible`, (b) surfacing the markup factor, (c) possibly a new client-facing "Draw History" section replacing the legacy cost items view. **Flag as architectural decision — affects client portal scope.**

---

## Recommended arc shape (preliminary)

### Phase 1 — Schema foundation
- Add `draw_id UUID FK→draw_schedules.id` to `job_transactions` (nullable — only set when expense is included in a draw)
- Add `reimbursement_status TEXT CHECK('unreimbursed','in_draw','reimbursed') DEFAULT NULL` to `job_transactions` (only set on `direction='out'` rows for cost-plus jobs)
- Add `markup_pct NUMERIC DEFAULT 0` to `job_transactions` (populated from `job.default_markup_pct` at insert time for cost-plus jobs, overridable)
- Create `draw_line_items` table: `id UUID, draw_id UUID FK, transaction_id UUID FK, amount NUMERIC, markup_pct NUMERIC, markup_amount NUMERIC, total_with_markup NUMERIC, created_at`
- RLS mirrors `draw_schedules` policies

### Phase 2 — Draw composer UI
- New "Compose Draw" button/flow in InvoicesSubTab (or new sub-tab)
- Pulls all `job_transactions WHERE direction='out' AND reimbursement_status IS NULL` (unreimbursed expenses)
- Shows per-row markup field (pre-filled from `transaction.markup_pct`, editable)
- Running total with markup applied
- Allow manual forward-looking line items (free-text + amount) for future expenses
- On confirm: creates `draw_schedules` row, creates `draw_line_items` rows, stamps `job_transactions.draw_id` + `reimbursement_status='in_draw'`

### Phase 3 — Draw paid cascade
- When `sbMarkInvoicePaid` fires and invoice has `draw_id`: load `draw_line_items` for that draw → set `job_transactions.reimbursement_status='reimbursed'` for all linked transactions
- Add `reimbursed_at TIMESTAMPTZ` to `job_transactions` (optional — for audit trail)
- Update `sbLoadJobFinancialSummary` to return: `unreimbursed_expense` = sum of out rows with `reimbursement_status IS NULL` (or = 'unreimbursed') for cost-plus jobs

### Phase 4 — Job financial summary + stat cards
- New stat for cost-plus jobs: **"Float Unreimbursed"** = sum of `direction='out' AND reimbursement_status IN (NULL,'unreimbursed') AND cost_plus=true`
- New stat: **"Markup Earned"** = sum of `draw_line_items.markup_amount` where draw is paid
- Replace or supplement `client_owes` with cost-plus-specific calculation: `(paid_to_vendors × (1 + avg_markup)) - total_in`

### Phase 5 — Master Agent verb
- `compose_draw` confirm-gated verb: "compose draw for Lucy Webb" → loads unreimbursed expenses, generates draft draw with totals, user confirms → fires Phase 2 flow
- `approve_draw_invoice` (already close to existing `log_receipt` pattern)

### Client portal (Phase 5 or separate arc)
- Deprecate `job_cost_items` / `job_cost_invoices` from client portal Financials tab
- Replace with draw-based view: per-draw breakdown from `draw_line_items` with markup visible
- `job_transactions.client_visible` column (or derive from `draw_line_items` inclusion) controls what client sees

---

## Audit flags for blueprint session

| Flag | Implication |
|---|---|
| `draw_schedules` has no line items today | Phase 1 must add `draw_line_items` before any composer UI is possible |
| `job_transactions.draw_number INT` already exists | Blueprint should decide whether to keep or supersede with `draw_id UUID` FK; keeping both is redundant |
| `job_cost_items` / `job_cost_invoices` still read by ClientPortal | Deprecation is blocked on client portal migration — separate arc or Phase 5 scope item |
| No `markup_pct` on `job_transactions` | Can't compute per-row "client charge" without either adding this column or using job-level default uniformly |
| `job.default_markup_pct` is per-job, no tenant default | Any new insert path for cost-plus jobs needs to explicitly pull `job.default_markup_pct` to pre-fill |
| `ai-home-companion` references draws in prompt context | Agent already "knows about" draws conceptually — `compose_draw` verb is a natural Phase 5 addition |
| No forward-looking expense tracking | Phase 2 must allow manual line items for unincurred-but-expected costs; draw amounts would otherwise lag actual work |

---

## Additive Audit — Prepayment / Client Credit Pool

_Additive read-only audit conducted 2026-05-27. Goal: determine whether any mechanism tracks "client paid money not yet tied to an invoice or draw." Findings appended without touching earlier sections._

---

### Q1 — Is there a prepayment / credit / escrow / retainer table?

**Finding: No.** No `client_credits`, `prepayments`, `retainer_accounts`, `escrow`, `credit_memos`, or `credit_pool` tables exist anywhere in `supabase/migrations/`. The only inbound-money storage is `job_transactions`.

---

### Q2 — Are there prepayment-aware columns on existing tables?

**Finding: Partial.** `job_transactions` has:
- `type` enum includes `'client_deposit'` — a dedicated deposit type alongside `'client_payment'` and `'client_refund'`
- `payment_method` TEXT stores draw type (e.g. `'deposit'`, `'progress'`, `'final'`) as a free-text annotation — no FK, no enum constraint

Nothing on `jobs`, `invoices`, or `draw_schedules` tracks "unapplied client credit" or "credit balance available."

---

### Q3 — How does the initial contract deposit flow?

**Finding: Tracked as a ledger row but not structurally linked to the draw schedule.**

- Phase gate `contract→in_progress` calls `checkDepositPaid(jobId)` in `phaseGates.js`
- That function queries: `WHERE type = 'client_payment' AND direction = 'in' AND status = 'paid'`
- **Bug:** the gate ignores `type = 'client_deposit'` — if a PM uses the `client_deposit` transaction type in `TransactionModal`, the phase gate will not detect it
- The deposit `job_transactions` row has `invoice_id = null` (no draw invoice has been created yet at the time of signing)
- When Draw 1 invoice is later created and paid, `draw_schedules.paid_amount` is incremented — the earlier deposit row is **never retroactively linked** to any draw

**Net effect:** the deposit money appears in `sbLoadJobFinancialSummary.total_in` and reduces `client_owes`, but it has no structural connection to any draw or invoice. The draw composer would see unreimbursed expenses against zero draw credit.

---

### Q4 — What `type` / `status` enum values exist for inbound (`direction='in'`) transactions?

**Allowed types (from migration `20260423_unified_financial_ledger.sql` and addendum `20260519_labor_transaction_type.sql`):**
```
client_payment   — general client remittance
client_deposit   — deposit / retainer
client_refund    — refund issued to client (still direction='in' — represents a recapture)
other_income     — miscellaneous inbound
```
_(Note: `other_income` was added in a later migration; the original type check did not include it. Current `TransactionModal` and enum definitions include it.)_

**Status values:** `draft | pending | paid | overdue | void | refunded`

**Stripe webhook** always writes `type = 'client_payment'` for both invoice flow and legacy payment-link flow — `client_deposit` is never used programmatically.

**Master Agent `log_payment` verb** also hardcodes `type: "client_payment"` in the executor — deposits triggered via voice would use this type, not `client_deposit`.

---

### Q5 — How are partial invoice payments handled?

**Finding: Cumulative `amount_paid` on `invoices` row; no per-payment allocation table.**

`stripe-webhook/index.ts` Step 6:
```ts
const newAmountPaid = Number(invoice.amount_paid) + paidAmount;
const newStatus     = newAmountPaid >= Number(invoice.total_amount) ? 'paid' : 'partially_paid';
```

- Each payment writes a `job_transactions` row with `invoice_id` pointing to the invoice
- `invoices.amount_paid` accumulates all payments against that invoice
- `invoices.status` transitions to `partially_paid` until the full amount is covered
- **No allocation table** — you cannot trace "payment X covered line items A, B, C"

---

### Q6 — How does Stripe handle overpayments?

**Finding: Silent excess; no flag, no credit.**

The webhook condition is `newAmountPaid >= total_amount → status = 'paid'`. If a client pays $12,000 against a $10,000 invoice:
- `amount_paid` = 12,000
- `status` = 'paid'
- `draw_schedules.paid_amount` increases by 12,000 — potentially exceeds `target_amount`
- No `overpayment_amount` column, no notification, no credit memo row
- The surplus is not surfaced anywhere — it disappears into `total_in` of `sbLoadJobFinancialSummary`

---

### Q7 — Is there any allocation / "applied-to" mechanic?

**Finding: No.** There is no `payment_allocations`, `credit_applications`, or `applied_to` table or column. The only soft linkage between payments and invoices is `job_transactions.invoice_id` — a direct FK set at payment time by the Stripe webhook. For manual transactions logged via `TransactionModal`, `invoice_id` is not set (no UI field for it).

No mechanism to say "I'm applying $3,000 of the $5,000 deposit to Draw 1, and the remaining $2,000 stays in the credit pool."

---

### Q8 — Is there a "client credit available" UI surface anywhere?

**Finding: No.** No component shows:
- Unapplied deposit balance
- Credit-pool total
- "Client has a $X credit" banner
- Offset suggestion in draw composer

`sbLoadJobFinancialSummary` returns `client_owes = contract_total - total_in`, which bluntly reduces the balance by every inbound dollar regardless of whether it's linked to a draw or not. This is the only credit-balance approximation in the system, and it conflates deposits with invoice payments.

---

### Q9 — Do any Master Agent verbs handle prepayment / credit application?

**Finding: No dedicated verb.** Relevant verbs:
- `log_payment` — hardcodes `type: 'client_payment'`; description param is free-text (e.g. "Deposit")
- No `record_deposit`, `apply_credit`, `compose_draw_with_credit` verb exists
- The system does not track whether a `log_payment` call was a deposit vs. a mid-draw payment
- `approve_sub_invoice` and `log_sub_payment` are sub-side (outbound); no equivalent for client-side credit

---

### Q10 — Implication for the draw composer

The draw composer will need to answer: **"What has the client already paid that isn't yet tied to a draw invoice?"**

Today there is no way to answer this directly. The closest proxy is:
```sql
SELECT SUM(amount)
FROM job_transactions
WHERE job_id = $1
  AND direction = 'in'
  AND status = 'paid'
  AND invoice_id IS NULL   -- not attached to any invoice
```
But this query also picks up legacy manual payments that predate the invoicing arc and were never meant to be "unapplied credit." There is no `is_unapplied_credit` flag.

---

### Open questions — prepayment track

1. **Does Kalin want a formal credit pool?** Option A: treat all inbound with `invoice_id IS NULL` as unapplied credit. Option B: add a `client_credit_id UUID` column to `job_transactions` + a `client_credits` table with allocation rows. Option C: no pool — always create an invoice before collecting payment; the Stripe invoice flow already enforces this for Stripe payments.

2. **Should `client_deposit` be fully deprecated in favor of always using `client_payment` + `invoice_id`?** The two types behave identically in all aggregations today. The difference is purely semantic labeling in the UI.

3. **Phase gate bug — `checkDepositPaid` excludes `client_deposit` type.** Fix in Phase 1 of the arc? Or is this a standalone one-line fix to ship now?

4. **Overpayment handling.** Does Avenstone ever collect more than the invoice amount? If yes, Phase 1 should add `overpayment_amount` or a credit row insert in the Stripe webhook. If no (Stripe enforces exact amounts), no action needed.

5. **Manual deposit-to-draw linkage.** If a client hands over a check before Draw 1 is composed, is that deposit expected to auto-apply to Draw 1, or does the PM manually note it? This choice determines whether the draw composer needs a "credit offset" step or just shows a separate "existing credit" line.

---

### Updated arc shape — prepayment additions

Phase 1 (schema) should additionally include:
- **Fix `checkDepositPaid`** to OR `type IN ('client_payment','client_deposit')` (one-line JS fix)
- **Decision checkpoint:** add `is_unapplied_credit BOOLEAN DEFAULT false` to `job_transactions` or defer credit pool to Phase 3

Phase 2 (draw composer) should show:
- A "Client Credit Available" line if any `direction='in' status='paid' invoice_id IS NULL` rows exist
- The composer subtracts the credit from the draw total before setting `target_amount` (optional offset step)

Phase 3 (draw paid cascade) should:
- When a draw invoice is paid, attempt to match against any unallocated `invoice_id IS NULL` inbound rows and mark them with the invoice FK (retroactive linkage) — or accept they remain unlinked

Phase 5 (Master Agent) should add:
- `record_deposit` verb that uses `type: 'client_deposit'` and explicitly flags `invoice_id = null` (credit pool entry)
- `apply_credit` confirm-gated verb: "apply $5,000 credit to Draw 2" → sets `invoice_id` on the deposit row
