-- EXECUTION_ARC Phase 6 audit columns on schedule_items.
-- auto_created=true marks items created by the dual-trigger engine (Phase 6),
-- not PM-authored or sbAcceptBid-drafted items.
-- The two FK columns trace back to the trigger sources for auditability.

ALTER TABLE schedule_items
  ADD COLUMN IF NOT EXISTS auto_created BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_created_from_engagement_id UUID,
  ADD COLUMN IF NOT EXISTS auto_created_from_material_order_id UUID;

COMMENT ON COLUMN schedule_items.auto_created IS
  'True when item was auto-created by EXECUTION_ARC Phase 6 dual-trigger. Used for audit + future cleanup if PM rejects.';

NOTIFY pgrst, 'reload schema';
