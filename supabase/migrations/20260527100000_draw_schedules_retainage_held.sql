-- Add retainage_held column to draw_schedules so per-draw retainage is recorded
-- and release eligibility can be checked against actual held amounts.
ALTER TABLE draw_schedules
  ADD COLUMN IF NOT EXISTS retainage_held NUMERIC NOT NULL DEFAULT 0;
