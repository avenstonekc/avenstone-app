-- Stage 1: store normalized geometry output alongside raw scan rows.
-- normalized_geometry is written by the inline fallback in sbSaveJobLidarScan
-- and by the normalize-scan edge function. Consumers should prefer this field
-- over raw rooms[] + total_sqft once it exists.

ALTER TABLE job_lidar_scans
  ADD COLUMN IF NOT EXISTS normalized_geometry JSONB;

ALTER TABLE floor_plans
  ADD COLUMN IF NOT EXISTS normalized_geometry JSONB;
