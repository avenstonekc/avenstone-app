-- SCOPE_TO_ESTIMATE Phase D — estimate_line_items ↔ scope-answer link columns (SEAM-ONLY).
-- Blueprint decision #6: nullable room_id + scope_field_key on estimate_line_items, the seam
-- for future change-propagation (a confirmed selection changes → find affected line items).
--
-- SEAM-ONLY (Phase D audit, decision B): no current write path can populate these.
--   - The takeoff path's roomId is a scan-string "${scan.id}_${idx}", NOT a job_rooms.id UUID,
--     so it cannot supply a valid room_id FK.
--   - Takeoff/AI lines are keyed by trade+material, not by a checklist field, so scope_field_key
--     is not derivable either.
-- Both columns are therefore NULL from every writer today. They exist so a future path that
-- DOES know (job_room, scope_field) → line item can populate them without another migration.
-- room_id uses ON DELETE SET NULL: deleting a job_rooms row must not cascade-delete priced
-- line items (the estimate is the source of billing truth; the room link is advisory).

ALTER TABLE estimate_line_items
  ADD COLUMN IF NOT EXISTS room_id UUID REFERENCES job_rooms(id) ON DELETE SET NULL;

ALTER TABLE estimate_line_items
  ADD COLUMN IF NOT EXISTS scope_field_key TEXT;
