-- Floor plan editor — per-scan rotation, mirror, and per-room name overrides.
-- Stored as a single JSONB column so PDF render can apply at read time
-- without mutating the raw scan data. Keeps scans round-trippable.
--
-- Shape:
--   {
--     "rotation": 0 | 90 | 180 | 270,
--     "mirror": "none" | "horizontal" | "vertical",
--     "room_names": { "<room_index>": "Kitchen", "1": "Master Bath", ... },
--     "edited_at": "2026-04-26T10:11:12Z"
--   }

ALTER TABLE job_lidar_scans
  ADD COLUMN IF NOT EXISTS edit_overrides JSONB;

ALTER TABLE contact_lidar_scans
  ADD COLUMN IF NOT EXISTS edit_overrides JSONB;
