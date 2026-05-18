-- daily_logs re-scope: add client_message column.
-- Holds the AI-drafted client-facing update message (generated from work_completed +
-- job schedule context). NULL until the AI drafts it. Strictly additive — no existing
-- columns or rows touched.

ALTER TABLE daily_logs ADD COLUMN client_message TEXT;

-- Verify
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'daily_logs'
  AND column_name  = 'client_message';

NOTIFY pgrst, 'reload schema';
