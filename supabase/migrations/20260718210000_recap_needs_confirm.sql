-- CONSULTATION_RECAP_QUALITY Item 3 — needs_confirm: scope items whose DIRECTION (remove/keep/install)
-- or a material detail the composer could not resolve from the evidence. The composer flags these
-- instead of stating them confidently (an uncertain flag beats a confident error on a client doc);
-- RecapPanel renders them highlighted for the rep to resolve before send. Not rendered on the PDF.
ALTER TABLE consultation_recaps ADD COLUMN IF NOT EXISTS needs_confirm JSONB NOT NULL DEFAULT '[]'::jsonb;
