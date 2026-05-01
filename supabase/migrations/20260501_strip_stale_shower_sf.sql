-- Strip stale shower_wall_sf and shower_floor_sf direct-entry values from
-- job_room_scopes.scope_details. These were stored pre-dimension-migration and
-- conflict with the computed-field path (resolveDetails now derives both values
-- from shower_width_in × shower_length_in × shower_wall_height_in).

UPDATE job_room_scopes
SET scope_details = scope_details - 'shower_wall_sf' - 'shower_floor_sf'
WHERE scope_details ? 'shower_wall_sf' OR scope_details ? 'shower_floor_sf';

-- Verify: the known row should no longer have either key
SELECT scope_details
FROM job_room_scopes
WHERE room_id = '73c10a72-bae8-4160-b3b4-85e0685c5622_1';
