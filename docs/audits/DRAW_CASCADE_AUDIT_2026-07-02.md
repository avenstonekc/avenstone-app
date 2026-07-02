# Draw-Paid Cascade + Next-Draw Audit — 2026-07-02

**Scope:** Read-only diagnosis. No code changed, no migrations applied.
**Job under test:** `b720f17f-0f69-4477-adcf-7c02115b4b0d` — 1206 W Lucy Webb Rd, Raymore, MO — `financial_model='flip'`, `cost_plus=true`, `status='in_progress'`.
**Live DB queried** via Supabase Management API (read-only SELECTs) — row counts/sums quoted below are actual, pulled during this audit.

---

## TL;DR — ROOT CAUSE

**BOTH failure modes are present, and they are independent:**

1. **Cascade-not-firing** — `sbMarkDrawPaid` → RPC `mark_draw_paid_release_retainage` **never touches `job_transactions`**. It updates the draw row and (optionally) sibling retainage only. The real cascade function `cascade_draw_paid_to_transactions` (which *does* flip `in_draw → reimbursed`) exists but is wired **only to the invoice-paid path** and takes an `invoice_id`. The direct-draw payment path (used by cost-plus/flip, `invoice_id` always null) never calls it. → Draw #1's 38 expense rows are stuck at `reimbursement_status='in_draw'` even though the draw is `paid`. **Live proof: 38 rows still `in_draw`.**

2. **Next-draw-miscomputed** — the "Next Draw" card (`FinancialsTab.jsx:521`) is bound to `summary.pending_out`, which is `SUM(job_transactions WHERE direction='out' AND status='pending')` — the *vendor-payment* axis, **not** the *reimbursement/draw* axis. It double-counts the $26,842.71 already composed into (paid) Draw #1 and never recomputes when a draw is composed or paid.

Plus a display gap (§ symptom-a) and a flip-surface nuance (§5) documented below.

---

## 1. The draw-paid handler — what it actually writes

**UI path:** `InvoicesSubTab.jsx:2` imports `sbMarkDrawPaid`; the "Mark Paid" action on a draw calls it via `MarkPaidModal`. (Master-Agent has no direct draw-paid verb; this is the only write path for direct draw payments.)

**`sbMarkDrawPaid`** — `avenstone-vite/src/lib/supabase.js:4668-4731`. Two writes:

**(a)** Inserts one inbound payment row (verified with `.select().single()`):

```js
// supabase.js:4698-4720
const txRow = {
  tenant_id: draw.tenant_id, job_id: draw.job_id, draw_id: drawId,
  invoice_id: null, direction: 'in', type: 'client_payment',
  status: 'paid', amount: paidAmount, ...
};
const { data: tx, error: txErr } = await sb
  .from('job_transactions').insert(txRow).select().single();
if (txErr) throw txErr;
```

**(b)** Calls the retainage RPC — this is the *only* thing that updates draw state:

```js
// supabase.js:4722-4729
const { data: rpcResult, error: drawErr } = await sb.rpc('mark_draw_paid_release_retainage', {
  p_draw_id: drawId,
  p_paid_amount: paidAmount,
});
if (drawErr) throw drawErr;
const newStatus = rpcResult.new_status;
return { tx, newStatus, newAmountPaid };
```

**`mark_draw_paid_release_retainage`** — `supabase/migrations/20260603200100_retainage_release_rpc_invoiced_check.sql` (current 3-arg overload). Its entire body touches **only `draw_schedules`**:

```sql
-- migration 20260603200100, lines 49-65
UPDATE draw_schedules
   SET paid_amount = v_new_paid, status = v_new_status, updated_at = now()
 WHERE id = p_draw_id;

IF v_draw.is_retainage_release = true AND v_new_status = 'paid' THEN
  UPDATE draw_schedules SET retainage_held = 0, ...   -- sibling retainage only
END IF;
```

**There is no `UPDATE job_transactions`, no reference to `draw_line_items`, no `reimbursement_status` write anywhere in this RPC.** It does **not** walk `draw_line_items → job_transactions`. B1.3's "draw paid cascade" is **fire-and-forget on this path** — it updates the draw row + the received total and stops.

**The cascade that B1.3 shipped is real but orphaned from this path.** `cascade_draw_paid_to_transactions` — `supabase/migrations/20260527070000_cost_plus_phase_3_cascade_rpcs.sql:7-27` — does exactly the right thing:

```sql
UPDATE job_transactions jt
   SET reimbursement_status = 'reimbursed', reimbursed_at = NOW()
  FROM draw_line_items dli
 WHERE dli.draw_id = v_draw_id AND dli.transaction_id = jt.id
   AND jt.reimbursement_status = 'in_draw';   -- idempotent guard
```

…but it is keyed on **`p_invoice_id`** (looks up `draw_id` from `invoices`), and its **only caller** is the invoice path `sbMarkInvoicePaid` at `supabase.js:4650-4653`:

```js
if (invoice.draw_id && newStatus === 'paid') {
  await sb.rpc('cascade_draw_paid_to_transactions', { p_invoice_id: invoice.id });
}
```

Direct draw payments deliberately keep `invoice_id = null` ("Draw IS the billable document — no invoice needed", comment `supabase.js:4664-4697`), so **no invoice is ever created or paid, and the cascade never runs** for cost-plus/flip draws. That is the cascade-not-firing root cause.

---

## 2. Return shape + RLS-verify

- **`sbMarkDrawPaid` does NOT use the `{ ok, error, data }` convention** — it **throws** on error and returns `{ tx, newStatus, newAmountPaid }`. Callers must `try/catch`. This is a convention divergence (not a correctness bug), but worth noting: a thrown error here surfaces differently than the `{ ok:false }` most helpers return.
- **RLS false-positive risk — none on this path, for two reasons:**
  - The payment INSERT uses `.insert(...).select().single()` and checks `txErr` (`supabase.js:4715-4720`) — a silent RLS drop would surface as no row / error. ✓
  - The draw `UPDATE` happens inside `mark_draw_paid_release_retainage`, which is `SECURITY DEFINER` — it bypasses RLS, so there is no "update returned no error but RLS ate it" class here. The RPC returns the computed `new_status`, which `sbMarkDrawPaid` trusts (acceptable, since DEFINER + computed return).
- For contrast, `sbComposeDraw` (`supabase.js:5981-5990`) *does* carry an explicit post-write read-back verify, and `compose_draw` is `SECURITY INVOKER` (RLS-subject) — so the verify there is load-bearing. `sbMarkDrawPaid` has no equivalent draw-row read-back, but doesn't need one given the DEFINER RPC.

---

## 3. The NEXT DRAW figure ($29,666.12) — exact source + WHERE clause

**Card:** `FinancialsTab.jsx:521`
```js
{ lb: 'Next Draw', v: f$(summary.pending_out ?? 0), ... note: 'owed — pending costs' },
```

**`summary.pending_out`** — `supabase.js:1478`:
```js
const pending_out = data.filter(t => t.direction === 'out' && t.status === 'pending')
                        .reduce((s, t) => s + Number(t.amount || 0), 0);
```

**WHERE clause = `direction='out' AND status='pending'`.** That's it. It is:
- **NOT** filtered by `reimbursement_status`.
- **NOT** joined to `draw_line_items`.
- **NOT** excluding rows already linked to a composed draw.

So "Next Draw" is summing *expenses whose vendor bill is unpaid* — a completely different axis from "unreimbursed / not-yet-drawn." It includes expenses that are already sitting inside a paid draw (as long as Avenstone hasn't cut the vendor check yet). It is structurally blind to draw composition and draw payment.

The **correct** "not-yet-drawn" pool is the reimbursement axis, already computed as `summary.float_unreimbursed` (`supabase.js:1492, 1541`): `direction='out' AND reimbursement_status='unreimbursed'`. `sbLoadUnreimbursedExpenses` (`supabase.js:5878-5891`) uses that same filter and is what the draw composer reads.

---

## 4. Live reconciliation for job b720f17f

**`job_transactions` (status ≠ void), grouped:**

| direction | status | reimbursement_status | rows | sum |
|-----------|--------|----------------------|-----:|----:|
| in | paid | unreimbursed | 1 | 19,590.39 |
| in | paid | *null* | 1 | **26,842.71** ← Draw #1 payment (from `sbMarkDrawPaid`, `invoice_id`=null) |
| out | paid | unreimbursed | 57 | 226,961.50 |
| out | **pending** | **in_draw** | 38 | **26,842.71** ← Draw #1's composed expenses |
| out | pending | unreimbursed | 6 | 2,823.41 |

**Draw #1:** `status='paid'`, `target_amount = paid_amount = 26,842.71`.
**`draw_line_items`:** 38 lines on Draw #1, `base = with_markup = 26,842.71`, all 38 carry a `transaction_id` (0% markup — flip). These are exactly the 38 `out/pending/in_draw` rows above.

**Every banner figure ties out to code quantities:**

| Banner | Formula (code ref) | Feeds | = |
|--------|--------------------|-------|---|
| **RECEIVED** 46,433.10 | `total_in` = `in & status=paid` (`:1476`) | 19,590.39 + 26,842.71 | **46,433.10** ✓ |
| **SPENT** 256,627.62 | `paid_out + pending_out` (`FinancialsTab:517`) | 226,961.50 + 29,666.12 | **256,627.62** ✓ |
| **NEXT DRAW** 29,666.12 | `pending_out` = `out & status=pending` (`:1478`) | 26,842.71 + 2,823.41 | **29,666.12** ✓ |
| **Unreimbursed banner** 229,784.91 | `float_unreimbursed` = `out & reimb=unreimbursed` (`:1492`) | 226,961.50 + 2,823.41 | **229,784.91** ✓ |
| Settled | `paid_out` = `out & status=paid` | 226,961.50 | 226,961.50 |

**The double-count that explains why NEXT DRAW didn't drop after payment:**

- The **$26,842.71** of Draw #1 expenses appears **twice**: once inside paid Draw #1, and again inside "Next Draw" ($29,666.12) — because those 38 rows are `status='pending'` (vendors not yet paid) and `pending_out` keys off `status`, not `reimbursement_status`.
- Marking Draw #1 paid changed **no** expense row's `status` (the RPC only touches `draw_schedules` + inserts the inbound payment). Composing Draw #1 also changed no `status` (`compose_draw` moves `reimbursement_status` unreimbursed→in_draw, `20260620110000_...sql:109-114`, and leaves `status='pending'`). **Nothing on either path ever moves the `pending_out` axis**, so Next Draw is frozen relative to draw activity.
- The genuinely not-yet-drawn *pending-payment* remainder is only **$2,823.41** (the 6 `out/pending/unreimbursed` rows). The genuinely not-yet-drawn *total* (any pay status) is **$229,784.91** (`float_unreimbursed`). Either is a defensible "Next Draw" number; **$29,666.12 is neither** — it's a coincidental mix that includes already-drawn money.

**There is no data corruption / no phantom double-charge in the ledger itself** — the rows are internally consistent (`unreimbursed 229,784.91 + in_draw 26,842.71 = 256,627.62 spent`; zero rows are `reimbursed`). The "double count" is purely in the *Next Draw display formula*, and the missing status flip is purely in the *cascade path*.

---

## Symptom (a) — "expenses in Draw #1 still show PENDING in the ledger"

Two layers, both real:

- **Latent data defect (cascade):** those 38 rows should be `reimbursement_status='reimbursed'` after Draw #1 was paid; they are stuck at `'in_draw'` because the cascade never fires on the direct-draw path (§1). Live-confirmed: 0 rows `reimbursed`, 38 rows `in_draw`.
- **Display gap (why the owner literally sees "PENDING"):** the ledger row badge renders **`tx.status`** only — `FinancialsTab.jsx:714`:
  ```js
  <div style={{ ...color: STATUS_COLOR[tx.status]... }}>{tx.status}</div>
  ```
  The ledger has **no `reimbursement_status` column/badge at all** (grep-confirmed: `FinancialsTab.jsx` never reads `reimbursement_status` per-row). So Draw #1's expenses show "PENDING" = their *vendor-payment* status, which is correct and unrelated to the draw. **Even a fully-fixed cascade would still show "PENDING"** on these rows until the vendors are paid — because the owner is reading the payment axis, not the reimbursement axis. Fixing symptom (a) as the owner *experiences* it needs the cascade fix **and** a reimbursement indicator in the ledger.

---

## 5. Flip-specific check — is the flip branch suppressing/diverging the flip?

**No. The cascade failure is model-independent.** The reimbursement flip does **not** happen inside `sbLoadJobFinancialSummary` at all — that function only *reads* `reimbursement_status`. And it reads it **identically for cost-plus and flip**: the `else if (r.direction === 'out' && r.reimbursement_status === 'unreimbursed')` accumulator (`supabase.js:1492`) is inside the shared `isDrawMode` block (`model === 'cost_plus' || 'flip'`, `:1466, 1484`). The **only** thing the flip branch suppresses is the bucket layer — `received / bucket_balance / client_float_owed` are set inside `if (model === 'cost_plus')` (`:1533-1538`) and are absent for flip by design. That has nothing to do with the reimbursement flip.

**So flip is not the cause** — a cost-plus job on the same direct-draw path would fail the cascade identically.

**Surface nuance worth flagging (relevant to where the owner read "NEXT DRAW"):** the "Next Draw / Received / Spent" cards are the **cost-plus** stat set (`cpStats`, `FinancialsTab:518-525`) and render **only** when `model === 'cost_plus'` (`:558-561`). This job resolves to `model='flip'` (`:35`, `financial_model` wins over the legacy `cost_plus=true` boolean — and this job has **both** set: `cost_plus=true, financial_model='flip'`). A flip job's ledger shows `flipStats` (Cost Basis / ARV / Projected Profit / Margin) — **no "Next Draw" card**, and the header KPI strip shows ARV / Cost Basis / Projected Profit / **REIMBURSED** (`ProjectDetailHeader.jsx:86-97`), not "Next Draw."

→ **Confirm with the owner which surface displayed "$29,666.12."** The value is unambiguously `pending_out`, and the only label binding `pending_out → "Next Draw"` in the codebase is the cost-plus-gated card. Either (a) it was observed while the job was still cost-plus, or (b) the flip stat set needs a draw-capacity card of its own. This is a genuine open question, not a code contradiction I could resolve statically.

---

## Proposed fixes + size (prompts)

1. **Cascade on direct-draw path** — *~1 prompt, Sonnet, needs migration + verify + one-time backfill.*
   Add a `draw_id`-keyed cascade and call it from `sbMarkDrawPaid` when the draw reaches `paid`. Cleanest: new RPC `mark_draw_paid_cascade(p_draw_id)` mirroring `cascade_draw_paid_to_transactions` but joining `draw_line_items` on `draw_id` (no invoice), guarded on `reimbursement_status='in_draw'` (idempotent). Alternatively fold the flip into `mark_draw_paid_release_retainage` when `v_new_status='paid'`. Backfill Draw #1's 38 rows (`in_draw → reimbursed`) as part of the migration verify.

2. **Next Draw semantics** — *~0.5 prompt once the number is decided; the decision itself is a MERGE call for Kalin.*
   Rebind the card off `pending_out`. Candidates: `float_unreimbursed` (all not-yet-drawn = 229,784.91) or a new "not-in-draw pending" metric (2,823.41). **Field decision needed:** should "Next Draw" mean *everything not yet drawn* or *only what's ready-to-bill this cycle*? Code can deliver either; the meaning is Kalin's.

3. **Ledger reimbursement indicator** — *~0.5 prompt, UX.*
   Add a `reimbursement_status` badge (unreimbursed / in draw / reimbursed) to ledger rows so "paid the draw" is visible independently of vendor-payment status. Without this, fix #1 is invisible to the owner.

4. **Flip Next-Draw card** *(pending §5 answer)* — if the owner wants draw capacity visible on flip jobs, add a card to `flipStats`. *~0.25 prompt.*

**Total: ~1.5–2 prompts, mostly Sonnet.** Fix #1 is the load-bearing correctness fix; #2 is what the owner will actually *see* move.

---

## ROOT CAUSE

**BOTH — cascade-not-firing AND next-draw-miscomputed, independently:** (1) `sbMarkDrawPaid`'s RPC `mark_draw_paid_release_retainage` never flips `in_draw → reimbursed` (the real cascade `cascade_draw_paid_to_transactions` exists but is bound to the invoice path and is unreachable from direct draw payments) — 38 Draw-#1 rows stuck `in_draw`; and (2) the "Next Draw" card sums `pending_out` (`status='pending'`), which double-counts already-drawn expenses and is structurally decoupled from draw state — it should read the `reimbursement_status='unreimbursed'` pool. Symptom (a) is additionally masked by the ledger rendering only `tx.status` with no reimbursement indicator; flip is not implicated in either failure.
