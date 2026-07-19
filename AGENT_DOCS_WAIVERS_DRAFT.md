# AGENT_DOCS Slice 2 — Lien Waiver Templates

**Status:** ✅ SHIPPED 2026-07-19. **Attorney reviewed the MO + KS text and signed off 2026-07-18 — no redlines.** This file is retained as the provenance record of the exact language that was reviewed. The blessed text is now seeded as data in `supabase/migrations/20260718230000_waiver_templates.sql` (`waiver_templates` table, 8 rows) and rendered by `_shared/agentDocs.ts` `createWaiver` via the `create_document` doc_type `lien_waiver`. Unconditional variants carry the hard payment-received gate + amount read-back as designed below. To revise the language, edit `waiver_templates` (owner-editable, no code change).
**Design:** templates live as DATA (a `waiver_templates` seed / config), keyed by `(state, conditional|unconditional, partial|final)` — editable without code. `create_document` doc_type `lien_waiver` takes a `state` param (MO | KS) + `conditional` + `final` + auto-fill fields. Zero model calls (template fill in code).

> ⚠️ **LEGAL FLAG (read this).** Lien-waiver language is statutory and state-specific. **Avenstone works both sides of the KS/MO line**, so a single form is wrong. Key differences I'm aware of (NOT legal advice — your attorney must confirm and bless the exact wording before any waiver is sent to a real sub or client):
> - **Missouri** — the spec notes MO has statutory form requirements; MO also has a strong anti-waiver / notice regime (e.g., the residential "Notice to Owner" / consent-of-owner rules, RSMo Ch. 429). A waiver's enforceability and required recitals need MO-counsel confirmation.
> - **Kansas** — KS mechanic's lien statutes (K.S.A. Ch. 60, Art. 11) differ on waiver timing and what a "final" waiver must recite.
> - **Conditional vs unconditional** is the dangerous axis: an *unconditional* waiver releases lien rights **even if the check hasn't cleared**. These must never be auto-sent without the rep confirming payment has actually been received (the confirm card + a "payment received?" gate).
> - The auto-fill fields must be exact (amount, through-date, job legal description/address, claimant, payer). A wrong amount on an unconditional final waiver is a real-money mistake.

Fill fields (auto-populated from job + sub + payment): `{{claimant}}` (sub/vendor legal name), `{{customer}}` (Avenstone), `{{owner}}` (client), `{{job_address}}`, `{{job_legal_desc}}` (optional), `{{amount}}`, `{{check_no}}`, `{{through_date}}` (progress) or `{{final_date}}`, `{{exceptions}}` (disputed/retained), `{{date}}`, `{{signature}}`.

---

## 1. CONDITIONAL WAIVER — PROGRESS / PARTIAL PAYMENT

**Common draft (starting point for both states — attorney to adjust per state):**

> **CONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT**
> State: {{state}}
> This document waives and releases lien, stop-payment-notice, and payment-bond rights the claimant has for labor and materials furnished to the property described below, **but only on condition** that the claimant actually receives payment of **{{amount}}**, and only to the extent of that payment. This waiver does not become effective until the payment has been received and the funds have cleared.
> - Claimant: {{claimant}}
> - Customer / Contractor: {{customer}}
> - Owner: {{owner}}
> - Property: {{job_address}}{{job_legal_desc? — legal description: }}
> - Through date (payment covers labor/materials through): {{through_date}}
> - This waiver excludes: retainage, unbilled/disputed items, and: {{exceptions|none}}
> Signature: ______________________  Date: {{date}}   {{claimant}}
>
> _MO addendum (attorney to confirm):_ any statutory recital or "Notice to Owner" acknowledgment MO requires for a valid progress waiver.
> _KS addendum (attorney to confirm):_ any K.S.A. 60-1101 et seq. recital.

## 2. UNCONDITIONAL WAIVER — PROGRESS / PARTIAL PAYMENT

> **UNCONDITIONAL WAIVER AND RELEASE ON PROGRESS PAYMENT**
> State: {{state}}
> **NOTICE: This document waives and releases lien, stop-payment-notice, and payment-bond rights the claimant has, unconditionally, for the amount below — even if the claimant has not been paid. If the claimant has not been paid, use a conditional waiver form instead.**
> The claimant has been paid **{{amount}}** and waives and releases any lien/claim for labor and materials furnished through {{through_date}}, excluding retainage and: {{exceptions|none}}.
> - Claimant: {{claimant}} · Owner: {{owner}} · Property: {{job_address}}
> Signature: ______________________  Date: {{date}}   {{claimant}}
>
> ⚠️ Only issue after payment is confirmed received. The agent MUST gate this behind a "payment received?" confirmation.

## 3. CONDITIONAL WAIVER — FINAL PAYMENT

> **CONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT**
> State: {{state}}
> This document waives and releases all lien, stop-payment-notice, and payment-bond rights the claimant has on the property, **on condition** that the claimant receives final payment of **{{amount}}** and the funds clear. Effective only upon receipt of that payment.
> - Claimant: {{claimant}} · Customer: {{customer}} · Owner: {{owner}} · Property: {{job_address}}
> - Excludes disputed claims (if any): {{exceptions|none}}
> Signature: ______________________  Date: {{date}}   {{claimant}}

## 4. UNCONDITIONAL WAIVER — FINAL PAYMENT

> **UNCONDITIONAL WAIVER AND RELEASE ON FINAL PAYMENT**
> State: {{state}}
> **NOTICE: This document waives and releases ALL lien, stop-payment-notice, and payment-bond rights the claimant has, unconditionally. This is a final release. If the claimant has not been paid in full, do not sign.**
> The claimant has been paid in full (**{{amount}}**) for all labor and materials furnished to {{job_address}} and unconditionally waives and releases all lien and bond claims, excluding: {{exceptions|none}}.
> - Claimant: {{claimant}} · Owner: {{owner}}
> Signature: ______________________  Date: {{date}}   {{claimant}}
>
> ⚠️ Highest-risk form: releases everything, no payment condition. Agent MUST gate behind explicit "paid in full — confirmed?" and show the amount read-back on the confirm card.

---

### Implementation plan once Kalin + attorney bless the text (NOT yet built)
- `waiver_templates` config (per tenant, seed Avenstone MO+KS ×4) — data, editable without code.
- `create_document` doc_type `lien_waiver`: params `state`, `conditional` (bool), `final` (bool), `claimant` (sub search), auto-fill amount/through_date from the linked `sub_invoices`/`job_transactions` payment; render via `docRender.ts` (heading + paragraph + signature blocks).
- **Unconditional forms**: hard gate — require an explicit "payment confirmed received" flag on the confirm card; amount read-back via amountToWords.
- Save to job-documents + job_files (category Documents), link `sub_invoices.lien_waiver_file_id` / `job_transactions.lien_waiver_url` (columns already exist).
