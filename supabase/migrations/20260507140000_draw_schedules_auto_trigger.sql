-- EXECUTION_ARC Phase 10 — auto-invoice draft on milestone trigger.
-- PM tags each draw with an optional trigger event. When the trigger fires
-- (sub_start status, phase advance, material delivery), system auto-creates
-- a DRAFT invoice prefilled with the draw target_amount.
-- Drafts NEVER auto-send — PM is always the gate.

ALTER TABLE draw_schedules
  ADD COLUMN IF NOT EXISTS auto_invoice_trigger JSONB,
  ADD COLUMN IF NOT EXISTS auto_invoiced_at TIMESTAMPTZ;

COMMENT ON COLUMN draw_schedules.auto_invoice_trigger IS
  'Event that fires auto-invoice draft creation. Shape: { type, trade?, phase? }. Types: sub_start_in_progress, sub_start_complete, delivery_complete, phase_advanced. NULL = manual invoicing.';

COMMENT ON COLUMN draw_schedules.auto_invoiced_at IS
  'Idempotency stamp — set when auto-invoice draft is created. Trigger does not fire twice per draw lifetime.';

NOTIFY pgrst, 'reload schema';
