-- Phase 2e-3-migrate: backfill legacy job_subs rows into job_sub_engagements
-- job_subs has no trade or created_by_id columns; defaults: trade='general', author=Kalin
-- Original job_subs rows are preserved untouched — Phase 3 will DROP the table

BEGIN;

WITH new_engagements AS (
  INSERT INTO job_sub_engagements (
    tenant_id, job_id, sub_id, trade, bid_type, status,
    invited_at, invited_by_id, bid_submitted_at,
    activated_at, activated_by_id, notes
  )
  SELECT
    js.tenant_id,
    js.job_id,
    js.sub_id,
    'general',
    'gc_drafted',
    'active',
    js.created_at,
    '8171742a-b586-4f13-be61-744e191a1896'::uuid,
    js.created_at,
    js.created_at,
    '8171742a-b586-4f13-be61-744e191a1896'::uuid,
    'Migrated from legacy job_subs row ' || js.id::text || ' on 2026-05-06'
  FROM job_subs js
  WHERE js.tenant_id = '00000000-0000-0000-0000-000000000001'
  RETURNING id AS engagement_id, tenant_id, invited_at
)
INSERT INTO engagement_bids (
  tenant_id, engagement_id, total_amount, revision_number, is_current,
  drafted_by, drafted_by_id, submitted_at, accepted_at, accepted_by_id
)
SELECT
  ne.tenant_id,
  ne.engagement_id,
  0,
  1,
  true,
  'gc',
  '8171742a-b586-4f13-be61-744e191a1896'::uuid,
  ne.invited_at,
  ne.invited_at,
  '8171742a-b586-4f13-be61-744e191a1896'::uuid
FROM new_engagements ne;

COMMIT;
