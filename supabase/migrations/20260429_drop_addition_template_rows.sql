-- Drop Addition room_type rows from takeoff_templates.
-- Addition is cut from v1 — you can't LiDAR-scan something that doesn't
-- exist yet. Plan parsing for additions is v2 work. Additions fall back
-- to the conversational ai-estimator path until then.

DELETE FROM takeoff_templates
WHERE tenant_id IS NULL AND room_type = 'addition';

-- Expected post-delete counts (verified 2026-04-29):
--   basement: 18, bathroom: 14, exterior: 4, kitchen: 16, refresh: 7
--   addition: 0
