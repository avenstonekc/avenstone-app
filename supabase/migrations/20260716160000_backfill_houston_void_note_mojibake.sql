-- SCOPE_PREFILL P4b C4 — backfill mojibake in the two 8617-Houston void-transaction notes.
-- These two rows were corrupted by an ad-hoc management-API SQL write during the 2026-07-15
-- Houston reconciliation: an em dash double-encoded through the python-json->curl tooling pipeline
-- into "â€—". This is NOT a product code path — the add_sub_invoice_payment_with_ledger RPC,
-- todoEngine, and all src/functions source store clean UTF-8 em dashes (verified: the RPC-built
-- payment descriptions on the same job render a correct "—", and no todo rows are garbled).
-- Rewritten with a plain ASCII hyphen so the note cannot re-corrupt regardless of pipeline.
UPDATE job_transactions SET notes = 'VOID - reattributed to Aguayo invoice 16ab4bc1 as invoice payment (check #1129, $2,500). Was mislabeled payee KC Energy Savers.'
  WHERE id = 'b74cef68-e735-449c-81d8-1c74f1a5ccda';
UPDATE job_transactions SET notes = 'VOID - reattributed to Aguayo invoice 16ab4bc1 as invoice payment (check #1089, $3,500). Was mislabeled payee KC Energy Savers.'
  WHERE id = '0bf20161-6042-496e-a9fd-37d108f922a2';
