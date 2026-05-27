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
