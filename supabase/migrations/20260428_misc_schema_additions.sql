-- Per-room scope notes (rep types/dictates "what's happening in this room" during solo or post-consultation review)
ALTER TABLE consultation_measurements ADD COLUMN IF NOT EXISTS scope_notes TEXT;

-- job_materials table joins to estimate_line_items so AI material generation flows cleanly into budget tracking.
-- Existing rows have NULL FK; new rows from the wizard get populated.
ALTER TABLE job_materials ADD COLUMN IF NOT EXISTS estimate_line_item_id UUID REFERENCES estimate_line_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_job_materials_estimate_line_item ON job_materials(estimate_line_item_id) WHERE estimate_line_item_id IS NOT NULL;
