# Cost-Plus Arc — Design Blueprint

_Living doc. Update each phase as it ships. Audit source: COST_PLUS_AUDIT.md (2026-05-27 + prepayment additive audit 2026-05-27). Blueprint session: 2026-05-27._

---

## Purpose

Cost-plus job pricing is a real workflow Avenstone has supported via checkbox + legacy `job_cost_items` table since pre-ledger-rebuild. Today the implementation is fractured: client portal reads one system (`job_cost_items` + `job_cost_invoices`), the new ledger writes to another (`job_transactions`), and there's no draw composer that pulls actual expenses + markup. This arc closes the loop — every cost-plus job becomes a tracked float (client paid - expenses incurred = what the client owes net), draws auto-pull pending expenses with the right markup, and client portal shows per-draw breakdowns instead of raw cost items.

**Replaces**: legacy `job_cost_items` client portal view (deprecated in Phase 6 — separate cleanup arc).
**Augments**: FinancialsTab Ledger (new "Float" stat cards), Invoices sub-tab (new Compose Draw flow), Master Agent (`compose_draw` + `record_deposit` verbs).
**Powers**: accurate cost-plus billing, real-time float visibility ("client owes me $X right now"), per-draw audit trail, future arc options (cost-plus reporting, multi-period draws).

---

## Why Now

The double-charge bug. Kalin runs Avenstone KC partly on cost-plus. Today his options on cost-plus jobs:

1. Hand-calculate float in his head — error-prone, no audit trail.
2. Bill clients via the manual DrawModal flat dollar — easy to forget what's already been billed, easy to bill the same expense twice.
3. The legacy `job_cost_items` UI exists but new payments aren't writing there, so it's stale on any job using the new ledger.

Real product gap. He's tracking cost-plus on paper while the app pretends to support it. Three concrete problems:

**1. No "what's the client's balance" view.** Client paid $4,500 deposit. You bought $6,200 in materials + sub payments. Balance is -$1,700 + markup. The app shows nothing.

**2. Draw composer creates double-charge risk.** Without distinguishing reimbursed vs unreimbursed expenses, draws would re-bill expenses already covered by deposits.

**3. Markup logic is fragmented.** `estimate_line_items.markup_pct`, `job_cost_items.markup_pct`, `jobs.default_markup_pct` — three places, none authoritative for the actual ledger.

This arc gives Kalin the dashboard that says "Mike's job: $4,500 in, $6,200 out, $1,700 to bill next + 15% on labor / 18% on materials = $2,003 next draw."

---

## Core Mental Model

> "We've been paid $X by the client. Expenses eat that bucket. Bucket goes red. Next draw bills the red + markup %. Client pays draw. Bucket replenishes."

The **bucket** = all inbound `job_transactions` rows where `invoice_id IS NULL`. Every dollar the client paid that isn't yet attached to a draw invoice is available credit. Expenses eat against it implicitly via the math:

```
Float (what we're owed next) = sum(unreimbursed_expenses × (1 + markup_pct)) - bucket_balance
```

When `float > 0`: client owes us money. Compose a draw.
When `float <= 0`: client credit covers current expenses. No draw needed yet.

No new credit pool table. The math derives credit balance from existing columns.

---

## Flow

Job marked cost-plus on creation → labor/material markups set on InfoTab → first deposit logged (inbound, `invoice_id=null` — lands in bucket) → expenses incurred (sub payments, materials, permits) — each direction=out row on a cost-plus job gets `reimbursement_status='unreimbursed'` auto-stamped by a DB trigger → owner clicks **Compose Draw** → composer pulls all `unreimbursed` expenses, applies the right markup per row, shows running total + offset by current bucket balance → owner selects what to include + adds forward-looking line items → confirms → `draw_schedules` row created + `draw_line_items` rows created + linked transactions stamped `reimbursement_status='in_draw'` + `draw_id` populated → invoice composed from the draw → client pays invoice via Stripe → `sbMarkInvoicePaid` cascade flips linked transactions to `reimbursement_status='reimbursed'`, draw moves to `status='paid'` → bucket replenishes → cycle continues.

---

## Phase Plan

| Phase | Scope | Estimated Prompts | Status |
|-------|-------|-------------------|--------|
| 0 — Foundation fixes | `checkDepositPaid` OR fix (shipped 2026-05-27), Stripe overpayment → surplus bucket row | 1 (checkDepositPaid shipped) | Partially done |
| 1 — Schema foundation | `jobs.labor_markup_pct` + `material_markup_pct`, `job_transactions` new columns (`draw_id` FK, `reimbursement_status`, `markup_pct`, `reimbursed_at`), `draw_line_items` table, DB trigger for cost-plus defaults on insert, backfill for existing cost-plus rows | 2 | Planned |
| 2 — Draw composer UI | "Compose Draw" entry on InvoicesSubTab → modal with unreimbursed expense list, per-row markup, bucket balance offset, forward-looking line items, confirm gate | 3 | Planned |
| 3 — Draw paid cascade | `sbMarkInvoicePaid` extended to flip linked transactions to `reimbursement_status='reimbursed'`; void-invoice reverse cascade | 1 | Planned |
| 4 — Float visibility | Cost-plus stat cards on FinancialsTab: "Float Unreimbursed", "Bucket Balance", "Markup Earned"; `sbLoadJobFinancialSummary` extended | 2 | Planned |
| 5 — Master Agent verbs | `compose_draw` (confirm-gated, auto-loads expenses + bucket balance), `record_deposit` (explicit deposit entry, lands in bucket); update `log_payment` description to clarify deposit vs draw distinction | 2 | Planned |
| 6 — Client portal migration | Replace legacy `job_cost_items` view with per-draw breakdown on cost-plus jobs; gate per job-creation-date until fully migrated | 3 | Planned |

**Total v1: ~14 prompts.** Phases 1–5 = working internal cost-plus tracking. Phase 6 closes the client-portal loop.

---

## Reused vs Net-New

### Reused (wire up, don't rebuild)

- `jobs.cost_plus BOOLEAN` — gate for the whole arc.
- `jobs.default_markup_pct NUMERIC` — migration backfill source for new markup cols. Keep for backward compat.
- `draw_schedules` table — keep. Phase 1 adds the line items child table; the parent stays.
- `draw_schedules.draw_number INT` — keep as soft sequential label ("Draw 1, 2, 3"). New `draw_id UUID` FK is the structural link.
- `invoices.draw_id UUID FK` — already links invoice → draw. Unchanged.
- `sbMarkInvoicePaid` — extended in Phase 3 with reimbursement cascade.
- Stripe webhook — updated in Phase 0 for overpayment handling, otherwise unchanged.
- `InvoiceComposerModal` with `prefillDrawId` — Phase 6 may evolve; Phase 2 composer creates a draw first, then links an invoice.
- `ClientPortal.jsx` cost-plus tab gate — Phase 6 replaces the content, keeps the tab.
- `set_updated_at()` trigger — already exists, applied to `draw_line_items`.
- `get_my_tenant_id()` / `get_my_role()` RLS helpers — standard RLS pattern.

### Net-New (must build)

- `jobs.labor_markup_pct NUMERIC DEFAULT 0` + `jobs.material_markup_pct NUMERIC DEFAULT 0` columns.
- `job_transactions.draw_id UUID FK → draw_schedules.id` (replaces soft `draw_number INT` linkage).
- `job_transactions.reimbursement_status TEXT CHECK('unreimbursed','in_draw','reimbursed')`.
- `job_transactions.markup_pct NUMERIC DEFAULT 0` — applied markup rate for this expense row.
- `job_transactions.reimbursed_at TIMESTAMPTZ` — audit trail timestamp.
- `draw_line_items` table.
- `set_cost_plus_defaults_on_jt()` BEFORE INSERT trigger on `job_transactions`.
- `cascade_draw_paid_to_transactions(invoice_id UUID)` Postgres function (Phase 3).
- Compose Draw modal (Phase 2).
- Float / Bucket stat cards on FinancialsTab (Phase 4).
- `sbComposeDraw` + `sbVoidDraw` helpers.
- `compose_draw` + `record_deposit` Master Agent verbs (Phase 5).
- Per-draw client portal view (Phase 6).
- InfoTab additions: `labor_markup_pct` + `material_markup_pct` inputs (Phase 1, minor).

---

## Locked Decisions

**1. Bucket = inbound rows with `invoice_id IS NULL`.** No new credit pool table. Math derives credit balance from existing columns. Simple, no parallel state. Every dollar the client paid that isn't yet attached to a draw invoice is available bucket credit.

**2. Two markup rates: labor + material.** Stored on `jobs` as `labor_markup_pct` and `material_markup_pct`. Default applied at expense insert based on `type` column. Per-row override in draw composer.

**3. Type-to-markup mapping** (defaults — overridable per row in composer):
- `sub_payout`, `labor` → `labor_markup_pct`
- Everything else (`material_purchase`, `permit`, `other_expense`, `fuel`, `equipment_rental`, `vendor_payment`, `commission`, etc.) → `material_markup_pct`

**4. Client portal shows per-draw breakdowns, not raw expenses.** Composed draws become the client-facing view. Client never sees individual pending expenses pre-draw — only what they owe on the draw that's been issued.

**5. Reimbursement state machine on `direction='out'` rows for cost-plus jobs:**
- `NULL` — non-cost-plus job OR not a reimbursable expense (trigger leaves NULL for non-cost-plus jobs)
- `'unreimbursed'` — incurred, not yet in any draw
- `'in_draw'` — included in a composed draw, draw invoice not yet paid
- `'reimbursed'` — draw covering this expense was paid by client

Transitions: `NULL → unreimbursed` (at insert on cost-plus job, via trigger); `unreimbursed → in_draw` (compose draw); `in_draw → reimbursed` (draw invoice paid); `in_draw → unreimbursed` (draw voided or invoice voided, via cascade).

**6. At insert time on cost-plus jobs, `direction='out'` rows get `reimbursement_status='unreimbursed'` automatically.** Enforced via `set_cost_plus_defaults_on_jt()` BEFORE INSERT trigger. Non-cost-plus jobs: trigger is a no-op.

**7. `draw_id UUID FK` replaces soft `draw_number INT` for structural linkage.** Keep `draw_number INT` for display ("Draw 1, 2, 3"). New FK is the structural link.

**8. `draw_line_items` table is mandatory.** Audit trail wins. Reimbursement cascade and client-visible per-draw breakdown both depend on persistent per-row linkage. A snapshot (flat amount) loses the "which expense went into which draw" history.

**9. Forward-looking line items in `draw_line_items`** with `transaction_id=NULL` and `is_forward_looking=true`. They count toward the draw total but don't reference an existing expense row. When the actual expense lands later, it's a separate `job_transactions` row. No auto-reconciliation in v1 — owner manually decides whether to exclude it from the next draw composition.

**10. Markup math: pre-tax, additive.** `markup_amount = base × (markup_pct / 100)`. `total_with_markup = base + markup_amount`. Stored explicitly on `draw_line_items` for audit. Not re-derived from rate after save.

**11. Voiding a draw** sets all linked `job_transactions` rows back to `reimbursement_status='unreimbursed'`, clears `draw_id`, deletes `draw_line_items` rows. Forward-looking lines simply disappear. Draw row itself is not hard-deleted — it gets `status='cancelled'` for audit.

**12. Voiding an invoice linked to a draw** (existing flow — `sbVoidInvoice`): Phase 3 adds a reverse cascade: any `'reimbursed'` transactions that were flipped by the prior paid-cascade revert to `'in_draw'`. If the draw itself is then voided, transitions continue to `'unreimbursed'`.

**13. Stripe overpayment** (Phase 0): when `amount_paid > total_amount` after Stripe fires, the surplus amount becomes a separate inbound `job_transactions` row with `invoice_id=null` (joins the bucket automatically). One-line webhook change. No new schema needed.

**14. No mid-draw prepayment auto-reconciliation in v1.** If client sends extra money during a draw cycle, log it as a separate inbound row. Draw composer at next composition shows the updated bucket balance. Owner applies manually by seeing the offset.

**15. Refunds at job close**: out of v1 scope. If client overpays and bucket has leftover at job complete, owner handles manually via a refund line item or external transaction.

**16. No retroactive backfill of historical `job_cost_items`**. Phase 6 handles client portal migration. Legacy jobs see the legacy view until Phase 6 is applied to them.

**17. Phase 0 partially shipped**: `checkDepositPaid` OR fix (`client_deposit` type recognized) landed 2026-05-27 across all three copies (phaseGates.js, ai-field-agent, ai-master-agent). Stripe overpayment handling remains for Phase 0 polish.

**18. No tenant-level default markup config in v1.** Per-job markups only. Both `labor_markup_pct` and `material_markup_pct` must be manually entered per job. Future arc adds tenant defaults if needed.

**19. `default_markup_pct` is kept, not dropped.** Phase 1 migration backfills both new columns from it. In InfoTab Phase 1 update, the three fields coexist: `default_markup_pct` (existing, now labeled "Legacy markup"), `labor_markup_pct`, `material_markup_pct`. Deprecate and hide `default_markup_pct` UI after Phase 5 is verified.

**20. Bucket balance display when negative**: show as "Client owes: $X" (positive number). Never show the raw negative — confusing. When bucket balance is positive (client paid more than we've spent), show "Credit in bucket: $X".

---

## Phase Detail

### Phase 0 — Foundation fixes (partially shipped)

**Shipped:**
- `checkDepositPaid` OR fix — all three copies updated to `.in('type', ['client_payment', 'client_deposit'])`. Commit: 68c41b9. Zero stranded jobs found.

**Remaining Phase 0 — Stripe overpayment (1 prompt):**

When `amount_paid + paidAmount > total_amount` in the Stripe webhook `handleInvoicePayment`:
1. Mark invoice as `status='paid'` as today.
2. Calculate `surplus = (amount_paid + paidAmount) - total_amount`.
3. If `surplus > 0`: insert a second `job_transactions` row — `direction='in'`, `type='client_payment'`, `invoice_id=null` (bucket), `amount=surplus`, `description='Overpayment credit'`, `stripe_session_id` same as the payment for traceability.
4. No notification in v1 — PM sees the bucket balance in Phase 4 stat cards.

This single webhook change makes all overpayments land in the bucket automatically.

---

### Phase 1 — Schema foundation (2 prompts)

**Prompt 1A — Migration:**

```sql
-- jobs: two markup columns
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS labor_markup_pct NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS material_markup_pct NUMERIC DEFAULT 0;

-- Backfill existing cost-plus jobs from default_markup_pct
UPDATE jobs
  SET labor_markup_pct = COALESCE(default_markup_pct, 0),
      material_markup_pct = COALESCE(default_markup_pct, 0)
  WHERE cost_plus = true;

-- job_transactions: structural cost-plus columns
ALTER TABLE job_transactions
  ADD COLUMN IF NOT EXISTS draw_id UUID REFERENCES draw_schedules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reimbursement_status TEXT
    CHECK (reimbursement_status IN ('unreimbursed', 'in_draw', 'reimbursed')),
  ADD COLUMN IF NOT EXISTS markup_pct NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reimbursed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_jt_draw ON job_transactions(draw_id)
  WHERE draw_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jt_reimb_unreim ON job_transactions(job_id, reimbursement_status)
  WHERE reimbursement_status = 'unreimbursed';
CREATE INDEX IF NOT EXISTS idx_jt_bucket ON job_transactions(job_id, invoice_id)
  WHERE direction = 'in' AND invoice_id IS NULL;

-- draw_line_items: new table
CREATE TABLE draw_line_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL,
  draw_id           UUID NOT NULL REFERENCES draw_schedules(id) ON DELETE CASCADE,
  transaction_id    UUID REFERENCES job_transactions(id) ON DELETE RESTRICT,
  description       TEXT NOT NULL,
  base_amount       NUMERIC(12,2) NOT NULL CHECK (base_amount >= 0),
  markup_pct        NUMERIC NOT NULL DEFAULT 0 CHECK (markup_pct >= 0),
  markup_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_with_markup NUMERIC(12,2) NOT NULL,
  is_forward_looking BOOLEAN NOT NULL DEFAULT false,
  display_order     INT NOT NULL DEFAULT 0,
  created_by_id     UUID REFERENCES profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_dli_fwd_or_tx CHECK (
    (is_forward_looking = true AND transaction_id IS NULL) OR
    (is_forward_looking = false AND transaction_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_dli_draw ON draw_line_items(draw_id);
CREATE INDEX IF NOT EXISTS idx_dli_transaction ON draw_line_items(transaction_id)
  WHERE transaction_id IS NOT NULL;

ALTER TABLE draw_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dli_tenant_select ON draw_line_items;
CREATE POLICY dli_tenant_select ON draw_line_items
  FOR SELECT TO authenticated
  USING (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS dli_modify ON draw_line_items;
CREATE POLICY dli_modify ON draw_line_items
  FOR ALL TO authenticated
  USING (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner', 'project_manager'))
  WITH CHECK (tenant_id = get_my_tenant_id() AND get_my_role() IN ('owner', 'project_manager'));

DROP TRIGGER IF EXISTS draw_line_items_updated_at ON draw_line_items;
CREATE TRIGGER draw_line_items_updated_at
  BEFORE UPDATE ON draw_line_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Prompt 1B — Trigger + backfill + helpers:**

```sql
-- BEFORE INSERT trigger: stamp cost-plus defaults on job_transactions
CREATE OR REPLACE FUNCTION set_cost_plus_defaults_on_jt() RETURNS TRIGGER AS $$
DECLARE
  v_cost_plus      BOOLEAN;
  v_labor_markup   NUMERIC;
  v_material_markup NUMERIC;
BEGIN
  SELECT cost_plus,
         COALESCE(labor_markup_pct, 0),
         COALESCE(material_markup_pct, 0)
    INTO v_cost_plus, v_labor_markup, v_material_markup
    FROM jobs WHERE id = NEW.job_id;

  IF v_cost_plus = true AND NEW.direction = 'out' THEN
    -- Apply markup rate by expense type
    IF (NEW.markup_pct IS NULL OR NEW.markup_pct = 0) THEN
      IF NEW.type IN ('sub_payout', 'labor') THEN
        NEW.markup_pct := v_labor_markup;
      ELSE
        NEW.markup_pct := v_material_markup;
      END IF;
    END IF;
    -- Default reimbursement_status
    IF NEW.reimbursement_status IS NULL THEN
      NEW.reimbursement_status := 'unreimbursed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jt_cost_plus_defaults ON job_transactions;
CREATE TRIGGER jt_cost_plus_defaults
  BEFORE INSERT ON job_transactions
  FOR EACH ROW EXECUTE FUNCTION set_cost_plus_defaults_on_jt();

-- Backfill existing cost-plus job expense rows
-- Step 1: mark rows that were linked to a now-paid draw via draw_number as reimbursed
UPDATE job_transactions jt
SET reimbursement_status = 'reimbursed',
    reimbursed_at         = NOW()
FROM jobs j
JOIN draw_schedules ds
  ON ds.job_id = j.id
 AND ds.draw_number = jt.draw_number
 AND ds.status = 'paid'
WHERE jt.job_id = j.id
  AND j.cost_plus = true
  AND jt.direction = 'out'
  AND jt.status = 'paid'
  AND jt.reimbursement_status IS NULL;

-- Step 2: remaining cost-plus expense rows → unreimbursed
UPDATE job_transactions jt
SET reimbursement_status = 'unreimbursed'
FROM jobs j
WHERE jt.job_id = j.id
  AND j.cost_plus = true
  AND jt.direction = 'out'
  AND jt.reimbursement_status IS NULL;
```

**InfoTab additions (same prompt):** Add `labor_markup_pct` and `material_markup_pct` fields to the cost-plus section in `InfoTab.jsx`. Show alongside existing `default_markup_pct`. Update `sbGetJobs` / `sbSave` to include new columns in read/write allowlist.

**Helpers (supabase.js additions):**
- `sbLoadUnreimbursedExpenses(jobId)` — returns all `direction='out' AND reimbursement_status='unreimbursed'` rows, ordered by `date_incurred` ASC.
- `sbGetBucketBalance(jobId)` — sums `direction='in' AND invoice_id IS NULL AND status='paid'` minus `SUM(unreimbursed out rows)`. Returns `{ bucket: number, unreimbursed: number, float: number }`.
- `sbComposeDraw({ jobId, title, description, lineItems, targetAmount })` — creates draw_schedules row, inserts draw_line_items, stamps `job_transactions.reimbursement_status='in_draw'` + `draw_id` on linked rows. Atomic via RPC.
- `sbVoidDraw(drawId)` — sets draw `status='cancelled'`, reverses linked transactions to `'unreimbursed'`, clears `draw_id`, deletes `draw_line_items` rows.

---

### Phase 2 — Draw composer UI (3 prompts)

**Entry point:** "Compose Draw" button on InvoicesSubTab, visible only when `job.cost_plus = true`. No button shown for non-cost-plus jobs.

**Prompt 2A — Modal structure:**

Full-screen overlay (not a modal — matches `AiIntakeWizard` / `FloorPlanEditorScr` pattern). Three sections:

```
┌─ Compose Draw — [Job Address] ────────────────────────────────────────┐
│                                                                        │
│  ┌─ Bucket Balance ──────────────────────────────────────────────────┐ │
│  │  Credit in bucket: $4,500  │  Unreimbursed expenses: $6,200      │ │
│  │  → Client owes: $1,700 before markup                              │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  ┌─ Expenses to include ────────────────────────────────────────────┐ │
│  │  ☑  2026-05-14  Sub payout — ABC Tile    $1,200  15% → $1,380   │ │
│  │  ☑  2026-05-16  Materials — Home Depot   $847    18% → $999     │ │
│  │  ☑  2026-05-18  Sub payout — Bob Smith   $3,600  15% → $4,140   │ │
│  │  ☑  2026-05-20  Permit — City of KCMO    $553    18% → $652     │ │
│  │     [+ Add forward-looking line item]                             │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  ┌─ Draw summary ───────────────────────────────────────────────────┐ │
│  │  Subtotal (expenses):   $6,200                                    │ │
│  │  Total markup:          $971                                      │ │
│  │  Gross draw total:      $7,171                                    │ │
│  │  Credit offset (bucket): -$4,500                                  │ │
│  │  ─────────────────────────────                                    │ │
│  │  Draw target amount:    $2,671                                    │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  Draw title: [__________________]  Date: [________]                  │
│                                                                        │
│  [Cancel]                              [Compose Draw →]               │
└────────────────────────────────────────────────────────────────────────┘
```

**Per-row behavior:**
- Checkbox: include/exclude from this draw.
- Markup % field: pre-filled from `transaction.markup_pct` (set by trigger). Editable inline.
- Total-with-markup column: live-updates as % changes.
- Row disabled (pre-checked, greyed) if already `in_draw` — can't double-include.

**Bucket offset toggle**: "Apply bucket credit to this draw" checkbox. When checked, the draw `target_amount` = gross draw total - bucket balance. When unchecked, bucket balance is just displayed informationaly.

**Prompt 2B — Forward-looking line items:**

"+ Add line item" opens a small inline row: Description text input + Base amount input + Markup % (pre-filled from `material_markup_pct`) + computed total. Multiple rows allowed. These create `draw_line_items` rows with `is_forward_looking=true`, `transaction_id=NULL`.

**Prompt 2C — Confirm + error handling:**

On "Compose Draw →":
1. Validate: at least one line item selected.
2. Call `sbComposeDraw(...)`.
3. On success: close composer, reload InvoicesSubTab (draw appears in draw list with "Composed" status).
4. Draw in `draw_schedules` starts as `status='planned'`. Title defaults to `Draw N` (N = next draw_number). PM can rename before invoicing.
5. Error banner for DB failures — don't silently fail.

**Edit draw (optional Phase 2 addition):** If draw is in `status='planned'` (invoice not yet composed against it), allow reopening the composer with existing line items pre-loaded. On re-save, delete old `draw_line_items`, revert linked transactions to `'unreimbursed'`, reinsert new line items.

---

### Phase 3 — Draw paid cascade (1 prompt)

Extend `sbMarkInvoicePaid` in supabase.js. After the invoice is confirmed paid (both manual and Stripe paths):

```js
// If invoice has draw_id, flip linked transactions to reimbursed
if (invoice.draw_id) {
  const { data: lines } = await sb
    .from('draw_line_items')
    .select('transaction_id')
    .eq('draw_id', invoice.draw_id)
    .not('transaction_id', 'is', null);

  const txIds = lines.map(l => l.transaction_id);
  if (txIds.length > 0) {
    await sb.from('job_transactions')
      .update({ reimbursement_status: 'reimbursed', reimbursed_at: new Date().toISOString() })
      .in('id', txIds)
      .eq('reimbursement_status', 'in_draw'); // guard against double-flip
  }
}
```

Postgres function version (use from Stripe webhook side):

```sql
CREATE OR REPLACE FUNCTION cascade_draw_paid_to_transactions(p_invoice_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_draw_id UUID;
  v_count   INTEGER := 0;
BEGIN
  SELECT draw_id INTO v_draw_id FROM invoices WHERE id = p_invoice_id;
  IF v_draw_id IS NULL THEN RETURN 0; END IF;

  UPDATE job_transactions jt
    SET reimbursement_status = 'reimbursed',
        reimbursed_at        = NOW()
  FROM draw_line_items dli
  WHERE dli.draw_id          = v_draw_id
    AND dli.transaction_id   = jt.id
    AND jt.reimbursement_status = 'in_draw';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
```

**Void-invoice reverse cascade (same prompt):** When `sbVoidInvoice` fires on an invoice with `draw_id`, revert any `'reimbursed'` transactions (that were flipped by the paid cascade) back to `'in_draw'`. The draw itself stays composed until manually voided by PM.

---

### Phase 4 — Float visibility (2 prompts)

**Prompt 4A — `sbLoadJobFinancialSummary` extension:**

New return fields (cost-plus only — computed via separate queries when `job.cost_plus = true`):

```js
// existing fields unchanged
// new cost-plus fields:
float_unreimbursed  // sum of direction='out', reimbursement_status='unreimbursed' amounts
bucket_balance      // sum of direction='in', invoice_id IS NULL, status='paid' amounts
client_float_owed   // max(0, float_unreimbursed - bucket_balance)  — what client owes NET
markup_earned       // sum of draw_line_items.markup_amount for draws with status='paid'
```

**Prompt 4B — Stat cards on FinancialsTab:**

Three new cost-plus cards, rendered in the stat card row ONLY when `job.cost_plus = true`. Placed after the existing "Paid In" / "Paid Out" cards.

| Card | Label | Color | Value |
|------|-------|-------|-------|
| Float Unreimbursed | "Float Out" | Amber | `float_unreimbursed` |
| Client Net Owed | When positive: "Client Owes" (red) / When zero or negative: "Bucket Credit" (green) | Red/Green | `client_float_owed` or `bucket_balance - float_unreimbursed` |
| Markup Earned | "Markup ★" | Gold | `markup_earned` |

These cards are hidden on non-cost-plus jobs — no clutter for fixed-price workflows.

**Note:** `sbLoadJobFinancialSummary` is called in FinancialsTab on mount and after every transaction update. The new fields piggyback on the same call — no extra round-trip.

---

### Phase 5 — Master Agent verbs (2 prompts)

**Prompt 5A — `record_deposit` verb:**

New confirm-gated verb. Added to `CONFIRM_TOOLS` set.

```typescript
{
  name: "record_deposit",
  description: "Record a client deposit payment for a cost-plus job. Lands as inbound with no invoice link — adds to the bucket balance. Use when client hands over a check before a draw invoice is created.",
  input_schema: {
    properties: {
      job_id:         { type: "string" },
      amount:         { type: "number" },
      description:    { type: "string", description: "e.g. 'Initial deposit — signed contract'" },
      payment_method: { type: "string", description: "check, ach, card, cash, wire, other" },
      reference:      { type: "string", description: "Check number or confirmation number" },
    },
    required: ["job_id", "amount"],
  },
}
```

Executor: inserts `job_transactions` row with `direction='in'`, `type='client_deposit'`, `invoice_id=null`, `status='paid'`.
Confirm card text: "Record $X (X dollars) deposit from [client name if known] to job [address]. Bucket credit increases by $X."
`amountToWords` applied — same money-safety pattern as `log_payment`.

**Prompt 5B — `compose_draw` verb:**

New confirm-gated verb.

```typescript
{
  name: "compose_draw",
  description: "Compose a cost-plus draw for a job — auto-loads all unreimbursed expenses and current bucket balance, then generates a draw draft for your review. Use when owner says 'compose a draw' or 'bill the client for expenses'. Only works on cost-plus jobs.",
  input_schema: {
    properties: {
      job_id:       { type: "string" },
      title:        { type: "string", description: "e.g. 'Draw 2 — May work'" },
      apply_bucket: { type: "boolean", description: "Whether to offset the draw by existing bucket credit. Defaults to true." },
    },
    required: ["job_id"],
  },
}
```

Executor flow:
1. Load `job.cost_plus` — if false, return `{ error: "This job is not set up for cost-plus billing." }`.
2. Load unreimbursed expenses via `sbLoadUnreimbursedExpenses(jobId)`.
3. Load bucket balance via `sbGetBucketBalance(jobId)`.
4. Compute `gross = sum(expense * (1 + markup_pct/100))`.
5. Compute `draw_target = apply_bucket ? max(0, gross - bucket) : gross`.
6. Return summary as `pending_action` confirm card: "Compose draw for [address]: [N] expenses, gross $X, bucket offset -$Y, draw target $Z. Title: [title]."
7. On confirm: calls `sbComposeDraw` with all line items auto-included.

**System prompt addition:** New `COST-PLUS DRAW WORKFLOW` section explaining when to use `compose_draw` vs `log_payment` vs `record_deposit`. PM-only scope (role check before confirm card — same pattern as `approve_sub_invoice`).

---

### Phase 6 — Client portal migration (3 prompts, sequence after Phase 5)

**Goal:** Replace the legacy `job_cost_items` Financials view in `ClientPortal.jsx` with a per-draw breakdown sourced from `draw_line_items` + `draw_schedules`.

**Client-facing draw card (per draw):**

```
Draw 1 — Initial Phase                        STATUS: Paid ✓
─────────────────────────────────────────────────
Tile Installation (ABC Tile Co.)   $1,200 + 15%  =  $1,380
Materials (Home Depot)             $  847 + 18%  =  $  999
Framing Labor (Bob Smith)          $3,600 + 15%  =  $4,140
KCMO Building Permit               $  553 + 18%  =  $  652
─────────────────────────────────────────────────
Subtotal (expenses):               $6,200
Markup total:                      $  971
Draw total:                        $7,171
Credit applied:                   -$4,500
Amount invoiced:                   $2,671            ← invoice link if sent
Paid:                              2026-05-28
```

**Prompt 6A — `sbLoadClientDrawBreakdown(jobId)` helper.** Returns `draw_schedules` rows with joined `draw_line_items`. Client-filtered: only draws where a linked invoice exists (`draw_schedules.invoiced_amount > 0` or `invoices.status != 'draft'`). Excludes `status='cancelled'` draws.

**Prompt 6B — `ClientPortal.jsx` cost-plus Financials section rewrite.** Replace `job_cost_items` rendering with draw breakdown cards. Gate per `job.cost_plus = true`. Legacy `job_cost_items` section stays rendered for jobs where `draw_line_items` count is zero (backward compat for jobs that predate the arc).

**Prompt 6C — Final polish + `job_cost_items` deprecation prep.** Add a comment block to `sbLoadCostItems` noting deprecation target. Remove `ConsultationTab.jsx` line that still creates `job_cost_items` rows. Document the legacy cleanup arc (separate from this arc).

---

## Open Questions

_Real unknowns — not decisions already locked._

**Per-row markup override UX in composer.** Recommend: each row shows the auto-applied markup as a small editable text input inline. Click or tab into it to override. Visual indicator (gold border) when overridden from the job default. Reset-to-default button per row.

**Forward-looking reconciliation UX.** When the actual expense lands later, owner sees it in the next compose session as an `unreimbursed` row. They may want to note "this was already in Draw 1 as forward-looking." v1 recommendation: no auto-link. Owner manually unchecks the row if it was already billed. Add a `notes` column to `draw_line_items` so owner can type "pre-billed in Draw 1" when that comes up.

**What if the markup % on the job changes mid-arc?** Existing `draw_line_items` rows keep their stored `markup_amount`. New draws use new rates. No retroactive recompute — that would change issued invoices. OK to surface a warning ("job markup rates changed since Draw 1") in the composer if they detect a diff.

**What if owner edits the markup % on a specific draw line item after the draw is composed but before the invoice is sent?** Allow it — update `markup_amount` + `total_with_markup` in `draw_line_items`. Cascade recompute of `draw_schedules.target_amount` if the draw is in `status='planned'`.

**Bucket balance display when partially covered.** If client owes $2,671 but has $500 in the bucket, show "Credit: $500 — Net to draw: $2,171." Make the offset explicit, not buried in the draw total.

**`client_deposit` vs `client_payment` type consolidation.** Audit confirmed both types land in the bucket identically. In v1: keep both — no migration needed. Long-term: consider collapsing to one type with a `payment_subtype` discriminator. Defer to a future enum-cleanup arc.

**Migration backfill ambiguity.** Some cost-plus jobs may have paid expense rows with no `draw_number`, meaning the backfill Step 1 (mark as reimbursed if draw_number matches a paid draw) won't catch them. They'll stay `unreimbursed` after backfill. Owner must review these during Phase 1 launch. Add a post-migration query to the Phase 1 prompt: `SELECT * FROM job_transactions WHERE reimbursement_status = 'unreimbursed' AND job_id IN (SELECT id FROM jobs WHERE cost_plus = true) ORDER BY created_at DESC;` — review with Kalin before declaring Phase 1 complete.

---

## Cost Guardrails

**No vision calls in this arc.** Cost-plus is pure ledger math. No AI needed for Phases 1–5.

**No new edge functions needed for Phases 1–5.** Phase 3 extends `sbMarkInvoicePaid` (client JS); Phase 5 adds verbs to existing `ai-master-agent` function (no new fn). Phase 6 client portal is pure UI.

**`compose_draw` verb in Phase 5 fires only on owner/PM demand** — never background, never automated. Same discipline as `log_sub_invoice`.

**Storage cost:** zero new. `draw_line_items` holds 5–50 rows per draw; draws are rare per job (~3–10 per job lifetime). Negligible.

**Real product cost prevented:**
- Double-charge bug on cost-plus draws — eliminated via `reimbursement_status` state machine.
- Hand-calculated float — eliminated. Stat cards show real-time bucket balance.
- Legacy `job_cost_items` stale data confusion — eliminated post-Phase 6.
- Client disputes about "what was I charged for" — per-draw breakdown is the audit trail.

---

## Schema Reference

### `jobs` — ALTER (Phase 1)

```sql
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS labor_markup_pct   NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS material_markup_pct NUMERIC DEFAULT 0;

-- Backfill for existing cost-plus jobs
UPDATE jobs
  SET labor_markup_pct    = COALESCE(default_markup_pct, 0),
      material_markup_pct = COALESCE(default_markup_pct, 0)
  WHERE cost_plus = true;
```

Keep `default_markup_pct` — backward compat. Deprecate UI field after Phase 5 verified.

---

### `job_transactions` — ALTER (Phase 1)

```sql
ALTER TABLE job_transactions
  ADD COLUMN IF NOT EXISTS draw_id UUID
    REFERENCES draw_schedules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reimbursement_status TEXT
    CHECK (reimbursement_status IN ('unreimbursed', 'in_draw', 'reimbursed')),
  ADD COLUMN IF NOT EXISTS markup_pct   NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reimbursed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_jt_draw
  ON job_transactions(draw_id) WHERE draw_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jt_reimb_unreim
  ON job_transactions(job_id, reimbursement_status)
  WHERE reimbursement_status = 'unreimbursed';
CREATE INDEX IF NOT EXISTS idx_jt_bucket
  ON job_transactions(job_id)
  WHERE direction = 'in' AND invoice_id IS NULL;
```

---

### `draw_line_items` — CREATE TABLE (Phase 1)

```sql
CREATE TABLE draw_line_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL,
  draw_id           UUID NOT NULL REFERENCES draw_schedules(id) ON DELETE CASCADE,
  transaction_id    UUID REFERENCES job_transactions(id) ON DELETE RESTRICT,
  description       TEXT NOT NULL,
  base_amount       NUMERIC(12,2) NOT NULL CHECK (base_amount >= 0),
  markup_pct        NUMERIC NOT NULL DEFAULT 0 CHECK (markup_pct >= 0),
  markup_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_with_markup NUMERIC(12,2) NOT NULL,
  is_forward_looking BOOLEAN NOT NULL DEFAULT false,
  display_order     INT NOT NULL DEFAULT 0,
  notes             TEXT,
  created_by_id     UUID REFERENCES profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_dli_fwd_or_tx CHECK (
    (is_forward_looking = true AND transaction_id IS NULL) OR
    (is_forward_looking = false AND transaction_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_dli_draw
  ON draw_line_items(draw_id);
CREATE INDEX IF NOT EXISTS idx_dli_transaction
  ON draw_line_items(transaction_id)
  WHERE transaction_id IS NOT NULL;

ALTER TABLE draw_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dli_tenant_select ON draw_line_items;
CREATE POLICY dli_tenant_select ON draw_line_items
  FOR SELECT TO authenticated
  USING (tenant_id = get_my_tenant_id());

DROP POLICY IF EXISTS dli_modify ON draw_line_items;
CREATE POLICY dli_modify ON draw_line_items
  FOR ALL TO authenticated
  USING (tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager'))
  WITH CHECK (tenant_id = get_my_tenant_id()
    AND get_my_role() IN ('owner', 'project_manager'));

DROP TRIGGER IF EXISTS draw_line_items_updated_at ON draw_line_items;
CREATE TRIGGER draw_line_items_updated_at
  BEFORE UPDATE ON draw_line_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

### `set_cost_plus_defaults_on_jt()` trigger (Phase 1)

```sql
CREATE OR REPLACE FUNCTION set_cost_plus_defaults_on_jt()
RETURNS TRIGGER AS $$
DECLARE
  v_cost_plus       BOOLEAN;
  v_labor_markup    NUMERIC;
  v_material_markup NUMERIC;
BEGIN
  SELECT cost_plus,
         COALESCE(labor_markup_pct, 0),
         COALESCE(material_markup_pct, 0)
    INTO v_cost_plus, v_labor_markup, v_material_markup
    FROM jobs WHERE id = NEW.job_id;

  IF v_cost_plus = true AND NEW.direction = 'out' THEN
    IF (NEW.markup_pct IS NULL OR NEW.markup_pct = 0) THEN
      IF NEW.type IN ('sub_payout', 'labor') THEN
        NEW.markup_pct := v_labor_markup;
      ELSE
        NEW.markup_pct := v_material_markup;
      END IF;
    END IF;
    IF NEW.reimbursement_status IS NULL THEN
      NEW.reimbursement_status := 'unreimbursed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jt_cost_plus_defaults ON job_transactions;
CREATE TRIGGER jt_cost_plus_defaults
  BEFORE INSERT ON job_transactions
  FOR EACH ROW EXECUTE FUNCTION set_cost_plus_defaults_on_jt();
```

---

### `cascade_draw_paid_to_transactions()` function (Phase 3)

```sql
CREATE OR REPLACE FUNCTION cascade_draw_paid_to_transactions(p_invoice_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_draw_id UUID;
  v_count   INTEGER := 0;
BEGIN
  SELECT draw_id INTO v_draw_id FROM invoices WHERE id = p_invoice_id;
  IF v_draw_id IS NULL THEN RETURN 0; END IF;

  UPDATE job_transactions jt
    SET reimbursement_status = 'reimbursed',
        reimbursed_at        = NOW()
  FROM draw_line_items dli
  WHERE dli.draw_id        = v_draw_id
    AND dli.transaction_id = jt.id
    AND jt.reimbursement_status = 'in_draw';  -- guard

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

GRANT EXECUTE ON FUNCTION cascade_draw_paid_to_transactions(UUID)
  TO authenticated;
```

Reverse (void-invoice cascade):

```sql
CREATE OR REPLACE FUNCTION reverse_draw_paid_cascade(p_invoice_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_draw_id UUID;
  v_count   INTEGER := 0;
BEGIN
  SELECT draw_id INTO v_draw_id FROM invoices WHERE id = p_invoice_id;
  IF v_draw_id IS NULL THEN RETURN 0; END IF;

  UPDATE job_transactions jt
    SET reimbursement_status = 'in_draw',
        reimbursed_at        = NULL
  FROM draw_line_items dli
  WHERE dli.draw_id        = v_draw_id
    AND dli.transaction_id = jt.id
    AND jt.reimbursement_status = 'reimbursed';  -- only reverse what was reimbursed

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;
```

---

## Migration Strategy

**One Phase 1 migration** contains all ALTER + CREATE TABLE + trigger + backfill in a single atomic apply via `npm run migrate`. Exit 0 = all objects confirmed.

**No big-bang switchover.** Phases 2–5 don't require Phase 6. Internal float tracking works the moment Phase 4 lands. Client portal stays on legacy `job_cost_items` view until Phase 6 ships.

**Existing cost-plus jobs** (e.g. Lucy Webb) get backfilled in the Phase 1 migration. Owner reviews `reimbursement_status='unreimbursed'` rows post-apply to confirm the backfill caught the right state. The post-migration review query:

```sql
SELECT jt.id, jt.date_incurred, jt.type, jt.amount, jt.draw_number, jt.description
FROM job_transactions jt
JOIN jobs j ON j.id = jt.job_id
WHERE j.cost_plus = true
  AND jt.direction = 'out'
  AND jt.reimbursement_status = 'unreimbursed'
ORDER BY jt.created_at DESC;
```

---

## Out of Scope (v1)

- Tenant-level default markup config (per-job only in v1)
- Mid-draw prepayment auto-reconciliation (forward-looking line reconciliation)
- Refunds at job close (manual handling)
- Cost-plus to fixed-price job flip (not supported — error if `cost_plus` flip attempted with unreimbursed rows)
- Cross-tenant draw sharing
- `job_cost_items` / `job_cost_invoices` hard drop (separate cleanup arc post-Phase 6)
- QuickBooks export schema changes (verify only in Phase 4 — add fix if broken)
- Multi-currency
- Retainage / withholding logic
- Lien waiver per draw-line-item tracking (Sub Invoices arc handles waivers by invoice, not by draw line)
- Scheduled draw cadence (future multi-period arc)
- Cross-job cost-plus reporting / analytics

---

## Future Architecture

### Cost-Plus Reporting Arc (sketch)
Cross-job analytics: average markup earned per trade, expense type distribution, draw cadence per client, float days per job. Reads `draw_line_items` + `jobs.cost_plus`. Would be a read-only reporting screen, no new schema.

### Tenant Markup Defaults Arc (sketch)
`tenant_settings.default_labor_markup_pct` + `default_material_markup_pct`. Job creation prefills from tenant defaults; per-job override preserved. Simple 2-column alter on whatever tenant config table exists at that point.

### Multi-Period Draws Arc (sketch)
Scheduled draw cadence (every 2 weeks, on the 1st of each month). Auto-composes a draft `draw_schedules` row with `status='planned'` on schedule. PM reviews + approves before invoice is issued. Requires a scheduled job or cron-based trigger — the compose logic is the same as Phase 2; only the trigger is different.

### Legacy Cleanup Arc (sketch)
After Phase 6 is stable and all active cost-plus jobs migrated to the new view:
1. Confirm zero reads of `job_cost_items` / `job_cost_invoices` from any non-legacy path.
2. Write a migration that backfills any remaining `job_cost_items` data into `draw_line_items` / `job_transactions` for historical completeness.
3. Drop `sbLoadCostItems`, `sbLoadCostInvoices` helpers.
4. DROP TABLE `job_cost_items`, `job_cost_invoices`.
5. Remove `ConsultationTab.jsx` cost-item creation path.

---

## Amendments

_Updates made after initial publish — record rationale and date._

_(empty)_
