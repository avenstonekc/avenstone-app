-- B1.7 Phase 4 — ai_knowledge.tenant_id NOT NULL constraint
-- Pre-audit confirmed 0 NULL tenant_id rows (2026-06-25).
-- Safe to apply.

ALTER TABLE ai_knowledge ALTER COLUMN tenant_id SET NOT NULL;
