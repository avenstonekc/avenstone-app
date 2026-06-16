-- ============================================================
-- ESTIMATOR_KNOWLEDGE_ARC Migration 3 — Archive ai_knowledge pricing rows
--
-- Rate Book (rate_book_labor + rate_book_material) is now the sole
-- pricing source of truth. The 14 pricing_% ai_knowledge rows are
-- archived (active = false), NOT deleted — rows remain recoverable.
--
-- Pre-archive state: 14 active pricing_%, 7 active non-pricing.
-- Non-pricing rows (business_structure, change_order_policy,
-- client_communication, company_profile, draw_schedule,
-- estimating_guidelines, labor_rates) are NOT touched.
-- ============================================================

UPDATE ai_knowledge
SET active = false
WHERE category LIKE 'pricing_%'
  AND tenant_id = '00000000-0000-0000-0000-000000000001';

-- Verification
SELECT
  'pricing_active_after'  AS check_name,
  COUNT(*)::text          AS result
FROM ai_knowledge
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND category LIKE 'pricing_%'
  AND active = true
UNION ALL
SELECT
  'pricing_archived',
  COUNT(*)::text
FROM ai_knowledge
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND category LIKE 'pricing_%'
  AND active = false
UNION ALL
SELECT
  'non_pricing_still_active',
  COUNT(*)::text
FROM ai_knowledge
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND category NOT LIKE 'pricing_%'
  AND active = true;
