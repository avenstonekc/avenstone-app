-- TAKEOFF_QA — seed/data fixes for the bathroom takeoff. Pairs with the pricingCore/computeFns
-- logic fixes (optional-gating, `when` conditionals, fixture de-dup, 3-wall shower SF).
-- All rows are PLATFORM defaults (tenant_id IS NULL). Idempotent: re-running sets the same values.

-- Sym 5 — the tub/shower TRIM package must follow the shower_type answer. Tag the Plumbing -
-- Finish materials so the tub spout only appears when a tub is present and the shower valve trim
-- only when a shower is present. pricingCore.matchesWhen() consumes `when`.
UPDATE public.takeoff_templates t
SET scope_definition = jsonb_set(
  scope_definition, '{materials_formula}',
  (SELECT jsonb_agg(
     CASE
       WHEN f->>'material_name' = 'Tub spout'
         THEN f || '{"when":{"scope_detail":"shower_type","in":["tub_only","tub_plus_shower"]}}'::jsonb
       WHEN f->>'material_name' = 'Shower valve trim kit'
         THEN f || '{"when":{"scope_detail":"shower_type","in":["shower_only","tub_plus_shower"]}}'::jsonb
       ELSE f
     END)
   FROM jsonb_array_elements(t.scope_definition->'materials_formula') f))
WHERE room_type = 'bathroom' AND trade = 'Plumbing - Finish / fixtures' AND tenant_id IS NULL;

-- Sym 7 — a cased opening is 2 legs + a head (~17 LF per side), not one 7 LF leg. Bump the
-- Door casing multiplier from 7 → 17 (one side per door). One-vs-both-sides is a scope call on
-- Kalin's review list. This is the ONLY casing formula in the catalog (audited across room types).
UPDATE public.takeoff_templates t
SET scope_definition = jsonb_set(
  scope_definition, '{materials_formula}',
  (SELECT jsonb_agg(
     CASE WHEN f->>'material_name' = 'Door casing MDF'
       THEN f || '{"qty_multiplier":17}'::jsonb
       ELSE f END)
   FROM jsonb_array_elements(t.scope_definition->'materials_formula') f))
WHERE room_type = 'bathroom' AND trade = 'Trim / carpentry - Base / case' AND tenant_id IS NULL;

-- Sym 6 — shower_door_type must NOT silently default to a priced $850 slider. Remove the default
-- so the door line only appears when the rep actually picks one (pricingCore skips empty selects).
UPDATE public.scope_detail_schemas s
SET schema = jsonb_set(
  schema, '{fields}',
  (SELECT jsonb_agg(
     CASE WHEN f->>'key' = 'shower_door_type' THEN f - 'default' ELSE f END)
   FROM jsonb_array_elements(s.schema->'fields') f))
WHERE room_type = 'bathroom' AND scope_tag IN ('full_remodel','tile_only') AND tenant_id IS NULL
  AND active = true;
