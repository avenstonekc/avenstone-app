Create a new file at the repo root: FINANCIALS_PLAN.md

This is a living decision log + roadmap for the financial system
rebuild. It is NOT a list of prompts. It is the context I (Claude
on web) need to stay consistent across sessions. Read it at the
start of any future session that touches financials.

Contents:

# Avenstone Financial System — Rebuild Plan

## Status as of 2026-04-23
- Bug fixes: shipped (paid_at column, ai-pm-nightly enum, co_total drift)
- Unified ledger migration: shipped (job_transactions live, compat views active)
- Phase 3 Financials tab: shipped (Ledger/Estimate/CO/Costs sub-tabs, TransactionModal, lien waiver flagging, Scanner rename, 13→10 tabs, ai-companion + ai-pm-nightly updated)
- All other phases: pending

## Core architectural decisions (locked)

1. **Migrate, don't layer.** job_transactions is the single source
   of truth. payments and job_cost_invoices are deprecated tables
   (renamed _deprecated_*_20260423) with compat views for 2 weeks
   of rollback headroom. No production payment data existed at
   migration time, so migration was low-risk.

2. **cost_plus is a client-visibility flag, not a data-model switch.**
   Every job tracks costs internally in job_transactions regardless
   of contract type. cost_plus=true means the client sees direction='out'
   rows in their portal. cost_plus=false means they don't.

3. **Lien waivers are warnings, not hard blocks.** A transaction can
   save without a lien waiver. The UI shows a red "missing lien waiver"
   flag on sub_payout and vendor_payment rows until uploaded. Commission
   payouts are exempt (trigger excludes type='commission').

4. **Commissions are transactions.** type='commission', direction='out'.
   Same ledger as sub payouts. No separate commission_payouts table.

5. **Retainage is in the data model.** retainage_pct and retainage_held
   columns on job_transactions. Default 0. UI to manage it comes later.

6. **QuickBooks columns (qb_account, qb_customer, qb_vendor, qb_class,
   qb_transaction_id, qb_synced_at) exist on job_transactions from day
   one.** Nullable. Populated when QB integration is built. CSV export
   ships before API integration. Kalin has no QB account yet.

## Roadmap (remaining phases, in order)

Phase 3: Financials tab consolidation + receipt entry + lien waiver flagging
  - Collapse Estimate + Payments + Change Orders + Costs into one
    Financials tab with sub-tabs
  - Add receipt entry form: manual amount + category + photo upload
    to the new job-receipts bucket
  - Red flag on sub_payout / vendor_payment rows missing lien waivers
  - Rename Floor Plan tab → Scanner

Phase 4: Budget vs Actual view
  - Estimate line items vs ledger actuals inside Financials
  - New rule in ai-pm-nightly: budget_overrun (Haiku, rule-based,
    fires when actual > 110% of estimate for a phase)

Phase 5: QuickBooks CSV export
  - One button in Financials, exports job_transactions in
    QB-compatible CSV (Customer, Vendor, Item, Account, Date, Amount)

Phase 6: Field + Documents consolidation
  - Fold Notes/Photos + Daily Logs + Materials into one Field tab
  - Keep Docs and Scanner separate
  - Brings JobDet from 13 tabs down to 8

Phase 7 (future, not scoped): Haiku vision receipt extraction
  - Snap photo → auto-fill vendor, amount, date, line items
  - User confirms before save
  - Deferred until Phase 3 manual flow is proven

## Plumbed but not wired

Features whose data model exists but no UI path reaches them yet.
If you find one of these during a future session and think "we should
build this," check here first — it's probably an intentional defer.

- QuickBooks integration columns (qb_account, qb_customer, qb_vendor,
  qb_class) on job_transactions — nullable, no UI yet
- Commission transaction type — ledger supports it, no UI trigger yet
- Retainage fields on job_transactions — present, no dashboard yet
- MaterialSelectionScr.jsx — WIP client tile/fixture picker, not
  imported anywhere yet (pre-existing)
- _deprecated_payments_20260423 and _deprecated_job_cost_invoices_20260423
  — backup tables, drop after 2026-05-07 if no rollback needed

## Open questions

- Retainage workflow — when do we release held retainage? (deferred)
- QB Online API integration — which QB org maps to which tenant?
  (deferred until Kalin has a QB account)
- Multi-currency — not a concern today, Avenstone is USD-only

## Rollback plan

If the ledger migration causes issues within the first 2 weeks:
1. DROP VIEW payments;
2. DROP VIEW job_cost_invoices;
3. ALTER TABLE _deprecated_payments_20260423 RENAME TO payments;
4. ALTER TABLE _deprecated_job_cost_invoices_20260423 RENAME TO job_cost_invoices;
5. Revert stripe-webhook and create-payment-link edge functions to
   their previous commits (git log --follow supabase/functions/stripe-webhook/)

Append to FINANCIALS_PLAN.md under the "Plumbed but not wired"
section (or create a new "Future integrations" section if cleaner):

## Future integrations

- AI material list generator (NOT YET BUILT): when this feature is
  built, its output must write to estimate_line_items with
  category='materials' so budget-vs-actual picks it up automatically.
  Do NOT create a parallel materials_budget table. One ledger of
  budgeted costs — estimate_line_items is the source of truth.

After 2026-05-07 with no issues: DROP the _deprecated_ tables.

---

Commit message: "docs: FINANCIALS_PLAN.md — rebuild decisions + roadmap"