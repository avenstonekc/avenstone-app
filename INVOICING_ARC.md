# INVOICING_ARC.md

*Living design doc. Update as decisions are made. Built 2026-05-05.*

## 1. Why

The current financial system has a clean ledger (`job_transactions`), Stripe Checkout integration, and QB CSV export. What it doesn't have is invoicing. Today, billing a client means creating a payment LINK — an email with an amount and a "Pay Now" button. There's no invoice number, no invoice date, no PDF document, no line-item breakdown sent to the client.

That's a real gap for a GC business. Clients expect proper invoices for accounting. Construction is billed in draws (milestone payments) and right now there's no structure for that — every payment request is ad hoc.

This arc adds invoicing as a first-class capability: **the app becomes the invoicing system, QuickBooks is the accounting destination via CSV** (no QB API integration). Draws are milestone-based (deposit → framing → drywall → completion, etc., per job), and invoices are generated from those draws as work progresses.

## 2. Current state (brief)

Detailed in scoping report. Key facts:
- `job_transactions` is the unified ledger. `draw_number` column already exists, never wired to UI.
- Stripe Checkout works end-to-end via `create-payment-link` edge fn + `stripe-webhook`. Webhook updates job_transactions to `paid`.
- ClientPortal Payments tab reads the `payments` compat view (over `job_transactions`) and renders pending payments with Pay Now buttons.
- FinancialsTab has Ledger / Budget / Change Orders sub-tabs.
- No invoice document, no PDF generation for billing, no draw schedule UI, no invoice numbering.

## 3. Desired state — the model

Three new entities, layered cleanly above the existing `job_transactions` ledger.

### Draw schedule

A planned billing schedule for a job. One job → many draws. Each draw represents a milestone payment: "Draw 2: at framing complete, $40,000." A draw can produce one or more invoices (partial billing supported). When all invoices for a draw are paid, the draw is closed.

### Invoice

A billing document. References a job + (optionally) a draw + has line items + has a PDF + has a state. May be tied to a draw (typical milestone billing) or standalone (ad-hoc — change order invoiced separately, materials reimbursement, etc.). When sent, a Stripe Checkout link is generated and emailed to the client. When the client pays, the webhook reconciles back to the invoice + creates a `job_transactions` row.

### Invoice line items

The composable detail of an invoice. Each line has description, quantity, unit price, total. Lines can be pulled from `estimate_line_items` (work scoped during estimating), pulled from approved `change_orders`, or manually entered. PM composes the invoice from any of these sources before sending.

### How it connects to the ledger

`job_transactions` stays as the canonical money-movement ledger. An invoice doesn't ITSELF live in `job_transactions` — but when an invoice is paid, the resulting payment row in `job_transactions` carries an `invoice_id` FK linking back to the invoice. Reconciliation: the sum of paid `job_transactions` rows for an invoice equals the invoice total.

## 4. Schema additions

### `draw_schedules`

```sql
CREATE TABLE draw_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  draw_number INT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  target_amount NUMERIC NOT NULL,
  target_date DATE,
  phase TEXT,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'in_progress', 'paid', 'cancelled')),
  invoiced_amount NUMERIC NOT NULL DEFAULT 0,
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_draw_per_job ON draw_schedules (job_id, draw_number);
CREATE INDEX idx_draw_tenant_status ON draw_schedules (tenant_id, status);
```

`status` lifecycle: `planned` → `in_progress` (first invoice generated) → `paid` (when invoiced_amount = target_amount AND paid_amount = invoiced_amount). `cancelled` is terminal off-ramp.

### `invoices`

```sql
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  draw_id UUID REFERENCES draw_schedules(id) ON DELETE SET NULL,

  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,

  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  amount_paid NUMERIC NOT NULL DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'viewed', 'paid', 'partially_paid', 'overdue', 'void')),

  pdf_url TEXT,
  notes TEXT,
  internal_notes TEXT,

  stripe_session_id TEXT,
  stripe_checkout_url TEXT,

  created_by_id UUID REFERENCES profiles(id),
  sent_at TIMESTAMPTZ,
  sent_by_id UUID REFERENCES profiles(id),
  first_viewed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  voided_by_id UUID REFERENCES profiles(id),
  void_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_invoice_number_per_tenant ON invoices (tenant_id, invoice_number);
CREATE INDEX idx_invoice_tenant_status ON invoices (tenant_id, status);
CREATE INDEX idx_invoice_job ON invoices (job_id);
CREATE INDEX idx_invoice_draw ON invoices (draw_id);
```

### `invoice_line_items`

```sql
CREATE TABLE invoice_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,

  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit TEXT,
  unit_price NUMERIC NOT NULL,
  line_total NUMERIC NOT NULL,

  source_type TEXT CHECK (source_type IN ('estimate_line_item', 'change_order', 'manual')),
  source_id UUID,
  phase TEXT,

  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoice_line_invoice ON invoice_line_items (invoice_id);
```

### `job_transactions` extension

```sql
ALTER TABLE job_transactions
  ADD COLUMN invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL;

CREATE INDEX idx_jt_invoice ON job_transactions (invoice_id);
```

### Invoice numbering

Per-tenant, year-prefixed sequence: `INV-{YYYY}-{seq}` where seq is zero-padded 4-digit, resets annually. Generated server-side via Postgres function:

```sql
CREATE OR REPLACE FUNCTION next_invoice_number(p_tenant_id UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  current_year INT := EXTRACT(YEAR FROM NOW());
  next_seq INT;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(invoice_number, '-', 3) AS INT)
  ), 0) + 1
  INTO next_seq
  FROM invoices
  WHERE tenant_id = p_tenant_id
    AND invoice_number LIKE 'INV-' || current_year || '-%';
  RETURN 'INV-' || current_year || '-' || LPAD(next_seq::TEXT, 4, '0');
END;
$$;
```

## 5. State machines

### Invoice lifecycle

Forward path: `draft` → `sent` → `viewed` → `paid` (terminal). `partially_paid` between `viewed` and `paid` if multiple payments. Off-ramps: `void` (terminal) from any non-terminal state. Time-derived: `overdue` when past due_date and not paid; auto-derived, recovers to prior state on payment.

**Edit-after-send rule:** invoice is editable in `sent` state with a revision log entry; locked after `paid`.

### Draw lifecycle

`planned` → `in_progress` (first invoice generated) → `paid` (invoiced_amount = target_amount AND paid_amount = invoiced_amount). `cancelled` terminal off-ramp.

## 6. UI map

### FinancialsTab — new "Invoices" sub-tab

Adds a fourth sub-tab alongside Ledger / Budget / Change Orders.

**Top section: Draw Schedule for this job.** Visual timeline or table of planned draws — number, milestone title, target amount, target date, status, invoiced_amount / paid_amount progress. "Add Draw" button opens modal to plan a new draw. "Generate Invoice" button per draw opens invoice composer pre-filled from the draw.

**Below: Invoices for this job.** Table of invoices — number, date, total, status pill, amount paid / due. Filter by status. Click opens InvoiceDetailModal. "+ New Invoice" button for standalone invoices.

### Invoice composer modal

Job locked. Draw dropdown (or "Standalone"). Invoice number auto-populated from `next_invoice_number()`, editable rarely. Invoice date today. Due date today + 30 days (hardcoded for v1, configurable later). Notes optional client-visible text.

**Line items section:** "Add line from estimate" picks from `estimate_line_items`. "Add line from change order" picks approved COs. "+ Add manual line." Each line editable inline. Subtotal / tax / total computed live. **Tax is manual entry per invoice for v1 — no tax engine integration.**

**Footer:** Save Draft (primary), Save & Send (primary, secondary action) which generates PDF + creates Stripe link + emails client + transitions to `sent`.

### InvoiceDetailModal

Full invoice display: header with number, date, status pill, action buttons. Line items (read-only if sent/paid). Total summary. Stripe payment status. Linked transactions. Action buttons by state: Send to Client (draft), Download PDF, Void Invoice (with reason), Resend.

### ClientPortal — Invoices section

Replaces or augments the current Payments section. Each invoice rendered as a card: number, date, total, status, "View Invoice" + "Pay Now" buttons. View Invoice opens PDF in new tab (signed URL). Pay Now triggers Stripe Checkout (existing flow with invoice_id passed through).

For backwards compatibility, the `payments` compat view stays alive briefly. Phase 6 migrates the client surface fully off it.

## 7. Stripe + email integration

### Send invoice flow

1. PM clicks "Save & Send" on invoice composer
2. New edge fn `send-invoice` generates PDF via pdf-lib, uploads to `job-documents/{jobId}/invoices/{invoiceNumber}.pdf`, gets signed URL, stores `pdf_url` on invoice
3. Server creates Stripe Checkout Session reusing `create-payment-link` infra, passing `invoice_id` in metadata
4. Server emails client via Resend (`notifications@avenstonekc.com`): subject "Invoice [number] from Avenstone — $[total]", body with brief description, **signed PDF link in body** (not attachment — fallback attach if delivery requires), Pay Now button linking to Stripe
5. Invoice transitions to `sent`, `sent_at` and `sent_by_id` stamped

### Webhook reconciliation

`stripe-webhook` extends to:
- On `checkout.session.completed`: read `invoice_id` from metadata, create `job_transactions` row with `invoice_id` set, update `invoices.amount_paid`, transition `invoices.status` to `paid` or `partially_paid`
- Notify all tenant staff of payment AND notify the client (closes the existing "client notification silence" open item)

### Stripe product choice

We use **Stripe Checkout (one-time payment links)**, not Stripe Invoices product. Reason: keeps full control over the invoice document for white-label tenant customization later.

## 8. PDF generation

Library: **pdf-lib** (per CLAUDE.md priority list — same lib intended for lien waivers).

Generated server-side in the `send-invoice` edge fn (Deno-compatible pdf-lib).

Layout:
- Header: tenant logo, business name, address, phone, email
- "INVOICE" + invoice number, date, due date
- Bill To: client name, address (from job)
- Project: job address
- Line items table: description, qty, unit, price, total
- Subtotal, tax, total
- Notes
- Payment instructions

White-label aware: tenant logo + business info pulled from tenant config (deferred — for v1, hardcode Avenstone).

## 9. Phased rollout

**Phase 1 — Schema foundation.** Create `draw_schedules`, `invoices`, `invoice_line_items` tables. Add `job_transactions.invoice_id`. Create `next_invoice_number` Postgres function. Full RLS on all new tables. Strictly additive.

**Phase 2 — Helpers + draw schedule UI.** `sb*` helpers for draws (CRUD). New "Invoices" sub-tab on FinancialsTab with draw schedule section. Add Draw modal, edit/delete draws. No invoice generation yet.

**Phase 3 — Invoice composer.** Composer modal with line item composition. Save Draft helper. Read estimate_line_items + change_orders for line picking. No PDF, no send yet — drafts only.

**Phase 4 — PDF generation + send.** `send-invoice` edge fn: PDF via pdf-lib, upload to storage, Stripe Checkout Session, email client. "Save & Send" wires through. State transitions to `sent`. Update `stripe-webhook` to reconcile invoices.

**Phase 5 — Client-side surfaces.** ClientPortal Invoices section. View PDF, Pay Now. Migrate payment view to show invoice context.

**Phase 6 — Polish.** Overdue auto-derivation. Resend / void flows. Client notification on payment success. Migrate ClientPortal off `payments` compat view.

## 10. Out of scope (deferred to second invoicing arc)

- Sub financial visibility ("My Payments" in SubPortal — `sbLoadSubPayments` exists, needs UI)
- Lien waiver PDF auto-generation (upload-only stays)
- Retainage UI / release workflow
- QB API integration (CSV stays canonical)
- Recurring invoices / payment plans
- Tax engine integration
- Multi-currency
- Credit memos / refund workflow as first-class
- Late fees automation
- White-label tenant logo / business info (hardcode Avenstone v1)

## 11. Decisions locked (2026-05-05)

1. **Stripe Checkout, not Stripe Invoices product.** Full control over invoice document for white-label later.
2. **Tax: manual per invoice.** Tax engine deferred.
3. **Phase carried on invoice line items.** Preserves existing Budget vs Actual phase-string match.
4. **Default due date hardcoded today + 30 days.** Configurable later.
5. **PDF as signed link in email body.** Attachment as delivery fallback only.
6. **Edit-after-send allowed in `sent` state with revision log; locked after `paid`.**

## 12. Open questions

None active. Section retained for future additions as build slices surface decisions.
