-- Adds is_primary column to trade_phase_map.
-- is_primary=TRUE marks the trade that signals phase entry for phase derivation.
-- Non-primary trades exist in the map for reporting/notifications but do NOT
-- trigger job_phases status changes via derivePhaseStatus.
--
-- Rationale: Drywall-Patch and Drywall-Tape are not phase-entry events; only
-- Drywall-Hang marks that drywall has started. Similarly, finish-stage
-- Plumbing/Electrical and all Trim rows are punch-list activities, not
-- phase-entry markers. Paint - Interior, Tile - Floor, Tile - Wall / shower,
-- and Cabinets / vanities - Install are the canonical finish-phase signals.
--
-- rough_mep has 3 primaries (Plumbing-Rough-in, Electrical-Rough-in, HVAC-Install)
-- because all three rough-ins gate the phase independently — any one starting
-- means rough MEP has begun.

ALTER TABLE trade_phase_map ADD COLUMN is_primary BOOLEAN NOT NULL DEFAULT FALSE;

-- Reset all Avenstone tenant rows, then mark canonical phase-entry trades.
UPDATE trade_phase_map SET is_primary = FALSE
WHERE tenant_id = '00000000-0000-0000-0000-000000000001';

UPDATE trade_phase_map SET is_primary = TRUE
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
  AND trade IN (
    'Demo',
    'Framing',
    'Plumbing - Rough-in',
    'Electrical - Rough-in',
    'HVAC - Install',
    'Drywall - Hang',
    'Paint - Interior',
    'Tile - Floor',
    'Tile - Wall / shower',
    'Cabinets / vanities - Install'
  );
