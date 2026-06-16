-- ============================================================
-- ESTIMATOR_KNOWLEDGE_ARC Phase 1.5 — Rate Book Seed Corrections
-- Source-trace audit findings — corrects 3 rows, deletes 2.
--
-- PART A — 3 known-bad rows:
--   1. rate_book_labor Drywall moisture_resistant: 1.40–1.90 → 1.60–2.20/SF
--      Seeded value came from 200-char preview. Full ai_knowledge says
--      "Moisture-resistant (bathrooms): $1.60–2.20/sf"
--   2. rate_book_labor Drywall patch_small: 75–200 → 150–300/EA
--      Seeded value came from 200-char preview. Full ai_knowledge says
--      "Small patch under 12": $150–300"
--   3. rate_book_material paint_interior gallon (35–55): DELETE
--      No per-gallon rate exists in pricing_painting ai_knowledge.
--      Value originated from SYSTEM_PROMPT. Rule: no hardcoded-sourced
--      rates in Rate Book.
--
-- PART B — additional finding from full content verification:
--   4. rate_book_material drywall_board (14–18/sheet): DELETE
--      Full pricing_drywall ai_knowledge content contains no per-sheet
--      board pricing. No traceable source = same deletion rule.
--
-- The 9 fully-read categories are not touched.
-- ============================================================

DO $$
DECLARE
  av UUID := '00000000-0000-0000-0000-000000000001';
BEGIN

-- Fix 1: moisture_resistant 1.40–1.90 → 1.60–2.20
UPDATE rate_book_labor
SET rate_low = 1.60, rate_high = 2.20, updated_at = now()
WHERE tenant_id = av
  AND trade = 'Drywall'
  AND line_item = 'moisture_resistant'
  AND unit = 'SF';

-- Fix 2: patch_small 75–200 → 150–300
UPDATE rate_book_labor
SET rate_low = 150, rate_high = 300, updated_at = now()
WHERE tenant_id = av
  AND trade = 'Drywall'
  AND line_item = 'patch_small'
  AND unit = 'EA';

-- Fix 3: delete paint_interior per-gallon row (no ai_knowledge source)
DELETE FROM rate_book_material
WHERE tenant_id = av
  AND category = 'paint_interior'
  AND unit = 'gallon';

-- Fix 4: delete drywall_board per-sheet row (no ai_knowledge source)
DELETE FROM rate_book_material
WHERE tenant_id = av
  AND category = 'drywall_board'
  AND unit = 'sheet';

END $$;

-- Verification
SELECT 'rate_book_labor_total'      AS check_name, COUNT(*)::text AS result FROM rate_book_labor  WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'rate_book_material_total',  COUNT(*)::text FROM rate_book_material WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
UNION ALL
SELECT 'moisture_resistant_low',    rate_low::text  FROM rate_book_labor WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND trade = 'Drywall' AND line_item = 'moisture_resistant'
UNION ALL
SELECT 'moisture_resistant_high',   rate_high::text FROM rate_book_labor WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND trade = 'Drywall' AND line_item = 'moisture_resistant'
UNION ALL
SELECT 'patch_small_low',           rate_low::text  FROM rate_book_labor WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND trade = 'Drywall' AND line_item = 'patch_small'
UNION ALL
SELECT 'patch_small_high',          rate_high::text FROM rate_book_labor WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND trade = 'Drywall' AND line_item = 'patch_small'
UNION ALL
SELECT 'paint_interior_deleted',    COUNT(*)::text  FROM rate_book_material WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND category = 'paint_interior'
UNION ALL
SELECT 'drywall_board_deleted',     COUNT(*)::text  FROM rate_book_material WHERE tenant_id = '00000000-0000-0000-0000-000000000001' AND category = 'drywall_board';
