-- SCAN_TRUST Phase 1 — scan naming
ALTER TABLE job_lidar_scans ADD COLUMN IF NOT EXISTS scan_name TEXT;
ALTER TABLE contact_lidar_scans ADD COLUMN IF NOT EXISTS scan_name TEXT;
