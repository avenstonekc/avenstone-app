-- ANTI_SURPRISE_ENGINE_ARC Phase 1 — open notification types
-- notifications_type_check is a closed enum that hasn't tracked all the types written
-- by ai-pm-nightly, master agent, and now the anti-surprise engine.
-- A notification type is a routing/display hint for the client, not a schema contract.
-- Dropping the constraint; any text value is valid. Types are documented in code.

ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
