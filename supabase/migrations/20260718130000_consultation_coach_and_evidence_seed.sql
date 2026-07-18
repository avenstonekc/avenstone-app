-- CONSULTATION_MODE Slice 2 — live coach + voice.
-- (1) consultation_extractions gains checklist_answers (per-session {field_key: value}
--     detected by the ambient Haiku) and fired_modules (module_keys whose trigger phrases
--     were heard). Merged per chunk, same as the existing array fields. The live coach's
--     needs-list = the session's assembled checklist MINUS these answered field_keys.
--     (Room-scoped estimator prefill via job_scope_answers is slice 4 — ambient detection
--     isn't room-specific, so it lands session-scoped here for the coach.)
-- (2) evidence_type seed pass over the 119 platform checklist fields: numeric/dimension/
--     count fields → 'measurement'; existing-condition/visual fields → 'photo'; the rest
--     keep 'answer'. Drives the coach's ask / measure / photo prompts. Owner-curatable
--     later (tenant rows override). Kalin-locked 2026-07-18.

ALTER TABLE consultation_extractions
  ADD COLUMN IF NOT EXISTS checklist_answers JSONB    NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS fired_modules     TEXT[]   NOT NULL DEFAULT '{}'::text[];

-- Measurement evidence — anything a tape / LiDAR answers, not the mouth.
UPDATE scope_checklists SET evidence_type = 'measurement'
WHERE evidence_type = 'answer' AND (
      field_type = 'number'
   OR field_key ~* '(_sf|sqft|square_feet|dimension|_length|_width|_height|linear|_lf|_count|quantity|footage|perimeter|run_ft)'
   OR question  ~* '(how many|square feet|linear feet|dimensions|how long|how wide|how tall|measure |lineal)'
);

-- Photo evidence — existing conditions best confirmed by a picture.
UPDATE scope_checklists SET evidence_type = 'photo'
WHERE evidence_type = 'answer' AND (
      field_key ~* '(panel|subfloor|joist|foundation|damage|_rot|mold|crack|condition|existing_|roof_deck|deck_condition|water_|leak|corrosion|rust|drainage|grade)'
   OR question  ~* '(what condition|any damage|water damage|existing condition|show me|take a photo|signs of|rot|mold|cracks|rust|corrosion)'
);

-- Correction: the _count pattern above wrongly caught existing_countertop ("count"ertop).
-- It's an existing-condition/visual field, not a tape measurement → photo.
UPDATE scope_checklists SET evidence_type = 'photo' WHERE field_key = 'existing_countertop';
