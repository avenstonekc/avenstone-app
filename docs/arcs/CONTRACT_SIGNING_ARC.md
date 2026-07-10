# Contract Signing Arc — SHIPPED (2026-07-10)

**Status:** SHIPPED. ESIGN/UETA attorney review completed and cleared 2026-07-10 (Open Q1 closed). The priced-signing flow is live. Remaining items are electives (bottom).

The arc closed the "send proposal → client sees the real numbers → signs a contract containing those numbers → evidence holds up legally" path that was broken or disconnected at almost every step.

---

## What shipped (slice → commits)

| Slice | Commits | What |
|---|---|---|
| **1b — unified priced PDF + evidence freeze** | `dc188fc`, `be66116` | ONE `buildContractPDF` (src/lib/pdf.js) renders the accept-time `contract_snapshot` (line items, total, scope) — replaces the `DEFAULT_CONTRACT_TEXT` boilerplate that let a client sign a $0 document. Sign + send modals rewired to it. Sign-time evidence (price + scope) FROZEN as an immutable deep-copy onto `contract_signatures`. `sbGetContractSnapshot` helper. |
| **1c — payment schedule freeze** | `a3be13c` | The rep's payment schedule is frozen into `contract_snapshot` **at accept** (not re-derived at sign). Clause-3 prose fallback when a job has none. |
| **Magic-link → recovery migration (Gap 5)** | `be303ea`, `f51b500` | `send-contract-email` moved off the retired magic-link path onto the canonical `create-client-login` recovery-link pattern (mirrors `send_client_portal`). Dead `send-client-link` helpers removed (zero callers). |
| **Email defect fixes** | `2b70f61` | Address-slot bug (SubComplianceModal passed the type label as `job_address`), sub-copy honesty, expired-link banner. |
| **Signed-copy delivery** | `d636b43`, `4170c72` | After a signature saves, the client is emailed their fully-executed PDF (`contract_type: 'signed_copy'` branch — confirmation, not a request: no provisioning, no recovery link, no "Action Required"). |
| **IP/UA evidence capture (Gap 4)** | `2f8d932`, `590fea2`, `3e856f5` | Migration `20260710120000` adds `ip_address` + `user_agent`. `record-signature-evidence` edge fn reads them server-side from request headers; `sbRecordSignatureEvidence` helper; `ClientSignContractModal` calls it post-save. |

## Gap resolution (final)

- **Gap 1 (contract embeds price/scope) — FIXED + attorney-cleared.**
- **Gap 2 (client sees proposal in portal) — ELECTIVE, not built** (see bottom).
- **Gap 3 (send-estimate email bug) — FIXED** (`sbSendEstimateEmail` uses `to` + html body).
- **Gap 4 (IP capture) — FIXED this arc** (`2f8d932`/`590fea2`/`3e856f5`).
- **Gap 5 (magic links) — RESOLVED** (recovery migration).
- **Gap 6 (status lifecycle mismatch) — folded into Model B** (see `docs/arcs/MODEL_B_LIFECYCLE.md`).

---

## Locked decisions

1. **Two-point evidence freeze.** Price + scope are frozen at **accept** (`contract_snapshot` on `job_estimates.estimate_data`, the transport copy) AND again at **sign** (immutable deep-copy onto `contract_signatures.scope_snapshot`/`contract_total`, the evidence copy). The evidence copy is never a live reference to mutable estimate rows.
2. **Fail-loud no-snapshot gate.** Signing is BLOCKED when no snapshot exists — no silent boilerplate fallback. Signing an unpriced contract was the legal exposure; the gate is the fix.
3. **No auto-default payment schedule.** The system never invents a schedule; clause-3 prose covers the gap. A proactive accept-time nudge is optional future work ("1d"), not built.
4. **Existing passwords are never reset on send.** A resend generates a recovery link but does not invalidate a login the client already has.
5. **Subs are not clients (Fork B).** `subcontractor_agreement` sends never provision a client, never write a client profile, get a plain token-less login link. Sub e-sign is deliberately out of scope.
6. **Capture is enrichment, not state change.** The signed-copy email and the IP/UA evidence record fire AFTER the signature is already saved; a failure in either logs and degrades — it never undoes or blocks the recorded signature.

---

## Corrections — lies the audits caught

- **`contract_signatures.ip_address` did NOT exist before 2026-07-10.** Earlier docs (and CLAUDE.md, ~2026-06-15) claimed the column "EXISTS but is never populated." False — it was first added by migration `20260710120000` (`2f8d932`) and is now populated by the evidence path. Do not repeat the old claim.
- **The committed table defs `20260412_missing_tables.sql` / `20260413_remaining_tables.sql` are STALE and do not match the live table.** They declare `signer_name`, `signer_email`, `signature_png`, `pdf_url`. **Live truth:** `signed_by_name`, `signed_by_email`, `signature_data`, `document_url`. The live table was created by a different path than those committed migrations — trust `information_schema`, not those files.

### Live `contract_signatures` columns (truth, `information_schema` 2026-07-10)
`id, tenant_id, job_id, type, reference_id, signed_by_name, signed_by_email, signature_data, signed_at, document_url, created_at, contract_total, scope_snapshot, ip_address, user_agent`

---

## Electives (deliberately not built)

- **Gap 2 — client-visible proposal/documents view in the portal.** The signed PDF saves to `job-documents` (`client_visible: true`); a dedicated portal tab to browse it pre-sign is unbuilt.
- **Optional accept-nudge ("1d").** Prompt the rep to set a payment schedule at accept when none exists. Locked as optional — the no-auto-default rule stands.
- **Sub e-sign.** Out of scope per Fork B — subs authenticate through their own onboarding; the agreement is attached for review, not signed in-portal.
- **`signed_copy` typeLabel extension.** The signed-copy email currently labels everything "Contract"; extend it to emit correct labels for `change_order` / `completion` signed copies.
