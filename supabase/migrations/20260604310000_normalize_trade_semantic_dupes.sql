-- ANTI_SURPRISE_ENGINE_ARC Phase 2.0 — Trade vocabulary cleanup
-- Fix semantic dupe: "Garage doors" → "Garage door"
-- (trade_taxonomy canonical: parent_trade = 'Garage door', sub_trade = null)
--
-- This is the only semantic dupe found in the live dataset.
-- Going forward, canonicalizeTrade() TRADE_ALIASES map prevents recurrence.

UPDATE schedule_items
SET trade = 'Garage door'
WHERE trade = 'Garage doors';
