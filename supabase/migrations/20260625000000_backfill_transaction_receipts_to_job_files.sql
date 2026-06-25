-- Backfill: create job_files entries for all existing job_transactions
-- rows that have receipt_url but no corresponding job_files row.
-- Mirrors the dual-write that ai-master-agent log_receipt already performs
-- and that TransactionModal now performs going forward.

INSERT INTO job_files (
  tenant_id,
  job_id,
  uploaded_by_id,
  name,
  storage_path,
  storage_bucket,
  mime_type,
  category,
  subcategory,
  client_visible,
  related_entity_type,
  related_entity_id,
  lifecycle_status
)
SELECT
  jt.tenant_id,
  jt.job_id,
  COALESCE(
    (SELECT id FROM profiles WHERE id = jt.created_by LIMIT 1),
    (SELECT id FROM profiles WHERE tenant_id = jt.tenant_id AND role = 'owner' LIMIT 1)
  ),
  'Receipt - ' || COALESCE(jt.payer_or_payee_name, jt.description, jt.type, 'expense'),
  jt.receipt_url,
  'job-receipts',
  CASE
    WHEN lower(jt.receipt_url) LIKE '%.pdf'  THEN 'application/pdf'
    WHEN lower(jt.receipt_url) LIKE '%.png'  THEN 'image/png'
    WHEN lower(jt.receipt_url) LIKE '%.heic' THEN 'image/heic'
    WHEN lower(jt.receipt_url) LIKE '%.heif' THEN 'image/heif'
    WHEN lower(jt.receipt_url) LIKE '%.webp' THEN 'image/webp'
    ELSE 'image/jpeg'
  END,
  'Receipts',
  NULL,
  false,
  'job_transaction',
  jt.id,
  'active'
FROM job_transactions jt
WHERE jt.receipt_url IS NOT NULL
  AND jt.receipt_url <> ''
  AND NOT EXISTS (
    SELECT 1 FROM job_files jf
    WHERE jf.related_entity_type = 'job_transaction'
      AND jf.related_entity_id   = jt.id
      AND jf.category             = 'Receipts'
  );
