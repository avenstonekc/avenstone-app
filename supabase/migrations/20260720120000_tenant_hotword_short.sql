-- CONSULTATION_COACH_FIXES FIX 2 — tenant-config-driven SHORT hot-word.
-- The consultation wake word is derived from the tenant name's first word ("Avenstone").
-- Kalin wants the short form ("Aven") to work too, without hardcoding it in the client.
-- Store it as tenant config; the matcher accepts both (word-boundary safe: "aven" must not
-- fire inside "avenstone"). Nullable + per-tenant so white-label tenants set their own.
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS hotword_short text;

-- Seed the Avenstone tenant's short form.
UPDATE public.tenants
   SET hotword_short = 'Aven'
 WHERE id = '00000000-0000-0000-0000-000000000001'
   AND (hotword_short IS NULL OR btrim(hotword_short) = '');
