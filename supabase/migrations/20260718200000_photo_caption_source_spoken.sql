-- CONSULTATION_RECAP_QUALITY Item 1 — a spoken "caption ..." command after a photo sets that
-- photo's caption verbatim. Distinct caption_source so RecapPanel can show provenance:
--   'speech' = AI-derived from shutter-window transcript, 'manual' = rep edit, 'spoken' = the rep's
--   verbatim spoken caption command (highest confidence short of a manual edit).
ALTER TABLE consultation_photos DROP CONSTRAINT IF EXISTS consultation_photos_caption_source_check;
ALTER TABLE consultation_photos ADD CONSTRAINT consultation_photos_caption_source_check
  CHECK (caption_source = ANY (ARRAY['speech'::text, 'manual'::text, 'spoken'::text]));
