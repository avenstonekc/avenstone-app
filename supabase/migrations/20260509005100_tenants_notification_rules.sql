ALTER TABLE tenants ADD COLUMN IF NOT EXISTS notification_rules JSONB DEFAULT '{}'::jsonb;
NOTIFY pgrst, 'reload schema';
