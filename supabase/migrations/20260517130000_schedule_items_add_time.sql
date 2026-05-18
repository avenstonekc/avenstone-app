-- Add optional time field to schedule_items.
-- Strictly additive — existing rows get NULL.
ALTER TABLE schedule_items
  ADD COLUMN IF NOT EXISTS scheduled_time TIME;
