-- ANTI_SURPRISE_ENGINE_ARC Phase 2.1 — Prerequisite P
-- Normalize schedule_items.trade: expand hyphens directly preceding a capital letter.
-- "Plumbing-Rough-in" → "Plumbing - Rough-in"
-- "HVAC-Install"      → "HVAC - Install"
-- "Drywall-Hang"      → "Drywall - Hang"
-- "Tile-Floor"        → "Tile - Floor"
-- etc.
--
-- This is a one-time data fix. Going forward, sbCreateScheduleItem /
-- sbUpdateScheduleItem / ai-master-agent all call canonicalizeTrade() at write
-- time, so the drift cannot recur.

UPDATE schedule_items
SET trade = regexp_replace(
  regexp_replace(trim(trade), '-([A-Z])', ' - \1', 'g'),
  '\s{2,}', ' ', 'g'
)
WHERE trade IS NOT NULL
  AND trade ~ '-[A-Z]';
